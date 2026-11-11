import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import CashEntryDialog from './CashEntryDialog.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 OrderTicket.test.ts 的手法)。
import cashEntryDialogSource from './CashEntryDialog.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney, fmtMoneyAmount } from '../moneyFormat';
import { toLocalInputValue } from '../services/localTime';
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
import { toCashEntry, type CashEntry, type CashEntryDto } from '../services/cashApi';
import { parseDecimal, toWire } from '../services/decimal';
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
  // wire 為十進位字串(Phase 5 D-05 / D-08)。
  amount: '50000',
  note: 'from-backend',
  occurredAt: '2026-10-24T09:30:00+08:00',
  createdAt: '2026-10-24T09:30:05+08:00',
  reversalOfId: null,
  reversalOfOccurredAt: null,
  reversed: false,
};

/** emit 出來的 domain 物件轉回 wire 形狀再比較(Decimal → toWire),不依賴 big.js 內部欄位。 */
function plain(entry: CashEntry): CashEntryDto {
  return { ...entry, amount: toWire(entry.amount) };
}

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
  refresh?: () => Response | Promise<Response>;
}

/** 只路由本對話框會碰到的端點;其他一律丟錯,讓「元件偷打了別的 API」立刻可見。 */
function cashFetch(options: RoutedFetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) {
      return options.refresh ? options.refresh() : jsonResponse({ success: true, data: {}, error: null, meta: {} });
    }
    if (url.includes('/portfolio/cash-entries')) {
      return options.entries ? options.entries(init) : entryResponse();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

/**
 * 後端錯誤信封。`fields` 預設 **null**(後端真實形狀,`apiClient.fieldsFrom` 在空 map 時回 null)。
 * `message` 一律放一句「絕不得進入 DOM」的字串,讓違規一眼可見。
 */
function entryFailure(
  code: string,
  options: { status?: number; traceId?: string; fields?: Record<string, string> | null } = {},
): Response {
  return jsonResponse(
    {
      success: false,
      data: null,
      error: { code, message: BACKEND_MESSAGE_CANARY, fields: options.fields ?? null },
      meta: { traceId: options.traceId ?? 'trace-cash' },
    },
    options.status ?? 400,
  );
}

const BACKEND_MESSAGE_CANARY = 'BackendMessageMustNotReachTheDom';
const FIELD_VALUE_CANARY = 'FieldValueCanaryMustNotReachTheDom';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
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
    expect(body.amount).toBe('50000');
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
    expect(plain(onRecorded.mock.calls[0][0] as CashEntry)).toEqual(RECORDED_ENTRY);
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

// 以下 Task 2:表單自檢、key 生命週期、重複送出阻擋、錯誤分派、出金超額提示與 a11y。

/** 填一筆可送出的入金,回到「送出鈕可按」的起點。 */
async function fillValid(value = '100') {
  await typeAmount(value);
}

describe('CashEntryDialog — 前端自檢(UI-SPEC §3 欄位契約)', () => {
  it('amountEmptyDisablesSubmitWithVisibleReason', async () => {
    await mountDialog();

    expect(submitButton().disabled).toBe(true);
    // 尚未輸入也未離開欄位:不提早罵人,但畫面上常駐的說明就是可見原因(鐵律 6)。
    expect(testid('cash-field-error-amount')).toBeNull();
    expect(bodyText()).toContain(t('zh', 'cashAmountHint'));
  });

  it('emptyAmountShowsFieldErrorAfterBlur', async () => {
    await mountDialog();

    requireTestid('cash-amount').dispatchEvent(new Event('blur'));
    await nextTick();

    expect(requireTestid('cash-field-error-amount').textContent?.trim()).toBe(t('zh', 'cashErrAmount'));
    expect(submitButton().disabled).toBe(true);
  });

  it('invalidAmountsDisableSubmitAndShowError', async () => {
    await mountDialog();

    for (const bad of ['0', '-1', '1000000000001', '1.123456789', 'abc', '1e5']) {
      await typeAmount(bad);
      expect(submitButton().disabled, `金額 ${bad} 應 disabled`).toBe(true);
      expect(requireTestid('cash-field-error-amount').textContent?.trim(), `金額 ${bad}`).toBe(t('zh', 'cashErrAmount'));
    }
  });

  it('boundaryAmountsAreAccepted', async () => {
    await mountDialog();

    for (const ok of ['1000000000000', '0.12345678', '0.5', '.5', ' 100 ']) {
      await typeAmount(ok);
      expect(submitButton().disabled, `金額 ${ok} 應可送出`).toBe(false);
      expect(testid('cash-field-error-amount')).toBeNull();
    }
  });

  it('futureOccurredAtDisablesSubmit', async () => {
    await mountDialog();
    await fillValid();

    await setValue(requireTestid('cash-occurred-at') as HTMLInputElement, '2999-01-01T00:00');

    expect(submitButton().disabled).toBe(true);
    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('zh', 'cashErrOccurredAt'));
  });

  // quick-261106-fbs(todo cash-occurred-at-empty-copy):清空發生時間用專屬「請填寫」文案,不再沿用「不可晚於現在」。
  it('clearedOccurredAtShowsRequiredCopyAfterBlur', async () => {
    await mountDialog();
    await fillValid();

    const input = requireTestid('cash-occurred-at') as HTMLInputElement;
    await setValue(input, '');
    input.dispatchEvent(new Event('blur'));
    await nextTick();

    expect(submitButton().disabled).toBe(true);
    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('zh', 'cashErrOccurredAtRequired'));
  });

  it('clearedOccurredAtUsesRequiredCopyInEnglishToo', async () => {
    await mountDialog({ lang: 'en' });
    await fillValid();

    const input = requireTestid('cash-occurred-at') as HTMLInputElement;
    await setValue(input, '');
    input.dispatchEvent(new Event('blur'));
    await nextTick();

    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('en', 'cashErrOccurredAtRequired'));
  });

  // quick-261107-1j4(裁決 3B):1900-01-01 下限(與後端 fields.occurredAt 同一個 instant)。
  it('occurredAtBeforeFloorDisablesSubmitWithTooEarlyCopy', async () => {
    await mountDialog();
    await fillValid();

    await setValue(requireTestid('cash-occurred-at') as HTMLInputElement, '1800-01-01T00:00');

    expect(submitButton().disabled).toBe(true);
    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('zh', 'cashErrOccurredAtTooEarly'));
  });

  it('occurredAtBeforeFloorUsesTooEarlyCopyInEnglishToo', async () => {
    await mountDialog({ lang: 'en' });
    await fillValid();

    await setValue(requireTestid('cash-occurred-at') as HTMLInputElement, '1800-01-01T00:00');

    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('en', 'cashErrOccurredAtTooEarly'));
  });

  it('serverOccurredAtFieldErrorKeepsTheNotInFutureCopy', async () => {
    stubUuids();
    await mountDialog({
      fetchImpl: cashFetch({
        entries: () => entryFailure('VALIDATION_FAILED', { fields: { occurredAt: FIELD_VALUE_CANARY } }),
      }),
    });
    await fillValid();

    await submit();

    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('zh', 'cashErrOccurredAt'));
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });

  it('localFieldErrorIsLinkedToItsInput', async () => {
    await mountDialog();
    await typeAmount('0');

    const input = requireTestid('cash-amount');
    const error = requireTestid('cash-field-error-amount');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    // 欄位級錯誤不加 role="alert":多個欄位同時出錯會連續朗讀(§Accessibility Contract)。
    expect(error.getAttribute('role')).toBeNull();
  });
});

describe('CashEntryDialog — 重複送出阻擋(T-04.1-46)', () => {
  it('doubleClickSubmitsOnlyOnce', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const { fetchImpl } = await mountDialog({ fetchImpl: cashFetch({ entries: () => pending.promise }) });
    await fillValid();

    await submit();
    await submit();

    expect(entryCalls(fetchImpl), '連點兩次只得送出一次').toHaveLength(1);
  });

  it('freezesTheWholeDialogWhileSubmitting', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const { fetchImpl, onClose } = await mountDialog({ fetchImpl: cashFetch({ entries: () => pending.promise }) });
    await fillValid();
    await submit();

    expect(entryCalls(fetchImpl)).toHaveLength(1);
    expect(submitButton().disabled, '送出中必須有明確的 :disabled').toBe(true);
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'recordingTrade'));
    for (const id of ['cash-amount', 'cash-occurred-at', 'cash-note', 'cash-type-deposit', 'cash-type-withdrawal', 'cash-currency-TWD', 'cash-cancel']) {
      expect((requireTestid(id) as HTMLButtonElement | HTMLInputElement).disabled, `${id} 送出中應 disabled`).toBe(true);
    }
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true');
    const status = requireTestid('cash-submitting-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent?.trim()).toBe(t('zh', 'recordingTrade'));

    // ✕ / 遮罩 / Esc 都不得關閉(in-flight 的寫入不可被中途丟棄)。
    await click(requireTestid('cash-dialog-close'));
    await click(document.body.querySelector<HTMLElement>('.mask')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();
    expect(onClose, '送出中不得關閉').not.toHaveBeenCalled();
  });

  it('keepsTheSubmitLabelWidthStableByUsingTheWidestLabel', () => {
    expect(cashEntryDialogSource).toMatch(/\.btn-submit\s*\{[^}]*min-width:/);
    expect(cashEntryDialogSource).toMatch(/class="btn-accent btn-submit"/);
  });
});

describe('CashEntryDialog — Idempotency-Key 生命週期(D-11 / T-04.1-47)', () => {
  it('opening the dialog does not mint a key; pressing submit mints exactly one', async () => {
    const randomUUID = stubUuids();
    await mountDialog();
    expect(randomUUID).not.toHaveBeenCalled();

    await fillValid();
    await submit();

    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('keepsTheKeyAfterANetworkFailure', async () => {
    stubUuids();
    let calls = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({
        entries: () => {
          calls += 1;
          if (calls === 1) throw new TypeError('Failed to fetch');
          return entryResponse();
        },
      }),
    });
    await fillValid();

    await submit();
    expect(requireTestid('cash-error')).toBeTruthy();
    await submit();

    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-1']);
  });

  it('keepsTheKeyAfterA5xx', async () => {
    stubUuids();
    let calls = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({
        entries: () => {
          calls += 1;
          return calls === 1 ? entryFailure('INTERNAL_ERROR', { status: 500 }) : entryResponse();
        },
      }),
    });
    await fillValid();

    await submit();
    await submit();

    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-1']);
  });

  it('mintsANewKeyAfterAnyFieldChange', async () => {
    stubUuids();
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({ entries: () => entryFailure('INTERNAL_ERROR', { status: 500 }) }),
    });
    await fillValid('100');
    await submit();

    await typeAmount('200');
    await submit();

    // 改完欄位立刻送出:flush 'sync' 的 dirty 標記讓這一次就換 key,而不是下一次。
    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-2']);
    expect(entryBodies(fetchImpl).map(b => b.amount)).toEqual(['100', '200']);
  });

  it('dropsTheKeyAfterCashIdempotencyKeyReused', async () => {
    stubUuids();
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({ entries: () => entryFailure('CASH_IDEMPOTENCY_KEY_REUSED', { status: 409 }) }),
    });
    await fillValid();

    await submit();
    // 使用者照文案「確認欄位後重新送出」,沒有改任何欄位 —— 仍必須是新 key,否則形成無出路的 409 迴圈。
    await submit();

    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-2']);
  });

  it('showsFieldLevelErrorsUnderTheFieldAndNeverTheFieldValue', async () => {
    stubUuids();
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({
        entries: () => entryFailure('VALIDATION_FAILED', {
          fields: { amount: FIELD_VALUE_CANARY },
        }),
      }),
    });
    await fillValid();

    await submit();

    const error = requireTestid('cash-field-error-amount');
    expect(error.textContent?.trim()).toBe(t('zh', 'cashErrAmount'));
    const input = requireTestid('cash-amount');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    // 有欄位級錯誤時底部不重複顯示。
    expect(testid('cash-error')).toBeNull();
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
    expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);

    // 改欄位後:錯誤清掉、下一次送出自動換 key。
    await typeAmount('150');
    expect(testid('cash-field-error-amount')).toBeNull();
    await submit();
    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-2']);
  });

  it('neverRendersTheIdempotencyKey', async () => {
    stubUuids();
    await mountDialog({ fetchImpl: cashFetch({ entries: () => entryFailure('INTERNAL_ERROR', { status: 500 }) }) });
    await fillValid();

    await submit();

    expect(bodyText()).not.toContain('key-1');
    expect(document.body.innerHTML).not.toContain('key-1');
  });
});

describe('CashEntryDialog — 錯誤分派(UI-SPEC §Copywriting 錯誤狀態)', () => {
  const CASES: Array<{ name: string; response: () => Response; key: string; code: string }> = [
    { name: 'VALIDATION_FAILED(無 fields)', response: () => entryFailure('VALIDATION_FAILED'), key: 'cashErrValidation', code: 'VALIDATION_FAILED' },
    { name: 'CASH_IDEMPOTENCY_KEY_REUSED', response: () => entryFailure('CASH_IDEMPOTENCY_KEY_REUSED', { status: 409 }), key: 'cashErrKeyReused', code: 'CASH_IDEMPOTENCY_KEY_REUSED' },
    { name: 'AUTH_CSRF_TOKEN_INVALID', response: () => entryFailure('AUTH_CSRF_TOKEN_INVALID', { status: 403 }), key: 'cashErrCsrf', code: 'AUTH_CSRF_TOKEN_INVALID' },
    { name: 'AUTH_FORBIDDEN', response: () => entryFailure('AUTH_FORBIDDEN', { status: 403 }), key: 'cashErrForbidden', code: 'AUTH_FORBIDDEN' },
    { name: '其他 403', response: () => entryFailure('SOMETHING_ELSE', { status: 403 }), key: 'cashErrForbidden', code: 'SOMETHING_ELSE' },
    { name: '500', response: () => entryFailure('INTERNAL_ERROR', { status: 500 }), key: 'cashErrUnknown', code: 'INTERNAL_ERROR' },
  ];

  it.each(CASES)('dispatches $name to its copy with a code + trace id diagnostics row', async ({ response, key, code }) => {
    await mountDialog({ fetchImpl: cashFetch({ entries: () => response() }) });
    await fillValid();

    await submit();

    const error = requireTestid('cash-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(t('zh', key));
    expect(requireTestid('cash-error-code').textContent?.trim()).toBe(code);
    expect(requireTestid('cash-error-trace-id').textContent).toContain('trace-cash');
    // T-04.1-48:後端 message 與使用者輸入不得回射。
    expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
  });

  it('dispatchesANetworkFailureToCashErrNetworkWithoutATraceId', async () => {
    await mountDialog({
      fetchImpl: cashFetch({ entries: () => { throw new TypeError('Failed to fetch'); } }),
    });
    await fillValid();

    await submit();

    expect(requireTestid('cash-error').textContent).toContain(t('zh', 'cashErrNetwork'));
    expect(requireTestid('cash-error-code').textContent?.trim()).toBe('NETWORK_ERROR');
    // traceId 為 null 時整格不渲染(不顯示 `null`)。
    expect(testid('cash-error-trace-id')).toBeNull();
    expect(bodyText()).not.toContain('null');
  });

  it('doesNotShowA401InsideTheDialog', async () => {
    const onRefreshFailed = vi.fn();
    configureApiClientSessionHandlers({ onRefreshFailed });
    await mountDialog({
      fetchImpl: cashFetch({
        entries: () => entryFailure('AUTH_TOKEN_EXPIRED', { status: 401 }),
        refresh: () => entryFailure('AUTH_REFRESH_FAILED', { status: 401 }),
      }),
    });
    await fillValid();

    await submit();

    expect(onRefreshFailed, '401 由 apiClient 升級成全域 session 狀態').toHaveBeenCalled();
    expect(testid('cash-error'), '401 不得在對話框內顯示').toBeNull();
  });
});

describe('CashEntryDialog — 出金超額提示(D-01 / U-16:資訊,不阻擋)', () => {
  // 餘額是 domain CashBalance(Decimal,05-17);fixture 由 wire 字串建構。
  const USD_100 = [{ currency: 'USD', amount: parseDecimal('100') }];

  it('showsAnInformationalHintWhenAWithdrawalExceedsTheBalance', async () => {
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD', balances: USD_100 } });

    await typeAmount('150');

    const hint = requireTestid('cash-withdraw-over-balance');
    expect(hint.textContent?.trim()).toBe(t('zh', 'cashWithdrawOverBalance').replace('{code}', 'USD'));
    expect(hint.textContent).not.toContain('{code}');
    // 不是錯誤:送出鈕仍可按,也不是 alert。
    expect(submitButton().disabled).toBe(false);
    expect(hint.getAttribute('role')).toBeNull();
  });

  it('doesNotShowTheHintWithinTheBalanceOrWithoutBalancesOrForDeposits', async () => {
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD', balances: USD_100 } });
    await typeAmount('100');
    expect(testid('cash-withdraw-over-balance'), '剛好等於餘額不算超額').toBeNull();
    await typeAmount('150');
    expect(testid('cash-withdraw-over-balance')).toBeTruthy();

    await click(requireTestid('cash-type-deposit'));
    expect(testid('cash-withdraw-over-balance'), '入金不顯示').toBeNull();
  });

  it('doesNotShowTheHintWhenBalancesAreNotProvided', async () => {
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD' } });

    await typeAmount('150');

    expect(testid('cash-withdraw-over-balance')).toBeNull();
  });
});

// Phase 5 D-08:表單輸入 → parseDecimalInput → Decimal → adapter toWire → 請求字串,全程不經 JS number。
describe('CashEntryDialog — 金額以 Decimal 送出字串(D-05 / D-08)', () => {
  it('sendsAFullPrecisionAmountVerbatimAsAJsonString', async () => {
    const { fetchImpl } = await mountDialog();

    await typeAmount('123456789012.12345678');
    await submit();

    const body = entryBodies(fetchImpl)[0];
    expect(body.amount).toBe("123456789012.12345678");
    // 原始 body 也必須是字串字面,不是 JSON number。
    expect(String(entryCalls(fetchImpl)[0][1]?.body)).toContain('"amount":"123456789012.12345678"');
  });

  it('sendsTheSmallestUnitInPlainNotation', async () => {
    const { fetchImpl } = await mountDialog();

    await typeAmount('0.00000001');
    await submit();

    expect(entryBodies(fetchImpl)[0].amount).toBe('0.00000001');
  });

  it('retriesWithTheSameKeyAndAByteIdenticalPayload', async () => {
    stubUuids();
    let calls = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: cashFetch({
        entries: () => {
          calls += 1;
          return calls === 1 ? entryFailure('INTERNAL_ERROR', { status: 500 }) : entryResponse();
        },
      }),
    });

    await typeAmount('123456789012.12345678');
    await submit();
    await submit();

    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-1']);
    const raw = entryCalls(fetchImpl).map(([, init]) => String(init?.body));
    expect(raw[1]).toBe(raw[0]);
  });

  it('reversesATinyOriginalAmountWithoutScientificNotation', async () => {
    const tiny = { ...ORIGINAL, amount: '0.00000001' };
    const { fetchImpl } = await mountDialog({ props: { reversalOf: toCashEntry(tiny) } });

    await submit();

    expect(entryBodies(fetchImpl)[0].amount).toBe('0.00000001');
    expect(cashEntryDialogSource).toContain('toWire(original.amount)');
    expect(cashEntryDialogSource).not.toContain('String(original.amount)');
  });

  it('comparesAFractionalWithdrawalAgainstTheBalanceWithDecimal', async () => {
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD', balances: [{ currency: 'USD', amount: parseDecimal('100.00000000') }] } });

    await typeAmount('100.00000000');
    expect(testid('cash-withdraw-over-balance'), '尾零不改變值:等於餘額不算超額').toBeNull();
    await typeAmount('100.00000001');
    expect(testid('cash-withdraw-over-balance')).toBeTruthy();
  });

  it('comparesAgainstABalanceBeyondDoublePrecisionWithoutNumberConversion', async () => {
    // 999999999999.99999998 與 ...99 經 number 都會變成 1000000000000;Decimal 直接比較才分得出「等於」與「多 1e-8」。
    // (金額上限 1e12,所以用低於上限、但超過 double 有效位數的值。)
    const balances = [{ currency: 'USD', amount: parseDecimal('999999999999.99999998') }];
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD', balances } });

    await typeAmount('999999999999.99999998');
    expect(testid('cash-withdraw-over-balance'), '等於餘額不算超額').toBeNull();
    await typeAmount('999999999999.99999999');
    expect(testid('cash-withdraw-over-balance')).toBeTruthy();
  });

  it('dropsThe0516NumberToDecimalHandoffInOverBalance', () => {
    // 05-16 留下的 parseDecimal(numberToWire(balance)) 交接點已由 05-17 刪除(balances 是 CashBalance[])。
    const code = cashEntryDialogSource.split('\n').filter(line => !/^\s*(\*|\/\/)/.test(line)).join('\n');
    expect(code).not.toContain('numberToWire');
  });

  it('parsesTheAmountWithParseDecimalInputInsteadOfNumber', () => {
    expect(cashEntryDialogSource).toContain('parseDecimalInput(amount.value)');
    expect(cashEntryDialogSource).not.toMatch(/Number\(amount\.value/);
  });
});

describe('CashEntryDialog — 無障礙與初始狀態(§Accessibility Contract)', () => {
  it('focusesTheAmountOnOpenAndLabelsTheDialog', async () => {
    await mountDialog();

    expect(document.activeElement).toBe(requireTestid('cash-amount'));
    const dialog = requireTestid('cash-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent?.trim()).toBe(t('zh', 'cashRecordDeposit'));
    expect(requireTestid('cash-dialog-close').getAttribute('aria-label')).toBe(t('zh', 'closeCashDialog'));
    expect(requireTestid('cash-dialog-close').querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('escapeClosesWhenIdle', async () => {
    const { onClose } = await mountDialog();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('preselectsTheInitialCurrencyAndTypeWithAriaPressed', async () => {
    await mountDialog({ props: { initialType: 'WITHDRAWAL', initialCurrency: 'USD' } });

    expect(requireTestid('cash-currency-USD').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-currency-TWD').getAttribute('aria-pressed')).toBe('false');
    expect(requireTestid('cash-type-withdrawal').getAttribute('aria-pressed')).toBe('true');
    expect(requireTestid('cash-type-deposit').getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('cash-dialog-title')?.textContent?.trim()).toBe(t('zh', 'cashRecordWithdrawal'));
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'cashRecordWithdrawal'));
  });

  it('showsTheLedgerOnlyAndIrreversibleNotesAlways', async () => {
    await mountDialog();

    expect(bodyText()).toContain(t('zh', 'cashLedgerOnlyNote'));
    expect(bodyText()).toContain(t('zh', 'cashIrreversibleNote'));
  });

  it('usesCsprngKeysAndTheDoubleGuardInSource', () => {
    expect(cashEntryDialogSource).toContain('crypto.randomUUID');
    expect(cashEntryDialogSource).not.toContain('Math.random');
    expect(cashEntryDialogSource).toContain("flush: 'sync'");
    expect(cashEntryDialogSource).toContain('if (submitting.value) return');
    expect(cashEntryDialogSource).toContain('role="alert"');
  });
});

// 以下 Task 3:沖銷模式(reversalOf)—— 鎖定欄位、預覽、reversalOfId、沖銷衝突處置。

/** 要被沖銷的原紀錄:出金 1,000 USD → 沖銷會記一筆入金。 */
const ORIGINAL: CashEntryDto = {
  id: 'e-9',
  type: 'WITHDRAWAL',
  currency: 'USD',
  amount: '1000',
  note: 'atm',
  occurredAt: '2026-10-05T10:00:00+08:00',
  createdAt: '2026-10-05T10:00:05+08:00',
  reversalOfId: null,
  reversalOfOccurredAt: null,
  reversed: false,
};

/** 後端回傳的沖銷分錄:id 與原紀錄不同,方向相反,`reversalOfOccurredAt` 由後端帶出。 */
const REVERSAL_ENTRY: CashEntryDto = {
  id: 'rev-entry-1',
  type: 'DEPOSIT',
  currency: 'USD',
  amount: '1000',
  note: null,
  occurredAt: '2026-10-24T11:00:00+08:00',
  createdAt: '2026-10-24T11:00:01+08:00',
  reversalOfId: 'e-9',
  reversalOfOccurredAt: '2026-10-05T10:00:00+08:00',
  reversed: false,
};

/** 與元件相同的本機時區顯示:`YYYY-MM-DD HH:mm`。 */
function localDateTime(iso: string): string {
  return toLocalInputValue(new Date(iso)).replace('T', ' ');
}

function localDate(iso: string): string {
  return localDateTime(iso).slice(0, 10);
}

async function mountReversal(options: MountOptions = {}) {
  return mountDialog({ ...options, props: { reversalOf: toCashEntry(ORIGINAL), ...options.props } });
}

describe('CashEntryDialog — 沖銷模式(D-25 / U-04)', () => {
  it('opensWithTheOriginalSummaryAndAnOppositeDirectionPreview', async () => {
    await mountReversal();

    expect(document.getElementById('cash-dialog-title')?.textContent?.trim()).toBe(t('zh', 'cashDialogTitleReversal'));
    const original = requireTestid('cash-reversal-original').textContent ?? '';
    expect(original).toContain(t('zh', 'cashReversalOriginal'));
    expect(original).toContain(localDateTime(ORIGINAL.occurredAt));
    expect(original).toContain(t('zh', 'cashTypeWithdrawal'));
    expect(original).toContain(fmtMoney(1000, 'USD', 2));
    expect(original).toContain('atm');

    const preview = requireTestid('cash-reversal-preview').textContent ?? '';
    expect(preview).toContain(t('zh', 'cashReversalWillRecord'));
    expect(preview).toContain(t('zh', 'cashTypeDeposit'));
    expect(preview, '預覽是方向相反的一筆').not.toContain(t('zh', 'cashTypeWithdrawal'));
    expect(preview).toContain(fmtMoney(1000, 'USD', 2));

    expect(bodyText()).toContain(t('zh', 'cashReversalNote'));
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'cashRecordReversal'));
    // 原紀錄的 id 只用於送出,不顯示(UI-SPEC Security & Diagnostics Display Contract)。
    expect(bodyText()).not.toContain('e-9');
  });

  it('hasNoEditableControlsForTypeCurrencyAmountOrOccurredAtAndFocusesTheNote', async () => {
    await mountReversal();

    for (const id of ['cash-type-deposit', 'cash-type-withdrawal', 'cash-currency-USD', 'cash-currency-TWD', 'cash-amount', 'cash-occurred-at']) {
      expect(testid(id), `${id} 在沖銷模式不得存在`).toBeNull();
    }
    expect(document.activeElement, '焦點落在備註,不落在送出鈕,避免 Enter 誤送').toBe(requireTestid('cash-note'));
    expect(submitButton().disabled, '一開啟就可送出(欄位都由原紀錄帶入)').toBe(false);
  });

  it('submitsTheMirroredEntryWithReversalOfIdAndNoOccurredAt', async () => {
    stubUuids();
    const { fetchImpl, onRecorded } = await mountReversal({
      fetchImpl: cashFetch({ entries: () => entryResponse(REVERSAL_ENTRY) }),
    });

    await typeNote('oops');
    await submit();

    expect(entryCalls(fetchImpl)).toHaveLength(1);
    expect(entryBodies(fetchImpl)[0]).toEqual({
      type: 'DEPOSIT',
      currency: 'USD',
      amount: '1000',
      note: 'oops',
      occurredAt: null,
      reversalOfId: 'e-9',
    });
    expect(plain(onRecorded.mock.calls[0][0] as CashEntry)).toEqual(REVERSAL_ENTRY);
  });

  it('showsTheReversalResultWithOnlyADoneButton', async () => {
    await mountReversal({ fetchImpl: cashFetch({ entries: () => entryResponse(REVERSAL_ENTRY) }) });

    await submit();

    requireTestid('cash-result');
    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'cashReversalRecorded'));
    expect(requireTestid('cash-result-entry-id').textContent?.trim()).toBe('rev-entry-1');
    expect(bodyText()).toContain(tf('zh', 'cashReversalOf', { date: localDate(REVERSAL_ENTRY.reversalOfOccurredAt!) }));
    expect(bodyText()).toContain(fmtMoneyAmount(1000, 'USD'));
    expect(testid('cash-record-another'), '沖銷模式沒有「記錄下一筆」').toBeNull();
    expect(requireTestid('cash-done')).toBeTruthy();
    // 重讀訊號仍是 cash,且絕不碰交易訊號。
    expect(portfolioRevisionCause.value).toBe('cash');
    expect(lastCreatedCashEntryId.value).toBe('rev-entry-1');
    expect(apiLastFill.value).toBeNull();
    expect(bodyText()).not.toContain('e-9');
  });

  it.each([
    { code: 'CASH_ENTRY_ALREADY_REVERSED', status: 409, key: 'cashErrAlreadyReversed' },
    { code: 'CASH_ENTRY_NOT_REVERSIBLE', status: 409, key: 'cashErrNotReversible' },
    { code: 'CASH_ENTRY_NOT_FOUND', status: 404, key: 'cashErrOriginalNotFound' },
  ])('locksTheDialogAndNotifiesTheOpenerOn $code', async ({ code, status, key }) => {
    stubUuids();
    const { fetchImpl, onReversalConflict } = await mountReversal({
      fetchImpl: cashFetch({ entries: () => entryFailure(code, { status }) }),
    });

    await submit();

    expect(requireTestid('cash-error').textContent).toContain(t('zh', key));
    expect(requireTestid('cash-error-code').textContent?.trim()).toBe(code);
    expect(onReversalConflict).toHaveBeenCalledTimes(1);
    expect(onReversalConflict).toHaveBeenCalledWith(code);
    expect(submitButton().disabled, '此原紀錄不可再沖銷,送出鈕 disabled').toBe(true);

    // 再改備註也不會重新啟用,且可見原因(錯誤文案)持續顯示。
    await typeNote('another try');
    expect(submitButton().disabled).toBe(true);
    expect(requireTestid('cash-error').textContent).toContain(t('zh', key));
    await submit();
    expect(entryCalls(fetchImpl), '鎖定後不得再送').toHaveLength(1);
    expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
  });

  it('mintsANewKeyAfterEditingTheNoteInReversalMode', async () => {
    stubUuids();
    const { fetchImpl } = await mountReversal({
      fetchImpl: cashFetch({ entries: () => entryFailure('INTERNAL_ERROR', { status: 500 }) }),
    });

    await submit();
    await submit();
    await typeNote('changed');
    await submit();

    // 沒改欄位的重試沿用同一把;備註變更後換新 key(一致性;若前次其實已成功,後端會以 ALREADY_REVERSED 擋下)。
    expect(idempotencyKeys(fetchImpl)).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('doesNotShowTheWithdrawOverBalanceHintInReversalMode', async () => {
    await mountDialog({
      props: {
        reversalOf: toCashEntry({ ...ORIGINAL, type: 'DEPOSIT' }),
        balances: [{ currency: 'USD', amount: parseDecimal('1') }],
      },
    });

    expect(testid('cash-withdraw-over-balance')).toBeNull();
  });

  it('keepsTheReversalPreviewAndConflictContractInSource', () => {
    expect(cashEntryDialogSource.match(/data-testid="cash-reversal-preview"/g)).toHaveLength(1);
    expect((cashEntryDialogSource.match(/reversalConflict/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// =====================================================================================
// Phase 5 D-02(d):發生時間上限與「未來」判斷由 useNow 驅動(對話框開啟時每 30 秒前進)。
// 原寫法 `maxOccurredAt` 只在 resetForm 寫一次、`occurredAtIssue()` 直接讀 `Date.now()` —— 對話框開著不動,
// `max` 不前進、未來提示也不會消失。送出前自檢仍以 `Date.now()` 重算(上方送出案例維持綠)。
// 有 interval 的元件**不得** `vi.runAllTimers()`(會無限迴圈,前端 LEARNINGS 2026-11-07)。
// =====================================================================================

describe('CashEntryDialog — useNow 驅動發生時間上限與未來判斷(Phase 5 D-02d)', () => {
  /** 本地時間建構,與 `toLocalInputValue` 的本地格式一致,不受容器時區影響。 */
  const T = new Date(2026, 9, 24, 9, 30, 0);

  async function advance(ms: number) {
    vi.advanceTimersByTime(ms);
    await flushAsync();
  }

  it('對話框開著不動:max 隨時間前進;未來輸入的提示在時間追上後消失', async () => {
    vi.useFakeTimers({ now: T });
    await mountDialog();
    await fillValid();
    const input = requireTestid('cash-occurred-at') as HTMLInputElement;
    expect(input.getAttribute('max'), '開啟時上限 = 現在').toBe('2026-10-24T09:30');
    expect(input.value, '預設值 = 開啟時的現在').toBe('2026-10-24T09:30');

    // 兩個 30 秒 tick:上限前進到 09:31(不需編輯任何欄位)。
    await advance(30_000);
    await advance(30_000);
    expect(input.getAttribute('max'), '前進 60 秒後上限應隨之前進').toBe('2026-10-24T09:31');
    expect(input.value, '使用者輸入值不被時鐘改寫').toBe('2026-10-24T09:30');

    // 上限 + 10 分鐘 → 立即顯示未來提示、送出 disabled。
    await setValue(input, '2026-10-24T09:41');
    expect(requireTestid('cash-field-error-occurredAt').textContent?.trim()).toBe(t('zh', 'cashErrOccurredAt'));
    expect(submitButton().disabled, '未來時不得送出').toBe(true);

    // 時間追過輸入值(09:42)→ 提示自動消失、上限前進、送出可按,使用者不必再碰欄位。
    await advance(11 * 60_000);
    expect(testid('cash-field-error-occurredAt'), '時間追上後未來提示應消失').toBeNull();
    expect(input.getAttribute('max')).toBe('2026-10-24T09:42');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('原始碼:occurredAt 判斷不再直接讀 Date.now(),max 不再只寫一次', () => {
    // 以布林斷言,失敗時不傾印整份原始碼。
    expect(cashEntryDialogSource.includes('useNow({ active: () => props.open })'), '應以 useNow 驅動').toBe(true);
    expect(cashEntryDialogSource.includes('classifyInstantInput(occurredAt.value, Date.now())'), '不得直接讀 Date.now()')
      .toBe(false);
    expect(/maxOccurredAt\.value\s*=/.test(cashEntryDialogSource), 'maxOccurredAt 應為 computed,不再寫入').toBe(false);
  });
});
