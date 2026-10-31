import { afterEach, describe, expect, it, vi } from 'vitest';
import Cash from './Cash.vue';
import App from '../App.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 Trades.test.ts 的手法)。
import cashSource from './Cash.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney } from '../moneyFormat';
import { resetMockCashLedgerForTests, type CashEntryDto } from '../services/cashApi';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  bumpPortfolioRevision,
  lastCreatedCashEntryId,
  notifyCashEntryCreated,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
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
  /** 覆寫入出金列表的 GET 回應;第二個參數是「第幾次 GET」(0 起算)。 */
  entries?: (url: string, call: number) => Response | Promise<Response>;
  /** 覆寫 POST 回應(預設依 body 在帳本最前面新增一筆,並把被沖銷的原紀錄標為 reversed)。 */
  post?: (init: RequestInit | undefined) => Response | Promise<Response>;
  /** 覆寫 `GET /portfolio/summary`;第二個參數是「第幾次 GET」。 */
  summary?: (call: number) => Response | Promise<Response>;
}

/** 頁首餘額列需要的 summary(其餘欄位對現金頁無意義,給中性值)。 */
function summaryDto(over: Record<string, unknown> = {}) {
  return {
    totalMarketValue: 0,
    totalCostBasis: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    roi: 0,
    holdingCount: 0,
    baseCurrency: 'TWD',
    fxExcludedCount: 0,
    unconvertedCurrencies: [],
    dayPricePnl: null,
    dayPricePnlRatio: null,
    dayPnlExcludedCount: 0,
    cash: 880000,
    totalEquity: 880000,
    cashBalances: [{ currency: 'TWD', amount: 880000 }],
    allocation: [],
    sectorAllocation: [],
    ...over,
  };
}

/**
 * 有狀態的現金後端:GET 依 page / size 切片帳本,POST 真的把分錄寫進帳本。
 * 只路由現金頁會碰到的端點;其他一律丟錯,讓「頁面偷打了別的 API」立刻可見。
 */
function cashFetch(initial: CashEntryDto[] = THREE_ENTRIES, routes: CashRoutes = {}) {
  let ledger = [...initial];
  let entryGets = 0;
  let summaryGets = 0;
  let created = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/portfolio/summary')) {
      const call = summaryGets;
      summaryGets += 1;
      return routes.summary ? routes.summary(call) : success(summaryDto());
    }
    if (url.includes('/portfolio/cash-entries')) {
      if (init?.method === 'POST') {
        if (routes.post) return routes.post(init);
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const original = ledger.find(e => e.id === body.reversalOfId);
        created += 1;
        const row = entry({
          id: `created-${created}`,
          type: String(body.type),
          currency: String(body.currency),
          amount: Number(body.amount),
          note: (body.note as string | null) ?? null,
          occurredAt: '2026-10-24T12:00:00+08:00',
          reversalOfId: original ? original.id : null,
          reversalOfOccurredAt: original ? original.occurredAt : null,
        });
        ledger = [row, ...ledger.map(e => (original && e.id === original.id ? { ...e, reversed: true } : e))];
        return success(row);
      }
      const call = entryGets;
      entryGets += 1;
      if (routes.entries) return routes.entries(url, call);
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
      const pageIndex = Number(params.get('page') ?? 0);
      const size = Number(params.get('size') ?? 10);
      return success(page(ledger.slice(pageIndex * size, pageIndex * size + size), {
        page: pageIndex,
        size,
        totalElements: ledger.length,
        totalPages: Math.ceil(ledger.length / size),
      }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

type CashFetch = ReturnType<typeof cashFetch>;

let unmountPage: (() => void) | null = null;

async function mountApiCash(fetchImpl: CashFetch = cashFetch(), props: Record<string, unknown> = {}) {
  document.cookie = 'XSRF-TOKEN=csrf-cash; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchImpl);
  unmountPage = mountWithPinia(Cash, { lang: 'zh', ...props });
  await flushAsync();
  return fetchImpl;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

async function mountMockCash(props: Record<string, unknown> = {}) {
  vi.stubEnv('VITE_DATA_MODE', 'mock');
  resetRuntimeApiClientsForTests();
  resetMockCashLedgerForTests();
  const fetchSpy = vi.fn(async () => {
    throw new Error('mock mode must not touch the network');
  });
  vi.stubGlobal('fetch', fetchSpy);
  unmountPage = mountWithPinia(Cash, { lang: 'zh', ...props });
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
  return calls(fetchImpl)
    .filter(([url, init]) => url.includes('/portfolio/cash-entries') && init?.method !== 'POST')
    .map(([url]) => url);
}

function lastOf<T>(list: T[]): T | undefined {
  return list[list.length - 1];
}

function summaryUrls(fetchImpl: CashFetch): string[] {
  return urls(fetchImpl).filter(url => url.includes('/portfolio/summary'));
}

function calls(fetchImpl: CashFetch | ReturnType<typeof vi.fn>): Array<[string, RequestInit | undefined]> {
  return fetchImpl.mock.calls.map(call => [String(call[0]), call[1] as RequestInit | undefined] as [string, RequestInit | undefined]);
}

function postBodies(fetchImpl: CashFetch): Array<Record<string, unknown>> {
  return calls(fetchImpl)
    .filter(([url, init]) => url.includes('/portfolio/cash-entries') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
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
    await mountApiCash(cashFetch([hostile, blank]));

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

// =============== Task 2:狀態、分頁、沖銷流程、新紀錄標記、依 cause 重讀、頁首餘額列 ===============

async function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync();
}

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushAsync(1);
}

function bodyText(): string {
  return document.body.textContent ?? '';
}

function cardTitle(): HTMLElement {
  return requireTestid('cash-entries').querySelector<HTMLElement>('.ttl')!;
}

describe('Cash page — list states', () => {
  it('shows 載入中… plus three skeleton rows while the first page is loading', async () => {
    const gate = deferred<Response>();
    await mountApiCash(cashFetch(THREE_ENTRIES, { entries: () => gate.promise }));

    expect(requireTestid('cash-entries-loading').textContent?.trim()).toBe('載入中…');
    expect(document.body.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(rows()).toHaveLength(0);

    gate.resolve(success(page(THREE_ENTRIES)));
    await flushAsync();
    expect(testid('cash-entries-loading')).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it('shows the empty state with a 記錄入金 button that opens the deposit dialog', async () => {
    await mountApiCash(cashFetch([]));

    const empty = requireTestid('cash-entries-empty');
    expect(empty.textContent).toContain(t('zh', 'cashEntriesEmpty'));
    expect(empty.textContent).toContain(t('zh', 'cashEntriesEmptyBody'));
    expect(testid('cash-dialog')).toBeNull();

    await click(requireTestid('cash-entries-empty-deposit'));
    expect(requireTestid('cash-dialog')).toBeTruthy();
    expect(requireTestid('cash-type-deposit').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows loadFailed with code and traceId on error, never the backend message, and retry recovers', async () => {
    const fetchImpl = await mountApiCash(cashFetch(THREE_ENTRIES, {
      entries: (_url, call) => (call === 0 ? failure('SERVICE_UNAVAILABLE', 'trace-503') : success(page(THREE_ENTRIES))),
    }));

    const error = requireTestid('cash-entries-error');
    expect(error.textContent).toContain(t('zh', 'loadFailed'));
    expect(requireTestid('cash-entries-error-code').textContent).toBe('SERVICE_UNAVAILABLE');
    expect(requireTestid('cash-entries-trace-id').textContent).toContain('trace-503');
    expect(bodyText()).not.toContain('BackendMessageMustNotReachTheDom');

    await click(requireTestid('cash-entries-retry'));
    expect(testid('cash-entries-error')).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(entryUrls(fetchImpl)).toHaveLength(2);
  });
});

describe('Cash page — pagination', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => entry({
    id: `many-${i}`,
    occurredAt: `2026-09-${String(25 - i).padStart(2, '0')}T09:00:00+08:00`,
  }));

  it('renders 1 / 3 with prev disabled, requests the next page on 下一頁 and reaches the last page', async () => {
    const fetchImpl = await mountApiCash(cashFetch(twentyFive));

    expect(rows()).toHaveLength(10);
    expect(requireTestid('cash-entries-page-indicator').textContent?.trim()).toBe('1 / 3');
    expect((requireTestid('cash-entries-prev') as HTMLButtonElement).disabled).toBe(true);
    expect(requireTestid('cash-entries-prev').textContent?.trim()).toBe(t('zh', 'prevPage'));
    expect(requireTestid('cash-entries-next').textContent?.trim()).toBe(t('zh', 'nextPage'));

    await click(requireTestid('cash-entries-next'));
    expect(entryUrls(fetchImpl)[1]).toBe('/api/v1/portfolio/cash-entries?page=1&size=10');
    expect(requireTestid('cash-entries-page-indicator').textContent?.trim()).toBe('2 / 3');

    await click(requireTestid('cash-entries-next'));
    expect(rows()).toHaveLength(5);
    expect((requireTestid('cash-entries-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not render the pager when there is a single page', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES));

    expect(testid('cash-entries-pagination')).toBeNull();
  });
});

describe('Cash page — one-click reversal flow', () => {
  it('opens the dialog in reversal mode for that row and refreshes to page 1 with the new entry marked 新', async () => {
    const fetchImpl = await mountApiCash();

    await click(requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`));
    expect(requireTestid('cash-dialog')).toBeTruthy();
    expect(requireTestid('cash-reversal-original').textContent).toContain('salary');

    await click(requireTestid('cash-submit'));

    // 沖銷以 reversalOfId 指向被點的那一筆。
    expect(postBodies(fetchImpl)).toHaveLength(1);
    expect(postBodies(fetchImpl)[0]!.reversalOfId).toBe(PLAIN_DEPOSIT.id);
    // 成功 → 列表以 page=0 重讀。
    expect(lastOf(entryUrls(fetchImpl))).toBe('/api/v1/portfolio/cash-entries?page=0&size=10');
    expect(rows()).toHaveLength(4);
    // 新沖銷列在最上面,帶「新」;原列變成「已沖銷」且不再有沖銷鈕。
    const top = rows()[0]!;
    expect(top.querySelector('[data-testid="cash-entries-fresh-badge"]')?.textContent?.trim()).toBe(t('zh', 'freshBadge'));
    expect(top.querySelector('[data-testid="cash-entries-reversal-of"]')).toBeTruthy();
    expect(document.body.querySelectorAll('[data-testid="cash-entries-fresh-badge"]')).toHaveLength(1);
    const original = rows()[1]!;
    expect(original.querySelector('[data-testid="cash-entries-reversed-pill"]')).toBeTruthy();
    expect(testid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`)).toBeNull();
  });

  it('keeps the old rows and shows 更新中… while the refresh is in flight', async () => {
    const gate = deferred<Response>();
    const fetchImpl = cashFetch(THREE_ENTRIES, {
      entries: (_url, call) => (call === 0 ? success(page(THREE_ENTRIES)) : gate.promise),
    });
    await mountApiCash(fetchImpl);

    notifyCashEntryCreated({ id: 'whatever' });
    await flushAsync();

    expect(requireTestid('cash-entries-refreshing').textContent?.trim()).toBe(t('zh', 'portfolioRefreshing'));
    expect(rows()).toHaveLength(3);
    expect(testid('cash-entries-loading')).toBeNull();

    gate.resolve(success(page(THREE_ENTRIES)));
    await flushAsync();
    expect(testid('cash-entries-refreshing')).toBeNull();
  });

  it('moves focus to the 入出金紀錄 card title after a row reversal is recorded and the dialog is closed', async () => {
    await mountApiCash();

    await click(requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`));
    await click(requireTestid('cash-submit'));
    await click(requireTestid('cash-done'));

    expect(testid('cash-dialog')).toBeNull();
    expect(cardTitle().getAttribute('tabindex')).toBe('-1');
    expect(cardTitle().textContent?.trim()).toBe(t('zh', 'cashEntries'));
    expect(document.activeElement).toBe(cardTitle());
  });

  it('returns focus to the row button when the reversal dialog is cancelled', async () => {
    await mountApiCash();

    const button = requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`);
    button.focus();
    await click(button);
    await click(requireTestid('cash-cancel'));

    expect(testid('cash-dialog')).toBeNull();
    expect(document.activeElement).toBe(requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`));
  });

  it('re-reads the list immediately when the dialog reports a reversal conflict', async () => {
    const fetchImpl = await mountApiCash(cashFetch(THREE_ENTRIES, {
      post: () => jsonResponse({
        success: false,
        data: null,
        error: { code: 'CASH_ENTRY_ALREADY_REVERSED', message: 'BackendMessageMustNotReachTheDom', fields: null },
        meta: { traceId: 'trace-conflict' },
      }, 409),
    }));
    expect(entryUrls(fetchImpl)).toHaveLength(1);

    await click(requireTestid(`cash-entries-reverse-${PLAIN_DEPOSIT.id}`));
    await click(requireTestid('cash-submit'));

    expect(entryUrls(fetchImpl).length).toBeGreaterThanOrEqual(2);
    expect(rows()).toHaveLength(3);
    // 衝突不是寫入成功:沒有「新」標記。
    expect(testid('cash-entries-fresh-badge')).toBeNull();
  });
});

describe('Cash page — 新 marker, not-in-view hint and refresh failure', () => {
  it('marks only the row whose id equals lastCreatedCashEntryId and shows no not-in-view hint', async () => {
    await mountApiCash();

    notifyCashEntryCreated({ id: PLAIN_DEPOSIT.id });
    await flushAsync();

    const badges = document.body.querySelectorAll('[data-testid="cash-entries-fresh-badge"]');
    expect(badges).toHaveLength(1);
    expect(rows()[0]!.contains(badges[0]!)).toBe(true);
    expect(testid('cash-entries-not-in-view')).toBeNull();
  });

  it('shows 已記錄,但不在目前這一頁 when the new entry is not on the loaded page', async () => {
    await mountApiCash();

    notifyCashEntryCreated({ id: 'entry-on-another-page' });
    await flushAsync();

    expect(requireTestid('cash-entries-not-in-view').textContent?.trim()).toBe(t('zh', 'cashEntryNotInView'));
    expect(testid('cash-entries-fresh-badge')).toBeNull();
  });

  it('keeps the old rows and shows the stale notice with code, traceId and retry when the refresh fails', async () => {
    const fetchImpl = await mountApiCash(cashFetch(THREE_ENTRIES, {
      entries: (_url, call) => {
        if (call === 0) return success(page(THREE_ENTRIES));
        if (call === 1) return failure('SERVICE_UNAVAILABLE', 'trace-stale');
        return success(page(THREE_ENTRIES));
      },
    }));

    notifyCashEntryCreated({ id: PLAIN_DEPOSIT.id });
    await flushAsync();

    expect(rows()).toHaveLength(3);
    const stale = requireTestid('cash-entries-refresh-error');
    expect(stale.getAttribute('role')).toBe('status');
    expect(stale.textContent).toContain(t('zh', 'portfolioStaleAfterCashEntry'));
    expect(stale.textContent).toContain('SERVICE_UNAVAILABLE');
    expect(stale.textContent).toContain('trace-stale');
    expect(bodyText()).not.toContain('BackendMessageMustNotReachTheDom');

    await click(requireTestid('cash-entries-refresh-retry'));
    expect(testid('cash-entries-refresh-error')).toBeNull();
    expect(entryUrls(fetchImpl)).toHaveLength(3);
  });

  it('clears the marker when the dialog is opened again, when the page changes and when the page unmounts', async () => {
    const many = Array.from({ length: 25 }, (_, i) => entry({ id: `many-${i}`, occurredAt: `2026-09-${String(25 - i).padStart(2, '0')}T09:00:00+08:00` }));
    await mountApiCash(cashFetch(many));

    notifyCashEntryCreated({ id: 'many-0' });
    await flushAsync();
    expect(lastCreatedCashEntryId.value).toBe('many-0');
    await click(requireTestid('cash-page-deposit'));
    expect(lastCreatedCashEntryId.value).toBeNull();
    await click(requireTestid('cash-cancel'));

    notifyCashEntryCreated({ id: 'many-0' });
    await flushAsync();
    await click(requireTestid('cash-entries-next'));
    expect(lastCreatedCashEntryId.value).toBeNull();

    notifyCashEntryCreated({ id: 'many-1' });
    await flushAsync();
    expect(lastCreatedCashEntryId.value).toBe('many-1');
    unmountPage?.();
    expect(lastCreatedCashEntryId.value).toBeNull();
  });

  it('uses no timers for the marker lifetime', () => {
    expect(cashSource).not.toMatch(/setTimeout|setInterval/);
  });
});

describe('Cash page — re-read rules by revision cause (U-10)', () => {
  const many = Array.from({ length: 25 }, (_, i) => entry({ id: `many-${i}`, occurredAt: `2026-09-${String(25 - i).padStart(2, '0')}T09:00:00+08:00` }));

  it("re-reads only the summary for 'trade' and 'baseCurrency', and keeps the page number", async () => {
    const fetchImpl = await mountApiCash(cashFetch(many));
    await click(requireTestid('cash-entries-next'));
    const entryGets = entryUrls(fetchImpl).length;
    const summaryGets = summaryUrls(fetchImpl).length;

    bumpPortfolioRevision('trade');
    await flushAsync();
    bumpPortfolioRevision('baseCurrency');
    await flushAsync();

    expect(entryUrls(fetchImpl)).toHaveLength(entryGets);
    expect(summaryUrls(fetchImpl)).toHaveLength(summaryGets + 2);
    expect(requireTestid('cash-entries-page-indicator').textContent?.trim()).toBe('2 / 3');
  });

  it("re-reads both for 'cash' and resets the page to the first one", async () => {
    const fetchImpl = await mountApiCash(cashFetch(many));
    await click(requireTestid('cash-entries-next'));
    const summaryGets = summaryUrls(fetchImpl).length;

    notifyCashEntryCreated({ id: 'many-0' });
    await flushAsync();

    expect(lastOf(entryUrls(fetchImpl))).toBe('/api/v1/portfolio/cash-entries?page=0&size=10');
    expect(summaryUrls(fetchImpl)).toHaveLength(summaryGets + 1);
    expect(requireTestid('cash-entries-page-indicator').textContent?.trim()).toBe('1 / 3');
  });

  it('declares exactly one revision watcher keyed on the cause', () => {
    expect(cashSource).toContain('portfolioRevisionCause');
    expect((cashSource.match(/watch\(portfolioRevision/g) ?? [])).toHaveLength(1);
  });
});

describe('Cash page — balances row (API mode)', () => {
  const NEGATIVE_USD = summaryDto({
    cash: 880000,
    cashBalances: [
      { currency: 'USD', amount: -1200 },
      { currency: 'TWD', amount: 50000 },
      { currency: 'EUR', amount: 0 },
      { currency: 'JPY', amount: 0 },
    ],
  });

  it('shows 可用現金 in the base currency and the non-zero balances in TWD / USD / EUR / JPY order', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES, { summary: () => success(NEGATIVE_USD) }));

    const row = requireTestid('cash-page-balances');
    expect(row.textContent).toContain(`${t('zh', 'availableCash')} ${fmtMoney(880000, 'TWD', 0)}`);
    expect(row.textContent).toContain('TWD 50,000.00 · USD -1,200.00');
    expect(row.textContent).not.toContain('EUR');
    expect(row.textContent).not.toContain('JPY');
  });

  it('names the negative currencies in the hint without colouring the numbers', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES, { summary: () => success(NEGATIVE_USD) }));

    expect(requireTestid('cash-page-negative').textContent).toContain(tf('zh', 'cashNegativeHint', { codes: 'USD' }));
  });

  it('shows no negative hint when every currency balance is non-negative', async () => {
    await mountApiCash();

    expect(requireTestid('cash-page-balances')).toBeTruthy();
    expect(testid('cash-page-negative')).toBeNull();
  });

  it('shows the missing-rate hint for cash currencies the backend could not convert', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES, {
      summary: () => success(summaryDto({
        cashBalances: [{ currency: 'TWD', amount: 100 }, { currency: 'USD', amount: 50 }],
        unconvertedCurrencies: ['USD'],
      })),
    }));

    expect(requireTestid('cash-page-fx-excluded').textContent).toContain(
      tf('zh', 'cashFxExcludedHint', { codes: 'USD', base: 'TWD' }),
    );
  });

  it('shows 載入中… in the balances row only while the summary loads, without blocking the list', async () => {
    const gate = deferred<Response>();
    await mountApiCash(cashFetch(THREE_ENTRIES, { summary: () => gate.promise }));

    expect(requireTestid('cash-page-balances-loading').textContent?.trim()).toBe('載入中…');
    expect(rows()).toHaveLength(3);

    gate.resolve(success(summaryDto()));
    await flushAsync();
    expect(testid('cash-page-balances-loading')).toBeNull();
    expect(testid('cash-page-balances')).toBeTruthy();
  });

  it('confines a summary failure to the balances row: list and 入金 / 出金 keep working, retry recovers', async () => {
    const fetchImpl = await mountApiCash(cashFetch(THREE_ENTRIES, {
      summary: call => (call === 0 ? failure('SERVICE_UNAVAILABLE', 'trace-sum') : success(summaryDto())),
    }));

    const error = requireTestid('cash-page-balances-error');
    expect(error.textContent).toContain(t('zh', 'loadFailed'));
    expect(error.textContent).toContain('SERVICE_UNAVAILABLE');
    expect(error.textContent).toContain('trace-sum');
    expect(bodyText()).not.toContain('BackendMessageMustNotReachTheDom');
    expect(testid('cash-entries-error')).toBeNull();
    expect(rows()).toHaveLength(3);
    expect((requireTestid('cash-page-deposit') as HTMLButtonElement).disabled).toBe(false);
    expect((requireTestid('cash-page-withdraw') as HTMLButtonElement).disabled).toBe(false);

    await click(requireTestid('cash-page-balances-retry'));
    expect(testid('cash-page-balances-error')).toBeNull();
    expect(requireTestid('cash-page-balances')).toBeTruthy();
    expect(summaryUrls(fetchImpl)).toHaveLength(2);
  });
});

describe('Cash page — 入金 / 出金 buttons', () => {
  it('opens the deposit dialog on the first negative currency, falling back to the base currency', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES, {
      summary: () => success(summaryDto({
        baseCurrency: 'EUR',
        cashBalances: [{ currency: 'TWD', amount: 10 }, { currency: 'USD', amount: -5 }, { currency: 'JPY', amount: -9 }],
      })),
    }));

    await click(requireTestid('cash-page-deposit'));
    expect(requireTestid('cash-type-deposit').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-currency-USD').getAttribute('aria-pressed')).toBe('true');
    await click(requireTestid('cash-cancel'));

    cleanupMounted();
    await mountApiCash(cashFetch(THREE_ENTRIES, { summary: () => success(summaryDto({ baseCurrency: 'EUR' })) }));
    await click(requireTestid('cash-page-deposit'));
    expect(requireTestid('cash-currency-EUR').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the withdrawal dialog on the base currency and passes the balances so an overdraw is flagged', async () => {
    await mountApiCash(cashFetch(THREE_ENTRIES, {
      summary: () => success(summaryDto({ baseCurrency: 'USD', cashBalances: [{ currency: 'USD', amount: 100 }] })),
    }));

    await click(requireTestid('cash-page-withdraw'));
    expect(requireTestid('cash-type-withdrawal').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-currency-USD').getAttribute('aria-pressed')).toBe('true');

    await setValue(requireTestid('cash-amount') as HTMLInputElement, '250');
    expect(testid('cash-withdraw-over-balance')).toBeTruthy();
  });

  it('records a deposit from the header button and re-reads the list with the new entry marked 新', async () => {
    const fetchImpl = await mountApiCash();

    await click(requireTestid('cash-page-deposit'));
    await setValue(requireTestid('cash-amount') as HTMLInputElement, '1234');
    await click(requireTestid('cash-submit'));

    expect(postBodies(fetchImpl)).toHaveLength(1);
    expect(postBodies(fetchImpl)[0]!.type).toBe('DEPOSIT');
    expect(rows()).toHaveLength(4);
    expect(rows()[0]!.querySelector('[data-testid="cash-entries-fresh-badge"]')).toBeTruthy();
  });
});

describe('Cash page — mock mode is fully usable', () => {
  it('reverses a seeded deposit through the dialog with immediate effect and zero network calls', async () => {
    const fetchSpy = await mountMockCash();
    expect(rows()).toHaveLength(4);

    // 種子:mock-cash-2 是一般入金(USD 20,000),尚未被沖銷。
    await click(requireTestid('cash-entries-reverse-mock-cash-2'));
    await click(requireTestid('cash-submit'));

    expect(rows()).toHaveLength(5);
    expect(testid('cash-entries-reverse-mock-cash-2')).toBeNull();
    expect(document.body.querySelectorAll('[data-testid="cash-entries-reversed-pill"]')).toHaveLength(2);
    expect(document.body.querySelectorAll('[data-testid="cash-entries-fresh-badge"]')).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(testid('cash-page-balances')).toBeNull();
  });

  it('records a deposit in mock mode with immediate effect, defaulting the currency to TWD', async () => {
    const fetchSpy = await mountMockCash();

    await click(requireTestid('cash-page-deposit'));
    expect(requireTestid('cash-currency-TWD').getAttribute('aria-pressed')).toBe('true');
    await setValue(requireTestid('cash-amount') as HTMLInputElement, '777');
    await click(requireTestid('cash-submit'));

    expect(rows()).toHaveLength(5);
    expect(rows()[0]!.textContent).toContain('+777.00\u00a0TWD');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Cash page — styling contract (source)', () => {
  it('keeps spacing on the UI-SPEC scale and font sizes / weights on the four-level scale', () => {
    const style = cashSource.slice(cashSource.indexOf('<style'));
    const scale = new Set([0, 4, 8, 12, 16, 20, 24, 32, 48]);
    const spacing = [...style.matchAll(/(?:padding|margin|gap)[a-z-]*:\s*([^;}]*)/g)];
    expect(spacing.length).toBeGreaterThan(0);
    for (const match of spacing) {
      for (const px of match[1]!.matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
        expect(scale.has(Number(px[1])), `spacing ${match[0]}`).toBe(true);
      }
    }
    for (const match of style.matchAll(/font-size:\s*(\d+)px/g)) {
      expect([12, 13, 16, 20]).toContain(Number(match[1]));
    }
    for (const match of style.matchAll(/font-weight:\s*(\d+)/g)) {
      expect([400, 600]).toContain(Number(match[1]));
    }
  });

  it('gives every new control a focus-visible outline and honours reduced motion', () => {
    expect(cashSource).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/);
    expect(cashSource).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(cashSource).toMatch(/\.fresh[^}]*animation:\s*none|animation:\s*none/);
  });
});
