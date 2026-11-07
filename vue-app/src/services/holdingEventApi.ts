import { ApiClientError, apiRequest } from './apiClient';
import { toRaw } from 'vue';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { RuntimeDataMode } from './apiTypes';
import type { Trade } from '../types';

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

/** 契約值域:amount / withholdingTax ≤ 10^12、配股股數 ≤ 10^9、比例 1–1000、symbol ≤ 32 字、note ≤ 500 字。 */
const MAX_AMOUNT = 1_000_000_000_000;
const MAX_QUANTITY = 1_000_000_000;
const MAX_RATIO = 1000;
const MAX_SYMBOL_LENGTH = 32;
const MAX_NOTE_LENGTH = 500;
const MAX_KEY_LENGTH = 128;
/** 後端容許的時鐘誤差:晚於伺服器時間 5 分鐘以上才算「未來」。 */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type MockHoldingEventKind = 'CASH_DIVIDEND' | 'STOCK_DIVIDEND' | 'SPLIT';

/**
 * 本 session 由 mock 記錄的一筆事件,欄位名與 `PortfolioActivityDto` 一致(少 `price` / `fee`,
 * 兩者對股利與股數調整恆為 null),供 mock `listActivities` 與 Trades mock 模式合併。
 * `reversed` / `reversible` / `reversalOf*` 於讀取時即時計算,規則同後端契約:
 * 股利 = 非沖銷列且未被沖銷;股數調整 = 同上**且**為該標的最晚一筆未沖銷調整。
 */
export interface MockHoldingEvent {
  id: string;
  kind: MockHoldingEventKind;
  symbol: string;
  currency: string;
  /** 股利 = paidAt;股數調整 = 除權日起點(mock 以 `yyyy-MM-ddT00:00:00Z` 表示,與 mock 交易同慣例)。 */
  occurredAt: string;
  effectiveDate: string | null;
  createdAt: string;
  /** 配股股數 / 拆股 ΔQ(帶號);股利為 null。 */
  quantity: number | null;
  /** 股利實領;股數調整為 null。 */
  amount: number | null;
  withholdingTax: number | null;
  ratioNew: number | null;
  ratioOld: number | null;
  note: string | null;
  reversalOfId: string | null;
  reversalOfOccurredAt: string | null;
  reversalOfEffectiveDate: string | null;
  reversed: boolean;
  reversible: boolean;
}

/** 儲存在 mock 的原始紀錄;`reversed` 在讀取時即時計算(與 cashApi mock 同一做法)。 */
type StoredDividend = Omit<DividendDto, 'reversed'>;
type StoredAdjustment = Omit<ShareAdjustmentDto, 'reversed'>;

/** 冪等紀錄:比對維度同後端(不含 note;股利的 paidAt 只在請求有送時比對)。 */
interface DividendKeyRecord {
  id: string;
  symbol: string;
  amount: number;
  withholdingTax: number;
  paidAt: string | null;
  reversalOfId: string | null;
}

interface AdjustmentKeyRecord {
  id: string;
  symbol: string;
  type: ShareAdjustmentType;
  quantity: number | null;
  ratioNew: number | null;
  ratioOld: number | null;
  effectiveDate: string;
  reversalOfId: string | null;
}

/** 依建立順序保存;兩張表分開,冪等鍵空間也分開(後端是兩張表各自的唯一約束)。 */
let mockDividends: StoredDividend[] = [];
let mockAdjustments: StoredAdjustment[] = [];
let dividendKeys = new Map<string, DividendKeyRecord>();
let adjustmentKeys = new Map<string, AdjustmentKeyRecord>();
/** 依建立順序記錄兩表事件的交錯次序,讓 `listMockHoldingEvents()` 回傳穩定順序。 */
let creationOrder: Array<{ table: 'dividend' | 'adjustment'; id: string }> = [];
/**
 * 由本 mock 寫進 mock 交易列的 DIV 列(原始物件)。mock `listActivities` 以此排除重複 ——
 * 同一筆股利已由事件本身代表,不能再以「靜態 DIV 列」出現一次。
 */
let eventTradeRows = new WeakSet<object>();

export function resetMockHoldingEventsForTests(): void {
  mockDividends = [];
  mockAdjustments = [];
  dividendKeys = new Map();
  adjustmentKeys = new Map();
  creationOrder = [];
  eventTradeRows = new WeakSet();
}

/** 這一列 mock 交易是否由 mock 股利寫入(呼叫端傳 store 回傳的 reactive 列也可以)。 */
export function isMockHoldingEventTradeRow(trade: Trade): boolean {
  return eventTradeRows.has(toRaw(trade));
}

function isDividendReversed(id: string): boolean {
  return mockDividends.some(candidate => candidate.reversalOfId === id);
}

function isAdjustmentReversed(id: string): boolean {
  return mockAdjustments.some(candidate => candidate.reversalOfId === id);
}

/** 該標的最晚一筆「未被沖銷且非沖銷列」的調整;依建立順序取最後一筆(新調整的除權日不得早於它,故兩者同序)。 */
function latestActiveAdjustment(symbol: string): StoredAdjustment | undefined {
  const active = mockAdjustments.filter(candidate => candidate.symbol === symbol
    && candidate.reversalOfId === null
    && !isAdjustmentReversed(candidate.id));
  return active[active.length - 1];
}

function dividendToDto(entry: StoredDividend): DividendDto {
  return { ...entry, reversed: isDividendReversed(entry.id) };
}

function adjustmentToDto(entry: StoredAdjustment): ShareAdjustmentDto {
  return { ...entry, reversed: isAdjustmentReversed(entry.id) };
}

function dividendToEvent(entry: StoredDividend): MockHoldingEvent {
  const reversed = isDividendReversed(entry.id);
  const original = entry.reversalOfId === null
    ? undefined
    : mockDividends.find(candidate => candidate.id === entry.reversalOfId);
  return {
    id: entry.id,
    kind: 'CASH_DIVIDEND',
    symbol: entry.symbol,
    currency: entry.currency,
    occurredAt: entry.paidAt,
    effectiveDate: null,
    createdAt: entry.createdAt,
    quantity: null,
    amount: entry.amount,
    withholdingTax: entry.withholdingTax,
    ratioNew: null,
    ratioOld: null,
    note: entry.note,
    reversalOfId: entry.reversalOfId,
    reversalOfOccurredAt: original?.paidAt ?? null,
    reversalOfEffectiveDate: null,
    reversed,
    reversible: entry.reversalOfId === null && !reversed,
  };
}

function adjustmentToEvent(entry: StoredAdjustment): MockHoldingEvent {
  const reversed = isAdjustmentReversed(entry.id);
  const original = entry.reversalOfId === null
    ? undefined
    : mockAdjustments.find(candidate => candidate.id === entry.reversalOfId);
  return {
    id: entry.id,
    kind: entry.type,
    symbol: entry.symbol,
    currency: entry.currency,
    occurredAt: effectiveInstant(entry.effectiveDate),
    effectiveDate: entry.effectiveDate,
    createdAt: entry.createdAt,
    quantity: entry.quantityDelta,
    amount: null,
    withholdingTax: null,
    ratioNew: entry.ratioNew,
    ratioOld: entry.ratioOld,
    note: entry.note,
    reversalOfId: entry.reversalOfId,
    reversalOfOccurredAt: original ? effectiveInstant(original.effectiveDate) : null,
    reversalOfEffectiveDate: original?.effectiveDate ?? null,
    reversed,
    reversible: entry.reversalOfId === null && !reversed && latestActiveAdjustment(entry.symbol)?.id === entry.id,
  };
}

/**
 * 本 session 由 mock 記錄的事件(依建立順序),供 mock `listActivities` 與 Trades mock 模式合併。
 * 回傳 clone:呼叫端修改不會回灌 mock 狀態。
 */
export function listMockHoldingEvents(): MockHoldingEvent[] {
  return creationOrder.map(({ table, id }) => (table === 'dividend'
    ? dividendToEvent(mockDividends.find(candidate => candidate.id === id)!)
    : adjustmentToEvent(mockAdjustments.find(candidate => candidate.id === id)!)));
}

function validationFailed(fields: Record<string, string>): ApiClientError {
  return new ApiClientError({ status: 400, code: 'VALIDATION_FAILED', message: 'Validation failed', fields });
}

function conflict(code: string, message: string): ApiClientError {
  return new ApiClientError({ status: 409, code, message });
}

function todayLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function effectiveInstant(effectiveDate: string): string {
  return `${effectiveDate}T00:00:00Z`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** scale 8、HALF_UP(後端 `BigDecimal.setScale(8, HALF_UP)`;mock 只處理正值)。 */
function roundHalfUp8(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/** scale 8、DOWN(拆股新股數;小 epsilon 吸收 double 乘法誤差,避免 3.9999999999 被截成 3.99999999)。 */
function roundDown8(value: number): number {
  return Math.floor(value * 1e8 + 1e-6) / 1e8;
}

function isKnownSymbol(symbol: string): boolean {
  const store = useMockPortfolioStore();
  return store.allSymbols.some(candidate => candidate.sym === symbol)
    || store.positions.some(position => position.sym === symbol);
}

function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

function commonFieldErrors(idempotencyKey: string, symbol: string, note: string | null | undefined): Record<string, string> {
  const fields: Record<string, string> = {};
  if (idempotencyKey.trim() === '' || idempotencyKey.length > MAX_KEY_LENGTH) fields['Idempotency-Key'] = 'invalid';
  if (typeof symbol !== 'string' || symbol.trim() === '' || symbol.length > MAX_SYMBOL_LENGTH) fields.symbol = 'invalid';
  if (note != null && note.length > MAX_NOTE_LENGTH) fields.note = 'size must be at most 500';
  return fields;
}

function assertKnownSymbol(symbol: string): void {
  if (!isKnownSymbol(symbol)) {
    throw new ApiClientError({ status: 404, code: 'ASSET_NOT_FOUND', message: 'Asset not found', fields: { symbol: 'not found' } });
  }
}

/**
 * 「股數變、總成本不變」:新均價 = 舊股數 × 舊均價 / 新股數(scale 8 HALF_UP)。
 * 直接改 mock store 的 `positions`(本 plan 不新增 store action,`stores/mockPortfolio.ts` 由 04.2-17 擁有)。
 */
function applyQuantityDelta(symbol: string, delta: number): void {
  const store = useMockPortfolioStore();
  const index = store.positions.findIndex(position => position.sym === symbol);
  const position = store.positions[index];
  const newQty = roundHalfUp8(position.qty + delta);
  store.positions[index] = { ...position, qty: newQty, avg: roundHalfUp8((position.qty * position.avg) / newQty) };
}

function currentQuantity(symbol: string): number {
  return useMockPortfolioStore().positions.find(position => position.sym === symbol)?.qty ?? 0;
}

function insufficientHolding(): ApiClientError {
  return conflict('TRADE_INSUFFICIENT_HOLDING', 'Insufficient holding');
}

/**
 * mock 實作:順序與錯誤碼對齊後端 `DividendService` / `ShareAdjustmentService`(04.2-02 凍結契約):
 * 欄位驗證 -> 標的查找 -> 原紀錄查找 -> 冪等快路徑 -> 沖銷規則 / 時序與持股規則 -> 寫入。
 * 冪等排在「已沖銷」之前,成功沖銷的重送才會回同一筆(與 cashApi mock 同理)。
 *
 * ⚠️ mock 簡化:mock 交易沒有可靠的時間序,所以**不模擬「除權日起點持股 Q_asOf」的歷史回溯**,
 * 拆股以**目前持股**計算 ΔQ、持股檢查也只看目前持倉。真實規則(Q_asOf 由交易與既有調整推得)在後端。
 */
export function createMockHoldingEventApi(): HoldingEventApi {
  return {
    mode: 'mock',
    async createDividend(request, idempotencyKey) {
      const withholdingTax = request.withholdingTax ?? 0;
      const fields = commonFieldErrors(idempotencyKey, request.symbol, request.note);
      if (!(request.amount >= 0.00000001 && request.amount <= MAX_AMOUNT)) fields.amount = 'out of range';
      if (!(withholdingTax >= 0 && withholdingTax <= MAX_AMOUNT)) fields.withholdingTax = 'out of range';
      if (request.paidAt != null) {
        const paidAt = Date.parse(request.paidAt);
        if (Number.isNaN(paidAt)) fields.paidAt = 'invalid format';
        else if (paidAt > Date.now() + FUTURE_TOLERANCE_MS) fields.paidAt = 'must not be in the future';
      }
      if (Object.keys(fields).length > 0) throw validationFailed(fields);
      assertKnownSymbol(request.symbol);

      const reversalOfId = request.reversalOfId ?? null;
      const original = reversalOfId === null
        ? undefined
        : mockDividends.find(candidate => candidate.id === reversalOfId);
      if (reversalOfId !== null && !original) {
        throw new ApiClientError({ status: 404, code: 'DIVIDEND_NOT_FOUND', message: 'Dividend not found' });
      }

      const known = dividendKeys.get(idempotencyKey);
      if (known) {
        const samePayload = known.symbol === request.symbol
          && known.amount === request.amount
          && known.withholdingTax === withholdingTax
          && known.reversalOfId === reversalOfId
          && (request.paidAt == null || (known.paidAt !== null && sameInstant(known.paidAt, request.paidAt)));
        if (!samePayload) {
          throw conflict('DIVIDEND_IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused with a different payload');
        }
        return structuredClone(dividendToDto(mockDividends.find(candidate => candidate.id === known.id)!));
      }

      if (original) {
        if (original.reversalOfId !== null) {
          throw conflict('DIVIDEND_NOT_REVERSIBLE', 'A reversal record cannot be reversed');
        }
        if (isDividendReversed(original.id)) {
          throw conflict('DIVIDEND_ALREADY_REVERSED', 'Dividend has already been reversed');
        }
        const mismatch: Record<string, string> = {};
        if (request.symbol !== original.symbol) mismatch.symbol = 'must mirror the original record';
        if (request.amount !== original.amount) mismatch.amount = 'must mirror the original record';
        if (withholdingTax !== original.withholdingTax) mismatch.withholdingTax = 'must mirror the original record';
        if (Object.keys(mismatch).length > 0) throw validationFailed(mismatch);
      }

      const now = new Date().toISOString();
      const entry: StoredDividend = {
        id: crypto.randomUUID(),
        symbol: request.symbol,
        currency: MOCK_CURRENCY,
        amount: request.amount,
        withholdingTax,
        paidAt: request.paidAt ?? now,
        createdAt: now,
        note: request.note ?? null,
        reversalOfId,
      };
      mockDividends.push(entry);
      creationOrder.push({ table: 'dividend', id: entry.id });
      dividendKeys.set(idempotencyKey, {
        id: entry.id,
        symbol: entry.symbol,
        amount: entry.amount,
        withholdingTax,
        paidAt: request.paidAt ?? null,
        reversalOfId,
      });
      // 可見效果(鐵律 6):mock 交易頭部多一列 DIV。mock `Trade` 沒有「總額」欄位,
      // 總額 = qty × px,所以以 qty 1、px = 實領金額表示;沖銷列 px 取負值,讓股利淨額歸零。
      const row: Trade = {
        d: (request.paidAt ?? todayLocal()).slice(0, 10),
        type: 'DIV',
        sym: request.symbol,
        qty: 1,
        px: reversalOfId === null ? request.amount : -request.amount,
        fee: 0,
        note: request.note ?? '',
      };
      eventTradeRows.add(row);
      useMockPortfolioStore().trades.unshift(row);
      return structuredClone(dividendToDto(entry));
    },

    async createShareAdjustment(request, idempotencyKey) {
      const isSplit = request.type === 'SPLIT';
      const quantity = request.quantity ?? null;
      const ratioNew = request.ratioNew ?? null;
      const ratioOld = request.ratioOld ?? null;
      const fields = commonFieldErrors(idempotencyKey, request.symbol, request.note);
      if (request.type !== 'STOCK_DIVIDEND' && request.type !== 'SPLIT') fields.type = 'invalid type';
      if (request.type === 'STOCK_DIVIDEND' && !(quantity !== null && quantity >= 0.00000001 && quantity <= MAX_QUANTITY)) {
        fields.quantity = 'out of range';
      }
      if (isSplit) {
        const validRatio = (value: number | null) => value !== null && Number.isInteger(value) && value >= 1 && value <= MAX_RATIO;
        if (!validRatio(ratioNew)) fields.ratioNew = 'out of range';
        if (!validRatio(ratioOld)) fields.ratioOld = 'out of range';
        if (validRatio(ratioNew) && validRatio(ratioOld) && ratioNew === ratioOld) fields.ratio = 'ratioNew must differ from ratioOld';
      }
      if (typeof request.effectiveDate !== 'string' || !isValidDate(request.effectiveDate)) {
        fields.effectiveDate = 'invalid format';
      } else if (request.effectiveDate > todayLocal()) {
        fields.effectiveDate = 'must not be in the future';
      }
      if (Object.keys(fields).length > 0) throw validationFailed(fields);
      assertKnownSymbol(request.symbol);

      const reversalOfId = request.reversalOfId ?? null;
      const original = reversalOfId === null
        ? undefined
        : mockAdjustments.find(candidate => candidate.id === reversalOfId);
      if (reversalOfId !== null && !original) {
        throw new ApiClientError({ status: 404, code: 'SHARE_ADJUSTMENT_NOT_FOUND', message: 'Share adjustment not found' });
      }

      // 冪等維度:配股比 quantity、拆股比 ratioNew + ratioOld;不含 note 與後端算出的 quantityDelta。
      const known = adjustmentKeys.get(idempotencyKey);
      if (known) {
        const samePayload = known.symbol === request.symbol
          && known.type === request.type
          && (isSplit
            ? known.ratioNew === ratioNew && known.ratioOld === ratioOld
            : known.quantity === quantity)
          && known.effectiveDate === request.effectiveDate
          && known.reversalOfId === reversalOfId;
        if (!samePayload) {
          throw conflict('SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED', 'Idempotency key was reused with a different payload');
        }
        return structuredClone(adjustmentToDto(mockAdjustments.find(candidate => candidate.id === known.id)!));
      }

      let quantityDelta: number;
      if (original) {
        if (isAdjustmentReversed(original.id)) {
          throw conflict('SHARE_ADJUSTMENT_ALREADY_REVERSED', 'Share adjustment has already been reversed');
        }
        // 只能沖銷該標的最晚一筆未沖銷調整;沖銷列本身不在「未沖銷且非沖銷列」集合內,同樣落在這條。
        if (original.reversalOfId !== null || latestActiveAdjustment(original.symbol)?.id !== original.id) {
          throw conflict('SHARE_ADJUSTMENT_NOT_REVERSIBLE', 'Only the latest active share adjustment can be reversed');
        }
        const mismatch: Record<string, string> = {};
        if (request.symbol !== original.symbol) mismatch.symbol = 'must mirror the original record';
        if (request.type !== original.type) mismatch.type = 'must mirror the original record';
        if (original.type === 'SPLIT') {
          if (ratioNew !== original.ratioNew) mismatch.ratioNew = 'must mirror the original record';
          if (ratioOld !== original.ratioOld) mismatch.ratioOld = 'must mirror the original record';
        } else if (quantity !== original.quantityDelta) {
          mismatch.quantity = 'must mirror the original record';
        }
        if (request.effectiveDate !== original.effectiveDate) mismatch.effectiveDate = 'must mirror the original record';
        if (Object.keys(mismatch).length > 0) throw validationFailed(mismatch);
        // 沖銷撤銷已記錄的 ΔQ、不重算比例;撤銷後持股 <= 0 一樣拒絕。
        if (currentQuantity(original.symbol) <= 0 || roundHalfUp8(currentQuantity(original.symbol) - original.quantityDelta) <= 0) {
          throw insufficientHolding();
        }
        quantityDelta = original.quantityDelta;
        applyQuantityDelta(original.symbol, -quantityDelta);
      } else {
        const latest = latestActiveAdjustment(request.symbol);
        if (latest && request.effectiveDate < latest.effectiveDate) {
          throw validationFailed({ effectiveDate: 'must not be earlier than the latest share adjustment' });
        }
        // mock 簡化:以目前持股代替除權日起點持股 Q_asOf(見函式說明)。
        const held = currentQuantity(request.symbol);
        if (held <= 0) throw insufficientHolding();
        quantityDelta = isSplit
          ? roundHalfUp8(roundDown8((held * ratioNew!) / ratioOld!) - held)
          : quantity!;
        if (roundHalfUp8(held + quantityDelta) <= 0) throw insufficientHolding();
        applyQuantityDelta(request.symbol, quantityDelta);
      }

      const entry: StoredAdjustment = {
        id: crypto.randomUUID(),
        symbol: request.symbol,
        currency: MOCK_CURRENCY,
        type: request.type,
        quantityDelta,
        ratioNew: isSplit ? ratioNew : null,
        ratioOld: isSplit ? ratioOld : null,
        effectiveDate: request.effectiveDate,
        createdAt: new Date().toISOString(),
        note: request.note ?? null,
        reversalOfId,
      };
      mockAdjustments.push(entry);
      creationOrder.push({ table: 'adjustment', id: entry.id });
      adjustmentKeys.set(idempotencyKey, {
        id: entry.id,
        symbol: entry.symbol,
        type: entry.type,
        quantity,
        ratioNew,
        ratioOld,
        effectiveDate: entry.effectiveDate,
        reversalOfId,
      });
      return structuredClone(adjustmentToDto(entry));
    },
  };
}

export function createHoldingEventApi(mode: RuntimeDataMode, basePath = '/api/v1'): HoldingEventApi {
  return mode === 'api' ? createHttpHoldingEventApi(basePath) : createMockHoldingEventApi();
}
