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
      targetType: 'authentication',
      requestId: event.requestId,
      metadataRedacted: event.metadataRedacted ?? {},
    });
  },
};
