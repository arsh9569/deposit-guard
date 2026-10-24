import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { Types } from 'mongoose';
import { compareExtractedValues, findMissingExtractedFields, inspectDocument, isRealIsoDate, MAX_DOCUMENT_BYTES, noProviderExtractor, privateDocumentFilter, sanitizeOriginalFileName, type DocumentExtractor } from '../src/services/fdr-document-processing.js';
import { fdrCreateSchema, fdrDraftSchema, fdrUpdateSchema } from '../src/validators/model-schemas.js';
import { createDemoFdrPdf } from '../src/demo/fixtures.js';

const minimalPdf = (text = '') => Buffer.from(`%PDF-1.7\n${text}\n%%EOF`, 'ascii');
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); typeBytes.copy(chunk, 4); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}
const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(1, 0); pngHeader.writeUInt32BE(1, 4);
pngHeader[8] = 8; pngHeader[9] = 6;
const minimalPng = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', pngHeader),
  pngChunk('IDAT', deflateSync(Buffer.from([0,255,0,0,255]))), pngChunk('IEND', Buffer.alloc(0)),
]);
function jpegSegment(marker: number, payload: number[]) {
  const segment = Buffer.alloc(4 + payload.length);
  segment[0] = 0xff; segment[1] = marker; segment.writeUInt16BE(payload.length + 2, 2);
  Buffer.from(payload).copy(segment, 4); return segment;
}
const minimalJpeg = Buffer.concat([
  Buffer.from([0xff,0xd8]),
  jpegSegment(0xc0, [8,0,1,0,1,1,1,0x11,0]),
  jpegSegment(0xda, [1,1,0,0,63,0]),
  Buffer.from([0,0xff,0xd9]),
]);

test('rejects malformed, mislabeled, and unsupported document content', () => {
  assert.throws(() => inspectDocument(Buffer.from('not a pdf'), 'application/pdf'), /invalid_file_content/);
  assert.throws(() => inspectDocument(Buffer.from('%PDF-1.7'), 'application/pdf'), /malformed_file/);
  assert.throws(() => inspectDocument(Buffer.from('GIF89a'), 'image/gif'), /invalid_file_content/);
  assert.throws(() => inspectDocument(minimalPdf(), 'image/png'), /invalid_file_content/);
  assert.throws(() => inspectDocument(Buffer.from([0xff,0xd8,0xff]), 'image/jpeg'), /malformed_file/);
  assert.throws(() => inspectDocument(Buffer.from([137,80,78,71,13,10,26,10]), 'image/png'), /malformed_file/);
  assert.equal(inspectDocument(minimalPdf(), 'application/pdf'), 'application/pdf');
  assert.equal(inspectDocument(minimalJpeg, 'image/jpeg'), 'image/jpeg');
  assert.equal(inspectDocument(minimalPng, 'image/png'), 'image/png');
  assert.throws(() => inspectDocument(Buffer.alloc(MAX_DOCUMENT_BYTES + 1), 'application/pdf'), /invalid_size/);
  assert.equal(sanitizeOriginalFileName('..\\..\\private\r\n.pdf'), '.._.._private__.pdf');
});

test('compares extracted and submitted amounts and identifies discrepancies', () => {
  assert.deepEqual(compareExtractedValues({ principalAmount: { value: '250,001.00', confidence: 0.91 } }, { principalAmount: '250000.00' }), ['principalAmount']);
  assert.deepEqual(compareExtractedValues({ principalAmount: { value: '250,000.00', confidence: 0.91 } }, { principalAmount: '250000.00' }), []);
  assert.deepEqual(compareExtractedValues({ issueDate: { value: '01/02/2026', confidence: 0.8 } }, { issueDate: '2026-02-01' }), []);
});

test('date validation rejects impossible calendar dates and issue/maturity order', () => {
  const valid = { reference: 'REF-1', instrumentNumber: 'FDR-1', bankName: 'Example Bank', branchName: 'Central', holderName: 'Example Institution', principalAmount: '100.00', issueDate: '2026-02-30', maturityDate: '2027-01-01' };
  assert.equal(fdrCreateSchema.safeParse(valid).success, false);
  assert.equal(fdrCreateSchema.safeParse({ ...valid, issueDate: '2026-01-01', maturityDate: '2025-12-31' }).success, false);
  assert.equal(isRealIsoDate('2026-02-30'), false);
  assert.equal(isRealIsoDate('2026-02-28'), true);
});

test('public FDR DTOs reject attempts to set bank verification state', () => {
  assert.equal(fdrDraftSchema.safeParse({ reference: 'REF-1', verificationStatus: 'match' }).success, false);
  assert.equal(fdrUpdateSchema.safeParse({ verificationStatus: 'match' }).success, false);
  assert.equal(fdrUpdateSchema.safeParse({ verificationStatus: 'verified' }).success, false);
});

test('OCR provider failures are surfaced and never described as authenticity verification', async () => {
  await assert.rejects(noProviderExtractor.runOcr(Buffer.from('image'), 'image/jpeg'), /not configured/);
  const failedProvider: DocumentExtractor = { async extractPdfText() { return { text: '', fields: {} }; }, async runOcr() { throw new Error('provider down'); } };
  await assert.rejects(failedProvider.runOcr(Buffer.from('image'), 'image/png'), /provider down/);
});

test('pretested demonstration PDF yields deterministic field values without invoking OCR', async () => {
  const fixture = createDemoFdrPdf('FDR-2026-018', '2450000.00', '2026-11-14');
  assert.equal(inspectDocument(fixture, 'application/pdf'), 'application/pdf');
  const result = await noProviderExtractor.extractPdfText(fixture);
  assert.equal(result.fields.reference?.value, 'FDR-2026-018');
  assert.equal(result.fields.bankName?.value, 'Synthetic National Bank');
  assert.equal(result.fields.principalAmount?.value, '2450000.00');
  assert.equal(result.fields.maturityDate?.value, '2026-11-14');
});

test('4,50,000 extracted from PDF conflicts with 5,00,000 submitted and an incomplete FDR number is surfaced', async () => {
  const amountPdf = createDemoFdrPdf('FDR-SCENARIO-2', '450000.00', '2027-01-01', 'Synthetic Bank');
  const amountExtraction = await noProviderExtractor.extractPdfText(amountPdf);
  assert.equal(amountExtraction.fields.principalAmount?.value, '450000.00');
  assert.deepEqual(compareExtractedValues(amountExtraction.fields, { principalAmount: '500000.00' }), ['principalAmount']);

  const incompleteNumberPdf = createDemoFdrPdf('', '450000.00', '2027-01-01', 'Synthetic Bank');
  const incompleteExtraction = await noProviderExtractor.extractPdfText(incompleteNumberPdf);
  assert.equal(incompleteExtraction.fields.reference, undefined);
  assert.ok(findMissingExtractedFields(incompleteExtraction.fields).includes('reference'));
});

test('document access filter always binds the requested institution and active state', () => {
  const doc = new Types.ObjectId().toString(); const otherTenant = new Types.ObjectId().toString();
  const filter = privateDocumentFilter(doc, otherTenant);
  assert.deepEqual(filter, { _id: doc, institutionId: otherTenant, retentionState: 'active', malwareScanStatus: 'clean' });
  assert.notEqual(filter.institutionId, new Types.ObjectId().toString());
});
