import { afterEach, describe, expect, it, vi } from 'vitest';
import Chart from './Chart.vue';
// 原始碼字面(Vite `?raw`):鎖住「這段 import 不存在」(沿用 Trades.test.ts / chart-template.test.ts 的手法)。
import chartSource from './Chart.vue?raw';
import { t } from '../i18n';
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

// Phase 04.2 Plan 22(WATCH-03、D-16、D-21):Chart 的 Watch 按鈕改開 WatchlistPicker、接 watchlist service。
// TradingView:jsdom 不載入外部 script(預設不抓資源),widget 不會建立,只驗證頁首按鈕;
// 範本層面的 table 子元素警告由 chart-template.test.ts 負責。

const CHART_PROPS = { lang: 'zh', sym: 'AAPL', themeMode: 'tv', theme: 'dark' };

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  document.querySelectorAll('script[src*="tradingview"]').forEach(el => el.remove());
});

async function mountApiChart(fetchImpl: WatchlistFetch) {
  document.cookie = 'XSRF-TOKEN=csrf-chart; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchImpl);
  mountWithPinia(Chart, CHART_PROPS);
  await flushAsync();
}

function watchButton(): HTMLButtonElement {
  const el = document.body.querySelector<HTMLButtonElement>('[data-testid="chart-watch"]');
  expect(el, 'chart-watch').not.toBeNull();
  return el!;
}

function glyph(): string {
  const el = watchButton().querySelector('[aria-hidden="true"]');
  expect(el, 'decorative glyph').not.toBeNull();
  return el!.textContent?.trim() ?? '';
}

function pickerCheckbox(listId: string): HTMLInputElement {
  const el = document.body.querySelector<HTMLInputElement>(
    `[data-testid="watchlist-picker-option"][data-list-id="${listId}"] [data-testid="watchlist-picker-checkbox"]`,
  );
  expect(el, `picker checkbox ${listId}`).not.toBeNull();
  return el!;
}

describe('Chart Watch 按鈕(API mode)', () => {
  it('掛載時 watchlist.list() 一次;不在任何清單 → ☆ + 加入觀察清單,觸發鈕語意', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiChart(fetchImpl);

    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(1);
    const button = watchButton();
    expect(button.classList.contains('btn-watch')).toBe(true);
    expect(button.textContent).toContain(t('zh', 'chartWatchAdd'));
    expect(glyph()).toBe('☆');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('已在某清單 → ★ + 已在觀察清單', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', []), watchlistDto('wl-2', 'AI', ['AAPL'])]);
    await mountApiChart(fetchImpl);

    expect(watchButton().textContent).toContain(t('zh', 'chartWatchIn'));
    expect(glyph()).toBe('★');
  });

  it('點擊開選擇器;勾選「我的自選」→ addItem(AAPL)後按鈕切為已在觀察清單', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiChart(fetchImpl);

    watchButton().click();
    await flushAsync();

    const panel = document.body.querySelector('[data-testid="watchlist-picker"]');
    expect(panel, 'picker').not.toBeNull();
    expect(watchButton().getAttribute('aria-expanded')).toBe('true');
    expect(watchButton().getAttribute('aria-controls')).toBe(panel!.id);
    expect(panel!.textContent).toContain('AAPL');

    pickerCheckbox('wl-1').click();
    await flushAsync();

    const posts = callsTo(fetchImpl, 'POST', '/watchlists/wl-1/items');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ symbol: 'AAPL' });
    expect(watchButton().textContent).toContain(t('zh', 'chartWatchIn'));
    expect(glyph()).toBe('★');
  });

  it('再點一次按鈕關閉選擇器;Esc 關閉並把焦點還給按鈕', async () => {
    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiChart(fetchImpl);

    watchButton().click();
    await flushAsync();
    watchButton().click();
    await flushAsync();
    expect(document.body.querySelector('[data-testid="watchlist-picker"]')).toBeNull();

    watchButton().click();
    await flushAsync();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();
    expect(document.body.querySelector('[data-testid="watchlist-picker"]')).toBeNull();
    expect(document.activeElement).toBe(watchButton());
  });

  it('Chart.vue 不再 import mock portfolio store;LIVE pill 仍在(D-21)', async () => {
    expect(chartSource).not.toContain('stores/mockPortfolio');
    expect(chartSource).toContain('getRuntimeApiClients');

    const fetchImpl = watchlistFetch([watchlistDto('wl-1', '我的自選', [])]);
    await mountApiChart(fetchImpl);
    expect(document.body.querySelector('.live-pill')?.textContent).toContain('LIVE');
  });
});

describe('Chart Watch 按鈕(mock mode)', () => {
  it('走 mock watchlist service:零網路;AAPL 在預設清單 → 已在觀察清單', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('mock mode must not fetch')));
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Chart, CHART_PROPS);
    await flushAsync();

    expect(watchButton().textContent).toContain(t('zh', 'chartWatchIn'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// 04.2-review WR-06:選擇器要求重讀(retry)後,在飛的 GET 不得蓋掉之後選擇器寫入的回應 DTO。
describe('Chart 過時清單回應守門(04.2-review WR-06)', () => {
  it('勾選 wl-1 失敗觸發重讀;GET 在飛時勾選 wl-2 成功 → 較舊的 GET 後到不得把按鈕切回未收藏', async () => {
    let releaseStale: (() => void) | null = null;
    const snapshot = () => [watchlistDto('wl-1', '我的自選', []), watchlistDto('wl-2', 'AI', [])];
    const fetchImpl = watchlistFetch(snapshot(), {
      list: call => (call === 0
        ? apiSuccess(snapshot())
        : new Promise<Response>(resolve => { releaseStale = () => resolve(apiSuccess(snapshot())); })),
      addItem: listId => (listId === 'wl-1' ? apiFailure('INTERNAL_ERROR', 'trace-500', 500) : undefined),
    });
    await mountApiChart(fetchImpl);

    watchButton().click();
    await flushAsync();
    pickerCheckbox('wl-1').click();
    await flushAsync();
    expect(callsTo(fetchImpl, 'GET', '/watchlists')).toHaveLength(2);

    pickerCheckbox('wl-2').click();
    await flushAsync();
    expect(glyph()).toBe('★');

    releaseStale!();
    await flushAsync();
    expect(glyph(), '較舊的 GET 不得蓋掉較新的寫入回應').toBe('★');
    expect(pickerCheckbox('wl-2').checked).toBe(true);
  });
});
