import type { Locator, Page, Route } from '@playwright/test';
import { test, expect, loginViaApi } from '../support/fixtures';
import { addWatchlistItem, apiBuy, apiWrite, listWatchlists } from '../support/journeyApi';
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

type FailureKind = 'abort' | 'envelope5xx' | 'nonEnvelope502';

interface FailureCase {
  /** 對攔下的 route 製造失敗;`pageKey` 讓 5xx 信封的 traceId 帶頁名,定位方便。 */
  fail: (route: Route, pageKey: string) => Promise<void>;
  /** 畫面 error-code 列應顯示的 code。 */
  expectedCode: string;
  /** 畫面 trace-id 列應顯示的值;null = 該列不得渲染。 */
  expectedTraceId: (pageKey: string) => string | null;
}

/** 5xx 信封的 traceId:帶頁名,失敗時一眼看出是哪一組。 */
const envelopeTraceId = (pageKey: string): string => `e2e-sc5-${pageKey}`;

/** 502 HTML 的特徵字串:畫面任何地方都不得出現(T-05-04,非信封 body 不渲染)。 */
const BAD_GATEWAY_TEXT = 'Bad Gateway';

const FAILURES: Record<FailureKind, FailureCase> = {
  // (a) 網路中斷:fetch reject → transportFetch 正規化為 NETWORK_ERROR(D-26),沒有 Response 就沒有 traceId
  abort: {
    fail: (route) => route.abort('failed'),
    expectedCode: 'NETWORK_ERROR',
    expectedTraceId: () => null,
  },
  // (b) 5xx 後端失敗信封:code 與 traceId 取自信封。SERVICE_UNAVAILABLE 是測試自訂的注入值,
  // 不必存在於後端 ErrorCode —— 這裡證明的是「apiClient 原樣帶出信封的 code / meta.traceId」,與 code 的語意無關
  envelope5xx: {
    fail: (route, pageKey) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          data: null,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'e2e sc5', fields: {} },
          meta: { traceId: envelopeTraceId(pageKey) },
        }),
      }),
    expectedCode: 'SERVICE_UNAVAILABLE',
    expectedTraceId: envelopeTraceId,
  },
  // (c) 非信封回應(反向代理回 502 HTML):readJson 不解析非 JSON → HTTP_ERROR、無 traceId
  nonEnvelope502: {
    fail: (route) =>
      route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: `<html><body>${BAD_GATEWAY_TEXT}</body></html>`,
      }),
    expectedCode: 'HTTP_ERROR',
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

/**
 * 登入後落在 Overview:等 session 恢復(`/me` → header-session-identity)、summary(overview-kpi)與
 * Overview 自己的觀察清單(overview-watchlist-name)都載完,才能安裝 route —— 否則 Overview 掛載時的
 * `GET /watchlists`、session bootstrap 的 `GET /me` 會被誤攔,測到的是別的失敗(05-RESEARCH §Q9)。
 */
async function landOnOverview(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('header-session-identity')).toBeVisible();
  await expect(page.getByTestId('overview-kpi').first()).toBeVisible();
  await expect(page.getByTestId('overview-watchlist-name')).toBeVisible();
}

/** 安裝 route 後再點 nav 進目標頁(目標頁掛載時才發出被攔的讀取)。 */
const viaNav = (navTestId: string) => async (page: Page): Promise<void> => {
  await page.getByTestId(navTestId).click();
};

const noop = async (): Promise<void> => {};

/** 兩位小數價格字串的千分位變體(`1142.83` → `1,142.83`);畫面以 fmtNum 顯示時會帶千分位。 */
function withGrouping(value: string): string[] {
  const [int = '', frac] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const groupedValue = frac === undefined ? grouped : `${grouped}.${frac}`;
  return groupedValue === value ? [value] : [value, groupedValue];
}

const PRICE_SENTINELS = MOCK_SENTINELS.prices.flatMap(withGrouping);

/** 決定性種子:AAPL 3 股 @ 123.45(mock 持倉沒有這個數量 / 價格組合)。 */
const BUY_SEED = { symbol: 'AAPL', quantity: 3, price: 123.45 } as const;

/** 入金種子的備註:只有真後端回來的分錄會帶它。 */
const CASH_SEED_NOTE = 'sc5-seed';

/** 基準幣種子:刻意不用 TWD —— TWD 是新帳號預設值(V14)也是 Settings 下拉的初始值,斷言 TWD 分辨不出真值。 */
const BASE_CURRENCY_SEED = 'EUR';

const seedBuy = (page: Page): Promise<void> => apiBuy(page, BUY_SEED.symbol, BUY_SEED.quantity, BUY_SEED.price);

const getPath = (pathname: string) => (url: URL, method: string): boolean =>
  method === 'GET' && url.pathname === pathname;

const PAGES: PageCase[] = [
  {
    key: 'overview',
    match: getPath('/api/v1/portfolio/summary'),
    testIds: {
      error: 'overview-summary-error',
      errorCode: 'overview-summary-error-code',
      traceId: 'overview-summary-trace-id',
      retry: 'overview-summary-retry',
    },
    seed: seedBuy,
    // 登入後直接落在 Overview:route 必須在 page.goto('/') 之前裝好
    beforeRoute: noop,
    enter: async (page) => {
      await page.goto('/');
      await expect(page.getByTestId('header-session-identity')).toBeVisible();
    },
    // 錯誤態只有錯誤卡片,放行後是 KPI 卡片;兩者合起來就是 summary 區塊
    sentinelScope: (page) => page.getByTestId('overview-summary-error').or(page.getByTestId('overview-kpi')),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS],
    assertReal: async (page) => {
      await expect(page.getByTestId('overview-kpi').first()).toBeVisible();
      await expect(page.getByTestId('overview-summary-error')).toHaveCount(0);
    },
  },
  {
    key: 'positions',
    match: getPath('/api/v1/portfolio/holdings'),
    testIds: {
      error: 'positions-holdings-error',
      errorCode: 'positions-holdings-error-code',
      traceId: 'positions-holdings-trace-id',
      retry: 'positions-holdings-retry',
    },
    seed: seedBuy,
    beforeRoute: landOnOverview,
    enter: viaNav('nav-positions'),
    // 錯誤區塊與持倉列都在 positions-table 這張卡片內
    sentinelScope: (page) => page.getByTestId('positions-table'),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS],
    assertReal: async (page) => {
      const row = page.getByTestId('positions-row').filter({ hasText: BUY_SEED.symbol });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(String(BUY_SEED.quantity));
    },
  },
  {
    key: 'trades',
    // 帶 query string(分頁 / 篩選),只比 pathname
    match: getPath('/api/v1/portfolio/activities'),
    testIds: {
      error: 'trades-error',
      errorCode: 'trades-error-code',
      traceId: 'trades-error-trace-id',
      retry: 'trades-retry',
    },
    seed: seedBuy,
    beforeRoute: landOnOverview,
    enter: viaNav('nav-trades'),
    sentinelScope: (page) => page.getByTestId('trades-table'),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS, ...MOCK_SENTINELS.notes],
    assertReal: async (page) => {
      await expect(page.getByTestId('trades-row').filter({ hasText: BUY_SEED.symbol }).first()).toBeVisible();
    },
  },
  {
    key: 'cash',
    // 同路徑還有 POST(入金),只攔 GET
    match: getPath('/api/v1/portfolio/cash-entries'),
    testIds: {
      error: 'cash-entries-error',
      errorCode: 'cash-entries-error-code',
      traceId: 'cash-entries-trace-id',
      retry: 'cash-entries-retry',
    },
    // CreateCashEntryRequest:type / currency / amount 必填,occurredAt 省略 = 伺服器現在;Idempotency-Key 必填
    seed: async (page) => {
      await apiWrite(
        page,
        'POST',
        '/api/v1/portfolio/cash-entries',
        { type: 'DEPOSIT', currency: 'USD', amount: 1234.5, note: CASH_SEED_NOTE },
        { idempotent: true },
      );
    },
    beforeRoute: landOnOverview,
    enter: viaNav('nav-cash'),
    sentinelScope: (page) => page.getByTestId('cash-entries'),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS, ...MOCK_SENTINELS.notes],
    assertReal: async (page) => {
      await expect(page.getByTestId('cash-entries-row').filter({ hasText: CASH_SEED_NOTE })).toHaveCount(1);
    },
  },
  {
    key: 'watchlist',
    match: getPath('/api/v1/watchlists'),
    testIds: {
      error: 'watchlist-error',
      errorCode: 'watchlist-error-code',
      traceId: 'watchlist-trace-id',
      retry: 'watchlist-retry',
    },
    // 首次 GET 由後端建立預設清單(D-17),把 AAPL 加進第一個清單
    seed: async (page) => {
      const [first] = await listWatchlists(page);
      expect(first, '後端應自動建立預設觀察清單').toBeTruthy();
      await addWatchlistItem(page, first!.id, BUY_SEED.symbol);
    },
    // Overview 掛載時也會 GET /watchlists:landOnOverview 等它載完才裝 route
    beforeRoute: landOnOverview,
    enter: viaNav('nav-watchlist'),
    sentinelScope: (page) => page.getByTestId('watchlist-page'),
    sentinels: [...MOCK_SENTINELS.watchlistNames, ...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS],
    assertReal: async (page) => {
      await expect(page.getByTestId('watchlist-row').filter({ hasText: BUY_SEED.symbol })).toHaveCount(1);
    },
  },
  {
    key: 'settings',
    // 只攔 GET /me(偏好讀取);PATCH /me/preferences 是不同路徑
    match: getPath('/api/v1/me'),
    testIds: {
      error: 'settings-base-currency-error',
      errorCode: 'settings-base-currency-error-code',
      traceId: 'settings-base-currency-trace-id',
      retry: 'settings-base-currency-retry',
    },
    seed: async (page) => {
      await apiWrite(page, 'PATCH', '/api/v1/me/preferences', { baseCurrency: BASE_CURRENCY_SEED });
    },
    // GET /me 也是 session bootstrap:landOnOverview 等 header-session-identity 可見之後才裝 route,
    // 否則測到的是「未登入」而不是「Settings 載入失敗」
    beforeRoute: landOnOverview,
    enter: async (page) => {
      await page.getByTestId('nav-settings').click();
      // Settings 預設開在 brokers 分頁;基準幣欄位在「顯示」分頁(掛載時就已發出 GET /me)
      await page.getByTestId('settings-tab-display').click();
    },
    // 基準幣欄位(select + 狀態 + 錯誤區塊)的容器
    sentinelScope: (page) => page.getByTestId('settings-base-currency').locator('xpath=..'),
    sentinels: [...MOCK_SENTINELS.symbols, ...PRICE_SENTINELS, ...MOCK_SENTINELS.watchlistNames],
    assertReal: async (page) => {
      await expect(page.getByTestId('settings-base-currency')).toHaveValue(BASE_CURRENCY_SEED);
    },
  },
];

/** 回傳 scope(可能匹配多個元素)文字中出現的哨兵;空陣列 = 沒有 mock 回填。 */
async function presentSentinels(scope: Locator, sentinels: readonly string[]): Promise<string[]> {
  const text = (await scope.allTextContents()).join('\n');
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
      // T-05-04:非信封回應的原始 body 不得被渲染到畫面或錯誤訊息
      await expect(page.getByText(BAD_GATEWAY_TEXT)).toHaveCount(0);
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
