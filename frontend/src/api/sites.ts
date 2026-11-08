import type { Paginated, Site, SitePush, SiteUpdate, TableQuery } from '../types/index.js';
import { api, withQuery } from './base.js';

export const sitesApi = api.injectEndpoints({
  endpoints: build => ({
    getSites: build.query<Paginated<Site>, { organizationId: string; query?: TableQuery }>({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/sites`, query ?? {}),
      providesTags: ['Site'],
    }),
    getAllSites: build.query<Site[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/sites/all`,
      providesTags: ['Site'],
    }),
    getSite: build.query<Site, { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}`,
      providesTags: (_result, _error, { siteId }) => [{ type: 'Site', id: siteId }],
    }),
    createSite: build.mutation<Site, { organizationId: string; data: SitePush }>({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Site'],
    }),
    updateSite: build.mutation<Site, { organizationId: string; siteId: string; data: SiteUpdate }>({
      query: ({ organizationId, siteId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Site'],
    }),
    deleteSite: build.mutation<void, { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Site'],
    }),
  }),
});

export const {
  useGetSitesQuery,
  useGetAllSitesQuery,
  useGetSiteQuery,
  useCreateSiteMutation,
  useUpdateSiteMutation,
  useDeleteSiteMutation,
} = sitesApi;
