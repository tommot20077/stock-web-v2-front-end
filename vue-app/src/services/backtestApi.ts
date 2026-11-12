import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import type {
  BacktestResult,
  BacktestResultDto,
  BacktestRunDto,
  BacktestRunInput,
  BacktestRunRecord,
  BacktestRunRequest,
  BacktestStrategyId,
  PaginatedResponse,
  RuntimeDataMode,
  StrategyValidationDto,
  StrategyValidationRequest,
} from './apiTypes';
import { numberToWire, parseDecimal, parseNullableDecimal, toWire, ZERO } from './decimal';

/**
 * 回測 domain 的唯一消費介面。金額 / 比率在 wire 上是十進位字串(Phase 5 D-05),介面只收發 domain 型別
 * (Decimal,D-08):`createRun` 收 Decimal 初始資金、由 adapter `toWire`;回應經 `toBacktestRunRecord` /
 * `toBacktestResult` 轉換。頁面與元件不碰 wire 字串。
 */
export interface BacktestApi {
  mode: RuntimeDataMode;
  createRun(input: BacktestRunInput): Promise<BacktestRunRecord>;
  validateStrategy(request: StrategyValidationRequest): Promise<StrategyValidationDto>;
  getRun(runId: string): Promise<BacktestRunRecord>;
  getResult(runId: string): Promise<BacktestResult>;
  listRuns(params?: { symbol?: string; page?: number; size?: number }): Promise<PaginatedResponse<BacktestRunRecord>>;
}

/**
 * domain 輸入 → wire request 的逐欄投影(http 與 mock 共用);`initialCapital` 經 `toWire`(一般記號)。
 * 逐欄投影而不是展開,避免呼叫端多帶的欄位被原樣送到後端(與 `cashApi.toCreateCashEntryRequest` 同理)。
 */
function toBacktestRunRequest(input: BacktestRunInput): BacktestRunRequest {
  return {
    strategyId: input.strategyId,
    strategyCode: input.strategyCode,
    symbol: input.symbol,
    period: input.period,
    initialCapital: toWire(input.initialCapital),
    currency: input.currency,
    benchmark: input.benchmark,
    dataMode: input.dataMode,
  };
}

/**
 * wire → domain:回測執行紀錄(http 與 mock 共用)。
 *
 * @throws TypeError `initialCapital` / `progress` 不是十進位字串時(例如後端仍回 JS number)—— 契約違反在邊界大聲失敗。
 */
export function toBacktestRunRecord(wire: BacktestRunDto): BacktestRunRecord {
  return {
    ...wire,
    initialCapital: parseDecimal(wire.initialCapital),
    progress: parseNullableDecimal(wire.progress),
  };
}

/**
 * wire → domain:回測結果(http 與 mock 共用)。int 欄位(`drawdownDays`、`tradeCount`、`bars`、`year`、`month`)
 * 原樣保留為 number,其餘 BigDecimal 欄轉 Decimal。
 *
 * @throws TypeError 任一 BigDecimal 欄位不是十進位字串時。
 */
export function toBacktestResult(wire: BacktestResultDto): BacktestResult {
  const { kpis } = wire;
  return {
    runId: wire.runId,
    status: wire.status,
    kpis: {
      totalReturnPct: parseDecimal(kpis.totalReturnPct),
      buyHoldReturnPct: parseDecimal(kpis.buyHoldReturnPct),
      sharpe: parseDecimal(kpis.sharpe),
      cagrPct: parseDecimal(kpis.cagrPct),
      maxDrawdownPct: parseDecimal(kpis.maxDrawdownPct),
      drawdownDays: kpis.drawdownDays,
      winRatePct: parseDecimal(kpis.winRatePct),
      tradeCount: kpis.tradeCount,
      profitFactor: parseDecimal(kpis.profitFactor),
      avgTradePct: parseDecimal(kpis.avgTradePct),
    },
    equityCurve: wire.equityCurve.map(point => ({
      t: point.t,
      strategy: parseDecimal(point.strategy),
      benchmark: parseDecimal(point.benchmark),
    })),
    monthlyReturns: wire.monthlyReturns.map(row => ({
      year: row.year,
      month: row.month,
      returnPct: parseDecimal(row.returnPct),
    })),
    drawdownCurve: wire.drawdownCurve.map(point => ({
      t: point.t,
      drawdownPct: parseDecimal(point.drawdownPct),
    })),
    trades: wire.trades.map(trade => ({
      date: trade.date,
      side: trade.side,
      entry: parseDecimal(trade.entry),
      exit: parseDecimal(trade.exit),
      bars: trade.bars,
      pnl: parseDecimal(trade.pnl),
      pnlPct: parseDecimal(trade.pnlPct),
    })),
  };
}

type StoredBacktestRun = BacktestRunDto & { seed: number };

const labels: Record<BacktestStrategyId, string> = {
  ma_cross: 'MA Cross (20/50)',
  rsi: 'RSI Mean Reversion',
  momentum: 'Momentum (3M)',
  dca: 'DCA Weekly',
  custom: 'Custom JS',
};

function seedFrom(request: BacktestRunRequest, runNumber: number): number {
  return request.strategyId.charCodeAt(0)
    + request.symbol.charCodeAt(0)
    + request.period.charCodeAt(0)
    + runNumber * 37
    + (request.strategyCode?.length ?? 0);
}

function timestampFor(runNumber: number): string {
  return new Date(Date.UTC(2026, 4, 16, 0, runNumber, 0)).toISOString();
}

function toRunDto(run: StoredBacktestRun): BacktestRunDto {
  const { seed: _seed, ...dto } = run;
  return { ...dto, error: dto.error ? { ...dto.error } : dto.error };
}

/**
 * mock-only:number 計算結果 → wire 字串(scale 8、HALF_UP,與後端 NUMERIC(_, 8) 同形)。
 * 只在 mock adapter 內使用;http 路徑不經過 number。
 */
function mockWire(n: number): string {
  return toWire(parseDecimal(numberToWire(n)).round(8));
}

/**
 * mock 回測結果:先產出與後端相同的 wire 形狀(BigDecimal 欄為字串),再由呼叫端經 `toBacktestResult` 轉 domain。
 * 權益曲線以 Decimal 初始資金乘上 number 係數(係數經 `numberToWire`),初始資金本身不經 number。
 */
function buildResult(run: BacktestRunDto, seed: number): BacktestResultDto {
  const totalReturnPct = 30 + (seed * 7) % 60;
  const tradeCount = 30 + (seed * 19) % 80;
  const capital = parseDecimal(run.initialCapital);
  const equity = (factor: number) => toWire(capital.times(numberToWire(factor)).round(8));
  return {
    runId: run.id,
    status: 'succeeded',
    kpis: {
      totalReturnPct: mockWire(totalReturnPct),
      buyHoldReturnPct: mockWire(totalReturnPct * 0.6 + ((seed * 3) % 20)),
      sharpe: mockWire(0.8 + ((seed * 5) % 18) / 10),
      cagrPct: mockWire(totalReturnPct / 3),
      maxDrawdownPct: mockWire(-(8 + (seed * 11) % 18)),
      drawdownDays: 30 + (seed * 13) % 90,
      winRatePct: mockWire(48 + (seed * 17) % 30),
      tradeCount,
      profitFactor: mockWire(1.1 + ((seed * 7) % 22) / 10),
      avgTradePct: mockWire(0.4 + ((seed * 11) % 30) / 10),
    },
    equityCurve: Array.from({ length: 12 }, (_, i) => ({
      t: `2026-${String(i + 1).padStart(2, '0')}-01`,
      strategy: equity(1 + (i + 1) * totalReturnPct / 1200),
      benchmark: equity(1 + (i + 1) * totalReturnPct / 1500),
    })),
    monthlyReturns: Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      returnPct: mockWire(Math.sin(seed + i) * 4),
    })),
    drawdownCurve: Array.from({ length: 12 }, (_, i) => ({
      t: `2026-${String(i + 1).padStart(2, '0')}-01`,
      drawdownPct: mockWire(-Math.abs(Math.sin(seed + i) * 10)),
    })),
    trades: Array.from({ length: 5 }, (_, i) => ({
      date: `2026-0${(i % 5) + 1}-12`,
      side: i % 2 === 0 ? 'BUY' : 'SELL',
      entry: mockWire(100 + i * 3),
      exit: mockWire(104 + i * 4),
      bars: 5 + i,
      pnl: mockWire(120 + i * 18),
      pnlPct: mockWire(1.2 + i / 10),
    })),
  };
}

function validateStrategyCode(request: StrategyValidationRequest): StrategyValidationDto {
  try {
    const fn = new Function(`"use strict"; ${request.strategyCode}; return strategy;`)();
    if (typeof fn !== 'function') throw new Error('strategy() not defined');
    return { valid: true, normalizedName: 'strategy', warnings: [] };
  } catch (error) {
    throw new ApiClientError({
      status: 400,
      code: 'BACKTEST_STRATEGY_COMPILE_FAILED',
      message: error instanceof Error ? error.message : 'Strategy compile error',
      field: 'strategyCode',
    });
  }
}

function findRun(runs: StoredBacktestRun[], runId: string): StoredBacktestRun {
  const run = runs.find(item => item.id === runId);
  if (!run) {
    throw new ApiClientError({
      status: 404,
      code: 'BACKTEST_RUN_NOT_FOUND',
      message: 'Backtest run not found',
    });
  }
  return run;
}

export function createMockBacktestApi(): BacktestApi {
  const runs: StoredBacktestRun[] = [];
  let seq = 0;

  return {
    mode: 'mock',
    async createRun(input) {
      // mock 先產出與 http 相同的 wire request,之後的驗證與儲存都只看 wire 形狀。
      const request = toBacktestRunRequest(input);
      if (parseDecimal(request.initialCapital).lte(ZERO)) {
        throw new ApiClientError({
          status: 400,
          code: 'BACKTEST_INVALID_INITIAL_CAPITAL',
          message: 'Initial capital must be greater than 0',
          field: 'initialCapital',
        });
      }
      if (request.strategyId === 'custom') {
        validateStrategyCode({ strategyCode: request.strategyCode ?? '' });
      }

      seq += 1;
      const seed = seedFrom(request, seq);
      const now = timestampFor(seq);
      const run: StoredBacktestRun = {
        id: `bt${seq}`,
        strategyId: request.strategyId,
        label: labels[request.strategyId],
        symbol: request.symbol,
        period: request.period,
        initialCapital: request.initialCapital,
        currency: request.currency,
        status: 'succeeded',
        progress: '1',
        createdAt: now,
        startedAt: now,
        completedAt: now,
        error: null,
        seed,
      };
      runs.unshift(run);
      return toBacktestRunRecord(toRunDto(run));
    },
    async validateStrategy(request) {
      return validateStrategyCode(request);
    },
    async getRun(runId) {
      return toBacktestRunRecord(toRunDto(findRun(runs, runId)));
    },
    async getResult(runId) {
      const run = findRun(runs, runId);
      return toBacktestResult(buildResult(toRunDto(run), run.seed));
    },
    async listRuns(params = {}) {
      const filtered = params.symbol ? runs.filter(run => run.symbol === params.symbol) : runs;
      const page = params.page ?? 0;
      const size = params.size ?? 20;
      return {
        items: filtered.slice(page * size, page * size + size).map(run => toBacktestRunRecord(toRunDto(run))),
        page,
        size,
        totalElements: filtered.length,
        totalPages: Math.ceil(filtered.length / size),
      };
    },
  };
}

export function createHttpBacktestApi(basePath = '/api/v1'): BacktestApi {
  return {
    mode: 'api',
    createRun: async input => toBacktestRunRecord(await apiRequest<BacktestRunDto>(`${basePath}/backtests/runs`, {
      method: 'POST',
      json: toBacktestRunRequest(input),
    })),
    validateStrategy: request => apiRequest(`${basePath}/backtests/strategies/validate`, { method: 'POST', json: request }),
    getRun: async runId => toBacktestRunRecord(
      await apiRequest<BacktestRunDto>(`${basePath}/backtests/runs/${encodeURIComponent(runId)}`),
    ),
    getResult: async runId => toBacktestResult(
      await apiRequest<BacktestResultDto>(`${basePath}/backtests/runs/${encodeURIComponent(runId)}/result`),
    ),
    listRuns: async params => {
      const page = await apiPaginatedRequest<BacktestRunDto>(
        `${basePath}/backtests/runs${buildQueryString({ symbol: params?.symbol, page: params?.page ?? 0, size: params?.size ?? 20 })}`,
      );
      return { ...page, items: page.items.map(toBacktestRunRecord) };
    },
  };
}

export function createBacktestApi(mode: RuntimeDataMode, basePath = '/api/v1'): BacktestApi {
  return mode === 'api' ? createHttpBacktestApi(basePath) : createMockBacktestApi();
}
