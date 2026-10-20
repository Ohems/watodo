import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import { fetchJson, postForm, redirectUri, requestToken } from './shared.js';
import type { AuthProviderDefinition, ProviderProfile, ProviderTokenResponse } from './types.js';

const logger = createLogger('auth-provider-discord');

export const discordProvider: AuthProviderDefinition = {
  id: 'discord',
  clientId: config.discordClientId,
  clientSecret: config.discordClientSecret,
  isConfigured: Boolean(config.discordClientId && config.discordClientSecret),

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.discordClientId,
      scope: 'identify',
      response_type: 'code',
      redirect_uri: redirectUri('discord'),
      state,
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  },

  exchangeCode(code: string): Promise<ProviderTokenResponse> {
    logger.debug('Requesting Discord token');
    return requestToken(
      'https://discord.com/api/v10/oauth2/token',
      {
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri('discord'),
      },
      'Discord token request failed',
    );
  },

  refreshAccessToken(refreshToken: string): Promise<ProviderTokenResponse> {
    logger.debug('Refreshing Discord token');
    return requestToken(
      'https://discord.com/api/v10/oauth2/token',
      {
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: redirectUri('discord'),
      },
      'Discord token refresh failed',
    );
  },

  async getProfile(accessToken: string): Promise<ProviderProfile> {
    logger.debug('Retrieving Discord user information');
    const user = (await fetchJson(
      'https://discord.com/api/v10/users/@me',
      accessToken,
      'Discord user request failed',
    )) as { id: string; username: string; discriminator: string; bot?: boolean };
    if (user.bot) {
      throw new Error('The Discord user has been marked as a bot!');
    }
    return {
      id: user.id,
      email: null,
      name: `${user.username}#${user.discriminator}`,
    };
  },

  async revokeToken(accessToken: string): Promise<void> {
    logger.debug('Invalidating Discord token');
    await postForm('https://discord.com/api/v10/oauth2/token/revoke', {
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      token: accessToken,
    });
  },
};
