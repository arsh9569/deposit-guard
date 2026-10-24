import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { auditEvents, fdrRecords, institution, type AuditEvent } from '../features/demo-data';

type Screen =
  'dashboard' | 'register' | 'ocr' | 'review' | 'verification' | 'compliance' | 'release' | 'audit';
type NavItem = { id: Screen; label: string; glyph: string; capability: string };
const OCR_STORAGE_KEY = 'depositguard.demo.ocr-corrections';
const nav: NavItem[] = [
  { id: 'dashboard', label: 'Overview', glyph: '◫', capability: 'dashboard:read' },
  { id: 'register', label: 'FDR register', glyph: '▤', capability: 'instruments:create' },
  { id: 'ocr', label: 'Document review', glyph: '⌗', capability: 'documents:review' },
  { id: 'review', label: 'Official scrutiny', glyph: '✓', capability: 'reviews:decide' },
  { id: 'verification', label: 'Verification', glyph: '◇', capability: 'verification:read' },
  { id: 'compliance', label: 'Maturity & actions', glyph: '◷', capability: 'compliance:read' },
  { id: 'release', label: 'Release / refund', glyph: '↻', capability: 'release:request' },
  { id: 'audit', label: 'Audit & reports', glyph: '▣', capability: 'audit:read' },
];
const demoCredentials = { email: 'reviewer@depositguard.demo', password: 'DepositGuard!2026' };
// This capability set is a single synthetic identity fixture, not an authorization mechanism.
const demoSession = {
  name: 'Aarav Mehta',
  role: 'Demo institution reviewer',
  permissions: new Set(nav.map((item) => item.capability)),
};

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
  const [signedIn, setSignedIn] = useState(false);
  const [expired, setExpired] = useState(false);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const allowedNav = nav.filter((item) => demoSession.permissions.has(item.capability));
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setTimeout(
      () => {
        setSignedIn(false);
        setExpired(true);
      },
      15 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [signedIn]);
  if (!signedIn)
    return (
      <Login
        expired={expired}
        onLogin={() => {
          setSignedIn(true);
          setExpired(false);
          setScreen('dashboard');
        }}
      />
    );
  const go = (page: Screen) => {
    setScreen(page);
    setMobileOpen(false);
    setToast('');
  };
  const title = nav.find((item) => item.id === screen)?.label ?? 'Overview';
  return (
    <div className="portal">
      {mobileOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-shield">⌑</span>
          <span>
            <strong>depositguard</strong>
            <small>INSTITUTION PORTAL</small>
          </span>
          <button
            className="mobile-menu-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <button className="institution-select">
          <span className="institution-monogram">N</span>
          <span>
            <strong>{institution.shortName}</strong>
            <small>Institution workspace</small>
          </span>
          <b>⌄</b>
        </button>
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
          <span className="help-spark">✳</span>
          <strong>Need a hand?</strong>
          <p>Find tips for FDR workflows and common tasks.</p>
          <button onClick={() => setToast('The prototype guide is being prepared.')}>
            Open help center <Arrow />
          </button>
        </div>
        <button className="sidebar-user" onClick={() => setSignedIn(false)} title="Sign out">
          <span className="avatar">AM</span>
          <span>
            <strong>{demoSession.name}</strong>
            <small>{demoSession.role}</small>
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
            <span className="demo-chip">
              <i /> Synthetic demo
            </span>
            <button
              className="notification"
              onClick={() => setToast('You are all caught up on notifications.')}
              aria-label="Notifications"
            >
              ♧<i />
            </button>
            <span className="top-separator" />
            <button className="top-account" onClick={() => setSignedIn(false)}>
              <span className="avatar avatar-small">AM</span>
              <span>Aarav Mehta</span>
              <b>⌄</b>
            </button>
          </div>
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
          {screen === 'dashboard' && <Dashboard go={go} />}
          {screen === 'register' && (
            <Registration
              onDone={(message) => {
                setToast(message);
                setScreen('dashboard');
              }}
            />
          )}
          {screen === 'ocr' && <OcrReview onDone={setToast} />}
          {screen === 'review' && <ReviewConsole onDone={setToast} />}
          {screen === 'verification' && <Verification />}
          {screen === 'compliance' && <Compliance go={go} />}
          {screen === 'release' && <ReleaseRequests onDone={setToast} />}
          {screen === 'audit' && <AuditReports />}
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

function Login({ onLogin, expired }: { onLogin: () => void; expired: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    if (
      email.trim().toLowerCase() !== demoCredentials.email ||
      password !== demoCredentials.password
    ) {
      setBusy(false);
      setError(
        'We couldn’t sign you in with those details. Check your email and password, then try again.',
      );
      return;
    }
    onLogin();
  };
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-shield">⌑</span>
          <span>
            <strong>depositguard</strong>
            <small>INSTITUTION PORTAL</small>
          </span>
        </div>
        <div className="story-content">
          <div className="overline">
            AICTE PS 26265 <i /> SIH 2026
          </div>
          <h1>
            Good records.
            <br />
            <em>Clear decisions.</em>
          </h1>
          <p>One place to manage institutional FDRs, supporting documents, and review workflows.</p>
          <div className="story-points">
            <div>
              <span>◇</span>
              <div>
                <strong>Built around accountability</strong>
                <small>Evidence, decisions, and history stay connected.</small>
              </div>
            </div>
            <div>
              <span>◷</span>
              <div>
                <strong>Stay ahead of key dates</strong>
                <small>See upcoming maturities and actions in one view.</small>
              </div>
            </div>
          </div>
        </div>
        <div className="login-footnote">
          DEPOSITGUARD AI <i /> INTERACTION PROTOTYPE
        </div>
      </section>
      <section className="login-work">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mobile-brand">
            <span className="brand-shield">⌑</span>
            <strong>depositguard</strong>
          </div>
          <div className="form-kicker">SECURE PORTAL ACCESS</div>
          <h2>Welcome back</h2>
          <p className="subdued">Sign in to your institution workspace.</p>
          {expired && (
            <div className="alert alert-warn" role="alert">
              Your demo session expired. Sign in again to continue.
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="you@institution.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="password-label">
            <label htmlFor="login-password">Password</label>
            <button
              type="button"
              onClick={() =>
                setError('Use the synthetic demo credentials below for this prototype.')
              }
            >
              Forgot password?
            </button>
          </div>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="button button-primary login-submit" type="submit" disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? (
              'Signing in securely…'
            ) : (
              <>
                Sign in <Arrow />
              </>
            )}
          </button>
          <div className="demo-credentials">
            <div>
              <i />
              Prototype access
            </div>
            <p>Use this synthetic reviewer identity to explore the screens.</p>
            <code>{demoCredentials.email}</code>
            <code>{demoCredentials.password}</code>
            <button
              type="button"
              onClick={() => {
                setEmail(demoCredentials.email);
                setPassword(demoCredentials.password);
              }}
            >
              Fill demo credentials
            </button>
          </div>
          <div className="login-note">
            <span>◇</span> The server determines real roles. This prototype uses a fixed demo
            identity.
          </div>
        </form>
        <div className="login-copyright">
          © 2026 DepositGuard AI <i /> Prototype data is fictional
        </div>
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

function Dashboard({ go }: { go: (page: Screen) => void }) {
  const metrics = [
    {
      title: 'Total FDRs',
      value: '04',
      note: 'Across this institution',
      symbol: '▤',
      color: 'mint',
      page: 'compliance' as Screen,
    },
    {
      title: 'Pending review',
      value: '02',
      note: 'Awaiting official scrutiny',
      symbol: '⌗',
      color: 'gold',
      page: 'review' as Screen,
    },
    {
      title: 'Expiring in 30 days',
      value: '01',
      note: `Next maturity · ${fdrRecords[0].daysToMaturity} days`,
      symbol: '◷',
      color: 'peach',
      page: 'compliance' as Screen,
    },
    {
      title: 'Matured instruments',
      value: '01',
      note: 'Action needs to be recorded',
      symbol: '◷',
      color: 'lilac',
      page: 'compliance' as Screen,
    },
  ];
  return (
    <>
      <PageTitle
        overline="SATURDAY, OCTOBER 24, 2026"
        title="Good afternoon, Aarav"
        description="Here’s the latest on your institution’s deposits and actions."
        action={<Button onClick={() => go('register')}>＋ &nbsp;Register an FDR</Button>}
      />
      <div className="demo-banner">
        <span>i</span>
        <div>
          <strong>Demo workspace</strong>
          <p>All institutions, records, people, and activity here are fictional sample data.</p>
        </div>
        <button onClick={() => go('audit')} aria-label="View sample data details">
          ↗
        </button>
      </div>
      <div className="metrics-grid">
        {metrics.map((item) => (
          <button key={item.title} className="metric-card" onClick={() => go(item.page)}>
            <div>
              <span>{item.title}</span>
              <i className={`metric-symbol ${item.color}`}>{item.symbol}</i>
            </div>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>
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
              <b>02</b>
              <span>renewal actions pending</span>
            </div>
            <i />
            <div>
              <b>01</b>
              <span>release / refund request</span>
            </div>
          </div>
          <div className="queue-list">
            {fdrRecords
              .filter((r) => r.daysToMaturity < 0 || r.daysToMaturity <= 46)
              .map((record) => (
                <div className="queue-item" key={record.reference}>
                  <div className={`days-box ${record.daysToMaturity < 0 ? 'days-overdue' : ''}`}>
                    <b>{Math.abs(record.daysToMaturity)}</b>
                    <small>{record.daysToMaturity < 0 ? 'DAYS LATE' : 'DAYS LEFT'}</small>
                  </div>
                  <div className="queue-info">
                    <strong>{record.reference}</strong>
                    <span>
                      {record.bank} · {record.amountLabel}
                    </span>
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
          <ActivityList events={auditEvents.slice(0, 4)} />
        </Panel>
      </div>
      <div className="shortcut-grid">
        <div>
          <SectionTag>QUICK ACTIONS</SectionTag>
        </div>
        <button onClick={() => go('register')}>
          <i className="shortcut-icon mint">＋</i>
          <span>
            <strong>Register an FDR</strong>
            <small>Add a deposit instrument</small>
          </span>
          <Arrow />
        </button>
        <button onClick={() => go('ocr')}>
          <i className="shortcut-icon lilac">⌗</i>
          <span>
            <strong>Review document extraction</strong>
            <small>2 documents ready for review</small>
          </span>
          <Arrow />
        </button>
        <button onClick={() => go('release')}>
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

function ActivityList({ events, compact = false }: { events: AuditEvent[]; compact?: boolean }) {
  return (
    <div className={`activity-list ${compact ? 'activity-compact' : ''}`}>
      {events.map((event) => (
        <div className="activity-row" key={event.id}>
          <span className={`activity-icon ${event.tone}`}>
            {event.icon === 'shield'
              ? '◇'
              : event.icon === 'comment'
                ? '↩'
                : event.icon === 'refresh'
                  ? '↻'
                  : event.icon === 'plus'
                    ? '+'
                    : event.icon === 'edit'
                      ? '✎'
                      : '▤'}
          </span>
          <span className="activity-description">
            <strong>{event.title}</strong>
            <small>{event.detail}</small>
          </span>
          <span className="activity-time">{event.when}</span>
        </div>
      ))}
    </div>
  );
}

function Registration({ onDone }: { onDone: (message: string) => void }) {
  const [file, setFile] = useState('');
  const [draft, setDraft] = useState(false);
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setDraft(false);
    setMessage(
      file
        ? 'Ready to submit with supporting document.'
        : 'Please attach the supporting FDR document.',
    );
    if (file)
      window.setTimeout(() => onDone('FDR submission added to the synthetic review queue.'), 500);
  };
  const saveDraft = () => {
    setDraft(true);
    setMessage('Draft saved locally for this demo session.');
  };
  return (
    <>
      <PageTitle
        overline="INSTRUMENT MANAGEMENT"
        title="Register an FDR"
        description="Add deposit details and supporting evidence to your institution’s register."
        action={
          <button className="inline-link" onClick={() => onDone('Registration closed.')}>
            Cancel
          </button>
        }
      />
      {message && <div className={`inline-message ${draft ? 'message-ok' : ''}`}>{message}</div>}
      <form className="registration-grid" onSubmit={submit}>
        <div className="form-stack">
          <Panel>
            <PanelHeading
              title="Institution & reference"
              detail="This instrument is attached to your institution."
            />
            <div className="fields-grid">
              <Field label="Institution" required>
                <select defaultValue={institution.id}>
                  <option value={institution.id}>{institution.name}</option>
                </select>
              </Field>
              <Field label="Internal reference" required>
                <input required placeholder="e.g. FIN-FDR-2026-014" />
              </Field>
            </div>
          </Panel>
          <Panel>
            <PanelHeading
              title="Bank & instrument details"
              detail="Enter details exactly as shown on the original FDR."
            />
            <div className="fields-grid">
              <Field label="Bank name" required>
                <input required placeholder="e.g. State Bank of India" />
              </Field>
              <Field label="Branch" required>
                <input required placeholder="Branch or location" />
              </Field>
              <Field label="FDR / instrument number" required>
                <input required placeholder="Enter instrument reference" />
              </Field>
              <Field label="Account holder" required>
                <input required placeholder="Institution account name" />
              </Field>
              <Field label="Deposit amount (₹)" required>
                <input type="number" required min="1" placeholder="e.g. 2500000" />
              </Field>
              <Field label="Currency">
                <select>
                  <option>INR · Indian Rupee</option>
                </select>
              </Field>
              <Field label="Issue date" required>
                <input type="date" required />
              </Field>
              <Field label="Maturity date" required>
                <input type="date" required />
              </Field>
              <Field label="Validity through">
                <input type="date" />
              </Field>
            </div>
            <small className="field-note">
              Reminder thresholds and date rules in this prototype are sample workflow values, not
              regulatory guidance.
            </small>
          </Panel>
          <Panel>
            <PanelHeading
              title="Supporting document"
              detail="Select a scan or PDF of the original FDR for this demo record."
            />
            <label className={`upload-well ${file ? 'upload-done' : ''}`}>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')}
              />
              <span>{file ? '✓' : '↥'}</span>
              <strong>{file || 'Drop your document here, or browse'}</strong>
              <small>PDF or image · selection stays in this browser · no file is uploaded</small>
            </label>
          </Panel>
        </div>
        <aside className="form-aside">
          <Panel>
            <span className="aside-emblem">◇</span>
            <h3>Before you submit</h3>
            <ul>
              <li>Check the instrument reference and deposit amount.</li>
              <li>Confirm dates against the original FDR.</li>
              <li>Attach a clear supporting document.</li>
            </ul>
            <div className="next-step">
              <i />
              <span>
                <strong>Next step</strong>
                <small>Document extraction and official scrutiny</small>
              </span>
            </div>
            <div className="form-buttons">
              <Button kind="secondary" onClick={saveDraft}>
                Save draft
              </Button>
              <Button type="submit">
                Submit for review <Arrow />
              </Button>
            </div>
          </Panel>
        </aside>
      </form>
    </>
  );
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
  return (
    <div className="field">
      <label>
        {label}
        {required && <i> *</i>}
      </label>
      {children}
    </div>
  );
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
  const extraction = { ...original, maturity: '12 Nov 2026' };
  const [values, setValues] = useState(() => {
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
  useEffect(() => {
    try {
      sessionStorage.setItem(
        OCR_STORAGE_KEY,
        JSON.stringify({ values, correctedFields: [...changed] }),
      );
    } catch {
      // Keep the correction layer in memory if session storage is unavailable.
    }
  }, [values, changed]);
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
    { key: 'amount', label: 'Deposit amount', value: '₹25,00,000', confidence: 94 },
    { key: 'issue', label: 'Issue date', value: original.issue, confidence: 91 },
    {
      key: 'maturity',
      label: 'Maturity date',
      value: '12 Nov 2026',
      confidence: 72,
      mismatch: true,
    },
  ];
  const change = (key: keyof typeof original, value: string) => {
    setValues({ ...values, [key]: value });
    setChanged(new Set(changed).add(key));
  };
  return (
    <>
      <PageTitle
        overline="DOCUMENT WORKSPACE · 01 OF 02"
        title="Review extracted details"
        description="Compare OCR observations with the submitted values. Corrections are saved separately from the original extraction."
        action={<Tag tone="blue">OCR complete</Tag>}
      />
      <div className="workspace-toolbar">
        <button className="inline-link" onClick={() => onDone('Returned to the document queue.')}>
          ← Back to queue
        </button>
        <span>
          FDR-2026-018 <i>·</i> Uploaded today at 10:42 AM
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
            <button aria-label="Download document">↓</button>
          </div>
          <div className="paper-wrap">
            <div className="fake-paper">
              <div className="paper-heading">
                <b className="paper-seal">SB</b>
                <span>
                  <strong>STATE BANK OF INDIA</strong>
                  <small>TERM DEPOSIT RECEIPT</small>
                </span>
                <small>CUSTOMER COPY</small>
              </div>
              <hr />
              <div className="paper-number">
                <span>Receipt no.</span>
                <b>{record.reference}</b>
              </div>
              <div className="paper-title">FIXED DEPOSIT RECEIPT</div>
              <div className="paper-details">
                <PaperLine label="Name of depositor" value={record.holder} />
                <PaperLine label="Principal amount" value={record.amountLabel} />
                <PaperLine label="Date of deposit" value={record.issueDate} />
                <PaperLine label="Date of maturity" value="12 Nov 2026" warning />
                <PaperLine label="Branch" value="Bengaluru Main Branch" />
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
            <Tag tone="green">Complete</Tag>
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
                  ? `${changed.size} correction${changed.size === 1 ? '' : 's'} recorded in this demo session. `
                  : ''}
                Original OCR values and confidence scores are retained separately.
              </small>
            </span>
          </div>
          <div className="ocr-actions">
            <Button
              kind="secondary"
              onClick={() =>
                onDone(
                  `${changed.size} correction${changed.size === 1 ? '' : 's'} saved in this demo session. Original OCR values are preserved.`,
                )
              }
            >
              Save corrections
            </Button>
            <Button onClick={() => onDone('Corrected values submitted for official scrutiny.')}>
              Save &amp; submit <Arrow />
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
                <span className="avatar avatar-tiny">AM</span> Submitted by Aarav Mehta <Arrow />
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
                <strong>Maturity date</strong>
                <span>Submitted: {record.maturityDate}</span>
                <b>Document: 12 Nov 2026</b>
                <Tag tone="gold">Mismatch</Tag>
              </section>
            </div>
            <div className="supporting-file">
              <span>▤</span>
              <div>
                <strong>FDR scan · customer-copy.pdf</strong>
                <small>PDF · uploaded by Aarav Mehta · OCR complete</small>
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

function Verification() {
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(1);
  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      setAttempts((n) => n + 1);
    }, 700);
  };
  return (
    <>
      <PageTitle
        overline="INSTRUMENT EVIDENCE"
        title="Verification record"
        description="Review provider responses separately from document extraction and official scrutiny."
        action={
          <Button kind="secondary" onClick={run} disabled={running}>
            {running ? 'Checking fixture…' : '↻ &nbsp;Run demo attempt'}
          </Button>
        }
      />
      <div className="simulation-warning">
        <div className="warning-mark">◇</div>
        <div>
          <strong>SIMULATED BANK RESPONSE — NOT BANK CONFIRMED</strong>
          <p>
            This is a deterministic demonstration response. No bank was contacted; the result is not
            evidence of bank verification.
          </p>
        </div>
        <Tag tone="blue">DEMO ONLY</Tag>
      </div>
      <div className="verification-grid">
        <Panel className="verification-record">
          <div className="verification-result">
            <span>◇</span>
            <div>
              <small>LATEST ATTEMPT · {String(attempts).padStart(2, '0')}</small>
              <h2>{running ? 'Running demo response…' : 'Simulated match'}</h2>
              <p>
                {running
                  ? 'Waiting for the deterministic local fixture.'
                  : 'The synthetic response matched the sample values for selected fields.'}
              </p>
            </div>
            <Tag tone="blue">SIMULATED</Tag>
          </div>
          <div className="verification-meta">
            {[
              ['Mode', 'Simulated adapter'],
              ['Provider', 'DepositGuard deterministic demo'],
              ['Attempt reference', `SIM-DG-2026-${String(attempts).padStart(4, '0')}`],
              ['Result', 'Sample fields matched'],
              ['Timestamp', '24 Oct 2026 · 03:17 PM IST'],
            ].map(([key, value]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="response-card">
            <div>
              <strong>Supporting response details</strong>
              <small>Fixture response · synthetic sample data</small>
            </div>
            <pre>
              {JSON.stringify(
                {
                  mode: 'SIMULATED',
                  provider: 'depositguard-demo-adapter',
                  attemptReference: `SIM-DG-2026-${String(attempts).padStart(4, '0')}`,
                  matchedFields: ['instrumentReference', 'principalAmount', 'holderName'],
                  message: 'Synthetic fixture only. No bank contact occurred.',
                },
                null,
                2,
              )}
            </pre>
          </div>
        </Panel>
        <div className="verification-aside">
          <Panel>
            <span className="side-emblem">▤</span>
            <small>INSTRUMENT</small>
            <h3>{fdrRecords[0].reference}</h3>
            <p>{fdrRecords[0].bank}</p>
            <strong>{fdrRecords[0].amountLabel}</strong>
          </Panel>
          <Panel>
            <PanelHeading title="Attempt history" detail="Each attempt is a separate record" />
            {Array.from({ length: attempts }, (_, index) => (
              <div className="attempt-row" key={index}>
                <span>◇</span>
                <div>
                  <strong>SIM-DG-2026-{String(attempts - index).padStart(4, '0')}</strong>
                  <small>Deterministic demo · 24 Oct 2026</small>
                </div>
                <Tag tone="blue">Simulated</Tag>
              </div>
            ))}
          </Panel>
          <div className="adapter-note">
            Provider adapters are replaceable. Live integration requires separate credentials,
            approval, and evidence rules.
          </div>
        </div>
      </div>
    </>
  );
}

function Compliance({ go }: { go: (page: Screen) => void }) {
  const [reminders, setReminders] = useState(true);
  const [lead, setLead] = useState(30);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageTitle
        overline="PORTFOLIO MONITORING"
        title="Maturity & compliance"
        description="Track instrument dates, overdue follow-up, and renewal or replacement progress."
        action={
          <Button kind="secondary" onClick={() => go('release')}>
            Open action queue <Arrow />
          </Button>
        }
      />
      <div className="policy-notice">
        <span>i</span>
        <div>
          <strong>Configurable demo policy</strong>
          <p>
            Reminder intervals and escalation labels are sample settings only. No regulatory
            threshold is assumed.
          </p>
        </div>
        <Tag tone="lilac">Rule set DEMO-01</Tag>
      </div>
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
              <select aria-label="Filter schedule">
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
                {fdrRecords.map((record) => (
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
          <Button kind="secondary" onClick={() => setSaved(true)}>
            {saved ? 'Saved for demo ✓' : 'Save configuration'}
          </Button>
        </Panel>
      </div>
    </>
  );
}

function ReleaseRequests({ onDone }: { onDone: (message: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState('');
  const [observation, setObservation] = useState('');
  const [completion, setCompletion] = useState('');
  const [status, setStatus] = useState('Under scrutiny');
  const [error, setError] = useState('');
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
        action={<Button onClick={() => setCreating(!creating)}>＋ &nbsp;New request</Button>}
      />
      <div className="release-notice">
        <span>i</span>
        <p>
          <strong>Approval is not a refund.</strong> Administrative approval authorizes the next
          step only. Actual processing needs separate evidence or an authorized status update.
        </p>
      </div>
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
                <select defaultValue={fdrRecords[2].reference}>
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
            action={<Tag tone="gold">1 active</Tag>}
          />
          <div className="request-card">
            <div className="request-heading">
              <div>
                <small>REFUND REQUEST · RR-2026-004</small>
                <h2>{fdrRecords[2].reference}</h2>
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
                <strong>{fdrRecords[2].amountLabel}</strong>
              </div>
              <div>
                <small>Requested</small>
                <strong>22 Oct 2026</strong>
              </div>
              <div>
                <small>Requestor</small>
                <strong>Aarav Mehta</strong>
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
            <div className="decision-history">
              <strong>Decision history</strong>
              <div>
                <i className="timeline-done" />
                <span>
                  <b>Request submitted</b>
                  <small>22 Oct 2026 · Aarav Mehta</small>
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
        <Panel className="processing-panel">
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
        </Panel>
      </div>
    </>
  );
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
      <div className="audit-highlights">
        <div>
          <b>▣</b>
          <strong>{auditEvents.length}</strong>
          <small>Recorded demo events</small>
        </div>
        <div>
          <b>◇</b>
          <strong>Append-only</strong>
          <small>Illustrative event history</small>
        </div>
        <div>
          <b>◷</b>
          <strong>24 Oct 2026</strong>
          <small>Latest sample event</small>
        </div>
      </div>
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
              <kbd>⌘ K</kbd>
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
