import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Overview from './Overview.vue';
// 原始碼字面(Vite ?raw):用來斷言 Overview 沒有 import mock store(PORT-04)。
// 不走 node:fs —— 本專案 tsconfig 未含 @types/node,且本 plan 不得新增套件。
import overviewSource from './Overview.vue?raw';
import { fmtNum } from '../data';
import { t, tf } from '../i18n';
import { fmtRatioPct, fmtSignedMoney } from '../moneyFormat';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { bumpPortfolioRevision, resetPortfolioRevisionForTests } from '../services/portfolioRevision';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { PortfolioSummaryDto, TradeDto } from '../services/apiTypes';
import type { Trade } from '../types';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';

// Phase 3 Plan 03(03-03-PLAN.md)+ Phase 04.1 Plan 18。API mode 的 Overview 只能顯示後端真的有的資料:
// 四張 KPI(04.1:總資產 / 今日損益 / 可用現金 / 總報酬率,數值刻意不同於 mock 值以證明來源)、
// 近期交易走 GET /trades?page=0&size=5(D-09),無後端來源的合成區塊仍隱藏(D-16)。
// 四態與 traceId 見 D-11 / D-12,全域 banner 邊界見 D-13。mock mode 必須與 Phase 3 之前完全一致。

const SUMMARY: PortfolioSummaryDto = {
  totalMarketValue: 1234567.89,
  totalCostBasis: 1098765.43,
  realizedPnl: 12345.67,
  unrealizedPnl: 123456.79,
  totalPnl: 135802.46,
  roi: 0.1234,
  holdingCount: 3,
  // Phase 04.1 欄位:值刻意不等於 mock 值(+$12,481 / $84,210 / 約 1,000,000),
  // 「資料來自 API 而非 mock」的斷言才有意義(T-04.1-55)。
  baseCurrency: 'TWD',
  fxExcludedCount: 0,
  unconvertedCurrencies: [],
  dayPricePnl: 12345,
  dayPricePnlRatio: 0.0104,
  dayPnlExcludedCount: 0,
  cash: 84210.5,
  totalEquity: 7654321,
  cashBalances: [{ currency: 'TWD', amount: 84210.5 }],
  allocation: [{ category: 'STOCK', value: 1234567.89, weight: 1 }],
  sectorAllocation: [{ sector: 'Tech', value: 1234567.89, weight: 1, holdingCount: 1, unrealizedPnl: 123456.79 }],
};

// 刻意用 mock 種子資料裡不存在的代號,才能證明畫面上的交易來自 API 而非 mock store。
const API_TRADES: TradeDto[] = [
  { id: 'tr-1', symbol: 'ZZA', type: 'BUY', quantity: 10, price: 11.5, fee: 1, note: null, currency: 'TWD', executedAt: '2026-06-05T09:30:00Z', createdAt: '2026-06-05T09:30:00Z' },
  { id: 'tr-2', symbol: 'ZZB', type: 'SELL', quantity: 20, price: 12.5, fee: 1, note: null, currency: 'TWD', executedAt: '2026-06-04T09:30:00Z', createdAt: '2026-06-04T09:30:00Z' },
  { id: 'tr-3', symbol: 'ZZC', type: 'BUY', quantity: 30, price: 13.5, fee: 1, note: null, currency: 'TWD', executedAt: '2026-06-03T09:30:00Z', createdAt: '2026-06-03T09:30:00Z' },
  { id: 'tr-4', symbol: 'ZZD', type: 'SELL', quantity: 40, price: 14.5, fee: 1, note: null, currency: 'TWD', executedAt: '2026-06-02T09:30:00Z', createdAt: '2026-06-02T09:30:00Z' },
  { id: 'tr-5', symbol: 'ZZE', type: 'BUY', quantity: 50, price: 15.5, fee: 1, note: null, currency: 'TWD', executedAt: '2026-06-01T09:30:00Z', createdAt: '2026-06-01T09:30:00Z' },
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

/** 卡片的 Display 數值(不含幣別代碼)。 */
function kpiValue(card: HTMLElement): string {
  return card.querySelector('.kpi-v .num')?.textContent?.trim() ?? '';
}

/** 卡片獨立的幣別代碼 span;沒有則為 null。 */
function kpiCcy(card: HTMLElement): string | null {
  return card.querySelector('.kpi-ccy')?.textContent?.trim() ?? null;
}

function summaryWith(overrides: Partial<PortfolioSummaryDto>): PortfolioSummaryDto {
  return { ...SUMMARY, ...overrides };
}

afterEach(() => {
  cleanupMounted();
  configureApiClientSessionHandlers({});
  // 04-07 硬規則:模組級 singleton 的 reset 必須在**各測試檔自己**的 afterEach 呼叫,
  // 絕不得加進 testSetup.ts(那會搶在 vi.mock 之前綁定真實實作)。
  resetPortfolioRevisionForTests();
});

describe('Overview — API mode(D-09 / D-11 / D-12 / D-13 / D-14 / D-16)', () => {
  it('恰好渲染四張 KPI 卡,數值來自 summary 而非 mock(PORT-09 / 10 / 11,D-14 / D-22)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const cards = allTestids('overview-kpi');
    expect(cards).toHaveLength(4);

    const [totalAssets, dayPnl, cash, totalReturn] = cards;

    // 卡 1:總資產 = totalEquity(D-22,不是 totalMarketValue),代碼是獨立 span
    expect(totalAssets.textContent).toContain(t('en', 'totalAssets'));
    expect(kpiValue(totalAssets)).toBe('7,654,321');
    expect(kpiCcy(totalAssets)).toBe('TWD');
    expect(totalAssets.textContent).not.toContain('1,234,568');
    expect(totalAssets.textContent).not.toContain('$');
    // 副標為真實 holdingCount,而不是 '+1.04% vs yesterday' 的假副標
    expect(totalAssets.textContent).toContain(`${SUMMARY.holdingCount} ${t('en', 'positions')}`);
    expect(totalAssets.textContent).not.toContain(t('en', 'yesterday'));

    // 卡 2:今日損益,帶號數值 + 代碼 + 比率列(箭頭 aria-hidden、up 色)
    expect(dayPnl.textContent).toContain(t('en', 'todayPnl'));
    expect(kpiValue(dayPnl)).toBe('+12,345');
    expect(kpiCcy(dayPnl)).toBe('TWD');
    const ratio = dayPnl.querySelector<HTMLElement>('[data-testid="overview-kpi-day-pnl-ratio"]');
    expect(ratio, 'ratio row').toBeTruthy();
    expect(ratio!.textContent).toContain('↗');
    expect(ratio!.textContent).toContain('+1.04%');
    expect(ratio!.textContent).toContain(fmtRatioPct(SUMMARY.dayPricePnlRatio)!);
    expect(ratio!.querySelector('[aria-hidden="true"]')?.textContent).toBe('↗');
    expect(ratio!.getAttribute('style')).toContain('var(--up)');
    // 數值本身維持 --fg(不上色)
    expect(dayPnl.querySelector('.kpi-v')!.getAttribute('style') ?? '').not.toContain('--up');
    // 常駐「不含匯差」說明,沒有未計入列
    expect(requireTestid('overview-kpi-day-pnl-note').textContent).toContain(t('en', 'dayPnlNote'));
    expect(testid('overview-kpi-day-pnl-excluded')).toBeNull();
    expect(dayPnl.textContent).not.toContain('+$12,481');

    // 卡 3:可用現金,dp 0
    expect(cash.textContent).toContain(t('en', 'availableCash'));
    expect(kpiValue(cash)).toBe('84,211');
    expect(kpiCcy(cash)).toBe('TWD');
    expect(cash.textContent).not.toContain('$84,210');

    // 卡 4:總報酬率 = roi × 100(D-04 允許的格式化縮放),副標為帶號總損益 + 代碼
    expect(totalReturn.textContent).toContain(t('en', 'totalReturn'));
    expect(kpiValue(totalReturn)).toBe(fmtRatioPct(SUMMARY.roi));
    expect(kpiValue(totalReturn)).toBe('+12.34%');
    expect(totalReturn.textContent).toContain(t('en', 'totalPnlLabel'));
    expect(totalReturn.textContent).toContain(fmtSignedMoney(SUMMARY.totalPnl, 'TWD', 0));
    expect(totalReturn.textContent).toContain('+135,802');
    expect(totalReturn.textContent).not.toContain(t('en', 'annualized'));
  });

  it('基準幣代碼來自 summary.baseCurrency,不寫死 TWD', async () => {
    const fetchMock = routedFetch({
      summary: () => success(summaryWith({ baseCurrency: 'USD' })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const [totalAssets, dayPnl, cash, totalReturn] = allTestids('overview-kpi');
    expect(kpiCcy(totalAssets)).toBe('USD');
    expect(kpiCcy(dayPnl)).toBe('USD');
    expect(kpiCcy(cash)).toBe('USD');
    expect(totalReturn.textContent).toContain('+135,802');
    expect(totalReturn.textContent).toContain('USD');
    expect(totalReturn.textContent).not.toContain('TWD');
  });

  describe('今日損益四種呈現(T-04.1-55:缺資料不得顯示成 0)', () => {
    async function mountWith(overrides: Partial<PortfolioSummaryDto>) {
      const fetchMock = routedFetch({
        summary: () => success(summaryWith(overrides)),
        trades: () => tradePage(API_TRADES),
      });
      await mountApiOverview(fetchMock);
      return allTestids('overview-kpi')[1];
    }

    it('有值 + 0 檔未計入:數值 + 比率 + 不含匯差說明,沒有未計入列', async () => {
      const card = await mountWith({ dayPnlExcludedCount: 0 });
      expect(kpiValue(card)).toBe('+12,345');
      expect(testid('overview-kpi-day-pnl-ratio')).not.toBeNull();
      expect(testid('overview-kpi-day-pnl-note')).not.toBeNull();
      expect(testid('overview-kpi-day-pnl-excluded')).toBeNull();
    });

    it('有值 + 2 檔未計入:再加「2 檔未計入…」', async () => {
      const card = await mountWith({ dayPnlExcludedCount: 2 });
      expect(kpiValue(card)).toBe('+12,345');
      expect(testid('overview-kpi-day-pnl-ratio')).not.toBeNull();
      expect(testid('overview-kpi-day-pnl-note')).not.toBeNull();
      const excluded = requireTestid('overview-kpi-day-pnl-excluded');
      expect(excluded.textContent).toContain(tf('en', 'dayPnlExcluded', { n: 2 }));
      expect(excluded.textContent).toMatch(/^\s*2\b/);
      expect(excluded.textContent).not.toContain('{n}');
    });

    it('null(全部被排除):數值 —(不是 0)、無代碼、無比率列,仍有說明與未計入列', async () => {
      const card = await mountWith({ dayPricePnl: null, dayPricePnlRatio: null, dayPnlExcludedCount: 3 });
      expect(kpiValue(card)).toBe('—');
      expect(kpiCcy(card)).toBeNull();
      expect(card.querySelector('.kpi-v')!.textContent).not.toMatch(/\b0\b/);
      expect(testid('overview-kpi-day-pnl-ratio')).toBeNull();
      expect(card.textContent).not.toContain('↗');
      expect(card.textContent).not.toContain('↘');
      expect(requireTestid('overview-kpi-day-pnl-note').textContent).toContain(t('en', 'dayPnlNote'));
      expect(requireTestid('overview-kpi-day-pnl-excluded').textContent)
        .toContain(tf('en', 'dayPnlExcluded', { n: 3 }));
    });

    it('真實為零:0 TWD,無號、無箭頭、無比率列,與 null 的 — 不同', async () => {
      const card = await mountWith({ dayPricePnl: 0, dayPricePnlRatio: null, dayPnlExcludedCount: 0 });
      expect(kpiValue(card)).toBe('0');
      expect(kpiCcy(card)).toBe('TWD');
      expect(kpiValue(card)).not.toContain('+');
      expect(testid('overview-kpi-day-pnl-ratio')).toBeNull();
      expect(card.textContent).not.toContain('↗');
      expect(card.textContent).not.toContain('↘');
      expect(testid('overview-kpi-day-pnl-note')).not.toBeNull();
      expect(testid('overview-kpi-day-pnl-excluded')).toBeNull();
    });

    it('負值:- 號、↘、dn 色,數值本身不上色', async () => {
      const card = await mountWith({ dayPricePnl: -3200, dayPricePnlRatio: -0.0215 });
      expect(kpiValue(card)).toBe('-3,200');
      const ratio = requireTestid('overview-kpi-day-pnl-ratio');
      expect(ratio.textContent).toContain('↘');
      expect(ratio.textContent).toContain('-2.15%');
      expect(ratio.getAttribute('style')).toContain('var(--dn)');
      expect(card.querySelector('.kpi-v')!.getAttribute('style') ?? '').not.toContain('--dn');
    });
  });

  it('總報酬率為負時副標帶 - 號並用 dn 色', async () => {
    const fetchMock = routedFetch({
      summary: () => success(summaryWith({ roi: -0.05, totalPnl: -50000 })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const totalReturn = allTestids('overview-kpi')[3];
    expect(kpiValue(totalReturn)).toBe('-5.00%');
    expect(totalReturn.textContent).toContain('-50,000');
    expect(totalReturn.querySelector('.kpi-s')!.getAttribute('style')).toContain('var(--dn)');
  });

  it('仍隱藏無後端資料來源的合成/寫死區塊;今日損益 / 可用現金不再隱藏(D-14 / D-16,04.1-18 反轉)', async () => {
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const body = document.body.textContent ?? '';
    // 今日損益 / 可用現金 KPI 在 04.1-18 起有後端來源 → 已渲染,但絕不是 mock 的寫死值
    expect(body).toContain(t('en', 'todayPnl'));
    expect(body).toContain(t('en', 'availableCash'));
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

  it('retry 只重打自己的區塊,成功後渲染四張卡(D-11)', async () => {
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
    expect(allTestids('overview-kpi')).toHaveLength(4);
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
    expect(allTestids('overview-kpi')).toHaveLength(4);

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
  { id: 'tr-new', symbol: 'ZNEW', type: 'BUY', quantity: 1, price: 2, fee: 0, note: null, currency: 'TWD', executedAt: '2026-06-06T09:30:00Z', createdAt: '2026-06-06T09:30:00Z' },
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

    bumpPortfolioRevision('trade');
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(2);
  });

  it('Test 4(Pitfall 12):mock mode 下 revision 變動不得發出任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    bumpPortfolioRevision('trade');
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
    bumpPortfolioRevision('trade');
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
    bumpPortfolioRevision('trade');
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
