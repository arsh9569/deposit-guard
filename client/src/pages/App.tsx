import { Children, cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import './aicte-login.css';
import './aicte-unified-theme.css';
import { auditEvents, fdrRecords, institution } from '../features/demo-data';
import { createFdrDraft, createInstitutionUser, getCurrentUser, getDashboard, getInstitutionUsers, getNotifications, getSupportedFdrMimeType, getVerificationAttempts, getVerificationInstruments, runVerificationAttempt, saveOcrCorrection, sendAssistantMessage, signIn, signOut, submitFdrDraft, updateFdrDraft, updateInstitutionUserAccess, updateUsername, uploadFdrForOcr, type AssistantChatMessage, type DashboardResponse, type InstitutionRole, type InstitutionUser, type OcrUploadResult, type PortalNotification, type PortalUser, type VerificationAttempt, type VerificationInstrument } from '../lib/api';

type Screen =
  'dashboard' | 'register' | 'ocr' | 'review' | 'verification' | 'compliance' | 'release' | 'audit' | 'users';
type NavItem = { id: Screen; label: string; glyph: string; capability: string };
const OCR_STORAGE_KEY = 'depositguard.demo.ocr-corrections.v2-amount-fixture';
const nav: NavItem[] = [
  { id: 'dashboard', label: 'Overview', glyph: '◫', capability: 'dashboard:read' },
  { id: 'register', label: 'FDR register', glyph: '▤', capability: 'instruments:create' },
  { id: 'ocr', label: 'Document review', glyph: '⌗', capability: 'documents:review' },
  { id: 'review', label: 'Official scrutiny', glyph: '✓', capability: 'reviews:decide' },
  { id: 'verification', label: 'Verification', glyph: '◇', capability: 'verification:read' },
  { id: 'compliance', label: 'Maturity & actions', glyph: '◷', capability: 'compliance:read' },
  { id: 'release', label: 'Release / refund', glyph: '↻', capability: 'release:read' },
  { id: 'audit', label: 'Audit & reports', glyph: '▣', capability: 'audit:read' },
  { id: 'users', label: 'Users & roles', glyph: '♙', capability: 'users:manage' },
];
const permissionsByRole: Record<string, string[]> = {
  institution_admin: [...nav.map((item) => item.capability), 'compliance:manage', 'verification:run', 'release:request', 'release:review'],
  institution_operator: ['dashboard:read', 'instruments:create', 'documents:review', 'verification:read', 'compliance:read', 'release:read', 'release:request', 'audit:read'],
  official_reviewer: ['dashboard:read', 'documents:review', 'reviews:decide', 'verification:read', 'compliance:read', 'release:read', 'release:review', 'audit:read'],
  auditor: ['dashboard:read', 'verification:read', 'compliance:read', 'audit:read'],
};
function permissionsFor(roles: string[]) {
  return new Set(roles.flatMap((role) => permissionsByRole[role] ?? []));
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <span className="glyph" aria-hidden="true">
      {children}
    </span>
  );
}
function Arrow() {
  return (
    <span aria-hidden="true" className="arrow-glyph">
      ↗
    </span>
  );
}
function Button({
  children,
  onClick,
  kind = 'primary',
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button className={`button button-${kind}`} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`tag tag-${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function App() {
  const [sessionUser, setSessionUser] = useState<PortalUser | null>(null);
  const signedIn = Boolean(sessionUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [ocrResult, setOcrResult] = useState<OcrUploadResult | null>(null);
  const displayName = sessionUser?.displayName === 'Demo Institution Operator' ? 'Manjeet Singh' : sessionUser?.displayName;
  const activeMembership = sessionUser?.memberships[0];
  useEffect(() => {
    const institutionId = activeMembership?.institutionId;
    if (!institutionId) { setNotifications([]); return; }
    let active = true;
    getNotifications(institutionId).then((items) => { if (active) setNotifications(items); }).catch(() => { if (active) setNotifications([]); });
    return () => { active = false; };
  }, [activeMembership?.institutionId]);
  const unreadNotificationCount = notifications.filter((item) => item.state === 'unread').length;
  const allowedNav = nav.filter((item) => permissionsFor(activeMembership?.roles ?? []).has(item.capability));
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => { if (active) setSessionUser(user); })
      .catch((error: unknown) => {
        if (active) setAuthError(error instanceof Error ? error.message : 'Could not restore your session.');
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  if (authLoading) return <div className="auth-loading" role="status">Restoring your session…</div>;
  if (!signedIn)
    return (
      <Login
        expired={false}
        initialError={authError}
        onLogin={(user) => {
          setSessionUser(user);
          setOcrResult(null);
          setAuthError('');
          setScreen('dashboard');
        }}
      />
    );
  const go = (page: Screen) => {
    setScreen(page);
    setMobileOpen(false);
    setAssistantOpen(false);
    setToast('');
  };
  const toggleProfile = () => {
    setProfileOpen((open) => !open);
    setEditingUsername(false);
    setProfileError('');
  };
  const saveUsername = async (event: FormEvent) => {
    event.preventDefault();
    const displayName = usernameDraft.trim();
    if (displayName.length < 2 || displayName.length > 80) {
      setProfileError('Username must be between 2 and 80 characters.');
      return;
    }
    setProfileBusy(true);
    setProfileError('');
    try {
      const updated = await updateUsername(displayName);
      setSessionUser(updated);
      setEditingUsername(false);
      setToast('Username updated.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Username could not be updated.');
    } finally {
      setProfileBusy(false);
    }
  };
  const handleSignOut = async () => {
    setProfileBusy(true);
    setProfileError('');
    try {
      await signOut();
      setSessionUser(null);
      setOcrResult(null);
      setProfileOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    } finally {
      setProfileBusy(false);
    }
  };
  const title = nav.find((item) => item.id === screen)?.label ?? 'Overview';
  return (
    <div className="portal">
      {assistantOpen && <WorkflowAssistant currentScreen={screen} onClose={() => setAssistantOpen(false)} onNavigate={go} />}
      {mobileOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-shield">✺</span>
          <span>
            <strong>AICTE</strong>
            <small>SECURITY DEPOSIT &amp; FDR</small>
          </span>
          <button
            className="mobile-menu-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <div className="institution-select">
          <span className="institution-monogram">I</span>
          <span>
            <strong>Your institution</strong>
            <small>Institution workspace</small>
          </span>
          <b>⌄</b>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {allowedNav.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${screen === item.id ? 'nav-current' : ''}`}
              onClick={() => go(item.id)}
            >
              <Glyph>{item.glyph}</Glyph>
              <span>{item.label}</span>
              {item.id === 'review' && <small className="nav-badge">2</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="help-box">
          <span className="help-spark robot-mark"><BabyRobot className="assistant-baby" /></span>
          <span className="help-copy">
            <strong>NEED HELP?</strong>
            <button onClick={() => setAssistantOpen(true)}>Ask the assistant</button>
          </span>
        </div>
        <button className="sidebar-user" onClick={toggleProfile} title="Open profile" aria-haspopup="dialog" aria-expanded={profileOpen}>
          <span className="avatar">{displayName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
          <span>
          <strong>{displayName}</strong>
            <small>{activeMembership?.roles.join(', ') ?? 'No institution membership'}</small>
          </span>
          <b>···</b>
        </button>
      </aside>
      <section className="page-shell">
        <header className="topbar">
          <button
            className="mobile-menu-open"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <button
              className={`notification${unreadNotificationCount ? ' has-unread' : ''}`}
              onClick={() => setToast(unreadNotificationCount ? `${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? '' : 's'}.` : 'You are all caught up on notifications.')}
              aria-label={unreadNotificationCount ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications, none unread'}
              title={unreadNotificationCount ? `${unreadNotificationCount} unread notification${unreadNotificationCount === 1 ? '' : 's'}` : 'No unread notifications'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
              {unreadNotificationCount > 0 && <i />}
            </button>
            <span className="top-separator" />
            <button className="top-account" onClick={toggleProfile} aria-haspopup="dialog" aria-expanded={profileOpen}>
              <span className="avatar avatar-small male-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
              </span>
              <span>{displayName}</span>
              <b>⌄</b>
            </button>
          </div>
          {profileOpen && (
            <section className="profile-menu" role="dialog" aria-label="Profile settings">
              <div className="profile-menu-heading">
                <strong>Profile</strong>
                <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile">×</button>
              </div>
              <p className="profile-email">{sessionUser!.email}</p>
              {editingUsername ? (
                <form onSubmit={saveUsername} className="profile-form">
                  <label htmlFor="profile-username">Username</label>
                  <input id="profile-username" autoFocus maxLength={80} value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} />
                  <div className="profile-actions">
                    <button type="button" onClick={() => setEditingUsername(false)} disabled={profileBusy}>Cancel</button>
                    <button type="submit" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save username'}</button>
                  </div>
                </form>
              ) : (
                <button className="profile-action" type="button" onClick={() => { setUsernameDraft(displayName ?? ''); setEditingUsername(true); }}>Change username</button>
              )}
              {profileError && <p className="profile-error" role="alert">{profileError}</p>}
              <button className="profile-signout" type="button" onClick={handleSignOut} disabled={profileBusy}>{profileBusy ? 'Please wait…' : 'Sign out'}</button>
            </section>
          )}
        </header>
        <main className="content">
          {toast && (
            <div className="toast" role="status">
              <span>✓</span>
              {toast}
              <button onClick={() => setToast('')} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {screen === 'dashboard' && activeMembership && <Dashboard go={go} institutionId={activeMembership.institutionId} displayName={displayName ?? ''} canCreateFdr={permissionsFor(activeMembership.roles).has('instruments:create')} onSessionExpired={() => { setSessionUser(null); setOcrResult(null); }} />}
          {screen === 'dashboard' && !activeMembership && <div className="dashboard-state state-denied" role="alert"><strong>No institution access</strong><p>Your account has no active institution membership.</p></div>}
          {screen === 'register' && !permissionsFor(activeMembership?.roles ?? []).has('instruments:create') && (
            <div className="dashboard-state state-denied" role="alert">
              <strong>FDR registration access required</strong>
              <p>Your institution account does not have permission to create FDR records. Ask an institution administrator to assign the institution operator role.</p>
              <Button kind="secondary" onClick={() => setScreen('dashboard')}>Return to overview</Button>
            </div>
          )}
          {screen === 'register' && permissionsFor(activeMembership?.roles ?? []).has('instruments:create') && (
            <Registration
              institutionId={activeMembership?.institutionId ?? ''}
              onExtracted={(result) => {
                setOcrResult(result);
                setScreen('ocr');
                setToast(result.extractionStatus === 'complete' ? 'Document uploaded and text extraction completed.' : 'Document uploaded, but automatic text extraction failed. Review the file and enter any missing fields manually.');
              }}
            />
          )}
          {screen === 'ocr' && (ocrResult
            ? <UploadedOcrReview result={ocrResult} institutionId={activeMembership?.institutionId ?? ''} onDone={setToast} onBack={() => setScreen('register')} />
            : <OcrReview onDone={setToast} />)}
          {screen === 'review' && <ReviewConsole onDone={setToast} />}
          {screen === 'verification' && activeMembership && <Verification institutionId={activeMembership.institutionId} roles={activeMembership.roles} />}
          {screen === 'compliance' && <Compliance go={go} roles={activeMembership?.roles ?? []} />}
          {screen === 'release' && <ReleaseRequests onDone={setToast} roles={activeMembership?.roles ?? []} />}
          {screen === 'audit' && <AuditReports />}
          {screen === 'users' && activeMembership && permissionsFor(activeMembership.roles).has('users:manage') && <UserManagement institutionId={activeMembership.institutionId} />}
        </main>
        <footer className="portal-footer">
          <span>
            DepositGuard AI <b>·</b> Static workflow prototype
          </span>
          <span>Policy thresholds shown are demo assumptions</span>
        </footer>
      </section>
    </div>
  );
}

function WorkflowAssistant({ currentScreen, onClose, onNavigate }: { currentScreen: Screen; onClose: () => void; onNavigate: (page: Screen) => void }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight; }, [messages, busy, error]);
  const submitQuestion = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const updated = [...messages, { role: 'user' as const, content }];
    setMessages(updated);
    setQuestion('');
    setError('');
    setBusy(true);
    try {
      const answer = await sendAssistantMessage(updated.slice(-15), currentScreen);
      setMessages([...updated, { role: 'assistant', content: answer }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'I could not answer just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const ask = (event: FormEvent) => { event.preventDefault(); void submitQuestion(question); };
  const shortcuts: { label: string; page: Screen }[] = [
    { label: 'Register an FDR', page: 'register' },
    { label: 'Review documents', page: 'ocr' },
    { label: 'Check maturities', page: 'compliance' },
    { label: 'Start a release', page: 'release' },
  ];
  return (
    <div className="assistant-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="workflow-assistant" role="dialog" aria-modal="true" aria-label="DepositGuard workflow assistant">
        <header>
          <BabyRobot className="assistant-robot" />
          <span><strong>DepositGuard Assistant</strong><small>Ask me about your FDR workflows</small></span>
          <button type="button" onClick={onClose} aria-label="Close assistant">×</button>
        </header>
        <div className="assistant-conversation" ref={conversationRef} aria-live="polite">
          {messages.length === 0 ? <div className="assistant-welcome"><BabyRobot className="assistant-baby" /><p>Hi! I’m your DepositGuard helper. Ask me a question and I’ll help you find the next step.</p></div> : messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>{message.role === 'assistant' && <BabyRobot className="assistant-message-robot" />}<p>{message.content}</p></div>)}
          {busy && <div className="assistant-message assistant"><BabyRobot className="assistant-message-robot" /><p className="assistant-typing">Thinking…</p></div>}
          {error && <div className="assistant-error" role="alert">{error}</div>}
          {messages.length === 0 && <div className="assistant-shortcuts">{shortcuts.map((item) => <button type="button" key={item.page} onClick={() => onNavigate(item.page)}>{item.label}</button>)}</div>}
        </div>
        <form className="assistant-ask" onSubmit={ask}>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Message your assistant…" aria-label="Message your assistant" />
          <button type="submit" disabled={!question.trim() || busy} aria-label="Send message">➤</button>
        </form>
      </section>
    </div>
  );
}

function BabyRobot({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 132" aria-hidden="true">
    <ellipse cx="50" cy="126" rx="27" ry="4" fill="#dce7f3" />
    <path d="M50 10V4m-5 0h10" stroke="#4d7daf" strokeWidth="3" strokeLinecap="round" />
    <circle cx="50" cy="4" r="4" fill="#f4a75b" />
    <rect x="21" y="18" width="58" height="43" rx="19" fill="#e9f3ff" stroke="#567fa9" strokeWidth="3" />
    <rect x="28" y="27" width="44" height="26" rx="12" fill="#183b61" />
    <circle cx="40" cy="39" r="3.5" fill="#7fe1d0" /><circle cx="60" cy="39" r="3.5" fill="#7fe1d0" />
    <path d="M45 47q5 4 10 0" fill="none" stroke="#c3f3e8" strokeWidth="2" strokeLinecap="round" />
    <circle cx="17" cy="39" r="6" fill="#9fc3e8" stroke="#567fa9" strokeWidth="2" /><circle cx="83" cy="39" r="6" fill="#9fc3e8" stroke="#567fa9" strokeWidth="2" />
    <path d="M29 69q21-12 42 0l7 31q-28 15-56 0z" fill="#8eb7e3" stroke="#567fa9" strokeWidth="3" strokeLinejoin="round" />
    <rect x="39" y="74" width="22" height="18" rx="6" fill="#e9f3ff" stroke="#567fa9" strokeWidth="2" />
    <path d="M23 74 13 91m64-17 10 17" fill="none" stroke="#567fa9" strokeWidth="7" strokeLinecap="round" />
    <circle cx="13" cy="93" r="5" fill="#f4a75b" /><circle cx="87" cy="93" r="5" fill="#f4a75b" />
    <path d="m39 104-4 13m26-13 4 13" fill="none" stroke="#567fa9" strokeWidth="8" strokeLinecap="round" />
    <path d="M28 119h12m20 0h12" stroke="#f4a75b" strokeWidth="7" strokeLinecap="round" />
    <circle cx="50" cy="82" r="3" fill="#62b9a8" />
  </svg>;
}

function Login({ onLogin, expired, initialError = '' }: { onLogin: (user: PortalUser) => void; expired: boolean; initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address, such as name@institution.edu.');
      return;
    }
    setBusy(true);
    try {
      // Keep existing server-side authentication and permissions unchanged.
      const user = await signIn(email.trim(), password);
      onLogin(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aicte-login">
      <section className="aicte-hero">
        <div className="aicte-identity">
          <span className="aicte-emblem" aria-hidden="true">✺</span>
          <span><strong>AICTE</strong><small>All India Council for Technical Education</small></span>
        </div>
        <div className="aicte-hero-body">
          <h1>Security Deposit &amp;<br />FDR Portal</h1>
          <p>Digitally submit, verify and manage FDR records for compliance.</p>
          <ul>
            <li><span>▣</span> Secure document submission</li>
            <li><span>✓</span> Automated verification support</li>
            <li><span>▤</span> Real-time status tracking</li>
            <li><span>◷</span> Timely alerts and reminders</li>
          </ul>
        </div>
        <div className="aicte-hero-footer">SECURE · TRANSPARENT · ACCOUNTABLE</div>
      </section>

      <section className="aicte-access">
        <form className="aicte-card" onSubmit={submit} noValidate>
          <h2>Welcome Back</h2>
          <p className="aicte-intro">Login to continue</p>
          {(expired || initialError) && <div className="aicte-alert" role="alert">{initialError || 'Your session expired. Sign in again to continue.'}</div>}
          {error && <div className="aicte-alert" role="alert">{error}</div>}

          <label htmlFor="aicte-email">Email</label>
          <input id="aicte-email" type="email" autoComplete="username" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="aicte-password">Password</label>
          <div className="aicte-password-wrap">
            <input id="aicte-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="aicte-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>

          <div className="aicte-form-options">
            <label className="aicte-remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label>
            <button type="button" className="aicte-link" onClick={() => setError('Ask your institution administrator to reset your password.')}>Forgot password?</button>
          </div>
          <button className="aicte-submit" type="submit" disabled={busy}>{busy ? 'Signing in securely…' : 'Login'}</button>
          <p className="aicte-help">Don't have an account? Contact AICTE / your institution administrator.</p>
        </form>
      </section>
    </div>
  );
}

function PageTitle({
  overline,
  title,
  description,
  action,
}: {
  overline: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="overline">{overline}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-title-action">{action}</div>}
    </div>
  );
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
function PanelHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
function SectionTag({ children }: { children: ReactNode }) {
  return <span className="section-tag">{children}</span>;
}

function Dashboard({ go, institutionId, displayName, canCreateFdr, onSessionExpired }: { go: (page: Screen) => void; institutionId: string; displayName: string; canCreateFdr: boolean; onSessionExpired: () => void }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    getDashboard(institutionId).then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError({ message: reason instanceof Error ? reason.message : 'Dashboard data could not be loaded.', denied: Boolean(reason && typeof reason === 'object' && 'status' in reason && [401, 403, 404].includes((reason as { status: number }).status)) });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [institutionId, reloadKey]);
  const counts = data?.metrics;
  const soonest = data?.metrics.maturityQueue.find((record) => record.daysToMaturity >= 0);
  const metrics = data ? [
    { title: 'Total FDRs', value: counts!.totalFdrs, note: 'Across this institution', symbol: '▤', color: 'mint', page: 'compliance' as Screen },
    { title: 'Pending review', value: counts!.pendingReview, note: 'Awaiting official scrutiny', symbol: '⌗', color: 'gold', page: 'review' as Screen },
    { title: `Maturing in ${data.windowDays} days`, value: counts!.expiringWithinWindow, note: soonest ? `Next maturity · ${soonest.daysToMaturity} days` : 'Within configured window', symbol: '◷', color: 'peach', page: 'compliance' as Screen },
    { title: 'Overdue instruments', value: counts!.matured, note: 'Maturity date has passed', symbol: '◷', color: 'lilac', page: 'compliance' as Screen },
  ] : [];
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();
  return (
    <>
      <PageTitle
        overline={dateLabel}
        title={`Good afternoon, ${displayName || data?.displayName || 'there'}`}
        description="Live figures from your institution’s DepositGuard records."
        action={canCreateFdr ? <Button onClick={() => go('register')}>＋ &nbsp;Register an FDR</Button> : undefined}
      />
      {error && <div className={`dashboard-state ${error.denied ? 'state-denied' : 'state-error'}`} role="alert">
        <strong>{error.message.startsWith('Your session expired') ? 'Session expired' : error.denied ? 'Dashboard access denied' : 'Dashboard unavailable'}</strong><p>{error.message}</p>
        {error.message.startsWith('Your session expired') ? <Button kind="secondary" onClick={onSessionExpired}>Sign in again</Button> : !error.denied && <Button kind="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button>}
      </div>}
      <div className="metrics-grid">
        {loading ? <div className="dashboard-state" role="status"><span className="spinner" /> Loading institution metrics…</div> : metrics.map((item) => (
          <button key={item.title} className="metric-card" onClick={() => go(item.page)}>
            <div>
              <span>{item.title}</span>
              <i className={`metric-symbol ${item.color}`}>{item.symbol}</i>
            </div>
            <strong>{item.value.toLocaleString()}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>
      {!loading && !error && counts?.totalFdrs === 0 && <div className="dashboard-state dashboard-empty"><strong>No FDR records yet</strong><p>This institution has no instruments in the API response.</p>{canCreateFdr && <Button onClick={() => go('register')}>Register an FDR</Button>}</div>}
      <div className="dashboard-columns">
        <Panel className="action-panel">
          <PanelHeading
            title="Maturity & action queue"
            detail="Priority work for your institution"
            action={
              <button className="inline-link" onClick={() => go('compliance')}>
                View schedule <Arrow />
              </button>
            }
          />
          <div className="queue-totals">
            <div>
              <b>{counts?.pendingRenewals ?? '—'}</b>
              <span>renewal actions open</span>
            </div>
            <i />
            <div>
              <b>{counts?.pendingReleaseRequests ?? '—'}</b>
              <span>release / refund requests open</span>
            </div>
          </div>
          <div className="queue-list">
            {!loading && !error && counts?.maturityQueue.length === 0 && <div className="dashboard-state dashboard-empty">No upcoming or overdue maturities.</div>}
            {counts?.maturityQueue.map((record) => (
                <div className="queue-item" key={record.instrumentId}>
                  <div className={`days-box ${record.daysToMaturity < 0 ? 'days-overdue' : ''}`}>
                    <b>{Math.abs(record.daysToMaturity)}</b>
                    <small>{record.daysToMaturity < 0 ? 'DAYS LATE' : 'DAYS LEFT'}</small>
                  </div>
                  <div className="queue-info">
                    <strong>{record.reference}</strong>
                    <span>{record.bankName} · {record.amount}</span>
                  </div>
                  <Tag
                    tone={
                      record.daysToMaturity < 0
                        ? 'red'
                        : record.daysToMaturity <= 30
                          ? 'gold'
                          : 'blue'
                    }
                  >
                    {record.daysToMaturity < 0
                      ? 'Overdue'
                      : record.daysToMaturity <= 30
                        ? 'Expiring soon'
                        : 'Plan renewal'}
                  </Tag>
                  <button
                    className="circle-link"
                    onClick={() => go('compliance')}
                    aria-label={`Open ${record.reference}`}
                  >
                    ↗
                  </button>
                </div>
              ))}
          </div>
        </Panel>
        <Panel className="activity-panel">
          <PanelHeading
            title="Recent activity"
            detail="Latest actions across your workspace"
            action={
              <button className="inline-link" onClick={() => go('audit')}>
                Audit log <Arrow />
              </button>
            }
          />
          {!loading && !error && data?.recentActivity.length === 0 && <div className="dashboard-state dashboard-empty">No recent activity recorded.</div>}
          {data?.recentActivity.map((event, index) => <div className="activity-row" key={`${event.targetId ?? event.action}-${index}`}><span className="activity-icon blue">◇</span><span><strong>{event.action.replaceAll('.', ' ')}</strong><small>{event.reason ?? event.targetType} · {new Date(event.occurredAt).toLocaleString()}</small></span></div>)}
        </Panel>
      </div>
      <div className="shortcut-grid">
        <div>
          <SectionTag>QUICK ACTIONS</SectionTag>
        </div>
        {canCreateFdr && <button className="quick-action-register" onClick={() => go('register')}>
          <i className="shortcut-icon mint">＋</i>
          <span>
            <strong>Register an FDR</strong>
            <small>Add a deposit instrument</small>
          </span>
          <Arrow />
        </button>}
        <button className="quick-action-review" onClick={() => go('ocr')}>
          <i className="shortcut-icon lilac">⌗</i>
          <span>
            <strong>Review document extraction</strong>
            <small>Open document review queue</small>
          </span>
          <Arrow />
        </button>
        <button className="quick-action-release" onClick={() => go('release')}>
          <i className="shortcut-icon peach">↻</i>
          <span>
            <strong>Start a release request</strong>
            <small>Submit a request with evidence</small>
          </span>
          <Arrow />
        </button>
      </div>
    </>
  );
}

function Registration({ institutionId, onExtracted }: { institutionId: string; onExtracted: (result: OcrUploadResult) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState('');
  const [draft, setDraft] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'draft' | 'upload' | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = readFdrForm(event.currentTarget);
    const { issueDate, maturityDate, validUntil: validityDate } = submitted;
    if ((issueDate && maturityDate && maturityDate <= issueDate) || (validityDate && maturityDate && validityDate < maturityDate)) {
      setDraft(false);
      setMessage('Check that maturity follows the issue date and validity does not end before maturity.');
      return;
    }
    if (file && (!getSupportedFdrMimeType(file) || file.size > 25 * 1024 * 1024)) {
      setDraft(false);
      setMessage('Choose a PDF, JPEG, or PNG file up to 25 MiB.');
      return;
    }
    if (!file) {
      setDraft(false);
      setMessage('Attach a PDF, JPEG, or PNG document to run text extraction.');
      return;
    }
    if (!institutionId) {
      setDraft(false);
      setMessage('Your account has no active institution for document submission.');
      return;
    }
    setBusy(true);
    setBusyAction('upload');
    setDraft(false);
    setMessage('Uploading document and extracting text…');
    try {
      const result = await uploadFdrForOcr(institutionId, file, { ...submitted, draftId: draftId || undefined });
      onExtracted(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Document upload or extraction failed.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };
  const saveDraft = async () => {
    if (!institutionId) { setMessage('Your account has no active institution for saving this draft.'); return; }
    const form = formRef.current;
    if (!form) { setMessage('The FDR form is unavailable. Refresh the page and try again.'); return; }
    const values = readFdrForm(form);
    if ((values.issueDate && values.maturityDate && values.maturityDate <= values.issueDate) || (values.validUntil && values.maturityDate && values.validUntil < values.maturityDate)) {
      setDraft(false);
      setMessage('Check that maturity follows the issue date and validity does not end before maturity.');
      return;
    }
    setBusy(true);
    setBusyAction('draft');
    setDraft(false);
    setMessage('Saving draft to your account…');
    try {
      if (draftId) {
        const changedValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
        if (Object.keys(changedValues).length) await updateFdrDraft(institutionId, draftId, changedValues);
      } else {
        setDraftId(await createFdrDraft(institutionId, values));
      }
      setDraft(true);
      setMessage('Draft saved to your account. Upload a document when you are ready to continue.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'FDR draft could not be saved.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };
  return (
    <>
      <PageTitle
        overline="INSTRUMENT MANAGEMENT"
        title="Register an FDR"
        description="Add deposit details and upload a document for text extraction."
      />
      <form ref={formRef} className="registration-grid" noValidate onSubmit={submit} onChange={() => { setDraft(false); if (message) setMessage(''); }}>
        <div className="form-stack">
          <Panel>
            <PanelHeading
              title="Institution & reference"
            />
            <div className="fields-grid">
              <Field label="Institution" required>
                <select defaultValue={institution.id}>
                  <option value={institution.id}>{institution.name}</option>
                </select>
              </Field>
              <Field label="Internal reference" required>
                <input required name="reference" placeholder="e.g. FIN-FDR-2026-014" />
              </Field>
            </div>
          </Panel>
          <Panel>
            <PanelHeading
              title="Bank & instrument details"
            />
            <div className="fields-grid">
              <Field label="Bank name" required>
                <input required name="bankName" placeholder="e.g. Northstar Synthetic Bank" />
              </Field>
              <Field label="Branch" required>
                <input required name="branchName" placeholder="Branch or location" />
              </Field>
              <Field label="FDR / instrument number" required>
                <input required name="instrumentNumber" placeholder="Enter instrument reference" />
              </Field>
              <Field label="Account holder" required>
                <input required name="holderName" placeholder="Synthetic institution name only" />
              </Field>
              <Field label="Deposit amount (₹)" required>
                <input type="number" name="principalAmount" required min="1" placeholder="e.g. 2500000" />
              </Field>
              <Field label="Currency">
                <select name="currency" defaultValue="INR">
                  <option value="INR">INR · Indian Rupee</option>
                </select>
              </Field>
              <Field label="Issue date" required>
                <input type="date" name="issueDate" required />
              </Field>
              <Field label="Maturity date" required>
                <input type="date" name="maturityDate" required />
              </Field>
              <Field label="Validity through">
                <input type="date" name="validUntil" />
              </Field>
            </div>
          </Panel>
          <Panel>
            <PanelHeading title="Supporting document" detail="Upload a PDF, JPEG or PNG to extract its text." />
            <label className={`upload-well ${file ? 'upload-done' : ''}`}>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span>{file ? '✓' : '↥'}</span>
              <strong>{file?.name || 'Drop your document here, or browse'}</strong>
              <small>PDF, JPEG or PNG · up to 25 MiB</small>
            </label>
          </Panel>
          <div className="form-buttons">
            <Button kind="secondary" type="button" onClick={() => void saveDraft()} disabled={busy}>
              {busyAction === 'draft' ? 'Saving draft…' : 'Save draft'}
            </Button>
            <Button type="submit" disabled={busy}>
              {busyAction === 'upload' ? 'Uploading & extracting…' : 'Upload & extract text'}
            </Button>
            {message && <div className={`inline-message ${draft ? 'message-ok' : ''}`} role={draft ? 'status' : 'alert'} aria-live="polite">{message}</div>}
          </div>
        </div>
      </form>
    </>
  );
}

function readFdrForm(form: HTMLFormElement) {
  const values = new FormData(form);
  const value = (name: string) => String(values.get(name) ?? '');
  return {
    reference: value('reference'),
    instrumentNumber: value('instrumentNumber'),
    bankName: value('bankName'),
    branchName: value('branchName'),
    holderName: value('holderName'),
    principalAmount: value('principalAmount'),
    currency: value('currency') || 'INR',
    issueDate: value('issueDate'),
    maturityDate: value('maturityDate'),
    validUntil: value('validUntil'),
  };
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  const fieldId = useId();
  let linkedControl = false;
  const linkedChildren = Children.map(children, (child) => {
    if (!linkedControl && isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))) {
      linkedControl = true;
      return cloneElement(child as React.ReactElement<Record<string, unknown>>, { id: fieldId });
    }
    return child;
  });
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {required && <i> *</i>}
      </label>
      {linkedChildren}
    </div>
  );
}

function UploadedOcrReview({ result, institutionId, onDone, onBack }: { result: OcrUploadResult; institutionId: string; onDone: (message: string) => void; onBack: () => void }) {
  const keys = ['reference', 'instrumentNumber', 'bankName', 'branchName', 'holderName', 'principalAmount', 'issueDate', 'maturityDate'] as const;
  const labels: Record<(typeof keys)[number], string> = { reference: 'FDR reference', instrumentNumber: 'Instrument number', bankName: 'Bank name', branchName: 'Branch', holderName: 'Account holder', principalAmount: 'Deposit amount', issueDate: 'Issue date', maturityDate: 'Maturity date' };
  const submitted: Record<(typeof keys)[number], string> = {
    reference: result.submitted.reference,
    instrumentNumber: result.submitted.instrumentNumber,
    bankName: result.submitted.bankName,
    branchName: result.submitted.branchName,
    holderName: result.submitted.holderName,
    principalAmount: result.submitted.principalAmount,
    issueDate: result.submitted.issueDate,
    maturityDate: result.submitted.maturityDate,
  };
  const extractedRaw = Object.fromEntries(result.fields.map((field) => [field.fieldName, field.value])) as Partial<Record<(typeof keys)[number], string>>;
  const extracted = Object.fromEntries(keys.map((key) => [key, extractedRaw[key] === undefined ? undefined : normalizeOcrDate(extractedRaw[key]!)])) as Partial<Record<(typeof keys)[number], string>>;
  const [values, setValues] = useState<Record<(typeof keys)[number], string>>(() => Object.fromEntries(keys.map((key) => [key, extracted[key] ?? submitted[key]])) as Record<(typeof keys)[number], string>);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [savedValues, setSavedValues] = useState<Partial<Record<(typeof keys)[number], string>>>({});
  const rows = keys.map((key) => {
    const field = result.fields.find((item) => item.fieldName === key);
    return { key, label: labels[key], value: submitted[key], confidence: field ? Math.round(field.confidence * 100) : 0, mismatch: result.discrepancies.includes(key) };
  });
  const changed = keys.filter((key) => values[key] !== (extracted[key] ?? submitted[key]) && values[key] !== savedValues[key]);
  const update = (key: (typeof keys)[number], value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const save = async (submit = false) => {
    const requiredFields: (typeof keys)[number][] = ['reference', 'instrumentNumber', 'bankName', 'branchName', 'holderName', 'principalAmount', 'issueDate', 'maturityDate'];
    const amount = values.principalAmount.replace(/,/g, '');
    if (submit && requiredFields.some((key) => !values[key].trim())) {
      onDone('Complete all required FDR fields before submitting for official review.');
      return;
    }
    if ((values.principalAmount && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) || (submit && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !isValidOcrDate(normalizeOcrDate(values.issueDate)) || !isValidOcrDate(normalizeOcrDate(values.maturityDate)) || normalizeOcrDate(values.maturityDate) <= normalizeOcrDate(values.issueDate)))) {
      onDone('Enter a positive amount and valid dates, with maturity after issue date.');
      return;
    }
    setBusy(true);
    try {
      for (const key of changed) {
        let correctedValue = values[key].trim();
        if (key === 'principalAmount') correctedValue = correctedValue.replace(/,/g, '');
        if (key === 'issueDate' || key === 'maturityDate') correctedValue = normalizeOcrDate(correctedValue);
        if (extractedRaw[key] !== undefined) await saveOcrCorrection(institutionId, result, key, correctedValue);
        else await updateFdrDraft(institutionId, result.instrumentId, { [key]: correctedValue });
        setSavedValues((current) => ({ ...current, [key]: values[key] }));
      }
      if (submit) {
        await submitFdrDraft(institutionId, result.instrumentId);
        setSubmittedForReview(true);
      }
      setSaved(true);
      onDone(submit
        ? 'Corrections saved and the FDR draft submitted for official review.'
        : changed.length ? 'Corrections saved to the server. Original extracted values remain preserved.' : 'No corrections were needed. The extracted results are already preserved.');
    } catch (error) {
      onDone(error instanceof Error ? error.message : 'OCR corrections could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        overline="DOCUMENT WORKSPACE · UPLOADED FILE"
        title="Review extracted text"
        description="Text extracted by the server from your uploaded document. Review recognized fields before submitting."
        action={<Tag tone={submittedForReview ? 'green' : result.extractionStatus === 'complete' ? 'blue' : 'red'}>{submittedForReview ? 'Submitted for review' : result.extractionStatus === 'complete' ? 'Extraction complete' : 'Extraction failed'}</Tag>}
      />
      <div className="workspace-toolbar">
        <button className="inline-link" onClick={onBack}>← Back to registration</button>
        <span>{result.originalFileName} · {result.extractedText.length.toLocaleString()} characters extracted</span>
      </div>
      {result.extractionStatus === 'failed' && <div className="dashboard-state state-error" role="alert">The file was uploaded, but the server could not read its text. Try a clear, upright PDF, JPEG, or PNG, or enter the FDR details below for manual review.</div>}
      <div className="ocr-grid">
        <Panel className="preview-panel">
          <div className="preview-header"><span className="file-icon">▤</span><span><strong>{result.originalFileName}</strong><small>{result.authenticity}</small></span></div>
          <div className="ocr-text-preview"><pre>{result.extractedText || 'No text was found in this document.'}</pre></div>
        </Panel>
        <Panel className="extraction-panel">
          <div className="extraction-header"><div><h2>Recognized fields</h2><p>Compare extracted values with your submitted details.</p></div><Tag tone="blue">{result.fields.length} found</Tag></div>
          {result.fields.length === 0 && <div className="dashboard-state">No supported FDR fields were recognized. Check the raw extracted text and review the submitted values.</div>}
          <>
            <div className="extract-columns"><span>FIELD</span><span>EXTRACTED VALUE</span><span>SUBMITTED VALUE</span></div>
            {rows.map((row) => <div className={`extract-row ${row.mismatch ? 'extract-mismatch' : ''}`} key={row.key}>
              <span className="extract-field">{row.label}{row.mismatch && <small>⚠ Check</small>}</span>
              <span className="extract-edit"><input aria-label={`Extracted ${row.label}`} value={values[row.key]} onChange={(event) => update(row.key, event.target.value)} /><b className={row.confidence < 80 ? 'low-confidence' : ''}>{row.confidence ? `${row.confidence}%` : 'Enter value'}</b>{changed.includes(row.key) && <i>Edited</i>}</span>
              <span className="extract-submitted">{row.value}</span>
            </div>)}
          </>
          <div className="preserve-note"><span>◇</span><span><strong>Original extraction preserved</strong><small>{saved ? 'Corrections saved to server.' : `${changed.length} unsaved correction${changed.length === 1 ? '' : 's'}. `}Extraction is not proof that a financial instrument is genuine.</small></span></div>
          <div className="ocr-actions">
            <Button kind="secondary" onClick={() => void save()} disabled={busy || saved}>{busy ? 'Saving…' : saved ? 'Corrections saved ✓' : 'Save corrections'}</Button>
            <Button onClick={() => void save(true)} disabled={busy || submittedForReview}>{busy ? 'Saving…' : submittedForReview ? 'Submitted ✓' : <>Save &amp; submit <Arrow /></>}</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}

function normalizeOcrDate(value: string) {
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function isValidOcrDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function OcrReview({ onDone }: { onDone: (message: string) => void }) {
  const record = fdrRecords[0];
  const original = {
    reference: record.reference,
    bank: record.bank,
    holder: record.holder,
    amount: '2500000',
    issue: record.issueDate,
    maturity: record.maturityDate,
  };
  const extraction = { ...original, amount: '2450000', maturity: record.maturityDate };
  const [values, setValues] = useState<typeof original>(() => {
    try {
      const stored = sessionStorage.getItem(OCR_STORAGE_KEY);
      return stored ? { ...extraction, ...JSON.parse(stored).values } : extraction;
    } catch {
      return extraction;
    }
  });
  const [changed, setChanged] = useState(() => {
    try {
      const stored = sessionStorage.getItem(OCR_STORAGE_KEY);
      return new Set<string>(stored ? JSON.parse(stored).correctedFields : []);
    } catch {
      return new Set<string>();
    }
  });
  const [saved, setSaved] = useState(() => {
    try { return Boolean(sessionStorage.getItem(OCR_STORAGE_KEY)); } catch { return false; }
  });
  const [submitted, setSubmitted] = useState(() => {
    try { return Boolean(JSON.parse(sessionStorage.getItem(OCR_STORAGE_KEY) ?? '{}').submitted); } catch { return false; }
  });
  const [storageWarning, setStorageWarning] = useState(false);
  const rows: {
    key: keyof typeof original;
    label: string;
    value: string;
    confidence: number;
    mismatch?: boolean;
  }[] = [
    { key: 'reference', label: 'FDR number', value: original.reference, confidence: 98 },
    { key: 'bank', label: 'Bank name', value: original.bank, confidence: 95 },
    { key: 'holder', label: 'Account holder', value: original.holder, confidence: 87 },
    { key: 'amount', label: 'Deposit amount', value: '₹25,00,000', confidence: 94, mismatch: true },
    { key: 'issue', label: 'Issue date', value: original.issue, confidence: 91 },
    {
      key: 'maturity',
      label: 'Maturity date',
      value: record.maturityDate,
      confidence: 72,
    },
  ];
  const change = (key: keyof typeof original, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setChanged((current) => {
      const next = new Set(current);
      if (value === extraction[key]) next.delete(key);
      else next.add(key);
      return next;
    });
    setSaved(false);
    setSubmitted(false);
  };
  const saveReview = (submit = false) => {
    if (rows.some((row) => !values[row.key].trim()) || !/^\d+(?:\.\d{1,2})?$/.test(values.amount) || Number(values.amount) <= 0) {
      onDone('Complete all extracted fields and enter a valid positive deposit amount before saving.');
      return;
    }
    try {
      sessionStorage.setItem(OCR_STORAGE_KEY, JSON.stringify({ values, correctedFields: [...changed], submitted: submit }));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
    setSaved(true);
    setSubmitted(submit);
    onDone(submit
      ? 'Corrected values saved and marked submitted in this synthetic demo session.'
      : 'OCR corrections saved for this browser session. The original extraction remains preserved.');
  };
  const resetReview = () => {
    setValues(extraction);
    setChanged(new Set());
    setSaved(false);
    setSubmitted(false);
    setStorageWarning(false);
    try { sessionStorage.removeItem(OCR_STORAGE_KEY); } catch { /* Reset remains available in memory. */ }
    onDone('OCR review reset to the original synthetic extraction.');
  };
  const downloadSyntheticPreview = () => {
    const contents = [
      'SYNTHETIC DEMO ONLY — NOT A FINANCIAL DOCUMENT',
      `FDR Reference: ${record.reference}`,
      `Bank Name: ${record.bank}`,
      `Account Holder: ${record.holder}`,
      `Principal Amount: INR ${values.amount}`,
      `Issue Date: ${record.issueDate}`,
      `Maturity Date: ${record.maturityDate}`,
      'FICTIONAL SAMPLE — FOR DEMONSTRATION ONLY',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'synthetic-fdr-ocr-preview.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageTitle
        overline="DOCUMENT WORKSPACE · PRETESTED FIXTURE"
        title="Review extracted details"
        description="Compare OCR observations with the submitted values. Corrections are saved separately from the original extraction."
        action={<Tag tone={submitted ? 'green' : 'blue'}>{submitted ? 'Submitted for review' : 'OCR complete · synthetic fixture'}</Tag>}
      />
      <div className="workspace-toolbar">
        <button className="inline-link" onClick={() => onDone('Returned to the document queue.')}>
          ← Back to queue
        </button>
        <span>
          FDR-2026-018 <i>·</i> Pretested synthetic PDF fixture · deterministic extraction
        </span>
      </div>
      <div className="ocr-grid">
        <Panel className="preview-panel">
          <div className="preview-header">
            <span className="file-icon">▤</span>
            <span>
              <strong>fdr_scan_018.pdf</strong>
              <small>2 pages · 1.8 MB</small>
            </span>
            <button aria-label="Download synthetic text preview" onClick={downloadSyntheticPreview}>↓</button>
          </div>
          <div className="paper-wrap">
            <div className="fake-paper">
              <div className="paper-heading">
                <b className="paper-seal">ND</b>
                <span>
                  <strong>NORTHSTAR SYNTHETIC BANK</strong>
                  <small>SYNTHETIC DEMO · NOT A FINANCIAL DOCUMENT</small>
                </span>
                <small>DEMO COPY</small>
              </div>
              <hr />
              <div className="paper-number">
                <span>Receipt no.</span>
                <b>{record.reference}</b>
              </div>
              <div className="paper-title">FIXED DEPOSIT RECEIPT</div>
              <div className="paper-details">
                <PaperLine label="Name of depositor" value={record.holder} />
                <PaperLine label="Principal amount" value="₹24,50,000" warning />
                <PaperLine label="Date of deposit" value={record.issueDate} />
                <PaperLine label="Date of maturity" value={record.maturityDate} />
                <PaperLine label="Branch" value="Synthetic Demo Branch" />
                <PaperLine label="Interest type" value="Cumulative · Quarterly" />
              </div>
              <div className="paper-stamp">FICTIONAL SAMPLE · FOR DEMONSTRATION ONLY</div>
              <div className="paper-signature">
                <span>Authorised signatory</span>
                <span>Depositor</span>
              </div>
            </div>
          </div>
          <div className="preview-footer">
            <span>● &nbsp;Page 1 of 2</span>
            <span>− &nbsp;100% &nbsp;+</span>
          </div>
        </Panel>
        <Panel className="extraction-panel">
          <div className="extraction-header">
            <div>
              <h2>Extracted fields</h2>
              <p>Compare the values, then edit where necessary.</p>
            </div>
            <Tag tone="green">Pretested fixture</Tag>
          </div>
          <div className="extraction-legend">
            <span>Confidence</span>
            <span>Discrepancy</span>
          </div>
          <div className="extract-columns">
            <span>FIELD</span>
            <span>EXTRACTED VALUE</span>
            <span>SUBMITTED VALUE</span>
          </div>
          {rows.map((row) => (
            <div className={`extract-row ${row.mismatch ? 'extract-mismatch' : ''}`} key={row.key}>
              <span className="extract-field">
                {row.label}
                {row.mismatch && <small>⚠ Check</small>}
              </span>
              <span className="extract-edit">
                <input
                  aria-label={`Extracted ${row.label}`}
                  value={values[row.key]}
                  onChange={(e) => change(row.key, e.target.value)}
                />
                <b className={row.confidence < 80 ? 'low-confidence' : ''}>{row.confidence}%</b>
                {changed.has(row.key) && <i>Edited</i>}
              </span>
              <span className="extract-submitted">{row.value}</span>
            </div>
          ))}
          <div className="preserve-note">
            <span>◇</span>
            <span>
              <strong>Original extraction preserved</strong>
              <small>
                {changed.size
                  ? `${changed.size} unsaved correction${changed.size === 1 ? '' : 's'}. `
                  : ''}
                Original OCR values and confidence scores are retained separately. {saved ? (submitted ? 'Submitted for synthetic review.' : 'Corrections saved.') : 'Save your changes to keep them for this browser session.'}
                {storageWarning && ' Browser storage is unavailable; changes remain only until you leave this page.'}
              </small>
            </span>
          </div>
          <div className="ocr-actions">
            <Button kind="quiet" onClick={resetReview}>Reset</Button>
            <Button
              kind="secondary"
              onClick={() => saveReview()}
              disabled={saved && !submitted}
            >
              {saved && !submitted ? 'Corrections saved ✓' : 'Save corrections'}
            </Button>
            <Button onClick={() => saveReview(true)} disabled={submitted}>
              {submitted ? 'Submitted ✓' : <>Save &amp; submit <Arrow /></>}
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
function PaperLine({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={warning ? 'paper-line line-warn' : 'paper-line'}>
      <small>{label}</small>
      <strong>{value}</strong>
      {warning && <i>REVIEW</i>}
    </div>
  );
}

function ReviewConsole({ onDone }: { onDone: (message: string) => void }) {
  const [selected, setSelected] = useState(0);
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  const record = fdrRecords[selected];
  const decide = (action: string) => {
    if (!observation.trim()) {
      setError('Add a scrutiny observation before recording a decision.');
      return;
    }
    setError('');
    onDone(`${action} recorded in this synthetic review session with the observation.`);
  };
  return (
    <>
      <PageTitle
        overline="OFFICIAL WORKSPACE"
        title="Scrutiny console"
        description="Review submissions, supporting documents, and discrepancies before recording a reasoned decision."
        action={<Tag tone="gold">2 pending</Tag>}
      />
      <div className="review-layout">
        <Panel className="review-inbox">
          <PanelHeading title="Pending submissions" detail="Assigned to your review queue" />
          {fdrRecords.slice(0, 2).map((item, index) => (
            <button
              key={item.reference}
              className={`inbox-item ${selected === index ? 'inbox-selected' : ''}`}
              onClick={() => {
                setSelected(index);
                setObservation('');
                setError('');
              }}
            >
              <div>
                <small>{index ? 'UPDATED RECORD' : 'NEW REGISTRATION'}</small>
                <Tag tone={index ? 'blue' : 'gold'}>{index ? 'Today' : '2 days'}</Tag>
              </div>
              <strong>{item.reference}</strong>
              <span>
                {item.bank} · {item.amountLabel}
              </span>
              <footer>
                <span className="avatar avatar-tiny">MS</span> Submitted by Manjeet Singh <Arrow />
              </footer>
            </button>
          ))}
        </Panel>
        <div className="review-body">
          <Panel>
            <div className="review-head">
              <div>
                <small>SUBMISSION DETAILS</small>
                <h2>{record.reference}</h2>
              </div>
              <Tag tone="gold">Pending scrutiny</Tag>
            </div>
            <div className="summary-grid">
              <div>
                <small>Institution</small>
                <strong>{institution.shortName}</strong>
              </div>
              <div>
                <small>Bank</small>
                <strong>{record.bank}</strong>
              </div>
              <div>
                <small>Account holder</small>
                <strong>{record.holder}</strong>
              </div>
              <div>
                <small>Principal amount</small>
                <strong>{record.amountLabel}</strong>
              </div>
              <div>
                <small>Issue date</small>
                <strong>{record.issueDate}</strong>
              </div>
              <div>
                <small>Maturity date</small>
                <strong>{record.maturityDate}</strong>
              </div>
            </div>
            <div className="discrepancy-card">
              <div>
                <b>!</b>
                <strong>Discrepancy to review</strong>
                <Tag tone="gold">1 field</Tag>
              </div>
              <section>
                <strong>Principal amount</strong>
                <span>Submitted: ₹25,00,000</span>
                <b>Document: ₹24,50,000</b>
                <Tag tone="gold">Mismatch</Tag>
              </section>
            </div>
            <div className="supporting-file">
              <span>▤</span>
              <div>
                <strong>FDR scan · customer-copy.pdf</strong>
                <small>Synthetic PDF · uploaded by Manjeet Singh · OCR complete</small>
              </div>
              <button onClick={() => onDone('Opened the fictional supporting-document preview.')}>
                View document <Arrow />
              </button>
            </div>
            <label className="field-label" htmlFor="scrutiny-observation">
              Scrutiny observations <i>*</i>
            </label>
            <textarea
              id="scrutiny-observation"
              rows={3}
              placeholder="Record the discrepancy, evidence reviewed, and any correction needed…"
              value={observation}
              onChange={(e) => {
                setObservation(e.target.value);
                setError('');
              }}
            />
            {error && <div className="alert alert-error">{error}</div>}
            <p className="review-footnote">
              Review decisions are separate from submitted data, OCR results, and bank responses.
            </p>
            <div className="decision-buttons">
              <Button kind="secondary" onClick={() => decide('Correction request')}>
                Request correction
              </Button>
              <div>
                <Button kind="danger" onClick={() => decide('Rejection')}>
                  Reject
                </Button>
                <Button onClick={() => decide('Approval')}>Approve record ✓</Button>
              </div>
            </div>
          </Panel>
          <div className="review-integrity">
            <span>◇</span>
            <span>
              <strong>Independent scrutiny</strong>
              <small>
                Approval is an administrative decision and does not verify bank authenticity.
              </small>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Verification({ institutionId, roles }: { institutionId: string; roles: string[] }) {
  const [instruments, setInstruments] = useState<VerificationInstrument[]>([]);
  const [attempts, setAttempts] = useState<VerificationAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyInstrumentId, setBusyInstrumentId] = useState('');
  const [error, setError] = useState('');
  const canInitiate = permissionsFor(roles).has('verification:run');
  useEffect(() => {
    let active = true;
    Promise.all([getVerificationInstruments(institutionId), getVerificationAttempts(institutionId)])
      .then(([available, history]) => { if (active) { setInstruments(available); setAttempts(history); setError(''); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Verification data could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [institutionId]);
  const run = async (instrument: VerificationInstrument) => {
    setBusyInstrumentId(instrument.id); setError('');
    try {
      const attempt = await runVerificationAttempt(institutionId, instrument.id);
      setAttempts((current) => [attempt, ...current]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verification attempt failed.'); }
    finally { setBusyInstrumentId(''); }
  };
  return (
    <>
      <PageTitle
        overline="INSTRUMENT EVIDENCE"
        title="Verification record"
        description="Run and review deterministic provider fixtures. Every response is recorded as simulated, never bank confirmation."
      />
      <div className="simulation-warning">
        <div className="warning-mark">◇</div>
        <div>
          <strong>SIMULATED PROVIDER RESPONSES — NOT BANK CONFIRMED</strong>
          <p>
            These deterministic fixtures do not contact a bank and cannot establish that an FDR is genuine.
          </p>
        </div>
        <Tag tone="blue">DEMO ONLY</Tag>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Panel>
        <PanelHeading title="Available verification fixtures" detail="Initiation is restricted to institution operators and administrators." />
        {loading ? <div role="status">Loading verification fixtures…</div> : instruments.filter((item) => /^FDR-2026-02[1-4]$/.test(item.reference)).map((instrument) => (
          <div className="attempt-row" key={instrument.id}>
            <span>◇</span>
            <div><strong>{instrument.reference}</strong><small>{instrument.bankName} · ₹{Number(instrument.principalAmount).toLocaleString('en-IN')}</small></div>
            {canInitiate ? <Button kind="secondary" disabled={busyInstrumentId === instrument.id} onClick={() => void run(instrument)}>{busyInstrumentId === instrument.id ? 'Recording…' : 'Run simulated attempt'}</Button> : <Tag tone="neutral">Review only</Tag>}
          </div>
        ))}
      </Panel>
      <Panel>
        <PanelHeading title="Verification history" detail="Every attempt is retained with its provider, mode, outcome, and non-confirmation label." />
        {loading ? <div role="status">Loading attempt history…</div> : attempts.length === 0 ? <div className="dashboard-empty">No verification attempts recorded yet.</div> : attempts.map((attempt) => (
          <div className="attempt-row" key={attempt.id}>
            <span>◇</span>
            <div><strong>{instruments.find((item) => item.id === attempt.instrumentId)?.reference ?? attempt.instrumentId}</strong><small>{attempt.provider} · {attempt.status} · {attempt.responseSummary}</small></div>
            <Tag tone="blue">{attempt.label}</Tag>
          </div>
        ))}
      </Panel>
      <div className="adapter-note">A simulated match is not genuine bank verification. No bank was contacted.</div>
    </>
  );
}

function Compliance({ go, roles }: { go: (page: Screen) => void; roles: string[] }) {
  const [reminders, setReminders] = useState(true);
  const [lead, setLead] = useState(30);
  const [saved, setSaved] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('All instruments');
  const visibleRecords = fdrRecords.filter((record) =>
    scheduleFilter === 'All instruments' ||
    (scheduleFilter === 'Upcoming' ? record.daysToMaturity >= 0 : record.daysToMaturity < 0),
  );
  const rolePermissions = permissionsFor(roles);
  const canManagePolicy = rolePermissions.has('compliance:manage');
  const canOpenRelease = rolePermissions.has('release:read');
  return (
    <>
      <PageTitle
        overline="PORTFOLIO MONITORING"
        title="Maturity & compliance"
        description="Track instrument dates, overdue follow-up, and renewal or replacement progress."
        action={canOpenRelease ? (
          <Button kind="secondary" onClick={() => go('release')}>
            Open action queue <Arrow />
          </Button>
        ) : undefined}
      />
      <div className="compliance-metrics">
        <div>
          <b className="c-icon gold">◷</b>
          <strong>01</strong>
          <small>Upcoming maturity · 30 days</small>
        </div>
        <div>
          <b className="c-icon red">!</b>
          <strong>01</strong>
          <small>Overdue follow-up</small>
        </div>
        <div>
          <b className="c-icon blue">↻</b>
          <strong>02</strong>
          <small>Renewal / replacement tracking</small>
        </div>
        <div>
          <b className="c-icon green">✓</b>
          <strong>01</strong>
          <small>Escalated to institution admin</small>
        </div>
      </div>
      <div className="compliance-layout">
        <Panel className="schedule-panel">
          <PanelHeading
            title="Upcoming & overdue actions"
            detail="Sorted by nearest maturity"
            action={
              <select aria-label="Filter schedule" value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}>
                <option>All instruments</option>
                <option>Upcoming</option>
                <option>Overdue</option>
              </select>
            }
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>INSTRUMENT</th>
                  <th>MATURITY</th>
                  <th>TIME LEFT</th>
                  <th>RENEWAL TRACKING</th>
                  <th>ESCALATION</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.reference}>
                    <td>
                      <strong>{record.reference}</strong>
                      <small>{record.bank}</small>
                    </td>
                    <td>{record.maturityDate}</td>
                    <td>
                      <Tag
                        tone={
                          record.daysToMaturity < 0
                            ? 'red'
                            : record.daysToMaturity <= 30
                              ? 'gold'
                              : 'blue'
                        }
                      >
                        {record.daysToMaturity < 0
                          ? `${-record.daysToMaturity}d overdue`
                          : `${record.daysToMaturity} days`}
                      </Tag>
                    </td>
                    <td>{record.workflow}</td>
                    <td>
                      <span className={`escalation ${record.escalated ? 'escalated' : ''}`}>
                        <i />
                        {record.escalated ? 'Escalated' : 'Not escalated'}
                      </span>
                    </td>
                  </tr>
                ))}
                {visibleRecords.length === 0 && <tr><td className="no-results" colSpan={5}>No instruments in this category.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="settings-panel">
          <PanelHeading title="Reminder configuration" detail="Institution-level demo setting" />
          <div className="setting-row">
            <div>
              <strong>Maturity reminders</strong>
              <small>Generate sample reminders for upcoming dates</small>
            </div>
            <button
              className={`switch ${reminders ? 'switch-on' : ''}`}
              role="switch"
              aria-checked={reminders}
              onClick={() => setReminders(!reminders)}
              aria-label="Maturity reminders"
              disabled={!canManagePolicy}
            >
              <i />
            </button>
          </div>
          <div className="lead-setting">
            <label htmlFor="lead-time">
              <strong>First reminder</strong>
              <span>{lead} days before maturity</span>
            </label>
            <input
              type="range"
              min="7"
              max="90"
              value={lead}
              id="lead-time"
              disabled={!canManagePolicy}
              onChange={(e) => {
                setLead(Number(e.target.value));
                setSaved(false);
              }}
            />
            <div>
              <small>7 days</small>
              <small>90 days</small>
            </div>
          </div>
          <div className="escalation-setting">
            <span>↗</span>
            <div>
              <strong>Escalation status</strong>
              <small>Overdue sample is marked for admin attention.</small>
            </div>
          </div>
          {canManagePolicy ? <Button kind="secondary" onClick={() => setSaved(true)}>{saved ? 'Saved for demo ✓' : 'Save configuration'}</Button> : <small className="readonly-access-note">Institution administrator access is required to change reminder settings.</small>}
        </Panel>
      </div>
    </>
  );
}

function ReleaseRequests({ onDone, roles }: { onDone: (message: string) => void; roles: string[] }) {
  const releaseInstrument = fdrRecords.find((item) => item.reference === 'FDR-2024-220') ?? fdrRecords[2]!;
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState('');
  const [observation, setObservation] = useState('');
  const [completion, setCompletion] = useState('');
  const [status, setStatus] = useState('Under scrutiny');
  const [error, setError] = useState('');
  const rolePermissions = permissionsFor(roles);
  const canRequest = rolePermissions.has('release:request');
  const canReview = rolePermissions.has('release:review') || roles.includes('institution_admin');
  const canComplete = canRequest;
  const request = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || !file) {
      setError('Add a request reason and the required supporting document.');
      return;
    }
    setError('');
    setCreating(false);
    onDone('Release/refund request added to the synthetic demo queue.');
  };
  const decide = (next: string) => {
    if (!observation.trim()) {
      setError('Record scrutiny observations before making an authorization decision.');
      return;
    }
    setError('');
    setStatus(next);
    onDone(`Authorized review status updated to “${next}”. No money is marked as refunded.`);
  };
  const markComplete = () => {
    if (!completion.trim()) {
      setError('Enter a completion evidence reference before recording processing as complete.');
      return;
    }
    setError('');
    setStatus('Processing complete');
    onDone('Actual completion evidence recorded separately from administrative approval.');
  };
  return (
    <>
      <PageTitle
        overline="POST-MATURITY WORKFLOW"
        title="Release & refund requests"
        description="Create requests, review supporting evidence, and record processing completion separately."
        action={canRequest ? <Button onClick={() => setCreating(!creating)}>＋ &nbsp;New request</Button> : undefined}
      />
      {creating && (
        <Panel className="create-request">
          <PanelHeading
            title="Create release / refund request"
            detail="Provide the reason and required supporting document."
            action={
              <button onClick={() => setCreating(false)} aria-label="Close">
                ×
              </button>
            }
          />
          <form onSubmit={request}>
            <div className="fields-grid">
              <Field label="Instrument" required>
                  <select defaultValue={releaseInstrument.reference}>
                  {fdrRecords.map((r) => (
                    <option key={r.reference}>
                      {r.reference} · {r.bank}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Request type" required>
                <select>
                  <option>Release of security deposit</option>
                  <option>Refund of matured FDR</option>
                  <option>Partial release</option>
                </select>
              </Field>
              <Field label="Request reason" required>
                <textarea
                  rows={2}
                  placeholder="Explain why release or refund is requested"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Field label="Supporting document" required>
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')}
                />
            {file && <small>{file}</small>}
                <small>File selection is local to this prototype; no document is uploaded.</small>
              </Field>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="create-actions">
              <Button kind="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Submit request <Arrow />
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <div className="release-columns">
        <Panel className="release-record">
          <PanelHeading
            title="Request queue"
            detail="Institution release and refund requests"
            action={<Tag tone="gold">3 seeded</Tag>}
          />
          <div className="request-card">
            <div className="request-heading">
              <div>
                <small>REFUND REQUEST · RR-2026-004</small>
                <h2>{releaseInstrument.reference}</h2>
              </div>
              <Tag
                tone={
                  status === 'Processing complete'
                    ? 'green'
                    : status === 'Approved'
                      ? 'blue'
                      : 'gold'
                }
              >
                {status}
              </Tag>
            </div>
            <div className="request-meta">
              <div>
                <small>Institution</small>
                <strong>{institution.shortName}</strong>
              </div>
              <div>
                <small>Instrument amount</small>
                <strong>{releaseInstrument.amountLabel}</strong>
              </div>
              <div>
                <small>Requested</small>
                <strong>22 Oct 2026</strong>
              </div>
              <div>
                <small>Requestor</small>
                <strong>Manjeet Singh</strong>
              </div>
            </div>
            <div className="supporting-file">
              <span>▤</span>
              <div>
                <strong>Maturity_confirmation_sample.pdf</strong>
                <small>Supporting evidence · fictional sample</small>
              </div>
              <button onClick={() => onDone('Opened fictional request evidence.')}>
                View <Arrow />
              </button>
            </div>
            {canReview && <>
            <label className="field-label" htmlFor="release-observation">
              Scrutiny observations
            </label>
            <textarea
              id="release-observation"
              rows={2}
              placeholder="Record the evidence reviewed and decision rationale…"
              value={observation}
              onChange={(e) => {
                setObservation(e.target.value);
                setError('');
              }}
            />
            <div className="decision-buttons">
              <Button kind="secondary" onClick={() => decide('More information required')}>
                Request information
              </Button>
              <Button onClick={() => decide('Approved')}>Authorize release ✓</Button>
            </div>
            </>}
            <div className="decision-history">
              <strong>Decision history</strong>
              <div>
                <i className="timeline-done" />
                <span>
                  <b>Request submitted</b>
                  <small>22 Oct 2026 · Manjeet Singh</small>
                </span>
              </div>
              <div>
                <i className="timeline-current" />
                <span>
                  <b>{status}</b>
                  <small>
                    {status === 'Under scrutiny'
                      ? 'Awaiting authorized reviewer'
                      : '24 Oct 2026 · synthetic reviewer action'}
                  </small>
                </span>
              </div>
            </div>
          </div>
        </Panel>
        {canComplete && <Panel className="processing-panel">
          <span className="processing-mark">▣</span>
          <h2>Processing record</h2>
          <p>Record actual completion only when authorized evidence is available.</p>
          <div className="processing-status">
            <small>CURRENT RELEASE STATUS</small>
            <strong>
              {status === 'Processing complete'
                ? 'Completion evidence recorded'
                : status === 'Approved'
                  ? 'Approved · awaiting processing'
                  : 'Not yet approved'}
            </strong>
          </div>
          {status === 'Approved' && (
            <div className="completion-box">
              <Field label="Completion evidence reference" required>
                <input
                  placeholder="Receipt or bank advice reference"
                  value={completion}
                  onChange={(e) => setCompletion(e.target.value)}
                />
              </Field>
              <Button onClick={markComplete}>Record processing completion</Button>
            </div>
          )}
          <div className="approval-separation">
            <span>◇</span> Approval does not mark funds as refunded. Completion is a separate
            evidence-backed update.
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </Panel>}
      </div>
    </>
  );
}

function UserManagement({ institutionId }: { institutionId: string }) {
  const [users, setUsers] = useState<InstitutionUser[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InstitutionRole>('official_reviewer');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { roles: InstitutionRole[]; status: 'active' | 'suspended' }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const roleOptions: { value: InstitutionRole; label: string }[] = [
    { value: 'institution_admin', label: 'Institution administrator' },
    { value: 'institution_operator', label: 'Institution operator' },
    { value: 'official_reviewer', label: 'Official reviewer' },
    { value: 'auditor', label: 'Auditor' },
  ];
  const loadUsers = async () => {
    try {
      const list = await getInstitutionUsers(institutionId);
      setUsers(list);
      setDrafts(Object.fromEntries(list.map((user) => [user.id, { roles: user.roles, status: user.status }])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load accounts.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadUsers(); }, [institutionId]);
  const createUser = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setTemporaryPassword('');
    try {
      const created = await createInstitutionUser(institutionId, { email, displayName: name, role });
      setUsers((current) => [...current, created.user].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setDrafts((current) => ({ ...current, [created.user.id]: { roles: created.user.roles, status: created.user.status } }));
      setCreatedEmail(created.user.email); setTemporaryPassword(created.temporaryPassword); setEmail(''); setName('');
      setNotice('Account created. Copy the temporary password now; it will not be shown again.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this account.'); }
    finally { setBusy(false); }
  };
  const saveAccess = async (user: InstitutionUser) => {
    const access = drafts[user.id]; if (!access) return;
    setBusyUserId(user.id); setError(''); setNotice('');
    try {
      const updated = await updateInstitutionUserAccess(institutionId, user.id, access);
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      setDrafts((current) => ({ ...current, [user.id]: { roles: updated.roles, status: updated.status } }));
      setNotice(`Access updated for ${updated.displayName}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update account access.'); }
    finally { setBusyUserId(''); }
  };
  const changeDraft = (user: InstitutionUser, update: Partial<{ roles: InstitutionRole[]; status: 'active' | 'suspended' }>) => setDrafts((current) => ({ ...current, [user.id]: { ...(current[user.id] ?? { roles: user.roles, status: user.status }), ...update } }));
  return <>
    <PageTitle overline="ACCESS CONTROL" title="Users & roles" description="Create institution accounts and assign role-based access." />
    <Panel className="user-create-panel">
      <PanelHeading title="Create account" detail="Each new account gets its own one-time temporary password." />
      <form className="user-create-form" onSubmit={createUser}>
        <Field label="Full name" required><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></Field>
        <Field label="Email / sign-in ID" required><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></Field>
        <Field label="Role" required><select value={role} onChange={(event) => setRole(event.target.value as InstitutionRole)}>{roleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      </form>
      {temporaryPassword && <div className="temporary-credential" role="status"><strong>Temporary sign-in for {createdEmail}</strong><code>{temporaryPassword}</code><small>Copy this password and share it securely with the account owner.</small></div>}
      {notice && <div className="inline-message message-ok" role="status">{notice}</div>}
      {error && <div className="inline-message" role="alert">{error}</div>}
    </Panel>
    <Panel className="user-list-panel">
      <PanelHeading title="Institution accounts" detail="Role changes and account suspensions are audited." />
      {loading ? <div className="dashboard-state">Loading accounts…</div> : <div className="table-scroll"><table className="data-table user-access-table"><thead><tr><th>USER</th><th>ROLE ASSIGNMENTS</th><th>STATUS</th><th></th></tr></thead><tbody>{users.map((user) => {
        const draft = drafts[user.id] ?? { roles: user.roles, status: user.status };
        return <tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.email}</small><code>{user.id}</code></td><td><select multiple size={4} value={draft.roles} aria-label={`Roles for ${user.email}`} onChange={(event) => changeDraft(user, { roles: Array.from(event.target.selectedOptions, (option) => option.value as InstitutionRole) })}>{roleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td><td><select value={draft.status} aria-label={`Status for ${user.email}`} onChange={(event) => changeDraft(user, { status: event.target.value as 'active' | 'suspended' })}><option value="active">Active</option><option value="suspended">Suspended</option></select></td><td><Button kind="secondary" disabled={busyUserId === user.id} onClick={() => void saveAccess(user)}>{busyUserId === user.id ? 'Saving…' : 'Save access'}</Button></td></tr>;
      })}{users.length === 0 && <tr><td colSpan={4}>No accounts found.</td></tr>}</tbody></table></div>}
      <small className="user-password-note">Existing passwords cannot be read or displayed. Passwords for new accounts are shown once at creation.</small>
    </Panel>
  </>;
}

function AuditReports() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All activity');
  const filtered = useMemo(
    () =>
      auditEvents.filter(
        (event) =>
          (category === 'All activity' || category === event.category) &&
          `${event.title} ${event.detail} ${event.actor} ${event.reference}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, category],
  );
  const exportCsv = () => {
    const rows = [
      'When,Action,Record,Actor,Category',
      ...filtered.map(
        (e) => `"${e.when}","${e.title}","${e.reference}","${e.actor}","${e.category}"`,
      ),
    ];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'depositguard-demo-audit.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageTitle
        overline="ACCOUNTABILITY & INSIGHT"
        title="Audit & reports"
        description="Search the synthetic record of submissions, corrections, reviews, and workflow actions."
        action={
          <Button kind="secondary" onClick={exportCsv}>
            ↓ &nbsp;Export filtered CSV
          </Button>
        }
      />
      <Panel className="audit-panel">
        <div className="audit-toolbar">
          <div>
            <h2>Activity log</h2>
            <p>Search across action, record reference, and actor.</p>
          </div>
          <div className="audit-controls">
            <label className="search-box">
              <span>⌕</span>
              <input
                aria-label="Search audit history"
                placeholder="Search activity…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter activity category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {[
                'All activity',
                'Submission',
                'Correction',
                'Review',
                'Verification',
                'Renewal',
                'Release / refund',
                'Permission',
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table audit-table">
            <thead>
              <tr>
                <th>ACTIVITY</th>
                <th>RECORD</th>
                <th>ACTOR</th>
                <th>CATEGORY</th>
                <th>WHEN</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id}>
                  <td>
                    <div className="audit-action">
                      <i className={`activity-icon ${event.tone}`}>
                        {event.icon === 'shield'
                          ? '◇'
                          : event.icon === 'comment'
                            ? '↩'
                            : event.icon === 'refresh'
                              ? '↻'
                              : event.icon === 'plus'
                                ? '+'
                                : '▤'}
                      </i>
                      <span>
                        <strong>{event.title}</strong>
                        <small>{event.detail}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <code>{event.reference}</code>
                  </td>
                  <td>
                    <span className="audit-actor">
                      <i className="avatar avatar-tiny">{event.initials}</i>
                      {event.actor}
                    </span>
                  </td>
                  <td>
                    <Tag
                      tone={
                        event.category === 'Review'
                          ? 'lilac'
                          : event.category === 'Release / refund'
                            ? 'gold'
                            : event.category === 'Verification'
                              ? 'blue'
                              : 'neutral'
                      }
                    >
                      {event.category}
                    </Tag>
                  </td>
                  <td>{event.when}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="no-results" colSpan={5}>
                    No events match. Try another search or category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="audit-foot">
          <span>
            Showing {filtered.length} of {auditEvents.length} synthetic events
          </span>
          <span>◇ &nbsp;Backend audit persistence is not connected in this prototype</span>
        </div>
      </Panel>
    </>
  );
}
