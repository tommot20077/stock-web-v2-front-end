import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthApi, createHttpAuthApi, createMockAuthApi } from './authApi';

const user = {
  id: 7,
  uuid: 'user-uuid-7',
  email: 'yuan@example.com',
  username: 'Yuan',
  role: 'USER',
  status: 'ACTIVE',
};

const sessionPayload = {
  user,
  accessTokenExpiresAt: '2026-05-31T12:15:00Z',
  refreshTokenExpiresAt: '2026-06-14T12:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

function setCsrfCookie() {
  document.cookie = 'XSRF-TOKEN=csrf-test; path=/';
}

function authCalls() {
  return vi.mocked(fetch).mock.calls.map(([input, init]) => ({
    url: String(input),
    init: init as RequestInit,
  }));
}

function keysOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(keysOf);
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

describe('authApi', () => {
  it('login posts to the browser login endpoint and returns token-free session metadata', async () => {
    setCsrfCookie();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        ...sessionPayload,
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      },
      meta: { traceId: 'trace_login' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpAuthApi('/api/v1');
    const session = await api.login({ email: 'yuan@example.com', password: 'Password1' });
    const [call] = authCalls();

    expect(call.url).toBe('/api/v1/auth/login');
    expect(call.init.method).toBe('POST');
    expect(call.init.body).toBe(JSON.stringify({ email: 'yuan@example.com', password: 'Password1' }));
    expect(session).toEqual(sessionPayload);
    expect(keysOf(session)).not.toContain('accessToken');
    expect(keysOf(session)).not.toContain('refreshToken');
    expect(JSON.stringify(session)).not.toContain('jwt-access');
    expect(JSON.stringify(session)).not.toContain('jwt-refresh');
  });

  it('register posts to the browser register endpoint and returns token-free session metadata', async () => {
    setCsrfCookie();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        ...sessionPayload,
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      },
      meta: { traceId: 'trace_register' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpAuthApi('/api/v1');
    const session = await api.register({
      email: 'yuan@example.com',
      username: 'Yuan',
      password: 'Password1',
    });
    const [call] = authCalls();

    expect(call.url).toBe('/api/v1/auth/register');
    expect(call.init.method).toBe('POST');
    expect(call.init.body).toBe(JSON.stringify({
      email: 'yuan@example.com',
      username: 'Yuan',
      password: 'Password1',
    }));
    expect(session).toEqual(sessionPayload);
    expect(keysOf(session)).not.toContain('accessToken');
    expect(keysOf(session)).not.toContain('refreshToken');
    expect(JSON.stringify(session)).not.toContain('jwt-access');
    expect(JSON.stringify(session)).not.toContain('jwt-refresh');
  });

  it('wraps me, logout, refresh, and csrf browser endpoints exactly', async () => {
    setCsrfCookie();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) {
        return new Response(JSON.stringify({ data: user, meta: { traceId: 'trace_me' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/v1/csrf')) {
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'trace_csrf' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: sessionPayload, meta: { traceId: 'trace_auth' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const api = createHttpAuthApi('/api/v1');
    await expect(api.me()).resolves.toEqual(user);
    await expect(api.logout()).resolves.toBeUndefined();
    await expect(api.refresh()).resolves.toEqual(sessionPayload);
    await expect(api.csrf()).resolves.toEqual({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' });

    expect(authCalls().map(call => [call.url, call.init.method ?? 'GET'])).toEqual([
      ['/api/v1/me', 'GET'],
      ['/api/v1/auth/logout', 'POST'],
      ['/api/v1/auth/refresh', 'POST'],
      ['/api/v1/csrf', 'GET'],
    ]);
    expect(authCalls().map(call => call.url)).not.toContain('/api/v1/auth/token');
  });

  it('factory preserves mock and api modes', async () => {
    expect(createAuthApi('api', '/api/v1').mode).toBe('api');
    expect(createAuthApi('mock').mode).toBe('mock');

    const mock = createMockAuthApi();
    await expect(mock.me()).resolves.toBeNull();
    await expect(mock.login({ email: 'yuan@example.com', password: 'Password1' }))
      .resolves.toMatchObject({ user: { email: 'yuan@example.com' } });
  });
});
