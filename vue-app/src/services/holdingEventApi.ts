import { ApiClientError, apiRequest } from './apiClient';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { RuntimeDataMode } from './apiTypes';

/**
 * `POST /api/v1/portfolio/dividends` 的 request body;逐欄對應後端 `CreateDividendRequest`
 * (04.2-02 凍結契約,`ai-docs/trading-portfolio-contract.md` 〔04.2〕節),**勿增刪欄位**。
 *
 * 型別定義在本檔而非 `apiTypes.ts`,與 `cashApi.ts` 定義 `CreateCashEntryRequest` 同理。
 */
export interface CreateDividendRequest {
  symbol: string;
  /** **實領總額**(扣稅後、標的幣別);必須大於 0。 */
  amount: number;
  /** 預扣稅(標的幣別),≥ 0;省略視為 0。 */
  withholdingTax?: number | null;
  /** ISO-8601 含 offset;省略時由後端帶 now()。 */
  paidAt?: string | null;
  note?: string | null;
  /** 沖銷時指向原紀錄 id;一般股利為 null。 */
  reversalOfId?: string | null;
}

/** 後端 `DividendDto`,逐欄同形。 */
export interface DividendDto {
  id: string;
  symbol: string;
  /** 標的交易幣別(`amount` / `withholdingTax` 的幣別)。 */
  currency: string;
  /** 恆為正(沖銷列亦同,以 `reversalOfId` 判斷)。 */
  amount: number;
  withholdingTax: number;
  paidAt: string;
  createdAt: string;
  note: string | null;
  reversalOfId: string | null;
  reversed: boolean;
}

/** 後端 `ShareAdjustmentType`:配股或拆股 / 合股。 */
export type ShareAdjustmentType = 'STOCK_DIVIDEND' | 'SPLIT';

/**
 * `POST /api/v1/portfolio/share-adjustments` 的 request body;逐欄對應後端
 * `CreateShareAdjustmentRequest`(04.2-02 凍結契約),**勿增刪欄位**。
 */
export interface CreateShareAdjustmentRequest {
  symbol: string;
  type: ShareAdjustmentType;
  /** `STOCK_DIVIDEND` 必填:實領股數。 */
  quantity?: number | null;
  /** `SPLIT` 必填:比例 new:old(1 拆 4 = 4:1;10 合 1 = 1:10)。 */
  ratioNew?: number | null;
  ratioOld?: number | null;
  /** 除權日 `yyyy-MM-dd`(該標的市場的日曆日)。 */
  effectiveDate: string;
  note?: string | null;
  reversalOfId?: string | null;
}

/** 後端 `ShareAdjustmentDto`,逐欄同形。 */
export interface ShareAdjustmentDto {
  id: string;
  symbol: string;
  currency: string;
  type: ShareAdjustmentType;
  /** 後端算出的股數變動,**帶號**(合股為負);沖銷列輸出原值。 */
  quantityDelta: number;
  ratioNew: number | null;
  ratioOld: number | null;
  effectiveDate: string;
  createdAt: string;
  note: string | null;
  reversalOfId: string | null;
  reversed: boolean;
}

/**
 * 股利與股數調整的唯一消費介面。對話框永遠只經此介面(judgment §3:元件不 import mock store)。
 */
export interface HoldingEventApi {
  mode: RuntimeDataMode;
  createDividend(request: CreateDividendRequest, idempotencyKey: string): Promise<DividendDto>;
  createShareAdjustment(request: CreateShareAdjustmentRequest, idempotencyKey: string): Promise<ShareAdjustmentDto>;
}

/**
 * 寫入形狀照 `cashApi.createEntry`:CSRF header、cookie 憑證、401 單飛 refresh + 一次 replay
 * 全由 apiClient 處理;replay 使用同一份 options,所以同一把 key 自動沿用。
 *
 * body 逐欄投影而不是整包轉送(T-04.2-37):TypeScript 的 excess property check 只對物件字面量生效,
 * 呼叫端若把整包表單狀態傳進來,多餘欄位會原封不動送到後端。可省略的欄位一律補成明確的 null,
 * 讓同一把 key 重試時 payload 逐位元穩定。
 *
 * key 是參數不是 adapter 自產 ——「哪一次算同一次嘗試」只有 UI 層知道。
 */
export function createHttpHoldingEventApi(basePath = '/api/v1'): HoldingEventApi {
  return {
    mode: 'api',
    createDividend: (request, idempotencyKey) => apiRequest<DividendDto>(`${basePath}/portfolio/dividends`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      json: {
        symbol: request.symbol,
        amount: request.amount,
        withholdingTax: request.withholdingTax ?? null,
        paidAt: request.paidAt ?? null,
        note: request.note ?? null,
        reversalOfId: request.reversalOfId ?? null,
      },
    }),
    createShareAdjustment: (request, idempotencyKey) => apiRequest<ShareAdjustmentDto>(
      `${basePath}/portfolio/share-adjustments`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: {
          symbol: request.symbol,
          type: request.type,
          quantity: request.quantity ?? null,
          ratioNew: request.ratioNew ?? null,
          ratioOld: request.ratioOld ?? null,
          effectiveDate: request.effectiveDate,
          note: request.note ?? null,
          reversalOfId: request.reversalOfId ?? null,
        },
      },
    ),
  };
}

/**
 * mock 宇宙(data.ts)是美股報價,mock 持倉幣別一律 USD(與 `portfolioApi.ts` 的 `MOCK_CURRENCY` 同義)。
 */
const MOCK_CURRENCY = 'USD';

let mockDividends: DividendDto[] = [];

export function resetMockHoldingEventsForTests(): void {
  mockDividends = [];
}

function todayLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function createMockHoldingEventApi(): HoldingEventApi {
  return {
    mode: 'mock',
    async createDividend(request) {
      const now = new Date().toISOString();
      const dto: DividendDto = {
        id: crypto.randomUUID(),
        symbol: request.symbol,
        currency: MOCK_CURRENCY,
        amount: request.amount,
        withholdingTax: request.withholdingTax ?? 0,
        paidAt: request.paidAt ?? now,
        createdAt: now,
        note: request.note ?? null,
        reversalOfId: request.reversalOfId ?? null,
        reversed: false,
      };
      mockDividends.push(dto);
      useMockPortfolioStore().trades.unshift({
        d: (request.paidAt ?? todayLocal()).slice(0, 10),
        type: 'DIV',
        sym: request.symbol,
        qty: 1,
        px: request.amount,
        fee: 0,
        note: request.note ?? '',
      });
      return structuredClone(dto);
    },
    async createShareAdjustment() {
      throw new ApiClientError({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Not implemented' });
    },
  };
}

export function createHoldingEventApi(mode: RuntimeDataMode, basePath = '/api/v1'): HoldingEventApi {
  return mode === 'api' ? createHttpHoldingEventApi(basePath) : createMockHoldingEventApi();
}
