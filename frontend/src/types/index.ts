export interface User {
  id: string;
  name: string;
  email: string;
  description: string;
  permissions: string[];
  state: 'active' | 'inactive';
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPush {
  name?: string;
  email?: string;
  description?: string | null;
  state?: 'active' | 'inactive';
}

export interface UserListItem {
  id: string;
  name: string;
}

export interface AuthProviderInfo {
  id: string;
  name: string;
  configured: boolean;
}

export interface OpAssignment {
  id: number;
  operationId: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Operation {
  id: number;
  name: string;
  description: string;
  requirements: string;
  location: string;
  createdAt: string;
  updatedAt: string;
  assignments: OpAssignment[];
}

export interface OperationInput {
  id?: number;
  name: string;
  description?: string;
  requirements?: string;
  location?: string;
  assignments?: Array<{ id?: number; name: string; description?: string }>;
}

export interface ApiError {
  error: string;
  statusCode: number;
}
