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
| `session-` | SessionBanner | `session-banner`, `session-retry` |
| `backtest-` | Backtest 頁 | `backtest-run`, `backtest-history` |

## 既有 testid(導入 E2E 前已存在)

`auth-tab-login`、`auth-tab-register`、`auth-login-submit`、`auth-register-submit`、
`auth-logout`、`header-logout`、`session-banner`、`session-sign-in-again`、`session-retry`

## 本次新增(旅程 A/D;由對應 spec 驅動)

見 `e2e/tests/auth.spec.ts`、`e2e/tests/backtest.spec.ts` 與元件實作;
完整清單維護於 PR 描述與測試回報。
