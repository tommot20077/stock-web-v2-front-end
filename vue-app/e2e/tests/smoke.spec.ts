import { test, expect } from '@playwright/test';

// 基礎設施 smoke:preview server 起得來、app 掛載成功、API proxy 通
test('首頁可載入且 app 掛載 @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).not.toBeEmpty();
});

test('preview proxy 可達後端 API @smoke', async ({ request }) => {
  const res = await request.get('/api/v1/assets?query=NVDA');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data.items.length).toBeGreaterThan(0);
});
