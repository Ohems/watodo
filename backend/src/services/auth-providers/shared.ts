import { config } from '../../config.js';
import type { AuthProvider } from '../../db/types.js';
import type { ProviderTokenResponse } from './types.js';

export function redirectUri(provider: AuthProvider): string {
  return `${config.baseUrl}/api/v1/auth/${provider}/callback`;
}

export async function postForm(url: string, params: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
}

export async function requestToken(
  url: string,
  params: Record<string, string>,
  errorMessage: string,
): Promise<ProviderTokenResponse> {
  const response = await postForm(url, params);
  if (!response.ok) {
    throw new Error(`${errorMessage}: ${response.statusText}`);
  }
  return response.json() as Promise<ProviderTokenResponse>;
}

export async function fetchJson(
  url: string,
  accessToken: string,
  errorMessage: string,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`${errorMessage}: ${response.statusText}`);
  }
  return response.json();
}
