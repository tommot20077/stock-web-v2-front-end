import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import HoldingEventDialog from './HoldingEventDialog.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 CashEntryDialog.test.ts 的手法)。
import holdingEventDialogSource from './HoldingEventDialog.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney } from '../moneyFormat';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  apiLastFill,
  lastCreatedCashEntryId,
  lastCreatedHoldingEventId,
  lastCreatedTradeId,
  portfolioRevision,
  portfolioRevisionCause,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import type { DividendDto } from '../services/holdingEventApi';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import type { Lang } from '../types';

// Phase 04.2 Plan 18(04.2-18-PLAN.md)。「股利與股數調整」對話框(D-02 / D-05 / D-08 / D-11 / D-13)。
// 本檔全部在 API mode 下跑:stub `fetch`,讓請求走真的 holdingEventApi → apiClient(含 CSRF header 與信封解析),
// 而不是 stub adapter —— key 生命週期與錯誤分派的唯一權威證據就是實際送出的 header / body。

/**
 * 後端回傳的 `DividendDto`。**刻意與表單輸入不同**(備註 `from-backend`、id 為後端產生):
 * result 步驟只要有任何一格改用表單值渲染,對應斷言立刻紅(D-02)。
 */
const RECORDED_DIVIDEND: DividendDto = {
  id: 'dividend-backend-1',
  symbol: 'AAPL',
  currency: 'USD',
  amount: 120,
  withholdingTax: 30,
  paidAt: '2026-11-04T09:30:00+08:00',
  createdAt: '2026-11-04T09:30:05+08:00',
  note: 'from-backend',
  reversalOfId: null,
  reversed: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function okResponse(data: unknown): Response {
  return jsonResponse({ success: true, data, error: null, meta: { traceId: 'trace-ok' } });
}

interface RoutedFetchOptions {
  dividends?: (init: RequestInit | undefined) => Response | Promise<Response>;
  adjustments?: (init: RequestInit | undefined) => Response | Promise<Response>;
}

/** 只路由本對話框會碰到的端點;其他一律丟錯,讓「元件偷打了別的 API」立刻可見。 */
function holdingEventFetch(options: RoutedFetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) {
      return jsonResponse({ success: true, data: {}, error: null, meta: {} });
    }
    if (url.includes('/portfolio/dividends')) {
      return options.dividends ? options.dividends(init) : okResponse(RECORDED_DIVIDEND);
    }
    if (url.includes('/portfolio/share-adjustments')) {
      if (options.adjustments) return options.adjustments(init);
      throw new Error('share-adjustments not routed in this test');
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

type FetchDouble = ReturnType<typeof holdingEventFetch>;

function callsTo(fetchImpl: FetchDouble, path: string): Array<[string, RequestInit | undefined]> {
  return fetchImpl.mock.calls
    .map(call => [String(call[0]), call[1] as RequestInit | undefined] as [string, RequestInit | undefined])
    .filter(([url]) => url.includes(path));
}

function dividendCalls(fetchImpl: FetchDouble) {
  return callsTo(fetchImpl, '/portfolio/dividends');
}

function bodiesOf(calls: Array<[string, RequestInit | undefined]>): Array<Record<string, unknown>> {
  return calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function keysOf(calls: Array<[string, RequestInit | undefined]>): string[] {
  return calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key') ?? '');
}

interface MountOptions {
  lang?: Lang;
  fetchImpl?: FetchDouble;
  props?: Record<string, unknown>;
}

/** 預設從持倉開啟(標的鎖定 AAPL、USD、持股 10);`props` 可覆寫任何元件 prop。 */
async function mountDialog(options: MountOptions = {}) {
  const fetchImpl = options.fetchImpl ?? holdingEventFetch();
  // CSRF cookie 預先備好,請求路徑不需要 bootstrap 往返(CashEntryDialog.test.ts 的同一手法)。
  document.cookie = 'XSRF-TOKEN=csrf-holding-event; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubGlobal('fetch', fetchImpl);
  resetRuntimeApiClientsForTests();
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  const onReversalConflict = vi.fn();
  mountWithPinia(HoldingEventDialog, {
    open: true,
    lang: options.lang ?? 'zh',
    symbol: 'AAPL',
    holding: { totalQuantity: 10, currency: 'USD', name: 'Apple Inc.' },
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

async function typeInto(id: string, value: string) {
  await setValue(requireTestid(id) as HTMLInputElement, value);
}

async function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync();
}

function submitButton(): HTMLButtonElement {
  return requireTestid('holding-event-submit') as HTMLButtonElement;
}

async function submit() {
  await click(submitButton());
}

function fieldError(field: string): string | undefined {
  return testid(`holding-event-field-error-${field}`)?.textContent?.trim();
}

afterEach(() => {
  cleanupMounted();
  // 重讀訊號是模組級單例,各測試檔自己 reset(不得放進 testSetup.ts,見 portfolioRevision.ts 檔頭)。
  resetPortfolioRevisionForTests();
  configureApiClientSessionHandlers({});
});

// 以下 Task 1(tracer):從持倉(標的鎖定)記一筆現金股利到 result。
describe('HoldingEventDialog tracer — 從持倉記一筆現金股利(D-02 / D-11)', () => {
  it('opensFromHoldingWithLockedSymbolAndCashDividendDefault', async () => {
    await mountDialog();

    const dialog = requireTestid('holding-event-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBe('holding-event-dialog-title');
    expect(document.getElementById(titleId!)?.textContent?.trim()).toBe(t('zh', 'holdingEventTitle'));

    const locked = requireTestid('holding-event-symbol-locked');
    expect(locked.textContent).toContain('AAPL');
    expect(locked.textContent).toContain('USD');
    // 鎖定 = 不可改:不得渲染任何標的輸入框。
    expect(locked.querySelector('input')).toBeNull();

    expect(requireTestid('holding-event-mode-cash-dividend').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement, '開啟焦點在實領金額').toBe(requireTestid('holding-event-amount'));
    expect(requireTestid('holding-event-amount-ccy').textContent?.trim()).toBe('USD');
    expect(requireTestid('holding-event-close').getAttribute('aria-label')).toBe(t('zh', 'closeHoldingEventDialog'));
  });

  it('recordsCashDividendAndShowsOnlyBackendDto', async () => {
    const { fetchImpl, onRecorded } = await mountDialog();

    await typeInto('holding-event-amount', '120');
    await typeInto('holding-event-tax', '30');
    await typeInto('holding-event-note', 'typed-in-form');
    const paidAtInput = requireTestid('holding-event-paid-at') as HTMLInputElement;
    const expectedPaidAt = toLocalIso(new Date(paidAtInput.value));
    await submit();

    const calls = dividendCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toEqual({
      symbol: 'AAPL',
      amount: 120,
      withholdingTax: 30,
      paidAt: expectedPaidAt,
      note: 'typed-in-form',
      reversalOfId: null,
    });
    expect(keysOf(calls)[0], 'key 是 crypto.randomUUID() 的 36 字元').toHaveLength(36);

    requireTestid('holding-event-result');
    const title = document.body.querySelector<HTMLElement>('.result-ttl');
    expect(title?.textContent?.trim()).toBe(t('zh', 'holdingEventCashDividendRecorded'));
    expect(document.activeElement, '成功後焦點移到 result 標題').toBe(title);
    expect(requireTestid('holding-event-result-entry-id').textContent?.trim()).toBe(RECORDED_DIVIDEND.id);
    expect(bodyText()).toContain(fmtMoney(120, 'USD', 2));
    // D-02:result 只顯示後端回傳值,表單值不得冒充。
    expect(bodyText()).toContain('from-backend');
    expect(bodyText()).not.toContain('typed-in-form');

    // 重讀訊號:恰一次、cause = dividend;絕不借用交易或入出金的訊號(D-13)。
    expect(portfolioRevision.value).toBe(1);
    expect(portfolioRevisionCause.value).toBe('dividend');
    expect(lastCreatedHoldingEventId.value).toBe(RECORDED_DIVIDEND.id);
    expect(lastCreatedCashEntryId.value).toBeNull();
    expect(lastCreatedTradeId.value).toBeNull();
    expect(apiLastFill.value).toBeNull();

    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onRecorded).toHaveBeenCalledWith(RECORDED_DIVIDEND);
  });

  it('omittedTaxAndNoteAreSentAsNull', async () => {
    const { fetchImpl } = await mountDialog();

    await typeInto('holding-event-amount', '5.5');
    await submit();

    const body = bodiesOf(dividendCalls(fetchImpl))[0];
    expect(body.withholdingTax).toBeNull();
    expect(body.note).toBeNull();
    expect(body.amount).toBe(5.5);
  });

  it('emptyAmountDisablesSubmitWithVisibleReason', async () => {
    await mountDialog();

    expect((requireTestid('holding-event-amount') as HTMLInputElement).value).toBe('');
    expect(submitButton().disabled).toBe(true);
    // 尚未輸入也未離開欄位:不提早罵人,但常駐說明就是可見原因(鐵律 6)。
    expect(fieldError('amount')).toBeUndefined();
    expect(bodyText()).toContain(tf('zh', 'holdingEventAmountHint', { code: 'USD' }));

    requireTestid('holding-event-amount').dispatchEvent(new Event('blur'));
    await nextTick();
    expect(fieldError('amount')).toBe(t('zh', 'holdingEventErrAmount'));
  });

  it('invalidAmountsShowFieldErrorAndDisableSubmit', async () => {
    await mountDialog();

    for (const bad of ['0', '1000000000001', '1.123456789', '-1', 'abc']) {
      await typeInto('holding-event-amount', bad);
      expect(submitButton().disabled, `金額 ${bad} 應 disabled`).toBe(true);
      expect(fieldError('amount'), `金額 ${bad}`).toBe(t('zh', 'holdingEventErrAmount'));
    }
    for (const ok of ['1000000000000', '0.12345678']) {
      await typeInto('holding-event-amount', ok);
      expect(submitButton().disabled, `金額 ${ok} 應可送出`).toBe(false);
      expect(fieldError('amount')).toBeUndefined();
    }
  });

  it('invalidTaxShowsFieldError', async () => {
    await mountDialog();
    await typeInto('holding-event-amount', '100');

    for (const bad of ['-1', '1000000000001', '0.123456789']) {
      await typeInto('holding-event-tax', bad);
      expect(submitButton().disabled, `預扣稅 ${bad} 應 disabled`).toBe(true);
      expect(fieldError('withholdingTax')).toBe(t('zh', 'holdingEventErrTax'));
    }
    await typeInto('holding-event-tax', '0');
    expect(submitButton().disabled).toBe(false);
  });

  it('paidAtMaxIsNowAndFutureIsRejected', async () => {
    await mountDialog();
    await typeInto('holding-event-amount', '100');

    const input = requireTestid('holding-event-paid-at') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(input.max, 'max = 開啟當下的本機時間').toBe(input.value);
    expect(input.max).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    await setValue(input, toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAt'));
  });

  it('showsStandingNotesInOrder', async () => {
    await mountDialog();

    const text = bodyText();
    const cash = text.indexOf(tf('zh', 'holdingEventNoteCash', { code: 'USD' }));
    const ledger = text.indexOf(t('zh', 'holdingEventLedgerOnlyNote'));
    const irreversible = text.indexOf(t('zh', 'holdingEventIrreversibleNote'));
    expect(cash).toBeGreaterThanOrEqual(0);
    expect(ledger).toBeGreaterThan(cash);
    expect(irreversible).toBeGreaterThan(ledger);
    // U-01:沒有 review 步驟,也沒有 step dots。
    expect(holdingEventDialogSource).not.toMatch(/step === 'review'/);
  });
});
