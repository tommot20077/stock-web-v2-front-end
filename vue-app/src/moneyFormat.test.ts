import { describe, expect, it } from 'vitest';
import {
  fmtMoney,
  fmtMoneyAmount,
  fmtQuantity,
  fmtRatioPct,
  fmtSignedMoney,
  fmtSignedMoneyAmount,
  fmtSignedQuantity,
  fmtWeightPct,
  minorUnits,
} from './moneyFormat';
import { parseDecimal } from './services/decimal';

// Phase 04.1 D-30:金額一律「數字 + U+00A0 + ISO 代碼」,不用 $ / NT$ / ¥。
const NBSP = '\u00A0';

describe('moneyFormat', () => {
  describe('fmtMoney', () => {
    it('數字 + NBSP + ISO 代碼,千分位', () => {
      expect(fmtMoney(1234567, 'TWD', 0)).toBe(`1,234,567${NBSP}TWD`);
    });

    it('null / 非有限值顯示 —,且不帶代碼', () => {
      expect(fmtMoney(null, 'TWD', 0)).toBe('—');
      expect(fmtMoney(undefined, 'TWD', 0)).toBe('—');
      expect(fmtMoney(NaN, 'USD', 2)).toBe('—');
      expect(fmtMoney(Infinity, 'USD', 2)).toBe('—');
    });

    it('代碼為空 / null 時只回數字,不帶尾端空白', () => {
      expect(fmtMoney(12, '', 2)).toBe('12.00');
      expect(fmtMoney(12, null, 2)).toBe('12.00');
      expect(fmtMoney(12, undefined, 2)).toBe('12.00');
    });
  });

  describe('fmtSignedMoney', () => {
    it('> 0 加 +、< 0 為 -、= 0 無號', () => {
      expect(fmtSignedMoney(12481, 'TWD', 0)).toBe(`+12,481${NBSP}TWD`);
      expect(fmtSignedMoney(-3200, 'TWD', 0)).toBe(`-3,200${NBSP}TWD`);
      expect(fmtSignedMoney(0, 'TWD', 0)).toBe(`0${NBSP}TWD`);
    });

    it('null 顯示 — 不帶代碼', () => {
      expect(fmtSignedMoney(null, 'TWD', 0)).toBe('—');
    });
  });

  describe('fmtMoneyAmount / fmtSignedMoneyAmount', () => {
    it('只回數字部分,dp 省略時用 minorUnits(code)', () => {
      expect(fmtMoneyAmount(218.4, 'USD')).toBe('218.40');
      expect(fmtMoneyAmount(1500, 'JPY')).toBe('1,500');
      expect(fmtMoneyAmount(300, 'TWD', 0)).toBe('300');
    });

    it('缺幣別時照常以裸數字顯示(預設 2 位)', () => {
      expect(fmtMoneyAmount(10, null)).toBe('10.00');
      expect(fmtMoneyAmount(10, undefined, 0)).toBe('10');
    });

    it('null / 非有限值 → —', () => {
      expect(fmtMoneyAmount(null, 'USD')).toBe('—');
      expect(fmtSignedMoneyAmount(NaN, 'USD')).toBe('—');
    });

    it('帶號版本:> 0 加 +、< 0 為 -、= 0 無號', () => {
      expect(fmtSignedMoneyAmount(555, 'USD', 0)).toBe('+555');
      expect(fmtSignedMoneyAmount(-555, 'USD', 0)).toBe('-555');
      expect(fmtSignedMoneyAmount(0, 'USD', 0)).toBe('0');
      expect(fmtSignedMoneyAmount(1.5, 'USD')).toBe('+1.50');
    });
  });

  describe('minorUnits', () => {
    it('JPY → 0,其餘(含空值)→ 2', () => {
      expect(minorUnits('JPY')).toBe(0);
      expect(minorUnits('TWD')).toBe(2);
      expect(minorUnits('USD')).toBe(2);
      expect(minorUnits(null)).toBe(2);
      expect(minorUnits(undefined)).toBe(2);
      expect(minorUnits('')).toBe(2);
    });
  });

  describe('fmtRatioPct', () => {
    it('比值 × 100,2 位小數、帶號;0 無號', () => {
      expect(fmtRatioPct(0.0104)).toBe('+1.04%');
      expect(fmtRatioPct(-0.003)).toBe('-0.30%');
      expect(fmtRatioPct(0)).toBe('0.00%');
    });

    it('null / 非有限 → null(呼叫端不渲染該行)', () => {
      expect(fmtRatioPct(null)).toBeNull();
      expect(fmtRatioPct(undefined)).toBeNull();
      expect(fmtRatioPct(NaN)).toBeNull();
    });
  });

  describe('fmtWeightPct', () => {
    it('權重 × 100,1 位小數、無號', () => {
      expect(fmtWeightPct(0.52)).toBe('52.0%');
      expect(fmtWeightPct(1)).toBe('100.0%');
    });

    it('null → —', () => {
      expect(fmtWeightPct(null)).toBe('—');
      expect(fmtWeightPct(undefined)).toBe('—');
    });
  });

  // Phase 04.2 UI-SPEC §Money:股數變動帶號、千分位、最多 8 位小數去尾零;null → —。
  describe('fmtSignedQuantity', () => {
    it('> 0 前綴 +,千分位,整數不補小數', () => {
      expect(fmtSignedQuantity(300)).toBe('+300');
      expect(fmtSignedQuantity(1050)).toBe('+1,050');
    });

    it('< 0 的負號與 fmtSignedMoney 相同字元', () => {
      const minus = fmtSignedMoney(-1, '', 0).charAt(0);
      expect(fmtSignedQuantity(-94.5)).toBe(`${minus}94.5`);
      expect(fmtSignedQuantity(-1234.5)).toBe(`${minus}1,234.5`);
    });

    it('最多 8 位小數並去尾零', () => {
      expect(fmtSignedQuantity(0.33333333)).toBe('+0.33333333');
      expect(fmtSignedQuantity(12.5)).toBe('+12.5');
      expect(fmtSignedQuantity(Number('12.50000000'))).toBe('+12.5');
      expect(fmtSignedQuantity(1.123456789)).toBe('+1.12345679');
    });

    it('= 0 無號(含捨入後為零)', () => {
      expect(fmtSignedQuantity(0)).toBe('0');
      expect(fmtSignedQuantity(0.000000001)).toBe('0');
      expect(fmtSignedQuantity(-0.000000001)).toBe('0');
    });

    it('null / undefined / 非有限值 → —', () => {
      expect(fmtSignedQuantity(null)).toBe('—');
      expect(fmtSignedQuantity(undefined)).toBe('—');
      expect(fmtSignedQuantity(NaN)).toBe('—');
      expect(fmtSignedQuantity(Infinity)).toBe('—');
    });
  });

  describe('fmtQuantity', () => {
    it('同規則但不帶號', () => {
      expect(fmtQuantity(1050)).toBe('1,050');
      expect(fmtQuantity(33.33333333)).toBe('33.33333333');
      expect(fmtQuantity(12.5)).toBe('12.5');
      expect(fmtQuantity(0)).toBe('0');
    });

    it('負數保留負號(與 fmtSignedMoney 同字元)', () => {
      const minus = fmtSignedMoney(-1, '', 0).charAt(0);
      expect(fmtQuantity(-3.25)).toBe(`${minus}3.25`);
    });

    it('null / undefined / 非有限值 → —', () => {
      expect(fmtQuantity(null)).toBe('—');
      expect(fmtQuantity(undefined)).toBe('—');
      expect(fmtQuantity(NaN)).toBe('—');
    });
  });

  // Phase 5 D-08:Decimal 輸入走 toFixed(dp, HALF_UP) → Intl 千分位,全程不經 JS number。
  describe('Decimal 輸入', () => {
    const d = parseDecimal;

    it('12 位整數 + 8 位小數完整顯示(number 會失真)', () => {
      expect(fmtMoney(d('123456789012.12345678'), 'USD', 8)).toBe(`123,456,789,012.12345678${NBSP}USD`);
      expect(fmtMoneyAmount(d('123456789012.12345678'), 'USD', 8)).toBe('123,456,789,012.12345678');
    });

    it('HALF_UP 捨入(2.345 → 2.35,-2.345 → -2.35)', () => {
      expect(fmtMoney(d('2.345'), 'USD', 2)).toBe(`2.35${NBSP}USD`);
      expect(fmtMoney(d('-2.345'), 'USD', 2)).toBe(`-2.35${NBSP}USD`);
      expect(fmtMoney(d('2.5'), 'JPY', 0)).toBe(`3${NBSP}JPY`);
    });

    it('一般值與等值 number 輸出相同字串', () => {
      const cases: Array<[string, string, number]> = [
        ['1234567', 'TWD', 0],
        ['218.4', 'USD', 2],
        ['-3200', 'TWD', 0],
        ['0', 'USD', 2],
        ['1500', 'JPY', 0],
        ['0.5', 'EUR', 2],
      ];
      for (const [wire, code, dp] of cases) {
        expect(fmtMoney(d(wire), code, dp), wire).toBe(fmtMoney(Number(wire), code, dp));
        expect(fmtSignedMoney(d(wire), code, dp), wire).toBe(fmtSignedMoney(Number(wire), code, dp));
        expect(fmtMoneyAmount(d(wire), code), wire).toBe(fmtMoneyAmount(Number(wire), code));
        expect(fmtSignedMoneyAmount(d(wire), code), wire).toBe(fmtSignedMoneyAmount(Number(wire), code));
      }
    });

    it('帶號:> 0 加 +;捨入後為零不加正號', () => {
      expect(fmtSignedMoney(d('12481'), 'TWD', 0)).toBe(`+12,481${NBSP}TWD`);
      expect(fmtSignedMoney(d('0.001'), 'USD', 2)).toBe(`0.00${NBSP}USD`);
      expect(fmtSignedMoney(d('0.005'), 'USD', 2)).toBe(`+0.01${NBSP}USD`);
      expect(fmtSignedMoneyAmount(d('0E-8'), 'USD')).toBe('0.00');
    });

    it('null 仍為 —', () => {
      expect(fmtMoney(null, 'USD', 2)).toBe('—');
      expect(fmtSignedMoney(undefined, 'USD', 2)).toBe('—');
    });

    it('比率 / 權重的 × 100 在 Decimal 內做', () => {
      expect(fmtRatioPct(d('0.0104'))).toBe('+1.04%');
      expect(fmtRatioPct(d('-0.003'))).toBe('-0.30%');
      expect(fmtRatioPct(d('0'))).toBe('0.00%');
      expect(fmtWeightPct(d('0.52'))).toBe('52.0%');
      expect(fmtWeightPct(d('1'))).toBe('100.0%');
    });

    it('股數:最多 8 位小數去尾零、千分位、帶號規則同 number', () => {
      expect(fmtSignedQuantity(d('1050'))).toBe('+1,050');
      expect(fmtSignedQuantity(d('12.50000000'))).toBe('+12.5');
      expect(fmtSignedQuantity(d('1.123456785'))).toBe('+1.12345679');
      expect(fmtSignedQuantity(d('0.000000001'))).toBe('0');
      expect(fmtSignedQuantity(d('-0.000000001'))).toBe('0');
      expect(fmtQuantity(d('-3.25'))).toBe('-3.25');
      expect(fmtQuantity(d('123456789012.12345678'))).toBe('123,456,789,012.12345678');
    });
  });

  it('任何輸出都不含 $、NT$、¥', () => {
    const outputs = [
      fmtMoney(1234.5, 'USD', 2),
      fmtMoney(1234.5, 'TWD', 0),
      fmtMoney(1234.5, 'JPY', 0),
      fmtSignedMoney(-1234.5, 'CNY', 2),
      fmtMoneyAmount(1234.5, 'USD'),
      fmtSignedMoneyAmount(1234.5, 'JPY'),
      fmtRatioPct(0.05) ?? '',
      fmtWeightPct(0.5),
    ];
    for (const out of outputs) {
      expect(out).not.toMatch(/\$|¥/);
    }
  });
});
