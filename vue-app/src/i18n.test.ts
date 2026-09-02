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

// Phase 4 手動記錄交易的全部新文案(42 個),權威來源是
// `.planning/phases/04-.../04-UI-SPEC.md` §Copywriting Contract。
const PHASE4_TRADE_KEYS = [
  // 動作與標題(8)
  'recordTrade',
  'reviewTrade',
  'recordingTrade',
  'tradeRecorded',
  'backToEdit',
  'recordAnother',
  'closeTicket',
  'tradeIrreversibleNote',
  // 欄位標籤與說明(7)
  'tradeExecutedAt',
  'tradeExecutedAtHint',
  'tradeFeeHint',
  'sellableQty',
  'sellableQtyLoading',
  'sellableQtyFailed',
  'tradeId',
  // 空狀態(5)
  'symbolNoResults',
  'symbolNoTradable',
  'symbolMoreResults',
  'quoteChartEmpty',
  'quoteChartError',
  // typeahead 錯誤(1)
  'symbolSearchFailed',
  // 欄位級錯誤(7,key 對應後端 error.fields 的 key)
  'tradeErrSymbol',
  'tradeErrType',
  'tradeErrQuantity',
  'tradeErrPrice',
  'tradeErrFee',
  'tradeErrNote',
  'tradeErrExecutedAt',
  // 底部錯誤(依 error.code 分派,9)
  'tradeErrOversell',
  'tradeErrAssetNotFound',
  'tradeErrValidation',
  'tradeErrConflict',
  'tradeErrKeyReused',
  'tradeErrForbidden',
  'tradeErrCsrf',
  'tradeErrNetwork',
  'tradeErrUnknown',
  // Post-trade refetch(5)
  'portfolioRefreshing',
  'portfolioStaleAfterTrade',
  'tradeNotInCurrentView',
  'freshBadge',
  'tradeRecordedToast',
];

// UI-SPEC 文案硬規則 1 的適用範圍:ticket 底部「送出之後」依 error.code 分派的錯誤。
// `tradeErrNetwork` 是唯一「結果未知」的情境,故排除(改由硬規則 2 鎖住)。
// 欄位級錯誤(tradeErrSymbol 等 7 個)是送出前綁在輸入框旁的提示,不是「我這筆交易怎麼了」
// 的回答,加上「交易未記錄」既冗餘又與 UI-SPEC 逐字文案衝突,故不在此清單。
const TRADE_SUBMIT_ERROR_KEYS = [
  'tradeErrOversell',
  'tradeErrAssetNotFound',
  'tradeErrValidation',
  'tradeErrConflict',
  'tradeErrKeyReused',
  'tradeErrForbidden',
  'tradeErrCsrf',
  'tradeErrUnknown',
];

// judgment §1 + D-09:API mode 不得出現 broker/order lifecycle 的語彙。
const FORBIDDEN_EN_TERMS = ['order', 'pending', 'filled', 'routing', 'cancel order', 'time-in-force'];
const FORBIDDEN_ZH_TERMS = ['下單', '委託', '撮合', '已成交', '成交均價', '有效期'];

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

describe('i18n phase 4 trade copy', () => {
  it('provides every phase 4 trade key in both languages', () => {
    for (const key of PHASE4_TRADE_KEYS) {
      expect(I18N.zh[key], `zh.${key}`).toBeTruthy();
      expect(I18N.en[key], `en.${key}`).toBeTruthy();
      expect(t('zh', key), `t(zh, ${key})`).not.toBe(key);
      expect(t('en', key), `t(en, ${key})`).not.toBe(key);
    }
  });

  it('reuses existing state keys instead of adding phase 4 synonyms', () => {
    // 這五個名稱一旦出現,表示有人為既有語意造了同義 key。
    // 正確做法是複用 loading / loadFailed / authRetry / authRequestId / cancel。
    for (const synonym of ['tradeLoading', 'tradeLoadFailed', 'tradeRetry', 'tradeTraceId', 'tradeCancel']) {
      expect(I18N.zh[synonym], `zh.${synonym} 不該存在`).toBeUndefined();
      expect(I18N.en[synonym], `en.${synonym} 不該存在`).toBeUndefined();
    }
    expect(I18N.zh.loading).toBeTruthy();
    expect(I18N.zh.loadFailed).toBeTruthy();
    expect(I18N.zh.authRetry).toBeTruthy();
    expect(I18N.zh.authRequestId).toBeTruthy();
    expect(I18N.zh.cancel).toBeTruthy();
  });

  it('keeps broker and order lifecycle vocabulary out of every phase 4 string', () => {
    for (const key of PHASE4_TRADE_KEYS) {
      const zh = I18N.zh[key];
      const en = I18N.en[key].toLowerCase();
      for (const term of FORBIDDEN_ZH_TERMS) {
        expect(zh.includes(term), `zh.${key} 含禁止用語「${term}」:${zh}`).toBe(false);
      }
      for (const term of FORBIDDEN_EN_TERMS) {
        expect(en.includes(term), `en.${key} contains forbidden term "${term}": ${en}`).toBe(false);
      }
    }
  });

  it('states that nothing was recorded on every post-submit error except the network one', () => {
    for (const key of TRADE_SUBMIT_ERROR_KEYS) {
      expect(I18N.zh[key], `zh.${key} 必須明說「交易未記錄」`).toContain('交易未記錄');
      expect(I18N.en[key].toLowerCase(), `en.${key} must say "nothing was recorded"`)
        .toContain('nothing was recorded');
    }
  });

  it('never calls the reused idempotency key a duplicate request', () => {
    // D-07 的事實與「重複」相反:什麼都沒建立。說成 duplicate 會讓使用者去刪除或回報不存在的第二筆。
    expect(I18N.zh.tradeErrKeyReused).not.toContain('重複');
    expect(I18N.en.tradeErrKeyReused.toLowerCase()).not.toContain('duplicate');
  });

  it('promises no duplicate trade when the network outcome is unknown', () => {
    expect(I18N.zh.tradeErrNetwork).toContain('不會建立重複交易');
    expect(I18N.en.tradeErrNetwork.toLowerCase()).toContain('will not create a duplicate');
  });
});
