import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Positions from './Positions.vue';
// 原始碼字面(Vite ?raw):用來斷言 Positions 沒有 import mock store(PORT-04 / judgment §3)。
// 不走 node:fs —— 本專案 tsconfig 未含 @types/node,且本 plan 不得新增套件(沿用 03-03 的手法)。
import positionsSource from './Positions.vue?raw';
import { fmtPct } from '../data';
import { fmtMoneyAmount, fmtSignedMoneyAmount } from '../moneyFormat';
import { t } from '../i18n';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  apiLastFill,
  bumpPortfolioRevision,
  notifyTradeCreated,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import OrderTicket from '../components/OrderTicket.vue';
import type { AssetDto, HoldingDto, PortfolioSummaryDto, TradeDto } from '../services/apiTypes';
import { cleanupMounted, flushAsync, mountWithPinia, unmountAll } from '../testUtils';

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
  // Phase 04.1 欄位(04.1-11 只補型別;值刻意不等於 mock 預設)
  currency: 'TWD',
  assetType: 'STOCK',
  sector: 'Tech',
  baseCurrency: 'TWD',
  marketValueInBase: 999,
  previousClose: 90,
  dayPricePnl: 100,
  dayPricePnlRatio: 0.0111,
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
  // Phase 04.1 欄位(04.1-11 只補型別;值刻意不等於 mock 預設,讓後續 plan 的「資料來自 API」斷言可沿用)
  baseCurrency: 'TWD',
  fxExcludedCount: 0,
  unconvertedCurrencies: [],
  dayPricePnl: 4321,
  dayPricePnlRatio: 0.0104,
  dayPnlExcludedCount: 0,
  cash: 84210.5,
  totalEquity: 4242,
  cashBalances: [{ currency: 'TWD', amount: 84210.5 }],
  allocation: [{ category: 'STOCK', value: 4242, weight: 1 }],
  sectorAllocation: [{ sector: 'Tech', value: 4242, weight: 1, holdingCount: 1, unrealizedPnl: 1111 }],
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
    currency: 'TWD',
    assetType: 'STOCK',
    sector: 'Tech',
    baseCurrency: 'TWD',
    marketValueInBase: 1,
    previousClose: null,
    dayPricePnl: null,
    dayPricePnlRatio: null,
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
    baseCurrency: 'TWD',
    fxExcludedCount: 0,
    unconvertedCurrencies: [],
    dayPricePnl: null,
    dayPricePnlRatio: null,
    dayPnlExcludedCount: 0,
    cash: 0,
    totalEquity: 0,
    cashBalances: [],
    allocation: [],
    sectorAllocation: [],
    ...over,
  };
}

/** D-13:成交事件的來源。`notifyTradeCreated` 只用得到其中四欄,其餘給合法佔位值。 */
function freshTrade(symbol: string): TradeDto {
  return {
    id: `trade-${symbol}`,
    symbol,
    type: 'BUY',
    quantity: 1,
    price: 1,
    fee: 0,
    note: null,
    currency: 'USD',
    executedAt: '2026-08-15T10:30:00+08:00',
    createdAt: '2026-08-15T10:30:05+08:00',
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

/** 標的格除了 symbol 還有 .ccy-tag / .fresh-badge 兩個 span;只取 td 自己的文字節點才是 symbol。 */
function rowSymbols(): string[] {
  return rows().map(row => [...row.querySelector('td')!.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent ?? '')
    .join('')
    .trim());
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
  // 04-07 硬規則:模組級 singleton 的 reset 必須在**各測試檔自己**的 afterEach 呼叫,
  // 絕不得加進 testSetup.ts(那會搶在 vi.mock 之前綁定真實實作)。
  resetPortfolioRevisionForTests();
});

describe('Positions — API mode 讀後端真相(D-04 / D-03 / D-01 / D-16)', () => {
  /*
   * DP-10(04.1-16 改寫既有斷言):金額改為裸數字(D-28 / D-30,幣別由 .ccy-tag 表示一次),
   * 舊的 `$999` / `+$555` / `not.toContain('$1,000')` 全部失效。
   * 舊:row.toContain(`$${fmtNum(999, 0)}`)、`not.toContain($1,000)`、`+$555`、`not.toContain($222 / $800)`
   * 新:以「格」為單位比對 fmtMoneyAmount 的裸數字,否定斷言保留判別力(市值格 ≠ 1,000、損益格 ≠ 222 / 800)。
   */
  it('持倉列的市值/損益/ROI 一律用後端欄位,不做 qty×price 之類的前端重算(D-04),金額為裸數字', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    expect(rows()).toHaveLength(1);
    const row = rows()[0].textContent ?? '';
    const cells = [...rows()[0].querySelectorAll('td')];

    expect(row).toContain('ZZA');
    expect(row).toContain('Zeta Alpha Corp.');
    expect(cells[2].textContent?.trim()).toBe('10');
    expect(cells[3].textContent).toContain(fmtMoneyAmount(20, 'TWD', 2));
    expect(cells[4].textContent).toContain(fmtMoneyAmount(100, 'TWD', 2));

    // 市值讀 marketValue(999),不是 totalQuantity × marketPrice(1000)
    expect(cells[5].textContent?.trim()).toBe(fmtMoneyAmount(999, 'TWD', 0));
    expect(cells[5].textContent).not.toContain(fmtMoneyAmount(1000, 'TWD', 0));

    // 未實現損益讀 unrealizedPnl(555),不是 999-777(222)也不是 1000-200(800)
    expect(cells[6].textContent).toContain(fmtSignedMoneyAmount(555, 'TWD', 0));
    expect(cells[6].textContent).not.toContain(fmtMoneyAmount(222, 'TWD', 0));
    expect(cells[6].textContent).not.toContain(fmtMoneyAmount(800, 'TWD', 0));

    // 報酬率讀 roi × 100(1.17%),不是 unrealizedPnl / costBasis(71.43%)
    expect(row).toContain(fmtPct(0.0117 * 100));
    expect(row).not.toContain(fmtPct(555 / 777 * 100));

    // 權重 = marketValueInBase(999)/ summary.totalMarketValue(4242),不是本頁 holdings 的市值總和(999)
    expect(row).toContain('23.6%');
    expect(row).not.toContain('100.0%');

    // D-28:整列不再有寫死的 $
    expect(row).not.toContain('$');
  });

  /*
   * DP-10(04.1-16 改寫既有斷言):D-05 之後 summary.totalMarketValue 是基準幣,而 marketValue 仍是原幣。
   * 舊:marketValue(750 / 250)/ totalMarketValue(1000)→ 75.0% / 25.0%。
   * 新:marketValueInBase / totalMarketValue。fixture 刻意讓 marketValue 與 marketValueInBase 差一個匯率,
   *     若實作回到 marketValue 除以基準幣總額,USD 部位的權重會變成個位數 %(Pitfall 3)。
   */
  it('weight 由 marketValueInBase / summary.totalMarketValue 衍生,不碰原幣 marketValue(RESEARCH Q1.4)', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'USD1', currency: 'USD', marketValue: 2000, marketValueInBase: 64836 }),
        holding({ symbol: 'TWD1', currency: 'TWD', marketValue: 35164, marketValueInBase: 35164 }),
        holding({ symbol: 'NOFX', currency: 'EUR', marketValue: 777, marketValueInBase: null }),
      ],
      summaryWith({ totalMarketValue: 100000, holdingCount: 3, fxExcludedCount: 1 }),
    );

    // 預設依 marketValue 降序:TWD1(35164)、USD1(2000)、NOFX(777)
    const bySymbol = (sym: string) => rows().find(r => rowSymbols()[rows().indexOf(r)] === sym)!;
    const weightOf = (sym: string) => bySymbol(sym).querySelector('[data-testid="positions-weight"]')!.textContent?.trim();
    const widthOf = (sym: string) => bySymbol(sym).querySelector<HTMLElement>('.bar-fill')!.style.width;

    expect(weightOf('USD1')).toBe('64.8%');
    expect(parseFloat(widthOf('USD1'))).toBeCloseTo(64.836, 3);
    expect(weightOf('TWD1')).toBe('35.2%');
    // 缺匯率:— 且 bar 寬 0,不編造數字
    expect(weightOf('NOFX')).toBe('—');
    expect(parseFloat(widthOf('NOFX'))).toBe(0);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('權重表頭排序用基準幣權重,null 不論升降冪都排最後', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'NOFX', marketValue: 900, marketValueInBase: null }),
        holding({ symbol: 'BIG', marketValue: 5, marketValueInBase: 60000 }),
        holding({ symbol: 'SML', marketValue: 4, marketValueInBase: 10000 }),
      ],
      summaryWith({ totalMarketValue: 100000, holdingCount: 3 }),
    );

    click(headerCell(t('en', 'weight')));
    await nextTick();
    expect(rowSymbols()).toEqual(['BIG', 'SML', 'NOFX']);

    click(headerCell(t('en', 'weight')));
    await nextTick();
    expect(rowSymbols()).toEqual(['SML', 'BIG', 'NOFX']);
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

    // DP-10(04.1-16):彙總卡改為基準幣數值 + 獨立的 .stat-ccy 代碼 span,不再有寫死的 $。
    // 舊:`$4,242` / `+$1,111` / `+$222` / `+$1,333` / `$3,131`;新:裸數字 + summary.baseCurrency 代碼。
    const ccyOf = (i: number) => stats[i].querySelector('.stat-ccy')?.textContent;
    expect(text[0]).toContain(t('en', 'mktValue'));
    expect(text[0]).toContain(fmtMoneyAmount(TRUTH_SUMMARY.totalMarketValue, 'TWD', 0));
    expect(ccyOf(0)).toBe('TWD');
    expect(text[1]).toContain(t('en', 'unrealized'));
    expect(text[1]).toContain(fmtSignedMoneyAmount(TRUTH_SUMMARY.unrealizedPnl, 'TWD', 0));
    expect(ccyOf(1)).toBe('TWD');
    expect(text[2]).toContain(t('en', 'roi'));
    // roi 是比值,×100 純屬顯示格式化(D-04 允許);比率卡沒有幣別
    expect(text[2]).toContain(fmtPct(TRUTH_SUMMARY.roi * 100));
    expect(ccyOf(2)).toBeUndefined();
    expect(text[3]).toContain(t('en', 'realizedPnl'));
    expect(text[3]).toContain(fmtSignedMoneyAmount(TRUTH_SUMMARY.realizedPnl, 'TWD', 0));
    expect(ccyOf(3)).toBe('TWD');
    expect(text[4]).toContain(t('en', 'totalPnlLabel'));
    expect(text[4]).toContain(fmtSignedMoneyAmount(TRUTH_SUMMARY.totalPnl, 'TWD', 0));
    expect(ccyOf(4)).toBe('TWD');
    expect(text[5]).toContain(t('en', 'costBasis'));
    expect(text[5]).toContain(fmtMoneyAmount(TRUTH_SUMMARY.totalCostBasis, 'TWD', 0));
    expect(ccyOf(5)).toBe('TWD');
    for (const card of text) expect(card).not.toContain('$');

    const body = document.body.textContent ?? '';
    expect(body).not.toContain(t('en', 'sharpe'));
    expect(body).not.toContain(t('en', 'annualized'));
    expect(body).not.toContain(t('en', 'maxDd'));
    for (const fake of ['1.68', '+17.4%', '-3.4%']) {
      expect(body).not.toContain(fake);
    }
  });

  /*
   * ⚠️ DP-10(04.1-16 反轉既有斷言,不是默默刪除):
   * 舊名:「隱藏 sector 卡、權益曲線 + range 選擇器、時光機(D-01 更正 / D-16)」。
   * 舊斷言:API mode `body.not.toContain(sectorBreakdown)`、`.sec-fill` 為 null。
   * 為何反轉:Phase 3 隱藏 sector 卡,是因為 HoldingDto 沒有 sector、全歸 Other 等同假資料;
   *   Phase 04.1(D-19 / PORT-12)後端提供 summary.sectorAllocation,資料來源變成真的,
   *   所以產業卡要在 API mode 顯示 —— 測試意圖本身改變。權益曲線 / range / 時光機仍然隱藏(D-16),斷言原樣保留。
   * 以 mock 不存在的產業名 `Semiconductors-API` 證明資料來自 API(T-04.1-51)。
   */
  it('API mode 顯示 summary.sectorAllocation 的產業卡;權益曲線 + range 選擇器、時光機仍隱藏(D-19 / D-16)', async () => {
    await mountApiWith(
      [TRUTH_HOLDING],
      {
        ...TRUTH_SUMMARY,
        sectorAllocation: [{ sector: 'Semiconductors-API', value: 4242, weight: 1, holdingCount: 1, unrealizedPnl: 1111 }],
      },
    );

    const body = document.body.textContent ?? '';
    // Sector breakdown:由後端分組資料渲染
    expect(body).toContain(t('en', 'sectorBreakdown'));
    expect(requireTestid('positions-sector').textContent).toContain('Semiconductors-API');
    expect(document.body.querySelector('.sec-fill')).not.toBeNull();
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

  // DP-10(04.1-16):舊 `header.toContain($4,242)` → 基準幣裸數字 + 獨立 .stat-ccy 代碼 span。
  it('標題列彙總顯示 summary 的 totalMarketValue(基準幣)與 holdingCount(D-04)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    const headerEl = requireTestid('positions-header-summary');
    const header = headerEl.textContent ?? '';
    expect(header).toContain(fmtMoneyAmount(TRUTH_SUMMARY.totalMarketValue, 'TWD', 0));
    expect(headerEl.querySelector('.stat-ccy')?.textContent).toBe('TWD');
    expect(header).not.toContain('$');
    // holdingCount = 7,而畫面只有 1 列 —— 證明讀後端而非 holdings.length
    expect(header).toContain('7 holdings');
    expect(rows()).toHaveLength(1);
  });

  /*
   * ⚠️ DP-10:這條測試在 Phase 3(commit `587e84e`)是刻意鎖住「**不**高亮」的 —— 當時
   * API mode 根本沒有成交事件來源。Phase 4 的 D-13 是**新的使用者決策**:成交後重讀完成時,
   * 剛成交的那一列必須看得出來。也就是說**測試意圖本身改變了**,不是「改測試遷就實作」
   * (judgment §10 的合法例外)。因此這裡是**改寫斷言 + 更新測試名**,而不是默默刪除。
   * 反轉前的原名:「API mode 的持倉列不帶 lastFill 高亮」。
   */
  it('API mode 持倉列依 apiLastFill 帶 fresh 高亮(Phase 4 D-13,反轉 Phase 3 的鎖定)', async () => {
    await mountApiWith(
      [holding({ symbol: 'AAA' }), holding({ symbol: 'BBB' })],
      summaryWith({ totalMarketValue: 2, holdingCount: 2 }),
    );

    expect(rows()).toHaveLength(2);
    // 還沒有任何成交事件之前,仍然一列都不高亮(Phase 3 的斷言在這個前提下繼續成立)
    expect(rows().filter(row => row.classList.contains('fresh'))).toHaveLength(0);

    notifyTradeCreated(freshTrade('BBB'));
    await flushAsync();

    const bbb = rows().find(row => row.textContent?.includes('BBB'));
    expect(bbb, 'BBB row').toBeTruthy();
    expect(bbb!.classList.contains('fresh')).toBe(true);
    expect(rows().filter(row => row.classList.contains('fresh'))).toHaveLength(1);
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

// =====================================================================================
// 04-12(D-10 / D-12 / U-05 / U-06):成交後的重讀。
// Positions 的兩個區塊(summary、holdings)各自獨立,一個失敗不影響另一個。
// =====================================================================================

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** 從任一持倉列往上找到它所屬的 `.card` —— 區塊級 aria-busy 的斷言對象,不新增 testid。 */
function holdingsCard(): HTMLElement {
  const row = rows()[0];
  expect(row, '至少要有一列持倉才能定位 holdings 區塊').toBeTruthy();
  return row.closest('.card') as HTMLElement;
}

describe('Positions — post-trade refetch(04-12 / D-10 / D-12 / U-05 / U-06)', () => {
  it('Test 2(D-10):revision 變動後 summary 與 holdings 各自重讀一次', async () => {
    const fetchMock = await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(1);
    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(1);

    bumpPortfolioRevision('trade');
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(2);
  });

  it('Test 4(Pitfall 12):mock mode 下 revision 變動不得發出任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    bumpPortfolioRevision('trade');
    await flushAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Test 5(D-10 的核心論證):只重讀本頁自己的資料源,不代替未掛載的頁發請求', async () => {
    // App.vue 用 v-if 切頁,非當前頁是**卸載**的 —— 只掛載 Positions 時,
    // Trades 頁的 GET /trades 沒有任何消費者,發它是純粹的無效工。
    const fetchMock = await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);

    bumpPortfolioRevision('trade');
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/summary')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(2);
    expect(callsMatching(fetchMock, '/trades')).toHaveLength(0);
  });

  it('Test 6/7(U-05):重讀期間保留舊列並顯示「更新中…」,成功後才換成新值', async () => {
    let gate: ReturnType<typeof deferred<Response>> | null = null;
    const fetchMock = routedFetch({
      summary: () => success(TRUTH_SUMMARY),
      holdings: () => (gate ? gate.promise : success([TRUTH_HOLDING])),
    });
    await mountApiPositions(fetchMock);
    expect(rowSymbols()).toEqual(['ZZA']);

    gate = deferred<Response>();
    bumpPortfolioRevision('trade');
    await flushAsync();

    // U-05:**不得**重用 status:'loading' —— 舊列必須留在 DOM,不被骨架取代。
    expect(rowSymbols()).toEqual(['ZZA']);
    expect(testid('positions-holdings-loading')).toBeNull();
    expect(document.body.querySelector('.skeleton-row')).toBeNull();

    const note = requireTestid('positions-refreshing');
    expect(note.textContent).toContain(t('en', 'portfolioRefreshing'));
    expect(holdingsCard().getAttribute('aria-busy')).toBe('true');

    gate.resolve(success([holding({ symbol: 'NEWSYM', marketValue: 10 })]));
    gate = null;
    await flushAsync();

    expect(testid('positions-refreshing')).toBeNull();
    expect(holdingsCard().getAttribute('aria-busy')).toBe('false');
    expect(rowSymbols()).toEqual(['NEWSYM']);
  });

  it('Test 8(U-06 / D-12):holdings 重讀失敗時舊資料留存並明示可能過期,重試可再送', async () => {
    let failRefetch = false;
    const fetchMock = routedFetch({
      summary: () => success(TRUTH_SUMMARY),
      holdings: () => (failRefetch
        ? failure('PORTFOLIO_HOLDINGS_UNAVAILABLE', 'trace-refetch-down')
        : success([TRUTH_HOLDING])),
    });
    await mountApiPositions(fetchMock);

    failRefetch = true;
    bumpPortfolioRevision('trade');
    await flushAsync();

    // 舊資料仍在畫面上,且**不進** status:'error'(那會清掉舊資料)
    expect(rowSymbols()).toEqual(['ZZA']);
    expect(testid('positions-holdings-error')).toBeNull();
    expect(testid('positions-refreshing')).toBeNull();

    const stale = requireTestid('positions-refresh-error');
    expect(stale.textContent).toContain(t('en', 'portfolioStaleAfterTrade'));
    // 交易已成功,這不是需要打斷的錯誤 → role="status" 而不是 alert
    expect(stale.getAttribute('role')).toBe('status');
    expect(requireTestid('positions-refresh-error-code').textContent).toContain('PORTFOLIO_HOLDINGS_UNAVAILABLE');
    expect(requireTestid('positions-refresh-trace-id').textContent).toContain('trace-refetch-down');
    expect(stale.textContent).not.toContain('backend said no');

    failRefetch = false;
    click(requireTestid('positions-refresh-retry'));
    await flushAsync();

    expect(callsMatching(fetchMock, '/portfolio/holdings')).toHaveLength(3);
    expect(testid('positions-refresh-error')).toBeNull();
    expect(rowSymbols()).toEqual(['ZZA']);
  });

  it('Test 9(D-12):summary 重讀失敗不影響 holdings 拿到新資料,兩者各自獨立', async () => {
    let refetching = false;
    const fetchMock = routedFetch({
      summary: () => (refetching
        ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-stale')
        : success(TRUTH_SUMMARY)),
      holdings: () => success(refetching
        ? [holding({ symbol: 'NEWSYM', marketValue: 10 })]
        : [TRUTH_HOLDING]),
    });
    await mountApiPositions(fetchMock);

    refetching = true;
    bumpPortfolioRevision('trade');
    await flushAsync();

    // summary 區塊:舊值留存 + stale 提示,不進 status:'error'
    expect(testid('positions-summary-error')).toBeNull();
    expect(allTestids('positions-stat')).toHaveLength(6);
    // DP-10(04.1-16):舊 `$4,242` → 基準幣裸數字(代碼在獨立 span)
    expect(allTestids('positions-stat')[0].textContent).toContain(fmtMoneyAmount(TRUTH_SUMMARY.totalMarketValue, 'TWD', 0));
    expect(requireTestid('positions-refresh-error-code').textContent).toContain('PORTFOLIO_SUMMARY_UNAVAILABLE');

    // holdings 區塊:拿到新資料,完全不受 summary 失敗影響
    expect(rowSymbols()).toEqual(['NEWSYM']);
    expect(allTestids('positions-refresh-error')).toHaveLength(1);
  });
});

// =====================================================================================
// Test 10(D-12 最重要的一條):交易成功 + 某個 refetch 失敗 = 畫面上兩件分開的事。
// 這條防的是最糟的失敗模式:使用者看到整體錯誤 → 以為交易沒成功 → 再送一次。
// =====================================================================================

const TICKET_ASSET: AssetDto = {
  uuid: 'asset-aapl',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  market: 'US',
  currency: 'USD',
  sector: 'Tech',
  tradeable: true,
  latestPrice: 218.4,
  change: 1.2,
  changePercent: 0.55,
  volumeText: '52.1M',
  high: 220,
  low: 215,
};

const TICKET_RECORDED: TradeDto = {
  id: '6f1c2b7e-1a2b-4c3d-8e9f-0123456789ab',
  symbol: 'AAPL',
  type: 'BUY',
  quantity: 7,
  price: 188.88,
  fee: 1.5,
  note: null,
  currency: 'USD',
  executedAt: '2026-08-15T10:30:00+08:00',
  createdAt: '2026-08-15T10:30:05+08:00',
};

describe('Positions + OrderTicket — D-12:refetch 失敗不得汙染 ticket 的成功畫面', () => {
  it('Test 10:summary 重讀失敗時,ticket 仍顯示成功與交易編號,且沒有任何整體失敗訊息', async () => {
    // apiClient 對 unsafe method 會注入 X-XSRF-TOKEN;先種 cookie 免得多一次 bootstrap 請求。
    document.cookie = 'XSRF-TOKEN=csrf-positions; path=/';
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();

    let summaryFailsOnRefetch = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/portfolio/holdings')) return success([TRUTH_HOLDING]);
      if (url.includes('/portfolio/summary')) {
        return summaryFailsOnRefetch
          ? failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-stale-after-trade')
          : success(TRUTH_SUMMARY);
      }
      if (url.includes('/klines')) return success([]);
      if (url.includes('/assets')) {
        return success({ items: [TICKET_ASSET], page: 0, size: 10, totalElements: 1, totalPages: 1 });
      }
      if (url.includes('/trades')) return success(TICKET_RECORDED);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    mountWithPinia(OrderTicket, {
      open: true,
      lang: 'en',
      preset: { sym: 'AAPL' },
      onClose: () => {},
      onNavigate: () => {},
      onToast: () => {},
    });
    await flushAsync(16);

    summaryFailsOnRefetch = true;
    click(requireTestid('ticket-review-advance'));
    await flushAsync(16);
    click(requireTestid('ticket-submit'));
    await flushAsync(24);

    // ticket:成功畫面完整,連交易編號都在,而且沒有被關閉
    const result = requireTestid('ticket-result');
    expect(requireTestid('ticket-result-trade-id').textContent).toContain(TICKET_RECORDED.id);
    expect(testid('ticket-error')).toBeNull();
    expect(result.textContent).not.toContain(t('en', 'portfolioStaleAfterTrade'));
    expect(result.textContent).not.toContain(t('en', 'loadFailed'));

    // 頁面:區塊各自呈現 stale,這才是 refetch 失敗該出現的地方
    expect(requireTestid('positions-refresh-error').textContent)
      .toContain(t('en', 'portfolioStaleAfterTrade'));
    expect(rowSymbols()).toEqual(['ZZA']);
  });
});

describe('Positions — D-13 fresh 高亮(04-12 / U-12)', () => {
  it('Test 19(U-12):高亮列有非顏色線索的「新」標記', async () => {
    await mountApiWith(
      [holding({ symbol: 'AAA' }), holding({ symbol: 'BBB' })],
      summaryWith({ totalMarketValue: 2, holdingCount: 2 }),
    );

    notifyTradeCreated(freshTrade('BBB'));
    await flushAsync();

    // 色盲、高對比模式、或動畫已結束的使用者都必須能看出是哪一列。
    const badge = requireTestid('positions-fresh-badge');
    expect(badge.textContent?.trim()).toBe(t('en', 'freshBadge'));
    const bbb = rows().find(row => row.textContent?.includes('BBB'))!;
    expect(bbb.contains(badge)).toBe(true);
    expect(allTestids('positions-fresh-badge')).toHaveLength(1);

    // §Layout Contract:「新」標記**不得改變列高**。jsdom 不套用 scoped CSS 也算不出高度,
    // 所以用原始碼斷言(沿用 04-11 送出鈕 min-width 的手法):
    // 標記只能有水平內距,並自帶小於本列文字行高的 line-height。
    expect(positionsSource).toMatch(/\.fresh-badge\s*\{[^}]*padding:\s*0 8px/);
    expect(positionsSource).toMatch(/\.fresh-badge\s*\{[^}]*line-height:\s*1\.2/);
  });

  it('Test 20(來源切換):mock mode 的 fresh 只認 live.lastFill,不看 apiLastFill', async () => {
    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    const portfolio = useMockPortfolioStore();
    notifyTradeCreated(freshTrade(portfolio.positions[0].sym));
    await nextTick();

    expect(rows().filter(row => row.classList.contains('fresh'))).toHaveLength(0);
    expect(testid('positions-fresh-badge')).toBeNull();
  });

  it('Test 21(U-12):fresh 的壽命不靠計時器', () => {
    // 計時器會讓元件測試時間相依而 flaky;`App.vue:36` 的 v-if 切頁卸載已界定實際壽命。
    expect(positionsSource).not.toContain('setTimeout');
  });

  it('Test 22(a11y):prefers-reduced-motion 下取消動畫,「新」標記照常顯示', () => {
    expect(positionsSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?tbody tr\.fresh\s*\{[^}]*animation:\s*none/,
    );
    expect(positionsSource).toContain('data-testid="positions-fresh-badge"');
  });

  it('D-13:Phase 3 留下的「Phase 4 再接」TODO 註解已清除', () => {
    expect(positionsSource).not.toContain('Phase 4 引入 post-trade refetch 時再接');
    expect(positionsSource).not.toContain('無成交事件來源');
    // 來源切換用 effectiveLastFill,mockLastFill 的直接引用已不存在
    expect(positionsSource).toContain('effectiveLastFill');
    expect(positionsSource).not.toContain('mockLastFill');
  });
});

describe('Positions — 「新」標記的清除時機(F-2 / UI-SPEC §9)', () => {
  it('Test 21:頁面 unmount 時清除 apiLastFill,重新 mount 不得再帶「新」', async () => {
    const mount = () => mountApiWith(
      [holding({ symbol: 'AAA' }), holding({ symbol: 'BBB' })],
      summaryWith({ totalMarketValue: 2, holdingCount: 2 }),
    );
    await mount();
    notifyTradeCreated(freshTrade('BBB'));
    await flushAsync();
    expect(allTestids('positions-fresh-badge')).toHaveLength(1);

    unmountAll();
    expect(apiLastFill.value, '標記的壽命到頁面 unmount 為止(UI-SPEC §9),否則持倉列會永久帶「新」').toBeNull();

    await mount();
    expect(allTestids('positions-fresh-badge')).toHaveLength(0);
  });
});

// =====================================================================================
// 04.1-16 Task 1(tracer):API mode 持倉表「今日損益」欄(D-14 / D-17 / D-26、U-13)。
// 單檔值是原幣(沒有匯率參與),所以列層級不放「不含匯差」;null 一律排最後。
// =====================================================================================

/** 兩列:A 有今日損益(原幣 125、+4.35%),B 缺前收 → dayPricePnl null。 */
function dayPnlFixture(): HoldingDto[] {
  return [
    holding({ symbol: 'AAA', marketValue: 30, marketValueInBase: 30, dayPricePnl: 125, dayPricePnlRatio: 0.04347826 }),
    holding({ symbol: 'BBB', marketValue: 20, marketValueInBase: 20, dayPricePnl: null, dayPricePnlRatio: null }),
  ];
}

function dayPnlCells(): HTMLElement[] {
  return allTestids('positions-day-pnl');
}

describe('Positions — 今日損益欄(04.1-16 Task 1 / PORT-11)', () => {
  it('API mode 每列顯示原幣帶號金額 + 比率第二行,正值帶 up 色 class,無 $ 無代碼', async () => {
    await mountApiWith(dayPnlFixture(), summaryWith({ totalMarketValue: 50, holdingCount: 2 }));

    const cells = dayPnlCells();
    expect(cells).toHaveLength(2);
    const lines = [...cells[0].children].map(el => el.textContent?.trim());
    expect(lines).toEqual(['+125', '+4.35%']);
    expect(cells[0].textContent).not.toContain('$');
    expect(cells[0].textContent).not.toContain('TWD');
    expect(cells[0].classList.contains('day-up')).toBe(true);
    expect(cells[0].classList.contains('day-dn')).toBe(false);
  });

  it('負值帶 dn 色 class 與負號', async () => {
    await mountApiWith(
      [holding({ symbol: 'NEG', dayPricePnl: -40, dayPricePnlRatio: -0.0123 })],
      summaryWith({ totalMarketValue: 1, holdingCount: 1 }),
    );

    const cell = dayPnlCells()[0];
    expect([...cell.children].map(el => el.textContent?.trim())).toEqual(['-40', '-1.23%']);
    expect(cell.classList.contains('day-dn')).toBe(true);
  });

  it('dayPricePnl 為 null:— 為 aria-hidden,螢幕閱讀器讀「未計入」文字,色 fg-dim,不渲染比率行', async () => {
    await mountApiWith(dayPnlFixture(), summaryWith({ totalMarketValue: 50, holdingCount: 2 }));

    const cell = dayPnlCells()[1];
    const dash = cell.querySelector('[aria-hidden="true"]');
    expect(dash?.textContent).toBe('—');
    const sr = cell.querySelector('.sr-only');
    expect(sr?.textContent).toBe(t('en', 'dayPnlUnavailable'));
    expect(cell.classList.contains('day-na')).toBe(true);
    expect(cell.classList.contains('day-up')).toBe(false);
    expect(cell.classList.contains('day-dn')).toBe(false);
    expect(cell.textContent).not.toMatch(/%|NaN/);
  });

  it('表頭可排序(依比率):升冪與降冪 null 列都在最後', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'NUL', marketValue: 40, dayPricePnl: null, dayPricePnlRatio: null }),
        holding({ symbol: 'LOW', marketValue: 30, dayPricePnl: -10, dayPricePnlRatio: -0.02 }),
        holding({ symbol: 'HIG', marketValue: 20, dayPricePnl: 50, dayPricePnlRatio: 0.05 }),
      ],
      summaryWith({ totalMarketValue: 90, holdingCount: 3 }),
    );

    click(headerCell(t('en', 'todayPnl')));
    await nextTick();
    expect(rowSymbols()).toEqual(['HIG', 'LOW', 'NUL']); // 首次點擊 → 降冪

    click(headerCell(t('en', 'todayPnl')));
    await nextTick();
    expect(rowSymbols()).toEqual(['LOW', 'HIG', 'NUL']); // 升冪,null 仍在最後
  });

  it('mock mode:表頭不含今日損益,表頭與每列 td 數量維持 8', async () => {
    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    const heads = [...document.body.querySelectorAll('thead th')];
    expect(heads).toHaveLength(8);
    expect(heads.map(th => th.textContent)).not.toContain(t('en', 'todayPnl'));
    expect(dayPnlCells()).toHaveLength(0);
    for (const row of rows()) expect(row.querySelectorAll('td')).toHaveLength(8);
  });

  it('API mode:表頭 9 欄、每列 td 9 個,今日損益在 P&L 與權重之間', async () => {
    await mountApiWith(dayPnlFixture(), summaryWith({ totalMarketValue: 50, holdingCount: 2 }));

    const heads = [...document.body.querySelectorAll('thead th')].map(th => th.textContent?.trim() ?? '');
    expect(heads).toHaveLength(9);
    expect(heads[6]).toMatch(/^P&L/);
    expect(heads[7]).toMatch(new RegExp(`^${t('en', 'todayPnl').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(heads[8]).toMatch(new RegExp(`^${t('en', 'weight')}`));
    for (const row of rows()) expect(row.querySelectorAll('td')).toHaveLength(9);
  });
});

// =====================================================================================
// 04.1-16 Task 2:基準幣權重、幣別標籤、裸數字金額、缺匯率提示、卡內捲動(PORT-10)。
// =====================================================================================

describe('Positions — 幣別標籤與說明列(04.1-16 Task 2 / PORT-10)', () => {
  it('每列 symbol 後一個 ccy-tag,文字為該列幣別,位於「新」標記之前', async () => {
    await mountApiWith(
      [
        holding({ symbol: 'AAA', currency: 'USD' }),
        holding({ symbol: 'BBB', currency: 'JPY' }),
      ],
      summaryWith({ totalMarketValue: 2, holdingCount: 2 }),
    );
    notifyTradeCreated(freshTrade('BBB'));
    await flushAsync();

    const tags = allTestids('positions-ccy-tag');
    expect(tags.map(el => el.textContent?.trim()).sort()).toEqual(['JPY', 'USD']);
    const bbb = rows().find(row => row.textContent?.includes('BBB'))!;
    const firstCell = bbb.querySelector('td')!;
    const spans = [...firstCell.querySelectorAll('span')].map(el => el.getAttribute('data-testid'));
    expect(spans).toEqual(['positions-ccy-tag', 'positions-fresh-badge']);
  });

  it('currency 為 null:不渲染 ccy-tag,列內無 $,金額照常顯示裸數字(不猜幣別)', async () => {
    await mountApiWith(
      [holding({ symbol: 'OLD', currency: null, marketValue: 1234, marketValueInBase: 1234 })],
      summaryWith({ totalMarketValue: 1234, holdingCount: 1 }),
    );

    expect(allTestids('positions-ccy-tag')).toHaveLength(0);
    const row = rows()[0];
    expect(row.textContent).not.toContain('$');
    expect(row.querySelectorAll('td')[5].textContent?.trim()).toBe(fmtMoneyAmount(1234, null, 0));
  });

  it('summary 載入後顯示 holdingsCurrencyNote({base} 已替換);summary 失敗時不渲染且 DOM 無佔位符', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);
    const note = requireTestid('positions-currency-note');
    expect(note.textContent?.trim()).toBe(t('en', 'holdingsCurrencyNote').replace('{base}', 'TWD'));
    expect(note.textContent).not.toContain('{base}');
    expect(note.textContent).toContain('TWD');
    unmountAll();

    await mountApiPositions(routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down'),
      holdings: () => success([TRUTH_HOLDING]),
    }));
    expect(rows()).toHaveLength(1);
    expect(testid('positions-currency-note')).toBeNull();
    expect(document.body.textContent).not.toContain('{base}');
  });

  it('說明列在表格之前(DOM 順序)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);
    const note = requireTestid('positions-currency-note');
    const table = document.body.querySelector('table')!;
    expect(note.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Positions — 缺匯率提示(04.1-16 Task 2 / D-04)', () => {
  it('fxExcludedCount = 2 時標題列下方顯示 fxExcludedHint({n}、{base} 已替換)', async () => {
    await mountApiWith([TRUTH_HOLDING], { ...TRUTH_SUMMARY, fxExcludedCount: 2 });

    const hint = requireTestid('positions-fx-excluded');
    expect(hint.textContent?.trim())
      .toBe(t('en', 'fxExcludedHint').replace('{n}', '2').replace('{base}', 'TWD'));
    expect(hint.textContent).not.toMatch(/\{\w+\}/);
  });

  it('fxExcludedCount = 0 時不渲染', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);
    expect(testid('positions-fx-excluded')).toBeNull();
  });
});

describe('Positions — 窄螢幕卡內捲動(04.1-16 Task 2)', () => {
  it('持倉卡 overflow-x: auto,不再 overflow: hidden(捲動發生在卡內,不推擠 .main)', async () => {
    await mountApiWith([TRUTH_HOLDING], TRUTH_SUMMARY);
    const card = rows()[0].closest('.card') as HTMLElement;
    expect(card.style.overflowX).toBe('auto');
    expect(card.style.overflow).not.toBe('hidden');
  });
});

// =====================================================================================
// 04.1-16 Task 3:產業分布卡以 summary.sectorAllocation 渲染(PORT-12、D-19、U-19 / U-20)。
// =====================================================================================

function sectorCard(): HTMLElement {
  return requireTestid('positions-sector');
}

function sectorCells(): HTMLElement[] {
  return [...sectorCard().querySelectorAll<HTMLElement>('.sector')];
}

const NBSP = '\u00a0';

describe('Positions — 產業分布卡(04.1-16 Task 3)', () => {
  const SECTOR_SUMMARY = summaryWith({
    totalMarketValue: 100000,
    holdingCount: 4,
    sectorAllocation: [
      // 後端已排序(value 降冪、null 最後);第一組刻意放 null 且最大,驗證前端仍把未分類擺最後
      { sector: null, value: 70000, weight: 0.7, holdingCount: 1, unrealizedPnl: -500 },
      { sector: 'Semiconductors-API', value: 20000, weight: 0.2, holdingCount: 2, unrealizedPnl: 1200 },
      { sector: 'Banks-API', value: 10000, weight: 0.1, holdingCount: 1, unrealizedPnl: 0 },
    ],
  });

  it('每格:名稱、檔數、基準幣金額、bar 寬 = weight×100%、底列左權重右未實現損益(帶號,不顯示 %)', async () => {
    await mountApiWith([TRUTH_HOLDING], SECTOR_SUMMARY);

    const cells = sectorCells();
    expect(cells).toHaveLength(3);
    const semi = cells.find(c => c.textContent?.includes('Semiconductors-API'))!;
    const text = semi.textContent ?? '';
    expect(text).toContain('2'); // 檔數
    expect(text).toContain(`20,000${NBSP}TWD`);
    expect(text).toContain('20.0%'); // fmtWeightPct(0.2)
    expect(text).toContain(`+1,200${NBSP}TWD`); // fmtSignedMoney(unrealizedPnl, base, 0)
    expect(semi.querySelector<HTMLElement>('.sec-fill')!.style.width).toBe('20%');
    // U-20:API mode 不顯示損益 %(比率需要前端推導,違反 Phase 3 D-04「不平行重算」)
    expect(text.match(/%/g)).toHaveLength(1);
    expect(text).not.toContain('$');
    // 損益為 0:無號,不上正負色以外的符號
    const banks = cells.find(c => c.textContent?.includes('Banks-API'))!;
    expect(banks.textContent).toContain(`0${NBSP}TWD`);
    expect(banks.textContent).not.toContain('+0');
  });

  it('sector 為 null 顯示「未分類」、色 fg-dim、排在最後(即使金額最大)', async () => {
    await mountApiWith([TRUTH_HOLDING], SECTOR_SUMMARY);

    const labels = sectorCells().map(c => c.textContent ?? '');
    expect(labels[2]).toContain(t('en', 'sectorUncategorized'));
    expect(labels[0]).toContain('Semiconductors-API');
    expect(labels[1]).toContain('Banks-API');

    const uncategorized = requireTestid('positions-sector-uncategorized');
    expect(uncategorized.textContent).toContain(t('en', 'sectorUncategorized'));
    expect(allTestids('positions-sector-uncategorized')).toHaveLength(1);
    // 固定色,不參與 SECTOR_COLORS 輪替:色塊與 bar 都用 --fg-dim
    const dim = (el: Element) => el.getAttribute('style') ?? '';
    expect(dim(uncategorized.querySelector('.sec-swatch')!)).toContain('var(--fg-dim)');
    expect(dim(uncategorized.querySelector('.sec-fill')!)).toContain('var(--fg-dim)');
    // 有分類的第 0 組仍用 accent(輪替不被 null 佔掉一格)
    expect(dim(sectorCells()[0].querySelector('.sec-fill')!)).toContain('var(--accent)');
  });

  it('損益為負用 dn 色,為正用 up 色', async () => {
    await mountApiWith([TRUTH_HOLDING], SECTOR_SUMMARY);

    const pnlOf = (name: string) =>
      sectorCells().find(c => c.textContent?.includes(name))!.querySelector<HTMLElement>('.sec-pnl')!;
    expect(pnlOf('Semiconductors-API').getAttribute('style')).toContain('var(--up)');
    expect(pnlOf(t('en', 'sectorUncategorized')).getAttribute('style')).toContain('var(--dn)');
    expect(pnlOf(t('en', 'sectorUncategorized')).textContent).toContain(`-500${NBSP}TWD`);
  });

  it('sectorAllocation 為空:卡內顯示 noHoldings,沒有格子、沒有 NaN', async () => {
    await mountApiWith([], summaryWith());

    expect(sectorCard()).toBeTruthy();
    expect(requireTestid('positions-sector-empty').textContent).toContain(t('en', 'noHoldings'));
    expect(sectorCells()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('summary 讀取失敗:產業卡不渲染(單一重試點在頂端錯誤區塊,U-19)', async () => {
    await mountApiPositions(routedFetch({
      summary: () => failure('PORTFOLIO_SUMMARY_UNAVAILABLE', 'trace-summary-down'),
      holdings: () => success([TRUTH_HOLDING]),
    }));

    expect(testid('positions-summary-error')).not.toBeNull();
    expect(testid('positions-sector')).toBeNull();
    expect(document.body.textContent).not.toContain(t('en', 'sectorBreakdown'));
  });

  it('summary 載入中:產業卡尚未渲染', async () => {
    const pending: Handler = () => new Promise<Response>(() => {});
    await mountApiPositions(routedFetch({ summary: pending, holdings: pending }));

    expect(testid('positions-sector')).toBeNull();
  });

  it('mock mode:沿用既有 sectorStats(美元金額 + 損益 %),共用同一份模板', async () => {
    mountWithPinia(Positions, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    const cells = sectorCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const text = cell.textContent ?? '';
      expect(text).toContain('$');
      expect(text).toMatch(/\d%/);
      expect(text).not.toMatch(/TWD|USD/);
    }
    expect(testid('positions-sector-uncategorized')).toBeNull();
  });

  it('響應式:3 欄,< 900px 兩欄,< 560px 一欄', () => {
    expect(positionsSource).toMatch(/\.sectors\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    expect(positionsSource).toMatch(/@media \(max-width: 899px\)[\s\S]*?\.sectors\s*\{[^}]*repeat\(2,\s*1fr\)/);
    expect(positionsSource).toMatch(/@media \(max-width: 559px\)[\s\S]*?\.sectors\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
