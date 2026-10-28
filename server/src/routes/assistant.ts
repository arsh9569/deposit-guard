import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuthentication } from '../middleware/authentication.js';

const chatSchema = z.strictObject({
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(3000),
      }),
    )
    .min(1)
    .max(16),
  currentScreen: z.string().trim().min(1).max(64),
});

export function createAssistantRouter(config = env, fetchProvider: typeof fetch = fetch) {
  const assistantRouter = Router();
  assistantRouter.use(requireAuthentication);
  assistantRouter.post(
    '/chat',
    rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    async (req, res) => {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({
            error: 'Send up to 16 chat messages, with no message longer than 3000 characters.',
          });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      if (!config.OPENAI_API_KEY) {
        console.warn(
          JSON.stringify({ event: 'assistant_not_configured', requestId: req.requestId }),
        );
        res
          .status(503)
          .json({
            error: 'The AI assistant is not configured. Please contact your administrator.',
          });
        return;
      }

      const isGroq =
        config.OPENAI_API_KEY.startsWith('gsk_') || config.OPENAI_BASE_URL?.includes('groq.com');
      const baseUrl =
        config.OPENAI_BASE_URL ||
        (isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1');
      const model =
        isGroq && config.OPENAI_MODEL === 'gpt-4o-mini' ? 'qwen/qwen3.8-27b' : config.OPENAI_MODEL;

      const systemPrompt = `You are NidhiKosh Assistant, a friendly, practical guide for this FDR and security-deposit workflow application. The user is currently on the ${parsed.data.currentScreen} screen. Answer conversationally and give useful, direct steps tailored to this app. Explain registration, OCR/document review, scrutiny, verification, maturity, renewals, release/refund, notifications, and audit screens. You do not have access to live records unless the user includes details in the chat, and you cannot perform actions in the app. Never claim to have saved, uploaded, approved, verified, sent, or changed anything. Do not invent laws, regulatory requirements, account data, or bank responses. For legal, regulatory, or financial decisions, explain limits and direct the user to their authorized institution or official source. Keep answers concise and ask one focused follow-up when needed.`;

      try {
        const chatResponse = await fetchProvider(
          `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.OPENAI_API_KEY}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                ...parsed.data.messages.map(({ role, content }) => ({ role, content })),
              ],
              max_tokens: 900,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(30_000),
          },
        );

        if (chatResponse.ok) {
          const payload = (await chatResponse.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const answer = payload.choices?.[0]?.message?.content?.trim();
          if (answer) {
            res.setHeader('Cache-Control', 'no-store');
            res.json({ answer });
            return;
          }
        }

        // Do not retry provider authentication, quota, or model errors against an
        // unrelated API. OpenAI-compatible providers may not implement /responses.
        console.warn(
          JSON.stringify({
            event: 'assistant_provider_failed',
            requestId: req.requestId,
            status: chatResponse.status,
            reason: chatResponse.ok ? 'empty_reply' : 'upstream_rejected',
          }),
        );
        res
          .status(chatResponse.status === 429 || chatResponse.status >= 500 ? 503 : 502)
          .json({ error: 'The AI assistant could not answer right now. Please try again later.' });
      } catch {
        console.warn(
          JSON.stringify({
            event: 'assistant_provider_failed',
            requestId: req.requestId,
            reason: 'connection_or_response_failure',
          }),
        );
        res
          .status(503)
          .json({ error: 'The AI assistant could not connect right now. Please try again.' });
      }
    },
  );

  return assistantRouter;
}

export const assistantRouter = createAssistantRouter();
