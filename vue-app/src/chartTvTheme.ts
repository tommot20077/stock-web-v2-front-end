// TradingView widget 主題映射：
// - 'tv'    → TradingView 原生深色樣式
// - 'mixed' → 跟隨 app 主題（light/dark）
import type { Theme } from './types';

export type ChartThemeMode = 'tv' | 'mixed';

export interface TvWidgetTheme {
  theme: 'light' | 'dark';
  backgroundColor: string;
  gridColor: string;
}

export function resolveTvWidgetTheme(mode: ChartThemeMode, appTheme: Theme): TvWidgetTheme {
  if (mode === 'mixed') {
    return appTheme === 'dark'
      ? { theme: 'dark', backgroundColor: '#0d1117', gridColor: '#1f2632' }
      : { theme: 'light', backgroundColor: '#ffffff', gridColor: '#e6e8eb' };
  }
  return { theme: 'dark', backgroundColor: '#131722', gridColor: '#1e222d' };
}
