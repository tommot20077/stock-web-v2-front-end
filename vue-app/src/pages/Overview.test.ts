import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Overview from './Overview.vue';
// 原始碼字面(Vite ?raw):用來斷言 Overview 沒有 import mock store(PORT-04)。
// 不走 node:fs —— 本專案 tsconfig 未含 @types/node,且本 plan 不得新增套件。
import overviewSource from './Overview.vue?raw';
import { fmtNum, fmtPct } from '../data';
import { t } from '../i18n';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { bumpPortfolioRevision, resetPortfolioRevisionForTests } from '../services/portfolioRevision';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { PortfolioSummaryDto, TradeDto } from '../services/apiTypes';
import type { Trade } from '../types';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';

// Phase 3 Plan 03(03-03-PLAN.md)。API mode 的 Overview 只能顯示後端真的有的資料:
// 兩張 KPI(D-14)、近期交易走 GET /trades?page=0&size=5(D-09),其餘合成/寫死區塊隱藏
// (D-14 / D-16)。四態與 traceId 見 D-11 / D-12,全域 banner 邊界見 D-13。
// mock mode 必須與 Phase 3 之前完全一致。

const SUMMARY: PortfolioSummaryDto = {
  totalMarketValue: 1234567.89,
  totalCostBasis: 1098765.43,
  realizedPnl: 12345.67,
  unrealizedPnl: 123456.79,
  totalPnl: 135802.46,
  roi: 0.1234,
  holdingCount: 3,
};

// 刻意用 mock 種子資料裡不存在的代號,才能證明畫面上的交易來自 API 而非 mock store。
const API_TRADES: TradeDto[] = [
  { id: 'tr-1', symbol: 'ZZA', type: 'BUY', quantity: 10, price: 11.5, fee: 1, note: null, executedAt: '2026-06-05T09:30:00Z', createdAt: '2026-06-05T09:30:00Z' },
  { id: 'tr-2', symbol: 'ZZB', type: 'SELL', quantity: 20, price: 12.5, fee: 1, note: null, executedAt: '2026-06-04T09:30:00Z', createdAt: '2026-06-04T09:30:00Z' },
  { id: 'tr-3', symbol: 'ZZC', type: 'BUY', quantity: 30, price: 13.5, fee: 1, note: null, executedAt: '2026-06-03T09:30:00Z', createdAt: '2026-06-03T09:30:00Z' },
  { id: 'tr-4', symbol: 'ZZD', type: 'SELL', quantity: 40, price: 14.5, fee: 1, note: null, executedAt: '2026-06-02T09:30:00Z', createdAt: '2026-06-02T09:30:00Z' },
  { id: 'tr-5', symbol: 'ZZE', type: 'BUY', quantity: 50, price: 15.5, fee: 1, note: null, executedAt: '2026-06-01T09:30:00Z', createdAt: '2026-06-01T09:30:00Z' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function success(data: unknown): Response {
  return jsonResponse({ success: true, data, error: null, meta: { traceId: 'trace-ok' } });
}

function failure(code: string, traceId: string, status = 503): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: { code, message: 'backend said no' },
    meta: { traceId },
  }, status);
}

function tradePage(items: TradeDto[]): Response {
  return success({ items, page: 0, size: 5, totalElements: items.length, totalPages: items.length ? 1 : 0 });
}

type Handler = () => Response | Promise<Response>;

function routedFetch(handlers: { summary: Handler; trades: Handler }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/portfolio/summary')) return handlers.summary();
    if (url.includes('/trades')) return handlers.trades();
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function callUrls(fetchMock: ReturnType<typeof routedFetch>): string[] {
  return fetchMock.mock.calls.map(call => String(call[0]));
}

function callsMatching(fetchMock: ReturnType<typeof routedFetch>, fragment: string): string[] {
  return callUrls(fetchMock).filter(url => url.includes(fragment));
}

async function mountApiOverview(
  fetchMock: ReturnType<typeof routedFetch>,
  props: Record<string, unknown> = {},
) {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  // Pitfall 7:client 以 mode 為 key 快取,切模式前先清,避免跨測試汙染。
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchMock);
  mountWithPinia(Overview, { lang: 'en', ...props });
  await flushAsync();
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).toBeTruthy();
  return el!;
}

function allTestids(id: string): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

function recentTradesCard(): HTMLElement {
  const title = [...document.body.querySelectorAll('.ttl')]
    .find(el => el.textContent === t('en', 'recentTrades'));
  expect(title, 'recent trades card title').toBeTruthy();
  return title!.closest('.card') as HTMLElement;
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  cleanupMounted();
  configureApiClientSessionHandlers({});
  // 04-07 硬規則:模組級 singleton 的 reset 必須在**各測試檔自己**的 afterEach 呼叫,
  // 絕不得加進 testSetup.ts(那會搶在 vi.mock 之前綁定真實實作)。
  resetPortfolioRevisionForTests();
});

describe('Overview — API mode(D-09 / D-11 / D-12 / D-13 / D-14 / D-16)', () => {
  it('只渲染兩張有後端資料的 KPI 卡,數值來自 summary(D-14)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const cards = allTestids('overview-kpi');
    expect(cards).toHaveLength(2);

    const [totalAssets, totalReturn] = cards;
    expect(totalAssets.textContent).toContain(t('en', 'totalAssets'));
    expect(totalAssets.textContent).toContain(`$${fmtNum(SUMMARY.totalMarketValue, 0)}`);
    // 副標為真實 holdingCount,而不是 '+1.04% vs yesterday' 的假副標
    expect(totalAssets.textContent).toContain(`${SUMMARY.holdingCount} ${t('en', 'positions')}`);
    expect(totalAssets.textContent).not.toContain(t('en', 'yesterday'));

    expect(totalReturn.textContent).toContain(t('en', 'totalReturn'));
    // roi 是比值,顯示 ×100(D-04 允許的格式化縮放)
    expect(totalReturn.textContent).toContain(fmtPct(SUMMARY.roi * 100));
    expect(totalReturn.textContent).toContain(t('en', 'totalPnlLabel'));
    expect(totalReturn.textContent).toContain(`+$${fmtNum(SUMMARY.totalPnl, 0)}`);
    expect(totalReturn.textContent).not.toContain(t('en', 'annualized'));
  });

  it('隱藏所有無後端資料來源的合成/寫死區塊(D-14 / D-16)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const body = document.body.textContent ?? '';
    // 今日損益 / 可用現金 KPI
    expect(body).not.toContain(t('en', 'todayPnl'));
    expect(body).not.toContain(t('en', 'availableCash'));
    expect(body).not.toContain('+$12,481');
    expect(body).not.toContain('$84,210');
    // 資產配置 donut
    expect(body).not.toContain(t('en', 'allocation'));
    expect(document.body.querySelector('.alloc-row')).toBeNull();
    // 資產走勢圖與 range 切換
    expect(body).not.toContain(t('en', 'assetTrend'));
    expect(document.body.querySelector('.seg-btn')).toBeNull();
    for (const range of ['1D', '1W', '1M', '3M', '6M', '1Y']) {
      expect([...document.body.querySelectorAll('button')].map(b => b.textContent))
        .not.toContain(range);
    }
  });

  it('近期交易來自 GET /trades?page=0&size=5,不與交易頁共用狀態(D-09)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const tradeCalls = callsMatching(fetchMock, '/trades');
    expect(tradeCalls).toHaveLength(1);
    expect(tradeCalls[0]).toContain('page=0');
    expect(tradeCalls[0]).toContain('size=5');

    const card = recentTradesCard();
    const rows = [...card.querySelectorAll('[data-testid="overview-trade-row"]')];
    expect(rows).toHaveLength(API_TRADES.length);
    expect(card.textContent).toContain('ZZA');
    expect(card.textContent).toContain('ZZE');
    // executedAt 只取日期部分
    expect(rows[0].textContent).toContain('2026-06-05');
    expect(rows[0].textContent).not.toContain('T09:30');
    // total = quantity × price
    expect(rows[0].textContent).toContain(`$${fmtNum(10 * 11.5, 0)}`);
    // 沒有任何 mock store 的交易漏進來
    expect(card.textContent).not.toContain('NVDA');
    expect(card.textContent).not.toContain('TSLA');
  });

  it('載入中兩個區塊各自顯示 loading(D-11)', async () => {
    const pending: Handler = () => new Promise<Response>(() => {});
    const fetchMock = routedFetch({ summary: pending, trades: pending });
    await mountApiOverview(fetchMock);

    expect(requireTestid('overview-summary-loading').textContent).toContain(t('en', 'loading'));
    expect(requireTestid('overview-trades-loading').textContent).toContain(t('en', 'loading'));
    expect(allTestids('overview-kpi')).toHaveLength(0);
  });

  it('summary 失敗時顯示錯誤碼 + traceId,近期交易不受影響(D-11 / D-12)', async () => {
    const fetchMock = routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down'),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const error = requireTestid('overview-summary-error');
    expect(error.textContent).toContain(t('en', 'loadFailed'));
    expect(error.textContent).toContain('PORTFOLIO_SUMMARY_UNAVAILABLE');
    expect(error.textContent).toContain('trace-summary-down');
    expect(allTestids('overview-kpi')).toHaveLength(0);

    // 區塊獨立:近期交易照常渲染
    expect([...recentTradesCard().querySelectorAll('[data-testid="overview-trade-row"]')])
      .toHaveLength(API_TRADES.length);
    expect(testid('overview-trades-error')).toBeNull();
  });

  it('retry 只重打自己的區塊,成功後渲染兩張卡(D-11)', async () => {
    let summaryFails = true;
    const fetchMock = routedFetch({
      summary: () => (summaryFails
        ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down')
        : success(SUMMARY)),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(1);

    summaryFails = false;
    click(requireTestid('overview-summary-retry'));
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    // 重試 summary 不得連帶重打 trades
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(1);
    expect(allTestids('overview-kpi')).toHaveLength(2);
    expect(testid('overview-summary-error')).toBeNull();
  });

  it('trades 失敗時可單獨重試,且不重打 summary(D-11)', async () => {
    let tradesFail = true;
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => (tradesFail
        ? failure('TRADE_LIST_UNAVAILABLE', 'trace-trades-down')
        : tradePage(API_TRADES)),
    });
    await mountApiOverview(fetchMock);

    const error = requireTestid('overview-trades-error');
    expect(error.textContent).toContain('TRADE_LIST_UNAVAILABLE');
    expect(error.textContent).toContain('trace-trades-down');
    // summary 區塊不受影響
    expect(allTestids('overview-kpi')).toHaveLength(2);

    tradesFail = false;
    click(requireTestid('overview-trades-retry'));
    await flushAsync();

    expect(callsMatching(fetchMock, '/trades')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect([...recentTradesCard().querySelectorAll('[data-testid="overview-trade-row"]')])
      .toHaveLength(API_TRADES.length);
  });

  it('trades 回空 items 時顯示 noTrades 空狀態', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage([]),
    });
    await mountApiOverview(fetchMock);

    expect(requireTestid('overview-trades-empty').textContent).toContain(t('en', 'noTrades'));
    expect(allTestids('overview-trade-row')).toHaveLength(0);
    expect(testid('overview-trades-error')).toBeNull();
  });

  it('portfolio 讀取錯誤不劫持全域 SessionBanner(D-13)', async () => {
    const handlers = { onRefreshing: vi.fn(), onRefreshFailed: vi.fn() };
    configureApiClientSessionHandlers(handlers);

    const fetchMock = routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down'),
      trades: () => failure('TRADE_LIST_UNAVAILABLE', 'trace-trades-down'),
    });
    await mountApiOverview(fetchMock);

    // 兩個區塊各自 inline 呈現錯誤
    expect(testid('overview-summary-error')).not.toBeNull();
    expect(testid('overview-trades-error')).not.toBeNull();
    // 全域 session 通道完全沒被觸發
    expect(document.body.querySelector('[data-testid="session-banner"]')).toBeNull();
    expect(handlers.onRefreshing).not.toHaveBeenCalled();
    expect(handlers.onRefreshFailed).not.toHaveBeenCalled();
  });

  it('Watchlist 與 News 卡在 API mode 照常渲染(Phase Boundary)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    expect(document.body.textContent).toContain(t('en', 'watchlist'));
    expect(document.body.textContent).toContain(t('en', 'news'));
    expect(document.body.querySelectorAll('.wl-row').length).toBeGreaterThan(0);
    expect(document.body.querySelectorAll('.news-row').length).toBeGreaterThan(0);
  });

  it('Overview 不 import mock store,一律經 getRuntimeApiClients(PORT-04 / judgment §3)', () => {
    expect(overviewSource).not.toContain('useMockPortfolioStore');
    expect(overviewSource).not.toContain('stores/mockPortfolio');
    expect(overviewSource).toContain('getRuntimeApiClients');
  });
});

describe('Overview — mock mode 回歸鎖定', () => {
  it('四張 KPI 卡、資產配置 donut、資產走勢圖與 range 切換全部保留', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    expect(allTestids('overview-kpi')).toHaveLength(4);
    const body = document.body.textContent ?? '';
    expect(body).toContain(t('en', 'totalAssets'));
    expect(body).toContain(t('en', 'todayPnl'));
    expect(body).toContain(t('en', 'availableCash'));
    expect(body).toContain(t('en', 'totalReturn'));
    expect(body).toContain('+$12,481');
    expect(body).toContain('$84,210');
    expect(body).toContain(t('en', 'allocation'));
    expect(document.body.querySelectorAll('.alloc-row')).toHaveLength(5);
    expect(body).toContain(t('en', 'assetTrend'));
    expect([...document.body.querySelectorAll('.seg-btn')].map(b => b.textContent))
      .toEqual(['1D', '1W', '1M', '3M', '6M', '1Y', 'All']);
  });

  it('近期交易仍跟著 Pinia store 即時更新(live 委派未破壞 reactivity)', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    const card = recentTradesCard();
    expect(card.textContent).toContain('NVDA');

    const portfolio = useMockPortfolioStore();
    const replacement: Trade[] = [
      { d: '2026-05-16', type: 'BUY', sym: 'AAA', qty: 2, px: 10, fee: 1, note: 'first' },
      { d: '2025-12-31', type: 'SELL', sym: 'BBB', qty: 3, px: 20, fee: 2, note: 'old' },
    ];
    portfolio.trades = replacement;
    await nextTick();

    expect(card.textContent).toContain('AAA');
    expect(card.textContent).toContain('BBB');
    expect(card.textContent).not.toContain('NVDA');
    expect([...card.querySelectorAll('[data-testid="overview-trade-row"]')]).toHaveLength(2);
  });

  it("'New trade' emit order、'→' emit navigate('watchlist')", async () => {
    const events = { order: 0, navigate: [] as string[] };
    mountWithPinia(Overview, {
      lang: 'en',
      onOrder: () => { events.order += 1; },
      onNavigate: (page: string) => { events.navigate.push(page); },
    });
    await flushAsync();

    const addTrade = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.includes(t('en', 'addTrade')));
    expect(addTrade, 'New trade button').toBeTruthy();
    click(addTrade!);

    const navButton = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.includes('→'));
    expect(navButton, 'navigate button').toBeTruthy();
    click(navButton!);

    expect(events.order).toBe(1);
    expect(events.navigate).toEqual(['watchlist']);
  });

  it('mock mode 不打任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// =====================================================================================
// 04-12(D-10 / D-12 / U-05 / U-06):成交後的重讀。
// Overview 有**兩個各自獨立**的資料源(summary、近期交易),一個失敗不影響另一個。
// =====================================================================================

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const REFRESHED_TRADES: TradeDto[] = [
  { id: 'tr-new', symbol: 'ZNEW', type: 'BUY', quantity: 1, price: 2, fee: 0, note: null, executedAt: '2026-06-06T09:30:00Z', createdAt: '2026-06-06T09:30:00Z' },
];

describe('Overview — post-trade refetch(04-12 / D-10 / D-12 / U-05 / U-06)', () => {
  it('Test 1(D-10):revision 變動後 summary 與近期交易各自重讀一次', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(1);

    bumpPortfolioRevision();
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(2);
  });

  it('Test 4(Pitfall 12):mock mode 下 revision 變動不得發出任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    bumpPortfolioRevision();
    await flushAsync();

    // mock mode 走 Pinia reactivity:executeOrder 直接改 store,不需要也不應該觸發 refetch。
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Test 6/7(U-05):重讀期間保留舊列並顯示「更新中…」,成功後才換成新值', async () => {
    let gate: ReturnType<typeof deferred<Response>> | null = null;
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => (gate ? gate.promise : tradePage(API_TRADES)),
    });
    await mountApiOverview(fetchMock);
    expect(allTestids('overview-trade-row')).toHaveLength(API_TRADES.length);

    gate = deferred<Response>();
    bumpPortfolioRevision();
    await flushAsync();

    // U-05:**不得**重用 status:'loading' —— 舊列必須留在 DOM,不被骨架/空狀態取代。
    expect(allTestids('overview-trade-row')).toHaveLength(API_TRADES.length);
    expect(recentTradesCard().textContent).toContain('ZZA');
    expect(testid('overview-trades-loading')).toBeNull();

    const note = requireTestid('overview-refreshing');
    expect(note.textContent).toContain(t('en', 'portfolioRefreshing'));
    expect(recentTradesCard().getAttribute('aria-busy')).toBe('true');

    gate.resolve(tradePage(REFRESHED_TRADES));
    gate = null;
    await flushAsync();

    expect(testid('overview-refreshing')).toBeNull();
    expect(recentTradesCard().getAttribute('aria-busy')).toBe('false');
    expect(allTestids('overview-trade-row')).toHaveLength(1);
    expect(recentTradesCard().textContent).toContain('ZNEW');
    expect(recentTradesCard().textContent).not.toContain('ZZA');
  });

  it('Test 8(U-06 / D-12):重讀失敗時舊資料留存並明示可能過期,重試可再送', async () => {
    let failRefetch = false;
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => (failRefetch ? failure('TRADE_LIST_UNAVAILABLE', 'trace-refetch-down') : tradePage(API_TRADES)),
    });
    await mountApiOverview(fetchMock);

    failRefetch = true;
    bumpPortfolioRevision();
    await flushAsync();

    // 舊資料仍在畫面上,且**不進** status:'error'(那會清掉舊資料)
    expect(allTestids('overview-trade-row')).toHaveLength(API_TRADES.length);
    expect(testid('overview-trades-error')).toBeNull();
    expect(testid('overview-refreshing')).toBeNull();

    const stale = requireTestid('overview-refresh-error');
    expect(stale.textContent).toContain(t('en', 'portfolioStaleAfterTrade'));
    // 交易已成功,這不是需要打斷的錯誤 → role="status" 而不是 alert
    expect(stale.getAttribute('role')).toBe('status');
    expect(requireTestid('overview-refresh-error-code').textContent).toContain('TRADE_LIST_UNAVAILABLE');
    expect(requireTestid('overview-refresh-trace-id').textContent).toContain('trace-refetch-down');
    // 只露 code / traceId,後端 message 不外洩(T-04-09)
    expect(stale.textContent).not.toContain('backend said no');

    failRefetch = false;
    click(requireTestid('overview-refresh-retry'));
    await flushAsync();

    expect(callsMatching(fetchMock, '/trades')).toHaveLength(3);
    expect(testid('overview-refresh-error')).toBeNull();
    expect(allTestids('overview-trade-row')).toHaveLength(API_TRADES.length);
  });
});
