import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_CURRENCY_OPTIONS,
  createHttpProfileApi,
  createMockProfileApi,
  createProfileApi,
  resetMockProfileForTests,
} from './profileApi';

/**
 * profileApi 只讀 / 寫一個偏好欄位(基準幣),**不碰 session 狀態**(鐵律 2:token 不落 JS)。
 * 回應中其他欄位(email / role 等)一律不得出現在回傳值。
 */

/** 後端 `MeResponse` 的手寫 fixture;含不該外洩的欄位。 */
const ME_RESPONSE = {
  id: 7,
  email: 'someone@example.com',
  role: 'USER',
  permissions: ['PORTFOLIO_VIEW'],
  baseCurrency: 'TWD',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope(data: unknown, traceId = 'trace-profile'): unknown {
  return { success: true, data, error: null, meta: { traceId } };
}

function failureEnvelope(code: string, message: string, traceId: string, fields?: Record<string, string>): unknown {
  return { success: false, data: null, error: { code, message, ...(fields ? { fields } : {}) }, meta: { traceId } };
}

function initAt(index: number): RequestInit {
  return vi.mocked(fetch).mock.calls[index][1] as RequestInit;
}

function urlAt(index: number): string {
  return String(vi.mocked(fetch).mock.calls[index][0]);
}

beforeEach(() => {
  resetMockProfileForTests();
  document.cookie = 'XSRF-TOKEN=csrf-profile; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profileApi http adapter', () => {
  it('getPreferences reads GET /me and projects only baseCurrency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(ME_RESPONSE))));

    const preferences = await createHttpProfileApi('/api/v1').getPreferences();

    expect(urlAt(0)).toBe('/api/v1/me');
    expect(String(initAt(0).method ?? 'GET').toUpperCase()).toBe('GET');
    expect(preferences).toEqual({ baseCurrency: 'TWD' });
    expect(preferences).not.toHaveProperty('email');
    expect(preferences).not.toHaveProperty('role');
  });

  it('getPreferences rejects a malformed /me payload instead of guessing a currency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({ id: 7, email: 'x@example.com' }))));

    await expect(createHttpProfileApi('/api/v1').getPreferences()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_API_RESPONSE',
    });
  });

  it('updateBaseCurrency PATCHes /me/preferences with only baseCurrency and the CSRF header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({ ...ME_RESPONSE, baseCurrency: 'USD' }))));

    const preferences = await createHttpProfileApi('/api/v1').updateBaseCurrency('USD');

    expect(urlAt(0)).toBe('/api/v1/me/preferences');
    const init = initAt(0);
    expect(String(init.method).toUpperCase()).toBe('PATCH');
    expect(new Headers(init.headers).get('x-xsrf-token')).toBe('csrf-profile');
    expect(String(init.body)).toBe('{"baseCurrency":"USD"}');
    expect(preferences).toEqual({ baseCurrency: 'USD' });
  });

  it('surfaces a 400 with fields.baseCurrency as ApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('VALIDATION_FAILED', 'Validation failed', 'trace-400', { baseCurrency: 'unsupported currency' }),
      400,
    )));

    await expect(createHttpProfileApi('/api/v1').updateBaseCurrency('XXX')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      fields: { baseCurrency: 'unsupported currency' },
    });
  });
});

describe('profileApi mock adapter', () => {
  it('defaults to TWD and keeps the selection (not a no-op)', async () => {
    const api = createMockProfileApi();
    expect(await api.getPreferences()).toEqual({ baseCurrency: 'TWD' });

    const updated = await api.updateBaseCurrency('EUR');

    expect(updated).toEqual({ baseCurrency: 'EUR' });
    expect(await api.getPreferences()).toEqual({ baseCurrency: 'EUR' });
    // 模組內狀態:新建的 mock adapter 看到同一個值(換頁再回來仍保留)。
    expect(await createMockProfileApi().getPreferences()).toEqual({ baseCurrency: 'EUR' });
  });

  it('rejects an unsupported code with VALIDATION_FAILED and leaves the stored value alone', async () => {
    const api = createMockProfileApi();

    await expect(api.updateBaseCurrency('XXX')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      fields: { baseCurrency: expect.any(String) },
    });
    expect(await api.getPreferences()).toEqual({ baseCurrency: 'TWD' });
  });

  it('makes zero network requests', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const api = createMockProfileApi();

    await api.getPreferences();
    await api.updateBaseCurrency('JPY');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not leak internal state through returned objects', async () => {
    const api = createMockProfileApi();
    const preferences = await api.getPreferences();
    preferences.baseCurrency = 'JPY';

    expect(await api.getPreferences()).toEqual({ baseCurrency: 'TWD' });
  });
});

describe('profileApi basics', () => {
  it('BASE_CURRENCY_OPTIONS lists the four supported codes in display order', () => {
    expect([...BASE_CURRENCY_OPTIONS]).toEqual(['TWD', 'USD', 'EUR', 'JPY']);
  });

  it('createProfileApi selects the implementation by mode', () => {
    expect(createProfileApi('api').mode).toBe('api');
    expect(createProfileApi('mock').mode).toBe('mock');
  });
});
