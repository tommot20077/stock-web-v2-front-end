import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import HoldingEventDialog from './HoldingEventDialog.vue';
// 原始碼字面(Vite `?raw`):鎖住行為測試抓不到的「這段程式碼不存在」(沿用 CashEntryDialog.test.ts 的手法)。
import holdingEventDialogSource from './HoldingEventDialog.vue?raw';
import { t, tf } from '../i18n';
import { fmtMoney, fmtQuantity, fmtSignedQuantity } from '../moneyFormat';
import { parseDecimal } from '../services/decimal';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import { getRuntimeApiClients, resetRuntimeApiClientsForTests } from '../services/pageApiClients';
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
import type { AssetDto, PortfolioActivityDto } from '../services/apiTypes';
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
  /** 04.2-19 typeahead:收到的是解析出來的 `query` 參數。 */
  assets?: (query: string) => Response | Promise<Response>;
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
    if (url.includes('/assets')) {
      if (!options.assets) throw new Error('assets not routed in this test');
      return options.assets(new URL(url, 'http://localhost').searchParams.get('query') ?? '');
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

/** 預設從持倉開啟(標的鎖定 AAPL、USD、美股、持股 10);`props` 可覆寫任何元件 prop。 */
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
    holding: { totalQuantity: 10, currency: 'USD', name: 'Apple Inc.', assetType: 'STOCK', market: 'US' },
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

const HOLDING_1000 = { totalQuantity: 1000, currency: 'USD', name: 'Apple Inc.', assetType: 'STOCK', market: 'US' };

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
    useWr09Clock();
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
    // 假時鐘下 flushAsync 只跑 microtask 輪次;多跑幾輪讓 result 之後的 nextTick → emit 完成。
    await flushAsync(16);

    const calls = adjustmentCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toEqual({
      symbol: 'AAPL',
      type: 'STOCK_DIVIDEND',
      quantity: 50,
      ratioNew: null,
      ratioOld: null,
      // quick-261107-1j4 WR-09 / E2:預設為持倉市場的今天(持倉 market US → 紐約 = 2026-11-04)。
      effectiveDate: '2026-11-04',
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
    // quick-261107-1j4 WR-09:「今天」是標的市場的今天(AAPL = 紐約);假時鐘固定,不依賴執行環境時區。
    useWr09Clock();
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({ adjustments: () => okResponse(adjustmentDto()) }),
      props: { initialMode: 'stockDividend' },
    });
    await typeInto('holding-event-shares', '5');

    const date = requireTestid('holding-event-effective-date') as HTMLInputElement;
    expect(date.type).toBe('date');
    expect(date.max).toBe('2026-11-04');
    expect(date.value, '預設標的市場的今天').toBe('2026-11-04');
    expect(bodyText()).toContain(t('zh', 'holdingEventEffectiveDateHint'));

    await setValue(date, '2026-11-05');
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('effectiveDate')).toBe(t('zh', 'holdingEventErrEffectiveDate'));

    await setValue(date, '2026-10-30');
    expect(fieldError('effectiveDate')).toBeUndefined();
    await submit();
    expect(bodiesOf(adjustmentCalls(fetchImpl))[0].effectiveDate, '原字串送出、不轉時區').toBe('2026-10-30');
  });
});

/*
 * 05-18(Phase 5 D-08):API 路徑由 Positions 傳 domain Holding 的 Decimal 股數,mock 路徑傳 Position.qty 的 number;
 * 對話框只經 fmtQuantity 顯示、不做運算(Phase 3 D-04),兩者顯示文字相同。
 */
describe('HoldingEventDialog — 目前持股接受 Decimal 與 number(05-18)', () => {
  async function currentQtyFor(totalQuantity: unknown): Promise<string | undefined> {
    await mountDialog({
      props: {
        holding: { totalQuantity, currency: 'USD', name: 'Apple Inc.', assetType: 'STOCK', market: 'US' },
        initialMode: 'stockDividend',
      },
    });
    const text = requireTestid('holding-event-current-qty').textContent?.trim();
    cleanupMounted();
    return text;
  }

  it('Decimal(含 setScale(8) 尾零)與 number 的目前持股顯示相同', async () => {
    const fromNumber = await currentQtyFor(1000);
    const fromDecimal = await currentQtyFor(parseDecimal('1000.00000000'));
    expect(fromDecimal).toBe(fromNumber);
    expect(fromDecimal).toBe(tf('zh', 'holdingEventCurrentQty', { qty: fmtQuantity(1000) }));

    expect(await currentQtyFor(parseDecimal('12.5'))).toBe(await currentQtyFor(12.5));
  });

  it('Decimal 股數 8 位小數與超過 double 精度的值原值顯示', async () => {
    expect(await currentQtyFor(parseDecimal('9007199254740993.12345678')))
      .toBe(tf('zh', 'holdingEventCurrentQty', { qty: '9,007,199,254,740,993.12345678' }));
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
    useWr09Clock();
    const { fetchImpl } = await mountDialog({
      fetchImpl: adjustmentFetch(dto),
      props: { initialMode: 'split' },
    });
    await typeInto('holding-event-ratio-new', '4');
    await typeInto('holding-event-ratio-old', '1');
    await submit();
    // 假時鐘下 flushAsync 只跑 microtask 輪次;transport 邊界(transportFetch,D-26)多一層 await,
    // 固定輪數不夠,多跑幾輪讓 result 之後的 nextTick → emit 完成(LEARNINGS 2026-11-07)。
    await flushAsync(16);

    expect(bodiesOf(adjustmentCalls(fetchImpl))[0]).toEqual({
      symbol: 'AAPL',
      type: 'SPLIT',
      quantity: null,
      ratioNew: 4,
      ratioOld: 1,
      // quick-261107-1j4 WR-09 / E2:預設為持倉市場的今天(持倉 market US → 紐約 = 2026-11-04)。
      effectiveDate: '2026-11-04',
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

// =====================================================================================
// Phase 04.2 Plan 19 Task 1(tracer):從 Trades 開啟(無 symbol)→ 標的 typeahead → 記一筆現金股利(D-28 / D-03)。
// 行為與七態逐項沿用 OrderTicket(combobox / listbox / aria-activedescendant / debounce 250ms / 只採最後一次結果),
// 差異:輸入框 13px、listbox 在文件流內(U-04)。
// =====================================================================================

function assetDto(symbol: string, overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    uuid: `asset-${symbol.toLowerCase()}`,
    symbol,
    name: `${symbol} Holdings`,
    assetType: 'STOCK',
    market: 'US',
    currency: 'USD',
    sector: null,
    tradeable: true,
    latestPrice: 100,
    change: 1,
    changePercent: 1,
    volumeText: null,
    high: null,
    low: null,
    ...overrides,
  };
}

/** `ApiResponse<PageResponse<AssetDto>>`。 */
function assetPage(items: AssetDto[], totalElements = items.length): Response {
  return okResponse({
    items,
    page: 0,
    size: 10,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / 10)),
  });
}

const AAPL_ASSET = assetDto('AAPL', { name: 'Apple Inc.' });
const AAL_ASSET = assetDto('AAL', { name: 'American Airlines' });

/** 從 Trades 開啟:無 symbol、無 holding。 */
const FROM_TRADES = { symbol: null, holding: null };

function symbolInput(): HTMLInputElement {
  return requireTestid('holding-event-symbol-input') as HTMLInputElement;
}

function symbolOptionRows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
}

async function typeSymbol(value: string) {
  await setValue(symbolInput(), value);
}

async function pressSymbolKey(key: string) {
  symbolInput().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await flushAsync();
}

/** fake timers 下推進時間;Node 20 的 `Response.json()` 需要較多 tick(見 testUtils.flushAsync)。 */
async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await flushAsync(16);
}

function assetQueries(fetchImpl: FetchDouble): string[] {
  return callsTo(fetchImpl, '/assets').map(([url]) => new URL(url, 'http://localhost').searchParams.get('query') ?? '');
}

/** 搜尋並以鍵盤選定 `AAPL`(結果第一列)。 */
async function pickAaplByKeyboard() {
  await typeSymbol('AA');
  await advance(250);
  await pressSymbolKey('ArrowDown');
  await pressSymbolKey('Enter');
}

function aaplSearchFetch(extra: RoutedFetchOptions = {}) {
  return holdingEventFetch({
    assets: query => (query === '' ? assetPage([]) : assetPage([AAPL_ASSET, AAL_ASSET])),
    ...extra,
  });
}

describe('HoldingEventDialog — 標的 typeahead(D-28 / D-03)', () => {
  it('opensFromTradesWithAFocusedComboboxAndNoCurrency', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });

    expect(testid('holding-event-symbol-locked'), '無 symbol 不得渲染鎖定標的').toBeNull();
    const input = symbolInput();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe('holding-event-symbol-options');
    expect(input.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
    expect(input.getAttribute('aria-labelledby')).toBe('holding-event-symbol-label');
    // U-04:Display 層級留給金額,標的輸入框是 13px 的 `.inp`。
    expect(input.classList.contains('inp')).toBe(true);
    expect(input.classList.contains('big')).toBe(false);
    expect(document.activeElement, 'Trades 開啟 → 焦點在標的輸入框').toBe(input);

    expect(requireTestid('holding-event-mode-cash-dividend').getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('holding-event-amount-hint')?.textContent?.trim())
      .toBe(t('zh', 'holdingEventAmountHintNoSymbol'));
    expect(requireTestid('holding-event-dialog').querySelector('.ccy-tag'), '未選標的不渲染幣別').toBeNull();
  });

  it('opensOnStockDividendFromTheShareAdjustmentTab', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: { ...FROM_TRADES, initialMode: 'stockDividend' } });

    expect(requireTestid('holding-event-mode-stock-dividend').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(symbolInput());
  });

  it('debouncesTheSearchAndShowsLoadingWithTextAndThreeSkeletons', async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetchImpl = holdingEventFetch({ assets: query => (query === 'AA' ? pending.promise : assetPage([])) });
    await mountDialog({ fetchImpl, props: FROM_TRADES });
    const baseline = assetQueries(fetchImpl).filter(query => query === 'AA').length;

    await typeSymbol('A');
    await typeSymbol('AA');
    await advance(240);
    expect(assetQueries(fetchImpl).filter(query => query === 'AA').length - baseline, '未滿 250ms 不得發出').toBe(0);
    await advance(10);
    expect(assetQueries(fetchImpl).slice(-1), '只帶最後一次的關鍵字').toEqual(['AA']);
    expect(assetQueries(fetchImpl), '中間的 A 不得送出').not.toContain('A');

    const loading = requireTestid('holding-event-symbol-loading');
    expect(loading.textContent).toContain(t('zh', 'loading'));
    expect(loading.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(symbolInput().getAttribute('aria-expanded')).toBe('true');

    pending.resolve(assetPage([AAPL_ASSET, assetDto('AAXX', { tradeable: false })]));
    await flushAsync(16);
    expect(testid('holding-event-symbol-loading')).toBeNull();
    expect(requireTestid('holding-event-symbol-options').getAttribute('role')).toBe('listbox');
    expect(testid('holding-event-symbol-option-AAPL')).toBeTruthy();
    expect(testid('holding-event-symbol-option-AAXX'), '只列 tradeable').toBeNull();
  });

  it('movesTheActiveOptionWithArrowKeysAndPicksWithEnter', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await typeSymbol('AA');
    await advance(250);

    const rows = symbolOptionRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.id).toBeTruthy();
      expect(row.getAttribute('aria-selected')).toBe('false');
    }
    await pressSymbolKey('ArrowDown');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[0].id);
    await pressSymbolKey('ArrowDown');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[1].id);
    await pressSymbolKey('ArrowUp');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[0].id);
    await pressSymbolKey('Enter');

    expect(symbolInput().value).toBe('AAPL');
    expect(testid('holding-event-symbol-options'), 'Enter 選定後收起').toBeNull();
    expect(symbolInput().getAttribute('aria-expanded')).toBe('false');
    // 選定後才顯示幣別與帶幣別的金額說明。
    expect(requireTestid('holding-event-amount-ccy').textContent?.trim()).toBe('USD');
    expect(document.getElementById('holding-event-amount-hint')?.textContent?.trim())
      .toBe(tf('zh', 'holdingEventAmountHint', { code: 'USD' }));
    expect(requireTestid('holding-event-dialog').textContent).toContain('Apple Inc.');
  });

  it('picksAnOptionWithTheMouseToo', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await typeSymbol('AA');
    await advance(250);

    requireTestid('holding-event-symbol-option-AAL').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flushAsync();
    expect(symbolInput().value).toBe('AAL');
    expect(testid('holding-event-symbol-options')).toBeNull();
  });

  it('escapeClosesTheListboxBeforeItClosesTheDialog', async () => {
    vi.useFakeTimers();
    const { onClose } = await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await typeSymbol('AA');
    await advance(250);
    expect(testid('holding-event-symbol-options')).toBeTruthy();

    await pressSymbolKey('Escape');
    expect(testid('holding-event-symbol-options'), '第一次 Esc 只收起下拉').toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await pressSymbolKey('Escape');
    expect(onClose, '下拉已收起時 Esc 照常關閉對話框').toHaveBeenCalledTimes(1);
  });

  it('recordsACashDividendForASearchedSymbolWithoutAHolding', async () => {
    vi.useFakeTimers();
    const { fetchImpl, onRecorded } = await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await pickAaplByKeyboard();

    await typeInto('holding-event-amount', '120');
    expect(submitButton().disabled, '無持倉也能記現金股利(D-03)').toBe(false);
    await submit();
    await flushAsync(16);

    const calls = dividendCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toMatchObject({ symbol: 'AAPL', amount: 120, reversalOfId: null });
    requireTestid('holding-event-result');
    expect(onRecorded).toHaveBeenCalledWith(RECORDED_DIVIDEND);
  });

  it('recordsACashDividendForASearchedSymbolInMockMode', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    const onRecorded = vi.fn();
    mountWithPinia(HoldingEventDialog, { open: true, lang: 'zh', symbol: null, holding: null, onRecorded });
    await flushAsync(16);

    await typeSymbol('AAPL');
    await advance(250);
    // 精準命中可交易標的即選定(沿用 OrderTicket),下拉仍開著讓使用者看清候選。
    expect(requireTestid('holding-event-amount-ccy').textContent?.trim()).toBeTruthy();
    await typeInto('holding-event-amount', '12.5');
    await submit();
    await flushAsync(16);

    requireTestid('holding-event-result');
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect((onRecorded.mock.calls[0][0] as DividendDto).symbol).toBe('AAPL');
  });

  it('showsSearchFailureWithDiagnosticsAndRetryWithoutBlockingOtherFields', async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetchImpl = holdingEventFetch({
      assets: (query) => {
        if (query !== 'AA') return assetPage([]);
        return fail ? failure('ASSET_SEARCH_FAILED', { status: 500, traceId: 'trace-search' }) : assetPage([AAPL_ASSET]);
      },
    });
    await mountDialog({ fetchImpl, props: FROM_TRADES });
    await typeSymbol('AA');
    await advance(250);

    expect(requireTestid('holding-event-symbol-error').textContent).toContain(t('zh', 'symbolSearchFailed'));
    expect(requireTestid('holding-event-symbol-error-code').textContent?.trim()).toBe('ASSET_SEARCH_FAILED');
    expect(requireTestid('holding-event-symbol-trace-id').textContent).toContain('trace-search');
    expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
    // 錯誤只屬於這個區塊:其他欄位仍可編輯。
    expect((requireTestid('holding-event-amount') as HTMLInputElement).disabled).toBe(false);
    expect((requireTestid('holding-event-note') as HTMLTextAreaElement).disabled).toBe(false);

    fail = false;
    const before = assetQueries(fetchImpl).length;
    await click(requireTestid('holding-event-symbol-retry'));
    await flushAsync(16);
    expect(assetQueries(fetchImpl).length, '重試必須真的再打一次').toBe(before + 1);
    expect(testid('holding-event-symbol-error')).toBeNull();
    expect(testid('holding-event-symbol-option-AAPL')).toBeTruthy();
  });

  it('distinguishesEmptyNoTradableAndTruncatedResults', async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 10 }, (_, i) => assetDto(`SYM${i}`));
    const fetchImpl = holdingEventFetch({
      assets: (query) => {
        if (query === 'ZZZZ') return assetPage([]);
        if (query === 'BND') return assetPage([assetDto('BND1', { tradeable: false }), assetDto('BND2', { tradeable: false })]);
        if (query === 'S') return assetPage(many, 37);
        return assetPage([]);
      },
    });
    await mountDialog({ fetchImpl, props: FROM_TRADES });

    await typeSymbol('ZZZZ');
    await advance(250);
    expect(requireTestid('holding-event-symbol-empty').textContent).toContain(t('zh', 'symbolNoResults'));
    expect(testid('holding-event-symbol-no-tradable')).toBeNull();

    await typeSymbol('BND');
    await advance(250);
    expect(requireTestid('holding-event-symbol-no-tradable').textContent).toContain(t('zh', 'symbolNoTradable'));
    expect(testid('holding-event-symbol-empty'), '有結果就不是 empty').toBeNull();
    expect(symbolOptionRows()).toHaveLength(0);

    await typeSymbol('S');
    await advance(250);
    expect(symbolOptionRows()).toHaveLength(10);
    expect(requireTestid('holding-event-symbol-truncated').textContent).toContain(t('zh', 'symbolMoreResults'));
  });

  it('neverLetsAStaleSlowerResponseOverwriteTheNewerQuery', async () => {
    vi.useFakeTimers();
    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const fetchImpl = holdingEventFetch({
      assets: (query) => {
        if (query === 'AAP') return slow.promise;
        if (query === 'AAPL') return fast.promise;
        return assetPage([]);
      },
    });
    await mountDialog({ fetchImpl, props: FROM_TRADES });

    await typeSymbol('AAP');
    await advance(250);
    await typeSymbol('AAPL');
    await advance(250);
    fast.resolve(assetPage([AAPL_ASSET]));
    await flushAsync(16);
    slow.resolve(assetPage([assetDto('AAPX')]));
    await flushAsync(16);

    expect(testid('holding-event-symbol-option-AAPL')).toBeTruthy();
    expect(testid('holding-event-symbol-option-AAPX'), '舊查詢的晚到結果不得覆蓋').toBeNull();
  });

  it('withoutAPickedSymbolShowsTheSymbolErrorAndKeepsSubmitDisabled', async () => {
    vi.useFakeTimers();
    const { fetchImpl } = await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });

    await typeInto('holding-event-amount', '120');
    expect(submitButton().disabled).toBe(true);
    // 鐵律 6:其餘欄位都合法時,送出鈕 disabled 的唯一原因必須可見。
    expect(fieldError('symbol')).toBe(t('zh', 'holdingEventErrSymbol'));
    expect(symbolInput().getAttribute('aria-invalid')).toBe('true');
    expect(symbolInput().getAttribute('aria-describedby')).toContain('holding-event-symbol-error');
    await submit();
    expect(dividendCalls(fetchImpl)).toHaveLength(0);

    await pickAaplByKeyboard();
    expect(fieldError('symbol')).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
  });

  it('showsTheSymbolErrorAfterTheInputIsLeftEmpty', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    expect(fieldError('symbol'), '開啟時不提早罵人').toBeUndefined();

    symbolInput().dispatchEvent(new FocusEvent('blur'));
    await flushAsync();
    expect(fieldError('symbol')).toBe(t('zh', 'holdingEventErrSymbol'));
  });

  it('editingTheQueryAfterAPickClearsTheSelection', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await pickAaplByKeyboard();
    await typeInto('holding-event-amount', '120');
    expect(submitButton().disabled).toBe(false);

    await typeSymbol('AAP');
    expect(testid('holding-event-amount-ccy'), '改了關鍵字 = 選定作廢').toBeNull();
    expect(submitButton().disabled).toBe(true);
  });

  it('switchingModeKeepsThePickedSymbol', async () => {
    vi.useFakeTimers();
    await mountDialog({ fetchImpl: aaplSearchFetch(), props: FROM_TRADES });
    await pickAaplByKeyboard();

    await click(requireTestid('holding-event-mode-split'));
    expect(symbolInput().value).toBe('AAPL');
    await click(requireTestid('holding-event-mode-cash-dividend'));
    expect(requireTestid('holding-event-amount-ccy').textContent?.trim()).toBe('USD');
  });

  it('keepsTheListboxInTheDocumentFlowWithSpecSizes', () => {
    // U-04:對話框 body 會捲動,絕對定位的下拉會被裁切。
    expect(holdingEventDialogSource).toMatch(/\.sym-pop\s*\{[^}]*margin-top:\s*8px/);
    expect(holdingEventDialogSource).not.toMatch(/\.sym-pop\s*\{[^}]*position:\s*absolute/);
    expect(holdingEventDialogSource).toMatch(/\.sym-list\s*\{[^}]*max-height:\s*240px[^}]*overflow-y:\s*auto/);
    expect(holdingEventDialogSource).toMatch(/\.sym-row\s*\{[^}]*min-height:\s*44px/);
    expect(holdingEventDialogSource).toMatch(/\.sym-row\s*\{[^}]*padding:\s*8px 12px/);
    expect(holdingEventDialogSource).toMatch(/searchAssets\(/);
  });
});

// =====================================================================================
// Phase 04.2 Plan 19 Task 2:沖銷模式(D-13 記錯以沖銷修正)。
// 值由 Trades 活動列帶入且不可編輯(DB 驗證沖銷值與原列相同),只有備註可改;
// 沖銷衝突丟棄 key、鎖住送出、emit reversalConflict 讓開啟者重讀列表。
// =====================================================================================

/** 原列 UUID:任何沖銷畫面都不得顯示它(T-04.2-43,只以日期指回)。 */
const ORIGINAL_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function activityRow(overrides: Partial<PortfolioActivityDto>): PortfolioActivityDto {
  return {
    id: ORIGINAL_UUID,
    kind: 'CASH_DIVIDEND',
    symbol: 'AAPL',
    currency: 'USD',
    occurredAt: '2026-10-15T09:30:00+08:00',
    effectiveDate: null,
    createdAt: '2026-10-15T09:31:00+08:00',
    quantity: null,
    price: null,
    fee: null,
    amount: null,
    withholdingTax: null,
    ratioNew: null,
    ratioOld: null,
    note: null,
    reversalOfId: null,
    reversalOfOccurredAt: null,
    reversalOfEffectiveDate: null,
    reversed: false,
    reversible: true,
    ...overrides,
  };
}

const DIVIDEND_ROW = activityRow({ kind: 'CASH_DIVIDEND', amount: 120, withholdingTax: 30, note: 'Q3 配息' });
const SPLIT_ROW = activityRow({
  kind: 'SPLIT',
  occurredAt: '2026-10-20T13:30:00Z',
  effectiveDate: '2026-10-20',
  quantity: 300,
  ratioNew: 4,
  ratioOld: 1,
});
const STOCK_DIVIDEND_ROW = activityRow({
  kind: 'STOCK_DIVIDEND',
  occurredAt: '2026-10-01T13:30:00Z',
  effectiveDate: '2026-10-01',
  quantity: 50,
});

/** 後端回的沖銷紀錄:沖銷列輸出原值(不反號),以 `reversalOfId` 判斷。 */
const REVERSAL_DIVIDEND_DTO: DividendDto = {
  ...RECORDED_DIVIDEND,
  id: 'dividend-reversal-1',
  note: 'reversal-from-backend',
  reversalOfId: ORIGINAL_UUID,
};

function reversalAdjustmentDto(overrides: Partial<ShareAdjustmentDto> = {}): ShareAdjustmentDto {
  return adjustmentDto({
    id: 'adjustment-reversal-1',
    type: 'SPLIT',
    quantityDelta: 300,
    ratioNew: 4,
    ratioOld: 1,
    effectiveDate: '2026-10-20',
    reversalOfId: ORIGINAL_UUID,
    ...overrides,
  });
}

/** 從 Trades 活動列開啟沖銷:不傳 symbol / holding,值全來自 `reversalOf`。 */
function reversalProps(row: PortfolioActivityDto) {
  return { symbol: null, holding: null, reversalOf: row };
}

function localDateOf(iso: string): string {
  return toLocalInputValue(new Date(iso)).slice(0, 10);
}

function dialogText(): string {
  return requireTestid('holding-event-dialog').textContent ?? '';
}

describe('HoldingEventDialog — 沖銷模式(D-13)', () => {
  it('rendersTheOriginalSummaryAndPreviewForACashDividend', async () => {
    const { fetchImpl } = await mountDialog({ fetchImpl: holdingEventFetch(), props: reversalProps(DIVIDEND_ROW) });

    expect(document.getElementById('holding-event-dialog-title')?.textContent?.trim()).toBe(t('zh', 'cashDialogTitleReversal'));
    // 不渲染模式切換、typeahead、鎖定標的區與任何數值輸入框。
    expect(testid('holding-event-mode-cash-dividend')).toBeNull();
    expect(testid('holding-event-symbol-input')).toBeNull();
    expect(testid('holding-event-amount')).toBeNull();
    expect(testid('holding-event-tax')).toBeNull();
    expect(testid('holding-event-paid-at')).toBeNull();
    expect(callsTo(fetchImpl, '/assets'), '沖銷不需要搜尋標的').toHaveLength(0);

    const original = requireTestid('holding-event-reversal-original');
    expect(original.textContent).toContain(t('zh', 'cashReversalOriginal'));
    expect(original.textContent).toContain(t('zh', 'activityKindCashDividend'));
    expect(original.textContent).toContain('AAPL');
    expect(original.querySelector('.ccy-tag')?.textContent?.trim()).toBe('USD');
    expect(original.textContent).toContain(toLocalInputValue(new Date(DIVIDEND_ROW.occurredAt)).replace('T', ' '));
    expect(original.textContent).toContain(fmtMoney(120, 'USD', 2));
    expect(original.textContent).toContain(fmtMoney(30, 'USD', 2));
    expect(original.textContent).toContain('Q3 配息');

    const preview = requireTestid('holding-event-reversal-preview');
    expect(preview.textContent).toContain(t('zh', 'cashReversalWillRecord'));
    expect(preview.textContent).toContain(
      tf('zh', 'holdingEventReversalPreviewDividend', { code: 'USD', amount: fmtMoney(120, 'USD', 2) }),
    );
    expect(dialogText()).toContain(t('zh', 'holdingEventReversalNoteDividend'));

    expect(document.activeElement, '沖銷開啟焦點在備註').toBe(requireTestid('holding-event-note'));
    expect(submitButton().textContent?.trim()).toBe(t('zh', 'cashRecordReversal'));
    expect(submitButton().disabled).toBe(false);
    expect(dialogText(), '不得顯示原列 uuid').not.toContain(ORIGINAL_UUID);
  });

  it('submitsTheDividendReversalWithOriginalValuesAndPointsBackByDate', async () => {
    const { fetchImpl, onRecorded } = await mountDialog({
      fetchImpl: holdingEventFetch({ dividends: () => okResponse(REVERSAL_DIVIDEND_DTO) }),
      props: reversalProps(DIVIDEND_ROW),
    });
    await typeInto('holding-event-note', '記錯了');
    await submit();

    const calls = dividendCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toEqual({
      symbol: 'AAPL',
      amount: 120,
      withholdingTax: 30,
      paidAt: null,
      note: '記錯了',
      reversalOfId: ORIGINAL_UUID,
    });
    expect(keysOf(calls)[0]).toHaveLength(36);

    requireTestid('holding-event-result');
    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'cashReversalRecorded'));
    expect(requireTestid('holding-event-result-reversal-of').textContent?.trim())
      .toBe(tf('zh', 'cashReversalOf', { date: localDateOf(DIVIDEND_ROW.occurredAt) }));
    expect(bodyText()).toContain('reversal-from-backend');
    // reversal 的 result footer 只有 `完成`。
    expect(testid('holding-event-record-another')).toBeNull();
    requireTestid('holding-event-done');
    expect(dialogText(), 'result 也不得顯示原列 uuid').not.toContain(ORIGINAL_UUID);

    expect(portfolioRevisionCause.value).toBe('dividend');
    expect(lastCreatedHoldingEventId.value).toBe(REVERSAL_DIVIDEND_DTO.id);
    expect(onRecorded).toHaveBeenCalledWith(REVERSAL_DIVIDEND_DTO);
  });

  it('rendersAndSubmitsASplitReversalWithTheRecordedRatioAndExDate', async () => {
    const dto = reversalAdjustmentDto();
    const { fetchImpl } = await mountDialog({ fetchImpl: adjustmentFetch(dto), props: reversalProps(SPLIT_ROW) });

    expect(testid('holding-event-ratio-new')).toBeNull();
    expect(testid('holding-event-effective-date')).toBeNull();
    const original = requireTestid('holding-event-reversal-original');
    expect(original.textContent).toContain(t('zh', 'activityKindSplit'));
    expect(original.textContent).toContain('2026-10-20');
    expect(original.textContent).toContain(fmtSignedQuantity(300));
    expect(original.textContent).toContain('4 : 1');
    expect(requireTestid('holding-event-reversal-preview').textContent).toContain(
      tf('zh', 'holdingEventReversalPreviewAdjustment', { symbol: 'AAPL', qty: fmtSignedQuantity(300) }),
    );
    expect(dialogText()).toContain(t('zh', 'holdingEventReversalNoteAdjustment'));
    expect(document.activeElement).toBe(requireTestid('holding-event-note'));

    await submit();
    const calls = adjustmentCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(bodiesOf(calls)[0]).toEqual({
      symbol: 'AAPL',
      type: 'SPLIT',
      quantity: null,
      ratioNew: 4,
      ratioOld: 1,
      effectiveDate: '2026-10-20',
      note: null,
      reversalOfId: ORIGINAL_UUID,
    });
    expect(document.body.querySelector('.result-ttl')?.textContent?.trim()).toBe(t('zh', 'cashReversalRecorded'));
    expect(requireTestid('holding-event-result-reversal-of').textContent?.trim())
      .toBe(tf('zh', 'cashReversalOf', { date: '2026-10-20' }));
    expect(portfolioRevisionCause.value).toBe('shareAdjustment');
    expect(dialogText()).not.toContain(ORIGINAL_UUID);
  });

  it('submitsAStockDividendReversalWithTheRecordedQuantity', async () => {
    const dto = reversalAdjustmentDto({ type: 'STOCK_DIVIDEND', quantityDelta: 50, ratioNew: null, ratioOld: null, effectiveDate: '2026-10-01' });
    const { fetchImpl } = await mountDialog({ fetchImpl: adjustmentFetch(dto), props: reversalProps(STOCK_DIVIDEND_ROW) });

    expect(requireTestid('holding-event-reversal-original').textContent).toContain(t('zh', 'activityKindStockDividend'));
    await submit();
    expect(bodiesOf(adjustmentCalls(fetchImpl))[0]).toEqual({
      symbol: 'AAPL',
      type: 'STOCK_DIVIDEND',
      quantity: 50,
      ratioNew: null,
      ratioOld: null,
      effectiveDate: '2026-10-01',
      note: null,
      reversalOfId: ORIGINAL_UUID,
    });
  });

  it('reversalConflictsLockSubmitAndAskTheOpenerToReload', async () => {
    const cases: Array<[string, number, string, PortfolioActivityDto]> = [
      ['DIVIDEND_ALREADY_REVERSED', 409, 'cashErrAlreadyReversed', DIVIDEND_ROW],
      ['DIVIDEND_NOT_REVERSIBLE', 409, 'cashErrNotReversible', DIVIDEND_ROW],
      ['DIVIDEND_NOT_FOUND', 404, 'cashErrOriginalNotFound', DIVIDEND_ROW],
      ['SHARE_ADJUSTMENT_ALREADY_REVERSED', 409, 'cashErrAlreadyReversed', SPLIT_ROW],
      ['SHARE_ADJUSTMENT_NOT_REVERSIBLE', 409, 'holdingEventErrAdjustmentNotReversible', SPLIT_ROW],
      ['SHARE_ADJUSTMENT_NOT_FOUND', 404, 'cashErrOriginalNotFound', STOCK_DIVIDEND_ROW],
    ];
    for (const [code, status, key, row] of cases) {
      const fail = () => failure(code, { status });
      const { fetchImpl, onReversalConflict } = await mountDialog({
        fetchImpl: holdingEventFetch({ dividends: fail, adjustments: fail }),
        props: reversalProps(row),
      });
      await submit();

      expect(errorText(), code).toContain(t('zh', key));
      expect(requireTestid('holding-event-error-code').textContent?.trim()).toBe(code);
      expect(onReversalConflict, code).toHaveBeenCalledTimes(1);
      expect(onReversalConflict).toHaveBeenCalledWith(code);
      expect(submitButton().disabled, `${code}:此原紀錄不可再沖銷`).toBe(true);

      // 改備註也不解鎖,錯誤(送出鈕 disabled 的可見原因)持續顯示。
      await typeInto('holding-event-note', 'retry');
      expect(submitButton().disabled, code).toBe(true);
      expect(errorText(), code).toContain(t('zh', key));
      await submit();
      expect(callsTo(fetchImpl, '/portfolio/').length, `${code}:鎖定後不得再送`).toBe(1);
      expect(bodyText()).not.toContain(BACKEND_MESSAGE_CANARY);
      cleanupMounted();
    }
  });

  it('reversalInsufficientHoldingShowsTheReversalCopyAndKeepsTheKey', async () => {
    const uuids = stubUuids();
    let attempt = 0;
    const { fetchImpl, onReversalConflict } = await mountDialog({
      fetchImpl: holdingEventFetch({
        adjustments: () => (++attempt === 1
          ? failure('TRADE_INSUFFICIENT_HOLDING', { status: 409 })
          : okResponse(reversalAdjustmentDto())),
      }),
      props: reversalProps(SPLIT_ROW),
    });
    await submit();

    expect(errorText()).toContain(t('zh', 'holdingEventErrReversalNoHolding'));
    expect(errorText(), '不是 form 模式的無持倉文案').not.toContain(t('zh', 'holdingEventErrNoHolding'));
    expect(onReversalConflict, '持股不足不是沖銷衝突').not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(false);

    await submit();
    expect(keysOf(adjustmentCalls(fetchImpl))).toEqual(['key-1', 'key-1']);
    expect(uuids).toHaveBeenCalledTimes(1);
  });

  it('editingTheReversalNoteMintsANewKey', async () => {
    stubUuids();
    let attempt = 0;
    const { fetchImpl } = await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => {
          attempt += 1;
          if (attempt <= 2) throw new TypeError('network down');
          return okResponse(REVERSAL_DIVIDEND_DTO);
        },
      }),
      props: reversalProps(DIVIDEND_ROW),
    });
    await submit();
    expect(errorText()).toContain(t('zh', 'cashErrNetwork'));
    await submit();
    await typeInto('holding-event-note', 'changed');
    await submit();

    expect(keysOf(dividendCalls(fetchImpl)), '重試沿用;改備註換新').toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('reversalValueMismatchFallsBackToTheBottomValidationCopy', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('VALIDATION_FAILED', { fields: { amount: FIELD_VALUE_CANARY } }),
      }),
      props: reversalProps(DIVIDEND_ROW),
    });
    await submit();

    // 沖銷畫面沒有金額輸入框:欄位錯誤對不到節點,必須退回底部,不得按了送出卻看不到任何東西。
    expect(errorText()).toContain(t('zh', 'holdingEventErrValidation'));
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });

  it('closingFromTheReversalResultUsesOnlyDone', async () => {
    const { onClose } = await mountDialog({
      fetchImpl: holdingEventFetch({ dividends: () => okResponse(REVERSAL_DIVIDEND_DTO) }),
      props: reversalProps(DIVIDEND_ROW),
    });
    await submit();
    const footerButtons = [...document.body.querySelectorAll<HTMLButtonElement>('.ft button')];
    expect(footerButtons.map(button => button.dataset.testid)).toEqual(['holding-event-done']);
    await click(requireTestid('holding-event-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mapsReversalCodesInTheCopyTable', () => {
    expect(holdingEventDialogSource).toMatch(/emit\('reversalConflict'/);
    expect(holdingEventDialogSource).toMatch(/holdingEventErrReversalNoHolding/);
  });
});

// =====================================================================================
// quick-261107-1j4(Yuan 2026-11-07 裁決 3B / 4):
//   B1 —— 入帳時間與除權日錯誤分「空白 / 早於 1900-01-01 / 晚於上限」三種文案;
//   WR-09 —— 除權日預設值與 max 用標的市場的今天(鏡像後端 TradingDay.of),欄位旁提示市場日期;
//   IN-09 —— 時間相依的合法性隨 reactive 時鐘更新,不需編輯欄位。
// 時間一律以假時鐘固定,不依賴執行環境時區。
// =====================================================================================

/** 2026-11-05T01:00Z:紐約仍是 11-04(EST),台北 / UTC 已是 11-05。 */
const WR09_NOW = Date.parse('2026-11-05T01:00:00Z');

/**
 * 固定時鐘。預設只假 `Date`:送出路徑的 `flushAsync` 需要真的 macrotask hop 才跑得完 fetch → json → nextTick;
 * 需要推進 debounce / interval 的測試傳 `{ timers: true }` 改假全部計時器(以 `advance()` 推進)。
 */
function useWr09Clock({ timers = false }: { timers?: boolean } = {}) {
  if (timers) vi.useFakeTimers();
  else vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WR09_NOW);
}

function effectiveDateInput(): HTMLInputElement {
  return requireTestid('holding-event-effective-date') as HTMLInputElement;
}

function marketDateHint(): string {
  return requireTestid('holding-event-market-date').textContent?.trim() ?? '';
}

function marketHintFor(lang: Lang, zoneKey: string): string {
  return tf(lang, 'holdingEventMarketDate', { zone: t(lang, zoneKey) });
}

const TSMC_ASSET = assetDto('2330', { name: 'TSMC', market: 'TW', currency: 'TWD' });
const BTC_ASSET = assetDto('BTC', { name: 'Bitcoin', assetType: 'CRYPTO', market: 'BINANCE', currency: 'USDT' });
/** E2:持倉自帶 assetType / market(後端 HoldingDto.market,2026-11-07)。 */
const TSMC_HOLDING = { totalQuantity: 1000, currency: 'TWD', name: 'TSMC', assetType: 'STOCK', market: 'TW' };

describe('HoldingEventDialog — 入帳時間 / 除權日三種文案(quick-261107-1j4 B1)', () => {
  it('paidAt:清空 → 請填寫;早於 1900-01-01 → 不可早於;未來 → 既有文案', async () => {
    await mountDialog();
    await typeInto('holding-event-amount', '100');
    const input = requireTestid('holding-event-paid-at') as HTMLInputElement;

    await setValue(input, '');
    input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAtRequired'));

    await setValue(input, '1800-01-01T00:00');
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAtTooEarly'));

    await setValue(input, toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAt'));
  });

  it('effectiveDate:清空 → 請填寫;1899-12-31 → 不可早於;晚於市場今天 → 既有文案', async () => {
    useWr09Clock();
    await mountDialog({ lang: 'en', props: { initialMode: 'stockDividend' } });
    await typeInto('holding-event-shares', '5');
    const input = effectiveDateInput();

    await setValue(input, '');
    input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('effectiveDate')).toBe(t('en', 'holdingEventErrEffectiveDateRequired'));

    await setValue(input, '1899-12-31');
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('effectiveDate')).toBe(t('en', 'holdingEventErrEffectiveDateTooEarly'));

    // 持倉 market US → 紐約:市場今天 = 2026-11-04,11-05 晚於上限。
    await setValue(input, '2026-11-05');
    expect(submitButton().disabled).toBe(true);
    expect(fieldError('effectiveDate')).toBe(t('en', 'holdingEventErrEffectiveDate'));

    await setValue(input, '1900-01-01');
    expect(fieldError('effectiveDate')).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
  });

  it('後端 fields.paidAt 且目前輸入合法 → 既有文案(值不入 DOM)', async () => {
    await mountDialog({
      fetchImpl: holdingEventFetch({
        dividends: () => failure('VALIDATION_FAILED', { fields: { paidAt: FIELD_VALUE_CANARY } }),
      }),
    });
    await fillValidDividend();
    await submit();

    expect(fieldError('paidAt')).toBe(t('zh', 'holdingEventErrPaidAt'));
    expect(bodyText()).not.toContain(FIELD_VALUE_CANARY);
  });
});

describe('HoldingEventDialog — 除權日用標的市場的今天(quick-261107-1j4 WR-09)', () => {
  it('typeahead 選美股 → 預設與 max = 紐約日期 2026-11-04,提示「以美東日期計」', async () => {
    useWr09Clock({ timers: true });
    await mountDialog({
      fetchImpl: holdingEventFetch({ assets: () => assetPage([AAPL_ASSET]) }),
      props: { ...FROM_TRADES, initialMode: 'stockDividend' },
    });
    await typeSymbol('AAPL');
    await advance(250);

    expect(effectiveDateInput().value).toBe('2026-11-04');
    expect(effectiveDateInput().max).toBe('2026-11-04');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneNewYork'));
    expect(marketDateHint()).toContain(t('zh', 'marketZoneNewYork'));
  });

  it('typeahead 選台股 → 2026-11-05 + 台北;選加密 → 2026-11-05 + UTC', async () => {
    useWr09Clock({ timers: true });
    await mountDialog({
      fetchImpl: holdingEventFetch({
        assets: query => assetPage(query.toUpperCase() === 'BTC' ? [BTC_ASSET] : [TSMC_ASSET]),
      }),
      props: { ...FROM_TRADES, initialMode: 'split' },
    });

    await typeSymbol('2330');
    await advance(250);
    expect(effectiveDateInput().value).toBe('2026-11-05');
    expect(effectiveDateInput().max).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneTaipei'));

    await typeSymbol('BTC');
    await advance(250);
    expect(effectiveDateInput().value).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneUtc'));
  });

  it('從持倉開啟(API mode):直接用持倉的 market,不呼叫 /assets;美股 → 2026-11-04 + 美東', async () => {
    useWr09Clock();
    // /assets 有路由:元件若仍去查,呼叫紀錄會留下(而不是被未路由的丟錯吞掉)。
    const fetchImpl = holdingEventFetch({ assets: () => assetPage([AAPL_ASSET]) });
    await mountDialog({ fetchImpl, props: { initialMode: 'stockDividend' } });

    expect(callsTo(fetchImpl, '/assets'), '從持倉開啟不得再以代號查市場').toHaveLength(0);
    expect(effectiveDateInput().value).toBe('2026-11-04');
    expect(effectiveDateInput().max).toBe('2026-11-04');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneNewYork'));
  });

  it('從持倉開啟台股持倉(market TW)→ 2026-11-05 + 台北,不呼叫 /assets', async () => {
    useWr09Clock();
    const fetchImpl = holdingEventFetch({ assets: () => assetPage([TSMC_ASSET]) });
    await mountDialog({
      fetchImpl,
      props: { symbol: '2330', holding: TSMC_HOLDING, initialMode: 'stockDividend' },
    });

    expect(callsTo(fetchImpl, '/assets')).toHaveLength(0);
    expect(effectiveDateInput().value).toBe('2026-11-05');
    expect(effectiveDateInput().max).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneTaipei'));
  });

  it('從持倉開啟加密持倉(assetType CRYPTO)→ 2026-11-05 + UTC,不看 market', async () => {
    useWr09Clock();
    const fetchImpl = holdingEventFetch({ assets: () => assetPage([BTC_ASSET]) });
    await mountDialog({
      lang: 'en',
      fetchImpl,
      props: {
        symbol: 'BTC',
        holding: { totalQuantity: 1, currency: 'USDT', name: 'Bitcoin', assetType: 'CRYPTO', market: 'US' },
        initialMode: 'split',
      },
    });

    expect(callsTo(fetchImpl, '/assets')).toHaveLength(0);
    expect(effectiveDateInput().value).toBe('2026-11-05');
    expect(effectiveDateInput().max).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('en', 'marketZoneUtc'));
  });

  it('持倉 market 為 null / 無法辨識 / 缺欄位 → UTC 日期(鏡像 TradingDay.of),提示照實寫 UTC', async () => {
    const holdings: Array<Record<string, unknown>> = [
      { totalQuantity: 10, currency: 'USD', name: 'Null Market', assetType: 'STOCK', market: null },
      { totalQuantity: 10, currency: 'GBP', name: 'Unknown Market', assetType: 'STOCK', market: 'LSE' },
      { totalQuantity: 10, currency: 'USD', name: 'No Market Field' },
    ];
    for (const holding of holdings) {
      useWr09Clock();
      const fetchImpl = holdingEventFetch({ assets: () => assetPage([AAPL_ASSET]) });
      await mountDialog({ lang: 'en', fetchImpl, props: { holding, initialMode: 'stockDividend' } });

      const label = String(holding.name);
      expect(callsTo(fetchImpl, '/assets'), label).toHaveLength(0);
      expect(effectiveDateInput().value, label).toBe('2026-11-05');
      expect(effectiveDateInput().max, label).toBe('2026-11-05');
      expect(marketDateHint(), label).toBe(marketHintFor('en', 'marketZoneUtc'));
      expect(testid('holding-event-error'), label).toBeNull();
      cleanupMounted();
    }
  });

  it('從持倉開啟(mock mode):同樣不呼叫 market.searchAssets,台股持倉 → 台北提示', async () => {
    useWr09Clock();
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    const searchAssets = vi.spyOn(getRuntimeApiClients().market, 'searchAssets');
    mountWithPinia(HoldingEventDialog, {
      open: true,
      lang: 'zh',
      symbol: '2330.TW',
      holding: { ...TSMC_HOLDING, name: '台積電' },
      initialMode: 'stockDividend',
    });
    await flushAsync();

    expect(getRuntimeApiClients().mode).toBe('mock');
    expect(searchAssets).not.toHaveBeenCalled();
    expect(effectiveDateInput().value).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneTaipei'));
  });

  it('市場日期提示納入除權日欄位的 aria-describedby', async () => {
    useWr09Clock();
    await mountDialog({ props: { initialMode: 'stockDividend' } });

    const hint = requireTestid('holding-event-market-date');
    expect(hint.id).toBeTruthy();
    expect((effectiveDateInput().getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(hint.id);
  });

  it('typeahead 尚未選定標的 → UTC fallback;選台股後未動過的預設值跟著更新,動過的不覆寫', async () => {
    useWr09Clock({ timers: true });
    await mountDialog({
      fetchImpl: holdingEventFetch({
        assets: query => assetPage(query.toUpperCase() === 'AAPL' ? [AAPL_ASSET] : [TSMC_ASSET]),
      }),
      props: { ...FROM_TRADES, initialMode: 'stockDividend' },
    });
    expect(effectiveDateInput().value, '尚未選定 → UTC fallback').toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneUtc'));

    await typeSymbol('AAPL');
    await advance(250);
    expect(effectiveDateInput().value, '未動過 → 跟隨紐約日期').toBe('2026-11-04');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneNewYork'));

    await setValue(effectiveDateInput(), '2026-11-01');
    effectiveDateInput().dispatchEvent(new Event('blur'));
    await typeSymbol('2330');
    await advance(250);
    expect(effectiveDateInput().value, '使用者動過的值不得被覆寫').toBe('2026-11-01');
    expect(effectiveDateInput().max).toBe('2026-11-05');
    expect(marketDateHint()).toBe(marketHintFor('zh', 'marketZoneTaipei'));
  });

  it('不再有瀏覽器本地今天的 helper,也不再有鎖定標的的額外查詢', () => {
    expect(holdingEventDialogSource).not.toContain('todayLocalDate');
    expect(holdingEventDialogSource).toContain('marketDayRuleOf');
    expect(holdingEventDialogSource).not.toContain('lookupLockedAsset');
    expect(holdingEventDialogSource).not.toContain('lockedLookupSeq');
    // typeahead 仍是唯一的 searchAssets 呼叫點。
    expect(holdingEventDialogSource.match(/searchAssets\(/g) ?? []).toHaveLength(1);
  });
});

describe('HoldingEventDialog — 合法性隨 reactive 時鐘更新(quick-261107-1j4 IN-09)', () => {
  it('paidAt = now + 60s → 送出鈕 disabled;時鐘走過後自動 enabled,不需編輯欄位', async () => {
    useWr09Clock({ timers: true });
    await mountDialog();
    await typeInto('holding-event-amount', '100');
    await setValue(requireTestid('holding-event-paid-at') as HTMLInputElement, toLocalInputValue(new Date(WR09_NOW + 60_000)));
    expect(submitButton().disabled).toBe(true);

    await advance(61_000);
    expect(submitButton().disabled).toBe(false);
    expect(fieldError('paidAt')).toBeUndefined();
  });
});
