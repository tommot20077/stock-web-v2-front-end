import { test, expect, loginViaApi } from '../support/fixtures';
import type { Page } from '@playwright/test';

/**
 * 旅程 T:記錄交易 → 三頁重讀(VER-03)。
 *
 * Phase 4 的單元與元件測試在 jsdom + stub fetch 下驗過行為,但「真瀏覽器 → 真後端 → cookie/CSRF →
 * 冪等 header → 成交後重讀」這條鏈從未被自動化走過一次(2026-09-02 功能審查 M-2)。
 * 每條測試自帶唯一帳號,不依賴執行順序;selector 一律 data-testid。
 */

async function openTicketFromTrades(page: Page) {
  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-add-trade').click();
  await expect(page.getByTestId('ticket-symbol-input')).toBeFocused();
}

async function pickSymbol(page: Page, query: string, symbol: string) {
  await page.getByTestId('ticket-symbol-input').pressSequentially(query);
  // 開 ticket 時的空查詢列表本來就含目標標的;要等 debounce 後的查詢結果把它排到第一列,ArrowDown 才會選中它
  await expect(page.getByRole('option').first()).toHaveAttribute('data-testid', `ticket-symbol-option-${symbol}`);
  await page.getByTestId('ticket-symbol-input').press('ArrowDown');
  await page.getByTestId('ticket-symbol-input').press('Enter');
  await expect(page.getByTestId('ticket-symbol-input')).toHaveValue(symbol);
}

async function submitTrade(page: Page) {
  await page.getByTestId('ticket-review-advance').click();
  await page.getByTestId('ticket-submit').click();
}

async function tradeCount(page: Page): Promise<number> {
  const res = await page.request.get('/api/v1/trades?page=0&size=100');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.totalElements as number;
}

test('T1 買進 → 成功畫面為後端值 → Trades 與 Positions 重讀並標示新成交 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  await openTicketFromTrades(page);
  await pickSymbol(page, 'AAP', 'AAPL');
  await page.getByTestId('ticket-qty').fill('3');
  await submitTrade(page);

  const tradeId = page.getByTestId('ticket-result-trade-id');
  await expect(tradeId).toBeVisible();
  // 交易編號是完整 UUID,前端不得截斷
  await expect(tradeId).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  await expect(page.getByTestId('ticket-result-qty')).toHaveText('3');

  // 停在 Trades 頁關閉 ticket:該列應帶「新」標記(標記只在成交後第一個看到的頁面出現,見 UI-SPEC §9)
  await page.getByTestId('ticket-close').click();
  await expect(page.getByTestId('trades-fresh-badge')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('AAPL');

  // Positions 也已重讀到新持倉
  await page.getByTestId('nav-positions').click();
  const row = page.getByTestId('positions-row').filter({ hasText: 'AAPL' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('3');

  expect(await tradeCount(page)).toBe(1);
});

test('T2 賣出超過可賣數量:顯示可賣數量、出現錯誤且無法送出 @extended', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  await openTicketFromTrades(page);
  await pickSymbol(page, 'AAP', 'AAPL');
  await page.getByTestId('ticket-qty').fill('2');
  await submitTrade(page);
  await expect(page.getByTestId('ticket-result-trade-id')).toBeVisible();
  await page.getByTestId('ticket-close').click();

  await page.getByTestId('trades-add-trade').click();
  // 開 ticket 時標的下拉依 UI-SPEC §2 預設展開並蓋住方向鈕:先選標的(會收起下拉)再切 SELL
  await pickSymbol(page, 'AAP', 'AAPL');
  await page.getByTestId('ticket-side-sell').click();
  await expect(page.getByTestId('ticket-sellable-qty')).toContainText('2');

  await page.getByTestId('ticket-qty').fill('5');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByTestId('ticket-review-advance')).toBeDisabled();

  expect(await tradeCount(page)).toBe(1);
});

test('T3 送出時網路中斷 → 原樣重送不會重複建立交易(Idempotency-Key 端到端) @extended', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  // 第一次 POST /api/v1/trades 在送達後端前中斷,之後放行;記下每次送出的 Idempotency-Key
  const keys: string[] = [];
  await page.route('**/api/v1/trades', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      keys.push(request.headers()['idempotency-key'] ?? '');
      if (keys.length === 1) {
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });

  await openTicketFromTrades(page);
  await pickSymbol(page, 'AAP', 'AAPL');
  await page.getByTestId('ticket-qty').fill('4');
  await submitTrade(page);

  await expect(page.getByTestId('ticket-error-code')).toHaveText('NETWORK_ERROR');
  expect(await tradeCount(page)).toBe(0);

  // 使用者直接再按一次送出:沿用同一把 key
  await page.getByTestId('ticket-submit').click();
  await expect(page.getByTestId('ticket-result-trade-id')).toBeVisible();
  expect(await tradeCount(page)).toBe(1);

  // 重送必須沿用同一把 key:萬一第一次其實已送達後端,後端才能以冪等回傳既有那筆而非重複建立
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe('');
  expect(keys[1]).toBe(keys[0]);
});
