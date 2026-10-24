export interface FdrRecord {
  reference: string;
  bank: string;
  holder: string;
  amount: number;
  amountLabel: string;
  issueDate: string;
  maturityDate: string;
  daysToMaturity: number;
  workflow: string;
  escalated: boolean;
  scenario?: string;
  supersedes?: string;
  supersededBy?: string;
  verification?: 'simulated_match' | 'simulated_mismatch';
}

const dateFromToday = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const institution = {
  id: 'inst-demo-001',
  shortName: 'Northbridge Institute',
  name: 'Northbridge Institute of Technology',
};

export const fdrRecords: FdrRecord[] = [
  {
    reference: 'FDR-2026-018',
    bank: 'State Bank of India',
    holder: 'Northbridge Institute of Technology',
    amount: 2500000,
    amountLabel: '₹25,00,000',
    issueDate: '18 Oct 2025',
    maturityDate: dateFromToday(21),
    daysToMaturity: 21,
    workflow: 'Renewal requested',
    escalated: false,
    scenario: 'Submitted · awaiting official review · OCR amount mismatch',
  },
  {
    reference: 'FDR-2025-042',
    bank: 'HDFC Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 1800000,
    amountLabel: '₹18,00,000',
    issueDate: '12 Dec 2024',
    maturityDate: dateFromToday(46),
    daysToMaturity: 46,
    workflow: 'Replacement in progress',
    escalated: false,
    scenario: 'Replacement instrument · predecessor history retained',
    supersedes: 'FDR-2024-106',
  },
  {
    reference: 'FDR-2024-106',
    bank: 'Canara Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 3200000,
    amountLabel: '₹32,00,000',
    issueDate: '04 Sep 2023',
    maturityDate: dateFromToday(-12),
    daysToMaturity: -12,
    workflow: 'Matured · release request pending',
    escalated: true,
    scenario: 'Predecessor · release/refund awaiting authorization',
    supersededBy: 'FDR-2025-042',
  },
  {
    reference: 'FDR-2026-003',
    bank: 'ICICI Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 1250000,
    amountLabel: '₹12,50,000',
    issueDate: '02 Apr 2025',
    maturityDate: dateFromToday(12),
    daysToMaturity: 12,
    workflow: 'Active',
    escalated: false,
    scenario: 'Maturity reminder due soon',
  },
  {
    reference: 'FDR-2024-220',
    bank: 'Canara Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 1800000,
    amountLabel: '₹18,00,000',
    issueDate: '04 Sep 2024',
    maturityDate: dateFromToday(-5),
    daysToMaturity: -5,
    workflow: 'Release/refund awaiting authorization',
    escalated: true,
    scenario: 'Release/refund request under scrutiny',
  },
  {
    reference: 'FDR-2026-021',
    bank: 'Punjab National Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 900000,
    amountLabel: '₹9,00,000',
    issueDate: '20 Jun 2026',
    maturityDate: dateFromToday(180),
    daysToMaturity: 180,
    workflow: 'Simulated match',
    escalated: false,
    scenario: 'Deterministic mock match · not bank confirmed',
    verification: 'simulated_match',
  },
  {
    reference: 'FDR-2026-022',
    bank: 'Union Bank of India',
    holder: 'Northbridge Institute of Technology',
    amount: 1100000,
    amountLabel: '₹11,00,000',
    issueDate: '02 Jul 2026',
    maturityDate: dateFromToday(240),
    daysToMaturity: 240,
    workflow: 'Simulated mismatch',
    escalated: false,
    scenario: 'Deterministic mock mismatch · not bank confirmed',
    verification: 'simulated_mismatch',
  },
  {
    reference: 'FDR-2026-023',
    bank: 'Bank of Baroda',
    holder: 'Northbridge Institute of Technology',
    amount: 700000,
    amountLabel: '₹7,00,000',
    issueDate: '15 Jul 2026',
    maturityDate: dateFromToday(210),
    daysToMaturity: 210,
    workflow: 'Simulated not found',
    escalated: false,
    scenario: 'Deterministic mock · reference not found · not bank confirmed',
  },
  {
    reference: 'FDR-2026-024',
    bank: 'Indian Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 600000,
    amountLabel: '₹6,00,000',
    issueDate: '25 Jul 2026',
    maturityDate: dateFromToday(270),
    daysToMaturity: 270,
    workflow: 'Simulated unavailable',
    escalated: false,
    scenario: 'Deterministic mock · service unavailable · not bank confirmed',
  },
];

/** Stable walkthrough order and fixture values for the synthetic demonstration. */
export const demoWalkthrough = [
  { step: 1, screen: 'FDR register', reference: 'FDR-2026-018', outcome: 'Draft saved and submitted for official review' },
  { step: 2, screen: 'Document review', reference: 'FDR-2026-018', outcome: 'Pretested PDF extraction reads ₹24,50,000 against submitted ₹25,00,000' },
  { step: 3, screen: 'Official scrutiny', reference: 'FDR-2026-018', outcome: 'Correction request is recorded in the audit history' },
  { step: 4, screen: 'Verification', reference: 'FDR-2026-021 to FDR-2026-024', outcome: 'Deterministic simulated match, mismatch, not found, and unavailable outcomes; always Not Bank Confirmed' },
  { step: 5, screen: 'Maturity & actions', reference: 'FDR-2026-003 / FDR-2026-018', outcome: 'Upcoming reminder and replacement link to FDR-2024-106' },
  { step: 6, screen: 'Release / refund', reference: 'RR-2026-004 · FDR-2024-220', outcome: 'Scrutiny and authorization; completion remains separate' },
  { step: 7, screen: 'Overview, then Audit & reports', reference: 'Northbridge Institute', outcome: 'Live dashboard metrics plus searchable synthetic activity history' },
] as const;

export interface AuditEvent {
  id: string;
  title: string;
  detail: string;
  actor: string;
  initials: string;
  avatarColor: string;
  category: string;
  reference: string;
  when: string;
  tone: string;
  icon: string;
}

export const auditEvents: AuditEvent[] = [
  {
    id: 'a1',
    title: 'Review returned for correction',
    detail: 'OCR amount ₹24,50,000 differs from submitted ₹25,00,000; correction requested',
    actor: 'Priya Nair',
    initials: 'PN',
    avatarColor: 'rose',
    category: 'Review',
    reference: 'FDR-2026-018',
    when: 'Today, 2:42 PM',
    tone: 'amber',
    icon: 'comment',
  },
  {
    id: 'a8',
    title: 'Official requested correction',
    detail: 'Principal amount mismatch · original document and extraction retained',
    actor: 'Priya Nair',
    initials: 'PN',
    avatarColor: 'rose',
    category: 'Review',
    reference: 'FDR-2026-018',
    when: '24 Oct 2026, 2:42 PM',
    tone: 'amber',
    icon: 'comment',
  },
  {
    id: 'a2',
    title: 'Demo verification attempt completed',
    detail: 'Simulated response · no bank contacted',
    actor: 'Aarav Mehta',
    initials: 'AM',
    avatarColor: '',
    category: 'Verification',
    reference: 'FDR-2026-018',
    when: 'Today, 1:18 PM',
    tone: 'blue',
    icon: 'shield',
  },
  {
    id: 'a3',
    title: 'OCR correction saved',
    detail: 'Account holder field reviewed',
    actor: 'Aarav Mehta',
    initials: 'AM',
    avatarColor: '',
    category: 'Correction',
    reference: 'FDR-2025-042',
    when: 'Yesterday, 4:06 PM',
    tone: 'purple',
    icon: 'edit',
  },
  {
    id: 'a4',
    title: 'Release request submitted',
    detail: 'Maturity confirmation attached',
    actor: 'Aarav Mehta',
    initials: 'AM',
    avatarColor: '',
    category: 'Release / refund',
    reference: 'RR-2026-004',
    when: '22 Oct, 11:32 AM',
    tone: 'orange',
    icon: 'file',
  },
  {
    id: 'a5',
    title: 'Renewal initiated',
    detail: 'Replacement instrument evidence requested',
    actor: 'Aarav Mehta',
    initials: 'AM',
    avatarColor: '',
    category: 'Renewal',
    reference: 'FDR-2025-042',
    when: '21 Oct, 10:14 AM',
    tone: 'green',
    icon: 'refresh',
  },
  {
    id: 'a6',
    title: 'FDR submission created',
    detail: 'Supporting document queued for extraction',
    actor: 'Aarav Mehta',
    initials: 'AM',
    avatarColor: '',
    category: 'Submission',
    reference: 'FDR-2026-018',
    when: '20 Oct, 9:06 AM',
    tone: 'teal',
    icon: 'plus',
  },
  {
    id: 'a7',
    title: 'Reviewer assignment updated',
    detail: 'Official scrutiny queue assignment',
    actor: 'System admin',
    initials: 'SA',
    avatarColor: 'gold',
    category: 'Permission',
    reference: 'MEM-0008',
    when: '18 Oct, 3:26 PM',
    tone: 'neutral',
    icon: 'user',
  },
];
