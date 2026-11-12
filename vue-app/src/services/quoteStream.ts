import { readonly, ref, shallowRef, type Ref } from 'vue';
import { CRYPTO, SYMBOLS } from '../data';
import { ApiClientError, apiRequest } from './apiClient';
import type { RuntimeDataMode } from './apiTypes';
import { numberToWire, parseDecimal, type Decimal } from './decimal';

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
  /** 成交價(Phase 5 D-08:Decimal;wire 為字串,只在 `parseTickData` 轉換) */
  price: Decimal;
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
const NORMAL_CLOSURE = 1000;
/** 伺服器關閉碼(RESEARCH W1 關閉碼全表) */
const CLOSE_AUTH_EXPIRED = 4001;
const CLOSE_SESSION_REPLACED = 4002;
const CLOSE_RATE_LIMITED = 4008;
const CLOSE_BAD_MESSAGE = 4400;

/** 接收合併:tick 先進暫存 Map,每 250 ms 以新 Map 替換一次 ticks */
const TICK_FLUSH_MS = 250;
/** 退避序列 1 / 2 / 4 / 8 / 16 / 30 s,之後固定 30_000 ms(D-23) */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30_000] as const;
/** 最後一個消費者釋放後延遲關閉(RESEARCH W5 [ASSUMED] 5 s),避免切頁反覆握手 */
const RELEASE_DELAY_MS = 5000;
/** 訂閱集合變更合併視窗 */
const SUBSCRIPTION_SYNC_MS = 200;
/** 客戶端送出上限:任一 1 秒視窗 ≤ 5 則(伺服器 10 則 / 秒超過即 4008,含 PONG) */
const SEND_LIMIT_PER_WINDOW = 5;
const SEND_WINDOW_MS = 1000;
/** 與伺服器 WsMessageParser 同一正規式;組 channel 前自檢,避免整則 SUBSCRIBE 被拒(P-W3) */
const CHANNEL_PATTERN = /^tick\.[A-Z0-9./-]+$/i;

/** mock 假推播:每秒一次、每步 ±0.5% 隨機漫步 */
const MOCK_TICK_INTERVAL_MS = 1000;
/**
 * 04.2-review IN-07:socket 建立後多久沒收到 WELCOME 視為卡住(代理扣住 upgrade、伺服器掛住)。
 * 逾時 → 關閉該 socket、degraded、走既有退避重連,不讓狀態停在 connecting 直到瀏覽器自己 close。
 */
export const WELCOME_TIMEOUT_MS = 10_000;
const MOCK_STEP_RATIO = 0.005;

/** channel 以代號原樣組成(大小寫不改;伺服器廣播以原字串精確比對,P-W1) */
function channelOf(symbol: string): string {
  return `tick.${symbol}`;
}

function acceptableSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols)].filter(symbol => CHANNEL_PATTERN.test(channelOf(symbol)));
}

/**
 * TICK 價格的唯一轉換點(Phase 5 D-08):後端 `WsBroadcastConsumer` 以 `BigDecimal.toPlainString()`
 * 送出字串價格,這裡以 `parseDecimal` 轉成 Decimal,之後全程不經 JS number。
 * 只接受字串;JSON number(會先在 JSON.parse 失真)、空字串、無法解析的字串都視為無效 tick 丟棄。
 */
function parseTickPrice(value: unknown): Decimal | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return parseDecimal(value);
  } catch {
    return null;
  }
}

function parseTickData(channel: unknown, data: unknown, receivedAt: number): LiveTick | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const symbol = record.symbol;
  if (typeof symbol !== 'string' || channel !== channelOf(symbol)) return null;
  const price = parseTickPrice(record.price);
  if (price === null) return null;
  // volume 是單筆 tick 量,不是當日累計(P-W5)——刻意不帶進 LiveTick。
  const time = typeof record.time === 'string' ? record.time : '';
  return { symbol, price, time, receivedAt };
}

function sameOriginWsUrl(location: Pick<Location, 'protocol' | 'host'>, wsUrl: string, ticket: string): string {
  // 只接受同源路徑(與 apiClient 一律同源相對路徑一致);絕對 URL / protocol-relative 一律拒絕。
  // 錯誤訊息刻意不含 URL / ticket(T-04.2-32)。
  if (typeof wsUrl !== 'string' || !wsUrl.startsWith('/') || wsUrl.startsWith('//')) {
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

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

function defaultDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * API mode 的 WS client。狀態機(RESEARCH W5):
 *
 * ```
 * idle ──watch(≥1)──► connecting ──WELCOME──► live
 * connecting ──ticket 失敗(非 401)/ socket 建立失敗──► degraded ──backoff──► connecting
 * live ──close 4000 / 4003(*) / 4008/4009/4400/4500/1006──► degraded ──backoff(1,2,4,8,16,30,30… s)──► connecting
 * live / connecting ──close 4001──► connecting(立即重取 ticket 一次;再 4001 或 ticket 401 → closed)
 * closed ──新的 watch() 或 reconnect()(App 在 session 回到 authenticated 時呼叫)──► connecting(重設 4001 重試額度;WR-05)
 * 任何 ──close 4002 或 auth_expired reason=session_replaced──► replaced(不自動重連;reconnect() 才回 connecting)
 * 任何 ──visibility hidden──► close(1000) ──► idle(保留訂閱集合)
 * idle ──visibility visible 且有消費者──► connecting(重取 ticket,WELCOME 後 resyncSeq += 1)
 * 任何 ──最後一個消費者釋放 + 5 s──► close(1000) ──► idle
 * (* 4003 只在零訂閱時發生:有消費者才重連,否則 idle)
 * ```
 */
export function createHttpQuoteStream(deps: QuoteStreamDeps = {}): QuoteStream {
  const basePath = (deps.basePath ?? '/api/v1').replace(/\/$/, '');
  const socketFactory = deps.socketFactory ?? defaultSocketFactory;
  const issueTicket = deps.issueTicket
    ?? (() => apiRequest<WsTicketResponse>(`${basePath}/market/ws/ticket`, { method: 'POST' }));
  const now = deps.now ?? (() => Date.now());
  const location = deps.location ?? globalThis.location;
  const doc = deps.document ?? defaultDocument();

  const status = ref<QuoteStreamStatus>('idle');
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);

  /** 代號 → 消費者參考計數(insertion order = SUBSCRIBE 的 channel 順序) */
  const refCounts = new Map<string, number>();
  /** 目前這條連線上已送出 SUBSCRIBE(且未被 SUB_ACK 拒絕)的 channel */
  const subscribed = new Set<string>();
  /** SUB_ACK 拒絕的 channel:同一條連線上不再重送 */
  const rejectedChannels = new Set<string>();
  const pendingTicks = new Map<string, LiveTick>();
  const priorityQueue: string[] = [];
  const normalQueue: string[] = [];
  const sentAt: number[] = [];

  let socket: WebSocketLike | null = null;
  /** 每次建立 / 拆除連線遞增,讓過期的非同步 ticket 回應與 socket 事件失效 */
  let generation = 0;
  let backoffAttempt = 0;
  let authRetryUsed = false;
  let sessionReplaced = false;
  let disposed = false;

  let flushTimer: Timer | null = null;
  let reconnectTimer: Timer | null = null;
  let releaseTimer: Timer | null = null;
  let syncTimer: Timer | null = null;
  let drainTimer: Timer | null = null;
  let welcomeTimer: Timer | null = null;

  function clearTimer(timer: Timer | null): null {
    if (timer) clearTimeout(timer);
    return null;
  }

  function transition(next: QuoteStreamStatus): void {
    status.value = next;
  }

  function isHidden(): boolean {
    return doc?.visibilityState === 'hidden';
  }

  function desiredChannels(): string[] {
    return [...refCounts.keys()].map(channelOf);
  }

  // ---- 送出:滑動 1 秒視窗 ≤ 5 則(token bucket 的嚴格形式),PONG 走優先佇列 ----

  function enqueue(message: Record<string, unknown>, priority = false): void {
    (priority ? priorityQueue : normalQueue).push(JSON.stringify(message));
    drain();
  }

  function drain(): void {
    drainTimer = clearTimer(drainTimer);
    while (priorityQueue.length || normalQueue.length) {
      if (!socket || socket.readyState !== WS_OPEN) return;
      const at = now();
      while (sentAt.length && at - sentAt[0] >= SEND_WINDOW_MS) sentAt.shift();
      if (sentAt.length >= SEND_LIMIT_PER_WINDOW) {
        drainTimer = setTimeout(drain, SEND_WINDOW_MS - (at - sentAt[0]));
        return;
      }
      const next = priorityQueue.length ? priorityQueue.shift()! : normalQueue.shift()!;
      socket.send(next);
      sentAt.push(at);
    }
  }

  function resetConnectionState(): void {
    subscribed.clear();
    rejectedChannels.clear();
    priorityQueue.length = 0;
    normalQueue.length = 0;
    drainTimer = clearTimer(drainTimer);
    // 連線被拆除 / 關閉(detachSocket、handleClose)時一併取消 WELCOME 逾時。
    welcomeTimer = clearTimer(welcomeTimer);
  }

  // ---- 訂閱同步:200 ms 視窗合併成至多一則 UNSUBSCRIBE + 一則 SUBSCRIBE ----

  function scheduleSync(): void {
    if (syncTimer) return;
    syncTimer = setTimeout(syncSubscriptions, SUBSCRIPTION_SYNC_MS);
  }

  function syncSubscriptions(): void {
    syncTimer = null;
    if (status.value !== 'live' || !socket) return;
    const desired = new Set(desiredChannels());
    rejectedChannels.forEach(channel => {
      if (!desired.has(channel)) rejectedChannels.delete(channel);
    });
    const toUnsubscribe = [...subscribed].filter(channel => !desired.has(channel));
    const toSubscribe = [...desired].filter(channel => !subscribed.has(channel) && !rejectedChannels.has(channel));
    if (toUnsubscribe.length) {
      toUnsubscribe.forEach(channel => subscribed.delete(channel));
      enqueue({ type: 'UNSUBSCRIBE', channels: toUnsubscribe });
    }
    if (toSubscribe.length) {
      toSubscribe.forEach(channel => subscribed.add(channel));
      enqueue({ type: 'SUBSCRIBE', channels: toSubscribe });
    }
  }

  // ---- 接收 ----

  function flushTicks(): void {
    flushTimer = null;
    if (pendingTicks.size === 0) return;
    const next = new Map(ticks.value);
    let latest = lastDataAt.value ?? 0;
    pendingTicks.forEach((tick, symbol) => {
      next.set(symbol, tick);
      latest = Math.max(latest, tick.receivedAt);
    });
    pendingTicks.clear();
    ticks.value = next;
    lastDataAt.value = latest;
  }

  function acceptTick(message: Record<string, unknown>): void {
    const channel = message.channel;
    if (typeof channel !== 'string' || !subscribed.has(channel)) return;
    const tick = parseTickData(channel, message.data, now());
    if (!tick) return;
    pendingTicks.set(tick.symbol, tick);
    if (!flushTimer) flushTimer = setTimeout(flushTicks, TICK_FLUSH_MS);
  }

  function handleWelcome(): void {
    welcomeTimer = clearTimer(welcomeTimer);
    transition('live');
    backoffAttempt = 0;
    authRetryUsed = false;
    resyncSeq.value += 1;
    subscribed.clear();
    const channels = desiredChannels().filter(channel => !rejectedChannels.has(channel));
    if (channels.length) {
      channels.forEach(channel => subscribed.add(channel));
      enqueue({ type: 'SUBSCRIBE', channels });
    }
  }

  function handleSubAck(message: Record<string, unknown>): void {
    if (!Array.isArray(message.rejected)) return;
    message.rejected.forEach(entry => {
      const channel = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).channel : null;
      if (typeof channel !== 'string') return;
      subscribed.delete(channel);
      rejectedChannels.add(channel);
    });
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
      case 'WELCOME':
        handleWelcome();
        break;
      case 'TICK':
        acceptTick(record);
        break;
      case 'PING':
        enqueue({ type: 'PONG' }, true);
        break;
      case 'SUB_ACK':
        handleSubAck(record);
        break;
      case 'auth_expired':
        if (record.reason === 'session_replaced') {
          sessionReplaced = true;
          reconnectTimer = clearTimer(reconnectTimer);
          detachSocket();
          transition('replaced');
        }
        // 其他 reason 隨後會以 4001 關閉,交給 handleClose。
        break;
      default:
        // ERROR 等訊息不渲染、不記錄(ERROR.detail 會回射輸入,T-04.2-35)。
        break;
    }
  }

  function handleClose(code: number): void {
    socket = null;
    resetConnectionState();
    if (disposed) return;
    if (sessionReplaced || code === CLOSE_SESSION_REPLACED) {
      sessionReplaced = true;
      transition('replaced');
      return;
    }
    if (code === CLOSE_AUTH_EXPIRED) {
      if (!authRetryUsed) {
        authRetryUsed = true;
        void connect();
        return;
      }
      transition('closed');
      return;
    }
    if (code === CLOSE_RATE_LIMITED || code === CLOSE_BAD_MESSAGE) {
      // 代表前端送出節奏 / 格式有 bug;只記關閉碼,不帶 URL / ticket。
      console.warn(`[quoteStream] market WebSocket closed by server with code ${code}`);
    }
    if (refCounts.size === 0) {
      transition('idle');
      return;
    }
    transition('degraded');
    scheduleReconnect();
  }

  // ---- 連線生命週期 ----

  function detachSocket(code = NORMAL_CLOSURE): void {
    generation += 1;
    const current = socket;
    socket = null;
    resetConnectionState();
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

  function scheduleReconnect(): void {
    reconnectTimer = clearTimer(reconnectTimer);
    const delay = BACKOFF_MS[Math.min(backoffAttempt, BACKOFF_MS.length - 1)];
    backoffAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    reconnectTimer = clearTimer(reconnectTimer);
    if (disposed) return;
    if (refCounts.size === 0 || isHidden()) {
      transition('idle');
      return;
    }
    const attempt = ++generation;
    transition('connecting');

    let ticket: WsTicketResponse;
    try {
      // 每次連線都現取 ticket(一次性、30 s TTL;同時觸發 apiClient 的 refresh,P-W2)。
      ticket = await issueTicket();
    } catch (error) {
      if (attempt !== generation || disposed) return;
      if (isUnauthorized(error)) {
        transition('closed');
        return;
      }
      transition('degraded');
      scheduleReconnect();
      return;
    }
    if (attempt !== generation || disposed) return;

    let ws: WebSocketLike;
    try {
      ws = socketFactory(sameOriginWsUrl(location, ticket.wsUrl, ticket.ticket));
    } catch {
      // 瀏覽器的建構例外訊息可能含 URL(即含 ticket)——吞掉,不轉拋、不記錄。
      transition('degraded');
      scheduleReconnect();
      return;
    }
    socket = ws;
    resetConnectionState();
    welcomeTimer = setTimeout(() => {
      welcomeTimer = null;
      // 只處理仍是目前這條的 socket(過期計時器理論上已被 resetConnectionState 清掉,這裡再守一次)。
      if (socket !== ws || disposed) return;
      detachSocket();
      transition('degraded');
      scheduleReconnect();
    }, WELCOME_TIMEOUT_MS);
    ws.onmessage = event => {
      if (socket === ws) handleMessage(event.data);
    };
    ws.onclose = event => {
      if (socket === ws) handleClose(event.code);
    };
    ws.onerror = () => {
      // close 事件隨後會到;此處不記錄任何 URL / ticket。
    };
  }

  function ensureConnected(): void {
    if (disposed || isHidden()) return;
    if (status.value === 'closed') {
      // WR-05:closed 只由認證失敗造成(dispose 已被 disposed 擋下)。新的消費者出現(例如重新登入後頁面重新掛載)
      // 視同 idle:重設 4001 重試額度與退避再連線一次;若仍未登入,ticket 401 會再回到 closed。
      // replaced 不在此列——只接受使用者手動 reconnect()(04.2-14)。
      authRetryUsed = false;
      backoffAttempt = 0;
    } else if (status.value !== 'idle') {
      return;
    }
    void connect();
  }

  function scheduleRelease(): void {
    releaseTimer = clearTimer(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (refCounts.size > 0) return;
      reconnectTimer = clearTimer(reconnectTimer);
      detachSocket();
      if (status.value !== 'replaced' && status.value !== 'closed') transition('idle');
    }, RELEASE_DELAY_MS);
  }

  function onVisibilityChange(): void {
    if (disposed) return;
    if (isHidden()) {
      reconnectTimer = clearTimer(reconnectTimer);
      syncTimer = clearTimer(syncTimer);
      detachSocket();
      if (status.value !== 'replaced' && status.value !== 'closed') transition('idle');
      return;
    }
    if (status.value === 'idle' && refCounts.size > 0) {
      backoffAttempt = 0;
      void connect();
    }
  }

  doc?.addEventListener('visibilitychange', onVisibilityChange);

  return {
    mode: 'api',
    status: readonly(status),
    ticks,
    lastDataAt: readonly(lastDataAt),
    resyncSeq: readonly(resyncSeq),
    watch(symbols) {
      const accepted = acceptableSymbols(symbols);
      if (!accepted.length || disposed) return () => {};
      accepted.forEach(symbol => refCounts.set(symbol, (refCounts.get(symbol) ?? 0) + 1));
      releaseTimer = clearTimer(releaseTimer);
      scheduleSync();
      ensureConnected();
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        accepted.forEach(symbol => {
          const count = (refCounts.get(symbol) ?? 0) - 1;
          if (count > 0) refCounts.set(symbol, count);
          else refCounts.delete(symbol);
        });
        scheduleSync();
        if (refCounts.size === 0) scheduleRelease();
      };
    },
    reconnect() {
      if (disposed) return;
      reconnectTimer = clearTimer(reconnectTimer);
      releaseTimer = clearTimer(releaseTimer);
      detachSocket();
      backoffAttempt = 0;
      authRetryUsed = false;
      sessionReplaced = false;
      if (refCounts.size > 0) void connect();
      else transition('idle');
    },
    dispose() {
      disposed = true;
      flushTimer = clearTimer(flushTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      releaseTimer = clearTimer(releaseTimer);
      syncTimer = clearTimer(syncTimer);
      doc?.removeEventListener('visibilitychange', onVisibilityChange);
      detachSocket();
      refCounts.clear();
      pendingTicks.clear();
      transition('closed');
    },
  };
}

/**
 * mock 模式的明確假推播(鐵律 3;RESEARCH W5):不開 socket、不打 ticket,
 * 只對被 watch 且在 data.ts 可交易清單(股票 / 加密)的代號以其價格為起點每秒 ±0.5% 隨機漫步。
 * FX / 債券在 API mode 永遠沒有 tick(W4),mock 也不產生。
 */
export function createMockQuoteStream(deps: QuoteStreamDeps = {}): QuoteStream {
  const random = deps.random ?? Math.random;
  const now = deps.now ?? (() => Date.now());
  const basePrices = new Map([...SYMBOLS, ...CRYPTO].map(item => [item.sym, item.price]));

  const status = ref<QuoteStreamStatus>('idle');
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);
  const refCounts = new Map<string, number>();
  const walk = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function step(): void {
    const at = now();
    const next = new Map(ticks.value);
    let changed = false;
    refCounts.forEach((_count, symbol) => {
      const previous = walk.get(symbol) ?? basePrices.get(symbol);
      if (previous === undefined) return;
      const price = Math.round(previous * (1 + (random() * 2 - 1) * MOCK_STEP_RATIO) * 10000) / 10000;
      walk.set(symbol, price);
      // random walk 是 mock-only number 資料;產出 tick 時才轉成 Decimal(與 API mode 的 LiveTick 同型)。
      next.set(symbol, { symbol, price: parseDecimal(numberToWire(price)), time: new Date(at).toISOString(), receivedAt: at });
      changed = true;
    });
    if (!changed) return;
    ticks.value = next;
    lastDataAt.value = at;
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    mode: 'mock',
    status: readonly(status),
    ticks,
    lastDataAt: readonly(lastDataAt),
    resyncSeq: readonly(resyncSeq),
    watch(symbols) {
      const accepted = acceptableSymbols(symbols);
      if (!accepted.length || disposed) return () => {};
      accepted.forEach(symbol => refCounts.set(symbol, (refCounts.get(symbol) ?? 0) + 1));
      if (!timer) timer = setInterval(step, MOCK_TICK_INTERVAL_MS);
      status.value = 'live';
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        accepted.forEach(symbol => {
          const count = (refCounts.get(symbol) ?? 0) - 1;
          if (count > 0) refCounts.set(symbol, count);
          else refCounts.delete(symbol);
        });
        if (refCounts.size === 0) {
          stop();
          status.value = 'idle';
        }
      };
    },
    reconnect() {
      if (disposed) return;
      status.value = refCounts.size > 0 ? 'live' : 'idle';
    },
    dispose() {
      disposed = true;
      stop();
      refCounts.clear();
      status.value = 'closed';
    },
  };
}

export function createQuoteStream(mode: RuntimeDataMode, deps: QuoteStreamDeps = {}): QuoteStream {
  // API mode 絕不回退 mock 推播(鐵律 3;api-adapter-wiring.test.ts 守門)。
  return mode === 'api' ? createHttpQuoteStream(deps) : createMockQuoteStream(deps);
}
