import type { AssetDto, RuntimeDataMode } from './apiTypes';

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

export function createHttpWatchlistApi(_basePath = '/api/v1'): WatchlistApi {
  return {
    mode: 'api',
    list: async () => notImplemented(),
    create: async () => notImplemented(),
    rename: async () => notImplemented(),
    remove: async () => notImplemented(),
    addItem: async () => notImplemented(),
    removeItem: async () => notImplemented(),
    reorder: async () => notImplemented(),
  };
}

export function createMockWatchlistApi(): WatchlistApi {
  return {
    mode: 'mock',
    list: async () => notImplemented(),
    create: async () => notImplemented(),
    rename: async () => notImplemented(),
    remove: async () => notImplemented(),
    addItem: async () => notImplemented(),
    removeItem: async () => notImplemented(),
    reorder: async () => notImplemented(),
  };
}

export function createWatchlistApi(mode: RuntimeDataMode, basePath = '/api/v1'): WatchlistApi {
  return mode === 'api' ? createHttpWatchlistApi(basePath) : createMockWatchlistApi();
}
