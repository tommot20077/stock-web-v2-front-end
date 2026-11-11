import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHoldingEventApi,
  createHttpHoldingEventApi,
  createMockHoldingEventApi,
  listMockHoldingEvents,
  resetMockHoldingEventsForTests,
  toDividend,
  toShareAdjustment,
  type CreateDividendInput,
  type CreateShareAdjustmentInput,
  type DividendDto,
  type ShareAdjustmentDto,
} from './holdingEventApi';
import type { ApiClientError } from './apiClient';
import { parseDecimal, toWire } from './decimal';
import { useMockPortfolioStore } from '../stores/mockPortfolio';

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

/** 測試用簡寫:字串 → Decimal(domain 輸入)。 */
const d = parseDecimal;

const DIVIDEND_REQUEST: CreateDividendInput = { symbol: 'AAPL', amount: d('120') };

/** wire fixture:金額為字串(後端 `@DecimalString`,scale 8)。 */
const DIVIDEND_DTO: DividendDto = {
  id: '11111111-2222-3333-4444-555555555555',
  symbol: 'AAPL',
  currency: 'USD',
  amount: '120.00000000',
  withholdingTax: '0.00000000',
  paidAt: '2026-10-30T09:00:00+08:00',
  createdAt: '2026-10-30T09:00:01+08:00',
  note: null,
  reversalOfId: null,
  reversed: false,
};

const SPLIT_REQUEST: CreateShareAdjustmentInput = {
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
  quantityDelta: '300.00000000',
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
      amount: '120',
      withholdingTax: null,
      paidAt: null,
      note: null,
      reversalOfId: null,
    });
    expect(dto).toEqual(toDividend(DIVIDEND_DTO));
    expect(dto.amount.eq(d('120'))).toBe(true);
  });

  it('httpCreateDividendDropsExcessFields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(DIVIDEND_DTO))));
    const widerFormState = { ...DIVIDEND_REQUEST, currency: 'USD', userId: 7 } as CreateDividendInput;

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
    expect(dto).toEqual(toDividend(DIVIDEND_DTO));
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
    expect(dto).toEqual(toShareAdjustment(SPLIT_DTO));
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

    expect(toWire(dto.amount)).toBe('120');
    expect(toWire(dto.withholdingTax)).toBe('0');
    expect(dto).toMatchObject({
      symbol: 'AAPL',
      currency: 'USD',
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

async function thrownBy(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiClientError;
  }
  throw new Error('expected the promise to reject');
}

/** 以本機日曆日表示的「今天 + offset 天」(`yyyy-MM-dd`),與 mock 的除權日比較同一基準。 */
function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 把 AAPL 持倉設成 1000 股 @100(契約的配股攤薄範例)。 */
function seedAaplPosition(qty = 1000, avg = 100): void {
  const store = useMockPortfolioStore();
  store.positions = [
    { sym: 'AAPL', name: 'Apple Inc.', qty, avg, price: 218.4, sector: 'Tech' },
    ...store.positions.filter(position => position.sym !== 'AAPL'),
  ];
}

function aaplPosition() {
  return useMockPortfolioStore().positions.find(position => position.sym === 'AAPL');
}

describe('holdingEventApi mock adapter — 現金股利(UI-SPEC §Interaction 0)', () => {
  it('writes a DIV row to the head of mock trades and records the event', async () => {
    const store = useMockPortfolioStore();
    const before = store.trades.length;

    const dto = await createMockHoldingEventApi().createDividend(
      { symbol: 'AAPL', amount: d('120'), withholdingTax: d('30'), paidAt: '2026-10-30T09:00:00+08:00', note: 'Q3' },
      'k-1',
    );

    expect(store.trades).toHaveLength(before + 1);
    expect(store.trades[0]).toMatchObject({ type: 'DIV', sym: 'AAPL', d: '2026-10-30', note: 'Q3' });
    // mock Trade 沒有「總額」欄位,總額 = qty × px;寫入後必須等於實領金額。
    expect(store.trades[0].qty * store.trades[0].px).toBe(120);
    expect(dto).toMatchObject({ paidAt: '2026-10-30T09:00:00+08:00', note: 'Q3' });
    expect([toWire(dto.amount), toWire(dto.withholdingTax)]).toEqual(['120', '30']);
    const events = listMockHoldingEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: dto.id,
      kind: 'CASH_DIVIDEND',
      symbol: 'AAPL',
      currency: 'USD',
      amount: 120,
      withholdingTax: 30,
      quantity: null,
      reversed: false,
      reversible: true,
    });
  });

  it('accepts a dividend without any holding(D-03:股利常在賣出後才入帳)', async () => {
    const dto = await createMockHoldingEventApi().createDividend({ symbol: 'TSLA', amount: d('50') }, 'k-1');

    expect(dto.symbol).toBe('TSLA');
  });

  it('returns the same record for the same key and payload without writing twice', async () => {
    const api = createMockHoldingEventApi();
    const store = useMockPortfolioStore();
    const before = store.trades.length;

    const first = await api.createDividend(DIVIDEND_REQUEST, 'k-1');
    const second = await api.createDividend(DIVIDEND_REQUEST, 'k-1');

    expect(second.id).toBe(first.id);
    expect(store.trades).toHaveLength(before + 1);
    expect(listMockHoldingEvents()).toHaveLength(1);
  });

  it('rejects the same key with a different amount as DIVIDEND_IDEMPOTENCY_KEY_REUSED', async () => {
    const api = createMockHoldingEventApi();
    await api.createDividend(DIVIDEND_REQUEST, 'k-1');

    const error = await thrownBy(api.createDividend({ ...DIVIDEND_REQUEST, amount: d('121') }, 'k-1'));

    expect(error).toMatchObject({ name: 'ApiClientError', status: 409, code: 'DIVIDEND_IDEMPOTENCY_KEY_REUSED' });
    expect(listMockHoldingEvents()).toHaveLength(1);
  });

  it('rejects amount <= 0 with VALIDATION_FAILED fields.amount', async () => {
    const error = await thrownBy(createMockHoldingEventApi().createDividend({ symbol: 'AAPL', amount: d('0') }, 'k-1'));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('amount');
    expect(listMockHoldingEvents()).toHaveLength(0);
  });

  it('rejects an unknown symbol with ASSET_NOT_FOUND fields.symbol', async () => {
    const error = await thrownBy(createMockHoldingEventApi().createDividend({ symbol: 'NOPE', amount: d('10') }, 'k-1'));

    expect(error).toMatchObject({ status: 404, code: 'ASSET_NOT_FOUND' });
    expect(error.fields).toHaveProperty('symbol');
  });

  it('reverses a dividend: original becomes reversed, a second reversal is DIVIDEND_ALREADY_REVERSED', async () => {
    const api = createMockHoldingEventApi();
    const original = await api.createDividend({ symbol: 'AAPL', amount: d('120'), withholdingTax: d('30') }, 'k-1');

    const reversal = await api.createDividend(
      { symbol: 'AAPL', amount: d('120'), withholdingTax: d('30'), reversalOfId: original.id },
      'k-2',
    );

    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.reversed).toBe(false);
    const events = listMockHoldingEvents();
    const stored = events.find(event => event.id === original.id)!;
    expect(stored.reversed).toBe(true);
    expect(stored.reversible).toBe(false);
    const reversalEvent = events.find(event => event.id === reversal.id)!;
    expect(reversalEvent.reversible).toBe(false);
    expect(reversalEvent.reversalOfOccurredAt).toBe(original.paidAt);
    // 沖銷有可見效果:mock 交易多一列反向 DIV,股利淨額歸零。
    const aaplDivTotal = useMockPortfolioStore().trades
      .slice(0, 2)
      .reduce((sum, trade) => sum + trade.qty * trade.px, 0);
    expect(aaplDivTotal).toBe(0);

    const again = await thrownBy(api.createDividend(
      { symbol: 'AAPL', amount: d('120'), withholdingTax: d('30'), reversalOfId: original.id },
      'k-3',
    ));
    expect(again).toMatchObject({ status: 409, code: 'DIVIDEND_ALREADY_REVERSED' });

    const ofReversal = await thrownBy(api.createDividend(
      { symbol: 'AAPL', amount: d('120'), withholdingTax: d('30'), reversalOfId: reversal.id },
      'k-4',
    ));
    expect(ofReversal).toMatchObject({ status: 409, code: 'DIVIDEND_NOT_REVERSIBLE' });
  });

  it('rejects a reversal whose values do not mirror the original, naming the field', async () => {
    const api = createMockHoldingEventApi();
    const original = await api.createDividend({ symbol: 'AAPL', amount: d('120') }, 'k-1');

    const error = await thrownBy(api.createDividend({ symbol: 'AAPL', amount: d('100'), reversalOfId: original.id }, 'k-2'));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('amount');
  });

  it('rejects a reversal of an unknown record with DIVIDEND_NOT_FOUND', async () => {
    const error = await thrownBy(createMockHoldingEventApi().createDividend(
      { symbol: 'AAPL', amount: d('120'), reversalOfId: 'missing-id' },
      'k-1',
    ));

    expect(error).toMatchObject({ status: 404, code: 'DIVIDEND_NOT_FOUND' });
  });
});

describe('holdingEventApi mock adapter — 配股 / 拆股攤薄 mock 持倉', () => {
  it('stock dividend: 1000 @100 + 50 → 1050 @95.23809524(scale 8 HALF_UP,與後端相同)', async () => {
    seedAaplPosition();

    const dto = await createMockHoldingEventApi().createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50'), effectiveDate: '2026-01-10' },
      'k-1',
    );

    expect(aaplPosition()).toMatchObject({ qty: 1050, avg: 95.23809524 });
    expect(dto).toMatchObject({
      symbol: 'AAPL',
      currency: 'USD',
      type: 'STOCK_DIVIDEND',
      ratioNew: null,
      ratioOld: null,
      effectiveDate: '2026-01-10',
      reversalOfId: null,
      reversed: false,
    });
    expect(toWire(dto.quantityDelta)).toBe('50');
    expect(Object.keys(dto).sort()).toEqual(Object.keys(SPLIT_DTO).sort());
    expect(listMockHoldingEvents()[0]).toMatchObject({
      kind: 'STOCK_DIVIDEND',
      quantity: 50,
      effectiveDate: '2026-01-10',
      amount: null,
      reversible: true,
    });
  });

  it('split 4:1 multiplies quantity by 4 and divides average cost by 4', async () => {
    seedAaplPosition();

    const dto = await createMockHoldingEventApi().createShareAdjustment(SPLIT_REQUEST, 'k-1');

    expect(aaplPosition()).toMatchObject({ qty: 4000, avg: 25 });
    expect(dto).toMatchObject({ type: 'SPLIT', ratioNew: 4, ratioOld: 1 });
    expect(toWire(dto.quantityDelta)).toBe('3000');
  });

  it('reverse split 1:10 yields a negative quantityDelta', async () => {
    seedAaplPosition();

    const dto = await createMockHoldingEventApi().createShareAdjustment(
      { ...SPLIT_REQUEST, ratioNew: 1, ratioOld: 10 },
      'k-1',
    );

    expect(aaplPosition()).toMatchObject({ qty: 100, avg: 1000 });
    expect(toWire(dto.quantityDelta)).toBe('-900');
  });

  it('rejects an adjustment without a holding as TRADE_INSUFFICIENT_HOLDING', async () => {
    const error = await thrownBy(createMockHoldingEventApi().createShareAdjustment(
      { symbol: 'TSLA', type: 'STOCK_DIVIDEND', quantity: d('10'), effectiveDate: '2026-01-10' },
      'k-1',
    ));

    expect(error).toMatchObject({ status: 409, code: 'TRADE_INSUFFICIENT_HOLDING' });
    expect(listMockHoldingEvents()).toHaveLength(0);
  });

  it('rejects an effectiveDate later than today with VALIDATION_FAILED fields.effectiveDate', async () => {
    seedAaplPosition();

    const error = await thrownBy(createMockHoldingEventApi().createShareAdjustment(
      { ...SPLIT_REQUEST, effectiveDate: localDate(1) },
      'k-1',
    ));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('effectiveDate');
    expect(aaplPosition()).toMatchObject({ qty: 1000, avg: 100 });
  });

  it('rejects an effectiveDate earlier than the latest adjustment of the symbol', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();
    await api.createShareAdjustment({ ...SPLIT_REQUEST, effectiveDate: '2026-03-01' }, 'k-1');

    const error = await thrownBy(api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('10'), effectiveDate: '2026-02-01' },
      'k-2',
    ));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('effectiveDate');
  });

  it('rejects an equal split ratio with fields.ratio', async () => {
    seedAaplPosition();

    const error = await thrownBy(createMockHoldingEventApi().createShareAdjustment(
      { ...SPLIT_REQUEST, ratioNew: 3, ratioOld: 3 },
      'k-1',
    ));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('ratio');
  });

  it('only the latest active adjustment is reversible; reversing it restores the quantity', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();
    const first = await api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50'), effectiveDate: '2026-01-10' },
      'k-1',
    );
    const second = await api.createShareAdjustment({ ...SPLIT_REQUEST, effectiveDate: '2026-02-10' }, 'k-2');
    expect(aaplPosition()?.qty).toBe(4200);

    const notLatest = await thrownBy(api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50'), effectiveDate: '2026-01-10', reversalOfId: first.id },
      'k-3',
    ));
    expect(notLatest).toMatchObject({ status: 409, code: 'SHARE_ADJUSTMENT_NOT_REVERSIBLE' });
    expect(listMockHoldingEvents().map(event => [event.id, event.reversible])).toEqual([
      [first.id, false],
      [second.id, true],
    ]);

    const reversal = await api.createShareAdjustment(
      { ...SPLIT_REQUEST, effectiveDate: '2026-02-10', reversalOfId: second.id },
      'k-4',
    );

    expect(reversal).toMatchObject({ reversalOfId: second.id });
    expect(toWire(reversal.quantityDelta)).toBe('3150');
    // 沖銷撤銷已記錄的 ΔQ、總成本不變。
    expect(aaplPosition()?.qty).toBe(1050);
    expect(aaplPosition()?.avg).toBe(95.23809524);
    const events = listMockHoldingEvents();
    expect(events.find(event => event.id === second.id)).toMatchObject({ reversed: true, reversible: false });
    expect(events.find(event => event.id === first.id)).toMatchObject({ reversed: false, reversible: true });
    expect(events.find(event => event.id === reversal.id)).toMatchObject({
      reversible: false,
      reversalOfEffectiveDate: '2026-02-10',
    });

    const ofReversal = await thrownBy(api.createShareAdjustment(
      { ...SPLIT_REQUEST, effectiveDate: '2026-02-10', reversalOfId: reversal.id },
      'k-5',
    ));
    expect(ofReversal).toMatchObject({ status: 409, code: 'SHARE_ADJUSTMENT_NOT_REVERSIBLE' });
  });

  it('idempotency: same payload returns the same record and adjusts once; different payload is KEY_REUSED', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();

    const first = await api.createShareAdjustment(SPLIT_REQUEST, 'k-1');
    const second = await api.createShareAdjustment(SPLIT_REQUEST, 'k-1');

    expect(second.id).toBe(first.id);
    expect(aaplPosition()?.qty).toBe(4000);
    const error = await thrownBy(api.createShareAdjustment({ ...SPLIT_REQUEST, ratioNew: 2 }, 'k-1'));
    expect(error).toMatchObject({ status: 409, code: 'SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED' });
  });
});

describe('holdingEventApi mock adapter — 回傳 clone 與 reset', () => {
  it('mutating returned values never leaks back into mock state', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();
    const dividend = await api.createDividend(DIVIDEND_REQUEST, 'k-1');
    const adjustment = await api.createShareAdjustment(SPLIT_REQUEST, 'k-2');

    dividend.amount = d('999');
    adjustment.quantityDelta = d('999');
    const listed = listMockHoldingEvents();
    listed[0].amount = 999;
    listed.pop();

    const fresh = listMockHoldingEvents();
    expect(fresh).toHaveLength(2);
    expect(fresh[0].amount).toBe(120);
    expect(fresh[1].quantity).toBe(3000);
    expect(toWire((await api.createDividend(DIVIDEND_REQUEST, 'k-1')).amount)).toBe('120');
  });

  it('resetMockHoldingEventsForTests clears recorded events and keys', async () => {
    const api = createMockHoldingEventApi();
    const first = await api.createDividend(DIVIDEND_REQUEST, 'k-1');

    resetMockHoldingEventsForTests();

    expect(listMockHoldingEvents()).toEqual([]);
    const second = await api.createDividend({ ...DIVIDEND_REQUEST, amount: d('121') }, 'k-1');
    expect(second.id).not.toBe(first.id);
  });
});

describe('holdingEventApi — 現金股利字串契約(05-20 / D-05 / D-08)', () => {
  const PRECISE = '123456789012.12345678';

  it('http:Decimal 輸入逐欄 toWire 送出,未填預扣稅送 null;回應字串 → Dividend 逐字往返', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({
      ...DIVIDEND_DTO,
      amount: PRECISE,
      withholdingTax: '0.00000000',
    }))));

    const dividend = await createHttpHoldingEventApi('/api/v1').createDividend(
      { symbol: 'AAPL', amount: d(PRECISE), withholdingTax: null },
      'k-precise',
    );

    // JSON 原文:金額是 JSON 字串(帶引號),不是 number。
    expect(String(initAt(0).body)).toContain('"amount":"123456789012.12345678"');
    expect(bodyAt(0).amount).toBe(PRECISE);
    expect(bodyAt(0).withholdingTax).toBeNull();
    expect(toWire(dividend.amount)).toBe(PRECISE);
    expect(dividend.withholdingTax.eq(d('0'))).toBe(true);
  });

  it('http:極小值不出現科學記號;預扣稅有填時送字串', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(DIVIDEND_DTO))));

    await createHttpHoldingEventApi('/api/v1').createDividend(
      { symbol: 'AAPL', amount: d('0.00000001'), withholdingTax: d('30.5') },
      'k-tiny',
    );

    const raw = String(initAt(0).body);
    expect(raw).not.toMatch(/e-/i);
    expect(bodyAt(0)).toMatchObject({ amount: '0.00000001', withholdingTax: '30.5' });
  });

  it('http:回應金額仍是 JS number → 在邊界丟 TypeError(T-05-27)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({
      ...DIVIDEND_DTO,
      amount: 120,
    }))));

    await expect(createHttpHoldingEventApi('/api/v1').createDividend(DIVIDEND_REQUEST, 'k-1'))
      .rejects.toBeInstanceOf(TypeError);
  });

  it('toDividend:預扣稅為 number 也丟 TypeError', () => {
    expect(() => toDividend({ ...DIVIDEND_DTO, withholdingTax: 0 } as unknown as DividendDto)).toThrow(TypeError);
  });

  it('mock:完整精度往返;同 key 的 "10" 與 "10.00000000" 視為同一筆(Decimal eq),不同金額為 KEY_REUSED', async () => {
    const api = createMockHoldingEventApi();
    const precise = await api.createDividend({ symbol: 'AAPL', amount: d(PRECISE) }, 'k-precise');
    expect(toWire(precise.amount)).toBe(PRECISE);

    const store = useMockPortfolioStore();
    const tradesBefore = store.trades.length;
    const first = await api.createDividend({ symbol: 'AAPL', amount: d('10'), withholdingTax: d('1') }, 'k-10');
    const second = await api.createDividend(
      { symbol: 'AAPL', amount: d('10.00000000'), withholdingTax: d('1.0') },
      'k-10',
    );
    expect(second.id).toBe(first.id);
    expect(store.trades).toHaveLength(tradesBefore + 1);

    const reused = await thrownBy(api.createDividend({ symbol: 'AAPL', amount: d('10.00000001') }, 'k-10'));
    expect(reused).toMatchObject({ status: 409, code: 'DIVIDEND_IDEMPOTENCY_KEY_REUSED' });
  });

  it('mock:金額 > 10^12 或 < 0.00000001 → fields.amount;預扣稅 > 10^12 → fields.withholdingTax(Decimal 比較)', async () => {
    const api = createMockHoldingEventApi();
    const tooLarge = await thrownBy(api.createDividend({ symbol: 'AAPL', amount: d('1000000000000.00000001') }, 'k-1'));
    expect(tooLarge.fields).toHaveProperty('amount');
    const tooSmall = await thrownBy(api.createDividend({ symbol: 'AAPL', amount: d('0.000000009') }, 'k-2'));
    expect(tooSmall.fields).toHaveProperty('amount');
    const tax = await thrownBy(api.createDividend(
      { symbol: 'AAPL', amount: d('1'), withholdingTax: d('1000000000000.00000001') },
      'k-3',
    ));
    expect(tax.fields).toHaveProperty('withholdingTax');
    expect(tax.fields).not.toHaveProperty('amount');
  });

  it('mock:沖銷值以 Decimal 比對原列("120" 與 "120.0" 相同)', async () => {
    const api = createMockHoldingEventApi();
    const original = await api.createDividend({ symbol: 'AAPL', amount: d('120'), withholdingTax: d('30') }, 'k-1');

    const reversal = await api.createDividend(
      { symbol: 'AAPL', amount: d('120.0'), withholdingTax: d('30.00000000'), reversalOfId: original.id },
      'k-2',
    );

    expect(reversal.reversalOfId).toBe(original.id);
    expect(toWire(reversal.amount)).toBe('120');
  });
});

describe('holdingEventApi — 股數調整字串契約(05-20 / D-05 / D-08)', () => {
  it('http 配股:quantity 以 toWire 送字串、比例送 null;回應 quantityDelta 字串 → Decimal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({
      ...SPLIT_DTO,
      type: 'STOCK_DIVIDEND',
      quantityDelta: '50.12345678',
      ratioNew: null,
      ratioOld: null,
    }))));

    const adjustment = await createHttpHoldingEventApi('/api/v1').createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50.12345678'), ratioNew: null, ratioOld: null, effectiveDate: '2026-10-30' },
      'k-stock',
    );

    expect(String(initAt(0).body)).toContain('"quantity":"50.12345678"');
    expect(bodyAt(0)).toMatchObject({ quantity: '50.12345678', ratioNew: null, ratioOld: null });
    expect(toWire(adjustment.quantityDelta)).toBe('50.12345678');
  });

  it('http 拆股:ratioNew / ratioOld 仍是 number(後端 Integer)、quantity 送 null;合股的負 ΔQ 保留符號', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({
      ...SPLIT_DTO,
      quantityDelta: '-900.00000000',
      ratioNew: 1,
      ratioOld: 10,
    }))));

    const adjustment = await createHttpHoldingEventApi('/api/v1').createShareAdjustment(
      { symbol: 'AAPL', type: 'SPLIT', quantity: null, ratioNew: 1, ratioOld: 10, effectiveDate: '2026-10-30' },
      'k-split',
    );

    expect(bodyAt(0)).toMatchObject({ quantity: null, ratioNew: 1, ratioOld: 10 });
    expect(adjustment.quantityDelta.eq(d('-900'))).toBe(true);
    expect(adjustment.ratioNew).toBe(1);
  });

  it('http:回應 quantityDelta 仍是 number → 丟 TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({ ...SPLIT_DTO, quantityDelta: 300 }))));

    await expect(createHttpHoldingEventApi('/api/v1').createShareAdjustment(SPLIT_REQUEST, 'k-1'))
      .rejects.toBeInstanceOf(TypeError);
  });

  it('mock 配股:同 key 的 "10" 與 "10.00000000" 視為同一筆、只調整一次;不同股數為 KEY_REUSED', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();
    const request = { symbol: 'AAPL', type: 'STOCK_DIVIDEND' as const, effectiveDate: '2026-01-10' };

    const first = await api.createShareAdjustment({ ...request, quantity: d('10') }, 'k-10');
    const second = await api.createShareAdjustment({ ...request, quantity: d('10.00000000') }, 'k-10');

    expect(second.id).toBe(first.id);
    expect(aaplPosition()?.qty).toBe(1010);
    const reused = await thrownBy(api.createShareAdjustment({ ...request, quantity: d('10.00000001') }, 'k-10'));
    expect(reused).toMatchObject({ status: 409, code: 'SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED' });
  });

  it('mock 配股:股數上下限以 Decimal 比較(10^9 + 0.00000001 超出)', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();

    const error = await thrownBy(api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('1000000000.00000001'), effectiveDate: '2026-01-10' },
      'k-1',
    ));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.fields).toHaveProperty('quantity');
    expect(aaplPosition()).toMatchObject({ qty: 1000, avg: 100 });
  });

  it('mock 沖銷配股:quantity 以 Decimal 比對原 ΔQ("50" 與 "50.0" 相同),不同值點名 fields.quantity', async () => {
    seedAaplPosition();
    const api = createMockHoldingEventApi();
    const original = await api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50'), effectiveDate: '2026-01-10' },
      'k-1',
    );

    const mismatch = await thrownBy(api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('49'), effectiveDate: '2026-01-10', reversalOfId: original.id },
      'k-2',
    ));
    expect(mismatch.fields).toHaveProperty('quantity');

    const reversal = await api.createShareAdjustment(
      { symbol: 'AAPL', type: 'STOCK_DIVIDEND', quantity: d('50.0'), effectiveDate: '2026-01-10', reversalOfId: original.id },
      'k-3',
    );
    expect(toWire(reversal.quantityDelta)).toBe('50');
    expect(aaplPosition()?.qty).toBe(1000);
    // mock 活動列(MockHoldingEvent)在 05-21 之前仍是 number。
    expect(listMockHoldingEvents().map(event => event.quantity)).toEqual([50, 50]);
  });
});
