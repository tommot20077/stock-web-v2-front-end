import { describe, expect, it } from 'vitest';
import { I18N, t, tf } from './i18n';

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

// Phase 04.1 入出金、基準幣、KPI 與配置的全部新文案(81 個),權威來源是
// `.planning/phases/04.1-.../04.1-UI-SPEC.md` §Copywriting Contract。
const PHASE41_KEYS = [
  // 動作與標題(18)
  'cashRecordDeposit',
  'cashRecordWithdrawal',
  'cashRecordReversal',
  'cashDialogTitleReversal',
  'cashDepositRecorded',
  'cashWithdrawalRecorded',
  'cashReversalRecorded',
  'cashDone',
  'closeCashDialog',
  'cashTypeDeposit',
  'cashTypeWithdrawal',
  'cashReverseThis',
  'cashReverseThisAria',
  'cashIrreversibleNote',
  'cash',
  'cashViewEntries',
  'cashReversalNote',
  'cashLedgerOnlyNote',
  // 欄位與說明(19)
  'cashCurrency',
  'cashAmount',
  'cashAmountHint',
  'cashOccurredAt',
  'cashOccurredAtHint',
  'cashWithdrawOverBalance',
  'cashReversalOriginal',
  'cashReversalWillRecord',
  'cashEntryId',
  'baseCurrency',
  'baseCurrencySub',
  'currencyNameTWD',
  'currencyNameUSD',
  'currencyNameEUR',
  'currencyNameJPY',
  'settingSaving',
  'settingSaved',
  'baseCurrencySwitching',
  'mockDataNoticeExceptBaseCurrency',
  // KPI / 配置 / 持倉 / 列表(21)
  'dayPnlNote',
  'dayPnlExcluded',
  'dayPnlUnavailable',
  'fxExcludedHint',
  'cashFxExcludedHint',
  'cashNegativeHint',
  'assetTypeStock',
  'assetTypeCrypto',
  'assetTypeBond',
  'assetTypeFx',
  'assetTypeCash',
  'assetTypeOther',
  'allocationNegativeCash',
  'sectorUncategorized',
  'holdingsCurrencyNote',
  'tradesCurrencyNote',
  'cashEntries',
  'cashColStatus',
  'cashReversed',
  'cashReversalOf',
  'cashEntryNotInView',
  // 空狀態(3)
  'cashEntriesEmpty',
  'cashEntriesEmptyBody',
  'allocationEmpty',
  // 對話框錯誤(13)
  'cashErrType',
  'cashErrCurrency',
  'cashErrAmount',
  'cashErrOccurredAt',
  'cashErrValidation',
  'cashErrKeyReused',
  'cashErrAlreadyReversed',
  'cashErrNotReversible',
  'cashErrOriginalNotFound',
  'cashErrForbidden',
  'cashErrCsrf',
  'cashErrNetwork',
  'cashErrUnknown',
  // 基準幣錯誤(5)
  'baseCurrencyErrUnsupported',
  'baseCurrencyErrForbidden',
  'baseCurrencyErrCsrf',
  'baseCurrencyErrNetwork',
  'baseCurrencyErrUnknown',
  // 重讀失敗(2)
  'portfolioStaleAfterCashEntry',
  'portfolioStaleAfterBaseCurrency',
];

// 含佔位符的鍵:zh 與 en 兩版都必須出現相同的佔位符集合(語序不同,不能字串串接)。
const PLACEHOLDERS_BY_KEY: Record<string, string[]> = {
  cashReverseThisAria: ['amount', 'date', 'type'],
  cashWithdrawOverBalance: ['code'],
  dayPnlExcluded: ['n'],
  fxExcludedHint: ['base', 'n'],
  cashFxExcludedHint: ['base', 'codes'],
  cashNegativeHint: ['codes'],
  holdingsCurrencyNote: ['base'],
  cashReversalOf: ['date'],
};

// 入出金對話框「送出之後」的底部錯誤:除網路失敗外,都必須明說紀錄沒有寫入。
// 欄位級錯誤(cashErrType / Currency / Amount / OccurredAt)綁在輸入框旁,不屬於這一組。
const CASH_SUBMIT_ERROR_KEYS = [
  'cashErrValidation',
  'cashErrKeyReused',
  'cashErrAlreadyReversed',
  'cashErrNotReversible',
  'cashErrOriginalNotFound',
  'cashErrForbidden',
  'cashErrCsrf',
  'cashErrUnknown',
];

const PHASE41_FORBIDDEN_ZH = ['帳戶餘額', '轉帳', '撥款', '可下單金額', '凍結'];
const PHASE41_FORBIDDEN_EN = ['account balance', 'transfer', 'funding', 'buying power'];

function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
}

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

describe('i18n phase 04.1 copy', () => {
  it('provides every phase 04.1 key in both languages', () => {
    for (const key of PHASE41_KEYS) {
      expect(I18N.zh[key], `zh.${key}`).toBeTruthy();
      expect(I18N.en[key], `en.${key}`).toBeTruthy();
      expect(t('zh', key), `t(zh, ${key})`).not.toBe(key);
      expect(t('en', key), `t(en, ${key})`).not.toBe(key);
    }
  });

  it('lists each phase 04.1 key only once', () => {
    expect(new Set(PHASE41_KEYS).size).toBe(PHASE41_KEYS.length);
  });

  it('keeps the same placeholders in zh and en', () => {
    for (const [key, expected] of Object.entries(PLACEHOLDERS_BY_KEY)) {
      expect(placeholdersOf(I18N.zh[key]), `zh.${key}`).toEqual(expected);
      expect(placeholdersOf(I18N.en[key]), `en.${key}`).toEqual(expected);
    }
    // 沒有登記的鍵不得偷帶佔位符(否則呼叫端不會替換,畫面會露出 {x})。
    for (const key of PHASE41_KEYS.filter(candidate => !(candidate in PLACEHOLDERS_BY_KEY))) {
      expect(placeholdersOf(I18N.zh[key]), `zh.${key}`).toEqual([]);
      expect(placeholdersOf(I18N.en[key]), `en.${key}`).toEqual([]);
    }
  });

  it('tf replaces every placeholder and leaves unsupplied ones untouched', () => {
    const zh = tf('zh', 'dayPnlExcluded', { n: 2 });
    expect(zh.startsWith('2')).toBe(true);
    expect(zh).not.toContain('{n}');

    const partial = tf('en', 'fxExcludedHint', { n: 3 });
    expect(partial.startsWith('3')).toBe(true);
    expect(partial).toContain('{base}');

    const aria = tf('en', 'cashReverseThisAria', { date: '2026-10-01', type: 'Deposit', amount: '500 TWD' });
    expect(aria).toBe('Reverse Deposit of 500 TWD on 2026-10-01');

    // 同一個佔位符出現多次也要全數替換;未知鍵退回 key 本身,與 t() 一致。
    expect(tf('en', 'no-such-key', { n: 1 })).toBe('no-such-key');
  });

  it('keeps forbidden ledger vocabulary out of every phase 04.1 string', () => {
    for (const key of PHASE41_KEYS) {
      const zh = I18N.zh[key];
      const en = I18N.en[key].toLowerCase();
      for (const term of PHASE41_FORBIDDEN_ZH) {
        expect(zh.includes(term), `zh.${key} 含禁止用語「${term}」:${zh}`).toBe(false);
      }
      for (const term of PHASE41_FORBIDDEN_EN) {
        expect(en.includes(term), `en.${key} contains forbidden term "${term}": ${en}`).toBe(false);
      }
      // 'holdings' 不受影響;只擋獨立單字 hold(凍結 / 預扣的意思)。
      expect(/\bhold\b/i.test(en), `en.${key} contains the standalone word "hold": ${en}`).toBe(false);
    }
  });

  it('states that nothing was recorded on every post-submit cash error except the network one', () => {
    for (const key of CASH_SUBMIT_ERROR_KEYS) {
      expect(I18N.zh[key], `zh.${key} 必須明說未寫入`).toMatch(/未寫入|沒有寫入新紀錄/);
      expect(I18N.en[key].toLowerCase(), `en.${key} must say nothing was recorded`)
        .toMatch(/nothing was recorded|nothing new was recorded/);
    }
  });

  it('promises no duplicate only on the network error', () => {
    expect(I18N.zh.cashErrNetwork).toContain('不會重複記錄');
    expect(I18N.en.cashErrNetwork.toLowerCase()).toContain('will not create a duplicate');
    for (const key of PHASE41_KEYS.filter(candidate => candidate !== 'cashErrNetwork')) {
      expect(I18N.zh[key], `zh.${key}`).not.toContain('不會重複記錄');
      expect(I18N.en[key].toLowerCase(), `en.${key}`).not.toContain('will not create a duplicate');
    }
  });

  it('never calls the reused idempotency key a duplicate request', () => {
    expect(I18N.zh.cashErrKeyReused).not.toContain('重複的請求');
    expect(I18N.en.cashErrKeyReused.toLowerCase()).not.toContain('duplicate');
  });

  it('keeps the cash page key equal to its Page value and leaves the legacy currency key alone', () => {
    // CmdK 以 t(lang, page) 取頁名,所以 key 必須逐字等於 Page 值 'cash'。
    expect(I18N.zh.cash).toBe('現金');
    expect(I18N.en.cash).toBe('Cash');
    // 既有 `currency` 是「預設貨幣」,對話框的幣別欄位用 cashCurrency。
    expect(I18N.zh.cashCurrency).toBe('幣別');
    expect(I18N.zh.currency).not.toBe(I18N.zh.cashCurrency);
  });

  it('states the cash amount range exactly as the backend validates it', () => {
    // 後端 @DecimalMax(1e12) / @Digits(13, 8):文案靜態寫出範圍,不從錯誤訊息解析。
    expect(I18N.zh.cashErrAmount).toContain('1,000,000,000,000');
    expect(I18N.zh.cashErrAmount).toContain('8');
    expect(I18N.en.cashErrAmount).toContain('1,000,000,000,000');
    expect(I18N.en.cashErrAmount).toContain('8 decimals');
  });
});
