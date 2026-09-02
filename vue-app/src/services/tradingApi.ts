import { ApiClientError, apiRequest } from './apiClient';
import { CRYPTO, FX, SYMBOLS, fmtNum } from '../data';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { RuntimeDataMode, TradeDto } from './apiTypes';
import type { Symbol as MockSymbol } from '../types';

/**
 * `POST /api/v1/trades` 的 request body;逐欄對應後端 `CreateTradeRequest.java:18-28`,
 * **勿增刪欄位**(信封/契約權威是後端,judgment §4)。
 *
 * 型別定義在本檔而非 `apiTypes.ts`:它是 request 型別而非 response DTO,
 * 與 `TradeDto` 的生命週期不同(後者是後端回傳的權威快照)。
 *
 * 三件事必須知道:
 * - **這是「已成交紀錄」不是「下單系統」**(judgment §1)。後端沒有委託單生命週期,
 *   所以這裡永遠不會有 `ordType` / `tif` / `orderId` / `cashAfter` / `slippage`。
 * - **`fee` 由使用者手動輸入,預設 0**(D-02)。`fee` 會被 `HoldingCalculator` 算進
 *   `avg_cost` 與 `realized_pnl`,而 `transactions` 是 append-only(V8 trigger 禁 UPDATE/DELETE)
 *   —— 前端發明的費率一旦送出就永久污染成本基礎,改不回來。
 * - **`executedAt` 必須含時區 offset**(D-03)。後端是 `OffsetDateTime`;而且因為由前端
 *   明確送出,同一把 key 重試時 payload 才逐位元穩定,D-07 的 payload 比對才有意義
 *   (若讓後端帶 `now()`,每次重試都會假性不符而吃 409)。
 */
export interface CreateTradeRequest {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  /** D-02:使用者手動輸入,預設 0。前端不發明費率。 */
  fee: number;
  note: string | null;
  /** D-03:ISO-8601 **含 offset**(後端 `OffsetDateTime`)。 */
  executedAt: string;
}

/**
 * mock mode 專用的 reactive 資料視窗。
 *
 * 形狀與 `portfolioApi.ts:36` 的 `PortfolioLiveMockData.lastFill` **逐字一致**,
 * 也與 `portfolioRevision.ts` 的 `LastFill` 一致 —— 三處同形,兩頁的 fresh 高亮
 * 綁定表達式才不需要因為換了來源而改寫。
 */
export interface TradingLiveMockData {
  readonly lastFill: { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null;
}

/**
 * trading domain 的唯一消費介面。
 *
 * 頁面用法(judgment §3:元件永遠不 import mock store):
 * - mock mode:`live` 存在,可讀 mock 專屬的 reactive `lastFill`。
 * - API mode:`live` 為 undefined。
 * - 分支判斷依據是 `api.live` 是否存在,不是 mode 字串。
 */
export interface TradingApi {
  mode: RuntimeDataMode;
  /**
   * 建立一筆手動已成交交易。
   *
   * @param request 後端 `CreateTradeRequest` 的七個欄位,不多不少。
   * @param idempotencyKey D-05:**必填**。同一次送出嘗試的重試(自動或手動)必須沿用
   *        同一把 key(D-14);使用者改過任何欄位後才換新 key(那是新意圖,judgment §5)。
   *        **key 是參數不是 adapter 自產** —— 「哪一次算同一次嘗試」只有 UI 層知道,
   *        adapter 自產會讓每次重試都變成新交易,冪等保護等於不存在。
   *        key 的隨機來源由呼叫端用 `crypto.randomUUID()`(CSPRNG)提供,T-04-10。
   * @returns 後端回傳的 `TradeDto`(權威快照)。成功畫面顯示它,不顯示表單值(D-09)。
   * @throws ApiClientError 原樣上拋,不 catch 也不重包:UI 層靠 `code` 分派文案、
   *         靠 `fields` 綁欄位(D-16)、靠 `requestId` 回報(T-04-09)。
   */
  createTrade(request: CreateTradeRequest, idempotencyKey: string): Promise<TradeDto>;
  /** 僅 mock 實作提供。 */
  live?: TradingLiveMockData;
}

export function createHttpTradingApi(basePath = '/api/v1'): TradingApi {
  return {
    mode: 'api',
    // 照 opsApi.ts:146-154 的形狀(全 repo 唯一的「POST + Idempotency-Key」前例),
    // 差別只有 key 是必填,所以不做 `if (request.idempotencyKey)` 判斷。
    //
    // **不需要任何 transport 層擴充**:CSRF header 注入、cookie 憑證附帶、
    // 401 單飛 refresh + 一次 replay 全部由 apiClient 處理(Phase 2 D-20)。
    // (本檔刻意不出現任何 transport 層字面,好讓「未另造轉接層」可被字面檢查機械驗證。)
    // 而 replay 用的是**同一份 options**(apiClient.ts:319),所以同一把 key 自動沿用
    // —— 這是 D-14 的免費紅利,也是安全上必要的行為(T-04-01)。
    createTrade: (request, idempotencyKey) => apiRequest<TradeDto>(`${basePath}/trades`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      // 逐欄投影而不是 `json: request`:TypeScript 的 excess property check 只對
      // **物件字面量**生效,呼叫端若把整包表單狀態當 CreateTradeRequest 傳進來
      // (結構相容即通過型別檢查),多餘欄位會原封不動送到後端。逐欄投影是 TRAD-02
      // 在執行期唯一真正的保證。
      json: {
        symbol: request.symbol,
        type: request.type,
        quantity: request.quantity,
        price: request.price,
        fee: request.fee,
        note: request.note,
        executedAt: request.executedAt,
      },
    }),
  };
}

/** mock 可交易宇宙。BONDS 不納入:`Bond` 沒有 price,湊不出交易且不可交易。 */
const MOCK_UNIVERSE: MockSymbol[] = [...SYMBOLS, ...CRYPTO, ...FX];

function mockSymbolOf(symbol: string): MockSymbol | undefined {
  return MOCK_UNIVERSE.find(candidate => candidate.sym === symbol);
}

/**
 * `mockPortfolio.executeOrder` 需要 `sector`,但 `CreateTradeRequest` 刻意**不含** `sector`
 * (保持與後端逐欄同形)。所以由 mock 自己從 `data.ts` 用 symbol 反查 —— **髒活留在 mock 裡,
 * 介面契約保持乾淨**。
 *
 * `?? cat.toUpperCase()` 的 fallback 沿用 `OrderTicket.vue:384` 的既有寫法:
 * CRYPTO / FX 在 `data.ts` 沒有 `sector` 欄位。
 */
function mockSectorOf(symbol: MockSymbol | undefined): string {
  return symbol?.sector ?? symbol?.cat.toUpperCase() ?? 'OTHER';
}

export function createMockTradingApi(): TradingApi {
  // getter 每次存取才解析 store:延遲解析是 reactivity 與跨測試隔離
  // (testSetup 每個測試換 pinia)的關鍵,不可改成在此捕捉 store(portfolioApi.ts:141-142)。
  const live: TradingLiveMockData = {
    get lastFill() {
      return useMockPortfolioStore().lastFill;
    },
  };

  return {
    mode: 'mock',
    live,
    // 刻意不接 idempotencyKey:冪等防護落在後端的唯一約束(judgment §5),
    // mock 沒有帳本也沒有並發,收下這個參數只會暗示它在 mock mode 有作用。
    async createTrade(request) {
      const portfolio = useMockPortfolioStore();
      const asset = mockSymbolOf(request.symbol);

      const filled = portfolio.executeOrder({
        sym: request.symbol,
        name: asset?.name ?? request.symbol,
        side: request.type,
        qty: request.quantity,
        px: request.price,
        fee: request.fee,
        sector: mockSectorOf(asset),
        note: request.note ?? '',
      });

      if (!filled) {
        // 與 API mode **同形**的錯誤:code 逐字對應後端 `ErrorCode.TRADE_INSUFFICIENT_HOLDING`(409)。
        // 這讓 OrderTicket 的錯誤處理在兩個 mode 只有一條路徑,少一條「只在某 mode
        // 才走得到」的分支。ApiClientError 是 apiClient.ts:3 的 exported class,mock 用它合理。
        throw new ApiClientError({
          status: 409,
          code: 'TRADE_INSUFFICIENT_HOLDING',
          message: 'Insufficient holding quantity',
          requestId: null,
        });
      }

      // D-04:mock mode 保留通知推送(API mode 不推 —— notifications 未 API 化,屬 PORT-06 v2)。
      // 這段是從 OrderTicket.vue:393-399 原樣搬進來的,元件因此不再 import mock store。
      useMockNotificationsStore().pushNotification({
        kind: 'order',
        sym: request.symbol,
        text: `${request.type} ${request.quantity} ${request.symbol} @ ${fmtNum(request.price)} filled`,
        time: 'now',
        unread: true,
      });

      return {
        // 沿用 portfolioApi.ts:98-113 `tradeDtoFrom` 的 `mock-{index}` 合成 id 慣例。
        // `executeOrder` 是 `trades.unshift(...)`,新交易永遠落在 index 0,所以這個 id
        // 與 `listTrades` 之後合成出來的 id 對得上。**絕不**用亂數產生器合成 id 或成交價
        // (U-16 已裁定移除 OrderTicket.vue:373-375 的亂數 slippage 與亂數 orderId)。
        id: 'mock-0',
        symbol: request.symbol,
        type: request.type,
        quantity: request.quantity,
        price: request.price,
        fee: request.fee,
        note: request.note,
        // mock store 只保留日期粒度的 `d`(todayStr());回傳使用者實際送出的 executedAt
        // 才是誠實的值 —— 它也是 D-13 高亮與 D-09 成功畫面要顯示的東西。
        executedAt: request.executedAt,
        createdAt: new Date().toISOString(),
      };
    },
  };
}

export function createTradingApi(mode: RuntimeDataMode, basePath = '/api/v1'): TradingApi {
  return mode === 'api' ? createHttpTradingApi(basePath) : createMockTradingApi();
}
