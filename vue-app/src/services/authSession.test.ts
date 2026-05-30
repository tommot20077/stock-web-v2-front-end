import { nextTick, watch } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest, configureApiClientSessionHandlers } from './apiClient';
import { createAuthSession } from './authSession';
import type { AuthApi, BrowserSessionMetadata } from './authApi';

const user = {
  id: 7,
  uuid: 'user-uuid-7',
  email: 'yuan@example.com',
  username: 'Yuan',
  role: 'USER',
  status: 'ACTIVE',
};

const sessionMetadata: BrowserSessionMetadata = {
  user,
  accessTokenExpiresAt: '2026-05-31T12:15:00Z',
  refreshTokenExpiresAt: '2026-06-14T12:00:00Z',
};

afterEach(() => {
  configureApiClientSessionHandlers({});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

function authApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    mode: 'api',
    login: async () => sessionMetadata,
    register: async () => sessionMetadata,
    refresh: async () => sessionMetadata,
    logout: async () => undefined,
    me: async () => user,
    csrf: async () => ({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ...overrides,
  };
}

function storageSpies() {
  return {
    local: vi.spyOn(Storage.prototype, 'setItem'),
    session: vi.spyOn(Storage.prototype, 'setItem'),
  };
}

describe('authSession', () => {
  it('restores API-mode state from checking to authenticated through me', async () => {
    const session = createAuthSession({ api: authApi(), mode: 'api' });

    expect(session.state.value.status).toBe('checking');

    await session.restore();

    expect(session.state.value).toMatchObject({
      status: 'authenticated',
      user,
      accessTokenExpiresAt: sessionMetadata.accessTokenExpiresAt,
      refreshTokenExpiresAt: sessionMetadata.refreshTokenExpiresAt,
      message: null,
    });
  });

  it('moves API-mode me 401 to anonymous and clears stale user metadata', async () => {
    const api = authApi({
      login: async () => sessionMetadata,
      me: async () => {
        throw new ApiClientError({
          status: 401,
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Unauthenticated',
          requestId: 'trace_401',
        });
      },
    });
    const session = createAuthSession({ api, mode: 'api' });

    await session.login({ email: 'yuan@example.com', password: 'Password1' });
    await session.restore();

    expect(session.state.value).toMatchObject({
      status: 'anonymous',
      user: null,
      message: {
        code: 'AUTH_INVALID_CREDENTIALS',
        status: 401,
        requestId: 'trace_401',
      },
    });
  });

  it('moves backend outage or malformed auth envelope to error with safe details', async () => {
    const session = createAuthSession({
      api: authApi({
        me: async () => {
          throw new ApiClientError({
            status: 503,
            code: 'AUTH_REDIS_UNAVAILABLE',
            message: 'Auth state unavailable',
            requestId: 'trace_503',
          });
        },
      }),
      mode: 'api',
    });

    await session.restore();

    expect(session.state.value).toMatchObject({
      status: 'error',
      user: null,
      message: {
        code: 'AUTH_REDIS_UNAVAILABLE',
        status: 503,
        requestId: 'trace_503',
      },
    });
  });

  it('uses apiClient refresh callbacks to mark refreshing and then anonymous on refresh failure', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-test; path=/';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/refresh')) {
        return new Response(JSON.stringify({
          error: { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Refresh expired' },
          meta: { traceId: 'trace_refresh' },
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
        meta: { traceId: 'trace_expired' },
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }));
    const session = createAuthSession({ api: authApi(), mode: 'api' });
    const statuses: string[] = [];
    watch(() => session.state.value.status, status => statuses.push(status), { flush: 'sync' });

    await session.login({ email: 'yuan@example.com', password: 'Password1' });
    await expect(apiRequest('/api/v1/protected')).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    await nextTick();

    expect(statuses).toContain('refreshing');
    expect(session.state.value).toMatchObject({
      status: 'anonymous',
      user: null,
      message: {
        code: 'AUTH_REFRESH_TOKEN_INVALID',
        status: 401,
        requestId: 'trace_refresh',
      },
    });
  });

  it('login, register, and logout update state without storing tokens, cookies, or passwords', async () => {
    const { local, session: sessionStorageSpy } = storageSpies();
    const api = authApi({
      login: async () => ({
        ...sessionMetadata,
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      } as unknown as BrowserSessionMetadata),
      register: async () => ({
        ...sessionMetadata,
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      } as unknown as BrowserSessionMetadata),
    });
    const authSession = createAuthSession({ api, mode: 'api' });

    await authSession.login({ email: 'yuan@example.com', password: 'Password1' });
    expect(authSession.state.value.status).toBe('authenticated');

    await authSession.register({ email: 'yuan@example.com', username: 'Yuan', password: 'Password2' });
    expect(authSession.state.value.status).toBe('authenticated');

    const serialized = JSON.stringify(authSession.state.value);
    expect(serialized).not.toContain('jwt-access');
    expect(serialized).not.toContain('jwt-refresh');
    expect(serialized).not.toContain('Password1');
    expect(serialized).not.toContain('Password2');
    expect(Object.keys(authSession.state.value)).not.toContain('accessToken');
    expect(Object.keys(authSession.state.value)).not.toContain('refreshToken');
    expect(local).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();

    await authSession.logout();

    expect(authSession.state.value).toMatchObject({
      status: 'anonymous',
      user: null,
    });
  });

  it('mock mode restores anonymous state without calling the backend', async () => {
    const me = vi.fn(async () => user);
    const session = createAuthSession({ api: authApi({ me }), mode: 'mock' });

    await session.restore();

    expect(me).not.toHaveBeenCalled();
    expect(session.state.value).toMatchObject({ status: 'anonymous', user: null });
  });
});
