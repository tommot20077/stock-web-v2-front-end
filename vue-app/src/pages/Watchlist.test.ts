import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import Watchlist from './Watchlist.vue';
// 原始碼字面(Vite `?raw`):鎖住「mock store / 假走勢 / 示範資料標示不存在」(沿用 Markets.test.ts 手法)。
import watchlistSource from './Watchlist.vue?raw';
import { t, tf } from '../i18n';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import {
  apiFailure,
  apiSuccess,
  assetDto,
  callsTo,
  watchlistDto,
  watchlistFetch,
  type WatchlistFetch,
} from '../testing/watchlistFetchDouble';
import type { WatchlistDto } from '../services/watchlistApi';
import { installFakeQuoteStream, type FakeQuoteStream } from '../testing/fakeQuoteStream';

// Phase 04.2 Plan 23(WATCH-03、D-14 / D-15 / D-17 / D-18 / D-20):Watchlist 頁整頁重建。
// 清單與報價皆來自 watchlist service;頁面不 import mock store、不再有假 sparkline 與示範資料標示。

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

interface Spies {
  chart: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function spies(): Spies {
  return { chart: vi.fn(), navigate: vi.fn() };
}

/** 每次 API mode 掛載都換上假 QuoteStream(04.2-24):頁面測試不碰 jsdom 的真 WebSocket(P-W7)。 */
let quotes: FakeQuoteStream;

async function mountApi(fetchImpl: WatchlistFetch, on: Spies = spies()) {
  document.cookie = 'XSRF-TOKEN=csrf-watchlist; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  quotes = installFakeQuoteStream();
  vi.stubGlobal('fetch', fetchImpl);
  mountWithPinia(Watchlist, { lang: 'zh', onChart: on.chart, onNavigate: on.navigate });
  await flushAsync();
  return on;
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).not.toBeNull();
  return el!;
}

function rows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[data-testid="watchlist-row"]')];
}

function rowSymbols(): string[] {
  return rows().map(el => el.getAttribute('data-symbol') ?? '');
}

function row(symbol: string): HTMLElement {
  const el = rows().find(candidate => candidate.getAttribute('data-symbol') === symbol);
  expect(el, `watchlist-row ${symbol}`).toBeTruthy();
  return el!;
}

function cell(rowEl: HTMLElement, id: string): HTMLElement {
  const el = rowEl.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  expect(el, `${id} in row ${rowEl.getAttribute('data-symbol')}`).not.toBeNull();
  return el!;
}

function tabs(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[data-testid="watchlist-tab"]')];
}

function tab(listId: string): HTMLElement {
  const el = tabs().find(candidate => candidate.getAttribute('data-list-id') === listId);
  expect(el, `watchlist-tab ${listId}`).toBeTruthy();
  return el!;
}

async function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync();
}

async function key(el: Element, keyName: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));
  await flushAsync();
}

const AAPL = assetDto('AAPL', {
  name: 'Apple Inc.', latestPrice: 218.4, change: 2.65, changePercent: 1.23, volumeText: '52.1M', currency: 'USD',
});
const USDTWD = assetDto('USD/TWD', {
  name: '美元/台幣', assetType: 'FX', market: 'FX', currency: 'TWD', tradeable: false,
  latestPrice: null, change: null, changePercent: null, volumeText: null,
});

function defaultList(): WatchlistDto {
  return { id: 'w1', name: '我的自選', items: [AAPL, USDTWD] };
}

describe('Watchlist 頁(API mode)— tracer:預設清單的真報價列', () => {
  it('首次載入:載入中…(文字)+ 3 條骨架,tabs 不渲染', async () => {
    const fetchImpl = watchlistFetch([], { list: () => new Promise<Response>(() => {}) });
    await mountApi(fetchImpl);

    const loading = requireTestid('watchlist-loading');
    expect(loading.textContent).toContain(t('zh', 'loading'));
    expect(loading.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(testid('watchlist-tabs')).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('tracer:list() 回預設清單 → h2、單一 tab(aria-selected)、工具列名稱與檔數', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);
    const page = requireTestid('watchlist-page');
    expect(page.querySelector('h2')?.textContent?.trim()).toBe(t('zh', 'watchlist'));
    expect(testid('watchlist-loading')).toBeNull();

    const tablist = requireTestid('watchlist-tabs');
    expect(tablist.getAttribute('role')).toBe('tablist');
    expect(tabs()).toHaveLength(1);
    expect(tab('w1').getAttribute('role')).toBe('tab');
    expect(tab('w1').getAttribute('aria-selected')).toBe('true');
    expect(tab('w1').textContent).toContain('我的自選');

    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('我的自選');
    expect(requireTestid('watchlist-count').textContent?.trim()).toBe(tf('zh', 'watchlistCount', { n: 2 }));
    expect(rowSymbols()).toEqual(['AAPL', 'USD/TWD']);
  });

  it('有報價列:價格 2 位、漲跌帶號 %(up)、成交量原樣、.ccy-tag 幣別、data-quote-source=rest', async () => {
    await mountApi(watchlistFetch([defaultList()]));

    const aapl = row('AAPL');
    expect(cell(aapl, 'watchlist-row-price').textContent?.trim()).toBe('218.40');
    const change = cell(aapl, 'watchlist-row-change');
    expect(change.textContent?.trim()).toBe('+1.23%');
    expect(change.classList.contains('up')).toBe(true);
    expect(aapl.querySelector('.col-vol')?.textContent?.trim()).toBe('52.1M');
    expect(aapl.querySelector('.ccy-tag')?.textContent?.trim()).toBe('USD');
    expect(aapl.textContent).toContain('Apple Inc.');
    expect(aapl.getAttribute('data-quote-source')).toBe('rest');
  });

  it('無報價標的(latestPrice === null):價格 / 漲跌 / 成交量皆 —,FX 無 .ccy-tag,data-quote-source=none', async () => {
    await mountApi(watchlistFetch([defaultList()]));

    const fx = row('USD/TWD');
    expect(cell(fx, 'watchlist-row-price').textContent?.trim()).toBe('—');
    expect(cell(fx, 'watchlist-row-change').textContent?.trim()).toBe('—');
    expect(fx.querySelector('.col-vol')?.textContent?.trim()).toBe('—');
    expect(fx.querySelector('.ccy-tag')).toBeNull();
    expect(fx.getAttribute('data-quote-source')).toBe('none');
  });

  it('依 assetType 格式化:FX 4 位、BOND 3 位殖利率與 change 3 位不加 %、CRYPTO 帶幣別與千分位', async () => {
    const list: WatchlistDto = {
      id: 'w1',
      name: '我的自選',
      items: [
        assetDto('EUR/USD', { assetType: 'FX', market: 'FX', currency: 'USD', tradeable: false, latestPrice: 1.08456, change: -0.0022, changePercent: -0.2 }),
        assetDto('US10Y', { assetType: 'BOND', market: 'US', tradeable: false, latestPrice: 4.1234, change: -0.012, changePercent: null }),
        assetDto('BTC', { assetType: 'CRYPTO', market: 'CRYPTO', currency: 'USD', latestPrice: 67000, change: 1600, changePercent: 2.5, volumeText: '' }),
      ],
    };
    await mountApi(watchlistFetch([list]));

    const eur = row('EUR/USD');
    expect(cell(eur, 'watchlist-row-price').textContent?.trim()).toBe('1.0846');
    expect(cell(eur, 'watchlist-row-change').textContent?.trim()).toBe('-0.20%');
    expect(cell(eur, 'watchlist-row-change').classList.contains('dn')).toBe(true);
    expect(eur.querySelector('.ccy-tag')).toBeNull();
    expect(eur.getAttribute('data-quote-source')).toBe('rest');

    const bond = row('US10Y');
    expect(cell(bond, 'watchlist-row-price').textContent?.trim()).toBe('4.123');
    expect(cell(bond, 'watchlist-row-change').textContent?.trim()).toBe('-0.012');
    expect(bond.querySelector('.ccy-tag')).toBeNull();

    const btc = row('BTC');
    expect(cell(btc, 'watchlist-row-price').textContent?.trim()).toBe('67,000.00');
    expect(cell(btc, 'watchlist-row-change').textContent?.trim()).toBe('+2.50%');
    expect(btc.querySelector('.ccy-tag')?.textContent?.trim()).toBe('USD');
    // volumeText 空字串 → —
    expect(btc.querySelector('.col-vol')?.textContent?.trim()).toBe('—');
  });

  it('無假走勢、無「即時行情更新」副標、無示範資料標示;表格下方報價說明', async () => {
    await mountApi(watchlistFetch([defaultList()]));

    const page = requireTestid('watchlist-page');
    expect(page.querySelector('svg polyline')).toBeNull();
    expect(document.body.textContent).not.toContain('即時行情更新');
    expect(testid('mock-data-notice')).toBeNull();
    expect(requireTestid('watchlist-quote-note').textContent?.trim()).toBe(t('zh', 'watchlistQuoteNote'));
  });

  it('列點擊 → emit chart({ sym })', async () => {
    const on = await mountApi(watchlistFetch([defaultList()]));

    await click(cell(row('AAPL'), 'watchlist-row-price'));
    expect(on.chart).toHaveBeenCalledWith({ sym: 'AAPL' });
  });

  it('100 檔 → 檔數 100 / 100 檔', async () => {
    const symbols = Array.from({ length: 100 }, (_, i) => `S${i}`);
    await mountApi(watchlistFetch([watchlistDto('w1', '滿的', symbols)]));

    expect(requireTestid('watchlist-count').textContent?.trim()).toBe(tf('zh', 'watchlistCount', { n: 100 }));
    expect(rows()).toHaveLength(100);
  });
});

describe('Watchlist 頁 — tabs', () => {
  const lists = () => [defaultList(), watchlistDto('w2', 'AI 概念', ['NVDA', 'META', 'GOOGL'])];

  it('點另一個 tab → 作用中改變、工具列與列跟著換', async () => {
    await mountApi(watchlistFetch(lists()));

    expect(tabs()).toHaveLength(2);
    await click(tab('w2'));

    expect(tab('w2').getAttribute('aria-selected')).toBe('true');
    expect(tab('w1').getAttribute('aria-selected')).toBe('false');
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('AI 概念');
    expect(rowSymbols()).toEqual(['NVDA', 'META', 'GOOGL']);
    const panel = document.body.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('id')).toBe(tab('w2').getAttribute('aria-controls'));
  });

  it('roving tabindex:作用中 tab 為 0、其餘 -1;← → 移動並自動啟用、焦點跟著走', async () => {
    await mountApi(watchlistFetch(lists()));

    expect(tab('w1').getAttribute('tabindex')).toBe('0');
    expect(tab('w2').getAttribute('tabindex')).toBe('-1');

    tab('w1').focus();
    await key(tab('w1'), 'ArrowRight');
    expect(tab('w2').getAttribute('aria-selected')).toBe('true');
    expect(tab('w2').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(tab('w2'));
    expect(rowSymbols()).toEqual(['NVDA', 'META', 'GOOGL']);

    // 最後一個再按 → 回到第一個(循環)
    await key(tab('w2'), 'ArrowRight');
    expect(tab('w1').getAttribute('aria-selected')).toBe('true');
    await key(tab('w1'), 'ArrowLeft');
    expect(tab('w2').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('w2'));
  });
});

describe('Watchlist 頁 — 空狀態與讀取失敗', () => {
  it('清單空 → watchlist-empty(標題 + body)+ 前往行情 emit navigate(markets);無報價說明', async () => {
    const on = await mountApi(watchlistFetch([watchlistDto('w1', '我的自選', [])]));

    const empty = requireTestid('watchlist-empty');
    expect(empty.textContent).toContain(t('zh', 'watchlistEmpty'));
    expect(empty.textContent).toContain(t('zh', 'watchlistEmptyBody'));
    expect(testid('watchlist-quote-note')).toBeNull();
    expect(testid('watchlist-table')).toBeNull();

    const go = requireTestid('watchlist-empty-go-markets');
    expect(go.textContent?.trim()).toBe(t('zh', 'watchlistGoMarkets'));
    await click(go);
    expect(on.navigate).toHaveBeenCalledWith('markets');
  });

  it('讀取失敗 → loadFailed + 診斷列(code / traceId,不露後端 message)+ 重試;新增清單 disabled;重試成功後顯示清單', async () => {
    const fetchImpl = watchlistFetch([defaultList()], {
      list: call => (call === 0 ? apiFailure('INTERNAL_ERROR', 'trace-load-1', 503) : apiSuccess([defaultList()])),
    });
    await mountApi(fetchImpl);

    const error = requireTestid('watchlist-error');
    expect(error.textContent).toContain(t('zh', 'loadFailed'));
    expect(requireTestid('watchlist-error-code').textContent?.trim()).toBe('INTERNAL_ERROR');
    expect(requireTestid('watchlist-trace-id').textContent).toContain('trace-load-1');
    expect(document.body.textContent).not.toContain('BackendMessageMustNotReachTheDom');
    expect((requireTestid('watchlist-new-list') as HTMLButtonElement).disabled).toBe(true);
    expect(testid('watchlist-tabs')).toBeNull();

    await click(requireTestid('watchlist-retry'));
    expect(testid('watchlist-error')).toBeNull();
    expect(tabs()).toHaveLength(1);
    expect(rowSymbols()).toEqual(['AAPL', 'USD/TWD']);
    expect((requireTestid('watchlist-new-list') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Watchlist 頁 — mock mode', () => {
  it('經 mock watchlistApi 渲染 mock 清單,零網路請求、不顯示示範資料標示', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new TypeError('no network in mock mode')));
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Watchlist, { lang: 'zh' });
    await flushAsync();

    expect(tabs().map(el => el.getAttribute('data-list-id'))).toEqual(['core', 'crypto', 'watchAI']);
    expect(rowSymbols()).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT']);
    expect(row('AAPL').getAttribute('data-quote-source')).toBe('rest');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(testid('mock-data-notice')).toBeNull();
  });
});

describe('Watchlist 頁 — 原始碼守門', () => {
  it('不 import mock portfolio store、無 sparkPoints、無 MockDataNotice、不直接 fetch', () => {
    expect(watchlistSource).not.toContain('stores/mockPortfolio');
    expect(watchlistSource).not.toContain('sparkPoints');
    expect(watchlistSource).not.toContain('MockDataNotice');
    expect(watchlistSource).not.toMatch(/\bfetch\(/);
  });
});

describe('App:Watchlist 前往行情', () => {
  it('空清單點「前往行情」→ App 切到行情頁', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    mountWithPinia(App);
    await flushAsync();
    useMockPortfolioStore().watchlists = [{ id: 'empty', name: '空清單', syms: [] }];

    await click(requireTestid('nav-watchlist'));
    expect(testid('watchlist-page')).not.toBeNull();

    await click(requireTestid('watchlist-empty-go-markets'));
    expect(testid('watchlist-page')).toBeNull();
    expect(document.body.querySelector('[data-testid="markets-star"]')).not.toBeNull();
  });
});

// =============== Task 2:建立 / 改名 / 刪除清單、移除項目、操作錯誤與上限 ===============

async function setValue(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushAsync(1);
}

async function submitForm(el: HTMLElement) {
  const form = el.closest('form');
  expect(form, 'enclosing form').not.toBeNull();
  form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushAsync();
}

function input(id: string): HTMLInputElement {
  return requireTestid(id) as HTMLInputElement;
}

function button(id: string): HTMLButtonElement {
  return requireTestid(id) as HTMLButtonElement;
}

function removeButton(symbol: string): HTMLButtonElement {
  const el = row(symbol).querySelector<HTMLButtonElement>('[data-testid="watchlist-remove"]');
  expect(el, `watchlist-remove in ${symbol}`).not.toBeNull();
  return el!;
}

describe('Watchlist 頁 — 建立清單', () => {
  it('+ 新增清單(中性 .btn-ghost-sm)→ 建立表單、輸入框聚焦;Enter 送出 → 新 tab 作用中、表單收起、焦點在新 tab', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);

    const newList = button('watchlist-new-list');
    expect(newList.classList.contains('btn-ghost-sm')).toBe(true);
    expect(testid('watchlist-create-form')).toBeNull();
    await click(newList);

    requireTestid('watchlist-create-form');
    const name = input('watchlist-create-name');
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('maxlength')).toBe('30');

    await setValue(name, '  半導體  ');
    await submitForm(name);

    const posts = callsTo(fetchImpl, 'POST', '/watchlists');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ name: '半導體' });
    expect(testid('watchlist-create-form')).toBeNull();
    expect(tabs()).toHaveLength(2);
    const created = tab('wl-created-1');
    expect(created.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(created);
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('半導體');
    requireTestid('watchlist-empty');
  });

  it('Esc 取消:表單收起、不送出、焦點回到 + 新增清單', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);

    await click(button('watchlist-new-list'));
    await key(input('watchlist-create-name'), 'Escape');

    expect(testid('watchlist-create-form')).toBeNull();
    expect(callsTo(fetchImpl, 'POST', '/watchlists')).toHaveLength(0);
    expect(document.activeElement).toBe(button('watchlist-new-list'));
  });

  it('名稱自檢:trim 後空白 / 超過 30 字 → watchlistErrName;同名 → watchlistErrDuplicateName;送出鈕 disabled 且不送出', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);
    await click(button('watchlist-new-list'));
    const name = input('watchlist-create-name');

    await setValue(name, '   ');
    expect(requireTestid('watchlist-name-error').textContent).toContain(t('zh', 'watchlistErrName'));
    expect(button('watchlist-create-submit').disabled).toBe(true);
    expect(name.getAttribute('aria-invalid')).toBe('true');

    await setValue(name, 'x'.repeat(31));
    expect(requireTestid('watchlist-name-error').textContent).toContain(t('zh', 'watchlistErrName'));
    expect(button('watchlist-create-submit').disabled).toBe(true);

    await setValue(name, '我的自選');
    expect(requireTestid('watchlist-name-error').textContent).toContain(t('zh', 'watchlistErrDuplicateName'));
    expect(button('watchlist-create-submit').disabled).toBe(true);

    await submitForm(name);
    expect(callsTo(fetchImpl, 'POST', '/watchlists')).toHaveLength(0);

    await setValue(name, 'x'.repeat(30));
    expect(testid('watchlist-name-error')).toBeNull();
    expect(button('watchlist-create-submit').disabled).toBe(false);
  });

  it('20 個清單 → + 新增清單 disabled + 上限文案;19 個時可用', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => watchlistDto(`w${i}`, `清單 ${i}`, []));
    await mountApi(watchlistFetch(twenty));

    expect(button('watchlist-new-list').disabled).toBe(true);
    expect(requireTestid('watchlist-limit-lists').textContent?.trim()).toBe(t('zh', 'watchlistListsLimitReached'));

    cleanupMounted();
    await mountApi(watchlistFetch(twenty.slice(0, 19)));
    expect(button('watchlist-new-list').disabled).toBe(false);
    expect(testid('watchlist-limit-lists')).toBeNull();
  });

  it('後端 400 fields.watchlists → 操作錯誤區 watchlistErrListLimit + 診斷列', async () => {
    const fetchImpl = watchlistFetch([defaultList()], {
      create: () => apiFailure('VALIDATION_FAILED', 'trace-limit', 400, { watchlists: 'at most 20' }),
    });
    await mountApi(fetchImpl);
    await click(button('watchlist-new-list'));
    await setValue(input('watchlist-create-name'), '第 21 個');
    await click(button('watchlist-create-submit'));

    const opError = requireTestid('watchlist-op-error');
    expect(opError.getAttribute('role')).toBe('alert');
    expect(opError.textContent).toContain(t('zh', 'watchlistErrListLimit'));
    expect(requireTestid('watchlist-op-error-code').textContent?.trim()).toBe('VALIDATION_FAILED');
    expect(requireTestid('watchlist-op-error-trace-id').textContent).toContain('trace-limit');
    expect(document.body.textContent).not.toContain('BackendMessageMustNotReachTheDom');
    expect(tabs()).toHaveLength(1);
  });
});

describe('Watchlist 頁 — 改名', () => {
  it('改名 → 輸入框預填現名並聚焦 → 儲存名稱 → PATCH,tab 與標題更新', async () => {
    const fetchImpl = watchlistFetch([defaultList(), watchlistDto('w2', 'AI 概念', ['NVDA'])]);
    await mountApi(fetchImpl);

    await click(button('watchlist-rename'));
    const name = input('watchlist-rename-input');
    expect(name.value).toBe('我的自選');
    expect(document.activeElement).toBe(name);

    await setValue(name, '長線');
    await click(button('watchlist-rename-save'));

    const patches = callsTo(fetchImpl, 'PATCH', '/watchlists/w1');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ name: '長線' });
    expect(testid('watchlist-rename-input')).toBeNull();
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('長線');
    expect(tab('w1').textContent).toContain('長線');
  });

  it('改名自檢:與其他清單同名 → watchlistErrDuplicateName 且儲存 disabled;維持原名可存;取消回原狀', async () => {
    const fetchImpl = watchlistFetch([defaultList(), watchlistDto('w2', 'AI 概念', ['NVDA'])]);
    await mountApi(fetchImpl);

    await click(button('watchlist-rename'));
    const name = input('watchlist-rename-input');
    await setValue(name, 'AI 概念');
    expect(requireTestid('watchlist-name-error').textContent).toContain(t('zh', 'watchlistErrDuplicateName'));
    expect(button('watchlist-rename-save').disabled).toBe(true);

    await setValue(name, '我的自選');
    expect(testid('watchlist-name-error')).toBeNull();

    await click(button('watchlist-rename-cancel'));
    expect(testid('watchlist-rename-input')).toBeNull();
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('我的自選');
    expect(callsTo(fetchImpl, 'PATCH', '/watchlists')).toHaveLength(0);
  });

  it('後端 409 重名 → 操作錯誤區 watchlistErrDuplicateName', async () => {
    const fetchImpl = watchlistFetch([defaultList()], {
      rename: () => apiFailure('DUPLICATE_RESOURCE', 'trace-dup', 409, { name: 'already exists' }),
    });
    await mountApi(fetchImpl);

    await click(button('watchlist-rename'));
    await setValue(input('watchlist-rename-input'), '別的分頁剛建的名字');
    await click(button('watchlist-rename-save'));

    expect(requireTestid('watchlist-op-error').textContent).toContain(t('zh', 'watchlistErrDuplicateName'));
    expect(requireTestid('watchlist-op-error-code').textContent?.trim()).toBe('DUPLICATE_RESOURCE');
  });
});

describe('Watchlist 頁 — 刪除清單', () => {
  it('刪除 → 行內確認(名稱與檔數)、焦點在取消、無唯一清單附註;確認 → DELETE,作用中改為第一個清單', async () => {
    const fetchImpl = watchlistFetch([defaultList(), watchlistDto('w2', 'AI 概念', ['NVDA', 'META'])]);
    await mountApi(fetchImpl);
    await click(tab('w2'));

    await click(button('watchlist-delete'));
    const confirm = requireTestid('watchlist-delete-confirm');
    expect(confirm.getAttribute('role')).toBe('group');
    expect(confirm.textContent).toContain(tf('zh', 'watchlistDeleteConfirm', { name: 'AI 概念', n: 2 }));
    expect(confirm.textContent).not.toContain(t('zh', 'watchlistDeleteLastNote'));
    expect(document.activeElement).toBe(button('watchlist-delete-confirm-cancel'));
    expect(button('watchlist-delete-confirm-submit').classList.contains('btn-danger')).toBe(true);

    await click(button('watchlist-delete-confirm-submit'));
    expect(callsTo(fetchImpl, 'DELETE', '/watchlists/w2')).toHaveLength(1);
    expect(testid('watchlist-delete-confirm')).toBeNull();
    expect(tabs().map(el => el.getAttribute('data-list-id'))).toEqual(['w1']);
    expect(tab('w1').getAttribute('aria-selected')).toBe('true');
    expect(rowSymbols()).toEqual(['AAPL', 'USD/TWD']);
  });

  it('取消 → 確認區收起、不送出、焦點回到刪除清單', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);

    await click(button('watchlist-delete'));
    await click(button('watchlist-delete-confirm-cancel'));
    expect(testid('watchlist-delete-confirm')).toBeNull();
    expect(callsTo(fetchImpl, 'DELETE', '/watchlists')).toHaveLength(0);
    expect(document.activeElement).toBe(button('watchlist-delete'));
  });

  it('只剩一個清單 → 確認區另顯示 watchlistDeleteLastNote;刪除後重讀,顯示後端重建的空「我的自選」', async () => {
    const fetchImpl = watchlistFetch([defaultList()]);
    await mountApi(fetchImpl);

    await click(button('watchlist-delete'));
    expect(requireTestid('watchlist-delete-confirm').textContent).toContain(t('zh', 'watchlistDeleteLastNote'));
    await click(button('watchlist-delete-confirm-submit'));

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(tabs().map(el => el.getAttribute('data-list-id'))).toEqual(['wl-default-1']);
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('我的自選');
    requireTestid('watchlist-empty');
  });
});

describe('Watchlist 頁 — 移除項目', () => {
  it('✕(36 × 36、aria-label 帶清單名與代號)→ 立即 DELETE(以 uuid)、不觸發 chart、焦點移到下一列的 ✕', async () => {
    const list = watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT']);
    const fetchImpl = watchlistFetch([list]);
    const on = await mountApi(fetchImpl);

    const remove = removeButton('AAPL');
    expect(remove.getAttribute('aria-label')).toBe(tf('zh', 'watchlistRemoveAria', { name: '我的自選', symbol: 'AAPL' }));
    await click(remove);

    expect(callsTo(fetchImpl, 'DELETE', `/watchlists/w1/items/${list.items[0].uuid}`)).toHaveLength(1);
    expect(on.chart).not.toHaveBeenCalled();
    expect(testid('watchlist-delete-confirm')).toBeNull();
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT']);
    expect(document.activeElement).toBe(removeButton('NVDA'));
    expect(requireTestid('watchlist-count').textContent?.trim()).toBe(tf('zh', 'watchlistCount', { n: 2 }));
  });

  it('移除最後一列 → 焦點移到清單名稱', async () => {
    await mountApi(watchlistFetch([watchlistDto('w1', '我的自選', ['AAPL', 'NVDA'])]));

    await click(removeButton('NVDA'));
    expect(rowSymbols()).toEqual(['AAPL']);
    expect(document.activeElement).toBe(requireTestid('watchlist-toolbar-name'));
  });
});

describe('Watchlist 頁 — 操作錯誤', () => {
  it('WATCHLIST_NOT_FOUND → watchlistErrNotFound + 診斷列並重讀清單;下一次成功操作清除錯誤', async () => {
    let failRemove = true;
    const fetchImpl = watchlistFetch([watchlistDto('w1', '我的自選', ['AAPL', 'NVDA'])], {
      removeItem: () => (failRemove ? apiFailure('WATCHLIST_NOT_FOUND', 'trace-nf', 404) : undefined),
    });
    await mountApi(fetchImpl);

    await click(removeButton('AAPL'));
    const opError = requireTestid('watchlist-op-error');
    expect(opError.getAttribute('role')).toBe('alert');
    expect(opError.textContent).toContain(t('zh', 'watchlistErrNotFound'));
    expect(requireTestid('watchlist-op-error-code').textContent?.trim()).toBe('WATCHLIST_NOT_FOUND');
    expect(requireTestid('watchlist-op-error-trace-id').textContent).toContain('trace-nf');
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);

    failRemove = false;
    await click(removeButton('AAPL'));
    expect(testid('watchlist-op-error')).toBeNull();
    expect(rowSymbols()).toEqual(['NVDA']);
  });

  it('5xx(結果不確定)→ watchlistErrUnknown 並重讀;切換 tab 清除錯誤', async () => {
    const fetchImpl = watchlistFetch([defaultList(), watchlistDto('w2', 'AI 概念', ['NVDA'])], {
      removeItem: () => apiFailure('INTERNAL_ERROR', 'trace-500', 500),
    });
    await mountApi(fetchImpl);

    await click(removeButton('AAPL'));
    expect(requireTestid('watchlist-op-error').textContent).toContain(t('zh', 'watchlistErrUnknown'));
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);

    await click(tab('w2'));
    expect(testid('watchlist-op-error')).toBeNull();
  });

  it('403 / CSRF / 網路失敗 → 各自文案,不重讀', async () => {
    const cases: Array<[() => Response | Promise<Response>, string]> = [
      [() => apiFailure('AUTH_FORBIDDEN', 'trace-403', 403), 'watchlistErrForbidden'],
      [() => apiFailure('AUTH_CSRF_TOKEN_INVALID', 'trace-csrf', 403), 'watchlistErrCsrf'],
      [() => Promise.reject(new TypeError('offline')), 'watchlistErrNetwork'],
    ];
    for (const [respond, copyKey] of cases) {
      const fetchImpl = watchlistFetch([defaultList()], { remove: respond });
      await mountApi(fetchImpl);
      await click(button('watchlist-delete'));
      await click(button('watchlist-delete-confirm-submit'));

      expect(requireTestid('watchlist-op-error').textContent, copyKey).toContain(t('zh', copyKey));
      expect(callsTo(fetchImpl, 'GET', '/watchlists'), copyKey).toHaveLength(1);
      expect(tabs(), copyKey).toHaveLength(1);
      cleanupMounted();
    }
  });
});

describe('Watchlist 頁 — mock mode 清單管理', () => {
  it('mock mode 可建立、改名、刪除清單與移除項目(經 mock watchlistApi)', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    mountWithPinia(Watchlist, { lang: 'zh' });
    await flushAsync();

    await click(button('watchlist-new-list'));
    await setValue(input('watchlist-create-name'), '新清單');
    await click(button('watchlist-create-submit'));
    expect(tabs()).toHaveLength(4);
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('新清單');

    await click(button('watchlist-rename'));
    await setValue(input('watchlist-rename-input'), '改過的');
    await click(button('watchlist-rename-save'));
    expect(requireTestid('watchlist-toolbar-name').textContent?.trim()).toBe('改過的');

    await click(button('watchlist-delete'));
    await click(button('watchlist-delete-confirm-submit'));
    expect(tabs()).toHaveLength(3);
    expect(rowSymbols()).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT']);

    await click(removeButton('NVDA'));
    expect(rowSymbols()).toEqual(['AAPL', '2330.TW', 'MSFT']);
  });
});

// =============== Task 3:拖拉與排序模式(↑ ↓)持久化 ===============

/** 只假 setTimeout / clearTimeout(debounce);fetch → apiClient 鏈靠真 setImmediate hop 跑完。 */
function fakeDebounceTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

async function settle(times = 6) {
  const g = globalThis as unknown as { setImmediate: (callback: () => void) => unknown };
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => { g.setImmediate(resolve); });
    await Promise.resolve();
  }
}

async function press(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle(2);
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await settle();
}

function moveButton(symbol: string, direction: 'up' | 'down'): HTMLButtonElement {
  const el = row(symbol).querySelector<HTMLButtonElement>(`[data-testid="watchlist-move-${direction}"]`);
  expect(el, `watchlist-move-${direction} in ${symbol}`).not.toBeNull();
  return el!;
}

function statusTexts(): string[] {
  return [...document.body.querySelectorAll('[role="status"]')].map(el => el.textContent?.trim() ?? '');
}

function putBodies(fetchImpl: WatchlistFetch): string[][] {
  return callsTo(fetchImpl, 'PUT', '/items/order').map(([, init]) => (JSON.parse(String(init?.body)) as { assetIds: string[] }).assetIds);
}

function uuidOf(list: WatchlistDto, symbol: string): string {
  return list.items.find(item => item.symbol === symbol)!.uuid;
}

describe('Watchlist 頁 — 排序模式(鍵盤 / 觸控)', () => {
  const three = () => watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT']);

  it('調整順序(aria-pressed)→ 每列 ↑ ↓(aria-label 帶代號);首列 ↑、末列 ↓ disabled;✕ 隱藏、列點擊停用', async () => {
    const on = await mountApi(watchlistFetch([three()]));

    const toggle = button('watchlist-reorder');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent?.trim()).toBe(t('zh', 'watchlistReorder'));
    expect(document.body.querySelector('[data-testid="watchlist-move-up"]')).toBeNull();

    await click(toggle);
    expect(button('watchlist-reorder').getAttribute('aria-pressed')).toBe('true');
    expect(button('watchlist-reorder').textContent?.trim()).toBe(t('zh', 'watchlistReorderDone'));
    expect(moveButton('AAPL', 'up').getAttribute('aria-label')).toBe(tf('zh', 'watchlistMoveUp', { symbol: 'AAPL' }));
    expect(moveButton('AAPL', 'down').getAttribute('aria-label')).toBe(tf('zh', 'watchlistMoveDown', { symbol: 'AAPL' }));
    expect(moveButton('AAPL', 'up').disabled).toBe(true);
    expect(moveButton('AAPL', 'down').disabled).toBe(false);
    expect(moveButton('MSFT', 'down').disabled).toBe(true);
    expect(document.body.querySelector('[data-testid="watchlist-remove"]')).toBeNull();

    await click(cell(row('NVDA'), 'watchlist-row-price'));
    expect(on.chart).not.toHaveBeenCalled();

    await click(button('watchlist-reorder'));
    expect(button('watchlist-reorder').getAttribute('aria-pressed')).toBe('false');
    expect(document.body.querySelector('[data-testid="watchlist-move-up"]')).toBeNull();
  });

  it('1 檔 → ↑ ↓ 皆 disabled', async () => {
    await mountApi(watchlistFetch([watchlistDto('w1', '我的自選', ['AAPL'])]));
    await click(button('watchlist-reorder'));

    expect(moveButton('AAPL', 'up').disabled).toBe(true);
    expect(moveButton('AAPL', 'down').disabled).toBe(true);
  });

  it('↓ → 本地重排、焦點停在被移動列的同一顆按鈕、role=status 播報;500 ms 後送整份順序', async () => {
    const list = three();
    const fetchImpl = watchlistFetch([list]);
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    await press(moveButton('AAPL', 'down'));
    expect(rowSymbols()).toEqual(['NVDA', 'AAPL', 'MSFT']);
    expect(document.activeElement).toBe(moveButton('AAPL', 'down'));
    expect(statusTexts()).toContain(tf('zh', 'watchlistMovedAnnounce', { symbol: 'AAPL', pos: 2 }));
    expect(requireTestid('watchlist-reorder-saving').textContent?.trim()).toBe(t('zh', 'watchlistReorderSaving'));
    expect(requireTestid('watchlist-reorder-saving').getAttribute('role')).toBe('status');

    await advance(499);
    expect(putBodies(fetchImpl)).toHaveLength(0);
    await advance(1);
    expect(putBodies(fetchImpl)).toEqual([[uuidOf(list, 'NVDA'), uuidOf(list, 'AAPL'), uuidOf(list, 'MSFT')]]);
    expect(callsTo(fetchImpl, 'PUT', '/watchlists/w1/items/order')).toHaveLength(1);
    expect(testid('watchlist-reorder-saving')).toBeNull();
    expect(rowSymbols()).toEqual(['NVDA', 'AAPL', 'MSFT']);
  });

  it('移到首位後 ↑ disabled,焦點仍留在被移動的列上', async () => {
    await mountApi(watchlistFetch([three()]));
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    await press(moveButton('NVDA', 'up'));
    expect(rowSymbols()).toEqual(['NVDA', 'AAPL', 'MSFT']);
    expect(moveButton('NVDA', 'up').disabled).toBe(true);
    expect(row('NVDA').contains(document.activeElement)).toBe(true);
  });

  it('連續三次移動只送一次(最後順序)', async () => {
    const list = three();
    const fetchImpl = watchlistFetch([list]);
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    await press(moveButton('AAPL', 'down'));
    await advance(200);
    await press(moveButton('AAPL', 'down'));
    await advance(200);
    await press(moveButton('NVDA', 'down'));
    expect(rowSymbols()).toEqual(['MSFT', 'NVDA', 'AAPL']);
    await advance(499);
    expect(putBodies(fetchImpl)).toHaveLength(0);
    await advance(1);
    expect(putBodies(fetchImpl)).toEqual([[uuidOf(list, 'MSFT'), uuidOf(list, 'NVDA'), uuidOf(list, 'AAPL')]]);
  });

  it('同時間只有一個請求在飛:第二批等第一個完成後才送最新順序', async () => {
    const list = three();
    let releaseFirst: (() => void) | null = null;
    const fetchImpl = watchlistFetch([list], {
      reorder: (_listId, assetIds, call) => (call === 0
        ? new Promise<Response>(resolve => { releaseFirst = () => resolve(apiSuccess({ ...list, items: assetIds.map(id => list.items.find(item => item.uuid === id)!) })); })
        : undefined),
    });
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    await press(moveButton('AAPL', 'down'));
    await advance(500);
    expect(putBodies(fetchImpl)).toHaveLength(1);

    await press(moveButton('MSFT', 'up'));
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT', 'AAPL']);
    await advance(500);
    expect(putBodies(fetchImpl), '第一個還在飛,不得送第二個').toHaveLength(1);
    requireTestid('watchlist-reorder-saving');

    releaseFirst!();
    await settle();
    expect(putBodies(fetchImpl)).toHaveLength(2);
    expect(putBodies(fetchImpl)[1]).toEqual([uuidOf(list, 'NVDA'), uuidOf(list, 'MSFT'), uuidOf(list, 'AAPL')]);
    await settle();
    expect(rowSymbols(), '第一個回應不得蓋掉較新的本地順序').toEqual(['NVDA', 'MSFT', 'AAPL']);
    expect(testid('watchlist-reorder-saving')).toBeNull();
  });

  it('409 WATCHLIST_ORDER_CONFLICT → 重讀清單回到伺服器順序 + watchlistErrOrderConflict', async () => {
    const fetchImpl = watchlistFetch([three()], {
      reorder: () => apiFailure('WATCHLIST_ORDER_CONFLICT', 'trace-409', 409),
    });
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    await press(moveButton('AAPL', 'down'));
    expect(rowSymbols()).toEqual(['NVDA', 'AAPL', 'MSFT']);
    await advance(500);
    await settle();

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(rowSymbols()).toEqual(['AAPL', 'NVDA', 'MSFT']);
    expect(requireTestid('watchlist-op-error').textContent).toContain(t('zh', 'watchlistErrOrderConflict'));
    expect(requireTestid('watchlist-op-error-code').textContent?.trim()).toBe('WATCHLIST_ORDER_CONFLICT');
  });
});

describe('Watchlist 頁 — 拖拉(HTML5 DnD)', () => {
  function drag(type: string, el: Element) {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }

  it('dragstart → dragover 顯示指示線 → drop 本地重排(樂觀),500 ms 後送 PUT', async () => {
    const list = watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT']);
    const fetchImpl = watchlistFetch([list]);
    await mountApi(fetchImpl);
    fakeDebounceTimers();

    expect(row('AAPL').getAttribute('draggable')).toBe('true');
    const grip = row('AAPL').querySelector('.grip');
    expect(grip?.getAttribute('aria-hidden')).toBe('true');

    drag('dragstart', row('MSFT'));
    drag('dragover', row('AAPL'));
    await settle(2);
    expect(row('AAPL').classList.contains('drop-before')).toBe(true);

    drag('drop', row('AAPL'));
    drag('dragend', row('MSFT'));
    await settle(2);
    expect(rowSymbols()).toEqual(['MSFT', 'AAPL', 'NVDA']);
    expect(document.body.querySelector('.drop-before, .drop-after')).toBeNull();

    await advance(500);
    expect(putBodies(fetchImpl)).toEqual([[uuidOf(list, 'MSFT'), uuidOf(list, 'AAPL'), uuidOf(list, 'NVDA')]]);
  });

  it('往下拖到最後一列 → 指示線在目標列下緣,放開後成為最後一列', async () => {
    await mountApi(watchlistFetch([watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT'])]));
    fakeDebounceTimers();

    drag('dragstart', row('AAPL'));
    drag('dragover', row('MSFT'));
    await settle(2);
    expect(row('MSFT').classList.contains('drop-after')).toBe(true);
    drag('drop', row('MSFT'));
    await settle(2);
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT', 'AAPL']);
  });

  it('排序模式時列不可拖曳、不渲染把手', async () => {
    await mountApi(watchlistFetch([watchlistDto('w1', '我的自選', ['AAPL', 'NVDA'])]));
    await click(button('watchlist-reorder'));

    expect(row('AAPL').getAttribute('draggable')).toBe('false');
    expect(row('AAPL').querySelector('.grip')).toBeNull();
  });
});

// =============== 04.2-24:即時報價疊加(WATCH-04;D-21 / D-23 / D-24;UI-SPEC §8 / §9、U-20、U-26)===============

const AAPL_GET = assetDto('AAPL', {
  name: 'Apple Inc.', latestPrice: 215.75, change: 2.65, changePercent: 1.24, volumeText: '52.1M', currency: 'USD',
});
const BTC = assetDto('BTC', {
  name: 'Bitcoin', assetType: 'CRYPTO', market: 'CRYPTO', currency: 'USD',
  latestPrice: 67000, change: 100, changePercent: 0.15, volumeText: '1.2K',
});
const USDTWD_QUOTED = assetDto('USD/TWD', {
  name: '美元/台幣', assetType: 'FX', market: 'FX', currency: 'TWD', tradeable: false,
  latestPrice: 32.1, change: 0.05, changePercent: 0.16, volumeText: null,
});

function liveLists(): WatchlistDto[] {
  return [
    { id: 'w1', name: '我的自選', items: [AAPL_GET, BTC, USDTWD] },
    { id: 'w2', name: '科技', items: [assetDto('MSFT', { latestPrice: 410 })] },
  ];
}

function liveStatus(): HTMLElement {
  return requireTestid('live-quote-status');
}

function rowLive(symbol: string): HTMLElement | null {
  return row(symbol).querySelector<HTMLElement>('[data-testid="watchlist-row-live"]');
}

/**
 * U-26:非 live 狀態下,頁面文字除了「即時報價」本身之外不得出現「即時」,也不得有任何即時圓點。
 * 表格下方的 `watchlist-quote-note` 是 §8 規定常駐的圖例(說明 ● 的意思),不是即時宣稱,檢查時排除。
 */
function expectNoLiveClaims() {
  const page = requireTestid('watchlist-page').cloneNode(true) as HTMLElement;
  page.querySelector('[data-testid="watchlist-quote-note"]')?.remove();
  // 「即時報價」(狀態列本身的名詞)與「非即時」(被取代附註的否定說法)不是即時宣稱。
  const text = (page.textContent ?? '').replace(/即時報價|非即時/g, '');
  expect(text).not.toContain('即時');
  expect(text).not.toContain('●');
  expect(document.body.querySelector('[data-testid="watchlist-row-live"]')).toBeNull();
  expect(document.body.querySelector('.live-dot.solid')).toBeNull();
}

function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(r => { resolve = r; });
  return { promise, resolve };
}

describe('Watchlist 頁 — 即時報價疊加(04.2-24)', () => {
  it('只 watch 作用中清單的 STOCK / CRYPTO(FX 不訂閱,U-20);切 tab 先釋放舊集合再 watch 新集合;卸載釋放', async () => {
    await mountApi(watchlistFetch(liveLists()));

    expect(quotes.watch).toHaveBeenCalledTimes(1);
    expect(quotes.watch.mock.calls[0][0]).toEqual(['AAPL', 'BTC']);

    await click(tab('w2'));
    expect(quotes.log).toEqual(['watch:AAPL,BTC', 'release:AAPL,BTC', 'watch:MSFT']);
    expect(quotes.activeSets()).toEqual([['MSFT']]);

    cleanupMounted();
    expect(quotes.activeSets()).toEqual([]);
  });

  it('tracer:status live + AAPL tick 218.4 → 價格 218.40、data-quote-source=ws、● + sr-only「即時」;FX 列無 ●', async () => {
    await mountApi(watchlistFetch(liveLists()));
    quotes.setStatus('live');
    await flushAsync(1);

    // 還沒收到 tick:REST 值,沒有即時標記。
    expect(row('AAPL').getAttribute('data-quote-source')).toBe('rest');
    expect(rowLive('AAPL')).toBeNull();
    expect(liveStatus().getAttribute('data-live-status')).toBe('live');

    quotes.pushTick('AAPL', 218.4);
    await flushAsync(1);

    const aapl = row('AAPL');
    expect(aapl.getAttribute('data-quote-source')).toBe('ws');
    expect(cell(aapl, 'watchlist-row-price').textContent).toContain('218.40');
    const live = rowLive('AAPL');
    expect(live, 'watchlist-row-live').not.toBeNull();
    expect(live!.querySelector('.live-dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(live!.querySelector('.sr-only')?.textContent).toBe(t('zh', 'liveQuoteRowLive'));
    // 漲跌依 previousClose(215.75 − 2.65 = 213.10)重算:+5.30 / +2.49%
    expect(cell(aapl, 'watchlist-row-change').textContent).toBe('+2.49%');

    // FX 永遠沒有 tick:無 ●,data-quote-source 依 GET(這裡 latestPrice null → none)。
    expect(rowLive('USD/TWD')).toBeNull();
    expect(row('USD/TWD').getAttribute('data-quote-source')).toBe('none');
    // 沒有 tick 的 BTC 仍是 rest
    expect(row('BTC').getAttribute('data-quote-source')).toBe('rest');
    expect(rowLive('BTC')).toBeNull();
  });

  it('FX 列有 GET 報價且 stream live:仍為 rest、永不顯示 ●(partial,P-W6)', async () => {
    await mountApi(watchlistFetch([{ id: 'w1', name: '我的自選', items: [AAPL_GET, USDTWD_QUOTED] }]));
    quotes.setStatus('live');
    quotes.pushTick('USD/TWD', 33);
    await flushAsync(1);

    expect(quotes.watch).toHaveBeenCalledWith(['AAPL']);
    expect(row('USD/TWD').getAttribute('data-quote-source')).toBe('rest');
    expect(rowLive('USD/TWD')).toBeNull();
    expect(cell(row('USD/TWD'), 'watchlist-row-price').textContent).toBe('32.1000');
  });

  it('degraded → 所有列無 ●、AAPL 停在 218.40、data-quote-source=rest;頁首狀態 degraded(D-23 不假裝即時)', async () => {
    await mountApi(watchlistFetch(liveLists()));
    quotes.setStatus('live');
    quotes.pushTick('AAPL', 218.4);
    await flushAsync(1);
    expect(rowLive('AAPL')).not.toBeNull();

    quotes.setStatus('degraded');
    await flushAsync(1);

    expect(liveStatus().getAttribute('data-live-status')).toBe('degraded');
    expect(row('AAPL').getAttribute('data-quote-source')).toBe('rest');
    expect(cell(row('AAPL'), 'watchlist-row-price').textContent).toContain('218.40');
    expectNoLiveClaims();
  });

  it('connecting / closed / idle:頁面不出現「即時」標記(U-26);idle 不渲染狀態列', async () => {
    await mountApi(watchlistFetch(liveLists()));
    quotes.pushTick('AAPL', 218.4);

    quotes.setStatus('connecting');
    await flushAsync(1);
    expect(liveStatus().getAttribute('data-live-status')).toBe('connecting');
    expectNoLiveClaims();

    quotes.setStatus('closed');
    await flushAsync(1);
    expect(liveStatus().getAttribute('data-live-status')).toBe('closed');
    expectNoLiveClaims();

    quotes.setStatus('idle');
    await flushAsync(1);
    expect(testid('live-quote-status')).toBeNull();
    expectNoLiveClaims();
  });

  it('replaced → 顯示被取代文案;點「在此分頁重新連線」呼叫 quotes.reconnect() 一次(不自動重連)', async () => {
    await mountApi(watchlistFetch(liveLists()));
    quotes.setStatus('replaced');
    await flushAsync(1);

    expect(liveStatus().textContent).toContain(t('zh', 'liveQuoteReplaced'));
    expect(quotes.reconnect).not.toHaveBeenCalled();
    expectNoLiveClaims();

    await click(requireTestid('live-quote-reconnect'));
    expect(quotes.reconnect).toHaveBeenCalledTimes(1);
  });

  it('狀態列位在頁首 h2 之下(取代舊副標)', async () => {
    await mountApi(watchlistFetch(liveLists()));
    quotes.setStatus('live');
    await flushAsync(1);

    const head = requireTestid('watchlist-page').querySelector('.head-main');
    expect(head?.querySelector('h2')).not.toBeNull();
    expect(head?.querySelector('[data-testid="live-quote-status"]')).not.toBeNull();
  });

  it('resyncSeq 遞增 → 靜默重讀 GET(不閃 watchlist-loading),新值取代舊列', async () => {
    const second = pendingResponse();
    const fetchImpl = watchlistFetch(liveLists(), {
      list: call => (call === 0 ? apiSuccess(liveLists()) : second.promise),
    });
    await mountApi(fetchImpl);
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);

    quotes.bumpResync();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(testid('watchlist-loading')).toBeNull();
    expect(rowSymbols()).toEqual(['AAPL', 'BTC', 'USD/TWD']);

    const refreshed = liveLists();
    refreshed[0].items = [{ ...AAPL_GET, latestPrice: 220.5 }, BTC, USDTWD];
    second.resolve(apiSuccess(refreshed));
    await flushAsync();
    expect(cell(row('AAPL'), 'watchlist-row-price').textContent).toBe('220.50');
  });

  it('每 5 分鐘靜默重讀一次;重讀失敗保留舊值、不顯示錯誤區', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchImpl = watchlistFetch(liveLists(), {
      list: call => (call === 0 ? apiSuccess(liveLists()) : apiFailure('INTERNAL_ERROR', 'trace-500', 500)),
    });
    await mountApi(fetchImpl);
    await settle();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await settle();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);

    vi.advanceTimersByTime(1);
    await settle();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(testid('watchlist-loading')).toBeNull();
    expect(testid('watchlist-error')).toBeNull();
    expect(testid('watchlist-op-error')).toBeNull();
    expect(rowSymbols()).toEqual(['AAPL', 'BTC', 'USD/TWD']);
    expect(cell(row('AAPL'), 'watchlist-row-price').textContent).toBe('215.75');
  });

  it('排序尚未儲存時不做靜默重讀(避免伺服器舊順序蓋掉本地排序)', async () => {
    const fetchImpl = watchlistFetch(liveLists());
    await mountApi(fetchImpl);
    fakeDebounceTimers();
    await click(button('watchlist-reorder'));
    await press(moveButton('BTC', 'up'));
    expect(rowSymbols()).toEqual(['BTC', 'AAPL', 'USD/TWD']);

    quotes.bumpResync();
    await settle();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);
    expect(rowSymbols()).toEqual(['BTC', 'AAPL', 'USD/TWD']);
  });
});

// =====================================================================================
// 04.2-review WR-06:較舊的 GET 回應(靜默重讀 / 重試)不得蓋掉較新的本地狀態。
// =====================================================================================

describe('Watchlist 頁 — 過時 GET 回應守門(04.2-review WR-06)', () => {
  const three = () => watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT']);

  it('靜默重讀在飛時移除 AAPL:DELETE 先回、較舊的 GET 後到 → AAPL 不得復活', async () => {
    const stale = pendingResponse();
    const fetchImpl = watchlistFetch([three()], {
      list: call => (call === 0 ? apiSuccess([three()]) : stale.promise),
    });
    await mountApi(fetchImpl);
    quotes.bumpResync();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);

    await click(removeButton('AAPL'));
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT']);

    stale.resolve(apiSuccess([three()]));
    await flushAsync();
    expect(rowSymbols(), '較舊的 GET 不得讓已移除的項目復活').toEqual(['NVDA', 'MSFT']);
  });

  it('靜默重讀在飛時本地重排:較舊的 GET 後到不得還原順序,隨後的 PUT 送出使用者的新順序', async () => {
    const list = three();
    const stale = pendingResponse();
    const fetchImpl = watchlistFetch([list], {
      list: call => (call === 0 ? apiSuccess([three()]) : stale.promise),
    });
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    quotes.bumpResync();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    fakeDebounceTimers();

    await press(moveButton('AAPL', 'down'));
    expect(rowSymbols()).toEqual(['NVDA', 'AAPL', 'MSFT']);

    stale.resolve(apiSuccess([three()]));
    await settle();
    expect(rowSymbols(), '較舊的 GET 不得還原樂觀重排').toEqual(['NVDA', 'AAPL', 'MSFT']);

    await advance(500);
    expect(putBodies(fetchImpl)).toEqual([[uuidOf(list, 'NVDA'), uuidOf(list, 'AAPL'), uuidOf(list, 'MSFT')]]);
  });

  it('靜默重讀在飛時建立清單:較舊的 GET 後到不得讓新清單消失、作用中 tab 不跳回第一個', async () => {
    const stale = pendingResponse();
    const fetchImpl = watchlistFetch([defaultList()], {
      list: call => (call === 0 ? apiSuccess([defaultList()]) : stale.promise),
    });
    await mountApi(fetchImpl);
    quotes.bumpResync();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);

    await click(button('watchlist-new-list'));
    const name = input('watchlist-create-name');
    await setValue(name, '半導體');
    await submitForm(name);
    expect(tab('wl-created-1').getAttribute('aria-selected')).toBe('true');

    stale.resolve(apiSuccess([defaultList()]));
    await flushAsync();
    expect(tabs(), '較舊的 GET 不得移除剛建立的清單').toHaveLength(2);
    expect(tab('wl-created-1').getAttribute('aria-selected')).toBe('true');
  });

  it('項目移除在飛時不做靜默重讀(canRefresh 納入 removing)', async () => {
    const removal = pendingResponse();
    const list = three();
    const fetchImpl = watchlistFetch([list], {
      removeItem: () => removal.promise,
    });
    await mountApi(fetchImpl);

    await click(removeButton('AAPL'));
    quotes.bumpResync();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists'), '移除在飛時不得發出靜默重讀').toHaveLength(1);

    removal.resolve(apiSuccess({ ...list, items: list.items.filter(item => item.symbol !== 'AAPL') }));
    await flushAsync();
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT']);
  });
});

// =====================================================================================
// 04.2-review WR-07:排序待送佇列要分清單;A 的 PUT 在飛時改排 B,A 的最新順序不得遺失。
// =====================================================================================

describe('Watchlist 頁 — 排序待送佇列分清單(04.2-review WR-07)', () => {
  function bodiesFor(fetchImpl: WatchlistFetch, listId: string): string[][] {
    return callsTo(fetchImpl, 'PUT', `/watchlists/${listId}/items/order`)
      .map(([, init]) => (JSON.parse(String(init?.body)) as { assetIds: string[] }).assetIds);
  }

  it('A 的 PUT 在飛 → A 再改一次 → 切到 B 並改排 → A 的 PUT 完成後,A 的最新順序與 B 的順序都會送出', async () => {
    const listA = watchlistDto('w1', '我的自選', ['AAPL', 'NVDA', 'MSFT']);
    const listB = watchlistDto('w2', '科技', ['TSLA', 'AMD', 'INTC']);
    let releaseFirst: (() => void) | null = null;
    const fetchImpl = watchlistFetch([listA, listB], {
      reorder: (listId, assetIds, call) => (call === 0
        ? new Promise<Response>(resolve => {
          releaseFirst = () => resolve(apiSuccess({ ...listA, items: assetIds.map(id => listA.items.find(item => item.uuid === id)!) }));
        })
        : undefined),
    });
    await mountApi(fetchImpl);
    await click(button('watchlist-reorder'));
    fakeDebounceTimers();

    // 1. A 移一列 → debounce 到 → PUT #1(A)在飛
    await press(moveButton('AAPL', 'down'));
    await advance(500);
    expect(bodiesFor(fetchImpl, 'w1')).toHaveLength(1);

    // 2. A 再移一列 → A 待送
    await press(moveButton('MSFT', 'up'));
    expect(rowSymbols()).toEqual(['NVDA', 'MSFT', 'AAPL']);

    // 3. 切到 B,4. B 移一列
    await press(tab('w2'));
    expect(rowSymbols()).toEqual(['TSLA', 'AMD', 'INTC']);
    await press(moveButton('TSLA', 'down'));
    expect(rowSymbols()).toEqual(['AMD', 'TSLA', 'INTC']);

    // 5. PUT #1 完成;讓所有 debounce / 排隊的請求跑完
    releaseFirst!();
    await settle();
    await advance(500);
    await settle();
    await advance(500);
    await settle();

    const aBodies = bodiesFor(fetchImpl, 'w1');
    expect(aBodies.at(-1), 'A 的第二次排序必須送出').toEqual([uuidOf(listA, 'NVDA'), uuidOf(listA, 'MSFT'), uuidOf(listA, 'AAPL')]);
    expect(bodiesFor(fetchImpl, 'w2')).toEqual([[uuidOf(listB, 'AMD'), uuidOf(listB, 'TSLA'), uuidOf(listB, 'INTC')]]);
    expect(testid('watchlist-reorder-saving')).toBeNull();
  });
});
