import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBacktestApi, createHttpBacktestApi, createMockBacktestApi } from './backtestApi';
import type { BacktestRunRequest } from './apiTypes';

const request: BacktestRunRequest = {
  strategyId: 'ma_cross',
  strategyCode: null,
  symbol: 'AAPL',
  period: '3Y',
  initialCapital: 100000,
  currency: 'USD',
  benchmark: 'buy_hold',
  dataMode: 'cached',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastFetchInit(): RequestInit {
  const calls = vi.mocked(fetch).mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function headerValue(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

describe('backtestApi', () => {
  it('mock adapter creates runs and returns deterministic results', async () => {
    const api = createMockBacktestApi();

    const run = await api.createRun(request);
    const loaded = await api.getRun(run.id);
    const result = await api.getResult(run.id);
    const list = await api.listRuns({ symbol: 'AAPL', limit: 10 });

    expect(run).toMatchObject({ strategyId: 'ma_cross', symbol: 'AAPL', status: 'succeeded' });
    expect(loaded.id).toBe(run.id);
    expect(result.runId).toBe(run.id);
    expect(result.kpis.tradeCount).toBeGreaterThan(0);
    expect(list.data.map(item => item.id)).toContain(run.id);
  });

  it('mock adapter paginates runs with offset cursors', async () => {
    const api = createMockBacktestApi();
    const firstRun = await api.createRun({ ...request, symbol: 'MSFT' });
    const secondRun = await api.createRun({ ...request, symbol: 'MSFT' });
    const thirdRun = await api.createRun({ ...request, symbol: 'MSFT' });

    const firstPage = await api.listRuns({ symbol: 'MSFT', limit: 2 });
    const secondPage = await api.listRuns({ symbol: 'MSFT', limit: 2, cursor: firstPage.page.nextCursor });

    expect(firstPage.data.map(item => item.id)).toEqual([thirdRun.id, secondRun.id]);
    expect(firstPage.page).toEqual({ nextCursor: '2', hasMore: true });
    expect(secondPage.data.map(item => item.id)).toEqual([firstRun.id]);
    expect(secondPage.page).toEqual({ nextCursor: null, hasMore: false });
    expect(new Set([...firstPage.data, ...secondPage.data].map(item => item.id)).size).toBe(3);
  });

  it('mock adapter rejects invalid custom strategy code', async () => {
    const api = createMockBacktestApi();

    await expect(api.validateStrategy({ strategyCode: 'function strategy(' })).rejects.toMatchObject({
      code: 'BACKTEST_STRATEGY_COMPILE_FAILED',
      field: 'strategyCode',
    });
  });

  it('http adapter calls contract endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/backtests/runs')) {
        return new Response(JSON.stringify({
          data: {
            ...request,
            id: 'bt_1',
            label: 'MA Cross (20/50)',
            status: 'queued',
            createdAt: '2026-05-16T00:00:00Z',
            startedAt: null,
            completedAt: null,
          },
          requestId: 'req_1',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/strategies/validate')) {
        return new Response(JSON.stringify({
          data: { valid: true, normalizedName: 'strategy', warnings: [] },
          requestId: 'req_2',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs/bt_1')) {
        return new Response(JSON.stringify({
          data: {
            ...request,
            id: 'bt_1',
            label: 'MA Cross (20/50)',
            status: 'running',
            createdAt: '2026-05-16T00:00:00Z',
            startedAt: null,
            completedAt: null,
          },
          requestId: 'req_3',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs/bt_1/result')) {
        return new Response(JSON.stringify({
          data: {
            runId: 'bt_1',
            status: 'succeeded',
            kpis: {
              totalReturnPct: 12,
              buyHoldReturnPct: 8,
              sharpe: 1.2,
              cagrPct: 4,
              maxDrawdownPct: -6,
              drawdownDays: 20,
              winRatePct: 55,
              tradeCount: 14,
              profitFactor: 1.4,
              avgTradePct: 0.8,
            },
            equityCurve: [],
            monthlyReturns: [],
            drawdownCurve: [],
            trades: [],
          },
          requestId: 'req_4',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: [],
        page: { nextCursor: null, hasMore: false },
        requestId: 'req_5',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpBacktestApi('/api/v1');
    const run = await api.createRun(request);
    const createInit = lastFetchInit();
    await api.validateStrategy({ strategyCode: 'function strategy() { return true; }' });
    const validateInit = lastFetchInit();
    const loaded = await api.getRun('bt_1');
    const result = await api.getResult('bt_1');
    const list = await api.listRuns({ limit: 5 });
    const listInit = lastFetchInit();

    expect(run.id).toBe('bt_1');
    expect(createInit.body).toBe(JSON.stringify(request));
    expect(headerValue(createInit, 'content-type')).toBe('application/json');
    expect(validateInit.method).toBe('POST');
    expect(loaded.status).toBe('running');
    expect(result.runId).toBe('bt_1');
    expect(list.page.hasMore).toBe(false);
    expect(listInit.credentials).toBe('include');
    expect(fetch).toHaveBeenCalledWith('/api/v1/backtests/runs?limit=5', expect.any(Object));
  });

  it('http adapter listRuns uses shared paginated error parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'BACKTEST_PERMISSION_DENIED', message: 'Forbidden' },
      meta: { traceId: 'trace_backtest' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpBacktestApi('/api/v1');

    await expect(api.listRuns({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'BACKTEST_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'trace_backtest',
    });
  });

  it('http adapter converts paginated error envelopes to typed errors without request ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'BACKTEST_RUN_TIMEOUT', message: 'Timed out' },
      requestId: 123,
    }), { status: 504, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpBacktestApi('/api/v1');

    await expect(api.listRuns({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 504,
      code: 'BACKTEST_RUN_TIMEOUT',
      message: 'Timed out',
      requestId: null,
    });
  });

  it('factory selects mock or http implementation', () => {
    expect(createBacktestApi('mock').mode).toBe('mock');
    expect(createBacktestApi('api', '/api/v1').mode).toBe('api');
  });
});
