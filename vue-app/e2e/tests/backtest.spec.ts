import { test, expect, loginViaApi } from '../support/fixtures';
import type { Page } from '@playwright/test';

/**
 * 旅程 D:回測(設計文件 §5 v2 矩陣)
 * 註:後端 createRun 為同步完成(建立即 succeeded),等待一律 auto-wait/expect.poll。
 */

async function gotoBacktest(page: Page) {
  await page.goto('/');
  await page.getByTestId('nav-backtest').click();
  await expect(page.getByTestId('backtest-run')).toBeVisible();
}

test('D1 建立回測 → 完成 → 結果區塊顯示(驗結構) @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await gotoBacktest(page);

  await page.getByTestId('backtest-symbol').selectOption('NVDA');
  await page.getByTestId('backtest-period').selectOption('1Y');
  await page.getByTestId('backtest-initial').fill('50000');
  await page.getByTestId('backtest-run').click();

  // 至完成:輪詢 run 狀態直到 succeeded(不斷言行情數值,只驗結構)
  await expect.poll(
    async () => (await page.getByTestId('backtest-run-status').textContent())?.trim(),
    { timeout: 30_000 },
  ).toBe('succeeded');
  await expect(page.getByTestId('backtest-run-note')).toContainText('NVDA');
  await expect(page.getByTestId('backtest-result')).toBeVisible();
});

test('D2 完成後 reload → 歷史紀錄仍在 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await gotoBacktest(page);

  await page.getByTestId('backtest-symbol').selectOption('NVDA');
  await page.getByTestId('backtest-run').click();
  await expect(page.getByTestId('backtest-run-status')).toHaveText('succeeded');

  await page.reload();
  await page.getByTestId('nav-backtest').click();

  const rows = page.getByTestId('backtest-history-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText('NVDA');
});

test('D4 initialCapital 0 或負值 → 欄位驗證錯誤顯示 @extended', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await gotoBacktest(page);

  await page.getByTestId('backtest-initial').fill('0');
  await page.getByTestId('backtest-run').click();
  await expect(page.getByTestId('backtest-run-error')).toBeVisible();

  await page.getByTestId('backtest-initial').fill('-500');
  await page.getByTestId('backtest-run').click();
  await expect(page.getByTestId('backtest-run-error')).toBeVisible();
  // 錯誤狀態下不產生新 run
  await expect(page.getByTestId('backtest-run-note')).toBeHidden();
});

test('D5 不存在 symbol → 業務錯誤顯示 @extended', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await gotoBacktest(page);

  // UI 是固定選單,無法輸入不存在 symbol;注入一個 option 以觸發真後端業務錯誤
  // (不攔截 API,錯誤來自真實 BACKTEST_UNSUPPORTED_SYMBOL 回應)
  await page.getByTestId('backtest-symbol').evaluate((el) => {
    const select = el as HTMLSelectElement;
    const option = document.createElement('option');
    option.value = 'NOSUCHSYM';
    option.textContent = 'NOSUCHSYM';
    select.appendChild(option);
  });
  await page.getByTestId('backtest-symbol').selectOption('NOSUCHSYM');
  await page.getByTestId('backtest-run').click();

  await expect(page.getByTestId('backtest-run-error')).toBeVisible();
  await expect(page.getByTestId('backtest-run-error')).toContainText('BACKTEST_UNSUPPORTED_SYMBOL');
});

// D6(執行中重複點執行 → disable/防抖)屬純前端行為,依矩陣改歸 Vitest:
// 見 src/pages/Backtest.test.ts「執行中再次點擊不重複送出」;此處不重複實作。
