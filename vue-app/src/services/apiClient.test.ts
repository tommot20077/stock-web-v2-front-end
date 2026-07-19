import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  apiPaginatedRequest,
  apiRequest,
  bootstrapCsrf,
  buildQueryString,
  configureApiClientSessionHandlers,
  ensureCsrfToken,
} from './apiClient';

afterEach(() => {
  configureApiClientSessionHandlers({});
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  vi.unstubAllGlobals();
});

function lastFetchInit(): RequestInit {
  const calls = vi.mocked(fetch).mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function headerValue(name: string): string | null {
  return new Headers(lastFetchInit().headers).get(name);
}

function logicalHeaderNames(headers: HeadersInit | undefined, name: string): string[] {
  const normalizedName = name.toLowerCase();
  if (!headers) return [];
  if (headers instanceof Headers) {
    return Array.from(headers.keys()).filter(key => key.toLowerCase() === normalizedName);
  }
  if (Array.isArray(headers)) {
    return headers.map(([key]) => key).filter(key => key.toLowerCase() === normalizedName);
  }
  return Object.keys(headers).filter(key => key.toLowerCase() === normalizedName);
}

describe('apiClient', () => {
  it('builds query strings without nullish values', () => {
    expect(buildQueryString({ symbol: 'AAPL', page: 0, size: 20, missing: null, empty: undefined }))
      .toBe('?symbol=AAPL&page=0&size=20');
    expect(buildQueryString({ symbol: 'BRK B/A' })).toBe('?symbol=BRK%20B%2FA');
  });

  it('unwraps success envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { ok: true },
      requestId: 'req_1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest<{ ok: boolean }>('/api/v1/example')).resolves.toEqual({ ok: true });
    expect(headerValue('accept')).toBe('application/json');
  });

  it('sends browser credentials by default and preserves explicit overrides', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { ok: true },
      requestId: 'req_credentials',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await apiRequest('/api/v1/me');
    expect(lastFetchInit().credentials).toBe('include');

    await apiRequest('/api/v1/public', { credentials: 'omit' });
    expect(lastFetchInit().credentials).toBe('omit');
  });

  it('uses meta trace ids as request ids while preserving legacy request ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/success')) {
        return new Response(JSON.stringify({
          data: { ok: true },
          meta: { traceId: 'trace_success' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/legacy-error')) {
        return new Response(JSON.stringify({
          error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
          requestId: 'req_legacy',
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: { code: 'AUTH_CSRF_TOKEN_INVALID', message: 'CSRF token invalid' },
        meta: { traceId: 'trace_error' },
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(apiRequest('/api/v1/success')).resolves.toEqual({ ok: true });
    await expect(apiRequest('/api/v1/meta-error')).rejects.toMatchObject({
      code: 'AUTH_CSRF_TOKEN_INVALID',
      requestId: 'trace_error',
    });
    await expect(apiRequest('/api/v1/legacy-error')).rejects.toMatchObject({
      code: 'OPS_PERMISSION_DENIED',
      requestId: 'req_legacy',
    });
  });

  it('serializes json payloads and sets a default content type', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_json; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { created: true },
      requestId: 'req_json',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest<{ created: boolean }>('/api/v1/example', {
      method: 'POST',
      json: { symbol: 'AAPL' },
    })).resolves.toEqual({ created: true });

    expect(lastFetchInit().body).toBe(JSON.stringify({ symbol: 'AAPL' }));
    expect(headerValue('content-type')).toBe('application/json');
  });

  it('preserves caller accept and content-type headers', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_headers; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { updated: true },
      requestId: 'req_headers',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await apiRequest('/api/v1/example', {
      method: 'PATCH',
      headers: {
        accept: 'application/vnd.stock-v2+json',
        'content-type': 'application/merge-patch+json',
      },
      json: { enabled: true },
    });

    const init = lastFetchInit();
    expect(headerValue('accept')).toBe('application/vnd.stock-v2+json');
    expect(headerValue('content-type')).toBe('application/merge-patch+json');
    expect(logicalHeaderNames(init.headers, 'accept')).toHaveLength(1);
    expect(logicalHeaderNames(init.headers, 'content-type')).toHaveLength(1);
  });

  it('throws typed errors for API error envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
      requestId: 'req_2',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/ops/jobs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'OPS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'req_2',
    });
  });

  it('parses field-level validation errors from the contract error.fields map', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        fields: { password: 'must match rule', ignored: 123 },
      },
      meta: { traceId: 'trace_fields' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/auth/register', { method: 'POST', json: {} })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      fields: { password: 'must match rule' },
    });
  });

  it('does not attempt session refresh for 401s from login/register/token endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' },
      meta: { traceId: 'trace_login' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    document.cookie = 'XSRF-TOKEN=csrf-login; path=/';

    await expect(apiRequest('/api/v1/auth/login', { method: 'POST', json: {} })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
      requestId: 'trace_login',
    });
    // 僅 login 本身這一次呼叫:沒有 refresh、沒有 replay
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('unwraps ApiResponse<PageResponse> from the shared paginated helper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { items: [{ id: 'bt_1' }], page: 0, size: 20, totalElements: 1, totalPages: 1 },
      error: null,
      meta: { traceId: 'trace_page' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiPaginatedRequest<{ id: string }>('/api/v1/backtests/runs')).resolves.toEqual({
      items: [{ id: 'bt_1' }],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    expect(lastFetchInit().credentials).toBe('include');
  });

  it('throws typed errors for paginated backend error envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'BACKTEST_RUN_TIMEOUT', message: 'Timed out' },
      meta: { traceId: 'trace_timeout' },
    }), { status: 504, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiPaginatedRequest('/api/v1/backtests/runs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 504,
      code: 'BACKTEST_RUN_TIMEOUT',
      message: 'Timed out',
      requestId: 'trace_timeout',
    });
  });

  it('rejects malformed paginated envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      // 舊 cursor 扁平信封不再是合法分頁回應
      data: [],
      page: { nextCursor: 3, hasMore: 'yes' },
      meta: { traceId: 'trace_malformed' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiPaginatedRequest('/api/v1/backtests/runs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: 'trace_malformed',
    });
  });

  it('rejects page envelopes with non-numeric pagination metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { items: [], page: '0', size: 20, totalElements: 0, totalPages: 0 },
      meta: { traceId: 'trace_bad_page' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiPaginatedRequest('/api/v1/backtests/runs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: 'trace_bad_page',
    });
  });

  it('falls back to HTTP_ERROR for malformed API error envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED' },
      requestId: 'req_malformed',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/ops/jobs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'HTTP_ERROR',
      message: 'Request failed with status 403',
      requestId: null,
    });
  });

  it('throws typed errors for non-json failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 502 })));

    await expect(apiRequest('/api/v1/example')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('throws typed errors for malformed json responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad json', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(apiRequest('/api/v1/example')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Response body was not valid JSON',
      requestId: null,
    });
  });

  it('bootstraps CSRF with browser credentials and returns the backend token names', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
      meta: { traceId: 'trace_csrf' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(bootstrapCsrf()).resolves.toEqual({
      cookieName: 'XSRF-TOKEN',
      headerName: 'X-XSRF-TOKEN',
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/v1/csrf', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
  });

  it('bootstraps missing CSRF cookies before unsafe requests and sends X-XSRF-TOKEN', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/csrf') {
        document.cookie = 'XSRF-TOKEN=csrf_bootstrapped; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'trace_csrf' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: { ok: true },
        meta: { traceId: 'trace_unsafe' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
      await expect(apiRequest('/api/v1/orders', { method })).resolves.toEqual({ ok: true });
      expect(headerValue('X-XSRF-TOKEN')).toBe('csrf_bootstrapped');
    }
  });

  it('uses existing CSRF cookies without bootstrapping and preserves caller headers', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_existing; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { updated: true },
      meta: { traceId: 'trace_headers' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await apiRequest('/api/v1/orders/order_1', {
      method: 'PATCH',
      headers: {
        'X-Client-Request': 'client-1',
      },
      json: { quantity: 3 },
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(headerValue('X-XSRF-TOKEN')).toBe('csrf_existing');
    expect(headerValue('X-Client-Request')).toBe('client-1');
  });

  it('does not add CSRF headers to safe requests', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_safe; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { ok: true },
      meta: { traceId: 'trace_safe' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await apiRequest('/api/v1/me');

    expect(fetch).toHaveBeenCalledOnce();
    expect(headerValue('X-XSRF-TOKEN')).toBeNull();
  });

  it('ensures CSRF tokens by reading the XSRF-TOKEN cookie after bootstrap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      document.cookie = 'XSRF-TOKEN=csrf_ensured; path=/';
      return new Response(JSON.stringify({
        data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
        meta: { traceId: 'trace_csrf' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(ensureCsrfToken()).resolves.toBe('csrf_ensured');
  });

  it('keeps CSRF 403 distinguishable as typed backend errors', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_invalid; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AUTH_CSRF_TOKEN_INVALID', message: 'CSRF token invalid' },
      meta: { traceId: 'trace_csrf_failed' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'AUTH_CSRF_TOKEN_INVALID',
      message: 'CSRF token invalid',
      requestId: 'trace_csrf_failed',
    });
  });

  it('refreshes once after a 401 and replays the original request', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_refresh; path=/';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({
          data: { refreshed: true },
          meta: { traceId: 'trace_refresh' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (calls.filter(call => call === '/api/v1/me').length === 1) {
        return new Response(JSON.stringify({
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          meta: { traceId: 'trace_expired' },
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: { ok: true },
        meta: { traceId: 'trace_replay' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(apiRequest('/api/v1/me')).resolves.toEqual({ ok: true });

    expect(calls).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
  });

  it('shares one refresh request across parallel 401 responses', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_parallel; path=/';
    const attempts = new Map<string, number>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      attempts.set(url, (attempts.get(url) ?? 0) + 1);
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({
          data: { refreshed: true },
          meta: { traceId: 'trace_refresh' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if ((attempts.get(url) ?? 0) === 1) {
        return new Response(JSON.stringify({
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          meta: { traceId: `trace_expired_${url}` },
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: { path: url },
        meta: { traceId: `trace_replay_${url}` },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(Promise.all([
      apiRequest('/api/v1/protected-a'),
      apiRequest('/api/v1/protected-b'),
    ])).resolves.toEqual([{ path: '/api/v1/protected-a' }, { path: '/api/v1/protected-b' }]);

    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('stops without replay when refresh fails and reports safe session metadata', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_refresh_fail; path=/';
    const onRefreshFailed = vi.fn();
    configureApiClientSessionHandlers({ onRefreshFailed });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({
          error: { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Refresh token invalid' },
          meta: { traceId: 'trace_refresh_failed' },
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
        meta: { traceId: 'trace_original_401' },
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(apiRequest('/api/v1/me')).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      status: 401,
      requestId: 'trace_refresh_failed',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onRefreshFailed).toHaveBeenCalledWith({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      status: 401,
      message: 'Refresh token invalid',
      requestId: 'trace_refresh_failed',
    });
  });

  it('does not refresh again when the replay also returns 401', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_replay_401; path=/';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({
          data: { refreshed: true },
          meta: { traceId: 'trace_refresh' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
        meta: { traceId: `trace_${calls.length}` },
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(apiRequest('/api/v1/me')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });

    expect(calls).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
  });

  it('does not recursively refresh the refresh endpoint itself', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_refresh_endpoint; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Refresh token invalid' },
      meta: { traceId: 'trace_refresh_endpoint' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/auth/refresh', { method: 'POST' })).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      status: 401,
      requestId: 'trace_refresh_endpoint',
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('runs the CSRF guard again before replaying unsafe requests', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_initial; path=/';
    const requestHeaders: Array<string | null> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/csrf') {
        document.cookie = 'XSRF-TOKEN=csrf_replay; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'trace_csrf_replay' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/v1/auth/refresh') {
        document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
        return new Response(JSON.stringify({
          data: { refreshed: true },
          meta: { traceId: 'trace_refresh' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      requestHeaders.push(new Headers(init?.headers).get('X-XSRF-TOKEN'));
      if (requestHeaders.length === 1) {
        return new Response(JSON.stringify({
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          meta: { traceId: 'trace_expired' },
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: { ok: true },
        meta: { traceId: 'trace_replay' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(apiRequest('/api/v1/trades', { method: 'POST', json: { symbol: 'AAPL' } }))
      .resolves.toEqual({ ok: true });

    expect(requestHeaders).toEqual(['csrf_initial', 'csrf_replay']);
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/trades',
      '/api/v1/auth/refresh',
      '/api/v1/csrf',
      '/api/v1/trades',
    ]);
  });
});
