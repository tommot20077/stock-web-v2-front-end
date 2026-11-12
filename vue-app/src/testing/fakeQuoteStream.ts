import { vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import { numberToWire, parseDecimal } from '../services/decimal';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { LiveTick, QuoteStream, QuoteStreamStatus } from '../services/quoteStream';

/**
 * 測試替身:可控的 QuoteStream(WATCH-04 頁面測試用)。
 *
 * 頁面測試不得依賴 jsdom 的真 WebSocket(RESEARCH P-W7),也不需要重跑 quoteStream 的狀態機
 * (那是 quoteStream.test.ts 的範圍)。這裡讓測試直接控制 status / ticks / resyncSeq,
 * 並把 watch / release / reconnect 依序記進 `log`,用來斷言「切 tab 先釋放舊集合再 watch 新集合」。
 */
export interface FakeQuoteStream {
  stream: QuoteStream;
  /** 依呼叫順序記錄:`watch:AAPL,BTC`、`release:AAPL,BTC` */
  log: string[];
  watch: ReturnType<typeof vi.fn>;
  reconnect: ReturnType<typeof vi.fn>;
  /** 目前未釋放的 watch 集合 */
  activeSets: () => string[][];
  setStatus: (status: QuoteStreamStatus) => void;
  /**
   * 推一筆新 tick(每次都是新的 LiveTick 物件,useLiveQuotes 據此判斷「GET 之後的新 tick」)。
   * 價格參數維持 number 方便頁面測試撰寫,內部以 `numberToWire` → `parseDecimal` 轉成 Decimal
   * (LiveTick.price 是 Decimal,Phase 5 D-08)。需要超過 number 精度的價格請直接操作 `stream.ticks`。
   */
  pushTick: (symbol: string, price: number, receivedAt?: number) => void;
  /** 模擬 WELCOME:resyncSeq + 1 */
  bumpResync: () => void;
}

export function createFakeQuoteStream(initialStatus: QuoteStreamStatus = 'idle'): FakeQuoteStream {
  const status = ref<QuoteStreamStatus>(initialStatus);
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);
  const log: string[] = [];
  const active = new Map<number, string[]>();
  let nextId = 0;

  const watch = vi.fn((symbols: readonly string[]) => {
    const id = nextId++;
    const set = [...symbols];
    active.set(id, set);
    log.push(`watch:${set.join(',')}`);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active.delete(id);
      log.push(`release:${set.join(',')}`);
    };
  });
  const reconnect = vi.fn(() => {
    log.push('reconnect');
  });

  const stream: QuoteStream = {
    mode: 'api',
    status,
    ticks,
    lastDataAt,
    resyncSeq,
    watch,
    reconnect,
    dispose: () => {},
  };

  return {
    stream,
    log,
    watch,
    reconnect,
    activeSets: () => [...active.values()],
    setStatus: next => {
      status.value = next;
    },
    pushTick: (symbol, price, receivedAt = Date.now()) => {
      const next = new Map(ticks.value);
      next.set(symbol, { symbol, price: parseDecimal(numberToWire(price)), time: new Date(receivedAt).toISOString(), receivedAt });
      ticks.value = next;
      lastDataAt.value = Math.max(lastDataAt.value ?? 0, receivedAt);
    },
    bumpResync: () => {
      resyncSeq.value += 1;
    },
  };
}

/**
 * 把目前模式的 runtime clients 的 `quotes` 換成假串流(先 dispose 真串流)。
 * 必須在 `vi.stubEnv('VITE_DATA_MODE', …)` 與 `resetRuntimeApiClientsForTests()` 之後、掛載頁面之前呼叫。
 */
export function installFakeQuoteStream(initialStatus: QuoteStreamStatus = 'idle'): FakeQuoteStream {
  const fake = createFakeQuoteStream(initialStatus);
  const clients = getRuntimeApiClients();
  clients.quotes.dispose();
  clients.quotes = fake.stream;
  return fake;
}
