import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Trades from './Trades.vue';
// 原始碼字面(Vite ?raw):斷言 Trades 沒有 import mock store(PORT-04 / judgment §3)。
// 沿用 03-03 / 03-04 的手法 —— 本專案 tsconfig 未含 @types/node,不得用 node:fs。
import tradesSource from './Trades.vue?raw';
import { t } from '../i18n';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import {
  apiLastFill,
  bumpPortfolioRevision,
  notifyTradeCreated,
  resetPortfolioRevisionForTests,
} from '../services/portfolioRevision';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { PaginatedResponse, TradeDto } from '../services/apiTypes';
import { cleanupMounted, flushAsync, mountWithPinia, unmountAll } from '../testUtils';

// Phase 3 Plan 05(03-05-PLAN.md)。API mode 的 Trades 一律把篩選/排序/分頁轉成
// `GET /api/v1/trades` 的 query 參數(D-05/D-06/D-07/D-08),頁碼重置與溢出回退見 D-15,
// CSV 匯出涵蓋當前條件的所有頁(D-10),四態與 traceId 見 D-11/D-12。
// mock mode 必須與 Phase 3 之前逐項一致(五個 chips、client-side 篩選、無分頁、lastFill)。

const CURRENT_YEAR = new Date().getFullYear();

function trade(over: Partial<TradeDto> & { id: string }): TradeDto {
  return {
    symbol: 'AAA',
    type: 'BUY',
    quantity: 1,
    price: 10,
    fee: 0,
    note: null,
    executedAt: '2026-05-16T09:30:00Z',
    createdAt: '2026-05-16T09:30:00Z',
    ...over,
  };
}

function page(over: Partial<PaginatedResponse<TradeDto>> = {}): PaginatedResponse<TradeDto> {
  const items = over.items ?? [];
  return {
    items,
    page: 0,
    size: 20,
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
    error: { code, message: 'backend said no' },
    meta: { traceId },
  }, status);
}

type TradesFetch = ReturnType<typeof vi.fn>;

/** 逐請求記錄 URL 的 fetch double(RESEARCH Pitfall 7)。handler 依「第幾次呼叫」決定回應。 */
function scriptedFetch(handler: (call: number, url: string) => Response | Promise<Response>): TradesFetch {
  let call = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes('/trades')) throw new Error(`unexpected fetch: ${url}`);
    const index = call;
    call += 1;
    return handler(index, url);
  });
}

/**
 * 會真的套用 query 參數的 trades 假後端(篩選 → 排序 → 切片),語意與 03-01-SUMMARY 契約一致:
 * type 篩選、[dateFrom, dateTo) 半開區間、白名單三鍵排序、total = quantity × price(不含 fee)。
 * 前端若漏送任何參數,回傳內容會立刻與斷言不符 —— 這是 CSV「保留篩選」的實質證據。
 */
function fakeBackendFetch(all: TradeDto[]): TradesFetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes('/trades')) throw new Error(`unexpected fetch: ${url}`);
    const p = new URLSearchParams(url.slice(url.indexOf('?') + 1));

    let items = all.filter(tr => {
      const type = p.get('type');
      if (type && tr.type !== type) return false;
      const from = p.get('dateFrom');
      const to = p.get('dateTo');
      const at = Date.parse(tr.executedAt);
      if (from && at < Date.parse(from)) return false;
      if (to && at >= Date.parse(to)) return false;
      return true;
    });

    const sort = p.get('sort') ?? 'executedAt';
    const factor = p.get('direction') === 'asc' ? 1 : -1;
    const key = (tr: TradeDto) => (sort === 'quantity'
      ? tr.quantity
      : sort === 'total' ? tr.quantity * tr.price : Date.parse(tr.executedAt));
    items = [...items].sort((a, b) => (key(a) - key(b)) * factor);

    const pageNo = Number(p.get('page') ?? 0);
    const size = Number(p.get('size') ?? 20);
    return success({
      items: items.slice(pageNo * size, pageNo * size + size),
      page: pageNo,
      size,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / size),
    });
  });
}

async function mountApiTrades(fetchMock: TradesFetch) {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  // Pitfall 7:client 以 mode 為 key 快取,切模式前先清,避免跨測試汙染。
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchMock);
  mountWithPinia(Trades, { lang: 'en', onOrder: () => {} });
  await flushAsync();
}

function urls(fetchMock: TradesFetch): string[] {
  return fetchMock.mock.calls.map(call => String(call[0]));
}

function lastUrl(fetchMock: TradesFetch): string {
  const all = urls(fetchMock);
  expect(all.length, 'at least one /trades request').toBeGreaterThan(0);
  return all[all.length - 1];
}

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

function pagesRequested(fetchMock: TradesFetch): string[] {
  return urls(fetchMock).map(url => paramsOf(url).get('page') ?? '');
}

function testid(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function requireTestid(id: string): HTMLElement {
  const el = testid(id);
  expect(el, `[data-testid="${id}"]`).toBeTruthy();
  return el!;
}

function allTestids(id: string): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

function rows(): HTMLElement[] {
  return allTestids('trades-row');
}

function chipLabels(): string[] {
  return allTestids('trades-chip').map(el => el.textContent!.trim());
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickChip(label: string) {
  const chip = allTestids('trades-chip').find(el => el.textContent?.trim() === label);
  expect(chip, `chip "${label}"`).toBeTruthy();
  click(chip!);
}

function headerCell(text: string): HTMLElement {
  const th = [...document.body.querySelectorAll<HTMLElement>('thead th')]
    .find(el => el.textContent?.trim().startsWith(text));
  expect(th, `<th> starting with "${text}"`).toBeTruthy();
  return th!;
}

/** 攔截 Blob 下載(沿用 task4 的手法),但保留真正的 URL 建構子 —— 假後端要用 URLSearchParams 解析。 */
function captureDownloads() {
  const blobs: Blob[] = [];
  const original = {
    create: (globalThis.URL as unknown as Record<string, unknown>).createObjectURL,
    revoke: (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL,
  };
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:trades-test';
  });
  (globalThis.URL as unknown as Record<string, unknown>).createObjectURL = createObjectURL;
  (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();

  const downloads: string[] = [];
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });

  return {
    blobs,
    downloads,
    createObjectURL,
    restore() {
      (globalThis.URL as unknown as Record<string, unknown>).createObjectURL = original.create;
      (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL = original.revoke;
      clickSpy.mockRestore();
    },
  };
}

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length) restorers.pop()!();
  cleanupMounted();
  // 04-07 硬規則:模組級 singleton 的 reset 必須在**各測試檔自己**的 afterEach 呼叫,
  // 絕不得加進 testSetup.ts(那會搶在 vi.mock 之前綁定真實實作)。
  resetPortfolioRevisionForTests();
});

describe('Trades — API mode 參數轉換與分頁(D-05 / D-06 / D-07 / D-08)', () => {
  it('初始載入明確送出預設排序與分頁參數,並渲染後端回傳的列(D-07)', async () => {
    const fetchMock = scriptedFetch(() => success(page({
      items: [
        trade({ id: 'u-1', symbol: 'NVDA', type: 'BUY', quantity: 3, price: 100, fee: 1, note: 'hello', executedAt: '2026-05-16T09:30:00Z' }),
        trade({ id: 'u-2', symbol: 'TSLA', type: 'SELL', quantity: 2, price: 50, fee: 2, note: null }),
      ],
      totalElements: 2,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);

    const p = paramsOf(lastUrl(fetchMock));
    expect(p.get('sort')).toBe('executedAt');
    expect(p.get('direction')).toBe('desc');
    expect(p.get('page')).toBe('0');
    expect(p.get('size')).toBe('20');
    expect(urls(fetchMock)).toHaveLength(1);

    expect(rows()).toHaveLength(2);
    const first = rows()[0].textContent ?? '';
    expect(first).toContain('2026-05-16');
    expect(first).not.toContain('T09:30');
    expect(first).toContain('NVDA');
    expect(first).toContain('BUY');
    // total 欄 = quantity × price(與後端 total 排序鍵同語意,不含 fee)
    expect(first).toContain('$300');
    expect(first).toContain('hello');
    // note 為 null 時退回破折號,不出現 "null"
    expect(rows()[1].textContent).toContain('—');
    expect(document.body.textContent).not.toContain('null');
  });

  it('row :key 用 TradeDto.id(uuid),同內容不同 id 的交易不共用 key', async () => {
    // 兩筆顯示內容完全相同、只有 id 不同 —— 舊的「多欄拼接 key」在這裡會產生重複 key。
    const twin = { symbol: 'ZZZ', type: 'BUY' as const, quantity: 1, price: 10, fee: 0, note: 'same', executedAt: '2026-03-01T00:00:00Z' };
    const fetchMock = scriptedFetch(() => success(page({
      items: [trade({ id: 'id-a', ...twin }), trade({ id: 'id-b', ...twin })],
      totalElements: 2,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);

    expect(rows()).toHaveLength(2);
    // 結構性斷言(沿用 ?raw 手法):API 列的 key 必須是後端 uuid。
    // 純 DOM 斷言無法區分兩者 —— Vue 對重複 key 只會發 dev warning,仍會渲染兩列。
    expect(tradesSource).toContain(':key="tr.id"');
  });

  it('API mode 的 chips 恰為 All / Buy / Sell / 當年度四個,不渲染 Dividend(D-02)', async () => {
    const fetchMock = scriptedFetch(() => success(page()));
    await mountApiTrades(fetchMock);

    expect(chipLabels()).toEqual(['All', 'Buy', 'Sell', String(CURRENT_YEAR)]);
    expect(document.body.textContent).not.toContain('Dividend');
  });

  it('點 Buy / Sell chip 轉成 type 參數並重置頁碼(D-05 / D-15)', async () => {
    const fetchMock = scriptedFetch(() => success(page({ items: [trade({ id: 'x' })], totalElements: 1, totalPages: 1 })));
    await mountApiTrades(fetchMock);

    clickChip('Buy');
    await flushAsync();
    let p = paramsOf(lastUrl(fetchMock));
    expect(p.get('type')).toBe('BUY');
    expect(p.get('page')).toBe('0');

    clickChip('Sell');
    await flushAsync();
    p = paramsOf(lastUrl(fetchMock));
    expect(p.get('type')).toBe('SELL');

    clickChip('All');
    await flushAsync();
    p = paramsOf(lastUrl(fetchMock));
    expect(p.get('type')).toBeNull();
    expect(p.get('dateFrom')).toBeNull();
  });

  it('當年度 chip 轉成本地時區的年初/次年年初半開區間,且不寫死年份也不用 UTC(D-05)', async () => {
    const fetchMock = scriptedFetch(() => success(page()));
    await mountApiTrades(fetchMock);

    clickChip(String(CURRENT_YEAR));
    await flushAsync();

    const p = paramsOf(lastUrl(fetchMock));
    const from = p.get('dateFrom')!;
    const to = p.get('dateTo')!;
    expect(from, 'dateFrom').toBeTruthy();
    expect(to, 'dateTo').toBeTruthy();

    // 本地牆鐘的年界,不是 toISOString() 的 UTC 年界
    expect(from.startsWith(`${CURRENT_YEAR}-01-01T00:00:00`)).toBe(true);
    expect(to.startsWith(`${CURRENT_YEAR + 1}-01-01T00:00:00`)).toBe(true);
    // ISO-8601 含 offset,絕不是 'Z' 結尾(toISOString 的特徵)
    expect(from).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(to).toMatch(/[+-]\d{2}:\d{2}$/);
    // 語意層:解析後的瞬間必須等於本地年初 / 次年年初(與測試機時區無關)
    expect(Date.parse(from)).toBe(new Date(CURRENT_YEAR, 0, 1).getTime());
    expect(Date.parse(to)).toBe(new Date(CURRENT_YEAR + 1, 0, 1).getTime());
    expect(p.get('page')).toBe('0');
  });

  it('年度 chip 跟著系統年度走,不是寫死的 2026(D-05)', async () => {
    // 光用 new Date().getFullYear() 當期望值無法抓到「寫死 2026」——今年剛好就是 2026。
    // 必須把系統時間推到別的年份,寫死的實作才會現形(2027 年線上才爆炸的那種 bug)。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2029, 5, 15, 12, 0, 0));
    try {
      const fetchMock = scriptedFetch(() => success(page()));
      await mountApiTrades(fetchMock);

      expect(chipLabels()).toEqual(['All', 'Buy', 'Sell', '2029']);

      clickChip('2029');
      await flushAsync();
      const p = paramsOf(lastUrl(fetchMock));
      expect(p.get('dateFrom')!.startsWith('2029-01-01T00:00:00')).toBe(true);
      expect(p.get('dateTo')!.startsWith('2030-01-01T00:00:00')).toBe(true);
      expect(p.get('dateFrom')).not.toContain('2026');
    } finally {
      vi.useRealTimers();
    }
  });

  it('date / total / qty 表頭切換 sort 與 direction 並重置頁碼;type / symbol 表頭不可排序(D-06)', async () => {
    const fetchMock = scriptedFetch(() => success(page({ items: [trade({ id: 'x' })], totalElements: 1, totalPages: 1 })));
    await mountApiTrades(fetchMock);
    const before = urls(fetchMock).length;

    click(headerCell(t('en', 'total')));
    await flushAsync();
    let p = paramsOf(lastUrl(fetchMock));
    expect(p.get('sort')).toBe('total');
    expect(p.get('direction')).toBe('desc');
    expect(p.get('page')).toBe('0');

    click(headerCell(t('en', 'total')));
    await flushAsync();
    p = paramsOf(lastUrl(fetchMock));
    expect(p.get('sort')).toBe('total');
    expect(p.get('direction')).toBe('asc');

    click(headerCell(t('en', 'qty')));
    await flushAsync();
    p = paramsOf(lastUrl(fetchMock));
    expect(p.get('sort')).toBe('quantity');
    expect(p.get('direction')).toBe('desc');

    click(headerCell(t('en', 'date')));
    await flushAsync();
    p = paramsOf(lastUrl(fetchMock));
    expect(p.get('sort')).toBe('executedAt');
    expect(p.get('direction')).toBe('desc');

    const sortableClicks = urls(fetchMock).length;
    expect(sortableClicks).toBe(before + 4);

    // 白名單以外的表頭點了不得發任何請求(後端只認三個排序鍵)
    click(headerCell(t('en', 'type')));
    click(headerCell(t('en', 'symbol')));
    click(headerCell(t('en', 'fee')));
    click(headerCell(t('en', 'price')));
    await flushAsync();
    expect(urls(fetchMock)).toHaveLength(sortableClicks);
  });

  it('分頁 UI 為上一頁/下一頁 + 頁碼指示器,邊界時按鈕禁用(D-08)', async () => {
    const fetchMock = scriptedFetch((_call, url) => {
      const pageNo = Number(paramsOf(url).get('page'));
      return success(page({
        items: [trade({ id: `p${pageNo}`, symbol: `SYM${pageNo}` })],
        page: pageNo,
        totalElements: 3,
        totalPages: 3,
      }));
    });
    await mountApiTrades(fetchMock);

    expect(requireTestid('trades-page-indicator').textContent?.trim()).toBe('1 / 3');
    expect((requireTestid('trades-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((requireTestid('trades-next') as HTMLButtonElement).disabled).toBe(false);

    click(requireTestid('trades-next'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('1');
    expect(requireTestid('trades-page-indicator').textContent?.trim()).toBe('2 / 3');
    expect((requireTestid('trades-prev') as HTMLButtonElement).disabled).toBe(false);
    expect(rows()[0].textContent).toContain('SYM1');

    click(requireTestid('trades-next'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('2');
    expect(requireTestid('trades-page-indicator').textContent?.trim()).toBe('3 / 3');
    expect((requireTestid('trades-next') as HTMLButtonElement).disabled).toBe(true);

    click(requireTestid('trades-prev'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('1');
  });

  it('在非第 0 頁時變更篩選,下一個請求的頁碼重置為 0(D-15)', async () => {
    const fetchMock = scriptedFetch((_call, url) => {
      const pageNo = Number(paramsOf(url).get('page'));
      return success(page({ items: [trade({ id: `p${pageNo}` })], page: pageNo, totalElements: 5, totalPages: 5 }));
    });
    await mountApiTrades(fetchMock);

    click(requireTestid('trades-next'));
    await flushAsync();
    click(requireTestid('trades-next'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('2');

    clickChip('Sell');
    await flushAsync();
    const p = paramsOf(lastUrl(fetchMock));
    expect(p.get('page')).toBe('0');
    expect(p.get('type')).toBe('SELL');

    // 排序變更同樣重置
    click(requireTestid('trades-next'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('1');
    click(headerCell(t('en', 'total')));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('0');
  });

  it('請求頁碼 ≥ totalPages 且回空時,自動以 totalPages-1 重新請求並渲染(D-15 溢出回退)', async () => {
    const fetchMock = scriptedFetch((_call, url) => {
      const pageNo = Number(paramsOf(url).get('page'));
      if (pageNo === 4) {
        // 後端資料在換頁期間變少:第 4 頁已不存在
        return success(page({ items: [], page: 4, totalElements: 1, totalPages: 1 }));
      }
      return success(page({
        items: [trade({ id: `p${pageNo}`, symbol: `SYM${pageNo}` })],
        page: pageNo,
        totalElements: 9,
        totalPages: 9,
      }));
    });
    await mountApiTrades(fetchMock);

    for (let i = 0; i < 4; i += 1) {
      click(requireTestid('trades-next'));
      await flushAsync();
    }
    // 回退是「第一個回應處理完之後再發一次請求」,多沖一輪讓第二個回應也落地
    await flushAsync(20);

    // 回退後重新請求 page=0(totalPages - 1),並且真的渲染出資料而不是空列表
    expect(pagesRequested(fetchMock)).toEqual(['0', '1', '2', '3', '4', '0']);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('SYM0');
    expect(testid('trades-empty')).toBeNull();
    expect(requireTestid('trades-page-indicator').textContent?.trim()).toBe('1 / 9');
  });

  it('溢出回退最多自動重試一次,總頁數持續縮水也不會無限迴圈(D-15 防迴圈)', async () => {
    // 以「第幾次呼叫」而非頁碼腳本化:第 5 次(page=4)溢出回退到 page=2,
    // 而第 6 次(page=2)仍然溢出 —— 沒有防迴圈就會 2 → 0 → … 一直請求下去。
    const fetchMock = scriptedFetch((call, url) => {
      const pageNo = Number(paramsOf(url).get('page'));
      if (call === 4) return success(page({ items: [], page: pageNo, totalElements: 6, totalPages: 3 }));
      if (call === 5) return success(page({ items: [], page: pageNo, totalElements: 1, totalPages: 1 }));
      return success(page({
        items: [trade({ id: `p${pageNo}` })],
        page: pageNo,
        totalElements: 9,
        totalPages: 9,
      }));
    });
    await mountApiTrades(fetchMock);

    for (let i = 0; i < 4; i += 1) {
      click(requireTestid('trades-next'));
      await flushAsync();
    }
    await flushAsync(30);

    expect(pagesRequested(fetchMock)).toEqual(['0', '1', '2', '3', '4', '2']);
    expect(rows()).toHaveLength(0);
    expect(testid('trades-loading')).toBeNull();
  });
});

describe('Trades — API mode 四態(D-11 / D-12、PORT-05)', () => {
  it('請求 pending 時顯示 loading,無列也無分頁列', async () => {
    const fetchMock = scriptedFetch(() => new Promise<Response>(() => {}));
    await mountApiTrades(fetchMock);

    expect(requireTestid('trades-loading').textContent).toContain(t('en', 'loading'));
    expect(rows()).toHaveLength(0);
    expect(testid('trades-pagination')).toBeNull();
  });

  it('回空且無篩選時顯示 noTrades', async () => {
    const fetchMock = scriptedFetch(() => success(page({ items: [], totalElements: 0, totalPages: 0 })));
    await mountApiTrades(fetchMock);

    expect(requireTestid('trades-empty').textContent).toContain(t('en', 'noTrades'));
    expect(rows()).toHaveLength(0);
    expect(testid('trades-error')).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('503 失敗顯示錯誤碼 + traceId + 重試鈕,重試只重發列表請求(D-12)', async () => {
    let fails = true;
    const fetchMock = scriptedFetch(() => (fails
      ? failure('TRADES_UNAVAILABLE', 'trace-trades-down')
      : success(page({ items: [trade({ id: 'ok', symbol: 'OKX' })], totalElements: 1, totalPages: 1 }))));
    await mountApiTrades(fetchMock);

    const error = requireTestid('trades-error');
    expect(error.textContent).toContain(t('en', 'loadFailed'));
    expect(error.textContent).toContain('TRADES_UNAVAILABLE');
    expect(error.textContent).toContain('trace-trades-down');
    // 後端訊息不外洩,只露 code / traceId
    expect(error.textContent).not.toContain('backend said no');
    expect(document.body.querySelector('[data-testid="session-banner"]')).toBeNull();

    fails = false;
    click(requireTestid('trades-retry'));
    await flushAsync();

    expect(urls(fetchMock)).toHaveLength(2);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('OKX');
    expect(testid('trades-error')).toBeNull();
  });

  it('Trades 不 import mock store,一律經 getRuntimeApiClients(PORT-04 / judgment §3)', () => {
    expect(tradesSource).not.toContain('useMockPortfolioStore');
    expect(tradesSource).not.toContain('stores/mockPortfolio');
    expect(tradesSource).toContain('getRuntimeApiClients');
  });
});

describe('Trades — API mode CSV 全頁匯出(D-10)', () => {
  function buyTrades(count: number): TradeDto[] {
    return Array.from({ length: count }, (_, i) => trade({
      id: `buy-${i}`,
      symbol: `B${i}`,
      type: 'BUY',
      quantity: i + 1,
      price: 10,
      fee: 1,
      note: `buy ${i}`,
      executedAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    }));
  }

  function sellTrades(count: number): TradeDto[] {
    return Array.from({ length: count }, (_, i) => trade({
      id: `sell-${i}`,
      symbol: `S${i}`,
      type: 'SELL',
      quantity: 1000 + i,
      price: 10,
      fee: 1,
      note: `sell ${i}`,
      executedAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    }));
  }

  it('以當前篩選/排序逐頁拉完再組 CSV,行數為 totalElements + 表頭,且不含被篩掉的類型', async () => {
    const dl = captureDownloads();
    restorers.push(dl.restore);

    const fetchMock = fakeBackendFetch([...buyTrades(250), ...sellTrades(40)]);
    await mountApiTrades(fetchMock);

    clickChip('Buy');
    await flushAsync();
    click(headerCell(t('en', 'total')));
    await flushAsync();
    click(headerCell(t('en', 'total')));
    await flushAsync();
    const beforeExport = urls(fetchMock).length;

    click(requireTestid('trades-export'));
    // 匯出是多個循序請求,需要足夠的 microtask 輪次讓整個迴圈跑完
    await flushAsync(40);

    const exportUrls = urls(fetchMock).slice(beforeExport);
    expect(exportUrls).toHaveLength(3);
    exportUrls.forEach((url, i) => {
      const p = paramsOf(url);
      expect(p.get('page')).toBe(String(i));
      expect(p.get('size')).toBe('100');
      expect(p.get('type')).toBe('BUY');
      expect(p.get('sort')).toBe('total');
      expect(p.get('direction')).toBe('asc');
    });

    expect(dl.blobs).toHaveLength(1);
    const csv = await dl.blobs[0].text();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,type,symbol,qty,price,total,fee,note');
    expect(lines).toHaveLength(251);
    expect(csv).not.toContain('SELL');
    expect(csv).not.toContain('sell 0');
    // 匯出=當前條件的完整資料集,不只當前頁(第 100+ 筆也在)
    expect(csv).toContain('2026-05-17,BUY,B100,101,10,1010,1,buy 100');
    expect(dl.downloads[0]).toBe(`trades-buy-${new Date().toISOString().slice(0, 10)}.csv`);
  });

  it('循環中任一頁失敗即中止:不產生部分檔案,並顯示 code + traceId(D-10 / T-03-17)', async () => {
    const dl = captureDownloads();
    restorers.push(dl.restore);

    const fetchMock = scriptedFetch((_call, url) => {
      const p = paramsOf(url);
      if (p.get('size') === '100' && p.get('page') === '1') {
        return failure('TRADES_EXPORT_FAILED', 'trace-export-down');
      }
      const pageNo = Number(p.get('page'));
      return success(page({
        items: [trade({ id: `p${pageNo}` })],
        page: pageNo,
        totalElements: 3,
        totalPages: 3,
      }));
    });
    await mountApiTrades(fetchMock);

    click(requireTestid('trades-export'));
    // 匯出是多個循序請求,需要足夠的 microtask 輪次讓整個迴圈跑完
    await flushAsync(40);

    expect(dl.createObjectURL).not.toHaveBeenCalled();
    expect(dl.blobs).toHaveLength(0);
    const error = requireTestid('trades-export-error');
    expect(error.textContent).toContain('TRADES_EXPORT_FAILED');
    expect(error.textContent).toContain('trace-export-down');
    expect(error.textContent).not.toContain('backend said no');
    // 匯出鈕復原可用,列表本身不受影響
    expect((requireTestid('trades-export') as HTMLButtonElement).disabled).toBe(false);
    expect(rows()).toHaveLength(1);
  });

  it('CSV 對逗號 / 引號 / 換行的 note 正確跳脫', async () => {
    const dl = captureDownloads();
    restorers.push(dl.restore);

    const nasty = trade({
      id: 'nasty',
      symbol: 'ESC',
      quantity: 2,
      price: 5,
      fee: 0,
      note: 'a,b "quoted"\nnext',
      executedAt: '2026-02-03T10:00:00Z',
    });
    const fetchMock = scriptedFetch(() => success(page({ items: [nasty], totalElements: 1, totalPages: 1 })));
    await mountApiTrades(fetchMock);

    click(requireTestid('trades-export'));
    // 匯出是多個循序請求,需要足夠的 microtask 輪次讓整個迴圈跑完
    await flushAsync(40);

    const csv = await dl.blobs[0].text();
    expect(csv).toContain('2026-02-03,BUY,ESC,2,5,10,0,"a,b ""quoted""\nnext"');
  });
});

describe('Trades — mock mode 回歸鎖定(行為與 Phase 3 之前逐項一致)', () => {
  function customTrades() {
    return [
      { d: '2026-05-16', type: 'BUY' as const, sym: 'AAA', qty: 2, px: 10, fee: 1, note: 'first' },
      { d: '2025-12-31', type: 'SELL' as const, sym: 'BBB', qty: 3, px: 20, fee: 2, note: 'old' },
      { d: '2026-01-15', type: 'DIV' as const, sym: 'CCC', qty: 4, px: 0.5, fee: 0, note: 'cash' },
    ];
  }

  async function mountMock() {
    mountWithPinia(Trades, { lang: 'en', onOrder: () => {} });
    await flushAsync();
  }

  it('chips 恰為 All / Buy / Sell / Dividend / 2026 五個(mock 保留寫死年份)', async () => {
    await mountMock();
    expect(chipLabels()).toEqual(['All', 'Buy', 'Sell', 'Dividend', '2026']);
  });

  it('點 chip 走 client-side 篩選,不打任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await mountMock();

    const portfolio = useMockPortfolioStore();
    portfolio.trades = customTrades();
    await nextTick();
    expect(rows()).toHaveLength(3);

    clickChip('Sell');
    await nextTick();
    expect(rows()).toHaveLength(1);
    expect(document.body.textContent).toContain('BBB');
    expect(document.body.textContent).not.toContain('AAA');

    clickChip('Dividend');
    await nextTick();
    expect(document.body.textContent).toContain('CCC');

    clickChip('2026');
    await nextTick();
    expect(rows()).toHaveLength(2);
    expect(document.body.textContent).not.toContain('2025-12-31');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('不渲染分頁按鈕與頁碼指示器', async () => {
    await mountMock();
    expect(testid('trades-pagination')).toBeNull();
    expect(testid('trades-prev')).toBeNull();
    expect(testid('trades-next')).toBeNull();
    expect(testid('trades-page-indicator')).toBeNull();
  });

  it('store 交易替換後列表更新,executeOrder 後首列帶 fresh 高亮(api.live 委派有效)', async () => {
    await mountMock();
    const portfolio = useMockPortfolioStore();

    portfolio.trades = customTrades();
    await nextTick();
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain('AAA');

    portfolio.executeOrder({
      sym: 'TSLA',
      name: 'Tesla, Inc.',
      side: 'BUY',
      qty: 5,
      px: 200,
      fee: 1,
      sector: 'Auto',
    });
    await nextTick();

    expect(rows()[0].textContent).toContain('TSLA');
    expect(rows()[0].classList.contains('fresh')).toBe(true);
    expect(rows().filter(row => row.classList.contains('fresh'))).toHaveLength(1);
  });

  it('CSV 匯出沿用現行行為:當前篩選來源、既有欄序與檔名', async () => {
    const dl = captureDownloads();
    restorers.push(dl.restore);

    await mountMock();
    const portfolio = useMockPortfolioStore();
    portfolio.trades = customTrades();
    await nextTick();

    clickChip('2026');
    await nextTick();
    click(requireTestid('trades-export'));
    // 匯出是多個循序請求,需要足夠的 microtask 輪次讓整個迴圈跑完
    await flushAsync(40);

    expect(dl.blobs).toHaveLength(1);
    const csv = await dl.blobs[0].text();
    expect(csv).toContain('date,type,symbol,qty,price,total,fee,note');
    expect(csv).toContain('2026-05-16,BUY,AAA,2,10,20,1,first');
    expect(csv).toContain('2026-01-15,DIV,CCC,4,0.5,2,0,cash');
    expect(csv).not.toContain('2025-12-31');
    expect(dl.downloads[0]).toBe(`trades-2026-${new Date().toISOString().slice(0, 10)}.csv`);
  });
});

// =====================================================================================
// 04-12(D-10 / D-11 / D-12 / U-05 / U-06):成交後的重讀。
// =====================================================================================

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** 從任一列往上找到列表所屬的 `.card` —— 區塊級 aria-busy 的斷言對象,不新增 testid。 */
function tradesCard(): HTMLElement {
  const row = rows()[0];
  expect(row, '至少要有一列交易才能定位列表區塊').toBeTruthy();
  return row.closest('.card') as HTMLElement;
}

describe('Trades — post-trade refetch(04-12 / D-10 / D-12 / U-05 / U-06)', () => {
  it('Test 3(D-10):revision 變動後列表重讀一次', async () => {
    const fetchMock = scriptedFetch(() => success(page({
      items: [trade({ id: 'a', symbol: 'AAA' })],
      totalElements: 1,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);
    expect(urls(fetchMock)).toHaveLength(1);

    bumpPortfolioRevision();
    await flushAsync();

    expect(urls(fetchMock)).toHaveLength(2);
  });

  it('Test 4(Pitfall 12):mock mode 下 revision 變動不得發出任何網路請求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mountWithPinia(Trades, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    bumpPortfolioRevision();
    await flushAsync();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Test 6/7(U-05):重讀期間保留舊列並顯示「更新中…」,成功後才換成新值', async () => {
    let gate: ReturnType<typeof deferred<Response>> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/trades')) throw new Error(`unexpected fetch: ${url}`);
      if (gate) return gate.promise;
      return success(page({ items: [trade({ id: 'old', symbol: 'OLD' })], totalElements: 1, totalPages: 1 }));
    });
    await mountApiTrades(fetchMock);
    expect(rows()[0].textContent).toContain('OLD');

    gate = deferred<Response>();
    bumpPortfolioRevision();
    await flushAsync();

    // U-05:**不得**重用 status:'loading' —— 舊列必須留在 DOM。
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('OLD');
    expect(testid('trades-loading')).toBeNull();

    const note = requireTestid('trades-refreshing');
    expect(note.textContent).toContain(t('en', 'portfolioRefreshing'));
    expect(tradesCard().getAttribute('aria-busy')).toBe('true');

    gate.resolve(success(page({ items: [trade({ id: 'new', symbol: 'NEWSYM' })], totalElements: 1, totalPages: 1 })));
    gate = null;
    await flushAsync();

    expect(testid('trades-refreshing')).toBeNull();
    expect(tradesCard().getAttribute('aria-busy')).toBe('false');
    expect(rows()[0].textContent).toContain('NEWSYM');
    expect(document.body.textContent).not.toContain('OLD');
  });

  it('Test 8(U-06 / D-12):重讀失敗時舊資料留存並明示可能過期,重試可再送', async () => {
    let failRefetch = false;
    const fetchMock = scriptedFetch(() => (failRefetch
      ? failure('TRADES_UNAVAILABLE', 'trace-refetch-down')
      : success(page({ items: [trade({ id: 'old', symbol: 'OLD' })], totalElements: 1, totalPages: 1 }))));
    await mountApiTrades(fetchMock);

    failRefetch = true;
    bumpPortfolioRevision();
    await flushAsync();

    // 舊資料仍在畫面上,且**不進** status:'error'
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('OLD');
    expect(testid('trades-error')).toBeNull();
    expect(testid('trades-refreshing')).toBeNull();

    const stale = requireTestid('trades-refresh-error');
    expect(stale.textContent).toContain(t('en', 'portfolioStaleAfterTrade'));
    expect(stale.getAttribute('role')).toBe('status');
    expect(requireTestid('trades-refresh-error-code').textContent).toContain('TRADES_UNAVAILABLE');
    expect(requireTestid('trades-refresh-trace-id').textContent).toContain('trace-refetch-down');
    expect(stale.textContent).not.toContain('backend said no');

    failRefetch = false;
    click(requireTestid('trades-refresh-retry'));
    await flushAsync();

    expect(urls(fetchMock)).toHaveLength(3);
    expect(testid('trades-refresh-error')).toBeNull();
    expect(rows()[0].textContent).toContain('OLD');
  });
});

// =====================================================================================
// 04-12 Task 2:D-11 重讀規則與「不在檢視範圍」提示 + D-13 fresh 高亮。
// =====================================================================================

/** 從 `?raw` 原始碼切出一段程式碼區塊 —— 行為測試抓不到的「不得出現的實作」用它鎖住。 */
function sourceBlock(startMarker: string, endMarker: string): string {
  const start = tradesSource.indexOf(startMarker);
  expect(start, `原始碼找不到 ${startMarker}`).toBeGreaterThan(-1);
  const end = tradesSource.indexOf(endMarker, start);
  expect(end, `找不到 ${startMarker} 的結尾`).toBeGreaterThan(-1);
  return tradesSource.slice(start, end + endMarker.length);
}

function freshRow(): HTMLElement[] {
  return rows().filter(row => row.classList.contains('fresh'));
}

describe('Trades — D-11 重讀規則與「不在檢視範圍」提示(04-12)', () => {
  it('Test 11(D-11):重讀保留篩選與排序,但頁碼歸零', async () => {
    const fetchMock = scriptedFetch((_call, url) => {
      const pageNo = Number(paramsOf(url).get('page'));
      return success(page({
        items: [trade({ id: `p${pageNo}` })],
        page: pageNo,
        totalElements: 60,
        totalPages: 3,
      }));
    });
    await mountApiTrades(fetchMock);

    clickChip('Sell');
    await flushAsync();
    click(headerCell(t('en', 'qty')));
    await flushAsync();
    click(requireTestid('trades-next'));
    await flushAsync();
    expect(paramsOf(lastUrl(fetchMock)).get('page')).toBe('1');

    bumpPortfolioRevision();
    await flushAsync();

    const p = paramsOf(lastUrl(fetchMock));
    expect(p.get('type'), '篩選必須保留').toBe('SELL');
    expect(p.get('sort'), '排序鍵必須保留').toBe('quantity');
    expect(p.get('direction'), '排序方向必須保留').toBe('desc');
    expect(p.get('page'), '頁碼必須歸零').toBe('0');
  });

  it('Test 12(不得複製第二條重置邏輯):watch 區塊走既有的單一入口', () => {
    const watchBlock = sourceBlock('watch(portfolioRevision', '\n});');
    expect(watchBlock).toContain('applyQueryChange');
    // 複製「頁碼歸零 + 重新請求」會讓兩份實作日後各自漂移(D-15 的入口已宣示過這件事)。
    expect(watchBlock, '不得自己歸零頁碼').not.toContain('pageNo.value = 0');
    expect(watchBlock, '不得繞過單一入口直接請求').not.toContain('loadTrades(');
  });

  it('Test 13(D-11):新交易在重讀結果內時,不顯示「不在檢視範圍」提示', async () => {
    let refetched = false;
    const fetchMock = scriptedFetch(() => success(page({
      items: refetched
        ? [trade({ id: 'new-trade', symbol: 'NEWSYM' }), trade({ id: 'old' })]
        : [trade({ id: 'old' })],
      totalElements: refetched ? 2 : 1,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);

    refetched = true;
    notifyTradeCreated(trade({ id: 'new-trade', symbol: 'NEWSYM' }));
    await flushAsync();

    expect(rows()).toHaveLength(2);
    expect(testid('trades-not-in-current-view')).toBeNull();
  });

  it('Test 14(D-11):新交易不在重讀結果內時,明確告知而不是讓人以為沒記錄成功', async () => {
    const fetchMock = scriptedFetch(() => success(page({
      items: [trade({ id: 'old', symbol: 'OLD' })],
      totalElements: 1,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);

    // D-03 允許補登,新交易不保證在第 0 頁,甚至可能不符當前篩選。
    notifyTradeCreated(trade({ id: 'not-in-view', symbol: 'ZZZ' }));
    await flushAsync();

    const note = requireTestid('trades-not-in-current-view');
    expect(note.textContent).toContain(t('en', 'tradeNotInCurrentView'));
    // 這不是錯誤 —— 不得套用錯誤區塊的樣式,也不得出現「讀取失敗」字樣。
    expect(note.classList.contains('block-error')).toBe(false);
    expect(note.textContent).not.toContain(t('en', 'loadFailed'));
  });

  it('Test 15(判定只能比 id):不得在前端重算「這筆是否符合當前條件」', () => {
    const block = sourceBlock('const inResultSet', '\n});');
    expect(block).toContain('lastCreatedTradeId');
    expect(block).toContain('.id ===');
    // 前端重算等於複製一份後端的篩選邏輯,第一個邊界情況(半開區間、時區)就會分歧
    // (Phase 3 D-04 / judgment §7)。
    for (const forbidden of ['activeFilter', 'sortKey', 'sortDir', 'dateFrom', 'dateTo', 'filterParams']) {
      expect(block, `判定不得碰 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('Test 16(清除時機):變更篩選後提示消失', async () => {
    const fetchMock = scriptedFetch(() => success(page({
      items: [trade({ id: 'old', symbol: 'OLD' })],
      totalElements: 1,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);

    notifyTradeCreated(trade({ id: 'not-in-view', symbol: 'ZZZ' }));
    await flushAsync();
    expect(testid('trades-not-in-current-view')).not.toBeNull();

    clickChip('Sell');
    await flushAsync();

    expect(testid('trades-not-in-current-view')).toBeNull();
    expect(tradesSource, '清除必須經 clearLastCreatedTrade,而不是只藏起提示')
      .toContain('clearLastCreatedTrade');
  });
});

describe('Trades — D-13 fresh 高亮(04-12 / U-12)', () => {
  it('Test 18/19(D-13 / U-12):API mode 第 0 列帶 fresh 高亮,且有非顏色線索的「新」標記', async () => {
    const fetchMock = scriptedFetch(() => success(page({
      items: [trade({ id: 'new-trade', symbol: 'AAPL' }), trade({ id: 'other', symbol: 'MSFT' })],
      totalElements: 2,
      totalPages: 1,
    })));
    await mountApiTrades(fetchMock);
    expect(freshRow()).toHaveLength(0);

    notifyTradeCreated(trade({ id: 'new-trade', symbol: 'AAPL' }));
    await flushAsync();

    expect(rows()[0].classList.contains('fresh')).toBe(true);
    expect(freshRow()).toHaveLength(1);

    // U-12:色盲、高對比模式、動畫已結束的使用者都必須看得出是哪一列。
    const badge = requireTestid('trades-fresh-badge');
    expect(badge.textContent?.trim()).toBe(t('en', 'freshBadge'));
    expect(rows()[0].contains(badge)).toBe(true);

    // §Layout Contract:「新」標記**不得改變列高**。jsdom 不套用 scoped CSS 也算不出高度,
    // 所以用原始碼斷言(沿用 04-11 送出鈕 min-width 的手法):
    // 標記只能有水平內距,並自帶小於本列文字行高的 line-height。
    expect(tradesSource).toMatch(/\.fresh-badge\s*\{[^}]*padding:\s*0 8px/);
    expect(tradesSource).toMatch(/\.fresh-badge\s*\{[^}]*line-height:\s*1\.2/);
  });

  it('Test 20(來源切換):mock mode 的 fresh 只認 live.lastFill,不看 apiLastFill', async () => {
    mountWithPinia(Trades, { lang: 'en', onOrder: () => {} });
    await flushAsync();

    const portfolio = useMockPortfolioStore();
    portfolio.trades = [
      { d: '2026-05-16', type: 'BUY', sym: 'AAA', qty: 2, px: 10, fee: 1, note: 'first' },
    ];
    await nextTick();

    notifyTradeCreated(trade({ id: 'api-only', symbol: 'AAA' }));
    await nextTick();

    expect(freshRow()).toHaveLength(0);
    expect(testid('trades-fresh-badge')).toBeNull();
  });

  it('Test 21(U-12):fresh 的壽命不靠計時器', () => {
    // 計時器會讓元件測試時間相依而 flaky;`App.vue:36` 的 v-if 切頁卸載已界定實際壽命。
    expect(tradesSource).not.toContain('setTimeout');
  });

  it('Test 22(a11y):prefers-reduced-motion 下取消動畫,「新」標記照常顯示', () => {
    expect(tradesSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?tbody tr\.fresh\s*\{[^}]*animation:\s*none/,
    );
    // 標記本身不在動畫裡,不會被 reduced-motion 一併關掉
    expect(tradesSource).toContain('data-testid="trades-fresh-badge"');
  });

  it('D-13:Phase 3 留下的「Phase 4 再接」TODO 註解已清除', () => {
    expect(tradesSource).not.toContain('Phase 4 接 post-trade refetch');
    expect(tradesSource).not.toContain('無成交事件來源');
  });
});

describe('Trades — 「新」標記的清除時機(F-2 / UI-SPEC §9)', () => {
  const twoAapl = () => success(page({
    items: [trade({ id: 'new-trade', symbol: 'AAPL' }), trade({ id: 'old-aapl', symbol: 'AAPL' })],
    totalElements: 2,
    totalPages: 2,
  }));

  it('Test 21:變更排序後「新」標記與 apiLastFill 一併清除,不得把另一筆舊交易標成新', async () => {
    const fetchMock = scriptedFetch(twoAapl);
    await mountApiTrades(fetchMock);
    notifyTradeCreated(trade({ id: 'new-trade', symbol: 'AAPL' }));
    await flushAsync();
    expect(freshRow()).toHaveLength(1);

    click(headerCell(t('en', 'qty')));
    await flushAsync();

    // 重讀後第 0 列仍是 AAPL(可能是另一筆舊交易),只靠 symbol 比對會誤標 —— 標記必須隨檢視變更清除。
    expect(apiLastFill.value).toBeNull();
    expect(freshRow()).toHaveLength(0);
    expect(testid('trades-fresh-badge')).toBeNull();
  });

  it('Test 22:換頁同樣清除「新」標記', async () => {
    const fetchMock = scriptedFetch(twoAapl);
    await mountApiTrades(fetchMock);
    notifyTradeCreated(trade({ id: 'new-trade', symbol: 'AAPL' }));
    await flushAsync();
    expect(freshRow()).toHaveLength(1);

    click(requireTestid('trades-next'));
    await flushAsync();

    expect(apiLastFill.value).toBeNull();
    expect(freshRow()).toHaveLength(0);
  });

  it('Test 23:頁面 unmount 時清除「新」標記(壽命由 unmount 界定,不用 setTimeout)', async () => {
    const fetchMock = scriptedFetch(twoAapl);
    await mountApiTrades(fetchMock);
    notifyTradeCreated(trade({ id: 'new-trade', symbol: 'AAPL' }));
    await flushAsync();
    expect(freshRow()).toHaveLength(1);

    unmountAll();

    expect(apiLastFill.value, 'App.vue 的 v-if 切頁會卸載本頁,標記不得活過這一刻').toBeNull();
  });
});
