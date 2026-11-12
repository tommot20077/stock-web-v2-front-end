import { expect, type Page } from '@playwright/test';

/**
 * 真後端旅程的「前置資料」helper(Phase 04.2 旅程 J / W / watchlist-live)。
 *
 * 旅程要證明的是 UI 那一段;前置的買進 / 加入清單等步驟走 API 建立,讓每條測試只走自己要證明的畫面。
 * 寫入一律帶真 cookie + `X-XSRF-TOKEN`(與 apiClient 同一條 CSRF 規則,後端 BrowserCsrfFilter 驗),
 * 不攔截任何請求 —— 這裡不是 stub,是對真後端的呼叫。
 */

export interface ApiWriteOptions {
  /** 帶一把新的 Idempotency-Key(trades / dividends / share-adjustments 必填)。 */
  idempotent?: boolean;
}

async function csrfHeader(page: Page): Promise<Record<string, string>> {
  // GET /csrf 讓後端把 XSRF-TOKEN cookie 寫進 context 的 cookie jar(page.request 與瀏覽器共用)
  const res = await page.request.get('/api/v1/csrf');
  expect(res.ok(), `GET /api/v1/csrf 失敗:HTTP ${res.status()}`).toBeTruthy();
  const token = (await page.context().cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value;
  expect(token, 'XSRF-TOKEN cookie 不存在').toBeTruthy();
  return { 'X-XSRF-TOKEN': token as string };
}

/** 以真 cookie + CSRF 對後端寫入,回傳 `ApiResponse.data`;非 2xx 直接讓測試失敗並附後端回應。 */
export async function apiWrite<T = unknown>(
  page: Page,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
  options: ApiWriteOptions = {},
): Promise<T> {
  const headers = await csrfHeader(page);
  if (options.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await page.request.fetch(path, { method, data, headers });
  expect(res.ok(), `${method} ${path} 失敗:HTTP ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()).data as T;
}

/** GET 並回傳 `ApiResponse.data`。 */
export async function apiRead<T = unknown>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path);
  expect(res.ok(), `GET ${path} 失敗:HTTP ${res.status()}`).toBeTruthy();
  return (await res.json()).data as T;
}

/**
 * API 買進(已成交的手動紀錄,鐵律 5)。`daysAgo` 讓成交時間早於今天:
 * 股數調整的 `Q_asOf` 只計 `executed_at` 早於除權日起點的交易(trading-portfolio-contract〈生效時間與時序規則〉)。
 *
 * 後端契約 BigDecimal 一律字串(Phase 5 D-05,trading-portfolio-contract〈序列化格式〉);請求端 Jackson 仍接受
 * number,但那只是相容行為,helper 依契約送字串:`quantity` / `price` 原樣送出、`fee` 送 `"0"`。
 */
export async function apiBuy(page: Page, symbol: string, quantity: string, price: string, daysAgo = 7): Promise<void> {
  await apiWrite(page, 'POST', '/api/v1/trades', {
    symbol,
    type: 'BUY',
    quantity,
    price,
    fee: '0',
    note: null,
    executedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  }, { idempotent: true });
}

/**
 * 後端 BigDecimal 欄位(JSON 字串、保留 scale,例 `"1050.00000000"`;Phase 5 D-05)→ number,**只供測試斷言比較數值**。
 *
 * 先斷言 wire 型別確實是字串(契約退回 number 時要在這裡紅),再轉 number 比大小 / 正負 / 近似值。
 * scale 不確定的值(換算、攤薄後的計算結果)用它比數值,不要以字串逐字比較;也不要用 number 累加後比相等。
 */
export function decimalValue(wire: unknown, label = 'BigDecimal 欄位'): number {
  expect(typeof wire, `${label} 應為 JSON 字串(D-05),實際為 ${typeof wire}:${String(wire)}`).toBe('string');
  const value = Number(wire);
  expect(Number.isFinite(value), `${label} 不是合法十進位字串:${String(wire)}`).toBe(true);
  return value;
}

/** 本機日期 `YYYY-MM-DD`(`offsetDays` 可往前推;date input 的值格式)。 */
export function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface WatchlistItem {
  uuid: string;
  symbol: string;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

/** 讀全部清單(首次 GET 由後端建立預設「我的自選」,D-17)。 */
export async function listWatchlists(page: Page): Promise<Watchlist[]> {
  return apiRead<Watchlist[]>(page, '/api/v1/watchlists');
}

/** 把代號加入指定清單(body 帶 symbol;FX 代號含 `/`,絕不放進路徑)。 */
export async function addWatchlistItem(page: Page, listId: string, symbol: string): Promise<Watchlist> {
  return apiWrite<Watchlist>(page, 'POST', `/api/v1/watchlists/${encodeURIComponent(listId)}/items`, { symbol });
}
