import { computed, type ComputedRef, type Ref } from 'vue';
import type { AssetDto } from '../services/apiTypes';
import type { QuoteStream } from '../services/quoteStream';

export type QuoteSource = 'ws' | 'rest' | 'none';
export type LiveQuoteRow = AssetDto & { quoteSource: QuoteSource };

// RED skeleton:尚未實作疊加。
export function useLiveQuotes(
  rows: Ref<readonly AssetDto[]>,
  _stream: QuoteStream,
  _options?: { restFetchedAt: Ref<number | null> },
): {
  rows: ComputedRef<LiveQuoteRow[]>;
  quoteSource: (symbol: string) => QuoteSource;
  isLive: (symbol: string) => boolean;
  lastUpdatedAt: ComputedRef<number | null>;
} {
  const liveRows = computed<LiveQuoteRow[]>(() => rows.value.map(row => ({ ...row, quoteSource: 'none' as QuoteSource })));
  return {
    rows: liveRows,
    quoteSource: () => 'none',
    isLive: () => false,
    lastUpdatedAt: computed(() => null),
  };
}
