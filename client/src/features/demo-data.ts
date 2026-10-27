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
  shortName: 'Northbridge Demo Institute',
  name: 'Northbridge Synthetic Institute',
};

export const fdrRecords: FdrRecord[] = [
  {
    reference: 'FDR-2026-018',
    bank: 'Northstar Synthetic Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Willow Demo Bank',
    holder: 'Northbridge Synthetic Institute',
    amount: 3200000,
    amountLabel: '₹32,00,000',
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
    bank: 'Blue Meadow Synthetic Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Cedarline Demo Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Blue Meadow Synthetic Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Juniper Cooperative Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Brightwater Demo Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Silver Fern Synthetic Bank',
    holder: 'Northbridge Synthetic Institute',
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
    bank: 'Maple Harbor Demo Bank',
    holder: 'Northbridge Synthetic Institute',
    amount: 600000,
    amountLabel: '₹6,00,000',
    issueDate: '25 Jul 2026',
    maturityDate: dateFromToday(270),
    daysToMaturity: 270,
    workflow: 'Simulated unavailable',
    escalated: false,
    scenario: 'Deterministic mock · service unavailable · not bank confirmed',
  },
  { reference: 'FDR-DEMO-001', bank: 'Juniper Cooperative Bank', holder: institution.name, amount: 1450000, amountLabel: '₹14,50,000', issueDate: dateFromToday(-240), maturityDate: dateFromToday(310), daysToMaturity: 310, workflow: 'Active', escalated: false, scenario: 'Approved synthetic instrument' },
  { reference: 'FDR-DEMO-002', bank: 'Willow Demo Bank', holder: institution.name, amount: 2750000, amountLabel: '₹27,50,000', issueDate: dateFromToday(-85), maturityDate: dateFromToday(280), daysToMaturity: 280, workflow: 'Awaiting official review', escalated: false, scenario: 'Pending review' },
  { reference: 'FDR-DEMO-003', bank: 'Cedarline Demo Bank', holder: institution.name, amount: 980000, amountLabel: '₹9,80,000', issueDate: dateFromToday(-110), maturityDate: dateFromToday(75), daysToMaturity: 75, workflow: 'OCR discrepancy · review pending', escalated: false, scenario: 'Synthetic principal amount discrepancy' },
  { reference: 'FDR-DEMO-004', bank: 'Northstar Synthetic Bank', holder: institution.name, amount: 2125000, amountLabel: '₹21,25,000', issueDate: dateFromToday(-350), maturityDate: dateFromToday(7), daysToMaturity: 7, workflow: 'Maturity approaching', escalated: false, scenario: 'Upcoming maturity · 7 days' },
  { reference: 'FDR-DEMO-005', bank: 'Blue Meadow Synthetic Bank', holder: institution.name, amount: 1650000, amountLabel: '₹16,50,000', issueDate: dateFromToday(-540), maturityDate: dateFromToday(-3), daysToMaturity: -3, workflow: 'Expired · refund review pending', escalated: true, scenario: 'Expired instrument · pending refund' },
  { reference: 'FDR-DEMO-006', bank: 'Silver Fern Synthetic Bank', holder: institution.name, amount: 3200000, amountLabel: '₹32,00,000', issueDate: dateFromToday(-30), maturityDate: dateFromToday(335), daysToMaturity: 335, workflow: 'Replacement active', escalated: false, scenario: 'Replacement for FDR-DEMO-007', supersedes: 'FDR-DEMO-007' },
  { reference: 'FDR-DEMO-007', bank: 'Maple Harbor Demo Bank', holder: institution.name, amount: 3200000, amountLabel: '₹32,00,000', issueDate: dateFromToday(-500), maturityDate: dateFromToday(-20), daysToMaturity: -20, workflow: 'Replaced · historical record', escalated: false, scenario: 'Superseded predecessor', supersededBy: 'FDR-DEMO-006' },
  { reference: 'FDR-DEMO-008', bank: 'Brightwater Demo Bank', holder: institution.name, amount: 875000, amountLabel: '₹8,75,000', issueDate: dateFromToday(-95), maturityDate: dateFromToday(270), daysToMaturity: 270, workflow: 'Simulated match', escalated: false, scenario: 'Synthetic provider match · not bank confirmed', verification: 'simulated_match' },
  { reference: 'FDR-DEMO-009', bank: 'Juniper Cooperative Bank', holder: institution.name, amount: 1175000, amountLabel: '₹11,75,000', issueDate: dateFromToday(-70), maturityDate: dateFromToday(295), daysToMaturity: 295, workflow: 'Simulated mismatch', escalated: false, scenario: 'Synthetic provider mismatch · not bank confirmed', verification: 'simulated_mismatch' },
  { reference: 'FDR-DEMO-010', bank: 'Cedarline Demo Bank', holder: institution.name, amount: 4500000, amountLabel: '₹45,00,000', issueDate: dateFromToday(-160), maturityDate: dateFromToday(205), daysToMaturity: 205, workflow: 'Active', escalated: false, scenario: 'Approved synthetic instrument' },
  { reference: 'FDR-DEMO-011', bank: 'Willow Demo Bank', holder: institution.name, amount: 725000, amountLabel: '₹7,25,000', issueDate: dateFromToday(-95), maturityDate: dateFromToday(55), daysToMaturity: 55, workflow: 'Awaiting official review', escalated: false, scenario: 'Pending review' },
  { reference: 'FDR-DEMO-012', bank: 'Northstar Synthetic Bank', holder: institution.name, amount: 2350000, amountLabel: '₹23,50,000', issueDate: dateFromToday(-18), maturityDate: dateFromToday(347), daysToMaturity: 347, workflow: 'Renewed · replacement active', escalated: false, scenario: 'Renewal completed with replacement' },
  { reference: 'FDR-DEMO-013', bank: 'Silver Fern Synthetic Bank', holder: institution.name, amount: 1925000, amountLabel: '₹19,25,000', issueDate: dateFromToday(-620), maturityDate: dateFromToday(-45), daysToMaturity: -45, workflow: 'Expired · release request pending', escalated: true, scenario: 'Expired instrument · release request pending' },
  { reference: 'FDR-DEMO-014', bank: 'Blue Meadow Synthetic Bank', holder: institution.name, amount: 5600000, amountLabel: '₹56,00,000', issueDate: dateFromToday(-45), maturityDate: dateFromToday(685), daysToMaturity: 685, workflow: 'Active', escalated: false, scenario: 'Approved synthetic instrument' },
  { reference: 'FDR-DEMO-015', bank: 'Maple Harbor Demo Bank', holder: institution.name, amount: 1325000, amountLabel: '₹13,25,000', issueDate: dateFromToday(-330), maturityDate: dateFromToday(28), daysToMaturity: 28, workflow: 'Maturity approaching', escalated: false, scenario: 'Upcoming maturity · 28 days' },
];

/** Stable walkthrough order and fixture values for the synthetic demonstration. */
export const demoWalkthrough = [
  { step: 1, screen: 'FDR register', reference: 'FDR-2026-018', outcome: 'Draft saved and submitted for official review' },
  { step: 2, screen: 'Document review', reference: 'FDR-2026-018', outcome: 'Pretested PDF extraction reads ₹24,50,000 against submitted ₹25,00,000' },
  { step: 3, screen: 'Official scrutiny', reference: 'FDR-2026-018', outcome: 'Correction request is recorded in the audit history' },
  { step: 4, screen: 'Verification', reference: 'FDR-2026-021 to FDR-2026-024', outcome: 'Deterministic simulated match, mismatch, not found, and unavailable outcomes; always Not Bank Confirmed' },
  { step: 5, screen: 'Maturity & actions', reference: 'FDR-2026-003 / FDR-2026-018', outcome: 'Upcoming reminder and replacement link to FDR-2024-106' },
  { step: 6, screen: 'Release / refund', reference: 'RR-2026-004 · FDR-2024-220', outcome: 'Scrutiny and authorization; completion remains separate' },
  { step: 7, screen: 'Overview, then Audit & reports', reference: 'Northbridge Demo Institute', outcome: 'Live dashboard metrics plus searchable synthetic activity history · 24 synthetic FDR records' },
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
    actor: 'Demo Official Reviewer',
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
    actor: 'Demo Official Reviewer',
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
    actor: 'Manjeet Singh',
    initials: 'MS',
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
    actor: 'Manjeet Singh',
    initials: 'MS',
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
    actor: 'Manjeet Singh',
    initials: 'MS',
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
    actor: 'Manjeet Singh',
    initials: 'MS',
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
    actor: 'Manjeet Singh',
    initials: 'MS',
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
