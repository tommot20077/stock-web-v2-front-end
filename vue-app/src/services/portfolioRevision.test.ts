import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiLastFill,
  bumpPortfolioRevision,
  clearLastCreatedTrade,
  lastCreatedTradeId,
  notifyTradeCreated,
  portfolioRevision,
  resetPortfolioRevisionForTests,
} from './portfolioRevision';
// 原始碼字面(Vite ?raw):用來斷言測試 reset 沒有被偷偷掛進全域 setup。
import testSetupSource from '../testSetup?raw';
import type { TradeDto } from './apiTypes';

/**
 * 本檔鎖住 D-10 / D-11 / D-13 的共用訊號契約。
 *
 * **測試隔離硬規則**:`resetPortfolioRevisionForTests()` 在**本檔自己的** `afterEach`
 * 呼叫,**絕對不得**加進 `testSetup.ts` —— 該檔 `:10-12` 明文說明,在 setup 檔 import
 * 任何 service module 會搶在各測試檔的 `vi.mock` 生效前綁定真實實作。
 *
 * 另外 `vite.config.ts:26-27` 是 `pool: 'threads'` + `fileParallelism: false`,
 * 同一測試檔內的多個測試**共用**模組級狀態 —— 所以「跨測試污染」那對測試才有意義。
 */

/**
 * 逐欄對應 `apiTypes.ts:76-88` 的 `TradeDto`。
 * `quantity`(10)與 `price`(218.4)刻意取不同量級,任何一處把兩者接反,
 * `{ qty, px }` 的斷言就會紅。
 */
const TRADE_DTO: TradeDto = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  symbol: 'AAPL',
  type: 'BUY',
  quantity: 10,
  price: 218.4,
  fee: 1.5,
  note: '手動補登',
  executedAt: '2026-07-29T02:30:00Z',
  createdAt: '2026-07-30T01:00:00Z',
};

afterEach(() => {
  resetPortfolioRevisionForTests();
  vi.restoreAllMocks();
});

describe('portfolioRevision — D-10 revision counter', () => {
  it('starts at 0 and increments once per bump', () => {
    expect(portfolioRevision.value).toBe(0);

    bumpPortfolioRevision();
    expect(portfolioRevision.value).toBe(1);

    bumpPortfolioRevision();
    expect(portfolioRevision.value).toBe(2);
  });
});

describe('portfolioRevision — notifyTradeCreated 是單一原子動作', () => {
  it('produces all three signals in one call (revision / lastFill / tradeId)', () => {
    // 一次成交同時產生「要重讀」「哪一列是新的」「新交易的 id」三個訊號。
    // 三者在同一次呼叫內完成,所以不存在「先 bump 還是先 set lastFill」的順序協調問題。
    notifyTradeCreated(TRADE_DTO);

    expect(portfolioRevision.value).toBe(1);
    // 欄位名刻意是 sym / type / qty / px(與 portfolioApi.ts:36 的 mock lastFill 逐字一致),
    // **不是** symbol / quantity / price —— 兩頁的 fresh 綁定表達式因此完全不用改。
    expect(apiLastFill.value).toEqual({ sym: 'AAPL', type: 'BUY', qty: 10, px: 218.4 });
    expect(lastCreatedTradeId.value).toBe(TRADE_DTO.id);
  });

  it('overwrites the previous signals on a second trade', () => {
    notifyTradeCreated(TRADE_DTO);
    notifyTradeCreated({
      ...TRADE_DTO,
      id: 'second',
      symbol: 'NVDA',
      type: 'SELL',
      quantity: 4,
      price: 1142.83,
    });

    expect(portfolioRevision.value).toBe(2);
    expect(apiLastFill.value).toEqual({ sym: 'NVDA', type: 'SELL', qty: 4, px: 1142.83 });
    expect(lastCreatedTradeId.value).toBe('second');
  });
});

describe('portfolioRevision — 唯讀性', () => {
  it('rejects direct assignment at both the type level and runtime', () => {
    // Vue 的 readonly proxy 在 dev build 會對失敗的 set 發出 console.warn;
    // 這裡吞掉它以維持測試輸出乾淨(judgment §11 pristine output),值本身仍要斷言沒被改。
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 三個訊號是 readonly ref:外部只能經 notifyTradeCreated / bumpPortfolioRevision /
    // clearLastCreatedTrade 改變。`npm run build`(vue-tsc --noEmit)會驗下面三個預期錯誤
    // 指示詞 —— 若哪天有人把 readonly() 拿掉,指令會因「未使用的指示詞」(TS2578)而紅。
    // (注意:說明文字不可以該指示詞開頭,否則 TypeScript 會把說明本身當成一個指示詞。)
    // @ts-expect-error 唯讀 ref 不得直接賦值
    portfolioRevision.value = 99;
    // @ts-expect-error 唯讀 ref 不得直接賦值
    apiLastFill.value = { sym: 'X', type: 'BUY', qty: 1, px: 1 };
    // @ts-expect-error 唯讀 ref 不得直接賦值
    lastCreatedTradeId.value = 'forged';

    expect(portfolioRevision.value).toBe(0);
    expect(apiLastFill.value).toBeNull();
    expect(lastCreatedTradeId.value).toBeNull();
  });
});

describe('portfolioRevision — D-11 提示清除', () => {
  it('clearLastCreatedTrade only clears the trade id, leaving revision and lastFill intact', () => {
    // 提示訊息(「已記錄,但不在目前的篩選條件內」)的壽命與 fresh 高亮的壽命不同:
    // 使用者變更篩選/排序/頁碼或再次開啟 ticket 時清提示,但不該連帶重置重讀訊號。
    notifyTradeCreated(TRADE_DTO);

    clearLastCreatedTrade();

    expect(lastCreatedTradeId.value).toBeNull();
    expect(portfolioRevision.value).toBe(1);
    expect(apiLastFill.value).toEqual({ sym: 'AAPL', type: 'BUY', qty: 10, px: 218.4 });
  });
});

describe('portfolioRevision — 測試隔離', () => {
  it('resetPortfolioRevisionForTests restores 0 / null / null', () => {
    notifyTradeCreated(TRADE_DTO);

    resetPortfolioRevisionForTests();

    expect(portfolioRevision.value).toBe(0);
    expect(apiLastFill.value).toBeNull();
    expect(lastCreatedTradeId.value).toBeNull();
  });

  it('first test in the pair bumps the shared module state', () => {
    bumpPortfolioRevision();
    expect(portfolioRevision.value).toBe(1);
  });

  it('second test in the pair still starts from 0 (Pitfall 13 跨測試污染)', () => {
    // 模組級 singleton 在同一檔案內是共用的(fileParallelism: false)。
    // 若 afterEach 沒有 reset,這條會看到 1 而不是 0 —— 這正是這對測試存在的理由。
    expect(portfolioRevision.value).toBe(0);

    bumpPortfolioRevision();
    expect(portfolioRevision.value).toBe(1);
  });

  it('keeps the reset out of testSetup.ts (該檔刻意不 import 任何 service module)', () => {
    expect(testSetupSource).not.toContain('portfolioRevision');
    expect(testSetupSource).not.toContain('resetPortfolioRevisionForTests');
  });
});

describe('portfolioRevision — 不是 Pinia store', () => {
  it('is a plain module-level singleton usable without an active pinia', () => {
    // src/stores/ 底下全是 mock* 前綴的 mock 專用 store;把跨 mode 的協調狀態放進去
    // 會模糊 judgment §3 的界線(「mock store 是 mock mode 專屬」)。模組級 singleton
    // 是 pageApiClients.ts:19,37-39 與 apiClient.ts:62-67 已在用的慣例。
    // 本測試刻意**不**呼叫 setActivePinia —— 若哪天改用 defineStore,這條會炸。
    expect(() => {
      notifyTradeCreated(TRADE_DTO);
      bumpPortfolioRevision();
    }).not.toThrow();

    expect(portfolioRevision.value).toBe(2);
  });
});
