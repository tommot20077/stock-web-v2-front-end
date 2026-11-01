import type { WebSocketLike } from '../services/quoteStream';

/**
 * 測試替身:取代瀏覽器 WebSocket(jsdom 自帶的實作會嘗試真實連線,RESEARCH P-W7)。
 * 記錄 client 送出的訊息與關閉碼,並讓測試以 serverOpen / serverSend / serverClose 模擬伺服器。
 */
export class FakeWebSocket implements WebSocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('FakeWebSocket: send() while not OPEN');
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.closedWith = { code, reason };
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** 已解析的送出訊息(JSON) */
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map(raw => JSON.parse(raw) as Record<string, unknown>);
  }

  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  serverSend(message: unknown): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  serverClose(code: number, reason = ''): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason, wasClean: code === 1000 }));
  }
}

export function createFakeSocketFactory(): {
  factory: (url: string) => FakeWebSocket;
  sockets: FakeWebSocket[];
  /** 最近一次建立的 socket */
  last: () => FakeWebSocket;
} {
  const sockets: FakeWebSocket[] = [];
  return {
    sockets,
    factory: (url: string) => {
      const socket = new FakeWebSocket(url);
      sockets.push(socket);
      return socket;
    },
    last: () => {
      const socket = sockets[sockets.length - 1];
      if (!socket) throw new Error('FakeWebSocket: no socket created yet');
      return socket;
    },
  };
}
