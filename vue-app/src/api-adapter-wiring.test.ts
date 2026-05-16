import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Backtest from './pages/Backtest.vue';
import Ops from './pages/Ops.vue';
import Settings from './pages/Settings.vue';
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

async function flushAsync(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
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

function rowByText(selector: string, text: string): HTMLElement {
  const row = [...document.body.querySelectorAll<HTMLElement>(selector)]
    .find(el => el.textContent?.includes(text));
  expect(row, `${selector} containing "${text}"`).toBeTruthy();
  return row!;
}

async function clickButtonWithin(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}" inside row`).toBeTruthy();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (mounted.length) mounted.pop()?.();
  document.body.innerHTML = '';
});

describe('page API adapter wiring', () => {
  it('Backtest creates the latest run through the adapter without writing the legacy preview store', async () => {
    mountWithPinia(Backtest, { lang: 'en' });
    const previewStore = useMockPreviewStore();

    await clickButton('Run');
    await flushAsync();

    expect(previewStore.backtestRuns).toEqual([]);
    expect(document.body.textContent).toContain('Latest simulated run');
    expect(document.body.textContent).toContain('MA Cross (20/50)');
    expect(document.body.textContent).toContain('AAPL');
    expect(document.body.textContent).toContain('3Y');
  });

  it('Ops runs actions and logs through the adapter without writing the legacy preview store', async () => {
    vi.useFakeTimers();
    const toasts: string[] = [];
    mountWithPinia(Ops, { lang: 'en', onToast: (message: string) => toasts.push(message) });
    await flushAsync();
    const previewStore = useMockPreviewStore();
    const initialLogCount = previewStore.opsLog.length;

    await clickButton('Refetch news');
    await clickButton('Run');
    await flushAsync();

    expect(previewStore.currentOpsRun).toBeNull();
    expect(previewStore.opsLog).toHaveLength(initialLogCount);
    expect(document.body.textContent).toContain('Simulated run in progress: Refetch news');

    await vi.advanceTimersByTimeAsync(650);
    await flushAsync();

    expect(previewStore.currentOpsRun).toBeNull();
    expect(previewStore.opsLog).toHaveLength(initialLogCount);
    expect(toasts).toEqual(['✓ Refetch news']);
    expect(document.body.textContent).toContain('Refetch news');
  });

  it('Settings tests read-only keys through the AI Access adapter without delayed local timers', async () => {
    const toasts: string[] = [];
    mountWithPinia(Settings, { lang: 'en', onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    await clickButton('Data sources');
    const finnhub = rowByText('.key-row', 'Finnhub');
    await clickButtonWithin(finnhub, 'Test connection');
    await flushAsync();

    expect(finnhub.textContent).not.toContain('Testing');
    expect(toasts).toEqual(['Simulated connection test complete']);
  });

  it('Settings revokes connected agents through the AI Access adapter', async () => {
    mountWithPinia(Settings, { lang: 'en' });
    await flushAsync();

    await clickButton('AI access');
    await flushAsync();
    const claude = rowByText('.agent', 'Claude Desktop');
    await clickButtonWithin(claude, 'Revoke');
    await flushAsync();

    expect([...document.body.querySelectorAll<HTMLElement>('.agent')]
      .some(row => row.textContent?.includes('Claude Desktop'))).toBe(false);
  });
});
