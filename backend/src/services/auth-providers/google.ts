import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import { fetchJson, redirectUri, requestToken } from './shared.js';
import type { AuthProviderDefinition, ProviderProfile, ProviderTokenResponse } from './types.js';

const logger = createLogger('auth-provider-google');

export const googleProvider: AuthProviderDefinition = {
  id: 'google',
  clientId: config.googleClientId,
  clientSecret: config.googleClientSecret,
  isConfigured: Boolean(config.googleClientId && config.googleClientSecret),

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      scope: 'openid email profile',
      response_type: 'code',
      redirect_uri: redirectUri('google'),
      access_type: 'offline',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  exchangeCode(code: string): Promise<ProviderTokenResponse> {
    logger.debug('Requesting Google token');
    return requestToken(
      'https://oauth2.googleapis.com/token',
      {
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri('google'),
      },
      'Google token request failed',
    );
  },

  refreshAccessToken(refreshToken: string): Promise<ProviderTokenResponse> {
    logger.debug('Refreshing Google token');
    return requestToken(
      'https://oauth2.googleapis.com/token',
      {
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      'Google token refresh failed',
    );
  },

  async getProfile(accessToken: string): Promise<ProviderProfile> {
    logger.debug('Retrieving Google user information');
    const user = (await fetchJson(
      'https://openidconnect.googleapis.com/v1/userinfo',
      accessToken,
      'Google user request failed',
    )) as { sub: string; email?: string; name?: string };
    return { id: user.sub, email: user.email ?? null, name: user.name ?? null };
  },

  async revokeToken(accessToken: string): Promise<void> {
    logger.debug('Invalidating Google token');
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' });
  },
};
