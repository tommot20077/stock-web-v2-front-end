import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Backtest from './pages/Backtest.vue';
import Ops from './pages/Ops.vue';
import { useMockPreviewStore } from './stores/mockPreview';

const mounted: Array<() => void> = [];

function mountWithPinia(component: Component, props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(component, props);
  app.use(pinia);
  app.mount(el);
  mounted.push(() => {
    app.unmount();
    el.remove();
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}"`).toBeTruthy();
  return button!;
}

async function clickButton(text: string) {
  buttonByText(text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

async function clickLastButton(text: string) {
  const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .filter(btn => btn.textContent?.includes(text));
  expect(buttons.length, `buttons containing "${text}"`).toBeGreaterThan(0);
  buttons[buttons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

function kpiTotalReturn(): string {
  const value = document.body.querySelector<HTMLElement>('.kpi-card .kv');
  expect(value, 'first KPI value').toBeTruthy();
  return value!.textContent ?? '';
}

function equityTitle(): string {
  const title = [...document.body.querySelectorAll<HTMLElement>('.ttl')]
    .find(el => el.textContent?.startsWith('Equity curve'));
  expect(title, 'equity curve title').toBeTruthy();
  return title!.textContent ?? '';
}

async function setSelect(index: number, value: string) {
  const select = document.body.querySelectorAll<HTMLSelectElement>('select')[index];
  expect(select, `select at index ${index}`).toBeTruthy();
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

async function setInitial(value: string) {
  const input = document.body.querySelector<HTMLInputElement>('input[type="number"]');
  expect(input, 'initial input').toBeTruthy();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (mounted.length) mounted.pop()?.();
  document.body.innerHTML = '';
});

describe('Task 7 simulated backtest and ops runs', () => {
  it('Backtest records the latest simulated run and visibly refreshes the run output', async () => {
    mountWithPinia(Backtest, { lang: 'en' });
    const store = useMockPreviewStore();
    const beforeKpi = kpiTotalReturn();

    await clickButton('Run');

    expect(store.backtestRuns).toHaveLength(1);
    expect(store.backtestRuns[0]).toMatchObject({
      strategy: 'ma_cross',
      sym: 'AAPL',
      period: '3Y',
      initial: 100000,
    });
    expect(document.body.textContent).toContain('Latest simulated run');
    expect(document.body.textContent).toContain('AAPL');
    expect(document.body.textContent).toContain('3Y');
    expect(kpiTotalReturn()).not.toBe(beforeKpi);
  });

  it('Backtest keeps displayed output on the last executed snapshot until Run is pressed', async () => {
    mountWithPinia(Backtest, { lang: 'en' });
    const store = useMockPreviewStore();
    const beforeKpi = kpiTotalReturn();
    const beforeTitle = equityTitle();

    await setSelect(0, 'rsi');
    await setSelect(1, 'NVDA');
    await setSelect(2, '1Y');

    expect(store.backtestRuns).toHaveLength(0);
    expect(kpiTotalReturn()).toBe(beforeKpi);
    expect(equityTitle()).toBe(beforeTitle);

    await clickButton('Run');

    expect(store.backtestRuns).toHaveLength(1);
    expect(store.backtestRuns[0]).toMatchObject({
      strategy: 'rsi',
      sym: 'NVDA',
      period: '1Y',
    });
    expect(kpiTotalReturn()).not.toBe(beforeKpi);
    expect(equityTitle()).toContain('rsi');
    expect(document.body.textContent).toContain('NVDA');
    expect(document.body.textContent).toContain('1Y');
  });

  it('Backtest rejects invalid initial capital without recording a run', async () => {
    mountWithPinia(Backtest, { lang: 'en' });
    const store = useMockPreviewStore();

    await setInitial('0');
    await clickButton('Run');

    expect(store.backtestRuns).toHaveLength(0);
    expect(document.body.textContent).toContain('Initial capital must be greater than 0');
  });

  it('Backtest shows invalid custom strategy errors inline', async () => {
    mountWithPinia(Backtest, { lang: 'en' });

    await clickButton('Customize');
    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea, 'strategy editor textarea').toBeTruthy();
    textarea!.value = 'function nope(';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    await clickLastButton('Run');

    expect(document.body.textContent).toContain('Strategy compile error');
    expect(document.body.textContent).toContain('Unexpected token');
  });

  it('Ops uses the preview store for async simulated runs, running status, and appended logs', async () => {
    vi.useFakeTimers();
    const toasts: string[] = [];
    mountWithPinia(Ops, { lang: 'en', onToast: (message: string) => toasts.push(message) });
    const store = useMockPreviewStore();
    const initialLogCount = store.opsLog.length;

    await clickButton('Refetch news');
    await clickButton('Run');

    expect(store.currentOpsRun?.label).toBe('Refetch news');
    expect(document.body.textContent).toContain('Simulated run in progress: Refetch news');

    await vi.advanceTimersByTimeAsync(650);
    await nextTick();

    expect(store.currentOpsRun).toBeNull();
    expect(store.opsLog).toHaveLength(initialLogCount + 1);
    expect(store.opsLog[0]).toMatchObject({ op: 'Refetch news', ok: true });
    expect(toasts).toEqual(['✓ Refetch news']);
    expect(document.body.textContent).toContain('Refetch news');
  });
});
