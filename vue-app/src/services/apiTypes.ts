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
  /** Phase 04.1:基準幣 ISO 代碼(預設 `TWD`);本 DTO 所有金額欄位(除 cashBalances)皆為此幣別。 */
  baseCurrency: string;
  /** Phase 04.1:因缺匯率而未納入基準幣總額的持倉數。 */
  fxExcludedCount: number;
  /** Phase 04.1:缺匯率的原幣代碼清單(`fxExcludedCount` > 0 時才有值)。 */
  unconvertedCurrencies: string[];
  /** Phase 04.1:今日價差損益(基準幣);無前收盤可比時為 null。 */
  dayPricePnl: number | null;
  /** Phase 04.1:今日價差損益比值(非百分比,0.0104 = 1.04%);無可比基準時為 null。 */
  dayPricePnlRatio: number | null;
  /** Phase 04.1:因缺前收盤而未納入今日損益的持倉數。 */
  dayPnlExcludedCount: number;
  /** Phase 04.1:現金合計(基準幣);可為負(D-08,不得被夾成 0)。 */
  cash: number;
  /** Phase 04.1:總權益(基準幣)= 持倉市值 + 現金。 */
  totalEquity: number;
  /** Phase 04.1:各幣別現金餘額(原幣,非基準幣)。 */
  cashBalances: CashBalanceDto[];
  /** Phase 04.1:依資產類別的配置(基準幣金額 + 權重比值)。 */
  allocation: AllocationSliceDto[];
  /** Phase 04.1:依產業的配置(基準幣金額 + 權重比值)。 */
  sectorAllocation: SectorAllocationDto[];
}

/** 對應後端 CashBalanceDto:單一幣別的現金餘額(原幣,可為負)。 */
export interface CashBalanceDto {
  /** ISO 4217 代碼,宣告為 string:後端新增幣別不應讓前端型別檢查變紅。 */
  currency: string;
  amount: number;
}

/** 對應後端 AllocationSliceDto:資產類別配置的一塊。 */
export interface AllocationSliceDto {
  /** 資產類別(enum 型欄位宣告為 string,沿用 AssetDto 的既有裁決;RESEARCH Q10)。 */
  category: string;
  /** 基準幣金額 */
  value: number;
  /** 比值(非百分比):0.52 = 52%。顯示時 ×100 是格式化不是重算。 */
  weight: number;
}

/** 對應後端 SectorAllocationDto:產業配置的一塊。 */
export interface SectorAllocationDto {
  /** 產業名稱;資產沒有產業資料時為 null(畫面以「未分類」呈現)。 */
  sector: string | null;
  /** 基準幣金額 */
  value: number;
  /** 比值(非百分比),同 AllocationSliceDto.weight。 */
  weight: number;
  holdingCount: number;
  /** 該產業未實現損益(基準幣) */
  unrealizedPnl: number;
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
  /** Phase 04.1:持倉原幣 ISO 代碼(本列的 marketPrice / avgCost / marketValue 等皆為此幣別);缺值為 null,畫面不得猜測。 */
  currency: string | null;
  /** Phase 04.1:資產類別(宣告為 string,後端新增 enum 值不讓前端型別變紅)。 */
  assetType: string | null;
  /** Phase 04.1:產業;資產沒有產業資料時為 null。 */
  sector: string | null;
  /** Phase 04.1:基準幣 ISO 代碼,與 PortfolioSummaryDto.baseCurrency 同值。 */
  baseCurrency: string;
  /** Phase 04.1:市值換算為基準幣的金額;缺匯率時為 null(該列不計入 summary 總額)。 */
  marketValueInBase: number | null;
  /** Phase 04.1:前收盤價(原幣);無資料時為 null。 */
  previousClose: number | null;
  /** Phase 04.1:今日價差損益(原幣);無前收盤時為 null。 */
  dayPricePnl: number | null;
  /** Phase 04.1:今日價差損益比值(非百分比);無前收盤時為 null。 */
  dayPricePnlRatio: number | null;
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
  /**
   * 標的交易幣別(後端經 AssetFacade 取得的 ISO 4217 代碼,例 `TWD`)。
   * 後端舊版 / 快取舊形狀或 mock 沒有幣別資料時為 null —— 畫面不得猜測幣別。
   */
  currency: string | null;
  /** ISO-8601;顯示取日期部分 */
  executedAt: string;
  createdAt: string;
}

/**
 * 對應後端 stock-module-asset 的 `AssetDto`(`AssetDto.java:9-24`);逐欄同形,勿增刪(judgment §4)。
 *
 * 五個價格欄位宣告為 `number | null` 是刻意的:後端是 `BigDecimal`(非 primitive),
 * 沒有價格資料的 asset 會是 `null`。宣告成 `number` 會讓報價卡顯示 `NaN`
 * (`04-UI-SPEC.md` §2/§3 已規定 `null` 顯示 `—`)。
 *
 * `assetType` / `currency` 刻意宣告為 `string` 而非 union:後端是 `AssetType`
 * (`AssetType.java` = STOCK / CRYPTO / FX / BOND)與 `CurrencyCode`
 * (`CurrencyCode.java` = USD / TWD / EUR / JPY)兩個 enum,Jackson 以常數名序列化。
 * 常數名列在此處僅供查閱 —— **不**寫成 union,因為後端新增一個 enum 值就會讓前端
 * 型別檢查紅掉,而 adapter 只是原樣傳遞、不對這兩欄做分支。
 *
 * **注意 `AssetDto` 的 BigDecimal 沒有 `@JsonSerialize(ToStringSerializer)`,是 JSON number
 * —— 與 `KlineDto` 相反。**
 */
export interface AssetDto {
  uuid: string;
  symbol: string;
  name: string;
  /** 後端 AssetType enum 常數名:STOCK / CRYPTO / FX / BOND */
  assetType: string;
  market: string;
  /** 後端 CurrencyCode enum 常數名:USD / TWD / EUR / JPY */
  currency: string;
  sector: string;
  /** 只有 true 才可送出交易(D-01;後端 `TradingService.resolveTradeableAsset` 是最終權威) */
  tradeable: boolean;
  latestPrice: number | null;
  change: number | null;
  changePercent: number | null;
  /** 已格式化的成交量字串(例:`52.1M`),後端就是 String,前端不得重算 */
  volumeText: string;
  high: number | null;
  low: number | null;
}

/**
 * 對應後端 stock-module-market-data 的 `KlineDto`(`KlineDto.java:23-30`);逐欄同形,勿增刪(judgment §4)。
 *
 * `KlineDto.java` 的五個 BigDecimal 欄位掛 `@JsonSerialize(using = ToStringSerializer.class)`,
 * 序列化為 JSON 字串以避免浮點精度損失。**注意與 `AssetDto` 相反** —— `AssetDto` 的
 * BigDecimal 沒有這個註解,是 JSON number。
 *
 * 因此 OHLCV 五欄在 TypeScript 必須是 `string`;要當數字用一律經 `marketApi.ts` 的
 * `closeSeries()` 轉換,不要在元件內散落 `Number()`。
 */
export interface KlineDto {
  /** Java `Instant` → JSON ISO-8601 字串(UTC) */
  bucket: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/**
 * 對應後端 `KlineInterval`(`KlineInterval.java`)的 wire 字串白名單。
 *
 * 這五個值是 `MarketController.klines` 明確驗證的白名單(非法值回 400 `KLINE_INTERVAL_INVALID`),
 * 寫成 union 可讓錯誤在編譯期就被抓到,而非等到 runtime 吃 400。
 */
export type KlineInterval = '1m' | '5m' | '15m' | '1h' | '1d';

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
