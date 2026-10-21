/**
 * Registry of permissions defined by the system. The permissions table in the
 * database is the source of truth; this module mirrors the currently known
 * permissions so they can be referenced in a type-safe way. New permissions are
 * added together with new features: add them to PERMISSION_DEFINITIONS (which
 * seeds the initial migration and `npm run seed:permissions`) and reference
 * them in code through PERMISSIONS.
 */
export const PERMISSIONS = {
  ADMIN: 'admin',
  USER_MANAGEMENT_READ: 'user-management:read',
  USER_MANAGEMENT_WRITE: 'user-management:write',
  ROLE_MANAGEMENT_READ: 'role-management:read',
  ROLE_MANAGEMENT_WRITE: 'role-management:write',
  OPERATIONS_READ: 'operations:read',
  OPERATIONS_WRITE: 'operations:write',
  EVENTS_READ: 'events:read',
  EVENTS_WRITE: 'events:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/**
 * All known permissions with their descriptions. The initial migration and the
 * `seed:permissions` script both insert from this list.
 */
export const PERMISSION_DEFINITIONS: { code: Permission; description: string }[] = [
  {
    code: PERMISSIONS.ADMIN,
    description: 'Full administrative access. Bypasses all permission checks.',
  },
  { code: PERMISSIONS.USER_MANAGEMENT_READ, description: 'View users.' },
  {
    code: PERMISSIONS.USER_MANAGEMENT_WRITE,
    description: 'Create, update and delete users.',
  },
  {
    code: PERMISSIONS.ROLE_MANAGEMENT_READ,
    description: 'View roles and role assignments.',
  },
  {
    code: PERMISSIONS.ROLE_MANAGEMENT_WRITE,
    description: 'Create, update and delete roles, and assign them to users.',
  },
  { code: PERMISSIONS.OPERATIONS_READ, description: 'View operations.' },
  {
    code: PERMISSIONS.OPERATIONS_WRITE,
    description: 'Create, update and delete operations.',
  },
  { code: PERMISSIONS.EVENTS_READ, description: 'View event series and their occurrences.' },
  {
    code: PERMISSIONS.EVENTS_WRITE,
    description:
      'Create, update and delete event series, and manage occurrences, job slots and comments.',
  },
];

/** The admin permission bypasses all permission checks. */
export const ADMIN_PERMISSION = PERMISSIONS.ADMIN;

export function isKnownPermission(code: string): code is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(code);
}

export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(ADMIN_PERMISSION) || permissions.includes(permission);
}
