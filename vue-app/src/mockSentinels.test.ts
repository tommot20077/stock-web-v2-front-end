import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { MOCK_SENTINELS } from '../e2e/support/mockSentinels';
import { CRYPTO, POSITIONS, SYMBOLS, TRADES } from './data';
import overviewSource from './pages/Overview.vue?raw';
import { createMockCashApi, resetMockCashLedgerForTests } from './services/cashApi';
import { useMockPortfolioStore } from './stores/mockPortfolio';

/**
 * mock 哨兵守門(SC5 / D-20、T-05-03):`e2e/support/mockSentinels.ts` 的每個值都必須仍出現在 mock 資料輸出。
 *
 * 為什麼需要:SC5 的 E2E 以「目標區塊不含哨兵」證明 API mode 失敗時沒有 mock 回填。若有人改了 mock 資料
 * (例如把 NVDA 換掉),哨兵就再也不可能出現,`not.toContainText` 會永遠綠 —— 守門空轉。本測試在那之前就紅。
 * 修正方向:改 `mockSentinels.ts` 的值(哨兵取自 mock),不得反過來改 mock 來遷就哨兵。
 */

/** 回傳 haystack 中找不到的值(空陣列 = 全部找得到)。 */
function missingSentinels(values: readonly string[], haystack: string): string[] {
  return values.filter((value) => !haystack.includes(value));
}

/** 遞迴收集物件中的所有 number(價格在 JSON 裡會丟掉尾端 0,例如 67842.40 → 67842.4)。 */
function collectNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectNumbers);
  return [];
}

/**
 * 切出 `source` 中從 `startMarker` 起、到其後第一個 `endMarker` 為止的區段(含 endMarker)。
 * 切不到時直接丟錯:空字串會讓「不出現在區段」的斷言誤綠、讓「出現在區段」的訊息難以定位。
 */
function sliceSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`切不到區段起點「${startMarker}」:Overview.vue 結構已變,請同步更新本測試`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切不到區段終點「${endMarker}」(起點「${startMarker}」之後)`);
  return source.slice(start, end + endMarker.length);
}

/** Overview.vue 的 mock KPI 區段(`const mockKpis` 到其後第一個 `]);`)。 */
function overviewMockKpisSection(): string {
  return sliceSection(overviewSource, 'const mockKpis', ']);');
}

/** Overview.vue 的 API KPI 區段(`const apiKpis` 到 `const kpiCards`)。 */
function overviewApiKpisSection(): string {
  return sliceSection(overviewSource, 'const apiKpis', 'const kpiCards');
}

function mockHaystack(): string {
  setActivePinia(createPinia());
  const store = useMockPortfolioStore();
  const sources = { SYMBOLS, CRYPTO, POSITIONS, TRADES, storeState: store.$state };
  // 價格同時以 String(n) 與 n.toFixed(2) 兩種形式納入,哨兵記錄的是兩位小數字串
  const numberForms = collectNumbers(sources).flatMap((n) => [String(n), n.toFixed(2)]);
  return [JSON.stringify(sources), ...numberForms].join('\n');
}

describe('mock 哨兵守門(SC5 / D-20)', () => {
  it('哨兵陣列非空(六類都有值)', () => {
    expect(MOCK_SENTINELS.symbols.length).toBeGreaterThan(0);
    expect(MOCK_SENTINELS.prices.length).toBeGreaterThan(0);
    expect(MOCK_SENTINELS.notes.length).toBeGreaterThan(0);
    expect(MOCK_SENTINELS.watchlistNames.length).toBeGreaterThan(0);
    expect(MOCK_SENTINELS.kpis.length).toBeGreaterThan(0);
    expect(MOCK_SENTINELS.cashNotes.length).toBeGreaterThan(0);
  });

  it('每個 symbol / price / note / watchlistName 都仍存在於 mock 資料輸出', () => {
    const haystack = mockHaystack();
    expect(missingSentinels(MOCK_SENTINELS.symbols, haystack), 'symbols').toEqual([]);
    expect(missingSentinels(MOCK_SENTINELS.prices, haystack), 'prices').toEqual([]);
    expect(missingSentinels(MOCK_SENTINELS.notes, haystack), 'notes').toEqual([]);
    expect(missingSentinels(MOCK_SENTINELS.watchlistNames, haystack), 'watchlistNames').toEqual([]);
  });

  it('觀察清單名稱來自 mock store 初始狀態(不是只靠 data.ts 匯出碰巧命中)', () => {
    setActivePinia(createPinia());
    const names = useMockPortfolioStore().watchlists.map((list) => list.name);
    expect(missingSentinels(MOCK_SENTINELS.watchlistNames, JSON.stringify(names))).toEqual([]);
  });

  it('每個 kpi 哨兵都仍在 Overview.vue 的 mockKpis 區段,且不在 apiKpis 區段', () => {
    const mockSection = overviewMockKpisSection();
    const apiSection = overviewApiKpisSection();
    expect(missingSentinels(MOCK_SENTINELS.kpis, mockSection), 'kpis 不在 mockKpis').toEqual([]);
    // 出現在 apiKpis 代表那是 API mode 也會渲染的字面值,當哨兵會誤判(SC5 斷言永遠紅)
    const leakedIntoApi = MOCK_SENTINELS.kpis.filter((value) => apiSection.includes(value));
    expect(leakedIntoApi, 'kpis 出現在 apiKpis').toEqual([]);
  });

  it('每個 cashNote 哨兵都仍出現在 mock 現金帳本的種子分錄', async () => {
    resetMockCashLedgerForTests();
    const page = await createMockCashApi().listEntries();
    const notes = page.items.map((entry) => entry.note ?? '').join('\n');
    expect(page.items.length).toBeGreaterThan(0);
    expect(missingSentinels(MOCK_SENTINELS.cashNotes, notes), 'cashNotes').toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    expect(missingSentinels(['__never__'], mockHaystack())).toEqual(['__never__']);
    expect(missingSentinels(['NVDA', '__never__'], 'NVDA')).toEqual(['__never__']);
    expect(missingSentinels([], 'anything')).toEqual([]);
    expect(() => sliceSection('abc', '__missing__', ']);')).toThrow(/切不到區段起點/);
    expect(() => sliceSection('const x = [', 'const x', ']);')).toThrow(/切不到區段終點/);
  });
});
