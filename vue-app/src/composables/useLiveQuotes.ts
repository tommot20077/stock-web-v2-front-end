import { computed, shallowRef, watch, type ComputedRef, type Ref } from 'vue';
import type { Asset } from '../services/apiTypes';
import { parseDecimal, ROUND_HALF_UP, ZERO } from '../services/decimal';
import type { LiveTick, QuoteStream } from '../services/quoteStream';

/**
 * 元件側的即時報價 composable(WATCH-04;D-23、D-24;UI-SPEC §9)。
 *
 * 回傳「GET 報價 + tick 疊加」後的列與每列資料來源(`data-quote-source`):
 * - `ws`:stream `live` 且自上次 rows 更新(GET 重讀)後已套用過該代號的 tick
 * - `rest`:不符合 `ws`,且疊加後 `latestPrice !== null`(含斷線後停在最後一筆 tick 值的列)
 * - `none`:`latestPrice === null` 且無 tick
 *
 * 純 computed 疊加,不寫回原 rows;元件不得直接碰 WebSocket(wsBoundary.test.ts)。
 * rows 以「替換陣列」視為一次 GET 重讀(淺層 watch);原地修改陣列不會重設 tick 基準。
 */

export type QuoteSource = 'ws' | 'rest' | 'none';
export type LiveQuoteRow = Asset & { quoteSource: QuoteSource };

/** FX / 債券永遠沒有 tick(RESEARCH W4、P-W6):不套用 tick、永不標示即時 */
const NEVER_LIVE_ASSET_TYPES = new Set(['FX', 'BOND']);

/**
 * 後端 changePercent:`change × 100 ÷ previousClose`,`divide(previousClose, 2, HALF_UP)`。
 * Decimal 的 `round(dp, ROUND_HALF_UP)` 與 BigDecimal HALF_UP 同義(.5 遠離 0,負數亦然)。
 *
 * Phase 5 D-08:疊加改以 Decimal 計算後,減法沒有浮點殘差,原本 number 版的 `roundHalfUp` 與
 * `CHANGE_DIGITS = 8`(清理 218.4 − 198 = 20.400000000000006 這類殘差)已刪除;change 與後端一樣不捨入。
 * `div` 的中間結果依 decimal.ts 的 `DP = 20` 捨入後再捨入到 2 位(與 Positions.holdingWeight 同一寫法)。
 */
const CHANGE_PERCENT_DIGITS = 2;
const HUNDRED = parseDecimal('100');

function overlayTick(row: Asset, tick: LiveTick): Asset {
  // LiveTick.price 已是 Decimal(quoteStream.parseTickData 由 wire 字串解析),疊加全程在 Decimal 內計算。
  const price = tick.price;
  let change = row.change;
  let changePercent = row.changePercent;
  if (row.latestPrice !== null && row.change !== null) {
    const previousClose = row.latestPrice.minus(row.change);
    change = price.minus(previousClose);
    if (!previousClose.eq(ZERO)) {
      changePercent = change.times(HUNDRED).div(previousClose).round(CHANGE_PERCENT_DIGITS, ROUND_HALF_UP);
    }
  }
  return {
    ...row,
    latestPrice: price,
    change,
    changePercent,
    high: row.high === null ? null : (row.high.cmp(price) >= 0 ? row.high : price),
    low: row.low === null ? null : (row.low.cmp(price) <= 0 ? row.low : price),
    // volumeText 是當日累計;tick volume 是單筆量,不得覆寫(P-W5)。
  };
}

export function useLiveQuotes(
  rows: Ref<readonly Asset[]>,
  stream: QuoteStream,
  options?: { restFetchedAt: Ref<number | null> },
): {
  rows: ComputedRef<LiveQuoteRow[]>;
  quoteSource: (symbol: string) => QuoteSource;
  isLive: (symbol: string) => boolean;
  lastUpdatedAt: ComputedRef<number | null>;
} {
  /**
   * tick 基準:rows 更新(GET 重讀)當下的 ticks 快照。
   * service 每次 flush 會為有新 tick 的代號建立新的 LiveTick 物件,
   * 所以「同一代號的 tick 物件與基準不同」即代表 rows 更新後收過新 tick——不依賴時鐘。
   */
  const baseline = shallowRef<ReadonlyMap<string, LiveTick>>(stream.ticks.value);
  watch(rows, () => {
    baseline.value = stream.ticks.value;
  }, { flush: 'sync' });

  function freshTick(row: Asset): LiveTick | null {
    if (NEVER_LIVE_ASSET_TYPES.has(row.assetType)) return null;
    const tick = stream.ticks.value.get(row.symbol);
    if (!tick || baseline.value.get(row.symbol) === tick) return null;
    return tick;
  }

  const liveRows = computed<LiveQuoteRow[]>(() => {
    const streamLive = stream.status.value === 'live';
    return rows.value.map(row => {
      const tick = freshTick(row);
      const merged = tick ? overlayTick(row, tick) : row;
      const quoteSource: QuoteSource = tick && streamLive
        ? 'ws'
        : merged.latestPrice !== null ? 'rest' : 'none';
      return { ...merged, quoteSource };
    });
  });

  const sourceBySymbol = computed(() => new Map(liveRows.value.map(row => [row.symbol, row.quoteSource])));

  const lastUpdatedAt = computed<number | null>(() => {
    let latest = options?.restFetchedAt.value ?? null;
    rows.value.forEach(row => {
      const tick = freshTick(row);
      if (tick) latest = latest === null ? tick.receivedAt : Math.max(latest, tick.receivedAt);
    });
    return latest;
  });

  function quoteSource(symbol: string): QuoteSource {
    return sourceBySymbol.value.get(symbol) ?? 'none';
  }

  return {
    rows: liveRows,
    quoteSource,
    isLive: symbol => quoteSource(symbol) === 'ws',
    lastUpdatedAt,
  };
}
