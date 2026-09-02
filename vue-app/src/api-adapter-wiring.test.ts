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

const mockFactoryCalls = vi.hoisted(() => ({
  auth: vi.fn(),
  aiAccess: vi.fn(),
  backtest: vi.fn(),
  ops: vi.fn(),
  portfolio: vi.fn(),
  trading: vi.fn(),
  market: vi.fn(),
}));

afterEach(() => {
  cleanupMounted();
  mockFactoryCalls.auth.mockReset();
  mockFactoryCalls.aiAccess.mockReset();
  mockFactoryCalls.backtest.mockReset();
  mockFactoryCalls.ops.mockReset();
  mockFactoryCalls.portfolio.mockReset();
  mockFactoryCalls.trading.mockReset();
  mockFactoryCalls.market.mockReset();
  vi.doUnmock('./services/authApi');
  vi.doUnmock('./services/aiAccessApi');
  vi.doUnmock('./services/backtestApi');
  vi.doUnmock('./services/opsApi');
  vi.doUnmock('./services/portfolioApi');
  vi.doUnmock('./services/tradingApi');
  vi.doUnmock('./services/marketApi');
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
      meta: { traceId: 'req_ops_down' },
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
      meta: { traceId: 'req_ai_down' },
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

  it('API mode creates HTTP clients and never calls mock adapter factories', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_MODE', 'api');

    vi.doMock('./services/authApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/authApi')>();
      return {
        ...actual,
        createMockAuthApi: mockFactoryCalls.auth,
      };
    });
    vi.doMock('./services/aiAccessApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/aiAccessApi')>();
      return {
        ...actual,
        createMockAiAccessApi: mockFactoryCalls.aiAccess,
      };
    });
    vi.doMock('./services/backtestApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/backtestApi')>();
      return {
        ...actual,
        createMockBacktestApi: mockFactoryCalls.backtest,
      };
    });
    vi.doMock('./services/opsApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/opsApi')>();
      return {
        ...actual,
        createMockOpsApi: mockFactoryCalls.ops,
      };
    });
    vi.doMock('./services/portfolioApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/portfolioApi')>();
      return {
        ...actual,
        createMockPortfolioApi: mockFactoryCalls.portfolio,
      };
    });
    vi.doMock('./services/tradingApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/tradingApi')>();
      return {
        ...actual,
        createMockTradingApi: mockFactoryCalls.trading,
      };
    });
    vi.doMock('./services/marketApi', async importOriginal => {
      const actual = await importOriginal<typeof import('./services/marketApi')>();
      return {
        ...actual,
        createMockMarketApi: mockFactoryCalls.market,
      };
    });

    const { getRuntimeApiClients } = await import('./services/pageApiClients');
    const clients = getRuntimeApiClients();

    expect(clients.mode).toBe('api');
    expect(clients.auth.mode).toBe('api');
    expect(clients.aiAccess.mode).toBe('api');
    expect(clients.backtest.mode).toBe('api');
    expect(clients.ops.mode).toBe('api');
    expect(clients.portfolio.mode).toBe('api');
    // Phase 4:04-06 / 04-07 的兩個新 adapter 也必須走 HTTP 路徑。
    expect(clients.trading.mode).toBe('api');
    expect(clients.trading.live).toBeUndefined();
    expect(clients.market.mode).toBe('api');
    expect(mockFactoryCalls.auth).not.toHaveBeenCalled();
    expect(mockFactoryCalls.aiAccess).not.toHaveBeenCalled();
    expect(mockFactoryCalls.backtest).not.toHaveBeenCalled();
    expect(mockFactoryCalls.ops).not.toHaveBeenCalled();
    expect(mockFactoryCalls.portfolio).not.toHaveBeenCalled();
    // Phase 2 D-20 的防線延伸到新 adapter:API mode 靜默回退 mock = 測試失敗。
    expect(mockFactoryCalls.trading).not.toHaveBeenCalled();
    expect(mockFactoryCalls.market).not.toHaveBeenCalled();
  });

  it('exposes live mock trading data only in mock mode', async () => {
    vi.resetModules();
    const mockClients = (await import('./services/pageApiClients')).getRuntimeApiClients();

    expect(mockClients.trading.mode).toBe('mock');
    expect(mockClients.trading.live).toBeDefined();
    expect(mockClients.market.mode).toBe('mock');

    vi.resetModules();
    vi.stubEnv('VITE_DATA_MODE', 'api');
    const apiClients = (await import('./services/pageApiClients')).getRuntimeApiClients();

    expect(apiClients.trading.mode).toBe('api');
    expect(apiClients.trading.live).toBeUndefined();
    expect(apiClients.market.mode).toBe('api');
  });

  it('rebuilds the trading and market adapters after resetRuntimeApiClientsForTests', async () => {
    vi.resetModules();
    const { getRuntimeApiClients, resetRuntimeApiClientsForTests } =
      await import('./services/pageApiClients');

    const first = getRuntimeApiClients();
    expect(getRuntimeApiClients().trading).toBe(first.trading);
    expect(getRuntimeApiClients().market).toBe(first.market);

    resetRuntimeApiClientsForTests();
    const second = getRuntimeApiClients();

    expect(second.trading).not.toBe(first.trading);
    expect(second.market).not.toBe(first.market);
    expect(second.trading.mode).toBe(first.trading.mode);
    expect(second.market.mode).toBe(first.market.mode);
  });

  it('exposes live mock portfolio data only in mock mode', async () => {
    vi.resetModules();
    const mockClients = (await import('./services/pageApiClients')).getRuntimeApiClients();

    expect(mockClients.portfolio.mode).toBe('mock');
    expect(mockClients.portfolio.live).toBeDefined();

    vi.resetModules();
    vi.stubEnv('VITE_DATA_MODE', 'api');
    const apiClients = (await import('./services/pageApiClients')).getRuntimeApiClients();

    expect(apiClients.portfolio.mode).toBe('api');
    expect(apiClients.portfolio.live).toBeUndefined();
  });

  it('API mode portfolio failures preserve backend status code and trace id', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'PORTFOLIO_UNAVAILABLE', message: 'Portfolio unavailable' },
      meta: { traceId: 'trace-portfolio-down' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));

    const { getRuntimeApiClients } = await import('./services/pageApiClients');

    await expect(getRuntimeApiClients().portfolio.getSummary()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'PORTFOLIO_UNAVAILABLE',
      status: 503,
      requestId: 'trace-portfolio-down',
    });
  });

  it('API mode adapter failures preserve backend status code and trace id', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_UNAVAILABLE', message: 'Ops unavailable' },
      meta: { traceId: 'trace-ops-down' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));

    const { getRuntimeApiClients } = await import('./services/pageApiClients');

    await expect(getRuntimeApiClients().ops.getActions()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'OPS_UNAVAILABLE',
      status: 503,
      requestId: 'trace-ops-down',
    });
  });
});
