import type { Locator, Page, Route } from '@playwright/test';
import { test, expect, loginViaApi } from '../support/fixtures';
import { apiBuy } from '../support/journeyApi';
import { MOCK_SENTINELS } from '../support/mockSentinels';

/**
 * SC5:API mode 的失敗狀態不被 mock 掩蓋(Phase 05,D-16 ~ D-20、D-26)。真瀏覽器 → 真後端。
 *
 * - D-16:對目標讀取端點先以 `page.route` 注入失敗,斷言錯誤 / 重試 UI;接著把旗標切成放行
 *   (`route.continue()` 直通真後端),按重試後必須顯示後端種下的真值。不採用「真的停掉後端」。
 * - D-17:每個接真 API 的頁面選一個主要讀取端點(PAGES 表)。
 * - D-18:三種失敗(FAILURES 表):(a) 網路中斷 `route.abort()` → fetch reject,apiClient 的
 *   transportFetch 正規化為 `NETWORK_ERROR`(D-26);(b) 5xx 後端失敗信封(帶 `meta.traceId`);
 *   (c) 非信封回應(代理回 502 HTML)→ `HTTP_ERROR`,原始 body 不得渲染。D-18(c) 的「空白 body」
 *   變體由 `src/services/apiClient.test.ts` 的單元測試覆蓋(F2)。
 * - D-19:PAGES × FAILURES 以雙層 for 產生各自獨立命名的 test,方便定位是哪一組紅。
 * - D-20:錯誤區塊、error-code 列、重試鈕可見;目標區塊內不得出現 mock 哨兵值(只對區塊斷言,
 *   不對 body —— 見 `e2e/support/mockSentinels.ts` 檔頭);放行重試後顯示後端真值。
 *
 * 平行隔離(playwright.config:fullyParallel、workers: 4):`page.route` 只掛在各自的 page,
 * 種子資料寫進各自的 uniqueAccount;登入走 `loginViaApi`(登入不是本 spec 證明的對象),
 * 種子在 `page.goto('/')` 之前以 `page.request` 寫入真後端。
 */

type FailureKind = 'abort';

interface FailureCase {
  /** 對攔下的 route 製造失敗;`pageKey` 讓 5xx 信封的 traceId 帶頁名,定位方便。 */
  fail: (route: Route, pageKey: string) => Promise<void>;
  /** 畫面 error-code 列應顯示的 code。 */
  expectedCode: string;
  /** 畫面 trace-id 列應顯示的值;null = 該列不得渲染。 */
  expectedTraceId: (pageKey: string) => string | null;
}

const FAILURES: Record<FailureKind, FailureCase> = {
  abort: {
    fail: (route) => route.abort('failed'),
    expectedCode: 'NETWORK_ERROR',
    expectedTraceId: () => null,
  },
};

interface ErrorTestIds {
  error: string;
  errorCode: string;
  traceId: string;
  retry: string;
}

interface PageCase {
  key: string;
  /** 只攔這一頁的主要讀取端點(pathname 精確比對,不吃 query string)。 */
  match: (url: URL, method: string) => boolean;
  testIds: ErrorTestIds;
  /** 登入後、`page.goto('/')` 前以 `page.request` 寫入真後端的決定性資料。 */
  seed: (page: Page) => Promise<void>;
  /** 安裝 route 之前的準備(例如先讓 Overview 載完,避免把共用端點的首載也攔掉)。 */
  beforeRoute: (page: Page) => Promise<void>;
  /** 安裝 route 之後進入目標頁,觸發被攔的讀取。 */
  enter: (page: Page) => Promise<void>;
  /** 哨兵斷言的範圍:目標區塊的 locator(絕不是 body / main)。 */
  sentinelScope: (page: Page) => Locator;
  /** 這一頁要檢查的哨兵子集。 */
  sentinels: readonly string[];
  /** 放行重試後,斷言畫面顯示的是後端種下的真值。 */
  assertReal: (page: Page) => Promise<void>;
}

/** 登入後落在 Overview:等 session 恢復(/me)與 Overview 主要區塊載完。 */
async function landOnOverview(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('header-session-identity')).toBeVisible();
  await expect(page.getByTestId('overview-kpi').first()).toBeVisible();
}

/** 兩位小數價格字串的千分位變體(`1142.83` → `1,142.83`);畫面以 fmtNum 顯示時會帶千分位。 */
function withGrouping(value: string): string[] {
  const [int = '', frac] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const groupedValue = frac === undefined ? grouped : `${grouped}.${frac}`;
  return groupedValue === value ? [value] : [value, groupedValue];
}

const PRICE_SENTINELS = MOCK_SENTINELS.prices.flatMap(withGrouping);

const POSITIONS_SEED = { symbol: 'AAPL', quantity: 3, price: 123.45 } as const;

const PAGES: PageCase[] = [
  {
    key: 'positions',
    match: (url, method) => method === 'GET' && url.pathname === '/api/v1/portfolio/holdings',
    testIds: {
      error: 'positions-holdings-error',
      errorCode: 'positions-holdings-error-code',
      traceId: 'positions-holdings-trace-id',
      retry: 'positions-holdings-retry',
    },
    seed: (page) => apiBuy(page, POSITIONS_SEED.symbol, POSITIONS_SEED.quantity, POSITIONS_SEED.price),
    beforeRoute: landOnOverview,
    enter: (page) => page.getByTestId('nav-positions').click(),
    // 錯誤區塊與持倉列都在 positions-table 這張卡片內
    sentinelScope: (page) => page.getByTestId('positions-table'),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS],
    assertReal: async (page) => {
      const row = page.getByTestId('positions-row').filter({ hasText: POSITIONS_SEED.symbol });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(String(POSITIONS_SEED.quantity));
    },
  },
];

/** 回傳 scope 文字中出現的哨兵(空陣列 = 沒有 mock 回填)。 */
async function presentSentinels(scope: Locator, sentinels: readonly string[]): Promise<string[]> {
  const text = (await scope.textContent()) ?? '';
  return sentinels.filter((value) => text.includes(value));
}

for (const target of PAGES) {
  for (const [kind, failure] of Object.entries(FAILURES) as [FailureKind, FailureCase][]) {
    test(`S5 ${target.key} × ${kind}:錯誤 / 重試可見、無 mock 哨兵、放行後顯示後端真值 @extended`, async ({ page, uniqueAccount }) => {
      await loginViaApi(page, uniqueAccount);
      await target.seed(page);
      await target.beforeRoute(page);

      // 旗標決定攔或放:失敗階段只攔目標端點,其餘一律直通真後端;放行階段全部直通。
      let failing = true;
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        if (failing && target.match(new URL(request.url()), request.method())) {
          return failure.fail(route, target.key);
        }
        return route.continue();
      });

      await target.enter(page);

      // D-20:錯誤區塊 / error-code / 重試鈕可見,trace-id 依失敗種類顯示或不渲染
      await expect(page.getByTestId(target.testIds.error)).toBeVisible();
      await expect(page.getByTestId(target.testIds.errorCode)).toHaveText(failure.expectedCode);
      const expectedTraceId = failure.expectedTraceId(target.key);
      if (expectedTraceId === null) {
        await expect(page.getByTestId(target.testIds.traceId)).toHaveCount(0);
      } else {
        await expect(page.getByTestId(target.testIds.traceId)).toContainText(expectedTraceId);
      }
      await expect(page.getByTestId(target.testIds.retry)).toBeVisible();
      expect(await presentSentinels(target.sentinelScope(page), target.sentinels), '錯誤態目標區塊不得出現 mock 哨兵').toEqual([]);

      // D-16:放行到真後端,按重試後顯示後端真值
      failing = false;
      await page.getByTestId(target.testIds.retry).click();
      await expect(page.getByTestId(target.testIds.error)).toHaveCount(0);
      await target.assertReal(page);
      expect(await presentSentinels(target.sentinelScope(page), target.sentinels), '放行後目標區塊不得出現 mock 哨兵').toEqual([]);
    });
  }
}
