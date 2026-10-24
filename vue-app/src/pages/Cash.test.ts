import { afterEach, describe, expect, it, vi } from 'vitest';
import Cash from './Cash.vue';
import App from '../App.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 Trades.test.ts 的手法)。
import cashSource from './Cash.vue?raw';
import { t } from '../i18n';
import { fmtMoney } from '../moneyFormat';
import { resetMockCashLedgerForTests, type CashEntryDto } from '../services/cashApi';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { resetPortfolioRevisionForTests } from '../services/portfolioRevision';
import type { PaginatedResponse } from '../services/apiTypes';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';

// Phase 04.1 Plan 17(04.1-17-PLAN.md)。現金頁:入出金紀錄分頁列表 + 一鍵沖銷 + 頁首餘額列。
// API mode 一律 stub `fetch`,讓請求走真的 cashApi / portfolioApi → apiClient;
// mock mode 的零網路由 fetch spy 證明(T-04.1-53)。

afterEach(() => {
  cleanupMounted();
  resetPortfolioRevisionForTests();
  resetMockCashLedgerForTests();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

// =============== fixtures ===============

/** 刻意取不像 id 的字串,讓「原始 id 不得進 DOM」的斷言有判別力(T-04.1-52)。 */
const ORIGINAL_ID = 'orig-withdrawal-id-7f3a';

function entry(over: Partial<CashEntryDto> & { id: string }): CashEntryDto {
  return {
    type: 'DEPOSIT',
    currency: 'TWD',
    amount: 50000,
    note: null,
    occurredAt: '2026-10-20T09:30:00+08:00',
    createdAt: '2026-10-20T09:30:05+08:00',
    reversalOfId: null,
    reversalOfOccurredAt: null,
    reversed: false,
    ...over,
  };
}

/** 一般入金、(已被沖銷的)出金、其沖銷入金 —— 後端以 occurredAt DESC 回傳。 */
const PLAIN_DEPOSIT = entry({ id: 'cash-plain-1', note: 'salary' });
const REVERSAL_ENTRY = entry({
  id: 'cash-reversal-1',
  type: 'DEPOSIT',
  currency: 'USD',
  amount: 1000,
  occurredAt: '2026-10-19T11:00:00+08:00',
  reversalOfId: ORIGINAL_ID,
  reversalOfOccurredAt: '2026-10-18T10:00:00+08:00',
});
const REVERSED_WITHDRAWAL = entry({
  id: ORIGINAL_ID,
  type: 'WITHDRAWAL',
  currency: 'USD',
  amount: 1000,
  occurredAt: '2026-10-18T10:00:00+08:00',
  reversed: true,
});
const THREE_ENTRIES = [PLAIN_DEPOSIT, REVERSAL_ENTRY, REVERSED_WITHDRAWAL];

function page(items: CashEntryDto[], over: Partial<PaginatedResponse<CashEntryDto>> = {}): PaginatedResponse<CashEntryDto> {
  return {
    items,
    page: 0,
    size: 10,
    totalElements: items.length,
    totalPages: items.length ? 1 : 0,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function success(data: unknown): Response {
  return jsonResponse({ success: true, data, error: null, meta: { traceId: 'trace-ok' } });
}

function failure(code: string, traceId: string, status = 503): Response {
  return jsonResponse({
    success: false,
    data: null,
    error: { code, message: 'BackendMessageMustNotReachTheDom' },
    meta: { traceId },
  }, status);
}

interface CashRoutes {
  entries?: (url: string, init: RequestInit | undefined) => Response | Promise<Response>;
}

/** 只路由現金頁會碰到的端點;其他一律丟錯,讓「頁面偷打了別的 API」立刻可見。 */
function cashFetch(routes: CashRoutes = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/portfolio/cash-entries')) {
      return routes.entries ? routes.entries(url, init) : success(page(THREE_ENTRIES));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

type CashFetch = ReturnType<typeof cashFetch>;

async function mountApiCash(fetchImpl: CashFetch = cashFetch(), props: Record<string, unknown> = {}) {
  document.cookie = 'XSRF-TOKEN=csrf-cash; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchImpl);
  mountWithPinia(Cash, { lang: 'zh', ...props });
  await flushAsync();
  return fetchImpl;
}

async function mountMockCash(props: Record<string, unknown> = {}) {
  vi.stubEnv('VITE_DATA_MODE', 'mock');
  resetRuntimeApiClientsForTests();
  resetMockCashLedgerForTests();
  const fetchSpy = vi.fn(async () => {
    throw new Error('mock mode must not touch the network');
  });
  vi.stubGlobal('fetch', fetchSpy);
  mountWithPinia(Cash, { lang: 'zh', ...props });
  await flushAsync();
  return fetchSpy;
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).toBeTruthy();
  return el!;
}

function rows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[data-testid="cash-entries-row"]')];
}

function urls(fetchImpl: CashFetch | ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls.map(call => String(call[0]));
}

function entryUrls(fetchImpl: CashFetch): string[] {
  return urls(fetchImpl).filter(url => url.includes('/portfolio/cash-entries'));
}

/** 與元件各自獨立實作的本機 `YYYY-MM-DD`(測試不得借用元件的格式化函式)。 */
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =============== Task 1(tracer):導覽 → /cash → 第一頁列表 ===============

describe('Cash page — list rendering (API mode)', () => {
  it('requests the first page of cash entries with size 10 and titles the page 現金', async () => {
    const fetchImpl = await mountApiCash();

    expect(entryUrls(fetchImpl)).toEqual(['/api/v1/portfolio/cash-entries?page=0&size=10']);
    expect(requireTestid('cash-page')).toBeTruthy();
    expect(requireTestid('cash-page-title').textContent?.trim()).toBe('現金');
  });

  it('renders one row per entry with date, type pill, signed amount with currency code', async () => {
    await mountApiCash();

    expect(rows()).toHaveLength(3);

    const deposit = rows()[0]!;
    expect(deposit.textContent).toContain(localDateTime(PLAIN_DEPOSIT.occurredAt));
    expect(deposit.textContent).toContain(t('zh', 'cashTypeDeposit'));
    expect(deposit.textContent).toContain(`+${fmtMoney(50000, 'TWD', 2)}`);
    expect(deposit.textContent).toContain('+50,000.00 TWD');
    expect(deposit.textContent).toContain('salary');

    const withdrawal = rows()[2]!;
    expect(withdrawal.textContent).toContain(t('zh', 'cashTypeWithdrawal'));
    expect(withdrawal.textContent).toContain('-1,000.00 USD');
  });

  it('marks the reversed original with a 已沖銷 pill and a struck-through amount, and offers no reverse button', async () => {
    await mountApiCash();

    const withdrawal = rows()[2]!;
    const pill = withdrawal.querySelector('[data-testid="cash-entries-reversed-pill"]');
    expect(pill?.textContent?.trim()).toBe('已沖銷');
    // 刪除線由 .is-reversed 提供(jsdom 不算 scoped CSS,故以 class 為接點,CSS 由原始碼斷言鎖住)。
    expect(withdrawal.querySelector('.amount')?.classList.contains('is-reversed')).toBe(true);
    expect(withdrawal.querySelector('[data-testid^="cash-entries-reverse-"]')).toBeNull();
    expect(cashSource).toMatch(/\.is-reversed\s*\{[^}]*line-through/);
  });

  it('shows 沖銷 {date} 的紀錄 on the reversal row and offers no reverse button there', async () => {
    await mountApiCash();

    const reversal = rows()[1]!;
    const hint = reversal.querySelector('[data-testid="cash-entries-reversal-of"]');
    expect(hint?.textContent).toContain(localDate(REVERSAL_ENTRY.reversalOfOccurredAt!));
    expect(hint?.textContent).toContain('沖銷');
    expect(reversal.querySelector('[data-testid="cash-entries-reversed-pill"]')).toBeNull();
    expect(reversal.querySelector('[data-testid^="cash-entries-reverse-"]')).toBeNull();
    expect(reversal.querySelector('.amount')?.classList.contains('is-reversed')).toBe(false);
  });

  it('never puts the raw reversalOfId into the DOM (T-04.1-52)', async () => {
    await mountApiCash();

    expect(document.body.innerHTML).not.toContain(ORIGINAL_ID);
  });

  it('offers 沖銷這筆 only on rows that are neither reversed nor reversals, with a distinguishing aria-label', async () => {
    await mountApiCash();

    const buttons = document.body.querySelectorAll('[data-testid^="cash-entries-reverse-"]');
    // `cash-entries-reversed-pill` / `cash-entries-reversal-of` 也以 cash-entries-reverse 開頭,故精確比對 id。
    const reverseButtons = [...buttons].filter(el => el.tagName === 'BUTTON');
    expect(reverseButtons).toHaveLength(1);

    const button = requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`);
    expect(button.textContent?.trim()).toBe('沖銷這筆');
    const label = button.getAttribute('aria-label') ?? '';
    expect(label).toContain(localDate(PLAIN_DEPOSIT.occurredAt));
    expect(label).toContain(t('zh', 'cashTypeDeposit'));
    expect(label).toContain('+50,000.00');
    expect(label).toContain('TWD');
  });

  it('renders the note as escaped text with a title for the full text, and — when empty', async () => {
    const hostile = entry({ id: 'cash-note-1', note: '<b>bold</b> & more' });
    const blank = entry({ id: 'cash-note-2', note: null });
    await mountApiCash(cashFetch({ entries: () => success(page([hostile, blank])) }));

    const first = rows()[0]!;
    expect(first.querySelector('b')).toBeNull();
    expect(first.textContent).toContain('<b>bold</b> & more');
    const titled = [...first.querySelectorAll('[title]')].map(el => el.getAttribute('title'));
    expect(titled).toContain('<b>bold</b> & more');
    expect(rows()[1]!.textContent).toContain('—');
  });
});

describe('Cash page — mock mode', () => {
  it('opens with the four seeded entries, makes zero network calls and renders no balances row', async () => {
    const fetchSpy = await mountMockCash();

    expect(rows()).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(testid('cash-page-balances')).toBeNull();
    expect(testid('cash-page-balances-loading')).toBeNull();
    expect(testid('cash-page-balances-error')).toBeNull();
    // 種子含一組已沖銷 + 沖銷指回。
    expect(document.body.querySelectorAll('[data-testid="cash-entries-reversed-pill"]')).toHaveLength(1);
    expect(document.body.querySelectorAll('[data-testid="cash-entries-reversal-of"]')).toHaveLength(1);
  });

  it('does not import the mock store or call fetch directly (iron rules 1 and 3)', () => {
    expect(cashSource).not.toMatch(/\bfetch\(/);
    expect(cashSource).not.toMatch(/stores\/mock/);
  });
});

describe('Cash navigation', () => {
  it('registers nav-cash right after nav-trades and switches to the cash page on click', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    resetMockCashLedgerForTests();
    mountWithPinia(App);
    await flushAsync();

    const trades = requireTestid('nav-trades');
    const cash = requireTestid('nav-cash');
    expect(trades.compareDocumentPosition(cash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 緊接:兩者之間沒有別的導覽項。
    const navKeys = [...document.body.querySelectorAll('[data-testid^="nav-"]')].map(el => el.getAttribute('data-testid'));
    const at = navKeys.indexOf('nav-trades');
    expect(navKeys[at + 1]).toBe('nav-cash');

    expect(testid('cash-page')).toBeNull();
    cash.click();
    await flushAsync();
    expect(testid('cash-page')).toBeTruthy();
    expect(rows()).toHaveLength(4);
  });
});
