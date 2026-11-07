/*
 * 測試專用的 WCAG 2.x 對比度工具(quick-261107-1j4 2d)。
 * 只給 contrastTokens.test.ts / accentTokens.test.ts 量測 styles.css 與 accent preset 的色值,
 * 不被任何正式程式碼 import。
 */

export type Rgb = [number, number, number];

/** `#rgb` / `#rrggbb` → [r, g, b](0–255)。其他格式直接丟錯,避免靜默量到錯的顏色。 */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`不是 hex 色值:${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 相對亮度。 */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 對比度(1–21)。參數可為 hex 字串或 Rgb。 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(typeof a === 'string' ? parseHex(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? parseHex(b) : b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 把 `color` 以 `alpha` 疊在不透明的 `base` 上(sRGB 線性內插,四捨五入到整數通道)。
 * `color-mix(in oklch, X N%, transparent)` 的結果即 X 帶 N% alpha,疊在 surface 上等同此合成。
 */
export function composite(color: string, alpha: number, base: string): Rgb {
  const fg = parseHex(color);
  const bg = parseHex(base);
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

/** 從 CSS 原始碼取出某個選擇器區塊內的 custom property(只看第一個完全相同的選擇器)。 */
export function customPropertiesOf(css: string, selector: string): Record<string, string> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].trim().replace(/\s+/g, ' ') !== selector) continue;
    const props: Record<string, string> = {};
    for (const part of match[2].split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim();
      if (prop.startsWith('--')) props[prop] = part.slice(idx + 1).trim();
    }
    return props;
  }
  throw new Error(`找不到選擇器 ${selector}`);
}

export type ThemeName = 'light' | 'dark';

/** 兩個主題的三個 surface token(深色區塊只覆寫的才取深色值)。 */
export function surfacesOf(css: string): Record<ThemeName, Record<'--bg' | '--surface' | '--surface2', string>> {
  const root = customPropertiesOf(css, ':root');
  const dark = { ...root, ...customPropertiesOf(css, ':root[data-theme="dark"]') };
  const pick = (vars: Record<string, string>) => ({
    '--bg': vars['--bg'],
    '--surface': vars['--surface'],
    '--surface2': vars['--surface2'],
  });
  return { light: pick(root), dark: pick(dark) };
}
