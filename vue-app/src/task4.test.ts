import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import type { Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Overview from './pages/Overview.vue';
import Positions from './pages/Positions.vue';
import Trades from './pages/Trades.vue';
import OrderTicket from './components/OrderTicket.vue';
import { useMockPortfolioStore } from './stores/mockPortfolio';
import { useMockNotificationsStore } from './stores/mockNotifications';
import { flushAsync } from './testUtils';
import type { Lang, Position, Trade } from './types';

function mountWithPinia(component: Component, props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(component, props);
  app.use(pinia);
  app.mount(el);
  return {
    el,
    unmount: () => {
      app.unmount();
      el.remove();
    },
  };
}

function clickButtonByText(root: ParentNode, text: string) {
  const button = [...root.querySelectorAll('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}"`).toBeTruthy();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function buttonByText(root: ParentNode, text: string) {
  const button = [...root.querySelectorAll('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}"`).toBeTruthy();
  return button as HTMLButtonElement;
}

function clickControlByText(root: ParentNode, text: string) {
  const control = [...root.querySelectorAll('button, span')]
    .find(el => el.textContent?.includes(text));
  expect(control, `control containing "${text}"`).toBeTruthy();
  control!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function overviewRecentTradesCard() {
  const title = [...document.body.querySelectorAll('.ttl')]
    .find(el => el.textContent === 'Recent trades');
  expect(title, 'recent trades title').toBeTruthy();
  return title!.closest('.card')!;
}

function mountOrderTicketWithState(state: {
  open: boolean;
  lang: Lang;
  preset: { sym: string; side?: 'BUY' | 'SELL' } | null;
}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    setup() {
      return () => h(OrderTicket, {
        open: state.open,
        lang: state.lang,
        preset: state.preset,
        onClose: () => { state.open = false; },
        onNavigate: () => {},
        onToast: () => {},
      });
    },
  });
  app.use(pinia);
  app.mount(host);
  return {
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

function customTrades(): Trade[] {
  return [
    { d: '2026-05-16', type: 'BUY', sym: 'AAA', qty: 2, px: 10, fee: 1, note: 'first' },
    { d: '2025-12-31', type: 'SELL', sym: 'BBB', qty: 3, px: 20, fee: 2, note: 'old' },
    { d: '2026-01-15', type: 'DIV', sym: 'CCC', qty: 4, px: 0.5, fee: 0, note: 'cash' },
  ];
}

function customPositions(): Position[] {
  return [
    { sym: 'AAPL', name: 'Apple Inc.', qty: 120, avg: 178.2, price: 218.4, sector: 'Tech' },
  ];
}

async function openTicket(state: { open: boolean; preset: { sym: string; side?: 'BUY' | 'SELL' } | null }, preset: { sym: string; side?: 'BUY' | 'SELL' } | null) {
  state.preset = preset;
  state.open = true;
  await nextTick();
  await nextTick();
}

async function closeTicket(state: { open: boolean }) {
  state.open = false;
  await nextTick();
}

async function setInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Task 4 trade flow', () => {
  it('renders Overview recent trades from the Pinia portfolio and emits order/navigation actions', async () => {
    const events = { order: 0, navigate: [] as string[] };
    mountWithPinia(Overview, {
      lang: 'en',
      onOrder: () => { events.order += 1; },
      onNavigate: (page: string) => { events.navigate.push(page); },
    });
    const portfolio = useMockPortfolioStore();
    portfolio.trades = customTrades();
    await nextTick();

    const recentTrades = overviewRecentTradesCard();
    expect(recentTrades.textContent).toContain('AAA');
    expect(recentTrades.textContent).not.toContain('NVDA');

    clickButtonByText(recentTrades, 'New trade');
    clickButtonByText(document.body, '→');

    expect(events.order).toBe(1);
    expect(events.navigate).toEqual(['watchlist']);
  });

  it('clears OrderTicket state when reopened with an unorderable preset', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    const ticket = mountOrderTicketWithState(state);

    state.preset = { sym: 'AAPL' };
    state.open = true;
    await nextTick();
    await nextTick();
    expect(document.body.textContent).toContain('Apple Inc.');
    expect(document.body.querySelector<HTMLInputElement>('.sym-wrap input')?.value).toBe('AAPL');

    state.open = false;
    await nextTick();
    state.preset = { sym: 'US10Y' };
    state.open = true;
    await nextTick();
    await nextTick();

    expect(document.body.textContent).not.toContain('Apple Inc.');
    expect(document.body.querySelector<HTMLInputElement>('.sym-wrap input')?.value).toBe('');
    ticket.unmount();
  });

  it('records trades through Pinia and adds an unread notification', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);
    const portfolio = useMockPortfolioStore();
    const notifications = useMockNotificationsStore();
    const initialTrades = portfolio.trades.length;
    const initialNotifications = notifications.notifications.length;
    state.preset = { sym: 'AAPL' };
    state.open = true;
    await nextTick();
    await nextTick();

    clickButtonByText(document.body, 'Review');
    await nextTick();
    clickButtonByText(document.body, 'Record trade');
    // 送出改為等 adapter 的 promise，不再等假進度的 1600ms 計時器（U-16）。
    await flushAsync();

    expect(portfolio.trades).toHaveLength(initialTrades + 1);
    expect(portfolio.trades[0]).toMatchObject({ sym: 'AAPL', type: 'BUY', qty: 10 });
    expect(portfolio.lastFill).toMatchObject({ sym: 'AAPL', type: 'BUY', qty: 10 });
    expect(notifications.notifications).toHaveLength(initialNotifications + 1);
    expect(notifications.notifications[0]).toMatchObject({
      kind: 'order',
      sym: 'AAPL',
      unread: true,
      time: 'now',
    });
    expect(notifications.notifications[0].text).toContain('filled');
  });

  it('resets ticket side, order type, and TIF when reopened with a symbol-only preset', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);

    await openTicket(state, { sym: 'AAPL', side: 'SELL' });
    clickButtonByText(document.body, 'Sell');
    clickButtonByText(document.body, 'Limit');
    clickButtonByText(document.body, 'GTC');
    await nextTick();
    expect(buttonByText(document.body, 'Sell').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'Limit').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'GTC').classList.contains('active')).toBe(true);

    await closeTicket(state);
    await openTicket(state, { sym: 'MSFT' });

    expect(buttonByText(document.body, 'Buy').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'Market').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'Day').classList.contains('active')).toBe(true);
    expect(document.body.textContent).toContain('Microsoft Corp.');
  });

  it('resets preset quantity when reopened with a different valid symbol', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);

    await openTicket(state, { sym: 'AAPL' });
    const qtyInput = [...document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')][0];
    await setInput(qtyInput, '77');
    expect(qtyInput.value).toBe('77');

    await closeTicket(state);
    await openTicket(state, { sym: 'MSFT' });
    const reopenedQtyInput = [...document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')][0];

    expect(reopenedQtyInput.value).toBe('10');
  });

  it('clears a stale selected asset when manual symbol input no longer matches it', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);
    await openTicket(state, { sym: 'AAPL' });
    const input = document.body.querySelector<HTMLInputElement>('.sym-wrap input');
    expect(input).toBeTruthy();
    expect(buttonByText(document.body, 'Review').disabled).toBe(false);

    await setInput(input!, 'NOTREAL');

    expect(document.body.textContent).not.toContain('Apple Inc.');
    expect(buttonByText(document.body, 'Review').disabled).toBe(true);
  });

  it('does not submit sell orders for unheld symbols or quantities above holdings', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const portfolio = useMockPortfolioStore();
    portfolio.positions = customPositions();
    const initialTrades = portfolio.trades.length;

    const unheld = portfolio.executeOrder({
      sym: 'TSLA',
      name: 'Tesla, Inc.',
      side: 'SELL',
      qty: 1,
      px: 178,
      fee: 1,
      sector: 'Auto',
    });
    const oversell = portfolio.executeOrder({
      sym: 'AAPL',
      name: 'Apple Inc.',
      side: 'SELL',
      qty: 121,
      px: 218,
      fee: 1,
      sector: 'Tech',
    });

    expect(unheld).toBe(false);
    expect(oversell).toBe(false);
    expect(portfolio.trades).toHaveLength(initialTrades);
    expect(portfolio.positions).toEqual(customPositions());
    expect(portfolio.lastFill).toBeNull();
  });

  it('rejects non-finite order values before mutating portfolio state', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const portfolio = useMockPortfolioStore();
    portfolio.positions = customPositions();
    const initialTrades = portfolio.trades.length;

    const badQty = portfolio.executeOrder({
      sym: 'AAPL',
      name: 'Apple Inc.',
      side: 'BUY',
      qty: Number.NaN,
      px: 218,
      fee: 1,
      sector: 'Tech',
    });
    const badPx = portfolio.executeOrder({
      sym: 'AAPL',
      name: 'Apple Inc.',
      side: 'BUY',
      qty: 1,
      px: Infinity,
      fee: 1,
      sector: 'Tech',
    });
    const badFee = portfolio.executeOrder({
      sym: 'AAPL',
      name: 'Apple Inc.',
      side: 'SELL',
      qty: 1,
      px: 218,
      fee: Number.NaN,
      sector: 'Tech',
    });

    expect(badQty).toBe(false);
    expect(badPx).toBe(false);
    expect(badFee).toBe(false);
    expect(portfolio.trades).toHaveLength(initialTrades);
    expect(portfolio.positions).toEqual(customPositions());
    expect(portfolio.lastFill).toBeNull();
  });

  it('disables ticket review for oversell quantities', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);
    const portfolio = useMockPortfolioStore();
    portfolio.positions = customPositions();
    await openTicket(state, { sym: 'AAPL', side: 'SELL' });

    const qtyInput = [...document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')][0];
    await setInput(qtyInput, '121');

    expect(buttonByText(document.body, 'Review').disabled).toBe(true);
    expect(document.body.textContent).toContain('Sell quantity exceeds current holding');

    await setInput(qtyInput, '120');
    expect(buttonByText(document.body, 'Review').disabled).toBe(false);
  });

  it('records only one trade when the submit button is clicked twice in a row', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);
    const portfolio = useMockPortfolioStore();
    const initialTrades = portfolio.trades.length;
    await openTicket(state, { sym: 'AAPL' });
    clickButtonByText(document.body, 'Review');
    await nextTick();

    /*
     * 意圖變更（04-09 Task 3）：原本靠「placing 期間按鈕從畫面消失」擋連點，
     * 那是假進度的副作用。假進度移除後，防線變成 submitTrade 開頭明確的
     * `if (submitting.value) return;` —— 連點兩次仍只記一筆。
     */
    const submitButton = buttonByText(document.body, 'Record trade');
    expect(submitButton.disabled).toBe(false);

    submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    // 第一道防線（U-02）：送出期間按鈕明確 disabled，使用者看得見也點不到。
    expect(submitButton.disabled).toBe(true);

    /*
     * 第二道防線：programmatic dispatch 不受 disabled 屬性阻擋，
     * 擋下這一次的是 submitTrade 開頭的 `if (submitting.value) return;`。
     * 兩道都驗，是因為 disabled 只在 DOM 更新後才生效——真實使用者的
     * 極速連點可能落在更新之前，那時只剩 JS 守衛。
     */
    submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();

    expect(portfolio.trades).toHaveLength(initialTrades + 1);
  });

  it('resets side, order type, and TIF when recording another trade', async () => {
    const state = reactive({
      open: false,
      lang: 'en' as Lang,
      preset: null as { sym: string; side?: 'BUY' | 'SELL' } | null,
    });
    mountOrderTicketWithState(state);
    const portfolio = useMockPortfolioStore();
    portfolio.positions = customPositions();

    await openTicket(state, { sym: 'AAPL', side: 'SELL' });
    clickButtonByText(document.body, 'Limit');
    clickButtonByText(document.body, 'GTC');
    await nextTick();
    clickButtonByText(document.body, 'Review');
    await nextTick();
    clickButtonByText(document.body, 'Record trade');
    await flushAsync();
    clickButtonByText(document.body, 'Record another');
    await flushAsync();

    expect(buttonByText(document.body, 'Buy').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'Market').classList.contains('active')).toBe(true);
    expect(buttonByText(document.body, 'Day').classList.contains('active')).toBe(true);
  });

  it('renders empty Positions without NaN, Infinity, or invalid percentage widths', async () => {
    mountWithPinia(Positions, {
      lang: 'en',
      onOrder: () => {},
    });
    const portfolio = useMockPortfolioStore();
    portfolio.positions = [];
    await nextTick();

    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    const widths = [...document.body.querySelectorAll<HTMLElement>('.bar-fill, .sec-fill')]
      .map(el => el.style.width);
    expect(widths.every(width => !/NaN|Infinity/.test(width))).toBe(true);
  });

  it('filters Trades rows and exports the active filter as CSV', async () => {
    const exported: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        exported.push(blob);
        return 'blob:task4';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mountWithPinia(Trades, {
      lang: 'en',
      onOrder: () => {},
    });
    const portfolio = useMockPortfolioStore();
    portfolio.trades = customTrades();
    await nextTick();

    clickControlByText(document.body, 'Sell');
    await nextTick();
    expect(document.body.textContent).toContain('BBB');
    expect(document.body.textContent).not.toContain('AAA');

    clickControlByText(document.body, '2026');
    await nextTick();
    clickButtonByText(document.body, 'Export CSV');

    expect(exported).toHaveLength(1);
    const csv = await exported[0].text();
    expect(csv).toContain('date,type,symbol,qty,price,total,fee,note');
    expect(csv).toContain('2026-05-16,BUY,AAA,2,10,20,1,first');
    expect(csv).toContain('2026-01-15,DIV,CCC,4,0.5,2,0,cash');
    expect(csv).not.toContain('2025-12-31');
  });
});
