import { ApiClientError } from './services/apiClient';
import type { SessionMessage } from './services/authSession';

/** 非 Error 的拋出值沒有可用訊息時的預設字串(SessionBanner 不渲染 message 本文,只供除錯)。 */
const DEFAULT_STARTUP_ERROR_MESSAGE = 'Unexpected startup error';

/**
 * App 啟動(`auth.csrf()` + `authSession.restore()`)失敗 → SessionBanner 顯示用的 SessionMessage。
 *
 * <p>ApiClientError 原樣投影 code / message / status / requestId;網路失敗也在這一支,因為網路錯誤碼
 * 只由 `apiClient.transportFetch` 合成(D-26)。其他例外只可能是 mapper / 程式錯誤,標成
 * `UNKNOWN_ERROR`(status 0、requestId null),不再冒充網路問題(FE-WR-01)。</p>
 *
 * <p>為什麼從 App.vue 抽出:成為純函式後可以直接單元測試(`startupErrorMessage.test.ts`),
 * App.vue 的 restoreSession 只負責呼叫。</p>
 *
 * @param error restoreSession catch 到的任何值
 * @returns SessionBanner 使用的 SessionMessage
 */
export function messageFromStartupError(error: unknown): SessionMessage {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      requestId: error.requestId,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : DEFAULT_STARTUP_ERROR_MESSAGE,
    status: 0,
    requestId: null,
  };
}
