import { describe, expect, it } from 'vitest';

/**
 * contract-journey 不得攔截 / stub 守門(G-05-9、05-01 test-tier 禁止事項、T-05-48)。
 *
 * 為什麼需要:`e2e/tests/contract-journey.spec.ts`(J0)是 Phase 5 SC3 / SC4(D-10 ~ D-12)的證據 ——
 * 真瀏覽器 → 真後端的單一串連流程。只要 J0 或它 import 的 helper 呼叫 `page.route` / `route.fulfill`
 * 之類的 API,證據就變成 stub 出來的,而 E2E 照樣全綠。05-01 原本只靠一次性 grep 把關,且:
 * - eslint(`lint = eslint src`)、vue-tsc(tsconfig include `src/**`)、vitest include 都看不到 `vue-app/e2e/`;
 *   本檔以 `import.meta.glob(..., { query: '?raw' })` 把 e2e 原始碼當字串讀進來,是唯一進得了
 *   `npm test`(含 CI frontend job)的路。以 `?raw` 讀 `.spec.ts` 只拿字串,不會註冊 Playwright 測試。
 * - 一次性 grep 只看 spec 本身:共用的 `e2e/support/fixtures.ts` 覆寫 `page` fixture 就能在 spec
 *   grep 仍為 0 時 stub J0。所以本守門沿 J0 的相對 import 遞迴掃整個閉包。
 *
 * 規則:
 * 1. J0 的 import 閉包(J0 + 遞迴追蹤的相對 import)內,任何檔案不得出現
 *    `.route(` / `.unroute(` / `.unrouteAll(` / `.routeFromHAR(` / `.routeWebSocket(` / `.fulfill(` /
 *    `.abort(` / `.fallback(` / `.continue(` / `.addInitScript(` 呼叫形狀(`.` 與名稱、名稱與 `(` 間可有空白;
 *    `?.route(` 同樣命中)。合法的 `page.evaluate`、`page.request`、`playwright.request.newContext` 不受限。
 * 2. J0 的直接 import:相對 import 只能是 `../support/fixtures`;非相對 import 只能是 `@playwright/test`。
 * 3. 閉包內每個檔案的非相對 import 只能是 `@playwright/test`;無法解析到 glob 鍵的相對 import 視為違規
 *    (逼使 glob 範圍跟上,不讓 helper 躲在掃描範圍外)。
 *
 * 為何掃原始碼、不剝註解:`decimalBoundary.test.ts` 的 `stripComments` 會把含 `/**` 的 glob 字串當成
 * 註解開頭誤吞程式碼(G-05-9 debug 實測);而且 J0 與其 helper 的註解本來就不該寫出禁止的呼叫形狀 ——
 * 要描述時寫「不攔截、不 stub」即可。
 *
 * 已知盲點(靠 code review):方括號存取(`page['route'](`)、解構後呼叫(`const { route } = page`)、
 * `page.evaluate` 內改寫 `window.fetch` 這類 in-page monkeypatch,都無法以呼叫形狀偵測。
 *
 * 不得 import Node 內建模組(未裝 @types/node,且守門必須在 jsdom 環境可跑):路徑 normalize 自己寫。
 */
const e2eSources = import.meta.glob('../e2e/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const J0 = '../e2e/tests/contract-journey.spec.ts';
const FIXTURES = '../e2e/support/fixtures.ts';
/** 閉包內唯一允許的非相對 import。 */
const ALLOWED_PACKAGES: readonly string[] = ['@playwright/test'];
/** J0 唯一允許的相對 import(直接 import 白名單)。 */
const J0_ALLOWED_RELATIVE: readonly string[] = ['../support/fixtures'];

interface ClosureResult {
  /** 閉包內實際掃到的 glob 鍵(含 entry)。 */
  files: string[];
  /** 違規描述;空陣列 = 通過。 */
  violations: string[];
}

/** 禁止的呼叫形狀:`.` 後接完整名稱、可有空白、再接 `(`(`?.route(` 的 `.` 同樣命中)。 */
const FORBIDDEN_CALL =
  /\.\s*(route|unroute|unrouteAll|routeFromHAR|routeWebSocket|fulfill|abort|fallback|continue|addInitScript)\s*\(/g;

/** 逐行找禁止的攔截 / stub 呼叫;每處呼叫回報一筆 `檔案:行號: .名稱( | 該行內容`。 */
function findForbiddenCalls(file: string, source: string): string[] {
  const found: string[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(FORBIDDEN_CALL)) {
      found.push(`${file}:${index + 1}: .${match[1]}( | ${line.trim()}`);
    }
  });
  return found;
}

/** import / export-from(含多行具名 import 與 type-only)、side-effect import、動態 import、require。 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\b(?:import|export)\s+[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** 抽出原始碼中所有 import / export-from / 動態 import / require 的 specifier(依出現位置排序、去重)。 */
function extractSpecifiers(source: string): string[] {
  const found: Array<{ index: number; specifier: string }> = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.push({ index: match.index ?? 0, specifier: match[1] });
    }
  }
  found.sort((x, y) => x.index - y.index);
  return [...new Set(found.map((item) => item.specifier))];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** 處理 `.` / `..` 片段;開頭無法再往上的 `..` 保留(glob 鍵本身就以 `../e2e/` 開頭)。 */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

/** 把 `fromFile` 內的相對 specifier 解析成 glob 鍵;找不到回 null。 */
function resolveRelative(fromFile: string, specifier: string, sources: Record<string, string>): string | null {
  const dir = fromFile.split('/').slice(0, -1).join('/');
  const base = normalizePath(`${dir}/${specifier}`);
  const key = base.startsWith('../') ? base : `./${base}`;
  const candidates = [key, `${key}.ts`, key.replace(/\.js$/, '.ts'), `${key}/index.ts`];
  return candidates.find((candidate) => candidate.endsWith('.ts') && candidate in sources) ?? null;
}

/** J0 直接 import 白名單檢查:相對 import 只能是 J0_ALLOWED_RELATIVE,非相對只能是 ALLOWED_PACKAGES。 */
function checkDirectImports(source: string): string[] {
  return extractSpecifiers(source)
    .filter((specifier) =>
      isRelative(specifier) ? !J0_ALLOWED_RELATIVE.includes(specifier) : !ALLOWED_PACKAGES.includes(specifier),
    )
    .map((specifier) => `J0 直接 import 不在白名單:'${specifier}'`);
}

/** 從 entry 沿相對 import BFS,套用禁止呼叫與 import 規則。 */
function collectClosure(entry: string, sources: Record<string, string>): ClosureResult {
  const violations: string[] = [];
  const files: string[] = [];
  const queue = [entry];
  const seen = new Set<string>([entry]);
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const source = sources[file];
    if (source === undefined) {
      violations.push(`${file}: 不在掃描範圍(glob 讀不到)`);
      continue;
    }
    files.push(file);
    violations.push(...findForbiddenCalls(file, source));
    for (const specifier of extractSpecifiers(source)) {
      if (!isRelative(specifier)) {
        if (!ALLOWED_PACKAGES.includes(specifier)) violations.push(`${file}: 非白名單套件 import '${specifier}'`);
        continue;
      }
      const resolved = resolveRelative(file, specifier, sources);
      if (resolved === null) {
        violations.push(`${file}: 無法解析的相對 import '${specifier}'`);
        continue;
      }
      if (!seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return { files, violations };
}

describe('contract-journey 不得攔截 / stub 守門(G-05-9 / 05-01)', () => {
  it('掃描範圍非空:讀得到 J0 與 fixtures.ts,J0 閉包至少含兩個檔', () => {
    const keys = Object.keys(e2eSources);
    expect(keys).toContain(J0);
    expect(keys).toContain(FIXTURES);
    expect(e2eSources[J0].length).toBeGreaterThan(0);
    const { files } = collectClosure(J0, e2eSources);
    expect(files).toContain(J0);
    expect(files).toContain(FIXTURES);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('J0 的直接 import 只有 ../support/fixtures 與 @playwright/test', () => {
    const specifiers = extractSpecifiers(e2eSources[J0]);
    const relative = [...new Set(specifiers.filter(isRelative))].sort();
    const packages = specifiers.filter((specifier) => !isRelative(specifier));
    expect(relative).toEqual([...J0_ALLOWED_RELATIVE]);
    expect(packages.filter((specifier) => !ALLOWED_PACKAGES.includes(specifier))).toEqual([]);
    expect(checkDirectImports(e2eSources[J0])).toEqual([]);
  });

  it('J0 的 import 閉包 0 違規(禁止呼叫、非白名單套件、無法解析的相對 import)', () => {
    expect(collectClosure(J0, e2eSources).violations).toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    const hits: Array<[string, number]> = [
      ["await context.route('**/api/v1/x', (r) => r.fulfill({ json: {} }))", 2],
      ["await page.context().route('**', handler);", 1],
      ["await page.routeFromHAR('x.har');", 1],
      ["await page.routeWebSocket('/ws', handler);", 1],
      ["await route.abort('failed');", 1],
      ['await route.fallback();', 1],
      ['await route.continue();', 1],
      ['await page.addInitScript(() => {});', 1],
      ["await page.unroute('**');", 1],
      ['await page.unrouteAll();', 1],
      ["await x?.route('**', handler);", 1],
      ["await page .route ('**', handler);", 1],
    ];
    for (const [line, count] of hits) {
      expect(findForbiddenCalls('synthetic.ts', line), line).toHaveLength(count);
    }
    // 每處呼叫各回報一筆,行號與內容要對
    expect(findForbiddenCalls('s.ts', 'a\n' + hits[0][0])).toEqual([
      `s.ts:2: .route( | ${hits[0][0]}`,
      `s.ts:2: .fulfill( | ${hits[0][0]}`,
    ]);

    const misses = [
      'await page.evaluate(() => document.cookie);',
      "await page.request.get('/api/v1/me');",
      'const ctx = await playwright.request.newContext({});',
      '// 不攔截、不 stub 任何請求',
      "const route = '/api/v1/trades';",
      'const config = { routes: [] };',
    ];
    for (const line of misses) {
      expect(findForbiddenCalls('synthetic.ts', line), line).toEqual([]);
    }

    // import 抽取涵蓋各種寫法
    expect(
      extractSpecifiers(
        [
          "import { a } from './a';",
          "import type { B } from '../b';",
          'import {\n  c,\n  d,\n} from "./cd";',
          "export { e } from './e';",
          "export * from './f';",
          "import './side-effect';",
          "const g = await import('./g');",
          "const h = require('./h');",
          "import { test } from '@playwright/test';",
        ].join('\n'),
      ),
    ).toEqual(['./a', '../b', './cd', './e', './f', './side-effect', './g', './h', '@playwright/test']);
  });

  it('繞過情境:J0 改 import 其他 helper、或 fixtures.ts 覆寫 page fixture 都會被抓到', () => {
    const stubHelper = '../e2e/support/portfolioStubs.ts';
    const stubHelperSource =
      "export async function stubPortfolio(page) {\n  await page.route('**/api/v1/portfolio/**', (r) => r.fulfill({ json: {} }));\n}\n";

    // (a) J0 改 import portfolioStubs:直接 import 白名單違規,且閉包掃到 helper 內的禁止呼叫
    const j0WithStubs =
      "import { test, expect } from '../support/fixtures';\nimport { stubPortfolio } from '../support/portfolioStubs';\n";
    expect(checkDirectImports(j0WithStubs).join('\n')).toContain('../support/portfolioStubs');
    const a = collectClosure(J0, {
      [J0]: j0WithStubs,
      [FIXTURES]: e2eSources[FIXTURES],
      [stubHelper]: stubHelperSource,
    });
    expect(a.files).toContain(stubHelper);
    expect(a.violations.some((v) => v.startsWith(`${stubHelper}:2:`))).toBe(true);

    // (b) fixtures.ts 覆寫 page fixture:J0 本身乾淨(spec-only grep 會是 0),閉包仍抓到 fixtures.ts
    const fixturesWithPageOverride = [
      "import { test as base } from '@playwright/test';",
      'export const test = base.extend({',
      "  page: async ({ page }, use) => { await page.route('**', (r) => r.abort()); await use(page); },",
      '});',
    ].join('\n');
    expect(checkDirectImports(e2eSources[J0])).toEqual([]);
    const b = collectClosure(J0, { [J0]: e2eSources[J0], [FIXTURES]: fixturesWithPageOverride });
    expect(b.violations.some((v) => v.startsWith(`${FIXTURES}:3:`))).toBe(true);

    // (c) 無法解析的相對 import 與非白名單套件都算違規
    const c = collectClosure(J0, {
      [J0]: "import { test } from '../support/fixtures';\nimport { x } from '../support/missing';\nimport { http } from 'msw';\n",
      [FIXTURES]: e2eSources[FIXTURES],
    });
    expect(c.violations.join('\n')).toContain('../support/missing');
    expect(c.violations.join('\n')).toContain('msw');
  });
});
