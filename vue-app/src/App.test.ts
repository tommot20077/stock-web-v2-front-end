import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { cleanupMounted, flushAsync, mountWithPinia } from './testUtils';

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiSuccess(data: unknown) {
  return { data, meta: { traceId: 'trace-ok' } };
}

function apiFailure(code: string, message: string, status: number, traceId: string) {
  return json({ error: { code, message }, meta: { traceId } }, status);
}

async function settleSession() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushAsync(12);
}

describe('App session shell', () => {
  it('API mode boot bootstraps CSRF, restores /me, and renders authenticated header plus page content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-123; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return json(apiSuccess({
          id: 1,
          uuid: 'u-1',
          email: 'yuan@example.com',
          username: 'yuan',
          role: 'USER',
          status: 'ACTIVE',
        }));
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    expect(document.body.textContent).toContain('正在確認登入狀態...');
    await settleSession();

    const calls = vi.mocked(fetch).mock.calls.map(call => String(call[0]));
    expect(calls).toContain('/api/v1/csrf');
    expect(calls).toContain('/api/v1/me');
    expect(document.body.textContent).toContain('yuan@example.com');
    expect(document.body.textContent).toContain('總資產');
  });

  it('expired API-mode restore hides stale identity and renders auth panel plus sign-in action', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-456; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return apiFailure('AUTH_TOKEN_EXPIRED', 'Expired', 401, 'trace-me-expired');
      }
      if (path.endsWith('/auth/refresh')) {
        return apiFailure('AUTH_REFRESH_TOKEN_INVALID', 'Refresh expired', 401, 'trace-refresh-expired');
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    await settleSession();

    expect(document.body.textContent).toContain('登入已過期，請重新登入。');
    expect(document.body.textContent).toContain('尚未登入');
    expect(document.body.textContent).toContain('登入');
    expect(document.body.textContent).not.toContain('yuan@example.com');
  });

  it('API-mode backend outage keeps the session surface visible and does not fall back to mock auth', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      return apiFailure('AUTH_REDIS_UNAVAILABLE', 'Redis unavailable', 503, 'trace-redis');
    }));

    mountWithPinia(App);
    await settleSession();

    expect(document.body.textContent).toContain('暫時無法連線到後端，請稍後重試。');
    expect(document.body.textContent).toContain('AUTH_REDIS_UNAVAILABLE');
    expect(document.body.textContent).toContain('trace-redis');
    expect(document.body.textContent).toContain('尚未登入');
  });

  it('successful logout returns to anonymous state and keeps persistent session surface', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-789; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return json(apiSuccess({
          id: 1,
          uuid: 'u-1',
          email: 'yuan@example.com',
          username: 'yuan',
          role: 'USER',
          status: 'ACTIVE',
        }));
      }
      if (path.endsWith('/auth/logout')) {
        return json(apiSuccess(null));
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    await settleSession();
    document.body.querySelector<HTMLButtonElement>('[data-testid="header-logout"]')!.click();
    await settleSession();

    expect(document.body.textContent).toContain('尚未登入');
    expect(document.body.textContent).toContain('登出');
    expect(document.body.textContent).not.toContain('yuan@example.com');
  });

  it('mock mode keeps existing pages reachable without /api/v1/me', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    vi.stubGlobal('fetch', vi.fn());

    mountWithPinia(App);
    await flushAsync();

    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/v1/me', expect.anything());
    expect(document.body.textContent).toContain('總資產');
  });

  it('invalid explicit runtime mode renders a configuration error without mock content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'prod');
    vi.stubGlobal('fetch', vi.fn());

    mountWithPinia(App);
    await flushAsync();

    expect(document.body.textContent).toContain('資料模式設定無效，請修正 VITE_DATA_MODE。');
    expect(document.body.textContent).toContain('INVALID_RUNTIME_DATA_MODE');
    expect(document.body.textContent).not.toContain('總資產');
    expect(document.body.textContent).not.toContain('最近交易');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
