import { test, expect, type Page } from '@playwright/test';
import { LONG_NOTE, LONG_TRACE_ID, expectNoHorizontalScroll, mockPortfolioApi } from '../support/portfolioStubs';

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

      const m = await page.evaluate(({ host }) => {
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
      }, { host: spec.host });

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
