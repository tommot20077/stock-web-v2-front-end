import type { Decimal } from './decimal';

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
 *
 * 金額 / 比值欄位是後端 `BigDecimal` → JSON 字串(一般記號,Phase 5 D-05);進 domain 前經
 * `portfolioApi.toPortfolioSummary` 轉成 {@link PortfolioSummary}(Decimal)。整數計數欄位(`holdingCount`、
 * `fxExcludedCount`、`dayPnlExcludedCount`)仍是 JSON number。
 */
export interface PortfolioSummaryDto {
  totalMarketValue: string;
  totalCostBasis: string;
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  /** 比值(非百分比):0.0117 = 1.17%。顯示時 ×100,那是格式化不是重算(D-04)。 */
  roi: string;
  holdingCount: number;
  /** Phase 04.1:基準幣 ISO 代碼(預設 `TWD`);本 DTO 所有金額欄位(除 cashBalances)皆為此幣別。 */
  baseCurrency: string;
  /** Phase 04.1:因缺匯率而未納入基準幣總額的持倉數。 */
  fxExcludedCount: number;
  /** Phase 04.1:缺匯率的原幣代碼清單(`fxExcludedCount` > 0 時才有值)。 */
  unconvertedCurrencies: string[];
  /** Phase 04.1:今日價差損益(基準幣);無前收盤可比時為 null。 */
  dayPricePnl: string | null;
  /** Phase 04.1:今日價差損益比值(非百分比,0.0104 = 1.04%);無可比基準時為 null。 */
  dayPricePnlRatio: string | null;
  /** Phase 04.1:因缺前收盤而未納入今日損益的持倉數。 */
  dayPnlExcludedCount: number;
  /** Phase 04.1:現金合計(基準幣);可為負(D-08,不得被夾成 0)。 */
  cash: string;
  /** Phase 04.1:總權益(基準幣)= 持倉市值 + 現金。 */
  totalEquity: string;
  /** Phase 04.1:各幣別現金餘額(原幣,非基準幣)。 */
  cashBalances: CashBalanceDto[];
  /** Phase 04.1:依資產類別的配置(基準幣金額 + 權重比值)。 */
  allocation: AllocationSliceDto[];
  /** Phase 04.1:依產業的配置(基準幣金額 + 權重比值)。 */
  sectorAllocation: SectorAllocationDto[];
  /**
   * Phase 04.2(DIV-02):現金股利收入(基準幣)= Σ 實領淨額(沖銷反號)× 目前匯率;沒有股利時為 0。
   * 自 04.2 起 `totalPnl` = realizedPnl + unrealizedPnl + dividendIncome,`roi` 因此**含股利**(D-01)。
   */
  dividendIncome: string;
  /** Phase 04.2(DIV-02):預扣稅合計(基準幣);僅供顯示,**不**計入 `totalPnl`(`amount` 已是扣稅後實領)。 */
  dividendTaxWithheld: string;
}

/** Phase 04.2(PORT-13):`GET /api/v1/portfolio/activities` 的 `kind`。 */
export type PortfolioActivityKind = 'BUY' | 'SELL' | 'CASH_DIVIDEND' | 'STOCK_DIVIDEND' | 'SPLIT';

/**
 * Phase 04.2(PORT-13):對應後端 `PortfolioActivityDto`(交易 / 現金股利 / 股數調整三表 UNION ALL 的一列);
 * 逐欄同形,勿增刪欄位。不適用於該 kind 的欄位恆為 null(契約〈各 kind 欄位適用表〉)。
 * 沖銷列的數值欄位輸出**原值**(不反號),以 `reversalOfId != null` 判斷。
 */
export interface PortfolioActivityDto {
  /** 原紀錄 UUID(交易 / 股利 / 股數調整各自的 UUID)。 */
  id: string;
  /** 宣告為聯集:未知 kind 代表契約漂移,應在型別層就被看見(與 enum 型欄位宣告為 string 的慣例不同,本欄驅動列渲染分支)。 */
  kind: PortfolioActivityKind;
  symbol: string | null;
  currency: string | null;
  /** 交易成交時間 / 股利入帳時間 / 股數調整生效 instant。 */
  occurredAt: string;
  /** 僅股數調整:除權日 `yyyy-MM-dd`。 */
  effectiveDate: string | null;
  createdAt: string;
  /** 交易數量 / 配股股數 / 拆股 ΔQ(帶號);股利為 null。 */
  quantity: number | null;
  /** 僅交易。 */
  price: number | null;
  /** 僅交易。 */
  fee: number | null;
  /** 交易 = quantity × price;股利 = 實領總額;股數調整為 null。 */
  amount: number | null;
  /** 僅股利。 */
  withholdingTax: number | null;
  /** 僅拆股。 */
  ratioNew: number | null;
  ratioOld: number | null;
  note: string | null;
  /** 沖銷列指向的原列 UUID。 */
  reversalOfId: string | null;
  /** 原列的 `occurredAt`。 */
  reversalOfOccurredAt: string | null;
  /** 原列的 `effectiveDate`(僅股數調整)。 */
  reversalOfEffectiveDate: string | null;
  /** 此列是否已被沖銷(交易恆為 false)。 */
  reversed: boolean;
  /** 交易恆 false;股利 = 非沖銷列且未被沖銷;股數調整 = 同上且為該標的最晚一筆未沖銷調整。 */
  reversible: boolean;
}

/** 對應後端 CashBalanceDto:單一幣別的現金餘額(原幣,可為負)。 */
export interface CashBalanceDto {
  /** ISO 4217 代碼,宣告為 string:後端新增幣別不應讓前端型別檢查變紅。 */
  currency: string;
  /** BigDecimal → JSON 字串,一般記號(Phase 5 D-05)。 */
  amount: string;
}

/** 對應後端 AllocationSliceDto:資產類別配置的一塊。 */
export interface AllocationSliceDto {
  /** 資產類別(enum 型欄位宣告為 string,沿用 AssetDto 的既有裁決;RESEARCH Q10)。 */
  category: string;
  /** 基準幣金額;BigDecimal → JSON 字串,一般記號(Phase 5 D-05)。 */
  value: string;
  /** 比值(非百分比):0.52 = 52%。顯示時 ×100 是格式化不是重算。BigDecimal → JSON 字串(D-05)。 */
  weight: string;
}

/** 對應後端 SectorAllocationDto:產業配置的一塊。 */
export interface SectorAllocationDto {
  /** 產業名稱;資產沒有產業資料時為 null(畫面以「未分類」呈現)。 */
  sector: string | null;
  /** 基準幣金額;BigDecimal → JSON 字串,一般記號(Phase 5 D-05)。 */
  value: string;
  /** 比值(非百分比),同 AllocationSliceDto.weight;BigDecimal → JSON 字串(D-05)。 */
  weight: string;
  holdingCount: number;
  /** 該產業未實現損益(基準幣);BigDecimal → JSON 字串(D-05)。 */
  unrealizedPnl: string;
}

/**
 * wire DTO → domain 型別的共用 mapped type(Phase 5 D-08):把 `K` 列出的 wire 字串欄位換成 `Decimal`,
 * nullable 欄位維持 nullable(`string` → `Decimal`、`string | null` → `Decimal | null`),其餘欄位原樣保留。
 *
 * 用途:domain 型別一律由 wire DTO 派生,欄位清單只在這裡列一次;後端增刪欄位時 wire 與 domain 一起變,
 * 不會漂移。05-18 之後的 domain(持倉、交易、股利…)沿用同一個 helper。
 */
export type DecimalFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: null extends T[P] ? Decimal | null : Decimal;
};

/** domain:單一幣別現金餘額,`amount` 為 Decimal(由 `portfolioApi.toCashBalance` 產生)。 */
export type CashBalance = DecimalFields<CashBalanceDto, 'amount'>;

/** domain:資產類別配置的一塊,`value` / `weight` 為 Decimal。 */
export type AllocationSlice = DecimalFields<AllocationSliceDto, 'value' | 'weight'>;

/** domain:產業配置的一塊,`value` / `weight` / `unrealizedPnl` 為 Decimal;`holdingCount` 仍是 number。 */
export type SectorAllocation = DecimalFields<SectorAllocationDto, 'value' | 'weight' | 'unrealizedPnl'>;

/** {@link PortfolioSummaryDto} 中屬於 BigDecimal 的欄位(wire 為字串、domain 為 Decimal)。 */
type PortfolioSummaryDecimalKey =
  | 'totalMarketValue'
  | 'totalCostBasis'
  | 'realizedPnl'
  | 'unrealizedPnl'
  | 'totalPnl'
  | 'roi'
  | 'dayPricePnl'
  | 'dayPricePnlRatio'
  | 'cash'
  | 'totalEquity'
  | 'dividendIncome'
  | 'dividendTaxWithheld';

/**
 * domain:portfolio summary(由 `portfolioApi.toPortfolioSummary` 產生)。金額 / 比值為 Decimal,
 * 巢狀的現金餘額與配置也是 domain 型別;頁面只拿這個型別,不拿 wire DTO。
 */
export type PortfolioSummary = Omit<
  DecimalFields<PortfolioSummaryDto, PortfolioSummaryDecimalKey>,
  'cashBalances' | 'allocation' | 'sectorAllocation'
> & {
  cashBalances: CashBalance[];
  allocation: AllocationSlice[];
  sectorAllocation: SectorAllocation[];
};

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
  /**
   * quick-261107-1j4 E2:資產的交易市場代號(後端 `assets.market` 原值,與 `AssetDto.market` 同值域,例如 US / TW / JP /
   * DE / CRYPTO / FX);查無資產屬性或資產未設定市場時為 null。前端以 `marketDayRuleOf` 決定除權日的市場今天,null → UTC。
   */
  market: string | null;
  /** Phase 04.1:基準幣 ISO 代碼,與 PortfolioSummaryDto.baseCurrency 同值。 */
  baseCurrency: string;
  /** Phase 04.1:市值換算為基準幣的金額;缺匯率時為 null(該列不計入 summary 總額)。 */
  marketValueInBase: number | null;
  /**
   * quick-261106-fbs:未實現損益(unrealizedPnl,原幣)以目前匯率換算為基準幣的金額;缺匯率時為 null
   * (與 marketValueInBase 同條件),該列不進任何基準幣排行(例如 Positions 的 Top movers)。
   */
  unrealizedPnlInBase: number | null;
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
  /** 資產沒有產業資料時為 null(watchlist-contract〈WatchlistDto〉;FX / 債券 / 加密常見)。 */
  sector: string | null;
  /** 只有 true 才可送出交易(D-01;後端 `TradingService.resolveTradeableAsset` 是最終權威) */
  tradeable: boolean;
  latestPrice: number | null;
  change: number | null;
  changePercent: number | null;
  /** 已格式化的成交量字串(例:`52.1M`),後端就是 String,前端不得重算;無量為 null(trading-portfolio-contract〈標的報價欄位〉) */
  volumeText: string | null;
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
