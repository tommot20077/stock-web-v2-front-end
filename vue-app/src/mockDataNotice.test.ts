import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';

import Alerts from './pages/Alerts.vue';
import Analytics from './pages/Analytics.vue';
import Chart from './pages/Chart.vue';
import Markets from './pages/Markets.vue';
import Notifications from './pages/Notifications.vue';
import Settings from './pages/Settings.vue';
import Watchlist from './pages/Watchlist.vue';
import { resetRuntimeApiClientsForTests } from './services/pageApiClients';
import { cleanupMounted, flushAsync, mountWithPinia } from './testUtils';

/**
 * 鐵律 6「可見的控制不得靜默 no-op：尚未接後端的功能必須標示」。
 *
 * 這七頁在 API mode 下仍讀 mock store（2026-09-02 功能審查 M-1）：使用者登入真帳號後看到的行情、
 * 觀察清單、通知等全是示範資料，而 watchlist 的新增 / 移除只寫進 mock store，重新整理就消失。
 * 在這些頁接上後端之前，至少要讓使用者知道他看到的不是自己的真實資料。
 */
const PAGES: Array<{ name: string; component: Component; props: Record<string, unknown> }> = [
  { name: 'Markets', component: Markets, props: { lang: 'zh' } },
  { name: 'Chart', component: Chart, props: { lang: 'zh', sym: 'AAPL', themeMode: 'tv', theme: 'dark' } },
  { name: 'Watchlist', component: Watchlist, props: { lang: 'zh' } },
  { name: 'Analytics', component: Analytics, props: { lang: 'zh' } },
  { name: 'Alerts', component: Alerts, props: { lang: 'zh' } },
  { name: 'Notifications', component: Notifications, props: { lang: 'zh' } },
  { name: 'Settings', component: Settings, props: { lang: 'zh', theme: 'dark' } },
];

function notice(): HTMLElement | null {
  return document.body.querySelector('[data-testid="mock-data-notice"]');
}

describe('尚未接後端的頁面在 API mode 標示為示範資料', () => {
  afterEach(() => {
    cleanupMounted();
    resetRuntimeApiClientsForTests();
  });

  for (const page of PAGES) {
    it(`${page.name}：API mode 顯示示範資料標示`, async () => {
      vi.stubEnv('VITE_DATA_MODE', 'api');
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline in test'))));
      resetRuntimeApiClientsForTests();

      mountWithPinia(page.component, page.props);
      await flushAsync();

      const el = notice();
      expect(el, `${page.name} 應顯示 mock-data-notice`).not.toBeNull();
      expect(el?.getAttribute('role')).toBe('note');
      expect(el?.textContent).toContain('示範資料');
    });

    it(`${page.name}：mock mode 不顯示標示（本來就是明確的示範模式）`, async () => {
      vi.stubEnv('VITE_DATA_MODE', 'mock');
      resetRuntimeApiClientsForTests();

      mountWithPinia(page.component, page.props);
      await flushAsync();

      expect(notice(), `${page.name} 在 mock mode 不應顯示`).toBeNull();
    });
  }
});
