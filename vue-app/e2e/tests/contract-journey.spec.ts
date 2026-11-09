import { test, expect, loginViaUi } from '../support/fixtures';
import type { Page, Request } from '@playwright/test';

/**
 * 旅程 J:契約全程 journey(Phase 5 SC3 / SC4,D-10 ~ D-12)。
 *
 * 一條真後端、真瀏覽器的單一串連流程:登入 → /me → portfolio reads → 手動交易 → 三頁重讀 → 登出,
 * 並把 SC4 的 cookie / CSRF / credentials / 登出 401 斷言嵌在同一條流程裡。
 *
 * 分工:`auth.spec.ts`(A1–A11)與 `trade.spec.ts`(T1–T3)繼續負責邊界情境(錯密碼、鎖定、refresh 撤銷、
 * 超賣、網路中斷重送);本檔只證明「整條鏈在同一個 session 內一次走通」且全程符合瀏覽器 auth 契約
 * (後端 `ai-docs/browser-auth-contract.md`)。
 *
 * **不攔截、不 stub 任何請求**:SC3 / SC4 的證據必須來自真後端(run-e2e 啟動的 e2e-browser profile,
 * 經 vite preview 4173 同源代理)。selector 一律 data-testid。
 */

type Phase = 'anon' | 'authed' | 'loggedOut';

interface RequestRecord {
  method: string;
  url: string;
  /**
   * `request.headers()` 不含 cookie;`allHeaders()` 才含(playwright-core types.d.ts:20268-20270)。
   * 取不到時為 null(先 catch 住,避免未處理的 rejection),彙總斷言會把它列為違規。
   */
  headers: Promise<Record<string, string> | null>;
  body: string | null;
  phase: Phase;
}

interface ResolvedRecord extends Omit<RequestRecord, 'headers'> {
  headers: Record<string, string> | null;
}

/** 不需要 auth cookie 的公開端點;初始未登入的 `GET /api/v1/me`(401)屬 anon 階段,不在 (a) 的檢查範圍 */
const PUBLIC_PATHS = new Set(['/api/v1/csrf', '/api/v1/auth/login', '/api/v1/auth/register']);
const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const ACCESS_COOKIE = 'stock_access';
const REFRESH_COOKIE = 'stock_refresh';
const CSRF_COOKIE = 'XSRF-TOKEN';

/** 解析 `Cookie` request header 為 name → value;值原樣保留(XSRF-TOKEN 是 base64url,無需解碼) */
function parseCookieHeader(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    cookies.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return cookies;
}

/** 組出 `Cookie` header(仿 auth.spec.ts A11 的 out-of-band 寫法) */
function cookieHeaderOf(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * D-12 彙總斷言:回傳違規清單(每條含 `METHOD URL`),空陣列代表整條 journey 符合契約。
 *
 * (a) authed 階段的非公開端點都帶 `stock_access` cookie(credentials: 'include' 生效);
 * (b) 每個 unsafe 請求(含 login / logout)的 `x-xsrf-token` 存在且等於**同一請求** cookie header 中的
 *     `XSRF-TOKEN` —— 後端每次 `GET /csrf` 都換新亂數(`BrowserAuthCookieService.addCsrfCookie`),
 *     不能拿事後的 `context.cookies()` 比;
 * (c) 沒有任何請求帶 `Authorization: Bearer`,且 token 值不出現在 URL 或 body。
 */
function assertContract(records: ResolvedRecord[], secrets: string[]): string[] {
  const violations: string[] = [];
  for (const r of records) {
    const label = `${r.method} ${r.url}`;
    if (r.headers === null) {
      violations.push(`無法取得 request headers,契約無從驗證:${label}`);
      continue;
    }
    const pathname = new URL(r.url).pathname;
    const cookies = parseCookieHeader(r.headers['cookie'] ?? '');

    if (r.phase === 'authed' && !PUBLIC_PATHS.has(pathname) && !cookies.get(ACCESS_COOKIE)) {
      violations.push(`(a) 缺少 ${ACCESS_COOKIE} cookie:${label}`);
    }

    if (UNSAFE_METHODS.has(r.method)) {
      const headerToken = r.headers['x-xsrf-token'];
      const cookieToken = cookies.get(CSRF_COOKIE);
      if (!headerToken) {
        violations.push(`(b) 缺少 x-xsrf-token:${label}`);
      } else if (headerToken !== cookieToken) {
        violations.push(`(b) x-xsrf-token 與同請求 ${CSRF_COOKIE} cookie 不符:${label}`);
      }
    }

    if (/^bearer\b/i.test(r.headers['authorization'] ?? '')) {
      violations.push(`(c) 帶 Authorization: Bearer:${label}`);
    }
    for (const secret of secrets) {
      if (r.url.includes(secret)) violations.push(`(c) token 出現在 URL:${label}`);
      if (r.body?.includes(secret)) violations.push(`(c) token 出現在 body:${label}`);
    }
  }
  return violations;
}

/** 讀出 localStorage / sessionStorage 的所有值(token 不得落在 JS 可讀儲存,前端鐵律 2) */
async function webStorageValues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const values: string[] = [];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key !== null) values.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
    }
    return values;
  });
}

function isApiCall(req: Request, method: string, pathname: string): boolean {
  return req.method() === method && new URL(req.url()).pathname === pathname;
}

// ---- OrderTicket helper:複製自 trade.spec.ts(本檔私有,不改 trade.spec.ts) ----

async function openTicketFromTrades(page: Page) {
  await page.getByTestId('nav-trades').click();
  await page.getByTestId('trades-add-trade').click();
  await expect(page.getByTestId('ticket-symbol-input')).toBeFocused();
}

async function pickSymbol(page: Page, query: string, symbol: string) {
  await page.getByTestId('ticket-symbol-input').pressSequentially(query);
  // 開 ticket 時的空查詢列表本來就含目標標的;要等 debounce 後的查詢結果把它排到第一列,ArrowDown 才會選中它
  await expect(page.getByRole('option').first()).toHaveAttribute(
    'data-testid',
    `ticket-symbol-option-${symbol}`,
  );
  await page.getByTestId('ticket-symbol-input').press('ArrowDown');
  await page.getByTestId('ticket-symbol-input').press('Enter');
  await expect(page.getByTestId('ticket-symbol-input')).toHaveValue(symbol);
}

/** 審閱 → 送出;回傳 UI 實際送出的 `POST /api/v1/trades`(先掛 waitForRequest 再點送出,不會漏抓) */
async function submitTrade(page: Page): Promise<Request> {
  await page.getByTestId('ticket-review-advance').click();
  const tradeRequest = page.waitForRequest((req) => isApiCall(req, 'POST', '/api/v1/trades'));
  await page.getByTestId('ticket-submit').click();
  return tradeRequest;
}

/** 以 page.request 重讀後端 summary 的 holdingCount(與瀏覽器共用 cookie jar;不觸發 page.on('request')) */
async function holdingCount(page: Page): Promise<number> {
  const res = await page.request.get('/api/v1/portfolio/summary');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.data.holdingCount as number;
}

/** 以 page.request 重讀後端 holdings,回傳指定標的的持股數(沒有該標的時 undefined) */
async function holdingQuantity(page: Page, symbol: string): Promise<number | undefined> {
  const res = await page.request.get('/api/v1/portfolio/holdings');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const holding = (body.data as Array<{ symbol: string; totalQuantity: unknown }>).find(
    (h) => h.symbol === symbol,
  );
  return holding === undefined ? undefined : Number(holding.totalQuantity);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('J0 登入 → /me → 讀持倉 → 記錄手動交易 → 三頁重讀 → 登出(契約全程) @smoke', async ({
  page,
  context,
  playwright,
  uniqueAccount,
  baseURL,
}) => {
  const records: RequestRecord[] = [];
  let phase: Phase = 'anon';

  page.on('request', (req) => {
    if (!new URL(req.url()).pathname.startsWith('/api/v1/')) return;
    records.push({
      method: req.method(),
      url: req.url(),
      headers: req.allHeaders().catch(() => null),
      body: req.postData(),
      phase,
    });
  });
  // phase 在 response 事件當下切換(而不是等 click / waitForResponse 的 await 鏈回來),
  // 讓「登入回應之後才發出的請求」一律歸 authed、「登出回應之後才發出的請求」一律歸 loggedOut。
  page.on('response', (res) => {
    if (res.status() !== 200) return;
    if (isApiCall(res.request(), 'POST', '/api/v1/auth/login')) phase = 'authed';
    if (isApiCall(res.request(), 'POST', '/api/v1/auth/logout')) phase = 'loggedOut';
  });

  let secrets: string[] = [];

  await test.step('登入', async () => {
    await page.goto('/');
    const loginResponse = page.waitForResponse((res) =>
      isApiCall(res.request(), 'POST', '/api/v1/auth/login'),
    );
    await loginViaUi(page, uniqueAccount);
    expect((await loginResponse).status()).toBe(200);
    await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);
    expect(phase).toBe('authed');
  });

  await test.step('auth cookie 為 httpOnly 且 JS 讀不到', async () => {
    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === ACCESS_COOKIE);
    const refresh = cookies.find((c) => c.name === REFRESH_COOKIE);
    expect(access, `${ACCESS_COOKIE} cookie 應存在`).toBeDefined();
    expect(refresh, `${REFRESH_COOKIE} cookie 應存在`).toBeDefined();
    for (const cookie of [access!, refresh!]) {
      expect(cookie.httpOnly, `${cookie.name}.httpOnly`).toBe(true);
      expect(cookie.sameSite, `${cookie.name}.sameSite`).toBe('Lax');
      expect(cookie.path, `${cookie.name}.path`).toBe('/');
      // e2e-browser 是 http localhost:secure 預期 false,不斷言為 true
    }
    const xsrf = cookies.find((c) => c.name === CSRF_COOKIE);
    if (xsrf) {
      // double-submit 需要 JS 讀得到 XSRF-TOKEN
      expect(xsrf.httpOnly, `${CSRF_COOKIE}.httpOnly`).toBe(false);
    }

    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain(ACCESS_COOKIE);
    expect(documentCookie).not.toContain(REFRESH_COOKIE);

    secrets = [access!.value, refresh!.value].filter((v) => v.length > 0);
    const storage = await webStorageValues(page);
    for (const secret of secrets) {
      expect(
        storage.filter((v) => v.includes(secret)),
        'token 不得出現在 localStorage / sessionStorage',
      ).toEqual([]);
    }
  });

  await test.step('/me 回傳目前使用者', async () => {
    const res = await page.request.get('/api/v1/me');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(uniqueAccount.email);
  });

  // portfolio reads = Overview + Positions + Trades(D-13);Cash 已由 cash-journey.spec.ts 覆蓋,不重複
  await test.step('交易前讀 Overview 與 Positions', async () => {
    await expect(page.getByTestId('overview-kpi').first()).toBeVisible();
    expect(await holdingCount(page)).toBe(0);

    const holdingsResponse = page.waitForResponse((res) =>
      isApiCall(res.request(), 'GET', '/api/v1/portfolio/holdings'),
    );
    await page.getByTestId('nav-positions').click();
    expect((await holdingsResponse).status()).toBe(200);
    const table = page.getByTestId('positions-table');
    await expect(table.getByTestId('positions-holdings-empty')).toBeVisible();
    await expect(table.getByTestId('positions-row').filter({ hasText: 'AAPL' })).toHaveCount(0);
  });

  await test.step('以 OrderTicket 記錄手動交易(已成交紀錄,不是委託單)', async () => {
    // POST /api/v1/trades 是已成交的手動紀錄(前端鐵律 5):只斷言「已記錄」的結果畫面,不談委託流程
    await openTicketFromTrades(page);
    await pickSymbol(page, 'AAP', 'AAPL');
    await page.getByTestId('ticket-qty').fill('3');
    const tradeRequest = await submitTrade(page);

    // VER-03 idempotency:UI 送出的請求恰帶一個非空 Idempotency-Key
    const idempotencyKeys = (await tradeRequest.headersArray())
      .filter((h) => h.name.toLowerCase() === 'idempotency-key')
      .map((h) => h.value);
    expect(idempotencyKeys, 'POST /api/v1/trades 應恰帶一個 idempotency-key').toHaveLength(1);
    expect(idempotencyKeys[0]?.trim() ?? '').not.toBe('');

    // D-11:X-XSRF-TOKEN 等於同一請求 cookie 中的 XSRF-TOKEN
    const headers = await tradeRequest.allHeaders();
    expect(headers['idempotency-key']).toBe(idempotencyKeys[0]);
    expect(headers['x-xsrf-token'], 'POST /api/v1/trades 應帶 x-xsrf-token').toBeTruthy();
    expect(headers['x-xsrf-token']).toBe(
      parseCookieHeader(headers['cookie'] ?? '').get(CSRF_COOKIE),
    );
    expect(parseCookieHeader(headers['cookie'] ?? '').get(ACCESS_COOKIE)).toBeTruthy();

    const tradeResponse = await tradeRequest.response();
    expect(tradeResponse?.ok(), 'POST /api/v1/trades 應成功').toBe(true);

    const tradeId = page.getByTestId('ticket-result-trade-id');
    await expect(tradeId).toBeVisible();
    // 交易編號是完整 UUID,前端不得截斷
    await expect(tradeId).toHaveText(UUID_PATTERN);
    await expect(page.getByTestId('ticket-result-qty')).toHaveText('3');
  });

  await test.step('交易後三頁重讀到新值', async () => {
    // Trades:停在 Trades 頁關閉 ticket,新成交列帶「新」標記且排在第一列
    await page.getByTestId('ticket-close').click();
    await expect(page.getByTestId('trades-fresh-badge')).toBeVisible();
    await expect(page.getByTestId('trades-row').first()).toContainText('AAPL');

    // Positions:重新掛載時讀 holdings,AAPL 列數量為 3
    const holdingsResponse = page.waitForResponse((res) =>
      isApiCall(res.request(), 'GET', '/api/v1/portfolio/holdings'),
    );
    await page.getByTestId('nav-positions').click();
    expect((await holdingsResponse).status()).toBe(200);
    const row = page
      .getByTestId('positions-table')
      .getByTestId('positions-row')
      .filter({ hasText: 'AAPL' });
    await expect(row).toHaveCount(1);
    // innerText 以 tab 分隔儲存格:數量格是獨立的「3」(容忍 NBSP / 小數補零),不會誤配到價格或金額
    await expect(row).toHaveText(/\s3(?:\.0+)?\s/, { useInnerText: true });
    expect(await holdingQuantity(page, 'AAPL')).toBe(3);

    // Overview:重新掛載時讀 summary,瀏覽器拿到的 holdingCount 由 0 變 1,近期交易含 AAPL
    const summaryResponse = page.waitForResponse((res) =>
      isApiCall(res.request(), 'GET', '/api/v1/portfolio/summary'),
    );
    await page.getByTestId('nav-overview').click();
    const summary = await summaryResponse;
    expect(summary.status()).toBe(200);
    expect((await summary.json()).data.holdingCount).toBe(1);
    await expect(page.getByTestId('overview-kpi').first()).toBeVisible();
    await expect(page.getByTestId('overview-recent-trades')).toContainText('AAPL');
    expect(await holdingCount(page)).toBe(1);
  });

  await test.step('登出後 /me 401(cookie jar 與舊 cookie 兩種)', async () => {
    // 登出前擷取舊 cookie:之後從 out-of-band context 重放,證明伺服器端撤銷(tokenVersion),不只是 cookie 被清
    const staleCookieHeader = cookieHeaderOf(await context.cookies());

    const logoutResponse = page.waitForResponse((res) =>
      isApiCall(res.request(), 'POST', '/api/v1/auth/logout'),
    );
    await page.getByTestId('header-logout').click();
    expect((await logoutResponse).status()).toBe(200);
    expect(phase).toBe('loggedOut');
    await expect(page.getByTestId('header-session-identity')).toBeHidden();

    const assertUnauthorizedEnvelope = async (res: {
      status(): number;
      json(): Promise<unknown>;
    }) => {
      expect(res.status()).toBe(401);
      const body = (await res.json()) as {
        success: unknown;
        error?: { code?: unknown };
        meta?: { traceId?: unknown };
      };
      expect(body.success).toBe(false);
      expect(typeof body.error?.code).toBe('string');
      expect(typeof body.meta?.traceId).toBe('string');
    };

    await assertUnauthorizedEnvelope(await page.request.get('/api/v1/me'));

    const outOfBand = await playwright.request.newContext({
      baseURL: baseURL ?? 'http://localhost:4173',
    });
    try {
      await assertUnauthorizedEnvelope(
        await outOfBand.get('/api/v1/me', { headers: { Cookie: staleCookieHeader } }),
      );
    } finally {
      await outOfBand.dispose();
    }
  });

  await test.step('全程 /api/v1 請求符合瀏覽器 auth 契約(D-12)', async () => {
    const resolved: ResolvedRecord[] = await Promise.all(
      records.map(async (r) => ({ ...r, headers: await r.headers })),
    );
    expect(
      resolved.some((r) => r.phase === 'authed'),
      '應至少收集到一個 authed 階段的請求',
    ).toBe(true);
    const violations = assertContract(resolved, secrets);
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
