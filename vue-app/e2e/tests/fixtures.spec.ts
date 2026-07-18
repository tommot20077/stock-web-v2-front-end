import { test, expect, registerUniqueAccount } from '../support/fixtures';

// 基礎設施:uniqueAccount fixture 的自我驗證
// API 註冊唯一帳號 → API 登入(cookie session)→ /api/v1/me 回同一使用者
test('uniqueAccount 可 API 登入且 /me 回同一使用者 @smoke', async ({ uniqueAccount, request }) => {
  const loginRes = await request.post('/api/v1/auth/login', {
    data: { email: uniqueAccount.email, password: uniqueAccount.password },
  });
  expect(loginRes.ok()).toBe(true);

  const meRes = await request.get('/api/v1/me');
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.success).toBe(true);
  expect(me.data.email).toBe(uniqueAccount.email);
});

test('連續註冊兩帳號必不相同(平行隔離基礎) @smoke', async ({ playwright }) => {
  const first = await registerUniqueAccount(playwright);
  const second = await registerUniqueAccount(playwright);
  expect(first.email).not.toBe(second.email);
  expect(first.username).not.toBe(second.username);
});
