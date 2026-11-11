import { describe, expect, it } from 'vitest';
import { csvCell } from './csvCell';
import tradesSource from './pages/Trades.vue?raw';

// quick-261107-1j4 2f / 04.2-review IN-05:匯出的 CSV 在試算表中開啟時,文字儲存格不得被當成公式執行。

describe('csvCell(T2.11)', () => {
  it('以 = 開頭的文字 → 前綴單引號,再依 CSV 規則加引號與跳脫', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it('以 @ / + / - 開頭的非數字文字 → 前綴單引號', () => {
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-cmd')).toBe("'-cmd");
  });

  it('以 tab / CR 開頭 → 前綴單引號(CR 另觸發加引號)', () => {
    expect(csvCell('\tfoo')).toBe("'\tfoo");
    expect(csvCell('\rfoo')).toBe(`"'\rfoo"`);
  });

  it('number 原樣輸出;純數字字串(含負號、小數)不前綴', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(0)).toBe('0');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('42')).toBe('42');
  });

  it('05-21:Decimal 經 toWire 的金額字串(一般記號)原樣輸出,不加公式前綴', () => {
    expect(csvCell('0.00000001')).toBe('0.00000001');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('123456789012.12345678')).toBe('123456789012.12345678');
    expect(csvCell('-0.00000001')).toBe('-0.00000001');
    // 科學記號不是純數字字串:若有人誤用 String(Decimal),`-1e-8` 會被當成文字前綴(提醒一律走 toWire)。
    expect(csvCell('-1e-8')).toBe("'-1e-8");
  });

  it('既有規則不變:null / undefined → 空字串;逗號、引號、換行加引號', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('a,b "quoted"\nnext')).toBe('"a,b ""quoted""\nnext"');
    expect(csvCell('plain note')).toBe('plain note');
  });

  it('Trades.vue 改用共用的 csvCell(不再自己定義)', () => {
    expect(tradesSource).toMatch(/import \{ csvCell[^}]*\} from '\.\.\/csvCell'/);
    expect(tradesSource).not.toMatch(/function csvCell\(/);
  });
});
