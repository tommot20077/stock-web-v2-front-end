import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { cleanupMounted, flushAsync, mountWithPinia } from './testUtils';
import { resetRuntimeApiClientsForTests } from './services/pageApiClients';
import { installFakeQuoteStream } from './testing/fakeQuoteStream';

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiSuccess(data: unknown) {
  return { data, meta: { traceId: 'trace-ok' } };
}

function apiFailure(code: string, message: string, status: number, traceId: string) {
  return json({ error: { code, message }, meta: { traceId } }, status);
}

async function settleSession() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushAsync(12);
}

describe('App session shell', () => {
  it('API mode boot bootstraps CSRF, restores /me, and renders authenticated header plus page content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-123; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return json(apiSuccess({
          id: 1,
          uuid: 'u-1',
          email: 'yuan@example.com',
          username: 'yuan',
          role: 'USER',
          status: 'ACTIVE',
        }));
      }
      // Phase 3(D-14):API mode 的 Overview KPI 來自 backend summary,不再有合成資料;
      // 「頁面內容有渲染」這個斷言因此需要 portfolio 端點的 fixture 才成立。
      if (path.includes('/portfolio/summary')) {
        // Phase 5 D-05:BigDecimal 欄位是 JSON 字串;mapper 要求完整的後端形狀。
        return json(apiSuccess({
          totalMarketValue: '1234567.89',
          totalCostBasis: '1000000',
          realizedPnl: '0',
          unrealizedPnl: '234567.89',
          totalPnl: '234567.89',
          roi: '0.2345',
          holdingCount: 4,
          baseCurrency: 'TWD',
          fxExcludedCount: 0,
          unconvertedCurrencies: [],
          dayPricePnl: null,
          dayPricePnlRatio: null,
          dayPnlExcludedCount: 4,
          cash: '0',
          totalEquity: '1234567.89',
          cashBalances: [],
          allocation: [{ category: 'STOCK', value: '1234567.89', weight: '1' }],
          sectorAllocation: [],
          dividendIncome: '0',
          dividendTaxWithheld: '0',
        }));
      }
      if (path.includes('/trades')) {
        return json(apiSuccess({ items: [], page: 0, size: 5, totalElements: 0, totalPages: 0 }));
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    expect(document.body.textContent).toContain('正在確認登入狀態...');
    await settleSession();

    const calls = vi.mocked(fetch).mock.calls.map(call => String(call[0]));
    expect(calls).toContain('/api/v1/csrf');
    expect(calls).toContain('/api/v1/me');
    expect(document.body.textContent).toContain('yuan@example.com');
    expect(document.body.textContent).toContain('總資產');
  });

  it('expired API-mode restore hides stale identity and renders auth panel plus sign-in action', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-456; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return apiFailure('AUTH_TOKEN_EXPIRED', 'Expired', 401, 'trace-me-expired');
      }
      if (path.endsWith('/auth/refresh')) {
        return apiFailure('AUTH_REFRESH_TOKEN_INVALID', 'Refresh expired', 401, 'trace-refresh-expired');
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    await settleSession();

    expect(document.body.textContent).toContain('登入已過期，請重新登入。');
    expect(document.body.textContent).toContain('尚未登入');
    expect(document.body.textContent).toContain('登入');
    expect(document.body.textContent).not.toContain('yuan@example.com');
  });

  it('API-mode backend outage keeps the session surface visible and does not fall back to mock auth', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      return apiFailure('AUTH_REDIS_UNAVAILABLE', 'Redis unavailable', 503, 'trace-redis');
    }));

    mountWithPinia(App);
    await settleSession();

    expect(document.body.textContent).toContain('暫時無法連線到後端，請稍後重試。');
    expect(document.body.textContent).toContain('AUTH_REDIS_UNAVAILABLE');
    expect(document.body.textContent).toContain('trace-redis');
    expect(document.body.textContent).toContain('尚未登入');
  });

  it('API-mode rejected fetch renders backend unavailable retry surface without mock portfolio content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('backend offline');
    }));

    mountWithPinia(App);
    await settleSession();

    expect(document.body.textContent).toContain('暫時無法連線到後端，請稍後重試。');
    expect(document.body.querySelector('[data-testid="session-retry"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('總資產');
    expect(document.body.textContent).not.toContain('最近交易');
  });

  it('successful logout returns to anonymous state and keeps persistent session surface', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-789; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return json(apiSuccess({
          id: 1,
          uuid: 'u-1',
          email: 'yuan@example.com',
          username: 'yuan',
          role: 'USER',
          status: 'ACTIVE',
        }));
      }
      if (path.endsWith('/auth/logout')) {
        return json(apiSuccess(null));
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    await settleSession();
    document.body.querySelector<HTMLButtonElement>('[data-testid="header-logout"]')!.click();
    await settleSession();

    expect(document.body.textContent).toContain('尚未登入');
    expect(document.body.textContent).toContain('登出');
    expect(document.body.textContent).not.toContain('yuan@example.com');
  });

  it('mock mode keeps existing pages reachable without /api/v1/me', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    vi.stubGlobal('fetch', vi.fn());

    mountWithPinia(App);
    await flushAsync();

    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/v1/me', expect.anything());
    expect(document.body.textContent).toContain('總資產');
  });

  it('invalid explicit runtime mode renders a configuration error without mock content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'prod');
    vi.stubGlobal('fetch', vi.fn());

    mountWithPinia(App);
    await flushAsync();

    expect(document.body.textContent).toContain('資料模式設定無效，請修正 VITE_DATA_MODE。');
    expect(document.body.textContent).toContain('INVALID_RUNTIME_DATA_MODE');
    expect(document.body.textContent).not.toContain('總資產');
    expect(document.body.textContent).not.toContain('最近交易');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// =====================================================================================
// 04.2-review WR-05:登出(或 refresh 過期)讓即時報價停在 closed;同分頁重新登入後必須能離開 closed。
// =====================================================================================

describe('App — 重新登入後恢復 closed 的即時報價串流(04.2-review WR-05)', () => {
  const user = { id: 1, uuid: 'u-1', email: 'yuan@example.com', username: 'yuan', role: 'USER', status: 'ACTIVE' };

  function stubAnonymousThenLoginFetch() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-wr05; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) return apiFailure('AUTH_TOKEN_EXPIRED', 'Expired', 401, 'trace-me-expired');
      if (path.endsWith('/auth/refresh')) return apiFailure('AUTH_REFRESH_TOKEN_INVALID', 'Refresh expired', 401, 'trace-refresh');
      if (path.endsWith('/auth/login')) {
        return json(apiSuccess({ user, accessTokenExpiresAt: '2026-11-04T12:15:00Z', refreshTokenExpiresAt: '2026-11-18T12:00:00Z' }));
      }
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));
  }

  async function submitLogin() {
    const email = document.body.querySelector<HTMLInputElement>('[data-testid="auth-login-email"]')!;
    const password = document.body.querySelector<HTMLInputElement>('[data-testid="auth-login-password"]')!;
    email.value = 'yuan@example.com';
    email.dispatchEvent(new Event('input'));
    password.value = 'pw-123456';
    password.dispatchEvent(new Event('input'));
    document.body.querySelector<HTMLFormElement>('[data-testid="auth-login-submit"]')!.closest('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settleSession();
  }

  afterEach(() => {
    resetRuntimeApiClientsForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('串流為 closed 時,登入成功(session → authenticated)會呼叫 quotes.reconnect()', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
    const fake = installFakeQuoteStream('closed');
    stubAnonymousThenLoginFetch();

    mountWithPinia(App);
    await settleSession();
    expect(document.body.textContent).toContain('尚未登入');
    expect(fake.reconnect).not.toHaveBeenCalled();

    await submitLogin();

    expect(document.body.textContent).toContain('yuan@example.com');
    expect(fake.reconnect).toHaveBeenCalledOnce();
  });

  it('串流為 replaced 時登入成功不自動 reconnect(replaced 只接受使用者手動重連)', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
    const fake = installFakeQuoteStream('replaced');
    stubAnonymousThenLoginFetch();

    mountWithPinia(App);
    await settleSession();
    await submitLogin();

    expect(document.body.textContent).toContain('yuan@example.com');
    expect(fake.reconnect).not.toHaveBeenCalled();
  });
});

// =====================================================================================
// 04.2-21 Task 3(U-11):現金頁股利連結 → App 切到 Trades 並以 initialFilter 預選「股利」頁籤。
// =====================================================================================

describe('App — 現金頁股利連結導到 Trades 股利頁籤(04.2-21 / U-11)', () => {
  function byTestid(id: string): HTMLElement | null {
    return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('mock mode:點連結後 Trades 掛載且「股利」頁籤為 active;離開再從導覽回 Trades 不再套用', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    resetRuntimeApiClientsForTests();
    vi.stubGlobal('fetch', vi.fn());
    mountWithPinia(App);
    await flushAsync();

    byTestid('nav-cash')!.click();
    await flushAsync();
    byTestid('cash-page-dividend-link')!.click();
    await flushAsync();

    expect(byTestid('cash-page')).toBeNull();
    expect(byTestid('trades-chip-dividend')!.classList.contains('active')).toBe(true);
    expect(byTestid('trades-record-dividend')).not.toBeNull();

    // 離開 Trades 後 initialFilter 被清掉:下次經導覽進入回到「全部」
    byTestid('nav-positions')!.click();
    await flushAsync();
    byTestid('nav-trades')!.click();
    await flushAsync();
    expect(byTestid('trades-chip-all')!.classList.contains('active')).toBe(true);
  });

  it('API mode:Trades 的第一個活動列表請求含 type=DIVIDEND', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api');
    resetRuntimeApiClientsForTests();
    const summary = {
      totalMarketValue: '0', totalCostBasis: '0', realizedPnl: '0', unrealizedPnl: '0', totalPnl: '0', roi: '0', holdingCount: 0,
      baseCurrency: 'TWD', fxExcludedCount: 0, unconvertedCurrencies: [], dayPricePnl: null, dayPricePnlRatio: null,
      dayPnlExcludedCount: 0, cash: '0', totalEquity: '0', cashBalances: [], allocation: [], sectorAllocation: [],
      dividendIncome: '0', dividendTaxWithheld: '0',
    };
    const emptyPage = { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-u11; path=/';
        return json(apiSuccess({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }));
      }
      if (path.endsWith('/me')) {
        return json(apiSuccess({ id: 1, uuid: 'u-1', email: 'yuan@example.com', username: 'yuan', role: 'USER', status: 'ACTIVE' }));
      }
      if (path.includes('/portfolio/summary')) return json(apiSuccess(summary));
      if (path.includes('/portfolio/cash-entries')) return json(apiSuccess(emptyPage));
      if (path.includes('/portfolio/activities')) return json(apiSuccess(emptyPage));
      return apiFailure('UNEXPECTED', 'Unexpected request', 500, 'trace-unexpected');
    }));

    mountWithPinia(App);
    await settleSession();
    byTestid('nav-cash')!.click();
    await settleSession();
    byTestid('cash-page-dividend-link')!.click();
    await settleSession();

    const activityCalls = vi.mocked(fetch).mock.calls.map(call => String(call[0])).filter(url => url.includes('/portfolio/activities'));
    expect(activityCalls.length).toBeGreaterThan(0);
    expect(new URLSearchParams(activityCalls[0].slice(activityCalls[0].indexOf('?') + 1)).get('type')).toBe('DIVIDEND');
    expect(byTestid('trades-chip-dividend')!.classList.contains('active')).toBe(true);
  });
});
