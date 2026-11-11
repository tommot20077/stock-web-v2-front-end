import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import { isDecimal, parseDecimal, toWire, type Decimal } from '../services/decimal';

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
      initialCapital: parseDecimal('100000'),
      progress: null,
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

async function mountBacktest() {
  const Backtest = (await import('./Backtest.vue')).default;
  mountWithPinia(Backtest, { lang: 'en' });
  await flushAsync();
}

async function setInitial(text: string) {
  const input = document.querySelector('[data-testid="backtest-initial"]') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await flushAsync();
}

async function clickRun() {
  (document.querySelector('[data-testid="backtest-run"]') as HTMLButtonElement).click();
  await flushAsync();
}

function runRecord(initialCapital: Decimal) {
  return {
    id: 'run-1',
    strategyId: 'ma_cross',
    label: 'MA Cross (20/50)',
    symbol: 'AAPL',
    period: '3Y',
    initialCapital,
    progress: null,
    currency: 'USD',
    status: 'succeeded',
    createdAt: '2026-07-17T00:00:00Z',
    startedAt: null,
    completedAt: null,
  };
}

describe('Backtest 初始資金文字輸入 → Decimal(05-24 / D-08)', () => {
  it('輸入框是文字輸入(inputmode=decimal),預設 100000', async () => {
    await mountBacktest();
    const input = document.querySelector('[data-testid="backtest-initial"]') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.value).toBe('100000');
  });

  it.each(['0', '-1', 'abc', '', '   '])('輸入 %j → 既有欄位錯誤,不送出', async text => {
    await mountBacktest();
    await setInitial(text);
    await clickRun();

    expect(createRun).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="backtest-run-error"]')?.textContent)
      .toContain('Initial capital must be greater than 0');
  });

  it('輸入 100000 → 以 Decimal 送出,成功後軸標籤以 toChartNumber 計算', async () => {
    createRun.mockImplementation(async (input: { initialCapital: Decimal }) => runRecord(input.initialCapital));
    await mountBacktest();
    await setInitial(' 200000 ');
    await clickRun();

    expect(createRun).toHaveBeenCalledTimes(1);
    const sent = createRun.mock.calls[0][0] as { initialCapital: Decimal };
    expect(isDecimal(sent.initialCapital)).toBe(true);
    expect(toWire(sent.initialCapital)).toBe('200000');
    expect(document.querySelector('[data-testid="backtest-run-error"]')).toBeNull();
    expect(document.querySelector('[data-testid="backtest-run-status"]')?.textContent).toBe('succeeded');
    // 軸標籤第一格 = initial × 2.0(v-for in 5 從 1 起算;圖表顯示,經 toChartNumber)→ 400K
    expect(document.querySelector('.eq-svg text')?.textContent).toBe('$400K');
  });

  it('超過 number 精度的初始資金原樣以 Decimal 送出', async () => {
    createRun.mockImplementation(async (input: { initialCapital: Decimal }) => runRecord(input.initialCapital));
    await mountBacktest();
    await setInitial('123456789012.12345678');
    await clickRun();

    const sent = createRun.mock.calls[0][0] as { initialCapital: Decimal };
    expect(toWire(sent.initialCapital)).toBe('123456789012.12345678');
  });
});
