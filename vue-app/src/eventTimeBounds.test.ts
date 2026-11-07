import { describe, expect, it } from 'vitest';
import {
  MIN_EVENT_DATE,
  MIN_EVENT_INSTANT_MS,
  classifyDateInput,
  classifyInstantInput,
} from './eventTimeBounds';

// quick-261107-1j4(Yuan 2026-11-07 裁決 3B):現金 occurredAt、交易 executedAt、股利 paidAt 與
// 股數調整 effectiveDate 共用 1900-01-01 下限,錯誤分「空白 / 過早 / 晚於上限」三種文案。
// 後端比較的是 **instant**(UTC 1900-01-01 00:00),所以前端也必須用 instant 比較 ——
// 台北本地 1900-01-01T00:00 = 1899-12-31T16:00Z,會被後端拒絕。

/** 把 instant 轉成 `<input type="datetime-local">` 的本地字串(與元件的 toLocalInputValue 同規則)。 */
function localInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe('eventTimeBounds 常數', () => {
  it('下限是 UTC 1900-01-01 00:00 的 instant 與 1900-01-01 的日期字串', () => {
    expect(MIN_EVENT_INSTANT_MS).toBe(Date.UTC(1900, 0, 1));
    expect(new Date(MIN_EVENT_INSTANT_MS).toISOString()).toBe('1900-01-01T00:00:00.000Z');
    expect(MIN_EVENT_DATE).toBe('1900-01-01');
  });
});

describe('classifyInstantInput(datetime-local 字串)', () => {
  const now = Date.UTC(2026, 10, 5, 1, 0);

  it('空字串與不可解析的值 → required', () => {
    expect(classifyInstantInput('', now)).toBe('required');
    expect(classifyInstantInput('   ', now)).toBe('required');
    expect(classifyInstantInput('not-a-date', now)).toBe('required');
  });

  it('遠早於下限 → tooEarly', () => {
    expect(classifyInstantInput('1800-01-01T00:00', now)).toBe('tooEarly');
  });

  it('下限以 instant 比較:恰為下限的本地字串合法,早一分鐘 → tooEarly(與執行環境時區無關)', () => {
    expect(classifyInstantInput(localInput(MIN_EVENT_INSTANT_MS), now)).toBeNull();
    expect(classifyInstantInput(localInput(MIN_EVENT_INSTANT_MS - 60_000), now)).toBe('tooEarly');
  });

  it('台北本地 1900-01-01T00:00 早於 UTC 下限 —— 以 instant 直接建構驗證', () => {
    // 台北 1900-01-01T00:00+08:00 = 1899-12-31T16:00Z;在 Asia/Taipei 的瀏覽器裡,
    // '1900-01-01T00:00' 會被解析成這個 instant,必須歸為 tooEarly。
    const taipeiMidnight = Date.parse('1900-01-01T00:00:00+08:00');
    expect(taipeiMidnight).toBeLessThan(MIN_EVENT_INSTANT_MS);
    expect(classifyInstantInput(localInput(taipeiMidnight), now)).toBe('tooEarly');
  });

  it('晚於 now → future;早於 now → 合法', () => {
    expect(classifyInstantInput(localInput(now + 60_000), now)).toBe('future');
    expect(classifyInstantInput(localInput(now - 60_000), now)).toBeNull();
  });
});

describe('classifyDateInput(YYYY-MM-DD 字串)', () => {
  const max = '2026-11-04';

  it('空字串與不符格式 → required', () => {
    expect(classifyDateInput('', max)).toBe('required');
    expect(classifyDateInput('2026/11/04', max)).toBe('required');
    expect(classifyDateInput('2026-13-01', max)).toBe('required');
    expect(classifyDateInput('2026-02-30', max)).toBe('required');
  });

  it('早於 1900-01-01 → tooEarly;恰為 1900-01-01 → 合法', () => {
    expect(classifyDateInput('1899-12-31', max)).toBe('tooEarly');
    expect(classifyDateInput('1900-01-01', max)).toBeNull();
  });

  it('晚於 max → future;等於 max → 合法', () => {
    expect(classifyDateInput('2026-11-05', max)).toBe('future');
    expect(classifyDateInput(max, max)).toBeNull();
  });
});
