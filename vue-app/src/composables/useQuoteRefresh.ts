import { computed, onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import type { Asset } from '../services/apiTypes';
import type { QuoteStream } from '../services/quoteStream';

/**
 * 頁面側的即時訂閱與 GET 報價靜默重讀(WATCH-04;D-21 / D-23;UI-SPEC §8 / §9、U-20)。
 *
 * - 只對 `assetType ∈ {STOCK, CRYPTO}` 的列 `stream.watch`(FX / 債券永遠沒有 tick,U-20);
 *   集合改變(切 tab、增刪項目)時先釋放舊集合再 watch 新集合,卸載時釋放。
 *   只換順序不重新 watch(以排序後的集合比對)。
 * - 靜默重讀 `refresh()`:`resyncSeq` 遞增(每次 WELCOME,補 GET 與 SUBSCRIBE 之間的 tick 缺口)、
 *   每 5 分鐘(分頁在背景時略過)、回到前景時(若不會經 WELCOME 觸發重讀)。
 *   `canRefresh()` 回 false 時略過(例:排序尚未儲存,重讀會用伺服器舊順序蓋掉本地排序)。
 * - 元件不碰 WebSocket(wsBoundary.test.ts);連線本身由 quoteStream 管理。
 */

/** RESEARCH W5 [ASSUMED]:GET 報價定期重讀間隔,由頁面排程(04.2-14 決策 2) */
export const QUOTE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const LIVE_ASSET_TYPES = new Set(['STOCK', 'CRYPTO']);

export function useQuoteRefresh(
  rows: Ref<readonly Asset[]>,
  stream: QuoteStream,
  refresh: () => unknown,
  options: { canRefresh?: () => boolean; enabled?: boolean } = {},
): { watchedSymbols: ComputedRef<string[]> } {
  const enabled = options.enabled ?? true;
  const watchedSymbols = computed(() => [...new Set(rows.value
    .filter(row => LIVE_ASSET_TYPES.has(row.assetType))
    .map(row => row.symbol))]);
  const watchedKey = computed(() => [...watchedSymbols.value].sort().join('\n'));

  let release: (() => void) | null = null;

  function releaseCurrent() {
    const current = release;
    release = null;
    current?.();
  }

  function silentRefresh() {
    if (options.canRefresh && !options.canRefresh()) return;
    void refresh();
  }

  if (!enabled) return { watchedSymbols };

  watch(watchedKey, () => {
    releaseCurrent();
    const symbols = watchedSymbols.value;
    if (symbols.length) release = stream.watch(symbols);
  }, { immediate: true });

  watch(() => stream.resyncSeq.value, () => {
    silentRefresh();
  });

  let timer: ReturnType<typeof setInterval> | null = null;

  function isHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  function onVisibility() {
    if (isHidden()) return;
    // 有 watch 且串流會自行重連時,WELCOME 會遞增 resyncSeq 觸發重讀;這裡只補「不會重連」的情況。
    const status = stream.status.value;
    const willResync = watchedSymbols.value.length > 0 && status !== 'replaced' && status !== 'closed';
    if (!willResync) silentRefresh();
  }

  onMounted(() => {
    timer = setInterval(() => {
      if (!isHidden()) silentRefresh();
    }, QUOTE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    releaseCurrent();
  });

  return { watchedSymbols };
}
