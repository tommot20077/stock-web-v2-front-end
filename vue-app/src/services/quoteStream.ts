import { readonly, ref, shallowRef, type Ref } from 'vue';
import { apiRequest } from './apiClient';
import type { RuntimeDataMode } from './apiTypes';

/**
 * 即時報價 WS client(WATCH-04;D-21、D-23、D-24)。
 *
 * - 這是 `apiClient.ts` 旁的獨立 service:ticket 一律經 `apiRequest`(CSRF、credentials、401 refresh),
 *   瀏覽器 WebSocket 只在本檔建立;元件經 `useLiveQuotes` / `getRuntimeApiClients().quotes` 使用。
 * - 伺服器協定見 RESEARCH Addendum W1(WELCOME / SUB_ACK / ERROR / PING / TICK / auth_expired)。
 * - ticket 與含 ticket 的 URL 不得寫入 console 或錯誤物件(T-04.2-32)。
 */

export type QuoteStreamStatus = 'idle' | 'connecting' | 'live' | 'degraded' | 'replaced' | 'closed';

export interface LiveTick {
  symbol: string;
  price: number;
  time: string;
  receivedAt: number;
}

export interface WsTicketResponse {
  ticket: string;
  expiresIn: number;
  wsUrl: string;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export interface QuoteStream {
  mode: RuntimeDataMode;
  status: Readonly<Ref<QuoteStreamStatus>>;
  ticks: Readonly<Ref<ReadonlyMap<string, LiveTick>>>;
  lastDataAt: Readonly<Ref<number | null>>;
  resyncSeq: Readonly<Ref<number>>;
  /** 宣告這個消費者關心哪些代號;回傳釋放函式。多個消費者以參考計數合併。 */
  watch(symbols: readonly string[]): () => void;
  /** 'replaced' / 'closed' 狀態下的使用者手動重連 */
  reconnect(): void;
  dispose(): void;
}

export interface QuoteStreamDeps {
  basePath?: string;
  socketFactory?: (url: string) => WebSocketLike;
  issueTicket?: () => Promise<WsTicketResponse>;
  now?: () => number;
  document?: Document;
  random?: () => number;
  /** 測試用:預設為 `window.location`(同源,與 apiClient 一致) */
  location?: Pick<Location, 'protocol' | 'host'>;
}

const WS_OPEN = 1;
const TICK_FLUSH_MS = 250;
const NORMAL_CLOSURE = 1000;

function channelOf(symbol: string): string {
  return `tick.${symbol}`;
}

/** 單一轉換點:TICK 的 price / volume 是字串(WsBroadcastConsumer `toPlainString()`),只在這裡轉數字。 */
function parseTickData(channel: unknown, data: unknown, receivedAt: number): LiveTick | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const symbol = record.symbol;
  if (typeof symbol !== 'string' || channel !== channelOf(symbol)) return null;
  const price = typeof record.price === 'string' || typeof record.price === 'number' ? Number(record.price) : NaN;
  if (!Number.isFinite(price)) return null;
  const time = typeof record.time === 'string' ? record.time : '';
  return { symbol, price, time, receivedAt };
}

function sameOriginWsUrl(location: Pick<Location, 'protocol' | 'host'>, wsUrl: string, ticket: string): string {
  // 只接受同源路徑(與 apiClient 一律同源相對路徑一致);絕對 URL / protocol-relative 一律拒絕。
  if (!wsUrl.startsWith('/') || wsUrl.startsWith('//')) {
    throw new Error('Invalid WebSocket path');
  }
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const separator = wsUrl.includes('?') ? '&' : '?';
  return `${scheme}//${location.host}${wsUrl}${separator}ticket=${encodeURIComponent(ticket)}`;
}

function defaultSocketFactory(url: string): WebSocketLike {
  // 全 repo 唯一允許建立瀏覽器 WebSocket 的地方(wsBoundary.test.ts 守門)。
  return new WebSocket(url);
}

export function createHttpQuoteStream(deps: QuoteStreamDeps = {}): QuoteStream {
  const basePath = (deps.basePath ?? '/api/v1').replace(/\/$/, '');
  const socketFactory = deps.socketFactory ?? defaultSocketFactory;
  const issueTicket = deps.issueTicket
    ?? (() => apiRequest<WsTicketResponse>(`${basePath}/market/ws/ticket`, { method: 'POST' }));
  const now = deps.now ?? (() => Date.now());
  const location = deps.location ?? globalThis.location;

  const status = ref<QuoteStreamStatus>('idle');
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);

  const refCounts = new Map<string, number>();
  const subscribed = new Set<string>();
  const pending = new Map<string, LiveTick>();
  let socket: WebSocketLike | null = null;
  let generation = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function transition(next: QuoteStreamStatus): void {
    status.value = next;
  }

  function desiredChannels(): string[] {
    return [...refCounts.keys()].map(channelOf);
  }

  function sendNow(message: Record<string, unknown>): void {
    if (!socket || socket.readyState !== WS_OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function flushTicks(): void {
    flushTimer = null;
    if (pending.size === 0) return;
    const next = new Map(ticks.value);
    let latest = lastDataAt.value ?? 0;
    pending.forEach((tick, symbol) => {
      next.set(symbol, tick);
      latest = Math.max(latest, tick.receivedAt);
    });
    pending.clear();
    ticks.value = next;
    lastDataAt.value = latest;
  }

  function acceptTick(message: Record<string, unknown>): void {
    const channel = message.channel;
    if (typeof channel !== 'string' || !subscribed.has(channel)) return;
    const tick = parseTickData(channel, message.data, now());
    if (!tick) return;
    pending.set(tick.symbol, tick);
    if (!flushTimer) flushTimer = setTimeout(flushTicks, TICK_FLUSH_MS);
  }

  function handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    const record = message as Record<string, unknown>;
    switch (record.type) {
      case 'WELCOME': {
        transition('live');
        resyncSeq.value += 1;
        const channels = desiredChannels();
        subscribed.clear();
        if (channels.length) {
          channels.forEach(channel => subscribed.add(channel));
          sendNow({ type: 'SUBSCRIBE', channels });
        }
        break;
      }
      case 'TICK':
        acceptTick(record);
        break;
      default:
        break;
    }
  }

  function detachSocket(code = NORMAL_CLOSURE): void {
    generation += 1;
    const current = socket;
    socket = null;
    subscribed.clear();
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onclose = null;
    current.onerror = null;
    try {
      current.close(code);
    } catch {
      // 已關閉的 socket 再 close 可能丟例外;忽略(不得把 URL 帶進錯誤)。
    }
  }

  async function connect(): Promise<void> {
    if (disposed || refCounts.size === 0) return;
    const attempt = ++generation;
    transition('connecting');
    let ticket: WsTicketResponse;
    try {
      ticket = await issueTicket();
    } catch {
      if (attempt !== generation) return;
      transition('degraded');
      return;
    }
    if (attempt !== generation || disposed) return;

    let ws: WebSocketLike;
    try {
      ws = socketFactory(sameOriginWsUrl(location, ticket.wsUrl, ticket.ticket));
    } catch {
      transition('degraded');
      return;
    }
    socket = ws;
    subscribed.clear();
    ws.onmessage = event => {
      if (socket === ws) handleMessage(event.data);
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      subscribed.clear();
      transition(refCounts.size > 0 ? 'degraded' : 'idle');
    };
    ws.onerror = () => {
      // close 事件隨後會到;此處不記錄任何 URL / ticket。
    };
  }

  function ensureConnected(): void {
    if (status.value === 'idle') void connect();
  }

  return {
    mode: 'api',
    status: readonly(status),
    ticks,
    lastDataAt: readonly(lastDataAt),
    resyncSeq: readonly(resyncSeq),
    watch(symbols) {
      const accepted = [...new Set(symbols)];
      accepted.forEach(symbol => refCounts.set(symbol, (refCounts.get(symbol) ?? 0) + 1));
      ensureConnected();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        accepted.forEach(symbol => {
          const count = (refCounts.get(symbol) ?? 0) - 1;
          if (count > 0) refCounts.set(symbol, count);
          else refCounts.delete(symbol);
        });
      };
    },
    reconnect() {
      if (disposed) return;
      detachSocket();
      void connect();
    },
    dispose() {
      disposed = true;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      detachSocket();
      refCounts.clear();
      pending.clear();
      transition('closed');
    },
  };
}

/** mock 模式的明確假推播(鐵律 3):不開 socket、不打 ticket。Task 2 補完隨機漫步。 */
export function createMockQuoteStream(_deps: QuoteStreamDeps = {}): QuoteStream {
  const status = ref<QuoteStreamStatus>('idle');
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);
  return {
    mode: 'mock',
    status: readonly(status),
    ticks,
    lastDataAt: readonly(lastDataAt),
    resyncSeq: readonly(resyncSeq),
    watch: () => () => {},
    reconnect: () => {},
    dispose: () => {},
  };
}

export function createQuoteStream(mode: RuntimeDataMode, deps: QuoteStreamDeps = {}): QuoteStream {
  return mode === 'api' ? createHttpQuoteStream(deps) : createMockQuoteStream(deps);
}
