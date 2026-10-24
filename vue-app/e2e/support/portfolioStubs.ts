import { expect, type Page, type Route } from '@playwright/test';
import type {
  AllocationSliceDto,
  CashBalanceDto,
  HoldingDto,
  PaginatedResponse,
  PortfolioSummaryDto,
  SectorAllocationDto,
  TradeDto,
} from '../../src/services/apiTypes';
import type { CashEntryDto } from '../../src/services/cashApi';

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

/** 12 筆入出金:含 1 筆已沖銷的原紀錄、1 筆沖銷紀錄、1 筆 500 字備註(落在第一頁)。 */
export const CASH_ENTRIES: CashEntryDto[] = [
  entry(0, { type: 'DEPOSIT', currency: 'TWD', amount: 123456789, note: 'Initial deposit' }),
  entry(1, {
    type: 'DEPOSIT',
    currency: 'TWD',
    amount: 500000,
    note: 'Reversal of mistaken withdrawal',
    reversalOfId: 'layout-cash-4',
    reversalOfOccurredAt: '2026-10-25T09:00:00+08:00',
  }),
  entry(2, { type: 'WITHDRAWAL', currency: 'USD', amount: 20000, note: LONG_NOTE }),
  entry(3, { type: 'WITHDRAWAL', currency: 'TWD', amount: 500000, note: 'Mistaken withdrawal', reversed: true }),
  entry(4, { type: 'DEPOSIT', currency: 'EUR', amount: 1200.5, note: '歐元入金' }),
  entry(5, { type: 'DEPOSIT', currency: 'JPY', amount: 3000000, note: null }),
  entry(6, { type: 'WITHDRAWAL', currency: 'JPY', amount: 150000, note: 'Rent' }),
  entry(7, { type: 'DEPOSIT', currency: 'USD', amount: 8800.25, note: 'Salary' }),
  entry(8, { type: 'WITHDRAWAL', currency: 'EUR', amount: 300, note: null }),
  entry(9, { type: 'DEPOSIT', currency: 'TWD', amount: 42, note: 'Tiny' }),
  entry(10, { type: 'DEPOSIT', currency: 'USD', amount: 100, note: 'Older deposit' }),
  entry(11, { type: 'WITHDRAWAL', currency: 'TWD', amount: 1000, note: 'Oldest' }),
];

const CASH_BALANCES: CashBalanceDto[] = [
  { currency: 'TWD', amount: 987654321.5 },
  { currency: 'USD', amount: 123456.78 },
  { currency: 'EUR', amount: -4321.09 },
  { currency: 'JPY', amount: 98765432 },
];

const ALLOCATION: AllocationSliceDto[] = [
  { category: 'STOCK', value: 600000000, weight: 0.4861 },
  { category: 'CRYPTO', value: 250000000, weight: 0.2025 },
  { category: 'FX', value: 120000000, weight: 0.0972 },
  { category: 'BOND', value: 90000000, weight: 0.0729 },
  { category: 'MYSTERY_CATEGORY_FROM_FUTURE_BACKEND', value: 80000000, weight: 0.0648 },
];

const SECTOR_ALLOCATION: SectorAllocationDto[] = [
  { sector: 'Semiconductors and Electronic Components Manufacturing', value: 300000000, weight: 0.243, holdingCount: 3, unrealizedPnl: 12345678.9 },
  { sector: 'Financial Services', value: 200000000, weight: 0.162, holdingCount: 2, unrealizedPnl: -2345678.12 },
  { sector: 'Technology', value: 150000000, weight: 0.121, holdingCount: 1, unrealizedPnl: 1000000 },
  { sector: 'Energy', value: 100000000, weight: 0.081, holdingCount: 1, unrealizedPnl: 0 },
  { sector: 'Consumer Staples', value: 50000000, weight: 0.04, holdingCount: 1, unrealizedPnl: 50000 },
  { sector: null, value: 20000000, weight: 0.016, holdingCount: 1, unrealizedPnl: -10000 },
];

const SUMMARY: PortfolioSummaryDto = {
  totalMarketValue: 1140000000,
  totalCostBasis: 1000000000,
  realizedPnl: 12345678.9,
  unrealizedPnl: 140000000,
  totalPnl: 152345678.9,
  roi: 0.1523,
  holdingCount: 6,
  baseCurrency: 'TWD',
  fxExcludedCount: 2,
  unconvertedCurrencies: ['EUR', 'JPY'],
  dayPricePnl: -1234567.89,
  dayPricePnlRatio: -0.0104,
  dayPnlExcludedCount: 3,
  cash: 1087654321.5,
  totalEquity: 1234567890.12,
  cashBalances: CASH_BALANCES,
  allocation: ALLOCATION,
  sectorAllocation: SECTOR_ALLOCATION,
};

function holding(
  index: number,
  overrides: Partial<HoldingDto> & Pick<HoldingDto, 'symbol' | 'assetName' | 'currency'>,
): HoldingDto {
  return {
    assetId: `00000000-0000-4000-8000-00000000000${index}`,
    totalQuantity: 123456 + index,
    avgCost: 1234.56,
    costBasis: 152407263.36,
    marketPrice: 1456.78,
    marketValue: 179842345.68,
    realizedPnl: 1234567.89,
    unrealizedPnl: -2345678.12,
    roi: 0.0123,
    priceTime: '2026-10-24T05:30:00Z',
    lastUpdated: '2026-10-24T05:30:05Z',
    assetType: 'STOCK',
    sector: 'Technology',
    baseCurrency: 'TWD',
    marketValueInBase: 179842345.68,
    previousClose: 1440.12,
    dayPricePnl: 2056789.01,
    dayPricePnlRatio: 0.0116,
    ...overrides,
  };
}

const HOLDINGS: HoldingDto[] = [
  holding(1, { symbol: '2330.TW', assetName: 'Taiwan Semiconductor Manufacturing Company Limited (台灣積體電路製造股份有限公司)', currency: 'TWD' }),
  holding(2, { symbol: 'AAPL', assetName: 'Apple Inc.', currency: 'USD', marketValueInBase: 5800000000 }),
  holding(3, { symbol: 'SAP.DE', assetName: 'SAP SE', currency: 'EUR', marketValueInBase: null, dayPricePnl: null, dayPricePnlRatio: null, previousClose: null }),
  holding(4, { symbol: '7203.T', assetName: 'Toyota Motor Corporation', currency: 'JPY', marketValueInBase: null }),
  holding(5, { symbol: 'BTC-USD', assetName: 'Bitcoin', currency: 'USD', assetType: 'CRYPTO', sector: null }),
  holding(6, { symbol: '2317.TW', assetName: 'Hon Hai Precision Industry', currency: 'TWD', sector: null }),
];

function trade(
  index: number,
  overrides: Partial<TradeDto> & Pick<TradeDto, 'symbol' | 'type' | 'currency'>,
): TradeDto {
  const day = String(24 - index).padStart(2, '0');
  return {
    id: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
    quantity: 123456,
    price: 1234.56,
    fee: 1234.5,
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
  trade(3, { symbol: '7203.T', type: 'BUY', currency: 'JPY', price: 2987654.32 }),
  trade(4, { symbol: 'BTC-USD', type: 'BUY', currency: 'USD', note: 'long note with spaces '.repeat(10) }),
  trade(5, { symbol: '2317.TW', type: 'SELL', currency: 'TWD' }),
  trade(6, { symbol: 'AAPL', type: 'BUY', currency: 'USD' }),
  trade(7, { symbol: '2330.TW', type: 'SELL', currency: 'TWD' }),
  trade(8, { symbol: 'SAP.DE', type: 'SELL', currency: 'EUR' }),
  trade(9, { symbol: '7203.T', type: 'SELL', currency: 'JPY' }),
];

export interface FailPathOptions {
  /** 失敗回應 meta.traceId。 */
  traceId: string;
}

export interface MockPortfolioApiOptions {
  /** 把指定 pathname 覆寫為 503 SERVICE_UNAVAILABLE,並帶 meta.traceId。 */
  failPaths?: Record<string, FailPathOptions>;
  /** POST cash-entries 在這個 promise 解決前不回應(測送出中狀態);解決後回 201 風格的成功。 */
  cashPostGate?: Promise<void>;
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
 * 攔下全部 /api/v1/*:csrf / me 形狀沿用 L1,portfolio / trades / cash-entries 回「最寬」fixture,
 * 其他路徑 503(同 L1)。
 */
export async function mockPortfolioApi(page: Page, options: MockPortfolioApiOptions = {}): Promise<void> {
  const unavailable = async (route: Route, traceId = 'layout-trace'): Promise<void> => {
    await route.fulfill({
      status: 503,
      json: { success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'layout test' }, meta: { traceId } },
    });
  };

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
        json: envelope(entry(0, { id: 'layout-cash-new', type: 'WITHDRAWAL', currency: 'TWD', amount: 1 })),
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
