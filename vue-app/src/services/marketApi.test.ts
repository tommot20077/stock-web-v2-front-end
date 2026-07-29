import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeSeries,
  createHttpMarketApi,
  createMarketApi,
  createMockMarketApi,
} from './marketApi';
import type { AssetDto } from './apiTypes';

/**
 * 本檔鎖住兩條「型別檢查抓不到、只有測試能抓」的契約:
 *
 * 1. **分頁**:`GET /api/v1/assets` 回 `ApiResponse<PageResponse<AssetDto>>`
 *    (`AssetController.java:24`),必須走 `apiPaginatedRequest`。誤用 `apiRequest`
 *    會拿到整包 PageResponse 當 data —— 執行時才炸,`vue-tsc` 不會紅。
 * 2. **string → number**:`KlineDto` 的 OHLCV 在 JSON 裡是**字串**
 *    (`KlineDto.java:25-29` 掛 `@JsonSerialize(using = ToStringSerializer.class)`),
 *    與 `AssetDto` 的 BigDecimal(JSON number)相反。fixture 必須用帶引號的字串,
 *    寫成 number 這些測試就失去意義。
 *
 * fixture 為手寫,**不宣稱**與真實 payload 逐位元一致(那屬 Phase 5 / VER-03);
 * 每個 fixture 都標註後端 `file:line` 出處以降低漂移(`04-VALIDATION.md` 要求)。
 */

/** 逐欄對應 `AssetDto.java:9-24`。價格是 JSON **number**(後端 BigDecimal 未掛 ToStringSerializer)。 */
const ASSET_FIXTURE: AssetDto = {
  uuid: '11111111-2222-3333-4444-555555555555',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  market: 'NASDAQ',
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

/**
 * 逐欄對應 `KlineDto.java:23-30`。
 * **OHLCV 一律帶引號** —— 後端序列化為字串,fixture 寫成 number 會讓 Test「string → number」失去意義。
 */
const KLINE_FIXTURE = [
  {
    bucket: '2026-07-25T00:00:00Z',
    open: '215.80000000',
    high: '219.10000000',
    low: '215.10000000',
    close: '218.40000000',
    volume: '52100000',
  },
  {
    bucket: '2026-07-25T01:00:00Z',
    open: '218.40000000',
    high: '220.00000000',
    low: '218.00000000',
    close: '219.55000000',
    volume: '48300000',
  },
];

const KLINE_FROM = '2026-07-25T00:00:00Z';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pagedAssets(items: AssetDto[], page = 0, size = 10, totalElements = items.length) {
  return {
    success: true,
    data: { items, page, size, totalElements, totalPages: Math.ceil(totalElements / size) },
    error: null,
    meta: { traceId: 'trace-assets' },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('marketApi http adapter — searchAssets', () => {
  it('consumes the paginated envelope (items / totalElements), not a bare array', async () => {
    // Pitfall 7:誤用 apiRequest 會讓 page.items 是 undefined,這條就紅。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(pagedAssets([ASSET_FIXTURE], 0, 10, 37))));

    const page = await createHttpMarketApi('/api/v1').searchAssets({ query: 'AAP', page: 0, size: 10 });

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items).toEqual([ASSET_FIXTURE]);
    expect(page.totalElements).toBe(37);
    expect(page).toMatchObject({ page: 0, size: 10, totalPages: 4 });
  });

  it('builds the assets query string literally (query / page / size)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(pagedAssets([ASSET_FIXTURE], 0, 10, 1))));

    await createHttpMarketApi('/api/v1').searchAssets({ query: 'AAP', page: 0, size: 10 });

    expect(fetch).toHaveBeenCalledWith('/api/v1/assets?query=AAP&page=0&size=10', expect.any(Object));
  });

  it('defaults to page 0 / size 10 (UI-SPEC §2 typeahead 最多列 10 筆)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(pagedAssets([ASSET_FIXTURE], 0, 10, 1))));

    await createHttpMarketApi('/api/v1').searchAssets({ query: 'AAP' });

    expect(fetch).toHaveBeenCalledWith('/api/v1/assets?query=AAP&page=0&size=10', expect.any(Object));
  });

  it('forwards the AbortSignal untouched so the caller can cancel stale typeahead requests', async () => {
    // T-04-11:250ms debounce + 只採最後一次結果由 OrderTicket 實作,adapter 只需把 signal 傳穿。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(pagedAssets([ASSET_FIXTURE], 0, 10, 1))));
    const controller = new AbortController();

    await createHttpMarketApi('/api/v1').searchAssets({ query: 'AAP' }, controller.signal);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});

describe('marketApi http adapter — listKlines', () => {
  it('parses the string OHLCV into numbers only through closeSeries', async () => {
    // Pitfall 8:close 是 JSON 字串。closeSeries 是唯一的轉換點,OrderTicket 不自己寫 Number()。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: KLINE_FIXTURE,
      error: null,
      meta: { traceId: 'trace-klines' },
    })));

    const klines = await createHttpMarketApi('/api/v1').listKlines('AAPL', {
      interval: '1h',
      from: KLINE_FROM,
      limit: 48,
    });

    expect(typeof klines[0].close).toBe('string');

    const series = closeSeries(klines);
    expect(series[0]).toBe(218.4);
    expect(typeof series[0]).toBe('number');
    expect(series).toEqual([218.4, 219.55]);
  });

  it('builds the klines query string and never sends page / size (非分頁端點)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: KLINE_FIXTURE,
      error: null,
      meta: { traceId: 'trace-klines' },
    })));

    await createHttpMarketApi('/api/v1').listKlines('AAPL', {
      interval: '1h',
      from: KLINE_FROM,
      limit: 48,
    });

    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toBe('/api/v1/market/AAPL/klines?interval=1h&from=2026-07-25T00%3A00%3A00Z&limit=48');
    expect(url).not.toContain('page=');
    expect(url).not.toContain('size=');
  });

  it('encodes the symbol into the path and preserves its case (後端 symbol 大小寫敏感)', async () => {
    // T-04-12:使用者可控字串進入 URL path segment,必須 encodeURIComponent;
    // 且不得 toUpperCase()——`MarketController.klines` javadoc 明文「資產代號,大小寫敏感」。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      data: [],
      error: null,
      meta: { traceId: 'trace-klines' },
    })));

    await createHttpMarketApi('/api/v1').listKlines('2330.TW', { interval: '1d', from: KLINE_FROM });

    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url.startsWith('/api/v1/market/2330.TW/klines')).toBe(true);
  });

  it('lets ApiClientError through untouched (code + requestId from meta.traceId)', async () => {
    // adapter 不 catch、不重包:UI 層要靠 error.code 分派文案、靠 traceId 回報(04-UI-SPEC §7)。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false,
      data: null,
      error: { code: 'ASSET_NOT_FOUND', message: 'No price data for symbol' },
      meta: { traceId: 'trace-kline-404' },
    }, 404)));

    await expect(
      createHttpMarketApi('/api/v1').listKlines('NOPE', { interval: '1h', from: KLINE_FROM }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'ASSET_NOT_FOUND',
      status: 404,
      requestId: 'trace-kline-404',
    });
  });
});

describe('marketApi mock adapter', () => {
  it('returns AssetDto-shaped items without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const page = await createMockMarketApi().searchAssets({ query: 'AAP' });

    expect(page.items.length).toBeGreaterThan(0);
    for (const asset of page.items) {
      expect(typeof asset.symbol).toBe('string');
      expect(typeof asset.tradeable).toBe('boolean');
      expect(asset).toHaveProperty('latestPrice');
    }
    expect(page.items.map(asset => asset.symbol)).toContain('AAPL');
    expect(page).toMatchObject({ page: 0, size: 10 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('filters case-insensitively on symbol and name, and reports the untruncated totalElements', async () => {
    // totalElements 為 filter 後的**總數**,UI-SPEC §2 的 `truncated` 態靠它觸發。
    const bySymbol = await createMockMarketApi().searchAssets({ query: 'aapl' });
    expect(bySymbol.items.map(asset => asset.symbol)).toEqual(['AAPL']);

    const byName = await createMockMarketApi().searchAssets({ query: 'bitcoin' });
    expect(byName.items.map(asset => asset.symbol)).toEqual(['BTC']);

    const all = await createMockMarketApi().searchAssets({ query: '', size: 2 });
    expect(all.items).toHaveLength(2);
    expect(all.totalElements).toBeGreaterThan(2);
  });

  it('returns KlineDto[] whose close is a string, same shape as API mode', async () => {
    // OrderTicket 只有一條資料路徑:mock 與 API 回傳同形,元件不需要 if (live) 去讀 data.ts。
    const klines = await createMockMarketApi().listKlines('AAPL', {
      interval: '1h',
      from: KLINE_FROM,
      limit: 12,
    });

    expect(klines.length).toBeGreaterThan(0);
    expect(typeof klines[0].close).toBe('string');
    expect(typeof klines[0].open).toBe('string');
    expect(typeof klines[0].volume).toBe('string');
    expect(typeof klines[0].bucket).toBe('string');
    expect(closeSeries(klines).every(value => Number.isFinite(value))).toBe(true);
  });
});

describe('marketApi factory', () => {
  it('selects mock or http implementation by runtime mode and exposes no live window', () => {
    const mock = createMarketApi('mock');
    const http = createMarketApi('api', '/api/v1');

    expect(mock.mode).toBe('mock');
    expect(http.mode).toBe('api');
    // 與 portfolioApi 不同:market domain 沒有 mock 專屬 reactive 狀態,兩種實作都不提供 live。
    expect(http.live).toBeUndefined();
    expect(mock.live).toBeUndefined();
  });
});
