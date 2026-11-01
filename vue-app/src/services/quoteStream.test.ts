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
