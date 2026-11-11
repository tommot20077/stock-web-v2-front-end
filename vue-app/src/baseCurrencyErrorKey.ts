import { ApiClientError } from './services/apiClient';

/**
 * 基準幣儲存失敗的文案分派(UI-SPEC 基準幣錯誤表;quick-261106-fbs 由 Overview `currencyErrorKey` 與
 * Settings `saveErrorKey` 抽出共用,04.1 IN-02)。
 *
 * 401 回傳 null:交給全域 SessionBanner,呼叫端不重複顯示。只看 code / status / fields 的 key,
 * 後端 message 與 fields 的 value 一律不入 DOM。
 */
export function baseCurrencyErrorKey(error: unknown): string | null {
  // D-26:fetch reject 已在 apiClient 的 transportFetch 正規化為 ApiClientError(NETWORK_ERROR);
  // 非 ApiClientError 的分支保留為防禦(非 apiClient 路徑丟出的例外)。
  if (!(error instanceof ApiClientError) || error.code === 'NETWORK_ERROR') return 'baseCurrencyErrNetwork';
  if (error.status === 401) return null;
  if (error.code === 'VALIDATION_FAILED' && error.fields && 'baseCurrency' in error.fields) {
    return 'baseCurrencyErrUnsupported';
  }
  if (error.code === 'AUTH_CSRF_TOKEN_INVALID' || error.code === 'AUTH_CSRF_TOKEN_MISSING') {
    return 'baseCurrencyErrCsrf';
  }
  if (error.status === 403) return 'baseCurrencyErrForbidden';
  return 'baseCurrencyErrUnknown';
}
