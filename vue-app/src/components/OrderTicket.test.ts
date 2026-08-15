import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
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
