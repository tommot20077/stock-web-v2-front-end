import { describe, expect, it } from 'vitest';

/**
 * 網路錯誤碼唯一產生點守門(D-26 / FE-WR-01 / T-05-46)。
 *
 * <p>D-26 之後,網路錯誤碼只代表「fetch 在網路層 reject、拿不到 Response」,由
 * `services/apiClient.ts` 的 `transportFetch` 統一合成。元件或頁面若把非 ApiClientError
 * (mapper / 程式錯誤)也包成網路錯誤碼,使用者與維運會把契約 / 程式問題誤判成網路問題;
 * 05-29 / 05-30 / 05-31 已把這類分支全部改成 UNKNOWN_ERROR,本檔鎖住結果、防止回歸。</p>
 *
 * <p>判斷規則:`code` 屬性(冒號前後可有空白)的值是以單引號 / 雙引號 / 反引號包住的網路錯誤碼字串,
 * 就算「產生」。判斷式(`error.code === ...`)與錯誤對照表的 key(`ERROR_COPY` 裡把網路錯誤碼對到文案)
 * 不受限,因為那是消費端,不是產生端。</p>
 *
 * <p>為什麼掃含註解的原始碼:註解裡的範例程式碼常被直接複製成程式碼;註解要提到網路錯誤碼時,
 * 請用文字敘述(例如「網路錯誤碼由 apiClient.transportFetch 合成」),不要寫成物件字面值的樣子。</p>
 *
 * <p>已知盲點:以變數或字串拼接間接組出錯誤碼(先存成常數再指定給 `code`)無法偵測,靠 code review。</p>
 *
 * <p>以 Vite `?raw` + `import.meta.glob` 讀原始碼(比照 mockStoreBoundary.test.ts / wsBoundary.test.ts);
 * 不用 `node:fs`,專案未裝 `@types/node`,vue-tsc 會失敗。</p>
 */
const allSources = import.meta.glob(['./**/*.ts', './**/*.vue'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 測試檔不在產品程式碼內(本檔自己也含合成字串),排除。 */
const productSources: Record<string, string> = Object.fromEntries(
  Object.entries(allSources).filter(([path]) => !path.endsWith('.test.ts')),
);

/** 唯一允許產生網路錯誤碼的檔案:transport 邊界(前端鐵律 1)。 */
const ALLOWED_PRODUCER = './services/apiClient.ts';

/** `code` 屬性被指定為以引號 / 反引號包住的網路錯誤碼字串。 */
const NETWORK_CODE_ASSIGNMENT = /\bcode\s*:\s*(['"`])NETWORK_ERROR\1/g;

function hitCount(source: string): number {
  return source.match(NETWORK_CODE_ASSIGNMENT)?.length ?? 0;
}

function violations(sources: Record<string, string>): string[] {
  return Object.entries(sources)
    .filter(([path, source]) => path !== ALLOWED_PRODUCER && hitCount(source) > 0)
    .map(([path]) => path);
}

describe('網路錯誤碼唯一產生點守門(D-26 / FE-WR-01)', () => {
  it('掃描範圍非空:src 下非測試的 .ts / .vue 都讀得到原始碼', () => {
    const paths = Object.keys(productSources);
    expect(paths.length).toBeGreaterThan(50);
    for (const path of [ALLOWED_PRODUCER, './App.vue', './components/OrderTicket.vue']) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.endsWith('.test.ts'))).toBe(false);
  });

  it('偵測不空轉:services/apiClient.ts 自己至少命中一次', () => {
    expect(hitCount(productSources[ALLOWED_PRODUCER] ?? '')).toBeGreaterThanOrEqual(1);
  });

  it('services/apiClient.ts 是唯一允許產生網路錯誤碼的地方', () => {
    expect(violations(productSources)).toEqual([]);
  });

  it('偵測規則本身有效(避免守門永遠綠)', () => {
    expect(violations({ a: "return { code: 'NETWORK_ERROR', traceId: null };" })).toEqual(['a']);
    expect(
      violations({ b: `throw new ApiClientError({ status: 0, code: "NETWORK_ERROR", message: 'x' });` }),
    ).toEqual(['b']);
    expect(violations({ c: 'const e = { code : `NETWORK_ERROR` };' })).toEqual(['c']);

    expect(violations({ d: "  NETWORK_ERROR: 'tradeErrNetwork'," })).toEqual([]);
    expect(violations({ e: "if (error.code === 'NETWORK_ERROR') return true;" })).toEqual([]);
    expect(violations({ f: "return { code: 'UNKNOWN_ERROR', traceId: null };" })).toEqual([]);
    expect(violations({ [ALLOWED_PRODUCER]: "code: 'NETWORK_ERROR'," })).toEqual([]);
  });
});
