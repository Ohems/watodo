import type { AuthProvider } from '../../db/types.js';
import { discordProvider } from './discord.js';
import { googleProvider } from './google.js';
import { microsoftProvider } from './microsoft.js';
import type { AuthProviderDefinition } from './types.js';

export const SUPPORTED_PROVIDERS: readonly AuthProvider[] = ['discord', 'google', 'microsoft'];

// Adding a provider means adding a file in this directory and registering it
// here. The Record key set is checked against the AuthProvider union at compile
// time, and the auth_accounts CHECK constraint in the migration must match.
const providers: Record<AuthProvider, AuthProviderDefinition> = {
  discord: discordProvider,
  google: googleProvider,
  microsoft: microsoftProvider,
};

export function isSupportedProvider(provider: string): provider is AuthProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

export function getProvider(provider: AuthProvider): AuthProviderDefinition {
  return providers[provider];
}

export type { AuthProviderDefinition, ProviderProfile, ProviderTokenResponse } from './types.js';
