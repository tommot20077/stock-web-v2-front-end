import { test, expect, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockPortfolioApi } from '../support/portfolioStubs';

/**
 * L:app shell header 的窄螢幕版面(todo 2026-09-04-frontend-header-rwd-320px)。
 *
 * 版面量測 jsdom 做不到,所以放在 Playwright;但它只驗 header,不需要真後端:
 * 以 page.route 攔下全部 /api/v1/*,/me 回一個 email 很長的已登入使用者(最容易撐版的情況),
 * 其他端點一律 503 —— 頁面內容會進錯誤態,這裡不關心。
 */
const LONG_EMAIL = 'layout-check-with-a-very-long-local-part@example-company.test';

async function mockAuthenticatedApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/csrf') {
      // 形狀與 apiClient 的 isCsrfTokenNames 對齊:只回名稱,token 本身走 cookie
      await route.fulfill({
        headers: { 'Set-Cookie': 'XSRF-TOKEN=layout-csrf; Path=/' },
        json: { success: true, data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }, error: null, meta: {} },
      });
      return;
    }
    if (path === '/api/v1/me') {
      await route.fulfill({
        json: {
          success: true,
          data: { id: 1, uuid: 'layout-uuid', email: LONG_EMAIL, username: 'layout', role: 'USER', status: 'ACTIVE' },
          error: null,
          meta: {},
        },
      });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { success: false, data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'layout test' }, meta: {} },
    });
  });
}

for (const width of [320, 375, 768, 1280]) {
  test(`L1 ${width}px:已登入 header 不造成整頁水平捲動,登出與通知鈴可點 @smoke`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAuthenticatedApi(page);
    await page.goto('/');

    const logout = page.getByTestId('header-logout');
    await expect(logout).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `頁面寬 ${scrollWidth}px 超出視窗 ${clientWidth}px`).toBeLessThanOrEqual(clientWidth);

    // 不是靠隱藏解決:登出與通知鈴都在視窗內且可點
    for (const target of [logout, page.getByTestId('header-bell')]) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box, '元素應有版面').not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
    }
    await page.getByTestId('header-bell').click();
    const pop = page.getByTestId('header-bell-pop');
    await expect(pop).toBeVisible();
    const popBox = await pop.boundingBox();
    expect(popBox!.x).toBeGreaterThanOrEqual(0);
    expect(popBox!.x + popBox!.width).toBeLessThanOrEqual(clientWidth);
  });
}

/**
 * L2:Phase 04.1 Overview(4 張 KPI + 基準幣工具列 + 資產配置 + 近期交易)。
 * fixture 取最寬情況(portfolioStubs),量測整頁與 main 都不水平捲動,且關鍵元素右緣在視窗內。
 */
for (const width of [320, 375, 768, 1280]) {
  test(`L2 ${width}px:Overview 四張 KPI、基準幣工具列、資產配置、近期交易不造成整頁或 main 水平捲動 @smoke`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockPortfolioApi(page);
    await page.goto('/');

    const kpis = page.getByTestId('overview-kpi');
    await expect(kpis).toHaveCount(4);
    await expect(page.getByTestId('overview-allocation')).toBeVisible();
    await expect(page.getByTestId('overview-trade-ccy-tag').first()).toBeVisible();

    const clientWidth = await expectNoHorizontalScroll(page);

    // 不是靠隱藏解決:工具列、四幣別鍵、四張 KPI、資產配置都完整落在視窗內
    const targets = [
      page.getByTestId('base-currency-switch'),
      ...['TWD', 'USD', 'EUR', 'JPY'].map((code) => page.getByTestId(`base-currency-option-${code}`)),
      ...(await kpis.all()),
      page.getByTestId('overview-allocation'),
    ];
    for (const target of targets) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box, '元素應有版面').not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
    }
  });
}
