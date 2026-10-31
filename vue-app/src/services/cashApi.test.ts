import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCashApi,
  createHttpCashApi,
  createMockCashApi,
  resetMockCashLedgerForTests,
  type CashEntryDto,
  type CreateCashEntryRequest,
} from './cashApi';
import type { ApiClientError } from './apiClient';

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

describe('cashApi http adapter — listEntries', () => {
  it('httpListEntriesUsesPaginatedRequest', async () => {
    const page = { items: [CASH_DTO], page: 2, size: 10, totalElements: 21, totalPages: 3 };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(page))));

    const result = await createHttpCashApi('/api/v1').listEntries({ page: 2, size: 10 });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(urlAt(0)).toBe('/api/v1/portfolio/cash-entries?page=2&size=10');
    expect(String(initAt(0).method ?? 'GET').toUpperCase()).toBe('GET');
    expect(result).toEqual(page);
  });

  it('omits the query string when no params are given', async () => {
    const page = { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(page))));

    await createHttpCashApi('/api/v1').listEntries();

    expect(urlAt(0)).toBe('/api/v1/portfolio/cash-entries');
  });
});

async function thrownBy(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiClientError;
  }
  throw new Error('expected the promise to reject');
}

describe('cashApi mock adapter — 固定種子與列表(UI-SPEC U-26)', () => {
  it('seeds exactly four entries, newest occurredAt first, with zero network calls', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const page = await createMockCashApi().listEntries({ page: 0, size: 10 });

    expect(page.items).toHaveLength(4);
    expect(page).toMatchObject({ page: 0, size: 10, totalElements: 4, totalPages: 1 });
    const times = page.items.map(item => Date.parse(item.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const summary = page.items.map(item => `${item.type} ${item.currency} ${item.amount}`);
    expect(summary).toEqual(expect.arrayContaining([
      'DEPOSIT TWD 500000',
      'DEPOSIT USD 20000',
      'WITHDRAWAL USD 500',
      'DEPOSIT USD 500',
    ]));
    const withdrawal = page.items.find(item => item.type === 'WITHDRAWAL')!;
    const reversal = page.items.find(item => item.reversalOfId !== null)!;
    expect(withdrawal.reversed).toBe(true);
    expect(reversal.reversalOfId).toBe(withdrawal.id);
    expect(reversal.reversalOfOccurredAt).toBe(withdrawal.occurredAt);
    expect(reversal.reversed).toBe(false);
    expect(page.items.filter(item => item.reversed)).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses fixed ids (no randomness) for the seed', async () => {
    const first = await createMockCashApi().listEntries();
    resetMockCashLedgerForTests();
    const second = await createMockCashApi().listEntries();

    expect(second.items.map(item => item.id)).toEqual(first.items.map(item => item.id));
  });

  it('paginates by size and reports totals', async () => {
    const api = createMockCashApi();

    const page0 = await api.listEntries({ page: 0, size: 3 });
    const page1 = await api.listEntries({ page: 1, size: 3 });

    expect(page0.items).toHaveLength(3);
    expect(page1.items).toHaveLength(1);
    expect(page0).toMatchObject({ totalElements: 4, totalPages: 2 });
  });

  it('reflects a new entry immediately and puts it first when it is the latest', async () => {
    const api = createMockCashApi();

    const created = await api.createEntry(
      { type: 'DEPOSIT', currency: 'EUR', amount: 10, occurredAt: '2099-01-01T00:00:00Z' },
      'key-new',
    );
    const page = await api.listEntries({ page: 0, size: 10 });

    expect(page.totalElements).toBe(5);
    expect(page.items[0].id).toBe(created.id);
  });

  it('does not leak internal state through returned objects', async () => {
    const api = createMockCashApi();
    const first = await api.listEntries({ page: 0, size: 10 });
    first.items.pop();
    first.items[0].amount = 1;

    const second = await api.listEntries({ page: 0, size: 10 });

    expect(second.items).toHaveLength(4);
    expect(second.items[0].amount).not.toBe(1);
  });
});

describe('cashApi mock adapter — 沖銷三條規則與冪等(與後端相同錯誤碼)', () => {
  async function seededId(type: string, currency: string, amount: number): Promise<string> {
    const page = await createMockCashApi().listEntries({ page: 0, size: 100 });
    return page.items.find(item => item.type === type && item.currency === currency && item.amount === amount)!.id;
  }

  it('reverses an entry and flips its reversed flag', async () => {
    const api = createMockCashApi();
    const originalId = await seededId('DEPOSIT', 'TWD', 500000);

    const reversal = await api.createEntry(
      { type: 'WITHDRAWAL', currency: 'TWD', amount: 500000, reversalOfId: originalId },
      'key-rev-1',
    );

    expect(reversal.reversalOfId).toBe(originalId);
    expect(reversal.reversalOfOccurredAt).not.toBeNull();
    const page = await api.listEntries({ page: 0, size: 100 });
    expect(page.items.find(item => item.id === originalId)!.reversed).toBe(true);
    expect(page.items.find(item => item.id === reversal.id)!.reversed).toBe(false);
  });

  it('rejects a second reversal of the same entry with CASH_ENTRY_ALREADY_REVERSED', async () => {
    const api = createMockCashApi();
    const originalId = await seededId('DEPOSIT', 'TWD', 500000);
    const body = { type: 'WITHDRAWAL', currency: 'TWD', amount: 500000, reversalOfId: originalId } as const;
    await api.createEntry(body, 'key-rev-1');

    const error = await thrownBy(api.createEntry(body, 'key-rev-2'));

    expect(error).toMatchObject({ name: 'ApiClientError', code: 'CASH_ENTRY_ALREADY_REVERSED', status: 409 });
  });

  it('rejects reversing a reversal entry with CASH_ENTRY_NOT_REVERSIBLE', async () => {
    const api = createMockCashApi();
    const page = await api.listEntries({ page: 0, size: 100 });
    const reversalEntry = page.items.find(item => item.reversalOfId !== null)!;

    const error = await thrownBy(api.createEntry(
      { type: 'WITHDRAWAL', currency: reversalEntry.currency, amount: reversalEntry.amount, reversalOfId: reversalEntry.id },
      'key-rev-x',
    ));

    expect(error).toMatchObject({ code: 'CASH_ENTRY_NOT_REVERSIBLE', status: 409 });
  });

  it('rejects an unknown original with a 404 CASH_ENTRY_NOT_FOUND', async () => {
    const error = await thrownBy(createMockCashApi().createEntry(
      { type: 'WITHDRAWAL', currency: 'TWD', amount: 1, reversalOfId: 'no-such-entry' },
      'key-rev-404',
    ));

    expect(error).toMatchObject({ code: 'CASH_ENTRY_NOT_FOUND', status: 404 });
  });

  it('rejects a reversal that does not mirror the original with fields.reversalOfId', async () => {
    const api = createMockCashApi();
    const originalId = await seededId('DEPOSIT', 'TWD', 500000);

    const wrongAmount = await thrownBy(api.createEntry(
      { type: 'WITHDRAWAL', currency: 'TWD', amount: 499999, reversalOfId: originalId },
      'key-a',
    ));
    const wrongCurrency = await thrownBy(api.createEntry(
      { type: 'WITHDRAWAL', currency: 'USD', amount: 500000, reversalOfId: originalId },
      'key-b',
    ));
    const wrongDirection = await thrownBy(api.createEntry(
      { type: 'DEPOSIT', currency: 'TWD', amount: 500000, reversalOfId: originalId },
      'key-c',
    ));

    for (const error of [wrongAmount, wrongCurrency, wrongDirection]) {
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
      expect(error.fields).toHaveProperty('reversalOfId');
    }
  });

  it('returns the same entry for a repeated key + payload (idempotent), even for a reversal', async () => {
    const api = createMockCashApi();
    const plain = { type: 'DEPOSIT', currency: 'JPY', amount: 1000, occurredAt: '2026-10-20T00:00:00Z' } as const;

    const first = await api.createEntry(plain, 'key-same');
    const second = await api.createEntry(plain, 'key-same');
    expect(second.id).toBe(first.id);

    const originalId = await seededId('DEPOSIT', 'USD', 20000);
    const reverse = { type: 'WITHDRAWAL', currency: 'USD', amount: 20000, reversalOfId: originalId } as const;
    const r1 = await api.createEntry(reverse, 'key-rev-same');
    const r2 = await api.createEntry(reverse, 'key-rev-same');
    expect(r2.id).toBe(r1.id);

    const page = await api.listEntries({ page: 0, size: 100 });
    expect(page.totalElements).toBe(6);
  });

  it('rejects the same key with a different amount as CASH_IDEMPOTENCY_KEY_REUSED', async () => {
    const api = createMockCashApi();
    await api.createEntry({ type: 'DEPOSIT', currency: 'TWD', amount: 100 }, 'key-reuse');

    const error = await thrownBy(api.createEntry({ type: 'DEPOSIT', currency: 'TWD', amount: 200 }, 'key-reuse'));

    expect(error).toMatchObject({ code: 'CASH_IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('rejects an unsupported currency and a non-positive amount as VALIDATION_FAILED with fields', async () => {
    const api = createMockCashApi();

    const currency = await thrownBy(api.createEntry({ type: 'DEPOSIT', currency: 'XXX', amount: 1 }, 'k1'));
    const amount = await thrownBy(api.createEntry({ type: 'DEPOSIT', currency: 'TWD', amount: 0 }, 'k2'));

    expect(currency).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(currency.fields).toHaveProperty('currency');
    expect(amount.fields).toHaveProperty('amount');
  });
});
