import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import type { PaginatedResponse, RuntimeDataMode } from './apiTypes';

/** 後端 `CashEntryType`;沖銷是「方向相反」的另一筆,所以只有這兩種。 */
export type CashEntryType = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * `POST /api/v1/portfolio/cash-entries` 的 request body;逐欄對應後端 `CreateCashEntryRequest`
 * (04.1-04 / 04.1-06 凍結契約),**勿增刪欄位**(信封/契約權威是後端,judgment §4)。
 *
 * 型別定義在本檔而非 `apiTypes.ts`,與 `tradingApi.ts` 定義 `CreateTradeRequest` 同理。
 *
 * 這是「記帳」不是「轉帳」:後端只在帳本多一筆 append-only 分錄,不會動到任何銀行或券商帳戶。
 */
export interface CreateCashEntryRequest {
  type: CashEntryType;
  /** ISO 4217 代碼;後端 `CurrencyCode` 支援的集合。 */
  currency: string;
  /** 必須大於 0;方向由 `type` 決定,不用負數表示出金。 */
  amount: number;
  note?: string | null;
  /** ISO-8601 含 offset;省略時由後端帶 now()。補記較早的入金請明確送出。 */
  occurredAt?: string | null;
  /** 沖銷時指向原分錄 id;一般入出金為 null。 */
  reversalOfId?: string | null;
}

/**
 * 後端 `CashEntryDto`,逐欄同形。
 *
 * `reversed` / `reversalOfId` / `reversalOfOccurredAt` 都來自後端,前端不自行推導
 * 「是否已沖銷」(UI-SPEC U-18)。
 */
export interface CashEntryDto {
  id: string;
  type: string;
  currency: string;
  amount: number;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  reversalOfId: string | null;
  reversalOfOccurredAt: string | null;
  reversed: boolean;
}

export interface CashEntryListParams {
  page?: number;
  size?: number;
}

/**
 * cash domain 的唯一消費介面。頁面與對話框永遠只經此介面(judgment §3:元件不 import mock store)。
 */
export interface CashApi {
  mode: RuntimeDataMode;
  /**
   * 記一筆入金 / 出金 / 沖銷。
   *
   * @param request 後端 `CreateCashEntryRequest` 的六個欄位,不多不少。
   * @param idempotencyKey **必填**。同一次送出嘗試的重試(自動或手動)必須沿用同一把 key;
   *        使用者改過任何欄位後才換新 key。**key 是參數不是 adapter 自產** —— 「哪一次算同一次嘗試」
   *        只有 UI 層知道,adapter 自產會讓每次重試都變成新分錄,冪等保護等於不存在。
   *        key 的隨機來源由呼叫端用 `crypto.randomUUID()`(CSPRNG)提供。
   * @throws ApiClientError 原樣上拋,不 catch 也不重包:UI 層靠 `code` 分派文案、靠 `fields` 綁欄位、
   *         靠 `requestId` 回報。
   */
  createEntry(request: CreateCashEntryRequest, idempotencyKey: string): Promise<CashEntryDto>;
  /** 依 `occurredAt DESC, id DESC` 分頁讀取入出金分錄。 */
  listEntries(params?: CashEntryListParams): Promise<PaginatedResponse<CashEntryDto>>;
}

export function createHttpCashApi(basePath = '/api/v1'): CashApi {
  return {
    mode: 'api',
    // 寫入形狀照 tradingApi.createTrade:CSRF header、cookie 憑證、401 單飛 refresh + 一次 replay
    // 全由 apiClient 處理;replay 使用同一份 options,所以同一把 key 自動沿用。
    createEntry: (request, idempotencyKey) => apiRequest<CashEntryDto>(`${basePath}/portfolio/cash-entries`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      // 逐欄投影而不是整包轉送:TypeScript 的 excess property check 只對物件字面量生效,
      // 呼叫端若把整包表單狀態當 CreateCashEntryRequest 傳進來(結構相容即通過型別檢查),
      // 多餘欄位會原封不動送到後端。逐欄投影是這個契約在執行期唯一真正的保證。
      // 可省略的欄位一律補成明確的 null,讓同一把 key 重試時 payload 逐位元穩定。
      json: {
        type: request.type,
        currency: request.currency,
        amount: request.amount,
        note: request.note ?? null,
        occurredAt: request.occurredAt ?? null,
        reversalOfId: request.reversalOfId ?? null,
      },
    }),
    listEntries: (params = {}) => apiPaginatedRequest<CashEntryDto>(
      `${basePath}/portfolio/cash-entries${buildQueryString({ page: params.page, size: params.size })}`,
    ),
  };
}

/** mock 帳本;模組內狀態,回傳前一律 structuredClone,外部修改不會回灌。 */
let mockEntries: CashEntryDto[] = [];

function byOccurredAtDesc(a: CashEntryDto, b: CashEntryDto): number {
  const diff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  if (diff !== 0) return diff;
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

export function resetMockCashLedgerForTests(): void {
  mockEntries = [];
}

export function createMockCashApi(): CashApi {
  return {
    mode: 'mock',
    async createEntry(request) {
      if (request.amount <= 0) {
        throw new ApiClientError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          fields: { amount: 'must be greater than 0' },
        });
      }
      const now = new Date().toISOString();
      const entry: CashEntryDto = {
        id: crypto.randomUUID(),
        type: request.type,
        currency: request.currency,
        amount: request.amount,
        note: request.note ?? null,
        occurredAt: request.occurredAt ?? now,
        createdAt: now,
        reversalOfId: request.reversalOfId ?? null,
        reversalOfOccurredAt: null,
        reversed: false,
      };
      mockEntries.push(entry);
      return structuredClone(entry);
    },
    async listEntries(params = {}) {
      const page = params.page ?? 0;
      const size = params.size ?? 10;
      const sorted = [...mockEntries].sort(byOccurredAtDesc);
      return structuredClone({
        items: sorted.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: sorted.length,
        totalPages: Math.ceil(sorted.length / size),
      });
    },
  };
}

export function createCashApi(mode: RuntimeDataMode, basePath = '/api/v1'): CashApi {
  return mode === 'api' ? createHttpCashApi(basePath) : createMockCashApi();
}
