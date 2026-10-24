import type { VerificationAttemptStatus, VerificationMode } from '../models/domain.js';

export interface VerificationInstrumentInput {
  reference: string;
  bankName: string;
  principalAmount: string;
  holderName: string;
}

export interface VerificationProviderResult {
  status: Extract<VerificationAttemptStatus, 'match' | 'mismatch' | 'not_found' | 'unavailable'>;
  responseSummary: string;
  failureCode?: string;
}

export interface VerificationProvider {
  readonly identity: string;
  readonly mode: VerificationMode;
  verify(instrument: VerificationInstrumentInput): Promise<VerificationProviderResult>;
}

const fixtureOutcomes: Record<string, VerificationProviderResult> = {
  'FDR-2026-021': { status: 'match', responseSummary: 'Synthetic fixture fields matched. Not bank confirmed.' },
  'FDR-2026-022': { status: 'mismatch', responseSummary: 'Synthetic fixture amount differed. Not bank confirmed.' },
  'FDR-2026-023': { status: 'not_found', responseSummary: 'No record in the deterministic fixture set. Not bank confirmed.' },
  'FDR-2026-024': { status: 'unavailable', responseSummary: 'Deterministic fixture represents an unavailable service. No bank was contacted.', failureCode: 'simulated_unavailable' },
};

export const deterministicMockVerificationProvider: VerificationProvider = {
  identity: 'depositguard-deterministic-mock',
  mode: 'simulated',
  async verify(instrument) {
    return fixtureOutcomes[instrument.reference] ?? {
      status: 'not_found',
      responseSummary: 'No record in the deterministic fixture set. Not bank confirmed.',
    };
  },
};

export function verificationDisplayLabel(mode: VerificationMode, status: VerificationAttemptStatus) {
  if (mode === 'simulated') {
    const outcome = status === 'not_found' ? 'Reference not found' : status;
    return `SIMULATED · ${outcome.toUpperCase().replaceAll('_', ' ')} · NOT BANK CONFIRMED`;
  }
  return `LIVE PROVIDER RESULT · ${status.toUpperCase().replaceAll('_', ' ')}`;
}
