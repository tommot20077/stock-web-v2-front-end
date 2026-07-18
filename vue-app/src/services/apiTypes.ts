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
  /** 舊草案信封欄位;真後端信封為 ApiResponse<T>(meta.traceId),此欄位選填、多數轉接不帶。見 judgment.md §4。 */
  requestId?: string;
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
