import { ApiClientError } from './apiClient';
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

function notImplemented(): never {
  throw new ApiClientError({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Not implemented' });
}

export function createHttpHoldingEventApi(_basePath = '/api/v1'): HoldingEventApi {
  return {
    mode: 'api',
    createDividend: async () => notImplemented(),
    createShareAdjustment: async () => notImplemented(),
  };
}

export function createMockHoldingEventApi(): HoldingEventApi {
  return {
    mode: 'mock',
    createDividend: async () => notImplemented(),
    createShareAdjustment: async () => notImplemented(),
  };
}

export function resetMockHoldingEventsForTests(): void {}

export function createHoldingEventApi(mode: RuntimeDataMode, basePath = '/api/v1'): HoldingEventApi {
  return mode === 'api' ? createHttpHoldingEventApi(basePath) : createMockHoldingEventApi();
}
