import { afterEach, describe, expect, it, vi } from 'vitest';

import config from '../vite.config';

/**
 * API mode 沒有任何 base-url 設定(`apiClient.ts` 全走同源相對路徑,repo 內唯一的 VITE_ 變數是
 * `VITE_DATA_MODE`),所以「前端連得到後端」完全取決於 dev server 與 preview server 都有 `/api` 代理。
 *
 * 少了 dev 的那一份,`VITE_DATA_MODE=api npm run dev` 會把 `/api/v1/*` 交給 SPA fallback,
 * 拿回 index.html 並被當成 404 —— 畫面顯示「暫時無法連線到後端」,看起來像後端掛了。
 */
describe('vite server 設定', () => {
  it('dev server 與 preview server 都把 /api 代理到後端(API mode 的唯一連線途徑)', () => {
    for (const server of ['server', 'preview'] as const) {
      const proxy = (config as Record<string, { proxy?: Record<string, unknown> }>)[server]?.proxy;
      expect(proxy, `${server}.proxy`).toBeDefined();
      expect(proxy, `${server}.proxy['/api']`).toHaveProperty('/api');
    }
  });

  it('dev server 與 preview server 都把 /ws 以 websocket 模式代理到後端', () => {
    for (const server of ['server', 'preview'] as const) {
      const proxy = (config as Record<string, { proxy?: Record<string, { ws?: boolean }> }>)[server]
        ?.proxy;
      expect(proxy?.['/ws'], `${server}.proxy['/ws']`).toBeDefined();
      expect(proxy?.['/ws']?.ws, `${server}.proxy['/ws'].ws`).toBe(true);
    }
  });
});

/**
 * D-21:proxy 目標由 `VITE_API_PROXY_TARGET`(只在 Node 端讀取的 shell env)決定,未設時為
 * `http://localhost:11180`(= 後端 `application.yaml` `server.port` 預設),Browser E2E 由
 * `playwright.config.ts` 設為 8080(`e2e-browser` profile)。
 */
describe('vite proxy 目標(VITE_API_PROXY_TARGET)', () => {
  type ProxyEntry = string | { target?: string; ws?: boolean };
  type ServerConfig = Record<string, { proxy?: Record<string, ProxyEntry> }>;

  const targetOf = (entry: ProxyEntry | undefined): string | undefined =>
    typeof entry === 'string' ? entry : entry?.target;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('未設 env 時 dev 與 preview 的 /api、/ws 皆代理到 http://localhost:11180(後端 dev 預設 port)', async () => {
    vi.stubEnv('VITE_API_PROXY_TARGET', undefined);
    vi.resetModules();
    const { default: fresh } = await import('../vite.config');
    for (const server of ['server', 'preview'] as const) {
      const proxy = (fresh as ServerConfig)[server]?.proxy;
      expect(targetOf(proxy?.['/api']), `${server}.proxy['/api']`).toBe('http://localhost:11180');
      expect(targetOf(proxy?.['/ws']), `${server}.proxy['/ws']`).toBe('http://localhost:11180');
      expect((proxy?.['/ws'] as { ws?: boolean })?.ws, `${server}.proxy['/ws'].ws`).toBe(true);
    }
  });

  it('設定 VITE_API_PROXY_TARGET 後 dev 與 preview 的 /api、/ws 皆改用該值', async () => {
    vi.stubEnv('VITE_API_PROXY_TARGET', 'http://localhost:8080');
    vi.resetModules();
    const { default: fresh } = await import('../vite.config');
    for (const server of ['server', 'preview'] as const) {
      const proxy = (fresh as ServerConfig)[server]?.proxy;
      expect(targetOf(proxy?.['/api']), `${server}.proxy['/api']`).toBe('http://localhost:8080');
      expect(targetOf(proxy?.['/ws']), `${server}.proxy['/ws']`).toBe('http://localhost:8080');
      expect((proxy?.['/ws'] as { ws?: boolean })?.ws, `${server}.proxy['/ws'].ws`).toBe(true);
    }
  });
});
