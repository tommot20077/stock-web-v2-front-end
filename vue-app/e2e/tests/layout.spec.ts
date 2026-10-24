import { test, expect, type Page } from '@playwright/test';
import { LONG_NOTE, expectNoHorizontalScroll, mockPortfolioApi } from '../support/portfolioStubs';

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

/** 從已登入的首頁點 header 導覽進入指定頁(App 的 page 狀態未接 router,不能用 URL 直達)。 */
async function openPage(page: Page, nav: 'cash' | 'positions' | 'trades'): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('overview-kpi')).toHaveCount(4);
  await page.getByTestId(`nav-${nav}`).click();
}

/**
 * 表格的最近水平捲動祖先必須在 `hostTestId` 卡內(含卡本身),且不是 main / body / html,
 * 右緣不超出視窗:窄螢幕下寬表格只在卡內捲動,不帶動頁面。
 */
async function expectTableScrollsInsideCard(page: Page, hostTestId: string): Promise<void> {
  const r = await page.evaluate((host) => {
    const table = document.querySelector(`[data-testid="${host}"] table`);
    const hostEl = document.querySelector(`[data-testid="${host}"]`);
    if (!table || !hostEl) return { found: false, tag: '', insideHost: false, right: 0, clientWidth: 0 };
    let el: HTMLElement | null = table.parentElement;
    while (el) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') break;
      el = el.parentElement;
    }
    return {
      found: el !== null,
      tag: el?.tagName.toLowerCase() ?? '',
      insideHost: el !== null && hostEl.contains(el),
      right: el ? el.getBoundingClientRect().right : 0,
      clientWidth: document.documentElement.clientWidth,
    };
  }, hostTestId);
  expect(r.found, `${hostTestId} 的表格找不到水平捲動祖先`).toBe(true);
  expect(['main', 'body', 'html'], `${hostTestId} 的最近捲動祖先是 <${r.tag}>,應在卡內`).not.toContain(r.tag);
  expect(r.insideHost, `${hostTestId} 的最近捲動祖先不在卡內`).toBe(true);
  expect(r.right, `${hostTestId} 捲動容器右緣 ${r.right}px 超出視窗 ${r.clientWidth}px`).toBeLessThanOrEqual(r.clientWidth);
}

/**
 * L3:現金頁(頁首 + 入出金紀錄 12 筆,含 500 字備註)。
 * ≥ 640px 另驗 500 字備註兩行 clamp,且該列高度不超過其他列的 3 倍。
 */
for (const width of [320, 375, 768, 1280]) {
  test(`L3 ${width}px:現金頁入出金紀錄不造成整頁或 main 水平捲動 @smoke`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockPortfolioApi(page);
    await openPage(page, 'cash');

    await expect(page.getByTestId('cash-page-title')).toBeVisible();
    await expect(page.getByTestId('cash-entries-row')).toHaveCount(10);

    await expectNoHorizontalScroll(page);
    await expectTableScrollsInsideCard(page, 'cash-entries');

    if (width >= 640) {
      const note = await page.evaluate((full) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="cash-entries-row"]'));
        const heights = rows.map((row) => row.getBoundingClientRect().height);
        const idx = rows.findIndex((row) => row.querySelector(`[title="${full}"]`) !== null);
        const cell = idx >= 0 ? rows[idx].querySelector(`[title="${full}"]`) : null;
        const others = heights.filter((_, i) => i !== idx).sort((a, b) => a - b);
        return {
          idx,
          lineClamp: cell ? getComputedStyle(cell).getPropertyValue('-webkit-line-clamp') : '',
          title: cell?.getAttribute('title') ?? '',
          rowHeight: idx >= 0 ? heights[idx] : 0,
          median: others[Math.floor(others.length / 2)] ?? 0,
        };
      }, LONG_NOTE);
      expect(note.idx, '找不到 title 等於 500 字備註的格').toBeGreaterThanOrEqual(0);
      expect(note.title).toBe(LONG_NOTE);
      expect(note.lineClamp).toBe('2');
      expect(note.rowHeight, `長備註列高 ${note.rowHeight}px 超過其他列中位數 ${note.median}px 的 3 倍`)
        .toBeLessThanOrEqual(note.median * 3);
    }
  });
}

/**
 * L4:出金對話框(zh / en)。面板與兩顆按鈕完整在視窗內、整頁不水平捲動;
 * 送出鈕文字單行;en × 320 另驗進入送出中狀態時寬度不跳動(UI-SPEC U-25)。
 */
for (const width of [320, 375, 768, 1280]) {
  for (const lang of ['zh', 'en'] as const) {
    test(`L4 ${width}px ${lang}:出金對話框面板在視窗內、footer 送出鈕單行 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (lang === 'en') {
        await page.addInitScript(() => {
          localStorage.setItem('resource:tweaks:v1', JSON.stringify({ lang: 'en' }));
        });
      }
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await mockPortfolioApi(page, { cashPostGate: gate });
      await openPage(page, 'cash');

      await page.getByTestId('cash-page-withdraw').click();
      const dialog = page.getByTestId('cash-dialog');
      await expect(dialog).toBeVisible();

      const clientWidth = await expectNoHorizontalScroll(page);

      const panel = await dialog.boundingBox();
      expect(panel, '面板應有版面').not.toBeNull();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(clientWidth);
      for (const id of ['cash-cancel', 'cash-submit']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, `${id} 應有版面`).not.toBeNull();
        expect(box!.x, `${id} 左緣超出面板`).toBeGreaterThanOrEqual(panel!.x);
        expect(box!.x + box!.width, `${id} 右緣超出面板`).toBeLessThanOrEqual(panel!.x + panel!.width);
        expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
      }

      const lines = await page.getByTestId('cash-submit').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
      });
      expect(lines, '送出鈕文字應為單行').toBe(1);

      if (lang === 'en' && width === 320) {
        const before = (await page.getByTestId('cash-submit').boundingBox())!.width;
        await page.getByTestId('cash-amount').fill('1');
        await page.getByTestId('cash-submit').click();
        await expect(dialog).toHaveAttribute('aria-busy', 'true');
        const during = (await page.getByTestId('cash-submit').boundingBox())!.width;
        expect(Math.abs(during - before), `送出中寬度 ${during}px 與原寬 ${before}px 不同`).toBeLessThanOrEqual(1);
        release();
      }
    });
  }
}
