import { test, expect, nextAccount, loginViaApi, loginViaUi, type E2eAccount } from '../support/fixtures';

/**
 * 旅程 A:註冊/登入/Session(設計文件 §5 v2 矩陣)
 * 每條測試自帶唯一帳號,不依賴執行順序。selector 一律 data-testid。
 */

async function fillRegisterForm(page: import('@playwright/test').Page, account: E2eAccount, emailOverride?: string) {
  await page.getByTestId('auth-tab-register').click();
  await page.getByTestId('auth-register-email').fill(emailOverride ?? account.email);
  await page.getByTestId('auth-register-username').fill(account.username);
  await page.getByTestId('auth-register-password').fill(account.password);
}

async function submitLoginForm(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByTestId('auth-tab-login').click();
  await page.getByTestId('auth-login-email').fill(email);
  await page.getByTestId('auth-login-password').fill(password);
  await page.getByTestId('auth-login-submit').click();
}

test('A1 UI 註冊 → 自動登入,Header 顯示使用者 @smoke', async ({ page }, testInfo) => {
  const account = nextAccount(testInfo.workerIndex);
  await page.goto('/');
  await fillRegisterForm(page, account);
  await page.getByTestId('auth-register-submit').click();

  await expect(page.getByTestId('header-session-identity')).toHaveText(account.email);
  // 已登入後 AuthPanel 登入表單不再顯示
  await expect(page.getByTestId('auth-tab-login')).toBeHidden();
});

test('A2 登入 → reload → session 仍在(HttpOnly cookie + /me 恢復) @smoke', async ({ page, uniqueAccount }) => {
  await page.goto('/');
  await loginViaUi(page, uniqueAccount);
  await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);

  await page.reload();
  await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);
});

test('A3 登出 → 回未登入態 @smoke', async ({ page, uniqueAccount }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');
  await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);

  await page.getByTestId('header-logout').click();

  await expect(page.getByTestId('auth-tab-login')).toBeVisible();
  await expect(page.getByTestId('header-session-identity')).toBeHidden();
});

test('A7 錯誤密碼 → 友善錯誤,error.code 與 traceId 可見 @smoke', async ({ page, uniqueAccount }) => {
  await page.goto('/');
  await submitLoginForm(page, uniqueAccount.email, 'WrongPass1');

  await expect(page.getByTestId('session-banner')).toBeVisible();
  await expect(page.getByTestId('session-error-code')).toHaveText('AUTH_INVALID_CREDENTIALS');
  await expect(page.getByTestId('session-request-id')).not.toBeEmpty();
});

test('A9 未登入訪問受保護頁 → 顯示 AuthPanel @smoke', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-backtest').click();

  await expect(page.getByTestId('auth-tab-login')).toBeVisible();
  await expect(page.getByTestId('header-session-identity')).toBeHidden();
});

test('A4 密碼不符規則 → 欄位錯誤有顯示 @extended', async ({ page }, testInfo) => {
  const account = nextAccount(testInfo.workerIndex);
  await page.goto('/');
  // 7 碼(含大小寫數字)→ 只違反長度規則,通過 HTML required 後由後端 VALIDATION_FAILED 回 fields.password
  await fillRegisterForm(page, account);
  await page.getByTestId('auth-register-password').fill('Pass1wd');
  await page.getByTestId('auth-register-submit').click();

  await expect(page.getByTestId('auth-field-error-password')).toBeVisible();
});

test('A5 email 混大小寫+前後空白註冊 → 以純小寫登入成功 @extended', async ({ page }, testInfo) => {
  const account = nextAccount(testInfo.workerIndex);
  const mixedEmail = `  ${account.email.replace('e2e+', 'E2E+').replace('@test.local', '@Test.LOCAL')}  `;
  await page.goto('/');
  await fillRegisterForm(page, account, mixedEmail);
  await page.getByTestId('auth-register-submit').click();
  await expect(page.getByTestId('header-session-identity')).toHaveText(account.email);

  await page.getByTestId('header-logout').click();
  await expect(page.getByTestId('auth-tab-login')).toBeVisible();

  await loginViaUi(page, account); // 純小寫 email 登入
  await expect(page.getByTestId('header-session-identity')).toHaveText(account.email);
});

test('A8 重複 email 註冊 → 錯誤顯示 DUPLICATE_RESOURCE @extended', async ({ page, uniqueAccount }, testInfo) => {
  const other = nextAccount(testInfo.workerIndex);
  await page.goto('/');
  await fillRegisterForm(page, { ...other, email: uniqueAccount.email });
  await page.getByTestId('auth-register-submit').click();

  await expect(page.getByTestId('auth-error')).toBeVisible();
  await expect(page.getByTestId('auth-error')).toContainText('DUPLICATE_RESOURCE');
});

test('A10 連續錯密碼達門檻 → AUTH_ACCOUNT_LOCKED,正確密碼也被拒 @extended', async ({ page, uniqueAccount }) => {
  await page.goto('/');
  // e2e-browser profile:lockout threshold=3
  for (let i = 0; i < 3; i += 1) {
    await submitLoginForm(page, uniqueAccount.email, `WrongPass${i}x`);
    await expect(page.getByTestId('session-banner')).toBeVisible();
  }

  // 鎖定後,正確密碼也被拒
  await submitLoginForm(page, uniqueAccount.email, uniqueAccount.password);
  await expect(page.getByTestId('session-error-code')).toHaveText('AUTH_ACCOUNT_LOCKED');
  await expect(page.getByTestId('header-session-identity')).toBeHidden();
});

test('A11 refresh token 撤銷後操作 → 重試失敗 → 回未登入 @extended', async ({ page, playwright, uniqueAccount, baseURL }) => {
  await loginViaApi(page, uniqueAccount);
  await page.goto('/');
  await expect(page.getByTestId('header-session-identity')).toHaveText(uniqueAccount.email);

  // 帶同一組 cookie 由另一個 client 執行 logout(bump tokenVersion、撤銷 refresh token),
  // 瀏覽器 jar 仍留著已失效的舊 cookie
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const xsrf = cookies.find(c => c.name === 'XSRF-TOKEN')?.value ?? '';
  const outOfBand = await playwright.request.newContext({ baseURL: baseURL ?? 'http://localhost:4173' });
  try {
    const res = await outOfBand.post('/api/v1/auth/logout', {
      headers: { Cookie: cookieHeader, 'X-XSRF-TOKEN': xsrf },
    });
    expect(res.ok()).toBe(true);
  } finally {
    await outOfBand.dispose();
  }

  // 以舊 cookie 觸發需授權的操作:401 → 自動 refresh(一次)→ AUTH_REFRESH_TOKEN_INVALID → 回未登入
  await page.getByTestId('nav-backtest').click();
  await page.getByTestId('backtest-run').click();

  await expect(page.getByTestId('session-error-code')).toHaveText('AUTH_REFRESH_TOKEN_INVALID');
  await expect(page.getByTestId('auth-tab-login')).toBeVisible();
  await expect(page.getByTestId('header-session-identity')).toBeHidden();
});
