import { describe, expect, it } from 'vitest';
import {
  fmtMoney,
  fmtMoneyAmount,
  fmtRatioPct,
  fmtSignedMoney,
  fmtSignedMoneyAmount,
  fmtWeightPct,
  minorUnits,
} from './moneyFormat';

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
