import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WATCHLIST_MAX_ITEMS,
  WATCHLIST_MAX_LISTS,
  createHttpWatchlistApi,
  createMockWatchlistApi,
  createWatchlistApi,
  type WatchlistDto,
} from './watchlistApi';
import { ApiClientError } from './apiClient';
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

async function thrownBy(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiClientError);
    return error as ApiClientError;
  }
  throw new Error('expected promise to reject');
}

async function expectApiError(
  promise: Promise<unknown>,
  expected: { status: number; code: string; fields?: Record<string, string> | null },
): Promise<void> {
  const error = await thrownBy(promise);
  expect(error.status).toBe(expected.status);
  expect(error.code).toBe(expected.code);
  if (expected.fields === null) {
    expect(error.fields).toBeNull();
  } else if (expected.fields) {
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(Object.keys(expected.fields).sort());
  }
}

/** 把 store 灌到指定清單數,用來逼近 20 上限。 */
function fillLists(count: number): void {
  const store = useMockPortfolioStore();
  store.watchlists = Array.from({ length: count }, (_, index) => ({ id: `l${index}`, name: `List ${index}`, syms: [] }));
}

describe('mock store watchlist actions(D-15)', () => {
  it('renameWatchlist / deleteWatchlist / setWatchlistOrder mutate the store', () => {
    const store = useMockPortfolioStore();

    store.renameWatchlist('core', '長線');
    store.setWatchlistOrder('core', ['MSFT', 'AAPL', 'NVDA', '2330.TW']);
    store.deleteWatchlist('crypto');

    expect(store.watchlists.map(list => list.name)).toEqual(['長線', 'AI 概念']);
    expect(store.watchlists[0].syms).toEqual(['MSFT', 'AAPL', 'NVDA', '2330.TW']);
  });

  it('existing actions keep their behaviour', () => {
    const store = useMockPortfolioStore();

    store.toggleWatch('TSLA');
    expect(store.watchlists[0].syms[0]).toBe('TSLA');
    store.moveWatchSymbol('core', 0, 1);
    expect(store.watchlists[0].syms.slice(0, 2)).toEqual(['AAPL', 'TSLA']);
  });
});

describe('watchlistApi mock adapter — list(D-17)', () => {
  it('rebuilds the default list when the store has none', async () => {
    useMockPortfolioStore().watchlists = [];

    const lists = await createMockWatchlistApi().list();

    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe('我的自選');
    expect(lists[0].items).toEqual([]);
    expect(useMockPortfolioStore().watchlists).toHaveLength(1);
  });

  it('projects FX, bond and unknown symbols with contract nulls', async () => {
    const store = useMockPortfolioStore();
    store.watchlists = [{ id: 'x', name: 'Mixed', syms: ['USD/TWD', 'US10Y', 'ZZZZ'] }];

    const [list] = await createMockWatchlistApi().list();
    const [fx, bond, unknown] = list.items;

    expect(fx).toMatchObject({ symbol: 'USD/TWD', assetType: 'FX', tradeable: false, latestPrice: 32.418, volumeText: null });
    expect(bond).toMatchObject({
      symbol: 'US10Y', assetType: 'BOND', tradeable: false, latestPrice: 4.218, change: 0.014,
      changePercent: null, volumeText: null, high: null, low: null, sector: null,
    });
    expect(unknown).toMatchObject({
      symbol: 'ZZZZ', latestPrice: null, change: null, changePercent: null, volumeText: null, high: null, low: null,
    });
    for (const item of list.items) expect(Object.keys(item).sort()).toEqual(ASSET_DTO_FIELDS);
  });

  it('returns clones that do not leak back into the store', async () => {
    const api = createMockWatchlistApi();
    const [first] = await api.list();

    first.name = 'tampered';
    first.items.pop();

    const [again] = await api.list();
    expect(again.name).toBe('核心持倉');
    expect(again.items).toHaveLength(4);
  });
});

describe('watchlistApi mock adapter — create', () => {
  it('trims the name and appends an empty list', async () => {
    const api = createMockWatchlistApi();

    const created = await api.create('  科技  ');

    expect(created.name).toBe('科技');
    expect(created.items).toEqual([]);
    const lists = await api.list();
    expect(lists.map(list => list.name)).toEqual(['核心持倉', 'Crypto', 'AI 概念', '科技']);
    expect(lists[3].id).toBe(created.id);
  });

  it('rejects blank or over-30 names with fields.name', async () => {
    const api = createMockWatchlistApi();

    await expectApiError(api.create('   '), { status: 400, code: 'VALIDATION_FAILED', fields: { name: '' } });
    await expectApiError(api.create('x'.repeat(31)), { status: 400, code: 'VALIDATION_FAILED', fields: { name: '' } });
    await expect(api.create('x'.repeat(30))).resolves.toMatchObject({ name: 'x'.repeat(30) });
  });

  it('rejects a duplicate name with DUPLICATE_RESOURCE', async () => {
    await expectApiError(createMockWatchlistApi().create(' 核心持倉 '), {
      status: 409, code: 'DUPLICATE_RESOURCE', fields: { name: '' },
    });
  });

  it('rejects the 21st list with fields.watchlists before the duplicate check', async () => {
    fillLists(WATCHLIST_MAX_LISTS);
    const api = createMockWatchlistApi();

    await expectApiError(api.create('New'), { status: 400, code: 'VALIDATION_FAILED', fields: { watchlists: '' } });
    await expectApiError(api.create('List 0'), { status: 400, code: 'VALIDATION_FAILED', fields: { watchlists: '' } });
    await expectApiError(api.create(''), { status: 400, code: 'VALIDATION_FAILED', fields: { name: '' } });
    expect(useMockPortfolioStore().watchlists).toHaveLength(WATCHLIST_MAX_LISTS);
  });

  it('ensures the default list exists before creating on an empty store', async () => {
    useMockPortfolioStore().watchlists = [];
    const api = createMockWatchlistApi();

    await api.create('科技');

    expect((await api.list()).map(list => list.name)).toEqual(['我的自選', '科技']);
  });
});

describe('watchlistApi mock adapter — rename / remove', () => {
  it('renames with trim and allows keeping its own name', async () => {
    const api = createMockWatchlistApi();

    await expect(api.rename('core', ' 長線 ')).resolves.toMatchObject({ id: 'core', name: '長線' });
    await expect(api.rename('core', '長線')).resolves.toMatchObject({ name: '長線' });
    expect(useMockPortfolioStore().watchlists[0].name).toBe('長線');
  });

  it('rename errors follow the backend order', async () => {
    const api = createMockWatchlistApi();

    await expectApiError(api.rename('missing', ''), { status: 400, code: 'VALIDATION_FAILED', fields: { name: '' } });
    await expectApiError(api.rename('missing', 'X'), { status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null });
    await expectApiError(api.rename('core', 'Crypto'), { status: 409, code: 'DUPLICATE_RESOURCE', fields: { name: '' } });
  });

  it('removes a list and rebuilds the default after the last one is gone', async () => {
    const api = createMockWatchlistApi();

    await expect(api.remove('crypto')).resolves.toBeUndefined();
    expect((await api.list()).map(list => list.id)).toEqual(['core', 'watchAI']);
    await expectApiError(api.remove('crypto'), { status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null });

    await api.remove('core');
    await api.remove('watchAI');
    const rebuilt = await api.list();
    expect(rebuilt.map(list => list.name)).toEqual(['我的自選']);
  });
});

describe('watchlistApi mock adapter — items', () => {
  it('addItem is idempotent and accepts FX / bonds', async () => {
    const api = createMockWatchlistApi();

    const same = await api.addItem('core', 'NVDA');
    expect(same.items.map(item => item.symbol)).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT']);

    const withFx = await api.addItem('core', 'USD/TWD');
    const withBond = await api.addItem('core', 'US10Y');
    expect(withFx.items.at(-1)?.symbol).toBe('USD/TWD');
    expect(withBond.items.map(item => item.symbol)).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT', 'USD/TWD', 'US10Y']);
  });

  it('addItem errors: blank symbol, missing list, unknown asset, 101st item', async () => {
    const api = createMockWatchlistApi();

    await expectApiError(api.addItem('core', '  '), { status: 400, code: 'VALIDATION_FAILED', fields: { symbol: '' } });
    await expectApiError(api.addItem('missing', 'AAPL'), { status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null });
    await expectApiError(api.addItem('core', 'NOPE'), { status: 404, code: 'ASSET_NOT_FOUND', fields: { symbol: '' } });

    const store = useMockPortfolioStore();
    store.watchlists[0].syms = Array.from({ length: WATCHLIST_MAX_ITEMS }, (_, index) => `S${index}`);
    await expectApiError(api.addItem('core', 'AAPL'), { status: 400, code: 'VALIDATION_FAILED', fields: { items: '' } });
    expect(store.watchlists[0].syms).toHaveLength(WATCHLIST_MAX_ITEMS);
    // 已在清單中的代號照冪等語義原樣回傳,即使已滿。
    await expect(api.addItem('core', 'S0')).resolves.toMatchObject({ id: 'core' });
  });

  it('removeItem removes by asset uuid and is idempotent', async () => {
    const api = createMockWatchlistApi();
    const [core] = await api.list();
    const nvda = core.items[1];

    const after = await api.removeItem('core', nvda.uuid);
    expect(after.items.map(item => item.symbol)).toEqual(['AAPL', '2330.TW', 'MSFT']);
    expect(useMockPortfolioStore().watchlists[0].syms).toEqual(['AAPL', '2330.TW', 'MSFT']);

    const again = await api.removeItem('core', nvda.uuid);
    expect(again.items.map(item => item.symbol)).toEqual(['AAPL', '2330.TW', 'MSFT']);
    await expectApiError(api.removeItem('missing', nvda.uuid), { status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null });
  });

  it('reorder rewrites the order when the set matches', async () => {
    const api = createMockWatchlistApi();
    const [core] = await api.list();
    const reversed = [...core.items].reverse().map(item => item.uuid);

    const dto = await api.reorder('core', reversed);

    expect(dto.items.map(item => item.symbol)).toEqual(['MSFT', '2330.TW', 'NVDA', 'AAPL']);
    expect(useMockPortfolioStore().watchlists[0].syms).toEqual(['MSFT', '2330.TW', 'NVDA', 'AAPL']);
  });

  it('reorder rejects missing / extra / duplicate ids with WATCHLIST_ORDER_CONFLICT', async () => {
    const api = createMockWatchlistApi();
    const [core] = await api.list();
    const ids = core.items.map(item => item.uuid);
    const conflict = { status: 409, code: 'WATCHLIST_ORDER_CONFLICT', fields: null };

    await expectApiError(api.reorder('core', ids.slice(1)), conflict);
    await expectApiError(api.reorder('core', [...ids, 'mock-asset-TSLA']), conflict);
    await expectApiError(api.reorder('core', [ids[0], ids[0], ids[1], ids[2]]), conflict);
    await expectApiError(api.reorder('missing', ids), { status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null });
    expect(useMockPortfolioStore().watchlists[0].syms).toEqual(['AAPL', 'NVDA', '2330.TW', 'MSFT']);
  });

  it('addItem on a missing list no longer crashes the mock', async () => {
    await expectApiError(createMockWatchlistApi().addItem('nope', 'AAPL'), {
      status: 404, code: 'WATCHLIST_NOT_FOUND', fields: null,
    });
  });
});
