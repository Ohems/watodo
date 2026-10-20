import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../logger.js';
import { hasPermission } from '../permissions.js';
import { type AuthContext, getAuthContext } from '../services/auth-service.js';

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

// Requires an authenticated user. When permissions are given, the user must
// have at least one of them (the admin permission bypasses all checks).
// With no permissions given, any authenticated user is allowed.
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
