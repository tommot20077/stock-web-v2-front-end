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

async function mountApi(fetchImpl: WatchlistFetch, on: Spies = spies()) {
  document.cookie = 'XSRF-TOKEN=csrf-watchlist; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
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
