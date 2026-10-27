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

export async function sendSignupOtp(email: string): Promise<void> {
  const csrfResponse = await fetch('/api/auth/csrf', {
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

  const response = await fetch('/api/auth/otp/send', {
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
  const csrfResponse = await fetch('/api/auth/csrf', {
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

  const response = await fetch('/api/auth/otp/verify', {
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
  const csrfResponse = await fetch('/api/auth/csrf', {
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

  const response = await fetch('/api/auth/register', {
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
  const response = await fetch('/api/auth/student-profile', {
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
  const response = await fetch('/api/student/records', { credentials: 'include' });
  if (!response.ok) throw new ApiError('Could not load your deposit records.', response.status);
  return response.json() as Promise<StudentRecords>;
}
export async function requestStudentRefund(fdrId: string, reason: string): Promise<void> {
  const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!tokenResponse.ok) throw new ApiError('Could not validate session.', tokenResponse.status);
  const { csrfToken } = await tokenResponse.json() as { csrfToken: string };
  const response = await fetch('/api/student/refunds', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ fdrId, reason }) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(result.error ?? 'Refund request failed.', response.status);
  }
}

async function institutionAdminApi(path: string, method = 'GET', body?: unknown) {
  const csrfResponse = method === 'GET' ? null : await fetch('/api/auth/csrf', { credentials: 'include' });
  if (csrfResponse && !csrfResponse.ok) throw new ApiError('Session validation failed.', csrfResponse.status);
  const csrfToken = csrfResponse ? (await csrfResponse.json() as { csrfToken: string }).csrfToken : undefined;
  const response = await fetch(path, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json', 'x-csrf-token': csrfToken! } : undefined, body: body ? JSON.stringify(body) : undefined });
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
