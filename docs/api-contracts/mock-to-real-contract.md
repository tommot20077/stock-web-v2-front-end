# Mock-to-Real API Contract

Date: 2026-05-16

## Purpose

This contract defines the first real API boundary for the current mock MVP. It covers the three preview-heavy areas that should move from local mock state to server-backed flows first:

- Backtest
- Ops
- AI Access

The goal is not to define the full backend product. The goal is to give the frontend a stable adapter boundary so the current Vue pages can switch from Pinia mock actions to real HTTP calls without a broad page rewrite.

## Current Mock References

- Backtest UI: `vue-app/src/pages/Backtest.vue`
- Ops UI: `vue-app/src/pages/Ops.vue`
- AI Access UI: `vue-app/src/pages/Settings.vue`
- Shared preview mock store: `vue-app/src/stores/mockPreview.ts`
- Current shared types: `vue-app/src/types.ts`

## Frontend Adapter Boundary

When replacing mocks, add service modules instead of calling `fetch` directly from pages:

- `src/services/apiClient.ts`: base URL, auth headers, request id, common error parsing.
- `src/services/backtestApi.ts`: backtest run creation, polling, result loading.
- `src/services/opsApi.ts`: action catalog, job trigger, current job, logs.
- `src/services/aiAccessApi.ts`: API keys, MCP endpoints, agents, audit calls.

Pages should keep local UI state such as expanded panels, selected tabs, and transient form input. Server state should live behind adapter calls and then be projected into Pinia stores or component state.

Recommended migration flag:

```ts
type RuntimeDataMode = 'mock' | 'api';
```

Keep mock mode available until backend parity is confirmed.

## Common API Conventions

> ⚠️ **權威更正(2026-07-18,分頁部分已於 2026-07-19 對齊)**:本節下方的 Success / Error 信封
> 仍是 **mock 早期草案**,**與真實後端不一致**。REST 信封權威是後端 `stock-common` 的 `ApiResponse<T>`
> (`{ success, data, error, meta.traceId }`);分頁端點回 `ApiResponse<PageResponse<T>>`,
> 其中 `data = { items, page, size, totalElements, totalPages }`,是 **page-number 分頁(非 cursor)**。
> **分頁已不再是 follow-up**:前端 `PaginatedResponse<T>` 已改為與後端 `PageResponse<T>` 同形,
> 三個 list API(`listRuns` / `listLogs` / `listAuditCalls`)一律收 `page`/`size`,
> 原本的 cursor anti-corruption adapter 已移除,前後端分頁契約現為 1:1。
> 完整裁決見 `stock-web-v2/ai-docs/judgment.md §4`;Success / Error 信封的全面對齊仍待後續 follow-up。

Base path:

```text
/api/v1
```

All timestamps are ISO-8601 UTC strings.

Success envelope:

```json
{
  "data": {},
  "requestId": "req_01HZX..."
}
```

Error envelope:

```json
{
  "error": {
    "code": "BACKTEST_STRATEGY_COMPILE_FAILED",
    "message": "Unexpected token ';'",
    "field": "strategyCode",
    "details": {}
  },
  "requestId": "req_01HZX..."
}
```

Pagination uses page-number pagination (query params `page` 起始 0 與 `size`),
回應為 `ApiResponse<PageResponse<T>>`:

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 0,
    "size": 20,
    "totalElements": 0,
    "totalPages": 0
  },
  "meta": { "traceId": "..." }
}
```

Auth requirements:

- Read-only market/backtest reads require normal authenticated user scope.
- Ops requires admin/operator scope.
- AI Access key management requires account admin scope.
- Trading-capable AI Access requires explicit trading scope and audit logging.

## Backtest Contract

### UI Needs

Current UI needs:

- Create a simulated or real backtest run.
- Show latest run metadata immediately.
- Poll or load run status.
- Render KPI cards, equity curve, monthly heatmap, drawdown, and trade log.
- Show inline custom strategy compile errors.
- Preserve the existing "Run" button workflow.

### State Machine

```text
draft -> submitting -> queued -> running -> succeeded
                         |          |
                         |          -> failed
                         -> rejected
```

Frontend behavior:

- `rejected`: validation/compile error; keep user on config/editor and show inline error.
- `queued` or `running`: disable duplicate run submit for the same form.
- `succeeded`: replace displayed result snapshot.
- `failed`: show error note; keep previous successful result visible.

### Create Run

```http
POST /api/v1/backtests/runs
```

Request:

```json
{
  "strategyId": "ma_cross",
  "strategyCode": null,
  "symbol": "AAPL",
  "period": "3Y",
  "initialCapital": 100000,
  "currency": "USD",
  "benchmark": "buy_hold",
  "dataMode": "cached"
}
```

Rules:

- `strategyId` is one of `ma_cross`, `rsi`, `momentum`, `dca`, `custom`.
- `strategyCode` is required only when `strategyId = custom`.
- `initialCapital` must be finite and greater than zero.
- `period` is initially one of `1Y`, `3Y`, `5Y`.

Response:

```json
{
  "data": {
    "id": "bt_01HZX...",
    "strategyId": "ma_cross",
    "label": "MA Cross (20/50)",
    "symbol": "AAPL",
    "period": "3Y",
    "initialCapital": 100000,
    "currency": "USD",
    "status": "queued",
    "createdAt": "2026-05-16T01:30:00Z",
    "startedAt": null,
    "completedAt": null
  },
  "requestId": "req_01HZX..."
}
```

### Validate Custom Strategy

```http
POST /api/v1/backtests/strategies/validate
```

Request:

```json
{
  "strategyCode": "function strategy({ bars, indicators, broker, i }) { return; }"
}
```

Success:

```json
{
  "data": {
    "valid": true,
    "normalizedName": "strategy",
    "warnings": []
  },
  "requestId": "req_01HZX..."
}
```

Compile failure:

```json
{
  "error": {
    "code": "BACKTEST_STRATEGY_COMPILE_FAILED",
    "message": "Unexpected token ';'",
    "field": "strategyCode",
    "details": {
      "line": 1,
      "column": 20
    }
  },
  "requestId": "req_01HZX..."
}
```

### Get Run

```http
GET /api/v1/backtests/runs/{runId}
```

Response:

```json
{
  "data": {
    "id": "bt_01HZX...",
    "status": "running",
    "progress": 0.62,
    "label": "MA Cross (20/50)",
    "symbol": "AAPL",
    "period": "3Y",
    "createdAt": "2026-05-16T01:30:00Z",
    "startedAt": "2026-05-16T01:30:02Z",
    "completedAt": null,
    "error": null
  },
  "requestId": "req_01HZX..."
}
```

### Get Result

```http
GET /api/v1/backtests/runs/{runId}/result
```

Response:

```json
{
  "data": {
    "runId": "bt_01HZX...",
    "status": "succeeded",
    "kpis": {
      "totalReturnPct": 42.5,
      "buyHoldReturnPct": 31.2,
      "sharpe": 1.42,
      "cagrPct": 14.1,
      "maxDrawdownPct": -12.8,
      "drawdownDays": 54,
      "winRatePct": 58,
      "tradeCount": 64,
      "profitFactor": 1.8,
      "avgTradePct": 0.74
    },
    "equityCurve": [
      { "t": "2024-01-01", "strategy": 100000, "benchmark": 100000 }
    ],
    "monthlyReturns": [
      { "year": 2026, "month": 1, "returnPct": 2.4 }
    ],
    "drawdownCurve": [
      { "t": "2024-01-01", "drawdownPct": 0 }
    ],
    "trades": [
      {
        "date": "2026-01-12",
        "side": "BUY",
        "entry": 182.1,
        "exit": 195.4,
        "bars": 12,
        "pnl": 420,
        "pnlPct": 2.2
      }
    ]
  },
  "requestId": "req_01HZX..."
}
```

### List Runs

```http
GET /api/v1/backtests/runs?symbol=AAPL&page=0&size=20
```

真後端為 **page-number** 分頁:query 用 `page`(起始 0,預設 0)/`size`(預設 20),
回 `ApiResponse<PageResponse<BacktestRunDto>>`(`data = { items, page, size, totalElements, totalPages }`)。
前端 `backtestApi.listRuns` 直接透過共用的 `apiPaginatedRequest` 消費此形狀,**無轉接層**。
見上方「Common API Conventions」與 `ai-docs/judgment.md §4`。

### Backtest Error Codes

- `BACKTEST_INVALID_INITIAL_CAPITAL`
- `BACKTEST_UNSUPPORTED_SYMBOL`
- `BACKTEST_UNSUPPORTED_PERIOD`
- `BACKTEST_MARKET_DATA_UNAVAILABLE`
- `BACKTEST_STRATEGY_COMPILE_FAILED`
- `BACKTEST_RUN_TIMEOUT`
- `BACKTEST_RUN_NOT_FOUND`

### FE Mapping

Current mock:

- `mockPreview.recordBacktestRun(...)`
- `Backtest.vue` computes KPI/result locally from seed.

Real adapter:

- `createRun()` replaces `recordBacktestRun`.
- `getRun()` drives running/progress status.
- `getResult()` replaces local computed mock result after success.
- Existing local result should remain visible while a new run is pending.

## Ops Contract

### UI Needs

Current UI needs:

- Show action catalog.
- Open confirm modal.
- Trigger one action.
- Show one current running operation.
- Append operation log row after completion.
- Disable duplicate actions while an operation is running.

### Action Catalog

```http
GET /api/v1/ops/actions
```

Response:

```json
{
  "data": [
    {
      "key": "refetchNews",
      "label": "Refetch news",
      "description": "Force-pull news from all sources",
      "risk": "low",
      "requiresConfirm": true,
      "enabled": true
    },
    {
      "key": "refetchBonds",
      "label": "Refetch government bonds",
      "description": "Pull yield curves",
      "risk": "medium",
      "requiresConfirm": true,
      "enabled": true
    }
  ],
  "requestId": "req_01HZX..."
}
```

### Trigger Job

```http
POST /api/v1/ops/jobs
```

Headers:

```text
Idempotency-Key: ops_20260516_refetchNews_01
```

Request:

```json
{
  "actionKey": "refetchNews",
  "params": {}
}
```

Response:

```json
{
  "data": {
    "id": "ops_01HZX...",
    "actionKey": "refetchNews",
    "label": "Refetch news",
    "status": "running",
    "startedAt": "2026-05-16T01:34:00Z",
    "completedAt": null,
    "startedBy": "admin",
    "message": null
  },
  "requestId": "req_01HZX..."
}
```

### Current Job

```http
GET /api/v1/ops/jobs/current
```

Response when busy:

```json
{
  "data": {
    "id": "ops_01HZX...",
    "actionKey": "refetchNews",
    "label": "Refetch news",
    "status": "running",
    "startedAt": "2026-05-16T01:34:00Z",
    "startedBy": "admin"
  },
  "requestId": "req_01HZX..."
}
```

Response when idle:

```json
{
  "data": null,
  "requestId": "req_01HZX..."
}
```

### Get Job

```http
GET /api/v1/ops/jobs/{jobId}
```

Status values:

- `running`
- `success`
- `failed`
- `cancelled`

### List Logs

```http
GET /api/v1/ops/logs?page=0&size=30
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "log_01HZX...",
        "time": "2026-05-16T01:34:01Z",
        "actionKey": "refetchNews",
        "operation": "Refetch news",
        "actor": "admin",
        "status": "success",
        "durationMs": 700,
        "message": "Completed"
      }
    ],
    "page": 0,
    "size": 30,
    "totalElements": 1,
    "totalPages": 1
  },
  "meta": { "traceId": "..." }
}
```

### Ops Error Codes

- `OPS_ACTION_NOT_FOUND`
- `OPS_ACTION_DISABLED`
- `OPS_JOB_ALREADY_RUNNING`
- `OPS_JOB_NOT_FOUND`
- `OPS_PERMISSION_DENIED`
- `OPS_JOB_FAILED`

### FE Mapping

Current mock:

- `mockPreview.runOpsAction(key, label)`
- `mockPreview.currentOpsRun`
- `mockPreview.opsLog`

Real adapter:

- `getActions()` replaces the local `acts` array.
- `triggerJob()` replaces `runOpsAction`.
- `getCurrentJob()` replaces `currentOpsRun`.
- `listLogs()` replaces `opsLog`.
- The UI should continue disabling action buttons while `currentJob != null`.

## AI Access Contract

### UI Needs

Current UI needs:

- List read-only and trading API keys.
- Add key, revoke key, test key connection.
- Display HITL mode and risk limits for trading keys.
- List MCP endpoints and enable/disable read/trading endpoints.
- Keep admin endpoint disabled unless explicitly supported later.
- List connected agents and recent tool calls.
- Show preview labeling until backend is real.

### Provider Catalog

```http
GET /api/v1/ai-access/providers
```

Response:

```json
{
  "data": [
    {
      "id": "binance",
      "name": "Binance",
      "kind": "crypto",
      "rateLimitPerMinute": 1200,
      "tradeable": true,
      "supportsSandbox": true
    },
    {
      "id": "finnhub",
      "name": "Finnhub",
      "kind": "news",
      "rateLimitPerMinute": 60,
      "tradeable": false,
      "supportsSandbox": false
    }
  ],
  "requestId": "req_01HZX..."
}
```

### List Keys

```http
GET /api/v1/ai-access/keys
```

Response:

```json
{
  "data": [
    {
      "id": "key_01HZX...",
      "provider": "binance",
      "environment": "live",
      "permission": "trade",
      "label": "Main account",
      "maskedKey": "EXAMPLE-••••••••••••-LIVE",
      "lastTest": "ok",
      "lastUsedAt": "2026-05-16T01:00:00Z",
      "hitl": "confirm",
      "riskLimits": {
        "maxSingleUsd": 5000,
        "maxDailyUsd": 25000,
        "allowedSymbols": ["BTC", "ETH", "SOL", "BNB"],
        "expiresAt": "2026-12-31T00:00:00Z"
      }
    }
  ],
  "requestId": "req_01HZX..."
}
```

The backend must never return raw API secrets after creation.

### Create Key

```http
POST /api/v1/ai-access/keys
```

Request:

```json
{
  "provider": "binance",
  "apiKey": "EXAMPLE-API-KEY",
  "apiSecret": "EXAMPLE-API-SECRET",
  "environment": "sandbox",
  "permission": "trade",
  "label": "Paper",
  "hitl": "manual",
  "riskLimits": {
    "maxSingleUsd": 1000,
    "maxDailyUsd": 5000,
    "allowedSymbols": [],
    "expiresAt": null
  }
}
```

Response:

```json
{
  "data": {
    "id": "key_01HZX...",
    "provider": "binance",
    "environment": "sandbox",
    "permission": "trade",
    "label": "Paper",
    "maskedKey": "EXAMPLE-••••••••••••",
    "lastTest": null,
    "hitl": "manual",
    "riskLimits": {
      "maxSingleUsd": 1000,
      "maxDailyUsd": 5000,
      "allowedSymbols": [],
      "expiresAt": null
    }
  },
  "requestId": "req_01HZX..."
}
```

### Test Key

```http
POST /api/v1/ai-access/keys/{keyId}/test
```

Response:

```json
{
  "data": {
    "keyId": "key_01HZX...",
    "status": "ok",
    "testedAt": "2026-05-16T01:40:00Z",
    "latencyMs": 218,
    "message": "Connected"
  },
  "requestId": "req_01HZX..."
}
```

Status values:

- `ok`
- `fail`

### Update Trading Policy

```http
PATCH /api/v1/ai-access/keys/{keyId}/policy
```

Request:

```json
{
  "hitl": "confirm",
  "riskLimits": {
    "maxSingleUsd": 5000,
    "maxDailyUsd": 25000,
    "allowedSymbols": ["BTC", "ETH", "SOL"],
    "expiresAt": "2026-12-31T00:00:00Z"
  }
}
```

### Revoke Key

```http
DELETE /api/v1/ai-access/keys/{keyId}
```

Response:

```json
{
  "data": {
    "revoked": true
  },
  "requestId": "req_01HZX..."
}
```

### MCP Endpoints

```http
GET /api/v1/ai-access/mcp-endpoints
```

Response:

```json
{
  "data": [
    {
      "id": "readonly",
      "kind": "read",
      "label": "Readonly Server",
      "url": "https://mcp.resource.app/v1/readonly",
      "tools": ["markets.get_quote", "markets.list", "positions.list", "news.recent"],
      "enabled": true,
      "editable": true
    },
    {
      "id": "trading",
      "kind": "write",
      "label": "Trading Server",
      "url": "https://mcp.resource.app/v1/trading",
      "tools": ["orders.place", "orders.cancel", "orders.modify", "orders.list"],
      "enabled": false,
      "editable": true
    },
    {
      "id": "admin",
      "kind": "admin",
      "label": "Admin Server",
      "url": "https://mcp.resource.app/v1/admin",
      "tools": ["settings.update", "keys.create", "keys.revoke"],
      "enabled": false,
      "editable": false
    }
  ],
  "requestId": "req_01HZX..."
}
```

```http
PATCH /api/v1/ai-access/mcp-endpoints/{endpointId}
```

Request:

```json
{
  "enabled": true
}
```

### Connected Agents

```http
GET /api/v1/ai-access/agents
```

Response:

```json
{
  "data": [
    {
      "id": "agent_01HZX...",
      "name": "Claude Desktop",
      "scopes": ["readonly"],
      "status": "live",
      "lastUsedAt": "2026-05-16T01:35:00Z"
    }
  ],
  "requestId": "req_01HZX..."
}
```

```http
DELETE /api/v1/ai-access/agents/{agentId}
```

Revokes the agent token/session.

### Recent Tool Calls

```http
GET /api/v1/ai-access/audit-calls?page=0&size=20
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "call_01HZX...",
        "time": "2026-05-16T01:35:00Z",
        "agent": "Claude Desktop",
        "tool": "markets.get_quote",
        "argsSummary": "symbol=AAPL",
        "ok": true,
        "durationMs": 84,
        "errorCode": null
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1
  },
  "meta": { "traceId": "..." }
}
```

### AI Access Error Codes

- `AI_ACCESS_PROVIDER_NOT_FOUND`
- `AI_ACCESS_KEY_INVALID`
- `AI_ACCESS_KEY_TEST_FAILED`
- `AI_ACCESS_KEY_NOT_FOUND`
- `AI_ACCESS_PERMISSION_DENIED`
- `AI_ACCESS_ENDPOINT_NOT_EDITABLE`
- `AI_ACCESS_AGENT_NOT_FOUND`
- `AI_ACCESS_TRADING_POLICY_INVALID`

### FE Mapping

Current mock:

- `Settings.vue` owns providers, keys, MCP endpoints, agents, and recent calls locally.
- `deterministicKeyTest()` simulates connection results.

Real adapter:

- `listProviders()` replaces local `PROVIDERS`.
- `listKeys()`, `createKey()`, `testKey()`, `updatePolicy()`, `revokeKey()` replace local key mutations.
- `listMcpEndpoints()` and `updateMcpEndpoint()` replace local MCP toggles.
- `listAgents()` and `revokeAgent()` replace local agent array.
- `listAuditCalls()` replaces local recent calls.

## Testing Expectations

Frontend tests should cover both mock and API adapter modes:

- Backtest: create run success, validation rejection, polling success, polling failure keeps previous result.
- Ops: trigger job, duplicate disabled while running, failed job produces log/error state.
- AI Access: create key masks secret, test key status updates, revoke removes key, admin endpoint cannot be enabled when `editable = false`.

Contract tests should validate:

- Error envelope shape.
- Status enum values.
- Required fields for each response.
- No raw API secret is returned from list/create responses.

## Migration Order

1. Add TypeScript DTOs and service modules while keeping mock mode.
2. Move Backtest from local computed result to `backtestApi` behind `RuntimeDataMode`.
3. Move Ops from `mockPreview.runOpsAction()` to `opsApi`.
4. Split AI Access local arrays into an `aiAccessApi` adapter and a small Pinia store.
5. Remove preview labels only after real backend endpoints and audit coverage exist.

## Open Decisions

These are intentionally kept as product/backend decisions, not frontend blockers:

- Whether backtest execution is synchronous for small runs or always queued.
- Whether custom strategy sandbox runs server-side only or can pre-validate in the browser.
- Whether Ops jobs can run concurrently by category or must be globally single-flight.
- Whether AI Access admin endpoint should ever be user-editable in this product.
