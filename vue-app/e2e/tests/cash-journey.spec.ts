import { test, expect, loginViaApi } from '../support/fixtures';
import type { Page } from '@playwright/test';

/**
 * 旅程 C:Phase 04.1 的基準幣 / 現金帳 / 交易幣別,真瀏覽器 → 真後端。
 *
 * jsdom + stub fetch 證明不了 cookie / CSRF / 冪等 header 在真瀏覽器對新端點(PATCH /me/preferences、
 * POST / GET /portfolio/cash-entries)的行為;本檔讓這條鏈在新端點上至少被自動化走過一次。
 * 每條測試自帶唯一帳號,不依賴執行順序;selector 一律 data-testid;不攔截任何請求(版面 stub 屬 layout.spec.ts)。
 * 金額文字的數字與代碼之間是 NBSP(moneyFormat.ts),文字斷言一律用 \s+ 正規式。
 */

interface CashBalance {
  currency: string;
  amount: number;
}

interface PortfolioSummary {
  cash: number;
  totalEquity: number;
  totalMarketValue: number;
  cashBalances: CashBalance[];
}

async function readSummary(page: Page): Promise<PortfolioSummary> {
  const res = await page.request.get('/api/v1/portfolio/summary');
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data as PortfolioSummary;
}

// 以下三個 helper 行為同 trade.spec.ts(該檔未匯出,本檔不 import、不改它)
async function openTicketFromTrades(page: Page) {
  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-add-trade').click();
  await expect(page.getByTestId('ticket-symbol-input')).toBeFocused();
}

async function pickSymbol(page: Page, query: string, symbol: string) {
  await page.getByTestId('ticket-symbol-input').pressSequentially(query);
  // 要等 debounce 後的查詢結果把目標標的排到第一列,ArrowDown 才會選中它
  await expect(page.getByRole('option').first()).toHaveAttribute('data-testid', `ticket-symbol-option-${symbol}`);
  await page.getByTestId('ticket-symbol-input').press('ArrowDown');
  await page.getByTestId('ticket-symbol-input').press('Enter');
  await expect(page.getByTestId('ticket-symbol-input')).toHaveValue(symbol);
}

async function submitTrade(page: Page) {
  await page.getByTestId('ticket-review-advance').click();
  await page.getByTestId('ticket-submit').click();
}

test('C1 基準幣切到 USD → 後端持久化 → Settings 與重新登入後一致 @smoke', async ({ page, browser, baseURL, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  // 新帳號預設基準幣為 TWD(V14)
  await expect(page.getByTestId('base-currency-option-TWD')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('base-currency-option-USD').click();
  await expect(page.getByTestId('base-currency-switching')).toHaveCount(0);
  await expect(page.getByTestId('base-currency-option-USD')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('overview-kpi').first()).toContainText('USD');

  // 偏好寫回後端(PATCH /api/v1/me/preferences 經真 cookie + CSRF),不是只改前端狀態
  const meRes = await page.request.get('/api/v1/me');
  expect(meRes.ok()).toBeTruthy();
  expect((await meRes.json()).data.baseCurrency).toBe('USD');

  await page.getByTestId('nav-settings').click();
  // Settings 預設開在 brokers 分頁;基準幣欄位在「顯示」分頁
  await page.getByTestId('settings-tab-display').click();
  await expect(page.getByTestId('settings-base-currency')).toHaveValue('USD');

  // 跨來源反向斷言:全新 browser context(沒有任何前端儲存)以同一帳號登入,仍為 USD
  const freshContext = await browser.newContext({ baseURL });
  try {
    const freshPage = await freshContext.newPage();
    await loginViaApi(freshPage, uniqueAccount);
    await freshPage.goto('/');
    await expect(freshPage.getByTestId('base-currency-option-USD')).toHaveAttribute('aria-pressed', 'true');
    await expect(freshPage.getByTestId('base-currency-option-TWD')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await freshContext.close();
  }
});

test('C2 入金 1000 USD → 可用現金與現金頁顯示 → 一鍵沖銷後歸零 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  // 入金:Overview 可用現金卡 → 對話框 form → result
  await page.getByTestId('overview-cash-deposit').click();
  await expect(page.getByTestId('cash-dialog')).toBeVisible();
  await expect(page.getByTestId('cash-type-deposit')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cash-currency-USD').click();
  await page.getByTestId('cash-amount').fill('1000');
  await page.getByTestId('cash-submit').click();

  const entryIdLocator = page.getByTestId('cash-result-entry-id');
  await expect(page.getByTestId('cash-result')).toBeVisible();
  // 紀錄編號是完整 UUID,前端不得截斷
  await expect(entryIdLocator).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const entryId = (await entryIdLocator.innerText()).trim();
  await page.getByTestId('cash-done').click();

  // 可用現金卡重讀到後端值
  await expect(page.getByTestId('overview-kpi-cash-balances')).toHaveText(/USD\s+1,000\.00/);

  // 現金頁:恰 1 筆,第一列為 +1,000.00 USD
  await page.getByTestId('overview-cash-view-entries').click();
  await expect(page.getByTestId('cash-entries-row')).toHaveCount(1);
  await expect(page.getByTestId('cash-entries-row').first()).toHaveText(/\+1,000\.00\s+USD/);

  // 一鍵沖銷:對話框為沖銷模式,顯示原紀錄
  await page.getByTestId(`cash-entries-reverse-${entryId}`).click();
  await expect(page.getByTestId('cash-reversal-original')).toBeVisible();
  await page.getByTestId('cash-submit').click();
  await expect(page.getByTestId('cash-result')).toBeVisible();
  await page.getByTestId('cash-done').click();

  // 沖銷後:列表 2 筆、原列標示已沖銷、沖銷列指回原列
  await expect(page.getByTestId('cash-entries-row')).toHaveCount(2);
  await expect(page.getByTestId('cash-entries-row').filter({ has: page.getByTestId('cash-entries-reversed-pill') })).toHaveCount(1);
  await expect(page.getByTestId('cash-entries-row').filter({ has: page.getByTestId('cash-entries-reversal-of') })).toHaveCount(1);
  // 反向斷言:已沖銷的原列與沖銷紀錄本身都不可再沖,整頁沒有任何沖銷按鈕
  await expect(page.locator('[data-testid^="cash-entries-reverse-"]')).toHaveCount(0);

  // 跨來源:後端紀錄 2 筆,USD 現金歸零(或不存在)
  const entriesRes = await page.request.get('/api/v1/portfolio/cash-entries?page=0&size=10');
  expect(entriesRes.ok()).toBeTruthy();
  expect((await entriesRes.json()).data.totalElements).toBe(2);
  const summary = await readSummary(page);
  const usd = summary.cashBalances.find((balance) => balance.currency === 'USD');
  expect(usd?.amount ?? 0).toBe(0);
});

test('C3 未入金買進 1 股 AAPL → 交易不被阻擋、各處標示 USD、Overview 提示現金為負 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  await openTicketFromTrades(page);
  await pickSymbol(page, 'AAP', 'AAPL');
  await page.getByTestId('ticket-qty').fill('1');
  await submitTrade(page);

  // 成交畫面的價格帶 USD 代碼、不帶 $ 符號(D-28 / D-30)
  const resultPrice = page.getByTestId('ticket-result-price');
  await expect(resultPrice).toBeVisible();
  await expect(resultPrice).toContainText('USD');
  await expect(resultPrice).not.toContainText('$');

  // Trades 列的幣別標籤
  await page.getByTestId('ticket-close').click();
  await expect(page.getByTestId('trades-ccy-tag').first()).toHaveText('USD');

  // Positions 的幣別標籤
  await page.getByTestId('nav-positions').click();
  const row = page.getByTestId('positions-row').filter({ hasText: 'AAPL' });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('positions-ccy-tag')).toHaveText('USD');

  // Overview:USD 現金為負提示、近期交易的幣別標籤
  await page.getByTestId('nav-overview').click();
  await expect(page.getByTestId('overview-kpi-cash-negative')).toBeVisible();
  await expect(page.getByTestId('overview-kpi-cash-negative')).toContainText('USD');
  await expect(page.getByTestId('overview-trade-ccy-tag').first()).toHaveText('USD');

  // 跨來源:交易未被現金不足阻擋(D-01),USD 現金為負,totalEquity 恆等式(D-22)
  const tradesRes = await page.request.get('/api/v1/trades?page=0&size=100');
  expect(tradesRes.ok()).toBeTruthy();
  expect((await tradesRes.json()).data.totalElements).toBe(1);

  const summary = await readSummary(page);
  const usd = summary.cashBalances.find((balance) => balance.currency === 'USD');
  expect(usd).toBeDefined();
  expect(usd?.amount ?? 0).toBeLessThan(0);
  expect(summary.totalEquity).toBeCloseTo(summary.totalMarketValue + summary.cash, 6);
});
