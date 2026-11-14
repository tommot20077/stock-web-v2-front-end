import { describe, expect, it } from 'vitest';
import { ApiClientError } from './services/apiClient';
import { messageFromStartupError } from './startupErrorMessage';

// 05-31 FE-WR-01 / D-26:App 啟動(csrf + restore)失敗 → SessionBanner 的 SessionMessage。
describe('messageFromStartupError', () => {
  it('ApiClientError → code / message / status / requestId 原樣投影', () => {
    const error = new ApiClientError({
      status: 503,
      code: 'AUTH_REDIS_UNAVAILABLE',
      message: 'm',
      requestId: 'trace-r',
    });

    expect(messageFromStartupError(error)).toEqual({
      code: 'AUTH_REDIS_UNAVAILABLE',
      message: 'm',
      status: 503,
      requestId: 'trace-r',
    });
  });

  it('transportFetch 產生的網路錯誤 ApiClientError → 原樣投影(仍是網路錯誤碼)', () => {
    const error = new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });

    expect(messageFromStartupError(error)).toEqual({
      code: 'NETWORK_ERROR',
      message: 'Network error',
      status: 0,
      requestId: null,
    });
  });

  it('非 ApiClientError 的 Error(mapper / 程式錯誤)→ UNKNOWN_ERROR、status 0、requestId null', () => {
    expect(messageFromStartupError(new TypeError('mapper'))).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'mapper',
      status: 0,
      requestId: null,
    });
  });

  it('非 Error 的拋出值 → UNKNOWN_ERROR 與靜態預設訊息', () => {
    const message = messageFromStartupError('boom');

    expect(message.code).toBe('UNKNOWN_ERROR');
    expect(message.message).toBe('Unexpected startup error');
    expect(message.status).toBe(0);
    expect(message.requestId).toBeNull();
  });
});
