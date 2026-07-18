# stock-v2(前端)— Agent 指南

> 本檔是唯一的常載路由層:短規則直接寫這,長內容一律純文字路徑按需讀。
> Claude Code 經 `CLAUDE.md` 的 `@AGENTS.md` 載入本檔;Codex 原生讀取。上限 ~120 行,超過就下放。

## 協作方式

- 稱呼使用者 **"Yuan"**,回覆一律**繁體中文**(程式碼與技術術語用英文)。
- 先問再動(不驗證無效假設);主張要附證據(log/測試輸出/文件)。

## 這是什麼專案

Vue 3 股票交易前端,對接 sibling Java 後端(`../../java/stock-web-v2`)。目前 mock 資料驅動,正逐步接真 API(`VITE_DATA_MODE` 切換)。

⚠️ **真正的專案根在 `vue-app/`**。repo root 的 `docs/`、`references/`、`screenshots/`、`*.log` 是文件與雜物,不是程式碼;`npm` 命令一律在 `vue-app/` 下跑。

技術棧:Vue 3.5 + TypeScript + Pinia + Vue Router + Vite 8 + Vitest(jsdom)。HTTP 用原生 fetch,無 axios、無 UI 框架。

## 鐵律(違反即事故)

1. **Transport 唯一邊界是 `vue-app/src/services/apiClient.ts`**:credentials、CSRF header、信封解析、401/403 處理全在這;domain service 與元件禁止自己 `fetch`。
2. **Token 不落 JS 可讀處**:access/refresh token 只存在 HttpOnly cookie;禁止進 localStorage/sessionStorage/Pinia。
3. **mock 是明確模式,不是 fallback**:`VITE_DATA_MODE` 無效值在 integration/CI 必須 fail fast;元件不得 import mock store,一律經 service interface。
4. **信封權威是後端 `ApiResponse<T>`**(`{success, data, error, meta}`)。本 repo `docs/api-contracts/mock-to-real-contract.md` 的 Common API Conventions 一節(`{data, requestId}`)是**過時草案**——衝突時以後端為準並回報,詳見後端 `ai-docs/judgment.md` §4。
5. **交易語義**:`POST /api/v1/trades` 是已成交手動紀錄,不是委託單;UI 不得承諾 pending/cancel/routing。
6. **可見的控制不得靜默 no-op**:尚未接後端的功能必須標示 Preview/Simulated。

## 驗證命令(宣稱完成前必跑)

```bash
cd vue-app && npm test && npm run build       # 標準閘門(build 含 vue-tsc 型別檢查)
VITE_DATA_MODE=api npm test && npm run build  # 涉及 API mode 時加跑
```

## 按需路徑(要用才讀,勿全文讀大檔)

- `docs/api-contracts/mock-to-real-contract.md`(872 行)— Backtest/Ops/AI-Access 端點規格與錯誤碼。信封一節過時,見鐵律 4。
- `docs/superpowers/plans/`(最大 1630 行)、`docs/superpowers/specs/` — 歷史計畫/設計,查針對段落。
- 後端契約與制度:`../../java/stock-web-v2/ai-docs/browser-auth-contract.md`(auth/CSRF 契約)、`../../java/stock-web-v2/ai-docs/judgment.md`(判斷準則)、`../../java/stock-web-v2/ai-docs/task-briefs.md`(交辦範本)——judgment/task-briefs 隨後端 `docs/governance-institution` PR 合併後才存在。
- `references/react-prototypes/` — 舊 React 視覺原型,僅供 UI 參考。

## 學習與 Git

- 踩坑一行進 `docs/LEARNINGS.md`(格式見該檔);同坑第 2 次 → 晉升進本檔鐵律或對應文件。
- Commit:Conventional Commits,繁中 subject;type/subject 規則同後端 `git-convention.md`,**scope 用 phase 編號(NN-NN),與後端的 module scope 不同**(例:`feat(02-05): ...`)。
- 本 repo CI 在 develop 跑 `npm ci → test → build`;PR 開向 `develop`。
