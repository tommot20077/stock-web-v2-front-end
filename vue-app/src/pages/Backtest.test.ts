import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';

// D6(旅程 D):執行中重複點執行 → disable/防抖,不重複建 job。
// 屬純前端行為,依 E2E 矩陣裁決由 Vitest 覆蓋(見 e2e/tests/backtest.spec.ts 註記)。
const createRun = vi.hoisted(() => vi.fn());

vi.mock('../services/backtestApi', async importOriginal => {
  const original = await importOriginal<typeof import('../services/backtestApi')>();
  return {
    ...original,
    createBacktestApi: (...args: Parameters<typeof original.createBacktestApi>) => {
      const api = original.createBacktestApi(...args);
      return { ...api, createRun };
    },
  };
});

afterEach(() => {
  cleanupMounted();
  createRun.mockReset();
});

describe('Backtest 執行防抖(D6)', () => {
  it('執行中按鈕 disable、再次點擊不重複送出,完成後恢復', async () => {
    let resolveRun!: (value: unknown) => void;
    createRun.mockImplementation(() => new Promise(resolve => { resolveRun = resolve; }));

    const Backtest = (await import('./Backtest.vue')).default;
    mountWithPinia(Backtest, { lang: 'en' });
    await flushAsync();

    const runBtn = document.querySelector('[data-testid="backtest-run"]') as HTMLButtonElement | null;
    expect(runBtn).not.toBeNull();

    runBtn!.click();
    await flushAsync();
    expect(runBtn!.disabled).toBe(true);

    runBtn!.click();
    runBtn!.click();
    await flushAsync();
    expect(createRun).toHaveBeenCalledTimes(1);

    resolveRun({
      id: 'run-1',
      strategyId: 'ma_cross',
      label: 'MA Cross (20/50)',
      symbol: 'AAPL',
      period: '3Y',
      initialCapital: 100000,
      currency: 'USD',
      status: 'succeeded',
      createdAt: '2026-07-17T00:00:00Z',
      startedAt: null,
      completedAt: null,
    });
    await flushAsync();
    expect(runBtn!.disabled).toBe(false);
  });
});
