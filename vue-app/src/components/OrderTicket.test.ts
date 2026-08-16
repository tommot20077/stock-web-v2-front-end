import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

// 走勢圖只斷言「傳進 LineChart 的 data prop」,**不斷言 SVG path** —— 後者是脆弱測試,
// 且 `LineChart.vue:32,37-38` 的 min/max 線性映射本來就有自己的責任範圍。
// 這個 stub 把 prop 原樣記下來,讓 Pitfall 8(string 當 number 用)可被鎖住。
const chartProbe = vi.hoisted(() => ({ data: null as unknown, renders: 0 }));
vi.mock('./LineChart.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'LineChartStub',
      props: { data: { type: Array, required: true } },
      setup(props: { data: unknown }) {
        return () => {
          chartProbe.data = props.data;
          chartProbe.renders += 1;
          return h('div', { 'data-testid': 'ticket-quote-chart' });
        };
      },
    }),
  };
});

import OrderTicket from './OrderTicket.vue';
// 原始碼字面(Vite `?raw`):用來斷言「這段程式碼不存在」——行為測試抓不到的東西。
// mock mode 下畫面看起來一樣正常,所以「元件直接讀 mock store」「用 Math.random 生成成交價」
// 這類問題只有原始碼斷言擋得住(沿用 Positions.test.ts:6 在 Phase 3 鎖 PORT-04 的手法)。
import orderTicketSource from './OrderTicket.vue?raw';
import { t } from '../i18n';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import { resetPortfolioRevisionForTests } from '../services/portfolioRevision';
import type { AssetDto } from '../services/apiTypes';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import type { Lang } from '../types';

// Phase 4 Plan 09(04-09-PLAN.md)。本檔鎖住 ticket 的**骨架契約**:
// judgment §3(不 import mock store)、U-16(假進度與亂數全數移除)、U-01(三步驟)、
// D-02 / D-03(手續費與成交時間欄位)、D-04(API mode 隱藏三組無後端來源的欄位)、
// FLAG-E 與 §Accessibility Contract(icon-only 控件的 accessible name、label 關聯)。
//
// **不在本檔**:typeahead 七態與 debounce/abort(04-10)、送出路徑的 key 生命週期 /
// 錯誤分派 / SELL 預檢(04-11)、三頁 refetch(04-12)。

const APPLE: AssetDto = {
  uuid: 'asset-aapl',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  market: 'US',
  currency: 'USD',
  sector: 'Tech',
  tradeable: true,
  latestPrice: 218.4,
  change: 1.2,
  changePercent: 0.55,
  volumeText: '52.1M',
  high: 220,
  low: 215,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function assetPage(items: AssetDto[]) {
  return jsonResponse({
    success: true,
    data: { items, page: 0, size: 10, totalElements: items.length, totalPages: 1 },
    error: null,
    meta: { traceId: 'trace-ok' },
  });
}

function routedFetch(items: AssetDto[] = [APPLE]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // 走勢圖(04-10 Task 2)也會發請求;骨架契約的測試不關心它,一律回空序列。
    if (url.includes('/klines')) {
      return jsonResponse({ success: true, data: [], error: null, meta: { traceId: 'trace-ok' } });
    }
    if (url.includes('/assets')) return assetPage(items);
    throw new Error(`unexpected fetch: ${url}`);
  });
}

interface MountOptions {
  mode?: 'mock' | 'api';
  lang?: Lang;
  preset?: { sym: string; side?: 'BUY' | 'SELL' } | null;
}

async function mountTicket(options: MountOptions = {}) {
  if (options.mode === 'api') {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', routedFetch());
  }
  // client 以 mode 為 key 快取,切模式前先清(Positions.test.ts:132 的同一個 pitfall)。
  resetRuntimeApiClientsForTests();
  mountWithPinia(OrderTicket, {
    open: true,
    lang: options.lang ?? 'en',
    preset: options.preset === undefined ? { sym: 'AAPL' } : options.preset,
    onClose: () => {},
    onNavigate: () => {},
    onToast: () => {},
  });
  await flushAsync();
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).toBeTruthy();
  return el!;
}

function requireInput(id: string): HTMLInputElement {
  const el = requireTestid(id);
  expect(el.tagName, `${id} 應為輸入控件`).toBe('INPUT');
  return el as HTMLInputElement;
}

function buttonTexts(): string[] {
  return [...document.body.querySelectorAll('button')].map(btn => (btn.textContent ?? '').trim());
}

function bodyText(): string {
  return document.body.textContent ?? '';
}

async function setInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync();
}

afterEach(() => {
  cleanupMounted();
  resetPortfolioRevisionForTests();
});

describe('OrderTicket 骨架契約 — 原始碼字面(judgment §3 / U-16)', () => {
  it('不直接 import 任何 mock store,一律經 getRuntimeApiClients() 取得 adapter', () => {
    expect(orderTicketSource).not.toContain('useMockPortfolioStore');
    expect(orderTicketSource).not.toContain('useMockNotificationsStore');
    expect(orderTicketSource).toContain('getRuntimeApiClients');
  });

  it('不含 Math.random —— 前端不得發明成交價或交易識別(U-16 / T-04-10)', () => {
    expect(orderTicketSource).not.toContain('Math.random');
  });

  it('假進度與亂數的所有符號都已消失(U-16 九列逐行刪除)', () => {
    for (const symbol of ['placing', 'placeStage', 'placeSteps', 'routingMatch', 'avgFillPx', 'placeOrder', 'fillPx', 'orderId']) {
      expect(orderTicketSource, `殘留符號:${symbol}`).not.toContain(symbol);
    }
  });
});

describe('OrderTicket 骨架契約 — 三步驟與欄位(U-01 / D-02 / D-03 / D-04)', () => {
  it('step dots 收斂為三顆(U-01:移除 placing 作為獨立步驟)', async () => {
    expect(orderTicketSource).not.toContain('in 4');
    await mountTicket();
    const dots = requireTestid('ticket-step-dots');
    expect(dots.children).toHaveLength(3);
  });

  it('API mode 不渲染訂單類型 / TIF / 交易後現金(D-04:隱藏,不留空版位)', async () => {
    await mountTicket({ mode: 'api' });

    expect(bodyText()).not.toContain(t('en', 'cashAfter'));
    for (const label of ['Market', 'Limit', 'Day', 'GTC']) {
      expect(buttonTexts(), `API mode 不得出現 ${label} 控件`).not.toContain(label);
    }
  });

  it('mock mode 仍保留訂單類型 / TIF / 交易後現金(D-04:mock 四樣全部保留)', async () => {
    await mountTicket();

    expect(bodyText()).toContain(t('en', 'cashAfter'));
    for (const label of ['Market', 'Limit', 'Day', 'GTC']) {
      expect(buttonTexts(), `mock mode 應保留 ${label} 控件`).toContain(label);
    }
  });

  it('兩個 mode 的畫面都沒有委託單生命週期語意(judgment §1 / D-09)', async () => {
    const forbidden = ['Routing', 'Avg fill', 'Place order', 'Pending', 'Filled'];

    await mountTicket();
    for (const term of forbidden) {
      expect(bodyText(), `mock mode 出現禁用語:${term}`).not.toContain(term);
    }

    cleanupMounted();
    await mountTicket({ mode: 'api' });
    for (const term of forbidden) {
      expect(bodyText(), `API mode 出現禁用語:${term}`).not.toContain(term);
    }
  });

  it('兩個 mode 都有手續費欄位,預設 0 且常駐說明(D-02 / U-14)', async () => {
    for (const mode of ['mock', 'api'] as const) {
      await mountTicket({ mode });

      const fee = requireInput('ticket-fee');
      expect(fee.type).toBe('number');
      expect(fee.value, `${mode} mode 的手續費預設值`).toBe('0');
      expect(bodyText()).toContain(t('en', 'tradeFeeHint'));
      // 0.1% 估算公式已刪除:畫面不得再出現任何「預估手續費」
      expect(bodyText(), `${mode} mode 不得殘留估算手續費`).not.toContain(t('en', 'estFee'));

      cleanupMounted();
    }
  });

  it('兩個 mode 都有成交時間欄位,預設現在且不可晚於現在(D-03)', async () => {
    for (const mode of ['mock', 'api'] as const) {
      await mountTicket({ mode });

      const executedAt = requireInput('ticket-executed-at');
      expect(executedAt.type).toBe('datetime-local');
      expect(executedAt.value, `${mode} mode 的成交時間預設值`).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(executedAt.getAttribute('max'), `${mode} mode 的成交時間上限`).toBeTruthy();
      expect(bodyText()).toContain(t('en', 'tradeExecutedAtHint'));

      cleanupMounted();
    }
  });

  it('API mode 的價格可編輯且預填後端 latestPrice(D-04 連帶效果:MKT 鎖價機制移除)', async () => {
    await mountTicket({ mode: 'api' });

    const price = requireInput('ticket-price');
    expect(price.readOnly).toBe(false);
    expect(price.disabled).toBe(false);
    expect(price.value).toBe(String(APPLE.latestPrice));
  });
});

describe('OrderTicket 骨架契約 — 無障礙(§Accessibility Contract / FLAG-E)', () => {
  it('關閉鈕有可讀的 accessible name,且 ✕ 字符不被重複朗讀', async () => {
    for (const lang of ['en', 'zh'] as const) {
      await mountTicket({ lang });

      const close = requireTestid('ticket-close');
      expect(close.getAttribute('aria-label')).toBe(t(lang, 'closeTicket'));
      const glyph = close.querySelector('[aria-hidden="true"]');
      expect(glyph?.textContent).toContain('✕');

      cleanupMounted();
    }
  });

  it('五個表單輸入框都與自己的 <label for> 程式化關聯', async () => {
    await mountTicket();

    const pairs: Array<[string, string]> = [
      ['ticket-qty', 'trade-qty'],
      ['ticket-price', 'trade-price'],
      ['ticket-fee', 'trade-fee'],
      ['ticket-executed-at', 'trade-executed-at'],
      ['ticket-note', 'trade-note'],
    ];

    for (const [tid, id] of pairs) {
      expect(requireTestid(tid).id, `${tid} 的 id`).toBe(id);
      const label = document.body.querySelector(`label[for="${id}"]`);
      expect(label, `label[for="${id}"]`).toBeTruthy();
    }
  });
});

describe('OrderTicket 骨架契約 — 三步驟流程(U-01 / DP-9)', () => {
  it('ticket → review → 返回修改,欄位值全部保留', async () => {
    await mountTicket();

    await setInput(requireInput('ticket-fee'), '5');
    await setInput(requireInput('ticket-note'), 'backfilled');

    await click(requireTestid('ticket-review-advance'));

    expect(bodyText()).toContain(t('en', 'reviewTrade'));
    expect(bodyText()).toContain(t('en', 'tradeIrreversibleNote'));

    await click(requireTestid('ticket-back-to-edit'));

    expect(requireInput('ticket-qty').value).toBe('10');
    expect(requireInput('ticket-fee').value).toBe('5');
    expect(requireInput('ticket-note').value).toBe('backfilled');
  });
});

// =====================================================================================
// Phase 4 Plan 10 —— D-01:symbol 選單改接後端真實資料。
//
// 本段鎖住 `04-UI-SPEC.md` §Interaction Contract 2 的**七態**、250ms debounce、
// 「只採最後一次結果」的競態處理(DP-12),以及 combobox 的鍵盤操作。
// `04-PATTERNS.md` §No Analog Found 明列:前端沒有任何 typeahead 前例
// (`CmdK.vue` 是本地資料過濾,不是遠端查詢),因此契約以 UI-SPEC 為權威。
// =====================================================================================

/**
 * 後端 `AssetDto`(`AssetDto.java:9-24`)。
 * **注意**:`AssetDto` 的 BigDecimal 欄位**沒有** `@JsonSerialize(ToStringSerializer.class)`,
 * 所以 latestPrice / change / changePercent / high / low 在 JSON 是 **number**(與 `KlineDto` 相反)。
 */
function asset(overrides: Partial<AssetDto> & { symbol: string }): AssetDto {
  return {
    ...APPLE,
    uuid: `asset-${overrides.symbol.toLowerCase()}`,
    name: `${overrides.symbol} Corp.`,
    ...overrides,
  };
}

/** `ApiResponse<PageResponse<AssetDto>>`(`AssetController.java:24`)。 */
function assetPageBody(items: AssetDto[], totalElements = items.length) {
  return {
    success: true,
    data: { items, page: 0, size: 10, totalElements, totalPages: Math.max(1, Math.ceil(totalElements / 10)) },
    error: null,
    meta: { traceId: 'trace-ok' },
  };
}

function assetPageResponse(items: AssetDto[], totalElements = items.length): Response {
  return jsonResponse(assetPageBody(items, totalElements));
}

/** 後端錯誤信封;`ApiClientError.requestId` 來自 `meta.traceId`(`apiClient.ts:113-116`)。 */
function failureResponse(code: string, traceId: string, status = 500): Response {
  return jsonResponse(
    { success: false, data: null, error: { code, message: 'internal' }, meta: { traceId } },
    status,
  );
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** 只路由 `/assets`;`handler` 收到的是解析出來的 `query` 參數。 */
function assetsFetch(handler: (query: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/assets')) {
      const query = new URL(url, 'http://localhost').searchParams.get('query') ?? '';
      return handler(query);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

async function mountApiTicket(
  fetchImpl: ReturnType<typeof vi.fn>,
  preset: MountOptions['preset'] = null,
) {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubGlobal('fetch', fetchImpl);
  resetRuntimeApiClientsForTests();
  mountWithPinia(OrderTicket, {
    open: true,
    lang: 'en',
    preset,
    onClose: () => {},
    onNavigate: () => {},
    onToast: () => {},
  });
  // preset 解析 → pickAsset → watch(selected) → listKlines 是一條長 microtask 鏈,
  // 預設的 6 輪排乾不完(走勢圖會停在 loading)。
  await flushAsync(16);
}

function symbolInput(): HTMLInputElement {
  return requireInput('ticket-symbol-input');
}

function optionRows(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
}

async function focusSymbol() {
  symbolInput().dispatchEvent(new FocusEvent('focus'));
  await flushAsync();
}

async function typeSymbol(value: string) {
  await setInput(symbolInput(), value);
}

async function pressKey(key: string) {
  symbolInput().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await flushAsync();
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await flushAsync();
}

function assetCallQueries(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls
    .map(call => String(call[0]))
    .filter(url => url.includes('/assets'))
    .map(url => new URL(url, 'http://localhost').searchParams.get('query') ?? '');
}

describe('OrderTicket typeahead — 七態(04-10 / D-01 / UI-SPEC §Interaction Contract 2)', () => {
  it('Test 1(idle):聚焦未輸入時列出第 0 頁前 6 筆,且不加任何排序語意的標題', async () => {
    const items = Array.from({ length: 10 }, (_, i) => asset({ symbol: `SYM${i}` }));
    await mountApiTicket(assetsFetch(() => assetPageResponse(items, 10)));
    await focusSymbol();

    expect(testid('ticket-symbol-options')).toBeTruthy();
    expect(optionRows(), 'idle 顯示第 0 頁前 6 筆').toHaveLength(6);
    // 後端沒有「熱門 / 推薦」的排序語意,前端不得宣稱有。
    expect(bodyText()).not.toContain('Popular');
    expect(bodyText()).not.toContain('熱門');
  });

  it('Test 2(debounce 250ms):連打四次只在 250ms 之後送出一次請求,且 query 是最後一次', async () => {
    vi.useFakeTimers();
    const fetchImpl = assetsFetch(() => assetPageResponse([]));
    await mountApiTicket(fetchImpl);
    const baseline = assetCallQueries(fetchImpl).length;

    await typeSymbol('A');
    await typeSymbol('AA');
    await typeSymbol('AAP');
    await typeSymbol('AAPL');

    await advance(240);
    expect(assetCallQueries(fetchImpl).length - baseline, '未滿 250ms 不得發出請求').toBe(0);

    await advance(10);
    const queries = assetCallQueries(fetchImpl).slice(baseline);
    expect(queries, '滿 250ms 只發一次,且只帶最後一次的關鍵字').toEqual(['AAPL']);
  });

  it('Test 3(競態 DP-12):舊查詢晚回應也不得覆蓋新查詢的結果', async () => {
    vi.useFakeTimers();
    const slow = deferred<Response>();
    const fast = deferred<Response>();
    const fetchImpl = assetsFetch((query) => {
      if (query === 'AAP') return slow.promise;
      if (query === 'AAPL') return fast.promise;
      return assetPageResponse([]);
    });
    await mountApiTicket(fetchImpl);

    await typeSymbol('AAP');
    await advance(250);
    await typeSymbol('AAPL');
    await advance(250);

    // 新查詢先回,舊查詢後回 —— 慢網路下這是真實會發生的順序。
    fast.resolve(assetPageResponse([asset({ symbol: 'AAPL' })]));
    await flushAsync();
    slow.resolve(assetPageResponse([asset({ symbol: 'AAP' })]));
    await flushAsync();

    expect(testid('ticket-symbol-option-AAPL'), '最終應渲染 AAPL 的結果').toBeTruthy();
    expect(testid('ticket-symbol-option-AAP'), '舊查詢的晚到結果不得覆蓋').toBeNull();
  });

  it('Test 4(loading):debounce 觸發後、回應前顯示 3 條骨架列與可讀文字', async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetchImpl = assetsFetch(query => (query === 'AA' ? pending.promise : assetPageResponse([])));
    await mountApiTicket(fetchImpl);

    await typeSymbol('AA');
    await advance(250);

    const loading = requireTestid('ticket-symbol-loading');
    expect(loading.querySelectorAll('.skeleton-row'), '骨架列固定 3 條').toHaveLength(3);
    // UI-SPEC:Loading 一律有可讀文字,不得只有 spinner。
    expect(loading.textContent).toContain(t('en', 'loading'));
  });

  it('Test 5(loaded + truncated):列出 10 筆並提示結果被截斷', async () => {
    vi.useFakeTimers();
    const items = Array.from({ length: 10 }, (_, i) => asset({ symbol: `SYM${i}` }));
    const fetchImpl = assetsFetch(query => (query === 'S' ? assetPageResponse(items, 37) : assetPageResponse([])));
    await mountApiTicket(fetchImpl);

    await typeSymbol('S');
    await advance(250);

    expect(optionRows()).toHaveLength(10);
    expect(requireTestid('ticket-symbol-truncated').textContent).toContain(t('en', 'symbolMoreResults'));
  });

  it('Test 6(empty):查無結果顯示 symbolNoResults', async () => {
    vi.useFakeTimers();
    const fetchImpl = assetsFetch(() => assetPageResponse([]));
    await mountApiTicket(fetchImpl);

    await typeSymbol('ZZZZ');
    await advance(250);

    expect(requireTestid('ticket-symbol-empty').textContent).toContain(t('en', 'symbolNoResults'));
    expect(testid('ticket-symbol-no-tradable'), 'empty 與 filtered-empty 必須分開').toBeNull();
  });

  it('Test 7(filtered-empty / U-10):有結果但全部不可交易,與 empty 分開呈現', async () => {
    vi.useFakeTimers();
    const items = [asset({ symbol: 'BND1', tradeable: false }), asset({ symbol: 'BND2', tradeable: false })];
    const fetchImpl = assetsFetch(query => (query === 'BND' ? assetPageResponse(items) : assetPageResponse([])));
    await mountApiTicket(fetchImpl);

    await typeSymbol('BND');
    await advance(250);

    expect(requireTestid('ticket-symbol-no-tradable').textContent).toContain(t('en', 'symbolNoTradable'));
    expect(testid('ticket-symbol-empty'), '有結果就不是 empty').toBeNull();
    expect(optionRows(), '不可交易的標的不得出現在選單').toHaveLength(0);
  });

  it('Test 8(error):顯示 code / traceId / 重試,且不阻擋 ticket 其他欄位', async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetchImpl = assetsFetch((query) => {
      if (query !== 'AA') return assetPageResponse([]);
      if (fail) return failureResponse('ASSET_SEARCH_FAILED', 'trace-err');
      return assetPageResponse([asset({ symbol: 'AAPL' })]);
    });
    await mountApiTicket(fetchImpl);

    await typeSymbol('AA');
    await advance(250);

    expect(requireTestid('ticket-symbol-error').textContent).toContain(t('en', 'symbolSearchFailed'));
    expect(requireTestid('ticket-symbol-error-code').textContent).toContain('ASSET_SEARCH_FAILED');
    expect(requireTestid('ticket-symbol-trace-id').textContent).toContain('trace-err');
    // 錯誤只屬於下拉這個區塊 —— 其他欄位仍可編輯。
    expect(requireInput('ticket-qty').disabled).toBe(false);

    fail = false;
    const before = assetCallQueries(fetchImpl).length;
    await click(requireTestid('ticket-symbol-retry'));
    await flushAsync();
    expect(assetCallQueries(fetchImpl).length, '重試必須真的再打一次').toBe(before + 1);
    expect(testid('ticket-symbol-error')).toBeNull();
  });

  it('Test 9(null 價格):latestPrice 為 null 的列顯示 — 而不是 NaN', async () => {
    const nullPriced = asset({ symbol: 'NULLX', latestPrice: null, change: null, changePercent: null });
    await mountApiTicket(assetsFetch(() => assetPageResponse([nullPriced])));
    await focusSymbol();

    const row = requireTestid('ticket-symbol-option-NULLX');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('NaN');
    expect(row.textContent, 'null 不得被當成 0%').not.toContain('0.00%');
  });

  it('Test 10(D-01 硬規則):不可交易的標的不得讓送出鈕可用', async () => {
    vi.useFakeTimers();
    const fetchImpl = assetsFetch(query => (
      query === 'NOPE'
        ? assetPageResponse([asset({ symbol: 'NOPE', tradeable: false })])
        : assetPageResponse([])
    ));
    await mountApiTicket(fetchImpl);

    await typeSymbol('NOPE');
    await advance(250);

    const advanceBtn = requireTestid('ticket-review-advance') as HTMLButtonElement;
    expect(advanceBtn.disabled, '只有後端確認存在且 tradeable 的標的才能推進').toBe(true);
  });

  it('Test 11(a11y):combobox 屬性齊全,且鍵盤可移動 / 選取 / 關閉', async () => {
    const items = [asset({ symbol: 'AAA' }), asset({ symbol: 'BBB' }), asset({ symbol: 'CCC' })];
    await mountApiTicket(assetsFetch(() => assetPageResponse(items)));
    await focusSymbol();

    const input = symbolInput();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe('trade-symbol-options');
    expect(input.getAttribute('aria-expanded')).toBe('true');

    const listbox = requireTestid('ticket-symbol-options');
    expect(listbox.getAttribute('role')).toBe('listbox');
    const rows = optionRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.id, 'option 必須有唯一 id 供 aria-activedescendant 指向').toBeTruthy();
      expect(row.getAttribute('aria-selected')).toBeTruthy();
    }

    await pressKey('ArrowDown');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[0].id);
    await pressKey('ArrowDown');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[1].id);
    await pressKey('ArrowUp');
    expect(symbolInput().getAttribute('aria-activedescendant')).toBe(rows[0].id);

    await pressKey('Enter');
    expect(symbolInput().value, 'Enter 應選取目前 highlight 的標的').toBe('AAA');
    expect(testid('ticket-symbol-options'), 'Enter 後下拉關閉').toBeNull();

    await focusSymbol();
    expect(testid('ticket-symbol-options')).toBeTruthy();
    await pressKey('Escape');
    expect(testid('ticket-symbol-options'), 'Esc 應關閉下拉').toBeNull();
  });

  it('Test 12(preset 解析):解析中顯示 loading,解析失敗顯示查無標的且欄位仍可編輯', async () => {
    const pending = deferred<Response>();
    const fetchImpl = assetsFetch(query => (query === 'GHOST' ? pending.promise : assetPageResponse([])));
    await mountApiTicket(fetchImpl, { sym: 'GHOST' });

    expect(testid('ticket-symbol-loading'), 'preset 解析中 symbol 欄位顯示 loading 態').toBeTruthy();

    pending.resolve(assetPageResponse([]));
    await flushAsync();

    expect(requireTestid('ticket-symbol-empty').textContent).toContain(t('en', 'symbolNoResults'));
    // 不得靜默留空,也不得回退 data.ts。
    expect(symbolInput().disabled).toBe(false);
    expect(symbolInput().readOnly).toBe(false);
  });
});

// =====================================================================================
// Phase 4 Plan 10 Task 2 —— 報價卡真實數字 + 走勢圖三態(D-01 / UI-SPEC §Interaction Contract 3)。
//
// 報價卡的六格全部來自**同一份** AssetDto,不需要第二個請求;走勢圖來自
// `GET /api/v1/market/{symbol}/klines`,且它的任何失敗態都不得阻擋送出(U-11)。
// =====================================================================================

/**
 * **刻意矛盾的 fixture**:high(999)/ low(1)彼此與 latestPrice(190.20)、
 * changePercent(-1.60)都不自洽。只要前端偷偷重算任何一格,斷言就會紅(judgment §7)。
 *
 * 欄位形狀對應後端 `AssetDto.java:9-24`;其 BigDecimal **沒有**掛
 * `@JsonSerialize(using = ToStringSerializer.class)`,所以在 JSON 是 number。
 */
const CONTRADICTORY: AssetDto = {
  uuid: 'asset-aapl',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  market: 'US',
  currency: 'USD',
  sector: 'Tech',
  tradeable: true,
  latestPrice: 190.2,
  change: -3.1,
  changePercent: -1.6,
  volumeText: 'X-VOL',
  high: 999,
  low: 1,
};

/**
 * 後端 `KlineDto.java:23-30` 的五個 OHLCV 欄位掛
 * `@JsonSerialize(using = ToStringSerializer.class)`,序列化為 **JSON 字串**
 * (與 `AssetDto` 相反)。fixture 必須同形,否則 Pitfall 8 抓不到。
 */
const KLINES_AS_STRINGS = [
  { bucket: '2026-08-15T00:00:00Z', open: '217.00000000', high: '219.00000000', low: '216.50000000', close: '218.40000000', volume: '1000.00000000' },
  { bucket: '2026-08-15T01:00:00Z', open: '218.40000000', high: '220.00000000', low: '218.00000000', close: '219.75000000', volume: '1100.00000000' },
];

function klineResponse(klines: unknown[]): Response {
  return jsonResponse({ success: true, data: klines, error: null, meta: { traceId: 'trace-ok' } });
}

interface MarketRoutes {
  assets?: (query: string) => Response | Promise<Response>;
  klines?: (symbol: string) => Response | Promise<Response>;
}

function marketFetch(routes: MarketRoutes = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/klines')) {
      const symbol = decodeURIComponent(url.split('/market/')[1].split('/')[0]);
      return routes.klines ? routes.klines(symbol) : klineResponse([]);
    }
    if (url.includes('/assets')) {
      const query = new URL(url, 'http://localhost').searchParams.get('query') ?? '';
      return routes.assets ? routes.assets(query) : assetPageResponse([CONTRADICTORY]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function fetchedUrls(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls.map(call => String(call[0]));
}

describe('OrderTicket 報價卡與走勢圖(04-10 / D-01 / UI-SPEC §Interaction Contract 3)', () => {
  it('Test 13(零前端計算):報價卡六格逐字等於 AssetDto,即使欄位彼此不自洽', async () => {
    await mountApiTicket(marketFetch(), { sym: 'AAPL' });

    expect(requireTestid('ticket-quote-last').textContent).toContain('190.20');
    expect(requireTestid('ticket-quote-change').textContent).toContain('-3.10');
    expect(requireTestid('ticket-quote-change-pct').textContent).toContain('-1.60%');
    const range = requireTestid('ticket-quote-range').textContent ?? '';
    expect(range).toContain('1.00');
    expect(range).toContain('999.00');
    expect(requireTestid('ticket-quote-volume').textContent).toContain('X-VOL');
  });

  it('Test 14(null 處理):null 欄位顯示 — 而不是 NaN 或 null', async () => {
    const nulled: AssetDto = {
      ...CONTRADICTORY,
      latestPrice: null,
      change: null,
      changePercent: null,
      high: null,
      low: null,
    };
    await mountApiTicket(marketFetch({ assets: () => assetPageResponse([nulled]) }), { sym: 'AAPL' });

    expect(requireTestid('ticket-quote-last').textContent?.trim()).toBe('—');
    expect(requireTestid('ticket-quote-change').textContent?.trim()).toBe('—');
    expect(requireTestid('ticket-quote-change-pct').textContent?.trim()).toBe('—');
    expect(requireTestid('ticket-quote-range').textContent).not.toContain('NaN');
    expect(bodyText()).not.toContain('NaN');
    expect(bodyText()).not.toContain('null');
  });

  it('Test 15:報價卡不發第二個請求(同一份 AssetDto 已含全部欄位)', async () => {
    const fetchImpl = marketFetch();
    await mountApiTicket(fetchImpl, { sym: 'AAPL' });

    const latestCalls = fetchedUrls(fetchImpl).filter(url => url.includes('/latest'));
    expect(latestCalls, '報價卡不得另外呼叫 /market/{symbol}/latest').toEqual([]);
  });

  it('Test 16(Pitfall 8):傳給 LineChart 的 data prop 是 number[],不是字串', async () => {
    chartProbe.data = null;
    await mountApiTicket(
      marketFetch({ klines: () => klineResponse(KLINES_AS_STRINGS) }),
      { sym: 'AAPL' },
    );

    const data = chartProbe.data as unknown[];
    expect(Array.isArray(data), 'LineChart 應收到陣列').toBe(true);
    expect(data).toHaveLength(2);
    expect(typeof data[0], 'OHLCV 的字串必須先經 closeSeries 轉成 number').toBe('number');
    expect(data[0]).toBe(218.4);
    expect(data[1]).toBe(219.75);
  });

  it('Test 17(走勢圖 loading):骨架與可讀文字並存,且報價卡數字已經顯示', async () => {
    const pending = deferred<Response>();
    await mountApiTicket(marketFetch({ klines: () => pending.promise }), { sym: 'AAPL' });

    const loading = requireTestid('ticket-quote-chart-loading');
    expect(loading.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
    expect(loading.textContent).toContain(t('en', 'loading'));
    // 兩者來源不同端點:走勢圖未回來不得拖垮報價卡。
    expect(requireTestid('ticket-quote-last').textContent).toContain('190.20');
  });

  it('Test 18(走勢圖 empty):無 K 線才顯示空狀態,有資料時必須消失', async () => {
    // dev/demo 環境的 market_prices 未必 backfill 過,所以 empty 很可能發生。
    await mountApiTicket(marketFetch({ klines: () => klineResponse([]) }), { sym: 'AAPL' });
    expect(requireTestid('ticket-quote-chart-empty').textContent).toContain(t('en', 'quoteChartEmpty'));

    cleanupMounted();

    // 有資料時就不得再宣稱「無走勢資料」—— 這條讓寫死的空狀態佔位無法蒙混過關。
    await mountApiTicket(marketFetch({ klines: () => klineResponse(KLINES_AS_STRINGS) }), { sym: 'AAPL' });
    expect(testid('ticket-quote-chart-empty')).toBeNull();
    expect(testid('ticket-quote-chart'), '有資料時應真的畫出走勢圖').toBeTruthy();
  });

  it('Test 19(走勢圖 error):顯示 code / traceId / 重試', async () => {
    let fail = true;
    const fetchImpl = marketFetch({
      klines: () => (fail
        ? failureResponse('KLINE_INTERVAL_INVALID', 'trace-kline', 400)
        : klineResponse(KLINES_AS_STRINGS)),
    });
    await mountApiTicket(fetchImpl, { sym: 'AAPL' });

    const errorBlock = requireTestid('ticket-quote-chart-error');
    expect(errorBlock.textContent).toContain(t('en', 'quoteChartError'));
    expect(errorBlock.textContent).toContain('KLINE_INTERVAL_INVALID');
    expect(errorBlock.textContent).toContain('trace-kline');

    fail = false;
    const before = fetchedUrls(fetchImpl).filter(url => url.includes('/klines')).length;
    await click(requireTestid('ticket-quote-chart-retry'));
    await flushAsync();
    expect(fetchedUrls(fetchImpl).filter(url => url.includes('/klines')).length).toBe(before + 1);
    expect(testid('ticket-quote-chart-error')).toBeNull();
  });

  it('Test 20(U-11 硬規則):走勢圖 loading / empty / error 都不得阻擋送出', async () => {
    const cases: Array<{ name: string; klines: () => Response | Promise<Response> }> = [
      { name: 'loading', klines: () => deferred<Response>().promise },
      { name: 'empty', klines: () => klineResponse([]) },
      { name: 'error', klines: () => failureResponse('KLINE_INTERVAL_INVALID', 'trace-kline', 400) },
    ];

    for (const scenario of cases) {
      await mountApiTicket(marketFetch({ klines: scenario.klines }), { sym: 'AAPL' });

      const advanceBtn = requireTestid('ticket-review-advance') as HTMLButtonElement;
      expect(advanceBtn.disabled, `走勢圖 ${scenario.name} 態不得阻擋送出`).toBe(false);

      cleanupMounted();
    }
  });

  it('Test 21(價格預填):價格等於 AssetDto.latestPrice 且可編輯', async () => {
    await mountApiTicket(marketFetch(), { sym: 'AAPL' });

    const price = requireInput('ticket-price');
    expect(price.value).toBe('190.2');
    expect(price.readOnly).toBe(false);
    expect(price.disabled).toBe(false);
  });
});
