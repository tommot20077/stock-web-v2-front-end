import { describe, expect, it } from 'vitest';
import { pageRoutes } from './router';

describe('project shell', () => {
  it('registers the MVP page routes', () => {
    expect(pageRoutes.map(route => route.page)).toEqual([
      'overview',
      'markets',
      'watchlist',
      'positions',
      'backtest',
      'analytics',
      'trades',
      'alerts',
      'notifications',
      'settings',
      'ops',
    ]);
  });
});
