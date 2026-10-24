import type { Types } from 'mongoose';
import type { InstitutionRole } from '../models/domain.js';

export interface AuthMembership {
  institutionId: Types.ObjectId | string;
  roles: InstitutionRole[];
  active: boolean;
}

export interface AuthUser {
  _id: Types.ObjectId | string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'invited';
  passwordHash?: string;
  memberships: AuthMembership[];
}

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  updateLastLogin(id: string, date: Date): Promise<void>;
}

export interface AuditWriter {
  write(event: {
    action: string;
    actorId?: string;
    requestId: string;
    metadataRedacted?: Record<string, unknown>;
    institutionId?: string;
    actorRoleSnapshot?: InstitutionRole[];
    targetType?: string;
    targetId?: string;
    reason?: string;
  }): Promise<void>;
}
