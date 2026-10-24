import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import type { PaginatedResponse, RuntimeDataMode } from './apiTypes';
import { BASE_CURRENCY_OPTIONS } from './profileApi';

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

/** 儲存在 mock 帳本的原始分錄;`reversed` / `reversalOfOccurredAt` 在讀取時即時計算。 */
type StoredCashEntry = Omit<CashEntryDto, 'reversed' | 'reversalOfOccurredAt'>;

/** 已寫入分錄的冪等紀錄(key -> 當時的 payload 與結果 id)。 */
interface MockIdempotencyRecord {
  entryId: string;
  type: string;
  currency: string;
  amount: number;
  occurredAt: string | null;
  reversalOfId: string | null;
}

/**
 * 固定種子(U-26):一開頁就能看到四種列狀態 —— 一般入金、已沖銷的出金、沖銷紀錄本身。
 * id 與時間皆為固定字串、不用亂數,讓畫面與測試可重現。
 * 沖銷紀錄(`mock-cash-4`)指回出金(`mock-cash-3`),所以 `mock-cash-3` 讀取時 `reversed` 為 true。
 */
function seedEntries(): StoredCashEntry[] {
  return [
    {
      id: 'mock-cash-1', type: 'DEPOSIT', currency: 'TWD', amount: 500000, note: 'Initial deposit',
      occurredAt: '2026-10-01T09:00:00+08:00', createdAt: '2026-10-01T09:00:05+08:00', reversalOfId: null,
    },
    {
      id: 'mock-cash-2', type: 'DEPOSIT', currency: 'USD', amount: 20000, note: null,
      occurredAt: '2026-10-05T09:00:00+08:00', createdAt: '2026-10-05T09:00:05+08:00', reversalOfId: null,
    },
    {
      id: 'mock-cash-3', type: 'WITHDRAWAL', currency: 'USD', amount: 500, note: 'Recorded by mistake',
      occurredAt: '2026-10-10T10:00:00+08:00', createdAt: '2026-10-10T10:00:05+08:00', reversalOfId: null,
    },
    {
      id: 'mock-cash-4', type: 'DEPOSIT', currency: 'USD', amount: 500, note: null,
      occurredAt: '2026-10-12T10:00:00+08:00', createdAt: '2026-10-12T10:00:05+08:00', reversalOfId: 'mock-cash-3',
    },
  ];
}

/** mock 帳本;模組內狀態,回傳前一律 structuredClone,外部修改不會回灌。 */
let mockEntries: StoredCashEntry[] = seedEntries();
let mockIdempotency = new Map<string, MockIdempotencyRecord>();

export function resetMockCashLedgerForTests(): void {
  mockEntries = seedEntries();
  mockIdempotency = new Map();
}

function byOccurredAtDesc(a: StoredCashEntry, b: StoredCashEntry): number {
  const diff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  if (diff !== 0) return diff;
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

function toDto(entry: StoredCashEntry): CashEntryDto {
  const original = entry.reversalOfId === null
    ? undefined
    : mockEntries.find(candidate => candidate.id === entry.reversalOfId);
  return {
    ...entry,
    reversalOfOccurredAt: original?.occurredAt ?? null,
    reversed: mockEntries.some(candidate => candidate.reversalOfId === entry.id),
  };
}

function validationFailed(fields: Record<string, string>): ApiClientError {
  return new ApiClientError({ status: 400, code: 'VALIDATION_FAILED', message: 'Validation failed', fields });
}

function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

export function createMockCashApi(): CashApi {
  return {
    mode: 'mock',
    // 順序與錯誤碼對齊後端 `CashLedgerService#createEntry`:欄位驗證 -> 原分錄查找 ->
    // 冪等快路徑 -> 沖銷三規則 -> 寫入。冪等排在「已沖銷」之前,成功沖銷的重送才會回同一筆。
    async createEntry(request, idempotencyKey) {
      const fields: Record<string, string> = {};
      if (idempotencyKey.trim() === '') fields['Idempotency-Key'] = 'must not be blank';
      if (request.type !== 'DEPOSIT' && request.type !== 'WITHDRAWAL') fields.type = 'invalid type';
      if (!(BASE_CURRENCY_OPTIONS as readonly string[]).includes(request.currency)) {
        fields.currency = 'unsupported currency';
      }
      if (!(request.amount > 0)) fields.amount = 'must be greater than 0';
      if (Object.keys(fields).length > 0) throw validationFailed(fields);

      const reversalOfId = request.reversalOfId ?? null;
      const original = reversalOfId === null
        ? undefined
        : mockEntries.find(candidate => candidate.id === reversalOfId);
      if (reversalOfId !== null && !original) {
        throw new ApiClientError({ status: 404, code: 'CASH_ENTRY_NOT_FOUND', message: 'Cash entry not found' });
      }

      const known = mockIdempotency.get(idempotencyKey);
      if (known) {
        const samePayload = known.type === request.type
          && known.currency === request.currency
          && known.amount === request.amount
          && known.reversalOfId === reversalOfId
          && (request.occurredAt == null || (known.occurredAt !== null && sameInstant(known.occurredAt, request.occurredAt)));
        if (!samePayload) {
          throw new ApiClientError({
            status: 409,
            code: 'CASH_IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was reused with a different payload',
          });
        }
        return structuredClone(toDto(mockEntries.find(candidate => candidate.id === known.entryId)!));
      }

      if (original) {
        if (original.reversalOfId !== null) {
          throw new ApiClientError({
            status: 409,
            code: 'CASH_ENTRY_NOT_REVERSIBLE',
            message: 'A reversal entry cannot be reversed',
          });
        }
        if (mockEntries.some(candidate => candidate.reversalOfId === original.id)) {
          throw new ApiClientError({
            status: 409,
            code: 'CASH_ENTRY_ALREADY_REVERSED',
            message: 'Cash entry has already been reversed',
          });
        }
        const oppositeType = original.type === 'DEPOSIT' ? 'WITHDRAWAL' : 'DEPOSIT';
        if (request.type !== oppositeType || request.currency !== original.currency || request.amount !== original.amount) {
          throw validationFailed({ reversalOfId: 'must mirror the original entry' });
        }
      }

      const now = new Date().toISOString();
      const entry: StoredCashEntry = {
        id: crypto.randomUUID(),
        type: request.type,
        currency: request.currency,
        amount: request.amount,
        note: request.note ?? null,
        occurredAt: request.occurredAt ?? now,
        createdAt: now,
        reversalOfId,
      };
      mockEntries.push(entry);
      mockIdempotency.set(idempotencyKey, {
        entryId: entry.id,
        type: entry.type,
        currency: entry.currency,
        amount: entry.amount,
        occurredAt: request.occurredAt ?? null,
        reversalOfId,
      });
      return structuredClone(toDto(entry));
    },
    async listEntries(params = {}) {
      const page = params.page ?? 0;
      const size = params.size ?? 10;
      const sorted = [...mockEntries].sort(byOccurredAtDesc);
      return structuredClone({
        items: sorted.slice(page * size, (page + 1) * size).map(toDto),
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
