import type { AuthProvider } from '../../db/types.js';

export interface ProviderTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface ProviderProfile {
  id: string;
  email: string | null;
  name: string | null;
}

export interface AuthProviderDefinition {
  id: AuthProvider;
  clientId: string;
  clientSecret: string;
  isConfigured: boolean;
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<ProviderTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<ProviderTokenResponse>;
  getProfile(accessToken: string): Promise<ProviderProfile>;
  revokeToken?(accessToken: string): Promise<void>;
}
