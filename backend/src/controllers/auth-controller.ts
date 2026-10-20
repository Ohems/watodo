import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../logger.js';
import { callbackQuerySchema, loginQuerySchema, providerSchema } from '../schemas/index.js';
import {
  getProvider,
  PROVIDER_NAMES,
  SUPPORTED_PROVIDERS,
} from '../services/auth-providers/index.js';
import { handleNewLogin, logout, startLogin } from '../services/auth-service.js';

const logger = createLogger('auth-controller');

type ProviderRequest = FastifyRequest<{ Params: { provider: string } }>;

export async function providersHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  logger.trace('authController.providers');

  const providers = SUPPORTED_PROVIDERS.map(id => ({
    id,
    name: PROVIDER_NAMES[id],
    configured: getProvider(id).isConfigured,
  }));

  return reply.status(200).send({ providers });
}

export async function login(request: ProviderRequest, reply: FastifyReply): Promise<void> {
  logger.trace('authController.login');

  const providerId = providerSchema.parse(request.params.provider);
  const provider = getProvider(providerId);
  if (!provider.isConfigured) {
    return reply
      .status(400)
      .send({ error: `Authentication provider '${providerId}' is not configured!` });
  }

  const query = loginQuerySchema.parse(request.query);
  const state = query.state ?? randomUUID();
  const returnUrl = query.returnUrl ?? '/';
  const userAgent = request.headers['user-agent'] ?? '';

  logger.debug(`New ${providerId} login flow with return URL ${returnUrl}`);

  await startLogin(state, returnUrl, userAgent);

  logger.debug(`Redirecting to ${providerId} OAuth`);
  return reply.redirect(provider.getAuthorizationUrl(state));
}

export async function callback(request: ProviderRequest, reply: FastifyReply): Promise<void> {
  logger.trace('authController.callback');

  const providerId = providerSchema.parse(request.params.provider);
  const query = callbackQuerySchema.parse(request.query ?? {});

  if (!query.code || !query.state) {
    return reply.status(400).send({ error: 'Missing code or state parameter!' });
  }

  const { token, returnUrl } = await handleNewLogin(providerId, query.code, query.state);

  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return reply.redirect(returnUrl);
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  logger.trace('authController.logout');

  const token =
    (request.headers['x-token'] as string | undefined)?.trim() ?? request.cookies?.token;

  if (!token) {
    return reply.status(401).send({ error: 'Missing auth token!' });
  }

  await logout(token);

  reply.clearCookie('token', { path: '/' });

  return reply.status(200).send({ success: true });
}
