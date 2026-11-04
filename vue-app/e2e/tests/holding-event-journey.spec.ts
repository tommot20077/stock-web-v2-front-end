import { test, expect, loginViaApi } from '../support/fixtures';
import { apiBuy, apiRead, apiWrite, localDate } from '../support/journeyApi';
import type { Page } from '@playwright/test';

/**
 * 旅程 J:Phase 04.2 股利與股數調整,真瀏覽器 → 真後端(CI Browser E2E,後端 e2e-browser profile)。
 *
 * jsdom + stub fetch 證明不了「Positions 列動作 → POST /portfolio/dividends(cookie + CSRF + Idempotency-Key)
 * → summary 重讀 → Trades 活動列表(GET /portfolio/activities)→ 沖銷」在真後端串得起來(judgment §8)。
 * 每條測試自帶唯一帳號;前置買進走 API(journeyApi.ts),要證明的那段一律走 UI;selector 一律 data-testid;
 * 不攔截任何請求(版面 stub 屬 layout.spec.ts)。金額文字的數字與代碼之間是 NBSP,文字斷言一律用 \s+ 正規式。
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CashBalance {
  currency: string;
  amount: number;
}

interface PortfolioSummary {
  baseCurrency: string;
  cashBalances: CashBalance[];
  dividendIncome: number;
  dividendTaxWithheld: number;
}

interface Holding {
  symbol: string;
  totalQuantity: number;
  avgCost: number;
}

interface ActivityPage {
  totalElements: number;
  items: Array<{ kind: string; symbol: string | null; reversed: boolean; reversalOfId: string | null }>;
}

async function readSummary(page: Page): Promise<PortfolioSummary> {
  return apiRead<PortfolioSummary>(page, '/api/v1/portfolio/summary');
}

function usdCash(summary: PortfolioSummary): number {
  return summary.cashBalances.find((balance) => balance.currency === 'USD')?.amount ?? 0;
}

/** Positions 該代號那一列的「股利與股數調整」→ 對話框(標的鎖定、預設現金股利,D-11)。 */
async function openHoldingEventFromPositions(page: Page, symbol: string): Promise<void> {
  await page.getByTestId('nav-positions').click();
  const row = page.getByTestId('positions-row').filter({ hasText: symbol });
  await expect(row).toHaveCount(1);
  await row.getByTestId('positions-holding-event').click();
  await expect(page.getByTestId('holding-event-dialog')).toBeVisible();
  await expect(page.getByTestId('holding-event-symbol-locked')).toContainText(symbol);
}

async function expectResult(page: Page, title: string): Promise<void> {
  const result = page.getByTestId('holding-event-result');
  await expect(result).toBeVisible();
  await expect(result.getByRole('heading', { level: 2 })).toHaveText(title);
  // 紀錄編號是完整 UUID(後端 DTO 的 id),前端不得截斷
  await expect(page.getByTestId('holding-event-result-entry-id')).toHaveText(UUID);
}

test('J1 記現金股利 → 股利收入與可用現金上升 → Trades「股利」頁籤列出 → 沖銷 → 已沖銷且收入歸零 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  // 基準幣切 USD:dividendIncome 以目前匯率折成基準幣,AAPL 是 USD → 收入恰為實領淨額,不依賴匯率資料
  await apiWrite(page, 'PATCH', '/api/v1/me/preferences', { baseCurrency: 'USD' });
  await apiBuy(page, 'AAPL', 10, 100);
  const before = await readSummary(page);
  expect(before.baseCurrency).toBe('USD');
  expect(before.dividendIncome).toBe(0);

  await page.goto('/');
  await openHoldingEventFromPositions(page, 'AAPL');
  await expect(page.getByTestId('holding-event-mode-cash-dividend')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('holding-event-amount').fill('120');
  await page.getByTestId('holding-event-tax').fill('30');
  await page.getByTestId('holding-event-submit').click();

  await expectResult(page, '現金股利已記錄');
  await page.getByTestId('holding-event-done').click();
  await expect(page.getByTestId('holding-event-dialog')).toHaveCount(0);

  // Positions 總損益卡:股利收入附加列(cause 'dividend' 只重讀 summary)
  const positionsIncome = page.getByTestId('positions-stat-dividend-income');
  await expect(positionsIncome).toHaveText(/\+120\s+USD/);
  await expect(positionsIncome).toHaveText(/30\s+USD/);

  // 跨來源:後端 summary 的股利收入 / 預扣稅,USD 現金 +120(實領淨額記入標的幣別;股利不動股數)
  const afterDividend = await readSummary(page);
  expect(afterDividend.dividendIncome).toBeCloseTo(120, 6);
  expect(afterDividend.dividendTaxWithheld).toBeCloseTo(30, 6);
  expect(usdCash(afterDividend)).toBeCloseTo(usdCash(before) + 120, 6);

  // Overview 總報酬率卡的同一列
  await page.getByTestId('nav-overview').click();
  await expect(page.getByTestId('overview-kpi-dividend-income')).toHaveText(/\+120\s+USD/);

  // Trades「股利」頁籤(後端篩選 type=DIVIDEND):恰一列現金股利,帶預扣稅第二行
  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-chip-dividend').click();
  const rows = page.getByTestId('trades-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-kind', 'CASH_DIVIDEND');
  await expect(rows.first().getByTestId('trades-tax-line')).toBeVisible();

  // 沖銷這筆 → 對話框 reversal 模式(值全取自原列)→ 記錄沖銷
  await rows.first().getByTestId('trades-reverse').click();
  await expect(page.getByTestId('holding-event-reversal-original')).toBeVisible();
  await page.getByTestId('holding-event-submit').click();
  await expect(page.getByTestId('holding-event-result')).toBeVisible();
  await expect(page.getByTestId('holding-event-result-reversal-of')).toBeVisible();
  await page.getByTestId('holding-event-done').click();

  // 沖銷後:原列已沖銷、沖銷列指回原列,兩列都不可再沖
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ has: page.getByTestId('trades-reversed-pill') })).toHaveCount(1);
  await expect(rows.filter({ has: page.getByTestId('trades-reversal-of') })).toHaveCount(1);
  await expect(page.getByTestId('trades-reverse')).toHaveCount(0);

  // 跨來源:收入與預扣稅歸零、USD 現金回到股利前
  const afterReversal = await readSummary(page);
  expect(afterReversal.dividendIncome).toBeCloseTo(0, 6);
  expect(afterReversal.dividendTaxWithheld).toBeCloseTo(0, 6);
  expect(usdCash(afterReversal)).toBeCloseTo(usdCash(before), 6);

  // 兩者皆 0 → 附加列不渲染(U-10)
  await page.getByTestId('nav-positions').click();
  await expect(page.getByTestId('positions-row').filter({ hasText: 'AAPL' })).toHaveCount(1);
  await expect(page.getByTestId('positions-stat-dividend-income')).toHaveCount(0);
});

test('J2 1000 股(均價 100)配股 50 → Positions 1050 股、均價 95.24 → Trades「股數調整」頁籤列出 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  // 成交在 7 天前:Q_asOf 只計 executed_at 早於除權日起點的交易
  await apiBuy(page, 'AAPL', 1000, 100);

  await page.goto('/');
  await openHoldingEventFromPositions(page, 'AAPL');
  await page.getByTestId('holding-event-mode-stock-dividend').click();
  await expect(page.getByTestId('holding-event-mode-stock-dividend')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('holding-event-shares').fill('50');
  // 除權日用昨天:effective_at = 交易所時區的除權日起點,「今天」在 UTC 凌晨可能仍晚於紐約的伺服器時間 5 分鐘以上
  await page.getByTestId('holding-event-effective-date').fill(localDate(-1));
  await page.getByTestId('holding-event-submit').click();

  await expectResult(page, '配股已記錄');
  await expect(page.getByTestId('holding-event-result-qty-delta')).toContainText('+50');
  await page.getByTestId('holding-event-done').click();

  // cause 'shareAdjustment' → 重讀 holdings:股數 1050、均價 100000 / 1050 = 95.238… 以頁面 2 位小數顯示
  const row = page.getByTestId('positions-row').filter({ hasText: 'AAPL' });
  await expect(row).toContainText('1050');
  await expect(row).toContainText('95.24');

  // 跨來源:後端持倉(scale 8 均價;不以「總成本恰好相等」斷言,契約〈配股攤薄的捨入誤差〉)
  const holdings = await apiRead<Holding[]>(page, '/api/v1/portfolio/holdings');
  const aapl = holdings.find((holding) => holding.symbol === 'AAPL');
  expect(aapl?.totalQuantity).toBe(1050);
  expect(aapl?.avgCost ?? 0).toBeCloseTo(95.2381, 4);

  // Trades「股數調整」頁籤(type=SHARE_ADJUSTMENT):一列配股,帶號股數
  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-chip-share-adjustment').click();
  const rows = page.getByTestId('trades-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-kind', 'STOCK_DIVIDEND');
  await expect(rows.first()).toContainText('+50');
});

test('J3 無持倉帳號從 Trades「股利」頁籤以 typeahead 選 AAPL 記一筆 → 列表出現(D-03 / D-28) @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');

  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-chip-dividend').click();
  await expect(page.getByTestId('trades-dividend-empty')).toBeVisible();
  await page.getByTestId('trades-record-dividend').click();

  // Trades 開啟:無標的 → typeahead,焦點在標的輸入框
  const symbolInput = page.getByTestId('holding-event-symbol-input');
  await expect(symbolInput).toBeFocused();
  await symbolInput.pressSequentially('AAP');
  await page.getByTestId('holding-event-symbol-option-AAPL').click();
  await expect(page.getByTestId('holding-event-amount-ccy')).toHaveText('USD');
  await page.getByTestId('holding-event-amount').fill('50');
  await page.getByTestId('holding-event-submit').click();

  await expectResult(page, '現金股利已記錄');
  await page.getByTestId('holding-event-done').click();

  const rows = page.getByTestId('trades-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-kind', 'CASH_DIVIDEND');
  await expect(rows.first()).toContainText('AAPL');

  // 跨來源:後端活動列表恰一筆股利,且沒有因此生出持倉(股利不動股數)
  const activities = await apiRead<ActivityPage>(page, '/api/v1/portfolio/activities?type=DIVIDEND&page=0&size=20');
  expect(activities.totalElements).toBe(1);
  expect(activities.items[0]?.kind).toBe('CASH_DIVIDEND');
  const holdings = await apiRead<Holding[]>(page, '/api/v1/portfolio/holdings');
  expect(holdings.filter((holding) => holding.symbol === 'AAPL')).toHaveLength(0);
});
