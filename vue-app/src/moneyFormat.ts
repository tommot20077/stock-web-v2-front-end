import { fmtNum } from './data';
import { isDecimal, parseDecimal, ROUND_HALF_UP, ZERO, type Decimal } from './services/decimal';

/*
 * 全站金額格式的單一來源(Phase 04.1 D-30,UI-SPEC §Money & Number Formatting Contract)。
 *
 * 為什麼用「ISO 代碼後綴」而不是幣別符號:`Intl` 的 currency 樣式會讓 USD 與 TWD 都可能顯示成 `$` 系列、
 * JPY 與 CNY 共用 `¥`。本系統同時顯示原幣(持倉 / 交易列)與基準幣(summary),符號歧義正是這次要修的錯誤本身。
 * 代碼後綴在 zh / en 兩種語言一致,右對齊時數字仍對齊。
 *
 * 前端不換匯(D-21):所有基準幣數字都直接取後端欄位;這裡唯一的算術是比率 / 權重的 × 100 百分比格式化。
 *
 * Phase 5 D-08:每個格式化函式都接受 `Decimal | number`。Decimal 是 API 路徑上的金額(wire 字串經
 * `services/decimal.ts` 解析而來),格式化時以 `toFixed(dp, HALF_UP)` 取得精確字串、× 100 也在 Decimal 內做,
 * 再把字串交給 `Intl.NumberFormat` 加千分位 —— 全程不經 JS number,`123456789012.12345678` 的 8 位小數完整顯示。
 * number 參數只剩 mock-only 畫面資料(`data.ts`),沿用 `fmtNum`。
 */

/** U+00A0:數字與代碼之間用不換行空白,避免在窄欄被拆成兩行。 */
const NBSP = ' ';

const MISSING = '—';

const HUNDRED = parseDecimal('100');

type Amount = Decimal | number;

/** Decimal 一律視為可顯示;number 只接受有限值。 */
function isPresent(value: Amount | null | undefined): value is Amount {
  if (value == null) return false;
  return isDecimal(value) || Number.isFinite(value);
}

function isPositive(value: Amount): boolean {
  return isDecimal(value) ? value.gt(ZERO) : value > 0;
}

function isNegative(value: Amount): boolean {
  return isDecimal(value) ? value.lt(ZERO) : value < 0;
}

/** 每個小數位數一個 formatter;locale 與 `fmtNum` 的 `toLocaleString(undefined, …)` 相同(執行環境預設)。 */
const fixedFormatters = new Map<number, Intl.NumberFormat>();
function fixedFormatter(dp: number): Intl.NumberFormat {
  let formatter = fixedFormatters.get(dp);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    fixedFormatters.set(dp, formatter);
  }
  return formatter;
}

/**
 * Intl.NumberFormat v3 接受十進位字串且不經 double(ES2023 Intl);TS 的型別是 `${number}` 樣板字面量,
 * 而 `toFixed()` 的回傳型別只是 `string` —— 這裡是全檔唯一的型別轉換,輸入保證是 big.js 的一般記號輸出。
 */
function formatDecimalString(formatter: Intl.NumberFormat, digits: string): string {
  return formatter.format(digits as Intl.StringNumericLiteral);
}

/**
 * 固定 dp 位小數、千分位;負數前綴 ASCII `-`(與 `fmtNum` 相同規則,`-0.001` 於 2 位時為 `-0.00`)。
 * Decimal 走 `abs().toFixed(dp, HALF_UP)` → Intl;number 沿用 `fmtNum`。
 */
function fixedString(value: Amount, dp: number): string {
  if (!isDecimal(value)) return fmtNum(value, dp);
  const sign = value.lt(ZERO) ? '-' : '';
  return sign + formatDecimalString(fixedFormatter(dp), value.abs().toFixed(dp, ROUND_HALF_UP));
}

/** 四捨五入到 dp 位後是否為零(避免 0.001 顯示成 `+0.00`)。 */
function roundsToZero(value: Amount, body: string, dp: number): boolean {
  if (isDecimal(value)) return value.abs().round(dp, ROUND_HALF_UP).eq(ZERO);
  return Number(body.replace(/,/g, '')) === 0;
}

function withCode(amount: string, code: string | null | undefined): string {
  return code ? `${amount}${NBSP}${code}` : amount;
}

/** 幣別的小數位數:JPY 沒有輔幣為 0,其餘(含缺值)為 2。 */
export function minorUnits(code: string | null | undefined): number {
  return code === 'JPY' ? 0 : 2;
}

/** 數字 + NBSP + 代碼;null / 非有限值 → `—`(不帶代碼);代碼為空時只回數字。 */
export function fmtMoney(value: Amount | null | undefined, code: string | null | undefined, dp: number): string {
  if (!isPresent(value)) return MISSING;
  return withCode(fixedString(value, dp), code);
}

/** 與 fmtMoneyAmount 同規則,但 > 0 前綴 `+`、< 0 為 `-`、= 0 無號。 */
function signedAmount(value: Amount | null | undefined, dp: number): string {
  if (!isPresent(value)) return MISSING;
  const body = fixedString(value, dp);
  // 以四捨五入後的值判斷是否為零,避免 0.001 顯示成 `+0.00`。
  return isPositive(value) && !roundsToZero(value, body, dp) ? `+${body}` : body;
}

/** 帶號版本的 fmtMoney。 */
export function fmtSignedMoney(value: Amount | null | undefined, code: string | null | undefined, dp: number): string {
  if (!isPresent(value)) return MISSING;
  return withCode(signedAmount(value, dp), code);
}

/** 只回數字部分(不帶代碼),給「每列一個 .ccy-tag」的表格用;dp 省略時用 minorUnits(code)。 */
export function fmtMoneyAmount(value: Amount | null | undefined, code: string | null | undefined, dp?: number): string {
  if (!isPresent(value)) return MISSING;
  return fixedString(value, dp ?? minorUnits(code));
}

/** 帶號版本的 fmtMoneyAmount。 */
export function fmtSignedMoneyAmount(value: Amount | null | undefined, code: string | null | undefined, dp?: number): string {
  return signedAmount(value, dp ?? minorUnits(code));
}

/** 比值 × 100,2 位小數、帶號(`+1.04%`);null / 非有限 → null,呼叫端不渲染該行。Decimal 的 × 100 在 Decimal 內做。 */
export function fmtRatioPct(ratio: Amount | null | undefined): string | null {
  if (!isPresent(ratio)) return null;
  const pct = isDecimal(ratio) ? ratio.times(HUNDRED) : ratio * 100;
  return `${signedAmount(pct, 2)}%`;
}

/** 權重 × 100,1 位小數、無號(`52.0%`);null → `—`。 */
export function fmtWeightPct(weight: Amount | null | undefined): string {
  if (!isPresent(weight)) return MISSING;
  const pct = isDecimal(weight) ? weight.times(HUNDRED) : weight * 100;
  return `${fixedString(pct, 1)}%`;
}

/*
 * 股數格式(Phase 04.2 UI-SPEC §Money):股數最多 8 位小數(後端 NUMERIC(_, 8)),顯示時去尾零、千分位。
 * 固定 en-US 分組,與金額欄的千分位一致;負號沿用 fmtSignedMoney 的 ASCII `-`。
 */
const QTY_DP = 8;
const QTY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: QTY_DP });

/** 格式化絕對值;以捨入後的值判斷是否為零,避免 1e-9 顯示成 `+0` 或 `-0`。 */
function quantityParts(n: Amount): { body: string; isZero: boolean } {
  if (isDecimal(n)) {
    const rounded = n.abs().round(QTY_DP, ROUND_HALF_UP);
    return { body: formatDecimalString(QTY_FORMAT, rounded.toFixed()), isZero: rounded.eq(ZERO) };
  }
  const body = QTY_FORMAT.format(Math.abs(n));
  return { body, isZero: Number(body.replace(/,/g, '')) === 0 };
}

/** 帶號股數:> 0 前綴 `+`、< 0 前綴 `-`、= 0 無號;null / 非有限值 → `—`。 */
export function fmtSignedQuantity(n: Amount | null | undefined): string {
  if (!isPresent(n)) return MISSING;
  const { body, isZero } = quantityParts(n);
  if (isZero) return body;
  return isPositive(n) ? `+${body}` : `-${body}`;
}

/** 不帶號股數(負數仍保留 `-`);null / 非有限值 → `—`。 */
export function fmtQuantity(n: Amount | null | undefined): string {
  if (!isPresent(n)) return MISSING;
  const { body, isZero } = quantityParts(n);
  return isNegative(n) && !isZero ? `-${body}` : body;
}
