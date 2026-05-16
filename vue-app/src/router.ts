import { createRouter, createWebHashHistory } from 'vue-router';
import type { Page } from './types';

// Transition registry: App.vue still owns rendering until page state is wired to routes.
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
