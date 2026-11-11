import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBacktestApi,
  createHttpBacktestApi,
  createMockBacktestApi,
  toBacktestResult,
  toBacktestRunRecord,
} from './backtestApi';
import type { BacktestResultDto, BacktestRunDto, BacktestRunInput, BacktestRunRequest } from './apiTypes';
import { isDecimal, parseDecimal, toWire } from './decimal';

// domain 輸入(Decimal 初始資金)與其 wire 投影(字串,Phase 5 D-05 / D-08)。
const request: BacktestRunInput = {
  strategyId: 'ma_cross',
  strategyCode: null,
  symbol: 'AAPL',
  period: '3Y',
  initialCapital: parseDecimal('100000'),
  currency: 'USD',
  benchmark: 'buy_hold',
  dataMode: 'cached',
};
const wireRequest: BacktestRunRequest = { ...request, initialCapital: '100000' };

const runWire: BacktestRunDto = {
  ...wireRequest,
  id: 'bt_1',
  label: 'MA Cross (20/50)',
  status: 'queued',
  progress: '0.25000',
  createdAt: '2026-05-16T00:00:00Z',
  startedAt: null,
  completedAt: null,
};

const resultWire: BacktestResultDto = {
  runId: 'bt_1',
  status: 'succeeded',
  kpis: {
    totalReturnPct: '12.34567891',
    buyHoldReturnPct: '8.00000000',
    sharpe: '1.20000000',
    cagrPct: '4.00000000',
    maxDrawdownPct: '-6.50000000',
    drawdownDays: 20,
    winRatePct: '55.00000000',
    tradeCount: 14,
    profitFactor: '1.40000000',
    avgTradePct: '0.80000000',
  },
  equityCurve: [{ t: '2026-01-01', strategy: '123456789012.12345678', benchmark: '100000.00000001' }],
  monthlyReturns: [{ year: 2026, month: 1, returnPct: '-0.00000001' }],
  drawdownCurve: [{ t: '2026-01-01', drawdownPct: '-3.25000000' }],
  trades: [{ date: '2026-01-12', side: 'BUY', entry: '100.12345678', exit: '104.5', bars: 5, pnl: '-120.5', pnlPct: '1.2' }],
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
    const list = await api.listRuns({ symbol: 'AAPL', size: 10 });

    expect(run).toMatchObject({ strategyId: 'ma_cross', symbol: 'AAPL', status: 'succeeded' });
    expect(loaded.id).toBe(run.id);
    expect(result.runId).toBe(run.id);
    expect(result.kpis.tradeCount).toBeGreaterThan(0);
    expect(list.items.map(item => item.id)).toContain(run.id);
    expect(list.page).toBe(0);
    expect(list.size).toBe(10);
  });

  it('mock adapter paginates runs by page number', async () => {
    const api = createMockBacktestApi();
    const firstRun = await api.createRun({ ...request, symbol: 'MSFT' });
    const secondRun = await api.createRun({ ...request, symbol: 'MSFT' });
    const thirdRun = await api.createRun({ ...request, symbol: 'MSFT' });

    const firstPage = await api.listRuns({ symbol: 'MSFT', size: 2 });
    const secondPage = await api.listRuns({ symbol: 'MSFT', size: 2, page: 1 });

    expect(firstPage.items.map(item => item.id)).toEqual([thirdRun.id, secondRun.id]);
    expect(firstPage).toMatchObject({ page: 0, size: 2, totalElements: 3, totalPages: 2 });
    expect(secondPage.items.map(item => item.id)).toEqual([firstRun.id]);
    expect(secondPage).toMatchObject({ page: 1, size: 2, totalElements: 3, totalPages: 2 });
    expect(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size).toBe(3);
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
      if (url.endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-backtest; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'req_csrf' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs')) {
        return new Response(JSON.stringify({
          data: runWire,
          meta: { traceId: 'req_1' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/strategies/validate')) {
        return new Response(JSON.stringify({
          data: { valid: true, normalizedName: 'strategy', warnings: [] },
          meta: { traceId: 'req_2' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs/bt_1')) {
        return new Response(JSON.stringify({
          data: { ...runWire, status: 'running' },
          meta: { traceId: 'req_3' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs/bt_1/result')) {
        return new Response(JSON.stringify({
          data: resultWire,
          meta: { traceId: 'req_4' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // 真實後端 list 信封:data 為 PageResponse(items/page/size/totalElements/totalPages)
      return new Response(JSON.stringify({
        data: { items: [], page: 0, size: 5, totalElements: 0, totalPages: 0 },
        meta: { traceId: 'req_5' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpBacktestApi('/api/v1');
    const run = await api.createRun(request);
    const createInit = lastFetchInit();
    await api.validateStrategy({ strategyCode: 'function strategy() { return true; }' });
    const validateInit = lastFetchInit();
    const loaded = await api.getRun('bt_1');
    const result = await api.getResult('bt_1');
    const list = await api.listRuns({ size: 5 });
    const listInit = lastFetchInit();

    expect(run.id).toBe('bt_1');
    expect(createInit.body).toBe(JSON.stringify(wireRequest));
    expect(JSON.parse(String(createInit.body)).initialCapital).toBe('100000');
    expect(headerValue(createInit, 'content-type')).toBe('application/json');
    expect(headerValue(createInit, 'x-xsrf-token')).toBe('csrf-backtest');
    expect(validateInit.method).toBe('POST');
    expect(loaded.status).toBe('running');
    expect(result.runId).toBe('bt_1');
    expect(toWire(run.initialCapital)).toBe('100000');
    expect(toWire(result.equityCurve[0].strategy)).toBe('123456789012.12345678');
    expect(result.kpis.tradeCount).toBe(14);
    expect(list).toEqual({ items: [], page: 0, size: 5, totalElements: 0, totalPages: 0 });
    expect(listInit.credentials).toBe('include');
    expect(fetch).toHaveBeenCalledWith('/api/v1/backtests/runs?page=0&size=5', expect.any(Object));
  });

  it('http adapter listRuns uses shared paginated error parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'BACKTEST_PERMISSION_DENIED', message: 'Forbidden' },
      meta: { traceId: 'trace_backtest' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpBacktestApi('/api/v1');

    await expect(api.listRuns({ size: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'BACKTEST_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'trace_backtest',
    });
  });

  it('http adapter converts paginated error envelopes without usable meta.traceId to null request ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      data: null,
      error: { code: 'BACKTEST_RUN_TIMEOUT', message: 'Timed out' },
      meta: { traceId: 123 },
    }), { status: 504, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpBacktestApi('/api/v1');

    await expect(api.listRuns({ size: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 504,
      code: 'BACKTEST_RUN_TIMEOUT',
      message: 'Timed out',
      requestId: null,
    });
  });

  it('http createRun 以 toWire 送出 Decimal 初始資金(字串,不經 number)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-backtest; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'req_csrf' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: { ...runWire, initialCapital: '100000.50000000' },
        meta: { traceId: 'req_1' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpBacktestApi('/api/v1');
    const run = await api.createRun({ ...request, initialCapital: parseDecimal('100000.5') });
    const body = JSON.parse(String(lastFetchInit().body));

    expect(body.initialCapital).toBe('100000.5');
    expect(typeof body.initialCapital).toBe('string');
    expect(isDecimal(run.initialCapital)).toBe(true);
    expect(run.initialCapital.eq(parseDecimal('100000.5'))).toBe(true);
  });

  it('http createRun 逐欄投影,不把呼叫端多帶的欄位送到後端', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-backtest; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          meta: { traceId: 'req_csrf' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: runWire, meta: { traceId: 'req_1' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));

    const api = createHttpBacktestApi('/api/v1');
    const extra = { ...request, uiOnly: 'x' } as BacktestRunInput;
    await api.createRun(extra);

    expect(Object.keys(JSON.parse(String(lastFetchInit().body))).sort()).toEqual(Object.keys(wireRequest).sort());
  });

  it('factory selects mock or http implementation', () => {
    expect(createBacktestApi('mock').mode).toBe('mock');
    expect(createBacktestApi('api', '/api/v1').mode).toBe('api');
  });
});

describe('backtest wire → domain mapper(05-24 / D-05 / D-08)', () => {
  it('toBacktestRunRecord:initialCapital / progress 轉 Decimal,progress null / 缺欄 → null', () => {
    const record = toBacktestRunRecord(runWire);
    expect(toWire(record.initialCapital)).toBe('100000');
    expect(record.progress && toWire(record.progress)).toBe('0.25');
    expect(toBacktestRunRecord({ ...runWire, progress: null }).progress).toBeNull();
    const { progress: _omit, ...withoutProgress } = runWire;
    expect(toBacktestRunRecord(withoutProgress).progress).toBeNull();
  });

  it('toBacktestResult:BigDecimal 欄逐字轉 Decimal,int 欄維持 number', () => {
    const result = toBacktestResult(resultWire);
    expect(toWire(result.kpis.totalReturnPct)).toBe('12.34567891');
    expect(result.kpis.maxDrawdownPct.eq(parseDecimal('-6.5'))).toBe(true);
    expect(isDecimal(result.kpis.sharpe)).toBe(true);
    expect(result.kpis.drawdownDays).toBe(20);
    expect(result.kpis.tradeCount).toBe(14);
    expect(toWire(result.equityCurve[0].strategy)).toBe('123456789012.12345678');
    expect(toWire(result.equityCurve[0].benchmark)).toBe('100000.00000001');
    expect(result.monthlyReturns[0]).toMatchObject({ year: 2026, month: 1 });
    expect(toWire(result.monthlyReturns[0].returnPct)).toBe('-0.00000001');
    expect(toWire(result.drawdownCurve[0].drawdownPct)).toBe('-3.25');
    expect(result.trades[0].bars).toBe(5);
    expect(toWire(result.trades[0].entry)).toBe('100.12345678');
    expect(toWire(result.trades[0].pnl)).toBe('-120.5');
  });

  it('wire 金額為 JSON number 時在邊界丟 TypeError(strict)', () => {
    expect(() => toBacktestRunRecord({ ...runWire, initialCapital: 100000 as unknown as string })).toThrow(TypeError);
    expect(() => toBacktestRunRecord({ ...runWire, progress: 1 as unknown as string })).toThrow(TypeError);
    expect(() => toBacktestResult({
      ...resultWire,
      kpis: { ...resultWire.kpis, sharpe: 1.2 as unknown as string },
    })).toThrow(TypeError);
    expect(() => toBacktestResult({
      ...resultWire,
      equityCurve: [{ t: '2026-01-01', strategy: 100000 as unknown as string, benchmark: '1' }],
    })).toThrow(TypeError);
    expect(() => toBacktestResult({
      ...resultWire,
      trades: [{ ...resultWire.trades[0], pnl: 12 as unknown as string }],
    })).toThrow(TypeError);
  });

  it('mock createRun:initialCapital <= 0 仍回既有 field error', async () => {
    const api = createMockBacktestApi();
    for (const capital of ['0', '-1', '0E-8']) {
      await expect(api.createRun({ ...request, initialCapital: parseDecimal(capital) })).rejects.toMatchObject({
        status: 400,
        code: 'BACKTEST_INVALID_INITIAL_CAPITAL',
        field: 'initialCapital',
      });
    }
  });

  it('mock 結果為 domain Decimal;權益曲線以 Decimal 初始資金計算,不經 number 失真', async () => {
    const api = createMockBacktestApi();
    const run = await api.createRun({ ...request, initialCapital: parseDecimal('123456789012.12345678') });
    const result = await api.getResult(run.id);

    expect(toWire(run.initialCapital)).toBe('123456789012.12345678');
    expect(run.progress && toWire(run.progress)).toBe('1');
    expect(isDecimal(result.kpis.totalReturnPct)).toBe(true);
    expect(typeof result.kpis.tradeCount).toBe('number');
    expect(typeof result.trades[0].bars).toBe('number');
    const totalReturnPct = result.kpis.totalReturnPct;
    // 第一點係數 = 1 + totalReturnPct / 1200(totalReturnPct 為整數,mock 公式);以 Decimal 重算對照。
    const factor = parseDecimal('1').plus(totalReturnPct.div(parseDecimal('1200')));
    const expected = parseDecimal('123456789012.12345678').times(factor.round(15)).round(8);
    expect(result.equityCurve[0].strategy.minus(expected).abs().lt(parseDecimal('0.001'))).toBe(true);
    // 精度:結果仍保有 8 位小數,沒被 number(約 15–17 位有效數字)截斷成整數尾巴
    expect(toWire(result.equityCurve[0].strategy).split('.')[1]?.length ?? 0).toBeGreaterThan(2);
  });
});
