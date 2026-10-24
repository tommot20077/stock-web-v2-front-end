import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCashApi,
  createHttpCashApi,
  createMockCashApi,
  resetMockCashLedgerForTests,
  type CashEntryDto,
  type CreateCashEntryRequest,
} from './cashApi';

/**
 * 本檔鎖住入出金寫入的送出契約(CASH-01 / CASH-03),照 `tradingApi.test.ts` 的形狀:
 *
 * 1. **payload 恰為後端 `CreateCashEntryRequest` 的六個欄位**:型別檢查抓不到「結構相容但
 *    多帶欄位」的呼叫端,只有 sorted key 陣列的 `toEqual` 抓得到。
 * 2. **`Idempotency-Key` 必帶,且值由呼叫端決定**:adapter 不自產 key。
 * 3. **401 refresh 後的 replay 沿用同一把 key**:現金帳本是 append-only,重複寫入改不回來。
 * 4. **API mode 的失敗以 `ApiClientError` 原樣上拋**,UI 層靠 `code` / `fields` 分派。
 *
 * fixture 為手寫,逐欄對應後端 `CashEntryDto`(04.1-04 / 04.1-06 凍結契約)。
 */

const CASH_REQUEST: CreateCashEntryRequest = {
  type: 'DEPOSIT',
  currency: 'TWD',
  amount: 50000,
  note: 'salary',
  occurredAt: '2026-10-01T09:00:00+08:00',
};

/** 後端 `CreateCashEntryRequest` 的完整欄位集合(已排序)。 */
const CONTRACT_FIELDS = ['amount', 'currency', 'note', 'occurredAt', 'reversalOfId', 'type'];

const CASH_DTO: CashEntryDto = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'DEPOSIT',
  currency: 'TWD',
  amount: 50000,
  note: 'salary',
  occurredAt: '2026-10-01T01:00:00Z',
  createdAt: '2026-10-01T01:00:05Z',
  reversalOfId: null,
  reversalOfOccurredAt: null,
  reversed: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope(data: unknown, traceId = 'trace-cash'): unknown {
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
  resetMockCashLedgerForTests();
  // 預先種 CSRF cookie,避免 apiClient 先打 /csrf bootstrap 讓呼叫序失去可讀性。
  document.cookie = 'XSRF-TOKEN=csrf-cash; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cashApi http adapter — createEntry', () => {
  it('httpCreateEntryPostsProjectedBodyWithIdempotencyKey', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(CASH_DTO))));

    const dto = await createHttpCashApi('/api/v1').createEntry(CASH_REQUEST, 'key-1');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const init = initAt(0);
    expect(urlAt(0)).toBe('/api/v1/portfolio/cash-entries');
    expect(String(init.method).toUpperCase()).toBe('POST');
    expect(headerValue(init, 'idempotency-key')).toBe('key-1');
    // CSRF 由 apiClient 統一注入(鐵律 1)。
    expect(headerValue(init, 'x-xsrf-token')).toBe('csrf-cash');
    expect(Object.keys(bodyAt(0)).sort()).toEqual(CONTRACT_FIELDS);
    expect(bodyAt(0).reversalOfId).toBeNull();
    expect(dto).toEqual(CASH_DTO);
  });

  it('httpCreateEntryDropsExcessFields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(CASH_DTO))));
    // TypeScript 的 excess property check 只對物件字面量生效;結構相容的更寬物件必須被逐欄投影擋下。
    const widerFormState = { ...CASH_REQUEST, extra: 'smuggled', userId: 7 } as CreateCashEntryRequest;

    await createHttpCashApi('/api/v1').createEntry(widerFormState, 'key-1');

    expect(Object.keys(bodyAt(0)).sort()).toEqual(CONTRACT_FIELDS);
    expect(bodyAt(0)).not.toHaveProperty('extra');
    expect(bodyAt(0)).not.toHaveProperty('userId');
  });

  it('httpCreateEntryReplaysWithSameKeyAfter401', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(successEnvelope(null, 'trace-refresh'));
      }
      const writes = vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith('/portfolio/cash-entries'));
      if (writes.length === 1) {
        return jsonResponse(failureEnvelope('AUTH_TOKEN_EXPIRED', 'Access token expired', 'trace-401'), 401);
      }
      return jsonResponse(successEnvelope(CASH_DTO));
    }));

    const dto = await createHttpCashApi('/api/v1').createEntry(CASH_REQUEST, 'key-1');

    const writeIndexes = vi.mocked(fetch).mock.calls
      .map((call, index) => ({ url: String(call[0]), index }))
      .filter(entry => entry.url.endsWith('/portfolio/cash-entries'))
      .map(entry => entry.index);
    expect(writeIndexes).toHaveLength(2);
    const firstKey = headerValue(initAt(writeIndexes[0]), 'idempotency-key');
    expect(firstKey).toBe('key-1');
    expect(headerValue(initAt(writeIndexes[1]), 'idempotency-key')).toBe(firstKey);
    expect(bodyAt(writeIndexes[1])).toEqual(bodyAt(writeIndexes[0]));
    expect(dto).toEqual(CASH_DTO);
  });

  it('httpErrorsSurfaceAsApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('CASH_IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused with a different payload', 'trace-409'),
      409,
    )));

    await expect(createHttpCashApi('/api/v1').createEntry(CASH_REQUEST, 'key-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'CASH_IDEMPOTENCY_KEY_REUSED',
      status: 409,
      requestId: 'trace-409',
    });
  });
});

describe('cashApi mock adapter — createEntry', () => {
  it('mockCreateEntryMakesNoNetworkCall', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const dto = await createMockCashApi().createEntry(CASH_REQUEST, 'key-1');

    expect(dto).toMatchObject({
      type: 'DEPOSIT',
      currency: 'TWD',
      amount: 50000,
      note: 'salary',
      reversalOfId: null,
      reversed: false,
    });
    expect(Object.keys(dto).sort()).toEqual(
      ['amount', 'createdAt', 'currency', 'id', 'note', 'occurredAt', 'reversalOfId', 'reversalOfOccurredAt', 'reversed', 'type'],
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('createCashApi', () => {
  it('selects the implementation by mode', () => {
    expect(createCashApi('api').mode).toBe('api');
    expect(createCashApi('mock').mode).toBe('mock');
  });
});
