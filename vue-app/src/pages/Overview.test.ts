import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Overview from './Overview.vue';
// 原始碼字面(Vite ?raw):用來斷言 Overview 沒有 import mock store(PORT-04)。
// 不走 node:fs —— 本專案 tsconfig 未含 @types/node,且本 plan 不得新增套件。
import overviewSource from './Overview.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney, fmtMoneyAmount, fmtRatioPct, fmtSignedMoney, fmtWeightPct } from '../moneyFormat';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  bumpPortfolioRevision,
  notifyCashEntryCreated,
  notifyTradeCreated,
  portfolioRevisionCause,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
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

function failure(
  code: string,
  traceId: string,
  status = 503,
  fields?: Record<string, string>,
): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: { code, message: 'backend said no', ...(fields ? { fields } : {}) },
    meta: { traceId },
  }, status);
}

function tradePage(items: TradeDto[]): Response {
  return success({ items, page: 0, size: 5, totalElements: items.length, totalPages: items.length ? 1 : 0 });
}

type Handler = () => Response | Promise<Response>;

function routedFetch(handlers: { summary: Handler; trades: Handler; patch?: (body: unknown) => Response | Promise<Response> }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/me/preferences') && String(init?.method ?? 'GET').toUpperCase() === 'PATCH') {
      if (!handlers.patch) throw new Error('unexpected PATCH /me/preferences');
      return handlers.patch(JSON.parse(String(init?.body)));
    }
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

function patchCalls(fetchMock: ReturnType<typeof routedFetch>) {
  return fetchMock.mock.calls.filter(call => String(call[1]?.method ?? 'GET').toUpperCase() === 'PATCH');
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

  it('仍隱藏資產走勢(無後端日級歷史);今日損益 / 可用現金 / 資產配置不再隱藏(D-14 / D-16,04.1-18 反轉)', async () => {
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
    // 資產配置 donut 在 04.1-18 起改由 summary.allocation 渲染(只有一塊 STOCK)
    expect(body).toContain(t('en', 'allocation'));
    expect(document.body.querySelectorAll('.alloc-row')).toHaveLength(1);
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
    // total = quantity × price;04.1-18(D-28):不再寫死 `$`,金額格只放數字,幣別以標的後的標籤表示一次
    const cells = rows[0].querySelectorAll('td');
    expect(cells[4].textContent?.trim()).toBe(fmtMoneyAmount(11.5, 'TWD'));
    expect(cells[5].textContent?.trim()).toBe(fmtMoneyAmount(10 * 11.5, 'TWD', 0));
    expect(cells[5].textContent?.trim()).toBe('115');
    expect(rows[0].textContent).not.toContain('$');
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

    // 04.1-18:mock 的可用現金卡多了「Cash entries →」連結,觀察清單的 → 改以全文相等定位。
    const navButton = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent?.trim() === '→');
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


// =====================================================================================
// 04.1-18 Task 2:基準幣工具列(D-03)、可用現金卡(D-07 / D-08 / D-11 / D-29)、
// 依觸發來源選重讀失敗文案(U-09)。
// =====================================================================================

const CSRF_TOKEN = 'csrf-overview';

function button(id: string): HTMLButtonElement {
  return requireTestid(id) as HTMLButtonElement;
}

function setCookie() {
  document.cookie = `XSRF-TOKEN=${CSRF_TOKEN}; path=/`;
}

function ccyPressed(): string[] {
  return ['TWD', 'USD', 'EUR', 'JPY']
    .filter(code => button(`base-currency-option-${code}`).getAttribute('aria-pressed') === 'true');
}

async function setValue(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushAsync(1);
}

describe('Overview — 基準幣工具列(D-03,API mode)', () => {
  it('四個基準幣鍵依 TWD / USD / EUR / JPY 排列,選中者 aria-pressed 來自 summary.baseCurrency', async () => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(summaryWith({ baseCurrency: 'EUR' })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);

    const group = requireTestid('base-currency-switch');
    expect(group.getAttribute('role')).toBe('group');
    const labelledBy = group.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(t('en', 'baseCurrency'));
    expect([...group.querySelectorAll('button')].map(b => b.textContent?.trim()))
      .toEqual(['TWD', 'USD', 'EUR', 'JPY']);
    expect(ccyPressed()).toEqual(['EUR']);
    // 工具列在 KPI 卡之前(D-03:KPI 上方)
    const cards = allTestids('overview-kpi');
    expect(group.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(testid('base-currency-switching')).toBeNull();
    expect(testid('base-currency-error')).toBeNull();
  });

  it('點 USD:恰一次 PATCH、期間四鍵 disabled 並顯示切換中…,成功後以 baseCurrency 重讀 summary', async () => {
    setCookie();
    const patchGate = deferred<Response>();
    let summaryBase = 'TWD';
    let summaryGate: ReturnType<typeof deferred<Response>> | null = null;
    const fetchMock = routedFetch({
      summary: () => (summaryGate ? summaryGate.promise : success(summaryWith({ baseCurrency: summaryBase }))),
      trades: () => tradePage(API_TRADES),
      patch: () => patchGate.promise,
    });
    await mountApiOverview(fetchMock);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);

    click(button('base-currency-option-USD'));
    await flushAsync();

    // PATCH in flight
    const patches = patchCalls(fetchMock);
    expect(patches).toHaveLength(1);
    expect(String(patches[0][0])).toBe('/api/v1/me/preferences');
    expect(String(patches[0][1]?.body)).toBe('{"baseCurrency":"USD"}');
    expect(new Headers(patches[0][1]?.headers).get('X-XSRF-TOKEN')).toBe(CSRF_TOKEN);
    for (const code of ['TWD', 'USD', 'EUR', 'JPY']) {
      expect(button(`base-currency-option-${code}`).disabled, code).toBe(true);
    }
    const switching = requireTestid('base-currency-switching');
    expect(switching.getAttribute('role')).toBe('status');
    expect(switching.textContent).toContain(t('en', 'baseCurrencySwitching'));
    expect(ccyPressed()).toEqual(['USD']);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);

    // PATCH 成功 → cause = baseCurrency → summary 重讀;重讀期間仍 disabled
    summaryBase = 'USD';
    summaryGate = deferred<Response>();
    patchGate.resolve(success({ baseCurrency: 'USD' }));
    await flushAsync();

    expect(portfolioRevisionCause.value).toBe('baseCurrency');
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(button('base-currency-option-TWD').disabled).toBe(true);
    expect(testid('base-currency-switching')).toBeNull();
    expect(requireTestid('overview-refreshing').textContent).toContain(t('en', 'portfolioRefreshing'));
    expect(ccyPressed()).toEqual(['USD']);

    summaryGate.resolve(success(summaryWith({ baseCurrency: 'USD' })));
    summaryGate = null;
    await flushAsync();

    expect(button('base-currency-option-TWD').disabled).toBe(false);
    expect(ccyPressed()).toEqual(['USD']);
    // 新 summary 的 baseCurrency 顯示在卡片代碼
    expect(kpiCcy(allTestids('overview-kpi')[0])).toBe('USD');
    // 整個流程只有一次 PATCH,沒有確認框
    expect(patchCalls(fetchMock)).toHaveLength(1);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('點已選中的幣別:不發任何請求', async () => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
      patch: () => success({ baseCurrency: 'TWD' }),
    });
    await mountApiOverview(fetchMock);

    click(button('base-currency-option-TWD'));
    await flushAsync();

    expect(patchCalls(fetchMock)).toHaveLength(0);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(ccyPressed()).toEqual(['TWD']);
  });

  it('PATCH 失敗(VALIDATION_FAILED + fields.baseCurrency):回原值、role=alert 文案 + code / traceId,無重試鈕,不重讀', async () => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
      patch: () => failure('VALIDATION_FAILED', 'trace-ccy-bad', 400, { baseCurrency: 'unsupported secret-detail' }),
    });
    await mountApiOverview(fetchMock);

    click(button('base-currency-option-USD'));
    await flushAsync();

    expect(ccyPressed()).toEqual(['TWD']);
    for (const code of ['TWD', 'USD', 'EUR', 'JPY']) {
      expect(button(`base-currency-option-${code}`).disabled, code).toBe(false);
    }
    const error = requireTestid('base-currency-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(t('en', 'baseCurrencyErrUnsupported'));
    expect(requireTestid('base-currency-error-code').textContent).toContain('VALIDATION_FAILED');
    expect(requireTestid('base-currency-trace-id').textContent).toContain('trace-ccy-bad');
    // 後端 message / fields value 不外洩
    expect(document.body.textContent).not.toContain('backend said no');
    expect(document.body.textContent).not.toContain('secret-detail');
    // 無重試鈕:錯誤區塊內沒有 button
    expect(error.querySelector('button')).toBeNull();
    expect(testid('base-currency-switching')).toBeNull();
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(portfolioRevisionCause.value).toBeNull();

    // 再點一次即重試;成功後錯誤消失
    // (這裡只證明再點會再送出,不是第二個 PATCH 的成功路徑)
    click(button('base-currency-option-USD'));
    await flushAsync();
    expect(patchCalls(fetchMock)).toHaveLength(2);
  });

  it.each([
    ['AUTH_CSRF_TOKEN_INVALID', 403, 'baseCurrencyErrCsrf'],
    ['AUTH_FORBIDDEN', 403, 'baseCurrencyErrForbidden'],
    ['INTERNAL_ERROR', 500, 'baseCurrencyErrUnknown'],
  ])('PATCH 失敗 %s(%i)顯示 %s', async (code, status, key) => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
      patch: () => failure(code, 'trace-x', status),
    });
    await mountApiOverview(fetchMock);

    click(button('base-currency-option-JPY'));
    await flushAsync();

    expect(requireTestid('base-currency-error').textContent).toContain(t('en', key));
    expect(ccyPressed()).toEqual(['TWD']);
  });

  it('網路失敗:顯示 baseCurrencyErrNetwork 並回原值', async () => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => tradePage(API_TRADES),
      patch: () => { throw new TypeError('Failed to fetch'); },
    });
    await mountApiOverview(fetchMock);

    click(button('base-currency-option-EUR'));
    await flushAsync();

    expect(requireTestid('base-currency-error').textContent).toContain(t('en', 'baseCurrencyErrNetwork'));
    expect(ccyPressed()).toEqual(['TWD']);
  });

  it('PATCH 成功但重讀失敗:顯示 portfolioStaleAfterBaseCurrency,選中新值,金額仍帶舊代碼', async () => {
    setCookie();
    let summaryFails = false;
    const fetchMock = routedFetch({
      summary: () => (summaryFails ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-stale') : success(SUMMARY)),
      trades: () => tradePage(API_TRADES),
      patch: () => { summaryFails = true; return success({ baseCurrency: 'USD' }); },
    });
    await mountApiOverview(fetchMock);

    click(button('base-currency-option-USD'));
    await flushAsync();

    const stale = requireTestid('overview-refresh-error');
    expect(stale.getAttribute('role')).toBe('status');
    expect(stale.textContent).toContain(t('en', 'portfolioStaleAfterBaseCurrency'));
    expect(stale.textContent).not.toContain(t('en', 'portfolioStaleAfterTrade'));
    expect(ccyPressed()).toEqual(['USD']);
    // 每個金額自帶代碼 → 不會出現「標示 USD、實為 TWD」的無聲錯誤
    expect(kpiCcy(allTestids('overview-kpi')[0])).toBe('TWD');
    // 重讀失敗後工具列不被鎖死
    expect(button('base-currency-option-EUR').disabled).toBe(false);
  });

  it('fxExcludedCount > 0:工具列顯示缺匯率提示;為 0 時不渲染', async () => {
    setCookie();
    const withExcluded = routedFetch({
      summary: () => success(summaryWith({ fxExcludedCount: 1 })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(withExcluded);
    const hint = requireTestid('overview-fx-excluded');
    expect(hint.textContent).toContain(tf('en', 'fxExcludedHint', { n: 1, base: 'TWD' }));
    expect(hint.textContent).not.toContain('{');
    cleanupMounted();

    const without = routedFetch({ summary: () => success(SUMMARY), trades: () => tradePage(API_TRADES) });
    await mountApiOverview(without);
    expect(testid('overview-fx-excluded')).toBeNull();
    expect(testid('base-currency-switch')).not.toBeNull();
  });

  it('summary 載入中 / 失敗時不渲染工具列與 KPI', async () => {
    const pending: Handler = () => new Promise<Response>(() => {});
    await mountApiOverview(routedFetch({ summary: pending, trades: pending }));
    expect(testid('base-currency-switch')).toBeNull();
    expect(allTestids('overview-kpi')).toHaveLength(0);
    cleanupMounted();

    await mountApiOverview(routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-down'),
      trades: () => tradePage(API_TRADES),
    }));
    expect(testid('base-currency-switch')).toBeNull();
    expect(allTestids('overview-kpi')).toHaveLength(0);
  });

  it('mock mode 不渲染工具列', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();
    expect(testid('base-currency-switch')).toBeNull();
    expect(testid('overview-fx-excluded')).toBeNull();
  });
});

describe('Overview — 可用現金卡(D-07 / D-08 / D-11 / D-29,API mode)', () => {
  const MIXED = [
    { currency: 'USD', amount: -1200 },
    { currency: 'TWD', amount: 50000 },
    { currency: 'JPY', amount: 0 },
  ];

  async function mountCash(overrides: Partial<PortfolioSummaryDto>, props: Record<string, unknown> = {}) {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(summaryWith(overrides)),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock, props);
    return { fetchMock, card: allTestids('overview-kpi')[2] };
  }

  it('各幣別餘額:非零、TWD / USD / EUR / JPY 固定順序、以 · 連接,JPY 0 不列', async () => {
    const { card } = await mountCash({ cashBalances: MIXED });
    const balances = card.querySelector('[data-testid="overview-kpi-cash-balances"]');
    expect(balances, 'balances row').toBeTruthy();
    expect(balances!.textContent?.replace(/\s+/g, ' ').trim()).toBe('TWD 50,000.00 · USD -1,200.00');
    expect(balances!.textContent).not.toContain('JPY');
  });

  it('JPY 餘額 0 位小數、EUR 排在 USD 之後', async () => {
    const { card } = await mountCash({
      cashBalances: [{ currency: 'JPY', amount: 1500 }, { currency: 'EUR', amount: 10.5 }, { currency: 'USD', amount: 3 }],
    });
    expect(card.querySelector('[data-testid="overview-kpi-cash-balances"]')!.textContent?.trim())
      .toBe('USD 3.00 · EUR 10.50 · JPY 1,500');
  });

  it('全為 0:不渲染各幣別餘額列', async () => {
    const { card } = await mountCash({ cashBalances: [{ currency: 'TWD', amount: 0 }, { currency: 'USD', amount: 0 }] });
    expect(card.querySelector('[data-testid="overview-kpi-cash-balances"]')).toBeNull();
    expect(card.querySelector('[data-testid="overview-kpi-cash-negative"]')).toBeNull();
  });

  it('任一幣別為負:顯示「USD cash is negative…」,⚠ aria-hidden,數值不變紅;總額為正仍提示', async () => {
    const { card } = await mountCash({ cash: 84210.5, cashBalances: MIXED });
    const negative = requireTestid('overview-kpi-cash-negative');
    expect(negative.textContent).toContain(tf('en', 'cashNegativeHint', { codes: 'USD' }));
    expect(negative.querySelector('[aria-hidden="true"]')?.textContent).toBe('⚠');
    // 數值維持 --fg,不得用 --dn(U-06)
    expect(card.querySelector('.kpi-v')!.getAttribute('style') ?? '').not.toContain('--dn');
    expect(negative.getAttribute('style') ?? '').not.toContain('--dn');
    expect(kpiValue(card)).toBe('84,211');
  });

  it('多個負值幣別以 ", " 連接(zh 為「、」)', async () => {
    const cashBalances = [{ currency: 'USD', amount: -5 }, { currency: 'TWD', amount: -9 }];
    const en = await mountCash({ cashBalances });
    expect(requireTestid('overview-kpi-cash-negative').textContent)
      .toContain(tf('en', 'cashNegativeHint', { codes: 'TWD, USD' }));
    expect(en.card).toBeTruthy();
    cleanupMounted();

    await mountCash({ cashBalances }, { lang: 'zh' });
    expect(requireTestid('overview-kpi-cash-negative').textContent)
      .toContain(tf('zh', 'cashNegativeHint', { codes: 'TWD、USD' }));
  });

  it('總額為負(已折算)也顯示帶 - 號的數值,不夾成 0', async () => {
    const { card } = await mountCash({ cash: -1200, cashBalances: [{ currency: 'USD', amount: -1200 }] });
    expect(kpiValue(card)).toBe('-1,200');
  });

  it('現金幣別缺匯率:顯示 cashFxExcludedHint;該幣別餘額為 0 時不提示', async () => {
    const { card } = await mountCash({
      unconvertedCurrencies: ['EUR'],
      cashBalances: [{ currency: 'TWD', amount: 100 }, { currency: 'EUR', amount: 20 }],
    });
    expect(card.querySelector('[data-testid="overview-kpi-cash-fx-excluded"]')!.textContent)
      .toContain(tf('en', 'cashFxExcludedHint', { codes: 'EUR', base: 'TWD' }));
    cleanupMounted();

    const { card: other } = await mountCash({
      unconvertedCurrencies: ['EUR'],
      cashBalances: [{ currency: 'TWD', amount: 100 }, { currency: 'EUR', amount: 0 }],
    });
    expect(other.querySelector('[data-testid="overview-kpi-cash-fx-excluded"]')).toBeNull();
  });

  it('入金鈕:開啟對話框,預設類型 DEPOSIT、幣別為第一個為負的幣別(USD)', async () => {
    await mountCash({ cashBalances: MIXED });
    click(button('overview-cash-deposit'));
    await flushAsync();

    requireTestid('cash-dialog');
    expect(requireTestid('cash-type-deposit').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-currency-USD').getAttribute('aria-pressed')).toBe('true');
  });

  it('入金鈕:沒有負值幣別時預設基準幣', async () => {
    await mountCash({ baseCurrency: 'EUR', cashBalances: [{ currency: 'TWD', amount: 10 }] });
    click(button('overview-cash-deposit'));
    await flushAsync();

    expect(requireTestid('cash-currency-EUR').getAttribute('aria-pressed')).toBe('true');
  });

  it('出金鈕:預設類型 WITHDRAWAL、幣別為基準幣,並把 cashBalances 傳給對話框(超額提示)', async () => {
    await mountCash({ baseCurrency: 'USD', cashBalances: [{ currency: 'USD', amount: 100 }, { currency: 'TWD', amount: -50 }] });
    click(button('overview-cash-withdraw'));
    await flushAsync();

    expect(requireTestid('cash-type-withdrawal').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-currency-USD').getAttribute('aria-pressed')).toBe('true');
    await setValue(requireTestid('cash-amount') as HTMLInputElement, '250');
    expect(testid('cash-withdraw-over-balance')).toBeTruthy();
  });

  it('兩顆動作鈕不是 accent,且是 type=button', async () => {
    await mountCash({ cashBalances: MIXED });
    for (const id of ['overview-cash-deposit', 'overview-cash-withdraw', 'overview-cash-view-entries']) {
      expect(button(id).getAttribute('type'), id).toBe('button');
    }
    expect(button('overview-cash-deposit').className).toContain('btn-ghost-sm');
    expect(button('overview-cash-deposit').className).not.toContain('btn-accent');
    expect(button('overview-cash-view-entries').textContent).toContain(t('en', 'cashViewEntries'));
  });

  it('入金成功後以 cause=cash 重讀 summary(不借用交易通知)', async () => {
    setCookie();
    const fetchMock = routedFetch({
      summary: () => success(summaryWith({ cashBalances: MIXED })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);

    notifyCashEntryCreated({ id: 'e-1' });
    await flushAsync();

    expect(portfolioRevisionCause.value).toBe('cash');
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
  });

  it('「入出金紀錄 →」:點擊 emit navigate("cash")', async () => {
    const navigate: string[] = [];
    await mountCash({ cashBalances: MIXED }, { onNavigate: (page: string) => navigate.push(page) });
    click(button('overview-cash-view-entries'));
    expect(navigate).toEqual(['cash']);
  });
});

describe('Overview — mock mode 的可用現金卡(鐵律 6:不得有無效果的控制)', () => {
  it('不渲染入金 / 出金鈕與各幣別餘額,但仍有「入出金紀錄 →」並 emit navigate("cash")', async () => {
    const navigate: string[] = [];
    mountWithPinia(Overview, { lang: 'en', onNavigate: (page: string) => navigate.push(page) });
    await flushAsync();

    expect(allTestids('overview-kpi')).toHaveLength(4);
    expect(testid('overview-cash-deposit')).toBeNull();
    expect(testid('overview-cash-withdraw')).toBeNull();
    expect(testid('overview-kpi-cash-balances')).toBeNull();
    expect(testid('overview-kpi-cash-negative')).toBeNull();
    expect(document.body.querySelector('[data-testid="cash-dialog"]')).toBeNull();

    const link = button('overview-cash-view-entries');
    expect(link.textContent).toContain(t('en', 'cashViewEntries'));
    // 只有第 3 張卡(可用現金)有這個連結
    expect(allTestids('overview-kpi')[2].contains(link)).toBe(true);
    click(link);
    expect(navigate).toEqual(['cash']);
  });
});

describe('Overview — 重讀失敗文案依觸發來源(U-09 / T-04.1-56)', () => {
  const TRADE_FOR_NOTIFY: TradeDto = {
    id: 'tr-n', symbol: 'ZNEW', type: 'BUY', quantity: 1, price: 2, fee: 0, note: null,
    currency: 'TWD', executedAt: '2026-06-06T09:30:00Z', createdAt: '2026-06-06T09:30:00Z',
  };

  async function staleTextAfter(trigger: () => void): Promise<string> {
    let summaryFails = false;
    const fetchMock = routedFetch({
      summary: () => (summaryFails ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-stale') : success(SUMMARY)),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);
    summaryFails = true;
    trigger();
    await flushAsync();
    const stale = requireTestid('overview-refresh-error');
    expect(stale.getAttribute('role')).toBe('status');
    return stale.textContent ?? '';
  }

  it('交易 → portfolioStaleAfterTrade', async () => {
    const text = await staleTextAfter(() => notifyTradeCreated(TRADE_FOR_NOTIFY));
    expect(text).toContain(t('en', 'portfolioStaleAfterTrade'));
    expect(text).not.toContain(t('en', 'portfolioStaleAfterCashEntry'));
    expect(text).not.toContain(t('en', 'portfolioStaleAfterBaseCurrency'));
  });

  it('入出金 → portfolioStaleAfterCashEntry(不得說「交易」)', async () => {
    const text = await staleTextAfter(() => notifyCashEntryCreated({ id: 'e-2' }));
    expect(text).toContain(t('en', 'portfolioStaleAfterCashEntry'));
    expect(text).not.toContain(t('en', 'portfolioStaleAfterTrade'));
  });

  it('基準幣 → portfolioStaleAfterBaseCurrency', async () => {
    const text = await staleTextAfter(() => bumpPortfolioRevision('baseCurrency'));
    expect(text).toContain(t('en', 'portfolioStaleAfterBaseCurrency'));
    expect(text).not.toContain(t('en', 'portfolioStaleAfterTrade'));
  });

  it('近期交易區塊重讀失敗的 stale 提示同樣依來源選文案', async () => {
    let tradesFail = false;
    const fetchMock = routedFetch({
      summary: () => success(SUMMARY),
      trades: () => (tradesFail ? failure('TRADE_LIST_UNAVAILABLE', 'trace-t') : tradePage(API_TRADES)),
    });
    await mountApiOverview(fetchMock);
    tradesFail = true;
    notifyCashEntryCreated({ id: 'e-3' });
    await flushAsync();

    const stale = requireTestid('overview-refresh-error');
    expect(stale.textContent).toContain(t('en', 'portfolioStaleAfterCashEntry'));
    expect(stale.textContent).not.toContain(t('en', 'portfolioStaleAfterTrade'));
  });
});


// =====================================================================================
// 04.1-18 Task 3:資產配置 donut(D-18)、近期交易幣別(D-28)、格線重排。
// =====================================================================================

const ALLOCATION = [
  { category: 'CASH', value: 35164, weight: 0.35164 },
  { category: 'CRYPTO', value: 32418, weight: 0.32418 },
  { category: 'STOCK', value: 32418, weight: 0.32418 },
];

function allocationCard(): HTMLElement {
  return requireTestid('overview-allocation');
}

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
}

async function mountAllocation(overrides: Partial<PortfolioSummaryDto>) {
  setCookie();
  const fetchMock = routedFetch({
    summary: () => success(summaryWith(overrides)),
    trades: () => tradePage(API_TRADES),
  });
  await mountApiOverview(fetchMock);
  return fetchMock;
}

describe('Overview — 資產配置(D-18,API mode)', () => {
  it('以 summary.allocation 渲染:ul / li 三列,每列可讀出類別、金額、權重', async () => {
    await mountAllocation({ baseCurrency: 'TWD', cash: 35164, allocation: ALLOCATION });

    const card = allocationCard();
    expect(card.textContent).toContain(t('en', 'allocation'));
    const list = card.querySelector('ul');
    expect(list, 'legend ul').toBeTruthy();
    const rows = allTestids('overview-allocation-row');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.tagName).toBe('LI');
      expect(list!.contains(row)).toBe(true);
    }
    expect(plain(rows[0].textContent)).toBe('Cash 35,164 TWD 35.2%');
    expect(plain(rows[1].textContent)).toBe('Crypto 32,418 TWD 32.4%');
    expect(plain(rows[2].textContent)).toBe('Stocks 32,418 TWD 32.4%');
    expect(plain(rows[0].textContent)).toContain(plain(fmtMoney(35164, 'TWD', 0)));
    expect(plain(rows[0].textContent)).toContain(fmtWeightPct(0.35164));
    // 分類色映射(常數,兩模式一致)
    expect(rows[0].querySelector('.alloc-swatch')!.getAttribute('data-color')).toBe('#94a3b8');
    expect(rows[1].querySelector('.alloc-swatch')!.getAttribute('data-color')).toBe('#3b82f6');
    expect(rows[2].querySelector('.alloc-swatch')!.getAttribute('data-color')).toBe('var(--accent)');
    // 有真實分塊,不是 empty / negative-cash
    expect(testid('overview-allocation-empty')).toBeNull();
    expect(testid('overview-allocation-negative-cash')).toBeNull();
  });

  it('Donut 的 SVG aria-hidden="true"(語意由 legend 承擔)', async () => {
    await mountAllocation({ allocation: ALLOCATION });
    const svg = allocationCard().querySelector('svg');
    expect(svg, 'donut svg').toBeTruthy();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('金額帶 summary.baseCurrency,不寫死 TWD', async () => {
    await mountAllocation({ baseCurrency: 'JPY', allocation: [{ category: 'STOCK', value: 1500000, weight: 1 }] });
    const row = requireTestid('overview-allocation-row');
    expect(plain(row.textContent)).toBe('Stocks 1,500,000 JPY 100.0%');
  });

  it.each([
    ['STOCK', 'Stocks', 'var(--accent)'],
    ['CRYPTO', 'Crypto', '#3b82f6'],
    ['FX', 'FX', '#a855f7'],
    ['BOND', 'Bonds', '#f59e0b'],
    ['CASH', 'Cash', '#94a3b8'],
  ])('已知類別 %s → 標籤 %s、色 %s', async (category, label, color) => {
    await mountAllocation({ allocation: [{ category, value: 100, weight: 1 }] });
    const row = requireTestid('overview-allocation-row');
    expect(plain(row.textContent)).toContain(label);
    expect(row.querySelector('.alloc-swatch')!.getAttribute('data-color')).toBe(color);
  });

  it('未知類別(WARRANT):標籤 assetTypeOther、色 --fg-dim,不崩潰也不外露原始字串', async () => {
    await mountAllocation({
      allocation: [{ category: 'WARRANT', value: 500, weight: 0.5 }, { category: 'STOCK', value: 500, weight: 0.5 }],
    });
    const rows = allTestids('overview-allocation-row');
    expect(rows).toHaveLength(2);
    expect(plain(rows[0].textContent)).toContain(t('en', 'assetTypeOther'));
    expect(rows[0].textContent).not.toContain('WARRANT');
    expect(rows[0].querySelector('.alloc-swatch')!.getAttribute('data-color')).toBe('var(--fg-dim)');
  });

  it('只有一類:donut 單色環 + legend 一列', async () => {
    await mountAllocation({ allocation: [{ category: 'STOCK', value: 100, weight: 1 }] });
    expect(allTestids('overview-allocation-row')).toHaveLength(1);
    expect(allocationCard().querySelectorAll('svg circle').length).toBe(2); // 軌道 + 一段
  });

  it('allocation 為空:不畫 donut,顯示 allocationEmpty', async () => {
    await mountAllocation({ allocation: [] });
    const card = allocationCard();
    expect(card.querySelector('svg')).toBeNull();
    expect(allTestids('overview-allocation-row')).toHaveLength(0);
    expect(requireTestid('overview-allocation-empty').textContent).toContain(t('en', 'allocationEmpty'));
  });

  it('cash < 0:legend 下方顯示 allocationNegativeCash', async () => {
    await mountAllocation({
      cash: -1200,
      cashBalances: [{ currency: 'TWD', amount: -1200 }],
      allocation: [{ category: 'STOCK', value: 100, weight: 1 }],
    });
    expect(requireTestid('overview-allocation-negative-cash').textContent)
      .toContain(t('en', 'allocationNegativeCash'));
    expect(allTestids('overview-allocation-row')).toHaveLength(1);
  });

  it('cash < 0 且 allocation 為空:兩個提示都在', async () => {
    await mountAllocation({ cash: -5, allocation: [] });
    expect(testid('overview-allocation-empty')).not.toBeNull();
    expect(testid('overview-allocation-negative-cash')).not.toBeNull();
  });

  it('summary 載入中:卡內顯示載入中…;summary 失敗:資產配置卡不渲染(U-19)', async () => {
    const pending: Handler = () => new Promise<Response>(() => {});
    await mountApiOverview(routedFetch({ summary: pending, trades: pending }));
    expect(requireTestid('overview-allocation-loading').textContent).toContain(t('en', 'loading'));
    expect(testid('overview-allocation')).toBeNull();
    cleanupMounted();

    await mountApiOverview(routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-down'),
      trades: () => tradePage(API_TRADES),
    }));
    expect(testid('overview-allocation')).toBeNull();
    expect(testid('overview-allocation-loading')).toBeNull();
    expect(testid('overview-allocation-empty')).toBeNull();
    expect(document.body.textContent).not.toContain(t('en', 'allocation'));
  });

  it('重讀後 legend 跟著新的 summary 更新', async () => {
    let allocation = ALLOCATION;
    const fetchMock = routedFetch({
      summary: () => success(summaryWith({ allocation })),
      trades: () => tradePage(API_TRADES),
    });
    await mountApiOverview(fetchMock);
    expect(allTestids('overview-allocation-row')).toHaveLength(3);

    allocation = [{ category: 'STOCK', value: 1, weight: 1 }];
    bumpPortfolioRevision('trade');
    await flushAsync();
    expect(allTestids('overview-allocation-row')).toHaveLength(1);
  });
});

describe('Overview — mock mode 的資產配置(共用模板)', () => {
  it('donut 與 5 列 legend 照舊,legend 只有百分比、沒有金額', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();

    const card = allocationCard();
    expect(card.querySelector('svg')).toBeTruthy();
    expect(card.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    const rows = allTestids('overview-allocation-row');
    expect(rows).toHaveLength(5);
    expect(document.body.querySelectorAll('.alloc-row')).toHaveLength(5);
    expect(plain(rows[0].textContent)).toBe('Equity 52.0%');
    expect(card.querySelectorAll('.alloc-amt')).toHaveLength(0);
    expect(card.textContent).not.toContain('TWD');
    expect(testid('overview-allocation-negative-cash')).toBeNull();
    expect(testid('overview-allocation-empty')).toBeNull();
  });
});

describe('Overview — 近期交易的幣別(D-28,API mode)', () => {
  function trade(overrides: Partial<TradeDto>): TradeDto {
    return { ...API_TRADES[0], ...overrides };
  }

  async function mountTrades(items: TradeDto[]) {
    const fetchMock = routedFetch({ summary: () => success(SUMMARY), trades: () => tradePage(items) });
    await mountApiOverview(fetchMock);
    return [...recentTradesCard().querySelectorAll<HTMLElement>('[data-testid="overview-trade-row"]')];
  }

  it('標的後一個 overview-trade-ccy-tag = trade.currency;價格 / 總額為裸數字,整列無 $', async () => {
    const rows = await mountTrades([
      trade({ id: 'a', symbol: 'ZZA', currency: 'USD', quantity: 10, price: 12.5 }),
      trade({ id: 'b', symbol: 'ZZB', currency: 'JPY', quantity: 3, price: 150 }),
      trade({ id: 'c', symbol: 'ZZC', currency: 'TWD', quantity: 10, price: 11.5 }),
    ]);

    expect(rows).toHaveLength(3);
    const tags = rows.map(row => row.querySelector('[data-testid="overview-trade-ccy-tag"]')?.textContent);
    expect(tags).toEqual(['USD', 'JPY', 'TWD']);
    expect(allTestids('overview-trade-ccy-tag')).toHaveLength(3);
    // 標籤在標的格內、symbol 之後
    const symbolCell = rows[0].querySelectorAll('td')[2];
    expect(symbolCell.contains(rows[0].querySelector('[data-testid="overview-trade-ccy-tag"]'))).toBe(true);
    expect(symbolCell.textContent).toContain('ZZA');

    const usd = rows[0].querySelectorAll('td');
    expect(usd[4].textContent?.trim()).toBe('12.50');
    expect(usd[5].textContent?.trim()).toBe('125');
    // JPY 沒有輔幣:價格 0 位小數
    const jpy = rows[1].querySelectorAll('td');
    expect(jpy[4].textContent?.trim()).toBe('150');
    expect(jpy[5].textContent?.trim()).toBe('450');
    for (const row of rows) expect(row.textContent).not.toContain('$');
  });

  it('currency 缺值:不渲染標籤、金額仍顯示裸數字,不出現 $ 或 undefined / null', async () => {
    const rows = await mountTrades([trade({ id: 'n', symbol: 'ZZN', currency: null, quantity: 3, price: 100 })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-testid="overview-trade-ccy-tag"]')).toBeNull();
    const cells = rows[0].querySelectorAll('td');
    expect(cells[4].textContent?.trim()).toBe('100.00');
    expect(cells[5].textContent?.trim()).toBe('300');
    expect(rows[0].textContent).not.toContain('$');
    expect(rows[0].textContent).not.toContain('undefined');
    expect(rows[0].textContent).not.toContain('null');
  });

  it('API tbody 的原始碼不再有 `${{`(不寫死 $)', () => {
    const tbody = overviewSource.slice(overviewSource.indexOf('<tbody v-else'), overviewSource.indexOf('</tbody>', overviewSource.indexOf('<tbody v-else')));
    expect(tbody).not.toMatch(/\$\{\{/);
    expect(tbody).toContain('overview-trade-ccy-tag');
  });

  it('mock tbody 不變:仍是 $ 前綴、沒有幣別標籤', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();
    const card = recentTradesCard();
    expect(card.textContent).toContain('$');
    expect(card.querySelector('[data-testid="overview-trade-ccy-tag"]')).toBeNull();
  });

  it('表格容器可在卡內水平捲動(overflow-x: auto)', () => {
    expect(overviewSource).toMatch(/\.trades-scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(overviewSource).toContain('class="trades-scroll"');
  });
});

describe('Overview — 格線重排(U-27)', () => {
  function titleOrder(): string[] {
    return [...document.body.querySelectorAll('.ttl')].map(el => el.textContent?.trim() ?? '');
  }

  it('API mode:資產配置 → 近期交易 → 觀察清單 → 新聞(資產走勢隱藏)', async () => {
    await mountAllocation({ allocation: ALLOCATION });
    expect(titleOrder()).toEqual([
      t('en', 'allocation'),
      t('en', 'recentTrades'),
      `★ ${t('en', 'watchlist')}`,
      t('en', 'news'),
    ]);
  });

  it('mock mode:資產走勢 → 資產配置 → 近期交易 → 觀察清單 → 新聞', async () => {
    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();
    expect(titleOrder()).toEqual([
      t('en', 'assetTrend'),
      t('en', 'allocation'),
      t('en', 'recentTrades'),
      `★ ${t('en', 'watchlist')}`,
      t('en', 'news'),
    ]);
  });

  it('API mode:資產配置 span 4、近期交易 span 8;mock mode:近期交易 span 12', async () => {
    await mountAllocation({ allocation: ALLOCATION });
    expect(allocationCard().classList.contains('col-4')).toBe(true);
    expect(recentTradesCard().classList.contains('col-8')).toBe(true);
    cleanupMounted();

    mountWithPinia(Overview, { lang: 'en' });
    await flushAsync();
    expect(recentTradesCard().classList.contains('col-12')).toBe(true);
    expect(recentTradesCard().classList.contains('col-8')).toBe(false);
  });

  it('響應式斷點:640–1099px KPI span 6、配置與交易 span 12;< 640px KPI span 12(原始碼)', () => {
    const at1099 = overviewSource.slice(overviewSource.indexOf('@media (max-width: 1099px)'));
    expect(at1099).toMatch(/@media \(max-width: 1099px\)\s*\{[^}]*\.kpi-card\s*\{\s*grid-column:\s*span 6/);
    expect(at1099).toMatch(/\.stack-narrow\s*\{\s*grid-column:\s*span 12/);
    expect(overviewSource).toMatch(/@media \(max-width: 639px\)\s*\{[^}]*\.kpi-card\s*\{\s*grid-column:\s*span 12/);
  });
});
