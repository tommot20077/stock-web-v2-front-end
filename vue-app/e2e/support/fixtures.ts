import { test as base, expect, type Page, type Playwright } from '@playwright/test';

/**
 * Browser E2E 測試帳號與登入 helper。
 * 隔離原則:每條測試以 API 註冊唯一帳號(e2e+<runId>-<n>@test.local),
 * 不共用帳號、不依賴執行順序。
 */
export interface E2eAccount {
  email: string;
  username: string;
  password: string;
}

/** 符合後端密碼規則 ^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$ */
export const E2E_PASSWORD = 'E2ePassw0rd';

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

// runId 每個 worker process 各自產生;搭配 workerIndex + 流水號確保跨 worker、跨 run 唯一
const RUN_ID = process.env.E2E_RUN_ID ?? Date.now().toString(36);
let sequence = 0;

export function nextAccount(workerIndex = 0): E2eAccount {
  sequence += 1;
  const n = `${workerIndex}x${sequence}`;
  return {
    email: `e2e+${RUN_ID}-${n}@test.local`,
    username: `e2e_${RUN_ID}_${n}`,
    password: E2E_PASSWORD,
  };
}

/** 以獨立 API request context 註冊唯一帳號(不汙染測試自身的 cookie jar) */
export async function registerUniqueAccount(
  playwright: Playwright,
  workerIndex = 0,
  baseURL: string = DEFAULT_BASE_URL,
): Promise<E2eAccount> {
  const account = nextAccount(workerIndex);
  const ctx = await playwright.request.newContext({ baseURL });
  try {
    const res = await ctx.post('/api/v1/auth/register', {
      data: {
        email: account.email,
        username: account.username,
        password: account.password,
      },
    });
    if (!res.ok()) {
      throw new Error(`registerUniqueAccount 失敗:HTTP ${res.status()} ${await res.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
  return account;
}

/**
 * API 登入:透過 page.request(與瀏覽器 context 共用 cookie jar),
 * 後端 Set-Cookie(HttpOnly stock_access/stock_refresh)直接進瀏覽器。
 * 呼叫後需 page.goto 讓 app 以 /me 恢復 session。
 */
export async function loginViaApi(page: Page, account: E2eAccount): Promise<void> {
  const res = await page.request.post('/api/v1/auth/login', {
    data: { email: account.email, password: account.password },
  });
  if (!res.ok()) {
    throw new Error(`loginViaApi 失敗:HTTP ${res.status()} ${await res.text()}`);
  }
}

/** UI 登入:走 AuthPanel 登入表單(selector 見 e2e/support/selectors.md) */
export async function loginViaUi(page: Page, account: E2eAccount): Promise<void> {
  await page.getByTestId('auth-tab-login').click();
  await page.getByTestId('auth-login-email').fill(account.email);
  await page.getByTestId('auth-login-password').fill(account.password);
  await page.getByTestId('auth-login-submit').click();
}

export const test = base.extend<{ uniqueAccount: E2eAccount }>({
  uniqueAccount: async ({ playwright, baseURL }, use, testInfo) => {
    const account = await registerUniqueAccount(playwright, testInfo.workerIndex, baseURL ?? DEFAULT_BASE_URL);
    await use(account);
  },
});

export { expect };
