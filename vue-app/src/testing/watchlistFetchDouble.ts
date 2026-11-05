import { vi } from 'vitest';
import type { AssetDto } from '../services/apiTypes';
import type { WatchlistDto } from '../services/watchlistApi';

// 測試專用:有狀態的 watchlist 後端 fetch double(WatchlistPicker / Markets / Chart 共用)。
// 只路由 `/api/v1/watchlists/**`;其他 URL 一律丟錯,讓「頁面偷打了別的 API」立刻可見。

/**
 * uuid 刻意與 symbol 不同字面,讓「removeItem 的路徑用回應 DTO 的 uuid,不是 symbol」可被斷言。
 */
export function assetDto(symbol: string, over: Partial<AssetDto> = {}): AssetDto {
  return {
    uuid: `uuid-${symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}-7c1`,
    symbol,
    name: symbol,
    assetType: 'STOCK',
    market: 'US',
    currency: 'USD',
    sector: null,
    tradeable: true,
    latestPrice: 100,
    change: 1,
    changePercent: 1,
    volumeText: null,
    high: null,
    low: null,
    ...over,
  };
}

export function watchlistDto(id: string, name: string, symbols: string[]): WatchlistDto {
  return { id, name, items: symbols.map(symbol => assetDto(symbol)) };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function apiSuccess(data: unknown): Response {
  return jsonResponse({ success: true, data, error: null, meta: { traceId: 'trace-ok' } });
}

export function apiFailure(code: string, traceId: string, status = 503, fields: Record<string, string> | null = null): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: { code, message: 'BackendMessageMustNotReachTheDom', ...(fields ? { fields } : {}) },
    meta: { traceId },
  }, status);
}

export interface WatchlistRoutes {
  /** 覆寫 `GET /watchlists`;參數為第幾次 GET(0 起算)。 */
  list?: (call: number) => Response | Promise<Response>;
  /** 覆寫 `POST /watchlists`;回傳 undefined 時走預設行為。 */
  create?: (name: string) => Response | Promise<Response> | undefined;
  /** 覆寫 `POST /watchlists/{id}/items`;回傳 undefined 時走預設行為。 */
  addItem?: (listId: string, symbol: string) => Response | Promise<Response> | undefined;
  /** 覆寫 `DELETE /watchlists/{id}/items/{assetId}`;回傳 undefined 時走預設行為。 */
  removeItem?: (listId: string, assetId: string) => Response | Promise<Response> | undefined;
  /** 覆寫 `PATCH /watchlists/{id}`(改名);回傳 undefined 時走預設行為。 */
  rename?: (listId: string, name: string) => Response | Promise<Response> | undefined;
  /** 覆寫 `DELETE /watchlists/{id}`;回傳 undefined 時走預設行為。 */
  remove?: (listId: string) => Response | Promise<Response> | undefined;
  /** 覆寫 `PUT /watchlists/{id}/items/order`;參數含第幾次 PUT(0 起算);回傳 undefined 時走預設行為。 */
  reorder?: (listId: string, assetIds: string[], call: number) => Response | Promise<Response> | undefined;
}

function clone(lists: WatchlistDto[]): WatchlistDto[] {
  return lists.map(list => ({ ...list, items: list.items.map(item => ({ ...item })) }));
}

export function watchlistFetch(initial: WatchlistDto[], routes: WatchlistRoutes = {}) {
  let lists = clone(initial);
  let listGets = 0;
  let created = 0;
  let defaults = 0;
  let reorders = 0;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const path = url.replace(/^.*\/api\/v1/, '');
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

    if (path === '/watchlists' && method === 'GET') {
      const call = listGets;
      listGets += 1;
      if (routes.list) return routes.list(call);
      // D-17:0 個清單時後端在 GET 重建空的「我的自選」。
      if (lists.length === 0) {
        defaults += 1;
        lists = [{ id: `wl-default-${defaults}`, name: '我的自選', items: [] }];
      }
      return apiSuccess(clone(lists));
    }
    if (path === '/watchlists' && method === 'POST') {
      const name = String(body.name);
      const override = routes.create?.(name);
      if (override) return override;
      created += 1;
      const list: WatchlistDto = { id: `wl-created-${created}`, name, items: [] };
      lists = [...lists, list];
      return apiSuccess(clone([list])[0]);
    }
    const listMatch = path.match(/^\/watchlists\/([^/]+)$/);
    if (listMatch) {
      const listId = decodeURIComponent(listMatch[1]);
      const list = lists.find(candidate => candidate.id === listId);
      if (method === 'PATCH') {
        const name = String(body.name);
        const override = routes.rename?.(listId, name);
        if (override) return override;
        if (!list) return apiFailure('WATCHLIST_NOT_FOUND', 'trace-404', 404);
        list.name = name;
        return apiSuccess(clone([list])[0]);
      }
      if (method === 'DELETE') {
        const override = routes.remove?.(listId);
        if (override) return override;
        if (!list) return apiFailure('WATCHLIST_NOT_FOUND', 'trace-404', 404);
        lists = lists.filter(candidate => candidate.id !== listId);
        return apiSuccess(null);
      }
    }
    const orderMatch = path.match(/^\/watchlists\/([^/]+)\/items\/order$/);
    if (orderMatch && method === 'PUT') {
      const listId = decodeURIComponent(orderMatch[1]);
      const assetIds = (body.assetIds as string[]) ?? [];
      const call = reorders;
      reorders += 1;
      const override = routes.reorder?.(listId, assetIds, call);
      if (override) return override;
      const list = lists.find(candidate => candidate.id === listId);
      if (!list) return apiFailure('WATCHLIST_NOT_FOUND', 'trace-404', 404);
      const byId = new Map(list.items.map(item => [item.uuid, item]));
      const sameSet = assetIds.length === list.items.length && assetIds.every(id => byId.has(id))
        && new Set(assetIds).size === assetIds.length;
      if (!sameSet) return apiFailure('WATCHLIST_ORDER_CONFLICT', 'trace-409', 409);
      list.items = assetIds.map(id => byId.get(id)!);
      return apiSuccess(clone([list])[0]);
    }
    const itemMatch = path.match(/^\/watchlists\/([^/]+)\/items(?:\/([^/]+))?$/);
    if (itemMatch) {
      const listId = decodeURIComponent(itemMatch[1]);
      const list = lists.find(candidate => candidate.id === listId);
      if (method === 'POST') {
        const symbol = String(body.symbol);
        const override = routes.addItem?.(listId, symbol);
        if (override) return override;
        if (!list) return apiFailure('WATCHLIST_NOT_FOUND', 'trace-404', 404);
        if (!list.items.some(item => item.symbol === symbol)) list.items = [...list.items, assetDto(symbol)];
        return apiSuccess(clone([list])[0]);
      }
      if (method === 'DELETE' && itemMatch[2]) {
        const assetId = decodeURIComponent(itemMatch[2]);
        const override = routes.removeItem?.(listId, assetId);
        if (override) return override;
        if (!list) return apiFailure('WATCHLIST_NOT_FOUND', 'trace-404', 404);
        list.items = list.items.filter(item => item.uuid !== assetId);
        return apiSuccess(clone([list])[0]);
      }
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  return Object.assign(fn, { lists: () => clone(lists) });
}

export type WatchlistFetch = ReturnType<typeof watchlistFetch>;

/** 依 method + path 片段數出呼叫次數。 */
export function callsTo(fetchFn: WatchlistFetch, method: string, pathPart: string): Array<[string, RequestInit | undefined]> {
  return fetchFn.mock.calls
    .map(([input, init]) => [String(input), init] as [string, RequestInit | undefined])
    .filter(([url, init]) => (init?.method ?? 'GET') === method && url.includes(pathPart));
}
