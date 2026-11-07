# Mock-to-Real API Contract

Date: 2026-05-16

> **狀態(2026-11-06 文件掃描,以後端 `stock-web-v2` 程式核對):**
> - **Common API Conventions**:已與後端 `ApiResponse<T>` / `ApiMeta` / `ApiError` / `PageResponse<T>` 逐欄一致。
> - **Backtest**:端點與 DTO 對應後端 `BacktestController`(`/api/v1/backtests`,類別層 `@PreAuthorize("isAuthenticated()")`);請求規則與錯誤碼已依後端修正(見各節)。
> - **Ops / AI Access**:後端**目前沒有**對應的 controller、端點或 `ErrorCode`;這兩節仍是前端提案,前端頁面須維持 Preview / Simulated 標示(AGENTS.md 鐵律 6),實作前需先與後端定案。Yuan 2026-11-07 裁決(3C-5):兩節保留為提案,不在 v1.0;後端工作追蹤於後端 repo 根的 `.planning/todos/pending/2026-11-07-ops-and-ai-access-backend.md`(AI Access 另需獨立安全設計:金鑰範圍、交易權限、稽核)。
> - 本檔只涵蓋 Backtest / Ops / AI Access。Auth / CSRF 見後端 `ai-docs/browser-auth-contract.md`;交易、持倉、現金、股利、股數調整、活動列表見後端 `ai-docs/trading-portfolio-contract.md`;觀察清單見後端 `ai-docs/watchlist-contract.md`。衝突時一律以後端為準。

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

- `src/services/apiClient.ts`: base URL, `credentials: 'include'`(HttpOnly cookie,token 不進 JS)、unsafe method 的 `X-XSRF-TOKEN` header、`ApiResponse<T>` 信封解析(追蹤 id 讀 `meta.traceId`)、401 / 403 處理;是唯一的 transport 邊界。
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

> ✅ **本節已與真實後端對齊(信封 2026-07-19、分頁 2026-07-19)**。REST 信封的權威來源是後端
> `stock-common` 的 `ApiResponse<T>`:`{ success, data, error, meta }`,其中 `meta = { traceId, timestamp }`、
> `error = { code, message, fields }`。後端 **不送** `requestId`,也 **不送** `error.field`(單數)或 `error.details`;
> 前端追蹤 id 一律只從 `meta.traceId` 讀取。
> 分頁端點回 `ApiResponse<PageResponse<T>>`,其中 `data = { items, page, size, totalElements, totalPages }`,
> 是 **page-number 分頁(非 cursor)**;前端 `PaginatedResponse<T>` 與後端 `PageResponse<T>` 同形,
> 三個 list API(`listRuns` / `listLogs` / `listAuditCalls`)一律收 `page`/`size`,
> 原本的 cursor anti-corruption adapter 已移除,前後端分頁契約現為 1:1。
> 完整裁決見 `stock-web-v2/ai-docs/judgment.md §4`。

Base path:

```text
/api/v1
```

All timestamps are ISO-8601 UTC strings.

Success envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": { "traceId": "...", "timestamp": "2026-05-16T01:30:00Z" }
}
```

Error envelope(`error.fields` 為欄位級驗證錯誤,`Map<String, String>`,可省略):

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "BACKTEST_STRATEGY_COMPILE_FAILED",
    "message": "Unexpected token ';'",
    "fields": {
      "strategyCode": "Unexpected token ';' at line 1, column 20"
    }
  },
  "meta": { "traceId": "...", "timestamp": "2026-05-16T01:30:00Z" }
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
  "error": null,
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
- 後端目前只接受 `currency = "USD"`、`benchmark = "buy_hold"`(否則 400 `VALIDATION_FAILED`)與 `dataMode = "cached"`(否則 400 `BACKTEST_UNSUPPORTED_DATA_MODE`);`symbol` 必填、最長 32 字。
- 後端目前**同步執行**:`createRun` 回傳時 `status` 已為 `succeeded`(編譯失敗則 400 `BACKTEST_STRATEGY_COMPILE_FAILED`);`queued` / `running` 狀態保留給日後非同步化。

Response:

```json
{
  "success": true,
  "data": {
    "id": "bt_01HZX...",
    "strategyId": "ma_cross",
    "label": "MA Cross (20/50)",
    "symbol": "AAPL",
    "period": "3Y",
    "initialCapital": 100000,
    "currency": "USD",
    "status": "succeeded",
    "progress": 1,
    "createdAt": "2026-05-16T01:30:00Z",
    "startedAt": "2026-05-16T01:30:00Z",
    "completedAt": "2026-05-16T01:30:01Z",
    "error": null
  },
  "error": null,
  "meta": { "traceId": "..." }
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
  "success": true,
  "data": {
    "valid": true,
    "normalizedName": "strategy",
    "warnings": []
  },
  "error": null,
  "meta": { "traceId": "..." }
}
```

Compile failure:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "BACKTEST_STRATEGY_COMPILE_FAILED",
    "message": "Unexpected token ';'",
    "fields": {
      "strategyCode": "Unexpected token ';' at line 1, column 20"
    }
  },
  "meta": { "traceId": "..." }
}
```

### Get Run

```http
GET /api/v1/backtests/runs/{runId}
```

Response:

```json
{
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
}
```

### Get Result

```http
GET /api/v1/backtests/runs/{runId}/result
```

Response:

```json
{
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
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

後端 `ErrorCode` 現有的 backtest 錯誤碼(2026-11-06 核對):

- `BACKTEST_INVALID_INITIAL_CAPITAL`(400)
- `BACKTEST_UNSUPPORTED_SYMBOL`(400)
- `BACKTEST_UNSUPPORTED_PERIOD`(400)
- `BACKTEST_UNSUPPORTED_STRATEGY`(400)
- `BACKTEST_UNSUPPORTED_DATA_MODE`(400)
- `BACKTEST_STRATEGY_COMPILE_FAILED`(400)
- `BACKTEST_RUN_NOT_FOUND`(404;他人的 run 也回此碼)
- `BACKTEST_RESULT_NOT_READY`(409)

另外可能收到通用的 `VALIDATION_FAILED`(400,`currency` / `benchmark` 不符或 bean validation)。
草案曾列的 `BACKTEST_MARKET_DATA_UNAVAILABLE`、`BACKTEST_RUN_TIMEOUT` 後端**未定義**(前端測試中的 `BACKTEST_RUN_TIMEOUT` / `BACKTEST_PERMISSION_DENIED` 僅作為「任意錯誤碼可透傳」的 fixture)。

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

> ⚠️ **後端尚未實作(2026-11-06 核對)**:後端沒有 `/api/v1/ops/**` 端點,也沒有 `OPS_*` 錯誤碼。本節為前端提案;Ops 頁須維持 Preview / Simulated 標示。

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
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
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
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
}
```

### Current Job

```http
GET /api/v1/ops/jobs/current
```

Response when busy:

```json
{
  "success": true,
  "data": {
    "id": "ops_01HZX...",
    "actionKey": "refetchNews",
    "label": "Refetch news",
    "status": "running",
    "startedAt": "2026-05-16T01:34:00Z",
    "startedBy": "admin"
  },
  "error": null,
  "meta": { "traceId": "..." }
}
```

Response when idle:

```json
{
  "success": true,
  "data": null,
  "error": null,
  "meta": { "traceId": "..." }
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
  "error": null,
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

> ⚠️ **後端尚未實作(2026-11-06 核對)**:後端沒有 `/api/v1/ai-access/**` 端點,也沒有 `AI_ACCESS_*` 錯誤碼。本節為前端提案;AI Access 設定頁須維持 Preview / Simulated 標示。

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
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
}
```

### List Keys

```http
GET /api/v1/ai-access/keys
```

Response:

```json
{
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
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
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
}
```

### Test Key

```http
POST /api/v1/ai-access/keys/{keyId}/test
```

Response:

```json
{
  "success": true,
  "data": {
    "keyId": "key_01HZX...",
    "status": "ok",
    "testedAt": "2026-05-16T01:40:00Z",
    "latencyMs": 218,
    "message": "Connected"
  },
  "error": null,
  "meta": { "traceId": "..." }
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
  "success": true,
  "data": {
    "revoked": true
  },
  "error": null,
  "meta": { "traceId": "..." }
}
```

### MCP Endpoints

```http
GET /api/v1/ai-access/mcp-endpoints
```

Response:

```json
{
  "success": true,
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
  "error": null,
  "meta": { "traceId": "..." }
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
  "success": true,
  "data": [
    {
      "id": "agent_01HZX...",
      "name": "Claude Desktop",
      "scopes": ["readonly"],
      "status": "live",
      "lastUsedAt": "2026-05-16T01:35:00Z"
    }
  ],
  "error": null,
  "meta": { "traceId": "..." }
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
  "error": null,
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

- Whether backtest execution is synchronous for small runs or always queued.(目前後端一律同步執行,見 Create Run。)
- Whether custom strategy sandbox runs server-side only or can pre-validate in the browser.
- Whether Ops jobs can run concurrently by category or must be globally single-flight.
- Whether AI Access admin endpoint should ever be user-editable in this product.
