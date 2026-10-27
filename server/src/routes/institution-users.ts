import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Types, type Model } from 'mongoose';
import { auditWriter } from '../auth/audit-writer.js';
import type { AuditWriter } from '../auth/types.js';
import { hashPassword } from '../auth/passwords.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireInstitutionPermission } from '../middleware/authorization.js';
import { UserModel, type UserRecord } from '../models/users.js';
import { institutionRoles, type InstitutionRole } from '../models/domain.js';
import { z } from 'zod';

const users = UserModel as Model<UserRecord>;
const createSchema = z.strictObject({ email: z.string().trim().email().max(254), displayName: z.string().trim().min(2).max(160), role: z.enum(institutionRoles) });
const accessSchema = z.strictObject({ roles: z.array(z.enum(institutionRoles)).min(1).max(institutionRoles.length), status: z.enum(['active', 'suspended']) });

export function createInstitutionUsersRouter(audit: AuditWriter = auditWriter) {
  const router = Router({ mergeParams: true });
  router.use(requireAuthentication);
  router.use(requireInstitutionPermission('users:manage'));
  const institutionId = (req: import('express').Request) => new Types.ObjectId(req.institutionScope!.institutionId);
  const auditChange = async (req: import('express').Request, targetId: string, before: Record<string, unknown>, after: Record<string, unknown>, action: string) => {
    await audit.write({ action, institutionId: req.institutionScope!.institutionId, actorId: String(req.authUser!._id), actorRoleSnapshot: req.institutionScope!.roles, requestId: req.requestId, targetType: 'user', targetId, reason: 'Institution administrator changed user access', metadataRedacted: { before, after } });
  };
  const findInstitutionUser = (userId: string, tenant: Types.ObjectId) => users.findOne({ _id: userId, memberships: { $elemMatch: { institutionId: tenant, active: true } } }).select('_id email displayName status memberships');

  router.get('/', async (req, res, next) => {
    try {
      const items = await users.find({ memberships: { $elemMatch: { institutionId: institutionId(req), active: true } } }).select('_id email displayName status memberships').sort({ displayName: 1 }).lean().exec();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ users: items.map((user) => {
        const membership = user.memberships.find((entry) => String(entry.institutionId) === req.institutionScope!.institutionId && entry.active)!;
        return { id: String(user._id), email: user.email, displayName: user.displayName, status: user.status, roles: membership.roles };
      }) });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Provide a valid email, display name and role.' }); return; }
    const temporaryPassword = randomBytes(24).toString('base64url');
    try {
      const user = await users.create({
        authSubject: `local:${randomUUID()}`,
        email: parsed.data.email.toLowerCase(),
        displayName: parsed.data.displayName,
        passwordHash: await hashPassword(temporaryPassword),
        status: 'active',
        memberships: [{ institutionId: institutionId(req), roles: [parsed.data.role], active: true }],
      });
      await auditChange(req, String(user._id), {}, { roles: [parsed.data.role], status: 'active' }, 'authorization.user.created');
      res.status(201).setHeader('Cache-Control', 'no-store').json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, status: user.status, roles: [parsed.data.role] }, temporaryPassword });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'An account with that email already exists.' }); return; }
      next(error);
    }
  });

  router.patch('/:userId/access', async (req, res, next) => {
    if (!Types.ObjectId.isValid(req.params.userId)) { res.status(404).json({ error: 'User not found.' }); return; }
    const parsed = accessSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Choose at least one role and a valid account status.' }); return; }
    try {
      const tenant = institutionId(req);
      const user = await findInstitutionUser(req.params.userId, tenant);
      if (!user) { res.status(404).json({ error: 'User not found in this institution.' }); return; }
      const membership = user.memberships.find((entry) => String(entry.institutionId) === String(tenant) && entry.active);
      if (!membership) { res.status(404).json({ error: 'User not found in this institution.' }); return; }
      const keepsAdmin = parsed.data.status === 'active' && parsed.data.roles.includes('institution_admin');
      if (membership.roles.includes('institution_admin') && !keepsAdmin) {
        const otherAdmins = await users.countDocuments({ _id: { $ne: user._id }, status: 'active', memberships: { $elemMatch: { institutionId: tenant, active: true, roles: 'institution_admin' } } });
        if (!otherAdmins) { res.status(409).json({ error: 'The institution must keep at least one active administrator.' }); return; }
      }
      const before = { roles: [...membership.roles], status: user.status };
      membership.roles = [...new Set(parsed.data.roles)] as InstitutionRole[];
      user.status = parsed.data.status;
      await user.save();
      const after = { roles: membership.roles, status: user.status };
      await auditChange(req, String(user._id), before, after, 'authorization.user.access_updated');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, status: user.status, roles: membership.roles } });
    } catch (error) { next(error); }
  });
  return router;
}
