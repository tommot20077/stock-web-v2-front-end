import { describe, expect, it } from 'vitest';
import { resolveTvWidgetTheme } from './chartTvTheme';

describe('resolveTvWidgetTheme', () => {
  it('tv mode is always TradingView native dark regardless of app theme', () => {
    expect(resolveTvWidgetTheme('tv', 'light')).toEqual({
      theme: 'dark',
      backgroundColor: '#131722',
      gridColor: '#1e222d',
    });
    expect(resolveTvWidgetTheme('tv', 'dark').theme).toBe('dark');
  });

  it('mixed mode follows the app theme', () => {
    expect(resolveTvWidgetTheme('mixed', 'dark')).toEqual({
      theme: 'dark',
      backgroundColor: '#0d1117',
      gridColor: '#1f2632',
    });
    expect(resolveTvWidgetTheme('mixed', 'light')).toEqual({
      theme: 'light',
      backgroundColor: '#ffffff',
      gridColor: '#e6e8eb',
    });
  });
});
