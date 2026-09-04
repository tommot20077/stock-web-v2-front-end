import { configDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// API mode 沒有 base-url 設定(`apiClient.ts` 一律送同源相對路徑),所以「前端連得到後端」
// 完全靠這份代理。dev 與 preview 兩邊都要有:少了 dev 那份,`VITE_DATA_MODE=api npm run dev`
// 會把 `/api/v1/*` 交給 SPA fallback,拿回 index.html 被當成 404,畫面顯示「暫時無法連線到後端」。
const backendProxy = {
  '/api': 'http://localhost:8080',
  '/ws': {
    target: 'ws://localhost:8080',
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
  },
});
