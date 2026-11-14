import { describe, expect, it } from 'vitest';
import { baseCurrencyErrorKey } from './baseCurrencyErrorKey';
import { ApiClientError } from './services/apiClient';
import overviewSource from './pages/Overview.vue?raw';
import settingsSource from './pages/Settings.vue?raw';

// quick-261106-fbs 2e(04.1 IN-02):原 Overview `currencyErrorKey` 與 Settings `saveErrorKey` 的共用分派,逐案行為不變。

function apiError(status: number, code: string, fields: Record<string, string> | null = null): ApiClientError {
  return new ApiClientError({ status, code, message: 'backend said no', requestId: 'trace-x', fields });
}

describe('baseCurrencyErrorKey(T2.6)', () => {
  it('非 ApiClientError(mapper / 程式錯誤)→ baseCurrencyErrUnknown,不說成網路失敗(G-05-7 / FE-WR-01)', () => {
    // D-26 後網路錯誤碼只由 apiClient.transportFetch 產生;能走到這裡的非 ApiClientError 不是連線問題。
    expect(baseCurrencyErrorKey(new TypeError('Failed to fetch'))).toBe('baseCurrencyErrUnknown');
    expect(baseCurrencyErrorKey(new TypeError('x'))).toBe('baseCurrencyErrUnknown');
    expect(baseCurrencyErrorKey('boom')).toBe('baseCurrencyErrUnknown');
  });

  it('transport 正規化的 NETWORK_ERROR(D-26)→ baseCurrencyErrNetwork(唯一的網路文案來源)', () => {
    const networkError = new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
    expect(baseCurrencyErrorKey(networkError)).toBe('baseCurrencyErrNetwork');
  });

  it('INVALID_API_RESPONSE(伺服器已回應但內容不合契約)→ baseCurrencyErrUnknown', () => {
    expect(baseCurrencyErrorKey(apiError(200, 'INVALID_API_RESPONSE'))).toBe('baseCurrencyErrUnknown');
  });

  it('401 → null(交給全域 SessionBanner,不重複顯示)', () => {
    expect(baseCurrencyErrorKey(apiError(401, 'AUTH_TOKEN_EXPIRED'))).toBeNull();
  });

  it('VALIDATION_FAILED 且 fields 含 baseCurrency → baseCurrencyErrUnsupported', () => {
    expect(baseCurrencyErrorKey(apiError(400, 'VALIDATION_FAILED', { baseCurrency: 'x' }))).toBe('baseCurrencyErrUnsupported');
  });

  it('VALIDATION_FAILED 但 fields 不含 baseCurrency → 一般未知錯誤', () => {
    expect(baseCurrencyErrorKey(apiError(400, 'VALIDATION_FAILED', { other: 'x' }))).toBe('baseCurrencyErrUnknown');
    expect(baseCurrencyErrorKey(apiError(400, 'VALIDATION_FAILED'))).toBe('baseCurrencyErrUnknown');
  });

  it('CSRF 錯誤碼(INVALID / MISSING)優先於 403 → baseCurrencyErrCsrf', () => {
    expect(baseCurrencyErrorKey(apiError(403, 'AUTH_CSRF_TOKEN_INVALID'))).toBe('baseCurrencyErrCsrf');
    expect(baseCurrencyErrorKey(apiError(403, 'AUTH_CSRF_TOKEN_MISSING'))).toBe('baseCurrencyErrCsrf');
  });

  it('其他 403 → baseCurrencyErrForbidden;其餘 → baseCurrencyErrUnknown', () => {
    expect(baseCurrencyErrorKey(apiError(403, 'AUTH_FORBIDDEN'))).toBe('baseCurrencyErrForbidden');
    expect(baseCurrencyErrorKey(apiError(500, 'INTERNAL_ERROR'))).toBe('baseCurrencyErrUnknown');
    expect(baseCurrencyErrorKey(apiError(503, 'SERVICE_UNAVAILABLE'))).toBe('baseCurrencyErrUnknown');
  });

  it('Overview 與 Settings 改用共用分派,不再各自定義(IN-02)', () => {
    expect(overviewSource).toContain("from '../baseCurrencyErrorKey'");
    expect(overviewSource).not.toMatch(/function currencyErrorKey\(/);
    expect(settingsSource).toContain("from '../baseCurrencyErrorKey'");
    expect(settingsSource).not.toMatch(/function saveErrorKey\(/);
  });
});
