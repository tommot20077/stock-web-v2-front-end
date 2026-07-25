import { apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type {
  HoldingDto,
  PaginatedResponse,
  PortfolioSummaryDto,
  RuntimeDataMode,
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
 * mock mode 專用的 reactive 資料視窗。
 * 三個屬性都是 getter,每次存取才解析 store —— 絕不在 factory 時捕捉陣列參照,
 * 否則整個陣列被替換(`portfolio.trades = [...]`)或測試換 pinia 後會讀到過期資料。
 */
export interface PortfolioLiveMockData {
  readonly trades: Trade[];
  readonly positions: Position[];
  readonly lastFill: { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null;
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
  getSummary(): Promise<PortfolioSummaryDto>;
  listHoldings(): Promise<HoldingDto[]>;
  listTrades(params?: TradeListParams): Promise<PaginatedResponse<TradeDto>>;
  /** 僅 mock 實作提供(Q3 裁決)。 */
  live?: PortfolioLiveMockData;
}

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 20;

function summaryFrom(positions: Position[]): PortfolioSummaryDto {
  const totalMarketValue = positions.reduce((sum, p) => sum + p.qty * p.price, 0);
  const totalCostBasis = positions.reduce((sum, p) => sum + p.qty * p.avg, 0);
  const unrealizedPnl = totalMarketValue - totalCostBasis;
  // mock 資料沒有已實現損益的來源(store 只有現有部位),故為 0。
  const realizedPnl = 0;
  const totalPnl = realizedPnl + unrealizedPnl;
  return {
    totalMarketValue,
    totalCostBasis,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    roi: totalCostBasis === 0 ? 0 : totalPnl / totalCostBasis,
    holdingCount: positions.length,
  };
}

function holdingFrom(position: Position): HoldingDto {
  const costBasis = position.qty * position.avg;
  const marketValue = position.qty * position.price;
  const unrealizedPnl = marketValue - costBasis;
  return {
    assetId: `mock-asset-${position.sym}`,
    symbol: position.sym,
    assetName: position.name,
    totalQuantity: position.qty,
    avgCost: position.avg,
    costBasis,
    marketPrice: position.price,
    marketValue,
    realizedPnl: 0,
    unrealizedPnl,
    roi: costBasis === 0 ? 0 : unrealizedPnl / costBasis,
    priceTime: null,
    lastUpdated: null,
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
  };

  return {
    mode: 'mock',
    live,
    async getSummary() {
      return summaryFrom(useMockPortfolioStore().positions);
    },
    async listHoldings() {
      return useMockPortfolioStore().positions.map(holdingFrom);
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
  };
}

export function createHttpPortfolioApi(basePath = '/api/v1'): PortfolioApi {
  return {
    mode: 'api',
    getSummary: () => apiRequest<PortfolioSummaryDto>(`${basePath}/portfolio/summary`),
    listHoldings: () => apiRequest<HoldingDto[]>(`${basePath}/portfolio/holdings`),
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
  };
}

export function createPortfolioApi(mode: RuntimeDataMode, basePath = '/api/v1'): PortfolioApi {
  return mode === 'api' ? createHttpPortfolioApi(basePath) : createMockPortfolioApi();
}
