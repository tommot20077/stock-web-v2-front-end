import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useNow } from './useNow';

// quick-261107-1j4(04.2 IN-09):時間相依的 computed(未來時間判斷、「今天」比較)要隨時間更新,
// 不能只在欄位被編輯時才重算。useNow 是粗粒度 reactive 時鐘(預設 30 秒)。

const START = Date.parse('2026-11-05T01:00:00Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('預設每 30 秒前進一次', () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const scope = effectScope();
    const now = scope.run(() => useNow())!;

    expect(now.value).toBe(START);
    vi.advanceTimersByTime(29_000);
    expect(now.value, '未滿一個間隔不前進').toBe(START);
    vi.advanceTimersByTime(1_000);
    expect(now.value).toBe(START + 30_000);
    scope.stop();
  });

  it('可自訂間隔', () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const scope = effectScope();
    const now = scope.run(() => useNow({ intervalMs: 60_000 }))!;

    vi.advanceTimersByTime(30_000);
    expect(now.value).toBe(START);
    vi.advanceTimersByTime(30_000);
    expect(now.value).toBe(START + 60_000);
    scope.stop();
  });

  it('active 為假時不跑;轉為真時立即同步一次並開始前進', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const active = ref(false);
    const scope = effectScope();
    const now = scope.run(() => useNow({ active: () => active.value }))!;

    vi.advanceTimersByTime(90_000);
    expect(now.value, 'inactive 時不前進').toBe(START);
    expect(vi.getTimerCount(), 'inactive 時沒有 interval').toBe(0);

    active.value = true;
    await nextTick();
    expect(now.value, '啟用時同步到現在').toBe(START + 90_000);
    vi.advanceTimersByTime(30_000);
    expect(now.value).toBe(START + 120_000);

    active.value = false;
    await nextTick();
    expect(vi.getTimerCount(), '停用後清掉 interval').toBe(0);
    scope.stop();
  });

  it('scope 結束(元件卸載)後停止', () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const scope = effectScope();
    const now = scope.run(() => useNow())!;

    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(now.value).toBe(START);
  });
});
