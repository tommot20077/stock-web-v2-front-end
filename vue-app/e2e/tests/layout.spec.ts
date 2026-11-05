import { test, expect, type Page } from '@playwright/test';
import {
  LONG_LIST_NAME,
  LONG_NOTE,
  LONG_TRACE_ID,
  WATCHLIST_ITEMS,
  WATCHLISTS,
  expectNoHorizontalScroll,
  measureOverflow,
  mockPortfolioApi,
} from '../support/portfolioStubs';

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
 * L7:header 導覽在 1024 / 1280 / 1366 / 1440px(zh / en)——每個導覽項都必須完整可見,不得靠水平捲動才看得到。
 * (04.1-30:1280px 單列版面加了「現金」後,最後兩項「設定 / 運維」被捲出視窗,L1 只量整頁捲動而沒抓到。)
 *
 * 單列版面:每顆導覽鈕都落在視窗 [0, innerWidth] 內,且落在 nav 自己的可視框內(沒被 overflow 裁掉);
 * 兩列版面:nav 獨佔一列,同樣要求 nav 本身不捲動。兩種版面下都另驗整頁與 main 不水平捲動。
 * 預設 tweaks.admin = true,所以「運維」也在 12 項之內(最寬情況);session chip 帶超長 email(最寬情況)。
 */
for (const width of [1024, 1280, 1366, 1440]) {
  for (const lang of ['zh', 'en'] as const) {
    test(`L7 ${width}px ${lang}:header 12 個導覽項全部完整可見、不需水平捲動 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (lang === 'en') {
        await page.addInitScript(() => {
          localStorage.setItem('resource:tweaks:v1', JSON.stringify({ lang: 'en' }));
        });
      }
      await mockPortfolioApi(page);
      await page.goto('/');
      await expect(page.getByTestId('header-logout')).toBeVisible();
      await expect(page.getByTestId('nav-ops')).toBeVisible();

      const m = await page.evaluate(() => {
        const nav = document.querySelector('header nav') as HTMLElement;
        const brand = document.querySelector('header .brand') as HTMLElement;
        const navBox = nav.getBoundingClientRect();
        const buttons = Array.from(nav.querySelectorAll('button')).map((b) => {
          const r = b.getBoundingClientRect();
          return { id: b.getAttribute('data-testid') ?? '', left: r.left, right: r.right };
        });
        return {
          innerWidth: window.innerWidth,
          wrapped: navBox.top >= brand.getBoundingClientRect().bottom - 1,
          navLeft: navBox.left,
          navRight: navBox.right,
          navScroll: nav.scrollWidth,
          navClient: nav.clientWidth,
          buttons,
        };
      });
      expect(m.buttons, '導覽項數量').toHaveLength(12);
      const layout = m.wrapped ? '兩列' : '單列';
      expect(m.navScroll, `${layout}版面下 nav 需水平捲動(內容寬 ${m.navScroll}px > 可視寬 ${m.navClient}px)`)
        .toBeLessThanOrEqual(m.navClient);
      for (const b of m.buttons) {
        expect(b.left, `${layout}版面 ${b.id} 左緣 ${b.left}px 在視窗外`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${layout}版面 ${b.id} 右緣 ${b.right}px 超出視窗 ${m.innerWidth}px`).toBeLessThanOrEqual(m.innerWidth);
        expect(b.left, `${layout}版面 ${b.id} 左緣被 nav 裁掉`).toBeGreaterThanOrEqual(m.navLeft - 0.5);
        expect(b.right, `${layout}版面 ${b.id} 右緣 ${b.right}px 被 nav 裁掉(nav 右緣 ${m.navRight}px)`).toBeLessThanOrEqual(m.navRight + 0.5);
      }
      await expectNoHorizontalScroll(page);
    });
  }
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
async function openPage(page: Page, nav: 'cash' | 'positions' | 'trades' | 'watchlist' | 'markets'): Promise<void> {
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

/**
 * L5:持倉表 / Trades 表 / Overview 近期交易表在 320 / 375px 於卡內捲動,不帶動頁面。
 * 表格宿主以 testid 定位(positions-table / trades-table / overview-recent-trades)。
 */
const TABLE_PAGES = {
  positions: { nav: 'positions', ready: 'positions-day-pnl', host: 'positions-table' },
  trades: { nav: 'trades', ready: 'trades-ccy-tag', host: 'trades-table' },
  overview: { nav: null, ready: 'overview-trade-ccy-tag', host: 'overview-recent-trades' },
} as const;

for (const width of [320, 375]) {
  for (const pageKey of ['positions', 'trades', 'overview'] as const) {
    test(`L5 ${width}px ${pageKey}:表格在卡內捲動、不帶動頁面 @smoke`, async ({ page }) => {
      const spec = TABLE_PAGES[pageKey];
      await page.setViewportSize({ width, height: 800 });
      await mockPortfolioApi(page);
      if (spec.nav === null) {
        await page.goto('/');
      } else {
        await openPage(page, spec.nav);
      }
      await expect(page.getByTestId(spec.ready).first()).toBeVisible();

      await expectNoHorizontalScroll(page);
      await expectTableScrollsInsideCard(page, spec.host);
    });
  }
}

/**
 * L6:summary 回 503 且帶長 traceId 時,Overview 診斷列在 320px 完整顯示 code 與 traceId
 * (overflow-wrap: anywhere,不被 overflow:hidden / ellipsis 裁切)。
 */
test('L6 320px:summary 503 帶長 traceId 時 Overview 診斷列完整顯示 @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockPortfolioApi(page, { failPaths: { '/api/v1/portfolio/summary': { traceId: LONG_TRACE_ID } } });
  await page.goto('/');

  await expect(page.getByTestId('overview-summary-error')).toBeVisible();
  const clientWidth = await expectNoHorizontalScroll(page);

  await expect(page.getByTestId('overview-summary-error-code')).toHaveText('SERVICE_UNAVAILABLE');
  const trace = page.getByTestId('overview-summary-trace-id');
  await expect(trace).toContainText(LONG_TRACE_ID);
  const m = await trace.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(m.scrollWidth, `traceId 被裁切:內容寬 ${m.scrollWidth}px > 可視寬 ${m.clientWidth}px`).toBeLessThanOrEqual(m.clientWidth);
  const box = await trace.boundingBox();
  expect(box, 'traceId 應有版面').not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
});

/**
 * L8:現金頁紀錄表在 320 / 375px(zh / en)——類型膠囊單行、沖銷註記不得被擠成一字一行的窄欄。
 * (04.1-30:類型欄被壓到約 40px,「出 / 金」逐字換行、「沖銷 2026-10-26 的紀錄」折成 8 行。)
 */
for (const width of [320, 375]) {
  for (const lang of ['zh', 'en'] as const) {
    test(`L8 ${width}px ${lang}:現金頁類型膠囊單行、沖銷註記不超過 3 行 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (lang === 'en') {
        await page.addInitScript(() => {
          localStorage.setItem('resource:tweaks:v1', JSON.stringify({ lang: 'en' }));
        });
      }
      await mockPortfolioApi(page);
      await openPage(page, 'cash');
      await expect(page.getByTestId('cash-entries-row')).toHaveCount(10);
      await expect(page.getByTestId('cash-entries-reversal-of')).toHaveCount(1);

      const m = await page.evaluate(() => {
        const lineCount = (el: Element): number => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
        };
        const pills = Array.from(document.querySelectorAll('[data-testid="cash-entries-row"] .type-pill'))
          .map((el) => ({ lines: lineCount(el), height: el.getBoundingClientRect().height }));
        const note = document.querySelector('[data-testid="cash-entries-reversal-of"]') as HTMLElement;
        const fontSize = parseFloat(getComputedStyle(note).fontSize);
        const amounts = Array.from(document.querySelectorAll('[data-testid="cash-entries-row"] .amount'))
          .map((el) => lineCount(el));
        return { pills, noteHeight: note.getBoundingClientRect().height, noteLines: lineCount(note), fontSize, amounts };
      });
      expect(m.pills.length).toBeGreaterThan(0);
      for (const p of m.pills) {
        expect(p.lines, `類型膠囊應為單行(實際 ${p.lines} 行,高 ${p.height}px)`).toBe(1);
        expect(p.height, `類型膠囊高 ${p.height}px 不像單行`).toBeLessThanOrEqual(m.fontSize * 2.5);
      }
      for (const lines of m.amounts) expect(lines, '金額應為單行').toBe(1);
      expect(m.noteHeight, `沖銷註記高 ${m.noteHeight}px(${m.noteLines} 行)超過 3 行的高度`)
        .toBeLessThanOrEqual(m.fontSize * 1.6 * 3);

      await expectNoHorizontalScroll(page);
      await expectTableScrollsInsideCard(page, 'cash-entries');
    });
  }
}

/**
 * L9:Trades / Overview 近期交易 / Positions 表在 320 / 375px——相鄰兩格的「可見內容」之間至少留 6px。
 * (04.1-31:數字格沒有水平內距,數量 `0.5` 與單價 `60,000.00` 被讀成 `0.560,000.00`;錢的表格裡兩個數字讀成一個是誤讀風險。)
 *
 * 量法:每格取「畫出來的東西」——文字節點的 Range rect;若文字在有底色的膠囊(type pill / 幣別標籤)裡,
 * 改取膠囊本身的 rect(膠囊貼著隔壁欄一樣是視覺黏在一起)。同一列的相鄰格:右格內容的最左緣 - 左格內容的最右緣 >= 6px。
 * 只比同一列的相對位置,所以與表格在卡內的水平捲動位置無關。
 */
const MIN_CELL_GAP = 6;

interface CellGap {
  row: number;
  col: number;
  gap: number;
  left: string;
  right: string;
}

/**
 * L9 / L14 共用:同一列相鄰兩格「可見內容」的水平間距(量法見 L9 說明)。只比同一列的相對位置,與卡內捲動位置無關。
 */
async function measureCellGaps(page: Page, host: string): Promise<{ rows: number; pairs: CellGap[] }> {
  return page.evaluate((host) => {
    const transparent = (c: string) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    const inkBoxes = (cell: Element): Array<{ left: number; right: number; text: string }> => {
      const boxes: Array<{ left: number; right: number; text: string }> = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim();
        if (!text) continue;
        let painted: Element | null = null;
        let hidden = false;
        for (let el = node.parentElement; el && el !== cell; el = el.parentElement) {
          const style = getComputedStyle(el);
          // 螢幕閱讀器專用文字(.sr-only:clip + 1px)不是畫出來的內容,不參與間距
          if (style.clip !== 'auto' && style.clip !== '') hidden = true;
          if (!painted && !transparent(style.backgroundColor)) painted = el;
        }
        if (hidden) continue;
        if (painted) {
          const r = painted.getBoundingClientRect();
          boxes.push({ left: r.left, right: r.right, text });
        } else {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width > 0) boxes.push({ left: r.left, right: r.right, text });
          }
        }
      }
      return boxes;
    };
    const rows = Array.from(document.querySelectorAll(`[data-testid="${host}"] tbody tr`));
    const pairs: Array<{ row: number; col: number; gap: number; left: string; right: string }> = [];
    rows.forEach((tr, row) => {
      const cells = Array.from(tr.children);
      for (let col = 0; col < cells.length - 1; col += 1) {
        const a = inkBoxes(cells[col]);
        const b = inkBoxes(cells[col + 1]);
        if (!a.length || !b.length) continue;
        const aRight = Math.max(...a.map((x) => x.right));
        const bLeft = Math.min(...b.map((x) => x.left));
        pairs.push({
          row,
          col,
          gap: bLeft - aRight,
          left: [...new Set(a.map((x) => x.text))].join(' ').slice(0, 24),
          right: [...new Set(b.map((x) => x.text))].join(' ').slice(0, 24),
        });
      }
    });
    return { rows: rows.length, pairs };
  }, host);
}

const GAP_PAGES = {
  trades: { nav: 'trades', ready: 'trades-ccy-tag', host: 'trades-table' },
  overview: { nav: null, ready: 'overview-trade-ccy-tag', host: 'overview-recent-trades' },
  positions: { nav: 'positions', ready: 'positions-day-pnl', host: 'positions-table' },
} as const;

for (const width of [320, 375]) {
  for (const pageKey of ['trades', 'overview', 'positions'] as const) {
    test(`L9 ${width}px ${pageKey}:相鄰儲存格的可見內容間距 >= ${MIN_CELL_GAP}px @smoke`, async ({ page }) => {
      const spec = GAP_PAGES[pageKey];
      await page.setViewportSize({ width, height: 800 });
      await mockPortfolioApi(page);
      if (spec.nav === null) {
        await page.goto('/');
      } else {
        await openPage(page, spec.nav);
      }
      await expect(page.getByTestId(spec.ready).first()).toBeVisible();

      const m = await measureCellGaps(page, spec.host);

      expect(m.rows, `${spec.host} 沒有資料列`).toBeGreaterThan(0);
      expect(m.pairs.length, '沒有量到任何相鄰儲存格').toBeGreaterThan(0);
      const tight = m.pairs.filter((p) => p.gap < MIN_CELL_GAP);
      expect(
        tight,
        `${tight.length} 組相鄰儲存格間距 < ${MIN_CELL_GAP}px:`
          + tight.slice(0, 6).map((p) => `[列${p.row} 欄${p.col}->${p.col + 1}] "${p.left}" | "${p.right}" 間距 ${p.gap.toFixed(1)}px`).join('; '),
      ).toEqual([]);

      await expectNoHorizontalScroll(page);
      await expectTableScrollsInsideCard(page, spec.host);
    });
  }
}

/**
 * L10:現金頁紀錄在 320 / 375px(zh / en)——日期、類型膠囊、帶號金額、備註、狀態 / 沖銷鈕全部直接可見,
 * 不需要在卡內水平捲動(04.1-30 把類型 / 備註欄保底 160px 後,金額欄被推出視窗、狀態欄不可達)。
 *
 * 每列:上述元素的左右緣都在 [0, innerWidth] 內,也在卡片(cash-entries)的可視框內;卡片自己 scrollWidth <= clientWidth;
 * 類型膠囊與金額單行;整頁與 main 不水平捲動。
 */
for (const width of [320, 375]) {
  for (const lang of ['zh', 'en'] as const) {
    test(`L10 ${width}px ${lang}:現金頁每列的金額 / 狀態 / 備註不需水平捲動即可見 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (lang === 'en') {
        await page.addInitScript(() => {
          localStorage.setItem('resource:tweaks:v1', JSON.stringify({ lang: 'en' }));
        });
      }
      await mockPortfolioApi(page);
      await openPage(page, 'cash');
      await expect(page.getByTestId('cash-entries-row')).toHaveCount(10);

      const m = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="cash-entries"]') as HTMLElement;
        const cardBox = card.getBoundingClientRect();
        const cs = getComputedStyle(card);
        const visibleLeft = cardBox.left + parseFloat(cs.borderLeftWidth);
        const visibleRight = cardBox.left + parseFloat(cs.borderLeftWidth) + card.clientWidth;
        const lineCount = (el: Element): number => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
        };
        const rows = Array.from(card.querySelectorAll('[data-testid="cash-entries-row"]')).map((row, index) => {
          const parts: Array<{ name: string; left: number; right: number; width: number }> = [];
          const add = (name: string, el: Element | null) => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            parts.push({ name, left: r.left, right: r.right, width: r.width });
          };
          add('日期', row.querySelector('.col-date'));
          add('類型膠囊', row.querySelector('.type-pill'));
          add('金額', row.querySelector('.amount'));
          add('備註', row.querySelector('.note'));
          add('沖銷狀態', row.querySelector('[data-testid="cash-entries-reversed-pill"]'));
          add('沖銷鈕', row.querySelector('button'));
          return {
            index,
            parts,
            hasAmount: row.querySelector('.amount') !== null,
            amountLines: lineCount(row.querySelector('.amount') as Element),
            pillLines: lineCount(row.querySelector('.type-pill') as Element),
            amountText: (row.querySelector('.amount') as HTMLElement).textContent ?? '',
          };
        });
        return {
          innerWidth: window.innerWidth,
          visibleLeft,
          visibleRight,
          cardScroll: card.scrollWidth,
          cardClient: card.clientWidth,
          rows,
        };
      });

      expect(m.cardScroll, `卡片需要水平捲動(內容寬 ${m.cardScroll}px > 可視寬 ${m.cardClient}px)`).toBeLessThanOrEqual(m.cardClient);
      expect(m.rows).toHaveLength(10);
      for (const row of m.rows) {
        expect(row.hasAmount, `列 ${row.index} 沒有金額`).toBe(true);
        expect(row.amountLines, `列 ${row.index} 金額應為單行`).toBe(1);
        expect(row.pillLines, `列 ${row.index} 類型膠囊應為單行`).toBe(1);
        for (const p of row.parts) {
          const where = `列 ${row.index}(${row.amountText})${p.name}`;
          expect(p.width, `${where} 沒有版面`).toBeGreaterThan(0);
          expect(p.left, `${where} 左緣 ${p.left}px 在視窗外`).toBeGreaterThanOrEqual(0);
          expect(p.right, `${where} 右緣 ${p.right}px 超出視窗 ${m.innerWidth}px`).toBeLessThanOrEqual(m.innerWidth);
          expect(p.left, `${where} 左緣 ${p.left}px 在卡片可視框外(${m.visibleLeft}px)`).toBeGreaterThanOrEqual(m.visibleLeft - 0.5);
          expect(p.right, `${where} 右緣 ${p.right}px 在卡片可視框外(${m.visibleRight}px)`).toBeLessThanOrEqual(m.visibleRight + 0.5);
        }
      }

      await expectNoHorizontalScroll(page);
      await expectTableScrollsInsideCard(page, 'cash-entries');
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 04.2 版面量測 L11 ~ L16(UI-SPEC §Test-Visible Contract;§UI Considerations 的 8 項 backstop)。
// 一律 page.route 攔 /api/v1/*(portfolioStubs),WS 以 page.routeWebSocket 或 ticket 503 製造狀態;不需後端。
// ---------------------------------------------------------------------------------------------

type Lang = 'zh' | 'en';
const LANGS: readonly Lang[] = ['zh', 'en'];

async function useLang(page: Page, lang: Lang): Promise<void> {
  if (lang === 'en') {
    await page.addInitScript(() => {
      localStorage.setItem('resource:tweaks:v1', JSON.stringify({ lang: 'en' }));
    });
  }
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

async function boxOf(page: Page, testId: string, nth = 0): Promise<Box> {
  const box = await page.getByTestId(testId).nth(nth).boundingBox();
  expect(box, `${testId}[${nth}] 應有版面`).not.toBeNull();
  return { left: box!.x, right: box!.x + box!.width, top: box!.y, bottom: box!.y + box!.height, width: box!.width, height: box!.height };
}

/** 元素左右緣都在視窗 [0, clientWidth] 內(不是靠隱藏或被裁掉解決)。 */
function expectInsideViewport(box: Box, clientWidth: number, what: string): void {
  expect(box.width, `${what} 沒有版面`).toBeGreaterThan(0);
  expect(box.left, `${what} 左緣 ${box.left}px 在視窗外`).toBeGreaterThanOrEqual(-0.5);
  expect(box.right, `${what} 右緣 ${box.right}px 超出視窗 ${clientWidth}px`).toBeLessThanOrEqual(clientWidth + 0.5);
}

function expectInside(inner: Box, outer: Box, what: string, where: string): void {
  expect(inner.left, `${what} 左緣 ${inner.left}px 超出${where}(${outer.left}px)`).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right, `${what} 右緣 ${inner.right}px 超出${where}(${outer.right}px)`).toBeLessThanOrEqual(outer.right + 0.5);
}

/** 文字行數:元素內容的 client rects 以 top 去重。 */
async function lineCountOf(page: Page, testId: string, nth = 0): Promise<number> {
  return page.getByTestId(testId).nth(nth).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  });
}

/**
 * L11:Watchlist 頁 —— 20 個清單(含 30 字名稱)的 tabs 只在自己的列內水平捲動、不換行、不撐頁;
 * 作用中清單 12 檔(股票 / 加密 / FX / 債券 / 無報價);< 640px 每列價格與漲跌不需卡內捲動即可見;
 * LiveQuoteStatus 的 degraded 與 replaced(4002)文案、重新連線鈕都在視窗內;整頁與 main 不水平捲動。
 * 狀態順序:ticket 先 503(degraded)→ 放行後下一次退避重連拿到 ticket → routeWebSocket 以 4002 關閉(replaced)。
 */
for (const width of [320, 375, 768, 1280, 1440]) {
  for (const lang of LANGS) {
    test(`L11 ${width}px ${lang}:Watchlist 頁 tabs 列內捲動、每列價格與漲跌可見、即時狀態文案與重新連線鈕在視窗內 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useLang(page, lang);
      let release: () => void = () => {};
      const ticketGate = new Promise<void>((resolve) => { release = resolve; });
      await mockPortfolioApi(page, { ws: 'replaced', ticketGate });
      await openPage(page, 'watchlist');

      await expect(page.getByTestId('watchlist-tab')).toHaveCount(WATCHLISTS.length);
      await expect(page.getByTestId('watchlist-row')).toHaveCount(WATCHLIST_ITEMS.length);
      await expect(page.getByTestId('watchlist-toolbar-name')).toHaveText(LONG_LIST_NAME);
      const status = page.getByTestId('live-quote-status');
      await expect(status).toHaveAttribute('data-live-status', 'degraded');

      // tabs:列內水平捲動(內容比可視寬)、單列不換行、不撐頁;30 字名稱單行省略 + title 全名
      const tabs = await page.getByTestId('watchlist-tabs').evaluate((el) => {
        const tabEls = Array.from(el.querySelectorAll('[data-testid="watchlist-tab"]'));
        const first = tabEls[0] as HTMLElement;
        const name = first.firstElementChild as HTMLElement;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: getComputedStyle(el).overflowX,
          right: el.getBoundingClientRect().right,
          tops: [...new Set(tabEls.map((t) => Math.round(t.getBoundingClientRect().top)))],
          firstTitle: first.getAttribute('title'),
          firstWidth: first.getBoundingClientRect().width,
          nameScroll: name.scrollWidth,
          nameClient: name.clientWidth,
          nameWhiteSpace: getComputedStyle(name).whiteSpace,
          nameOverflow: getComputedStyle(name).textOverflow,
        };
      });
      expect(tabs.overflowX).toBe('auto');
      expect(tabs.scrollWidth, '20 個 tabs 應在自己的列內捲動(內容寬 > 可視寬)').toBeGreaterThan(tabs.clientWidth);
      expect(tabs.tops, `tabs 換行成 ${tabs.tops.length} 列`).toHaveLength(1);
      expect(tabs.firstTitle).toBe(LONG_LIST_NAME);
      expect(tabs.firstWidth, `30 字名稱 tab 寬 ${tabs.firstWidth}px 超過 max-width 200px`).toBeLessThanOrEqual(200.5);
      expect(tabs.nameWhiteSpace).toBe('nowrap');
      expect(tabs.nameOverflow).toBe('ellipsis');
      expect(tabs.nameScroll, '30 字名稱應被省略(內容寬 > 可視寬)').toBeGreaterThan(tabs.nameClient);

      const clientWidth = await expectNoHorizontalScroll(page);
      expect(tabs.right, `tabs 列右緣 ${tabs.right}px 超出視窗`).toBeLessThanOrEqual(clientWidth + 0.5);

      // 工具列標題:30 字名稱 overflow-wrap: anywhere 換行,不被裁、不撐卡
      const title = await page.getByTestId('watchlist-toolbar-name').evaluate((el) => ({
        wrap: getComputedStyle(el).overflowWrap,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(title.wrap).toBe('anywhere');
      expect(title.scrollWidth, `清單名稱被裁切:內容寬 ${title.scrollWidth}px > 可視寬 ${title.clientWidth}px`).toBeLessThanOrEqual(title.clientWidth);
      expectInsideViewport(await boxOf(page, 'watchlist-toolbar-name'), clientWidth, '工具列清單名稱');
      for (const id of ['watchlist-reorder', 'watchlist-rename', 'watchlist-delete', 'watchlist-new-list']) {
        expectInsideViewport(await boxOf(page, id), clientWidth, id);
      }

      if (width < 640) {
        // 堆疊列版:每列的代號 / 價格 / 漲跌 / 移除鈕都在卡片可視框與視窗內,卡片(表格容器)不需水平捲動
        const m = await page.getByTestId('watchlist-table').evaluate((table) => {
          const wrap = table.parentElement as HTMLElement;
          const wrapBox = wrap.getBoundingClientRect();
          const rows = Array.from(table.querySelectorAll('[data-testid="watchlist-row"]')).map((row) => {
            const part = (id: string) => {
              const el = row.querySelector(`[data-testid="${id}"]`);
              const r = el?.getBoundingClientRect();
              return r ? { left: r.left, right: r.right, width: r.width } : null;
            };
            return {
              symbol: row.getAttribute('data-symbol') ?? '',
              price: part('watchlist-row-price'),
              change: part('watchlist-row-change'),
              remove: part('watchlist-remove'),
            };
          });
          return { wrapScroll: wrap.scrollWidth, wrapClient: wrap.clientWidth, left: wrapBox.left, right: wrapBox.left + wrap.clientWidth, rows };
        });
        expect(m.wrapScroll, `表格容器需要水平捲動(內容寬 ${m.wrapScroll}px > 可視寬 ${m.wrapClient}px)`).toBeLessThanOrEqual(m.wrapClient);
        for (const row of m.rows) {
          for (const [name, part] of [['價格', row.price], ['漲跌', row.change], ['移除鈕', row.remove]] as const) {
            expect(part, `${row.symbol} ${name} 不存在`).not.toBeNull();
            expect(part!.width, `${row.symbol} ${name} 沒有版面`).toBeGreaterThan(0);
            expect(part!.left, `${row.symbol} ${name} 左緣在卡片外`).toBeGreaterThanOrEqual(m.left - 0.5);
            expect(part!.right, `${row.symbol} ${name} 右緣 ${part!.right}px 超出卡片 ${m.right}px`).toBeLessThanOrEqual(m.right + 0.5);
            expect(part!.right).toBeLessThanOrEqual(clientWidth + 0.5);
          }
        }
      } else {
        await expectTableScrollsInsideCard(page, 'watchlist-page');
      }

      // degraded:「即時報價中斷,稍後自動重試 · 更新於 HH:mm」在視窗內、不撐頁
      const degraded = await boxOf(page, 'live-quote-status');
      expectInsideViewport(degraded, clientWidth, 'degraded 狀態列');
      await expect(page.getByTestId('watchlist-row-live')).toHaveCount(0);

      // replaced(4002):文案 + 附註 + 「在此分頁重新連線」都在視窗內;不自動重連
      release();
      await expect(status).toHaveAttribute('data-live-status', 'replaced', { timeout: 15_000 });
      await expect(page.getByTestId('live-quote-reconnect')).toBeVisible();
      await expectNoHorizontalScroll(page);
      const replaced = await status.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(replaced.scrollWidth, `replaced 文案撐出狀態列:${replaced.scrollWidth}px > ${replaced.clientWidth}px`).toBeLessThanOrEqual(replaced.clientWidth);
      expectInsideViewport(await boxOf(page, 'live-quote-status'), clientWidth, 'replaced 狀態列');
      expectInsideViewport(await boxOf(page, 'live-quote-reconnect'), clientWidth, '重新連線鈕');
      await expect(page.getByTestId('watchlist-row-live')).toHaveCount(0);
    });
  }
}

/**
 * L12:Markets 開啟 WatchlistPicker(20 個清單、30 字名稱)—— 面板完整在視窗內(< 480px 為底部面板,左右下各 16px);
 * 清單名稱換行不溢出面板;整頁不水平捲動。
 * 例外(deferred,非本 phase 範圍):Markets 頁首搜尋框(固定 280px)與 tabs / LIVE 列是 scaffold(a214f1b)既有骨架,
 * < 640px 本來就撐寬 .main(UI-SPEC「既有、本 phase 不碰的頁面骨架」)。此處 < 640px 改量「開啟選擇器不增加 .main 的捲動寬」
 * + documentElement 不捲;>= 640px 仍量 documentElement 與 .main 皆不捲。
 */
for (const width of [320, 375, 768, 1280]) {
  for (const lang of LANGS) {
    test(`L12 ${width}px ${lang}:觀察清單選擇器面板在視窗內(< 480px 底部面板)、30 字名稱換行 @smoke`, async ({ page }) => {
      const height = 800;
      await page.setViewportSize({ width, height });
      await useLang(page, lang);
      await mockPortfolioApi(page);
      await openPage(page, 'markets');

      const star = page.locator('[data-testid="markets-star"][data-symbol="AAPL"]');
      await expect(star).toBeVisible();
      const before = await measureOverflow(page);
      await star.click();
      const picker = page.getByTestId('watchlist-picker');
      await expect(picker).toBeVisible();
      await expect(page.getByTestId('watchlist-picker-option')).toHaveCount(WATCHLISTS.length);
      // 已達 20 個清單:新增清單 disabled + 上限文案(可見原因,鐵律 6)
      await expect(page.getByTestId('watchlist-picker-limit')).toBeVisible();
      await waitForFiniteAnimations(page);

      let clientWidth: number;
      if (width >= 640) {
        clientWidth = await expectNoHorizontalScroll(page);
      } else {
        const after = await measureOverflow(page);
        clientWidth = after.docClient;
        expect(after.docScroll, `頁面寬 ${after.docScroll}px 超出視窗 ${after.docClient}px`).toBeLessThanOrEqual(after.docClient);
        expect(
          after.mainScroll,
          `開啟選擇器後 main 捲動寬 ${after.mainScroll}px 大於開啟前 ${before.mainScroll}px(選擇器自己撐寬了 main)`,
        ).toBeLessThanOrEqual(Math.max(before.mainScroll, after.mainClient));
        if (before.mainScroll > before.mainClient) {
          test.info().annotations.push({
            type: 'deferred',
            description: `Markets 既有頁首 / tabs 在 ${width}px 撐寬 main:${before.mainScroll}px > ${before.mainClient}px(非選擇器造成)`,
          });
        }
      }
      const panel = await boxOf(page, 'watchlist-picker');
      expectInsideViewport(panel, clientWidth, '選擇器面板');
      expect(panel.top, `面板上緣 ${panel.top}px 在視窗外`).toBeGreaterThanOrEqual(-0.5);
      expect(panel.bottom, `面板下緣 ${panel.bottom}px 超出視窗 ${height}px`).toBeLessThanOrEqual(height + 0.5);
      if (width < 480) {
        expect(Math.abs(panel.left - 16), `底部面板左緣 ${panel.left}px 應為 16px`).toBeLessThanOrEqual(1);
        expect(Math.abs(clientWidth - panel.right - 16), `底部面板右緣距視窗 ${clientWidth - panel.right}px 應為 16px`).toBeLessThanOrEqual(1);
        expect(Math.abs(height - panel.bottom - 16), `底部面板下緣距視窗 ${height - panel.bottom}px 應為 16px`).toBeLessThanOrEqual(1);
      } else {
        expect(panel.left, '錨定 popover 四邊至少留 16px').toBeGreaterThanOrEqual(15.5);
        expect(clientWidth - panel.right, '錨定 popover 四邊至少留 16px').toBeGreaterThanOrEqual(15.5);
      }

      // 每個清單列(含 30 字名稱)不溢出面板:內容寬 <= 可視寬,且落在面板左右緣內
      const options = await picker.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll('[data-testid="watchlist-picker-option"]')).map((option) => {
          const r = option.getBoundingClientRect();
          return {
            text: (option.textContent ?? '').trim().slice(0, 16),
            scrollWidth: option.scrollWidth,
            clientWidth: option.clientWidth,
            left: r.left,
            right: r.right,
            panelLeft: box.left,
            panelRight: box.right,
          };
        });
      });
      for (const option of options) {
        expect(option.scrollWidth, `清單列「${option.text}」內容寬 ${option.scrollWidth}px > 可視寬 ${option.clientWidth}px`).toBeLessThanOrEqual(option.clientWidth);
        expect(option.left).toBeGreaterThanOrEqual(option.panelLeft - 0.5);
        expect(option.right, `清單列「${option.text}」右緣超出面板`).toBeLessThanOrEqual(option.panelRight + 0.5);
      }
    });
  }
}

/**
 * 等頁面上「有限次數」的 CSS 動畫跑完(對話框 mask fade / 面板 rise translateY(12px) 220ms)。
 * 量多個元素是分次呼叫 boundingBox,開啟動畫途中量會把位移差算進去(4 workers 負載下實際出現 11.3px 假失敗);
 * 無限動畫(骨架 pulse、即時圓點)不等。
 */
async function waitForFiniteAnimations(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined)),
  ));
}

/** L13 用:對話框面板、footer 兩顆按鈕、模式按鈕的版面量測(面板在視窗內;footer 在面板內,< 400px 直排滿寬)。 */
async function expectHoldingEventDialogLayout(page: Page, width: number, what: string, withModes: boolean): Promise<void> {
  await waitForFiniteAnimations(page);
  const clientWidth = await expectNoHorizontalScroll(page);
  const panel = await boxOf(page, 'holding-event-dialog');
  expectInsideViewport(panel, clientWidth, `${what} 面板`);
  const submit = await boxOf(page, 'holding-event-submit');
  const cancel = await boxOf(page, 'holding-event-cancel');
  expectInside(submit, panel, `${what} 送出鈕`, '面板');
  expectInside(cancel, panel, `${what} 取消鈕`, '面板');
  expect(await lineCountOf(page, 'holding-event-submit'), `${what} 送出鈕文字應為單行`).toBe(1);
  const submitText = await page.getByTestId('holding-event-submit').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(submitText.scrollWidth, `${what} 送出鈕文字溢出:${submitText.scrollWidth}px > ${submitText.clientWidth}px`).toBeLessThanOrEqual(submitText.clientWidth);
  if (width < 400) {
    // U-05:主要鈕在上、取消在下,兩者同寬滿版
    expect(submit.bottom, `${what} < 400px 時送出鈕應在取消鈕之上`).toBeLessThanOrEqual(cancel.top + 0.5);
    expect(Math.abs(submit.width - cancel.width), `${what} 直排兩鈕應同寬`).toBeLessThanOrEqual(1);
    expect(Math.abs(submit.left - cancel.left)).toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(submit.top - cancel.top), `${what} >= 400px 時兩鈕應同列`).toBeLessThanOrEqual(1);
    expect(cancel.right, `${what} 取消在左、送出在右`).toBeLessThanOrEqual(submit.left + 0.5);
  }
  if (withModes) {
    for (const id of ['holding-event-mode-cash-dividend', 'holding-event-mode-stock-dividend', 'holding-event-mode-split']) {
      const mode = await boxOf(page, id);
      expectInside(mode, panel, `${what} ${id}`, '面板');
      // 窄面板允許換兩行(white-space: normal),但不得溢出按鈕本身
      expect(await lineCountOf(page, id), `${what} ${id} 超過兩行`).toBeLessThanOrEqual(2);
      const overflow = await page.getByTestId(id).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `${what} ${id} 文字溢出按鈕 ${overflow}px`).toBeLessThanOrEqual(0);
    }
  }
}

/**
 * L13:股利與股數調整對話框三種模式 + 沖銷 —— 面板在視窗內;footer 按鈕在面板內(< 400px 直排);
 * 模式按鈕不溢出面板(en 可兩行);送出中按鈕寬度不跳動(en 最長標籤 `Record stock dividend`)。
 */
for (const width of [320, 375, 768, 1280]) {
  for (const lang of LANGS) {
    test(`L13 ${width}px ${lang}:股利與股數調整對話框三種模式 + 沖銷的面板、footer、模式按鈕在視窗內,送出中寬度不變 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useLang(page, lang);
      let release: () => void = () => {};
      const holdingEventPostGate = new Promise<void>((resolve) => { release = resolve; });
      await mockPortfolioApi(page, { holdingEventPostGate });
      await openPage(page, 'positions');
      await expect(page.getByTestId('positions-day-pnl').first()).toBeVisible();

      // Positions 列動作開啟:標的鎖定、預設現金股利
      await page.getByTestId('positions-holding-event').first().click();
      const dialog = page.getByTestId('holding-event-dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('holding-event-symbol-locked')).toBeVisible();

      for (const [modeId, field] of [
        ['holding-event-mode-stock-dividend', 'holding-event-shares'],
        ['holding-event-mode-split', 'holding-event-ratio-new'],
        ['holding-event-mode-cash-dividend', 'holding-event-amount'],
      ] as const) {
        await page.getByTestId(modeId).click();
        await expect(page.getByTestId(modeId)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId(field)).toBeVisible();
        await expectHoldingEventDialogLayout(page, width, modeId, true);
      }

      // 送出中:按鈕寬度不跳動(min-width 由最寬標籤決定;< 400px 為滿寬)
      await page.getByTestId('holding-event-amount').fill('1');
      await expect(page.getByTestId('holding-event-submit')).toBeEnabled();
      const before = (await boxOf(page, 'holding-event-submit')).width;
      await page.getByTestId('holding-event-submit').click();
      await expect(dialog).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByTestId('holding-event-submitting-status')).toBeVisible();
      const during = (await boxOf(page, 'holding-event-submit')).width;
      expect(Math.abs(during - before), `送出中寬度 ${during}px 與原寬 ${before}px 不同`).toBeLessThanOrEqual(1);
      release();
      await expect(dialog).toHaveAttribute('aria-busy', 'false');
      await page.getByTestId('holding-event-close').click();
      await expect(dialog).toHaveCount(0);

      // 沖銷:Trades 可沖銷列「沖銷這筆」→ reversal 模式(原紀錄摘要卡 + 預覽;無模式切換)
      await page.getByTestId('nav-trades').click();
      await expect(page.getByTestId('trades-ccy-tag').first()).toBeVisible();
      await page.getByTestId('trades-reverse').first().click();
      await expect(page.getByTestId('holding-event-reversal-original')).toBeVisible();
      await expect(page.getByTestId('holding-event-mode-cash-dividend')).toHaveCount(0);
      await expectHoldingEventDialogLayout(page, width, '沖銷', false);
      const panel = await boxOf(page, 'holding-event-dialog');
      expectInside(await boxOf(page, 'holding-event-reversal-original'), panel, '原紀錄摘要卡', '面板');
      expectInside(await boxOf(page, 'holding-event-reversal-preview'), panel, '沖銷預覽', '面板');
    });
  }
}

/**
 * L14:Trades 混合活動表(買 / 賣 / 股利含預扣稅 / 配股 / 拆股 / 合股 / 沖銷列 / 已沖銷列 / 500 字備註)——
 * 表格在卡內捲動不帶動頁面;L9 相鄰格可見內容間距 >= 6px 延伸到新列型;kind / 已沖銷 pill 單行(en `Reverse split`)。
 */
for (const width of [320, 375]) {
  for (const lang of LANGS) {
    test(`L14 ${width}px ${lang}:Trades 混合活動表在卡內捲動、相鄰格間距 >= ${MIN_CELL_GAP}px、pill 單行 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useLang(page, lang);
      await mockPortfolioApi(page);
      await openPage(page, 'trades');
      await expect(page.getByTestId('trades-ccy-tag').first()).toBeVisible();

      const kinds = await page.getByTestId('trades-row').evaluateAll((rows) => [...new Set(rows.map((row) => row.getAttribute('data-kind')))].sort());
      expect(kinds).toEqual(['BUY', 'CASH_DIVIDEND', 'SELL', 'SPLIT', 'STOCK_DIVIDEND']);
      await expect(page.getByTestId('trades-tax-line').first()).toBeVisible();
      await expect(page.getByTestId('trades-ratio-line')).toHaveCount(2);
      await expect(page.getByTestId('trades-reversal-of')).toHaveCount(2);
      await expect(page.getByTestId('trades-reversed-pill')).toHaveCount(2);
      if (lang === 'en') await expect(page.getByTestId('trades-kind-pill').filter({ hasText: 'Reverse split' })).toHaveCount(1);

      await expectNoHorizontalScroll(page);
      await expectTableScrollsInsideCard(page, 'trades-table');

      const m = await measureCellGaps(page, 'trades-table');
      expect(m.rows).toBe(12);
      expect(m.pairs.length, '沒有量到任何相鄰儲存格').toBeGreaterThan(0);
      const tight = m.pairs.filter((p) => p.gap < MIN_CELL_GAP);
      expect(
        tight,
        `${tight.length} 組相鄰儲存格間距 < ${MIN_CELL_GAP}px:`
          + tight.slice(0, 6).map((p) => `[列${p.row} 欄${p.col}->${p.col + 1}] "${p.left}" | "${p.right}" 間距 ${p.gap.toFixed(1)}px`).join('; '),
      ).toEqual([]);

      for (const id of ['trades-kind-pill', 'trades-reversed-pill']) {
        const count = await page.getByTestId(id).count();
        for (let i = 0; i < count; i += 1) {
          expect(await lineCountOf(page, id, i), `${id}[${i}] 應為單行`).toBe(1);
        }
      }
    });
  }
}

/**
 * L15:Positions 動作欄 —— 320 / 375 表格在卡內捲動、捲到最右後每列動作鈕完整可達,不帶動頁面;
 * 1280 / 1440 動作鈕右緣在持倉卡可視框內、卡片 scrollWidth <= clientWidth(不需卡內水平捲動)。
 */
for (const width of [320, 375, 1280, 1440]) {
  for (const lang of LANGS) {
    test(`L15 ${width}px ${lang}:Positions 動作欄${width < 640 ? '卡內捲動可達' : '不需卡內捲動即完整可見'} @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useLang(page, lang);
      await mockPortfolioApi(page);
      await openPage(page, 'positions');
      await expect(page.getByTestId('positions-day-pnl').first()).toBeVisible();
      await expect(page.getByTestId('positions-holding-event')).toHaveCount(6);

      await expectNoHorizontalScroll(page);
      if (width < 640) await expectTableScrollsInsideCard(page, 'positions-table');

      const m = await page.getByTestId('positions-table').evaluate((card, narrow) => {
        if (narrow) card.scrollLeft = card.scrollWidth;
        const box = card.getBoundingClientRect();
        const border = parseFloat(getComputedStyle(card).borderLeftWidth);
        const visibleLeft = box.left + border;
        const visibleRight = visibleLeft + card.clientWidth;
        const buttons = Array.from(card.querySelectorAll('[data-testid="positions-holding-event"]')).map((b) => {
          const r = b.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, lines: new Set(Array.from(b.getClientRects()).map((x) => Math.round(x.top))).size };
        });
        return { scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, visibleLeft, visibleRight, innerWidth: window.innerWidth, buttons };
      }, width < 640);

      if (width >= 1280) {
        expect(m.scrollWidth, `${width}px 持倉卡需要水平捲動(內容寬 ${m.scrollWidth}px > 可視寬 ${m.clientWidth}px)`).toBeLessThanOrEqual(m.clientWidth);
      }
      m.buttons.forEach((b, i) => {
        const where = `第 ${i + 1} 列動作鈕`;
        expect(b.width, `${where} 沒有版面`).toBeGreaterThan(0);
        expect(b.left, `${where} 左緣 ${b.left}px 在卡片可視框外(${m.visibleLeft}px)`).toBeGreaterThanOrEqual(m.visibleLeft - 0.5);
        expect(b.right, `${where} 右緣 ${b.right}px 在卡片可視框外(${m.visibleRight}px)`).toBeLessThanOrEqual(m.visibleRight + 0.5);
        expect(b.right, `${where} 右緣超出視窗`).toBeLessThanOrEqual(m.innerWidth + 0.5);
      });
      await expectNoHorizontalScroll(page);
    });
  }
}

/**
 * L16:Overview(觀察清單卡含即時狀態 + 新聞卡 MockDataNotice)與現金頁(股利說明列)—— 整頁與 main 不水平捲動。
 * WS 以 routeWebSocket 送 WELCOME + TICK(live):另量 6px 即時圓點(狀態列 pulse 與列上的 ●)與狀態列在標題列下 4px。
 */
for (const width of [320, 375, 768, 1280, 1440]) {
  for (const lang of LANGS) {
    test(`L16 ${width}px ${lang}:Overview 觀察清單卡(即時)/ 新聞卡示範標示與現金頁股利說明列不造成水平捲動 @smoke`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await useLang(page, lang);
      await mockPortfolioApi(page, { ws: 'live' });
      await page.goto('/');
      await expect(page.getByTestId('overview-kpi')).toHaveCount(4);

      const card = page.getByTestId('overview-watchlist');
      await expect(card.getByTestId('overview-watchlist-row')).toHaveCount(6);
      await expect(page.getByTestId('overview-watchlist-more')).toBeVisible();
      await expect(card.locator('[data-testid="live-quote-status"][data-live-status="live"]')).toBeVisible();
      await expect(card.locator('[data-testid="overview-watchlist-row"][data-symbol="AAPL"]')).toHaveAttribute('data-quote-source', 'ws');
      // FX / 債券列永遠不是 ws(不訂閱)
      await expect(card.locator('[data-testid="overview-watchlist-row"][data-symbol="USD/TWD"]')).not.toHaveAttribute('data-quote-source', 'ws');
      await expect(page.getByTestId('overview-kpi-dividend-income')).toBeVisible();
      const news = page.getByTestId('overview-news');
      await expect(news.getByTestId('mock-data-notice')).toBeVisible();

      const clientWidth = await expectNoHorizontalScroll(page);
      for (const id of ['overview-watchlist', 'overview-news', 'overview-kpi-dividend-income', 'overview-watchlist-more']) {
        expectInsideViewport(await boxOf(page, id), clientWidth, id);
      }
      expectInside(await boxOf(page, 'mock-data-notice'), await boxOf(page, 'overview-news'), '示範資料標示', '新聞卡');

      const live = await card.evaluate((el) => {
        const status = el.querySelector('[data-testid="live-quote-status"]') as HTMLElement;
        const titleRow = status.previousElementSibling as HTMLElement;
        const statusDot = status.querySelector('[aria-hidden="true"]') as HTMLElement;
        const label = statusDot.nextElementSibling as HTMLElement;
        const rowDot = el.querySelector('[data-testid="overview-watchlist-row-live"] > [aria-hidden="true"]') as HTMLElement;
        const center = (r: DOMRect) => r.top + r.height / 2;
        const dotBox = statusDot.getBoundingClientRect();
        const rowDotBox = rowDot.getBoundingClientRect();
        const cardBox = el.getBoundingClientRect();
        return {
          gap: status.getBoundingClientRect().top - titleRow.getBoundingClientRect().bottom,
          dot: { width: dotBox.width, height: dotBox.height, animation: getComputedStyle(statusDot).animationName },
          dotOffset: Math.abs(center(dotBox) - center(label.getBoundingClientRect())),
          rowDot: { width: rowDotBox.width, height: rowDotBox.height, left: rowDotBox.left, right: rowDotBox.right },
          statusRight: status.getBoundingClientRect().right,
          cardRight: cardBox.right,
        };
      });
      expect(Math.abs(live.gap - 4), `狀態列與標題列間距 ${live.gap}px,應為 4px(margin-top: 4px)`).toBeLessThanOrEqual(0.5);
      expect(live.dot.width).toBeCloseTo(6, 0);
      expect(live.dot.height).toBeCloseTo(6, 0);
      expect(live.dot.animation, '狀態列 live 圓點應有 pulse 動畫(非 reduced-motion)').toMatch(/^livePulse/);
      expect(live.dotOffset, `圓點與「即時報價」文字垂直未對齊(中心差 ${live.dotOffset}px)`).toBeLessThanOrEqual(2);
      expect(live.rowDot.width).toBeCloseTo(6, 0);
      expect(live.rowDot.height).toBeCloseTo(6, 0);
      expect(live.rowDot.right, '列上的即時圓點超出卡片').toBeLessThanOrEqual(live.cardRight);
      expect(live.statusRight, '狀態列超出卡片').toBeLessThanOrEqual(live.cardRight + 0.5);

      // 現金頁:股利說明 + 連結(窄寬時連結換到下一行靠左)
      await page.getByTestId('nav-cash').click();
      await expect(page.getByTestId('cash-page-dividend-note')).toBeVisible();
      await expectNoHorizontalScroll(page);
      const note = await boxOf(page, 'cash-page-dividend-note');
      const link = await boxOf(page, 'cash-page-dividend-link');
      expectInsideViewport(note, clientWidth, '股利說明');
      expectInsideViewport(link, clientWidth, '股利說明連結');
      expect(link.height, '連結觸控目標至少 36px').toBeGreaterThanOrEqual(35.5);
      const noteText = await page.getByTestId('cash-page-dividend-note').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(noteText.scrollWidth, '股利說明文字溢出').toBeLessThanOrEqual(noteText.clientWidth);
      if (width >= 768) await expect(page.getByTestId('cash-entries-row')).toHaveCount(10);
    });
  }
}
