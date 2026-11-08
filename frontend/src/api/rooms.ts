import type { Paginated, Room, RoomPush, RoomUpdate, TableQuery } from '../types/index.js';
import { api, withQuery } from './base.js';

export const roomsApi = api.injectEndpoints({
  endpoints: build => ({
    getRooms: build.query<
      Paginated<Room>,
      { organizationId: string; query?: TableQuery & { siteId?: string } }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/rooms`, query ?? {}),
      providesTags: ['Room'],
    }),
    getAllRooms: build.query<Room[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/rooms/all`,
      providesTags: ['Room'],
    }),
    getRoomsBySite: build.query<
      Paginated<Room>,
      { organizationId: string; siteId: string; query?: TableQuery }
    >({
      query: ({ organizationId, siteId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/sites/${siteId}/rooms`, query ?? {}),
      providesTags: ['Room'],
    }),
    getAllRoomsBySite: build.query<Room[], { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/all`,
      providesTags: ['Room'],
    }),
    getRoom: build.query<Room, { organizationId: string; siteId: string; roomId: string }>({
      query: ({ organizationId, siteId, roomId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
      providesTags: (_result, _error, { roomId }) => [{ type: 'Room', id: roomId }],
    }),
    createRoom: build.mutation<
      Room,
      { organizationId: string; siteId: string; data: Omit<RoomPush, 'siteId' | 'organizationId'> }
    >({
      query: ({ organizationId, siteId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Room'],
    }),
    updateRoom: build.mutation<
      Room,
      { organizationId: string; siteId: string; roomId: string; data: RoomUpdate }
    >({
      query: ({ organizationId, siteId, roomId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Room'],
    }),
    deleteRoom: build.mutation<void, { organizationId: string; siteId: string; roomId: string }>({
      query: ({ organizationId, siteId, roomId }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Room'],
    }),
  }),
});

export const {
  useGetRoomsQuery,
  useGetAllRoomsQuery,
  useGetRoomsBySiteQuery,
  useGetAllRoomsBySiteQuery,
  useGetRoomQuery,
  useCreateRoomMutation,
  useUpdateRoomMutation,
  useDeleteRoomMutation,
} = roomsApi;
