import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHoldingEventApi,
  createHttpHoldingEventApi,
  createMockHoldingEventApi,
  resetMockHoldingEventsForTests,
  type CreateDividendRequest,
  type CreateShareAdjustmentRequest,
  type DividendDto,
  type ShareAdjustmentDto,
} from './holdingEventApi';

/**
 * 本檔鎖住股利與股數調整寫入的送出契約(DIV-01 / ADJ-01),照 `cashApi.test.ts` 的形狀:
 *
 * 1. **payload 恰為後端 request record 的欄位**:sorted key 陣列的 `toEqual` 抓「結構相容但多帶欄位」。
 * 2. **`Idempotency-Key` 必帶,且值由呼叫端決定**:adapter 不自產 key(T-04.2-37)。
 * 3. **401 refresh 後的 replay 沿用同一把 key**:兩張表都是 append-only,重複寫入改不回來。
 * 4. **API mode 的失敗以 `ApiClientError` 原樣上拋**,保留 code / status / requestId。
 *
 * fixture 為手寫,逐欄對應後端 `DividendDto` / `ShareAdjustmentDto`(04.2-02 凍結契約)。
 */

/** 後端 `CreateDividendRequest` 的完整欄位集合(已排序)。 */
const DIVIDEND_CONTRACT_FIELDS = ['amount', 'note', 'paidAt', 'reversalOfId', 'symbol', 'withholdingTax'];

/** 後端 `CreateShareAdjustmentRequest` 的完整欄位集合(已排序)。 */
const ADJUSTMENT_CONTRACT_FIELDS = [
  'effectiveDate', 'note', 'quantity', 'ratioNew', 'ratioOld', 'reversalOfId', 'symbol', 'type',
];

const DIVIDEND_REQUEST: CreateDividendRequest = { symbol: 'AAPL', amount: 120 };

const DIVIDEND_DTO: DividendDto = {
  id: '11111111-2222-3333-4444-555555555555',
  symbol: 'AAPL',
  currency: 'USD',
  amount: 120,
  withholdingTax: 0,
  paidAt: '2026-10-30T09:00:00+08:00',
  createdAt: '2026-10-30T09:00:01+08:00',
  note: null,
  reversalOfId: null,
  reversed: false,
};

const SPLIT_REQUEST: CreateShareAdjustmentRequest = {
  symbol: 'AAPL',
  type: 'SPLIT',
  ratioNew: 4,
  ratioOld: 1,
  effectiveDate: '2026-10-30',
};

const SPLIT_DTO: ShareAdjustmentDto = {
  id: '66666666-7777-8888-9999-000000000000',
  symbol: 'AAPL',
  currency: 'USD',
  type: 'SPLIT',
  quantityDelta: 300,
  ratioNew: 4,
  ratioOld: 1,
  effectiveDate: '2026-10-30',
  createdAt: '2026-10-30T09:00:01+08:00',
  note: null,
  reversalOfId: null,
  reversed: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope(data: unknown, traceId = 'trace-holding'): unknown {
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

function headerValue(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

function bodyAt(index: number): Record<string, unknown> {
  return JSON.parse(String(initAt(index).body)) as Record<string, unknown>;
}

beforeEach(() => {
  // mock 實作直接讀寫 mock portfolio store;每個測試一個乾淨的 pinia。
  setActivePinia(createPinia());
  resetMockHoldingEventsForTests();
  // 預先種 CSRF cookie,避免 apiClient 先打 /csrf bootstrap 讓呼叫序失去可讀性。
  document.cookie = 'XSRF-TOKEN=csrf-holding; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holdingEventApi http adapter — createDividend(tracer)', () => {
  it('httpCreateDividendPostsProjectedBodyWithIdempotencyKey', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(DIVIDEND_DTO))));

    const dto = await createHttpHoldingEventApi('/api/v1').createDividend(DIVIDEND_REQUEST, 'k-1');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const init = initAt(0);
    expect(urlAt(0)).toBe('/api/v1/portfolio/dividends');
    expect(String(init.method).toUpperCase()).toBe('POST');
    expect(headerValue(init, 'idempotency-key')).toBe('k-1');
    // CSRF 由 apiClient 統一注入(鐵律 1)。
    expect(headerValue(init, 'x-xsrf-token')).toBe('csrf-holding');
    expect(Object.keys(bodyAt(0)).sort()).toEqual(DIVIDEND_CONTRACT_FIELDS);
    expect(bodyAt(0)).toEqual({
      symbol: 'AAPL',
      amount: 120,
      withholdingTax: null,
      paidAt: null,
      note: null,
      reversalOfId: null,
    });
    expect(dto).toEqual(DIVIDEND_DTO);
  });

  it('httpCreateDividendDropsExcessFields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(DIVIDEND_DTO))));
    const widerFormState = { ...DIVIDEND_REQUEST, currency: 'USD', userId: 7 } as CreateDividendRequest;

    await createHttpHoldingEventApi('/api/v1').createDividend(widerFormState, 'k-1');

    expect(Object.keys(bodyAt(0)).sort()).toEqual(DIVIDEND_CONTRACT_FIELDS);
    expect(bodyAt(0)).not.toHaveProperty('currency');
    expect(bodyAt(0)).not.toHaveProperty('userId');
  });

  it('httpCreateDividendReplaysWithSameKeyAfter401', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(successEnvelope(null, 'trace-refresh'));
      }
      const writes = vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith('/portfolio/dividends'));
      if (writes.length === 1) {
        return jsonResponse(failureEnvelope('AUTH_TOKEN_EXPIRED', 'Access token expired', 'trace-401'), 401);
      }
      return jsonResponse(successEnvelope(DIVIDEND_DTO));
    }));

    const dto = await createHttpHoldingEventApi('/api/v1').createDividend(DIVIDEND_REQUEST, 'k-1');

    const writeIndexes = vi.mocked(fetch).mock.calls
      .map((call, index) => ({ url: String(call[0]), index }))
      .filter(entry => entry.url.endsWith('/portfolio/dividends'))
      .map(entry => entry.index);
    expect(writeIndexes).toHaveLength(2);
    expect(headerValue(initAt(writeIndexes[0]), 'idempotency-key')).toBe('k-1');
    expect(headerValue(initAt(writeIndexes[1]), 'idempotency-key')).toBe('k-1');
    expect(bodyAt(writeIndexes[1])).toEqual(bodyAt(writeIndexes[0]));
    expect(dto).toEqual(DIVIDEND_DTO);
  });

  it('httpCreateDividendErrorsSurfaceAsApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('DIVIDEND_IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused with a different payload', 'trace-409'),
      409,
    )));

    await expect(createHttpHoldingEventApi('/api/v1').createDividend(DIVIDEND_REQUEST, 'k-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'DIVIDEND_IDEMPOTENCY_KEY_REUSED',
      status: 409,
      requestId: 'trace-409',
    });
  });
});

describe('holdingEventApi http adapter — createShareAdjustment', () => {
  it('httpCreateShareAdjustmentPostsProjectedBodyWithIdempotencyKey', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(SPLIT_DTO))));

    const dto = await createHttpHoldingEventApi('/api/v1').createShareAdjustment(SPLIT_REQUEST, 'k-2');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const init = initAt(0);
    expect(urlAt(0)).toBe('/api/v1/portfolio/share-adjustments');
    expect(String(init.method).toUpperCase()).toBe('POST');
    expect(headerValue(init, 'idempotency-key')).toBe('k-2');
    expect(Object.keys(bodyAt(0)).sort()).toEqual(ADJUSTMENT_CONTRACT_FIELDS);
    expect(bodyAt(0)).toEqual({
      symbol: 'AAPL',
      type: 'SPLIT',
      quantity: null,
      ratioNew: 4,
      ratioOld: 1,
      effectiveDate: '2026-10-30',
      note: null,
      reversalOfId: null,
    });
    expect(dto).toEqual(SPLIT_DTO);
  });

  it('httpCreateShareAdjustmentErrorsSurfaceAsApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('VALIDATION_FAILED', 'Validation failed', 'trace-400', { effectiveDate: 'must not be in the future' }),
      400,
    )));

    await expect(createHttpHoldingEventApi('/api/v1').createShareAdjustment(SPLIT_REQUEST, 'k-2')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      requestId: 'trace-400',
      fields: { effectiveDate: 'must not be in the future' },
    });
  });
});

describe('holdingEventApi mock adapter — createDividend', () => {
  it('mockCreateDividendReturnsDividendDtoWithoutNetwork', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const dto = await createMockHoldingEventApi().createDividend(DIVIDEND_REQUEST, 'k-1');

    expect(dto).toMatchObject({
      symbol: 'AAPL',
      currency: 'USD',
      amount: 120,
      withholdingTax: 0,
      note: null,
      reversalOfId: null,
      reversed: false,
    });
    expect(Object.keys(dto).sort()).toEqual(Object.keys(DIVIDEND_DTO).sort());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('createHoldingEventApi', () => {
  it('selects the implementation by mode', () => {
    expect(createHoldingEventApi('api').mode).toBe('api');
    expect(createHoldingEventApi('mock').mode).toBe('mock');
  });
});
