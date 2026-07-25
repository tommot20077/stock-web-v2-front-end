import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Positions from './Positions.vue';
// 原始碼字面(Vite ?raw):用來斷言 Positions 沒有 import mock store(PORT-04 / judgment §3)。
// 不走 node:fs —— 本專案 tsconfig 未含 @types/node,且本 plan 不得新增套件(沿用 03-03 的手法)。
import positionsSource from './Positions.vue?raw';
import { fmtNum, fmtPct } from '../data';
import { t } from '../i18n';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { HoldingDto, PortfolioSummaryDto } from '../services/apiTypes';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';

// Phase 3 Plan 04(03-04-PLAN.md)。API mode 的 Positions 一律讀後端欄位(D-04),
// weight 是唯一的前端衍生例外(marketValue / summary.totalMarketValue),priceTime 依 D-03 顯示,
// sector 卡 / 權益曲線 / 時光機 / Sharpe·年化·MaxDD 假 KPI 依 D-01 更正 + D-16 隱藏。
// 四態與 traceId 見 D-11 / D-12。mock mode 必須與 Phase 3 之前完全一致。

/**
 * 「後端值 ≠ 前端算式」的關鍵 fixture(T-03-11 的實質證據)。
 * qty×price = 1000 但後端 marketValue = 999;qty×avg = 200 但後端 costBasis = 777;
 * 兩者相減 = 222(或 800)但後端 unrealizedPnl = 555;555/777 = 71.43% 但後端 roi = 1.17%。
 * 任何一處回到前端重算,對應斷言就會紅。
 */
const TRUTH_HOLDING: HoldingDto = {
  assetId: 'asset-zza',
  symbol: 'ZZA',
  assetName: 'Zeta Alpha Corp.',
  totalQuantity: 10,
  avgCost: 20,
  costBasis: 777,
  marketPrice: 100,
  marketValue: 999,
  realizedPnl: 33,
  unrealizedPnl: 555,
  roi: 0.0117,
  priceTime: '2026-07-24T13:45:00Z',
  lastUpdated: '2026-07-24T13:46:00Z',
};

/**
 * 同理:彙總條六欄都刻意與「由 holdings 前端加總」得到的值不同。
 * holdingCount = 7 但只有一筆持倉列 —— 標題列若改用 holdings.length 就會紅。
 */
const TRUTH_SUMMARY: PortfolioSummaryDto = {
  totalMarketValue: 4242,
  totalCostBasis: 3131,
  realizedPnl: 222,
  unrealizedPnl: 1111,
  totalPnl: 1333,
  roi: 0.4258,
  holdingCount: 7,
};

function holding(over: Partial<HoldingDto> & { symbol: string }): HoldingDto {
  return {
    assetId: `asset-${over.symbol}`,
    assetName: `${over.symbol} Corp.`,
    totalQuantity: 1,
    avgCost: 1,
    costBasis: 1,
    marketPrice: 1,
    marketValue: 1,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roi: 0,
    priceTime: '2026-07-24T13:45:00Z',
    lastUpdated: '2026-07-24T13:46:00Z',
    ...over,
  };
}

function summaryWith(over: Partial<PortfolioSummaryDto> = {}): PortfolioSummaryDto {
  return {
    totalMarketValue: 0,
    totalCostBasis: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    roi: 0,
    holdingCount: 0,
    ...over,
  };
}

/** 與 Positions.vue 的 fmtDateTime 同語意的獨立實作(本地時區短格式),避免測試綁死時區。 */
function expectedPriceTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

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

type Handler = () => Response | Promise<Response>;

function routedFetch(handlers: { summary: Handler; holdings: Handler }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/portfolio/holdings')) return handlers.holdings();
    if (url.includes('/portfolio/summary')) return handlers.summary();
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function callsMatching(fetchMock: ReturnType<typeof routedFetch>, fragment: string): string[] {
  return fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.includes(fragment));
}

async function mountApiPositions(fetchMock: ReturnType<typeof routedFetch>) {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  // Pitfall 7:client 以 mode 為 key 快取,切模式前先清,避免跨測試汙染。
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchMock);
  mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
  await flushAsync();
}

async function mountApiWith(holdings: HoldingDto[], summary: PortfolioSummaryDto) {
  const fetchMock = routedFetch({
    summary: () => success(summary),
    holdings: () => success(holdings),
  });
  await mountApiPositions(fetchMock);
  return fetchMock;
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

function rows(): HTMLElement[] {
  return allTestids('positions-row');
}

function rowSymbols(): string[] {
  return rows().map(row => row.querySelector('td')!.textContent!.trim());
}

function moverSymbols(): string[] {
  return [...document.body.querySelectorAll('.mover')]
    // .mover > div(flex) > [ .mtag, div(min-width:0) > [ div(sym), div(name) ] ]
    .map(m => m.querySelector('.mtag + div > div')!.textContent!.trim());
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function headerCell(text: string): HTMLElement {
  const th = [...document.body.querySelectorAll<HTMLElement>('thead th')]
    .find(el => el.textContent?.trim().startsWith(text));
  expect(th, `<th> starting with "${text}"`).toBeTruthy();
  return th!;
}

afterEach(() => {
  cleanupMounted();
  configureApiClientSessionHandlers({});
});

describe('Positions — API mode 讀後端真相(D-04 / D-03 / D-01 / D-16)', () => {
  it('持倉列的市值/損益/ROI 一律用後端欄位,不做 qty×price 之類的前端重算(D-04)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    expect(rows()).toHaveLength(1);
    const row = rows()[0].textContent ?? '';

    expect(row).toContain('ZZA');
    expect(row).toContain('Zeta Alpha Corp.');
    expect(row).toContain('10');
    expect(row).toContain(`$${fmtNum(20)}`);
    expect(row).toContain(`$${fmtNum(100)}`);

    // 市值讀 marketValue(999),不是 totalQuantity × marketPrice(1000)
    expect(row).toContain(`$${fmtNum(999, 0)}`);
    expect(row).not.toContain(`$${fmtNum(1000, 0)}`);

    // 未實現損益讀 unrealizedPnl(555),不是 999-777(222)也不是 1000-200(800)
    expect(row).toContain(`+$${fmtNum(555, 0)}`);
    expect(row).not.toContain(`$${fmtNum(222, 0)}`);
    expect(row).not.toContain(`$${fmtNum(800, 0)}`);

    // 報酬率讀 roi × 100(1.17%),不是 unrealizedPnl / costBasis(71.43%)
    expect(row).toContain(fmtPct(0.0117 * 100));
    expect(row).not.toContain(fmtPct(555 / 777 * 100));

    // weight 的分母是 summary.totalMarketValue(4242),不是本頁 holdings 的市值總和(999)
    expect(row).toContain('23.6%');
    expect(row).not.toContain('100.0%');
  });

  it('weight 由 marketValue / summary.totalMarketValue 衍生(D-04 明文例外)', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'BIG', marketValue: 750 }),
        holding({ symbol: 'SML', marketValue: 250 }),
      ],
      summaryWith({ totalMarketValue: 1000, holdingCount: 2 }),
    );

    const weights = allTestids('positions-weight').map(el => el.textContent?.trim());
    expect(weights).toEqual(['75.0%', '25.0%']);

    const widths = [...document.body.querySelectorAll<HTMLElement>('.bar-fill')].map(el => el.style.width);
    expect(widths).toEqual(['75%', '25%']);
  });

  it('每列 price 欄顯示 priceTime 行情時間,null 時退回破折號(D-03)', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'AAA', priceTime: '2026-07-24T13:45:00Z' }),
        holding({ symbol: 'BBB', priceTime: null }),
      ],
      summaryWith({ totalMarketValue: 2, holdingCount: 2 }),
    );

    const stamps = allTestids('positions-price-time');
    expect(stamps).toHaveLength(2);
    expect(stamps[0].textContent?.trim()).toBe(expectedPriceTime('2026-07-24T13:45:00Z'));
    expect(stamps[0].getAttribute('title')).toBe(t('en', 'priceAsOf'));
    expect(stamps[1].textContent?.trim()).toBe('—');
    expect(document.body.textContent).not.toMatch(/NaN|Invalid Date/);
  });

  it('彙總條六張卡全部來自 summary 後端欄位,取代 Sharpe/年化/MaxDD 假 KPI(D-14 落點 + D-16)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    const stats = allTestids('positions-stat');
    expect(stats).toHaveLength(6);
    const text = stats.map(s => s.textContent ?? '');

    expect(text[0]).toContain(t('en', 'mktValue'));
    expect(text[0]).toContain(`$${fmtNum(TRUTH_SUMMARY.totalMarketValue, 0)}`);
    expect(text[1]).toContain(t('en', 'unrealized'));
    expect(text[1]).toContain(`+$${fmtNum(TRUTH_SUMMARY.unrealizedPnl, 0)}`);
    expect(text[2]).toContain(t('en', 'roi'));
    // roi 是比值,×100 純屬顯示格式化(D-04 允許)
    expect(text[2]).toContain(fmtPct(TRUTH_SUMMARY.roi * 100));
    expect(text[3]).toContain(t('en', 'realizedPnl'));
    expect(text[3]).toContain(`+$${fmtNum(TRUTH_SUMMARY.realizedPnl, 0)}`);
    expect(text[4]).toContain(t('en', 'totalPnlLabel'));
    expect(text[4]).toContain(`+$${fmtNum(TRUTH_SUMMARY.totalPnl, 0)}`);
    expect(text[5]).toContain(t('en', 'costBasis'));
    expect(text[5]).toContain(`$${fmtNum(TRUTH_SUMMARY.totalCostBasis, 0)}`);

    const body = document.body.textContent ?? '';
    expect(body).not.toContain(t('en', 'sharpe'));
    expect(body).not.toContain(t('en', 'annualized'));
    expect(body).not.toContain(t('en', 'maxDd'));
    for (const fake of ['1.68', '+17.4%', '-3.4%']) {
      expect(body).not.toContain(fake);
    }
  });

  it('隱藏 sector 卡、權益曲線 + range 選擇器、時光機(D-01 更正 / D-16)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    const body = document.body.textContent ?? '';
    // Sector breakdown(HoldingDto 無 sector,全部會歸 Other 等同假資料)
    expect(body).not.toContain(t('en', 'sectorBreakdown'));
    expect(document.body.querySelector('.sec-fill')).toBeNull();
    // 權益曲線與 range 選擇器
    expect(body).not.toContain(t('en', 'assetTrend'));
    expect(document.body.querySelector('.seg-btn')).toBeNull();
    expect(document.body.querySelector('svg')).toBeNull();
    for (const range of ['1D', '1W', '1M', '3M', '1Y']) {
      expect([...document.body.querySelectorAll('button')].map(b => b.textContent?.trim()))
        .not.toContain(range);
    }
    // 時光機
    expect(body).not.toContain('Time machine');
    expect(document.body.querySelector('.btn-tm')).toBeNull();
    expect(document.body.querySelector('.tm-bar')).toBeNull();
    expect(document.body.querySelector('.tm-slider')).toBeNull();
  });

  it('Top movers 依後端 unrealizedPnl 絕對值排序取前 4(D-16 例外:真實推導)', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'ZA', unrealizedPnl: 10 }),
        holding({ symbol: 'ZB', unrealizedPnl: -900 }),
        holding({ symbol: 'ZC', unrealizedPnl: 300 }),
        holding({ symbol: 'ZD', unrealizedPnl: -50 }),
        holding({ symbol: 'ZE', unrealizedPnl: 7 }),
      ],
      summaryWith({ totalMarketValue: 5, holdingCount: 5 }),
    );

    expect(moverSymbols()).toEqual(['ZB', 'ZC', 'ZD', 'ZA']);
  });

  it('點 P&L 表頭以後端 unrealizedPnl 排序,再點一次反轉(client-side 排序保留)', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'AAA', marketValue: 30, unrealizedPnl: 100 }),
        holding({ symbol: 'BBB', marketValue: 20, unrealizedPnl: -500 }),
        holding({ symbol: 'CCC', marketValue: 10, unrealizedPnl: 300 }),
      ],
      summaryWith({ totalMarketValue: 60, holdingCount: 3 }),
    );

    // 預設依 marketValue 降序
    expect(rowSymbols()).toEqual(['AAA', 'BBB', 'CCC']);

    click(headerCell('P&L'));
    await nextTick();
    expect(rowSymbols()).toEqual(['CCC', 'AAA', 'BBB']);

    click(headerCell('P&L'));
    await nextTick();
    expect(rowSymbols()).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('標題列彙總顯示 summary 的 totalMarketValue 與 holdingCount(D-04)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    const header = requireTestid('positions-header-summary').textContent ?? '';
    expect(header).toContain(`$${fmtNum(TRUTH_SUMMARY.totalMarketValue, 0)}`);
    // holdingCount = 7,而畫面只有 1 列 —— 證明讀後端而非 holdings.length
    expect(header).toContain('7 holdings');
    expect(rows()).toHaveLength(1);
  });

  it('Positions 不 import mock store,一律經 getRuntimeApiClients(PORT-04 / judgment §3)', () => {
    expect(positionsSource).not.toContain('useMockPortfolioStore');
    expect(positionsSource).not.toContain('stores/mockPortfolio');
    expect(positionsSource).toContain('getRuntimeApiClients');
  });
});

describe('Positions — API mode 四態(D-11 / D-12、PORT-05)', () => {
  it('載入中兩個區塊各自顯示骨架/loading,不依賴資料筆數(Q5)', async () => {
    const pending: Handler = () => new Promise<Response>(() => {});
    await mountApiPositions(routedFetch({ summary: pending, holdings: pending }));

    expect(requireTestid('positions-summary-loading').textContent).toContain(t('en', 'loading'));
    const skeleton = requireTestid('positions-holdings-loading');
    expect(skeleton.textContent).toContain(t('en', 'loading'));
    expect(skeleton.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(0);
    expect(allTestids('positions-stat')).toHaveLength(0);
  });

  it('holdings 回空陣列顯示 noHoldings,且無 NaN / Infinity', async () => {
    await mountApiWith([], summaryWith({ holdingCount: 0 }));

    expect(requireTestid('positions-holdings-empty').textContent).toContain(t('en', 'noHoldings'));
    expect(rows()).toHaveLength(0);
    expect(testid('positions-holdings-error')).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    const widths = [...document.body.querySelectorAll<HTMLElement>('.bar-fill, .sec-fill')].map(el => el.style.width);
    expect(widths.every(width => !/NaN|Infinity/.test(width))).toBe(true);
  });

  it('holdings 失敗顯示錯誤碼 + traceId + 重試,彙總條照常顯示(D-11 / D-12)', async () => {
    let holdingsFail = true;
    const fetchMock = routedFetch({
      summary: () => success(TRUTH_SUMMARY),
      holdings: () => (holdingsFail
        ? failure('PORTFOLIO_HOLDINGS_UNAVAILABLE', 'trace-holdings-down')
        : success([TRUTH_HOLDING])),
    });
    await mountApiPositions(fetchMock);

    const error = requireTestid('positions-holdings-error');
    expect(error.textContent).toContain(t('en', 'loadFailed'));
    expect(error.textContent).toContain('PORTFOLIO_HOLDINGS_UNAVAILABLE');
    expect(error.textContent).toContain('trace-holdings-down');
    // 後端訊息不外洩,只露 code / traceId(T-03-10 慣例)
    expect(error.textContent).not.toContain('backend said no');
    // 區塊獨立:彙總條照常
    expect(allTestids('positions-stat')).toHaveLength(6);
    expect(testid('positions-summary-error')).toBeNull();

    holdingsFail = false;
    click(requireTestid('positions-holdings-retry'));
    await flushAsync();

    // 重試只重打 holdings
    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(testid('positions-holdings-error')).toBeNull();
  });

  it('summary 失敗時表格照常渲染,weight 因無分母顯示破折號(D-11)', async () => {
    let summaryFails = true;
    const fetchMock = routedFetch({
      summary: () => (summaryFails
        ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down')
        : success(TRUTH_SUMMARY)),
      holdings: () => success([TRUTH_HOLDING]),
    });
    await mountApiPositions(fetchMock);

    const error = requireTestid('positions-summary-error');
    expect(error.textContent).toContain('PORTFOLIO_SUMMARY_UNAVAILABLE');
    expect(error.textContent).toContain('trace-summary-down');
    expect(allTestids('positions-stat')).toHaveLength(0);

    // 表格不受影響;weight 沒有可信分母時顯示 — 而不是 0.0%(不編造數字)
    expect(rows()).toHaveLength(1);
    expect(allTestids('positions-weight').map(el => el.textContent?.trim())).toEqual(['—']);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);

    summaryFails = false;
    click(requireTestid('positions-summary-retry'));
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(1);
    expect(allTestids('positions-stat')).toHaveLength(6);
    expect(allTestids('positions-weight').map(el => el.textContent?.trim())).toEqual(['23.6%']);
  });

  it('portfolio 讀取錯誤不劫持全域 SessionBanner(D-13)', async () => {
    const handlers = { onRefreshing: vi.fn(), onRefreshFailed: vi.fn() };
    configureApiClientSessionHandlers(handlers);

    await mountApiPositions(routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down'),
      holdings: () => failure('PORTFOLIO_HOLDINGS_UNAVAILABLE', 'trace-holdings-down'),
    }));

    expect(testid('positions-summary-error')).not.toBeNull();
    expect(testid('positions-holdings-error')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="session-banner"]')).toBeNull();
    expect(handlers.onRefreshing).not.toHaveBeenCalled();
    expect(handlers.onRefreshFailed).not.toHaveBeenCalled();
  });
});

describe('Positions — mock mode 回歸鎖定', () => {
  async function mountMock() {
    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    await flushAsync();
  }

  it('sector 卡、時光機、權益曲線、含 Sharpe/年化/MaxDD 的六張 stat 卡全部保留', async () => {
    await mountMock();

    const body = document.body.textContent ?? '';
    expect(body).toContain(t('en', 'sectorBreakdown'));
    expect(document.body.querySelectorAll('.sec-fill').length).toBeGreaterThan(0);
    expect(body).toContain(t('en', 'assetTrend'));
    expect([...document.body.querySelectorAll('.seg-btn')].map(b => b.textContent))
      .toEqual(['1D', '1W', '1M', '3M', '1Y', 'All']);
    expect(body).toContain('Time machine');
    expect(document.body.querySelector('.btn-tm')).not.toBeNull();

    expect(allTestids('positions-stat')).toHaveLength(6);
    expect(body).toContain(t('en', 'sharpe'));
    expect(body).toContain(t('en', 'annualized'));
    expect(body).toContain(t('en', 'maxDd'));
    // 1M 預設 range 的寫死值
    expect(body).toContain('1.68');
  });

  it('表格渲染 mock 持倉、weight bar 正常,排序仍可切換', async () => {
    await mountMock();

    const portfolio = useMockPortfolioStore();
    expect(rows()).toHaveLength(portfolio.positions.length);
    expect(document.body.querySelectorAll('.bar-fill')).toHaveLength(portfolio.positions.length);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);

    const before = rowSymbols();
    click(headerCell('Qty'));
    await nextTick();
    const desc = rowSymbols();
    expect(desc).not.toEqual(before);
    expect(desc[0]).toBe('2330.TW'); // qty 1000,最大

    click(headerCell('Qty'));
    await nextTick();
    expect(rowSymbols()[0]).toBe('BTC'); // qty 0.42,最小
  });

  it('時光機開啟後 scrubber 出現並改變表格呈現', async () => {
    await mountMock();

    click(document.body.querySelector<HTMLElement>('.btn-tm')!);
    await nextTick();
    expect(document.body.querySelector('.tm-bar')).not.toBeNull();
    expect(document.body.querySelector('.tm-slider')).not.toBeNull();
  });

  it('executeOrder 後新持倉列出現且帶 fresh 高亮(lastFill 經 api.live 委派仍有效)', async () => {
    await mountMock();

    const portfolio = useMockPortfolioStore();
    portfolio.executeOrder({
      sym: 'TSLA',
      name: 'Tesla, Inc.',
      side: 'BUY',
      qty: 5,
      px: 200,
      fee: 1,
      sector: 'Auto',
    });
    await nextTick();

    const tsla = rows().find(row => row.textContent?.includes('TSLA'));
    expect(tsla, 'TSLA row').toBeTruthy();
    expect(tsla!.classList.contains('fresh')).toBe(true);
    expect(rows().filter(row => row.classList.contains('fresh'))).toHaveLength(1);
  });

  it('空持倉不產生 NaN / Infinity(task4 既有品質要求在新結構下仍成立)', async () => {
    await mountMock();

    const portfolio = useMockPortfolioStore();
    portfolio.positions = [];
    await nextTick();

    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    const widths = [...document.body.querySelectorAll<HTMLElement>('.bar-fill, .sec-fill')].map(el => el.style.width);
    expect(widths.every(width => !/NaN|Infinity/.test(width))).toBe(true);
  });

  it('mock mode 不打任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await mountMock();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
