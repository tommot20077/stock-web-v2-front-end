import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpPortfolioApi, createMockPortfolioApi, createPortfolioApi } from './portfolioApi';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Trade } from '../types';

const SUMMARY_PAYLOAD = {
  totalMarketValue: 1000,
  totalCostBasis: 800,
  realizedPnl: 50,
  unrealizedPnl: 200,
  totalPnl: 250,
  roi: 0.3125,
  holdingCount: 3,
};

const HOLDINGS_PAYLOAD = [
  {
    assetId: 'a1',
    symbol: 'AAPL',
    assetName: 'Apple Inc.',
    totalQuantity: 120,
    avgCost: 178.2,
    costBasis: 21384,
    marketPrice: 218.4,
    marketValue: 26208,
    realizedPnl: 0,
    unrealizedPnl: 4824,
    roi: 0.2256,
    priceTime: '2026-07-24T13:30:00Z',
    lastUpdated: '2026-07-24T13:31:00Z',
  },
];

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

    expect(summary).toEqual(SUMMARY_PAYLOAD);
    expect(holdings).toEqual(HOLDINGS_PAYLOAD);
    expect(fetch).toHaveBeenCalledWith('/api/v1/portfolio/summary', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/v1/portfolio/holdings', expect.any(Object));
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ credentials: 'include' });
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

    expect(api.live?.lastFill).toMatchObject({ sym: 'AAPL', type: 'BUY', qty: 10, px: 200 });
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

    expect(summary).toEqual({
      totalMarketValue: 1300,
      totalCostBasis: 1000,
      realizedPnl: 0,
      unrealizedPnl: 300,
      totalPnl: 300,
      roi: 0.3,
      holdingCount: 2,
      // 04.1-11:Phase 04.1 新增的 11 個欄位(mock 自洽值,不含亂數)
      baseCurrency: 'USD',
      fxExcludedCount: 0,
      unconvertedCurrencies: [],
      dayPricePnl: null,
      dayPricePnlRatio: null,
      dayPnlExcludedCount: 2,
      cash: 0,
      totalEquity: 1300,
      cashBalances: [],
      allocation: [{ category: 'STOCK', value: 1300, weight: 1 }],
      sectorAllocation: [{ sector: 'Tech', value: 1300, weight: 1, holdingCount: 2, unrealizedPnl: 300 }],
    });
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
    expect(summary.sectorAllocation[0]).toMatchObject({ value: 1300, holdingCount: 2, unrealizedPnl: 300 });
    expect(summary.sectorAllocation[1]).toMatchObject({ value: 500, holdingCount: 1, unrealizedPnl: 100 });
    const weightSum = summary.sectorAllocation.reduce((sum, slice) => sum + slice.weight, 0);
    expect(weightSum).toBeCloseTo(1, 10);
    expect(summary.allocation).toEqual([{ category: 'STOCK', value: 1800, weight: 1 }]);
    expect(summary.totalEquity).toBe(summary.totalMarketValue);
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
    first.sectorAllocation[0].value = 999;
    expect((await api.getSummary()).sectorAllocation[0].value).toBe(2);
  });

  it('derives holding DTOs from live store positions', async () => {
    const api = createMockPortfolioApi();
    const portfolio = useMockPortfolioStore();
    portfolio.positions = [{ sym: 'AAA', name: 'Alpha', qty: 10, avg: 80, price: 100, sector: 'Tech' }];

    const holdings = await api.listHoldings();

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      symbol: 'AAA',
      assetName: 'Alpha',
      totalQuantity: 10,
      avgCost: 80,
      costBasis: 800,
      marketPrice: 100,
      marketValue: 1000,
      realizedPnl: 0,
      unrealizedPnl: 200,
      roi: 0.25,
      // 04.1-11:Phase 04.1 新增的 8 個欄位(mock 宇宙為美股報價 → USD)
      currency: 'USD',
      assetType: 'STOCK',
      sector: 'Tech',
      baseCurrency: 'USD',
      marketValueInBase: 1000,
      previousClose: null,
      dayPricePnl: null,
      dayPricePnlRatio: null,
    });
  });

  it('maps store trades to TradeDto shape with a stable id and ISO executedAt', async () => {
    const api = createMockPortfolioApi();
    useMockPortfolioStore().trades = customTrades();

    const page = await api.listTrades();

    expect(page).toMatchObject({ page: 0, size: 20, totalElements: 3, totalPages: 1 });
    expect(page.items[0]).toEqual({
      id: 'mock-0',
      symbol: 'AAA',
      type: 'BUY',
      quantity: 10,
      price: 100,
      fee: 1,
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
