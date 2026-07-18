import { defineConfig, devices } from '@playwright/test';

// Browser E2E:真後端(run-e2e 腳本啟動,port 8080)+ vite preview(4173,同源 proxy)。
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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
    env: { VITE_DATA_MODE: 'api' },
  },
});
