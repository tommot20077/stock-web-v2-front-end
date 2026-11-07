/*
 * Accent preset 與其文字安全版(quick-261107-1j4 2d A2,Yuan 2026-11-07 3A 裁決)。
 *
 * --accent 是品牌色,當底色 / 邊框 / 圖形用;直接當**文字色**時,多數 preset 在淺色 surface 上
 * 不到 WCAG AA 4.5:1(例如 #ff6600 白底約 2.9:1),深色主題的紫 / 紅也不足。所以每個 preset
 * 另配一組 --accent-text(淺 / 深主題各一),由 useTweaks 隨 accent 與主題一起寫成 inline 值。
 *
 * 量測規則(accentTokens.test.ts 守):文字值對該主題 --bg / --surface / --surface2,
 * 以及 Markets 啟用中分頁計數膠囊(accent 18% 疊在 surface 上)皆 ≥ 4.5:1。
 * 最低比值約 4.60(#ff6600 淺 / 深、#3b82f6 淺、#ef4444 深,皆落在 18% 膠囊疊 --surface2 上)。
 *
 * TweaksPanel 色票與 useTweaks 都從這裡取,是 preset 清單的單一來源。
 * styles.css 的 --accent-text 主題預設必須等於 #ff6600 那一列(非 preset 的自訂 accent 退回該預設)。
 */
import type { Theme } from './types';

export interface AccentPreset {
  /** 品牌色本身(--accent)。 */
  accent: string;
  /** 淺色主題的文字安全版。 */
  textLight: string;
  /** 深色主題的文字安全版。 */
  textDark: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { accent: '#ff6600', textLight: '#a64300', textDark: '#ff6d0b' },
  { accent: '#3b82f6', textLight: '#0a58d7', textDark: '#5f99f8' },
  { accent: '#10b981', textLight: '#0a714f', textDark: '#10b981' },
  { accent: '#a855f7', textLight: '#830df4', textDark: '#ba79f9' },
  { accent: '#ef4444', textLight: '#be1010', textDark: '#f26a6a' },
  { accent: '#f59e0b', textLight: '#8d5b06', textDark: '#f59e0b' },
  { accent: '#0ea5e9', textLight: '#096994', textDark: '#0ea6ea' },
];

/**
 * 回傳 accent 在該主題下的文字安全色;不是 preset(例如使用者 localStorage 留下的自訂值)時回 undefined,
 * 呼叫端應移除 inline --accent-text,退回 styles.css 的主題預設。
 */
export function accentTextFor(accent: string, theme: Theme): string | undefined {
  const key = accent.trim().toLowerCase();
  const preset = ACCENT_PRESETS.find(p => p.accent === key);
  if (!preset) return undefined;
  return theme === 'dark' ? preset.textDark : preset.textLight;
}
