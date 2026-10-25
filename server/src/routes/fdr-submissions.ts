import { Router } from 'express';
import express from 'express';
import { Types, type Model } from 'mongoose';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireInstitutionRole } from '../middleware/authorization.js';
import { DocumentModel, type DocumentRecord } from '../models/documents.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { OcrCorrectionModel, OcrExtractionModel, type OcrCorrectionRecord, type OcrExtractionRecord } from '../models/ocr-extractions.js';
import { fdrCreateSchema, fdrDraftSchema, fdrUpdateSchema, objectIdSchema, ocrCorrectionSchema } from '../validators/model-schemas.js';
import { compareExtractedValues, findMissingExtractedFields, inspectDocument, isRealIsoDate, MAX_DOCUMENT_BYTES, privateDocumentFilter, sanitizeOriginalFileName, storePrivateDocument, type DocumentExtractor } from '../services/fdr-document-processing.js';
import { tesseractDocumentExtractor } from '../services/tesseract-ocr.js';

const roles = ['institution_admin', 'institution_operator'] as const;
const fdrs = FdrModel as Model<FdrRecord>;
const documents = DocumentModel as Model<DocumentRecord>;
const extractions = OcrExtractionModel as Model<OcrExtractionRecord>;
const corrections = OcrCorrectionModel as Model<OcrCorrectionRecord>;
const completeFields = ['reference', 'instrumentNumber', 'bankName', 'branchName', 'holderName', 'principalAmount', 'issueDate', 'maturityDate'];
export function createFdrSubmissionRouter(extractor: DocumentExtractor = tesseractDocumentExtractor) {
  const router = Router({ mergeParams: true });
  router.use(express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '25mb' }));
  router.use(requireAuthentication);
  router.use(requireInstitutionRole(roles));
  const tenant = (req: import('express').Request) => new Types.ObjectId(req.institutionScope!.institutionId);

  router.post('/drafts', async (req, res, next) => {
    try {
      const parsed = fdrDraftSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid FDR fields', issues: parsed.error.issues }); return; }
      const scope = { institutionId: tenant(req), createdBy: req.authUser!._id, submissionStatus: 'draft' as const };
      const existingDraft = parsed.data.reference
        ? await fdrs.findOne({ ...scope, reference: parsed.data.reference })
        : null;
      let record;
      if (existingDraft) {
        existingDraft.set({ ...parsed.data, ...(parsed.data.principalAmount ? { principalAmount: Types.Decimal128.fromString(parsed.data.principalAmount) } : {}) });
        record = await existingDraft.save();
      } else {
        record = await fdrs.create({ ...parsed.data, institutionId: tenant(req), createdBy: req.authUser!._id, ...(parsed.data.principalAmount ? { principalAmount: Types.Decimal128.fromString(parsed.data.principalAmount) } : {}) });
      }
      res.status(201).json({ id: record.id, submissionStatus: record.submissionStatus, missingFields: completeFields.filter((field) => !record.get(field)) });
    } catch (error) { next(error); }
  });

  router.patch('/drafts/:instrumentId', async (req, res, next) => {
    try {
      const parsed = fdrUpdateSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid FDR fields', issues: parsed.error.issues }); return; }
      const draft = await fdrs.findOne({ _id: req.params.instrumentId, institutionId: tenant(req), createdBy: req.authUser!._id, submissionStatus: 'draft' });
      if (!draft) { res.status(404).json({ error: 'Draft not found' }); return; }
      const changes = { ...parsed.data } as Record<string, unknown>;
      for (const field of ['issueDate', 'maturityDate', 'validUntil']) if (changes[field]) changes[field] = new Date(`${changes[field]}T00:00:00.000Z`);
      if (changes.principalAmount) changes.principalAmount = Types.Decimal128.fromString(String(changes.principalAmount));
      draft.set(changes); await draft.validate(); await draft.save();
      res.json({ id: draft.id, submissionStatus: draft.submissionStatus, missingFields: completeFields.filter((field) => !draft.get(field)) });
    } catch (error) { next(error); }
  });

  router.post('/drafts/:instrumentId/submit', async (req, res, next) => {
    try {
      if (!objectIdSchema.safeParse(req.params.instrumentId).success) { res.status(404).json({ error: 'Draft not found' }); return; }
      const draft = await fdrs.findOne({ _id: req.params.instrumentId, institutionId: tenant(req), createdBy: req.authUser!._id, submissionStatus: 'draft' });
      if (!draft) { res.status(404).json({ error: 'Draft not found' }); return; }
      const validation = fdrCreateSchema.safeParse({
        reference: draft.reference, instrumentNumber: draft.instrumentNumber, bankName: draft.bankName,
        branchName: draft.branchName, holderName: draft.holderName, principalAmount: draft.principalAmount?.toString(),
        currency: draft.currency, issueDate: draft.issueDate && new Date(draft.issueDate).toISOString().slice(0, 10),
        maturityDate: draft.maturityDate && new Date(draft.maturityDate).toISOString().slice(0, 10),
        validUntil: draft.validUntil && new Date(draft.validUntil).toISOString().slice(0, 10),
      });
      if (!validation.success) { res.status(400).json({ error: 'Draft is incomplete or invalid', issues: validation.error.issues }); return; }
      draft.submissionStatus = 'submitted'; draft.reviewStatus = 'pending'; await draft.save();
      res.json({ id: draft.id, submissionStatus: draft.submissionStatus });
    } catch (error) { next(error); }
  });

  router.post('/drafts/:instrumentId/documents', async (req, res, next) => {
    try {
      if (!objectIdSchema.safeParse(req.params.instrumentId).success) { res.status(404).json({ error: 'Draft not found' }); return; }
      const draft = await fdrs.findOne({ _id: req.params.instrumentId, institutionId: tenant(req), createdBy: req.authUser!._id, submissionStatus: 'draft' });
      if (!draft) { res.status(404).json({ error: 'Draft not found' }); return; }
      if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'Send the file as the request body' }); return; }
      const mime = inspectDocument(req.body, req.header('content-type')?.split(';')[0] ?? '');
      const filename = sanitizeOriginalFileName(req.header('x-file-name') ?? 'fdr-document');
      if (req.body.length > MAX_DOCUMENT_BYTES) { res.status(413).json({ error: 'File exceeds the 25 MiB limit' }); return; }
      const stored = await storePrivateDocument(req.body);
      const document = await documents.create({ institutionId: tenant(req), instrumentId: draft._id, uploadedBy: req.authUser!._id, originalFileName: filename, storageKey: stored.storageKey, contentType: mime, byteLength: req.body.length, sha256: stored.sha256, purpose: 'fdr_instrument', malwareScanStatus: 'pending' });
      draft.documentIds.push(document._id); draft.ocrStatus = 'processing'; await draft.save();
      let fields = {} as Awaited<ReturnType<DocumentExtractor['runOcr']>>;
      let rawResult: unknown; let extractedText = '';
      let provider = 'text-extraction'; let status: 'complete' | 'failed' = 'complete'; let failureCode: string | undefined;
      try {
        if (mime === 'application/pdf') {
          const result = await extractor.extractPdfText(req.body);
          if (result.text.trim()) { fields = result.fields; rawResult = result; extractedText = result.text; }
          else if (extractor.runOcrWithText) {
            const result = await extractor.runOcrWithText(req.body, mime);
            fields = result.fields; rawResult = result; extractedText = result.text;
          } else { fields = await extractor.runOcr(req.body, mime); rawResult = fields; }
          if (!result.text.trim()) provider = 'ocr';
        } else if (extractor.runOcrWithText) {
          const result = await extractor.runOcrWithText(req.body, mime);
          fields = result.fields; rawResult = result; extractedText = result.text; provider = 'ocr';
        } else { fields = await extractor.runOcr(req.body, mime); rawResult = fields; provider = 'ocr'; }
      } catch { status = 'failed'; failureCode = 'extraction_unavailable'; }
      const extraction = await extractions.create({ institutionId: tenant(req), documentId: document._id, instrumentId: draft._id, provider, status, fields: Object.entries(fields).map(([fieldName, item]) => ({ fieldName, value: item!.value, confidence: item!.confidence, sourceText: item!.sourceText })), rawResult, failureCode, completedAt: new Date() });
      if (status === 'failed') draft.ocrStatus = 'failed'; else draft.ocrStatus = 'complete'; await draft.save();
      const submitted: Record<string, string> = {};
      if (draft.reference) submitted.reference = draft.reference;
      if (draft.bankName) submitted.bankName = draft.bankName;
      if (draft.principalAmount) submitted.principalAmount = draft.principalAmount.toString();
      if (draft.issueDate) submitted.issueDate = new Date(draft.issueDate).toISOString().slice(0, 10);
      if (draft.maturityDate) submitted.maturityDate = new Date(draft.maturityDate).toISOString().slice(0, 10);
      const discrepancies = compareExtractedValues(fields, submitted);
      const missingFields = completeFields.filter((field) => !(draft as unknown as Record<string, unknown>)[field]);
      res.status(201).json({ instrumentId: draft.id, documentId: document.id, extractionId: extraction.id, originalFileName: filename, extractionStatus: status, extractedText, fields: Object.entries(fields).map(([fieldName, item]) => ({ fieldName, value: item!.value, confidence: item!.confidence, ...(item!.sourceText ? { sourceText: item!.sourceText } : {}) })), discrepancies, missingFields, missingExtractedFields: findMissingExtractedFields(fields), authenticity: 'Document extraction is not proof that an FDR is genuine.' });
    } catch (error) { if (error instanceof Error && ['invalid_size', 'invalid_file_content', 'malformed_file'].includes(error.message)) { res.status(400).json({ error: error.message }); return; } next(error); }
  });

  router.get('/documents/:documentId', async (req, res, next) => {
    try {
      if (!objectIdSchema.safeParse(req.params.documentId).success) { res.sendStatus(404); return; }
      const doc = await documents.findOne(privateDocumentFilter(req.params.documentId, tenant(req).toString())).select('+storageKey').lean().exec() as { storageKey: string; contentType: string; originalFileName: string } | null;
      if (!doc) { res.sendStatus(404); return; }
      const { readFile } = await import('node:fs/promises'); const { resolve, basename } = await import('node:path');
      const root = resolve(process.env.DOCUMENT_STORAGE_DIR ?? '.private-documents');
      const key = basename(doc.storageKey); const bytes = await readFile(resolve(root, key));
      res.type(doc.contentType).setHeader('X-Content-Type-Options', 'nosniff').setHeader('Content-Disposition', `attachment; filename="${doc.originalFileName.replace(/["\r\n]/g, '_')}"`).send(bytes);
    } catch (error) { next(error); }
  });

  router.post('/corrections', async (req, res, next) => {
    try {
      const parsed = ocrCorrectionSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid correction', issues: parsed.error.issues }); return; }
      const { extractionId, instrumentId, fieldName, correctedValue, reason } = parsed.data;
      const extraction = await extractions.findOne({ _id: extractionId, instrumentId, institutionId: tenant(req), status: 'complete' });
      const fdr = await fdrs.findOne({ _id: instrumentId, institutionId: tenant(req), submissionStatus: 'draft' });
      if (!extraction || !fdr || !['reference', 'bankName', 'principalAmount', 'issueDate', 'maturityDate'].includes(fieldName)) { res.status(404).json({ error: 'Extraction not found' }); return; }
      const oldValue = (extraction.fields as Array<{ fieldName: string; value: string }>).find((field) => field.fieldName === fieldName)?.value;
      if (oldValue === undefined) { res.status(400).json({ error: 'Field is not present in the extraction' }); return; }
      const next = fieldName === 'principalAmount' ? { success: /^(?=.*[1-9])\d{1,16}(?:\.\d{1,2})?$/.test(correctedValue) } : fieldName.endsWith('Date') ? { success: isRealIsoDate(correctedValue) } : { success: correctedValue.trim().length > 0 };
      if (!next.success) { res.status(400).json({ error: 'Corrected value is invalid' }); return; }
      await corrections.create({ institutionId: tenant(req), extractionId, instrumentId, fieldName, originalValue: oldValue, correctedValue, correctedBy: req.authUser!._id, reason });
      const path = fieldName === 'principalAmount' ? 'principalAmount' : fieldName;
      fdr.set(path, fieldName === 'principalAmount' ? Types.Decimal128.fromString(correctedValue) : fieldName.endsWith('Date') ? new Date(correctedValue) : correctedValue);
      fdr.dataRevision += 1; await fdr.save();
      res.status(201).json({ fieldName, corrected: true, originalPreserved: true });
    } catch (error) { next(error); }
  });
  return router;
}
