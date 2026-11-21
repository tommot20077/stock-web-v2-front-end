/**
 * mock 資料的「哨兵值」(SC5 / D-20:API mode 失敗狀態不得被 mock 掩蓋)。
 *
 * 為什麼是這些值:它們只存在於 mock 資料(`src/data.ts` 的 POSITIONS / TRADES / SYMBOLS / CRYPTO、
 * `src/stores/mockPortfolio.ts` 的 DEFAULT_WATCHLISTS),真後端 E2E 的種子資料刻意只用 AAPL 與
 * 自訂備註 / 金額,所以若它們出現在 API mode 的目標區塊裡,就代表頁面拿 mock 資料回填了錯誤(違反前端鐵律 3)。
 * - symbols:mock 持倉代號(NVDA、2330.TW、BTC、ETH)與 NVDA 的 mock 名稱;
 * - prices:mock 持倉現價(NVDA 1142.83、BTC 67842.40、ETH 3482.18),以 mock 原始兩位小數字串記錄;
 *   畫面上可能帶千分位(`1,142.83`),比對時由呼叫端自行展開千分位變體;
 * - notes:mock 交易備註;
 * - watchlistNames:mock 觀察清單名稱(真後端首次 GET 建立的預設清單叫「我的自選」,不會撞名)。
 * - kpis:Overview mock KPI 字面值(`src/pages/Overview.vue` 的 `mockKpis`:今日損益 `+$12,481`、可用現金
 *   `$84,210`、年化 `18.4%`)。API mode 的 KPI 全來自後端 summary(`apiKpis`),真後端種子只有 AAPL 3 股,
 *   不會算出這些值。刻意不選 `+1.04%` / `8.4%` 這類短字串:較可能與真值巧合,且 `8.4%` 是 `18.4%` 的子字串;
 * - cashNotes:mock 現金帳本種子分錄的備註(`src/services/cashApi.ts` 的 `seedEntries`:`Initial deposit`、
 *   `Recorded by mistake`)。真後端 E2E 的現金種子只用自訂 CASH_SEED_NOTE,不會撞值。
 *
 * ⚠️ 哨兵斷言**必須限定在目標區塊的 locator 內**(例如 `positions-table`),不可對 `body` 或 `main` 做
 * `not.toContainText`:API mode 仍有合法的 Preview / 示範區塊(例如 Overview 新聞卡),真後端 seed 的
 * 資產清單也可能含 NVDA,整頁斷言會誤判(05-RESEARCH §Q9 陷阱)。
 *
 * 防空轉:`src/mockSentinels.test.ts` 斷言每個值仍存在於 mock 資料輸出(kpis 另斷言不在 `apiKpis` 區段);若 mock 資料改了,該測試會紅,
 * 修正方向是改這裡的值(哨兵取自 mock),不是反過來改 mock。
 *
 * 本檔是純資料、不 import 任何模組,讓 Playwright 與 Vitest 兩邊都能直接引用。
 */
export const MOCK_SENTINELS = {
  symbols: ['NVDA', '2330.TW', 'BTC', 'ETH', 'NVIDIA Corp.'],
  prices: ['1142.83', '67842.40', '3482.18'],
  notes: ['加碼', '停利', '季度配息', 'DCA'],
  watchlistNames: ['核心持倉', 'AI 概念', 'Crypto'],
  kpis: ['+$12,481', '$84,210', '18.4%'],
  cashNotes: ['Initial deposit', 'Recorded by mistake'],
} as const;
