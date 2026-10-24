export const institutionRoles = [
  'institution_admin',
  'institution_operator',
  'official_reviewer',
  'auditor',
] as const;
export type InstitutionRole = (typeof institutionRoles)[number];

export const instrumentSubmissionStatuses = [
  'draft',
  'submitted',
  'returned',
  'accepted',
  'rejected',
] as const;
export type InstrumentSubmissionStatus = (typeof instrumentSubmissionStatuses)[number];

export const ocrStatuses = ['not_requested', 'queued', 'processing', 'complete', 'failed'] as const;
export type OcrStatus = (typeof ocrStatuses)[number];
export const ocrJobStatuses = ['queued', 'processing', 'complete', 'failed'] as const;
export type OcrJobStatus = (typeof ocrJobStatuses)[number];

export const reviewStatuses = [
  'not_reviewed',
  'pending',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export const verificationStatuses = [
  'not_requested',
  'queued',
  'running',
  'match',
  'mismatch',
  'inconclusive',
  'unavailable',
  'failed',
] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];
export const verificationAttemptStatuses = [
  'queued',
  'running',
  'match',
  'mismatch',
  'inconclusive',
  'unavailable',
  'failed',
] as const;
export type VerificationAttemptStatus = (typeof verificationAttemptStatuses)[number];

export const verificationModes = ['simulated', 'live'] as const;
export type VerificationMode = (typeof verificationModes)[number];

export const instrumentStates = [
  'active',
  'matured',
  'superseded',
  'released',
  'archived',
] as const;
export type InstrumentState = (typeof instrumentStates)[number];

export const complianceStates = [
  'current',
  'upcoming_action',
  'overdue_action',
  'action_in_progress',
] as const;
export type ComplianceState = (typeof complianceStates)[number];

export const workflowStates = [
  'requested',
  'under_review',
  'more_information_required',
  'approved',
  'denied',
  'in_progress',
  'verification_pending',
  'completed',
  'failed',
  'withdrawn',
] as const;
export type WorkflowState = (typeof workflowStates)[number];

export const notificationStates = ['unread', 'read', 'dismissed'] as const;
export type NotificationState = (typeof notificationStates)[number];
