import { describe, expect, it } from 'vitest';

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
      const proxy = (config as Record<string, { proxy?: Record<string, { ws?: boolean }> }>)[server]?.proxy;
      expect(proxy?.['/ws'], `${server}.proxy['/ws']`).toBeDefined();
      expect(proxy?.['/ws']?.ws, `${server}.proxy['/ws'].ws`).toBe(true);
    }
  });
});
