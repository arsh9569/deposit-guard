import type { InstitutionRole, RenewalStatus, WorkflowState } from '../models/domain.js';
export type RenewalAction = 'submit' | 'approve' | 'deny' | 'request_information' | 'start_processing' | 'complete' | 'withdraw';
export type ReleaseAction = 'start_scrutiny' | 'request_information' | 'approve' | 'deny' | 'complete';

export function assertReplacementLink(sourceId: string, existingReplacementIds: readonly string[], replacementId: string, currentSourceId?: string) {
  if (replacementId === sourceId || (currentSourceId && currentSourceId !== sourceId)) throw new Error('Replacement instrument cannot link to this source');
  if (existingReplacementIds.some((id) => id !== replacementId)) throw new Error('Source instrument already has a different replacement');
}

export function transitionRenewal(from: RenewalStatus, action: RenewalAction, roles: readonly InstitutionRole[]): RenewalStatus {
  const operator = roles.some((role) => role === 'institution_operator' || role === 'institution_admin');
  const reviewer = roles.some((role) => role === 'official_reviewer' || role === 'institution_admin');
  const next: Partial<Record<RenewalStatus, Partial<Record<RenewalAction, RenewalStatus>>>> = {
    pending: { submit: 'submitted', withdraw: 'withdrawn' },
    requested: { submit: 'submitted', withdraw: 'withdrawn' },
    submitted: { approve: 'approved', deny: 'denied', request_information: 'more_information_required' },
    under_review: { approve: 'approved', deny: 'denied', request_information: 'more_information_required' },
    more_information_required: { submit: 'submitted' },
    approved: { start_processing: 'in_progress', complete: 'completed' },
    in_progress: { complete: 'completed' },
  };
  const destination = next[from]?.[action];
  if (!destination) throw new Error(`Transition ${from} -> ${action} is not allowed`);
  const permitted = ['approve', 'deny', 'request_information'].includes(action) ? reviewer : operator;
  if (!permitted) throw new Error('Insufficient permissions for renewal transition');
  return destination;
}

export function transitionRelease(from: WorkflowState, action: ReleaseAction, roles: readonly InstitutionRole[]): WorkflowState {
  const operator = roles.some((role) => role === 'institution_operator' || role === 'institution_admin');
  const reviewer = roles.some((role) => role === 'official_reviewer' || role === 'institution_admin');
  const next: Partial<Record<WorkflowState, Partial<Record<ReleaseAction, WorkflowState>>>> = {
    requested: { start_scrutiny: 'under_review' },
    under_review: { approve: 'approved', deny: 'denied', request_information: 'more_information_required' },
    more_information_required: { start_scrutiny: 'under_review' },
    approved: { complete: 'completed' },
  };
  const destination = next[from]?.[action];
  if (!destination) throw new Error(`Transition ${from} -> ${action} is not allowed`);
  const permitted = ['approve', 'deny', 'request_information', 'start_scrutiny'].includes(action) && from !== 'more_information_required' ? reviewer : operator;
  if (!permitted) throw new Error('Insufficient permissions for release/refund transition');
  return destination;
}
