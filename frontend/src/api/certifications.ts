import type {
  Certification,
  CertificationPush,
  CertificationUpdate,
  Paginated,
  TableQuery,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const certificationsApi = api.injectEndpoints({
  endpoints: build => ({
    getCertifications: build.query<
      Paginated<Certification>,
      { organizationId: string; query?: TableQuery }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/certifications`, query ?? {}),
      providesTags: ['Certification'],
    }),
    getAllCertifications: build.query<Certification[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/certifications/all`,
      providesTags: ['Certification'],
    }),
    getCertification: build.query<
      Certification,
      { organizationId: string; certificationId: number }
    >({
      query: ({ organizationId, certificationId }) =>
        `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
      providesTags: (_result, _error, { certificationId }) => [
        { type: 'Certification', id: certificationId },
      ],
    }),
    createCertification: build.mutation<
      Certification,
      { organizationId: string; data: CertificationPush }
    >({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Certification'],
    }),
    updateCertification: build.mutation<
      Certification,
      { organizationId: string; certificationId: number; data: CertificationUpdate }
    >({
      query: ({ organizationId, certificationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Certification'],
    }),
    deleteCertification: build.mutation<void, { organizationId: string; certificationId: number }>({
      query: ({ organizationId, certificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Certification'],
    }),
  }),
});

export const {
  useGetCertificationsQuery,
  useGetAllCertificationsQuery,
  useGetCertificationQuery,
  useCreateCertificationMutation,
  useUpdateCertificationMutation,
  useDeleteCertificationMutation,
} = certificationsApi;
