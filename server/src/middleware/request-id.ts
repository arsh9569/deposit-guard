/* eslint-disable @typescript-eslint/no-namespace -- Express request augmentation uses declaration merging. */
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      authUser?: import('../auth/types.js').AuthUser;
      institutionScope?: {
        institutionId: string;
        roles: import('../models/domain.js').InstitutionRole[];
      };
    }
  }
}

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
};
