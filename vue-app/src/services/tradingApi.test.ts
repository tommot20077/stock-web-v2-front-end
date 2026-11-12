import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpTradingApi,
  createMockTradingApi,
  createTradingApi,
  toTradeRecord,
  type CreateTradeInput,
} from './tradingApi';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { TradeDto } from './apiTypes';
import { isDecimal, parseDecimal, toWire, ZERO } from './decimal';

/**
 * 本檔鎖住四條「型別檢查抓不到、只有測試能抓」的交易送出契約:
 *
 * 1. **payload 恰為後端 `CreateTradeRequest` 的七個欄位**(TRAD-01/02)。多送一個
 *    `ordType` / `tif` / `orderId` 就是 judgment §1 的反例;而 TypeScript 的
 *    excess property check 只對「物件字面量」生效,呼叫端傳一個更寬的變數進來
 *    型別檢查是綠的 —— 只有 sorted key 陣列的 `toEqual` 抓得到。
 * 2. **`Idempotency-Key` 必帶,且值由呼叫端決定**(D-05)。adapter 不自產 key:
 *    「哪一次是同一次送出嘗試」只有 UI 層知道(D-14)。
 * 3. **401 refresh 後的 replay 沿用同一把 key**(Q5.4 / T-04-01)。若 replay 換 key,
 *    refresh 前那次**可能已成功**的交易會被重複建立 —— 而 `transactions` 是
 *    append-only 帳本,建錯改不回來。
 * 4. **mock 與 API 的失敗形狀一致**:mock oversell 也丟 `ApiClientError`,
 *    讓 OrderTicket 的錯誤處理在兩個 mode 只有一條路徑。
 *
 * fixture 為手寫,**不宣稱**與真實 payload 逐位元一致(那屬 Phase 5 / VER-03);
 * 每個 fixture 都標註後端 `file:line` 出處以降低漂移。
 */

/**
 * 逐欄對應 `CreateTradeRequest.java:18-28`(symbol / type / quantity / price / fee / note / executedAt)。
 * Phase 5 D-08:呼叫端傳 domain `CreateTradeInput`(金額為 Decimal),adapter 以 toWire 投影成字串。
 */
const TRADE_REQUEST: CreateTradeInput = {
  symbol: 'AAPL',
  type: 'BUY',
  quantity: parseDecimal('10'),
  // D-02:price 是使用者手動輸入的「實際成交價」,前端不發明滑價。
  price: parseDecimal('218.4'),
  // D-02:fee 是使用者手動輸入,預設 0;前端不發明費率。
  fee: parseDecimal('1.5'),
  note: '手動補登',
  // D-03:ISO-8601 **含 offset**(後端是 OffsetDateTime)。
  executedAt: '2026-07-29T10:30:00+08:00',
};

/** 後端 `CreateTradeRequest` 的完整欄位集合(已排序)—— 這個陣列就是 TRAD-02 的機械化契約。 */
const CONTRACT_FIELDS = ['executedAt', 'fee', 'note', 'price', 'quantity', 'symbol', 'type'];

/** 逐欄對應後端 `TradeDto.java`(前端 `apiTypes.ts` 的 `TradeDto`);金額為 `@DecimalString` 字串(05-14)。 */
const TRADE_DTO: TradeDto = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  symbol: 'AAPL',
  type: 'BUY',
  quantity: '10.00000000',
  price: '218.40000000',
  fee: '1.50000000',
  note: '手動補登',
  currency: 'USD',
  executedAt: '2026-07-29T02:30:00Z',
  createdAt: '2026-07-30T01:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successEnvelope(data: unknown, traceId = 'trace-trade'): unknown {
  return { success: true, data, error: null, meta: { traceId } };
}

function failureEnvelope(
  code: string,
  message: string,
  traceId: string,
  fields?: Record<string, string>,
): unknown {
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
  setActivePinia(createPinia());
  // 預先種 CSRF cookie:apiClient 對 unsafe method 會自動注入 X-XSRF-TOKEN,
  // cookie 不存在時它會先打 /api/v1/csrf bootstrap —— 那會讓本檔的 fetch 呼叫序失去可讀性。
  document.cookie = 'XSRF-TOKEN=csrf-trade; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tradingApi http adapter — payload 契約(TRAD-01 / TRAD-02)', () => {
  it('sends exactly the seven backend contract fields, nothing more', async () => {
    // 用 sorted key 陣列的 toEqual(不是 toMatchObject):toMatchObject 抓不到「多送的欄位」。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1');

    expect(Object.keys(bodyAt(0)).sort()).toEqual(CONTRACT_FIELDS);
  });

  it('never leaks the mock-only order fields into the payload', async () => {
    // judgment §1 的反例明文點名:ordType / tif / orderId 是「下單系統」概念,
    // 後端只記錄「已成交交易」。cashAfter / slippage 則後端零來源(D-04 已裁定隱藏)。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1');

    const body = bodyAt(0);
    expect(body).not.toHaveProperty('ordType');
    expect(body).not.toHaveProperty('tif');
    expect(body).not.toHaveProperty('orderId');
    expect(body).not.toHaveProperty('cashAfter');
    expect(body).not.toHaveProperty('slippage');
    // 後端欄位名是 `type` 不是 `side`(mock store 的 executeOrder 才叫 side)。
    expect(body).not.toHaveProperty('side');
    expect(body).not.toHaveProperty('sector');
  });

  it('projects the payload field-by-field so a wider caller object cannot smuggle extras', async () => {
    // TypeScript 的 excess property check 只對物件字面量生效。呼叫端若把整包表單狀態
    // 當 CreateTradeRequest 傳進來(結構相容即通過型別檢查),adapter 必須自己把欄位投影出來。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));
    const widerFormState = {
      ...TRADE_REQUEST,
      ordType: 'MKT',
      tif: 'GTC',
      orderId: '12345678',
      cashAfter: 124_580,
    } as CreateTradeInput;

    await createHttpTradingApi('/api/v1').createTrade(widerFormState, 'key-1');

    expect(Object.keys(bodyAt(0)).sort()).toEqual(CONTRACT_FIELDS);
  });

  it('keeps an explicit null note as a present field (後端 note 可為 null)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade({ ...TRADE_REQUEST, note: null }, 'key-1');

    const body = bodyAt(0);
    expect(Object.keys(body).sort()).toEqual(CONTRACT_FIELDS);
    expect(body.note).toBeNull();
  });
});

describe('tradingApi http adapter — Idempotency-Key(D-05 / D-14)', () => {
  it('POSTs to /trades with the caller-supplied Idempotency-Key header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1');

    const init = initAt(0);
    expect(urlAt(0)).toBe('/api/v1/trades');
    expect(String(init.method).toUpperCase()).toBe('POST');
    expect(headerValue(init, 'idempotency-key')).toBe('key-1');
    // CSRF 由 apiClient 統一注入(Phase 2 D-20:勿另造轉接層)。
    expect(headerValue(init, 'x-xsrf-token')).toBe('csrf-trade');
  });

  it('reuses the SAME key on the 401 refresh replay (T-04-01)', async () => {
    // 這條是本 Phase 冪等設計中最容易被忽略的一條:refresh 前那一次**可能已經成功**
    // (session 過期發生在回應路徑上)。replay 若換一把 key,後端會把它當成新交易再建一筆,
    // 而 transactions 是 append-only —— 建錯改不回來。
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(successEnvelope(null, 'trace-refresh'));
      }
      const tradeCalls = vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith('/trades'));
      // 第一次 /trades 回 401 觸發單飛 refresh;replay 那次回 200。
      if (tradeCalls.length === 1) {
        return jsonResponse(failureEnvelope('AUTH_TOKEN_EXPIRED', 'Access token expired', 'trace-401'), 401);
      }
      return jsonResponse(successEnvelope(TRADE_DTO));
    }));

    const trade = await createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1');

    const tradeCallIndexes = vi.mocked(fetch).mock.calls
      .map((call, index) => ({ url: String(call[0]), index }))
      .filter(entry => entry.url.endsWith('/trades'))
      .map(entry => entry.index);

    expect(tradeCallIndexes).toHaveLength(2);
    const firstKey = headerValue(initAt(tradeCallIndexes[0]), 'idempotency-key');
    const replayKey = headerValue(initAt(tradeCallIndexes[1]), 'idempotency-key');
    expect(firstKey).toBe('key-1');
    expect(replayKey).toBe(firstKey);
    // payload 也必須逐位元相同,否則後端會判成 TRADE_IDEMPOTENCY_KEY_REUSED(D-07)。
    expect(String(initAt(tradeCallIndexes[1]).body)).toBe(String(initAt(tradeCallIndexes[0]).body));
    expect(trade.id).toBe(TRADE_DTO.id);
    expect(toWire(trade.quantity)).toBe('10');
  });
});

describe('tradingApi http adapter — 錯誤原樣上拋(T-04-09)', () => {
  it('lets the 409 TRADE_IDEMPOTENCY_KEY_REUSED through untouched', async () => {
    // adapter 不 catch、不重包:UI 層靠 error.code 分派文案、靠 requestId(= meta.traceId)回報。
    // 字面由後端 04-01 定案(ErrorCode.java:45),前後端是同一份契約的兩端。
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('TRADE_IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused with a different trade payload', 'trace-409'),
      409,
    )));

    await expect(
      createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1'),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'TRADE_IDEMPOTENCY_KEY_REUSED',
      status: 409,
      requestId: 'trace-409',
    });
  });

  it('preserves field-level validation errors so D-16 can bind them to inputs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      failureEnvelope('VALIDATION_FAILED', 'Validation failed', 'trace-400', {
        quantity: 'must be greater than or equal to 0.00000001',
      }),
      400,
    )));

    await expect(
      createHttpTradingApi('/api/v1').createTrade(TRADE_REQUEST, 'key-1'),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 400,
      fields: { quantity: 'must be greater than or equal to 0.00000001' },
    });
  });
});

describe('tradingApi mock adapter', () => {
  it('delegates to the mock store executeOrder and returns a TradeDto without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const portfolio = useMockPortfolioStore();
    const executeOrder = vi.spyOn(portfolio, 'executeOrder');

    const trade = await createMockTradingApi().createTrade(TRADE_REQUEST, 'key-1');

    expect(executeOrder).toHaveBeenCalledTimes(1);
    // mock store 是 mock-only 的 number 資料(05-16 規約),adapter 在這一處把 wire 字串轉成 number 交給它。
    // CreateTradeRequest 刻意不含 sector(保持與後端逐欄同形)—— 反查 data.ts 的髒活留在 mock 裡。
    expect(executeOrder.mock.calls[0][0]).toMatchObject({
      sym: 'AAPL',
      side: 'BUY',
      qty: 10,
      px: 218.4,
      fee: 1.5,
      sector: 'Tech',
    });
    // 回傳 TradeRecord 形狀:十個欄位齊全(04.1-11 起含 currency),消費端(D-09 成功畫面 / D-13 高亮)只有一條路徑。
    expect(Object.keys(trade).sort()).toEqual(
      ['createdAt', 'currency', 'executedAt', 'fee', 'id', 'note', 'price', 'quantity', 'symbol', 'type'],
    );
    // mock 沒有幣別資料:不猜測(UI-SPEC U-29)
    expect(trade.currency).toBeNull();
    // id 沿用 portfolioApi.tradeDtoFrom 的 `mock-{index}` 慣例;store 是 unshift,新交易永遠是 index 0。
    expect(trade.id).toBe('mock-0');
    expect(trade).toMatchObject({ symbol: 'AAPL', type: 'BUY' });
    // Phase 5 D-08:mock 也先組 wire 形狀再走 toTradeRecord,金額為 Decimal。
    expect([trade.quantity, trade.price, trade.fee].every(isDecimal)).toBe(true);
    expect([toWire(trade.quantity), toWire(trade.price), toWire(trade.fee)]).toEqual(['10', '218.4', '1.5']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('E2:新建 mock 持倉帶入 data.ts 反查的 assetType / market(對話框從持倉開啟時的市場來源)', async () => {
    const portfolio = useMockPortfolioStore();
    const api = createMockTradingApi();

    await api.createTrade({ ...TRADE_REQUEST, symbol: 'TSLA', price: parseDecimal('178.22') }, 'key-tsla');
    await api.createTrade(
      { ...TRADE_REQUEST, symbol: 'SOL', quantity: parseDecimal('1'), price: parseDecimal('150') },
      'key-sol',
    );

    expect(portfolio.positions.find(p => p.sym === 'TSLA')).toMatchObject({ assetType: 'STOCK', market: 'US' });
    expect(portfolio.positions.find(p => p.sym === 'SOL')).toMatchObject({ assetType: 'CRYPTO', market: 'CRYPTO' });
  });

  it('throws the same ApiClientError shape as API mode when the store rejects an oversell', async () => {
    // OrderTicket 的錯誤處理因此在兩個 mode 只有一條路徑,少一條「只在某 mode 才測得到」的分支。
    const portfolio = useMockPortfolioStore();
    vi.spyOn(portfolio, 'executeOrder').mockReturnValue(false);

    await expect(
      createMockTradingApi().createTrade({ ...TRADE_REQUEST, type: 'SELL' }, 'key-1'),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'TRADE_INSUFFICIENT_HOLDING',
      status: 409,
    });
  });

  it('exposes the store lastFill through live and pushes a mock notification (D-04)', async () => {
    const portfolio = useMockPortfolioStore();
    const notifications = useMockNotificationsStore();
    const pushNotification = vi.spyOn(notifications, 'pushNotification');
    const api = createMockTradingApi();

    await api.createTrade(TRADE_REQUEST, 'key-1');

    expect(portfolio.lastFill).toEqual({ sym: 'AAPL', type: 'BUY', qty: 10, px: 218.4 });
    // live 是 getter,每次存取才解析 store —— 與 portfolioApi 同一慣例。
    // Phase 5 D-08:三處同形,qty / px 由 getter 從 mock store 的 number 轉成 Decimal。
    const fill = api.live?.lastFill;
    expect(fill).toMatchObject({ sym: 'AAPL', type: 'BUY' });
    expect(isDecimal(fill?.qty) && isDecimal(fill?.px)).toBe(true);
    expect([toWire(fill!.qty), toWire(fill!.px)]).toEqual(['10', '218.4']);
    expect(pushNotification).toHaveBeenCalledTimes(1);
    expect(pushNotification.mock.calls[0][0]).toMatchObject({ kind: 'order', sym: 'AAPL' });
  });
});

describe('tradingApi — 金額字串契約(05-19 / D-05 / D-08)', () => {
  const PRECISE: CreateTradeInput = {
    ...TRADE_REQUEST,
    quantity: parseDecimal('3'),
    price: parseDecimal('123456.12345678'),
    fee: ZERO,
  };

  it('http createTrade 以 toWire 逐欄投影:金額為字串且保留 8 位小數,fee 0 送 "0"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade(PRECISE, 'key-1');

    const raw = String(initAt(0).body);
    // 比對 body 字面:JSON 解析後 toEqual 分不出 "3" 與 3。
    expect(raw).toContain('"quantity":"3"');
    expect(raw).toContain('"price":"123456.12345678"');
    expect(raw).toContain('"fee":"0"');
    expect(bodyAt(0)).toMatchObject({ quantity: '3', price: '123456.12345678', fee: '0' });
  });

  it('極小值以一般記號送出(不出現 1e-8)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));

    await createHttpTradingApi('/api/v1').createTrade(
      { ...PRECISE, quantity: parseDecimal('0.00000001'), fee: parseDecimal('0.00000001') },
      'key-1',
    );

    const raw = String(initAt(0).body);
    expect(raw).toContain('"quantity":"0.00000001"');
    expect(raw).toContain('"fee":"0.00000001"');
    expect(raw).not.toMatch(/e-/i);
  });

  it('同一份 input、同一把 key 重送兩次,POST body 逐位元相同(D-07 冪等比對)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope(TRADE_DTO))));
    const api = createHttpTradingApi('/api/v1');

    await api.createTrade(PRECISE, 'key-same');
    await api.createTrade(PRECISE, 'key-same');

    expect(String(initAt(1).body)).toBe(String(initAt(0).body));
    expect(headerValue(initAt(1), 'idempotency-key')).toBe('key-same');
  });

  it('回應 wire 字串 → TradeRecord Decimal,超過 double 精度的值逐字往返', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({
      ...TRADE_DTO,
      quantity: '9007199254740993.01',
      price: '123456.12345678',
      fee: '0.00000001',
    }))));

    const trade = await createHttpTradingApi('/api/v1').createTrade(PRECISE, 'key-1');

    expect(toWire(trade.quantity)).toBe('9007199254740993.01');
    expect(toWire(trade.price)).toBe('123456.12345678');
    expect(toWire(trade.fee)).toBe('0.00000001');
    // 後端 setScale(8) 的尾零:數值相等(big.js 正規化尾零,不比字面)。
    expect(toTradeRecord(TRADE_DTO).quantity.eq(parseDecimal('10'))).toBe(true);
  });

  it('回應金額仍為 JS number 時在邊界丟錯(T-05-27)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(successEnvelope({ ...TRADE_DTO, price: 218.4 }))));

    await expect(createHttpTradingApi('/api/v1').createTrade(PRECISE, 'key-1')).rejects.toThrow(TypeError);
  });

  it('mock createTrade 回傳的 TradeRecord 保留輸入的完整精度', async () => {
    const trade = await createMockTradingApi().createTrade(
      { ...PRECISE, quantity: parseDecimal('0.5'), price: parseDecimal('218.12345678') },
      'key-1',
    );

    expect(toWire(trade.quantity)).toBe('0.5');
    expect(toWire(trade.price)).toBe('218.12345678');
    expect(toWire(trade.fee)).toBe('0');
  });

  it('mock heldQuantityOf 以 Decimal 回傳 mock 持倉股數,沒有持倉為 null', () => {
    const portfolio = useMockPortfolioStore();
    const api = createMockTradingApi();
    const aapl = portfolio.positions.find(p => p.sym === 'AAPL');
    expect(aapl, 'data.ts 的 mock 持倉含 AAPL').toBeTruthy();

    const held = api.live?.heldQuantityOf('AAPL');
    expect(isDecimal(held)).toBe(true);
    expect(toWire(held!)).toBe(String(aapl!.qty));
    expect(api.live?.heldQuantityOf('NOPE')).toBeNull();
  });
});

describe('tradingApi factory', () => {
  it('selects the implementation by mode and only the mock one exposes live', () => {
    // 消費端的分支依據是 `live` 的存在性,不是 mode 字串(portfolioApi 既有契約)。
    const mock = createTradingApi('mock');
    const http = createTradingApi('api', '/api/v1');

    expect(mock.mode).toBe('mock');
    expect(http.mode).toBe('api');
    expect(http.live).toBeUndefined();
    expect(mock.live).toBeDefined();
  });
});
