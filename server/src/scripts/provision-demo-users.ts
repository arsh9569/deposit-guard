import { randomBytes, randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword } from '../auth/passwords.js';
import { auditWriter } from '../auth/audit-writer.js';
import { InstitutionModel, UserModel } from '../models/index.js';
import type { UserRecord } from '../models/users.js';
import type { InstitutionRole } from '../models/domain.js';

if (env.NODE_ENV === 'production') throw new Error('Demo account provisioning is disabled in production.');
const institutionId = new Types.ObjectId('d600000000000000000001'.padStart(24, '0'));
const users = UserModel as Model<UserRecord>;
const targets: { displayName: string; email: string; role: InstitutionRole; createIfMissing: boolean; rotatePasswordWhenRequested?: boolean }[] = [
  { displayName: 'Manjeet Singh', email: 'operator@northbridge.example', role: 'institution_operator', createIfMissing: false },
  { displayName: 'Arsh', email: 'arsh@northbridge.example', role: 'institution_operator', createIfMissing: true },
  { displayName: 'Sia Goel', email: 'sia.goel@northbridge.example', role: 'institution_operator', createIfMissing: true },
  { displayName: 'Demo Official Reviewer', email: 'reviewer@northbridge.example', role: 'auditor', createIfMissing: false, rotatePasswordWhenRequested: true },
  { displayName: 'Scenario Demo Reviewer', email: 'scenario-reviewer@northbridge.example', role: 'auditor', createIfMissing: false, rotatePasswordWhenRequested: true },
  { displayName: 'New Official Reviewer', email: 'new.reviewer@northbridge.example', role: 'auditor', createIfMissing: true },
];

try {
  await connectDatabase();
  if (!(await InstitutionModel.exists({ _id: institutionId }))) throw new Error('The Northbridge demo institution is not seeded. Run the demo data seed first.');
  const output: { email: string; displayName: string; role: InstitutionRole; password: string }[] = [];
  for (const target of targets) {
    let user = await users.findOne({ email: target.email.toLowerCase() }).select('_id email displayName status memberships');
    let created = false;
    let password = 'UNCHANGED';
    if (!user) {
      if (!target.createIfMissing) throw new Error(`Required existing account not found: ${target.email}`);
      password = randomBytes(24).toString('base64url');
      user = new users({ authSubject: `demo:northbridge:${randomUUID()}`, email: target.email, displayName: target.displayName, passwordHash: await hashPassword(password), status: 'active', memberships: [] });
      created = true;
    } else if (process.env.ROTATE_DEMO_REVIEWER_PASSWORDS === 'true' && target.rotatePasswordWhenRequested) {
      password = randomBytes(24).toString('base64url');
      user.passwordHash = await hashPassword(password);
    }
    const membership = user.memberships.find((entry) => String(entry.institutionId) === String(institutionId));
    const beforeRoles = membership ? [...membership.roles] : [];
    if (membership) {
      membership.roles = [target.role];
      membership.active = true;
    } else {
      user.memberships.push({ institutionId, roles: [target.role], active: true });
    }
    user.displayName = target.displayName;
    user.status = 'active';
    await user.save();
    await auditWriter.write({ action: created ? 'authorization.user.provisioned' : 'authorization.roles.provisioned', institutionId: String(institutionId), targetType: 'user', targetId: String(user._id), requestId: `demo-rbac:${randomUUID()}`, reason: 'Institution role provisioning requested by workspace owner', metadataRedacted: { previousRoles: beforeRoles, roles: [target.role], accountCreated: created } });
    output.push({ email: user.email, displayName: user.displayName, role: target.role, password });
  }
  console.info(process.env.ROTATE_DEMO_REVIEWER_PASSWORDS === 'true'
    ? 'Provisioned demo user access. Login IDs are unchanged; Manjeet Singh’s password was preserved and existing reviewer passwords were rotated as requested.'
    : 'Provisioned demo user access. Copy newly created account passwords now; existing passwords were not changed.');
  for (const account of output) console.info(`${account.displayName} | ${account.role} | ${account.email} | ${account.password}`);
} finally {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
}
