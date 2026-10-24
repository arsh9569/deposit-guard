import { Types } from 'mongoose';
import { AuditLogModel } from '../models/audit-logs.js';
import type { AuditLogRecord } from '../models/audit-logs.js';
import type { AuditWriter } from './types.js';

export const auditWriter: AuditWriter = {
  async write(event): Promise<void> {
    await (AuditLogModel as import('mongoose').Model<AuditLogRecord>).create({
      scope: event.institutionId ? 'institution' : 'platform',
      institutionId: event.institutionId ? new Types.ObjectId(event.institutionId) : undefined,
      actorId: event.actorId ? new Types.ObjectId(event.actorId) : undefined,
      action: event.action,
      targetType: event.targetType ?? 'authentication',
      targetId: event.targetId ? new Types.ObjectId(event.targetId) : undefined,
      actorRoleSnapshot: event.actorRoleSnapshot ?? [],
      requestId: event.requestId,
      reason: event.reason,
      metadataRedacted: event.metadataRedacted ?? {},
    });
  },
};
