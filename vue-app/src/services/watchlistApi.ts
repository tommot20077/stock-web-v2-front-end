import { ApiClientError, apiRequest } from './apiClient';
import { BONDS, CRYPTO, FX, SYMBOLS } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import { numberToWire } from './decimal';
import { toAsset } from './marketApi';
import type { Asset, AssetDto, RuntimeDataMode } from './apiTypes';
import type { Bond, Symbol as MockSymbol } from '../types';

/** 每位使用者的清單上限(watchlist-contract〈上限與併發保證〉)。 */
export const WATCHLIST_MAX_LISTS = 20;
/** 每份清單的項目上限(watchlist-contract〈上限與併發保證〉)。 */
export const WATCHLIST_MAX_ITEMS = 100;

/**
 * 後端 `WatchlistDto`(wire),逐欄同形(04.2-02 凍結契約 `ai-docs/watchlist-contract.md`)。
 * `items` 依 `position` 排序,每列與 `GET /api/v1/assets` 的 `AssetDto` 逐欄同形(報價欄為字串,Phase 5 D-05)。
 */
export interface WatchlistDto {
  id: string;
  name: string;
  items: AssetDto[];
}

/**
 * domain:一份觀察清單(由 {@link toWatchlistRecord} 產生),`items` 為 domain {@link Asset}(報價欄 Decimal)。
 * 名稱加 `Record` 後綴以免與 `src/types.ts` 的 mock 型別 `Watchlist` 撞名(05-16 規約)。
 */
export interface WatchlistRecord {
  id: string;
  name: string;
  items: Asset[];
}

/** wire `WatchlistDto` → domain {@link WatchlistRecord};items 逐列經 `marketApi.toAsset`(http 與 mock 共用)。 */
export function toWatchlistRecord(wire: WatchlistDto): WatchlistRecord {
  return { id: wire.id, name: wire.name, items: wire.items.map(toAsset) };
}

/**
 * watchlist domain 的唯一消費介面。Markets / Chart / Watchlist 頁永遠只經此介面
 * (judgment §3:元件不 import mock store)。所有方法回 domain {@link WatchlistRecord}。
 */
export interface WatchlistApi {
  mode: RuntimeDataMode;
  list(): Promise<WatchlistRecord[]>;
  create(name: string): Promise<WatchlistRecord>;
  rename(id: string, name: string): Promise<WatchlistRecord>;
  remove(id: string): Promise<void>;
  addItem(id: string, symbol: string): Promise<WatchlistRecord>;
  removeItem(id: string, assetId: string): Promise<WatchlistRecord>;
  reorder(id: string, assetIds: string[]): Promise<WatchlistRecord>;
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
    list: async () => (await apiRequest<WatchlistDto[]>(`${basePath}/watchlists`)).map(toWatchlistRecord),
    create: async name => toWatchlistRecord(
      await apiRequest<WatchlistDto>(`${basePath}/watchlists`, { method: 'POST', json: { name } }),
    ),
    rename: async (id, name) => toWatchlistRecord(
      await apiRequest<WatchlistDto>(listPath(id), { method: 'PATCH', json: { name } }),
    ),
    // 後端回 `ApiResponse<Void>`(data 為 null);對外契約是 void,不把 null 漏給呼叫端。
    remove: async id => {
      await apiRequest<null>(listPath(id), { method: 'DELETE' });
    },
    addItem: async (id, symbol) => toWatchlistRecord(
      await apiRequest<WatchlistDto>(`${listPath(id)}/items`, { method: 'POST', json: { symbol } }),
    ),
    removeItem: async (id, assetId) => toWatchlistRecord(await apiRequest<WatchlistDto>(
      `${listPath(id)}/items/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    )),
    reorder: async (id, assetIds) => toWatchlistRecord(await apiRequest<WatchlistDto>(
      `${listPath(id)}/items/order`,
      { method: 'PUT', json: { assetIds: [...assetIds] } },
    )),
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
 * `data.ts` 的報價列投影成 wire `AssetDto` 形狀(逐欄同形,watchlist-contract〈WatchlistDto〉);報價 number 以
 * `numberToWire` 轉字串,之後與 http 同走 `toWatchlistRecord` / `toAsset`。
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
    latestPrice: numberToWire(symbol.price),
    change: numberToWire(symbol.chg),
    changePercent: numberToWire(symbol.chgPct),
    volumeText: symbol.vol === '—' ? null : symbol.vol,
    high: numberToWire(symbol.high),
    low: numberToWire(symbol.low),
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
    latestPrice: numberToWire(bond.yld),
    change: numberToWire(bond.chg),
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

/** store 清單 → wire → domain;每次都建立新物件(不 structuredClone:會丟掉 big.js prototype)。 */
function toRecord(list: { id: string; name: string; syms: string[] }): WatchlistRecord {
  return toWatchlistRecord({ id: list.id, name: list.name, items: list.syms.map(assetDtoForStored) });
}

/** 契約〈上限與併發保證〉:預設清單名稱與清單名稱長度。 */
const DEFAULT_WATCHLIST_NAME = '我的自選';
const MAX_NAME_LENGTH = 30;

function validationFailed(field: string, message: string): ApiClientError {
  return new ApiClientError({ status: 400, code: 'VALIDATION_FAILED', message: 'Validation failed', fields: { [field]: message } });
}

/** 錯誤訊息為靜態英文字串,不回射使用者輸入(契約〈錯誤〉)。 */
function watchlistNotFound(): ApiClientError {
  return new ApiClientError({ status: 404, code: 'WATCHLIST_NOT_FOUND', message: 'Watchlist not found' });
}

function duplicateName(): ApiClientError {
  return new ApiClientError({
    status: 409, code: 'DUPLICATE_RESOURCE', message: 'Watchlist name already exists', fields: { name: 'already exists' },
  });
}

/** 名稱 trim 後 1–30 字;不合法丟 400 `fields.name`(後端 bean validation,先於一切查找)。 */
function normalizeName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH) {
    throw validationFailed('name', `length must be between 1 and ${MAX_NAME_LENGTH}`);
  }
  return trimmed;
}

type MockStore = ReturnType<typeof useMockPortfolioStore>;
type StoredWatchlist = MockStore['watchlists'][number];

function findList(store: MockStore, id: string): StoredWatchlist {
  const list = store.watchlists.find(candidate => candidate.id === id);
  if (!list) throw watchlistNotFound();
  return list;
}

/** D-17:0 個清單時先建「我的自選」(GET 與 POST 建立前皆同,與後端一致)。 */
function ensureDefaultList(store: MockStore): void {
  if (store.watchlists.length === 0) store.addWatchlist(DEFAULT_WATCHLIST_NAME);
}

function lastList(store: MockStore): StoredWatchlist {
  return store.watchlists[store.watchlists.length - 1];
}

/**
 * mock 以 mock portfolio store 為狀態來源(星號、Markets / Chart 舊呼叫點在 04.2-22 / 23 移除前共用同一份),
 * 上限與錯誤碼在 service 層實作,檢查順序對齊後端:request 驗證 → 清單查找(404)→ 資產查找 → 冪等 → 上限 → 寫入。
 * 回傳值每次都是新建物件(clone),外部修改不會回灌 store。
 */
export function createMockWatchlistApi(): WatchlistApi {
  return {
    mode: 'mock',
    async list() {
      const store = useMockPortfolioStore();
      ensureDefaultList(store);
      return store.watchlists.map(toRecord);
    },
    async create(name) {
      const normalized = normalizeName(name);
      const store = useMockPortfolioStore();
      ensureDefaultList(store);
      // 後端:鎖住使用者全部清單 → count → insert,重名由 insert 時的唯一約束擋下,所以上限先於重名。
      if (store.watchlists.length >= WATCHLIST_MAX_LISTS) {
        throw validationFailed('watchlists', `at most ${WATCHLIST_MAX_LISTS} watchlists`);
      }
      if (store.watchlists.some(candidate => candidate.name === normalized)) throw duplicateName();
      store.addWatchlist(normalized);
      return toRecord(lastList(store));
    },
    async rename(id, name) {
      const normalized = normalizeName(name);
      const store = useMockPortfolioStore();
      const list = findList(store, id);
      if (store.watchlists.some(candidate => candidate.id !== id && candidate.name === normalized)) throw duplicateName();
      store.renameWatchlist(id, normalized);
      return toRecord(list);
    },
    async remove(id) {
      const store = useMockPortfolioStore();
      findList(store, id);
      store.deleteWatchlist(id);
    },
    async addItem(id, symbol) {
      const trimmed = typeof symbol === 'string' ? symbol.trim() : '';
      if (trimmed === '') throw validationFailed('symbol', 'must not be blank');
      const store = useMockPortfolioStore();
      const list = findList(store, id);
      if (!mockAssetFor(trimmed)) {
        throw new ApiClientError({ status: 404, code: 'ASSET_NOT_FOUND', message: 'Asset not found', fields: { symbol: 'not found' } });
      }
      // 已在清單中 → 原樣回傳(冪等,不報錯、不改順序)。
      if (list.syms.includes(trimmed)) return toRecord(list);
      if (list.syms.length >= WATCHLIST_MAX_ITEMS) {
        throw validationFailed('items', `at most ${WATCHLIST_MAX_ITEMS} items`);
      }
      store.setWatchlistOrder(id, [...list.syms, trimmed]);
      return toRecord(findList(store, id));
    },
    async removeItem(id, assetId) {
      const store = useMockPortfolioStore();
      const list = findList(store, id);
      const remaining = list.syms.filter(sym => assetDtoForStored(sym).uuid !== assetId);
      if (remaining.length !== list.syms.length) store.setWatchlistOrder(id, remaining);
      return toRecord(findList(store, id));
    },
    async reorder(id, assetIds) {
      if (!Array.isArray(assetIds)) throw validationFailed('assetIds', 'must be an array');
      const store = useMockPortfolioStore();
      const list = findList(store, id);
      const symByUuid = new Map(list.syms.map(sym => [assetDtoForStored(sym).uuid, sym]));
      const unique = new Set(assetIds);
      // 多、少、重複皆視為集合不同 → 409,前端重讀後再讓使用者重試。
      const sameSet = assetIds.length === list.syms.length
        && unique.size === assetIds.length
        && assetIds.every(assetId => symByUuid.has(assetId));
      if (!sameSet) {
        throw new ApiClientError({
          status: 409, code: 'WATCHLIST_ORDER_CONFLICT', message: 'Watchlist items changed; reload and retry',
        });
      }
      store.setWatchlistOrder(id, assetIds.map(assetId => symByUuid.get(assetId)!));
      return toRecord(findList(store, id));
    },
  };
}

export function createWatchlistApi(mode: RuntimeDataMode, basePath = '/api/v1'): WatchlistApi {
  return mode === 'api' ? createHttpWatchlistApi(basePath) : createMockWatchlistApi();
}
