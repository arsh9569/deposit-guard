import { createHash } from 'node:crypto';

export interface ReleaseRequestFingerprintInput {
  instrumentId: string;
  requestType: string;
  reason: string;
  supportingDocumentIds: readonly string[];
}

export function isValidIdempotencyKey(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9._:-]{16,128}$/.test(value));
}

export function releaseRequestFingerprint(input: ReleaseRequestFingerprintInput) {
  const canonical = JSON.stringify({
    instrumentId: input.instrumentId,
    requestType: input.requestType,
    reason: input.reason.trim(),
    supportingDocumentIds: [...input.supportingDocumentIds].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function idempotentReleaseReplay(existingFingerprint: string | undefined, requestFingerprint: string) {
  if (!existingFingerprint) return 'conflict' as const;
  return existingFingerprint === requestFingerprint ? 'replay' as const : 'conflict' as const;
}
