import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import HoldingEventDialog from './HoldingEventDialog.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 CashEntryDialog.test.ts 的手法)。
import holdingEventDialogSource from './HoldingEventDialog.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney, fmtQuantity, fmtSignedQuantity } from '../moneyFormat';
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
import type { DividendDto, ShareAdjustmentDto } from '../services/holdingEventApi';
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
  refresh?: () => Response | Promise<Response>;
}

/** 只路由本對話框會碰到的端點;其他一律丟錯,讓「元件偷打了別的 API」立刻可見。 */
function holdingEventFetch(options: RoutedFetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) {
      return options.refresh ? options.refresh() : jsonResponse({ success: true, data: {}, error: null, meta: {} });
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

// 以下 Task 2:配股與拆股 / 合股模式(D-05 / D-08)。

/** 後端回傳的 `ShareAdjustmentDto`;`quantityDelta` 由後端算,前端只顯示(Phase 3 D-04)。 */
function adjustmentDto(overrides: Partial<ShareAdjustmentDto> = {}): ShareAdjustmentDto {
  return {
    id: 'adjustment-backend-1',
    symbol: 'AAPL',
    currency: 'USD',
    type: 'STOCK_DIVIDEND',
    quantityDelta: 50,
    ratioNew: null,
    ratioOld: null,
    effectiveDate: '2026-11-03',
    createdAt: '2026-11-04T09:30:05+08:00',
    note: null,
    reversalOfId: null,
    reversed: false,
    ...overrides,
  };
}

function adjustmentFetch(dto: ShareAdjustmentDto) {
  return holdingEventFetch({ adjustments: () => okResponse(dto) });
}

function adjustmentCalls(fetchImpl: FetchDouble) {
  return callsTo(fetchImpl, '/portfolio/share-adjustments');
}

/** 本機日期 `YYYY-MM-DD`(與元件的 `max` 同一個來源:本機時區)。 */
function localDate(offsetDays = 0): string {
  return toLocalInputValue(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)).slice(0, 10);
}

const HOLDING_1000 = { totalQuantity: 1000, currency: 'USD', name: 'Apple Inc.' };

describe('HoldingEventDialog — 模式切換', () => {
  it('rendersThreeModeButtonsInAPressedGroup', async () => {
    await mountDialog();

    const cash = requireTestid('holding-event-mode-cash-dividend');
    const stock = requireTestid('holding-event-mode-stock-dividend');
    const split = requireTestid('holding-event-mode-split');
    const group = cash.parentElement!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-labelledby')).toBeTruthy();
    expect(stock.parentElement).toBe(group);
    expect(split.parentElement).toBe(group);
    expect([cash, stock, split].map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

    await click(stock);
    expect([cash, stock, split].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'holdingEventRecordStockDividend'));
    await click(split);
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'holdingEventRecordSplit'));
  });

  it('switchingModeKeepsSymbolAndNoteButClearsOtherFieldsAndErrors', async () => {
    await mountDialog();
    await typeInto('holding-event-amount', '0');
    await typeInto('holding-event-note', 'keep-me');
    expect(fieldError('amount')).toBe(t('zh', 'holdingEventErrAmount'));

    await click(requireTestid('holding-event-mode-stock-dividend'));
    expect(testid('holding-event-amount')).toBeNull();
    expect((requireTestid('holding-event-shares') as HTMLInputElement).value).toBe('');
    expect((requireTestid('holding-event-note') as HTMLTextAreaElement).value).toBe('keep-me');
    expect(requireTestid('holding-event-symbol-locked').textContent).toContain('AAPL');

    await click(requireTestid('holding-event-mode-cash-dividend'));
    expect((requireTestid('holding-event-amount') as HTMLInputElement).value, '切回後金額已清空').toBe('');
    expect(fieldError('amount'), '切回後欄位錯誤已清空').toBeUndefined();
  });
});

describe('HoldingEventDialog — 配股(D-05)', () => {
  it('recordsStockDividendWithSharesAndExDate', async () => {
    const dto = adjustmentDto({ quantityDelta: 50, note: 'from-backend' });
    const { fetchImpl, onRecorded } = await mountDialog({
      fetchImpl: adjustmentFetch(dto),
      props: { holding: HOLDING_1000, initialMode: 'stockDividend' },
    });

    expect(requireTestid('holding-event-mode-stock-dividend').getAttribute('aria-pressed')).toBe('true');
    const shares = requireTestid('holding-event-shares') as HTMLInputElement;
    expect(document.activeElement, '配股開啟焦點在實領股數').toBe(shares);
    expect(shares.classList.contains('big')).toBe(true);
    expect(requireTestid('holding-event-current-qty').textContent?.trim())
      .toBe(tf('zh', 'holdingEventCurrentQty', { qty: fmtQuantity(1000) }));
    expect(bodyText()).toContain(t('zh', 'holdingEventNoteStock'));

    await typeInto('holding-event-shares', '50');
    // 前端不重算:不得出現記錄後持股(1,050)預覽。
    expect(bodyText()).not.toContain('1,050');
    expect(bodyText()).not.toContain('1050');
    await submit();

    const calls = adjustmentCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toEqual({
      symbol: 'AAPL',
      type: 'STOCK_DIVIDEND',
      quantity: 50,
      ratioNew: null,
      ratioOld: null,
      effectiveDate: localDate(),
      note: null,
      reversalOfId: null,
    });
    expect(dividendCalls(fetchImpl)).toHaveLength(0);

    requireTestid('holding-event-result');
    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'holdingEventStockDividendRecorded'));
    expect(requireTestid('holding-event-result-qty-delta').textContent?.trim()).toBe(fmtSignedQuantity(50));
    expect(requireTestid('holding-event-result-entry-id').textContent?.trim()).toBe(dto.id);
    expect(bodyText()).toContain(dto.effectiveDate);
    expect(bodyText()).toContain('from-backend');

    expect(portfolioRevision.value).toBe(1);
    expect(portfolioRevisionCause.value).toBe('shareAdjustment');
    expect(lastCreatedHoldingEventId.value).toBe(dto.id);
    expect(lastCreatedCashEntryId.value).toBeNull();
    expect(lastCreatedTradeId.value).toBeNull();
    expect(onRecorded).toHaveBeenCalledWith(dto);
  });

  it('invalidSharesShowFieldError', async () => {
    await mountDialog({ props: { initialMode: 'stockDividend' } });

    expect(submitButton().disabled, '空股數').toBe(true);
    expect(bodyText()).toContain(t('zh', 'holdingEventSharesHint'));
    for (const bad of ['0', '1000000001', '0.123456789', 'x']) {
      await typeInto('holding-event-shares', bad);
      expect(submitButton().disabled, `股數 ${bad}`).toBe(true);
      expect(fieldError('quantity'), `股數 ${bad}`).toBe(t('zh', 'holdingEventErrShares'));
    }
    await typeInto('holding-event-shares', '1000000000');
    expect(submitButton().disabled).toBe(false);
  });

  it('exDateIsADateInputCappedAtTodayAndSentVerbatim', async () => {
    const { fetchImpl } = await mountDialog({
      fetchImpl: adjustmentFetch(adjustmentDto()),
      props: { initialMode: 'stockDividend' },
    });
    await typeInto('holding-event-shares', '5');

    const date = requireTestid('holding-event-effective-date') as HTMLInputElement;
    expect(date.type).toBe('date');
    expect(date.max).toBe(localDate());
    expect(date.value, '預設今天').toBe(localDate());
    expect(bodyText()).toContain(t('zh', 'holdingEventEffectiveDateHint'));

    await setValue(date, localDate(1));
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('effectiveDate')).toBe(t('zh', 'holdingEventErrEffectiveDate'));

    await setValue(date, '2026-10-30');
    expect(fieldError('effectiveDate')).toBeUndefined();
    await submit();
    expect(bodiesOf(adjustmentCalls(fetchImpl))[0].effectiveDate, '原字串送出、不轉時區').toBe('2026-10-30');
  });
});

describe('HoldingEventDialog — 拆股 / 合股(D-08)', () => {
  it('ratioInputsHaveNumericModeAndAccessibleNames', async () => {
    await mountDialog({ props: { holding: HOLDING_1000, initialMode: 'split' } });

    const ratioNew = requireTestid('holding-event-ratio-new') as HTMLInputElement;
    const ratioOld = requireTestid('holding-event-ratio-old') as HTMLInputElement;
    expect(document.activeElement, '拆股開啟焦點在新股數').toBe(ratioNew);
    expect(ratioNew.getAttribute('inputmode')).toBe('numeric');
    expect(ratioOld.getAttribute('inputmode')).toBe('numeric');
    expect(ratioNew.getAttribute('aria-label')).toBe(t('zh', 'holdingEventRatioNew'));
    expect(ratioOld.getAttribute('aria-label')).toBe(t('zh', 'holdingEventRatioOld'));
    const group = ratioNew.closest('[role="group"]');
    expect(group?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(group?.contains(ratioOld)).toBe(true);
    expect(requireTestid('holding-event-current-qty').textContent?.trim())
      .toBe(tf('zh', 'holdingEventCurrentQty', { qty: fmtQuantity(1000) }));
    expect(bodyText()).toContain(t('zh', 'holdingEventNoteSplit'));
    expect(bodyText()).toContain(t('zh', 'holdingEventRatioHint'));
  });

  it('readsRatioBackAsSplitOrReverseSplit', async () => {
    await mountDialog({ props: { holding: HOLDING_1000, initialMode: 'split' } });

    expect(testid('holding-event-ratio-read')).toBeNull();
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    expect(requireTestid('holding-event-ratio-read').textContent?.trim())
      .toBe(tf('zh', 'holdingEventRatioReadSplit', { old: 1, new: 4 }));
    // 前端不重算:不得出現換算後持股(4,000)預覽。
    expect(bodyText()).not.toContain('4,000');
    expect(bodyText()).not.toContain('4000');

    await typeInto('holding-event-ratio-new', '1');
    await typeInto('holding-event-ratio-old', '10');
    expect(requireTestid('holding-event-ratio-read').textContent?.trim())
      .toBe(tf('zh', 'holdingEventRatioReadReverse', { old: 10, new: 1 }));
    expect(submitButton().disabled).toBe(false);
  });

  it('invalidRatiosShowFieldErrorAndDisableSubmit', async () => {
    await mountDialog({ props: { initialMode: 'split' } });

    expect(submitButton().disabled, '空比例').toBe(true);
    for (const [n, o] of [['3', '3'], ['0', '1'], ['1001', '1'], ['1.5', '1'], ['2', '-1']]) {
      await typeInto('holding-event-ratio-new', n);
      await typeInto('holding-event-ratio-old', o);
      expect(submitButton().disabled, `${n} : ${o}`).toBe(true);
      expect(fieldError('ratio'), `${n} : ${o}`).toBe(t('zh', 'holdingEventErrRatio'));
      expect(testid('holding-event-ratio-read'), `${n} : ${o} 不讀出`).toBeNull();
    }
    await typeInto('holding-event-ratio-new', '1000');
    await typeInto('holding-event-ratio-old', '1');
    expect(fieldError('ratio')).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
  });

  it('recordsSplitAndTitlesResultFromBackendRatio', async () => {
    // 回應刻意與輸入不同(輸入 4 : 1,後端回 1 : 10):result 只能依後端值判斷拆 / 合(D-02)。
    const dto = adjustmentDto({ type: 'SPLIT', quantityDelta: -900, ratioNew: 1, ratioOld: 10 });
    const { fetchImpl } = await mountDialog({
      fetchImpl: adjustmentFetch(dto),
      props: { initialMode: 'split' },
    });
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    await submit();

    expect(bodiesOf(adjustmentCalls(fetchImpl))[0]).toEqual({
      symbol: 'AAPL',
      type: 'SPLIT',
      quantity: null,
      ratioNew: 4,
      ratioOld: 1,
      effectiveDate: localDate(),
      note: null,
      reversalOfId: null,
    });
    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'holdingEventReverseSplitRecorded'));
    expect(requireTestid('holding-event-result-qty-delta').textContent?.trim()).toBe(fmtSignedQuantity(-900));
    expect(bodyText()).toContain('1 : 10');
    expect(portfolioRevisionCause.value).toBe('shareAdjustment');
  });

  it('titlesForwardSplitFromBackendRatio', async () => {
    const dto = adjustmentDto({ type: 'SPLIT', quantityDelta: 30, ratioNew: 4, ratioOld: 1 });
    await mountDialog({ fetchImpl: adjustmentFetch(dto), props: { initialMode: 'split' } });
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    await submit();

    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'holdingEventSplitRecorded'));
    expect(bodyText()).toContain('4 : 1');
  });

  it('footerStacksBelow400pxAndRatioGroupUsesTheSpecGap', () => {
    expect(holdingEventDialogSource).toMatch(/@media \(max-width: 399px\)\s*\{[^@]*\.ft\s*\{[^}]*flex-direction:\s*column-reverse/);
    expect(holdingEventDialogSource).toMatch(/\.ratio-group\s*\{[^}]*gap:\s*12px/);
    expect(holdingEventDialogSource).toMatch(/\.ratio-group \.inp\.big\s*\{[^}]*width:\s*96px/);
  });
});

// 以下 Task 3:錯誤分派、key 生命週期、防連點與 a11y(D-13 / T-04.2-41 / T-04.2-42)。

const BACKEND_MESSAGE_CANARY = 'BackendMessageMustNotReachTheDom';
const FIELD_VALUE_CANARY = 'FieldValueCanaryMustNotReachTheDom';

/**
 * 後端錯誤信封。`fields` 預設 **null**(後端真實形狀);`message` 一律放「絕不得進入 DOM」的字串。
 */
function failure(
  code: string,
  options: { status?: number; traceId?: string; fields?: Record<string, string> | null } = {},
): Response {
  return jsonResponse(
    {
      success: false,
      data: null,
      error: { code, message: BACKEND_MESSAGE_CANARY, fields: options.fields ?? null },
      meta: { traceId: options.traceId ?? 'trace-holding-event' },
    },
    options.status ?? 400,
  );
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

/**
 * 可預測的 key 產生器。**必須連 `getRandomValues` 一起代理** —— 整包換掉 `crypto`
 * 會讓其他依賴 Web Crypto 的程式碼壞掉。`cleanupMounted()` 的 `vi.unstubAllGlobals()` 會還原。
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

async function fillValidDividend(value = '100') {
  await typeInto('holding-event-amount', value);
}

function errorText(): string {
  return requireTestid('holding-event-error').textContent ?? '';
}

describe('HoldingEventDialog — 重複送出阻擋(T-04.2-41)', () => {
  it('doubleClickSubmitsOnlyOnce', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const { fetchImpl } = await mountDialog({ fetchImpl: holdingEventFetch({ dividends: () => pending.promise }) });
    await fillValidDividend();

    await submit();
    await submit();

    expect(dividendCalls(fetchImpl), '連點兩次只得送出一次').toHaveLength(1);
  });

  it('freezesTheWholeDialogWhileSubmitting', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const { onClose } = await mountDialog({ fetchImpl: holdingEventFetch({ dividends: () => pending.promise }) });
    await fillValidDividend();
    await submit();

    expect(submitButton().disabled, '送出中必須有明確的 :disabled').toBe(true);
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'recordingTrade'));
    for (const id of [
      'holding-event-amount', 'holding-event-tax', 'holding-event-paid-at', 'holding-event-note',
      'holding-event-mode-cash-dividend', 'holding-event-mode-stock-dividend', 'holding-event-mode-split',
      'holding-event-cancel',
    ]) {
      expect((requireTestid(id) as HTMLButtonElement | HTMLInputElement).disabled, `${id} 送出中應 disabled`).toBe(true);
    }
    expect(requireTestid('holding-event-dialog').getAttribute('aria-busy')).toBe('true');
    const status = requireTestid('holding-event-submitting-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent?.trim()).toBe(t('zh', 'recordingTrade'));

    // ✕ / 遮罩 / Esc 都不得關閉(in-flight 的寫入不可被中途丟棄)。
    await click(requireTestid('holding-event-close'));
    await click(document.body.querySelector<HTMLElement>('.mask')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();
    expect(onClose, '送出中不得關閉').not.toHaveBeenCalled();

    pending.resolve(okResponse(RECORDED_DIVIDEND));
    await flushAsync();
    requireTestid('holding-event-result');
  });
});

describe('HoldingEventDialog — Idempotency-Key 生命週期(D-13)', () => {
  it('openingDoesNotMintAKeyAndSubmitMintsExactlyOne', async () => {
    const randomUUID = stubUuids();
    await mountDialog();
    expect(randomUUID).not.toHaveBeenCalled();

    await fillValidDividend();
    await submit();
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('keepsTheKeyAfterANetworkFailureAndSaysRetryIsSafe', async () => {
    stubUuids();
    let calls = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => {
          calls += 1;
          if (calls === 1) throw new TypeError('Failed to fetch');
          return okResponse(RECORDED_DIVIDEND);
        },
      }),
    });
    await fillValidDividend();

    await submit();
    expect(errorText()).toContain(t('zh', 'cashErrNetwork'));
    expect(requireTestid('holding-event-error-code').textContent?.trim()).toBe('NETWORK_ERROR');
    expect(testid('holding-event-error-trace-id'), 'traceId 為 null 時整格不渲染').toBeNull();
    await submit();

    expect(keysOf(dividendCalls(fetchImpl))).toEqual(['key-1', 'key-1']);
  });

  it('keepsTheKeyAfterA5xxAndSaysTheOutcomeIsUncertain', async () => {
    stubUuids();
    let calls = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => {
          calls += 1;
          return calls === 1 ? failure('INTERNAL_ERROR', { status: 500 }) : okResponse(RECORDED_DIVIDEND);
        },
      }),
    });
    await fillValidDividend();

    await submit();
    expect(errorText()).toContain(t('zh', 'holdingEventErrUnknown'));
    await submit();

    expect(keysOf(dividendCalls(fetchImpl))).toEqual(['key-1', 'key-1']);
  });

  it('discardsTheKeyAfterKeyReusedForBothEndpoints', async () => {
    stubUuids();
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('DIVIDEND_IDEMPOTENCY_KEY_REUSED', { status: 409 }),
        adjustments: () => failure('SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED', { status: 409 }),
      }),
    });
    await fillValidDividend();

    await submit();
    expect(errorText()).toContain(t('zh', 'holdingEventErrKeyReused'));
    await submit();
    expect(keysOf(dividendCalls(fetchImpl)), '照文案重新送出必須換新 key').toEqual(['key-1', 'key-2']);

    await click(requireTestid('holding-event-mode-stock-dividend'));
    await typeInto('holding-event-shares', '5');
    await submit();
    expect(errorText()).toContain(t('zh', 'holdingEventErrKeyReused'));
    await submit();
    expect(keysOf(adjustmentCalls(fetchImpl))).toEqual(['key-3', 'key-4']);
  });

  it('mintsANewKeyAfterAnyFieldOrModeChange', async () => {
    stubUuids();
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({ dividends: () => failure('INTERNAL_ERROR', { status: 500 }) }),
    });
    await fillValidDividend('100');
    await submit();

    await typeInto('holding-event-note', 'n');
    await submit();

    // 切模式再切回來:欄位被清空也算「動過」。
    await click(requireTestid('holding-event-mode-split'));
    await click(requireTestid('holding-event-mode-cash-dividend'));
    await fillValidDividend('100');
    await submit();

    expect(keysOf(dividendCalls(fetchImpl))).toEqual(['key-1', 'key-2', 'key-3']);
  });

  it('neverRendersTheKeyOrTheBackendMessage', async () => {
    stubUuids();
    await mountDialog({
      fetchImpl: holdingEventFetch({ dividends: () => failure('INTERNAL_ERROR', { status: 500, traceId: 'trace-500' }) }),
    });
    await fillValidDividend();
    await submit();

    expect(requireTestid('holding-event-error-code').textContent?.trim()).toBe('INTERNAL_ERROR');
    expect(requireTestid('holding-event-error-trace-id').textContent).toContain('trace-500');
    expect(bodyText()).not.toContain('key-1');
    expect(document.body.innerHTML).not.toContain('key-1');
    expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
  });
});

describe('HoldingEventDialog — 錯誤分派(UI-SPEC §錯誤狀態)', () => {
  it('mapsEachBottomErrorCodeToItsCopy', async () => {
    const cases: Array<[string, number, string]> = [
      ['VALIDATION_FAILED', 400, 'holdingEventErrValidation'],
      ['ASSET_NOT_FOUND', 404, 'holdingEventErrAsset'],
      ['AUTH_FORBIDDEN', 403, 'holdingEventErrForbidden'],
      ['SOMETHING_ELSE_FORBIDDEN', 403, 'holdingEventErrForbidden'],
      ['AUTH_CSRF_TOKEN_INVALID', 403, 'cashErrCsrf'],
      ['AUTH_CSRF_TOKEN_MISSING', 403, 'cashErrCsrf'],
      ['DIVIDEND_IDEMPOTENCY_KEY_REUSED', 409, 'holdingEventErrKeyReused'],
      ['INTERNAL_ERROR', 500, 'holdingEventErrUnknown'],
      ['UNKNOWN_FUTURE_CODE', 409, 'holdingEventErrUnknown'],
    ];
    for (const [code, status, key] of cases) {
      await mountDialog({ fetchImpl: holdingEventFetch({ dividends: () => failure(code, { status }) }) });
      await fillValidDividend();
      await submit();

      expect(errorText(), code).toContain(t('zh', key));
      expect(requireTestid('holding-event-error').getAttribute('role')).toBe('alert');
      expect(requireTestid('holding-event-error-code').textContent?.trim()).toBe(code);
      expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
      cleanupMounted();
    }
  });

  it('assetNotFoundWithFieldsSymbolStaysAtTheBottom', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('ASSET_NOT_FOUND', { status: 404, fields: { symbol: FIELD_VALUE_CANARY } }),
      }),
    });
    await fillValidDividend();
    await submit();

    expect(errorText()).toContain(t('zh', 'holdingEventErrAsset'));
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });

  it('insufficientHoldingInFormModeShowsNoHoldingCopy', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({ adjustments: () => failure('TRADE_INSUFFICIENT_HOLDING', { status: 409 }) }),
      props: { initialMode: 'split' },
    });
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    await submit();

    expect(errorText()).toContain(t('zh', 'holdingEventErrNoHolding'));
  });

  it('validationFieldsAreShownPerFieldWithoutLeakingValues', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('VALIDATION_FAILED', {
          fields: { amount: FIELD_VALUE_CANARY, paidAt: FIELD_VALUE_CANARY },
        }),
      }),
    });
    await fillValidDividend();
    await submit();

    expect(fieldError('amount')).toBe(t('zh', 'holdingEventErrAmount'));
    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAt'));
    const input = requireTestid('holding-event-amount');
    const error = requireTestid('holding-event-field-error-amount');
    expect(error.id).toBe('holding-event-amount-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(error.getAttribute('role'), '欄位錯誤不加 role=alert').toBeNull();
    expect(testid('holding-event-error'), '欄位級呈現時底部不重複').toBeNull();
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
    expect(document.body.innerHTML).not.toContain(FIELD_VALUE_CANARY);
  });

  it('effectiveDateFieldErrorCoversFutureAndOrderingRule', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        adjustments: () => failure('VALIDATION_FAILED', { fields: { effectiveDate: FIELD_VALUE_CANARY } }),
      }),
      props: { initialMode: 'stockDividend' },
    });
    await typeInto('holding-event-shares', '5');
    await submit();

    expect(fieldError('effectiveDate')).toBe(t('zh', 'holdingEventErrEffectiveDate'));
    expect(t('zh', 'holdingEventErrEffectiveDate')).toContain('先沖銷較晚的那筆');
    expect(requireTestid('holding-event-effective-date').getAttribute('aria-invalid')).toBe('true');
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });

  it('ratioSideFieldsMapToTheRatioError', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        adjustments: () => failure('VALIDATION_FAILED', { fields: { ratioOld: FIELD_VALUE_CANARY } }),
      }),
      props: { initialMode: 'split' },
    });
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    await submit();

    expect(fieldError('ratio')).toBe(t('zh', 'holdingEventErrRatio'));
    expect(testid('holding-event-error')).toBeNull();
  });

  it('unmappableFieldsFallBackToTheBottomValidationCopy', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('VALIDATION_FAILED', { fields: { 'Idempotency-Key': FIELD_VALUE_CANARY } }),
      }),
    });
    await fillValidDividend();
    await submit();

    expect(errorText()).toContain(t('zh', 'holdingEventErrValidation'));
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });

  it('doesNotShowA401InsideTheDialog', async () => {
    const onRefreshFailed = vi.fn();
    configureApiClientSessionHandlers({ onRefreshFailed });
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('AUTH_TOKEN_EXPIRED', { status: 401 }),
        refresh: () => failure('AUTH_REFRESH_FAILED', { status: 401 }),
      }),
    });
    await fillValidDividend();
    await submit();

    expect(onRefreshFailed, '401 由 apiClient 升級成全域 session 狀態').toHaveBeenCalled();
    expect(testid('holding-event-error'), '401 不得在對話框內顯示').toBeNull();
  });

  it('declaresTheCodeToCopyTableAndNeverUsesOtherWriteSignals', () => {
    expect(holdingEventDialogSource).toMatch(/const SUBMIT_ERROR_COPY: Record<string, string> = \{/);
    expect(holdingEventDialogSource).toMatch(/function handleSubmitFailure\(/);
    expect(holdingEventDialogSource).toMatch(/function ensureIdempotencyKey\(/);
    expect(holdingEventDialogSource).not.toMatch(/notifyTradeCreated|notifyCashEntryCreated/);
    // 元件只經 service interface(鐵律 1 / 3)。
    expect(holdingEventDialogSource).not.toMatch(/stores\/mockPortfolio|\bfetch\(/);
  });
});

describe('HoldingEventDialog — 關閉與焦點', () => {
  it('closesViaCloseButtonEscapeMaskAndDone', async () => {
    const { onClose } = await mountDialog();

    await click(requireTestid('holding-event-close'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await click(document.body.querySelector<HTMLElement>('.mask')!);
    await click(requireTestid('holding-event-cancel'));
    expect(onClose).toHaveBeenCalledTimes(4);

    await fillValidDividend();
    await submit();
    await click(requireTestid('holding-event-done'));
    expect(onClose).toHaveBeenCalledTimes(5);
  });

  it('returnsFocusToTheOpenerAfterClosing', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', holdingEventFetch());
    resetRuntimeApiClientsForTests();
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();

    const open = ref(true);
    const Host = defineComponent({
      setup: () => () => h(HoldingEventDialog, {
        open: open.value,
        lang: 'zh',
        symbol: 'AAPL',
        holding: { totalQuantity: 10, currency: 'USD' },
        onClose: () => { open.value = false; },
      }),
    });
    mountWithPinia(Host);
    await flushAsync();
    expect(document.activeElement).toBe(requireTestid('holding-event-amount'));

    await click(requireTestid('holding-event-close'));
    expect(testid('holding-event-dialog')).toBeNull();
    expect(document.activeElement, '關閉後焦點回到開啟者').toBe(opener);
  });

  it('recordAnotherResetsTheFormAndKeepsTheLockedSymbol', async () => {
    await mountDialog();
    await fillValidDividend();
    await submit();

    await click(requireTestid('holding-event-record-another'));
    expect(testid('holding-event-result')).toBeNull();
    expect((requireTestid('holding-event-amount') as HTMLInputElement).value).toBe('');
    expect(requireTestid('holding-event-symbol-locked').textContent).toContain('AAPL');
    expect(document.activeElement).toBe(requireTestid('holding-event-amount'));
  });
});

describe('HoldingEventDialog — 文案禁止用語(D-11)', () => {
  it('neverRendersTheForbiddenTermInAnyModeOrLanguage', async () => {
    const forbidden = ['公司' + '行動', 'corporate action', 'Corporate action'];
    for (const lang of ['zh', 'en'] as const) {
      await mountDialog({ lang, fetchImpl: adjustmentFetch(adjustmentDto()) });
      for (const id of ['holding-event-mode-cash-dividend', 'holding-event-mode-stock-dividend', 'holding-event-mode-split']) {
        await click(requireTestid(id));
        for (const word of forbidden) expect(bodyText(), `${lang} ${id}`).not.toContain(word);
      }
      await click(requireTestid('holding-event-mode-stock-dividend'));
      await typeInto('holding-event-shares', '5');
      await submit();
      requireTestid('holding-event-result');
      for (const word of forbidden) expect(bodyText(), `${lang} result`).not.toContain(word);
      cleanupMounted();
    }
  });
});
