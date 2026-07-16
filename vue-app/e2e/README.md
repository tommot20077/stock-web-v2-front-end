# Browser E2E(Playwright)

真瀏覽器 → 真 HTTP → 真後端(`e2e-browser` profile)→ docker compose 暫時 DB/Redis/Kafka。
設計文件:後端 repo `docs/plans/2026-07-16-browser-e2e-testing-design.md`。

## 前置需求

- Docker Desktop(compose v2)
- Java 21 與後端 repo(預設路徑 `../../../java/stock-web-v2`,可用 `E2E_BACKEND_DIR` 覆寫)
- Node.js ≥ 20;首次需 `npm install` 與 `npx playwright install chromium`

## 一鍵執行

```bash
# Git Bash / Linux / macOS —— 預設只跑 @smoke
bash e2e/run-e2e.sh

# 跑 @extended
bash e2e/run-e2e.sh --grep @extended
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File e2e\run-e2e.ps1
powershell -ExecutionPolicy Bypass -File e2e\run-e2e.ps1 --grep @extended
```

腳本流程:compose up(等 healthy)→ 後端 `mvnw package` + `java -jar`
(profile `e2e-browser`,port 8080)→ 等 `/actuator/health` UP(90s,逾時 dump logs)
→ `npx playwright test`(Playwright webServer 會以 `VITE_DATA_MODE=api` build 並跑
`vite preview`,port 4173,`/api`、`/ws` 同源 proxy 到 8080)→ 結束後清理容器與後端。

### 環境變數

| 變數 | 預設 | 用途 |
|------|------|------|
| `E2E_BACKEND_DIR` | `../../../java/stock-web-v2` | 後端 repo 路徑 |
| `E2E_BACKEND_PORT` | `8080` | 後端 port |
| `E2E_SKIP_BUILD` | `0` | `1` 略過 mvn package(需已有 jar) |
| `E2E_KEEP` | `0` | `1` 結束後保留 infra 與後端(除錯) |
| `E2E_ENV_ONLY` | `0` | `1` 只起環境不跑測試(隱含 KEEP) |

## 開發迭代(環境常駐)

```bash
E2E_ENV_ONLY=1 E2E_SKIP_BUILD=1 bash e2e/run-e2e.sh   # 起環境
npm run test:e2e                                       # @smoke(7 條矩陣案例)
npm run test:e2e -- --grep @extended                   # @extended(7 條)
npx playwright test e2e/tests/auth.spec.ts             # 單檔全跑(不分 tag)
```

## Tags 與檔案

- `@smoke`:PR 守門(A1–A3、A7、A9、D1、D2);`@extended`:擴充(A4、A5、A8、A10、A11、D4、D5)
- D6(執行中防抖)屬純前端行為 → Vitest:`src/pages/Backtest.test.ts`
- `smoke.spec.ts` / `fixtures.spec.ts`:基礎設施自我驗證
- Selector 規範(一律 `data-testid`):`e2e/support/selectors.md`

## 失敗排查(artifacts,gitignored)

- `e2e/artifacts/backend.log` — 後端 stdout(畫面上的 `traceId` 可對到這裡)
- `e2e/artifacts/playwright-report/` — HTML report(`npx playwright show-report e2e/artifacts/playwright-report`)
- `e2e/artifacts/test-results/` — trace/screenshot(`npx playwright show-trace <trace.zip>`)

## 穩定性原則

- 每條測試以 API 註冊唯一帳號(`e2e+<runId>-<n>@test.local`),不依賴執行順序
- 只用 auto-wait 與 `expect.poll`/`toPass`;禁止 `waitForTimeout`
- 斷言結構與存在性,不斷言 mock 行情具體數值
- 禁止 Playwright route mock 攔截 API(真後端)
