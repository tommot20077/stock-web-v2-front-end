import { configDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// API mode 沒有 base-url 設定(`apiClient.ts` 一律送同源相對路徑),所以「前端連得到後端」
// 完全靠這份代理。dev 與 preview 兩邊都要有:少了 dev 那份,`VITE_DATA_MODE=api npm run dev`
// 會把 `/api/v1/*` 交給 SPA fallback,拿回 index.html 被當成 404,畫面顯示「暫時無法連線到後端」。
//
// 05-03 / D-21:代理目標讀 shell env `VITE_API_PROXY_TARGET`,未設時為 `http://localhost:11180`
// (= 後端 `application.yaml` 的 `server.port` 預設,本機聯調不再需要 `SERVER_PORT=8080`);
// Browser E2E 由 `playwright.config.ts` 的 webServer env 改指 E2E 後端的 8080 port(`e2e-browser` profile)。
// - 只讀 shell env、不讀 `.env` 檔:`loadEnv` 需要 `defineConfig(({ mode }) => ...)` 函式形式,
//   會破壞 `src/viteConfig.test.ts` 直接 import 設定物件的寫法。
// - 這個變數只在 Node 端(dev / preview server)讀取,不經 `import.meta.env`,不會進 bundle。
// - `/ws` 用 http target + `ws: true`,由 http-proxy 自行升級成 WebSocket。
//
// 專案未裝 `@types/node`,而 `tsconfig.json` 經 `src/viteConfig.test.ts` 的 import 會型別檢查本檔:
// 以模組範圍的最小宣告描述 Node 的 `process.env`(只是型別,不產生程式碼;執行期用 Node 全域 `process`)。
declare const process: { env: Record<string, string | undefined> };
const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:11180';

const backendProxy = {
  '/api': proxyTarget,
  '/ws': {
    target: proxyTarget,
    ws: true,
  },
};

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: backendProxy,
  },
  preview: {
    port: 4173,
    proxy: backendProxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testSetup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    pool: 'threads',
    fileParallelism: false,
    // quick-261106-fbs:vitest 預設把 .css 匯入(含 `?raw`)換成空字串;contrastTokens.test.ts 要讀全域 token
    // 原始碼,所以只對 src/styles.css 開啟 CSS 處理(其他 CSS 維持預設,不影響既有測試)。
    css: { include: [/\/src\/styles\.css/] },
  },
});
