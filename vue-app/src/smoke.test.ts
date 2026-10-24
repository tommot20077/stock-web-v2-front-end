import { describe, expect, it } from 'vitest';
import { pageRoutes } from './router';

describe('project shell', () => {
  it('registers the MVP page routes with cash right after trades', () => {
    expect(pageRoutes.map(route => route.page)).toEqual([
      'overview',
      'markets',
      'watchlist',
      'positions',
      'backtest',
      'analytics',
      'trades',
      'cash',
      'alerts',
      'notifications',
      'settings',
      'ops',
    ]);
  });
});
