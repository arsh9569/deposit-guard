import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();

export const profileSchema = z
  .object({ displayName: z.string().trim().min(2).max(80) })
  .strict();

export const demoSecurityActionSchema = z
  .object({ action: z.literal('approve'), reason: z.string().trim().min(1).max(1000) })
  .strict();
