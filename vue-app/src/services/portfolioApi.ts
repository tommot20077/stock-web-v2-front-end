import { apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import { isMockHoldingEventTradeRow, listMockHoldingEvents } from './holdingEventApi';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import { numberToWire, parseDecimal, parseNullableDecimal } from './decimal';
import type {
  AllocationSlice,
  AllocationSliceDto,
  CashBalance,
  CashBalanceDto,
  Holding,
  HoldingDto,
  PaginatedResponse,
  PortfolioActivityDto,
  PortfolioSummary,
  PortfolioSummaryDto,
  RuntimeDataMode,
  SectorAllocation,
  SectorAllocationDto,
  TradeDto,
} from './apiTypes';
import type { Position, Trade } from '../types';

/** `GET /api/v1/trades` 的參數,與後端契約一一對應(白名單以外的值後端回 400)。 */
export interface TradeListParams {
  symbol?: string;
  type?: 'BUY' | 'SELL';
  /** ISO-8601 含 offset;半開區間起點 */
  dateFrom?: string;
  /** ISO-8601 含 offset;半開區間終點,不含 */
  dateTo?: string;
  sort?: 'executedAt' | 'total' | 'quantity';
  direction?: 'asc' | 'desc';
  /** 預設 0 */
  page?: number;
  /** 預設 20 */
  size?: number;
}

/**
 * `GET /api/v1/portfolio/activities` 的參數(PORT-13):參數名與 {@link TradeListParams} 相同,
 * 只有 `type` / `sort` 的白名單不同(後端 400 `fields.type` / `fields.sort`)。
 */
export type ActivityListParams = Omit<TradeListParams, 'type' | 'sort'> & {
  type?: 'BUY' | 'SELL' | 'DIVIDEND' | 'SHARE_ADJUSTMENT';
  sort?: 'executedAt' | 'createdAt' | 'total' | 'quantity';
};

/**
 * mock mode 專用的 reactive 資料視窗。
 * 三個屬性都是 getter,每次存取才解析 store —— 絕不在 factory 時捕捉陣列參照,
 * 否則整個陣列被替換(`portfolio.trades = [...]`)或測試換 pinia 後會讀到過期資料。
 */
export interface PortfolioLiveMockData {
  readonly trades: Trade[];
  readonly positions: Position[];
  readonly lastFill: { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null;
  /**
   * 04.2-21:本 session 由 mock holdingEventApi 記錄的股利 / 股數調整(活動列形狀,依建立順序,回傳 clone)。
   * Trades mock 模式以此與靜態交易列合併(UI-SPEC §Interaction 0)。**不是** reactive:事件狀態在 adapter 模組內,
   * 頁面於 `portfolioRevision` 變動時重讀。
   */
  readonly holdingEvents: PortfolioActivityDto[];
  /** 04.2-21:這列 mock 交易是否由 mock 股利寫入 —— 該筆已由 {@link holdingEvents} 代表,靜態列表需排除以免出現兩次。 */
  isHoldingEventTrade(trade: Trade): boolean;
}

/**
 * portfolio domain 的唯一消費介面。
 *
 * 頁面用法(judgment §3:元件永遠不 import mock store):
 * - mock mode:經 `live` 取得 reactive 資料(Pinia reactivity 完整保留,含 lastFill 高亮)。
 * - API mode:`live` 為 undefined,改走 Promise 方法拿快照 + 明確 refetch。
 * - 分支判斷依據是 `api.live` 是否存在,不是 mode 字串。
 */
export interface PortfolioApi {
  mode: RuntimeDataMode;
  /** portfolio summary 的 domain 形狀(金額為 Decimal);http 與 mock 都經 {@link toPortfolioSummary}。 */
  getSummary(): Promise<PortfolioSummary>;
  /** 持倉的 domain 形狀(股數 / 金額為 Decimal);http 與 mock 都經 {@link toHolding}。 */
  listHoldings(): Promise<Holding[]>;
  listTrades(params?: TradeListParams): Promise<PaginatedResponse<TradeDto>>;
  /** 交易、現金股利、股數調整的統一分頁列表(PORT-13);篩選與排序皆由後端處理。 */
  listActivities(params?: ActivityListParams): Promise<PaginatedResponse<PortfolioActivityDto>>;
  /** 僅 mock 實作提供(Q3 裁決)。 */
  live?: PortfolioLiveMockData;
}

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 20;

/**
 * mock 宇宙(data.ts)是美股報價,故 mock 持倉幣別與基準幣皆為 USD —— 與 mock 畫面的 `$` 呈現一致。
 * mock 畫面不讀這些欄位(mock tbody / KPI 逐字不變);它們只為了讓 mock `PortfolioApi`
 * 與 API mode 同形、型別檢查通過。
 */
const MOCK_CURRENCY = 'USD';

/** wire → domain:單一幣別現金餘額(Phase 5 D-08;http 與 mock 共用)。 */
export function toCashBalance(wire: CashBalanceDto): CashBalance {
  return { ...wire, amount: parseDecimal(wire.amount) };
}

/** wire → domain:資產類別配置的一塊。 */
export function toAllocationSlice(wire: AllocationSliceDto): AllocationSlice {
  return { ...wire, value: parseDecimal(wire.value), weight: parseDecimal(wire.weight) };
}

/** wire → domain:產業配置的一塊(`holdingCount` 仍是 number)。 */
export function toSectorAllocation(wire: SectorAllocationDto): SectorAllocation {
  return {
    ...wire,
    value: parseDecimal(wire.value),
    weight: parseDecimal(wire.weight),
    unrealizedPnl: parseDecimal(wire.unrealizedPnl),
  };
}

/**
 * wire → domain 的唯一 summary mapper(http 與 mock adapter 共用,Phase 5 D-08)。
 * 金額 / 比值欄位若仍是 JSON number,`parseDecimal` 會在這裡丟 TypeError(契約違反在邊界大聲失敗)。
 */
export function toPortfolioSummary(wire: PortfolioSummaryDto): PortfolioSummary {
  return {
    ...wire,
    totalMarketValue: parseDecimal(wire.totalMarketValue),
    totalCostBasis: parseDecimal(wire.totalCostBasis),
    realizedPnl: parseDecimal(wire.realizedPnl),
    unrealizedPnl: parseDecimal(wire.unrealizedPnl),
    totalPnl: parseDecimal(wire.totalPnl),
    roi: parseDecimal(wire.roi),
    dayPricePnl: parseNullableDecimal(wire.dayPricePnl),
    dayPricePnlRatio: parseNullableDecimal(wire.dayPricePnlRatio),
    cash: parseDecimal(wire.cash),
    totalEquity: parseDecimal(wire.totalEquity),
    dividendIncome: parseDecimal(wire.dividendIncome),
    dividendTaxWithheld: parseDecimal(wire.dividendTaxWithheld),
    // 舊形狀 / 快取的 summary 可能缺少 Phase 04.1 的清單欄位:視為空清單(頁面原本的容錯行為移到邊界)。
    unconvertedCurrencies: [...(wire.unconvertedCurrencies ?? [])],
    cashBalances: (wire.cashBalances ?? []).map(toCashBalance),
    allocation: (wire.allocation ?? []).map(toAllocationSlice),
    sectorAllocation: (wire.sectorAllocation ?? []).map(toSectorAllocation),
  };
}

/**
 * wire → domain 的唯一持倉 mapper(http 與 mock adapter 共用,Phase 5 D-08)。
 * 必填金額欄位若仍是 JSON number(或缺漏),`parseDecimal` 在這裡丟 TypeError;nullable 欄位缺漏(舊形狀 / 快取)
 * 視為 null,畫面依既有 null 分支顯示 `—`。
 */
export function toHolding(wire: HoldingDto): Holding {
  return {
    ...wire,
    totalQuantity: parseDecimal(wire.totalQuantity),
    avgCost: parseDecimal(wire.avgCost),
    costBasis: parseDecimal(wire.costBasis),
    marketPrice: parseDecimal(wire.marketPrice),
    marketValue: parseDecimal(wire.marketValue),
    realizedPnl: parseDecimal(wire.realizedPnl),
    unrealizedPnl: parseDecimal(wire.unrealizedPnl),
    roi: parseDecimal(wire.roi),
    marketValueInBase: parseNullableDecimal(wire.marketValueInBase),
    unrealizedPnlInBase: parseNullableDecimal(wire.unrealizedPnlInBase),
    previousClose: parseNullableDecimal(wire.previousClose),
    dayPricePnl: parseNullableDecimal(wire.dayPricePnl),
    dayPricePnlRatio: parseNullableDecimal(wire.dayPricePnlRatio),
    dayPnlBasis: parseNullableDecimal(wire.dayPnlBasis),
  };
}

/** mock 內部計算用(number);組 wire DTO 時才經 `numberToWire` 轉字串。 */
interface MockSectorSlice {
  sector: string;
  value: number;
  weight: number;
  holdingCount: number;
  unrealizedPnl: number;
}

/**
 * 依產業分組,value 降冪(同值以產業名稱穩定排序,不含亂數);權重加總為 1。
 * mock 宇宙的靜態資料是 number,計算後投影成 wire 字串,再與 http 走同一個 mapper。
 */
function sectorAllocationFrom(positions: Position[], totalMarketValue: number): SectorAllocationDto[] {
  const bySector = new Map<string, MockSectorSlice>();
  for (const position of positions) {
    const value = position.qty * position.price;
    const unrealizedPnl = value - position.qty * position.avg;
    const slice = bySector.get(position.sector);
    if (slice) {
      slice.value += value;
      slice.holdingCount += 1;
      slice.unrealizedPnl += unrealizedPnl;
    } else {
      bySector.set(position.sector, { sector: position.sector, value, weight: 0, holdingCount: 1, unrealizedPnl });
    }
  }
  const slices = [...bySector.values()];
  for (const slice of slices) {
    slice.weight = totalMarketValue === 0 ? 0 : slice.value / totalMarketValue;
  }
  return slices
    .sort((a, b) => b.value - a.value || String(a.sector).localeCompare(String(b.sector)))
    .map(slice => ({
      sector: slice.sector,
      value: numberToWire(slice.value),
      weight: numberToWire(slice.weight),
      holdingCount: slice.holdingCount,
      unrealizedPnl: numberToWire(slice.unrealizedPnl),
    }));
}

/** mock 持倉 → summary wire DTO(與後端同形;金額欄位以 `numberToWire` 轉字串)。 */
function summaryFrom(positions: Position[]): PortfolioSummaryDto {
  const totalMarketValue = positions.reduce((sum, p) => sum + p.qty * p.price, 0);
  const totalCostBasis = positions.reduce((sum, p) => sum + p.qty * p.avg, 0);
  const unrealizedPnl = totalMarketValue - totalCostBasis;
  // mock 資料沒有已實現損益的來源(store 只有現有部位),故為 0。
  const realizedPnl = 0;
  const totalPnl = realizedPnl + unrealizedPnl;
  return {
    totalMarketValue: numberToWire(totalMarketValue),
    totalCostBasis: numberToWire(totalCostBasis),
    realizedPnl: numberToWire(realizedPnl),
    unrealizedPnl: numberToWire(unrealizedPnl),
    totalPnl: numberToWire(totalPnl),
    roi: numberToWire(totalCostBasis === 0 ? 0 : totalPnl / totalCostBasis),
    holdingCount: positions.length,
    baseCurrency: MOCK_CURRENCY,
    fxExcludedCount: 0,
    unconvertedCurrencies: [],
    // mock 沒有前收盤:今日損益為 null,所有持倉都算「未納入」。
    dayPricePnl: null,
    dayPricePnlRatio: null,
    dayPnlExcludedCount: positions.length,
    // mock 沒有現金帳本。
    cash: numberToWire(0),
    totalEquity: numberToWire(totalMarketValue),
    cashBalances: [],
    // mock KPI 是寫死值、不隨 mock 股利變動;股利收入附加列在 mock 不渲染(UI-SPEC §Interaction 0)。
    dividendIncome: numberToWire(0),
    dividendTaxWithheld: numberToWire(0),
    allocation: positions.length === 0
      ? []
      : ([{ category: 'STOCK', value: numberToWire(totalMarketValue), weight: numberToWire(1) }] satisfies AllocationSliceDto[]),
    sectorAllocation: sectorAllocationFrom(positions, totalMarketValue),
  };
}

/**
 * mock 持倉 → holding wire DTO(與後端同形)。mock 宇宙的靜態資料是 number,先以 number 計算,
 * 再經 `numberToWire` 投影成 wire 字串,最後與 http 走同一個 {@link toHolding}。
 */
function holdingFrom(position: Position): HoldingDto {
  const costBasis = position.qty * position.avg;
  const marketValue = position.qty * position.price;
  const unrealizedPnl = marketValue - costBasis;
  return {
    assetId: `mock-asset-${position.sym}`,
    symbol: position.sym,
    assetName: position.name,
    totalQuantity: numberToWire(position.qty),
    avgCost: numberToWire(position.avg),
    costBasis: numberToWire(costBasis),
    marketPrice: numberToWire(position.price),
    marketValue: numberToWire(marketValue),
    realizedPnl: numberToWire(0),
    unrealizedPnl: numberToWire(unrealizedPnl),
    roi: numberToWire(costBasis === 0 ? 0 : unrealizedPnl / costBasis),
    priceTime: null,
    lastUpdated: null,
    currency: MOCK_CURRENCY,
    // quick-261107-1j4 E2:種子持倉帶 assetType / market;自訂或舊形狀的持倉缺值 → STOCK / null(對話框退回 UTC)。
    assetType: position.assetType ?? 'STOCK',
    sector: position.sector,
    market: position.market ?? null,
    baseCurrency: MOCK_CURRENCY,
    marketValueInBase: numberToWire(marketValue),
    // mock 單一幣別(原幣 = 基準幣),基準幣未實現損益即原幣值,與 marketValueInBase 同做法。
    unrealizedPnlInBase: numberToWire(unrealizedPnl),
    // mock 沒有前收盤:今日損益相關欄位皆為 null。
    previousClose: null,
    dayPricePnl: null,
    dayPricePnlRatio: null,
    dayPnlBasis: null,
  };
}

function tradeDtoFrom(trade: Trade, index: number): TradeDto {
  return {
    // store trade 沒有 id;用陣列索引組穩定合成值,頁面才有可用的 :key。
    id: `mock-${index}`,
    symbol: trade.sym,
    // mock 專屬的 DIV 型別原樣通過(後端契約只有 BUY/SELL,頁面在 mock mode
    // 不經 listTrades 消費 —— mock mode 走 live.trades)。
    type: trade.type as TradeDto['type'],
    quantity: trade.qty,
    price: trade.px,
    fee: trade.fee,
    note: trade.note,
    // mock `Trade` 沒有幣別,不猜測(UI-SPEC U-29);mock 畫面不讀此欄位。
    currency: null,
    executedAt: `${trade.d}T00:00:00Z`,
    createdAt: `${trade.d}T00:00:00Z`,
  };
}

function sortValue(trade: TradeDto, sort: NonNullable<TradeListParams['sort']>): number {
  if (sort === 'quantity') return trade.quantity;
  // total = quantity × price(與後端 D-06 定義一致,不含 fee)
  if (sort === 'total') return trade.quantity * trade.price;
  return Date.parse(trade.executedAt);
}

function applyTradeParams(trades: TradeDto[], params: TradeListParams): TradeDto[] {
  const from = params.dateFrom ? Date.parse(params.dateFrom) : null;
  const to = params.dateTo ? Date.parse(params.dateTo) : null;
  const filtered = trades.filter(trade => {
    if (params.symbol && trade.symbol !== params.symbol) return false;
    if (params.type && trade.type !== params.type) return false;
    const executedAt = Date.parse(trade.executedAt);
    // 半開區間 [dateFrom, dateTo)
    if (from !== null && executedAt < from) return false;
    if (to !== null && executedAt >= to) return false;
    return true;
  });

  const sort = params.sort ?? 'executedAt';
  const factor = (params.direction ?? 'desc') === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => (sortValue(a, sort) - sortValue(b, sort)) * factor);
}

/**
 * mock 交易 → 活動列。靜態 `DIV` 示範列沒有可沖銷的 id,`reversible` 恆 false(UI-SPEC §Interaction 0:
 * 不顯示比顯示了卻 no-op 誠實)。mock `Trade` 沒有幣別,不猜測(U-29)。
 */
function activityFromTrade(trade: Trade, index: number): PortfolioActivityDto {
  const occurredAt = `${trade.d}T00:00:00Z`;
  const isDividend = trade.type === 'DIV';
  return {
    id: `mock-${index}`,
    kind: trade.type === 'DIV' ? 'CASH_DIVIDEND' : trade.type,
    symbol: trade.sym,
    currency: null,
    occurredAt,
    effectiveDate: null,
    createdAt: occurredAt,
    quantity: isDividend ? null : trade.qty,
    price: isDividend ? null : trade.px,
    fee: isDividend ? null : trade.fee,
    // 交易 = quantity × price(不含 fee);靜態 DIV 列的「每股股利 × 股數」即實領總額。
    amount: trade.qty * trade.px,
    withholdingTax: isDividend ? 0 : null,
    ratioNew: null,
    ratioOld: null,
    note: trade.note,
    reversalOfId: null,
    reversalOfOccurredAt: null,
    reversalOfEffectiveDate: null,
    reversed: false,
    reversible: false,
  };
}

const ACTIVITY_KINDS_BY_TYPE: Record<NonNullable<ActivityListParams['type']>, PortfolioActivityDto['kind'][]> = {
  BUY: ['BUY'],
  SELL: ['SELL'],
  DIVIDEND: ['CASH_DIVIDEND'],
  SHARE_ADJUSTMENT: ['STOCK_DIVIDEND', 'SPLIT'],
};

function activitySortValue(activity: PortfolioActivityDto, sort: NonNullable<ActivityListParams['sort']>): number | null {
  if (sort === 'quantity') return activity.quantity;
  if (sort === 'total') return activity.amount;
  if (sort === 'createdAt') return Date.parse(activity.createdAt);
  return Date.parse(activity.occurredAt);
}

/** 與後端同義:篩選 type / symbol / 半開區間 [dateFrom, dateTo)(作用於 occurredAt);排序欄位 NULLS LAST。 */
function applyActivityParams(activities: PortfolioActivityDto[], params: ActivityListParams): PortfolioActivityDto[] {
  const from = params.dateFrom ? Date.parse(params.dateFrom) : null;
  const to = params.dateTo ? Date.parse(params.dateTo) : null;
  const kinds = params.type ? ACTIVITY_KINDS_BY_TYPE[params.type] : null;
  const filtered = activities.filter(activity => {
    if (kinds && !kinds.includes(activity.kind)) return false;
    if (params.symbol && activity.symbol !== params.symbol) return false;
    const occurredAt = Date.parse(activity.occurredAt);
    if (from !== null && occurredAt < from) return false;
    if (to !== null && occurredAt >= to) return false;
    return true;
  });

  const sort = params.sort ?? 'executedAt';
  const factor = (params.direction ?? 'desc') === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const left = activitySortValue(a, sort);
    const right = activitySortValue(b, sort);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return (left - right) * factor;
  });
}

export function createMockPortfolioApi(): PortfolioApi {
  // 每個 getter 都重新呼叫 useMockPortfolioStore():延遲解析是 reactivity 與
  // 跨測試隔離(testSetup 每個測試換 pinia)的關鍵,不可改成在此捕捉 store/陣列。
  const live: PortfolioLiveMockData = {
    get trades() {
      return useMockPortfolioStore().trades;
    },
    get positions() {
      return useMockPortfolioStore().positions;
    },
    get lastFill() {
      return useMockPortfolioStore().lastFill;
    },
    get holdingEvents() {
      return listMockHoldingEvents().map(event => ({ ...event, price: null, fee: null }));
    },
    isHoldingEventTrade(trade) {
      return isMockHoldingEventTradeRow(trade);
    },
  };

  return {
    mode: 'mock',
    live,
    async getSummary() {
      return toPortfolioSummary(summaryFrom(useMockPortfolioStore().positions));
    },
    async listHoldings() {
      return useMockPortfolioStore().positions.map(position => toHolding(holdingFrom(position)));
    },
    async listTrades(params = {}) {
      const all = useMockPortfolioStore().trades.map(tradeDtoFrom);
      const matched = applyTradeParams(all, params);
      const page = params.page ?? DEFAULT_PAGE;
      const size = params.size ?? DEFAULT_SIZE;
      return {
        items: matched.slice(page * size, page * size + size),
        page,
        size,
        totalElements: matched.length,
        totalPages: Math.ceil(matched.length / size),
      };
    },
    async listActivities(params = {}) {
      const store = useMockPortfolioStore();
      // 由 mock holdingEventApi 寫入的 DIV 列已由事件本身代表(可沖銷);這裡排除,避免同一筆出現兩次。
      const fromTrades = store.trades
        .map((trade, index) => ({ trade, index }))
        .filter(({ trade }) => !isMockHoldingEventTradeRow(trade))
        .map(({ trade, index }) => activityFromTrade(trade, index));
      const fromEvents = listMockHoldingEvents().map(event => ({ ...event, price: null, fee: null }));
      const matched = applyActivityParams([...fromTrades, ...fromEvents], params);
      const page = params.page ?? DEFAULT_PAGE;
      const size = params.size ?? DEFAULT_SIZE;
      return structuredClone({
        items: matched.slice(page * size, page * size + size),
        page,
        size,
        totalElements: matched.length,
        totalPages: Math.ceil(matched.length / size),
      });
    },
  };
}

export function createHttpPortfolioApi(basePath = '/api/v1'): PortfolioApi {
  return {
    mode: 'api',
    getSummary: async () => toPortfolioSummary(await apiRequest<PortfolioSummaryDto>(`${basePath}/portfolio/summary`)),
    listHoldings: async () => (await apiRequest<HoldingDto[]>(`${basePath}/portfolio/holdings`)).map(toHolding),
    listTrades: params => apiPaginatedRequest<TradeDto>(
      `${basePath}/trades${buildQueryString({
        symbol: params?.symbol,
        type: params?.type,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        sort: params?.sort,
        direction: params?.direction,
        page: params?.page ?? DEFAULT_PAGE,
        size: params?.size ?? DEFAULT_SIZE,
      })}`,
    ),
    listActivities: params => apiPaginatedRequest<PortfolioActivityDto>(
      `${basePath}/portfolio/activities${buildQueryString({
        symbol: params?.symbol,
        type: params?.type,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        sort: params?.sort,
        direction: params?.direction,
        page: params?.page ?? DEFAULT_PAGE,
        size: params?.size ?? DEFAULT_SIZE,
      })}`,
    ),
  };
}

export function createPortfolioApi(mode: RuntimeDataMode, basePath = '/api/v1'): PortfolioApi {
  return mode === 'api' ? createHttpPortfolioApi(basePath) : createMockPortfolioApi();
}
