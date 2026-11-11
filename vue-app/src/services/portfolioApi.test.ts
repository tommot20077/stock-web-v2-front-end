import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpPortfolioApi, createMockPortfolioApi, createPortfolioApi, toHolding, toPortfolioSummary } from './portfolioApi';
import { createMockHoldingEventApi, resetMockHoldingEventsForTests } from './holdingEventApi';
import { isDecimal, parseDecimal, toWire } from './decimal';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Holding, HoldingDto, PortfolioActivityDto, PortfolioSummary, PortfolioSummaryDto } from './apiTypes';
import type { Trade } from '../types';

/** 後端 PortfolioSummaryDto 的完整 wire 樣本(Phase 5 D-05:BigDecimal 欄位為字串,計數欄位為 number)。 */
const SUMMARY_PAYLOAD: PortfolioSummaryDto = {
  totalMarketValue: '1000.00000000',
  totalCostBasis: '800.00000000',
  realizedPnl: '50.00000000',
  unrealizedPnl: '200.00000000',
  totalPnl: '250.00000000',
  roi: '0.31250000',
  holdingCount: 3,
  baseCurrency: 'TWD',
  fxExcludedCount: 0,
  unconvertedCurrencies: [],
  dayPricePnl: '12.50000000',
  dayPricePnlRatio: '0.01250000',
  dayPnlExcludedCount: 0,
  cash: '0.00000000',
  totalEquity: '1000.00000000',
  cashBalances: [{ currency: 'TWD', amount: '-0.00000001' }],
  allocation: [{ category: 'STOCK', value: '1000.00000000', weight: '1.00000000' }],
  sectorAllocation: [
    { sector: 'Tech', value: '1000.00000000', weight: '1.00000000', holdingCount: 3, unrealizedPnl: '200.00000000' },
  ],
  dividendIncome: '0.00000000',
  dividendTaxWithheld: '0.00000000',
};

/** domain summary → wire 形狀(Decimal 以 `toWire` 投影),讓測試以 toEqual 比較而不依賴 big.js 內部欄位。 */
function plainSummary(summary: PortfolioSummary): PortfolioSummaryDto {
  const nullable = (value: PortfolioSummary['dayPricePnl']) => (value === null ? null : toWire(value));
  return {
    ...summary,
    totalMarketValue: toWire(summary.totalMarketValue),
    totalCostBasis: toWire(summary.totalCostBasis),
    realizedPnl: toWire(summary.realizedPnl),
    unrealizedPnl: toWire(summary.unrealizedPnl),
    totalPnl: toWire(summary.totalPnl),
    roi: toWire(summary.roi),
    dayPricePnl: nullable(summary.dayPricePnl),
    dayPricePnlRatio: nullable(summary.dayPricePnlRatio),
    cash: toWire(summary.cash),
    totalEquity: toWire(summary.totalEquity),
    dividendIncome: toWire(summary.dividendIncome),
    dividendTaxWithheld: toWire(summary.dividendTaxWithheld),
    cashBalances: summary.cashBalances.map(balance => ({ ...balance, amount: toWire(balance.amount) })),
    allocation: summary.allocation.map(slice => ({ ...slice, value: toWire(slice.value), weight: toWire(slice.weight) })),
    sectorAllocation: summary.sectorAllocation.map(slice => ({
      ...slice,
      value: toWire(slice.value),
      weight: toWire(slice.weight),
      unrealizedPnl: toWire(slice.unrealizedPnl),
    })),
  };
}

/** 後端 HoldingDto 的完整 wire 樣本(Phase 5 D-05:14 個 BigDecimal 欄位為字串;沒有尾零,逐字往返)。 */
const HOLDING_WIRE: HoldingDto = {
  assetId: 'a1',
  symbol: 'AAPL',
  assetName: 'Apple Inc.',
  totalQuantity: '120.5',
  avgCost: '178.2',
  costBasis: '21473.1',
  marketPrice: '218.4',
  marketValue: '26317.2',
  realizedPnl: '-12.34',
  unrealizedPnl: '4844.1',
  roi: '0.22559108',
  priceTime: '2026-07-24T13:30:00Z',
  lastUpdated: '2026-07-24T13:31:00Z',
  currency: 'USD',
  assetType: 'STOCK',
  sector: 'Tech',
  market: 'US',
  baseCurrency: 'TWD',
  marketValueInBase: '123456789012.12345678',
  unrealizedPnlInBase: '9007199254740993.01',
  previousClose: '215',
  dayPricePnl: '409.7',
  dayPricePnlRatio: '0.01581395',
  dayPnlBasis: '25907.5',
};

const HOLDINGS_PAYLOAD: HoldingDto[] = [HOLDING_WIRE];

/** {@link HoldingDto} 的 14 個 BigDecimal 欄位(與 apiTypes 的 HoldingDecimalKey 同一份清單)。 */
const HOLDING_DECIMAL_KEYS = [
  'totalQuantity',
  'avgCost',
  'costBasis',
  'marketPrice',
  'marketValue',
  'realizedPnl',
  'unrealizedPnl',
  'roi',
  'marketValueInBase',
  'unrealizedPnlInBase',
  'previousClose',
  'dayPricePnl',
  'dayPricePnlRatio',
  'dayPnlBasis',
] as const;

/** domain holding → wire 形狀(Decimal 以 `toWire` 投影,null 保持 null),讓測試以 toEqual 比較。 */
function plainHolding(holding: Holding): HoldingDto {
  const wire = { ...holding } as unknown as Record<string, unknown>;
  for (const key of HOLDING_DECIMAL_KEYS) {
    const value = holding[key];
    wire[key] = value === null ? null : toWire(value);
  }
  return wire as unknown as HoldingDto;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function customTrades(): Trade[] {
  return [
    { d: '2026-03-01', type: 'BUY', sym: 'AAA', qty: 10, px: 100, fee: 1, note: 'a' },
    { d: '2026-02-01', type: 'SELL', sym: 'BBB', qty: 5, px: 200, fee: 2, note: 'b' },
    { d: '2026-01-01', type: 'BUY', sym: 'CCC', qty: 3, px: 50, fee: 0, note: '' },
  ];
}

beforeEach(() => {
  setActivePinia(createPinia());
  resetMockHoldingEventsForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('portfolioApi http adapter', () => {
  it('calls the contract endpoints and unwraps the ApiResponse envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/portfolio/summary') {
        return jsonResponse({ success: true, data: SUMMARY_PAYLOAD, error: null, meta: { traceId: 'req_summary' } });
      }
      if (url === '/api/v1/portfolio/holdings') {
        return jsonResponse({ success: true, data: HOLDINGS_PAYLOAD, error: null, meta: { traceId: 'req_holdings' } });
      }
      return jsonResponse({
        success: true,
        data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
        error: null,
        meta: { traceId: 'req_trades' },
      });
    }));

    const api = createHttpPortfolioApi('/api/v1');
    const summary = await api.getSummary();
    const holdings = await api.listHoldings();

    // big.js 會正規化尾零(後端 setScale(8) 的 "1000.00000000" 與 "1000" 數值相等,compareTo 語意);
    // 值以 toWire 的一般記號比較,欄位清單與非金額欄位必須逐欄相同。
    expect(plainSummary(summary)).toEqual({
      ...SUMMARY_PAYLOAD,
      totalMarketValue: '1000',
      totalCostBasis: '800',
      realizedPnl: '50',
      unrealizedPnl: '200',
      totalPnl: '250',
      roi: '0.3125',
      dayPricePnl: '12.5',
      dayPricePnlRatio: '0.0125',
      cash: '0',
      totalEquity: '1000',
      allocation: [{ category: 'STOCK', value: '1000', weight: '1' }],
      sectorAllocation: [{ sector: 'Tech', value: '1000', weight: '1', holdingCount: 3, unrealizedPnl: '200' }],
      dividendIncome: '0',
      dividendTaxWithheld: '0',
    });
    expect(holdings.map(plainHolding)).toEqual(HOLDINGS_PAYLOAD);
    expect(fetch).toHaveBeenCalledWith('/api/v1/portfolio/summary', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/v1/portfolio/holdings', expect.any(Object));
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('maps summary wire strings to Decimal without losing precision (D-05 / D-08)', async () => {
    const wire: PortfolioSummaryDto = {
      ...SUMMARY_PAYLOAD,
      cash: '0.00000000',
      totalEquity: '123456789012.12345678',
      dividendIncome: '1.5',
      dividendTaxWithheld: '0.25',
      dayPricePnl: null,
      dayPricePnlRatio: null,
      cashBalances: [{ currency: 'USD', amount: '9007199254740993.01' }],
      allocation: [{ category: 'STOCK', value: '123456789012.12345678', weight: '0.33333333' }],
      sectorAllocation: [
        { sector: null, value: '1.00000001', weight: '0.00000001', holdingCount: 1, unrealizedPnl: '-0.00000001' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: wire, error: null, meta: { traceId: 't' } })));

    const summary = await createHttpPortfolioApi('/api/v1').getSummary();

    expect(isDecimal(summary.cash)).toBe(true);
    // 後端 ZERO.setScale(8) → "0.00000000";數值等於 0(尾零由 big.js 正規化)。
    expect(summary.cash.eq(parseDecimal('0'))).toBe(true);
    expect(toWire(summary.cash)).toBe('0');
    expect(toWire(summary.totalEquity)).toBe('123456789012.12345678');
    expect(summary.dayPricePnl).toBeNull();
    expect(summary.dayPricePnlRatio).toBeNull();
    expect(isDecimal(summary.cashBalances[0].amount)).toBe(true);
    expect(toWire(summary.cashBalances[0].amount)).toBe('9007199254740993.01');
    expect(isDecimal(summary.allocation[0].weight)).toBe(true);
    expect(toWire(summary.allocation[0].value)).toBe('123456789012.12345678');
    expect(isDecimal(summary.sectorAllocation[0].unrealizedPnl)).toBe(true);
    // 1e-8 不得輸出科學記號
    expect(toWire(summary.sectorAllocation[0].weight)).toBe('0.00000001');
    expect(toWire(summary.sectorAllocation[0].unrealizedPnl)).toBe('-0.00000001');
    expect(summary.sectorAllocation[0].holdingCount).toBe(1);
    expect(summary.holdingCount).toBe(3);
    // 沒有尾零的欄位逐字往返
    expect(plainSummary(summary)).toEqual({
      ...wire,
      totalMarketValue: '1000',
      totalCostBasis: '800',
      realizedPnl: '50',
      unrealizedPnl: '200',
      totalPnl: '250',
      roi: '0.3125',
      cash: '0',
    });
  });

  it('treats missing Phase 04.1 list fields (old / cached shape) as empty lists', () => {
    const legacy = { ...SUMMARY_PAYLOAD } as Partial<PortfolioSummaryDto>;
    delete legacy.allocation;
    delete legacy.sectorAllocation;
    delete legacy.cashBalances;
    delete legacy.unconvertedCurrencies;

    const summary = toPortfolioSummary(legacy as PortfolioSummaryDto);

    expect(summary.allocation).toEqual([]);
    expect(summary.sectorAllocation).toEqual([]);
    expect(summary.cashBalances).toEqual([]);
    expect(summary.unconvertedCurrencies).toEqual([]);
  });

  it('fails loudly when a summary money field is still a JSON number (contract drift)', async () => {
    const drifted = { ...SUMMARY_PAYLOAD, totalEquity: 1000 } as unknown as PortfolioSummaryDto;
    expect(() => toPortfolioSummary(drifted)).toThrow(TypeError);

    const driftedNested = {
      ...SUMMARY_PAYLOAD,
      cashBalances: [{ currency: 'TWD', amount: 5 }],
    } as unknown as PortfolioSummaryDto;
    expect(() => toPortfolioSummary(driftedNested)).toThrow(TypeError);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: drifted, error: null, meta: { traceId: 't' } })));
    await expect(createHttpPortfolioApi('/api/v1').getSummary()).rejects.toThrow(TypeError);
  });

  it('maps holding wire strings to Decimal and round-trips every money field verbatim (D-05 / D-08)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [HOLDING_WIRE], error: null, meta: { traceId: 't' } })));

    const [holding] = await createHttpPortfolioApi('/api/v1').listHoldings();

    for (const key of HOLDING_DECIMAL_KEYS) {
      const value = holding[key];
      expect(value === null ? null : isDecimal(value), key).toBe(true);
      expect(value === null ? null : toWire(value), key).toBe(HOLDING_WIRE[key]);
    }
    // 超過 double 精度的值原值保留(JS number 會變成 123456789012.12346 / 9007199254740992)
    expect(toWire(holding.marketValueInBase!)).toBe('123456789012.12345678');
    expect(toWire(holding.unrealizedPnlInBase!)).toBe('9007199254740993.01');
    // 字串欄位原樣
    expect(holding).toMatchObject({ assetId: 'a1', symbol: 'AAPL', currency: 'USD', baseCurrency: 'TWD', market: 'US' });
  });

  it('keeps nullable holding money fields null (missing FX / previous close)', () => {
    const holding = toHolding({
      ...HOLDING_WIRE,
      marketValueInBase: null,
      unrealizedPnlInBase: null,
      previousClose: null,
      dayPricePnl: null,
      dayPricePnlRatio: null,
      dayPnlBasis: null,
    });

    expect(holding.marketValueInBase).toBeNull();
    expect(holding.unrealizedPnlInBase).toBeNull();
    expect(holding.previousClose).toBeNull();
    expect(holding.dayPricePnl).toBeNull();
    expect(holding.dayPricePnlRatio).toBeNull();
    expect(holding.dayPnlBasis).toBeNull();
    expect(toWire(holding.totalQuantity)).toBe('120.5');
  });

  it('treats a missing dayPnlBasis (older backend shape) as null', () => {
    const legacy = { ...HOLDING_WIRE } as Partial<HoldingDto>;
    delete legacy.dayPnlBasis;

    expect(toHolding(legacy as HoldingDto).dayPnlBasis).toBeNull();
  });

  it('normalises trailing zeros of setScale(8) holding values (numeric equality, not literal)', () => {
    const holding = toHolding({ ...HOLDING_WIRE, totalQuantity: '1000.00000000', roi: '0E-8' });

    expect(holding.totalQuantity.eq(parseDecimal('1000'))).toBe(true);
    expect(toWire(holding.totalQuantity)).toBe('1000');
    expect(holding.roi.eq(parseDecimal('0'))).toBe(true);
  });

  it('fails loudly when a holding money field is still a JSON number (contract drift)', async () => {
    const drifted = { ...HOLDING_WIRE, totalQuantity: 120 } as unknown as HoldingDto;
    expect(() => toHolding(drifted)).toThrow(TypeError);

    const driftedNullable = { ...HOLDING_WIRE, marketValueInBase: 999 } as unknown as HoldingDto;
    expect(() => toHolding(driftedNullable)).toThrow(TypeError);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [drifted], error: null, meta: { traceId: 't' } })));
    await expect(createHttpPortfolioApi('/api/v1').listHoldings()).rejects.toThrow(TypeError);
  });

  it('builds the listTrades query string from every contract parameter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: { items: [], page: 2, size: 20, totalElements: 0, totalPages: 0 },
      error: null,
      meta: { traceId: 'req_trades' },
    })));

    const api = createHttpPortfolioApi('/api/v1');
    const page = await api.listTrades({
      symbol: '2330.TW',
      type: 'BUY',
      dateFrom: '2026-01-01T00:00:00+08:00',
      dateTo: '2027-01-01T00:00:00+08:00',
      sort: 'total',
      direction: 'desc',
      page: 2,
      size: 20,
    });

    expect(page).toEqual({ items: [], page: 2, size: 20, totalElements: 0, totalPages: 0 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/trades'
      + '?symbol=2330.TW'
      + '&type=BUY'
      + '&dateFrom=2026-01-01T00%3A00%3A00%2B08%3A00'
      + '&dateTo=2027-01-01T00%3A00%3A00%2B08%3A00'
      + '&sort=total'
      + '&direction=desc'
      + '&page=2'
      + '&size=20',
      expect.any(Object),
    );
  });

  it('omits unset listTrades parameters and defaults page/size', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
      error: null,
      meta: { traceId: 'req_trades' },
    })));

    const api = createHttpPortfolioApi('/api/v1');
    await api.listTrades();
    expect(fetch).toHaveBeenCalledWith('/api/v1/trades?page=0&size=20', expect.any(Object));

    await api.listTrades({ type: 'SELL' });
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/trades?type=SELL&page=0&size=20', expect.any(Object));
  });

  it('preserves backend code / status / requestId on failure envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false,
      data: null,
      error: { code: 'PORTFOLIO_UNAVAILABLE', message: 'Portfolio unavailable' },
      meta: { traceId: 'trace-portfolio-down' },
    }, 503)));

    const api = createHttpPortfolioApi('/api/v1');

    await expect(api.getSummary()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'PORTFOLIO_UNAVAILABLE',
      status: 503,
      requestId: 'trace-portfolio-down',
    });
    await expect(api.listTrades({ page: 0 })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'PORTFOLIO_UNAVAILABLE',
      status: 503,
      requestId: 'trace-portfolio-down',
    });
  });

  it('does not expose live mock data', () => {
    expect(createHttpPortfolioApi('/api/v1').live).toBeUndefined();
  });
});

describe('portfolioApi mock adapter reactivity', () => {
  it('reads live store data through lazy getters after the whole array is replaced', async () => {
    const api = createMockPortfolioApi();
    const portfolio = useMockPortfolioStore();

    portfolio.trades = customTrades();
    expect(api.live?.trades.map(trade => trade.sym)).toEqual(['AAA', 'BBB', 'CCC']);

    portfolio.positions = [{ sym: 'ZZZ', name: 'Zeta', qty: 2, avg: 10, price: 20, sector: 'Tech' }];
    expect(api.live?.positions.map(position => position.sym)).toEqual(['ZZZ']);
  });

  it('reflects executeOrder mutations in live.lastFill and live.trades', () => {
    const api = createMockPortfolioApi();
    const portfolio = useMockPortfolioStore();

    expect(api.live?.lastFill).toBeNull();
    portfolio.executeOrder({ sym: 'AAPL', name: 'Apple Inc.', side: 'BUY', qty: 10, px: 200, fee: 1, sector: 'Tech' });

    // Phase 5 D-08:live.lastFill 與 LastFill 三處同形,qty / px 由 getter 轉成 Decimal。
    const fill = api.live?.lastFill;
    expect(fill).toMatchObject({ sym: 'AAPL', type: 'BUY' });
    expect(isDecimal(fill?.qty) && isDecimal(fill?.px)).toBe(true);
    expect([toWire(fill!.qty), toWire(fill!.px)]).toEqual(['10', '200']);
    expect(api.live?.trades[0]).toMatchObject({ sym: 'AAPL', type: 'BUY', qty: 10, px: 200 });
  });

  it('resolves the store lazily so a pinia swap does not leak stale references', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    setActivePinia(createPinia());
    const freshStore = useMockPortfolioStore();

    expect(api.live?.trades.map(trade => trade.sym)).not.toContain('AAA');
    expect(api.live?.trades.map(trade => trade.sym)).toEqual(freshStore.trades.map(trade => trade.sym));

    const summary = await api.getSummary();
    expect(summary.holdingCount).toBe(freshStore.positions.length);
  });
});

describe('portfolioApi mock adapter reads', () => {
  it('derives the summary DTO from live store positions', async () => {
    const api = createMockPortfolioApi();
    const portfolio = useMockPortfolioStore();
    portfolio.positions = [
      { sym: 'AAA', name: 'Alpha', qty: 10, avg: 80, price: 100, sector: 'Tech' },
      { sym: 'BBB', name: 'Beta', qty: 5, avg: 40, price: 60, sector: 'Tech' },
    ];

    const summary = await api.getSummary();

    expect(plainSummary(summary)).toEqual({
      totalMarketValue: '1300',
      totalCostBasis: '1000',
      realizedPnl: '0',
      unrealizedPnl: '300',
      totalPnl: '300',
      roi: '0.3',
      holdingCount: 2,
      // 04.1-11:Phase 04.1 新增的 11 個欄位(mock 自洽值,不含亂數)
      baseCurrency: 'USD',
      fxExcludedCount: 0,
      unconvertedCurrencies: [],
      dayPricePnl: null,
      dayPricePnlRatio: null,
      dayPnlExcludedCount: 2,
      cash: '0',
      totalEquity: '1300',
      cashBalances: [],
      allocation: [{ category: 'STOCK', value: '1300', weight: '1' }],
      sectorAllocation: [{ sector: 'Tech', value: '1300', weight: '1', holdingCount: 2, unrealizedPnl: '300' }],
      // 04.2-16:mock KPI 是寫死值、不隨 mock 股利變動(UI-SPEC §Interaction 0 股利附加列在 mock 不渲染),故為 0。
      dividendIncome: '0',
      dividendTaxWithheld: '0',
    });
    // mock 與 http 走同一個 mapper:金額欄位是 Decimal
    expect(isDecimal(summary.totalMarketValue)).toBe(true);
    expect(isDecimal(summary.sectorAllocation[0].value)).toBe(true);
  });

  it('groups sectorAllocation by position sector: weights sum to 1, sorted by value descending', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().positions = [
      { sym: 'AAA', name: 'Alpha', qty: 10, avg: 80, price: 100, sector: 'Tech' },
      { sym: 'CCC', name: 'Gamma', qty: 1, avg: 400, price: 500, sector: 'Crypto' },
      { sym: 'BBB', name: 'Beta', qty: 5, avg: 40, price: 60, sector: 'Tech' },
    ];

    const summary = await api.getSummary();

    expect(summary.sectorAllocation.map(slice => slice.sector)).toEqual(['Tech', 'Crypto']);
    const wire = plainSummary(summary);
    expect(wire.sectorAllocation[0]).toMatchObject({ value: '1300', holdingCount: 2, unrealizedPnl: '300' });
    expect(wire.sectorAllocation[1]).toMatchObject({ value: '500', holdingCount: 1, unrealizedPnl: '100' });
    const weightSum = summary.sectorAllocation.reduce((sum, slice) => sum.plus(slice.weight), parseDecimal('0'));
    expect(weightSum.minus(parseDecimal('1')).abs().lt(parseDecimal('1e-10'))).toBe(true);
    expect(wire.allocation).toEqual([{ category: 'STOCK', value: '1800', weight: '1' }]);
    expect(summary.totalEquity.eq(summary.totalMarketValue)).toBe(true);
    expect(summary.dayPnlExcludedCount).toBe(summary.holdingCount);
  });

  it('returns empty allocation lists when there are no positions', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().positions = [];

    const summary = await api.getSummary();

    expect(summary.holdingCount).toBe(0);
    expect(summary.allocation).toEqual([]);
    expect(summary.sectorAllocation).toEqual([]);
  });

  it('does not leak mutable mock state: consecutive summaries never share array references', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().positions = [{ sym: 'AAA', name: 'Alpha', qty: 1, avg: 1, price: 2, sector: 'Tech' }];

    const first = await api.getSummary();
    const second = await api.getSummary();

    expect(first.allocation).not.toBe(second.allocation);
    expect(first.sectorAllocation).not.toBe(second.sectorAllocation);
    expect(first.cashBalances).not.toBe(second.cashBalances);
    expect(first.unconvertedCurrencies).not.toBe(second.unconvertedCurrencies);
    first.sectorAllocation[0].value = parseDecimal('999');
    expect(toWire((await api.getSummary()).sectorAllocation[0].value)).toBe('2');
  });

  it('derives holding DTOs from live store positions', async () => {
    const api = createMockPortfolioApi();
    const portfolio = useMockPortfolioStore();
    portfolio.positions = [{ sym: 'AAA', name: 'Alpha', qty: 10, avg: 80, price: 100, sector: 'Tech' }];

    const holdings = await api.listHoldings();

    expect(holdings).toHaveLength(1);
    // Phase 5 D-08:mock 也回 domain(先以 numberToWire 組 wire,再走同一個 toHolding);以 toWire 比較數值。
    expect(isDecimal(holdings[0].totalQuantity)).toBe(true);
    expect(plainHolding(holdings[0])).toMatchObject({
      symbol: 'AAA',
      assetName: 'Alpha',
      totalQuantity: '10',
      avgCost: '80',
      costBasis: '800',
      marketPrice: '100',
      marketValue: '1000',
      realizedPnl: '0',
      unrealizedPnl: '200',
      roi: '0.25',
      // 04.1-11:Phase 04.1 新增的 8 個欄位(mock 宇宙為美股報價 → USD)
      currency: 'USD',
      assetType: 'STOCK',
      sector: 'Tech',
      baseCurrency: 'USD',
      marketValueInBase: '1000',
      // quick-261106-fbs:mock 單一幣別,基準幣未實現損益 = 原幣 unrealizedPnl(與 marketValueInBase 同做法)
      unrealizedPnlInBase: '200',
      previousClose: null,
      dayPricePnl: null,
      dayPricePnlRatio: null,
      dayPnlBasis: null,
    });
  });

  it('E2:mock 種子持倉的 HoldingDto 帶 assetType 與 market(與 mock market adapter 同值域)', async () => {
    const holdings = await createMockPortfolioApi().listHoldings();
    const bySymbol = new Map(holdings.map(h => [h.symbol, h]));

    expect(bySymbol.get('AAPL')).toMatchObject({ assetType: 'STOCK', market: 'US' });
    expect(bySymbol.get('2330.TW')).toMatchObject({ assetType: 'STOCK', market: 'TW' });
    expect(bySymbol.get('BTC')).toMatchObject({ assetType: 'CRYPTO', market: 'CRYPTO' });
    for (const holding of holdings) {
      expect(holding.market, holding.symbol).toEqual(expect.any(String));
    }
  });

  it('E2:沒有 assetType / market 的自訂 mock 持倉 → market null(對話框退回 UTC)', async () => {
    useMockPortfolioStore().positions = [{ sym: 'AAA', name: 'Alpha', qty: 1, avg: 1, price: 2, sector: 'Tech' }];
    const [holding] = await createMockPortfolioApi().listHoldings();
    expect(holding.market).toBeNull();
    expect(holding.assetType).toBe('STOCK');
  });

  it('maps store trades to the TradeRecord shape with a stable id and ISO executedAt', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    const page = await api.listTrades();

    expect(page).toMatchObject({ page: 0, size: 20, totalElements: 3, totalPages: 1 });
    const [first] = page.items;
    // Phase 5 D-08:mock 先以 numberToWire 組 wire,再走 toTradeRecord —— 金額為 Decimal。
    expect([first.quantity, first.price, first.fee].every(isDecimal)).toBe(true);
    expect({ ...first, quantity: toWire(first.quantity), price: toWire(first.price), fee: toWire(first.fee) }).toEqual({
      id: 'mock-0',
      symbol: 'AAA',
      type: 'BUY',
      quantity: '10',
      price: '100',
      fee: '1',
      note: 'a',
      // mock `Trade` 沒有幣別,不猜測(UI-SPEC U-29)
      currency: null,
      executedAt: '2026-03-01T00:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
    });
  });

  it('filters mock trades by type, symbol and half-open date range', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    const buys = await api.listTrades({ type: 'BUY' });
    expect(buys.items.map(trade => trade.symbol)).toEqual(['AAA', 'CCC']);
    expect(buys.totalElements).toBe(2);

    const bySymbol = await api.listTrades({ symbol: 'BBB' });
    expect(bySymbol.items.map(trade => trade.symbol)).toEqual(['BBB']);

    const ranged = await api.listTrades({
      dateFrom: '2026-02-01T00:00:00Z',
      dateTo: '2026-03-01T00:00:00Z',
    });
    expect(ranged.items.map(trade => trade.symbol)).toEqual(['BBB']);
    expect(ranged.totalElements).toBe(1);
  });

  it('sorts mock trades by the whitelisted fields and direction', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    const byExecutedAtAsc = await api.listTrades({ sort: 'executedAt', direction: 'asc' });
    expect(byExecutedAtAsc.items.map(trade => trade.symbol)).toEqual(['CCC', 'BBB', 'AAA']);

    const byQuantityAsc = await api.listTrades({ sort: 'quantity', direction: 'asc' });
    expect(byQuantityAsc.items.map(trade => trade.symbol)).toEqual(['CCC', 'BBB', 'AAA']);

    // total = quantity x price: AAA 1000, BBB 1000, CCC 150
    const byTotalDesc = await api.listTrades({ sort: 'total', direction: 'desc' });
    expect(byTotalDesc.items.map(trade => trade.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('paginates mock trades with a PaginatedResponse shape', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    const firstPage = await api.listTrades({ page: 0, size: 2 });
    const secondPage = await api.listTrades({ page: 1, size: 2 });

    expect(firstPage).toMatchObject({ page: 0, size: 2, totalElements: 3, totalPages: 2 });
    expect(firstPage.items.map(trade => trade.symbol)).toEqual(['AAA', 'BBB']);
    expect(secondPage).toMatchObject({ page: 1, size: 2, totalElements: 3, totalPages: 2 });
    expect(secondPage.items.map(trade => trade.symbol)).toEqual(['CCC']);
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const api = createMockPortfolioApi();

    await api.getSummary();
    await api.listHoldings();
    await api.listTrades({ type: 'BUY', page: 0, size: 5 });
    void api.live?.trades;
    void api.live?.positions;
    void api.live?.lastFill;

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('portfolioApi — 交易分頁以 TradeRecord 回傳(05-19 / D-08)', () => {
  const WIRE_TRADE = {
    id: 'tr-1',
    symbol: '2330.TW',
    type: 'BUY',
    quantity: '0.00000001',
    price: '123456.12345678',
    fee: '9007199254740993.01',
    note: null,
    currency: 'TWD',
    executedAt: '2026-10-01T10:00:00+08:00',
    createdAt: '2026-10-01T10:00:05+08:00',
  };

  function tradePage(items: unknown[]) {
    return jsonResponse({
      success: true,
      data: { items, page: 0, size: 20, totalElements: items.length, totalPages: 1 },
      error: null,
      meta: { traceId: 'req_trades' },
    });
  }

  it('http listTrades:wire 字串 → Decimal,極小值與超過 double 精度的值逐字往返,分頁欄位原樣', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tradePage([WIRE_TRADE])));

    const page = await createHttpPortfolioApi('/api/v1').listTrades();

    expect(page).toMatchObject({ page: 0, size: 20, totalElements: 1, totalPages: 1 });
    const [trade] = page.items;
    expect([trade.quantity, trade.price, trade.fee].every(isDecimal)).toBe(true);
    expect(toWire(trade.quantity)).toBe('0.00000001');
    expect(toWire(trade.price)).toBe('123456.12345678');
    expect(toWire(trade.fee)).toBe('9007199254740993.01');
    expect(trade).toMatchObject({ id: 'tr-1', symbol: '2330.TW', type: 'BUY', currency: 'TWD', note: null });
  });

  it('http listTrades:後端 setScale(8) 的尾零以 eq 比較(big.js 正規化尾零)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tradePage([{ ...WIRE_TRADE, quantity: '10.00000000', fee: '0E-8' }])));

    const [trade] = (await createHttpPortfolioApi('/api/v1').listTrades()).items;

    expect(trade.quantity.eq(parseDecimal('10'))).toBe(true);
    expect(toWire(trade.fee)).toBe('0');
  });

  it('http listTrades:金額仍為 JS number 時在邊界丟錯(T-05-27)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tradePage([{ ...WIRE_TRADE, quantity: 3 }])));

    await expect(createHttpPortfolioApi('/api/v1').listTrades()).rejects.toThrow(TypeError);
  });

  it('mock listTrades:總額排序以 Decimal 計算(0.1 × 3 與 0.3 × 1 相等,保留原順序;double 會把前者排在後面)', async () => {
    useMockPortfolioStore().trades = [
      { d: '2026-03-01', type: 'BUY', sym: 'AAA', qty: 0.1, px: 3, fee: 0, note: '' },
      { d: '2026-02-01', type: 'BUY', sym: 'BBB', qty: 0.3, px: 1, fee: 0, note: '' },
    ];

    const page = await createMockPortfolioApi().listTrades({ sort: 'total', direction: 'asc' });

    expect(page.items.map(trade => trade.symbol)).toEqual(['AAA', 'BBB']);
    expect(page.items[0].quantity.times(page.items[0].price).eq(parseDecimal('0.3'))).toBe(true);
  });

  it('mock live.lastFill:mock store 的 number 經 numberToWire → parseDecimal,小數價格精確', () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().executeOrder({ sym: 'AAPL', name: 'Apple Inc.', side: 'BUY', qty: 0.5, px: 218.12, fee: 0, sector: 'Tech' });

    const fill = api.live?.lastFill;
    expect(isDecimal(fill?.qty) && isDecimal(fill?.px)).toBe(true);
    expect([toWire(fill!.qty), toWire(fill!.px)]).toEqual(['0.5', '218.12']);
  });
});

describe('portfolioApi factory', () => {
  it('selects mock or http implementation by runtime mode', () => {
    const mock = createPortfolioApi('mock');
    const http = createPortfolioApi('api', '/api/v1');

    expect(mock.mode).toBe('mock');
    expect(mock.live).toBeDefined();
    expect(http.mode).toBe('api');
    expect(http.live).toBeUndefined();
  });
});

/** 後端 `PortfolioActivityDto` 的完整欄位集合(已排序)。 */
const ACTIVITY_FIELDS = [
  'amount', 'createdAt', 'currency', 'effectiveDate', 'fee', 'id', 'kind', 'note', 'occurredAt', 'price',
  'quantity', 'ratioNew', 'ratioOld', 'reversalOfEffectiveDate', 'reversalOfId', 'reversalOfOccurredAt',
  'reversed', 'reversible', 'symbol', 'withholdingTax',
];

const DIVIDEND_ACTIVITY: PortfolioActivityDto = {
  id: '11111111-2222-3333-4444-555555555555',
  kind: 'CASH_DIVIDEND',
  symbol: 'AAPL',
  currency: 'USD',
  occurredAt: '2026-10-30T09:00:00+08:00',
  effectiveDate: null,
  createdAt: '2026-10-30T09:00:01+08:00',
  quantity: null,
  price: null,
  fee: null,
  amount: 120,
  withholdingTax: 30,
  ratioNew: null,
  ratioOld: null,
  note: null,
  reversalOfId: null,
  reversalOfOccurredAt: null,
  reversalOfEffectiveDate: null,
  reversed: false,
  reversible: true,
};

describe('portfolioApi http adapter — listActivities(PORT-13)', () => {
  it('calls GET /portfolio/activities with the same parameter names as listTrades', async () => {
    const pageData = { items: [DIVIDEND_ACTIVITY], page: 2, size: 20, totalElements: 41, totalPages: 3 };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true, data: pageData, error: null, meta: { traceId: 'req_activities' },
    })));

    const page = await createHttpPortfolioApi('/api/v1').listActivities({
      type: 'DIVIDEND', sort: 'quantity', direction: 'desc', page: 2, size: 20,
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/portfolio/activities?type=DIVIDEND&sort=quantity&direction=desc&page=2&size=20',
      expect.any(Object),
    );
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.method ?? 'GET').toUpperCase()).toBe('GET');
    expect(page).toEqual(pageData);
  });

  it('forwards symbol / dateFrom / dateTo and defaults page / size', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
      error: null,
      meta: { traceId: 'req_activities' },
    })));
    const api = createHttpPortfolioApi('/api/v1');

    await api.listActivities();
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/portfolio/activities?page=0&size=20', expect.any(Object));

    await api.listActivities({
      symbol: 'AAPL',
      type: 'SHARE_ADJUSTMENT',
      dateFrom: '2026-01-01T00:00:00+08:00',
      dateTo: '2027-01-01T00:00:00+08:00',
      sort: 'createdAt',
      direction: 'asc',
    });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/portfolio/activities'
      + '?symbol=AAPL'
      + '&type=SHARE_ADJUSTMENT'
      + '&dateFrom=2026-01-01T00%3A00%3A00%2B08%3A00'
      + '&dateTo=2027-01-01T00%3A00%3A00%2B08%3A00'
      + '&sort=createdAt'
      + '&direction=asc'
      + '&page=0'
      + '&size=20',
      expect.any(Object),
    );
  });

  it('preserves backend code / status / requestId on failure envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false,
      data: null,
      error: { code: 'VALIDATION_FAILED', message: 'Validation failed', fields: { type: 'invalid' } },
      meta: { traceId: 'req_bad_type' },
    }, 400)));

    await expect(createHttpPortfolioApi('/api/v1').listActivities({ type: 'DIVIDEND' })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      requestId: 'req_bad_type',
    });
  });
});

describe('portfolioApi mock adapter — listActivities', () => {
  function seedTrades(): void {
    const store = useMockPortfolioStore();
    store.trades = [
      { d: '2026-03-01', type: 'BUY', sym: 'AAPL', qty: 10, px: 100, fee: 1, note: 'a' },
      { d: '2026-02-01', type: 'SELL', sym: 'NVDA', qty: 5, px: 200, fee: 2, note: 'b' },
      { d: '2026-01-15', type: 'DIV', sym: 'AAPL', qty: 120, px: 0.24, fee: 0, note: 'static' },
    ];
    store.positions = [{ sym: 'AAPL', name: 'Apple Inc.', qty: 1000, avg: 100, price: 218.4, sector: 'Tech' }];
  }

  it('maps mock trades to activity rows: static DIV is CASH_DIVIDEND and not reversible', async () => {
    seedTrades();

    const page = await createMockPortfolioApi().listActivities({ sort: 'executedAt', direction: 'desc' });

    expect(page).toMatchObject({ page: 0, size: 20, totalElements: 3, totalPages: 1 });
    expect(page.items.map(item => item.kind)).toEqual(['BUY', 'SELL', 'CASH_DIVIDEND']);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(ACTIVITY_FIELDS);
      expect(item.reversible).toBe(false);
      expect(item.reversed).toBe(false);
    }
    expect(page.items[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, price: 100, fee: 1, amount: 1000 });
    expect(page.items[2]).toMatchObject({
      symbol: 'AAPL', quantity: null, price: null, fee: null, amount: 120 * 0.24, effectiveDate: null,
    });
  });

  it('merges events recorded by the mock holdingEventApi exactly once', async () => {
    seedTrades();
    const events = createMockHoldingEventApi();
    const dividend = await events.createDividend(
      { symbol: 'AAPL', amount: parseDecimal('50'), withholdingTax: parseDecimal('5'), paidAt: '2026-04-01T09:00:00+08:00' },
      'k-1',
    );
    const split = await events.createShareAdjustment(
      { symbol: 'AAPL', type: 'SPLIT', ratioNew: 2, ratioOld: 1, effectiveDate: '2026-05-01' },
      'k-2',
    );

    const page = await createMockPortfolioApi().listActivities();

    // 股利事件同時寫了一列 mock DIV 交易;活動列表只能出現一次(以事件本身代表,可沖銷)。
    expect(page.totalElements).toBe(5);
    const dividendRow = page.items.find(item => item.id === dividend.id)!;
    expect(dividendRow).toMatchObject({
      kind: 'CASH_DIVIDEND', amount: 50, withholdingTax: 5, price: null, fee: null, reversible: true,
    });
    const splitRow = page.items.find(item => item.id === split.id)!;
    expect(splitRow).toMatchObject({
      kind: 'SPLIT', quantity: 1000, ratioNew: 2, ratioOld: 1, effectiveDate: '2026-05-01', amount: null, reversible: true,
    });
    expect(Object.keys(splitRow).sort()).toEqual(ACTIVITY_FIELDS);
    expect(page.items.filter(item => item.kind === 'CASH_DIVIDEND')).toHaveLength(2);
    // 預設 occurredAt desc:最新的拆股排第一。
    expect(page.items[0].id).toBe(split.id);
  });

  it('filters by type: DIVIDEND → CASH_DIVIDEND, SHARE_ADJUSTMENT → STOCK_DIVIDEND / SPLIT, BUY / SELL', async () => {
    seedTrades();
    const events = createMockHoldingEventApi();
    await events.createDividend({ symbol: 'AAPL', amount: parseDecimal('50') }, 'k-1');
    await events.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: parseDecimal('10'), effectiveDate: '2026-05-01' },
      'k-2',
    );
    const api = createMockPortfolioApi();

    expect((await api.listActivities({ type: 'DIVIDEND' })).items.map(item => item.kind))
      .toEqual(['CASH_DIVIDEND', 'CASH_DIVIDEND']);
    expect((await api.listActivities({ type: 'SHARE_ADJUSTMENT' })).items.map(item => item.kind))
      .toEqual(['STOCK_DIVIDEND']);
    expect((await api.listActivities({ type: 'BUY' })).items.map(item => item.kind)).toEqual(['BUY']);
    expect((await api.listActivities({ type: 'SELL', symbol: 'NVDA' })).items.map(item => item.kind)).toEqual(['SELL']);
    expect((await api.listActivities({ symbol: 'NVDA', type: 'BUY' })).items).toEqual([]);
  });

  it('sorts by total with null amounts last and paginates', async () => {
    seedTrades();
    await createMockHoldingEventApi().createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: parseDecimal('10'), effectiveDate: '2026-05-01' },
      'k-1',
    );
    const api = createMockPortfolioApi();

    const ascending = await api.listActivities({ sort: 'total', direction: 'asc' });
    expect(ascending.items.map(item => item.amount)).toEqual([120 * 0.24, 1000, 1000, null]);

    const second = await api.listActivities({ sort: 'total', direction: 'desc', page: 1, size: 3 });
    expect(second).toMatchObject({ page: 1, size: 3, totalElements: 4, totalPages: 2 });
    expect(second.items.map(item => item.amount)).toEqual([null]);
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await createMockPortfolioApi().listActivities();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('portfolioApi mock adapter — live.holdingEvents / isHoldingEventTrade(04.2-21:Trades mock 模式合併)', () => {
  it('exposes session events as activity rows (newest last) and flags the DIV trade row a mock dividend wrote', async () => {
    const store = useMockPortfolioStore();
    store.trades = [{ d: '2026-01-15', type: 'DIV', sym: 'AAPL', qty: 120, px: 0.24, fee: 0, note: 'static' }];
    store.positions = [{ sym: 'AAPL', name: 'Apple Inc.', qty: 1000, avg: 100, price: 218.4, sector: 'Tech' }];
    const api = createMockPortfolioApi();
    expect(api.live?.holdingEvents).toEqual([]);

    const events = createMockHoldingEventApi();
    const dividend = await events.createDividend({ symbol: 'AAPL', amount: parseDecimal('50'), withholdingTax: parseDecimal('5') }, 'k-1');
    const split = await events.createShareAdjustment(
      { symbol: 'AAPL', type: 'SPLIT', ratioNew: 2, ratioOld: 1, effectiveDate: '2026-05-01' },
      'k-2',
    );

    const rows = api.live!.holdingEvents;
    expect(rows.map(row => row.id)).toEqual([dividend.id, split.id]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(ACTIVITY_FIELDS);
    expect(rows[0]).toMatchObject({ kind: 'CASH_DIVIDEND', amount: 50, price: null, fee: null, reversible: true });
    expect(rows[1]).toMatchObject({ kind: 'SPLIT', ratioNew: 2, ratioOld: 1, reversible: true });

    // 股利事件寫進 mock 交易的那列 DIV 由事件代表;靜態示範列不是。
    const [written, staticRow] = store.trades;
    expect(api.live!.isHoldingEventTrade(written)).toBe(true);
    expect(api.live!.isHoldingEventTrade(staticRow)).toBe(false);
  });

  it('returns clones: mutating a row does not leak back into mock state', async () => {
    const store = useMockPortfolioStore();
    store.positions = [{ sym: 'AAPL', name: 'Apple Inc.', qty: 1000, avg: 100, price: 218.4, sector: 'Tech' }];
    await createMockHoldingEventApi().createDividend({ symbol: 'AAPL', amount: parseDecimal('50') }, 'k-1');
    const api = createMockPortfolioApi();

    api.live!.holdingEvents[0].amount = 999;

    expect(api.live!.holdingEvents[0].amount).toBe(50);
  });
});
