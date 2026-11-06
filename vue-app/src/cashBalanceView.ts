import type { CashBalanceDto } from './services/apiTypes';
import type { CashEntryType } from './services/cashApi';
import type { Lang } from './types';

// RED 骨架(quick-261106-fbs 2e):先讓測試能載入並在斷言上失敗,GREEN 再補實作。
export function orderCashBalances(_balances: readonly CashBalanceDto[] | null | undefined): CashBalanceDto[] {
  return [];
}
export function cashBalanceListText(_ordered: readonly CashBalanceDto[]): string {
  return '';
}
export function negativeCashCurrencies(_ordered: readonly CashBalanceDto[]): string[] {
  return [];
}
export function unconvertedCashCurrencies(
  _ordered: readonly CashBalanceDto[],
  _unconverted: readonly string[] | null | undefined,
): string[] {
  return [];
}
export function joinCurrencyCodes(_codes: readonly string[], _lang: Lang): string {
  return '';
}
export function defaultCashEntryCurrency(
  _kind: CashEntryType,
  _ordered: readonly CashBalanceDto[],
  baseCurrency: string,
): string {
  return baseCurrency;
}
