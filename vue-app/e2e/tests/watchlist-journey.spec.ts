import { test, expect, loginViaApi } from '../support/fixtures';
import { addWatchlistItem, listWatchlists } from '../support/journeyApi';
import type { Locator, Page } from '@playwright/test';

/**
 * 旅程 W:Phase 04.2 觀察清單(WATCH-03),真瀏覽器 → 真後端(CI Browser E2E)。
 *
 * jsdom + fetch double 證明不了 Markets ★ → 選擇器建立並加入 → Watchlist 頁 → 排序 → PUT items/order
 * 在真後端持久化、重新整理後仍保留(judgment §8)。每條測試自帶唯一帳號;selector 一律 data-testid
 * (清單名稱 / 代號是使用者資料而非 i18n 文案,才用 hasText 過濾);不攔截任何請求。
 */

const LIST_NAME = '科技股';

function star(page: Page, symbol: string): Locator {
  return page.locator(`[data-testid="markets-star"][data-symbol="${symbol}"]`);
}

function pickerOption(page: Page, name: string): Locator {
  return page.getByTestId('watchlist-picker-option').filter({ hasText: name });
}

async function rowOrder(page: Page): Promise<string[]> {
  return page.getByTestId('watchlist-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-symbol') ?? ''));
}

async function openListTab(page: Page, name: string): Promise<void> {
  await page.getByTestId('nav-watchlist').click();
  const tab = page.getByTestId('watchlist-tab').filter({ hasText: name });
  await expect(tab).toHaveCount(1);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('watchlist-toolbar-name')).toHaveText(name);
}

test('W1 Markets ★ 建立「科技股」並加入 → Watchlist 頁顯示 → 排序模式調整 → 重新整理後順序保留 → 刪除清單 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');
  await page.getByTestId('nav-markets').click();

  // AAPL ★ → 選擇器(預設清單由後端首次 GET 建立,D-17)→ + 新增清單「科技股」→ 建立並加入
  await expect(star(page, 'AAPL')).toHaveAttribute('aria-label', '把 AAPL 加入觀察清單');
  await star(page, 'AAPL').click();
  await expect(page.getByTestId('watchlist-picker')).toBeVisible();
  await expect(page.getByTestId('watchlist-picker-option')).toHaveCount(1);
  await page.getByTestId('watchlist-picker-new').click();
  await page.getByTestId('watchlist-picker-new-name').fill(LIST_NAME);
  await page.getByTestId('watchlist-picker-new-submit').click();
  // U-13:建立成功後同時把目前代號加入新清單並勾選
  await expect(pickerOption(page, LIST_NAME).getByTestId('watchlist-picker-checkbox')).toBeChecked();
  await page.getByTestId('watchlist-picker-close').click();
  await expect(page.getByTestId('watchlist-picker')).toHaveCount(0);
  await expect(star(page, 'AAPL')).toHaveAttribute('aria-label', 'AAPL 已在觀察清單中,管理清單');

  // NVDA ★ → 勾選「科技股」(立即寫入;以回應 DTO 更新,不做樂觀更新)
  await star(page, 'NVDA').click();
  const nvdaOption = pickerOption(page, LIST_NAME);
  await nvdaOption.getByTestId('watchlist-picker-checkbox').check();
  await expect(nvdaOption.getByTestId('watchlist-picker-option-saving')).toHaveCount(0);
  await expect(nvdaOption.getByTestId('watchlist-picker-checkbox')).toBeChecked();
  await page.getByTestId('watchlist-picker-close').click();

  // USD/TWD(FX,不可交易但可加入清單,D-18):Markets 外匯分頁沒有 testid,前置改走 API
  const tech = (await listWatchlists(page)).find((list) => list.name === LIST_NAME);
  expect(tech, '後端應已有「科技股」').toBeDefined();
  expect(tech!.items.map((item) => item.symbol)).toEqual(['AAPL', 'NVDA']);
  await addWatchlistItem(page, tech!.id, 'USD/TWD');

  // Watchlist 頁:tab「科技股」含三檔,依加入順序
  await openListTab(page, LIST_NAME);
  await expect(page.getByTestId('watchlist-row')).toHaveCount(3);
  expect(await rowOrder(page)).toEqual(['AAPL', 'NVDA', 'USD/TWD']);

  // 排序模式(鍵盤 / 觸控路徑):USD/TWD ↑ 兩次 → 第一
  await page.getByTestId('watchlist-reorder').click();
  await expect(page.getByTestId('watchlist-reorder')).toHaveAttribute('aria-pressed', 'true');
  const fxRow = page.locator('[data-testid="watchlist-row"][data-symbol="USD/TWD"]');
  await fxRow.getByTestId('watchlist-move-up').click();
  await expect.poll(() => rowOrder(page)).toEqual(['AAPL', 'USD/TWD', 'NVDA']);
  await fxRow.getByTestId('watchlist-move-up').click();
  await expect.poll(() => rowOrder(page)).toEqual(['USD/TWD', 'AAPL', 'NVDA']);

  // 500 ms debounce 後 PUT items/order:等後端真的存到新順序,且儲存中提示消失
  await expect
    .poll(async () => (await listWatchlists(page)).find((list) => list.id === tech!.id)?.items.map((item) => item.symbol))
    .toEqual(['USD/TWD', 'AAPL', 'NVDA']);
  await expect(page.getByTestId('watchlist-reorder-saving')).toHaveCount(0);
  await page.getByTestId('watchlist-reorder').click();
  await expect(page.getByTestId('watchlist-reorder')).toHaveAttribute('aria-pressed', 'false');

  // 重新整理(全新載入,前端沒有任何本地順序)→ 順序仍保留
  await page.reload();
  await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);
  await openListTab(page, LIST_NAME);
  await expect(page.getByTestId('watchlist-row')).toHaveCount(3);
  expect(await rowOrder(page)).toEqual(['USD/TWD', 'AAPL', 'NVDA']);

  // 刪除清單(行內確認,焦點在取消)→ tab 消失
  await page.getByTestId('watchlist-delete').click();
  await expect(page.getByTestId('watchlist-delete-confirm-cancel')).toBeFocused();
  await page.getByTestId('watchlist-delete-confirm-submit').click();
  await expect(page.getByTestId('watchlist-tab').filter({ hasText: LIST_NAME })).toHaveCount(0);
  expect((await listWatchlists(page)).map((list) => list.name)).not.toContain(LIST_NAME);
});
