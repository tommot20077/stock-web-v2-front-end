export type RuntimeDataMode = 'mock' | 'api';

/** 對應後端 stock-common 的 ApiMeta(traceId + timestamp)。 */
export interface ApiMeta {
  traceId: string;
  timestamp?: string;
}

/** 對應後端 stock-common 的 ApiError;後端只送 code / message / fields。 */
export interface ApiErrorBody {
  code: string;
  message: string;
  /** 欄位級驗證錯誤;後端 ApiError.fields(Map<String,String>) */
  fields?: Record<string, string>;
}

/** 對應後端 ApiResponse<T> 的成功分支。 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
  meta: ApiMeta;
}

/** 對應後端 ApiResponse<T> 的失敗分支。 */
export interface ApiFailure {
  success: false;
  data: null;
  error: ApiErrorBody;
  meta: ApiMeta;
}

/** 對應後端 stock-common 的 PageResponse<T>;為 ApiResponse 信封中的 data 內容。 */
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * 對應後端 PortfolioSummaryResponse;逐欄同形,勿增刪欄位(信封/契約權威是後端,judgment §4)。
 */
export interface PortfolioSummaryDto {
  totalMarketValue: number;
  totalCostBasis: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  /** 比值(非百分比):0.0117 = 1.17%。顯示時 ×100,那是格式化不是重算(D-04)。 */
  roi: number;
  holdingCount: number;
}

/** 對應後端 HoldingResponse。 */
export interface HoldingDto {
  assetId: string;
  symbol: string;
  assetName: string;
  totalQuantity: number;
  avgCost: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** 比值(非百分比),同 PortfolioSummaryDto.roi。 */
  roi: number;
  /** ISO-8601;行情時間,D-03 要顯示。 */
  priceTime: string | null;
  lastUpdated: string | null;
}

/** 對應後端 TradeResponse。 */
export interface TradeDto {
  /** uuid;頁面用作 :key */
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  note: string | null;
  /** ISO-8601;顯示取日期部分 */
  executedAt: string;
  createdAt: string;
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
