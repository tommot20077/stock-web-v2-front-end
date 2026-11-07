import { onScopeDispose, readonly, ref, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * 粗粒度 reactive 時鐘(quick-261107-1j4,04.2 IN-09)。
 *
 * 時間相依的 computed(「是否晚於現在」「是不是今天」)若直接讀 `Date.now()`,只會在其他依賴變動時重算——
 * 對話框開著不動,未來時間就永遠不會轉為合法、跨過午夜也不會改顯示日期。把 `useNow()` 的值納入 computed
 * 的依賴,它就會每隔 `intervalMs` 重算一次。
 *
 * - 預設 30 秒;精度要求只到分鐘的欄位(datetime-local、`HH:mm`)不需要更密。
 * - 傳入 `active` 時只在其為真時跑 interval(例如對話框開啟中);由假轉真時立即同步一次現在時間。
 * - 所在的 effect scope 結束(元件卸載)時自動清除 interval。
 * - 呼叫端若需要「此刻」的精確值(例如送出當下重算),仍應直接用 `Date.now()`,不要依賴本時鐘。
 *
 * @param options.intervalMs 更新間隔(毫秒),預設 30_000
 * @param options.active 回傳是否啟用;省略 = 一直啟用
 * @returns 唯讀的毫秒時間戳
 */
export function useNow(options: { intervalMs?: number; active?: () => boolean } = {}): Readonly<Ref<number>> {
  const intervalMs = options.intervalMs ?? 30_000;
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, intervalMs);
  }

  if (options.active) {
    watch(options.active, on => (on ? start() : stop()), { immediate: true });
  } else {
    start();
  }
  onScopeDispose(stop);

  return readonly(now);
}
