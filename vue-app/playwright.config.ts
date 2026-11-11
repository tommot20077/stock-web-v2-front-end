import { defineConfig, devices } from '@playwright/test';

// Browser E2E:真後端(run-e2e 腳本啟動,port 8080)+ vite preview(4173,同源 proxy)。
// vite.config.ts 的 proxy 預設指向 11180(後端 dev 預設);此處以 webServer env
// VITE_API_PROXY_TARGET 改指 E2E 後端(E2E_BACKEND_PORT,預設 8080 = e2e-browser profile)。
// 設計:../java/stock-web-v2 docs/plans/2026-07-16-browser-e2e-testing-design.md
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/artifacts/test-results',
  fullyParallel: true,
  retries: 1,
  workers: 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:4173',
    // 每次都錄、只保留失敗案例:flaky(首跑失敗、重試通過)時仍留得住第一次失敗的現場
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // VITE_DATA_MODE 是 build-time 烘焙:此處固定以 api mode 重新 build 再 preview
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_DATA_MODE: 'api',
      // D-21:Node 端讀取(vite preview 的 proxy target),不進 bundle
      VITE_API_PROXY_TARGET: `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8080'}`,
    },
  },
});
