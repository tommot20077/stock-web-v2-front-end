import { afterEach, describe, expect, it, vi } from 'vitest';
import Markets from './Markets.vue';
// 原始碼字面(Vite `?raw`):鎖住「這段 import 不存在」(沿用 Trades.test.ts 的手法)。
import marketsSource from './Markets.vue?raw';
import { t, tf } from '../i18n';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import {
  apiFailure,
  apiSuccess,
  callsTo,
  watchlistDto,
  watchlistFetch,
  type WatchlistFetch,
} from '../testing/watchlistFetchDouble';

// Phase 04.2 Plan 22(WATCH-03、D-16、D-21):Markets ★ 改開 WatchlistPicker、接 watchlist service。
// 行情列仍是 data.ts 示範資料(假 LIVE / 跳價不動);只有 ★ 清單接後端。

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

async function mountApiMarkets(fetchImpl: WatchlistFetch) {
  document.cookie = 'XSRF-TOKEN=csrf-markets; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchImpl);
  mountWithPinia(Markets, { lang: 'zh' });
  await flushAsync();
}

function star(symbol: string): HTMLButtonElement {
  const el = document.body.querySelector<HTMLButtonElement>(`[data-testid="markets-star"][data-symbol="${symbol}"]`);
  expect(el, `star ${symbol}`).not.toBeNull();
  return el!;
}

function visibleSymbols(): string[] {
  return [...document.body.querySelectorAll('[data-testid="markets-star"]')].map(el => el.getAttribute('data-symbol') ?? '');
}

function pickerCheckbox(listId: string): HTMLInputElement {
  const el = document.body.querySelector<HTMLInputElement>(
    `[data-testid="watchlist-picker-option"][data-list-id="${listId}"] [data-testid="watchlist-picker-checkbox"]`,
  );
  expect(el, `picker checkbox ${listId}`).not.toBeNull();
  return el!;
}

async function clickTab(label: string) {
  const tab = [...document.body.querySelectorAll<HTMLButtonElement>('button.tab')].find(btn => btn.textContent?.includes(label));
  expect(tab, `tab ${label}`).toBeTruthy();
  tab!.click();
  await flushAsync();
}

async function clickChip(label: string) {
  const chip = [...document.body.querySelectorAll<HTMLElement>('.chip')].find(el => el.textContent?.includes(label));
  expect(chip, `chip ${label}`).toBeTruthy();
  chip!.click();
  await flushAsync();
}

describe('Markets ★(API mode)', () => {
  it('掛載時 watchlist.list() 一次;不在任何清單的代號為未收藏外觀與 aria', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiMarkets(fetchImpl);

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);
    const aapl = star('AAPL');
    expect(aapl.classList.contains('on')).toBe(false);
    expect(aapl.getAttribute('aria-label')).toBe(tf('zh', 'watchlistStarAdd', { symbol: 'AAPL' }));
    expect(aapl.getAttribute('aria-haspopup')).toBe('dialog');
    expect(aapl.getAttribute('aria-expanded')).toBe('false');
  });

  it('tracer:點 AAPL ★ → 選擇器勾選「我的自選」→ 星號變已收藏', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', []), watchlistDto('wl-2', 'AI 概念', ['NVDA'])]);
    await mountApiMarkets(fetchImpl);

    star('AAPL').click();
    await flushAsync();

    const panel = document.body.querySelector('[data-testid="watchlist-picker"]');
    expect(panel).not.toBeNull();
    expect(star('AAPL').getAttribute('aria-expanded')).toBe('true');
    expect(star('AAPL').getAttribute('aria-controls')).toBe(panel!.id);

    pickerCheckbox('wl-1').click();
    await flushAsync();

    const posts = callsTo(fetchImpl, 'POST', '/watchlists/wl-1/items');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ symbol: 'AAPL' });
    expect(pickerCheckbox('wl-1').checked).toBe(true);
    expect(star('AAPL').classList.contains('on')).toBe(true);
    expect(star('AAPL').getAttribute('aria-label')).toBe(tf('zh', 'watchlistStarManage', { symbol: 'AAPL' }));
  });

  it('點星號不觸發列的 chart 導覽', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    const onChart = vi.fn();
    document.cookie = 'XSRF-TOKEN=csrf-markets; path=/';
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', fetchImpl);
    mountWithPinia(Markets, { lang: 'zh', onChart });
    await flushAsync();

    star('AAPL').click();
    await flushAsync();

    expect(onChart).not.toHaveBeenCalled();
  });

  it('取消勾選唯一含此代號的清單 → removeItem 後星號回到未收藏', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', ['AAPL'])]);
    await mountApiMarkets(fetchImpl);
    expect(star('AAPL').classList.contains('on')).toBe(true);

    star('AAPL').click();
    await flushAsync();
    pickerCheckbox('wl-1').click();
    await flushAsync();

    expect(callsTo(fetchImpl, 'DELETE', '/watchlists/wl-1/items/')).toHaveLength(1);
    expect(star('AAPL').classList.contains('on')).toBe(false);
  });

  it('★ 觀察 chip 與「觀察清單」tab 用所有清單 symbol 聯集;不在 data.ts 的代號不顯示', async () => {
    const fetchImpl = watchlistFetch([
      watchlistDto('wl-1', '我的自選', ['AAPL', 'NOT-IN-DATA']),
      watchlistDto('wl-2', 'Crypto', ['BTC', 'AAPL']),
    ]);
    await mountApiMarkets(fetchImpl);

    await clickChip('★');
    expect(visibleSymbols()).toEqual(['AAPL']);

    await clickTab(t('zh', 'watchlist'));
    expect(visibleSymbols().sort()).toEqual(['AAPL', 'BTC']);
    const tab = [...document.body.querySelectorAll<HTMLButtonElement>('button.tab')].find(btn => btn.textContent?.includes(t('zh', 'watchlist')));
    expect(tab?.querySelector('.tab-count')?.textContent?.trim()).toBe('2');
  });

  it('Esc 關閉選擇器並把焦點還給星號', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiMarkets(fetchImpl);

    star('AAPL').click();
    await flushAsync();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();

    expect(document.body.querySelector('[data-testid="watchlist-picker"]')).toBeNull();
    expect(document.activeElement).toBe(star('AAPL'));
  });

  it('Markets.vue 不再 import mock portfolio store(judgment §3)', () => {
    expect(marketsSource).not.toContain('stores/mockPortfolio');
    expect(marketsSource).toContain('getRuntimeApiClients');
  });
});

describe('Markets ★(mock mode)', () => {
  it('走 mock watchlist service:零網路,勾選後星號變已收藏', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('mock mode must not fetch')));
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Markets, { lang: 'zh' });
    await flushAsync();

    expect(star('TSLA').classList.contains('on')).toBe(false);
    star('TSLA').click();
    await flushAsync();
    const first = document.body.querySelector<HTMLInputElement>('[data-testid="watchlist-picker-checkbox"]');
    expect(first).not.toBeNull();
    first!.click();
    await flushAsync();

    expect(star('TSLA').classList.contains('on')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Markets 清單載入狀態(API mode)', () => {
  it('list() 失敗 → 行內 watchlistLoadFailedInline + 重試;行情表仍渲染;重試成功後錯誤消失', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', ['AAPL'])], {
      list: call => (call === 0 ? apiFailure('INTERNAL_ERROR', 'trace-markets-load', 503) : apiSuccess([watchlistDto('wl-1', '我的自選', ['AAPL'])])),
    });
    await mountApiMarkets(fetchImpl);

    const error = document.body.querySelector('[data-testid="markets-watchlist-error"]');
    expect(error, 'inline error').not.toBeNull();
    expect(error!.textContent).toContain(t('zh', 'watchlistLoadFailedInline'));
    expect(error!.textContent).not.toContain('BackendMessageMustNotReachTheDom');
    expect(visibleSymbols().length).toBeGreaterThan(0);
    expect(star('AAPL').classList.contains('on')).toBe(false);

    const retry = document.body.querySelector<HTMLButtonElement>('[data-testid="markets-watchlist-retry"]');
    expect(retry, 'retry').not.toBeNull();
    expect(retry!.textContent).toContain(t('zh', 'authRetry'));
    retry!.click();
    await flushAsync();

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(document.body.querySelector('[data-testid="markets-watchlist-error"]')).toBeNull();
    expect(star('AAPL').classList.contains('on')).toBe(true);
  });

  it('list() 失敗時開選擇器 → 選擇器顯示載入失敗,重試會讓頁面重讀', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])], {
      list: call => (call === 0 ? apiFailure('INTERNAL_ERROR', 'trace-markets-load', 503) : apiSuccess([watchlistDto('wl-1', '我的自選', [])])),
    });
    await mountApiMarkets(fetchImpl);

    star('AAPL').click();
    await flushAsync();
    expect(document.body.querySelector('[data-testid="watchlist-picker-error"]')).not.toBeNull();
    const retry = document.body.querySelector<HTMLButtonElement>('[data-testid="watchlist-picker-retry"]');
    expect(retry, 'picker retry').not.toBeNull();
    retry!.click();
    await flushAsync();

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
    expect(pickerCheckbox('wl-1')).toBeTruthy();
  });

  it('載入中:星號以未收藏外觀可點,選擇器顯示載入中;資料到了換成清單', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', ['AAPL'])], {
      list: async () => {
        await gate;
        return apiSuccess([watchlistDto('wl-1', '我的自選', ['AAPL'])]);
      },
    });
    await mountApiMarkets(fetchImpl);

    expect(star('AAPL').classList.contains('on')).toBe(false);
    star('AAPL').click();
    await flushAsync();
    expect(document.body.querySelector('[data-testid="watchlist-picker-loading"]')).not.toBeNull();

    release();
    await flushAsync();
    expect(document.body.querySelector('[data-testid="watchlist-picker-loading"]')).toBeNull();
    expect(pickerCheckbox('wl-1').checked).toBe(true);
    expect(star('AAPL').classList.contains('on')).toBe(true);
  });

  it('勾選遇到 WATCHLIST_NOT_FOUND → 頁面重讀清單', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])], {
      addItem: () => apiFailure('WATCHLIST_NOT_FOUND', 'trace-nf', 404),
    });
    await mountApiMarkets(fetchImpl);

    star('AAPL').click();
    await flushAsync();
    pickerCheckbox('wl-1').click();
    await flushAsync();

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);
  });
});
