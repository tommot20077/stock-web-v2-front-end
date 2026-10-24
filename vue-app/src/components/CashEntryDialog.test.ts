import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import CashEntryDialog from './CashEntryDialog.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 OrderTicket.test.ts 的手法)。
import cashEntryDialogSource from './CashEntryDialog.vue?raw';
import { t } from '../i18n';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  apiLastFill,
  lastCreatedCashEntryId,
  lastCreatedTradeId,
  portfolioRevision,
  portfolioRevisionCause,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import type { CashEntryDto } from '../services/cashApi';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import type { Lang } from '../types';

// Phase 04.1 Plan 15(04.1-15-PLAN.md)。入出金 / 沖銷對話框。
// 本檔全部在 API mode 下跑:stub `fetch`,讓請求走真的 cashApi → apiClient(含 CSRF header 與信封解析),
// 而不是 stub adapter —— key 生命週期與錯誤分派的唯一權威證據就是實際送出的 header / body。

/**
 * 後端回傳的 `CashEntryDto`。**刻意與表單輸入不同**(備註 `from-backend`、id 為後端產生):
 * result 步驟只要有任何一格改用表單值渲染,對應斷言立刻紅(D-09 / judgment §1)。
 */
const RECORDED_ENTRY: CashEntryDto = {
  id: 'cash-entry-backend-1',
  type: 'DEPOSIT',
  currency: 'TWD',
  amount: 50000,
  note: 'from-backend',
  occurredAt: '2026-10-24T09:30:00+08:00',
  createdAt: '2026-10-24T09:30:05+08:00',
  reversalOfId: null,
  reversalOfOccurredAt: null,
  reversed: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function entryResponse(entry: CashEntryDto = RECORDED_ENTRY): Response {
  return jsonResponse({ success: true, data: entry, error: null, meta: { traceId: 'trace-ok' } });
}

interface RoutedFetchOptions {
  entries?: (init: RequestInit | undefined) => Response | Promise<Response>;
}

/** 只路由本對話框會碰到的端點;其他一律丟錯,讓「元件偷打了別的 API」立刻可見。 */
function cashFetch(options: RoutedFetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/portfolio/cash-entries')) {
      return options.entries ? options.entries(init) : entryResponse();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function entryCalls(fetchImpl: ReturnType<typeof vi.fn>): Array<[string, RequestInit | undefined]> {
  return fetchImpl.mock.calls
    .map(call => [String(call[0]), call[1] as RequestInit | undefined] as [string, RequestInit | undefined])
    .filter(([url]) => url.includes('/portfolio/cash-entries'));
}

/** 直接讀 `Idempotency-Key` header —— key 生命週期的唯一權威證據。 */
function idempotencyKeys(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return entryCalls(fetchImpl).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key') ?? '');
}

function entryBodies(fetchImpl: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return entryCalls(fetchImpl).map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

/**
 * 可預測的 key 產生器。**必須連 `getRandomValues` 一起代理** —— 整包換掉 `crypto`
 * 會讓同檔其他依賴 Web Crypto 的程式碼壞掉。`cleanupMounted()` 的 `vi.unstubAllGlobals()` 會還原。
 */
function stubUuids() {
  let n = 0;
  const randomUUID = vi.fn(() => `key-${++n}`);
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', {
    randomUUID,
    getRandomValues: (array: ArrayBufferView) => (real as Crypto).getRandomValues(array as never),
    subtle: (real as Crypto).subtle,
  });
  return randomUUID;
}

interface MountOptions {
  lang?: Lang;
  fetchImpl?: ReturnType<typeof cashFetch>;
  props?: Record<string, unknown>;
}

/** 回傳 fetch 與 emit spy;`props` 可覆寫任何元件 prop。 */
async function mountDialog(options: MountOptions = {}) {
  const fetchImpl = options.fetchImpl ?? cashFetch();
  // CSRF cookie 預先備好,請求路徑不需要 bootstrap 往返(OrderTicket.test.ts Test 24 的同一手法)。
  document.cookie = 'XSRF-TOKEN=csrf-cash; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubGlobal('fetch', fetchImpl);
  resetRuntimeApiClientsForTests();
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  const onReversalConflict = vi.fn();
  mountWithPinia(CashEntryDialog, {
    open: true,
    lang: options.lang ?? 'zh',
    onClose,
    onRecorded,
    onReversalConflict,
    ...options.props,
  });
  await flushAsync();
  return { fetchImpl, onClose, onRecorded, onReversalConflict };
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).toBeTruthy();
  return el!;
}

function bodyText(): string {
  return document.body.textContent ?? '';
}

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function typeAmount(value: string) {
  await setValue(requireTestid('cash-amount') as HTMLInputElement, value);
}

async function typeNote(value: string) {
  await setValue(requireTestid('cash-note') as HTMLTextAreaElement, value);
}

async function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync();
}

function submitButton(): HTMLButtonElement {
  return requireTestid('cash-submit') as HTMLButtonElement;
}

async function submit() {
  await click(submitButton());
}

afterEach(() => {
  cleanupMounted();
  // 重讀訊號是模組級單例,各測試檔自己 reset(不得放進 testSetup.ts,見 portfolioRevision.ts 檔頭)。
  resetPortfolioRevisionForTests();
  // session handler 是模組級單例;不清會讓上一條測試的 spy 活到下一條。
  configureApiClientSessionHandlers({});
});

// 以下 Task 1(tracer):入金一筆端到端 —— 對話框 form → cashApi(stub fetch)→ result + 重讀訊號。
describe('CashEntryDialog tracer — 入金一筆端到端(D-11 / D-30)', () => {
  it('depositIsRecordedAndShowsBackendEntry', async () => {
    const randomUUID = stubUuids();
    const { fetchImpl, onRecorded } = await mountDialog({
      props: { initialType: 'DEPOSIT', initialCurrency: 'TWD' },
    });

    await typeAmount('50000');
    await typeNote('salary');
    await submit();

    // 恰一次 POST,header 與 body 逐欄核對。
    expect(entryCalls(fetchImpl)).toHaveLength(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1']);
    const body = entryBodies(fetchImpl)[0];
    expect(body.type).toBe('DEPOSIT');
    expect(body.currency).toBe('TWD');
    expect(body.amount).toBe(50000);
    expect(body.note).toBe('salary');
    expect(String(body.occurredAt), 'occurredAt 必須帶 offset 的 ISO').toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
    expect(body.reversalOfId).toBeNull();

    // 進入 result 步驟,標題取得焦點,編號是後端回傳的。
    requireTestid('cash-result');
    const title = document.body.querySelector<HTMLElement>('.result-ttl');
    expect(title?.textContent?.trim()).toBe('入金已記錄');
    expect(document.activeElement, '成功後焦點移到 result 標題').toBe(title);
    expect(requireTestid('cash-result-entry-id').textContent?.trim()).toBe(RECORDED_ENTRY.id);
    // D-09:result 只顯示後端回傳值,表單值(salary)不得冒充。
    expect(bodyText()).toContain('from-backend');
    expect(bodyText()).not.toContain('salary');

    // 重讀訊號帶來源 = cash;絕不借用交易的訊號(RESEARCH Q11.1)。
    expect(portfolioRevision.value).toBe(1);
    expect(portfolioRevisionCause.value).toBe('cash');
    expect(lastCreatedCashEntryId.value).toBe(RECORDED_ENTRY.id);
    expect(apiLastFill.value).toBeNull();
    expect(lastCreatedTradeId.value).toBeNull();

    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onRecorded).toHaveBeenCalledWith(RECORDED_ENTRY);
  });

  it('dialogHasNoReviewStep', async () => {
    const { fetchImpl } = await mountDialog();

    // 送出前:只有 form,沒有 review / 確認步驟(U-03 / D-30)。
    expect(testid('cash-result')).toBeNull();
    expect(document.body.querySelector('[data-testid*="review"]')).toBeNull();
    expect(bodyText()).not.toContain(t('zh', 'reviewTrade'));
    expect(bodyText()).not.toContain(t('zh', 'backToEdit'));
    // 不顯示 step dots(只有兩步,dots 沒有資訊量)。
    expect(document.body.querySelector('.step-dots')).toBeNull();
    // form 的主按鈕就是寫入動作本身。
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'cashRecordDeposit'));

    await typeAmount('100');
    await submit();

    // 一次點擊直接寫入並進 result,中間沒有任何確認畫面。
    expect(entryCalls(fetchImpl)).toHaveLength(1);
    requireTestid('cash-result');
  });

  it('不直接 fetch、不 import mock store、不碰交易訊號(原始碼字面)', () => {
    expect(cashEntryDialogSource).not.toMatch(/\bfetch\(/);
    expect(cashEntryDialogSource).not.toContain('stores/mock');
    expect(cashEntryDialogSource).not.toContain('notifyTradeCreated');
    expect(cashEntryDialogSource.match(/notifyCashEntryCreated\(/g)).toHaveLength(1);
  });
});
