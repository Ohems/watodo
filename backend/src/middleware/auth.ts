import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../logger.js';
import { hasPermission, PERMISSIONS } from '../permissions.js';
import { type AuthContext, getAuthContext } from '../services/auth-service.js';
import { getManagedTeamIds, isTeamManager } from '../services/team-service.js';

const logger = createLogger('auth-middleware');

export interface AuthenticatedRequest extends FastifyRequest {
  auth?: AuthContext;
}

export function getAuth(request: FastifyRequest): AuthContext | undefined {
  return (request as AuthenticatedRequest).auth;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token =
    (request.headers['x-token'] as string | undefined)?.trim() ?? request.cookies?.token;
  if (!token) {
    return reply.status(401).send({ error: 'Missing auth token!' });
  }
  try {
    (request as AuthenticatedRequest).auth = await getAuthContext(token);
  } catch (error) {
    logger.warn({ error }, 'Authentication failed');
    return reply.status(403).send({ error: 'Invalid or expired token!' });
  }
}

/**
 * Requires an authenticated user. When permissions are given, the user must
 * have at least one of them (the admin permission bypasses all checks).
 * With no permissions given, any authenticated user is allowed.
 * @param requiredPermissions - The permissions the user must have at least one of.
 * @returns A Fastify preHandler that enforces authentication and permissions.
 */
export function requirePermissions(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      return reply.status(401).send({ error: 'Not authenticated!' });
    }
    if (requiredPermissions.length === 0) return;
    const allowed = requiredPermissions.some(permission =>
      hasPermission(auth.permissions, permission),
    );
    if (!allowed) {
      return reply.status(403).send({ error: 'Insufficient rights!' });
    }
  };
}

/**
 * Requires an authenticated user with the given team-management permission,
 * OR membership with the manager toggle on the team in the route's `:teamId`
 * param (scoped to the route's `:organizationId`). For routes without a
 * `:teamId` (the team list), the read permission can be satisfied by managing
 * at least one team in the organization.
 * @param permission - `team-management:read` or `team-management:write`.
 * @returns A Fastify preHandler that enforces authentication and team access.
 */
export function requireTeamAccess(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const auth = getAuth(request);
    if (!auth) {
      return reply.status(401).send({ error: 'Not authenticated!' });
    }
    if (hasPermission(auth.permissions, permission)) return;
    const params = request.params as { organizationId?: string; teamId?: string } | undefined;
    const { organizationId, teamId } = params ?? {};
    if (teamId && (await isTeamManager(auth.user.id, teamId, organizationId))) return;
    if (!teamId && permission === PERMISSIONS.TEAM_MANAGEMENT_READ) {
      const managed = await getManagedTeamIds(auth.user.id, organizationId);
      if (managed.length > 0) return;
    }
    return reply.status(403).send({ error: 'Insufficient rights!' });
  };
}
