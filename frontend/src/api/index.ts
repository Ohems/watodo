const TOKEN_KEY = 'watodo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const authToken = token ?? getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['x-token'] = authToken;

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>(path, { token }),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: 'POST', body, token }),
  patch: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: 'PATCH', body, token }),
  delete: <T>(path: string, token?: string | null) => request<T>(path, { method: 'DELETE', token }),
};

import type {
  AuthProviderInfo,
  OpAssignment,
  Operation,
  OperationInput,
  User,
  UserListItem,
  UserPush,
} from '../types/index.js';

export const authApi = {
  getProviders: () => api.get<{ providers: AuthProviderInfo[] }>('/api/v1/auth/providers'),
  loginUrl: (provider: string, state?: string, returnUrl?: string) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (returnUrl) params.set('returnUrl', returnUrl);
    return `/api/v1/auth/${provider}/login?${params.toString()}`;
  },
  logout: () => api.get('/api/v1/auth/logout'),
};

export const usersApi = {
  getUsers: (params?: { page?: number; limit?: number; archived?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.archived !== undefined) search.set('archived', String(params.archived));
    const qs = search.toString();
    return api.get<User[]>(`/api/v1/users${qs ? `?${qs}` : ''}`);
  },
  getUser: (userId: string) => api.get<User>(`/api/v1/users/${userId}`),
  getCurrentUser: () => api.get<User>('/api/v1/users/@me'),
  getUserList: () => api.get<UserListItem[]>('/api/v1/users/list'),
  updateUser: (userId: string, data: UserPush) => api.patch<User>(`/api/v1/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/api/v1/users/${userId}`),
};

export const operationsApi = {
  getOperations: () => api.get<Operation[]>('/api/v1/operations'),
  getOperation: (id: number) => api.get<Operation>(`/api/v1/operations/${id}`),
  upsertOperation: (data: OperationInput) => api.post<Operation>('/api/v1/operations', data),
  deleteOperation: (id: number) => api.delete(`/api/v1/operations/${id}`),
  addAssignment: (operationId: number, data: { name: string; description?: string }) =>
    api.post<OpAssignment>(`/api/v1/operations/${operationId}/assignments`, data),
  updateAssignment: (
    operationId: number,
    assignmentId: number,
    data: { name: string; description?: string },
  ) =>
    api.patch<OpAssignment>(`/api/v1/operations/${operationId}/assignments/${assignmentId}`, data),
  deleteAssignment: (operationId: number, assignmentId: number) =>
    api.delete(`/api/v1/operations/${operationId}/assignments/${assignmentId}`),
};
