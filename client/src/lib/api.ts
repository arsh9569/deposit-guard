export interface HealthResponse {
  status: 'ok' | 'not_ready';
  service: string;
  database: 'connected' | 'disconnected';
}

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  memberships: { institutionId: string; roles: string[] }[];
}
export interface PortalNotification {
  id: string;
  title: string;
  message: string;
  state: 'unread' | 'read' | 'dismissed';
  createdAt: string;
}
export type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };
export interface DashboardResponse {
  institutionId: string;
  displayName: string;
  windowDays: number;
  metrics: {
    totalFdrs: number;
    pendingReview: number;
    expiringWithinWindow: number;
    matured: number;
    overdueCases: number;
    pendingRenewals: number;
    pendingReleaseRequests: number;
    maturityQueue: { instrumentId: string; reference: string; bankName: string; amount: string; maturityDate: string; daysToMaturity: number }[];
  };
  recentActivity: { action: string; targetType: string; targetId?: string; reason?: string; occurredAt: string; actorId?: string }[];
}
export interface VerificationInstrument {
  id: string;
  reference: string;
  bankName: string;
  principalAmount: string;
}
export interface VerificationAttempt {
  id: string;
  instrumentId: string;
  mode: 'simulated' | 'live';
  provider: string;
  status: 'queued' | 'running' | 'match' | 'mismatch' | 'not_found' | 'inconclusive' | 'unavailable' | 'failed';
  label: string;
  attemptReference: string;
  responseSummary?: string;
  failureCode?: string;
  requestedAt: string;
  completedAt?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function getSupportedFdrMimeType(file: Pick<File, 'name' | 'type'>): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  const supported = ['application/pdf', 'image/jpeg', 'image/png'] as const;
  if (supported.includes(file.type as (typeof supported)[number])) return file.type as (typeof supported)[number];
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return null;
}
export interface OcrUploadResult {
  instrumentId: string;
  documentId: string;
  extractionId: string;
  extractionStatus: 'complete' | 'failed';
  originalFileName: string;
  extractedText: string;
  fields: { fieldName: string; value: string; confidence: number; sourceText?: string }[];
  discrepancies: string[];
  missingFields: string[];
  missingExtractedFields: string[];
  authenticity: string;
  submitted: {
    reference: string; instrumentNumber: string; bankName: string; branchName: string;
    holderName: string; principalAmount: string; currency: string; issueDate: string;
    maturityDate: string; validUntil?: string;
  };
}

async function getCsrfToken(message: string): Promise<string> {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) throw new ApiError(message, response.status);
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export async function getCurrentUser(): Promise<PortalUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError('Could not restore your session. Try refreshing the page.', response.status);
  return ((await response.json()) as { user: PortalUser }).user;
}

export async function sendAssistantMessage(messages: AssistantChatMessage[], currentScreen: string): Promise<string> {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(await csrfHeader('Could not start a secure assistant request.')) },
    body: JSON.stringify({ messages, currentScreen }),
  });
  const body = await response.json().catch(() => ({})) as { answer?: string; error?: string };
  if (!response.ok) throw new ApiError(body.error ?? 'The assistant could not answer right now.', response.status);
  if (!body.answer) throw new ApiError('The assistant returned an empty reply.', response.status);
  return body.answer;
}

export async function updateUsername(displayName: string): Promise<PortalUser> {
  const csrfToken = await getCsrfToken('Could not start a secure profile update.');
  const response = await fetch('/api/auth/profile', {
    method: 'PATCH', credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? 'Username could not be updated.', response.status);
  }
  return ((await response.json()) as { user: PortalUser }).user;
}

export async function signOut(): Promise<void> {
  const csrfToken = await getCsrfToken('Could not start a secure sign-out request.');
  const response = await fetch('/api/auth/logout', {
    method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) throw new ApiError('Sign out failed. Please try again.', response.status);
}

export async function signIn(email: string, password: string): Promise<PortalUser> {
  const csrfToken = await getCsrfToken('Could not start a secure sign-in session.');
  const response = await fetch('/api/auth/login', {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new ApiError(response.status === 401 ? 'Invalid email or password.' : 'Sign-in failed. Try again.', response.status);
  return ((await response.json()) as { user: PortalUser }).user;
}

async function csrfHeader(message: string): Promise<Record<string, string>> {
  const csrfToken = await getCsrfToken(message);
  return { 'x-csrf-token': csrfToken };
}

export async function uploadFdrForOcr(institutionId: string, file: File, form: Partial<OcrUploadResult['submitted']> & { draftId?: string }): Promise<OcrUploadResult> {
  const mimeType = getSupportedFdrMimeType(file);
  if (!mimeType) throw new ApiError('Choose a PDF, JPEG, or PNG document.', 400);
  const base = `/api/institutions/${encodeURIComponent(institutionId)}/fdr`;
  const { draftId, ...submittedValues } = form;
  const draftValues = Object.fromEntries(Object.entries(submittedValues).filter(([, value]) => value?.trim()));
  let instrumentId = draftId;
  if (instrumentId) {
    if (Object.keys(draftValues).length) await updateFdrDraft(institutionId, instrumentId, draftValues);
  } else {
    instrumentId = await createFdrDraft(institutionId, draftValues);
  }
  const uploadHeaders = await csrfHeader('Could not start a secure document upload.');
  const response = await fetch(`${base}/drafts/${encodeURIComponent(instrumentId)}/documents`, {
    method: 'POST', credentials: 'include',
    headers: { ...uploadHeaders, 'content-type': mimeType, 'x-file-name': file.name },
    body: file,
  });
  const result = await response.json().catch(() => ({})) as Omit<OcrUploadResult, 'instrumentId' | 'submitted'> & { error?: string };
  if (!response.ok) throw new ApiError(result.error ?? 'Document upload or extraction failed.', response.status);
  return {
    ...result,
    instrumentId,
    submitted: {
      reference: form.reference ?? '', instrumentNumber: form.instrumentNumber ?? '', bankName: form.bankName ?? '',
      branchName: form.branchName ?? '', holderName: form.holderName ?? '', principalAmount: form.principalAmount ?? '',
      currency: form.currency ?? 'INR', issueDate: form.issueDate ?? '', maturityDate: form.maturityDate ?? '',
      ...(form.validUntil ? { validUntil: form.validUntil } : {}),
    },
  };
}

export async function createFdrDraft(institutionId: string, values: Record<string, string>): Promise<string> {
  const headers = await csrfHeader('Could not start a secure draft save.');
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts`, {
    method: 'POST', credentials: 'include',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(Object.entries(values).filter(([, value]) => value?.trim()))),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; error?: string };
  if (!response.ok || !result.id) throw new ApiError(result.error ?? 'FDR draft could not be saved.', response.status || 500);
  return result.id;
}

export async function saveOcrCorrection(institutionId: string, result: OcrUploadResult, fieldName: string, correctedValue: string): Promise<void> {
  const headers = await csrfHeader('Could not start a secure correction request.');
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/corrections`, {
    method: 'POST', credentials: 'include',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ extractionId: result.extractionId, instrumentId: result.instrumentId, fieldName, correctedValue, reason: 'User correction during OCR review' }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? 'OCR correction could not be saved.', response.status);
  }
}

export async function updateFdrDraft(institutionId: string, instrumentId: string, values: Record<string, string>): Promise<void> {
  const headers = await csrfHeader('Could not start a secure draft update.');
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts/${encodeURIComponent(instrumentId)}`, {
    method: 'PATCH', credentials: 'include',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? 'FDR draft could not be updated.', response.status);
  }
}

export async function submitFdrDraft(institutionId: string, instrumentId: string): Promise<void> {
  const headers = await csrfHeader('Could not start a secure submission request.');
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts/${encodeURIComponent(instrumentId)}/submit`, {
    method: 'POST', credentials: 'include', headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? 'FDR draft could not be submitted.', response.status);
  }
}

export async function getDashboard(institutionId: string): Promise<DashboardResponse> {
  const response = await fetch(`/api/dashboard?institutionId=${encodeURIComponent(institutionId)}`, { credentials: 'include' });
  if (!response.ok) {
    const message = response.status === 403 ? 'You do not have permission to view this institution dashboard.' : response.status === 401 ? 'Your session expired. Sign in again.' : 'Dashboard data could not be loaded.';
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as DashboardResponse;
}

export async function getNotifications(institutionId: string): Promise<PortalNotification[]> {
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/workflows/notifications`, { credentials: 'include' });
  if (!response.ok) throw new ApiError('Could not load notifications.', response.status);
  return ((await response.json()) as { notifications: PortalNotification[] }).notifications;
}

export async function getVerificationInstruments(institutionId: string): Promise<VerificationInstrument[]> {
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/instruments`, { credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot review verification attempts for this institution.' : 'Verification instruments could not be loaded.', response.status);
  return ((await response.json()) as { instruments: VerificationInstrument[] }).instruments;
}

export async function getVerificationAttempts(institutionId: string): Promise<VerificationAttempt[]> {
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/attempts`, { credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot review verification attempts for this institution.' : 'Verification history could not be loaded.', response.status);
  return ((await response.json()) as { attempts: VerificationAttempt[] }).attempts;
}

export async function runVerificationAttempt(institutionId: string, instrumentId: string): Promise<VerificationAttempt> {
  const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!csrfResponse.ok) throw new ApiError('Could not start a secure verification request.', csrfResponse.status);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const response = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/attempts`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ instrumentId }),
  });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot initiate verification for this institution.' : 'Verification attempt failed.', response.status);
  return ((await response.json()) as { attempt: VerificationAttempt }).attempt;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok && response.status !== 503) {
    throw new Error(`API health request failed (${response.status})`);
  }

  return (await response.json()) as HealthResponse;
}
