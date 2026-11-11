# E2E Selector 規範(data-testid)

## 規則

1. E2E selector **一律** `data-testid`,Playwright 側用 `page.getByTestId('…')`。
2. **禁止** CSS class selector(樣式重構會壞)與文字 selector(i18n 會壞)。
3. 命名 kebab-case,`<區塊>-<元素>[-<動作|狀態>]`;同區塊共用前綴。
4. 新增頁面元素若會被 E2E 使用,實作 PR 內同步補 testid;先寫 spec(Red)再補。

## 前綴一覽

| 前綴 | 區塊 | 範例 |
|------|------|------|
| `auth-` | AuthPanel 登入/註冊 | `auth-tab-login`, `auth-login-email`, `auth-register-submit` |
| `header-` | Header(session chip、登出、nav) | `header-logout`, `header-session-identity` |
| `nav-` | Header 導覽按鈕 | `nav-backtest`, `nav-overview` |
| `settings-` | Settings 頁(分頁按鈕、基準幣欄位) | `settings-tab-display`, `settings-base-currency` |
| `session-` | SessionBanner | `session-banner`, `session-retry` |
| `backtest-` | Backtest 頁 | `backtest-run`, `backtest-history` |
| `overview-` | Overview 頁(KPI、資產配置、近期交易、診斷列) | `overview-kpi`, `overview-recent-trades` |
| `base-currency-` | Overview 基準幣切換工具列 | `base-currency-switch`, `base-currency-option-TWD` |
| `cash-page-` | 現金頁頁首(餘額、入金 / 出金入口) | `cash-page-title`, `cash-page-withdraw` |
| `cash-entries-` | 現金頁入出金紀錄表 | `cash-entries`, `cash-entries-row` |
| `cash-` | 入出金對話框(`CashEntryDialog`) | `cash-dialog`, `cash-submit` |
| `positions-` | Positions 頁 | `positions-table`, `positions-day-pnl` |
| `trades-` | Trades 頁 | `trades-table`, `trades-ccy-tag` |
| `holding-event-` | 股利與股數調整對話框(`HoldingEventDialog`,Phase 04.2) | `holding-event-dialog`, `holding-event-submit` |
| `watchlist-picker-` | 加入觀察清單選擇器(`WatchlistPicker`;比 `watchlist-` 長,優先比對) | `watchlist-picker-option`, `watchlist-picker-new-submit` |
| `watchlist-` | Watchlist 頁(tabs、工具列、表格、狀態;選擇器本體為 `watchlist-picker`) | `watchlist-page`, `watchlist-row` |
| `markets-` | Markets 頁(★ 星號、觀察清單載入錯誤) | `markets-star`, `markets-watchlist-retry` |
| `chart-` | Chart 頁(觀察清單 Watch 按鈕) | `chart-watch` |
| `live-quote-` | 即時報價狀態(`LiveQuoteStatus`) | `live-quote-status`, `live-quote-reconnect` |

## 既有 testid(導入 E2E 前已存在)

`auth-tab-login`、`auth-tab-register`、`auth-login-submit`、`auth-register-submit`、
`auth-logout`、`header-logout`、`session-banner`、`session-sign-in-again`、`session-retry`

## 本次新增(旅程 A/D;由對應 spec 驅動)

見 `e2e/tests/auth.spec.ts`、`e2e/tests/backtest.spec.ts` 與元件實作;
完整清單維護於 PR 描述與測試回報。

Phase 04.1 版面回歸(`e2e/tests/layout.spec.ts` L2–L6)使用 `overview-` / `base-currency-` / `cash-page-` / `cash-entries-` / `cash-` / `positions-` / `trades-` 前綴;表格宿主 testid 為 `positions-table`、`trades-table`、`overview-recent-trades`(04.1-19 補)。

Phase 5 契約全程 journey `e2e/tests/contract-journey.spec.ts`(J0,05-01)使用的 testid 皆為既有 testid(`auth-` / `header-` / `nav-` / `overview-` / `positions-` / `trades-` / `ticket-` 前綴),無新增。
