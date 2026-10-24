import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfTokenHandler: RequestHandler = (request, response) => {
  request.session.csrfToken ??= randomBytes(32).toString('base64url');
  response.setHeader('Cache-Control', 'no-store');
  response.json({ csrfToken: request.session.csrfToken });
};

export const csrfProtection: RequestHandler = (request, response, next) => {
  if (safeMethods.has(request.method)) {
    next();
    return;
  }
  const expected = request.session.csrfToken;
  const supplied = request.get('x-csrf-token');
  if (!expected || !supplied) {
    response.status(403).json({ error: 'CSRF validation failed' });
    return;
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    response.status(403).json({ error: 'CSRF validation failed' });
    return;
  }
  next();
};
