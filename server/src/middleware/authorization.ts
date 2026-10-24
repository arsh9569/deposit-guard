import type { RequestHandler } from 'express';
import type { InstitutionRole } from '../models/domain.js';
import { auditWriter } from '../auth/audit-writer.js';
import type { AuditWriter } from '../auth/types.js';

/** Institution ID is only a requested scope selector. Access is granted after server-side membership lookup. */
export function requireInstitutionRole(
  allowedRoles: readonly InstitutionRole[],
  writer: AuditWriter = auditWriter,
): RequestHandler {
  return async (request, response, next) => {
    const user = request.authUser;
    const parameter = request.params.institutionId;
    const requestedInstitutionId = Array.isArray(parameter) ? parameter[0] : parameter;
    if (!user || !requestedInstitutionId) {
      response.status(404).json({ error: 'Institution not found' });
      return;
    }
    const membership = user.memberships.find(
      (item) => item.active && String(item.institutionId) === requestedInstitutionId,
    );
    try {
      if (!membership) {
        await writer.write({
          action: 'authorization.denied.institution_scope',
          actorId: String(user._id),
          requestId: request.requestId,
          metadataRedacted: { route: request.path },
        });
        response.status(404).json({ error: 'Institution not found' });
        return;
      }
      const roles = membership.roles;
      if (!roles.some((role) => allowedRoles.includes(role))) {
        await writer.write({
          action: 'authorization.denied.role',
          actorId: String(user._id),
          institutionId: requestedInstitutionId,
          requestId: request.requestId,
          metadataRedacted: { requiredRoles: allowedRoles, route: request.path },
        });
        response.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      request.institutionScope = { institutionId: requestedInstitutionId, roles };
      next();
    } catch (error) {
      next(error);
    }
  };
}
