/**
 * 本地時區的 ISO-8601(含 offset)。
 *
 * **不要用 `toISOString()`** —— 它固定輸出 UTC,`new Date(2026, 0, 1)` 在 UTC+8 會變成
 * `2025-12-31T16:00:00Z`,送到後端就是「去年 12/31 起算」的錯誤年界。
 *
 * 兩個消費端(judgment §6:先確認有沒有現成的,不另造重複品):
 * - `Trades.vue` 的日期篩選半開區間 `[dateFrom, dateTo)`(Phase 3 D-05)。
 * - `OrderTicket.vue` 的 `executedAt`(D-03:後端是 `OffsetDateTime`,**必須帶 offset**;
 *   而且因為由前端明確送出,同一把 key 重試時 payload 才逐位元穩定,D-07 的比對才成立)。
 *
 * 原本是 `Trades.vue` 內的私有函式;Phase 4 的 ticket 需要同一份轉換,故抽成共用模組
 * 而不是複製一份 —— 這個轉換的錯法(UTC 位移)會直接寫進 append-only 帳本。
 */
export function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * `<input type="datetime-local">` 的值格式(`YYYY-MM-DDTHH:mm`,本地時區、分鐘粒度)。
 *
 * 與 `toLocalIso` 分開的理由:datetime-local **不接受 offset 也不接受秒**,
 * 直接把 `toLocalIso` 的輸出塞進 input 會被瀏覽器判為無效值而顯示空白。
 */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
