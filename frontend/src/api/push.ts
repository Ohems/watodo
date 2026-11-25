import type { PushSubscription, PushSubscriptionPush } from '../types/index.js';
import { api } from './base.js';

export const pushApi = api.injectEndpoints({
  endpoints: build => ({
    getVapidPublicKey: build.query<{ publicKey: string }, void>({
      query: () => '/api/v1/push/vapid-public-key',
      providesTags: ['PushVapidKey'],
    }),
    getPushSubscriptions: build.query<PushSubscription[], void>({
      query: () => '/api/v1/users/@me/push-subscriptions',
      providesTags: ['PushSubscriptions'],
    }),
    registerPushSubscription: build.mutation<PushSubscription, PushSubscriptionPush>({
      query: data => ({
        url: '/api/v1/users/@me/push-subscriptions',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['PushSubscriptions'],
    }),
    deletePushSubscription: build.mutation<{ success: boolean }, number>({
      query: subscriptionId => ({
        url: `/api/v1/users/@me/push-subscriptions/${subscriptionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PushSubscriptions'],
    }),
  }),
});

export const {
  useGetVapidPublicKeyQuery,
  useGetPushSubscriptionsQuery,
  useRegisterPushSubscriptionMutation,
  useDeletePushSubscriptionMutation,
} = pushApi;
