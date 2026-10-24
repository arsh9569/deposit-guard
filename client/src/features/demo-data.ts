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
    workflow: 'Release request pending',
    escalated: true,
  },
  {
    reference: 'FDR-2026-003',
    bank: 'ICICI Bank',
    holder: 'Northbridge Institute of Technology',
    amount: 1250000,
    amountLabel: '₹12,50,000',
    issueDate: '02 Apr 2025',
    maturityDate: dateFromToday(210),
    daysToMaturity: 210,
    workflow: 'Active',
    escalated: false,
  },
];

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
    detail: 'Maturity date needs supporting evidence',
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
