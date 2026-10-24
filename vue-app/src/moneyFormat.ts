import { fmtNum } from './data';

/*
 * 全站金額格式的單一來源(Phase 04.1 D-30,UI-SPEC §Money & Number Formatting Contract)。
 *
 * 為什麼用「ISO 代碼後綴」而不是幣別符號:`Intl` 的 currency 樣式會讓 USD 與 TWD 都可能顯示成 `$` 系列、
 * JPY 與 CNY 共用 `¥`。本系統同時顯示原幣(持倉 / 交易列)與基準幣(summary),符號歧義正是這次要修的錯誤本身。
 * 代碼後綴在 zh / en 兩種語言一致,右對齊時數字仍對齊。
 *
 * 前端不換匯(D-21):所有基準幣數字都直接取後端欄位;這裡唯一的算術是比率 / 權重的 × 100 百分比格式化。
 */

/** U+00A0:數字與代碼之間用不換行空白,避免在窄欄被拆成兩行。 */
const NBSP = ' ';

const MISSING = '—';

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function withCode(amount: string, code: string | null | undefined): string {
  return code ? `${amount}${NBSP}${code}` : amount;
}

/** 幣別的小數位數:JPY 沒有輔幣為 0,其餘(含缺值)為 2。 */
export function minorUnits(code: string | null | undefined): number {
  return code === 'JPY' ? 0 : 2;
}

/** 數字 + NBSP + 代碼;null / 非有限值 → `—`(不帶代碼);代碼為空時只回數字。 */
export function fmtMoney(value: number | null | undefined, code: string | null | undefined, dp: number): string {
  if (!isFiniteNumber(value)) return MISSING;
  return withCode(fmtNum(value, dp), code);
}

/** 與 fmtMoneyAmount 同規則,但 > 0 前綴 `+`、< 0 為 `-`、= 0 無號。 */
function signedAmount(value: number | null | undefined, dp: number): string {
  if (!isFiniteNumber(value)) return MISSING;
  const body = fmtNum(value, dp);
  // 以四捨五入後的字串判斷是否為零,避免 0.001 顯示成 `+0.00`。
  const isZero = Number(body.replace(/,/g, '')) === 0;
  return value > 0 && !isZero ? `+${body}` : body;
}

/** 帶號版本的 fmtMoney。 */
export function fmtSignedMoney(value: number | null | undefined, code: string | null | undefined, dp: number): string {
  if (!isFiniteNumber(value)) return MISSING;
  return withCode(signedAmount(value, dp), code);
}

/** 只回數字部分(不帶代碼),給「每列一個 .ccy-tag」的表格用;dp 省略時用 minorUnits(code)。 */
export function fmtMoneyAmount(value: number | null | undefined, code: string | null | undefined, dp?: number): string {
  if (!isFiniteNumber(value)) return MISSING;
  return fmtNum(value, dp ?? minorUnits(code));
}

/** 帶號版本的 fmtMoneyAmount。 */
export function fmtSignedMoneyAmount(value: number | null | undefined, code: string | null | undefined, dp?: number): string {
  return signedAmount(value, dp ?? minorUnits(code));
}

/** 比值 × 100,2 位小數、帶號(`+1.04%`);null / 非有限 → null,呼叫端不渲染該行。 */
export function fmtRatioPct(ratio: number | null | undefined): string | null {
  if (!isFiniteNumber(ratio)) return null;
  return `${signedAmount(ratio * 100, 2)}%`;
}

/** 權重 × 100,1 位小數、無號(`52.0%`);null → `—`。 */
export function fmtWeightPct(weight: number | null | undefined): string {
  if (!isFiniteNumber(weight)) return MISSING;
  return `${fmtNum(weight * 100, 1)}%`;
}
