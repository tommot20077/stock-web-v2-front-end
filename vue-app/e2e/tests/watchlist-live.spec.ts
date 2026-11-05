import { test, expect, loginViaApi } from '../support/fixtures';
import { addWatchlistItem, listWatchlists } from '../support/journeyApi';
import type { Locator, Page } from '@playwright/test';

/**
 * 旅程 L1(watchlist-live,與 layout.spec 的 L1 無關):Phase 04.2 即時報價(WATCH-04;D-21 / D-23 / D-24),真瀏覽器 → 真後端 WebSocket(CI Browser E2E)。
 *
 * tick 來源:後端 e2e-browser profile 開啟 scheduling + ingestor + mock provider,每秒對 tradeable 資產發 tick,
 * 經 vite preview(4173)的 `/ws` 同源代理(RESEARCH W6)。ticket 由 apiClient 以 cookie + CSRF 取得。
 *
 * 決定性斷言只看列上的 `data-quote-source`(`ws` = stream live 且自上次 GET 以來已套用過該代號的 tick),
 * **不比對價格字串是否改變**(隨機漫步可能取到同值)。FX 列永遠沒有 tick(不可交易),
 * 所以 USD/TWD 必須維持非 `ws`、永不出現即時標記(P-W6)。不攔截任何請求。
 */

function watchlistRow(page: Page, symbol: string): Locator {
  return page.locator(`[data-testid="watchlist-row"][data-symbol="${symbol}"]`);
}

test('L1 加入 AAPL 與 USD/TWD → Watchlist 頁 15 秒內 AAPL 列 data-quote-source 變為 ws;USD/TWD 永不標示即時 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  // 前置:預設清單(首次 GET 由後端建立「我的自選」)加入 AAPL 與 USD/TWD
  const [defaultList] = await listWatchlists(page);
  expect(defaultList, '後端應建立預設清單').toBeDefined();
  await addWatchlistItem(page, defaultList.id, 'AAPL');
  await addWatchlistItem(page, defaultList.id, 'USD/TWD');

  await page.goto('/');
  await page.getByTestId('nav-watchlist').click();
  await expect(page.getByTestId('watchlist-toolbar-name')).toHaveText(defaultList.name);
  await expect(page.getByTestId('watchlist-row')).toHaveCount(2);

  // 頁首狀態列:ticket → 握手 → WELCOME → live
  await expect(page.locator('[data-testid="live-quote-status"][data-live-status="live"]')).toBeVisible({ timeout: 15_000 });

  // AAPL(tradeable,每秒有 tick):15 秒內套用 tick → ws + 圓點 / sr-only「即時」
  const aapl = watchlistRow(page, 'AAPL');
  await expect(aapl).toHaveAttribute('data-quote-source', 'ws', { timeout: 15_000 });
  await expect(aapl.getByTestId('watchlist-row-live')).toBeVisible();

  // USD/TWD(FX,不訂閱、沒有 tick):AAPL 都已收到 tick 時仍不是 ws,且沒有即時標記
  const fx = watchlistRow(page, 'USD/TWD');
  await expect(fx).toHaveAttribute('data-quote-source', /^(rest|none)$/);
  await expect(fx.getByTestId('watchlist-row-live')).toHaveCount(0);
  // 整頁恰一個即時標記(AAPL 那列)
  await expect(page.getByTestId('watchlist-row-live')).toHaveCount(1);
});
