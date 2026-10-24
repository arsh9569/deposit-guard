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

export async function signIn(email: string, password: string): Promise<PortalUser> {
  const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!csrfResponse.ok) throw new ApiError('Could not start a secure sign-in session.', csrfResponse.status);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const response = await fetch('/api/auth/login', {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new ApiError(response.status === 401 ? 'Invalid email or password.' : 'Sign-in failed. Try again.', response.status);
  return ((await response.json()) as { user: PortalUser }).user;
}

export async function getDashboard(institutionId: string): Promise<DashboardResponse> {
  const response = await fetch(`/api/dashboard?institutionId=${encodeURIComponent(institutionId)}`, { credentials: 'include' });
  if (!response.ok) {
    const message = response.status === 403 ? 'You do not have permission to view this institution dashboard.' : response.status === 401 ? 'Your session expired. Sign in again.' : 'Dashboard data could not be loaded.';
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as DashboardResponse;
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
