import type { RequestHandler } from 'express';
import { userRepository } from '../auth/repository.js';
import type { AuthRepository } from '../auth/types.js';

export function createAuthenticationMiddleware(repository: AuthRepository): RequestHandler {
  return async (request, response, next) => {
    const userId = request.session.userId;
    if (!userId) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const user = await repository.findById(userId);
      if (!user || user.status !== 'active') {
        request.session.destroy(() => undefined);
        response.status(401).json({ error: 'Authentication required' });
        return;
      }
      request.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAuthentication = createAuthenticationMiddleware(userRepository);
