import { readonly, ref, type Ref } from 'vue';
import type { TradeDto } from './apiTypes';

/**
 * 一次成功的交易建立所產生的三個共用訊號:「要重讀」「哪一列是新的」「新交易的 id」。
 *
 * ## 為什麼是 revision counter,而不是「成功後一律打三個 domain 請求」(D-10)
 *
 * 關鍵架構事實:`App.vue:36` 用 `v-if="page === 'overview'"` 切頁 —— **非當前頁是卸載的**,
 * 下次 mount 本來就會重抓。而 OrderTicket 是全域 overlay(`App.vue:52-59`),使用者可能
 * 在 Markets 或 Chart 頁下單,此時 Overview / Positions / Trades **三頁全部未掛載**。
 *
 * 所以「成功後一律打三個 portfolio 請求」在目前架構下是**純粹的無效工**:沒有 client-side
 * cache 可以放,沒掛載的頁也沒有人消費那份回應。正確做法是提升一個共用 revision,
 * 由**已掛載**的頁自己 `watch` 它並重跑各自現有的 `loadSummary` / `loadHoldings` / `loadTrades`。
 *
 * ## 為什麼三個訊號放在同一個模組
 *
 * 一次成交同時產生三件事,分模組會讓「先 bump 還是先 set lastFill」變成需要跨模組協調的
 * 順序問題。`notifyTradeCreated()` 是**單一原子動作**,呼叫端不需要知道內部順序。
 *
 * ## 為什麼不用 Pinia
 *
 * `src/stores/` 底下全是 `mock*` 前綴的 mock 專用 store,把**跨 mode** 的協調狀態放進去
 * 會模糊 judgment §3 的界線(「mock store 是 mock mode 專屬」)。模組級 singleton 是
 * `pageApiClients.ts:19,37-39` 與 `apiClient.ts:62-67` 已經在用的慣例。
 *
 * ## ⚠️ 測試隔離硬規則(給後續 plan 的 executor)
 *
 * `resetPortfolioRevisionForTests()` 必須在**各測試檔自己**的 `afterEach` 呼叫,
 * **絕對不得**加進 `testSetup.ts`。理由寫在該檔 `:10-12`:setup 檔刻意不 import 任何
 * service module,因為那會搶在各測試檔的 `vi.mock` 生效前就綁定真實實作,讓 mock 失效
 * (前例:`Backtest.test.ts` D6)。
 */

/**
 * 「最近一次成交」的摘要,供 Positions / Trades 兩頁的 fresh 高亮使用(D-13)。
 *
 * 欄位名刻意是 `sym` / `type` / `qty` / `px`,與 `portfolioApi.ts:36` 的 mock
 * `PortfolioLiveMockData.lastFill` **逐字一致** —— **不是** `symbol` / `quantity` / `price`。
 *
 * 這不是命名品味問題,是最小改動路徑:兩頁的模板因此可以寫成
 * `const effectiveLastFill = computed(() => live ? live.lastFill : apiLastFill.value)`,
 * **fresh class 的綁定表達式完全不用改,只是來源換了**。
 */
export interface LastFill {
  sym: string;
  type: 'BUY' | 'SELL';
  qty: number;
  px: number;
}

const revision = ref(0);
const lastFill = ref<LastFill | null>(null);
const lastTradeId = ref<string | null>(null);

/** D-10:portfolio 三塊的重讀訊號。已掛載的頁 `watch` 它,重跑各自現有的 load 函式。 */
export const portfolioRevision: Readonly<Ref<number>> = readonly(revision);

/**
 * D-13:API mode 的 `lastFill` 等價物。
 * mock mode 有 `portfolioApi.live.lastFill`(Pinia reactivity),API mode 沒有成交事件來源,
 * 由本訊號補上 —— Phase 3 在 `Positions.vue:264` 與 `Trades.vue:109` 留的接點消費的就是它。
 */
export const apiLastFill: Readonly<Ref<LastFill | null>> = readonly(lastFill);

/**
 * D-11:剛建立的交易 id。Trades 頁用它判斷「新交易是否在當前結果集內」——
 * 比對 `id` 是否出現在 `items`,**不得**在前端重算篩選條件。
 */
export const lastCreatedTradeId: Readonly<Ref<string | null>> = readonly(lastTradeId);

/**
 * 交易建立成功後的**唯一**入口:一次呼叫同時產生三個訊號。
 *
 * @param trade 後端回傳的 `TradeDto`(權威快照)。三個訊號全部由它推導,
 *              不從表單值推導 —— 表單值與後端記錄的可能不同(D-09)。
 */
export function notifyTradeCreated(trade: TradeDto): void {
  lastFill.value = { sym: trade.symbol, type: trade.type, qty: trade.quantity, px: trade.price };
  lastTradeId.value = trade.id;
  // 最後才 bump:watcher 被觸發時,前兩個訊號已經是新值。
  revision.value += 1;
}

/** 只提升 revision,給「需要重讀但沒有成交事件」的情境備用(例如手動重新整理)。 */
export function bumpPortfolioRevision(): void {
  revision.value += 1;
}

/**
 * D-11:清掉「已記錄,但不在目前的篩選/排序條件內」的提示。
 *
 * **只清 `lastCreatedTradeId`,不動 `portfolioRevision` 也不動 `apiLastFill`** ——
 * 提示訊息的壽命(使用者變更篩選/排序/頁碼,或再次開啟 ticket)與 fresh 高亮的壽命不同。
 */
export function clearLastCreatedTrade(): void {
  lastTradeId.value = null;
}

/**
 * D-13 / UI-SPEC §9:清掉 API mode 的「新」標記(fresh 高亮 + `新` pill)。
 *
 * 標記的壽命由三個時機界定 —— 再次開啟 ticket、Trades 頁任何篩選/排序/頁碼變更、
 * 或頁面 unmount(`App.vue` 的 `v-if` 切頁)。**不用 setTimeout**:計時器會讓元件測試
 * 變得時間相依而 flaky。只清 `lastFill`,不動 `portfolioRevision`(重讀訊號)也不替
 * D-11 的提示做決定(那有自己的清除規則,見 {@link clearLastCreatedTrade})。
 */
export function clearLastFill(): void {
  lastFill.value = null;
}

/**
 * 測試用的顯式 reset,比照 `pageApiClients.ts:37-39` 的 `resetRuntimeApiClientsForTests`。
 *
 * ⚠️ 必須在**各測試檔自己**的 `afterEach` 呼叫,**不得**加進 `testSetup.ts`(理由見檔頭)。
 */
export function resetPortfolioRevisionForTests(): void {
  revision.value = 0;
  lastFill.value = null;
  lastTradeId.value = null;
}
