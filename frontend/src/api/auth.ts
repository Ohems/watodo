import type { AuthProviderInfo } from '../types/index.js';
import { api } from './base.js';

export const authApi = api.injectEndpoints({
  endpoints: build => ({
    getAuthProviders: build.query<{ providers: AuthProviderInfo[] }, void>({
      query: () => '/api/v1/auth/providers',
      providesTags: ['AuthProviders'],
    }),
    logout: build.mutation<void, void>({
      query: () => '/api/v1/auth/logout',
    }),
    /** Starts an OAuth flow that connects the provider to the current account. */
    startLink: build.mutation<
      { authorizationUrl: string },
      { provider: string; returnUrl?: string }
    >({
      query: ({ provider, returnUrl }) => ({
        url: `/api/v1/auth/${provider}/link`,
        method: 'POST',
        body: { returnUrl },
      }),
    }),
  }),
});

export const { useGetAuthProvidersQuery, useLogoutMutation, useStartLinkMutation } = authApi;
