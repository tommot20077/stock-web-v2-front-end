# LEARNINGS — 踩雷教訓日誌

> 一行一課。格式:`日期 | 教訓(一句) | 證據 file:line | 狀態(new/recurred/promoted)`
> 同一個坑第 2 次出現 → 標 recurred 並晉升進 `AGENTS.md` 鐵律或對應文件。
> 模型可自行 append;修改/刪除既有條目要先問 Yuan。

| 日期 | 教訓 | 證據 | 狀態 |
|------|------|------|------|
| 2026-07-07 | repo root 不是專案根;npm 命令要在 `vue-app/` 下跑 | 目錄結構(root 是 docs/references/screenshots)| promoted(AGENTS.md)|
| 2026-07-07 | `mock-to-real-contract.md` 的信封格式與後端 `ApiResponse<T>` 不一致,以後端為權威 | `docs/api-contracts/mock-to-real-contract.md:52-73` vs 後端 `stock-common` ApiResponse | promoted(AGENTS.md 鐵律 4)|
