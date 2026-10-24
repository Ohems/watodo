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
  ORGANIZATION_WRITE: 'organization:write',
  ORGANIZATION_READ: 'organization:read',
  OPERATIONS_READ: 'operations:read',
  OPERATIONS_WRITE: 'operations:write',
  EVENTS_READ: 'events:read',
  EVENTS_WRITE: 'events:write',
  TEAM_MANAGEMENT_READ: 'team-management:read',
  TEAM_MANAGEMENT_WRITE: 'team-management:write',
  LOCATION_MANAGEMENT_READ: 'location-management:read',
  LOCATION_MANAGEMENT_WRITE: 'location-management:write',
  JOB_MANAGEMENT_READ: 'job-management:read',
  JOB_MANAGEMENT_WRITE: 'job-management:write',
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
  {
    code: PERMISSIONS.ORGANIZATION_WRITE,
    description: 'Edit the details of organizations the user belongs to.',
  },
  {
    code: PERMISSIONS.ORGANIZATION_READ,
    description: 'View organization members, teams, locations and jobs.',
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
  {
    code: PERMISSIONS.TEAM_MANAGEMENT_READ,
    description: 'View teams and their members.',
  },
  {
    code: PERMISSIONS.TEAM_MANAGEMENT_WRITE,
    description: 'Create, update and delete teams, and manage team members.',
  },
  {
    code: PERMISSIONS.LOCATION_MANAGEMENT_READ,
    description: 'View locations.',
  },
  {
    code: PERMISSIONS.LOCATION_MANAGEMENT_WRITE,
    description: 'Create, update and delete locations.',
  },
  {
    code: PERMISSIONS.JOB_MANAGEMENT_READ,
    description: 'View jobs.',
  },
  {
    code: PERMISSIONS.JOB_MANAGEMENT_WRITE,
    description: 'Create, update and delete jobs.',
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
