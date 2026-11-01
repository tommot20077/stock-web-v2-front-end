import { readonly, ref, shallowRef, type Ref } from 'vue';
import type { RuntimeDataMode } from './apiTypes';

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
  watch(symbols: readonly string[]): () => void;
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
  location?: Pick<Location, 'protocol' | 'host'>;
}

// RED skeleton:尚未實作。
export function createQuoteStream(mode: RuntimeDataMode, _deps: QuoteStreamDeps = {}): QuoteStream {
  const status = ref<QuoteStreamStatus>('idle');
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const lastDataAt = ref<number | null>(null);
  const resyncSeq = ref(0);
  return {
    mode,
    status: readonly(status),
    ticks,
    lastDataAt: readonly(lastDataAt),
    resyncSeq: readonly(resyncSeq),
    watch: () => () => {},
    reconnect: () => {},
    dispose: () => {},
  };
}
