# stock-v2(前端)— Agent 指南

> 本檔是唯一的常載路由層:短規則直接寫這,長內容一律純文字路徑按需讀。
> Claude Code 經 `CLAUDE.md` 的 `@AGENTS.md` 載入本檔;Codex 原生讀取。上限 ~120 行,超過就下放。

## 協作方式

- 稱呼使用者 **"Yuan"**,回覆一律**繁體中文**(程式碼與技術術語用英文)。
- 先問再動(不驗證無效假設);主張要附證據(log/測試輸出/文件)。

## 這是什麼專案

Vue 3 股票交易前端,對接 sibling Java 後端(後端 repo 根:Yuan 本機為 `../../java/stock-web-v2`;cloud 環境為 `../stock-web-v2`;兩邊路徑對照見後端 `ai-docs/judgment.md` §8)。`VITE_DATA_MODE` 切換 mock / api(未設為 mock):auth、交易、持倉、現金、股利 / 股數調整、行情、觀察清單、個人設定、回測已接真 API;Ops 與 AI Access 後端尚無端點,仍為 Preview。

⚠️ **真正的專案根在 `vue-app/`**。repo root 的 `docs/`、`references/`(以及本機可能有、已 gitignore 的 `screenshots/`、`*.log`)是文件與雜物,不是程式碼;`npm` 命令一律在 `vue-app/` 下跑。

技術棧:Vue 3.5 + TypeScript 6 + Pinia 3 + Vue Router 5 + Vite 8 + Vitest 4(jsdom)+ Playwright(`vue-app/e2e/`)+ ESLint。HTTP 用原生 fetch,無 axios、無 UI 框架。

## 鐵律(違反即事故)

1. **Transport 唯一邊界是 `vue-app/src/services/apiClient.ts`**:credentials、CSRF header、信封解析、401/403 處理全在這;domain service 與元件禁止自己 `fetch`。
2. **Token 不落 JS 可讀處**:access/refresh token 只存在 HttpOnly cookie;禁止進 localStorage/sessionStorage/Pinia。
3. **mock 是明確模式,不是 fallback**:`VITE_DATA_MODE` 無效值在 integration/CI 必須 fail fast;元件不得 import mock store,一律經 service interface。
4. **信封權威是後端 `ApiResponse<T>`**(`{success, data, error, meta}`,追蹤 id 只在 `meta.traceId`,分頁為 `PageResponse<T>`)。本 repo `docs/api-contracts/mock-to-real-contract.md` 的 Common API Conventions 一節已於 2026-07-19 改寫為後端信封;任何文件與後端衝突時仍以後端為準並回報,詳見後端 `ai-docs/judgment.md` §4。
5. **交易語義**:`POST /api/v1/trades` 是已成交手動紀錄,不是委託單;UI 不得承諾 pending/cancel/routing。
6. **可見的控制不得靜默 no-op**:尚未接後端的功能必須標示 Preview/Simulated。

## 驗證命令(宣稱完成前必跑)

```bash
cd vue-app && npm run lint && npm test && npm run build  # 標準閘門(同 CI;build 含 vue-tsc 型別檢查)
VITE_DATA_MODE=api npm test && npm run build             # 涉及 API mode 時加跑
npx playwright test e2e/tests/layout.spec.ts             # 動到版面 / CSS 時加跑(page.route stub,不需後端)
```

## 按需路徑(要用才讀,勿全文讀大檔)

- `docs/api-contracts/mock-to-real-contract.md`(近千行,大檔)— Backtest/Ops/AI-Access 端點規格與錯誤碼;檔首有 2026-11-06 核對狀態(Ops / AI Access 後端未實作)。
- `docs/superpowers/plans/`(最大 1630 行)、`docs/superpowers/specs/` — 2026-05 的歷史計畫/設計,不隨程式維護,查針對段落。
- 後端契約與制度(皆在後端 repo 根的 `ai-docs/`):`browser-auth-contract.md`(auth/CSRF 契約)、`judgment.md`(判斷準則)、`task-briefs.md`(交辦範本);交易 / 持倉 / 現金契約 `trading-portfolio-contract.md`、觀察清單契約 `watchlist-contract.md` 同目錄。
- `references/react-prototypes/` — 舊 React 視覺原型,僅供 UI 參考。

## 學習與 Git

- 踩坑一行進 `docs/LEARNINGS.md`(格式見該檔);同坑第 2 次 → 晉升進本檔鐵律或對應文件。
- Commit:Conventional Commits,繁中 subject;type / subject / scope 規則同後端 `ai-docs/git-convention.md`:**GSD 工作 scope 用 phase / plan id(NN-NN)或 quick id**(例:`feat(02-05): ...`、`fix(quick-261106-fbs): ...`),非 GSD 變更才用 module scope。
- 本 repo CI(`.github/workflows/`,Node 20)在 develop 的 push / PR 跑 `npm ci → lint → test → build`;PR 開向 `develop`。
