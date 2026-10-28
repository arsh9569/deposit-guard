export interface HealthResponse {
  status: 'ok' | 'not_ready';
  service: string;
  database: 'connected' | 'disconnected';
}

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  accountType?: 'student' | 'institution';
  status?: 'active' | 'suspended' | 'invited';
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
export type InstitutionRole = 'institution_admin' | 'institution_operator' | 'official_reviewer' | 'auditor';
export interface InstitutionUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended';
  roles: InstitutionRole[];
}
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

const unexpectedApiResponseMessage =
  'The API returned an unexpected response. Check the API routing configuration and try again.';

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  if (response.status === 204) return response;

  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    throw new ApiError(unexpectedApiResponseMessage, response.status);
  }
  return response;
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
  const response = await apiFetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) throw new ApiError(message, response.status);
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export async function getCurrentUser(): Promise<PortalUser | null> {
  const response = await apiFetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError('Could not restore your session. Try refreshing the page.', response.status);
  return ((await response.json()) as { user: PortalUser }).user;
}

export async function sendAssistantMessage(messages: AssistantChatMessage[], currentScreen: string): Promise<string> {
  const response = await apiFetch('/api/assistant/chat', {
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
  const response = await apiFetch('/api/auth/profile', {
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
  const response = await apiFetch('/api/auth/logout', {
    method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) throw new ApiError('Sign out failed. Please try again.', response.status);
}

export async function signIn(email: string, password: string): Promise<PortalUser> {
  const csrfToken = await getCsrfToken('Could not start a secure sign-in session.');
  const response = await apiFetch('/api/auth/login', {
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
  const response = await apiFetch(`${base}/drafts/${encodeURIComponent(instrumentId)}/documents`, {
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
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts`, {
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
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/corrections`, {
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
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts/${encodeURIComponent(instrumentId)}`, {
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
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/fdr/drafts/${encodeURIComponent(instrumentId)}/submit`, {
    method: 'POST', credentials: 'include', headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? 'FDR draft could not be submitted.', response.status);
  }
}

export async function getDashboard(institutionId: string): Promise<DashboardResponse> {
  const response = await apiFetch(`/api/dashboard?institutionId=${encodeURIComponent(institutionId)}`, { credentials: 'include' });
  if (!response.ok) {
    const message = response.status === 403 ? 'You do not have permission to view this institution dashboard.' : response.status === 401 ? 'Your session expired. Sign in again.' : 'Dashboard data could not be loaded.';
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as DashboardResponse;
}

export async function getNotifications(institutionId: string): Promise<PortalNotification[]> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/workflows/notifications`, { credentials: 'include' });
  if (!response.ok) throw new ApiError('Could not load notifications.', response.status);
  return ((await response.json()) as { notifications: PortalNotification[] }).notifications;
}

export async function getInstitutionUsers(institutionId: string): Promise<InstitutionUser[]> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/users`, { credentials: 'include' });
  const body = await response.json().catch(() => ({})) as { users?: InstitutionUser[]; error?: string };
  if (!response.ok) throw new ApiError(body.error ?? 'Could not load institution users.', response.status);
  return body.users ?? [];
}

export async function createInstitutionUser(institutionId: string, details: { email: string; displayName: string; role: InstitutionRole }): Promise<{ user: InstitutionUser; temporaryPassword: string }> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/users`, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', ...(await csrfHeader('Could not start a secure user creation request.')) },
    body: JSON.stringify(details),
  });
  const body = await response.json().catch(() => ({})) as { user?: InstitutionUser; temporaryPassword?: string; error?: string };
  if (!response.ok || !body.user || !body.temporaryPassword) throw new ApiError(body.error ?? 'Could not create institution user.', response.status);
  return { user: body.user, temporaryPassword: body.temporaryPassword };
}

export async function updateInstitutionUserAccess(institutionId: string, userId: string, access: { roles: InstitutionRole[]; status: 'active' | 'suspended' }): Promise<InstitutionUser> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/users/${encodeURIComponent(userId)}/access`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'content-type': 'application/json', ...(await csrfHeader('Could not start a secure access update.')) },
    body: JSON.stringify(access),
  });
  const body = await response.json().catch(() => ({})) as { user?: InstitutionUser; error?: string };
  if (!response.ok || !body.user) throw new ApiError(body.error ?? 'Could not update user access.', response.status);
  return body.user;
}

export async function getVerificationInstruments(institutionId: string): Promise<VerificationInstrument[]> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/instruments`, { credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot review verification attempts for this institution.' : 'Verification instruments could not be loaded.', response.status);
  return ((await response.json()) as { instruments: VerificationInstrument[] }).instruments;
}

export async function getVerificationAttempts(institutionId: string): Promise<VerificationAttempt[]> {
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/attempts`, { credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot review verification attempts for this institution.' : 'Verification history could not be loaded.', response.status);
  return ((await response.json()) as { attempts: VerificationAttempt[] }).attempts;
}

export async function runVerificationAttempt(institutionId: string, instrumentId: string): Promise<VerificationAttempt> {
  const csrfResponse = await apiFetch('/api/auth/csrf', { credentials: 'include' });
  if (!csrfResponse.ok) throw new ApiError('Could not start a secure verification request.', csrfResponse.status);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const response = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/verification/attempts`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ instrumentId }),
  });
  if (!response.ok) throw new ApiError(response.status === 403 ? 'You cannot initiate verification for this institution.' : 'Verification attempt failed.', response.status);
  return ((await response.json()) as { attempt: VerificationAttempt }).attempt;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await apiFetch('/api/health');
  if (!response.ok && response.status !== 503) {
    throw new Error(`API health request failed (${response.status})`);
  }

  return (await response.json()) as HealthResponse;
}

export async function sendSignupOtp(email: string): Promise<void> {
  const csrfResponse = await apiFetch('/api/auth/csrf', {
    credentials: 'include',
  });

  if (!csrfResponse.ok) {
    throw new ApiError(
      'Could not start a secure email verification session.',
      csrfResponse.status,
    );
  }

  const { csrfToken } = (await csrfResponse.json()) as {
    csrfToken: string;
  };

  const response = await apiFetch('/api/auth/otp/send', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ email }),
  });

  const result = (await response.json()) as {
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new ApiError(
      result.error ?? 'Could not send verification code.',
      response.status,
    );
  }
}

export async function verifySignupOtp(
  email: string,
  otp: string,
): Promise<void> {
  const csrfResponse = await apiFetch('/api/auth/csrf', {
    credentials: 'include',
  });

  if (!csrfResponse.ok) {
    throw new ApiError(
      'Could not start a secure OTP verification request.',
      csrfResponse.status,
    );
  }

  const { csrfToken } = (await csrfResponse.json()) as {
    csrfToken: string;
  };

  const response = await apiFetch('/api/auth/otp/verify', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ email, otp }),
  });

  const result = (await response.json()) as {
    verified?: boolean;
    error?: string;
  };

  if (!response.ok || result.verified !== true) {
    throw new ApiError(
      result.error ?? 'OTP verification failed.',
      response.status,
    );
  }
}
export interface SignupRegistration {
  type: 'student' | 'institution';
  name: string;
  email: string;
  phone: string;
  password: string;
  enrollment: string;
  course: string;
  institutionName: string;
  approvalNumber: string;
  representative: string;
}

export async function registerAccount(
  data: SignupRegistration,
): Promise<string> {
  const csrfResponse = await apiFetch('/api/auth/csrf', {
    credentials: 'include',
  });

  if (!csrfResponse.ok) {
    throw new ApiError(
      'Could not start secure registration.',
      csrfResponse.status,
    );
  }

  const { csrfToken } = (await csrfResponse.json()) as {
    csrfToken: string;
  };

  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(data),
  });

  const result = (await response.json()) as {
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new ApiError(
      result.error ?? 'Registration failed. Please try again.',
      response.status,
    );
  }

  return result.message ?? 'Registration submitted successfully.';
}
export interface StudentProfile {
  name: string;
  email: string;
  phone: string;
  enrollment: string;
  course: string;
  institutionName: string;
}

export async function getStudentProfile(): Promise<StudentProfile> {
  const response = await apiFetch('/api/auth/student-profile', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(
      'Student profile could not be loaded.',
      response.status,
    );
  }

  const result = (await response.json()) as {
    profile: StudentProfile;
  };

  return result.profile;
}

export interface StudentRecords {
  linked: boolean;
  fdrs: { id: string; reference: string; bankName: string; amount: string; currency: string; maturityDate: string; issueDate: string; reviewStatus: string; verificationStatus: string; instrumentState: string }[];
  documents: { id: string; fdrId: string; name: string; uploadedAt: string }[];
  refunds: { id: string; fdrId: string; status: string; reason: string; createdAt: string }[];
}
export async function getStudentRecords(): Promise<StudentRecords> {
  const response = await apiFetch('/api/student/records', { credentials: 'include' });
  if (!response.ok) throw new ApiError('Could not load your deposit records.', response.status);
  return response.json() as Promise<StudentRecords>;
}
export async function requestStudentRefund(fdrId: string, reason: string): Promise<void> {
  const tokenResponse = await apiFetch('/api/auth/csrf', { credentials: 'include' });
  if (!tokenResponse.ok) throw new ApiError('Could not validate session.', tokenResponse.status);
  const { csrfToken } = await tokenResponse.json() as { csrfToken: string };
  const response = await apiFetch('/api/student/refunds', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ fdrId, reason }) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(result.error ?? 'Refund request failed.', response.status);
  }
}

async function institutionAdminApi(path: string, method = 'GET', body?: unknown) {
  const csrfResponse = method === 'GET' ? null : await apiFetch('/api/auth/csrf', { credentials: 'include' });
  if (csrfResponse && !csrfResponse.ok) throw new ApiError('Session validation failed.', csrfResponse.status);
  const csrfToken = csrfResponse ? (await csrfResponse.json() as { csrfToken: string }).csrfToken : undefined;
  const response = await apiFetch(path, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json', 'x-csrf-token': csrfToken! } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(typeof result.error === 'string' ? result.error : 'Request failed.', response.status);
  return result;
}
export interface LinkedStudent { studentId: string; enrollment: string; course: string }
export interface AssignableFdr { id: string; reference: string; bankName: string; studentId: string | null }
export async function getInstitutionStudentLinks(institutionId: string) {
  const root = `/api/institutions/${encodeURIComponent(institutionId)}/student-linking`;
  const [students, fdrs] = await Promise.all([institutionAdminApi(`${root}/students`), institutionAdminApi(`${root}/fdrs`)]);
  return { students: students.students as LinkedStudent[], fdrs: fdrs.fdrs as AssignableFdr[] };
}
export async function linkInstitutionStudent(institutionId: string, email: string, enrollment: string) {
  return institutionAdminApi(`/api/institutions/${encodeURIComponent(institutionId)}/student-linking/students/link`, 'POST', { email, enrollment, admissionVerified: true });
}
export async function assignInstitutionFdr(institutionId: string, fdrId: string, studentId: string) {
  return institutionAdminApi(`/api/institutions/${encodeURIComponent(institutionId)}/student-linking/fdrs/${encodeURIComponent(fdrId)}/assign`, 'POST', { studentId });
}
