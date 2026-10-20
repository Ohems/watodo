import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import { fetchJson, redirectUri, requestToken } from './shared.js';
import type { AuthProviderDefinition, ProviderProfile, ProviderTokenResponse } from './types.js';

const logger = createLogger('auth-provider-microsoft');

export const microsoftProvider: AuthProviderDefinition = {
  id: 'microsoft',
  clientId: config.microsoftClientId,
  clientSecret: config.microsoftClientSecret,
  isConfigured: Boolean(config.microsoftClientId && config.microsoftClientSecret),

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.microsoftClientId,
      scope: 'openid profile email User.Read',
      response_type: 'code',
      redirect_uri: redirectUri('microsoft'),
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  },

  exchangeCode(code: string): Promise<ProviderTokenResponse> {
    logger.debug('Requesting Microsoft token');
    return requestToken(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri('microsoft'),
      },
      'Microsoft token request failed',
    );
  },

  refreshAccessToken(refreshToken: string): Promise<ProviderTokenResponse> {
    logger.debug('Refreshing Microsoft token');
    return requestToken(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      'Microsoft token refresh failed',
    );
  },

  async getProfile(accessToken: string): Promise<ProviderProfile> {
    logger.debug('Retrieving Microsoft user information');
    const user = (await fetchJson(
      'https://graph.microsoft.com/v1.0/me',
      accessToken,
      'Microsoft user request failed',
    )) as { id: string; displayName?: string; mail?: string; userPrincipalName?: string };
    return {
      id: user.id,
      email: user.mail ?? user.userPrincipalName ?? null,
      name: user.displayName ?? null,
    };
  },

  // Microsoft has no token revocation endpoint; tokens are simply dropped locally.
};
