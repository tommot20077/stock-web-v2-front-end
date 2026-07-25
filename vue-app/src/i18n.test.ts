import { describe, expect, it } from 'vitest';
import { I18N, t } from './i18n';

// Phase 3 portfolio 頁面(Positions / Trades / Overview)共用的狀態文案。
// `retry` 刻意不新增:既有 authRetry(重試 / Retry)語意與文案完全相同,直接複用。
const PORTFOLIO_STATE_KEYS = [
  'loading',
  'loadFailed',
  'noTrades',
  'noHoldings',
  'noData',
  'prevPage',
  'nextPage',
  'priceAsOf',
  'realizedPnl',
  'totalPnlLabel',
  'costBasis',
];

describe('i18n portfolio copy', () => {
  it('provides every portfolio state key in both languages', () => {
    for (const key of PORTFOLIO_STATE_KEYS) {
      expect(I18N.zh[key], `zh.${key}`).toBeTruthy();
      expect(I18N.en[key], `en.${key}`).toBeTruthy();
      // t() 找不到 key 時會回傳 key 本身,確保文案真的翻譯過
      expect(t('zh', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });

  it('reuses authRetry for the portfolio retry action instead of adding a duplicate key', () => {
    expect(I18N.zh.authRetry).toBe('重試');
    expect(I18N.en.authRetry).toBe('Retry');
  });
});
