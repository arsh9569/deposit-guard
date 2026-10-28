import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
  dotenv.config({ path: fileURLToPath(new URL('../../.env.development', import.meta.url)), override: true });
}

export function defaultTrustProxyHops(nodeEnv = process.env.NODE_ENV): number {
  return nodeEnv === 'production' ? 1 : 0;
}

export function defaultClientOrigin(nodeEnv = process.env.NODE_ENV): string {
  return nodeEnv === 'production'
    ? 'https://nidhikosh-app.vercel.app'
    : 'http://localhost:5173';
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default(defaultClientOrigin()),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must contain at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(defaultTrustProxyHops()),
  SMTP_USER: z.string().email().optional(),
  SMTP_APP_PASSWORD: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
