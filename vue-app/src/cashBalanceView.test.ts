import { describe, expect, it } from 'vitest';
import {
  cashBalanceListText,
  defaultCashEntryCurrency,
  joinCurrencyCodes,
  negativeCashCurrencies,
  orderCashBalances,
  unconvertedCashCurrencies,
} from './cashBalanceView';
import { fmtMoneyAmount } from './moneyFormat';
import { parseDecimal } from './services/decimal';
import type { CashBalance } from './services/apiTypes';
import overviewSource from './pages/Overview.vue?raw';
import cashSource from './pages/Cash.vue?raw';

// quick-261106-fbs 2e(04.1 IN-02):Overview 與 Cash 共用的現金餘額檢視純函式;行為與原本兩頁各自的 computed 逐案相同。
// Phase 5 D-08:餘額是 domain CashBalance(amount 為 Decimal);fixture 以 wire 字串建構。

/** wire 字串 → domain CashBalance(測試用,與 portfolioApi.toCashBalance 同形)。 */
function bal(currency: string, amount: string): CashBalance {
  return { currency, amount: parseDecimal(amount) };
}

const MIXED = [
  bal('JPY', '1000'),
  bal('HKD', '5'),
  bal('USD', '-12.5'),
  bal('EUR', '0'),
  bal('TWD', '300'),
];

describe('cashBalanceView(T2.6)', () => {
  it('依 TWD / USD / EUR / JPY 排序、未知幣別殿後、濾掉 0', () => {
    expect(orderCashBalances(MIXED).map(b => b.currency)).toEqual(['TWD', 'USD', 'JPY', 'HKD']);
  });

  it('null / undefined 視為沒有餘額,且不改動輸入陣列', () => {
    expect(orderCashBalances(null)).toEqual([]);
    expect(orderCashBalances(undefined)).toEqual([]);
    const input = [...MIXED];
    orderCashBalances(input);
    expect(input).toEqual(MIXED);
  });

  it('餘額清單文字:「代碼 金額」以 · 串接,金額沿用 fmtMoneyAmount(依幣別小數位)', () => {
    const ordered = orderCashBalances(MIXED);
    expect(cashBalanceListText(ordered)).toBe(
      `TWD ${fmtMoneyAmount(300, 'TWD')} · USD ${fmtMoneyAmount(-12.5, 'USD')} · JPY ${fmtMoneyAmount(1000, 'JPY')} · HKD ${fmtMoneyAmount(5, 'HKD')}`,
    );
    expect(cashBalanceListText([])).toBe('');
  });

  it('負值幣別只看各幣別本身(總額可能為正)', () => {
    expect(negativeCashCurrencies(orderCashBalances(MIXED))).toEqual(['USD']);
    expect(negativeCashCurrencies([])).toEqual([]);
  });

  it('未折算幣別:依排序後的順序,只列有非零餘額者', () => {
    const ordered = orderCashBalances(MIXED);
    expect(unconvertedCashCurrencies(ordered, ['HKD', 'JPY', 'EUR'])).toEqual(['JPY', 'HKD']);
    expect(unconvertedCashCurrencies(ordered, null)).toEqual([]);
  });

  it('幣別碼串接:zh 用「、」、en 用「, 」', () => {
    expect(joinCurrencyCodes(['USD', 'JPY'], 'zh')).toBe('USD、JPY');
    expect(joinCurrencyCodes(['USD', 'JPY'], 'en')).toBe('USD, JPY');
    expect(joinCurrencyCodes([], 'en')).toBe('');
  });

  it('入金預設幣別:第一個負值幣別,否則基準幣;出金一律基準幣', () => {
    const ordered = orderCashBalances([bal('JPY', '-1'), bal('USD', '-2'), bal('TWD', '10')]);
    expect(defaultCashEntryCurrency('DEPOSIT', ordered, 'TWD')).toBe('USD');
    expect(defaultCashEntryCurrency('WITHDRAWAL', ordered, 'TWD')).toBe('TWD');
    expect(defaultCashEntryCurrency('DEPOSIT', orderCashBalances([bal('TWD', '5')]), 'EUR')).toBe('EUR');
  });

  it('Overview 與 Cash 改用共用函式,不再各自定義排序與串接(IN-02)', () => {
    for (const [name, source] of [['Overview.vue', overviewSource], ['Cash.vue', cashSource]] as const) {
      expect(source, name).toContain("from '../cashBalanceView'");
      expect(source, name).not.toMatch(/function joinCodes\(/);
      expect(source, name).not.toContain('BASE_CURRENCY_OPTIONS as readonly string[]');
    }
  });
});
