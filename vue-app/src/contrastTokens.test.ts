import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
// 原始碼字面(Vite ?raw):對比度 token 是設計系統層級的規則,行為測試看不到「這個宣告寫錯了」,
// 所以直接守原始碼(沿用 OrderTicket.test.ts / mockStoreBoundary.test.ts 的 ?raw 手法,不走 node:fs)。
import stylesSource from './styles.css?raw';
import { useTweaks } from './useTweaks';

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
      'pages/Ops.vue': { count: 1, why: '最近任務列的 .ldot 圓點 background' },
      'pages/Analytics.vue': { count: 2, why: '持有天數 .dot 圓點 background;waterfall bar 的 fill(標籤文字另用 --up-text)' },
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

  it('以 --dn 當底色的危險按鈕 / 警示圖示同樣改用 --btn-dn-bg 白字(不再繼承 accent 的深色字)', () => {
    for (const [file, selector] of [
      ['components/AuthPanel.vue', '.auth-submit.danger'],
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

  it('沒有其他規則以 var(--up) / var(--dn) 為底色配白字(成功打勾圓圈為圖示,列白名單)', () => {
    // 48px 成功圓圈的 ✓ 是大型圖示(非文字 3:1 門檻,白 / #16a34a 約 3.3:1),語意是「成功」而非漲跌。
    const CHECK_CIRCLES = ['components/CashEntryDialog.vue', 'components/OrderTicket.vue', 'components/HoldingEventDialog.vue'];
    const offenders = vueRules
      .filter(r => ['var(--up)', 'var(--dn)'].includes(backgroundOf(r) ?? '') && WHITE.test(r.decls.color ?? ''))
      .filter(r => !CHECK_CIRCLES.some(file => r.file.endsWith(file)) || r.decls.width !== '48px')
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
