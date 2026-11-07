/*
 * CSV 儲存格輸出(quick-261107-1j4 2f / 04.2-review IN-05;由 Trades.vue 移出共用)。
 *
 * - 規則沿用 Trades 匯出:null / undefined → 空字串;含 `"`、`,`、換行的值加雙引號並把 `"` 跳脫成 `""`。
 * - 公式中和:文字以 `=`、`+`、`-`、`@`、tab、CR 開頭時,試算表會當成公式執行(例如備註
 *   `=HYPERLINK(...)`),所以前綴 `'` 讓它保持文字。number 型與「純數字字串」(只允許負號與小數,
 *   例如 API 以字串傳的 `-12.50`)不前綴,數值欄仍是可計算的數字。前導 `+` 只會出自使用者輸入
 *   (後端序列化的數字不帶 `+`),因此 `+1` 也前綴,保留使用者原樣的文字。
 */
export type CsvValue = string | number | null | undefined;

const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvValue): string {
  let text = String(value ?? '');
  if (typeof value === 'string' && FORMULA_LEAD.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
