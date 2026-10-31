import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  hasPermission,
  isKnownPermission,
  PERMISSIONS,
} from '../src/permissions.js';
import { discordProvider } from '../src/services/auth-providers/discord.js';
import { googleProvider } from '../src/services/auth-providers/google.js';
import {
  getProvider,
  isSupportedProvider,
  SUPPORTED_PROVIDERS,
} from '../src/services/auth-providers/index.js';
import { microsoftProvider } from '../src/services/auth-providers/microsoft.js';

describe('permissions registry', () => {
  it('lists the system-defined permissions', () => {
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.ADMIN);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.USER_MANAGEMENT_WRITE);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.EVENTS_READ);
  });

  it('recognizes known permissions', () => {
    expect(isKnownPermission('admin')).toBe(true);
    expect(isKnownPermission('events:read')).toBe(true);
    expect(isKnownPermission('not-a-permission')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('grants access when the permission is present', () => {
    expect(hasPermission(['events:read'], 'events:read')).toBe(true);
  });

  it('denies access when the permission is missing', () => {
    expect(hasPermission(['events:read'], 'user-management:write')).toBe(false);
  });

  it('treats admin as a wildcard', () => {
    expect(hasPermission(['admin'], 'user-management:write')).toBe(true);
    expect(hasPermission(['events:read', 'admin'], 'role-management:write')).toBe(true);
  });

  it('denies access for empty permissions', () => {
    expect(hasPermission([], 'events:read')).toBe(false);
  });
});

describe('auth providers', () => {
  it('supports discord, google and microsoft', () => {
    expect(SUPPORTED_PROVIDERS).toEqual(['discord', 'google', 'microsoft']);
    expect(isSupportedProvider('google')).toBe(true);
    expect(isSupportedProvider('twitter')).toBe(false);
  });

  it('exposes each provider from its own module', () => {
    expect(discordProvider.id).toBe('discord');
    expect(googleProvider.id).toBe('google');
    expect(microsoftProvider.id).toBe('microsoft');
  });

  it('exposes a definition for each supported provider', () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      const definition = getProvider(provider);
      expect(definition.id).toBe(provider);
      expect(definition.getAuthorizationUrl('state123')).toContain('state=state123');
    }
  });

  it('builds authorization URLs on the provider domains', () => {
    expect(getProvider('discord').getAuthorizationUrl('s')).toContain(
      'discord.com/oauth2/authorize',
    );
    expect(getProvider('google').getAuthorizationUrl('s')).toContain('accounts.google.com');
    expect(getProvider('microsoft').getAuthorizationUrl('s')).toContain(
      'login.microsoftonline.com',
    );
  });
});
