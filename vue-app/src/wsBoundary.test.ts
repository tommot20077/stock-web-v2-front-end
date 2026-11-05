import { describe, expect, it } from 'vitest';
import quoteStreamSource from './services/quoteStream.ts?raw';

/**
 * WS 邊界守門(D-24、T-04.2-33):瀏覽器 WebSocket 只允許在 `services/quoteStream.ts` 建立,
 * pages / components 一律經 `getRuntimeApiClients().quotes` + `useLiveQuotes`。
 * 以 Vite `?raw` 取原始碼逐檔斷言(比照 Positions.test.ts 的 mock store 守門)。
 */
const pageSources = import.meta.glob('./pages/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const componentSources = import.meta.glob('./components/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** 建立瀏覽器 WebSocket(`new WebSocket(`)或直接呼叫全域 WebSocket(`WebSocket(`) */
const DIRECT_WEBSOCKET_CALL = /\bWebSocket\s*\(/;
/** 經全域物件取用 WebSocket 建構子(`window.WebSocket` / `globalThis.WebSocket` / `self.WebSocket`) */
const GLOBAL_WEBSOCKET_ACCESS = /\b(?:window|globalThis|self)\s*(?:\.\s*WebSocket\b|\[\s*['"`]WebSocket['"`]\s*\])/;

function violations(sources: Record<string, string>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => source.includes('new WebSocket(')
      || DIRECT_WEBSOCKET_CALL.test(source)
      || GLOBAL_WEBSOCKET_ACCESS.test(source))
    .map(([path]) => path);
}

describe('WS 邊界守門(D-24)', () => {
  it('掃描範圍非空:pages 與 components 都讀得到原始碼', () => {
    expect(Object.keys(pageSources).length).toBeGreaterThan(5);
    expect(Object.keys(componentSources).length).toBeGreaterThan(5);
  });

  it('src/pages/**/*.vue 不直接建立或呼叫瀏覽器 WebSocket', () => {
    expect(violations(pageSources)).toEqual([]);
  });

  it('src/components/**/*.vue 不直接建立或呼叫瀏覽器 WebSocket', () => {
    expect(violations(componentSources)).toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    expect(violations({ a: 'const ws = new WebSocket(url);' })).toEqual(['a']);
    expect(violations({ b: 'const ws = WebSocket (url);' })).toEqual(['b']);
    expect(violations({ c: 'const Ctor = window.WebSocket;' })).toEqual(['c']);
    expect(violations({ d: "const Ctor = globalThis['WebSocket'];" })).toEqual(['d']);
    expect(violations({ e: 'import type { QuoteStream } from "../services/quoteStream";' })).toEqual([]);
  });

  it('services/quoteStream.ts 是唯一允許建立 WebSocket 的地方', () => {
    expect(quoteStreamSource.split('new WebSocket(').length - 1).toBe(1);
  });
});
