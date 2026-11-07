import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MARKET_DAY_RULE,
  marketDayRuleOf,
  marketToday,
  marketZoneLabelKey,
} from './marketDate';
import { t } from './i18n';

// quick-261107-1j4(04.2 WR-09,Yuan 2026-11-07 裁決 4):除權日預設值與 max 用標的市場的今天。
// 規則鏡像後端 `TradingDay.of(assetType, market)`(stock-common TradingDay.java:55-71),兩邊需同步。

describe('marketDayRuleOf — 鏡像 TradingDay.of', () => {
  it('CRYPTO 不論 market 一律 UTC、換日 0', () => {
    expect(marketDayRuleOf('CRYPTO', 'US')).toEqual({ zone: 'UTC', startOffsetHours: 0 });
    expect(marketDayRuleOf('CRYPTO', null)).toEqual({ zone: 'UTC', startOffsetHours: 0 });
  });

  it('FX 一律紐約、換日 17 小時', () => {
    expect(marketDayRuleOf('FX', 'TW')).toEqual({ zone: 'America/New_York', startOffsetHours: 17 });
  });

  it('其餘依 market(trim + 大寫)對照時區;null 或無法辨識 → UTC', () => {
    for (const market of ['US', 'NASDAQ', 'NYSE', 'AMEX', ' nyse ']) {
      expect(marketDayRuleOf('STOCK', market), market).toEqual({ zone: 'America/New_York', startOffsetHours: 0 });
    }
    for (const market of ['TW', 'TWSE', 'TPEX']) {
      expect(marketDayRuleOf('STOCK', market), market).toEqual({ zone: 'Asia/Taipei', startOffsetHours: 0 });
    }
    for (const market of ['JP', 'TSE']) {
      expect(marketDayRuleOf('ETF', market), market).toEqual({ zone: 'Asia/Tokyo', startOffsetHours: 0 });
    }
    for (const market of ['DE', 'XETRA']) {
      expect(marketDayRuleOf('STOCK', market), market).toEqual({ zone: 'Europe/Berlin', startOffsetHours: 0 });
    }
    expect(marketDayRuleOf('STOCK', null)).toEqual({ zone: 'UTC', startOffsetHours: 0 });
    expect(marketDayRuleOf('STOCK', 'XYZ')).toEqual({ zone: 'UTC', startOffsetHours: 0 });
    expect(marketDayRuleOf(null, undefined)).toEqual({ zone: 'UTC', startOffsetHours: 0 });
  });

  it('fallback 規則為紐約、換日 0(支援市場中最晚換日,未知標的的預設值不會被後端拒絕)', () => {
    expect(FALLBACK_MARKET_DAY_RULE).toEqual({ zone: 'America/New_York', startOffsetHours: 0 });
  });
});

describe('marketToday — 該時區當地時鐘減換日偏移後的日期', () => {
  const now = Date.parse('2026-11-05T01:00:00Z');

  it('2026-11-05T01:00Z:美股仍是 11-04,台股 / 日股 / 德股 / 加密已是 11-05', () => {
    expect(marketToday(marketDayRuleOf('STOCK', 'US'), now)).toBe('2026-11-04');
    expect(marketToday(marketDayRuleOf('STOCK', 'NASDAQ'), now)).toBe('2026-11-04');
    expect(marketToday(marketDayRuleOf('STOCK', ' nyse '), now)).toBe('2026-11-04');
    expect(marketToday(marketDayRuleOf('STOCK', 'TW'), now)).toBe('2026-11-05');
    expect(marketToday(marketDayRuleOf('STOCK', 'TWSE'), now)).toBe('2026-11-05');
    expect(marketToday(marketDayRuleOf('CRYPTO', 'US'), now)).toBe('2026-11-05');
    expect(marketToday(marketDayRuleOf('STOCK', 'JP'), now)).toBe('2026-11-05');
    expect(marketToday(marketDayRuleOf('STOCK', 'DE'), now)).toBe('2026-11-05');
  });

  it('FX:紐約 11-04 20:00 減 17 小時 → 11-04', () => {
    expect(marketToday(marketDayRuleOf('FX', null), now)).toBe('2026-11-04');
  });

  it('market null 或無法辨識 → UTC 日期', () => {
    expect(marketToday(marketDayRuleOf('STOCK', null), now)).toBe('2026-11-05');
    expect(marketToday(marketDayRuleOf('STOCK', 'XYZ'), now)).toBe('2026-11-05');
  });

  it('夏令時間:2026-07-01T03:30Z 的紐約(UTC−4)仍是 06-30', () => {
    expect(marketToday(marketDayRuleOf('STOCK', 'US'), Date.parse('2026-07-01T03:30:00Z'))).toBe('2026-06-30');
    expect(marketToday(marketDayRuleOf('STOCK', 'US'), Date.parse('2026-07-01T04:30:00Z'))).toBe('2026-07-01');
  });

  it('fallback 規則與美股同日', () => {
    expect(marketToday(FALLBACK_MARKET_DAY_RULE, now)).toBe('2026-11-04');
  });
});

describe('marketZoneLabelKey — 市場日期提示的時區名稱', () => {
  it('每個規則對到一個兩語皆有的 i18n 鍵', () => {
    const cases: Array<[string | null, string | null, string]> = [
      ['STOCK', 'US', 'marketZoneNewYork'],
      ['FX', null, 'marketZoneNewYork'],
      ['STOCK', 'TW', 'marketZoneTaipei'],
      ['STOCK', 'JP', 'marketZoneTokyo'],
      ['STOCK', 'DE', 'marketZoneBerlin'],
      ['CRYPTO', null, 'marketZoneUtc'],
      ['STOCK', 'XYZ', 'marketZoneUtc'],
    ];
    for (const [assetType, market, key] of cases) {
      expect(marketZoneLabelKey(marketDayRuleOf(assetType, market)), `${assetType}/${market}`).toBe(key);
      expect(t('zh', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });
});
