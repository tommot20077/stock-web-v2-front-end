import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuoteStream, type QuoteStream, type WsTicketResponse } from './quoteStream';
import { createFakeSocketFactory } from '../testing/fakeWebSocket';

const TICKET = 'tk_Secret-Ticket_abc123';

function ticketResponse(ticket = TICKET): WsTicketResponse {
  return { ticket, expiresIn: 30, wsUrl: '/ws/v1/market' };
}

function tickMessage(symbol: string, price: string, time = '2026-10-31T01:23:45.678Z') {
  return { type: 'TICK', channel: `tick.${symbol}`, data: { symbol, price, volume: null, time } };
}

let streams: QuoteStream[] = [];

function track(stream: QuoteStream): QuoteStream {
  streams.push(stream);
  return stream;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  streams.forEach(stream => stream.dispose());
  streams = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

describe('createQuoteStream(api) — tracer:watch → ticket → 連線 → SUBSCRIBE → TICK', () => {
  it('Test 1:watch AAPL 取一次 ticket,以同源 ws URL 連線,WELCOME 後 live 並送出一則 SUBSCRIBE tick.AAPL', async () => {
    const sockets = createFakeSocketFactory();
    const issueTicket = vi.fn(async () => ticketResponse());
    const stream = track(createQuoteStream('api', { socketFactory: sockets.factory, issueTicket }));

    expect(stream.mode).toBe('api');
    expect(stream.status.value).toBe('idle');

    stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);

    expect(issueTicket).toHaveBeenCalledOnce();
    expect(sockets.sockets).toHaveLength(1);
    expect(sockets.last().url).toBe(`ws://${location.host}/ws/v1/market?ticket=${encodeURIComponent(TICKET)}`);
    expect(stream.status.value).toBe('connecting');

    sockets.last().serverOpen();
    sockets.last().serverSend({ type: 'WELCOME', sessionId: 's1', maxSubscriptions: 10 });
    await vi.advanceTimersByTimeAsync(0);

    expect(stream.status.value).toBe('live');
    const subscribes = sockets.last().sent.filter(raw => raw.includes('"SUBSCRIBE"'));
    expect(subscribes).toEqual(['{"type":"SUBSCRIBE","channels":["tick.AAPL"]}']);
  });

  it('Test 1b:https 頁面以 wss: 連線,ticket 經 encodeURIComponent', async () => {
    const sockets = createFakeSocketFactory();
    const stream = track(createQuoteStream('api', {
      socketFactory: sockets.factory,
      issueTicket: async () => ticketResponse('a+b/c='),
      location: { protocol: 'https:', host: 'stock.example.com' },
    }));

    stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets.last().url).toBe('wss://stock.example.com/ws/v1/market?ticket=a%2Bb%2Fc%3D');
  });

  it('Test 2:TICK 在 250 ms 批次後進到 ticks(價格轉為數字),同代號只保留最後一筆', async () => {
    const sockets = createFakeSocketFactory();
    const stream = track(createQuoteStream('api', {
      socketFactory: sockets.factory,
      issueTicket: async () => ticketResponse(),
    }));

    stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);
    sockets.last().serverOpen();
    sockets.last().serverSend({ type: 'WELCOME' });
    await vi.advanceTimersByTimeAsync(0);

    sockets.last().serverSend(tickMessage('AAPL', '218.4'));
    await vi.advanceTimersByTimeAsync(100);
    expect(stream.ticks.value.get('AAPL')).toBeUndefined();
    expect(stream.lastDataAt.value).toBeNull();

    await vi.advanceTimersByTimeAsync(150);
    const first = stream.ticks.value.get('AAPL');
    expect(first?.price).toBe(218.4);
    expect(typeof first?.price).toBe('number');
    expect(first?.time).toBe('2026-10-31T01:23:45.678Z');
    expect(stream.lastDataAt.value).not.toBeNull();

    sockets.last().serverSend(tickMessage('AAPL', '219.0'));
    sockets.last().serverSend(tickMessage('AAPL', '219.25'));
    await vi.advanceTimersByTimeAsync(250);
    expect(stream.ticks.value.get('AAPL')?.price).toBe(219.25);
  });

  it('Test 2b:非有限數價格或未訂閱 channel 的 TICK 被丟棄', async () => {
    const sockets = createFakeSocketFactory();
    const stream = track(createQuoteStream('api', {
      socketFactory: sockets.factory,
      issueTicket: async () => ticketResponse(),
    }));

    stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);
    sockets.last().serverOpen();
    sockets.last().serverSend({ type: 'WELCOME' });
    await vi.advanceTimersByTimeAsync(0);

    sockets.last().serverSend(tickMessage('AAPL', 'not-a-number'));
    sockets.last().serverSend(tickMessage('TSLA', '178.22'));
    sockets.last().serverSend('{ broken json');
    await vi.advanceTimersByTimeAsync(300);

    expect(stream.ticks.value.size).toBe(0);
  });

  it('Test 3:預設 issueTicket 經 apiClient POST /api/v1/market/ws/ticket(credentials include + X-XSRF-TOKEN)', async () => {
    document.cookie = 'XSRF-TOKEN=csrf_ws; path=/';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: ticketResponse(),
      error: null,
      meta: { traceId: 'trace_ws' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const sockets = createFakeSocketFactory();
    const stream = track(createQuoteStream('api', { socketFactory: sockets.factory }));

    stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/v1/market/ws/ticket');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('csrf_ws');
    expect(sockets.sockets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Task 2:狀態機(D-23)、送出節流(避免伺服器 4008)、代號自檢、mock 假推播
// ---------------------------------------------------------------------------

function apiHarness(overrides: Partial<Parameters<typeof createQuoteStream>[1]> = {}) {
  const sockets = createFakeSocketFactory();
  const issueTicket = vi.fn(async () => ticketResponse());
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const stream = track(createQuoteStream('api', {
    socketFactory: sockets.factory,
    issueTicket,
    document: doc as unknown as Document,
    ...overrides,
  }));
  async function goLive() {
    await vi.advanceTimersByTimeAsync(0);
    sockets.last().serverOpen();
    sockets.last().serverSend({ type: 'WELCOME', sessionId: 's', maxSubscriptions: 10 });
    await vi.advanceTimersByTimeAsync(0);
  }
  function setVisibility(state: DocumentVisibilityState) {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  }
  return { sockets, issueTicket, stream, goLive, setVisibility };
}

function messagesOfType(raw: string[], type: string): Array<Record<string, unknown>> {
  return raw.map(item => JSON.parse(item) as Record<string, unknown>).filter(message => message.type === type);
}

describe('createQuoteStream(api) — 重連與退避(D-23)', () => {
  it('非 4001/4002 關閉 → degraded,依 1 / 2 / 4 / 8 / 16 / 30 / 30 s 退避,每次重連都重取 ticket;WELCOME 後退避重設', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();

    h.sockets.last().serverClose(4000, 'Heartbeat timeout');
    expect(h.stream.status.value).toBe('degraded');

    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of expectedDelays) {
      const before = h.sockets.sockets.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.sockets.sockets.length, `no reconnect before ${delay} ms`).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.sockets.sockets.length, `reconnect at ${delay} ms`).toBe(before + 1);
      expect(h.stream.status.value).toBe('connecting');
      h.sockets.last().serverClose(1006);
      expect(h.stream.status.value).toBe('degraded');
    }
    expect(h.issueTicket).toHaveBeenCalledTimes(h.sockets.sockets.length);

    // 成功收到 WELCOME 後退避回到 1 s
    await vi.advanceTimersByTimeAsync(30000);
    h.sockets.last().serverOpen();
    h.sockets.last().serverSend({ type: 'WELCOME' });
    expect(h.stream.status.value).toBe('live');
    h.sockets.last().serverClose(4009, 'Server shutdown');
    const before = h.sockets.sockets.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets.sockets.length).toBe(before + 1);
  });

  it('issueTicket 失敗(非 401)→ degraded 並退避重試', async () => {
    const h = apiHarness();
    h.issueTicket.mockRejectedValueOnce(new Error('network down'));
    h.stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.stream.status.value).toBe('degraded');
    expect(h.sockets.sockets).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.issueTicket).toHaveBeenCalledTimes(2);
    expect(h.sockets.sockets).toHaveLength(1);
  });

  it('4002 → replaced,60 s 內不自動重連;reconnect() 才回到 connecting', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();

    h.sockets.last().serverClose(4002, 'Session replaced');
    expect(h.stream.status.value).toBe('replaced');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets.sockets).toHaveLength(1);
    expect(h.stream.status.value).toBe('replaced');

    h.stream.reconnect();
    expect(h.stream.status.value).toBe('connecting');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sockets.sockets).toHaveLength(2);
  });

  it('auth_expired reason=session_replaced → replaced,隨後的關閉也不重連', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();

    h.sockets.last().serverSend({ type: 'auth_expired', reason: 'session_replaced' });
    expect(h.stream.status.value).toBe('replaced');
    h.sockets.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets.sockets).toHaveLength(1);
    expect(h.stream.status.value).toBe('replaced');
  });

  it('4001 → 立即重取 ticket 重連一次;再次 4001 → closed', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();

    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.issueTicket).toHaveBeenCalledTimes(2);
    expect(h.sockets.sockets).toHaveLength(2);

    h.sockets.last().serverOpen();
    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.stream.status.value).toBe('closed');
    expect(h.sockets.sockets).toHaveLength(2);
  });

  it('4001 後重取 ticket 得到 401 → closed', async () => {
    const { ApiClientError } = await import('./apiClient');
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    h.issueTicket.mockRejectedValueOnce(new ApiClientError({ status: 401, code: 'AUTH_UNAUTHORIZED', message: 'unauthorized' }));

    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(60000);

    expect(h.stream.status.value).toBe('closed');
    expect(h.sockets.sockets).toHaveLength(1);
  });

  it('WR-05:auth 造成的 closed 後,新的 watch(重新登入後頁面重新掛載)會重設 4001 重試額度並重取 ticket 連線', async () => {
    const { ApiClientError } = await import('./apiClient');
    const h = apiHarness();
    const release = h.stream.watch(['AAPL']);
    await h.goLive();
    h.issueTicket.mockRejectedValueOnce(new ApiClientError({ status: 401, code: 'AUTH_UNAUTHORIZED', message: 'unauthorized' }));
    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stream.status.value).toBe('closed');
    expect(h.issueTicket).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.stream.status.value).toBe('closed');

    // 使用者重新登入;頁面重新掛載 → 新消費者
    h.stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.issueTicket).toHaveBeenCalledTimes(3);
    expect(h.sockets.sockets).toHaveLength(2);
    expect(h.stream.status.value).toBe('connecting');
    h.sockets.last().serverOpen();
    h.sockets.last().serverSend({ type: 'WELCOME' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stream.status.value).toBe('live');

    // 4001 重試額度已重設:再一次 4001 仍會先立即重取 ticket 一次
    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.issueTicket).toHaveBeenCalledTimes(4);
    expect(h.stream.status.value).toBe('connecting');
  });

  it('WR-05:closed 後 reconnect()(App 在 session 回到 authenticated 時呼叫)回到 connecting 並重新連線', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(0);
    h.sockets.last().serverOpen();
    h.sockets.last().serverClose(4001, 'Auth expired');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stream.status.value).toBe('closed');

    h.stream.reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stream.status.value).toBe('connecting');
    expect(h.sockets.sockets).toHaveLength(3);
  });

  it('WR-05:replaced 仍只接受手動 reconnect(),新的 watch 不會自動接回(04.2-14 語意不變)', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    h.sockets.last().serverClose(4002, 'Session replaced');
    expect(h.stream.status.value).toBe('replaced');

    h.stream.watch(['TSLA']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.stream.status.value).toBe('replaced');
    expect(h.issueTicket).toHaveBeenCalledOnce();
    expect(h.sockets.sockets).toHaveLength(1);
  });

  it('4003:有消費者才重連;無消費者 → idle', async () => {
    const h = apiHarness();
    const release = h.stream.watch(['AAPL']);
    await h.goLive();

    h.sockets.last().serverClose(4003, 'Idle timeout');
    expect(h.stream.status.value).toBe('degraded');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets.sockets).toHaveLength(2);
    h.sockets.last().serverOpen();
    h.sockets.last().serverSend({ type: 'WELCOME' });

    release();
    h.sockets.last().serverClose(4003, 'Idle timeout');
    expect(h.stream.status.value).toBe('idle');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets.sockets).toHaveLength(2);
  });
});

describe('createQuoteStream(api) — 背景 / 前景與釋放延遲(D-23)', () => {
  it('hidden → close(1000)、idle 並保留訂閱;visible 且有消費者 → 重取 ticket 連線,WELCOME 後 resyncSeq 遞增', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    const firstSocket = h.sockets.last();
    const seqAfterFirstWelcome = h.stream.resyncSeq.value;

    h.setVisibility('hidden');
    expect(firstSocket.closedWith?.code).toBe(1000);
    expect(h.stream.status.value).toBe('idle');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets.sockets).toHaveLength(1);

    h.setVisibility('visible');
    expect(h.stream.status.value).toBe('connecting');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.issueTicket).toHaveBeenCalledTimes(2);
    expect(h.sockets.sockets).toHaveLength(2);
    h.sockets.last().serverOpen();
    h.sockets.last().serverSend({ type: 'WELCOME' });

    expect(h.stream.status.value).toBe('live');
    expect(h.stream.resyncSeq.value).toBe(seqAfterFirstWelcome + 1);
    expect(messagesOfType(h.sockets.last().sent, 'SUBSCRIBE')).toEqual([{ type: 'SUBSCRIBE', channels: ['tick.AAPL'] }]);
  });

  it('最後一個消費者釋放 5 s 後才 close(1000) → idle;5 s 內又 watch 則不關閉', async () => {
    const h = apiHarness();
    const releaseA = h.stream.watch(['AAPL']);
    await h.goLive();
    const socket = h.sockets.last();

    releaseA();
    await vi.advanceTimersByTimeAsync(4000);
    expect(socket.closedWith).toBeNull();
    const releaseB = h.stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(10000);
    expect(socket.closedWith).toBeNull();
    expect(h.stream.status.value).toBe('live');
    expect(h.sockets.sockets).toHaveLength(1);

    releaseB();
    await vi.advanceTimersByTimeAsync(4999);
    expect(socket.closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closedWith?.code).toBe(1000);
    expect(h.stream.status.value).toBe('idle');
  });

  it('多個消費者合併成同一條連線(每分頁一條)', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    h.stream.watch(['AAPL', 'TSLA']);
    await h.goLive();

    expect(h.issueTicket).toHaveBeenCalledOnce();
    expect(h.sockets.sockets).toHaveLength(1);
    expect(messagesOfType(h.sockets.last().sent, 'SUBSCRIBE')).toEqual([
      { type: 'SUBSCRIBE', channels: ['tick.AAPL', 'tick.TSLA'] },
    ]);
  });
});

describe('createQuoteStream(api) — 送出節流與 PING / PONG(避免 4008)', () => {
  it('200 ms 內 watch A、watch B、釋放 A → 只送一則 SUBSCRIBE ["tick.B"],沒有 UNSUBSCRIBE', async () => {
    const h = apiHarness();
    h.stream.watch(['X']);
    await h.goLive();
    const baseline = h.sockets.last().sent.length;

    const releaseA = h.stream.watch(['A']);
    await vi.advanceTimersByTimeAsync(50);
    h.stream.watch(['B']);
    await vi.advanceTimersByTimeAsync(50);
    releaseA();
    await vi.advanceTimersByTimeAsync(200);

    const after = h.sockets.last().sent.slice(baseline);
    expect(after).toEqual(['{"type":"SUBSCRIBE","channels":["tick.B"]}']);
  });

  it('切換集合 → 至多一則 UNSUBSCRIBE + 一則 SUBSCRIBE', async () => {
    const h = apiHarness();
    const release = h.stream.watch(['A', 'B']);
    await h.goLive();
    const baseline = h.sockets.last().sent.length;

    release();
    h.stream.watch(['C']);
    h.stream.watch(['D']);
    await vi.advanceTimersByTimeAsync(300);

    const after = h.sockets.last().sent.slice(baseline).map(raw => JSON.parse(raw));
    expect(after).toEqual([
      { type: 'UNSUBSCRIBE', channels: ['tick.A', 'tick.B'] },
      { type: 'SUBSCRIBE', channels: ['tick.C', 'tick.D'] },
    ]);
  });

  it('PING 立即回 PONG;1 秒內排隊 8 則 → 第一秒只送 5 則,其餘延後', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    await vi.advanceTimersByTimeAsync(1000);
    const socket = h.sockets.last();
    const baseline = socket.sent.length;

    socket.serverSend({ type: 'PING' });
    expect(socket.sent.slice(baseline)).toEqual(['{"type":"PONG"}']);

    for (let i = 0; i < 7; i += 1) socket.serverSend({ type: 'PING' });
    expect(socket.sent.length - baseline).toBe(5);
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.sent.length - baseline).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.sent.length - baseline).toBe(8);
  });

  it('PONG 優先於排隊中的訂閱訊息(仍計入額度)', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    await vi.advanceTimersByTimeAsync(1000);
    const socket = h.sockets.last();

    for (let i = 0; i < 5; i += 1) socket.serverSend({ type: 'PING' });
    const baseline = socket.sent.length;
    h.stream.watch(['TSLA']);
    await vi.advanceTimersByTimeAsync(300);
    socket.serverSend({ type: 'PING' });
    expect(socket.sent.length).toBe(baseline);

    await vi.advanceTimersByTimeAsync(700);
    expect(socket.sent.slice(baseline)).toEqual([
      '{"type":"PONG"}',
      '{"type":"SUBSCRIBE","channels":["tick.TSLA"]}',
    ]);
  });
});

describe('createQuoteStream(api) — channel 自檢與安全', () => {
  it('不合規代號不送出;合規代號原樣組 channel(大小寫不改)', async () => {
    const h = apiHarness();
    h.stream.watch(['bad code', '2330.TW', 'USD/TWD', 'brk.b']);
    await h.goLive();

    const subscribes = messagesOfType(h.sockets.last().sent, 'SUBSCRIBE');
    expect(subscribes).toEqual([{ type: 'SUBSCRIBE', channels: ['tick.2330.TW', 'tick.USD/TWD', 'tick.brk.b'] }]);
    expect(h.sockets.last().sent.join('')).not.toContain(' ');
  });

  it('只有不合規代號時不連線', async () => {
    const h = apiHarness();
    h.stream.watch(['bad code']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.issueTicket).not.toHaveBeenCalled();
    expect(h.stream.status.value).toBe('idle');
  });

  it('SUB_ACK rejected 的 channel 視為未訂閱,其 TICK 被丟棄', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL', 'TSLA']);
    await h.goLive();
    h.sockets.last().serverSend({
      type: 'SUB_ACK',
      accepted: ['tick.AAPL'],
      rejected: [{ channel: 'tick.TSLA', reason: 'SUBSCRIPTION_LIMIT_EXCEEDED' }],
    });
    h.sockets.last().serverSend(tickMessage('TSLA', '178.22'));
    h.sockets.last().serverSend(tickMessage('AAPL', '218.4'));
    await vi.advanceTimersByTimeAsync(250);

    expect(h.stream.ticks.value.has('TSLA')).toBe(false);
    expect(h.stream.ticks.value.get('AAPL')?.price).toBe(218.4);
  });

  it('任何 console.* 呼叫的參數都不含 ticket(含 4008 / 4400 警告與 socket 建立失敗)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    let throwOnce = true;
    const sockets = createFakeSocketFactory();
    const h = apiHarness({
      socketFactory: (url: string) => {
        if (throwOnce) {
          throwOnce = false;
          throw new SyntaxError(`Failed to construct 'WebSocket': The URL '${url}' is invalid.`);
        }
        return sockets.factory(url);
      },
    });

    h.stream.watch(['AAPL']);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stream.status.value).toBe('degraded');
    await vi.advanceTimersByTimeAsync(1000);
    sockets.last().serverOpen();
    sockets.last().serverSend({ type: 'WELCOME' });
    sockets.last().serverSend({ type: 'ERROR', code: 'WS_MSG_FORMAT_INVALID', detail: TICKET });
    sockets.last().serverClose(4008, 'Rate limited');
    await vi.advanceTimersByTimeAsync(1000);
    sockets.last().serverOpen();
    sockets.last().serverClose(4400, 'Bad message');
    await vi.advanceTimersByTimeAsync(2000);

    const warn = spies[2];
    expect(warn).toHaveBeenCalled();
    const allArgs = spies.flatMap(spy => spy.mock.calls.flat()).map(arg => String(arg instanceof Error ? `${arg.message} ${arg.stack}` : JSON.stringify(arg) ?? arg));
    allArgs.forEach(arg => expect(arg).not.toContain(TICKET));
    allArgs.forEach(arg => expect(arg).not.toContain('ws://'));
    spies.forEach(spy => spy.mockRestore());
  });

  it('dispose 清除 socket 與所有計時器,之後不再重連', async () => {
    const h = apiHarness();
    h.stream.watch(['AAPL']);
    await h.goLive();
    h.sockets.last().serverClose(4000);
    h.stream.dispose();
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.sockets.sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createQuoteStream(mock) — 明確的假推播(鐵律 3)', () => {
  it('watch 後 live、不開 socket 不打 ticket;每 1000 ms 對被 watch 的代號以 data.ts 價格 ±0.5% 隨機漫步;釋放後不再產生', async () => {
    const sockets = createFakeSocketFactory();
    const issueTicket = vi.fn(async () => ticketResponse());
    const stream = track(createQuoteStream('mock', {
      socketFactory: sockets.factory,
      issueTicket,
      random: () => 1,
    }));

    expect(stream.mode).toBe('mock');
    const release = stream.watch(['AAPL']);
    expect(stream.status.value).toBe('live');

    await vi.advanceTimersByTimeAsync(999);
    expect(stream.ticks.value.get('AAPL')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const first = stream.ticks.value.get('AAPL');
    expect(first?.price).toBeCloseTo(218.40 * 1.005, 2);
    expect(stream.lastDataAt.value).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    const second = stream.ticks.value.get('AAPL');
    expect(second?.price).toBeCloseTo(first!.price * 1.005, 2);

    release();
    await vi.advanceTimersByTimeAsync(3000);
    expect(stream.ticks.value.get('AAPL')).toBe(second);
    expect(sockets.sockets).toHaveLength(0);
    expect(issueTicket).not.toHaveBeenCalled();
  });

  it('不在 data.ts 可交易清單的代號(FX / 債券 / 未知)不產生 tick', async () => {
    const stream = track(createQuoteStream('mock', { random: () => 0.5 }));
    stream.watch(['EUR/USD', 'UNKNOWN', 'BTC']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(stream.ticks.value.has('EUR/USD')).toBe(false);
    expect(stream.ticks.value.has('UNKNOWN')).toBe(false);
    expect(stream.ticks.value.get('BTC')?.price).toBeCloseTo(67842.40, 2);
  });
});
