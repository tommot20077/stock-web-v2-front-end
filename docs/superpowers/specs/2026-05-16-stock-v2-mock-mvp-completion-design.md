# Stock V2 Mock MVP Completion Design

## Context

`stock-v2` is currently a browser-loaded Vue prototype under `vue-app/`, with earlier React design directions and screenshots kept at the workspace root. The app already has meaningful screens for market data, charts, watchlists, positions, trades, alerts, notifications, settings, backtesting, and admin operations.

The goal is not to remove future-facing mock features. The goal is to make the prototype behave like a coherent mock MVP: every visible entry point should either work locally, clearly present itself as preview/simulated, or be hidden until it has a usable mock behavior.

The current project is not a git repository and does not have a package-managed Vue build setup. It runs through `vue-app/index.html` using CDN-loaded Vue, `vue3-sfc-loader`, and TypeScript. This design keeps that prototype constraint in mind and avoids requiring a build-system migration.

## Product Direction

Keep these as first-class product areas:

- Overview
- Markets
- Chart detail
- Watchlist
- Positions
- Trades
- Alerts
- Notifications
- Settings

Keep these as mock/preview product areas:

- Backtest: user-facing simulated strategy feature.
- Ops: admin-only simulated operations dashboard.
- AI Access: settings-level preview for future MCP/agent integration.

Do not implement real broker APIs, real market feeds, real backtest engines, real MCP servers, authentication, or persistence beyond local mock state in this phase.

## UX Rules

Visible controls must not be silent no-ops. Each visible button, chip, command, or toggle must do one of the following:

- Change local mock state.
- Open a local modal or detail surface.
- Show a clear toast or inline status.
- Be disabled with an explanatory label.
- Be visibly marked as preview/simulated when it represents future real infrastructure.

Mock-heavy modules should stay available, but the UI must not imply they are connected to live infrastructure. Use clear labels such as "Preview", "Simulated", "Mock run", or Chinese equivalents where the page language is Chinese.

## Shared Mock State

The prototype should move toward one shared local state layer for user-visible data:

- Watch status and watchlist membership.
- Positions.
- Trades.
- Alerts.
- Notifications.
- Settings keys and provider/broker status.
- Ops log entries.
- Backtest run result metadata.

Existing static arrays in `data.ts` can remain as seeds, but pages should read mutable runtime state where the user can affect that data.

## Page Completion Definitions

### Markets, Chart, Watchlist

Markets, chart detail, and watchlist must share watch status. If the user stars a symbol in Chart or Markets, Watchlist should reflect it. If the user removes a symbol from Watchlist, Markets and Chart should not continue to show it as watched unless another list still contains it.

Markets may continue using simulated live ticks. The `LIVE/PAUSED` control should remain a local simulation state.

Chart may continue using TradingView for the main visual. It needs a fallback state if the external TradingView script fails to load or the symbol cannot be mapped.

### OrderTicket, Positions, Trades, Overview

The mock order flow is part of the MVP and should remain. After a local mock fill:

- Positions update.
- Trades update.
- Overview recent trades reflect the same updated trade list.
- Any highlight/fresh-fill behavior remains consistent across affected pages.

Overview buttons that look navigational or action-oriented should emit navigation or open the order ticket instead of doing nothing.

Trades filters should affect the displayed rows. CSV export should create a local CSV download from the current filtered mock trade list.

### Alerts and Notifications

Alerts already has local CRUD and should stay. Notification behavior should be made locally coherent:

- `Mark read` changes unread state.
- `Clear all` removes current notifications from the local mock notification list.
- Notification rules update local mock preferences and show saved state.
- Alert-triggered notification examples can remain generated, but should share enough shape with alerts to feel intentional.

### Settings

Settings can remain mock-only, but every visible sidebar tab should have local mock behavior.

Required behavior:

- Profile actions that are not backed by editable mock data should be disabled with clear preview copy.
- Security actions that are not backed by editable mock data should be disabled with clear preview copy.
- Display controls update the same theme/language/density/accent state used by the app.
- Data-source keys and broker keys remain local mock records with deterministic testing behavior or clearly labeled simulated testing.
- `notifPref` should be implemented as local notification preferences.
- AI Access remains inside Settings with a clear preview label.

### Backtest

Backtest stays in the product because it is a plausible investor feature. It must be labeled as simulated. Running a backtest should visibly create a new mock run result instead of leaving the current `run()` action as a no-op.

Custom JS can remain a preview editor. If the code is not actually used by a real engine, the UI should say the custom code only seeds or labels the mock result.

### Ops

Ops remains admin-only. Operations are simulated, but they should update local state:

- Confirmed action appends an operation log entry.
- A running/success/failure status is shown locally.
- Health and system metrics remain mock, but should not imply a live backend connection.

### CmdK and Shortcuts

Command palette and keyboard shortcuts must match reachable UI:

- Include all first-class pages.
- Include Backtest and Ops only if they remain reachable.
- Include Alerts.
- Implement empty actions such as export, or do not list them in CmdK.
- Navigation actions should use the same paths and labels as the header.

## Error Handling

For this phase, errors are local UI states:

- External chart loader failure shows fallback content in Chart.
- Clipboard failure shows a small failure toast or inline status where copy is used.
- Simulated API key test failures are labeled as simulated.
- Invalid custom strategy code in Backtest shows an inline error instead of only logging to console.

## Testing and Verification

Because the prototype has no package-managed test runner today, verification should start with browser/manual checks:

- Open `vue-app/index.html` through a local static server.
- Navigate every header and CmdK route.
- Exercise order flow and confirm Overview, Trades, and Positions update together.
- Star/unstar symbols and confirm Markets, Chart, and Watchlist stay consistent.
- Run Backtest and confirm the visible result changes.
- Run Ops actions and confirm the operation log changes.
- Use Notifications mark-read and clear-all actions.
- Check English and Chinese labels for any new preview/simulated language.

If the project later moves to Vite/package-managed Vue, add component tests for the shared store and focused browser tests for the core flows.

## Out of Scope

- Real authentication or user profiles.
- Real broker order routing.
- Real market-data providers.
- Real notification delivery.
- Real backtest execution.
- Real MCP server hosting.
- Backend APIs.
- Migrating the prototype to a Vite project.

## Open Implementation Notes

Implementation should keep edits incremental. Start by introducing shared local state and wiring existing screens to it, then replace no-op controls page by page with local mock behavior, disabled preview states, or hidden command entries. Do not redesign visual style in this phase unless a control needs a state label or disabled treatment.
