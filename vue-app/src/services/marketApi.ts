import { apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import { CRYPTO, FX, SYMBOLS, genSeries } from '../data';
import type {
  AssetDto,
  KlineDto,
  KlineInterval,
  PaginatedResponse,
  RuntimeDataMode,
} from './apiTypes';
import type { Symbol as MockSymbol } from '../types';

/** `GET /api/v1/assets` 的參數(`AssetController.java:24-32`:query 預設 ""、page 預設 0、size 預設 20 上限 100)。 */
export interface AssetSearchParams {
  query: string;
  /** 預設 0 */
  page?: number;
  /** 預設 10(04-UI-SPEC §2:typeahead 最多列 10 筆);後端上限 100 */
  size?: number;
}

/** `GET /api/v1/market/{symbol}/klines` 的參數(`MarketController.java:119-126`)。 */
export interface KlineListParams {
  interval: KlineInterval;
  /** ISO-8601;必填,含此時間 */
  from: string;
  /** ISO-8601;選填,不含此時間。未指定時後端用當前時間 */
  to?: string;
  /** 選填;後端預設 500,最大 5000 */
  limit?: number;
}

/**
 * market domain(可交易標的搜尋 + K 線)的唯一消費介面。
 *
 * 頁面用法(judgment §3:元件永遠不 import mock store / 不 import `data.ts`):
 * - mock mode 與 API mode **回傳同形資料**,所以消費端只有一條資料路徑,
 *   不需要 `if (live)` 分支去讀本地假資料。
 * - 因此本 adapter **刻意沒有 `live`** —— 與 `portfolioApi` 不同,market domain
 *   沒有需要 reactive 委派的 mock 專屬狀態(`portfolioApi` 的 `lastFill` 才需要)。
 *   宣告成 `live?: undefined` 是為了讓「這裡永遠沒有 live」在型別層可被斷言。
 *
 * DP-5 裁定:asset 搜尋與 klines **合併成一個 adapter**,不拆 `assetApi` + `marketApi`,
 * 也不塞進 `tradingApi.ts`(VER-02 把不同 domain 列為不同 adapter)。
 */
export interface MarketApi {
  mode: RuntimeDataMode;
  /**
   * 搜尋可交易標的。回傳分頁信封本體(`ApiResponse<PageResponse<AssetDto>>` 拆封後)。
   *
   * @param signal typeahead 取消用;OrderTicket 的 250ms debounce 與「只採最後一次結果」
   *               在元件層實作(DP-12),adapter 只負責把 signal 原樣傳給 fetch。
   */
  searchAssets(params: AssetSearchParams, signal?: AbortSignal): Promise<PaginatedResponse<AssetDto>>;
  /** 取單一標的的 K 線序列。非分頁端點,回傳裸陣列。 */
  listKlines(symbol: string, params: KlineListParams): Promise<KlineDto[]>;
  /** market domain 沒有 mock 專屬 reactive 狀態,兩種實作都不提供。 */
  live?: undefined;
}

const DEFAULT_PAGE = 0;
/** 04-UI-SPEC §2:typeahead 下拉最多 10 筆。 */
const DEFAULT_SIZE = 10;
/** mock 專用:後端預設 500,mock 只需夠畫 96px 走勢圖,刻意取小值。 */
const MOCK_KLINE_COUNT = 120;

const INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

/**
 * 把 `KlineDto` 的 `close`(JSON **字串**)轉成 `LineChart` 需要的 `number[]`。
 *
 * 獨立成純函式而非讓消費端各自 `Number()` 的理由(Pitfall 8):`KlineDto` 的 OHLCV
 * 是字串而 `AssetDto` 的價格是 number,兩者相反,而 `vue-tsc` 對「把 string 當 number 用」
 * 在模板內抓不到。集中一個轉換點才能被單測鎖住。
 */
export function closeSeries(klines: KlineDto[]): number[] {
  return klines.map(kline => Number(kline.close));
}

export function createHttpMarketApi(basePath = '/api/v1'): MarketApi {
  return {
    mode: 'api',
    // 分頁端點(AssetController 回 ApiResponse<PageResponse<AssetDto>>)→ apiPaginatedRequest。
    searchAssets: (params, signal) => apiPaginatedRequest<AssetDto>(
      `${basePath}/assets${buildQueryString({
        query: params.query,
        page: params.page ?? DEFAULT_PAGE,
        size: params.size ?? DEFAULT_SIZE,
      })}`,
      { signal },
    ),
    // 非分頁端點(MarketController 回 ApiResponse<List<KlineDto>>)→ apiRequest。
    // symbol 是使用者可控字串且**大小寫敏感**(MarketController javadoc 明文),
    // 故只 encodeURIComponent,絕不 toUpperCase()。
    listKlines: (symbol, params) => apiRequest<KlineDto[]>(
      `${basePath}/market/${encodeURIComponent(symbol)}/klines${buildQueryString({
        interval: params.interval,
        from: params.from,
        to: params.to,
        limit: params.limit,
      })}`,
    ),
  };
}

/** mock 的 `Symbol` 沒有 market 欄位;`.TW` 後綴是本地假資料唯一可辨識的市場線索。 */
function mockMarketOf(symbol: MockSymbol): string {
  if (symbol.cat === 'crypto') return 'CRYPTO';
  if (symbol.cat === 'fx') return 'FX';
  return symbol.sym.endsWith('.TW') ? 'TW' : 'US';
}

function mockCurrencyOf(symbol: MockSymbol): string {
  return symbol.sym.endsWith('.TW') ? 'TWD' : 'USD';
}

/**
 * 把 `data.ts` 的 `Symbol` 投影成 `AssetDto` 形狀。
 *
 * `tradeable` 一律 `true`:mock 資料沒有可交易旗標的來源,而 mock mode 的用途是讓
 * OrderTicket 走完整流程。`uuid` 用穩定合成值(mock 沒有真 UUID),頁面只拿它當 key。
 */
function assetDtoFrom(symbol: MockSymbol): AssetDto {
  return {
    uuid: `mock-asset-${symbol.sym}`,
    symbol: symbol.sym,
    name: symbol.name,
    assetType: symbol.cat.toUpperCase(),
    market: mockMarketOf(symbol),
    currency: mockCurrencyOf(symbol),
    sector: symbol.sector ?? '',
    tradeable: true,
    latestPrice: symbol.price,
    change: symbol.chg,
    changePercent: symbol.chgPct,
    volumeText: symbol.vol,
    high: symbol.high,
    low: symbol.low,
  };
}

/** mock 可搜尋的宇宙。BONDS 不納入:`Bond` 沒有 price/high/low,湊不出 `AssetDto` 且不可交易。 */
function mockAssets(): AssetDto[] {
  return [...SYMBOLS, ...CRYPTO, ...FX].map(assetDtoFrom);
}

/** BigDecimal 在 JSON 是字串,mock 必須同形 —— 8 位小數對齊後端 `numeric` 的呈現。 */
function decimalString(value: number): string {
  return value.toFixed(8);
}

export function createMockMarketApi(): MarketApi {
  return {
    mode: 'mock',
    async searchAssets(params) {
      const needle = params.query.trim().toLowerCase();
      const matched = mockAssets().filter(asset => (
        needle === ''
        || asset.symbol.toLowerCase().includes(needle)
        || asset.name.toLowerCase().includes(needle)
      ));
      const page = params.page ?? DEFAULT_PAGE;
      const size = params.size ?? DEFAULT_SIZE;
      return {
        items: matched.slice(page * size, page * size + size),
        page,
        size,
        // filter 後的**總數**(非本頁筆數):UI-SPEC §2 的 `truncated` 態靠它觸發。
        totalElements: matched.length,
        totalPages: Math.ceil(matched.length / size),
      };
    },
    async listKlines(symbol, params) {
      const asset = mockAssets().find(candidate => candidate.symbol === symbol);
      const start = asset?.latestPrice ?? 100;
      const step = INTERVAL_MS[params.interval];
      const fromMs = Date.parse(params.from);
      const toMs = params.to ? Date.parse(params.to) : Number.NaN;
      const spanCount = Number.isFinite(toMs) ? Math.floor((toMs - fromMs) / step) : Number.NaN;
      const requested = params.limit ?? MOCK_KLINE_COUNT;
      const count = Math.max(1, Math.min(requested, Number.isFinite(spanCount) ? spanCount : requested));

      // genSeries 是既有的決定性序列產生器(data.ts:79);seed 固定讓 mock 畫面不會每次重繪都變。
      const closes = genSeries(count, start, 0.02, 7);
      return closes.map((close, index) => {
        const open = index === 0 ? start : closes[index - 1];
        return {
          bucket: new Date(fromMs + index * step).toISOString(),
          open: decimalString(open),
          high: decimalString(Math.max(open, close) * 1.002),
          low: decimalString(Math.min(open, close) * 0.998),
          close: decimalString(close),
          volume: decimalString(Math.round(close * 1000)),
        };
      });
    },
  };
}

export function createMarketApi(mode: RuntimeDataMode, basePath = '/api/v1'): MarketApi {
  return mode === 'api' ? createHttpMarketApi(basePath) : createMockMarketApi();
}
