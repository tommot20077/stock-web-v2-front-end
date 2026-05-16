import { afterEach, describe, expect, it, vi } from 'vitest';
import Backtest from './pages/Backtest.vue';
import Ops from './pages/Ops.vue';
import Settings from './pages/Settings.vue';
import { useMockPreviewStore } from './stores/mockPreview';
import {
  cleanupMounted,
  clickButton,
  clickButtonWithin,
  flushAsync,
  mountWithPinia,
  rowByText,
  unmountAll,
} from './testUtils';

afterEach(() => {
  cleanupMounted();
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

  it('Ops preserves mock adapter logs across page remounts', async () => {
    vi.useFakeTimers();
    mountWithPinia(Ops, { lang: 'en' });
    await flushAsync();

    await clickButton('Refetch news');
    await clickButton('Run');
    await vi.advanceTimersByTimeAsync(650);
    await flushAsync();
    unmountAll();
    document.body.innerHTML = '';

    mountWithPinia(Ops, { lang: 'en' });
    await flushAsync();

    expect(document.body.textContent).toContain('Refetch news');
  });

  it('Ops handles adapter load failures without unhandled page state', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_UNAVAILABLE', message: 'Ops unavailable' },
      requestId: 'req_ops_down',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    const toasts: string[] = [];

    mountWithPinia(Ops, { lang: 'en', onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    expect(toasts).toContain('Ops unavailable');
    expect(document.body.textContent).not.toContain('Refetch news');
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

  it('Settings does not reveal or copy masked adapter-loaded keys', async () => {
    mountWithPinia(Settings, { lang: 'en' });
    await flushAsync();

    await clickButton('Data sources');
    const finnhub = rowByText('.key-row', 'Finnhub');

    expect([...finnhub.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Show');
    expect([...finnhub.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Copy');
    expect(finnhub.textContent).toContain('DEMO-F...0003');
  });

  it('Settings handles AI access load failures with a safe empty state', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AI_ACCESS_UNAVAILABLE', message: 'AI access unavailable' },
      requestId: 'req_ai_down',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    const toasts: string[] = [];

    mountWithPinia(Settings, { lang: 'en', onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    expect(toasts).toContain('AI access unavailable');
    expect(document.body.textContent).toContain('No brokers configured');
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
