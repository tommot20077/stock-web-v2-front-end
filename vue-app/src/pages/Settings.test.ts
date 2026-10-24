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
