import { afterEach, beforeEach, vi } from 'vitest';

// 測試預設鎖定 mock 模式,與啟動時的 VITE_DATA_MODE 隔離。
// 目的:`VITE_DATA_MODE=api npm test` 不會汙染未自行 pin 模式的 mock 元件測試
//   (task6 / task7 / api-adapter-wiring 的 mock 案例)——它們會誤走 HTTP adapter,
//   在 jsdom+undici 下 fetch 相對 URL 而丟 "Failed to parse URL"。
// 需要 api 模式的測試於各自 test/beforeEach 以 vi.stubEnv('VITE_DATA_MODE','api') 覆蓋即可
//   (getRuntimeApiClients 的快取以 mode 為 key,模式切換會自動重建,無需在此手動 reset)。
//
// 注意:此檔刻意「不 import 任何 service module」。若在此 import(例如 pageApiClients),
//   會搶在各測試檔的 vi.mock 生效前就綁定真實實作,導致 mock 失效(參見 Backtest.test.ts D6)。
beforeEach(() => {
  vi.stubEnv('VITE_DATA_MODE', 'mock');
});

afterEach(() => {
  vi.unstubAllEnvs();
});
