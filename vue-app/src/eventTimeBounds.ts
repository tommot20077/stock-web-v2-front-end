/**
 * 事件時間欄位的共用下限與三態歸類(quick-261107-1j4,Yuan 2026-11-07 裁決 3B)。
 *
 * 後端對現金 `occurredAt`、交易 `executedAt`、股利 `paidAt` 與股數調整 `effectiveDate`
 * 一律以 **UTC 1900-01-01 00:00** 為下限(含邊界),早於下限回 400 `VALIDATION_FAILED`
 * 與 `error.fields.<欄位> = "must not be before 1900-01-01"`。前端自檢必須用**同一個 instant**
 * 比較,而不是使用者本地午夜:台北本地 `1900-01-01T00:00` = `1899-12-31T16:00Z`,會被後端拒絕。
 *
 * 本檔是純函式,CashEntryDialog / OrderTicket / HoldingEventDialog 共用;
 * 歸類結果只決定「顯示哪一句文案」,後端仍是最終權威。
 */

/** 下限的 instant(UTC 1900-01-01T00:00:00Z 的毫秒值)。 */
export const MIN_EVENT_INSTANT_MS = Date.UTC(1900, 0, 1);

/** 日期欄位(`YYYY-MM-DD`)的下限字串;同格式的字串可直接以字典序比較。 */
export const MIN_EVENT_DATE = '1900-01-01';

/**
 * 時間欄位的問題類別:`required` = 空白或無法解析、`tooEarly` = 早於 1900-01-01、
 * `future` = 晚於上限(現在 / 市場今天;股數調整另含時序規則,由呼叫端文案涵蓋)、`null` = 合法。
 */
export type TimeFieldIssue = 'required' | 'tooEarly' | 'future' | null;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 歸類 `<input type="datetime-local">` 的值(本地時間字串,無 offset)。
 *
 * @param value 輸入框的原始字串
 * @param nowMs 上限(通常是 `Date.now()`;送出時呼叫端應以當下時間重算,不得快取)
 */
export function classifyInstantInput(value: string, nowMs: number): TimeFieldIssue {
  const text = value.trim();
  if (!text) return 'required';
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) return 'required';
  if (time < MIN_EVENT_INSTANT_MS) return 'tooEarly';
  if (time > nowMs) return 'future';
  return null;
}

/**
 * 歸類 `<input type="date">` 的值(`YYYY-MM-DD`)。
 *
 * @param value 輸入框的原始字串
 * @param maxDate 上限日期(同為 `YYYY-MM-DD`,例如標的市場的今天)
 */
export function classifyDateInput(value: string, maxDate: string): TimeFieldIssue {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return 'required';
  const [, y, m, d] = match.map(Number);
  // 拒絕不存在的日曆日(例如 2026-02-30):setUTCFullYear 會進位到下個月,往返比對即可偵測。
  // (不用 Date.UTC:它把 0–99 年映射成 1900–1999,會讓 0050-01-01 被誤判為不存在。)
  const probe = new Date(0);
  probe.setUTCFullYear(y, m - 1, d);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return 'required';
  const text = match[0];
  if (text < MIN_EVENT_DATE) return 'tooEarly';
  if (text > maxDate) return 'future';
  return null;
}
