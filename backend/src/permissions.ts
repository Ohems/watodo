// Registry of permissions defined by the system. The permissions table in the
// database is the source of truth; this module mirrors the currently known
// permissions so they can be referenced in a type-safe way. New permissions are
// added together with new features: register them here and seed them in a
// migration.

export const PERMISSIONS = {
  ADMIN: 'admin',
  USER_MANAGEMENT_READ: 'user-management:read',
  USER_MANAGEMENT_WRITE: 'user-management:write',
  ROLE_MANAGEMENT_READ: 'role-management:read',
  ROLE_MANAGEMENT_WRITE: 'role-management:write',
  OPERATIONS_READ: 'operations:read',
  OPERATIONS_WRITE: 'operations:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

// The admin permission bypasses all permission checks.
export const ADMIN_PERMISSION = PERMISSIONS.ADMIN;

export function isKnownPermission(code: string): code is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(code);
}

export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(ADMIN_PERMISSION) || permissions.includes(permission);
}
