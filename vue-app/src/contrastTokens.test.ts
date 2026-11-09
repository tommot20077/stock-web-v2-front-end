import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
// 原始碼字面(Vite ?raw):對比度 token 是設計系統層級的規則,行為測試看不到「這個宣告寫錯了」,
// 所以直接守原始碼(沿用 OrderTicket.test.ts / mockStoreBoundary.test.ts 的 ?raw 手法,不走 node:fs)。
import stylesSource from './styles.css?raw';
import { useTweaks } from './useTweaks';
import { composite, contrastRatio, surfacesOf } from './testing/wcag';

/*
 * quick-261106-fbs A2(todo 2026-10-26-contrast-text-tokens,Yuan 於對比度樣式頁裁定的值):
 * - 文字用的上漲色與圖表 / 圓點 / 底色用的 --up 分離:淺色 --up-text #15803d(白底約 5.0:1)、深色 #16a34a。
 * - 深色主題 --dn 淺化為 #ef4444。
 * - --accent(#ff6600)底的文字改深色 --on-accent #15171c(白字只有約 2.9:1)。
 * - 買進 / 賣出鈕另用按鈕底色 token(兩主題同值,白字):--btn-up-bg #15803d、--btn-dn-bg #dc2626。
 * - 紅漲綠跌偏好(upGreen=false)以 :root[data-up-color="red"] 對調,不再寫 inline custom property
 *   (inline 優先權高於任何選擇器,會讓深色主題的 --dn 與上述 token 全部失效)。
 */

const vueSources = import.meta.glob('./**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface CssRule {
  file: string;
  selector: string;
  decls: Record<string, string>;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseDecls(body: string): Record<string, string> {
  const decls: Record<string, string> = {};
  for (const part of body.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).replace(/!important/, '').trim();
    if (prop) decls[prop] = value;
  }
  return decls;
}

/** 只取最內層的 `selector { decls }`;@media / @keyframes 的外殼自然被略過。 */
function parseRules(file: string, css: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ file, selector: match[1].trim().replace(/\s+/g, ' '), decls: parseDecls(match[2]) });
  }
  return rules;
}

function styleBlocksOf(source: string): string {
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
}

function templateAndScriptOf(source: string): string {
  return source.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

const vueRules: CssRule[] = Object.entries(vueSources).flatMap(([file, source]) => parseRules(file, styleBlocksOf(source)));
const globalRules = parseRules('styles.css', stylesSource);

function blockOf(selector: string): Record<string, string> {
  const rule = globalRules.find(r => r.selector === selector);
  expect(rule, `styles.css 必須有 ${selector} 區塊`).toBeTruthy();
  return rule!.decls;
}

function backgroundOf(rule: CssRule): string | undefined {
  return rule.decls.background ?? rule.decls['background-color'];
}

const WHITE = /^(#fff|#ffffff|white)$/i;

describe('A2 styles.css 對比度 token(T2.4)', () => {
  it(':root 的淺色 token:--up 維持圖表色、--up-text 為文字安全色、--on-accent 為 accent 底文字色', () => {
    const root = blockOf(':root');
    expect(root['--up']).toBe('#16a34a');
    expect(root['--up-text']).toBe('#15803d');
    expect(root['--dn']).toBe('#dc2626');
    expect(root['--accent']).toBe('#ff6600');
    expect(root['--on-accent']).toBe('#15171c');
    expect(root['--btn-up-bg']).toBe('#15803d');
    expect(root['--btn-dn-bg']).toBe('#dc2626');
  });

  it('深色主題:--up-text #16a34a、--dn #ef4444;按鈕底色 token 兩主題同值(不在深色區塊覆寫)', () => {
    const dark = blockOf(':root[data-theme="dark"]');
    expect(dark['--up-text']).toBe('#16a34a');
    expect(dark['--dn']).toBe('#ef4444');
    expect(dark['--btn-up-bg']).toBeUndefined();
    expect(dark['--btn-dn-bg']).toBeUndefined();
  });

  it('紅漲綠跌(淺色):上漲為紅、下跌取綠色文字安全值,按鈕底色一併對調', () => {
    const red = blockOf(':root[data-up-color="red"]');
    expect(red['--up']).toBe('#dc2626');
    expect(red['--up-text']).toBe('#dc2626');
    expect(red['--dn']).toBe('#15803d');
    expect(red['--btn-up-bg']).toBe('#dc2626');
    expect(red['--btn-dn-bg']).toBe('#15803d');
  });

  it('紅漲綠跌(深色):上漲 #ef4444、下跌 #16a34a', () => {
    const darkRed = blockOf(':root[data-theme="dark"][data-up-color="red"]');
    expect(darkRed['--up']).toBe('#ef4444');
    expect(darkRed['--up-text']).toBe('#ef4444');
    expect(darkRed['--dn']).toBe('#16a34a');
  });

  it('紅漲區塊寫在深色區塊之後(同特異度時後者勝,淺色紅漲才蓋得過深色 --up-text / --dn)', () => {
    const order = globalRules.map(r => r.selector);
    expect(order.indexOf(':root[data-up-color="red"]')).toBeGreaterThan(order.indexOf(':root[data-theme="dark"]'));
  });
});

describe('A2 .vue style 規則(T2.4)', () => {
  it('掃得到元件樣式(防止 glob 失效讓下列斷言空轉)', () => {
    expect(Object.keys(vueSources).length).toBeGreaterThan(20);
    expect(vueRules.length).toBeGreaterThan(500);
  });

  it('background 為 var(--accent) 且宣告 color 的規則,color 一律是 var(--on-accent)', () => {
    const offenders = vueRules
      .filter(r => backgroundOf(r) === 'var(--accent)' && r.decls.color !== undefined && r.decls.color !== 'var(--on-accent)')
      .map(r => `${r.file} ${r.selector} → color: ${r.decls.color}`);
    expect(offenders).toEqual([]);
  });

  it('accent 底規則至少涵蓋規劃時掃到的代表性元件(送出鈕、logo、kbd、banner icon)', () => {
    const onAccent = vueRules.filter(r => backgroundOf(r) === 'var(--accent)' && r.decls.color === 'var(--on-accent)');
    const has = (file: string, selector: string) =>
      onAccent.some(r => r.file.endsWith(file) && r.selector.split(',').map(s => s.trim()).includes(selector));
    expect(has('AuthPanel.vue', '.auth-submit')).toBe(true);
    expect(has('Header.vue', '.logo')).toBe(true);
    expect(has('PrefixIndicator.vue', 'kbd')).toBe(true);
    expect(has('OrderTicket.vue', '.btn-accent')).toBe(true);
    expect(has('SettingsAiAccess.vue', '.banner-icon')).toBe(true);
  });

  it('.quote-lab(含 OrderTicket 共用的 .qm-l)文字色為 var(--fg-dim)', () => {
    const quoteLabs = vueRules.filter(r => r.selector.split(',').map(s => s.trim()).includes('.quote-lab'));
    expect(quoteLabs.map(r => r.file.split('/').pop()).sort())
      .toEqual(['CashEntryDialog.vue', 'HoldingEventDialog.vue', 'OrderTicket.vue']);
    for (const r of quoteLabs) expect(r.decls.color, `${r.file} ${r.selector}`).toBe('var(--fg-dim)');
  });

  it('style 區塊沒有以 var(--up) 當文字 color 的宣告(文字一律 --up-text)', () => {
    const offenders = vueRules
      .filter(r => r.decls.color === 'var(--up)')
      .map(r => `${r.file} ${r.selector}`);
    expect(offenders).toEqual([]);
  });

  /*
   * 模板 / script 內的 'var(--up)' 字串:只允許非文字用途(白名單逐條附理由)。
   * 其餘(漲跌數字、KPI、toneColor / changeColor 這類回傳給文字 color 的 helper)必須用 'var(--up-text)'。
   */
  it("模板 / script 內的 'var(--up)' 只出現在白名單的非文字用途", () => {
    const ALLOWED: Record<string, { count: number; why: string }> = {
      'pages/Overview.vue': { count: 1, why: '70×24 sparkline 容器:color 只驅動 SVG currentColor 的線條,非文字' },
      // quick-261107-1j4 2d:Ops `.ldot` 成功分支與 Analytics 持有天數圓點改 --success(狀態語意,不隨紅漲對調)。
      'pages/Analytics.vue': { count: 1, why: 'waterfall bar 的 fill(標籤文字另用 --up-text)' },
    };
    const counts: Record<string, number> = {};
    for (const [file, source] of Object.entries(vueSources)) {
      const n = (templateAndScriptOf(source).match(/'var\(--up\)'/g) ?? []).length;
      if (n > 0) counts[file.replace(/^\.\//, '')] = n;
    }
    const expected: Record<string, number> = {};
    for (const [file, entry] of Object.entries(ALLOWED)) expected[file] = entry.count;
    expect(counts).toEqual(expected);
  });

  it('模板內的靜態 style 沒有 color:var(--up)', () => {
    const offenders = Object.entries(vueSources)
      .filter(([, source]) => /(^|[^-\w])color:\s*var\(--up\)/.test(templateAndScriptOf(source)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe('A2 買進 / 賣出鈕底色(2c-addendum)', () => {
  function rulesFor(file: string, selector: string): CssRule[] {
    return vueRules.filter(r => r.file.endsWith(file) && r.selector.split(',').map(s => s.trim()).includes(selector));
  }

  for (const file of ['components/OrderTicket.vue', 'pages/Chart.vue']) {
    it(`${file}:.btn-accent.buy / .sell 底色取 --btn-up-bg / --btn-dn-bg,文字為白`, () => {
      const buy = rulesFor(file, '.btn-accent.buy');
      const sell = rulesFor(file, '.btn-accent.sell');
      expect(buy.length, '.btn-accent.buy').toBeGreaterThan(0);
      expect(sell.length, '.btn-accent.sell').toBeGreaterThan(0);
      for (const r of buy) {
        expect(backgroundOf(r)).toBe('var(--btn-up-bg)');
        expect(r.decls.color ?? '').toMatch(WHITE);
      }
      for (const r of sell) {
        expect(backgroundOf(r)).toBe('var(--btn-dn-bg)');
        expect(r.decls.color ?? '').toMatch(WHITE);
      }
    });
  }

  it('以 --dn 當底色的警示圖示同樣改用 --btn-dn-bg 白字(不再繼承 accent 的深色字)', () => {
    for (const [file, selector] of [
      ['components/settings/SettingsBrokers.vue', '.banner.warn-banner .banner-icon'],
    ]) {
      const rules = rulesFor(file, selector);
      expect(rules.length, `${file} ${selector}`).toBeGreaterThan(0);
      for (const r of rules) {
        expect(backgroundOf(r), `${file} ${selector}`).toBe('var(--btn-dn-bg)');
        expect(r.decls.color ?? '', `${file} ${selector}`).toMatch(WHITE);
      }
    }
  });

  it('危險動作鈕 AuthPanel .auth-submit.danger 改用固定錯誤色 --danger / --on-danger(Phase 5 D-28,不隨紅漲綠跌對調)', () => {
    const rules = rulesFor('components/AuthPanel.vue', '.auth-submit.danger');
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(backgroundOf(r)).toBe('var(--danger)');
      expect(r.decls.color).toBe('var(--on-danger)');
    }
  });

  it('沒有任何規則以 var(--up) / var(--dn) 為底色配白字(成功打勾圓圈已改 --success / --on-success)', () => {
    const offenders = vueRules
      .filter(r => ['var(--up)', 'var(--dn)'].includes(backgroundOf(r) ?? '') && WHITE.test(r.decls.color ?? ''))
      .map(r => `${r.file} ${r.selector}`);
    expect(offenders).toEqual([]);
  });
});

describe('A2 OrderTicket「記錄交易」按鈕尺寸(2c-addendum)', () => {
  function rule(selector: string): CssRule {
    const found = vueRules.find(r => r.file.endsWith('components/OrderTicket.vue') && r.selector === selector);
    expect(found, selector).toBeTruthy();
    return found!;
  }

  it('.btn-accent 與同列 .btn-ghost 同高 36px、水平內距 16px', () => {
    const accent = rule('.btn-accent');
    expect(accent.decls['min-height']).toBe('36px');
    expect(accent.decls.padding).toBe('8px 16px');
    expect(rule('.btn-ghost').decls['min-height']).toBe('36px');
  });

  it('.btn-submit 保留 min-width 136px(標籤切換不跳動)', () => {
    expect(rule('.btn-submit').decls['min-width']).toBe('136px');
  });
});

describe('A2 useTweaks 以 data-up-color 切換紅漲綠跌(T2.5)', () => {
  afterEach(() => {
    useTweaks().reset();
    localStorage.clear();
  });

  it('upGreen=false → dataset.upColor = red,且 documentElement 上沒有 --up / --dn inline 值', async () => {
    const { set } = useTweaks();
    set('upGreen', false);
    await nextTick();

    const root = document.documentElement;
    expect(root.dataset.upColor).toBe('red');
    expect(root.style.getPropertyValue('--up')).toBe('');
    expect(root.style.getPropertyValue('--dn')).toBe('');
  });

  it('reset 後回到 green;--accent 仍以 inline 套用使用者偏好', async () => {
    const { set, reset } = useTweaks();
    set('upGreen', false);
    await nextTick();
    reset();
    await nextTick();

    const root = document.documentElement;
    expect(root.dataset.upColor).toBe('green');
    expect(root.style.getPropertyValue('--up')).toBe('');
    expect(root.style.getPropertyValue('--accent')).toBe('#ff6600');
  });
});

/*
 * quick-261107-1j4 2d(Yuan 2026-11-07 3A 裁決;數值以下列量測為準):
 * - A1 CashEntryDialog / HoldingEventDialog 主要按鈕與 OrderTicket「記錄交易」同規格(36px、內距 8px 16px)。
 * - A2 --accent-text:accent 的文字安全版(preset 對照在 accentTokens.ts,此處守 styles.css 與套用點)。
 * - A3 --success / --on-success:成功 / OK / live 語意的固定綠,紅漲綠跌偏好下不對調(與 --up 分離)。
 * - A4 --fg-mute 加深到對該主題全部 surface ≥ 4.5:1。
 * 規則:文字 token 對該主題每個 surface ≥ 4.5;放在色膠囊上的文字另對「膠囊色以其 alpha 疊在 surface」量測;
 * 非文字圖形(圓點、打勾圖示與底色)≥ 3。
 */
const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;
const surfaces = surfacesOf(stylesSource);
const THEMES = ['light', 'dark'] as const;

function themeVars(theme: 'light' | 'dark'): Record<string, string> {
  const root = blockOf(':root');
  return theme === 'light' ? root : { ...root, ...blockOf(':root[data-theme="dark"]') };
}

function rulesIn(file: string, selector: string): CssRule[] {
  return vueRules.filter(r => r.file.endsWith(file) && r.selector.split(',').map(s => s.trim()).includes(selector));
}

describe('A4 --fg-mute 加深(T2.9)', () => {
  it('淺色 #6b6b73、深色 #8f8c84;舊值 #a1a1aa / #62605a 不再出現', () => {
    expect(blockOf(':root')['--fg-mute']).toBe('#6b6b73');
    expect(blockOf(':root[data-theme="dark"]')['--fg-mute']).toBe('#8f8c84');
    expect(stylesSource).not.toMatch(/#a1a1aa|#62605a/i);
  });

  for (const theme of THEMES) {
    it(`${theme}:--fg-mute 對 --bg / --surface / --surface2 皆 ≥ 4.5`, () => {
      const mute = themeVars(theme)['--fg-mute'];
      for (const [name, surface] of Object.entries(surfaces[theme])) {
        const ratio = contrastRatio(mute, surface);
        expect(ratio, `${mute} on ${name} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }
});

describe('A2 --accent-text 套用點(T2.9)', () => {
  it(':root 與深色區塊都定義 --accent-text', () => {
    expect(blockOf(':root')['--accent-text']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(blockOf(':root[data-theme="dark"]')['--accent-text']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  for (const file of ['pages/Positions.vue', 'pages/Markets.vue', 'pages/Trades.vue']) {
    it(`${file}:排序中欄位標頭 thead th.s 文字色為 var(--accent-text)`, () => {
      const rules = rulesIn(file, 'thead th.s');
      expect(rules.length, `${file} thead th.s`).toBeGreaterThan(0);
      for (const r of rules) expect(r.decls.color).toBe('var(--accent-text)');
    });
  }

  it('Markets 啟用中分頁計數:文字 var(--accent-text),膠囊底維持 accent 18%', () => {
    const rules = rulesIn('pages/Markets.vue', '.tab.active .tab-count');
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.decls.color).toBe('var(--accent-text)');
      expect(backgroundOf(r)).toBe('color-mix(in oklch, var(--accent) 18%, transparent)');
    }
  });

  it('沒有任何 .vue 規則把 var(--accent) 當一般文字色用在 th.s / tab-count', () => {
    const offenders = vueRules
      .filter(r => /th\.s|tab-count/.test(r.selector) && r.decls.color === 'var(--accent)')
      .map(r => `${r.file} ${r.selector}`);
    expect(offenders).toEqual([]);
  });
});

describe('A2 useTweaks 同步 inline --accent-text(T2.9)', () => {
  afterEach(() => {
    useTweaks().reset();
    localStorage.clear();
  });

  it('preset #a855f7:深色主題為深色值、淺色主題為淺色值', async () => {
    const { set } = useTweaks();
    set('accent', '#a855f7');
    set('theme', 'dark');
    await nextTick();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--accent')).toBe('#a855f7');
    expect(root.style.getPropertyValue('--accent-text')).toBe('#ba79f9');

    set('theme', 'light');
    await nextTick();
    expect(root.style.getPropertyValue('--accent-text')).toBe('#830df4');
  });

  it('非 preset 的自訂 accent:移除 inline --accent-text,退回 styles.css 主題預設', async () => {
    const { set } = useTweaks();
    set('accent', '#a855f7');
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--accent-text')).not.toBe('');

    set('accent', '#123456');
    await nextTick();
    expect(document.documentElement.style.getPropertyValue('--accent-text')).toBe('');
  });
});

describe('A3 --success / --on-success(T2.9)', () => {
  it(':root 與深色區塊定義 --success / --on-success;紅漲兩個區塊不覆寫(固定綠)', () => {
    expect(blockOf(':root')['--success']).toBe('#166534');
    expect(blockOf(':root')['--on-success']).toBe('#ffffff');
    expect(blockOf(':root[data-theme="dark"]')['--success']).toBe('#22c55e');
    expect(blockOf(':root[data-theme="dark"]')['--on-success']).toBe('#15171c');
    for (const red of [':root[data-up-color="red"]', ':root[data-theme="dark"][data-up-color="red"]']) {
      expect(blockOf(red)['--success'], red).toBeUndefined();
      expect(blockOf(red)['--on-success'], red).toBeUndefined();
    }
  });

  for (const theme of THEMES) {
    it(`${theme}:--success 文字對 surface 與 15% / 12% 自身色膠囊 ≥ 4.5;--on-success 對 --success ≥ 3`, () => {
      const vars = themeVars(theme);
      const success = vars['--success'];
      for (const [name, surface] of Object.entries(surfaces[theme])) {
        const plain = contrastRatio(success, surface);
        expect(plain, `${success} on ${name} = ${plain.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
        for (const alpha of [0.15, 0.12]) {
          const pill = contrastRatio(success, composite(success, alpha, surface));
          expect(pill, `${success} on ${alpha} pill over ${name} = ${pill.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
      const icon = contrastRatio(vars['--on-success'], success);
      expect(icon, `--on-success on --success = ${icon.toFixed(2)}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    });
  }

  // 審計結果(task2-report「var(--up) 歸類表」):成功 / OK / live / 健康 / 已連線 / 唯讀權限 語意。
  const SUCCESS_PILL_15 = 'color-mix(in oklch, var(--success) 15%, transparent)';
  const SUCCESS_RULES: Array<[string, string, Record<string, string>]> = [
    ['components/CashEntryDialog.vue', '.check', { background: 'var(--success)', color: 'var(--on-success)' }],
    ['components/OrderTicket.vue', '.check', { background: 'var(--success)', color: 'var(--on-success)' }],
    ['components/HoldingEventDialog.vue', '.check', { background: 'var(--success)', color: 'var(--on-success)' }],
    ['components/settings/SettingsAiAccess.vue', '.chip.ok', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/settings/SettingsAiAccess.vue', '.chip.live', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/settings/SettingsAiAccess.vue', '.mcp-tag.read', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/settings/SettingsBrokers.vue', '.chip.live', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/settings/SettingsDataSources.vue', '.chip.livefeed', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/settings/SettingsDataSources.vue', '.chip.ok', { background: SUCCESS_PILL_15, color: 'var(--success)' }],
    ['components/StrategyEditor.vue', '.status.ok', { color: 'var(--success)' }],
    ['components/LiveQuoteStatus.vue', '.live-dot.solid', { background: 'var(--success)' }],
    ['pages/Markets.vue', '.live.on', { color: 'var(--success)', 'border-color': 'color-mix(in oklch, var(--success) 35%, var(--border))' }],
    ['pages/Markets.vue', '.live.on .live-dot', { background: 'var(--success)' }],
    ['pages/Ops.vue', '.hdot', { background: 'var(--success)' }],
    ['pages/Ops.vue', '.health .v', { color: 'var(--success)' }],
    ['pages/Watchlist.vue', '.live-dot', { background: 'var(--success)' }],
    ['pages/Overview.vue', '.live-dot', { background: 'var(--success)' }],
    ['pages/Chart.vue', '.live-dot', { background: 'var(--success)' }],
    ['pages/Chart.vue', '.live-pill', { background: 'color-mix(in oklch, var(--success) 12%, transparent)', color: 'var(--success)' }],
  ];

  for (const [file, selector, expected] of SUCCESS_RULES) {
    it(`${file} ${selector} 使用 --success`, () => {
      // 同一選擇器可能另有只寫 animation 的規則(例如 reduced-motion 區塊),只看有宣告該屬性的規則。
      const rules = rulesIn(file, selector);
      for (const [prop, value] of Object.entries(expected)) {
        const valueOf = (r: CssRule) => (prop === 'background' ? backgroundOf(r) : r.decls[prop]);
        const declaring = rules.filter(r => valueOf(r) !== undefined);
        expect(declaring.length, `${file} ${selector} 必須宣告 ${prop}`).toBeGreaterThan(0);
        for (const r of declaring) expect(valueOf(r), `${file} ${selector} ${prop}`).toBe(value);
      }
    });
  }

  it('Markets live 脈衝 keyframes 的光暈改用 --success', () => {
    const pulse = vueRules.filter(r => r.file.endsWith('pages/Markets.vue') && (r.selector === '0%, 100%' || r.selector === '50%') && r.decls['box-shadow'] !== undefined);
    expect(pulse.length).toBe(2);
    for (const r of pulse) expect(r.decls['box-shadow']).toContain('var(--success)');
  });

  it('模板內的成功狀態(已連線、Healthy、任務成功燈、長期持有燈)使用 var(--success)', () => {
    const source = (file: string) => templateAndScriptOf(vueSources[`./${file}`]);
    expect(source('components/settings/SettingsBrokers.vue')).toMatch(/style="color:var\(--success\)">✓/);
    expect(source('components/settings/SettingsDataSources.vue')).toMatch(/style="color:var\(--success\)">✓/);
    expect(source('pages/Ops.vue')).toMatch(/style="color:var\(--success\)">Healthy/);
    expect(source('pages/Ops.vue')).toMatch(/o\.status === 'success' \? 'var\(--success\)'/);
    expect(source('pages/Analytics.vue')).toMatch(/h\.daysHeld > 365 \? 'var\(--success\)'/);
  });

  it('--success 不出現在價格方向 / 買進類規則(.pill.buy、.side-btn.buy、.tick-up 維持 --up 系)', () => {
    for (const [file, selector] of [
      ['pages/Trades.vue', '.pill.buy'],
      ['components/OrderTicket.vue', '.side-btn.buy.active'],
      ['pages/Markets.vue', '.tick-up'],
    ]) {
      for (const r of rulesIn(file, selector)) {
        expect(Object.values(r.decls).join(' '), `${file} ${selector}`).not.toContain('--success');
      }
    }
  });
});

describe('A1 現金 / 股利對話框主要按鈕 36px(T2.9)', () => {
  function rule(file: string, selector: string): CssRule {
    const found = vueRules.find(r => r.file.endsWith(file) && r.selector === selector);
    expect(found, `${file} ${selector}`).toBeTruthy();
    return found!;
  }

  for (const [file, submitMin] of [['components/CashEntryDialog.vue', '176px'], ['components/HoldingEventDialog.vue', '208px']]) {
    it(`${file}:.btn-accent 高 36px、內距 8px 16px(同 OrderTicket);.btn-submit min-width ${submitMin} 不變`, () => {
      const accent = rule(file, '.btn-accent');
      expect(accent.decls['min-height']).toBe('36px');
      expect(accent.decls.padding).toBe('8px 16px');
      expect(rule(file, '.btn-submit').decls['min-width']).toBe(submitMin);
    });
  }

  it('CashEntryDialog < 400px 的 .btn-submit min-width 160px 保留', () => {
    const source = styleBlocksOf(vueSources['./components/CashEntryDialog.vue']);
    expect(source).toMatch(/@media \(max-width: 399px\) \{[\s\S]*?\.btn-submit \{ min-width: 160px; \}/);
  });
});

/*
 * quick-261107-1j4 E3(Yuan 3A 裁決延伸):Part 2 只改了 th.s / tab-count,其餘以 var(--accent) 當**文字色**的地方
 * (連結 / 強調字、hover 文字、膠囊文字、狀態 ★ / ✕ / 圖示字形)一律改為 var(--accent-text);
 * 背景、邊框、外框、SVG fill / stroke 與圖表容器(color 只驅動 currentColor 線條)維持 var(--accent)。
 */
describe('E3 其餘 accent 文字用法改用 --accent-text(quick-261107-1j4)', () => {
  it('style 區塊沒有任何以 var(--accent) 當文字 color 的宣告', () => {
    const offenders = vueRules
      .filter(r => r.decls.color === 'var(--accent)')
      .map(r => `${r.file} ${r.selector}`);
    expect(offenders).toEqual([]);
  });

  it('模板內的靜態 color:var(--accent) 只剩圖表容器(currentColor 驅動 SVG 線條 / 長條,非文字)', () => {
    const ALLOWED: Record<string, { count: number; why: string }> = {
      'pages/Positions.vue': { count: 1, why: '權益曲線 LineChart 容器;容器內的 .sm-pill 自帶白字紫底' },
      'pages/Markets.vue': { count: 1, why: '債券殖利率 Bars 容器;Bars 的標籤文字固定 fill var(--fg-dim)' },
      'pages/Overview.vue': { count: 1, why: '權益曲線 LineChart 容器' },
    };
    const counts: Record<string, number> = {};
    for (const [file, source] of Object.entries(vueSources)) {
      const n = (templateAndScriptOf(source).match(/(^|[^-\w])color:\s*var\(--accent\)/g) ?? []).length;
      if (n > 0) counts[file.replace(/^\.\//, '')] = n;
    }
    const expected: Record<string, number> = {};
    for (const [file, entry] of Object.entries(ALLOWED)) expected[file] = entry.count;
    expect(counts).toEqual(expected);
  });

  /** 代表性用法:[檔案, 選擇器, 該規則同時應保留的 accent 非文字宣告(屬性 → 值)]。 */
  const REPRESENTATIVE: ReadonlyArray<[string, string, Record<string, string>]> = [
    ['components/settings/SettingsBrokers.vue', '.chip.sandbox', { background: 'color-mix(in oklch, var(--accent) 14%, transparent)' }],
    ['components/settings/SettingsDataSources.vue', '.chip.sandbox', { background: 'color-mix(in oklch, var(--accent) 14%, transparent)' }],
    ['pages/Settings.vue', '.soon', { background: 'color-mix(in oklch, var(--accent) 18%, transparent)' }],
    ['pages/Settings.vue', '.btn-ghost:hover:not(:disabled)', { 'border-color': 'var(--accent)' }],
    ['components/settings/SettingsAiAccess.vue', '.btn-ghost:hover:not(:disabled)', { 'border-color': 'var(--accent)' }],
    ['components/settings/SettingsAiAccess.vue', '.call-tool code', {}],
    ['components/StrategyEditor.vue', '.api-list code', { background: 'var(--surface)' }],
    ['pages/Backtest.vue', '.preview-badge', { background: 'color-mix(in oklch, var(--accent) 10%, transparent)' }],
    ['pages/Backtest.vue', '.btn-ghost.active', { 'border-color': 'var(--accent)' }],
    ['pages/Ops.vue', '.run-status', { background: 'color-mix(in oklch, var(--accent) 8%, transparent)' }],
    ['pages/Alerts.vue', '.al-target', {}],
    ['pages/Alerts.vue', '.ch-toggle.on', { 'border-color': 'var(--accent)' }],
    ['pages/Analytics.vue', '.tab.on', { 'border-bottom-color': 'var(--accent)' }],
    ['pages/Analytics.vue', '.slider-row .num.edited', {}],
    ['pages/Notifications.vue', '.day-pin', {}],
    ['pages/Notifications.vue', '.day-pin .x', {}],
    ['pages/Markets.vue', '.star-btn.on', {}],
    ['pages/Markets.vue', '.row:hover .quick-order', { 'border-color': 'color-mix(in oklch, var(--accent) 35%, var(--border))' }],
    ['pages/Chart.vue', '.btn-watch.on .watch-glyph', {}],
    ['components/CmdK.vue', '.grp-row.active .grp-icon', {}],
  ];

  for (const [file, selector, keep] of REPRESENTATIVE) {
    it(`${file} ${selector}:文字 var(--accent-text)${Object.keys(keep).length ? ',非文字宣告維持 accent' : ''}`, () => {
      const rules = rulesIn(file, selector).filter(r => r.decls.color !== undefined);
      expect(rules.length, `${file} ${selector} 必須有宣告 color 的規則`).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r.decls.color, `${file} ${selector}`).toBe('var(--accent-text)');
        for (const [prop, value] of Object.entries(keep)) expect(r.decls[prop], `${file} ${selector} ${prop}`).toBe(value);
      }
    });
  }

  it('accent 底(var(--accent) 背景)的規則仍配 --on-accent,不誤改成 --accent-text', () => {
    const offenders = vueRules
      .filter(r => backgroundOf(r) === 'var(--accent)' && r.decls.color === 'var(--accent-text)')
      .map(r => `${r.file} ${r.selector}`);
    expect(offenders).toEqual([]);
  });
});

/*
 * Phase 5 D-02(c) / D-28:失敗 / 錯誤 / 破壞性動作改用固定紅 --danger(與跌色 --dn 分離)。
 * 紅漲綠跌偏好會把 --dn 對調成綠,若錯誤樣式沿用 --dn,使用者會把失敗誤讀成正常(T-05-19)。
 */
describe('--danger 固定錯誤色(D-28)', () => {
  const RED_BLOCKS = [':root[data-up-color="red"]', ':root[data-theme="dark"][data-up-color="red"]'];

  it(':root 與深色區塊定義 --danger / --on-danger;紅漲兩個區塊不覆寫(固定紅)', () => {
    expect(blockOf(':root')['--danger']).toBe('#dc2626');
    expect(blockOf(':root')['--on-danger']).toBe('#ffffff');
    expect(blockOf(':root[data-theme="dark"]')['--danger']).toBe('#ef4444');
    expect(blockOf(':root[data-theme="dark"]')['--on-danger']).toBe('#15171c');
    for (const red of RED_BLOCKS) {
      expect(blockOf(red)['--danger'], red).toBeUndefined();
      expect(blockOf(red)['--on-danger'], red).toBeUndefined();
    }
  });

  for (const theme of THEMES) {
    it(`${theme}:--danger 文字對 --surface ≥ 4.5;--on-danger 對 --danger ≥ 4.5`, () => {
      const vars = themeVars(theme);
      const danger = vars['--danger'];
      const onSurface = contrastRatio(danger, surfaces[theme]['--surface']);
      expect(onSurface, `${danger} on --surface = ${onSurface.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
      const onDanger = contrastRatio(vars['--on-danger'], danger);
      expect(onDanger, `--on-danger on --danger = ${onDanger.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it("Ops 失敗狀態燈使用 var(--danger),原始碼不再含 'var(--dn)'", () => {
    const ops = templateAndScriptOf(vueSources['./pages/Ops.vue']);
    expect(ops).toMatch(/o\.status === 'success' \? 'var\(--success\)' : 'var\(--danger\)'/);
    expect(vueSources['./pages/Ops.vue']).not.toContain("'var(--dn)'");
  });
});

/*
 * Phase 5 D-28:selector 帶 error / danger / invalid / fail 的規則屬失敗 / 錯誤 / 破壞性語意,
 * 不得引用會隨紅漲綠跌對調的漲跌色(--up / --dn,及由它們衍生或同樣被對調的 --neg / --btn-up-bg / --btn-dn-bg),
 * 也不得寫死錯誤紅 rgba(220, 38, 38, …) 字面(改 color-mix(in oklch, var(--danger) N%, transparent))。
 */
describe('錯誤樣式不得使用漲跌色(D-28)', () => {
  // retry / logout:錯誤區塊旁的重試鈕與登出鈕(破壞性動作),selector 不含上列字眼但同屬錯誤 / 破壞性語意。
  const ERROR_SELECTOR = /error|danger|invalid|fail|retry|logout/i;
  const SWAPPING_TOKEN = /var\(--(up|dn|neg|btn-up-bg|btn-dn-bg)\)/;
  const ERROR_RED_LITERAL = /rgba\(\s*220\s*,\s*38\s*,\s*38\b/;

  function errorStyleOffenders(rules: CssRule[]): string[] {
    return rules
      .filter(r => ERROR_SELECTOR.test(r.selector))
      .flatMap(r =>
        Object.entries(r.decls)
          .filter(([, value]) => SWAPPING_TOKEN.test(value) || ERROR_RED_LITERAL.test(value))
          .map(([prop, value]) => `${r.file} ${r.selector} → ${prop}: ${value}`),
      );
  }

  it('守門自我驗證:假 CSS .x-error { color: var(--dn) } 回報 1 條違規,漲跌語意 selector 不誤報', () => {
    expect(errorStyleOffenders(parseRules('fake.css', '.x-error { color: var(--dn) }'))).toHaveLength(1);
    expect(errorStyleOffenders(parseRules('fake.css', '.x-error { background: rgba(220,38,38,0.10) }'))).toHaveLength(1);
    expect(errorStyleOffenders(parseRules('fake.css', '.dn { color: var(--dn) } .x-error { color: var(--danger) }'))).toEqual([]);
  });

  it('掃描範圍涵蓋 .vue 與 styles.css', () => {
    expect(Object.keys(vueSources).length).toBeGreaterThan(0);
    expect(vueRules.some(r => ERROR_SELECTOR.test(r.selector))).toBe(true);
  });

  it('所有 .vue <style> 與 styles.css 的錯誤類規則不引用漲跌色、不寫死錯誤紅 rgba', () => {
    expect(errorStyleOffenders([...vueRules, ...globalRules])).toEqual([]);
  });
});
