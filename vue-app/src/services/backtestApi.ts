import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import type {
  BacktestResultDto,
  BacktestRunDto,
  BacktestRunRequest,
  BacktestStrategyId,
  PaginatedResponse,
  RuntimeDataMode,
  StrategyValidationDto,
  StrategyValidationRequest,
} from './apiTypes';

export interface BacktestApi {
  mode: RuntimeDataMode;
  createRun(request: BacktestRunRequest): Promise<BacktestRunDto>;
  validateStrategy(request: StrategyValidationRequest): Promise<StrategyValidationDto>;
  getRun(runId: string): Promise<BacktestRunDto>;
  getResult(runId: string): Promise<BacktestResultDto>;
  listRuns(params?: { symbol?: string; page?: number; size?: number }): Promise<PaginatedResponse<BacktestRunDto>>;
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

function buildResult(run: BacktestRunDto, seed: number): BacktestResultDto {
  const totalReturnPct = 30 + (seed * 7) % 60;
  const tradeCount = 30 + (seed * 19) % 80;
  return {
    runId: run.id,
    status: 'succeeded',
    kpis: {
      totalReturnPct,
      buyHoldReturnPct: totalReturnPct * 0.6 + ((seed * 3) % 20),
      sharpe: 0.8 + ((seed * 5) % 18) / 10,
      cagrPct: totalReturnPct / 3,
      maxDrawdownPct: -(8 + (seed * 11) % 18),
      drawdownDays: 30 + (seed * 13) % 90,
      winRatePct: 48 + (seed * 17) % 30,
      tradeCount,
      profitFactor: 1.1 + ((seed * 7) % 22) / 10,
      avgTradePct: 0.4 + ((seed * 11) % 30) / 10,
    },
    equityCurve: Array.from({ length: 12 }, (_, i) => ({
      t: `2026-${String(i + 1).padStart(2, '0')}-01`,
      strategy: run.initialCapital * (1 + (i + 1) * totalReturnPct / 1200),
      benchmark: run.initialCapital * (1 + (i + 1) * totalReturnPct / 1500),
    })),
    monthlyReturns: Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      returnPct: Math.sin(seed + i) * 4,
    })),
    drawdownCurve: Array.from({ length: 12 }, (_, i) => ({
      t: `2026-${String(i + 1).padStart(2, '0')}-01`,
      drawdownPct: -Math.abs(Math.sin(seed + i) * 10),
    })),
    trades: Array.from({ length: 5 }, (_, i) => ({
      date: `2026-0${(i % 5) + 1}-12`,
      side: i % 2 === 0 ? 'BUY' : 'SELL',
      entry: 100 + i * 3,
      exit: 104 + i * 4,
      bars: 5 + i,
      pnl: 120 + i * 18,
      pnlPct: 1.2 + i / 10,
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
    async createRun(request) {
      if (!Number.isFinite(request.initialCapital) || request.initialCapital <= 0) {
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
        progress: 1,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        error: null,
        seed,
      };
      runs.unshift(run);
      return toRunDto(run);
    },
    async validateStrategy(request) {
      return validateStrategyCode(request);
    },
    async getRun(runId) {
      return toRunDto(findRun(runs, runId));
    },
    async getResult(runId) {
      const run = findRun(runs, runId);
      return buildResult(toRunDto(run), run.seed);
    },
    async listRuns(params = {}) {
      const filtered = params.symbol ? runs.filter(run => run.symbol === params.symbol) : runs;
      const page = params.page ?? 0;
      const size = params.size ?? 20;
      return {
        items: filtered.slice(page * size, page * size + size).map(toRunDto),
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
    createRun: request => apiRequest(`${basePath}/backtests/runs`, { method: 'POST', json: request }),
    validateStrategy: request => apiRequest(`${basePath}/backtests/strategies/validate`, { method: 'POST', json: request }),
    getRun: runId => apiRequest(`${basePath}/backtests/runs/${encodeURIComponent(runId)}`),
    getResult: runId => apiRequest(`${basePath}/backtests/runs/${encodeURIComponent(runId)}/result`),
    listRuns: params => apiPaginatedRequest<BacktestRunDto>(
      `${basePath}/backtests/runs${buildQueryString({ symbol: params?.symbol, page: params?.page ?? 0, size: params?.size ?? 20 })}`,
    ),
  };
}

export function createBacktestApi(mode: RuntimeDataMode, basePath = '/api/v1'): BacktestApi {
  return mode === 'api' ? createHttpBacktestApi(basePath) : createMockBacktestApi();
}
