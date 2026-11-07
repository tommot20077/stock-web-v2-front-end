import { describe, expect, it } from 'vitest';
import stylesSource from './styles.css?raw';
import tweaksPanelSource from './components/TweaksPanel.vue?raw';
import { ACCENT_PRESETS, accentTextFor } from './accentTokens';
import { composite, contrastRatio, customPropertiesOf, surfacesOf } from './testing/wcag';
import type { ThemeName } from './testing/wcag';

/*
 * quick-261107-1j4 2d A2(Yuan 2026-11-07 3A 裁決):每個 TweaksPanel accent preset 在淺 / 深主題各有一個
 * 文字安全版 --accent-text。量測面:該主題的 --bg / --surface / --surface2,以及 Markets 啟用中分頁計數膠囊
 * (`.tab.active .tab-count`,accent 18% 疊在 surface 上)——文字真正會坐在這四類底色上。
 */

const AA_TEXT = 4.5;
/** Markets `.tab.active .tab-count` 的膠囊底:color-mix(in oklch, var(--accent) 18%, transparent)。 */
const TAB_COUNT_ALPHA = 0.18;

const surfaces = surfacesOf(stylesSource);

function minContrast(text: string, accent: string, theme: ThemeName): { min: number; where: string } {
  let min = Infinity;
  let where = '';
  for (const [name, surface] of Object.entries(surfaces[theme])) {
    const plain = contrastRatio(text, surface);
    if (plain < min) { min = plain; where = name; }
    const pill = contrastRatio(text, composite(accent, TAB_COUNT_ALPHA, surface));
    if (pill < min) { min = pill; where = `accent 18% on ${name}`; }
  }
  return { min, where };
}

describe('A2 accent preset 與 --accent-text(T2.9)', () => {
  it('ACCENT_PRESETS 為 TweaksPanel 原本的 7 色,順序不變', () => {
    expect(ACCENT_PRESETS.map(p => p.accent))
      .toEqual(['#ff6600', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#f59e0b', '#0ea5e9']);
  });

  for (const preset of ACCENT_PRESETS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${preset.accent} ${theme}:--accent-text 對全部 surface 與 18% accent 膠囊 ≥ 4.5`, () => {
        const text = theme === 'light' ? preset.textLight : preset.textDark;
        const { min, where } = minContrast(text, preset.accent, theme);
        expect(min, `${text} 在 ${where} 只有 ${min.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('accentTextFor 依主題回對應值;非 preset(使用者 localStorage 的自訂值)回 undefined', () => {
    expect(accentTextFor('#a855f7', 'light')).toBe('#830df4');
    expect(accentTextFor('#a855f7', 'dark')).toBe('#ba79f9');
    expect(accentTextFor('#A855F7', 'dark')).toBe('#ba79f9');
    expect(accentTextFor('#123456', 'light')).toBeUndefined();
    expect(accentTextFor('', 'dark')).toBeUndefined();
  });

  it('styles.css 的 --accent-text 主題預設 = 預設 accent(#ff6600)的淺 / 深值(非 preset 時退回這裡)', () => {
    const root = customPropertiesOf(stylesSource, ':root');
    const dark = customPropertiesOf(stylesSource, ':root[data-theme="dark"]');
    expect(root['--accent']).toBe('#ff6600');
    expect(root['--accent-text']).toBe(accentTextFor('#ff6600', 'light'));
    expect(dark['--accent-text']).toBe(accentTextFor('#ff6600', 'dark'));
  });

  it('紅漲綠跌區塊不覆寫 --accent-text', () => {
    expect(customPropertiesOf(stylesSource, ':root[data-up-color="red"]')['--accent-text']).toBeUndefined();
    expect(customPropertiesOf(stylesSource, ':root[data-theme="dark"][data-up-color="red"]')['--accent-text']).toBeUndefined();
  });

  it('TweaksPanel 色票改從 ACCENT_PRESETS 取(單一來源,不再寫死色碼陣列)', () => {
    expect(tweaksPanelSource).toMatch(/ACCENT_PRESETS/);
    expect(tweaksPanelSource).not.toMatch(/'#3b82f6'/);
  });
});

/*
 * quick-261107-1j4 E3(Yuan 3A:accent 當文字一律 --accent-text):其餘文字用法遷移後,--accent-text 也坐在
 * 比 18% 更淡的 accent 膠囊上,以及 Notifications `.day-pin` 的靛色淡底。逐一量測,避免「18% 過了就假設其他都過」。
 */
const E3_CAPSULES: ReadonlyArray<{ where: string; tint: 'accent' | string; alpha: number }> = [
  { where: 'Ops .run-status / Backtest .btn-ghost.active(accent 8%)', tint: 'accent', alpha: 0.08 },
  { where: 'Backtest .preview-badge(accent 10%)', tint: 'accent', alpha: 0.10 },
  { where: 'Alerts .ch-toggle.on(accent 12% 混 surface)', tint: 'accent', alpha: 0.12 },
  { where: 'Settings* .chip.sandbox(accent 14%)', tint: 'accent', alpha: 0.14 },
  { where: 'Notifications .day-pin(rgba(99,102,241,0.1))', tint: '#6366f1', alpha: 0.10 },
];

describe('E3 --accent-text 在遷移後的膠囊底色上(quick-261107-1j4)', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${preset.accent} ${theme}:--accent-text 對 E3 各膠囊底 ≥ 4.5`, () => {
        const text = theme === 'light' ? preset.textLight : preset.textDark;
        for (const capsule of E3_CAPSULES) {
          for (const [name, surface] of Object.entries(surfaces[theme])) {
            const tint = capsule.tint === 'accent' ? preset.accent : capsule.tint;
            const ratio = contrastRatio(text, composite(tint, capsule.alpha, surface));
            expect(ratio, `${text} 在 ${capsule.where} on ${name} 只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
          }
        }
      });
    }
  }
});
