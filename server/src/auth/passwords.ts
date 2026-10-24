import { randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';

// A baseline application policy pending product/security review; not an AICTE rule.
export const newPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password exceeds bcrypt input limit');
const dummyHash = hash(randomBytes(32).toString('hex'), 12);

export async function hashPassword(plainText: string): Promise<string> {
  const password = newPasswordSchema.parse(plainText);
  return hash(password, 12);
}

export async function verifyPassword(plainText: string, encodedHash?: string): Promise<boolean> {
  return encodedHash
    ? compare(plainText, encodedHash)
    : compare(plainText, await dummyHash).then(() => false);
}
