import { z } from 'zod';
import {
  complianceStates,
  institutionRoles,
  instrumentStates,
  instrumentSubmissionStatuses,
  ocrJobStatuses,
  ocrStatuses,
  reviewStatuses,
  verificationStatuses,
  verificationAttemptStatuses,
  workflowStates,
} from '../models/domain.js';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Expected a 24-character MongoDB ObjectId');

const validCalendarDate = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Expected a real calendar date in YYYY-MM-DD format');

export const positiveMoneySchema = z
  .string()
  .trim()
  .regex(
    /^(?=.*[1-9])\d{1,16}(?:\.\d{1,2})?$/,
    'Enter a positive amount with at most two decimal places',
  );

const safeString = (max: number) => z.string().trim().min(1).max(max);
const metadataValue = z.record(z.string(), z.unknown());

// Provisioning receives identity facts from a trusted identity flow. Memberships and account state are assigned by server services.
export const userProvisioningSchema = z.strictObject({
  authSubject: safeString(240),
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  displayName: safeString(160),
});
export type UserProvisioningInput = z.infer<typeof userProvisioningSchema>;

// Institution creation is an internal provisioning command, not a public self-registration schema.
export const institutionProvisioningSchema = z.strictObject({
  name: safeString(240),
  shortName: safeString(100),
  externalReference: safeString(160),
  timezone: z.string().trim().min(1).max(100).default('Asia/Kolkata'),
});
export type InstitutionProvisioningInput = z.infer<typeof institutionProvisioningSchema>;

const fdrFields = {
  reference: safeString(80),
  instrumentNumber: safeString(120),
  bankName: safeString(160),
  branchName: safeString(160),
  holderName: safeString(240),
  principalAmount: positiveMoneySchema,
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default('INR'),
  issueDate: validCalendarDate,
  maturityDate: validCalendarDate,
  validUntil: validCalendarDate.optional(),
};

export const fdrCreateSchema = z
  .strictObject(fdrFields)
  .refine((input) => input.maturityDate > input.issueDate, {
    path: ['maturityDate'],
    message: 'Maturity date must be later than issue date',
  })
  .refine((input) => !input.validUntil || input.validUntil >= input.maturityDate, {
    path: ['validUntil'],
    message: 'Validity cannot end before maturity',
  });
export type FdrCreateInput = z.infer<typeof fdrCreateSchema>;

// Update DTO is an allowlist. Institution, creator, revisions, and workflow summaries are not user-editable fields.
export const fdrUpdateSchema = z
  .strictObject({
    reference: fdrFields.reference.optional(),
    instrumentNumber: fdrFields.instrumentNumber.optional(),
    bankName: fdrFields.bankName.optional(),
    branchName: fdrFields.branchName.optional(),
    holderName: fdrFields.holderName.optional(),
    principalAmount: fdrFields.principalAmount.optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    issueDate: validCalendarDate.optional(),
    maturityDate: validCalendarDate.optional(),
    validUntil: validCalendarDate.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Provide at least one editable field');
export type FdrUpdateInput = z.infer<typeof fdrUpdateSchema>;

export const documentUploadIntentSchema = z.strictObject({
  instrumentId: objectIdSchema,
  originalFileName: safeString(255),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  byteLength: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  purpose: z.enum(['fdr_instrument', 'renewal_evidence', 'release_evidence', 'other']),
});
export type DocumentUploadIntentInput = z.infer<typeof documentUploadIntentSchema>;

export const ocrRequestSchema = z.strictObject({ documentId: objectIdSchema });
export type OcrRequestInput = z.infer<typeof ocrRequestSchema>;

// Provider callback schema is consumed by a trusted OCR adapter, never directly by the browser.
export const ocrProviderResultSchema = z.strictObject({
  documentId: objectIdSchema,
  instrumentId: objectIdSchema,
  provider: safeString(160),
  providerVersion: z.string().trim().max(120).optional(),
  status: z.enum(ocrJobStatuses),
  fields: z
    .array(
      z.strictObject({
        fieldName: safeString(100),
        value: z.string().max(4000),
        confidence: z.number().min(0).max(1),
        pageNumber: z.number().int().positive().optional(),
        sourceText: z.string().max(4000).optional(),
      }),
    )
    .max(500),
  failureCode: z.string().trim().max(120).optional(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});
export type OcrProviderResultInput = z.infer<typeof ocrProviderResultSchema>;

export const ocrCorrectionSchema = z.strictObject({
  extractionId: objectIdSchema,
  instrumentId: objectIdSchema,
  fieldName: safeString(100),
  correctedValue: z.string().trim().max(2000),
  reason: z.string().trim().max(2000).optional(),
});
export type OcrCorrectionInput = z.infer<typeof ocrCorrectionSchema>;

export const verificationRequestSchema = z.strictObject({
  instrumentId: objectIdSchema,
  reason: z.string().trim().max(2000).optional(),
});
export type VerificationRequestInput = z.infer<typeof verificationRequestSchema>;

// Result schema is for the trusted adapter boundary. A client request cannot submit these result fields.
export const verificationAdapterResultSchema = z.strictObject({
  attemptReference: safeString(160),
  status: z.enum(verificationAttemptStatuses),
  responseSummary: z.string().trim().max(4000).optional(),
  responseEvidenceRef: z.string().trim().max(500).optional(),
  failureCode: z.string().trim().max(120).optional(),
  completedAt: z.coerce.date().optional(),
});
export type VerificationAdapterResultInput = z.infer<typeof verificationAdapterResultSchema>;

// decision is an action request; workflow state, reviewer identity, institution scope and timestamps are server-controlled.
export const reviewActionSchema = z.strictObject({
  instrumentId: objectIdSchema,
  decision: z.enum(['approve', 'reject', 'request_correction']),
  reason: safeString(4000),
  observations: z.array(safeString(1000)).max(40).default([]),
  basedOnRevision: z.number().int().positive(),
  extractionId: objectIdSchema.optional(),
});
export type ReviewActionInput = z.infer<typeof reviewActionSchema>;

export const renewalRequestSchema = z.strictObject({
  sourceInstrumentId: objectIdSchema,
  kind: z.enum(['renewal', 'replacement']),
  reason: safeString(4000),
  supportingDocumentIds: z.array(objectIdSchema).max(20).default([]),
});
export type RenewalRequestInput = z.infer<typeof renewalRequestSchema>;

export const releaseRequestSchema = z.strictObject({
  instrumentId: objectIdSchema,
  requestType: z.enum(['security_release', 'matured_refund', 'partial_release']),
  reason: safeString(4000),
  supportingDocumentIds: z.array(objectIdSchema).min(1).max(20),
});
export type ReleaseRequestInput = z.infer<typeof releaseRequestSchema>;

export const workflowActionSchema = z
  .strictObject({
    action: z.enum([
      'request_information',
      'approve',
      'deny',
      'start_processing',
      'record_completion',
      'record_failure',
      'withdraw',
    ]),
    reason: safeString(4000),
    supportingDocumentIds: z.array(objectIdSchema).max(20).default([]),
    completionEvidenceRef: safeString(500).optional(),
  })
  .refine((input) => input.action !== 'record_completion' || Boolean(input.completionEvidenceRef), {
    path: ['completionEvidenceRef'],
    message: 'Completion requires a separate evidence reference',
  });
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;

// Only server-side workflow services may parse this state summary command after authorization.
export const fdrWorkflowSummarySchema = z
  .strictObject({
    submissionStatus: z.enum(instrumentSubmissionStatuses).optional(),
    ocrStatus: z.enum(ocrStatuses).optional(),
    reviewStatus: z.enum(reviewStatuses).optional(),
    verificationStatus: z.enum(verificationStatuses).optional(),
    instrumentState: z.enum(instrumentStates).optional(),
    complianceState: z.enum(complianceStates).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Provide a server-computed state field');
export type FdrWorkflowSummaryInput = z.infer<typeof fdrWorkflowSummarySchema>;

// Notification creation and audit append are service-only command schemas. Public clients must not set state or actor provenance.
export const notificationCreateSchema = z.strictObject({
  institutionId: objectIdSchema,
  recipientId: objectIdSchema,
  kind: safeString(80),
  title: safeString(180),
  message: safeString(2000),
  resourceType: z.string().trim().max(100).optional(),
  resourceId: objectIdSchema.optional(),
});
export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;

export const notificationReadCommandSchema = z.strictObject({
  notificationIds: z.array(objectIdSchema).min(1).max(100),
});
export type NotificationReadCommandInput = z.infer<typeof notificationReadCommandSchema>;

export const auditAppendSchema = z
  .strictObject({
    scope: z.enum(['institution', 'platform']),
    institutionId: objectIdSchema.optional(),
    actorId: objectIdSchema.optional(),
    actorRoleSnapshot: z.array(z.enum(institutionRoles)).default([]),
    action: safeString(120),
    targetType: safeString(100),
    targetId: objectIdSchema.optional(),
    requestId: safeString(160),
    reason: z.string().trim().max(4000).optional(),
    beforeHash: z
      .string()
      .regex(/^[a-f\d]{64}$/i)
      .optional(),
    afterHash: z
      .string()
      .regex(/^[a-f\d]{64}$/i)
      .optional(),
    metadataRedacted: metadataValue.default({}),
    occurredAt: z.coerce.date().optional(),
  })
  .refine((input) => input.scope !== 'institution' || Boolean(input.institutionId), {
    path: ['institutionId'],
    message: 'Institution-scoped audit events require institutionId',
  });
export type AuditAppendInput = z.infer<typeof auditAppendSchema>;

export const configuredRuleSchema = z.strictObject({
  ruleKey: safeString(100),
  value: safeString(500),
  unit: z.string().trim().max(80).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  version: z.number().int().positive(),
  sourceDescription: safeString(1000),
  assumptionLabel: z.string().trim().max(300).optional(),
  approvedBy: objectIdSchema.optional(),
});
export type ConfiguredRuleInput = z.infer<typeof configuredRuleSchema>;

// Used by server-side workflow services when persisting state transitions; not an instrument create/update DTO.
export const workflowStatusSchema = z.enum(workflowStates);
