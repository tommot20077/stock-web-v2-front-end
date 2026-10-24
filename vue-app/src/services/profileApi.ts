import { ApiClientError, apiRequest } from './apiClient';
import type { RuntimeDataMode } from './apiTypes';

/**
 * Settings 基準幣下拉的選項,**顯示順序依 UI-SPEC**(新台幣優先)。
 *
 * 必須與後端 `CurrencyCode` 支援集合同步:後端不支援的代碼會回 400 `fields.baseCurrency`,
 * 前端多列一個只會讓使用者選到註定失敗的選項;少列則是少一個後端其實支援的選項。
 */
export const BASE_CURRENCY_OPTIONS = ['TWD', 'USD', 'EUR', 'JPY'] as const;

/** 使用者偏好;目前只有基準幣。刻意不含 email / role / 權限:那些屬於 session,不屬於本 adapter。 */
export interface ProfilePreferences {
  baseCurrency: string;
}

/**
 * profile domain 的唯一消費介面。
 *
 * 只讀 / 寫一個偏好欄位,**不碰 session 狀態**:`GET /me` 的回應有更多欄位,這裡只投影
 * `baseCurrency`;身分與權限仍由 `authApi` / `authSession` 負責(鐵律 2:token 不落 JS)。
 */
export interface ProfileApi {
  mode: RuntimeDataMode;
  getPreferences(): Promise<ProfilePreferences>;
  /**
   * 修改基準幣。PATCH 設定值天然冪等(網路失敗後再送一次是安全的),所以不需要 Idempotency-Key。
   *
   * @throws ApiClientError 原樣上拋;不支援的代碼為 400 `fields.baseCurrency`。
   */
  updateBaseCurrency(code: string): Promise<ProfilePreferences>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

/** 白名單投影:只取 `baseCurrency`;缺欄位或型別不對就明確失敗,不猜預設幣別。 */
function projectPreferences(payload: unknown): ProfilePreferences {
  if (!isRecord(payload) || typeof payload.baseCurrency !== 'string' || payload.baseCurrency === '') {
    throw new ApiClientError({
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a base currency',
    });
  }
  return { baseCurrency: payload.baseCurrency };
}

export function createHttpProfileApi(basePath = '/api/v1'): ProfileApi {
  return {
    mode: 'api',
    getPreferences: async () => projectPreferences(await apiRequest<unknown>(`${basePath}/me`)),
    updateBaseCurrency: async code => projectPreferences(await apiRequest<unknown>(`${basePath}/me/preferences`, {
      method: 'PATCH',
      json: { baseCurrency: code },
    })),
  };
}

/** mock 模組內狀態:選了會保留(換頁再回來仍在),不是 no-op(鐵律 6)。 */
const MOCK_DEFAULT_BASE_CURRENCY = 'TWD';
let mockBaseCurrency: string = MOCK_DEFAULT_BASE_CURRENCY;

export function resetMockProfileForTests(): void {
  mockBaseCurrency = MOCK_DEFAULT_BASE_CURRENCY;
}

export function createMockProfileApi(): ProfileApi {
  return {
    mode: 'mock',
    async getPreferences() {
      return { baseCurrency: mockBaseCurrency };
    },
    async updateBaseCurrency(code) {
      // 與後端同形的失敗:不支援的代碼為 400 + fields.baseCurrency,UI 只有一條錯誤路徑。
      if (!(BASE_CURRENCY_OPTIONS as readonly string[]).includes(code)) {
        throw new ApiClientError({
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          fields: { baseCurrency: 'unsupported currency' },
        });
      }
      mockBaseCurrency = code;
      return { baseCurrency: mockBaseCurrency };
    },
  };
}

export function createProfileApi(mode: RuntimeDataMode, basePath = '/api/v1'): ProfileApi {
  return mode === 'api' ? createHttpProfileApi(basePath) : createMockProfileApi();
}
