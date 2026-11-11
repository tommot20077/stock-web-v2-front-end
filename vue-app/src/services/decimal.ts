import Big from 'big.js';

/*
 * 字串 ↔ decimal 的唯一轉換模組(Phase 5 D-08,VER-02)。
 *
 * 為什麼需要:後端金額 / 股數 / 價格是 `BigDecimal`(NUMERIC(_, 8)),wire 上以 JSON 字串傳遞(D-05)。
 * JS number 是 IEEE-754 double,只有約 15–17 位有效數字,`123456789012.12345678` 一進 number 就失真;
 * 所以 API 路徑上的金額一律以 `Decimal` 承載,只在顯示出口(`moneyFormat`、圖表、CSV)才轉成字串或 number。
 *
 * 為什麼是 big.js:3.0 KB gzip、加減乘精確、`Big.strict` 能把「誤把 number 塞進 decimal 世界」變成大聲失敗
 * (05-RESEARCH §Q1)。本模組以 `Big()` clone 出一個獨立設定的建構子,不改全域 `Big` 的預設值。
 *
 * - `strict = true`:以 JS number 建構 Decimal(或把 number 傳給 `plus` / `times` / `cmp` 等方法)會丟 TypeError,
 *   `valueOf()` / 失真的 `toNumber()` 也會丟錯。API 回應若仍是 number,mapper 會在邊界大聲失敗而不是靜默失真
 *   (T-05-27)。常數請用 `parseDecimal('100')` 這類字串建構。
 * - `DP = 20`:只影響 `div` / `sqrt` / 負次方 `pow` 的小數位數;比率類計算要在 `div` 之後明確 `round(dp, ROUND_HALF_UP)`。
 * - `RM = roundHalfUp`:與後端 `RoundingMode.HALF_UP` 一致(`toFixed(dp)` / `round(dp)` 省略 rm 時也走它)。
 * - wire 輸出一律 `toFixed()`(一般記號):big.js 的 toString 在指數 ≤ -7 時會輸出 `1e-8` 這種科學記號,
 *   後端與人眼都不該收到它。
 */
const D = Big();
D.strict = true;
D.DP = 20;
D.RM = Big.roundHalfUp;

/** 前端 domain 層的 decimal 型別(big.js 實例)。元件與頁面只拿這個型別,不拿 wire 字串。 */
export type Decimal = InstanceType<typeof D>;

/** HALF_UP 捨入模式;`round(dp, ROUND_HALF_UP)` / `toFixed(dp, ROUND_HALF_UP)` 用,與後端 `RoundingMode.HALF_UP` 一致。 */
export const ROUND_HALF_UP = Big.roundHalfUp;

/** 0;比較與加總的起點(`sum = items.reduce((acc, x) => acc.plus(x.amount), ZERO)`)。 */
export const ZERO: Decimal = D('0');

/**
 * wire 字串 → Decimal。接受一般記號與指數記號(後端 `BigDecimal` 的 `0E-8` 也合法)。
 *
 * @throws TypeError 傳入非字串(例如後端仍回 JS number)或字串不是合法數字時 —— 契約違反要在邊界大聲失敗。
 */
export function parseDecimal(wire: string): Decimal {
  if (typeof wire !== 'string') {
    throw new TypeError(`[decimal] expected a decimal string on the wire, got ${typeof wire}`);
  }
  return D(wire);
}

/** nullable 欄位版本:`null` / `undefined` → `null`,其餘同 `parseDecimal`。 */
export function parseNullableDecimal(wire: string | null | undefined): Decimal | null {
  return wire == null ? null : parseDecimal(wire);
}

/**
 * Decimal → wire 字串(一般記號、保留原始精度;`1e-8` 輸出 `0.00000001`)。
 *
 * @throws TypeError 傳入的不是 Decimal 時。
 */
export function toWire(d: Decimal): string {
  // 型別擋不住 `as` 或 any 混進來的 number(`(5).toFixed()` 也會回字串),執行期再守一次。
  if (!isDecimal(d)) throw new TypeError(`[decimal] toWire expects a Decimal, got ${typeof d}`);
  return d.toFixed();
}

/**
 * Decimal → JS number,**唯一有損出口**:只給圖表座標這類「本來就是近似值」的顯示用途。
 * 金額比較 / 加總 / 送出一律留在 Decimal,不得經過這裡。
 */
export function toChartNumber(d: Decimal): number {
  return Number(d.toFixed());
}

/**
 * 表單輸入文字 → Decimal;前後空白先 trim,空字串或不是合法數字 → `null`(由呼叫端決定錯誤文案)。
 * 範圍 / 位數等業務規則不在這裡判斷。
 */
export function parseDecimalInput(text: string): Decimal | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    return D(trimmed);
  } catch {
    return null;
  }
}

/**
 * JS number → wire 字串。**只供 mock 靜態資料與測試使用**(05-24 會以源碼守門禁止 pages / components /
 * composables 引用;型別閉包交接點的單一函式例外見 05-16 規約)。
 *
 * 以 `String(n)` 取得 JS 的最短往返表示,再經 Decimal 正規化為一般記號(`1e-7` → `0.0000001`)。
 *
 * @throws TypeError `n` 不是有限數字時。
 */
export function numberToWire(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError(`[decimal] numberToWire expects a finite number, got ${String(n)}`);
  }
  return D(String(n)).toFixed();
}

/** 型別守衛:是否為 big.js 實例(所有 `Big()` clone 共用同一個 prototype)。 */
export function isDecimal(v: unknown): v is Decimal {
  return v instanceof D;
}
