import { ApiClientError, apiRequest, bootstrapCsrf, type CsrfTokenNames } from './apiClient';
import type { RuntimeDataMode } from './apiTypes';

export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  status: string;
}

export interface BrowserSessionMetadata {
  user: AuthUser;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthApi {
  mode: RuntimeDataMode;
  login(request: LoginRequest): Promise<BrowserSessionMetadata>;
  register(request: RegisterRequest): Promise<BrowserSessionMetadata>;
  refresh(): Promise<BrowserSessionMetadata>;
  logout(): Promise<void>;
  me(): Promise<AuthUser | null>;
  csrf(): Promise<CsrfTokenNames>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function mapUser(value: unknown): AuthUser {
  if (!isRecord(value)
    || typeof value.id !== 'number'
    || typeof value.uuid !== 'string'
    || typeof value.email !== 'string'
    || typeof value.username !== 'string'
    || typeof value.role !== 'string'
    || typeof value.status !== 'string') {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Auth response did not include a valid user',
    });
  }

  return {
    id: value.id,
    uuid: value.uuid,
    email: value.email,
    username: value.username,
    role: value.role,
    status: value.status,
  };
}

function mapSession(value: unknown): BrowserSessionMetadata {
  if (!isRecord(value)
    || typeof value.accessTokenExpiresAt !== 'string'
    || typeof value.refreshTokenExpiresAt !== 'string') {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Auth response did not include valid session metadata',
    });
  }

  return {
    user: mapUser(value.user),
    accessTokenExpiresAt: value.accessTokenExpiresAt,
    refreshTokenExpiresAt: value.refreshTokenExpiresAt,
  };
}

function mockSession(email: string, username?: string): BrowserSessionMetadata {
  return {
    user: {
      id: 1,
      uuid: 'mock-user',
      email,
      username: username || email.split('@')[0] || 'mock',
      role: 'USER',
      status: 'ACTIVE',
    },
    accessTokenExpiresAt: '2026-05-31T12:15:00Z',
    refreshTokenExpiresAt: '2026-06-14T12:00:00Z',
  };
}

export function createHttpAuthApi(basePath = '/api/v1'): AuthApi {
  return {
    mode: 'api',
    login: async request => mapSession(await apiRequest(`${basePath}/auth/login`, { method: 'POST', json: request })),
    register: async request => mapSession(await apiRequest(`${basePath}/auth/register`, { method: 'POST', json: request })),
    refresh: async () => mapSession(await apiRequest(`${basePath}/auth/refresh`, { method: 'POST' })),
    logout: async () => {
      await apiRequest(`${basePath}/auth/logout`, { method: 'POST' });
    },
    me: async () => mapUser(await apiRequest(`${basePath}/me`)),
    csrf: () => bootstrapCsrf(basePath),
  };
}

export function createMockAuthApi(): AuthApi {
  let currentSession: BrowserSessionMetadata | null = null;

  return {
    mode: 'mock',
    async login(request) {
      currentSession = mockSession(request.email);
      return { ...currentSession, user: { ...currentSession.user } };
    },
    async register(request) {
      currentSession = mockSession(request.email, request.username);
      return { ...currentSession, user: { ...currentSession.user } };
    },
    async refresh() {
      if (!currentSession) {
        currentSession = mockSession('demo@example.com', 'demo');
      }
      return { ...currentSession, user: { ...currentSession.user } };
    },
    async logout() {
      currentSession = null;
    },
    async me() {
      return currentSession ? { ...currentSession.user } : null;
    },
    async csrf() {
      return { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' };
    },
  };
}

export function createAuthApi(mode: RuntimeDataMode, basePath = '/api/v1'): AuthApi {
  return mode === 'api' ? createHttpAuthApi(basePath) : createMockAuthApi();
}
