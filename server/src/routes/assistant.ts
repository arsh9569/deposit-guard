import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuthentication } from '../middleware/authentication.js';

const chatSchema = z.strictObject({
  messages: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(3000) })).min(1).max(16),
  currentScreen: z.enum(['dashboard', 'register', 'ocr', 'review', 'verification', 'compliance', 'release', 'audit']),
});

export const assistantRouter = Router();
assistantRouter.use(requireAuthentication);
assistantRouter.post('/chat', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Send up to 16 chat messages, with no message longer than 3000 characters.' });
    return;
  }
  if (!env.OPENAI_API_KEY) {
    res.status(503).json({ error: 'The AI assistant is not configured. Add OPENAI_API_KEY to the server environment and restart the server.' });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        store: false,
        max_output_tokens: 900,
        instructions: `You are DepositGuard Assistant, a friendly, practical guide for this FDR and security-deposit workflow application. The user is currently on the ${parsed.data.currentScreen} screen. Answer conversationally and give useful, direct steps tailored to this app. Explain registration, OCR/document review, scrutiny, verification, maturity, renewals, release/refund, notifications, and audit screens. You do not have access to live records unless the user includes details in the chat, and you cannot perform actions in the app. Never claim to have saved, uploaded, approved, verified, sent, or changed anything. Do not invent laws, regulatory requirements, account data, or bank responses. For legal, regulatory, or financial decisions, explain limits and direct the user to their authorized institution or official source. Keep answers concise and ask one focused follow-up when needed.`,
        input: parsed.data.messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as {
      error?: { message?: string };
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    };
    if (!response.ok) {
      res.status(502).json({ error: 'The AI assistant could not answer right now. Please try again.' });
      return;
    }
    const answer = payload.output?.flatMap((item) => item.type === 'message' ? item.content?.filter((part) => part.type === 'output_text').map((part) => part.text ?? '') ?? [] : []).join('\n').trim();
    if (!answer) {
      res.status(502).json({ error: 'The AI assistant returned an empty reply. Please try again.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ answer });
  } catch {
    res.status(502).json({ error: 'The AI assistant could not connect right now. Please try again.' });
  }
});
