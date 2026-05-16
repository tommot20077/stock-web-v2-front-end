# Stock V2 API Adapter Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed service modules and mock/API adapter boundaries for Backtest, Ops, and AI Access without rewiring the pages yet.

**Architecture:** Keep Vue pages on the current mock flow for now, but create stable service interfaces that can be swapped between local mock adapters and HTTP adapters. Put shared DTOs and common request/error parsing under `vue-app/src/services/`, then cover each adapter with focused Vitest tests.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, native `fetch`, existing Pinia mock data as seed references.

---

## Scope Check

This plan implements the adapter layer only. It does not rewrite `Backtest.vue`, `Ops.vue`, or `Settings.vue` to consume the adapters yet. That page wiring should be a follow-up plan after this layer is tested.

The current workspace is not a Git repository. Each task includes a checkpoint note instead of a required commit. If the directory is later initialized as Git, commit after each task with the suggested message.

## Source Contract

Use this document as the requirements source:

- `docs/api-contracts/mock-to-real-contract.md`

## File Structure

- Create `vue-app/src/services/apiTypes.ts`: shared API envelopes, pagination, error shapes, DTOs, service interfaces, and runtime mode type.
- Create `vue-app/src/services/runtimeDataMode.ts`: small helper that normalizes `VITE_DATA_MODE` into `mock` or `api`.
- Create `vue-app/src/services/apiClient.ts`: base HTTP helper, query-string builder, JSON parsing, envelope unwrapping, and typed `ApiClientError`.
- Create `vue-app/src/services/backtestApi.ts`: `BacktestApi` factory with mock and HTTP implementations.
- Create `vue-app/src/services/opsApi.ts`: `OpsApi` factory with mock and HTTP implementations.
- Create `vue-app/src/services/aiAccessApi.ts`: `AiAccessApi` factory with mock and HTTP implementations.
- Create `vue-app/src/services/*.test.ts`: focused tests for each module.

## Task 1: Shared API Types and Runtime Mode

**Files:**
- Create: `vue-app/src/services/apiTypes.ts`
- Create: `vue-app/src/services/runtimeDataMode.ts`
- Create: `vue-app/src/services/runtimeDataMode.test.ts`

- [ ] **Step 1: Write the failing runtime mode tests**

Create `vue-app/src/services/runtimeDataMode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRuntimeDataMode } from './runtimeDataMode';

describe('runtime data mode', () => {
  it('defaults to mock for empty or unknown values', () => {
    expect(normalizeRuntimeDataMode(undefined)).toBe('mock');
    expect(normalizeRuntimeDataMode('')).toBe('mock');
    expect(normalizeRuntimeDataMode('local')).toBe('mock');
  });

  it('accepts api and mock explicitly', () => {
    expect(normalizeRuntimeDataMode('api')).toBe('api');
    expect(normalizeRuntimeDataMode('mock')).toBe('mock');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd .\vue-app
npm test -- src/services/runtimeDataMode.test.ts
```

Expected: fail because `src/services/runtimeDataMode.ts` does not exist.

- [ ] **Step 3: Add shared API DTOs**

Create `vue-app/src/services/apiTypes.ts`:

```ts
export type RuntimeDataMode = 'mock' | 'api';

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ApiFailure {
  error: ApiErrorBody;
  requestId: string;
}

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: PageInfo;
  requestId: string;
}

export type BacktestStrategyId = 'ma_cross' | 'rsi' | 'momentum' | 'dca' | 'custom';
export type BacktestPeriod = '1Y' | '3Y' | '5Y';
export type BacktestRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'rejected';

export interface BacktestRunRequest {
  strategyId: BacktestStrategyId;
  strategyCode: string | null;
  symbol: string;
  period: BacktestPeriod;
  initialCapital: number;
  currency: 'USD';
  benchmark: 'buy_hold';
  dataMode: 'cached' | 'live';
}

export interface BacktestRunDto {
  id: string;
  strategyId: BacktestStrategyId;
  label: string;
  symbol: string;
  period: BacktestPeriod;
  initialCapital: number;
  currency: 'USD';
  status: BacktestRunStatus;
  progress?: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error?: ApiErrorBody | null;
}

export interface StrategyValidationRequest {
  strategyCode: string;
}

export interface StrategyValidationDto {
  valid: boolean;
  normalizedName: string;
  warnings: string[];
}

export interface BacktestKpisDto {
  totalReturnPct: number;
  buyHoldReturnPct: number;
  sharpe: number;
  cagrPct: number;
  maxDrawdownPct: number;
  drawdownDays: number;
  winRatePct: number;
  tradeCount: number;
  profitFactor: number;
  avgTradePct: number;
}

export interface EquityPointDto {
  t: string;
  strategy: number;
  benchmark: number;
}

export interface MonthlyReturnDto {
  year: number;
  month: number;
  returnPct: number;
}

export interface DrawdownPointDto {
  t: string;
  drawdownPct: number;
}

export interface BacktestTradeDto {
  date: string;
  side: 'BUY' | 'SELL';
  entry: number;
  exit: number;
  bars: number;
  pnl: number;
  pnlPct: number;
}

export interface BacktestResultDto {
  runId: string;
  status: 'succeeded';
  kpis: BacktestKpisDto;
  equityCurve: EquityPointDto[];
  monthlyReturns: MonthlyReturnDto[];
  drawdownCurve: DrawdownPointDto[];
  trades: BacktestTradeDto[];
}

export type OpsRisk = 'low' | 'medium' | 'high';
export type OpsJobStatus = 'running' | 'success' | 'failed' | 'cancelled';

export interface OpsActionDto {
  key: string;
  label: string;
  description: string;
  risk: OpsRisk;
  requiresConfirm: boolean;
  enabled: boolean;
}

export interface TriggerOpsJobRequest {
  actionKey: string;
  params: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface OpsJobDto {
  id: string;
  actionKey: string;
  label: string;
  status: OpsJobStatus;
  startedAt: string;
  completedAt: string | null;
  startedBy: string;
  message: string | null;
}

export interface OpsLogDto {
  id: string;
  time: string;
  actionKey: string;
  operation: string;
  actor: string;
  status: 'success' | 'failed' | 'cancelled';
  durationMs: number;
  message: string;
}

export type AiProviderKind = 'crypto' | 'stocks' | 'news' | 'fx';
export type AiKeyPermission = 'read' | 'trade';
export type AiKeyEnvironment = 'sandbox' | 'live';
export type AiKeyTestStatus = 'ok' | 'fail';
export type AiHitlMode = 'manual' | 'confirm' | 'auto';

export interface AiProviderDto {
  id: string;
  name: string;
  kind: AiProviderKind;
  rateLimitPerMinute: number;
  tradeable: boolean;
  supportsSandbox: boolean;
}

export interface AiTradingRiskLimitsDto {
  maxSingleUsd: number;
  maxDailyUsd: number;
  allowedSymbols: string[];
  expiresAt: string | null;
}

export interface AiAccessKeyDto {
  id: string;
  provider: string;
  environment: AiKeyEnvironment;
  permission: AiKeyPermission;
  label: string;
  maskedKey: string;
  lastTest: AiKeyTestStatus | null;
  lastUsedAt: string | null;
  hitl?: AiHitlMode;
  riskLimits?: AiTradingRiskLimitsDto;
}

export interface CreateAiAccessKeyRequest {
  provider: string;
  apiKey: string;
  apiSecret: string;
  environment: AiKeyEnvironment;
  permission: AiKeyPermission;
  label: string;
  hitl?: AiHitlMode;
  riskLimits?: AiTradingRiskLimitsDto;
}

export interface AiAccessKeyTestDto {
  keyId: string;
  status: AiKeyTestStatus;
  testedAt: string;
  latencyMs: number;
  message: string;
}

export interface UpdateAiTradingPolicyRequest {
  hitl: AiHitlMode;
  riskLimits: AiTradingRiskLimitsDto;
}

export type McpEndpointKind = 'read' | 'write' | 'admin';

export interface McpEndpointDto {
  id: string;
  kind: McpEndpointKind;
  label: string;
  url: string;
  tools: string[];
  enabled: boolean;
  editable: boolean;
}

export interface AiAgentDto {
  id: string;
  name: string;
  scopes: string[];
  status: 'live' | 'disabled';
  lastUsedAt: string | null;
}

export interface AiAuditCallDto {
  id: string;
  time: string;
  agent: string;
  tool: string;
  argsSummary: string;
  ok: boolean;
  durationMs: number;
  errorCode: string | null;
}
```

- [ ] **Step 4: Add runtime mode helper**

Create `vue-app/src/services/runtimeDataMode.ts`:

```ts
import type { RuntimeDataMode } from './apiTypes';

export function normalizeRuntimeDataMode(value: unknown): RuntimeDataMode {
  return value === 'api' ? 'api' : 'mock';
}

export function getRuntimeDataMode(): RuntimeDataMode {
  return normalizeRuntimeDataMode(import.meta.env.VITE_DATA_MODE);
}
```

- [ ] **Step 5: Run the focused test**

Run:

```powershell
npm test -- src/services/runtimeDataMode.test.ts
```

Expected: 1 test file passes.

Checkpoint: If this is in a Git repo, commit with `chore: add api adapter shared types`.

## Task 2: Shared API Client

**Files:**
- Create: `vue-app/src/services/apiClient.ts`
- Create: `vue-app/src/services/apiClient.test.ts`

- [ ] **Step 1: Write the failing API client tests**

Create `vue-app/src/services/apiClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest, buildQueryString } from './apiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('builds query strings without nullish values', () => {
    expect(buildQueryString({ symbol: 'AAPL', limit: 20, cursor: null, empty: undefined }))
      .toBe('?symbol=AAPL&limit=20');
  });

  it('unwraps success envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { ok: true },
      requestId: 'req_1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest<{ ok: boolean }>('/api/v1/example')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/v1/example', expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/json' }),
    }));
  });

  it('throws typed errors for API error envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
      requestId: 'req_2',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    await expect(apiRequest('/api/v1/ops/jobs')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'OPS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'req_2',
    });
  });

  it('throws typed errors for non-json failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 502 })));

    await expect(apiRequest('/api/v1/example')).rejects.toBeInstanceOf(ApiClientError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/services/apiClient.test.ts
```

Expected: fail because `apiClient.ts` does not exist.

- [ ] **Step 3: Add the API client**

Create `vue-app/src/services/apiClient.ts`:

```ts
import type { ApiFailure, ApiSuccess } from './apiTypes';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    field?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.field = input.field;
    this.details = input.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

function isApiFailure(value: unknown): value is ApiFailure {
  return !!value
    && typeof value === 'object'
    && 'error' in value
    && typeof (value as ApiFailure).error?.code === 'string';
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return !!value && typeof value === 'object' && 'data' in value;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return response.json();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  const init: RequestInit = { ...options, headers };
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiFailure(payload)) {
      throw new ApiClientError({
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        requestId: payload.requestId,
        field: payload.error.field,
        details: payload.error.details,
      });
    }
    throw new ApiClientError({
      status: response.status,
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`,
      requestId: null,
    });
  }

  if (!isApiSuccess<T>(payload)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a data envelope',
      requestId: null,
    });
  }

  return payload.data;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- src/services/apiClient.test.ts
```

Expected: 1 test file passes.

Checkpoint: If this is in a Git repo, commit with `chore: add api client`.

## Task 3: Backtest API Adapter

**Files:**
- Create: `vue-app/src/services/backtestApi.ts`
- Create: `vue-app/src/services/backtestApi.test.ts`

- [ ] **Step 1: Write failing Backtest adapter tests**

Create `vue-app/src/services/backtestApi.test.ts`:

```ts
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
        return new Response(JSON.stringify({ data: { ...request, id: 'bt_1', label: 'MA Cross (20/50)', status: 'queued', createdAt: '2026-05-16T00:00:00Z', startedAt: null, completedAt: null }, requestId: 'req_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/backtests/runs/bt_1')) {
        return new Response(JSON.stringify({ data: { ...request, id: 'bt_1', label: 'MA Cross (20/50)', status: 'running', createdAt: '2026-05-16T00:00:00Z', startedAt: null, completedAt: null }, requestId: 'req_2' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: [], page: { nextCursor: null, hasMore: false }, requestId: 'req_3' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpBacktestApi('/api/v1');
    const run = await api.createRun(request);
    const loaded = await api.getRun('bt_1');
    const list = await api.listRuns({ limit: 5 });

    expect(run.id).toBe('bt_1');
    expect(loaded.status).toBe('running');
    expect(list.page.hasMore).toBe(false);
  });

  it('factory selects mock or http implementation', async () => {
    expect(createBacktestApi('mock').mode).toBe('mock');
    expect(createBacktestApi('api', '/api/v1').mode).toBe('api');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/services/backtestApi.test.ts
```

Expected: fail because `backtestApi.ts` does not exist.

- [ ] **Step 3: Add the Backtest adapter**

Create `vue-app/src/services/backtestApi.ts`:

```ts
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
import { ApiClientError, apiRequest, buildQueryString } from './apiClient';

export interface BacktestApi {
  mode: RuntimeDataMode;
  createRun(request: BacktestRunRequest): Promise<BacktestRunDto>;
  validateStrategy(request: StrategyValidationRequest): Promise<StrategyValidationDto>;
  getRun(runId: string): Promise<BacktestRunDto>;
  getResult(runId: string): Promise<BacktestResultDto>;
  listRuns(params?: { symbol?: string; limit?: number; cursor?: string | null }): Promise<PaginatedResponse<BacktestRunDto>>;
}

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

export function createMockBacktestApi(): BacktestApi {
  const runs: Array<BacktestRunDto & { seed: number }> = [];
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
        await this.validateStrategy({ strategyCode: request.strategyCode ?? '' });
      }
      seq += 1;
      const seed = seedFrom(request, seq);
      const now = new Date().toISOString();
      const run: BacktestRunDto & { seed: number } = {
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
      return run;
    },
    async validateStrategy(request) {
      try {
        const fn = new Function('"use strict"; ' + request.strategyCode + '; return strategy;')();
        if (typeof fn !== 'function') throw new Error('strategy() not defined');
        return { valid: true, normalizedName: 'strategy', warnings: [] };
      } catch (error: any) {
        throw new ApiClientError({
          status: 400,
          code: 'BACKTEST_STRATEGY_COMPILE_FAILED',
          message: error?.message ?? 'Strategy compile error',
          field: 'strategyCode',
        });
      }
    },
    async getRun(runId) {
      const run = runs.find(item => item.id === runId);
      if (!run) {
        throw new ApiClientError({ status: 404, code: 'BACKTEST_RUN_NOT_FOUND', message: 'Backtest run not found' });
      }
      return run;
    },
    async getResult(runId) {
      const run = runs.find(item => item.id === runId);
      if (!run) {
        throw new ApiClientError({ status: 404, code: 'BACKTEST_RUN_NOT_FOUND', message: 'Backtest run not found' });
      }
      return buildResult(run, run.seed);
    },
    async listRuns(params = {}) {
      const filtered = params.symbol ? runs.filter(run => run.symbol === params.symbol) : runs;
      const limit = params.limit ?? 20;
      return {
        data: filtered.slice(0, limit),
        page: { nextCursor: null, hasMore: filtered.length > limit },
        requestId: 'mock',
      };
    },
  };
}

export function createHttpBacktestApi(basePath = '/api/v1'): BacktestApi {
  return {
    mode: 'api',
    createRun: request => apiRequest(`${basePath}/backtests/runs`, { method: 'POST', body: request }),
    validateStrategy: request => apiRequest(`${basePath}/backtests/strategies/validate`, { method: 'POST', body: request }),
    getRun: runId => apiRequest(`${basePath}/backtests/runs/${encodeURIComponent(runId)}`),
    getResult: runId => apiRequest(`${basePath}/backtests/runs/${encodeURIComponent(runId)}/result`),
    listRuns: params => apiRequest(`${basePath}/backtests/runs${buildQueryString(params ?? {})}`),
  };
}

export function createBacktestApi(mode: RuntimeDataMode, basePath = '/api/v1'): BacktestApi {
  return mode === 'api' ? createHttpBacktestApi(basePath) : createMockBacktestApi();
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- src/services/backtestApi.test.ts
```

Expected: 1 test file passes.

Checkpoint: If this is in a Git repo, commit with `feat: add backtest api adapter`.

## Task 4: Ops API Adapter

**Files:**
- Create: `vue-app/src/services/opsApi.ts`
- Create: `vue-app/src/services/opsApi.test.ts`

- [ ] **Step 1: Write failing Ops adapter tests**

Create `vue-app/src/services/opsApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpOpsApi, createMockOpsApi, createOpsApi } from './opsApi';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('opsApi', () => {
  it('mock adapter exposes actions, current job, and logs', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const actions = await api.getActions();
    const runPromise = api.triggerJob({ actionKey: 'refetchNews', params: {}, idempotencyKey: 'k1' });
    const current = await api.getCurrentJob();

    expect(actions.some(action => action.key === 'refetchNews')).toBe(true);
    expect(current?.actionKey).toBe('refetchNews');

    await vi.advanceTimersByTimeAsync(650);
    const job = await runPromise;
    const logs = await api.listLogs({ limit: 10 });

    expect(job.status).toBe('success');
    expect(await api.getCurrentJob()).toBeNull();
    expect(logs.data[0]).toMatchObject({ actionKey: 'refetchNews', status: 'success' });
  });

  it('mock adapter rejects duplicate jobs while busy', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    void api.triggerJob({ actionKey: 'refetchNews', params: {} });

    await expect(api.triggerJob({ actionKey: 'recalcPos', params: {} })).rejects.toMatchObject({
      code: 'OPS_JOB_ALREADY_RUNNING',
    });
  });

  it('http adapter sends idempotency key header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        id: 'ops_1',
        actionKey: 'refetchNews',
        label: 'Refetch news',
        status: 'running',
        startedAt: '2026-05-16T00:00:00Z',
        completedAt: null,
        startedBy: 'admin',
        message: null,
      },
      requestId: 'req_1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');
    await api.triggerJob({ actionKey: 'refetchNews', params: {}, idempotencyKey: 'idem_1' });

    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/jobs', expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': 'idem_1' }),
    }));
  });

  it('factory selects mock or http implementation', () => {
    expect(createOpsApi('mock').mode).toBe('mock');
    expect(createOpsApi('api', '/api/v1').mode).toBe('api');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/services/opsApi.test.ts
```

Expected: fail because `opsApi.ts` does not exist.

- [ ] **Step 3: Add the Ops adapter**

Create `vue-app/src/services/opsApi.ts`:

```ts
import type { OpsActionDto, OpsJobDto, OpsLogDto, PaginatedResponse, RuntimeDataMode, TriggerOpsJobRequest } from './apiTypes';
import { ApiClientError, apiRequest, buildQueryString } from './apiClient';

export interface OpsApi {
  mode: RuntimeDataMode;
  getActions(): Promise<OpsActionDto[]>;
  triggerJob(request: TriggerOpsJobRequest): Promise<OpsJobDto>;
  getCurrentJob(): Promise<OpsJobDto | null>;
  getJob(jobId: string): Promise<OpsJobDto>;
  listLogs(params?: { limit?: number; cursor?: string | null }): Promise<PaginatedResponse<OpsLogDto>>;
}

const actions: OpsActionDto[] = [
  { key: 'refetchNews', label: 'Refetch news', description: 'Force-pull news from all sources', risk: 'low', requiresConfirm: true, enabled: true },
  { key: 'refetchMkt', label: 'Refetch market quotes', description: 'Re-pull all market quotes', risk: 'low', requiresConfirm: true, enabled: true },
  { key: 'recalcPos', label: 'Recalculate positions', description: 'Recompute holdings and cost basis', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'recalcRoi', label: 'Recalculate ROI and Sharpe', description: 'Recompute ROI, Sharpe, and drawdown', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'refetchBonds', label: 'Refetch government bonds', description: 'Pull yield curves', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'reimportKline', label: 'Reimport historical K lines', description: 'Re-ingest historical OHLCV', risk: 'high', requiresConfirm: true, enabled: true },
];

export function createMockOpsApi(): OpsApi {
  const logs: OpsLogDto[] = [];
  const jobs: OpsJobDto[] = [];
  let seq = 0;
  let currentJob: OpsJobDto | null = null;

  return {
    mode: 'mock',
    async getActions() {
      return actions.map(action => ({ ...action }));
    },
    async triggerJob(request) {
      if (currentJob) {
        throw new ApiClientError({ status: 409, code: 'OPS_JOB_ALREADY_RUNNING', message: 'An ops job is already running' });
      }
      const action = actions.find(item => item.key === request.actionKey);
      if (!action) {
        throw new ApiClientError({ status: 404, code: 'OPS_ACTION_NOT_FOUND', message: 'Ops action not found' });
      }
      seq += 1;
      const startedAt = new Date().toISOString();
      const job: OpsJobDto = {
        id: `ops${seq}`,
        actionKey: action.key,
        label: action.label,
        status: 'running',
        startedAt,
        completedAt: null,
        startedBy: 'admin',
        message: null,
      };
      currentJob = job;
      jobs.unshift(job);
      await new Promise(resolve => setTimeout(resolve, 650));
      job.status = action.key === 'refetchBonds' ? 'failed' : 'success';
      job.completedAt = new Date().toISOString();
      job.message = job.status === 'success' ? 'Completed' : 'Failed';
      logs.unshift({
        id: `log${seq}`,
        time: job.completedAt,
        actionKey: job.actionKey,
        operation: job.label,
        actor: job.startedBy,
        status: job.status === 'success' ? 'success' : 'failed',
        durationMs: job.status === 'success' ? 700 : 800,
        message: job.message,
      });
      if (currentJob?.id === job.id) currentJob = null;
      return job;
    },
    async getCurrentJob() {
      return currentJob ? { ...currentJob } : null;
    },
    async getJob(jobId) {
      const job = jobs.find(item => item.id === jobId);
      if (!job) throw new ApiClientError({ status: 404, code: 'OPS_JOB_NOT_FOUND', message: 'Ops job not found' });
      return { ...job };
    },
    async listLogs(params = {}) {
      const limit = params.limit ?? 30;
      return {
        data: logs.slice(0, limit),
        page: { nextCursor: null, hasMore: logs.length > limit },
        requestId: 'mock',
      };
    },
  };
}

export function createHttpOpsApi(basePath = '/api/v1'): OpsApi {
  return {
    mode: 'api',
    getActions: () => apiRequest(`${basePath}/ops/actions`),
    triggerJob: request => {
      const headers: Record<string, string> = {};
      if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;
      return apiRequest(`${basePath}/ops/jobs`, {
        method: 'POST',
        headers,
        body: { actionKey: request.actionKey, params: request.params },
      });
    },
    getCurrentJob: () => apiRequest(`${basePath}/ops/jobs/current`),
    getJob: jobId => apiRequest(`${basePath}/ops/jobs/${encodeURIComponent(jobId)}`),
    listLogs: params => apiRequest(`${basePath}/ops/logs${buildQueryString(params ?? {})}`),
  };
}

export function createOpsApi(mode: RuntimeDataMode, basePath = '/api/v1'): OpsApi {
  return mode === 'api' ? createHttpOpsApi(basePath) : createMockOpsApi();
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- src/services/opsApi.test.ts
```

Expected: 1 test file passes.

Checkpoint: If this is in a Git repo, commit with `feat: add ops api adapter`.

## Task 5: AI Access API Adapter

**Files:**
- Create: `vue-app/src/services/aiAccessApi.ts`
- Create: `vue-app/src/services/aiAccessApi.test.ts`

- [ ] **Step 1: Write failing AI Access adapter tests**

Create `vue-app/src/services/aiAccessApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiAccessApi, createHttpAiAccessApi, createMockAiAccessApi } from './aiAccessApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('aiAccessApi', () => {
  it('mock adapter manages keys without returning raw secrets', async () => {
    const api = createMockAiAccessApi();
    const created = await api.createKey({
      provider: 'binance',
      apiKey: 'DEMO-BINANCE-TRADE-KEY-1234',
      apiSecret: 'demo-secret-value',
      environment: 'sandbox',
      permission: 'trade',
      label: 'Paper',
      hitl: 'manual',
      riskLimits: { maxSingleUsd: 1000, maxDailyUsd: 5000, allowedSymbols: [], expiresAt: null },
    });
    const keys = await api.listKeys();

    expect(created.maskedKey).toContain('••');
    expect(JSON.stringify(keys)).not.toContain('demo-secret-value');
    expect(keys.some(key => key.id === created.id)).toBe(true);
  });

  it('mock adapter tests and revokes keys', async () => {
    const api = createMockAiAccessApi();
    const [first] = await api.listKeys();
    const tested = await api.testKey(first.id);

    expect(tested.keyId).toBe(first.id);
    expect(['ok', 'fail']).toContain(tested.status);

    await api.revokeKey(first.id);
    expect((await api.listKeys()).some(key => key.id === first.id)).toBe(false);
  });

  it('mock adapter rejects enabling non-editable admin endpoint', async () => {
    const api = createMockAiAccessApi();

    await expect(api.updateMcpEndpoint('admin', { enabled: true })).rejects.toMatchObject({
      code: 'AI_ACCESS_ENDPOINT_NOT_EDITABLE',
    });
  });

  it('http adapter calls expected endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/ai-access/providers')) {
        return new Response(JSON.stringify({ data: [], requestId: 'req_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: { revoked: true }, requestId: 'req_2' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpAiAccessApi('/api/v1');
    await api.listProviders();
    await api.revokeKey('key_1');

    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-access/providers', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-access/keys/key_1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('factory selects mock or http implementation', () => {
    expect(createAiAccessApi('mock').mode).toBe('mock');
    expect(createAiAccessApi('api', '/api/v1').mode).toBe('api');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/services/aiAccessApi.test.ts
```

Expected: fail because `aiAccessApi.ts` does not exist.

- [ ] **Step 3: Add the AI Access adapter**

Create `vue-app/src/services/aiAccessApi.ts`:

```ts
import type {
  AiAccessKeyDto,
  AiAccessKeyTestDto,
  AiAgentDto,
  AiAuditCallDto,
  AiProviderDto,
  CreateAiAccessKeyRequest,
  McpEndpointDto,
  PaginatedResponse,
  RuntimeDataMode,
  UpdateAiTradingPolicyRequest,
} from './apiTypes';
import { ApiClientError, apiRequest, buildQueryString } from './apiClient';

export interface AiAccessApi {
  mode: RuntimeDataMode;
  listProviders(): Promise<AiProviderDto[]>;
  listKeys(): Promise<AiAccessKeyDto[]>;
  createKey(request: CreateAiAccessKeyRequest): Promise<AiAccessKeyDto>;
  testKey(keyId: string): Promise<AiAccessKeyTestDto>;
  updatePolicy(keyId: string, request: UpdateAiTradingPolicyRequest): Promise<AiAccessKeyDto>;
  revokeKey(keyId: string): Promise<{ revoked: boolean }>;
  listMcpEndpoints(): Promise<McpEndpointDto[]>;
  updateMcpEndpoint(endpointId: string, request: { enabled: boolean }): Promise<McpEndpointDto>;
  listAgents(): Promise<AiAgentDto[]>;
  revokeAgent(agentId: string): Promise<{ revoked: boolean }>;
  listAuditCalls(params?: { limit?: number; cursor?: string | null }): Promise<PaginatedResponse<AiAuditCallDto>>;
}

const providers: AiProviderDto[] = [
  { id: 'binance', name: 'Binance', kind: 'crypto', rateLimitPerMinute: 1200, tradeable: true, supportsSandbox: true },
  { id: 'coinbase', name: 'Coinbase', kind: 'crypto', rateLimitPerMinute: 600, tradeable: true, supportsSandbox: true },
  { id: 'alpaca', name: 'Alpaca', kind: 'stocks', rateLimitPerMinute: 200, tradeable: true, supportsSandbox: true },
  { id: 'polygon', name: 'Polygon.io', kind: 'stocks', rateLimitPerMinute: 100, tradeable: false, supportsSandbox: false },
  { id: 'finnhub', name: 'Finnhub', kind: 'news', rateLimitPerMinute: 60, tradeable: false, supportsSandbox: false },
];

function maskKey(key: string): string {
  if (key.length <= 10) return '••••••';
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

function deterministicKeyStatus(id: string): 'ok' | 'fail' {
  const sum = id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return sum % 5 === 0 ? 'fail' : 'ok';
}

export function createMockAiAccessApi(): AiAccessApi {
  let keySeq = 10;
  let agentSeq = 10;
  const keys: AiAccessKeyDto[] = [
    {
      id: 'key_1',
      provider: 'binance',
      environment: 'live',
      permission: 'trade',
      label: 'Main account',
      maskedKey: maskKey('DEMO-BINANCE-LIVE-KEY-0001'),
      lastTest: 'ok',
      lastUsedAt: '2026-05-16T01:00:00Z',
      hitl: 'confirm',
      riskLimits: { maxSingleUsd: 5000, maxDailyUsd: 25000, allowedSymbols: ['BTC', 'ETH', 'SOL', 'BNB'], expiresAt: '2026-12-31T00:00:00Z' },
    },
    {
      id: 'key_2',
      provider: 'finnhub',
      environment: 'live',
      permission: 'read',
      label: '',
      maskedKey: maskKey('DEMO-FINNHUB-READ-KEY-0003'),
      lastTest: null,
      lastUsedAt: null,
    },
  ];
  const endpoints: McpEndpointDto[] = [
    { id: 'readonly', kind: 'read', label: 'Readonly Server', url: 'https://mcp.resource.app/v1/readonly', tools: ['markets.get_quote', 'markets.list', 'positions.list', 'news.recent'], enabled: true, editable: true },
    { id: 'trading', kind: 'write', label: 'Trading Server', url: 'https://mcp.resource.app/v1/trading', tools: ['orders.place', 'orders.cancel', 'orders.modify', 'orders.list'], enabled: false, editable: true },
    { id: 'admin', kind: 'admin', label: 'Admin Server', url: 'https://mcp.resource.app/v1/admin', tools: ['settings.update', 'keys.create', 'keys.revoke'], enabled: false, editable: false },
  ];
  const agents: AiAgentDto[] = [
    { id: 'agent_1', name: 'Claude Desktop', scopes: ['readonly'], status: 'live', lastUsedAt: '2026-05-16T01:35:00Z' },
    { id: 'agent_2', name: 'Cursor', scopes: ['readonly'], status: 'live', lastUsedAt: '2026-05-16T00:15:00Z' },
  ];
  const calls: AiAuditCallDto[] = [
    { id: 'call_1', time: '2026-05-16T01:35:00Z', agent: 'Claude Desktop', tool: 'markets.get_quote', argsSummary: 'symbol=AAPL', ok: true, durationMs: 84, errorCode: null },
  ];

  return {
    mode: 'mock',
    async listProviders() {
      return providers.map(provider => ({ ...provider }));
    },
    async listKeys() {
      return keys.map(key => ({ ...key, riskLimits: key.riskLimits ? { ...key.riskLimits, allowedSymbols: [...key.riskLimits.allowedSymbols] } : undefined }));
    },
    async createKey(request) {
      keySeq += 1;
      const key: AiAccessKeyDto = {
        id: `key_${keySeq}`,
        provider: request.provider,
        environment: request.environment,
        permission: request.permission,
        label: request.label,
        maskedKey: maskKey(request.apiKey),
        lastTest: null,
        lastUsedAt: null,
        hitl: request.permission === 'trade' ? request.hitl ?? 'manual' : undefined,
        riskLimits: request.permission === 'trade' ? request.riskLimits : undefined,
      };
      keys.unshift(key);
      return key;
    },
    async testKey(keyId) {
      const key = keys.find(item => item.id === keyId);
      if (!key) throw new ApiClientError({ status: 404, code: 'AI_ACCESS_KEY_NOT_FOUND', message: 'API key not found' });
      const status = deterministicKeyStatus(key.id + key.provider);
      key.lastTest = status;
      return { keyId, status, testedAt: new Date().toISOString(), latencyMs: 218, message: status === 'ok' ? 'Connected' : 'Connection failed' };
    },
    async updatePolicy(keyId, request) {
      const key = keys.find(item => item.id === keyId);
      if (!key) throw new ApiClientError({ status: 404, code: 'AI_ACCESS_KEY_NOT_FOUND', message: 'API key not found' });
      if (key.permission !== 'trade') throw new ApiClientError({ status: 400, code: 'AI_ACCESS_TRADING_POLICY_INVALID', message: 'Key is not trading-capable' });
      key.hitl = request.hitl;
      key.riskLimits = { ...request.riskLimits, allowedSymbols: [...request.riskLimits.allowedSymbols] };
      return key;
    },
    async revokeKey(keyId) {
      const idx = keys.findIndex(item => item.id === keyId);
      if (idx < 0) throw new ApiClientError({ status: 404, code: 'AI_ACCESS_KEY_NOT_FOUND', message: 'API key not found' });
      keys.splice(idx, 1);
      return { revoked: true };
    },
    async listMcpEndpoints() {
      return endpoints.map(endpoint => ({ ...endpoint, tools: [...endpoint.tools] }));
    },
    async updateMcpEndpoint(endpointId, request) {
      const endpoint = endpoints.find(item => item.id === endpointId);
      if (!endpoint) throw new ApiClientError({ status: 404, code: 'AI_ACCESS_ENDPOINT_NOT_FOUND', message: 'MCP endpoint not found' });
      if (!endpoint.editable) throw new ApiClientError({ status: 403, code: 'AI_ACCESS_ENDPOINT_NOT_EDITABLE', message: 'MCP endpoint is not editable' });
      endpoint.enabled = request.enabled;
      return { ...endpoint, tools: [...endpoint.tools] };
    },
    async listAgents() {
      return agents.map(agent => ({ ...agent, scopes: [...agent.scopes] }));
    },
    async revokeAgent(agentId) {
      const idx = agents.findIndex(agent => agent.id === agentId);
      if (idx < 0) throw new ApiClientError({ status: 404, code: 'AI_ACCESS_AGENT_NOT_FOUND', message: 'Agent not found' });
      agents.splice(idx, 1);
      agentSeq += 1;
      return { revoked: agentSeq > 0 };
    },
    async listAuditCalls(params = {}) {
      const limit = params.limit ?? 50;
      return {
        data: calls.slice(0, limit),
        page: { nextCursor: null, hasMore: calls.length > limit },
        requestId: 'mock',
      };
    },
  };
}

export function createHttpAiAccessApi(basePath = '/api/v1'): AiAccessApi {
  return {
    mode: 'api',
    listProviders: () => apiRequest(`${basePath}/ai-access/providers`),
    listKeys: () => apiRequest(`${basePath}/ai-access/keys`),
    createKey: request => apiRequest(`${basePath}/ai-access/keys`, { method: 'POST', body: request }),
    testKey: keyId => apiRequest(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}/test`, { method: 'POST' }),
    updatePolicy: (keyId, request) => apiRequest(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}/policy`, { method: 'PATCH', body: request }),
    revokeKey: keyId => apiRequest(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
    listMcpEndpoints: () => apiRequest(`${basePath}/ai-access/mcp-endpoints`),
    updateMcpEndpoint: (endpointId, request) => apiRequest(`${basePath}/ai-access/mcp-endpoints/${encodeURIComponent(endpointId)}`, { method: 'PATCH', body: request }),
    listAgents: () => apiRequest(`${basePath}/ai-access/agents`),
    revokeAgent: agentId => apiRequest(`${basePath}/ai-access/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' }),
    listAuditCalls: params => apiRequest(`${basePath}/ai-access/audit-calls${buildQueryString(params ?? {})}`),
  };
}

export function createAiAccessApi(mode: RuntimeDataMode, basePath = '/api/v1'): AiAccessApi {
  return mode === 'api' ? createHttpAiAccessApi(basePath) : createMockAiAccessApi();
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- src/services/aiAccessApi.test.ts
```

Expected: 1 test file passes.

Checkpoint: If this is in a Git repo, commit with `feat: add ai access api adapter`.

## Task 6: Full Verification and Handoff

**Files:**
- Modify only if previous tasks revealed small import/type mistakes.

- [ ] **Step 1: Run all service tests**

Run:

```powershell
npm test -- src/services
```

Expected: all service test files pass.

- [ ] **Step 2: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all existing and new Vitest files pass.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm run build
```

Expected: `vue-tsc --noEmit` and `vite build` pass.

- [ ] **Step 4: Confirm no pages were rewired yet**

Run:

```powershell
rg -n "createBacktestApi|createOpsApi|createAiAccessApi|apiRequest\\(" src/pages src/components
```

Expected: no matches. This plan creates the adapter boundary only; page wiring is intentionally left for the next implementation plan.

Checkpoint: If this is in a Git repo, commit with `test: verify api adapter boundary`.

## Plan Self-Review

Spec coverage:

- Common envelopes and runtime mode: Task 1 and Task 2.
- Backtest create/validate/get/list/result adapter: Task 3.
- Ops actions/jobs/current/logs adapter: Task 4.
- AI Access providers/keys/MCP/agents/audit adapter: Task 5.
- Tests and build verification: Task 6.

Placeholder scan:

- This plan contains no placeholder markers.
- Every code-changing task includes concrete file paths and code blocks.

Type consistency:

- `RuntimeDataMode` is defined in `apiTypes.ts` before adapter factories use it.
- DTO names in all adapters match `apiTypes.ts`.
- HTTP adapter methods use the endpoints from `docs/api-contracts/mock-to-real-contract.md`.

Out of scope:

- Rewiring `Backtest.vue`, `Ops.vue`, or `Settings.vue`.
- Removing preview labels.
- Adding backend calls beyond native `fetch` adapter methods.
