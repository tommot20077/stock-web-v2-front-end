import { afterEach, describe, expect, it, vi } from 'vitest';
import SessionBanner from './SessionBanner.vue';
import { cleanupMounted, mountComponent } from '../testUtils';

afterEach(() => {
  cleanupMounted();
});

describe('SessionBanner', () => {
  it('renders neutral checking and refreshing copy with polite live region', () => {
    mountComponent(SessionBanner, {
      lang: 'zh',
      status: 'checking',
      message: null,
    });

    let banner = document.body.querySelector<HTMLElement>('[data-testid="session-banner"]');
    expect(banner).toBeTruthy();
    expect(banner!.getAttribute('aria-live')).toBe('polite');
    expect(banner!.textContent).toContain('正在確認登入狀態...');

    cleanupMounted();
    mountComponent(SessionBanner, {
      lang: 'zh',
      status: 'refreshing',
      message: null,
    });

    banner = document.body.querySelector<HTMLElement>('[data-testid="session-banner"]');
    expect(banner).toBeTruthy();
    expect(banner!.getAttribute('aria-live')).toBe('polite');
    expect(banner!.textContent).toContain('正在更新登入狀態...');
  });

  it('renders expired session, CSRF, backend, and invalid-mode failures with safe details', () => {
    const cases = [
      {
        code: 'AUTH_REFRESH_TOKEN_INVALID',
        status: 401,
        requestId: 'trace-expired',
        copy: '登入已過期，請重新登入。',
      },
      {
        code: 'AUTH_CSRF_TOKEN_INVALID',
        status: 403,
        requestId: 'trace-csrf',
        copy: '安全驗證失敗，請重新整理頁面後再試。',
      },
      {
        code: 'NETWORK_ERROR',
        status: 0,
        requestId: 'trace-network',
        copy: '暫時無法連線到後端，請稍後重試。',
      },
      {
        code: 'INVALID_RUNTIME_DATA_MODE',
        status: null,
        requestId: 'trace-mode',
        copy: '資料模式設定無效，請修正 VITE_DATA_MODE。',
      },
    ];

    for (const item of cases) {
      cleanupMounted();
      mountComponent(SessionBanner, {
        lang: 'zh',
        status: 'error',
        message: {
          code: item.code,
          status: item.status,
          requestId: item.requestId,
          message: 'raw message should not define copy',
        },
      });

      const banner = document.body.querySelector<HTMLElement>('[data-testid="session-banner"]');
      expect(banner).toBeTruthy();
      expect(banner!.getAttribute('aria-live')).toBe('assertive');
      expect(banner!.textContent).toContain(item.copy);
      expect(banner!.textContent).toContain(item.code);
      if (item.status !== null) expect(banner!.textContent).toContain(String(item.status));
      expect(banner!.textContent).toContain(item.requestId);
    }
  });

  it('never renders token, cookie, Set-Cookie, or password values from diagnostics', () => {
    mountComponent(SessionBanner, {
      lang: 'zh',
      status: 'error',
      message: {
        code: 'AUTH_CSRF_TOKEN_INVALID',
        status: 403,
        requestId: 'safe-trace',
        message: 'accessToken=abc refreshToken=def stock_access=ghi stock_refresh=jkl Set-Cookie: secret password=hunter2',
      },
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('AUTH_CSRF_TOKEN_INVALID');
    expect(text).toContain('safe-trace');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('refreshToken');
    expect(text).not.toContain('stock_access');
    expect(text).not.toContain('stock_refresh');
    expect(text).not.toContain('Set-Cookie');
    expect(text).not.toContain('hunter2');
  });

  it('emits retry and sign-in-again actions from banner controls', () => {
    const onRetry = vi.fn();
    const onSignInAgain = vi.fn();
    mountComponent(SessionBanner, {
      lang: 'zh',
      status: 'error',
      message: {
        code: 'AUTH_REFRESH_TOKEN_INVALID',
        status: 401,
        requestId: 'trace-expired',
        message: 'expired',
      },
      onRetry,
      onSignInAgain,
    });

    document.body.querySelector<HTMLButtonElement>('[data-testid="session-sign-in-again"]')!.click();
    expect(onSignInAgain).toHaveBeenCalledTimes(1);

    cleanupMounted();
    mountComponent(SessionBanner, {
      lang: 'zh',
      status: 'error',
      message: {
        code: 'NETWORK_ERROR',
        status: 0,
        requestId: 'trace-network',
        message: 'network',
      },
      onRetry,
      onSignInAgain,
    });

    document.body.querySelector<HTMLButtonElement>('[data-testid="session-retry"]')!.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
