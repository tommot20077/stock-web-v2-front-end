import { expect, type Page, type Route } from '@playwright/test';
import type {
  AllocationSliceDto,
  AssetDto,
  CashBalanceDto,
  HoldingDto,
  PaginatedResponse,
  PortfolioActivityDto,
  PortfolioSummaryDto,
  SectorAllocationDto,
  TradeDto,
} from '../../src/services/apiTypes';
import type { CashEntryDto } from '../../src/services/cashApi';
import type { WatchlistDto } from '../../src/services/watchlistApi';

/**
 * Phase 04.1 版面測試用的 /api/v1/* 攔截器與型別化 DTO fixture。
 *
 * 版面量測 jsdom 做不到(LEARNINGS 2026-10-23),所以交給真瀏覽器;但不需要真後端:
 * 全部以 page.route 攔下。fixture 以 `import type` 綁定 apiTypes / cashApi,
 * DTO 形狀漂移時 tsc 會失敗(T-04.1-58);值刻意挑「最寬」的情況(9 位數金額、四幣別、長名稱、500 字備註)。
 */

const LONG_EMAIL = 'layout-check-with-a-very-long-local-part@example-company.test';

/** 200 個無空白英數字元,用來驗 overflow-wrap: anywhere。 */
const UNBROKEN_200 = 'LongUnbrokenToken0123456789'.repeat(8).slice(0, 200);

/** 500 字備註:前 300 字中文,後 200 字元無空白英數。 */
export const LONG_NOTE = '這是一段用來測試版面的很長備註內容'.repeat(20).slice(0, 300) + UNBROKEN_200;

/** 長 traceId(無空白,64 個英數字元)。 */
export const LONG_TRACE_ID = `trace-${'a1b2c3d4'.repeat(8)}`;

function entry(
  index: number,
  overrides: Partial<CashEntryDto> & Pick<CashEntryDto, 'type' | 'currency' | 'amount'>,
): CashEntryDto {
  const day = String(28 - index).padStart(2, '0');
  return {
    id: `layout-cash-${index + 1}`,
    note: null,
    occurredAt: `2026-10-${day}T09:00:00+08:00`,
    createdAt: `2026-10-${day}T09:00:05+08:00`,
    reversalOfId: null,
    reversalOfOccurredAt: null,
    reversed: false,
    ...overrides,
  };
}

/**
 * 12 筆入出金:含 1 筆已沖銷的原紀錄、1 筆沖銷紀錄、1 筆 500 字備註(落在第一頁)。
 * 金額為十進位字串(Phase 5 D-05 / D-08:後端 BigDecimal 以字串序列化,前端 mapper 遇 number 會丟錯)。
 */
export const CASH_ENTRIES: CashEntryDto[] = [
  entry(0, { type: 'DEPOSIT', currency: 'TWD', amount: '123456789', note: 'Initial deposit' }),
  entry(1, {
    type: 'DEPOSIT',
    currency: 'TWD',
    amount: '500000',
    note: 'Reversal of mistaken withdrawal',
    reversalOfId: 'layout-cash-4',
    reversalOfOccurredAt: '2026-10-25T09:00:00+08:00',
  }),
  entry(2, { type: 'WITHDRAWAL', currency: 'USD', amount: '20000', note: LONG_NOTE }),
  entry(3, { type: 'WITHDRAWAL', currency: 'TWD', amount: '500000', note: 'Mistaken withdrawal', reversed: true }),
  entry(4, { type: 'DEPOSIT', currency: 'EUR', amount: '1200.5', note: '歐元入金' }),
  entry(5, { type: 'DEPOSIT', currency: 'JPY', amount: '3000000', note: null }),
  entry(6, { type: 'WITHDRAWAL', currency: 'JPY', amount: '150000', note: 'Rent' }),
  entry(7, { type: 'DEPOSIT', currency: 'USD', amount: '8800.25', note: 'Salary' }),
  entry(8, { type: 'WITHDRAWAL', currency: 'EUR', amount: '300', note: null }),
  entry(9, { type: 'DEPOSIT', currency: 'TWD', amount: '42', note: 'Tiny' }),
  entry(10, { type: 'DEPOSIT', currency: 'USD', amount: '100', note: 'Older deposit' }),
  entry(11, { type: 'WITHDRAWAL', currency: 'TWD', amount: '1000', note: 'Oldest' }),
];

const CASH_BALANCES: CashBalanceDto[] = [
  { currency: 'TWD', amount: '987654321.5' },
  { currency: 'USD', amount: '123456.78' },
  { currency: 'EUR', amount: '-4321.09' },
  { currency: 'JPY', amount: '98765432' },
];

const ALLOCATION: AllocationSliceDto[] = [
  { category: 'STOCK', value: '600000000', weight: '0.4861' },
  { category: 'CRYPTO', value: '250000000', weight: '0.2025' },
  { category: 'FX', value: '120000000', weight: '0.0972' },
  { category: 'BOND', value: '90000000', weight: '0.0729' },
  { category: 'MYSTERY_CATEGORY_FROM_FUTURE_BACKEND', value: '80000000', weight: '0.0648' },
];

const SECTOR_ALLOCATION: SectorAllocationDto[] = [
  { sector: 'Semiconductors and Electronic Components Manufacturing', value: '300000000', weight: '0.243', holdingCount: 3, unrealizedPnl: '12345678.9' },
  { sector: 'Financial Services', value: '200000000', weight: '0.162', holdingCount: 2, unrealizedPnl: '-2345678.12' },
  { sector: 'Technology', value: '150000000', weight: '0.121', holdingCount: 1, unrealizedPnl: '1000000' },
  { sector: 'Energy', value: '100000000', weight: '0.081', holdingCount: 1, unrealizedPnl: '0' },
  { sector: 'Consumer Staples', value: '50000000', weight: '0.04', holdingCount: 1, unrealizedPnl: '50000' },
  { sector: null, value: '20000000', weight: '0.016', holdingCount: 1, unrealizedPnl: '-10000' },
];

const SUMMARY: PortfolioSummaryDto = {
  totalMarketValue: '1140000000',
  totalCostBasis: '1000000000',
  realizedPnl: '12345678.9',
  unrealizedPnl: '140000000',
  totalPnl: '152345678.9',
  roi: '0.1523',
  holdingCount: 6,
  baseCurrency: 'TWD',
  fxExcludedCount: 2,
  unconvertedCurrencies: ['EUR', 'JPY'],
  dayPricePnl: '-1234567.89',
  dayPricePnlRatio: '-0.0104',
  dayPnlExcludedCount: 3,
  cash: '1087654321.5',
  totalEquity: '1234567890.12',
  cashBalances: CASH_BALANCES,
  allocation: ALLOCATION,
  sectorAllocation: SECTOR_ALLOCATION,
  // Phase 04.2(DIV-02):有股利收入且有預扣稅 → Overview KPI #4 / Positions 總損益卡都渲染最長的 dividendIncomeLineWithTax
  dividendIncome: '123456789.12',
  dividendTaxWithheld: '30864197.28',
};

/** holdings fixture:BigDecimal 欄位為 wire 字串(Phase 5 D-05,後端 `HoldingDto` 的 `@DecimalString`)。 */
function holding(
  index: number,
  overrides: Partial<HoldingDto> & Pick<HoldingDto, 'symbol' | 'assetName' | 'currency'>,
): HoldingDto {
  return {
    assetId: `00000000-0000-4000-8000-00000000000${index}`,
    totalQuantity: String(123456 + index),
    avgCost: '1234.56',
    costBasis: '152407263.36',
    marketPrice: '1456.78',
    marketValue: '179842345.68',
    realizedPnl: '1234567.89',
    unrealizedPnl: '-2345678.12',
    roi: '0.0123',
    priceTime: '2026-10-24T05:30:00Z',
    lastUpdated: '2026-10-24T05:30:05Z',
    assetType: 'STOCK',
    sector: 'Technology',
    market: 'TW',
    baseCurrency: 'TWD',
    marketValueInBase: '179842345.68',
    unrealizedPnlInBase: '-2345678.12',
    previousClose: '1440.12',
    dayPricePnl: '2056789.01',
    dayPricePnlRatio: '0.0116',
    dayPnlBasis: '177785556.67',
    ...overrides,
  };
}

const HOLDINGS: HoldingDto[] = [
  holding(1, { symbol: '2330.TW', assetName: 'Taiwan Semiconductor Manufacturing Company Limited (台灣積體電路製造股份有限公司)', currency: 'TWD' }),
  holding(2, { symbol: 'AAPL', assetName: 'Apple Inc.', currency: 'USD', market: 'US', marketValueInBase: '5800000000', unrealizedPnlInBase: '-76043912.31' }),
  holding(3, { symbol: 'SAP.DE', assetName: 'SAP SE', currency: 'EUR', market: 'DE', marketValueInBase: null, unrealizedPnlInBase: null, dayPricePnl: null, dayPricePnlRatio: null, previousClose: null, dayPnlBasis: null }),
  holding(4, { symbol: '7203.T', assetName: 'Toyota Motor Corporation', currency: 'JPY', market: 'JP', marketValueInBase: null, unrealizedPnlInBase: null }),
  holding(5, { symbol: 'BTC-USD', assetName: 'Bitcoin', currency: 'USD', assetType: 'CRYPTO', sector: null, market: 'CRYPTO' }),
  holding(6, { symbol: '2317.TW', assetName: 'Hon Hai Precision Industry', currency: 'TWD', sector: null }),
];

function trade(
  index: number,
  overrides: Partial<TradeDto> & Pick<TradeDto, 'symbol' | 'type' | 'currency'>,
): TradeDto {
  const day = String(24 - index).padStart(2, '0');
  return {
    id: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
    // 05-19(Phase 5 D-05):TradeDto 的 BigDecimal 欄位是 JSON 字串(後端 setScale(8) 帶尾零)。
    quantity: '123456.00000000',
    price: '1234.56000000',
    fee: '1234.50000000',
    note: null,
    executedAt: `2026-10-${day}T10:00:00+08:00`,
    createdAt: `2026-10-${day}T10:00:05+08:00`,
    ...overrides,
  };
}

const TRADES: TradeDto[] = [
  trade(0, { symbol: '2330.TW', type: 'BUY', currency: 'TWD', note: LONG_NOTE }),
  trade(1, { symbol: 'AAPL', type: 'SELL', currency: 'USD' }),
  trade(2, { symbol: 'SAP.DE', type: 'BUY', currency: 'EUR' }),
  trade(3, { symbol: '7203.T', type: 'BUY', currency: 'JPY', price: '2987654.32000000' }),
  trade(4, { symbol: 'BTC-USD', type: 'BUY', currency: 'USD', note: 'long note with spaces '.repeat(10) }),
  trade(5, { symbol: '2317.TW', type: 'SELL', currency: 'TWD' }),
  trade(6, { symbol: 'AAPL', type: 'BUY', currency: 'USD' }),
  trade(7, { symbol: '2330.TW', type: 'SELL', currency: 'TWD' }),
  trade(8, { symbol: 'SAP.DE', type: 'SELL', currency: 'EUR' }),
  trade(9, { symbol: '7203.T', type: 'SELL', currency: 'JPY' }),
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function activity(
  index: number,
  overrides: Partial<PortfolioActivityDto> & Pick<PortfolioActivityDto, 'kind' | 'symbol' | 'currency'>,
): PortfolioActivityDto {
  const day = pad2(28 - index);
  return {
    id: `22222222-2222-4222-8222-2222222222${pad2(index)}`,
    occurredAt: `2026-10-${day}T10:00:00+08:00`,
    effectiveDate: null,
    createdAt: `2026-10-${day}T10:00:05+08:00`,
    quantity: null,
    price: null,
    fee: null,
    amount: null,
    withholdingTax: null,
    ratioNew: null,
    ratioOld: null,
    note: null,
    reversalOfId: null,
    reversalOfOccurredAt: null,
    reversalOfEffectiveDate: null,
    reversed: false,
    reversible: false,
    ...overrides,
  };
}

/** 交易列:amount = quantity × price,後端以 scale 8 捨入(trading-portfolio-contract〈PortfolioActivityDto〉)。 */
function tradeActivity(
  index: number,
  overrides: Partial<PortfolioActivityDto> & Pick<PortfolioActivityDto, 'kind' | 'symbol' | 'currency'>,
): PortfolioActivityDto {
  const quantity = overrides.quantity ?? 123456;
  const price = overrides.price ?? 1234.56;
  return activity(index, {
    quantity,
    price,
    fee: 1234.5,
    amount: Math.round(quantity * price * 1e8) / 1e8,
    ...overrides,
  });
}

/**
 * Phase 04.2(PORT-13)Trades 混合活動列(L14 / L5 / L9):買 / 賣 / 現金股利含預扣稅 / 配股 / 拆股 / 合股
 * (en pill `Reverse split` 最長)/ 沖銷列 / 已沖銷原列 / 500 字備註。可沖銷列會渲染「沖銷這筆」(狀態欄最寬)。
 */
export const ACTIVITIES: PortfolioActivityDto[] = [
  tradeActivity(0, { kind: 'BUY', symbol: '2330.TW', currency: 'TWD', note: LONG_NOTE }),
  tradeActivity(1, { kind: 'SELL', symbol: 'AAPL', currency: 'USD' }),
  activity(2, {
    kind: 'CASH_DIVIDEND', symbol: 'AAPL', currency: 'USD',
    amount: 1234567.89, withholdingTax: 308641.97, note: 'Q3 dividend', reversible: true,
  }),
  activity(3, {
    kind: 'STOCK_DIVIDEND', symbol: '2330.TW', currency: 'TWD',
    quantity: 12345.6789, effectiveDate: '2026-10-25', reversible: true,
  }),
  activity(4, {
    kind: 'SPLIT', symbol: '7203.T', currency: 'JPY',
    quantity: -61728, ratioNew: 1, ratioOld: 2, effectiveDate: '2026-10-24', reversible: true,
  }),
  activity(5, {
    kind: 'SPLIT', symbol: 'NVDA', currency: 'USD',
    quantity: 370368, ratioNew: 4, ratioOld: 1, effectiveDate: '2026-10-23',
  }),
  activity(6, {
    kind: 'CASH_DIVIDEND', symbol: 'SAP.DE', currency: 'EUR', amount: 98765.43, withholdingTax: 12345.67,
    note: 'Reversal of wrong dividend',
    reversalOfId: '22222222-2222-4222-8222-222222222207', reversalOfOccurredAt: '2026-10-21T10:00:00+08:00',
  }),
  activity(7, {
    kind: 'CASH_DIVIDEND', symbol: 'SAP.DE', currency: 'EUR', amount: 98765.43, withholdingTax: 12345.67, reversed: true,
  }),
  activity(8, {
    kind: 'STOCK_DIVIDEND', symbol: '2317.TW', currency: 'TWD', quantity: 5000, effectiveDate: '2026-10-19',
    reversalOfId: '22222222-2222-4222-8222-222222222209', reversalOfEffectiveDate: '2026-10-19',
  }),
  activity(9, {
    kind: 'STOCK_DIVIDEND', symbol: '2317.TW', currency: 'TWD', quantity: 5000, effectiveDate: '2026-10-19', reversed: true,
  }),
  tradeActivity(10, { kind: 'BUY', symbol: 'BTC-USD', currency: 'USD', note: 'long note with spaces '.repeat(10) }),
  tradeActivity(11, { kind: 'SELL', symbol: '7203.T', currency: 'JPY', price: 2987654.32 }),
];

/** 30 字清單名稱:無空白的寬拉丁字母 + 中文(tab 單行省略、工具列 overflow-wrap、picker 換行的最壞情況)。 */
export const LONG_LIST_NAME = `${'M'.repeat(10)}${'W'.repeat(10)}超長清單名稱測試字元`;

function asset(
  index: number,
  overrides: Partial<AssetDto> & Pick<AssetDto, 'symbol' | 'name' | 'assetType' | 'currency'>,
): AssetDto {
  return {
    uuid: `33333333-3333-4333-8333-3333333333${pad2(index)}`,
    market: 'US',
    sector: null,
    tradeable: true,
    latestPrice: 1234.56,
    change: 12.34,
    changePercent: 1.01,
    volumeText: '123.4M',
    high: 1240,
    low: 1220,
    ...overrides,
  };
}

/** 作用中清單 12 檔:股票 / 加密 / FX / 債券 / 無報價(價格與漲跌全 —)、超長名稱、9 位數價格。 */
export const WATCHLIST_ITEMS: AssetDto[] = [
  asset(0, { symbol: 'AAPL', name: 'Apple Inc.', assetType: 'STOCK', currency: 'USD', latestPrice: 218.4, change: 1.42, changePercent: 0.66 }),
  asset(1, {
    symbol: '2330.TW', name: 'Taiwan Semiconductor Manufacturing Company Limited (台灣積體電路製造股份有限公司)',
    assetType: 'STOCK', currency: 'TWD', market: 'TW', latestPrice: 945, change: -12, changePercent: -1.25,
  }),
  asset(2, { symbol: 'BTC', name: 'Bitcoin', assetType: 'CRYPTO', currency: 'USD', market: 'CRYPTO', latestPrice: 67842.4, volumeText: '$28.4B' }),
  asset(3, { symbol: 'USD/TWD', name: '美元/新台幣', assetType: 'FX', currency: 'TWD', market: 'FX', tradeable: false, latestPrice: 32.418, change: 0.024, changePercent: 0.07, volumeText: null }),
  asset(4, {
    symbol: 'EUR/USD', name: '歐元/美元', assetType: 'FX', currency: 'USD', market: 'FX', tradeable: false,
    latestPrice: null, change: null, changePercent: null, volumeText: null, high: null, low: null,
  }),
  asset(5, {
    symbol: 'US10Y', name: 'US 10-Year Treasury', assetType: 'BOND', currency: 'USD', tradeable: false,
    latestPrice: 4.218, change: 0.014, changePercent: null, volumeText: null, high: null, low: null,
  }),
  asset(6, { symbol: 'MSFT', name: 'Microsoft Corp.', assetType: 'STOCK', currency: 'USD', latestPrice: 123456789.12, change: -1234567.89, changePercent: -0.99 }),
  asset(7, {
    symbol: 'NOQUOTE', name: 'Asset Without Any Quote Yet', assetType: 'STOCK', currency: 'USD',
    latestPrice: null, change: null, changePercent: null, volumeText: null, high: null, low: null,
  }),
  asset(8, { symbol: 'ETH', name: 'Ethereum', assetType: 'CRYPTO', currency: 'USD', market: 'CRYPTO', latestPrice: 3482.18 }),
  asset(9, {
    symbol: 'JP10Y', name: 'Japan 10-Year', assetType: 'BOND', currency: 'JPY', market: 'JP', tradeable: false,
    latestPrice: null, change: null, changePercent: null, volumeText: null, high: null, low: null,
  }),
  asset(10, { symbol: 'NVDA', name: 'NVIDIA Corp.', assetType: 'STOCK', currency: 'USD', latestPrice: 1142.83 }),
  asset(11, { symbol: '7203.T', name: 'Toyota Motor Corporation', assetType: 'STOCK', currency: 'JPY', market: 'JP', latestPrice: 2987654.32 }),
];

/** 20 個清單(上限):第一個(作用中)為 30 字名稱 + 12 檔;每 5 個再放一個 30 字中文名稱。 */
export const WATCHLISTS: WatchlistDto[] = Array.from({ length: 20 }, (_, index) => {
  if (index === 0) return { id: 'layout-list-00', name: LONG_LIST_NAME, items: WATCHLIST_ITEMS };
  const name = index % 5 === 0 ? '長期觀察的半導體與電子零組件供應鏈清單'.repeat(2).slice(0, 30) : `清單 ${index}`;
  return { id: `layout-list-${pad2(index)}`, name, items: WATCHLIST_ITEMS.slice(0, index % 3) };
});

export interface FailPathOptions {
  /** 失敗回應 meta.traceId。 */
  traceId: string;
}

export interface MockPortfolioApiOptions {
  /** 把指定 pathname 覆寫為 503 SERVICE_UNAVAILABLE,並帶 meta.traceId。 */
  failPaths?: Record<string, FailPathOptions>;
  /** POST cash-entries 在這個 promise 解決前不回應(測送出中狀態);解決後回 201 風格的成功。 */
  cashPostGate?: Promise<void>;
  /** POST portfolio/dividends 與 share-adjustments 在這個 promise 解決前不回應(測送出中狀態);解決後回 503。 */
  holdingEventPostGate?: Promise<void>;
  /**
   * 即時報價 WS 情境(UI-SPEC §9;不需真後端):
   * - 省略 / `degraded`:ticket 恆 503 → stream 進 degraded(握手前就失敗,不開 socket)
   * - `replaced`:ticket 成功,`page.routeWebSocket` 接手握手並以 4002 關閉 → replaced(不自動重連)
   * - `live`:ticket 成功,WS 送 WELCOME,對每個 SUBSCRIBE 的 channel 回一筆 TICK → live + 該列 ws
   */
  ws?: 'degraded' | 'replaced' | 'live';
  /** ticket 在這個 promise 解決前一律 503(degraded);解決後才依 `ws` 情境回應 —— 先量 degraded、再量 replaced。 */
  ticketGate?: Promise<void>;
  /** 覆寫 GET /watchlists 的回應(預設 20 個清單的 WATCHLISTS)。 */
  watchlists?: WatchlistDto[];
  /**
   * 開啟 GET /assets(OrderTicket 的標的搜尋):以 query 比對 WATCHLIST_ITEMS 的 symbol / name(不分大小寫)。
   * 預設不開(維持 503),避免改變既有版面測試的頁面狀態。
   */
  assetSearch?: boolean;
}

function envelope<T>(data: T): { success: true; data: T; error: null; meta: { traceId: string } } {
  return { success: true, data, error: null, meta: { traceId: 'layout-trace' } };
}

function paginate<T>(all: T[], url: URL, defaultSize: number): PaginatedResponse<T> {
  const size = Number(url.searchParams.get('size') ?? defaultSize) || defaultSize;
  const page = Number(url.searchParams.get('page') ?? 0) || 0;
  return {
    items: all.slice(page * size, page * size + size),
    page,
    size,
    totalElements: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / size)),
  };
}

/**
 * 攔下全部 /api/v1/*:csrf / me 形狀沿用 L1,portfolio / trades / activities / cash-entries / watchlists 回「最寬」fixture,
 * WS ticket 依 `ws` 情境(預設 503 → degraded),其他路徑 503(同 L1)。
 */
export async function mockPortfolioApi(page: Page, options: MockPortfolioApiOptions = {}): Promise<void> {
  const unavailable = async (route: Route, traceId = 'layout-trace'): Promise<void> => {
    await route.fulfill({
      status: 503,
      json: { success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'layout test' }, meta: { traceId } },
    });
  };

  const wsScenario = options.ws ?? 'degraded';
  let ticketOpen = options.ticketGate === undefined;
  void options.ticketGate?.then(() => { ticketOpen = true; });
  if (wsScenario !== 'degraded') {
    await page.routeWebSocket(/\/ws\/v1\/market/, (ws) => {
      if (wsScenario === 'replaced') {
        ws.close({ code: 4002, reason: 'session_replaced' });
        return;
      }
      ws.send(JSON.stringify({ type: 'WELCOME' }));
      ws.onMessage((raw) => {
        const message = JSON.parse(String(raw)) as { type?: string; channels?: string[] };
        if (message.type !== 'SUBSCRIBE') return;
        for (const channel of message.channels ?? []) {
          // TICK 的 price 是字串(WsBroadcastConsumer toPlainString),channel 與 data.symbol 必須一致
          ws.send(JSON.stringify({
            type: 'TICK',
            channel,
            data: { symbol: channel.slice('tick.'.length), price: '219.10', volume: '10', time: new Date().toISOString() },
          }));
        }
      });
    });
  }

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    const failure = options.failPaths?.[path];
    if (failure) {
      await unavailable(route, failure.traceId);
      return;
    }
    if (path === '/api/v1/csrf') {
      await route.fulfill({
        headers: { 'Set-Cookie': 'XSRF-TOKEN=layout-csrf; Path=/' },
        json: { success: true, data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }, error: null, meta: {} },
      });
      return;
    }
    if (path === '/api/v1/me') {
      await route.fulfill({
        json: {
          success: true,
          data: { id: 1, uuid: 'layout-uuid', email: LONG_EMAIL, username: 'layout', role: 'USER', status: 'ACTIVE', baseCurrency: 'TWD' },
          error: null,
          meta: {},
        },
      });
      return;
    }
    if (path === '/api/v1/portfolio/summary') {
      await route.fulfill({ json: envelope(SUMMARY) });
      return;
    }
    if (path === '/api/v1/portfolio/holdings') {
      await route.fulfill({ json: envelope(HOLDINGS) });
      return;
    }
    if (path === '/api/v1/portfolio/activities' && method === 'GET') {
      await route.fulfill({ json: envelope(paginate(ACTIVITIES, url, 20)) });
      return;
    }
    if (path === '/api/v1/watchlists' && method === 'GET') {
      await route.fulfill({ json: envelope(options.watchlists ?? WATCHLISTS) });
      return;
    }
    if (path === '/api/v1/market/ws/ticket' && method === 'POST') {
      if (wsScenario === 'degraded' || !ticketOpen) {
        await unavailable(route);
        return;
      }
      await route.fulfill({ json: envelope({ ticket: 'layout-ticket', expiresIn: 30, wsUrl: '/ws/v1/market' }) });
      return;
    }
    if ((path === '/api/v1/portfolio/dividends' || path === '/api/v1/portfolio/share-adjustments') && method === 'POST') {
      await options.holdingEventPostGate;
      await unavailable(route);
      return;
    }
    if (options.assetSearch && path === '/api/v1/assets' && method === 'GET') {
      const needle = (url.searchParams.get('query') ?? '').trim().toLowerCase();
      const matched = WATCHLIST_ITEMS.filter((a) => a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle));
      await route.fulfill({ json: envelope(paginate(matched, url, 10)) });
      return;
    }
    if (path === '/api/v1/trades' && method === 'GET') {
      await route.fulfill({ json: envelope(paginate(TRADES, url, 20)) });
      return;
    }
    if (path === '/api/v1/portfolio/cash-entries' && method === 'GET') {
      await route.fulfill({ json: envelope(paginate(CASH_ENTRIES, url, 10)) });
      return;
    }
    if (path === '/api/v1/portfolio/cash-entries' && method === 'POST') {
      await options.cashPostGate;
      await route.fulfill({
        status: 201,
        json: envelope(entry(0, { id: 'layout-cash-new', type: 'WITHDRAWAL', currency: 'TWD', amount: '1' })),
      });
      return;
    }
    await unavailable(route);
  });
}

export interface OverflowMeasure {
  docScroll: number;
  docClient: number;
  mainScroll: number;
  mainClient: number;
}

/** 量 document.documentElement 與 <main> 的水平捲動寬度(以標籤取得,不用 class selector)。 */
export async function measureOverflow(page: Page): Promise<OverflowMeasure> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0,
    };
  });
}

/** 整頁與 main 都不水平捲動;失敗訊息沿用 L1 格式。 */
export async function expectNoHorizontalScroll(page: Page): Promise<number> {
  const m = await measureOverflow(page);
  expect(m.docScroll, `頁面寬 ${m.docScroll}px 超出視窗 ${m.docClient}px`).toBeLessThanOrEqual(m.docClient);
  expect(m.mainScroll, `main 頁面寬 ${m.mainScroll}px 超出視窗 ${m.mainClient}px`).toBeLessThanOrEqual(m.mainClient);
  return m.docClient;
}
