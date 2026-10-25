import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings.vue';
import { t } from '../i18n';
import { resetMockProfileForTests } from '../services/profileApi';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { cleanupMounted, clickButton, flushAsync, mountWithPinia } from '../testUtils';

// Phase 04.1 Plan 13(PORT-09 Settings 半)。Settings「顯示」分頁的基準幣 <select> 原本是靜默 no-op
// (違反前端鐵律 6);改為經 profileApi 讀寫後端(D-03)。兩個模式都不能是 no-op:
// API mode 真的 PATCH /me/preferences,mock mode 保留選擇且零網路請求。

const CSRF_TOKEN = 'csrf-settings';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function success(data: unknown, traceId = 'trace-ok'): Response {
  return jsonResponse({ success: true, data, error: null, meta: { traceId } });
}

/** Settings 在 API mode 掛載時也會載入 AI Access;這些請求與本 plan 無關,一律回 503 讓該區塊走安全空狀態。 */
function unrelatedFailure(): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: { code: 'AI_ACCESS_UNAVAILABLE', message: 'unrelated' },
    meta: { traceId: 'trace-unrelated' },
  }, 503);
}

function failure(
  code: string,
  status: number,
  options: { traceId?: string; message?: string; fields?: Record<string, string> } = {},
): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: {
      code,
      message: options.message ?? 'backend said no',
      ...(options.fields ? { fields: options.fields } : {}),
    },
    meta: { traceId: options.traceId ?? 'trace-fail' },
  }, status);
}

/** 手動控制何時回應的 promise,用來停在「讀取中 / 儲存中」。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

interface Routes {
  me?: () => Response | Promise<Response>;
  patch?: (body: unknown) => Response | Promise<Response>;
}

function routedFetch(routes: Routes) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (url.endsWith('/api/v1/me/preferences') && method === 'PATCH') {
      return routes.patch!(JSON.parse(String(init?.body)));
    }
    if (url.endsWith('/api/v1/me') && method === 'GET') return routes.me!();
    if (url.includes('/ai-access/')) return unrelatedFailure();
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
}

function getCalls(fetchMock: ReturnType<typeof routedFetch>): unknown[][] {
  return fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/v1/me')
    && String(call[1]?.method ?? 'GET').toUpperCase() === 'GET');
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

function ccySelect(): HTMLSelectElement {
  const el = document.body.querySelector<HTMLSelectElement>('[data-testid="settings-base-currency"]');
  expect(el, 'settings-base-currency select').not.toBeNull();
  return el!;
}

function statusLine(): HTMLElement | null {
  return document.body.querySelector('[data-testid="settings-base-currency-status"]');
}

async function openDisplayTab() {
  await clickButton(t('zh', 'display'));
  await flushAsync();
}

async function choose(code: string) {
  const select = ccySelect();
  select.value = code;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsync();
}

beforeEach(() => {
  document.cookie = `XSRF-TOKEN=${CSRF_TOKEN}; path=/`;
  resetMockProfileForTests();
});

afterEach(() => {
  cleanupMounted();
  resetRuntimeApiClientsForTests();
  resetMockProfileForTests();
});

describe('Settings 分頁按鈕的穩定 testid(E2E 用)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
  });

  it('每個分頁按鈕有 settings-tab-<key>,點 settings-tab-display 後才出現基準幣下拉', async () => {
    vi.stubGlobal('fetch', routedFetch({ me: () => success({ baseCurrency: 'USD', email: 'x@example.com' }) }));
    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    const tabKeys = ['profile', 'security', 'providers', 'brokers', 'aiAccess', 'notifPref', 'display', 'data'];
    for (const k of tabKeys) {
      expect(document.body.querySelector(`[data-testid="settings-tab-${k}"]`), k).not.toBeNull();
    }
    // 預設分頁是 brokers,基準幣下拉在 display 分頁,不在預設畫面
    expect(document.body.querySelector('[data-testid="settings-base-currency"]')).toBeNull();
    const displayTab = document.body.querySelector<HTMLButtonElement>('[data-testid="settings-tab-display"]');
    displayTab!.click();
    await flushAsync();
    expect(document.body.querySelector('[data-testid="settings-base-currency"]')).not.toBeNull();
  });
});

describe('Settings 基準幣(API mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
  });

  it('讀取後端值:select 值為 USD、四個選項、選項文字為「代碼 · 幣別全名」', async () => {
    const fetchMock = routedFetch({ me: () => success({ baseCurrency: 'USD', email: 'x@example.com' }) });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    const select = ccySelect();
    expect(select.value).toBe('USD');
    const options = [...select.options];
    expect(options.map(o => o.value)).toEqual(['TWD', 'USD', 'EUR', 'JPY']);
    expect(options[0].textContent?.trim().startsWith('TWD · ')).toBe(true);
    expect(options[0].textContent).toContain(t('zh', 'currencyNameTWD'));
    expect(select.disabled).toBe(false);
  });

  it('選 EUR:恰一次 PATCH /me/preferences,body 只有 baseCurrency、帶 CSRF header,回應後顯示「已儲存」', async () => {
    const fetchMock = routedFetch({
      me: () => success({ baseCurrency: 'USD' }),
      patch: body => success({ baseCurrency: (body as { baseCurrency: string }).baseCurrency }),
    });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('EUR');

    const patches = fetchMock.mock.calls.filter(call => String(call[1]?.method ?? 'GET').toUpperCase() === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(String(patches[0][0])).toBe('/api/v1/me/preferences');
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ baseCurrency: 'EUR' });
    expect(new Headers(patches[0][1]?.headers).get('X-XSRF-TOKEN')).toBe(CSRF_TOKEN);

    expect(ccySelect().value).toBe('EUR');
    expect(ccySelect().disabled).toBe(false);
    expect(statusLine()?.textContent).toContain(t('zh', 'settingSaved'));
  });

  it('選回已儲存的值不送 PATCH', async () => {
    const fetchMock = routedFetch({
      me: () => success({ baseCurrency: 'USD' }),
      patch: () => success({ baseCurrency: 'USD' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('USD');

    expect(fetchMock.mock.calls.filter(call => String(call[1]?.method ?? 'GET').toUpperCase() === 'PATCH')).toHaveLength(0);
  });
});

describe('Settings 基準幣(mock mode)', () => {
  it('選 JPY 零網路請求,重新掛載後仍為 JPY(不是 no-op)', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('mock mode must not touch the network')));
    vi.stubGlobal('fetch', fetchSpy);

    const cleanup = mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    expect(ccySelect().value).toBe('TWD');

    await choose('JPY');
    expect(ccySelect().value).toBe('JPY');
    expect(statusLine()?.textContent).toContain(t('zh', 'settingSaved'));

    cleanup();
    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    expect(ccySelect().value).toBe('JPY');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Settings 基準幣列的文案', () => {
  it('label 與 sub 走 i18n,不再寫死英文 Default display currency', async () => {
    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    const text = document.body.textContent ?? '';
    expect(text).toContain(t('zh', 'baseCurrency'));
    expect(text).toContain(t('zh', 'baseCurrencySub'));
    expect(text).not.toContain('Default display currency');
    expect(ccySelect().getAttribute('aria-label')).toBe(t('zh', 'baseCurrency'));
  });
});

describe('Settings 基準幣的讀取狀態(API mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
  });

  it('讀取中:select disabled 且狀態列為「載入中…」', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', routedFetch({ me: () => pending.promise }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    expect(ccySelect().disabled).toBe(true);
    expect(statusLine()?.textContent).toBe(t('zh', 'loading'));
    pending.resolve(success({ baseCurrency: 'TWD' }));
    await flushAsync();
    expect(ccySelect().disabled).toBe(false);
    expect(statusLine()?.textContent ?? '').toBe('');
  });

  it('讀取失敗:select disabled、顯示 loadFailed + code + traceId + 重試;重試後重新 GET 並成功', async () => {
    let attempt = 0;
    const fetchMock = routedFetch({
      me: () => {
        attempt += 1;
        return attempt === 1
          ? failure('SERVICE_UNAVAILABLE', 503, { traceId: 'trace-xyz' })
          : success({ baseCurrency: 'JPY' });
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    const error = byTestId('settings-base-currency-error');
    expect(error).not.toBeNull();
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain(t('zh', 'loadFailed'));
    expect(error?.textContent).toContain('SERVICE_UNAVAILABLE');
    expect(error?.textContent).toContain('trace-xyz');
    expect(ccySelect().disabled).toBe(true);

    const retry = byTestId('settings-base-currency-retry');
    expect(retry).not.toBeNull();
    expect(retry?.textContent).toContain(t('zh', 'authRetry'));
    retry!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();

    expect(getCalls(fetchMock)).toHaveLength(2);
    expect(byTestId('settings-base-currency-error')).toBeNull();
    expect(byTestId('settings-base-currency-retry')).toBeNull();
    expect(ccySelect().disabled).toBe(false);
    expect(ccySelect().value).toBe('JPY');
  });

  it('讀取失敗但沒有 traceId 時不渲染追蹤 ID', async () => {
    vi.stubGlobal('fetch', routedFetch({
      me: () => jsonResponse({ success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } }, 503),
    }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();

    expect(byTestId('settings-base-currency-error-code')?.textContent).toBe('SERVICE_UNAVAILABLE');
    expect(byTestId('settings-base-currency-trace-id')).toBeNull();
    expect(document.body.textContent).not.toContain(t('zh', 'authRequestId'));
  });
});

describe('Settings 基準幣的儲存狀態(API mode)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
  });

  it('儲存中:select disabled 顯示新值,狀態列「儲存中…」且 role=status', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', routedFetch({
      me: () => success({ baseCurrency: 'TWD' }),
      patch: () => pending.promise,
    }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('USD');

    expect(ccySelect().disabled).toBe(true);
    expect(ccySelect().value).toBe('USD');
    expect(statusLine()?.textContent).toBe(t('zh', 'settingSaving'));
    expect(statusLine()?.getAttribute('role')).toBe('status');

    pending.resolve(success({ baseCurrency: 'USD' }));
    await flushAsync();
    expect(statusLine()?.textContent).toBe(t('zh', 'settingSaved'));
  });

  it('400 VALIDATION_FAILED(fields.baseCurrency):回到已儲存值、role=alert、診斷列含 code、無重試鈕,後端訊息不入 DOM', async () => {
    vi.stubGlobal('fetch', routedFetch({
      me: () => success({ baseCurrency: 'TWD' }),
      patch: () => failure('VALIDATION_FAILED', 400, {
        traceId: 'trace-patch',
        message: 'BACKEND-MESSAGE-CANARY',
        fields: { baseCurrency: 'unsupported currency' },
      }),
    }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('EUR');

    expect(ccySelect().value).toBe('TWD');
    expect(ccySelect().disabled).toBe(false);
    const error = byTestId('settings-base-currency-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain(t('zh', 'baseCurrencyErrUnsupported'));
    expect(byTestId('settings-base-currency-error-code')?.textContent).toBe('VALIDATION_FAILED');
    expect(byTestId('settings-base-currency-trace-id')?.textContent).toContain('trace-patch');
    expect(byTestId('settings-base-currency-retry')).toBeNull();
    expect(statusLine()?.textContent ?? '').toBe('');

    const dom = document.body.innerHTML;
    expect(dom).not.toContain('BACKEND-MESSAGE-CANARY');
    expect(dom).not.toContain('unsupported currency');
  });

  it('失敗後再選一次即重試,成功時清掉錯誤', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', routedFetch({
      me: () => success({ baseCurrency: 'TWD' }),
      patch: body => {
        attempt += 1;
        return attempt === 1
          ? failure('INTERNAL_ERROR', 500)
          : success({ baseCurrency: (body as { baseCurrency: string }).baseCurrency });
      },
    }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('EUR');
    expect(byTestId('settings-base-currency-error')).not.toBeNull();

    await choose('EUR');
    expect(byTestId('settings-base-currency-error')).toBeNull();
    expect(ccySelect().value).toBe('EUR');
    expect(statusLine()?.textContent).toBe(t('zh', 'settingSaved'));
  });

  const ERROR_CASES: Array<{ name: string; patch: () => Response | Promise<Response>; key: string }> = [
    { name: '403 AUTH_CSRF_TOKEN_INVALID', patch: () => failure('AUTH_CSRF_TOKEN_INVALID', 403), key: 'baseCurrencyErrCsrf' },
    { name: '403 AUTH_CSRF_TOKEN_MISSING', patch: () => failure('AUTH_CSRF_TOKEN_MISSING', 403), key: 'baseCurrencyErrCsrf' },
    { name: '403 AUTH_FORBIDDEN', patch: () => failure('AUTH_FORBIDDEN', 403), key: 'baseCurrencyErrForbidden' },
    { name: '網路失敗(fetch reject)', patch: () => Promise.reject(new TypeError('offline')), key: 'baseCurrencyErrNetwork' },
    { name: '500 INTERNAL_ERROR', patch: () => failure('INTERNAL_ERROR', 500), key: 'baseCurrencyErrUnknown' },
    { name: '400 VALIDATION_FAILED 但沒有 fields.baseCurrency', patch: () => failure('VALIDATION_FAILED', 400), key: 'baseCurrencyErrUnknown' },
  ];

  for (const c of ERROR_CASES) {
    it(`錯誤分派:${c.name} → ${c.key}`, async () => {
      vi.stubGlobal('fetch', routedFetch({ me: () => success({ baseCurrency: 'TWD' }), patch: c.patch }));

      mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
      await flushAsync();
      await openDisplayTab();
      await choose('USD');

      const error = byTestId('settings-base-currency-error');
      expect(error?.textContent).toContain(t('zh', c.key));
      expect(ccySelect().value).toBe('TWD');
      expect(byTestId('settings-base-currency-retry')).toBeNull();
    });
  }

  it('401:回到已儲存值,但不在這裡顯示錯誤(交給全域 SessionBanner)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      if (url.endsWith('/api/v1/me') && method === 'GET') return success({ baseCurrency: 'TWD' });
      if (url.includes('/ai-access/')) return unrelatedFailure();
      if (url.endsWith('/api/v1/me/preferences') || url.endsWith('/api/v1/auth/refresh')) {
        return failure('AUTH_UNAUTHORIZED', 401);
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();
    await openDisplayTab();
    await choose('USD');

    expect(ccySelect().value).toBe('TWD');
    expect(byTestId('settings-base-currency-error')).toBeNull();
  });
});

describe('Settings 頁頂的示範資料標示', () => {
  it('API mode 顯示基準幣例外行', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', routedFetch({ me: () => success({ baseCurrency: 'TWD' }) }));

    mountWithPinia(Settings, { lang: 'zh', theme: 'dark' });
    await flushAsync();

    const exception = byTestId('mock-data-notice-exception');
    expect(exception).not.toBeNull();
    expect(exception?.textContent).toContain(t('zh', 'mockDataNoticeExceptBaseCurrency'));
    // 既有標示不變:仍標示其餘區塊是示範資料
    expect(byTestId('mock-data-notice')?.textContent).toContain('示範資料');
  });
});
