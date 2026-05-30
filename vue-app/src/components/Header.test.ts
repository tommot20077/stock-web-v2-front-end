import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header.vue';
import { cleanupMounted, flushAsync, mountComponent } from '../testUtils';

afterEach(() => {
  cleanupMounted();
});

const user = {
  id: 1,
  uuid: 'u-1',
  email: 'yuan@example.com',
  username: 'yuan',
  role: 'USER',
  status: 'ACTIVE',
};

describe('Header session indicator', () => {
  it('renders authenticated identity and logout affordance without replacing navigation', async () => {
    const onLogout = vi.fn();
    mountComponent(Header, {
      page: 'overview',
      lang: 'zh',
      admin: false,
      sessionStatus: 'authenticated',
      sessionUser: user,
      sessionBusy: false,
      onLogout,
    });

    expect(document.body.textContent).toContain('總覽');
    expect(document.body.textContent).toContain('行情');
    expect(document.body.textContent).toContain('已登入');
    expect(document.body.textContent).toContain('yuan@example.com');

    document.body.querySelector<HTMLButtonElement>('[data-testid="header-logout"]')!.click();
    await flushAsync(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('renders anonymous, checking, refreshing, and error status without stale user identity', () => {
    for (const status of ['anonymous', 'checking', 'refreshing', 'error'] as const) {
      cleanupMounted();
      mountComponent(Header, {
        page: 'overview',
        lang: 'zh',
        admin: false,
        sessionStatus: status,
        sessionUser: status === 'anonymous' ? user : null,
        sessionBusy: status === 'refreshing',
      });

      expect(document.body.textContent).not.toContain('yuan@example.com');
      if (status === 'checking') expect(document.body.textContent).toContain('正在確認登入狀態...');
      if (status === 'refreshing') expect(document.body.textContent).toContain('正在更新登入狀態...');
      if (status === 'anonymous') expect(document.body.textContent).toContain('尚未登入');
    }
  });
});
