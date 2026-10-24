import { test, expect, loginViaApi } from '../support/fixtures';

/**
 * 旅程 C:Phase 04.1 的基準幣 / 現金帳 / 交易幣別,真瀏覽器 → 真後端。
 *
 * jsdom + stub fetch 證明不了 cookie / CSRF / 冪等 header 在真瀏覽器對新端點(PATCH /me/preferences、
 * POST / GET /portfolio/cash-entries)的行為;本檔讓這條鏈在新端點上至少被自動化走過一次。
 * 每條測試自帶唯一帳號,不依賴執行順序;selector 一律 data-testid;不使用 page.route(那是 layout.spec.ts 的 stub)。
 * 金額文字的數字與代碼之間是 NBSP(moneyFormat.ts),文字斷言一律用 \s+ 正規式。
 */

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
