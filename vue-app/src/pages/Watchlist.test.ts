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
