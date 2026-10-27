import { institutionRoles, type InstitutionRole } from '../models/domain.js';

export const institutionPermissions = [
  'dashboard:read', 'instruments:create', 'documents:review', 'reviews:decide',
  'verification:read', 'verification:run', 'compliance:read', 'compliance:manage',
  'renewals:create', 'renewals:read', 'renewals:decide',
  'release:read', 'release:request', 'release:decide',
  'notifications:read', 'audit:read', 'users:manage',
] as const;
export type InstitutionPermission = (typeof institutionPermissions)[number];

const allPermissions = new Set<InstitutionPermission>(institutionPermissions);
const permissionsByRole: Record<InstitutionRole, ReadonlySet<InstitutionPermission>> = {
  institution_admin: allPermissions,
  institution_operator: new Set([
    'dashboard:read', 'instruments:create', 'documents:review', 'verification:read', 'verification:run',
    'compliance:read', 'renewals:create', 'renewals:read', 'release:read', 'release:request',
    'notifications:read', 'audit:read',
  ]),
  official_reviewer: new Set([
    'dashboard:read', 'documents:review', 'reviews:decide', 'verification:read', 'compliance:read',
    'renewals:read', 'renewals:decide', 'release:read', 'release:decide', 'notifications:read', 'audit:read',
  ]),
  auditor: new Set(['dashboard:read', 'verification:read', 'compliance:read', 'notifications:read', 'audit:read']),
};

export function hasInstitutionPermission(roles: readonly InstitutionRole[], permission: InstitutionPermission): boolean {
  return roles.some((role) => permissionsByRole[role]?.has(permission));
}

export function rolesWithInstitutionPermission(permission: InstitutionPermission): InstitutionRole[] {
  return institutionRoles.filter((role) => permissionsByRole[role].has(permission));
}

export function permissionsForInstitutionRoles(roles: readonly InstitutionRole[]): Set<InstitutionPermission> {
  return new Set(institutionPermissions.filter((permission) => hasInstitutionPermission(roles, permission)));
}
