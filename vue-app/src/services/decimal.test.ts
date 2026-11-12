import { describe, expect, it } from 'vitest';
import {
  isDecimal,
  numberToWire,
  parseDecimal,
  parseDecimalInput,
  parseNullableDecimal,
  ROUND_HALF_UP,
  toChartNumber,
  toWire,
  ZERO,
} from './decimal';

// Phase 5 D-08 / VER-02:wire 字串 ↔ Decimal 的往返必須逐字精確,number 混入要大聲失敗。
describe('decimal', () => {
  describe('parseDecimal / toWire 往返', () => {
    it('12 位整數 + 8 位小數逐字相同(JS number 會失真的量級)', () => {
      const wire = '123456789012.12345678';
      expect(toWire(parseDecimal(wire))).toBe(wire);
      // 對照組:同一個值經 number 會失真,這正是 decimal 層存在的理由。
      expect(String(Number(wire))).not.toBe(wire);
    });

    it('冪等:重複套用 parse → toWire 結果不變', () => {
      for (const wire of ['123456789012.12345678', '0.00000001', '1.50000000', '0E-8', '-42.5', '1e3']) {
        const once = toWire(parseDecimal(wire));
        expect(toWire(parseDecimal(toWire(parseDecimal(once)))), wire).toBe(once);
      }
    });

    it('toWire 一律一般記號:1e-8 → "0.00000001",不是科學記號', () => {
      expect(toWire(parseDecimal('0.00000001'))).toBe('0.00000001');
      expect(toWire(parseDecimal('1e-8'))).toBe('0.00000001');
    });

    it('後端 BigDecimal 的 "0E-8" → "0"', () => {
      expect(toWire(parseDecimal('0E-8'))).toBe('0');
    });

    it('乘法精確(不經 number)', () => {
      const product = parseDecimal('123456789012.12345678').times(parseDecimal('1000000.12345678'));
      expect(product.toFixed()).toBe('123456804253701097.3561429365279684');
    });
  });

  describe('strict 模式', () => {
    it('wire 為 JS number 時丟錯,而不是靜默接受', () => {
      expect(() => parseDecimal(123 as unknown as string)).toThrow(TypeError);
    });

    it('Decimal 方法收到 JS number 也丟錯(常數要用字串建構)', () => {
      expect(() => parseDecimal('1').times(100)).toThrow();
      expect(() => parseDecimal('1').plus(parseDecimal('100'))).not.toThrow();
    });

    it('toWire 拒絕非 Decimal(number 不得混進 wire 路徑)', () => {
      expect(() => toWire(5 as unknown as ReturnType<typeof parseDecimal>)).toThrow(TypeError);
    });

    it('不合法字串丟錯', () => {
      expect(() => parseDecimal('abc')).toThrow();
      expect(() => parseDecimal('')).toThrow();
    });
  });

  describe('parseNullableDecimal', () => {
    it('null / undefined → null,其餘同 parseDecimal', () => {
      expect(parseNullableDecimal(null)).toBeNull();
      expect(parseNullableDecimal(undefined)).toBeNull();
      expect(toWire(parseNullableDecimal('3.14')!)).toBe('3.14');
    });
  });

  describe('parseDecimalInput', () => {
    it('trim 後解析', () => {
      expect(toWire(parseDecimalInput(' 1.5 ')!)).toBe('1.5');
      expect(toWire(parseDecimalInput('123456789012.12345678')!)).toBe('123456789012.12345678');
    });

    it('空字串 / 純空白 / 無效 → null', () => {
      expect(parseDecimalInput('')).toBeNull();
      expect(parseDecimalInput('   ')).toBeNull();
      expect(parseDecimalInput('abc')).toBeNull();
      expect(parseDecimalInput('1.2.3')).toBeNull();
    });
  });

  describe('顯示 / mock 出口', () => {
    it('toChartNumber 回 JS number', () => {
      expect(toChartNumber(parseDecimal('1.25'))).toBe(1.25);
    });

    it('numberToWire:最短往返表示並正規化為一般記號', () => {
      expect(numberToWire(0.1)).toBe('0.1');
      expect(numberToWire(500000)).toBe('500000');
      expect(numberToWire(1e-7)).toBe('0.0000001');
      expect(numberToWire(-3.5)).toBe('-3.5');
    });

    it('numberToWire 拒絕非有限值', () => {
      expect(() => numberToWire(NaN)).toThrow(TypeError);
      expect(() => numberToWire(Infinity)).toThrow(TypeError);
    });
  });

  describe('isDecimal / ZERO / ROUND_HALF_UP', () => {
    it('isDecimal 只認 Decimal 實例', () => {
      expect(isDecimal(parseDecimal('1'))).toBe(true);
      expect(isDecimal(ZERO)).toBe(true);
      expect(isDecimal(1)).toBe(false);
      expect(isDecimal('1')).toBe(false);
      expect(isDecimal(null)).toBe(false);
      expect(isDecimal({ c: [1], e: 0, s: 1 })).toBe(false);
    });

    it('ZERO 為 0', () => {
      expect(toWire(ZERO)).toBe('0');
      expect(parseDecimal('0E-8').eq(ZERO)).toBe(true);
    });

    it('HALF_UP 捨入,與後端 RoundingMode.HALF_UP 一致', () => {
      expect(parseDecimal('2.345').round(2, ROUND_HALF_UP).toFixed()).toBe('2.35');
      expect(parseDecimal('-2.345').round(2, ROUND_HALF_UP).toFixed()).toBe('-2.35');
      expect(parseDecimal('2.5').toFixed(0)).toBe('3');
      // div 位數由 DP=20 決定,比率要明確 round。
      expect(parseDecimal('1').div(parseDecimal('3')).toFixed()).toBe('0.33333333333333333333');
    });
  });
});
