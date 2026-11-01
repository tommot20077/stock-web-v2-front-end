import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpWatchlistApi,
  createMockWatchlistApi,
  createWatchlistApi,
  type WatchlistDto,
} from './watchlistApi';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { AssetDto } from './apiTypes';

/**
 * 本檔鎖住 watchlist adapter 的送出契約(WATCH-03,04.2-02 凍結 `ai-docs/watchlist-contract.md`):
 *
 * 1. **路徑只放 UUID**:FX 代號含 `/`,加入項目一律以 body `{symbol}` 指定(T-04.2-39)。
 * 2. **unsafe method 由 apiClient 自動帶 `X-XSRF-TOKEN`**(鐵律 1)。
 * 3. **失敗以 `ApiClientError` 原樣上拋**,保留 code / fields / requestId。
 *
 * fixture 為手寫,逐欄對應後端 `WatchlistDto` / `AssetDto`。
 */

/** `AssetDto` 的完整欄位集合(已排序);mock 回傳必須與 http 同形。 */
const ASSET_DTO_FIELDS = [
  'assetType', 'change', 'changePercent', 'currency', 'high', 'latestPrice', 'low', 'market',
  'name', 'sector', 'symbol', 'tradeable', 'uuid', 'volumeText',
];

const AAPL_DTO: AssetDto = {
  uuid: '0a0a0a0a-1111-2222-3333-444444444444',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  market: 'US',
  currency: 'USD',
  sector: 'Tech',
  tradeable: true,
  latestPrice: 218.4,
  change: 1.42,
  changePercent: 0.66,
  volumeText: '52.1M',
  high: 219.1,
  low: 215.8,
};

const WATCHLIST_DTO: WatchlistDto = {
  id: 'wl-uuid',
  name: '我的自選',
  items: [AAPL_DTO],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope(data: unknown, traceId = 'trace-watchlist'): unknown {
  return { success: true, data, error: null, meta: { traceId } };
}

function failureEnvelope(code: string, message: string, traceId: string, fields?: Record<string, string>): unknown {
  return { success: false, data: null, error: { code, message, ...(fields ? { fields } : {}) }, meta: { traceId } };
}

function initAt(index: number): RequestInit {
  return vi.mocked(fetch).mock.calls[index][1] as RequestInit;
}

function urlAt(index: number): string {
  return String(vi.mocked(fetch).mock.calls[index][0]);
}

function methodAt(index: number): string {
  return String(initAt(index).method ?? 'GET').toUpperCase();
}

function headerValue(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

function bodyAt(index: number): unknown {
  const body = initAt(index).body;
  return body === undefined || body === null ? undefined : JSON.parse(String(body));
}

function stubFetchReturning(data: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(data))));
}

beforeEach(() => {
  // mock 實作以 mock portfolio store 為狀態來源;每個測試一個乾淨的 pinia。
  setActivePinia(createPinia());
  // 預先種 CSRF cookie,避免 apiClient 先打 /csrf bootstrap 讓呼叫序失去可讀性。
  document.cookie = 'XSRF-TOKEN=csrf-watchlist; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchlistApi http adapter — tracer:列出清單並把 AAPL 加入第一個清單', () => {
  it('httpListGetsWatchlists', async () => {
    stubFetchReturning([WATCHLIST_DTO]);

    const lists = await createHttpWatchlistApi('/api/v1').list();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(urlAt(0)).toBe('/api/v1/watchlists');
    expect(methodAt(0)).toBe('GET');
    expect(lists).toEqual([WATCHLIST_DTO]);
  });

  it('httpAddItemPostsSymbolInBodyWithCsrf', async () => {
    stubFetchReturning(WATCHLIST_DTO);
    const api = createHttpWatchlistApi('/api/v1');

    const dto = await api.addItem('wl-uuid', 'AAPL');

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl-uuid/items');
    expect(methodAt(0)).toBe('POST');
    expect(headerValue(initAt(0), 'x-xsrf-token')).toBe('csrf-watchlist');
    expect(bodyAt(0)).toEqual({ symbol: 'AAPL' });
    expect(dto).toEqual(WATCHLIST_DTO);
  });

  it('httpAddItemKeepsSlashSymbolOutOfPathAndEncodesId', async () => {
    stubFetchReturning(WATCHLIST_DTO);
    const api = createHttpWatchlistApi('/api/v1');

    await api.addItem('wl-uuid', 'USD/TWD');
    await api.addItem('a/b c', 'AAPL');

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl-uuid/items');
    expect(bodyAt(0)).toEqual({ symbol: 'USD/TWD' });
    expect(urlAt(1)).toBe('/api/v1/watchlists/a%2Fb%20c/items');
  });
});

describe('watchlistApi http adapter — 其餘端點', () => {
  it('httpRemoveItemDeletesByAssetUuid', async () => {
    stubFetchReturning(WATCHLIST_DTO);

    await createHttpWatchlistApi('/api/v1').removeItem('wl', 'a-uuid');

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl/items/a-uuid');
    expect(methodAt(0)).toBe('DELETE');
    expect(headerValue(initAt(0), 'x-xsrf-token')).toBe('csrf-watchlist');
  });

  it('httpReorderPutsAssetIds', async () => {
    stubFetchReturning(WATCHLIST_DTO);

    await createHttpWatchlistApi('/api/v1').reorder('wl', ['a', 'b']);

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl/items/order');
    expect(methodAt(0)).toBe('PUT');
    expect(bodyAt(0)).toEqual({ assetIds: ['a', 'b'] });
  });

  it('httpCreatePostsName', async () => {
    stubFetchReturning(WATCHLIST_DTO);

    await createHttpWatchlistApi('/api/v1').create('科技');

    expect(urlAt(0)).toBe('/api/v1/watchlists');
    expect(methodAt(0)).toBe('POST');
    expect(bodyAt(0)).toEqual({ name: '科技' });
  });

  it('httpRenamePatchesName', async () => {
    stubFetchReturning(WATCHLIST_DTO);

    await createHttpWatchlistApi('/api/v1').rename('wl', '長線');

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl');
    expect(methodAt(0)).toBe('PATCH');
    expect(bodyAt(0)).toEqual({ name: '長線' });
  });

  it('httpRemoveDeletesListAndResolvesVoid', async () => {
    stubFetchReturning(null);

    const result = await createHttpWatchlistApi('/api/v1').remove('wl');

    expect(urlAt(0)).toBe('/api/v1/watchlists/wl');
    expect(methodAt(0)).toBe('DELETE');
    expect(result).toBeUndefined();
  });

  it('httpIdsInPathAreEncoded', async () => {
    stubFetchReturning(WATCHLIST_DTO);
    const api = createHttpWatchlistApi('/api/v1');

    await api.removeItem('w/l', 'a/1');
    await api.reorder('w/l', []);
    await api.rename('w/l', 'x');

    expect(urlAt(0)).toBe('/api/v1/watchlists/w%2Fl/items/a%2F1');
    expect(urlAt(1)).toBe('/api/v1/watchlists/w%2Fl/items/order');
    expect(urlAt(2)).toBe('/api/v1/watchlists/w%2Fl');
  });
});

describe('watchlistApi http adapter — 錯誤', () => {
  it('httpOrderConflictSurfacesAsApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('WATCHLIST_ORDER_CONFLICT', 'Watchlist items changed; reload and retry', 'trace-409'),
      409,
    )));

    await expect(createHttpWatchlistApi('/api/v1').reorder('wl', ['a'])).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'WATCHLIST_ORDER_CONFLICT',
      status: 409,
      requestId: 'trace-409',
    });
  });

  it('httpItemLimitKeepsFields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('VALIDATION_FAILED', 'Validation failed', 'trace-400', { items: 'limit reached' }),
      400,
    )));

    await expect(createHttpWatchlistApi('/api/v1').addItem('wl', 'AAPL')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      fields: { items: 'limit reached' },
      requestId: 'trace-400',
    });
  });
});

describe('watchlistApi mock adapter — tracer', () => {
  it('mockListMapsStoreListsToAssetDtoShapeWithoutNetwork', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const lists = await createMockWatchlistApi().list();

    expect(lists.map(list => list.name)).toEqual(['核心持倉', 'Crypto', 'AI 概念']);
    expect(lists[0].items.map(item => item.symbol)).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT']);
    expect(Object.keys(lists[0].items[0]).sort()).toEqual(ASSET_DTO_FIELDS);
    expect(lists[0].items[0]).toMatchObject({
      symbol: 'AAPL',
      assetType: 'STOCK',
      latestPrice: 218.4,
      change: 1.42,
      changePercent: 0.66,
      volumeText: '52.1M',
      tradeable: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mockAddItemAppendsToTailAndPersistsInStore', async () => {
    const api = createMockWatchlistApi();
    const [first] = await api.list();

    const dto = await api.addItem(first.id, 'TSLA');

    expect(dto.items.map(item => item.symbol)).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT', 'TSLA']);
    expect(useMockPortfolioStore().watchlists[0].syms).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT', 'TSLA']);
  });
});

describe('createWatchlistApi', () => {
  it('selects the implementation by mode', () => {
    expect(createWatchlistApi('api').mode).toBe('api');
    expect(createWatchlistApi('mock').mode).toBe('mock');
  });
});
