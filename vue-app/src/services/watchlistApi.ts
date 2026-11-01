import { apiRequest } from './apiClient';
import { BONDS, CRYPTO, FX, SYMBOLS } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { AssetDto, RuntimeDataMode } from './apiTypes';
import type { Bond, Symbol as MockSymbol } from '../types';

/** 每位使用者的清單上限(watchlist-contract〈上限與併發保證〉)。 */
export const WATCHLIST_MAX_LISTS = 20;
/** 每份清單的項目上限(watchlist-contract〈上限與併發保證〉)。 */
export const WATCHLIST_MAX_ITEMS = 100;

/**
 * 後端 `WatchlistDto`,逐欄同形(04.2-02 凍結契約 `ai-docs/watchlist-contract.md`)。
 * `items` 依 `position` 排序,每列與 `GET /api/v1/assets` 的 `AssetDto` 逐欄同形。
 */
export interface WatchlistDto {
  id: string;
  name: string;
  items: AssetDto[];
}

/**
 * watchlist domain 的唯一消費介面。Markets / Chart / Watchlist 頁永遠只經此介面
 * (judgment §3:元件不 import mock store)。
 */
export interface WatchlistApi {
  mode: RuntimeDataMode;
  list(): Promise<WatchlistDto[]>;
  create(name: string): Promise<WatchlistDto>;
  rename(id: string, name: string): Promise<WatchlistDto>;
  remove(id: string): Promise<void>;
  addItem(id: string, symbol: string): Promise<WatchlistDto>;
  removeItem(id: string, assetId: string): Promise<WatchlistDto>;
  reorder(id: string, assetIds: string[]): Promise<WatchlistDto>;
}

function notImplemented(): never {
  throw new Error('not implemented');
}

/**
 * 全部經 `apiRequest`:CSRF header、cookie 憑證、401 單飛 refresh + 一次 replay 由 apiClient 處理。
 *
 * **路徑只放 UUID 且一律 `encodeURIComponent`**(T-04.2-39):FX 代號含 `/`,所以加入項目
 * 以 body `{symbol}` 指定,絕不把 symbol 放進路徑。body 逐欄投影,不轉送呼叫端的整包物件。
 */
export function createHttpWatchlistApi(basePath = '/api/v1'): WatchlistApi {
  const listPath = (id: string) => `${basePath}/watchlists/${encodeURIComponent(id)}`;
  return {
    mode: 'api',
    list: () => apiRequest<WatchlistDto[]>(`${basePath}/watchlists`),
    create: name => apiRequest<WatchlistDto>(`${basePath}/watchlists`, { method: 'POST', json: { name } }),
    rename: (id, name) => apiRequest<WatchlistDto>(listPath(id), { method: 'PATCH', json: { name } }),
    // 後端回 `ApiResponse<Void>`(data 為 null);對外契約是 void,不把 null 漏給呼叫端。
    remove: async id => {
      await apiRequest<null>(listPath(id), { method: 'DELETE' });
    },
    addItem: (id, symbol) => apiRequest<WatchlistDto>(`${listPath(id)}/items`, { method: 'POST', json: { symbol } }),
    removeItem: (id, assetId) => apiRequest<WatchlistDto>(
      `${listPath(id)}/items/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    ),
    reorder: (id, assetIds) => apiRequest<WatchlistDto>(
      `${listPath(id)}/items/order`,
      { method: 'PUT', json: { assetIds: [...assetIds] } },
    ),
  };
}

/** mock 資產的合成 uuid;與 `marketApi.ts` 的 mock `AssetDto` 同一前綴,同一檔在兩個 adapter 的 uuid 相同(同後端)。 */
const MOCK_ASSET_UUID_PREFIX = 'mock-asset-';

const BOND_CURRENCY: Record<string, string> = { US: 'USD', DE: 'EUR', JP: 'JPY', TW: 'TWD' };

function mockMarketOf(symbol: MockSymbol): string {
  if (symbol.cat === 'crypto') return 'CRYPTO';
  if (symbol.cat === 'fx') return 'FX';
  return symbol.sym.endsWith('.TW') ? 'TW' : 'US';
}

function mockCurrencyOf(symbol: MockSymbol): string {
  if (symbol.cat === 'fx') return symbol.sym.split('/')[1] ?? 'USD';
  return symbol.sym.endsWith('.TW') ? 'TWD' : 'USD';
}

/**
 * `data.ts` 的報價列投影成 `AssetDto` 形狀(逐欄同形,watchlist-contract〈WatchlistDto〉)。
 *
 * - STOCK / CRYPTO 可交易;FX 不可交易(契約:觀察清單可含不可交易資產,前端據此隱藏下單入口)。
 * - `volumeText` 取示範值;FX 的示範值是 `—`(無量),依契約輸出 null 讓畫面自己畫「—」。
 */
function assetDtoFromSymbol(symbol: MockSymbol): AssetDto {
  return {
    uuid: `${MOCK_ASSET_UUID_PREFIX}${symbol.sym}`,
    symbol: symbol.sym,
    name: symbol.name,
    assetType: symbol.cat.toUpperCase(),
    market: mockMarketOf(symbol),
    currency: mockCurrencyOf(symbol),
    sector: symbol.sector ?? null,
    tradeable: symbol.cat !== 'fx',
    latestPrice: symbol.price,
    change: symbol.chg,
    changePercent: symbol.chgPct,
    volumeText: symbol.vol === '—' ? null : symbol.vol,
    high: symbol.high,
    low: symbol.low,
  };
}

/**
 * 債券列只有殖利率與其變動:`latestPrice` 取 `yld`、`change` 取 `chg`(data.ts 有值者為準);
 * 其餘報價欄位 data.ts 沒有,依契約為 null(不塞預設值)。債券不可交易。
 */
function assetDtoFromBond(bond: Bond): AssetDto {
  return {
    uuid: `${MOCK_ASSET_UUID_PREFIX}${bond.sym}`,
    symbol: bond.sym,
    name: bond.name,
    assetType: 'BOND',
    market: bond.country,
    currency: BOND_CURRENCY[bond.country] ?? 'USD',
    sector: null,
    tradeable: false,
    latestPrice: bond.yld,
    change: bond.chg,
    changePercent: null,
    volumeText: null,
    high: null,
    low: null,
  };
}

/** mock 可加入的宇宙:data.ts 四個陣列(契約 D-18:任何 active 資產,含 FX 與債券)。 */
function mockAssetFor(symbol: string): AssetDto | null {
  const quoted = [...SYMBOLS, ...CRYPTO, ...FX].find(candidate => candidate.sym === symbol);
  if (quoted) return assetDtoFromSymbol(quoted);
  const bond = BONDS.find(candidate => candidate.sym === symbol);
  return bond ? assetDtoFromBond(bond) : null;
}

/**
 * store 只存 symbol;store 裡若有 data.ts 查不到的代號(舊呼叫點 `toggleWatch` 可寫入任意字串),
 * 仍以同形物件回傳、六個報價欄位皆 null,不讓清單憑空少一列。
 */
function assetDtoForStored(symbol: string): AssetDto {
  return mockAssetFor(symbol) ?? {
    uuid: `${MOCK_ASSET_UUID_PREFIX}${symbol}`,
    symbol,
    name: symbol,
    assetType: 'STOCK',
    market: 'US',
    currency: 'USD',
    sector: null,
    tradeable: false,
    latestPrice: null,
    change: null,
    changePercent: null,
    volumeText: null,
    high: null,
    low: null,
  };
}

function toDto(list: { id: string; name: string; syms: string[] }): WatchlistDto {
  return { id: list.id, name: list.name, items: list.syms.map(assetDtoForStored) };
}

/**
 * mock 以 mock portfolio store 為狀態來源(星號、Markets / Chart 舊呼叫點在 04.2-22 / 23 移除前共用同一份),
 * 上限與錯誤碼在 service 層實作。回傳值每次都是新建物件,外部修改不會回灌 store。
 */
export function createMockWatchlistApi(): WatchlistApi {
  return {
    mode: 'mock',
    async list() {
      return useMockPortfolioStore().watchlists.map(toDto);
    },
    create: async () => notImplemented(),
    rename: async () => notImplemented(),
    remove: async () => notImplemented(),
    async addItem(id, symbol) {
      const store = useMockPortfolioStore();
      const list = store.watchlists.find(candidate => candidate.id === id)!;
      if (!list.syms.includes(symbol)) list.syms.push(symbol);
      return toDto(list);
    },
    removeItem: async () => notImplemented(),
    reorder: async () => notImplemented(),
  };
}

export function createWatchlistApi(mode: RuntimeDataMode, basePath = '/api/v1'): WatchlistApi {
  return mode === 'api' ? createHttpWatchlistApi(basePath) : createMockWatchlistApi();
}
