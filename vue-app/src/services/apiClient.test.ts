import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';

afterEach(() => {
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
    expect(buildQueryString({ symbol: 'AAPL', limit: 20, cursor: null, empty: undefined }))
      .toBe('?symbol=AAPL&limit=20');
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

  it('returns valid paginated envelopes from the shared paginated helper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'bt_1' }],
      page: { nextCursor: null, hasMore: false },
      meta: { traceId: 'trace_page' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiPaginatedRequest<{ id: string }>('/api/v1/backtests/runs')).resolves.toEqual({
      data: [{ id: 'bt_1' }],
      page: { nextCursor: null, hasMore: false },
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
});
