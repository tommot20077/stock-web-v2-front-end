import { describe, expect, it } from 'vitest';

/**
 * mock store 邊界守門(WATCH-03、judgment §3、鐵律 3):pages / components 的 `.vue` 一律經
 * `getRuntimeApiClients()` 的 service interface,不得 import mock portfolio store。
 * Markets / Chart(04.2-22)與 Watchlist(04.2-23)移除依賴後,以原始碼掃描鎖定為零(比照 wsBoundary.test.ts)。
 */
const pageSources = import.meta.glob('./pages/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const componentSources = import.meta.glob('./components/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const MOCK_STORE_PATH = 'stores/mockPortfolio';

function violations(sources: Record<string, string>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => source.includes(MOCK_STORE_PATH))
    .map(([path]) => path);
}

describe('mock store 邊界守門(WATCH-03)', () => {
  it('掃描範圍非空:pages 與 components 都讀得到原始碼(含三個觀察清單頁)', () => {
    expect(Object.keys(pageSources).length).toBeGreaterThan(5);
    expect(Object.keys(componentSources).length).toBeGreaterThan(5);
    for (const page of ['./pages/Markets.vue', './pages/Chart.vue', './pages/Watchlist.vue']) {
      expect(Object.keys(pageSources), page).toContain(page);
    }
  });

  it('src/pages/**/*.vue 不 import mock portfolio store', () => {
    expect(violations(pageSources)).toEqual([]);
  });

  it('src/components/**/*.vue 不 import mock portfolio store', () => {
    expect(violations(componentSources)).toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    expect(violations({ a: "import { useMockPortfolioStore } from '../stores/mockPortfolio';" })).toEqual(['a']);
    expect(violations({ b: "import { getRuntimeApiClients } from '../services/pageApiClients';" })).toEqual([]);
  });
});
