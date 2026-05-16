# Stock V2 Mock MVP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current stock-v2 Vue prototype into a coherent mock MVP where visible controls update local state, preview features are clearly labeled, and cross-page mock data stays consistent.

**Architecture:** First convert the browser-loaded prototype into a normal Vue app shape with package scripts, Vite, router, Pinia-style domain stores, and a test path. Keep static arrays in `data.ts` as seed data, then route user-visible mutable data through shared domain stores consumed by the existing Vue SFC pages.

**Tech Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, local mock stores, Vitest for store/unit checks, Playwright or manual browser checks for prototype flows.

---

## Scope Check

This spec touches several pages, but the work is one cohesive subsystem: mock MVP coherence through shared local state and removal of silent no-op controls. Keep it as one plan, sliced by project foundation, state domain, and page workflow.

The current workspace is not a Git repository. Every task below includes a checkpoint note instead of a required commit command. If this directory is later initialized as Git, commit after each task with the suggested message.

The existing CDN/SFC-loader setup is acceptable for a design prototype, but it is not the right foundation for continuing Vue product work. The first implementation task must projectize the app. Do not keep adding feature state to the CDN-loader prototype if the goal is a maintainable Vue codebase.

## File Structure

- Create `vue-app/package.json`: npm scripts and dependencies for Vue/Vite/Pinia/router/test tooling.
- Create `vue-app/vite.config.ts`: Vite config for Vue SFCs.
- Create `vue-app/tsconfig.json`: TypeScript project config.
- Create `vue-app/src/main.ts`: Vue app entry that mounts `App.vue`.
- Create `vue-app/src/router.ts`: route definitions replacing the top-level page string as the long-term navigation source.
- Create `vue-app/src/stores/`: Pinia stores for portfolio, watchlists, notifications, settings, preview runs, and shared UI feedback.
- Modify `vue-app/index.html`: make it a Vite entry instead of loading Vue and TypeScript from CDN.
- Modify `vue-app/src/types.ts`: add shared runtime types for watchlists, mock notifications, notification preferences, ops status, and backtest run metadata.
- Modify or retire `vue-app/src/store.ts`: migrate existing positions/trades/alerts logic into Pinia domain stores.
- Modify `vue-app/src/App.vue`: pass navigation/order/toast/tweak handlers to pages that need them.
- Modify `vue-app/src/pages/Markets.vue`: use shared watch state, let star clicks update watch state, keep simulated ticks local.
- Modify `vue-app/src/pages/Chart.vue`: use shared watch state and add TradingView failure fallback.
- Modify `vue-app/src/pages/Watchlist.vue`: use shared watchlists, add/remove/reorder from `useMockPortfolioStore`.
- Modify `vue-app/src/pages/Overview.vue`: read trades from `useMockPortfolioStore`, emit navigation/order events for visible actions.
- Modify `vue-app/src/pages/Trades.vue`: add working filters and CSV export from filtered mock trades.
- Modify `vue-app/src/pages/Alerts.vue`: use `useMockNotificationsStore` alert actions.
- Modify `vue-app/src/pages/Notifications.vue`: use shared notification state, implement mark-read, clear-all, and local preference saves.
- Modify `vue-app/src/pages/Settings.vue`: wire display controls to app tweaks, disable profile/security preview actions, implement `notifPref`, make API key tests deterministic, preserve AI Access preview labeling.
- Modify `vue-app/src/pages/Backtest.vue`: label simulated mode, make Run create a visible new mock run, show invalid custom strategy errors inline.
- Modify `vue-app/src/pages/Ops.vue`: use shared ops logs and simulated running/success/failure status.
- Modify `vue-app/src/components/CmdK.vue`: include all reachable pages and remove empty command actions.
- Modify `vue-app/src/useShortcuts.ts` and `vue-app/src/components/KeyboardHelp.vue`: align shortcut map/help text with reachable pages.

## Task 1: Projectize the Vue Prototype

**Files:**
- Create: `vue-app/package.json`
- Create: `vue-app/vite.config.ts`
- Create: `vue-app/tsconfig.json`
- Create: `vue-app/src/main.ts`
- Create: `vue-app/src/router.ts`
- Modify: `vue-app/index.html`
- Modify: `vue-app/src/App.vue`

- [ ] **Step 1: Add package scripts and dependencies**

Create `vue-app/package.json`:

```json
{
  "name": "stock-v2",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "latest",
    "vite": "latest",
    "vue": "latest",
    "vue-router": "latest",
    "pinia": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "vue-tsc": "latest",
    "vitest": "latest",
    "jsdom": "latest"
  }
}
```

- [ ] **Step 2: Add Vite config**

Create `vue-app/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: Add TypeScript config**

Create `vue-app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "jsx": "preserve"
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

- [ ] **Step 4: Replace CDN loader with Vite entry**

Replace `vue-app/index.html` with:

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Resource</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Move global styles into main entry**

Create `vue-app/src/main.ts`:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';

import './styles.css';

createApp(App)
  .use(createPinia())
  .use(router)
  .mount('#app');
```

Create `vue-app/src/styles.css` by moving the global CSS variables and base styles from the old `index.html`:

```css
:root {
  --bg: #fafaf9; --surface: #ffffff; --surface2: #f4f3f0;
  --fg: #15171c; --fg-dim: #52525b; --fg-mute: #a1a1aa;
  --border: #e7e5e0; --accent: #ff6600;
  --up: #16a34a; --dn: #dc2626; --radius: 12px;
}
:root[data-theme="dark"] {
  --bg: #0c0d10; --surface: #15171c; --surface2: #1c1e25;
  --fg: #e7e5e0; --fg-dim: #a8a59c; --fg-mute: #62605a;
  --border: #262830;
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
button { font-family: inherit; cursor: pointer; }
input, select, textarea { font-family: inherit; color: inherit; }
table { border-collapse: collapse; width: 100%; }
.num { font-variant-numeric: tabular-nums; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb {
  background: var(--surface2);
  border-radius: 5px;
  border: 2px solid var(--bg);
}
```

- [ ] **Step 6: Add initial router**

Create `vue-app/src/router.ts`:

```ts
import { createRouter, createWebHashHistory } from 'vue-router';
import type { Page } from './types';

export const pageRoutes: Array<{ page: Page; path: string; labelKey: Page }> = [
  { page: 'overview', path: '/', labelKey: 'overview' },
  { page: 'markets', path: '/markets', labelKey: 'markets' },
  { page: 'watchlist', path: '/watchlist', labelKey: 'watchlist' },
  { page: 'positions', path: '/positions', labelKey: 'positions' },
  { page: 'backtest', path: '/backtest', labelKey: 'backtest' },
  { page: 'analytics', path: '/analytics', labelKey: 'analytics' },
  { page: 'trades', path: '/trades', labelKey: 'trades' },
  { page: 'alerts', path: '/alerts', labelKey: 'alerts' },
  { page: 'notifications', path: '/notifications', labelKey: 'notifications' },
  { page: 'settings', path: '/settings', labelKey: 'settings' },
  { page: 'ops', path: '/ops', labelKey: 'ops' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes: pageRoutes.map(r => ({ path: r.path, name: r.page, component: { render: () => null } })),
});
```

This router is a transition layer. `App.vue` can still render pages by a `page` ref in this task; later tasks can move page selection fully to router names after state wiring is stable.

- [ ] **Step 7: Install and build**

Run:

```powershell
cd .\vue-app
npm install
npm run build
```

Expected:
- `npm install` creates `node_modules` and `package-lock.json`.
- `npm run build` either passes or reports type errors from existing Vue files that must be fixed before moving to Task 2.

If type errors appear, fix only import/type errors caused by the Vite migration. Do not start feature work inside this task.

Checkpoint: If this is in a Git repo, commit with `chore: projectize vue prototype`.

## Task 2: Shared Mock State Foundation

**Files:**
- Modify: `vue-app/src/types.ts`
- Create: `vue-app/src/stores/mockPortfolio.ts`
- Create: `vue-app/src/stores/mockNotifications.ts`
- Create: `vue-app/src/stores/mockPreview.ts`
- Modify: `vue-app/src/store.ts`

- [ ] **Step 1: Add runtime state types**

In `vue-app/src/types.ts`, append these interfaces after `KPI`:

```ts
export interface Watchlist {
  id: string;
  name: string;
  syms: string[];
}

export type MockNotificationKind = 'alert' | 'order' | 'news' | 'system';

export interface MockNotification {
  id: string;
  kind: MockNotificationKind;
  sym?: string;
  text: string;
  time: string;
  unread: boolean;
  dateKey: string;
}

export interface NotificationPrefs {
  alertCross: boolean;
  alertVol: boolean;
  alertNews: boolean;
  orderFill: boolean;
  orderPartial: boolean;
  orderReject: boolean;
  orderStop: boolean;
  sysApi: boolean;
  sysMargin: boolean;
  sysAi: boolean;
  quietEnable: boolean;
  quietFrom: string;
  quietTo: string;
}

export interface OpsRun {
  id: string;
  key: string;
  label: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
}

export interface BacktestRun {
  id: string;
  strategy: string;
  sym: string;
  period: string;
  initial: number;
  seed: number;
  createdAt: string;
  label: string;
}
```

- [ ] **Step 2: Split existing global store into Pinia-compatible domain stores**

Create `vue-app/src/stores/mockPortfolio.ts`:

```ts
import { defineStore } from 'pinia';
import { CRYPTO, POSITIONS, SYMBOLS, TRADES } from '../data';
import type { Position, Trade, Watchlist } from '../types';

const DEFAULT_WATCHLISTS: Watchlist[] = [
  { id: 'core', name: '核心持倉', syms: ['AAPL', 'NVDA', '2330.TW', 'MSFT'] },
  { id: 'crypto', name: 'Crypto', syms: ['BTC', 'ETH', 'SOL'] },
  { id: 'watchAI', name: 'AI 概念', syms: ['NVDA', 'META', 'GOOGL', 'AMZN'] },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useMockPortfolioStore = defineStore('mockPortfolio', {
  state: () => ({
    positions: [...POSITIONS] as Position[],
    trades: [...TRADES] as Trade[],
    watchlists: DEFAULT_WATCHLISTS.map(l => ({ ...l, syms: [...l.syms] })) as Watchlist[],
    lastFill: null as { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null,
    watchlistSeq: 10,
  }),
  getters: {
    allSymbols: () => [...SYMBOLS, ...CRYPTO],
  },
  actions: {
    isWatched(sym: string): boolean {
      return this.watchlists.some(l => l.syms.includes(sym));
    },
    toggleWatch(sym: string) {
      const list = this.watchlists[0];
      if (!list) return;
      if (this.isWatched(sym)) {
        this.watchlists.forEach(l => { l.syms = l.syms.filter(s => s !== sym); });
      } else {
        list.syms.unshift(sym);
      }
    },
    addWatchlist(name = 'New list') {
      this.watchlists.push({ id: 'wl' + (++this.watchlistSeq), name, syms: [] });
    },
    removeFromWatchlist(listId: string, sym: string) {
      const list = this.watchlists.find(l => l.id === listId);
      if (list) list.syms = list.syms.filter(s => s !== sym);
    },
    moveWatchSymbol(listId: string, from: number, to: number) {
      const list = this.watchlists.find(l => l.id === listId);
      if (!list || from < 0 || to < 0 || from >= list.syms.length || to >= list.syms.length) return;
      const [item] = list.syms.splice(from, 1);
      list.syms.splice(to, 0, item);
    },
    executeOrder(opts: {
      sym: string;
      name: string;
      side: 'BUY' | 'SELL';
      qty: number;
      px: number;
      fee: number;
      sector: string;
      note?: string;
    }) {
      const { sym, name, side, qty, px, fee, sector, note = '' } = opts;
      this.trades.unshift({ d: todayStr(), type: side, sym, qty, px, fee, note });
      const idx = this.positions.findIndex(p => p.sym === sym);
      if (side === 'BUY') {
        if (idx >= 0) {
          const p = this.positions[idx];
          const newQty = p.qty + qty;
          const newAvg = (p.qty * p.avg + qty * px) / newQty;
          this.positions[idx] = { ...p, qty: newQty, avg: newAvg, price: px };
        } else {
          this.positions.unshift({ sym, name, qty, avg: px, price: px, sector });
        }
      } else if (idx >= 0) {
        const p = this.positions[idx];
        const newQty = Math.max(0, p.qty - qty);
        if (newQty === 0) this.positions.splice(idx, 1);
        else this.positions[idx] = { ...p, qty: newQty, price: px };
      }
      this.lastFill = { sym, type: side, qty, px };
    },
  },
});
```

- [ ] **Step 3: Add notification store**

Create `vue-app/src/stores/mockNotifications.ts`:

```ts
import { defineStore } from 'pinia';
import { ALERTS, ALERT_EVENTS } from '../data';
import type { Alert, AlertEvent, MockNotification, NotificationPrefs } from '../types';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  alertCross: true,
  alertVol: true,
  alertNews: false,
  orderFill: true,
  orderPartial: true,
  orderReject: true,
  orderStop: true,
  sysApi: true,
  sysMargin: true,
  sysAi: true,
  quietEnable: false,
  quietFrom: '22:00',
  quietTo: '07:00',
};

const todayKey = new Date().toISOString().slice(0, 10);

const DEFAULT_NOTIFICATIONS: MockNotification[] = [
  { id: 'n1', kind: 'alert', sym: 'NVDA', text: 'NVDA crossed above $1,140', time: '2m', unread: true, dateKey: todayKey },
  { id: 'n2', kind: 'news', sym: '2330.TW', text: 'TSMC Q1 revenue beats estimates +12% YoY', time: '14m', unread: true, dateKey: todayKey },
  { id: 'n3', kind: 'order', sym: 'BTC', text: 'BUY 0.05 BTC @ market filled', time: '1h', unread: true, dateKey: todayKey },
  { id: 'n4', kind: 'system', text: 'Portfolio recalculation completed', time: '3h', unread: false, dateKey: todayKey },
];

export const useMockNotificationsStore = defineStore('mockNotifications', {
  state: () => ({
    alerts: [...ALERTS] as Alert[],
    alertEvents: [...ALERT_EVENTS] as AlertEvent[],
    notifications: [...DEFAULT_NOTIFICATIONS] as MockNotification[],
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS } as NotificationPrefs,
    alertSeq: 100,
    notificationSeq: 100,
  }),
  actions: {
    pushNotification(input: Omit<MockNotification, 'id' | 'dateKey'> & { dateKey?: string }) {
      this.notifications.unshift({
        id: 'n' + (++this.notificationSeq),
        dateKey: input.dateKey ?? new Date().toISOString().slice(0, 10),
        ...input,
      });
    },
    addAlert(a: Omit<Alert, 'id' | 'created' | 'triggerCount' | 'status'> & { status?: Alert['status'] }) {
      const created = new Date().toISOString().slice(0, 10);
      this.alerts.unshift({
        id: 'al' + (++this.alertSeq),
        created,
        triggerCount: 0,
        status: a.status ?? 'active',
        ...a,
      });
      this.pushNotification({
        kind: 'alert',
        sym: a.sym,
        text: `${a.sym} alert created: ${a.condition}`,
        time: 'now',
        unread: true,
      });
    },
    updateAlert(id: string, patch: Partial<Alert>) {
      const idx = this.alerts.findIndex(a => a.id === id);
      if (idx >= 0) this.alerts[idx] = { ...this.alerts[idx], ...patch };
    },
    removeAlert(id: string) {
      const idx = this.alerts.findIndex(a => a.id === id);
      if (idx >= 0) this.alerts.splice(idx, 1);
    },
    toggleAlertMute(id: string) {
      const a = this.alerts.find(x => x.id === id);
      if (!a) return;
      a.status = a.status === 'muted' ? 'active' : 'muted';
    },
    markAllNotificationsRead() {
      this.notifications.forEach(n => { n.unread = false; });
    },
    clearNotifications() {
      this.notifications.splice(0, this.notifications.length);
    },
    updateNotificationPrefs(patch: Partial<NotificationPrefs>) {
      Object.assign(this.notificationPrefs, patch);
    },
  },
});
```

- [ ] **Step 4: Add preview store for Ops and Backtest**

Create `vue-app/src/stores/mockPreview.ts`:

```ts
import { defineStore } from 'pinia';
import { OPLOG } from '../data';
import type { BacktestRun, OpLogEntry, OpsRun } from '../types';

export function deterministicKeyTest(id: string): 'ok' | 'fail' {
  const sum = id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return sum % 5 === 0 ? 'fail' : 'ok';
}

export const useMockPreviewStore = defineStore('mockPreview', {
  state: () => ({
    opsLog: [...OPLOG] as OpLogEntry[],
    currentOpsRun: null as OpsRun | null,
    backtestRuns: [] as BacktestRun[],
    opsSeq: 1,
    backtestSeq: 1,
  }),
  actions: {
    async runOpsAction(key: string, label: string) {
      const run: OpsRun = {
        id: 'ops' + (++this.opsSeq),
        key,
        label,
        status: 'running',
        startedAt: new Date().toISOString(),
      };
      this.currentOpsRun = run;
      await new Promise(resolve => setTimeout(resolve, 650));
      run.status = key === 'refetchBonds' ? 'failed' : 'success';
      this.opsLog.unshift({
        d: new Date().toISOString().slice(0, 16).replace('T', ' '),
        op: label,
        who: 'admin',
        ok: run.status === 'success',
        dur: run.status === 'success' ? '0.7s' : '0.8s',
      });
      this.currentOpsRun = null;
      return run.status;
    },
    recordBacktestRun(run: Omit<BacktestRun, 'id' | 'createdAt'>) {
      this.backtestRuns.unshift({
        id: 'bt' + (++this.backtestSeq),
        createdAt: new Date().toISOString(),
        ...run,
      });
    },
  },
});
```

- [ ] **Step 5: Retire compatibility store after consumers migrate**

Keep `vue-app/src/store.ts` unchanged until page migration tasks are complete. After Tasks 3-7 no longer import from `../store`, replace `store.ts` with a one-line comment-free barrel only if needed:

```ts
export {};
```

If any page still imports from `../store`, do not retire the file in this step.

- [ ] **Step 6: Manual syntax check**

Run:

```powershell
npm run build
```

Expected: build exits 0. Existing pages can continue importing the compatibility `store.ts` until later migration tasks.

Checkpoint: If this is in a Git repo, commit with `feat: add shared mock state`.

## Task 3: Shared Watch State Across Markets, Chart, Watchlist

**Files:**
- Modify: `vue-app/src/pages/Markets.vue`
- Modify: `vue-app/src/pages/Chart.vue`
- Modify: `vue-app/src/pages/Watchlist.vue`

- [ ] **Step 1: Wire Markets star state**

In `Markets.vue`, change imports:

```ts
import { useMockPortfolioStore } from '../stores/mockPortfolio';

const portfolio = useMockPortfolioStore();
```

Then replace the first `<td>` in the table body row with:

```vue
<td style="padding-left:16px">
  <button
    class="star-btn"
    :class="{ on: portfolio.isWatched(row.sym) }"
    :title="portfolio.isWatched(row.sym) ? 'Watched' : 'Add to watchlist'"
    @click.stop="portfolio.toggleWatch(row.sym)"
  >★</button>
</td>
```

Add this scoped style:

```css
.star-btn {
  background: transparent;
  border: 0;
  color: var(--fg-mute);
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 6px;
}
.star-btn.on { color: var(--accent); }
.star-btn:hover { background: var(--surface2); }
```

- [ ] **Step 2: Make Markets watchlist tab use shared state**

Replace the `case 'watchlist'` branch in `baseRows`:

```ts
case 'watchlist':
  return portfolio.watchlists
    .flatMap(l => l.syms)
    .filter((sym, idx, all) => all.indexOf(sym) === idx)
    .map(sym => [...SYMBOLS, ...CRYPTO].find(s => s.sym === sym))
    .filter(Boolean) as any[];
```

Replace `tabCount` watchlist branch:

```ts
if (k === 'watchlist') {
  return portfolio.watchlists.flatMap(l => l.syms).filter((sym, idx, all) => all.indexOf(sym) === idx).length;
}
```

- [ ] **Step 3: Wire Chart watch button and fallback**

In `Chart.vue`, change imports:

```ts
import { useMockPortfolioStore } from '../stores/mockPortfolio';

const portfolio = useMockPortfolioStore();
```

Replace `const starred = ...` with:

```ts
const chartError = ref('');
const starred = computed(() => portfolio.isWatched(props.sym));
```

Replace the Watch button:

```vue
<button class="btn-ghost" @click="portfolio.toggleWatch(sym)">
  {{ starred ? '★' : '☆' }} Watch
</button>
```

Wrap `loadTV` and `mountWidget` with failure state:

```ts
function loadTV(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).TradingView) return resolve();
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('TradingView script failed to load'));
    document.head.appendChild(s);
  });
}

async function mountWidget() {
  chartError.value = '';
  try {
    await loadTV();
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    widget = new (window as any).TradingView.widget({
      container_id: containerId,
      symbol: tvSymbol(props.sym),
      interval: 'D',
      timezone: 'Asia/Taipei',
      theme: props.themeMode === 'mixed' ? 'dark' : 'dark',
      style: '1',
      locale: props.lang === 'zh' ? 'zh_TW' : 'en',
      enable_publishing: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      studies: ['MASimple@tv-basicstudies', 'Volume@tv-basicstudies'],
      autosize: true,
      backgroundColor: props.themeMode === 'mixed' ? '#0d1117' : '#131722',
      gridColor: props.themeMode === 'mixed' ? '#1f2632' : '#1e222d',
    });
  } catch (e: any) {
    chartError.value = e?.message || 'Chart unavailable';
  }
}
```

Add this inside `.chart-card`, before the TradingView div:

```vue
<div v-if="chartError" class="chart-fallback">
  <div style="font-weight:600">{{ lang === 'zh' ? '圖表暫時無法載入' : 'Chart unavailable' }}</div>
  <div style="color:var(--fg-dim);margin-top:4px">{{ chartError }}</div>
</div>
```

- [ ] **Step 4: Wire Watchlist page to store**

In `Watchlist.vue`, replace imports:

```ts
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang } from '../types';
```

Replace local `lists` and `newList/remove/onDrop` functions:

```ts
const portfolio = useMockPortfolioStore();
const lists = computed(() => portfolio.watchlists);
const activeIdx = ref(0);
const dragIdx = ref(-1);

function newList() {
  portfolio.addWatchlist('New list');
  activeIdx.value = portfolio.watchlists.length - 1;
}

function remove(sym: string) {
  const list = portfolio.watchlists[activeIdx.value];
  if (list) portfolio.removeFromWatchlist(list.id, sym);
}

function onDrop(toIdx: number) {
  const list = portfolio.watchlists[activeIdx.value];
  if (list) portfolio.moveWatchSymbol(list.id, dragIdx.value, toIdx);
  dragIdx.value = -1;
}
```

Replace `activeRows`:

```ts
const activeRows = computed(() => {
  const list = portfolio.watchlists[activeIdx.value];
  return (list?.syms ?? [])
    .map(s => ALL.value.find(x => x.sym === s))
    .filter(Boolean) as any[];
});
```

- [ ] **Step 5: Browser check**

Run a static server from the project root:

```powershell
python -m http.server 5174
```

Open `http://localhost:5174/vue-app/index.html`.

Expected:
- Clicking a star in Markets changes the star color.
- The Markets watchlist tab reflects that symbol.
- Chart Watch toggles the same state.
- Removing a symbol in Watchlist updates Markets and Chart.

Checkpoint: If this is in a Git repo, commit with `feat: share watchlist state`.

## Task 4: Trade Flow, Overview, and CSV Export

**Files:**
- Modify: `vue-app/src/App.vue`
- Modify: `vue-app/src/components/OrderTicket.vue`
- Modify: `vue-app/src/pages/Overview.vue`
- Modify: `vue-app/src/pages/Trades.vue`

- [ ] **Step 1: Let Overview emit navigation and order actions**

In `Overview.vue`, add emits:

```ts
const emit = defineEmits<{
  order: [];
  navigate: [page: 'watchlist' | 'trades' | 'positions'];
}>();
```

Change the Watchlist arrow:

```vue
<button class="link" @click="emit('navigate', 'watchlist')">→</button>
```

Change the recent trades button:

```vue
<button class="btn-accent" @click="emit('order')">+ {{ t(lang, 'addTrade') }}</button>
```

Change trade import and row source:

```ts
import { useMockPortfolioStore } from '../stores/mockPortfolio';

const portfolio = useMockPortfolioStore();
```

Replace:

```vue
<tr v-for="tr in TRADES.slice(0, 5)" :key="tr.d + tr.sym">
```

with:

```vue
<tr v-for="tr in portfolio.trades.slice(0, 5)" :key="tr.d + tr.sym + tr.qty + tr.px">
```

- [ ] **Step 2: Pass Overview events from App**

In `App.vue`, replace the Overview component line:

```vue
<Overview
  v-if="page === 'overview'"
  :lang="tweaks.lang"
  @order="openTicket"
  @navigate="page = $event"
/>
```

- [ ] **Step 3: Update OrderTicket to use portfolio and notification stores**

In `OrderTicket.vue`, replace:

```ts
import { executeOrder } from '../store';
```

with:

```ts
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import { useMockNotificationsStore } from '../stores/mockNotifications';

const portfolio = useMockPortfolioStore();
const notifications = useMockNotificationsStore();
```

Inside `placeOrder`, replace `executeOrder({ ... })` with:

```ts
  portfolio.executeOrder({
    sym: selected.value.sym,
    name: selected.value.name,
    side: side.value,
    qty: qty.value,
    px: fillPx.value,
    fee: +estFee.value.toFixed(2),
    sector: selected.value.sector ?? selected.value.cat.toUpperCase(),
    note: tif.value === 'GTC' ? 'GTC' : '',
  });

  notifications.pushNotification({
    kind: 'order',
    sym: selected.value.sym,
    text: `${side.value} ${qty.value} ${selected.value.sym} @ ${fmtNum(fillPx.value)} filled`,
    time: 'now',
    unread: true,
  });
```

- [ ] **Step 4: Add real filters to Trades**

In `Trades.vue`, replace the chip block:

```vue
<button
  v-for="c in chips"
  :key="c.k"
  :class="['chip', { active: filter === c.k }]"
  @click="filter = c.k"
>{{ c.l }}</button>
```

Replace the table row source:

```vue
<tr v-for="(tr, i) in filteredTrades" :key="tr.d + tr.sym + tr.qty + tr.px + i" :class="{ fresh: i === 0 && portfolio.lastFill && tr.sym === portfolio.lastFill.sym }">
```

Replace the script body after emits:

```ts
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { fmtNum } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang, Trade } from '../types';

defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order'): void }>();

type Filter = 'all' | 'buy' | 'sell' | 'div' | '2026';
const portfolio = useMockPortfolioStore();
const filter = ref<Filter>('all');
const chips = [
  { k: 'all' as Filter, l: 'All' },
  { k: 'buy' as Filter, l: 'Buy' },
  { k: 'sell' as Filter, l: 'Sell' },
  { k: 'div' as Filter, l: 'Dividend' },
  { k: '2026' as Filter, l: '2026' },
];

const filteredTrades = computed(() => {
  if (filter.value === 'all') return portfolio.trades;
  if (filter.value === '2026') return portfolio.trades.filter(t2 => t2.d.startsWith('2026'));
  return portfolio.trades.filter(t2 => t2.type.toLowerCase() === filter.value);
});

function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = [
    ['date', 'type', 'symbol', 'qty', 'price', 'total', 'fee', 'note'],
    ...filteredTrades.value.map((tr: Trade) => [
      tr.d,
      tr.type,
      tr.sym,
      tr.qty,
      tr.px,
      tr.qty * tr.px,
      tr.fee,
      tr.note,
    ]),
  ];
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resource-trades-${filter.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Change Export button:

```vue
<button class="btn-ghost" @click="exportCsv">{{ t(lang, 'export') }}</button>
```

- [ ] **Step 4: Browser check**

Open `http://localhost:5174/vue-app/index.html`.

Expected:
- Place a mock order.
- Positions updates.
- Trades shows the new row.
- Overview recent trades shows the same new row.
- Trades filter chips change displayed rows.
- Export downloads a CSV for the active filter.

Checkpoint: If this is in a Git repo, commit with `feat: complete mock trade flow`.

## Task 5: Notifications and Alert Coherence

**Files:**
- Modify: `vue-app/src/pages/Notifications.vue`
- Modify: `vue-app/src/pages/Alerts.vue`
- Modify: `vue-app/src/stores/mockNotifications.ts`

- [ ] **Step 1: Use notification store in Alerts**

In `Alerts.vue`, replace the store import:

```ts
import { useMockNotificationsStore } from '../stores/mockNotifications';
```

Add near the top of the script:

```ts
const mockNotifications = useMockNotificationsStore();
```

Replace `store.alerts`, `store.alertEvents`, `addAlert`, `updateAlert`, `removeAlert`, and `toggleAlertMute` usages with the matching `mockNotifications` state/actions.

- [ ] **Step 2: Import notification store actions**

In `Notifications.vue`, change imports:

```ts
import { ref, computed } from 'vue';
import { t } from '../i18n';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import type { Lang, MockNotificationKind, NotificationPrefs } from '../types';

const mockNotifications = useMockNotificationsStore();
```

- [ ] **Step 3: Wire top action buttons**

Change the header buttons:

```vue
<button class="btn-ghost" @click="saveRules" :class="{ active: rulesSaved }">
  ✓ {{ rulesSaved ? (lang === 'zh' ? '已儲存規則' : 'Rules saved') : (lang === 'zh' ? '儲存規則' : 'Save rules') }}
</button>
<button class="btn-ghost" @click="mockNotifications.markAllNotificationsRead">{{ t(lang, 'markRead') }}</button>
<button class="btn-ghost" @click="mockNotifications.clearNotifications">{{ t(lang, 'clearAll') }}</button>
```

Keep the existing rules toggle button. The new save button should sit next to it.

- [ ] **Step 4: Replace local rules with shared prefs**

Replace `const rules = ref(...)` with:

```ts
const rulesSaved = ref(false);
const rules = ref<NotificationPrefs>({ ...mockNotifications.notificationPrefs });

function saveRules() {
  mockNotifications.updateNotificationPrefs({ ...rules.value });
  rulesSaved.value = true;
  setTimeout(() => { rulesSaved.value = false; }, 1400);
}
```

- [ ] **Step 5: Replace generated notification list with store notifications**

Replace `type Kind`:

```ts
type Kind = MockNotificationKind;
```

Replace `notifList` computed with:

```ts
const notifList = computed(() => mockNotifications.notifications);
```

Update `filteredNotifs` to return a mutable store list:

```ts
const filteredNotifs = computed(() => {
  let list = notifList.value;
  if (selectedDay.value) list = list.filter(n => n.dateKey === selectedDay.value.key);
  if (chip.value === 'unread') return list.filter(n => n.unread);
  if (chip.value !== 'all') return list.filter(n => n.kind === chip.value);
  return list;
});
```

- [ ] **Step 6: Keep heatmap based on notification dates**

Replace `days` computed with:

```ts
const days = computed<DayData[]>(() => {
  const map = new Map<string, DayData>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: d, key, alerts: 0, orders: 0, system: 0, count: 0 });
  }
  mockNotifications.notifications.forEach(n => {
    const d = map.get(n.dateKey);
    if (!d) return;
    if (n.kind === 'alert' || n.kind === 'news') d.alerts++;
    else if (n.kind === 'order') d.orders++;
    else d.system++;
    d.count++;
  });
  return [...map.values()];
});
```

- [ ] **Step 7: Browser check**

Expected:
- Mark read removes unread dots and unread count becomes zero.
- Clear all empties the list.
- Saving rules shows saved state.
- Creating an alert adds an unread notification.

Checkpoint: If this is in a Git repo, commit with `feat: complete mock notifications`.

## Task 6: Settings Mock Completeness

**Files:**
- Modify: `vue-app/src/App.vue`
- Modify: `vue-app/src/pages/Settings.vue`

- [ ] **Step 1: Let Settings update app tweaks and show toast**

In `App.vue`, replace Settings line:

```vue
<Settings
  v-else-if="page === 'settings'"
  :lang="tweaks.lang"
  @set-tweak="onSet"
  @toast="showToast"
/>
```

In `Settings.vue`, add emits after props:

```ts
const emit = defineEmits<{
  toast: [m: string];
  setTweak: [payload: { key: string; value: any }];
}>();
```

- [ ] **Step 2: Disable profile and security preview controls**

Replace `Change avatar`:

```vue
<button class="btn-ghost" style="margin-left:auto" disabled>
  {{ lang === 'zh' ? '頭像編輯預覽' : 'Avatar edit preview' }}
</button>
```

Replace Security action buttons:

```vue
<button class="btn-ghost" disabled>{{ lang === 'zh' ? '密碼流程預覽' : 'Password flow preview' }}</button>
<button class="btn-accent" disabled>{{ lang === 'zh' ? '2FA 預覽' : '2FA preview' }}</button>
<button class="btn-ghost" disabled>{{ lang === 'zh' ? '裝置管理預覽' : 'Device management preview' }}</button>
```

Add disabled styles:

```css
button:disabled {
  opacity: .48;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 3: Wire Display controls to app tweaks**

Replace display theme row buttons:

```vue
<div class="seg-pill">
  <button @click="emit('setTweak', { key: 'theme', value: 'light' })">Light</button>
  <button @click="emit('setTweak', { key: 'theme', value: 'dark' })">Dark</button>
</div>
```

Add language controls under Display:

```vue
<SettingRow :label="t(lang, 'language')" sub="Interface language">
  <div class="seg-pill">
    <button @click="emit('setTweak', { key: 'lang', value: 'zh' })">繁中</button>
    <button @click="emit('setTweak', { key: 'lang', value: 'en' })">EN</button>
  </div>
</SettingRow>
```

- [ ] **Step 4: Implement notification preferences tab**

Replace the fallback `template v-else` with a specific `notifPref` block before it:

```vue
<template v-else-if="tab === 'notifPref'">
  <div class="sec-h">{{ t(lang, 'notifPref') }}</div>
  <div class="rows">
    <SettingRow label="Price alerts" sub="Threshold, volume, and news notifications">
      <label class="chk"><input type="checkbox" v-model="notifPrefs.alertCross"> Cross</label>
      <label class="chk"><input type="checkbox" v-model="notifPrefs.alertVol"> Volume</label>
      <label class="chk"><input type="checkbox" v-model="notifPrefs.alertNews"> News</label>
    </SettingRow>
    <SettingRow label="Order events" sub="Mock order lifecycle notifications">
      <label class="chk"><input type="checkbox" v-model="notifPrefs.orderFill"> Fill</label>
      <label class="chk"><input type="checkbox" v-model="notifPrefs.orderPartial"> Partial</label>
      <label class="chk"><input type="checkbox" v-model="notifPrefs.orderReject"> Reject</label>
      <label class="chk"><input type="checkbox" v-model="notifPrefs.orderStop"> Stop</label>
    </SettingRow>
    <SettingRow label="Quiet hours" sub="Local mock preference">
      <label class="chk"><input type="checkbox" v-model="notifPrefs.quietEnable"> Enabled</label>
      <input class="inp" type="time" v-model="notifPrefs.quietFrom">
      <input class="inp" type="time" v-model="notifPrefs.quietTo">
      <button class="btn-accent" @click="saveNotifPrefs">{{ t(lang, 'save') }}</button>
    </SettingRow>
  </div>
</template>
```

Add script:

```ts
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { deterministicKeyTest } from '../stores/mockPreview';
import type { Lang, NotificationPrefs } from '../types';

const mockNotifications = useMockNotificationsStore();
const notifPrefs = reactive<NotificationPrefs>({ ...mockNotifications.notificationPrefs });

function saveNotifPrefs() {
  mockNotifications.updateNotificationPrefs({ ...notifPrefs });
  emit('toast', props.lang === 'zh' ? '通知偏好已儲存' : 'Notification preferences saved');
}
```

If the file already imports `Lang`, merge the import instead of duplicating it.

- [ ] **Step 5: Make API key testing deterministic and labeled simulated**

Replace `testKey`:

```ts
function testKey(k: ApiKey) {
  k.testing = true;
  k.lastTest = null;
  setTimeout(() => {
    k.testing = false;
    k.lastTest = deterministicKeyTest(k.id + k.provider);
    emit('toast', props.lang === 'zh' ? '已完成模擬連線測試' : 'Simulated connection test complete');
  }, 900);
}
```

- [ ] **Step 6: Browser check**

Expected:
- Display theme/language buttons affect the app.
- Profile/security preview controls are disabled.
- Notification preferences can be saved and show toast.
- API key test result is repeatable for the same key.
- AI Access remains visibly preview-labeled.

Checkpoint: If this is in a Git repo, commit with `feat: complete mock settings`.

## Task 7: Simulated Backtest and Ops Runs

**Files:**
- Modify: `vue-app/src/pages/Backtest.vue`
- Modify: `vue-app/src/pages/Ops.vue`

- [ ] **Step 1: Label Backtest as simulated**

In `Backtest.vue`, change the subtitle line:

```vue
<div class="sub">
  {{ lang === 'zh' ? '模擬策略回測：曲線、回報熱力圖、交易明細' : 'Simulated strategy backtest: equity curve, return heatmap, trade log' }}
</div>
```

Add a small badge near the page title:

```vue
<span class="preview-badge">{{ lang === 'zh' ? '模擬' : 'Simulated' }}</span>
```

Add style:

```css
.preview-badge {
  display: inline-flex;
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--surface2);
  color: var(--fg-dim);
  font-size: 10px;
  font-weight: 600;
}
```

- [ ] **Step 2: Make Backtest Run update visible state**

In `Backtest.vue`, import:

```ts
import { useMockPreviewStore } from '../stores/mockPreview';

const mockPreview = useMockPreviewStore();
```

Add state:

```ts
const runNonce = ref(0);
const strategyError = ref('');
```

Update `result` seed:

```ts
const seed = strategy.value.charCodeAt(0) + sym.value.charCodeAt(0) + period.value.charCodeAt(0) + runNonce.value + customSeed.value;
```

Replace `run()`:

```ts
function run() {
  runNonce.value++;
  mockPreview.recordBacktestRun({
    strategy: strategy.value,
    sym: sym.value,
    period: period.value,
    initial: initial.value,
    seed: runNonce.value + customSeed.value,
    label: strategy.value === 'custom' ? 'Custom JS mock run' : strategy.value,
  });
}
```

Add latest run display below config:

```vue
<div v-if="mockPreview.backtestRuns[0]" class="run-note">
  {{ lang === 'zh' ? '最新模擬執行' : 'Latest mock run' }}:
  {{ mockPreview.backtestRuns[0].label }} · {{ mockPreview.backtestRuns[0].sym }} · {{ mockPreview.backtestRuns[0].period }}
</div>
<div v-if="strategyError" class="err-note">{{ strategyError }}</div>
```

- [ ] **Step 3: Show custom strategy errors inline**

Replace `onRun` catch block:

```ts
  } catch (e: any) {
    strategyError.value = e?.message || 'Strategy compile error';
  }
```

Set `strategyError.value = ''` after a valid compile.

- [ ] **Step 4: Wire Ops to shared simulated runs**

In `Ops.vue`, replace imports:

```ts
import { t } from '../i18n';
import { useMockPreviewStore } from '../stores/mockPreview';
import type { Lang } from '../types';

const mockPreview = useMockPreviewStore();
```

Replace `OPLOG` usage in template:

```vue
<div v-for="(o, i) in mockPreview.opsLog" :key="i" class="log" :style="{ borderTop: i ? '1px solid var(--border)' : '0' }">
```

Add running status near actions:

```vue
<div v-if="mockPreview.currentOpsRun" class="run-state">
  {{ lang === 'zh' ? '模擬執行中' : 'Simulated run in progress' }}: {{ mockPreview.currentOpsRun.label }}
</div>
```

Replace `run()`:

```ts
async function run() {
  if (!confirm.value) return;
  const item = confirm.value;
  confirm.value = null;
  const status = await mockPreview.runOpsAction(item.k, t(props.lang, item.k));
  emit('toast', `${status === 'success' ? '✓' : '✗'} ${t(props.lang, item.k)}`);
}
```

- [ ] **Step 5: Browser check**

Expected:
- Backtest page labels itself simulated.
- Run changes KPI values or latest-run note.
- Invalid custom JS shows inline error.
- Ops action shows running state, then appends an operation log row.

Checkpoint: If this is in a Git repo, commit with `feat: complete simulated preview flows`.

## Task 8: CmdK, Shortcuts, and Reachability

**Files:**
- Modify: `vue-app/src/components/CmdK.vue`
- Modify: `vue-app/src/useShortcuts.ts`
- Modify: `vue-app/src/components/KeyboardHelp.vue`

- [ ] **Step 1: Add Alerts to CmdK pages and remove empty export**

In `CmdK.vue`, update page map:

```ts
const map: Array<[Page, string]> = [
  ['overview', 'g o'], ['markets', 'g m'], ['positions', 'g p'],
  ['analytics', 'g a'], ['trades', 'g t'], ['watchlist', 'g w'],
  ['backtest', 'g b'], ['alerts', 'g l'], ['notifications', 'g n'],
  ['settings', 'g s'], ['ops', 'g x'],
];
```

Replace actions list:

```ts
const all: Item[] = [
  { id: 'addTrade', label: t(props.lang, 'addTrade'), shortcut: 'n', action: () => emit('navigate', 'trades') },
  { id: 'help', label: props.lang === 'zh' ? '鍵盤快速鍵' : 'Keyboard shortcuts', shortcut: '?', action: () => emit('openHelp') },
  { id: 'recalcRoi', label: t(props.lang, 'recalcRoi'), action: () => emit('navigate', 'ops') },
];
```

- [ ] **Step 2: Confirm shortcut map includes reachable pages**

In `useShortcuts.ts`, keep `l: 'alerts'` and confirm `b: 'backtest'`, `x: 'ops'`, and `n: 'notifications'` remain.

If missing, set:

```ts
const G_MAP: Record<string, Page> = {
  o: 'overview',
  d: 'overview',
  m: 'markets',
  c: 'chart',
  p: 'positions',
  a: 'analytics',
  t: 'trades',
  w: 'watchlist',
  b: 'backtest',
  n: 'notifications',
  s: 'settings',
  l: 'alerts',
  x: 'ops',
};
```

- [ ] **Step 3: Align KeyboardHelp**

In `KeyboardHelp.vue`, ensure the help rows include:

```ts
{ k: 'g l', zh: '警示', en: 'Alerts' },
{ k: 'g b', zh: '回測', en: 'Backtest' },
{ k: 'g x', zh: '運維', en: 'Ops' },
```

- [ ] **Step 4: Browser check**

Expected:
- Cmd/Ctrl+K finds Alerts, Backtest, Ops, Settings, Notifications.
- CmdK no longer shows an Export action with no behavior.
- `g l` opens Alerts.
- `?` help lists the same shortcuts.

Checkpoint: If this is in a Git repo, commit with `fix: align command palette shortcuts`.

## Task 9: End-to-End Manual Verification

**Files:**
- No code changes required.

- [ ] **Step 1: Start static server**

Run from `D:\end\workspace\vue\stock-v2`:

```powershell
python -m http.server 5174
```

Expected: server listens at `http://localhost:5174`.

- [ ] **Step 2: Open app**

Open:

```text
http://localhost:5174/vue-app/index.html
```

Expected: app loads without `#err` overlay.

- [ ] **Step 3: Verify order coherence**

Steps:
- Open Markets.
- Click quick order for `AAPL`.
- Complete mock fill.
- Open Positions, Trades, Overview.

Expected:
- Position quantity or price changes.
- Trades first row matches the fill.
- Overview recent trades includes the fill.
- Notifications has an unread order event.

- [ ] **Step 4: Verify watch coherence**

Steps:
- Star `TSLA` in Markets.
- Open Markets watchlist tab.
- Open Chart for `TSLA`.
- Unstar from Chart.
- Open Watchlist.

Expected:
- TSLA appears after star.
- TSLA disappears after unstar unless another list still contains it.

- [ ] **Step 5: Verify notifications**

Steps:
- Open Alerts.
- Create a new alert.
- Open Notifications.
- Click Mark read.
- Click Clear all.

Expected:
- New alert notification appears unread.
- Mark read removes unread dots.
- Clear all empties the list.

- [ ] **Step 6: Verify settings**

Steps:
- Open Settings > Display.
- Toggle theme/language.
- Open Settings > Notifications.
- Save notification preferences.
- Test an API key.

Expected:
- Theme/language changes apply.
- Save shows toast.
- API key test result is deterministic across repeated clicks.

- [ ] **Step 7: Verify preview modules**

Steps:
- Open Backtest and run twice.
- Enter invalid custom JS and run custom strategy.
- Open Ops and execute two actions.
- Open Settings > AI Access.

Expected:
- Backtest shows simulated label and latest run changes.
- Invalid custom JS displays inline error.
- Ops log gains rows.
- AI Access remains preview-labeled.

- [ ] **Step 8: Verify command reachability**

Steps:
- Press Cmd/Ctrl+K.
- Search Alerts, Backtest, Ops.
- Press `g l`, `g b`, `g x`.

Expected:
- CmdK navigation works.
- Keyboard shortcuts open the matching pages.
- No empty Export command appears.

Checkpoint: If this is in a Git repo, commit with `test: verify mock mvp flows`.

## Plan Self-Review

Spec coverage:
- Vue project foundation: Task 1.
- Shared mock state: Task 2.
- Markets/Chart/Watchlist shared state and chart fallback: Task 3.
- Order flow, Overview sync, Trades filters/export: Task 4.
- Alerts/Notifications local coherence: Task 5.
- Settings mock behavior and AI Access preview: Task 6.
- Backtest and Ops preview behavior: Task 7.
- CmdK and shortcuts reachability: Task 8.
- Manual verification: Task 9.

Placeholder scan:
- This plan contains no placeholder markers.
- Each code-changing task includes concrete file paths and code snippets.

Type consistency:
- Shared types are defined in Task 2 before later tasks import them.
- Store actions used by pages are defined in Task 2 before page wiring tasks.
- `setTweak` event payload in Settings matches `onSet` in `App.vue`.
