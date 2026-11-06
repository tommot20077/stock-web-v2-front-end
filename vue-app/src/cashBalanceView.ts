import { fmtMoneyAmount } from './moneyFormat';
import type { CashBalanceDto } from './services/apiTypes';
import type { CashEntryType } from './services/cashApi';
import { BASE_CURRENCY_OPTIONS } from './services/profileApi';
import type { Lang } from './types';

/*
 * 現金餘額的檢視純函式(quick-261106-fbs,04.1 IN-02):Overview 可用現金卡與現金頁原本各寫一份相同的 computed,
 * 抽到這裡共用。只做排序 / 篩選 / 串接,不做任何會計或換匯(D-21:基準幣數字一律取後端值)。
 */

/** 幣別的固定顯示順序:TWD / USD / EUR / JPY(UI-SPEC §1),未知幣別排在後面。 */
function currencyOrder(code: string): number {
  const at = (BASE_CURRENCY_OPTIONS as readonly string[]).indexOf(code);
  return at === -1 ? BASE_CURRENCY_OPTIONS.length : at;
}

/** 非零幣別,依固定順序排序;不改動輸入陣列。null / undefined 視為沒有餘額。 */
export function orderCashBalances(balances: readonly CashBalanceDto[] | null | undefined): CashBalanceDto[] {
  return (balances ?? [])
    .filter(balance => balance.amount !== 0)
    .sort((a, b) => currencyOrder(a.currency) - currencyOrder(b.currency));
}

/** 「代碼 金額」以 ` · ` 串接;金額沿用 fmtMoneyAmount(依幣別小數位)。 */
export function cashBalanceListText(ordered: readonly CashBalanceDto[]): string {
  return ordered
    .map(balance => `${balance.currency} ${fmtMoneyAmount(balance.amount, balance.currency)}`)
    .join(' · ');
}

/** U-07:只看各幣別,不看折算後總額 —— 總額可能為正而 USD 為負。 */
export function negativeCashCurrencies(ordered: readonly CashBalanceDto[]): string[] {
  return ordered.filter(balance => balance.amount < 0).map(balance => balance.currency);
}

/** 有非零餘額、但後端回報換不到匯率(unconvertedCurrencies)的幣別,依排序後的順序。 */
export function unconvertedCashCurrencies(
  ordered: readonly CashBalanceDto[],
  unconverted: readonly string[] | null | undefined,
): string[] {
  const missing = unconverted ?? [];
  return ordered.filter(balance => missing.includes(balance.currency)).map(balance => balance.currency);
}

/** 幣別碼清單的串接:zh 用「、」、en 用「, 」(提示文案的 `{codes}`)。 */
export function joinCurrencyCodes(codes: readonly string[], lang: Lang): string {
  return codes.join(lang === 'zh' ? '、' : ', ');
}

/** 入出金對話框的預設幣別:入金 → 第一個餘額為負的幣別,沒有則基準幣;出金 → 基準幣。 */
export function defaultCashEntryCurrency(
  kind: CashEntryType,
  ordered: readonly CashBalanceDto[],
  baseCurrency: string,
): string {
  if (kind === 'DEPOSIT') {
    const negative = ordered.find(balance => balance.amount < 0);
    if (negative) return negative.currency;
  }
  return baseCurrency;
}
