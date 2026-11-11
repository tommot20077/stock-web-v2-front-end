import { describe, expect, it } from 'vitest';

/**
 * decimal 邊界源碼守門(Phase 5 D-08,VER-02;05-24)。
 *
 * 05-16 ~ 05-23 把 API 路徑上的金額逐一從 JS number 收回 Decimal,過程中的「型別閉包交接點」
 * (`parseDecimal(numberToWire(x))`)已全部刪除。本檔把兩條規則鎖在原始碼層級,防止回退:
 *
 * 1. `src/pages`、`src/components`、`src/composables` 不得引用 `numberToWire`
 *    —— 它只供 mock adapter 靜態資料與測試(`services/decimal.ts` JSDoc)。元件需要 Decimal 時用
 *    `parseDecimalInput`(表單)或直接拿 service 回傳的 domain 型別。
 * 2. 同範圍的 props / state 宣告不得使用 `*Dto`(wire 型別,金額是字串)——只用 domain 型別
 *    (`Holding`、`TradeRecord`、`BacktestRunRecord`…)。`import type { …Dto } from` 本身與註解不算違規;
 *    違規是指 `ref<…Dto…>` / `shallowRef` / `reactive` / `computed` / `defineProps<…>` 的泛型參數,
 *    以及 `interface XxxProps` / `type XxxProps =` 的本體裡出現 `/\b\w+Dto\b/`。允許的例外清單為空。
 *
 * 掃到違規時修正該元件(改用 domain 型別),不要放寬規則。寫法比照 `mockStoreBoundary.test.ts`。
 */
const pageSources = import.meta.glob('./pages/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const componentSources = import.meta.glob('./components/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const composableSources = import.meta.glob(['./composables/**/*.ts', '!./composables/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const allSources: Record<string, string> = { ...pageSources, ...componentSources, ...composableSources };

/** 去掉 HTML / 區塊 / 行註解(行註解排除 `http://` 這類 `:` 後的 `//`),讓註解裡提到的型別名不算違規。 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 從 `start`(指向 `<`)起取出平衡角括號內的泛型參數;`=>` 的 `>` 不算閉合。 */
function genericArgumentAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '<') depth += 1;
    else if (ch === '>' && source[i - 1] !== '=') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return source.slice(start + 1);
}

/** 從 `start`(指向 `{`)起取出平衡大括號的本體。 */
function braceBodyAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return source.slice(start + 1);
}

const DTO_NAME = /\b\w+Dto\b/g;
const STATE_DECLARATION = /\b(?:ref|shallowRef|reactive|shallowReactive|computed|defineProps)\s*</g;
const PROPS_TYPE_DECLARATION = /\b(?:interface\s+\w*Props\b[^{]*|type\s+\w*Props\s*=\s*)\{/g;

/** 規則 1:回傳 `path: numberToWire` 形式的違規清單(每檔每次出現一條)。 */
function numberToWireViolations(sources: Record<string, string>): string[] {
  return Object.entries(sources).flatMap(([path, source]) =>
    [...source.matchAll(/\bnumberToWire\b/g)].map(() => `${path}: numberToWire`),
  );
}

/** 規則 2:回傳 `path: XxxDto` 形式的違規清單(props / state 宣告中每個 Dto 名一條)。 */
function dtoStateViolations(sources: Record<string, string>): string[] {
  return Object.entries(sources).flatMap(([path, raw]) => {
    const source = stripComments(raw);
    const scopes: string[] = [];
    for (const match of source.matchAll(STATE_DECLARATION)) {
      scopes.push(genericArgumentAt(source, (match.index ?? 0) + match[0].length - 1));
    }
    for (const match of source.matchAll(PROPS_TYPE_DECLARATION)) {
      scopes.push(braceBodyAt(source, (match.index ?? 0) + match[0].length - 1));
    }
    return scopes.flatMap(scope => [...scope.matchAll(DTO_NAME)].map(dto => `${path}: ${dto[0]}`));
  });
}

describe('decimal 邊界源碼守門(05-24 / D-08)', () => {
  it('掃描範圍非空:pages、components、composables 都讀得到原始碼,且不含測試檔', () => {
    expect(Object.keys(pageSources).length).toBeGreaterThan(5);
    expect(Object.keys(componentSources).length).toBeGreaterThan(5);
    expect(Object.keys(composableSources).length).toBeGreaterThan(0);
    expect(Object.keys(composableSources).filter(path => path.endsWith('.test.ts'))).toEqual([]);
    for (const path of ['./pages/Backtest.vue', './pages/Cash.vue', './components/OrderTicket.vue', './composables/useLiveQuotes.ts']) {
      expect(Object.keys(allSources), path).toContain(path);
    }
  });

  it('pages / components / composables 不引用 numberToWire(只供 mock adapter 與測試)', () => {
    expect(numberToWireViolations(allSources)).toEqual([]);
  });

  it('pages / components / composables 的 props / state 宣告不使用 *Dto 型別(例外清單為空)', () => {
    expect(dtoStateViolations(allSources)).toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    // 規則 1
    expect(numberToWireViolations({ a: 'const x = parseDecimal(numberToWire(1));' })).toEqual(['a: numberToWire']);
    expect(numberToWireViolations({ b: "import { parseDecimalInput } from '../services/decimal';" })).toEqual([]);

    // 規則 2:state / props 宣告中的 Dto → 違規
    expect(dtoStateViolations({ c: 'const rows = ref<HoldingDto>(null);' })).toEqual(['c: HoldingDto']);
    expect(dtoStateViolations({ d: 'const s = ref<BlockState<KlineDto[]>>({ status: "idle" });' })).toEqual(['d: KlineDto']);
    expect(dtoStateViolations({ e: 'const props = defineProps<{\n  row: TradeDto;\n  lang: Lang;\n}>();' })).toEqual(['e: TradeDto']);
    expect(dtoStateViolations({ f: 'interface RowProps {\n  entry: CashEntryDto | null;\n}' })).toEqual(['f: CashEntryDto']);
    expect(dtoStateViolations({ g: 'const pick = computed<(x: number) => AssetDto>(() => fn);' })).toEqual(['g: AssetDto']);

    // 規則 2:import、註解、domain 型別、函式參數 → 不算
    expect(dtoStateViolations({
      h: [
        "import type { HoldingDto } from '../services/apiTypes';",
        '// ref<HoldingDto> 只是註解',
        '/* defineProps<{ row: TradeDto }> */',
        '<!-- ref<AssetDto> -->',
        'const rows = ref<Holding[]>([]);',
        "const url = 'http://example.test'; const ok = ref<TradeRecord | null>(null);",
        'function endpointFromDto(endpoint: McpEndpointDto) { return endpoint; }',
      ].join('\n'),
    })).toEqual([]);
  });
});
