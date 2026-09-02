# LEARNINGS — 踩雷教訓日誌

> 一行一課。格式:`日期 | 教訓(一句) | 證據 file:line | 狀態(new/recurred/promoted)`
> 同一個坑第 2 次出現 → 標 recurred 並晉升進 `AGENTS.md` 鐵律或對應文件。
> 模型可自行 append;修改/刪除既有條目要先問 Yuan。

| 日期 | 教訓 | 證據 | 狀態 |
|------|------|------|------|
| 2026-07-07 | repo root 不是專案根;npm 命令要在 `vue-app/` 下跑 | 目錄結構(root 是 docs/references/screenshots)| promoted(AGENTS.md)|
| 2026-07-07 | `mock-to-real-contract.md` 的信封格式與後端 `ApiResponse<T>` 不一致,以後端為權威 | `docs/api-contracts/mock-to-real-contract.md:52-73` vs 後端 `stock-common` ApiResponse | promoted(AGENTS.md 鐵律 4)|
| 2026-09-02 | `testUtils.ts` 的 `flushAsync` 用固定 6 輪 microtask 清 fetch→apiClient→render 的非同步鏈,在 Node 20(CI)下不夠:undici 的 `Response.json()` 需要的 tick 比 Node 24 多,本機全綠、CI 三個頁面 7 條紅。真計時器下改做 macrotask hop(`setImmediate`;`setTimeout(0)` 在 jsdom 有巢狀 4ms 下限會讓 11 種 code 的迴圈測試撞 5s 逾時),假計時器下維持 microtask。要在本機重現 CI:`fnm install 20 && fnm exec --using=20 -- node ./node_modules/vitest/vitest.mjs run` | PR #9 CI run 33641692773;`vue-app/src/testUtils.ts` | new |
