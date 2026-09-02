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
import {
  apiLastFill,
  lastCreatedTradeId,
  notifyTradeCreated,
  portfolioRevision,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
import { configureApiClientSessionHandlers } from '../services/apiClient';
import type { AssetDto, HoldingDto, TradeDto } from '../services/apiTypes';
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
  // session handler 是模組級單例;不清會讓上一條測試的 spy 活到下一條(04-11 Test 43)。
  configureApiClientSessionHandlers({});
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

// =====================================================================================
// Phase 4 Plan 11 Task 1 —— 送出路徑:重複送出阻擋(TRAD-04)、idempotency key 生命週期
// (D-14)、只渲染後端 TradeDto 的成功畫面(D-09)。
//
// 本段一律在 **API mode** 走真實 transport(stub 的是 `fetch`,不是 adapter):
// key 的斷言直接讀 `Idempotency-Key` **header**,證明它真的抵達傳輸層,而不只是被
// 傳進某個函式。04-07 的 `tradingApi.test.ts` 已鎖住 adapter 自己的行為,
// 本檔要鎖的是「元件 → header」這條完整路徑。
// =====================================================================================

/**
 * 後端回傳的 `TradeDto`。**刻意與表單輸入矛盾**:表單會送 10 股 @ 190.20
 * (preset AAPL 的 latestPrice),這裡回 7 股 @ 188.88。
 * 成功畫面只要有任何一格改用表單值渲染,Test 30 立刻紅(D-09 / judgment §1)。
 */
const RECORDED_TRADE: TradeDto = {
  id: '6f1c2b7e-1a2b-4c3d-8e9f-0123456789ab',
  symbol: 'AAPL',
  type: 'BUY',
  quantity: 7,
  price: 188.88,
  fee: 1.5,
  note: null,
  executedAt: '2026-08-15T10:30:00+08:00',
  createdAt: '2026-08-15T10:30:05+08:00',
};

function tradeResponse(trade: TradeDto = RECORDED_TRADE): Response {
  return jsonResponse({ success: true, data: trade, error: null, meta: { traceId: 'trace-ok' } });
}

/**
 * 後端錯誤信封。`fields` 預設 **null** —— 這是後端的真實形狀:
 * `apiClient.fieldsFrom` 在空 map 時回 `null` 而不是 `{}`(Pitfall 10)。
 * `message` 一律放一句「絕不得進入 DOM」的字串,讓 T-04-09 的違規一眼可見。
 */
function tradeFailure(
  code: string,
  options: { status?: number; traceId?: string; fields?: Record<string, string> | null } = {},
): Response {
  return jsonResponse(
    {
      success: false,
      data: null,
      error: { code, message: 'BackendMessageMustNotReachTheDom', fields: options.fields ?? null },
      meta: { traceId: options.traceId ?? 'trace-trade' },
    },
    options.status ?? 400,
  );
}

interface TicketRoutes extends MarketRoutes {
  trades?: (init: RequestInit | undefined) => Response | Promise<Response>;
  holdings?: () => Response | Promise<Response>;
  refresh?: () => Response | Promise<Response>;
}

function ticketFetch(routes: TicketRoutes = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) {
      return routes.refresh ? routes.refresh() : jsonResponse({ success: true, data: {}, error: null, meta: {} });
    }
    if (url.includes('/portfolio/holdings')) {
      return routes.holdings ? routes.holdings() : holdingsResponse([]);
    }
    if (url.includes('/trades')) {
      return routes.trades ? routes.trades(init) : tradeResponse();
    }
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

function tradeCalls(fetchImpl: ReturnType<typeof vi.fn>): Array<[string, RequestInit | undefined]> {
  return fetchImpl.mock.calls
    .map(call => [String(call[0]), call[1] as RequestInit | undefined] as [string, RequestInit | undefined])
    .filter(([url]) => url.includes('/trades'));
}

/** 直接讀 `Idempotency-Key` header —— key 生命週期的唯一權威證據。 */
function idempotencyKeys(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return tradeCalls(fetchImpl).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key') ?? '');
}

function tradeBodies(fetchImpl: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return tradeCalls(fetchImpl).map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function holdingsCallCount(fetchImpl: ReturnType<typeof vi.fn>): number {
  return fetchedUrls(fetchImpl).filter(url => url.includes('/portfolio/holdings')).length;
}

/**
 * 可預測的 key 產生器。**必須連 `getRandomValues` 一起代理** —— 整包換掉 `crypto`
 * 會讓同一個測試檔內其他依賴 Web Crypto 的程式碼壞掉。
 * `cleanupMounted()` 的 `vi.unstubAllGlobals()` 會還原。
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

function holding(symbol: string, totalQuantity: number): HoldingDto {
  return {
    assetId: `asset-${symbol.toLowerCase()}`,
    symbol,
    assetName: `${symbol} Corp.`,
    totalQuantity,
    // 以下七欄是 D-15 **明文禁止**元件讀取的(Phase 3 D-04 / judgment §7);
    // 刻意給荒謬值,任何前端損益重算都會產生一眼可辨的數字。
    avgCost: -999,
    costBasis: -999,
    marketPrice: -999,
    marketValue: -999,
    realizedPnl: -999,
    unrealizedPnl: -999,
    roi: -999,
    priceTime: null,
    lastUpdated: null,
  };
}

function holdingsResponse(items: HoldingDto[]): Response {
  return jsonResponse({ success: true, data: items, error: null, meta: { traceId: 'trace-holdings' } });
}

/** 送出鏈比查詢鏈更長(CSRF → POST → readJson → notifyTradeCreated → nextTick)。 */
async function clickDeep(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAsync(16);
}

async function mountSubmitTicket(fetchImpl: ReturnType<typeof vi.fn>) {
  // apiClient 對 unsafe method 會注入 X-XSRF-TOKEN;cookie 不存在時會先打 bootstrap,
  // 那會讓本段的 fetch 呼叫序失去可讀性(tradingApi.test.ts:100-102 的同一手法)。
  document.cookie = 'XSRF-TOKEN=csrf-ticket; path=/';
  await mountApiTicket(fetchImpl, { sym: 'AAPL' });
}

async function gotoReview() {
  await clickDeep(requireTestid('ticket-review-advance'));
}

async function submitTrade() {
  await clickDeep(requireTestid('ticket-submit'));
}

async function backToEdit() {
  await clickDeep(requireTestid('ticket-back-to-edit'));
}

function submitButton(): HTMLButtonElement {
  return requireTestid('ticket-submit') as HTMLButtonElement;
}

function advanceButton(): HTMLButtonElement {
  return requireTestid('ticket-review-advance') as HTMLButtonElement;
}

/** 從 `?raw` 原始碼裡切出某個 `data-testid` 所屬的那一個標籤。 */
function sourceTagOf(id: string): string {
  const anchor = orderTicketSource.indexOf(`data-testid="${id}"`);
  expect(anchor, `原始碼找不到 data-testid="${id}"`).toBeGreaterThan(-1);
  const start = orderTicketSource.lastIndexOf('<', anchor);
  const end = orderTicketSource.indexOf('>', anchor);
  return orderTicketSource.slice(start, end + 1);
}

describe('OrderTicket 送出路徑 — 重複送出阻擋與 key 生命週期(04-11 / TRAD-04 / D-14)', () => {
  it('Test 22(TRAD-04):送出中送出鈕明確 disabled,標籤換成「記錄中…」', async () => {
    stubUuids();
    const pending = deferred<Response>();
    await mountSubmitTicket(ticketFetch({ trades: () => pending.promise }));
    await gotoReview();
    await submitTrade();

    // **明確的 guard**,不是「按鈕從 DOM 消失」的副作用(Q6.2)。
    expect(submitButton().disabled, '送出中必須有明確的 :disabled').toBe(true);
    expect(submitButton().textContent?.trim()).toBe(t('en', 'recordingTrade'));

    // §5:標籤變化不得造成版位跳動。jsdom 不套用 scoped CSS 也算不出寬度,
    // 所以用原始碼斷言 —— 送出鈕必須帶一個有 min-width 的專屬 class。
    expect(sourceTagOf('ticket-submit'), '送出鈕缺少固定寬度的 class').toContain('btn-submit');
    expect(orderTicketSource, '.btn-submit 必須宣告 min-width').toMatch(/\.btn-submit\s*\{[^}]*min-width:/);
  });

  it('Test 23(TRAD-04):連按送出兩次只呼叫一次 createTrade', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const fetchImpl = ticketFetch({ trades: () => pending.promise });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();

    await submitTrade();
    await submitTrade();

    expect(tradeCalls(fetchImpl), '連點兩次只得送出一次').toHaveLength(1);
  });

  it('Test 24(§5 凍結清單):送出中整張 ticket 凍結且有可讀的狀態播報', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const closes = vi.fn();
    document.cookie = 'XSRF-TOKEN=csrf-ticket; path=/';
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', ticketFetch({ trades: () => pending.promise }));
    resetRuntimeApiClientsForTests();
    mountWithPinia(OrderTicket, {
      open: true,
      lang: 'en',
      preset: { sym: 'AAPL' },
      onClose: closes,
      onNavigate: () => {},
      onToast: () => {},
    });
    await flushAsync(16);
    await gotoReview();
    await submitTrade();

    expect((requireTestid('ticket-back-to-edit') as HTMLButtonElement).disabled).toBe(true);

    // 遮罩與 ✕ 都不得關閉 ticket(in-flight 的寫入不可被中途丟棄)。
    const mask = document.body.querySelector<HTMLElement>('.mask');
    expect(mask).toBeTruthy();
    await clickDeep(mask!);
    await clickDeep(requireTestid('ticket-close'));
    expect(closes, '送出中不得關閉 ticket').not.toHaveBeenCalled();

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true');

    const status = requireTestid('ticket-submitting-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    // 不得只有 spinner —— 必須有可讀文字。
    expect(status.textContent?.trim()).toBe(t('en', 'recordingTrade'));

    // step 1 的輸入在 review 步驟不在 DOM(v-if),無法用 DOM 斷言;
    // 改以原始碼鎖住綁定 —— 回退到 ticket 步驟後也不得可編輯。
    for (const id of ['ticket-symbol-input', 'ticket-qty', 'ticket-price', 'ticket-fee', 'ticket-executed-at', 'ticket-note']) {
      expect(sourceTagOf(id), `${id} 缺少 :disabled="submitting"`).toContain(':disabled="submitting"');
    }
  });

  it('Test 25(D-14 規則 1):開啟 ticket 不產生 key,按下送出才產生一把', async () => {
    const randomUUID = stubUuids();
    await mountSubmitTicket(ticketFetch());

    expect(randomUUID, '開啟 ticket 不得預先產生 key').not.toHaveBeenCalled();

    await gotoReview();
    await submitTrade();

    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('Test 26(D-14 規則 1):網路失敗後不改欄位直接重試,沿用同一把 key', async () => {
    stubUuids();
    let fail = true;
    const fetchImpl = ticketFetch({
      trades: () => {
        if (fail) throw new TypeError('NetworkErrorRawDetail');
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    fail = false;
    await submitTrade();

    const keys = idempotencyKeys(fetchImpl);
    expect(keys).toHaveLength(2);
    expect(keys[1], '同一次嘗試的重試必須沿用同一把 key').toBe(keys[0]);
  });

  it('Test 27(D-14 規則 2):失敗後改過數量,下次送出換新 key', async () => {
    stubUuids();
    let fail = true;
    const fetchImpl = ticketFetch({
      trades: () => {
        if (fail) throw new TypeError('NetworkErrorRawDetail');
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    await backToEdit();
    await setInput(requireInput('ticket-qty'), '3');
    fail = false;
    await gotoReview();
    await submitTrade();

    const keys = idempotencyKeys(fetchImpl);
    expect(keys).toHaveLength(2);
    expect(keys[1], '改過欄位是新意圖,必須換新 key').not.toBe(keys[0]);
  });

  it('Test 28(D-14／D-07 互鎖):400 → 改數量 → 再送,成功建立而不是 409', async () => {
    stubUuids();
    let attempt = 0;
    const fetchImpl = ticketFetch({
      trades: () => {
        attempt += 1;
        if (attempt === 1) {
          return tradeFailure('VALIDATION_FAILED', {
            status: 400,
            fields: { quantity: 'must be greater than or equal to 0.00000001' },
          });
        }
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    // 欄位級錯誤自動退回 ticket 步驟,否則使用者在 review 看不到出錯的欄位。
    await setInput(requireInput('ticket-qty'), '3');
    await gotoReview();
    await submitTrade();

    const keys = idempotencyKeys(fetchImpl);
    expect(keys[1], '改過欄位換新 key —— 這正是避開 409 KEY_REUSED 的機制').not.toBe(keys[0]);
    expect(testid('ticket-result'), '第二次應真的建立成功').toBeTruthy();
    expect(bodyText()).not.toContain('TRADE_IDEMPOTENCY_KEY_REUSED');
  });

  it('Test 29(DP-11):改了又改回原值,仍視為「我動過了」而換新 key', async () => {
    stubUuids();
    let fail = true;
    const fetchImpl = ticketFetch({
      trades: () => {
        if (fail) throw new TypeError('NetworkErrorRawDetail');
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    await backToEdit();
    const qtyInput = requireInput('ticket-qty');
    const original = qtyInput.value;
    await setInput(qtyInput, '11');
    await setInput(qtyInput, original);

    fail = false;
    await gotoReview();
    await submitTrade();

    const keys = idempotencyKeys(fetchImpl);
    // 不做 form 物件深比較 —— 使用者的心智模型是「我動過了」,他期待新 key。
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('Test 30(D-09):成功畫面只渲染後端 TradeDto,即使它與表單輸入矛盾', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch());

    // 表單實際送出的是 10 股 @ 190.20(preset AAPL 的 latestPrice)。
    expect(requireInput('ticket-qty').value).toBe('10');
    expect(requireInput('ticket-price').value).toBe('190.2');

    await gotoReview();
    await submitTrade();

    // 後端回的是 7 股 @ 188.88 —— 畫面必須跟後端走。
    expect(requireTestid('ticket-result-price').textContent).toContain('188.88');
    expect(requireTestid('ticket-result-price').textContent).not.toContain('190.20');
    expect(requireTestid('ticket-result-qty').textContent?.trim()).toBe('7');
  });

  it('Test 31(D-09):交易編號完整顯示,且畫面沒有任何撮合語意', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch());
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-result-trade-id').textContent?.trim()).toBe(RECORDED_TRADE.id);
    expect(requireTestid('ticket-result-executed-at').textContent).toContain(RECORDED_TRADE.executedAt);

    for (const term of ['Avg fill', 'Order ID', '成交均價', '訂單號']) {
      expect(bodyText(), `成功畫面出現禁用語:${term}`).not.toContain(term);
    }
  });

  it('Test 32(U-03 冪等命中):同一把 key 重送拿到既有交易,畫面與首次建立完全相同', async () => {
    stubUuids();
    let fail = true;
    const fetchImpl = ticketFetch({
      trades: () => {
        if (fail) throw new TypeError('NetworkErrorRawDetail');
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    fail = false;
    await submitTrade();

    const keys = idempotencyKeys(fetchImpl);
    expect(keys[1], 'replay 必須沿用同一把 key').toBe(keys[0]);

    // 目前的 API 契約沒有任何 replay 訊號,所以**不做**「這筆已存在」的變體。
    expect(requireTestid('ticket-result-trade-id').textContent?.trim()).toBe(RECORDED_TRADE.id);
    expect(requireTestid('ticket-result-price').textContent).toContain('188.88');
    for (const term of ['already', 'Already', '已存在', 'duplicate', 'Duplicate']) {
      expect(bodyText(), `冪等命中不得出現變體文案:${term}`).not.toContain(term);
    }
  });

  it('Test 33(U-03 連帶契約):replay 也必須呼叫 notifyTradeCreated', async () => {
    stubUuids();
    let fail = true;
    const fetchImpl = ticketFetch({
      trades: () => {
        if (fail) throw new TypeError('NetworkErrorRawDetail');
        return tradeResponse();
      },
    });
    await mountSubmitTicket(fetchImpl);
    await gotoReview();
    await submitTrade();

    // 網路失敗那一次什麼都不該廣播。
    expect(portfolioRevision.value).toBe(0);

    fail = false;
    await submitTrade();

    // 少做會讓「網路失敗後重試成功」的使用者看不到 portfolio 更新。
    expect(portfolioRevision.value).toBeGreaterThan(0);
    expect(lastCreatedTradeId.value).toBe(RECORDED_TRADE.id);
    expect(apiLastFill.value).toEqual({
      sym: RECORDED_TRADE.symbol,
      type: RECORDED_TRADE.type,
      qty: RECORDED_TRADE.quantity,
      px: RECORDED_TRADE.price,
    });
  });

  it('Test 34(TRAD-02):payload 恰為七個合約欄位,executedAt 帶 offset', async () => {
    stubUuids();
    const fetchImpl = ticketFetch();
    await mountSubmitTicket(fetchImpl);

    await setInput(requireInput('ticket-fee'), '3');
    await gotoReview();
    await submitTrade();

    const body = tradeBodies(fetchImpl)[0];
    expect(Object.keys(body).sort()).toEqual(
      ['executedAt', 'fee', 'note', 'price', 'quantity', 'symbol', 'type'],
    );
    expect(body.fee, '手續費是使用者輸入值(D-02)').toBe(3);
    expect(String(body.executedAt), 'executedAt 必須帶 offset(後端是 OffsetDateTime)')
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(body.symbol).toBe('AAPL');
    expect(body.type).toBe('BUY');
  });
});

// =====================================================================================
// Phase 4 Plan 11 Task 2 —— D-16 錯誤分派 + D-15 SELL 預檢。
//
// 兩條貫穿全段的硬規則:
//   1. **分派依 `error.code`,絕不假設錯誤出現的順序**(Q0/PR #15 明文警告:
//      PR #15 會把「type 打錯 + symbol 不存在」的優先序從 `ASSET_NOT_FOUND`
//      改回 `TRADE_UNSUPPORTED_TYPE`)。
//   2. **後端的 `fields` value 與 `message` 一律不得進入 DOM**(T-04-09)。
// =====================================================================================

const MSFT: AssetDto = { ...CONTRADICTORY, uuid: 'asset-msft', symbol: 'MSFT', name: 'Microsoft Corp.' };

async function pickOption(symbol: string) {
  symbolInput().dispatchEvent(new FocusEvent('focus'));
  await flushAsync();
  requireTestid(`ticket-symbol-option-${symbol}`)
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await flushAsync(16);
}

async function switchToSell() {
  await clickDeep(requireTestid('ticket-side-sell'));
}

describe('OrderTicket 送出路徑 — D-16 錯誤分派(04-11)', () => {
  it('Test 35(欄位級):fields 的 key 綁到對應輸入框,並自動退回 ticket 步驟', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      trades: () => tradeFailure('VALIDATION_FAILED', {
        status: 400,
        fields: { quantity: 'must be greater than or equal to 0.00000001' },
      }),
    }));
    await gotoReview();
    await submitTrade();

    // 在 review 步驟看不到出錯的欄位 —— 必須退回 ticket(§7 版位表)。
    const node = requireTestid('ticket-field-error-quantity');
    expect(node.textContent?.trim()).toBe(t('en', 'tradeErrQuantity'));

    const qtyInput = requireInput('ticket-qty');
    expect(qtyInput.getAttribute('aria-invalid')).toBe('true');
    expect((qtyInput.getAttribute('aria-describedby') ?? '').split(/\s+/))
      .toContain(node.id);
    expect(node.id, '節點 id 為 trade-{field}-error').toBe('trade-quantity-error');
    // 六個欄位同時觸發會連續朗讀六次,所以欄位級錯誤**不加** role="alert"。
    expect(node.getAttribute('role')).toBeNull();
  });

  it('Test 36(D-16 最重要的 negative test):fields 的英文 value 絕不進入 DOM', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      trades: () => tradeFailure('VALIDATION_FAILED', {
        status: 400,
        fields: { quantity: 'must be greater than or equal to 0.00000001' },
      }),
    }));
    await gotoReview();
    await submitTrade();

    expect(bodyText(), 'Bean Validation 的英文預設訊息不得成為使用者可見輸出')
      .not.toContain('must be greater than or equal to');
    expect(bodyText(), '後端 error.message 同樣不得外洩')
      .not.toContain('BackendMessageMustNotReachTheDom');
  });

  it('Test 37(多欄位):兩個欄位各自出現自己的錯誤節點', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      trades: () => tradeFailure('VALIDATION_FAILED', {
        status: 400,
        fields: { quantity: 'must be greater than 0', price: 'must be greater than 0' },
      }),
    }));
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-field-error-quantity').textContent?.trim()).toBe(t('en', 'tradeErrQuantity'));
    expect(requireTestid('ticket-field-error-price').textContent?.trim()).toBe(t('en', 'tradeErrPrice'));
    expect(requireInput('ticket-price').getAttribute('aria-invalid')).toBe('true');
  });

  it('Test 38(Pitfall 10):409 且 fields 為 null 時顯示底部錯誤,不 crash', async () => {
    stubUuids();
    // 後端 `fieldsFrom` 在空 map 時回 **null** 而不是 `{}`;把 null 當物件展開就會炸。
    await mountSubmitTicket(ticketFetch({
      trades: () => tradeFailure('TRADE_CONFLICT', { status: 409, fields: null }),
    }));
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-error').textContent).toContain(t('en', 'tradeErrConflict'));
    expect(document.body.querySelector('[data-testid^="ticket-field-error-"]')).toBeNull();
  });

  it('Test 39(依 code 分派,不依賴錯誤出現順序):11 種 code 各自的文案 / code / traceId', async () => {
    const cases: Array<{ code: string; status: number; copy: string }> = [
      { code: 'TRADE_INSUFFICIENT_HOLDING', status: 409, copy: 'tradeErrOversell' },
      { code: 'ASSET_NOT_FOUND', status: 404, copy: 'tradeErrAssetNotFound' },
      { code: 'TRADE_CONFLICT', status: 409, copy: 'tradeErrConflict' },
      { code: 'TRADE_IDEMPOTENCY_KEY_REUSED', status: 409, copy: 'tradeErrKeyReused' },
      { code: 'TRADE_UNSUPPORTED_TYPE', status: 400, copy: 'tradeErrValidation' },
      { code: 'TRADE_INVALID_QUANTITY', status: 400, copy: 'tradeErrValidation' },
      { code: 'TRADE_INVALID_PRICE', status: 400, copy: 'tradeErrValidation' },
      // `fields` 為 null 的 VALIDATION_FAILED 沒有欄位可綁,只能落到底部。
      { code: 'VALIDATION_FAILED', status: 400, copy: 'tradeErrValidation' },
      // U-08:單一 unsafe 請求被 CSRF 拒絕 → 顯示在**發起處**,不是全域 banner。
      { code: 'AUTH_CSRF_TOKEN_INVALID', status: 403, copy: 'tradeErrCsrf' },
      { code: 'ACCESS_DENIED', status: 403, copy: 'tradeErrForbidden' },
      { code: 'SOMETHING_COMPLETELY_NEW', status: 500, copy: 'tradeErrUnknown' },
    ];

    for (const scenario of cases) {
      const onRefreshFailed = vi.fn();
      configureApiClientSessionHandlers({ onRefreshFailed });
      stubUuids();
      await mountSubmitTicket(ticketFetch({
        trades: () => tradeFailure(scenario.code, {
          status: scenario.status,
          traceId: `trace-${scenario.code}`,
        }),
      }));
      await gotoReview();
      await submitTrade();

      const box = requireTestid('ticket-error');
      expect(box.getAttribute('role'), `${scenario.code} 的底部錯誤應立即播報`).toBe('alert');
      expect(box.textContent, `${scenario.code} 的文案`).toContain(t('en', scenario.copy));
      expect(requireTestid('ticket-error-code').textContent?.trim()).toBe(scenario.code);
      expect(requireTestid('ticket-error-trace-id').textContent).toContain(`trace-${scenario.code}`);
      expect(bodyText(), `${scenario.code} 洩漏了後端 message`).not.toContain('BackendMessageMustNotReachTheDom');
      // U-08 的實質驗收:CSRF 403 不得升級成全域 session banner。
      expect(onRefreshFailed, `${scenario.code} 不得進入 session 升級路徑`).not.toHaveBeenCalled();

      cleanupMounted();
      resetPortfolioRevisionForTests();
    }
  });

  it('Test 40(network):顯示 tradeErrNetwork,不顯示 raw message,traceId 那一格不渲染', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      trades: () => { throw new TypeError('NetworkErrorRawDetail'); },
    }));
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-error').textContent).toContain(t('en', 'tradeErrNetwork'));
    expect(bodyText()).not.toContain('NetworkErrorRawDetail');
    // 不得顯示 `null`(Phase 3 D-12 的診斷列規則)。
    expect(testid('ticket-error-trace-id'), '非 ApiClientError 沒有 traceId,整格不渲染').toBeNull();
    expect(bodyText()).not.toContain('null');
  });

  it('Test 41(Phase 3 D-12):成功態不得出現任何 traceId', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch());
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-result')).toBeTruthy();
    expect(bodyText(), '診斷資訊只在錯誤狀態出現').not.toContain('trace-');
    expect(testid('ticket-error')).toBeNull();
  });

  it('Test 42(U-04 key 處置表):KEY_REUSED 丟棄 key;CONFLICT 與網路失敗保留', async () => {
    // (a) KEY_REUSED 必須丟棄 —— 否則使用者照文案「重新送出」會再吃一次 409,無出路。
    stubUuids();
    let reused = true;
    const reuseFetch = ticketFetch({
      trades: () => (reused
        ? tradeFailure('TRADE_IDEMPOTENCY_KEY_REUSED', { status: 409 })
        : tradeResponse()),
    });
    await mountSubmitTicket(reuseFetch);
    await gotoReview();
    await submitTrade();
    reused = false;
    await submitTrade();

    const reuseKeys = idempotencyKeys(reuseFetch);
    expect(reuseKeys).toHaveLength(2);
    expect(reuseKeys[1], 'KEY_REUSED 之後必須換新 key,否則使用者卡在無出路的迴圈').not.toBe(reuseKeys[0]);

    cleanupMounted();
    resetPortfolioRevisionForTests();

    // (b) TRADE_CONFLICT 保留 —— 「這次沒寫入,但意圖沒變」,沿用同一把重送是安全的。
    stubUuids();
    let conflict = true;
    const conflictFetch = ticketFetch({
      trades: () => (conflict ? tradeFailure('TRADE_CONFLICT', { status: 409 }) : tradeResponse()),
    });
    await mountSubmitTicket(conflictFetch);
    await gotoReview();
    await submitTrade();
    conflict = false;
    await submitTrade();

    const conflictKeys = idempotencyKeys(conflictFetch);
    expect(conflictKeys[1], 'TRADE_CONFLICT 重送必須沿用同一把 key').toBe(conflictKeys[0]);
  });

  it('Test 43(401 不在 ticket 顯示):走全域 SessionBanner,ticket 內無錯誤節點', async () => {
    const onRefreshFailed = vi.fn();
    configureApiClientSessionHandlers({ onRefreshFailed });
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      trades: () => tradeFailure('AUTH_TOKEN_EXPIRED', { status: 401 }),
      refresh: () => tradeFailure('AUTH_REFRESH_FAILED', { status: 401 }),
    }));
    await gotoReview();
    await submitTrade();

    expect(onRefreshFailed, '401 / refresh 失敗由 apiClient 升級成全域 session 狀態').toHaveBeenCalled();
    expect(testid('ticket-error'), '401 不得在 ticket 內顯示').toBeNull();
    expect(document.body.querySelector('[data-testid^="ticket-field-error-"]')).toBeNull();
  });
});

describe('OrderTicket SELL 預檢(04-11 / D-15 / judgment §5)', () => {
  it('Test 44(顯示與快取):切到 SELL 讀一次 holdings,換 symbol 不再讀', async () => {
    stubUuids();
    const fetchImpl = ticketFetch({
      assets: () => assetPageResponse([CONTRADICTORY, MSFT]),
      holdings: () => holdingsResponse([holding('AAPL', 12), holding('MSFT', 34)]),
    });
    await mountSubmitTicket(fetchImpl);

    expect(holdingsCallCount(fetchImpl), 'BUY 不需要持倉預檢').toBe(0);

    await switchToSell();
    expect(holdingsCallCount(fetchImpl)).toBe(1);
    expect(requireTestid('ticket-sellable-qty').textContent).toContain('12');

    await pickOption('MSFT');
    expect(requireTestid('ticket-sellable-qty').textContent).toContain('34');
    expect(holdingsCallCount(fetchImpl), '該 ticket 生命週期內只讀一次').toBe(1);
  });

  it('Test 45(三態):載入中與讀取失敗都有可讀文字,且都不阻擋送出', async () => {
    stubUuids();
    const pending = deferred<Response>();
    await mountSubmitTicket(ticketFetch({ holdings: () => pending.promise }));
    await switchToSell();

    expect(requireTestid('ticket-sellable-loading').textContent).toContain(t('en', 'sellableQtyLoading'));
    expect(advanceButton().disabled, '預檢載入中不得阻擋送出').toBe(false);

    cleanupMounted();
    resetPortfolioRevisionForTests();

    stubUuids();
    await mountSubmitTicket(ticketFetch({
      holdings: () => failureResponse('PORTFOLIO_HOLDINGS_UNAVAILABLE', 'trace-holdings-down'),
    }));
    await switchToSell();

    expect(requireTestid('ticket-sellable-failed').textContent).toContain(t('en', 'sellableQtyFailed'));
    // 後端仍是權威(judgment §5):讀不到持倉不代表不能記錄交易。
    expect(advanceButton().disabled, '預檢失敗不得阻擋送出').toBe(false);
  });

  it('Test 46(零持倉的文案):顯示「可賣數量:0」,不得寫「您未持有此標的」', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      // 後端 SQL 有 `total_quantity > 0` 過濾(JdbcTradingRepository.java:210),
      // 「從未持有」與「已全數賣出」在回應裡不可分 —— 所以只能說 0,不能說「未持有」。
      holdings: () => holdingsResponse([holding('MSFT', 5)]),
    }));
    await switchToSell();

    expect(requireTestid('ticket-sellable-qty').textContent?.trim()).toBe(`${t('en', 'sellableQty')}: 0`);
    for (const forbidden of ['未持有', 'do not hold', 'not hold', 'No holdings']) {
      expect(bodyText(), `不得宣稱使用者從未持有:${forbidden}`).not.toContain(forbidden);
    }
  });

  it('Test 47(超量):qty 大於可賣數量時顯示 tradeErrOversell 且送出鈕 disabled', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      holdings: () => holdingsResponse([holding('AAPL', 5)]),
    }));
    await switchToSell();

    // preset 預填 qty = 10,可賣只有 5。
    expect(requireInput('ticket-qty').value).toBe('10');
    expect(bodyText()).toContain(t('en', 'tradeErrOversell'));
    expect(advanceButton().disabled).toBe(true);
  });

  it('Test 48(judgment §5 的實質驗收):預檢通過仍可能被後端 409 拒絕', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      holdings: () => holdingsResponse([holding('AAPL', 100)]),
      trades: () => tradeFailure('TRADE_INSUFFICIENT_HOLDING', { status: 409 }),
    }));
    await switchToSell();

    // 前端預檢**通過**(可賣 100,只賣 10)—— 但那只是 UX,不是防護。
    expect(advanceButton().disabled).toBe(false);
    await gotoReview();
    await submitTrade();

    expect(requireTestid('ticket-error').textContent).toContain(t('en', 'tradeErrOversell'));
    expect(requireTestid('ticket-error-code').textContent?.trim()).toBe('TRADE_INSUFFICIENT_HOLDING');
  });

  it('Test 49(快取失效):一筆交易成功後,下次切 SELL 會重新讀 holdings', async () => {
    stubUuids();
    const fetchImpl = ticketFetch({
      holdings: () => holdingsResponse([holding('AAPL', 100)]),
    });
    await mountSubmitTicket(fetchImpl);
    await switchToSell();
    expect(holdingsCallCount(fetchImpl)).toBe(1);

    await gotoReview();
    await submitTrade();
    expect(requireTestid('ticket-result')).toBeTruthy();

    await clickDeep(requireTestid('ticket-record-another'));
    await switchToSell();

    // 交易成功會改變持倉,快取必須跟著 portfolioRevision 失效。
    expect(holdingsCallCount(fetchImpl), '成交後的持倉數字不得沿用舊快取').toBe(2);
  });

  it('Test 50(Phase 3 D-04 / judgment §7):預檢只碰 symbol 與 totalQuantity', async () => {
    for (const field of ['avgCost', 'costBasis', 'unrealizedPnl', 'realizedPnl', 'roi']) {
      expect(orderTicketSource, `SELL 預檢不得引用損益欄位:${field}`).not.toContain(field);
    }
    expect(orderTicketSource).toContain('totalQuantity');
    expect(orderTicketSource).toContain('listHoldings');
  });
});

// =====================================================================================
// PR #9 合併前 review 修正(AGENTS.md 鐵律 6:可見的控制不得靜默 no-op)。
// =====================================================================================

describe('OrderTicket review 步驟 — 可見回饋(F-1 / 鐵律 6)', () => {
  it('Test 51:holdings 在進入 review 後才落地且不足時,review 步驟必須顯示錯誤、送出鈕 disabled、不得送出', async () => {
    stubUuids();
    const pending = deferred<Response>();
    const fetchImpl = ticketFetch({ holdings: () => pending.promise });
    await mountSubmitTicket(fetchImpl);
    await switchToSell();

    // Test 45:預檢載入中不阻擋,使用者可以先進 review。
    expect(advanceButton().disabled).toBe(false);
    await gotoReview();
    expect(bodyText()).toContain(t('en', 'tradeIrreversibleNote'));

    // holdings 此時才回來:可賣 5,preset 的 qty 是 10 → oversell 在 review 步驟才成立。
    pending.resolve(holdingsResponse([holding('AAPL', 5)]));
    await flushAsync(16);

    const alert = requireTestid('ticket-review-error');
    expect(alert.getAttribute('role'), 'review 步驟的錯誤必須立即播報').toBe('alert');
    expect(alert.textContent).toContain(t('en', 'tradeErrOversell'));
    expect(submitButton().disabled, 'canSubmit 翻 false 後送出鈕不得仍可按').toBe(true);

    // 程式化點擊(繞過 disabled)也不得送出,且畫面上仍要有可見錯誤。
    await submitTrade();
    expect(tradeCalls(fetchImpl)).toHaveLength(0);
    expect(bodyText()).toContain(t('en', 'tradeErrOversell'));
  });
});

describe('OrderTicket — 再次開啟 ticket 清除成交後標記(F-2 / UI-SPEC §9 / D-11)', () => {
  it('Test 52:開啟 ticket 時 apiLastFill 與 lastCreatedTradeId 一併清空,revision 不動', async () => {
    notifyTradeCreated(RECORDED_TRADE);
    expect(apiLastFill.value).not.toBeNull();
    expect(lastCreatedTradeId.value).toBe(RECORDED_TRADE.id);

    await mountTicket({ mode: 'api' });

    expect(apiLastFill.value, '「新」標記的壽命到再次開啟 ticket 為止(UI-SPEC §9)').toBeNull();
    expect(lastCreatedTradeId.value, 'D-11 提示的壽命到再次開啟 ticket 為止').toBeNull();
    expect(portfolioRevision.value, '重讀訊號不得被清除').toBe(1);
  });
});

describe('OrderTicket 送出路徑 — D-16 未知 fields key(F-3)', () => {
  it('Test 53:fields 只含前端不認得的 key 時,退回底部的一般驗證錯誤而不是零回饋', async () => {
    stubUuids();
    await mountSubmitTicket(ticketFetch({
      // 今日唯一實例是後端 MissingRequestHeaderException 的 `Idempotency-Key`;
      // 日後後端新增受驗欄位或改 key 命名,同樣不得讓使用者按了送出卻什麼都沒看到。
      trades: () => tradeFailure('VALIDATION_FAILED', {
        status: 400,
        fields: { 'Idempotency-Key': 'required header is missing' },
      }),
    }));
    await gotoReview();
    await submitTrade();

    // 沒有任何欄位可綁 → 退回 ticket 步驟(有輸入框可修),但底部必須有可見、可播報的錯誤。
    expect(testid('ticket-review-advance'), '應退回 ticket 步驟').not.toBeNull();
    const box = requireTestid('ticket-error');
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.textContent).toContain(t('en', 'tradeErrValidation'));
    expect(requireTestid('ticket-error-code').textContent?.trim()).toBe('VALIDATION_FAILED');
    expect(document.body.querySelector('[data-testid^="ticket-field-error-"]')).toBeNull();
    // fields 的 value 與後端 message 一樣不得進入 DOM(T-04-09)。
    expect(bodyText()).not.toContain('required header is missing');
    expect(bodyText()).not.toContain('BackendMessageMustNotReachTheDom');
  });
});
