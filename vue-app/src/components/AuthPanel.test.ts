import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthPanel from './AuthPanel.vue';
import { cleanupMounted, flushAsync, mountComponent } from '../testUtils';

afterEach(() => {
  cleanupMounted();
});

function inputByLabel(label: string): HTMLInputElement {
  const labelEl = [...document.body.querySelectorAll<HTMLLabelElement>('label')]
    .find(el => el.textContent?.includes(label));
  expect(labelEl, `label containing "${label}"`).toBeTruthy();
  const input = labelEl!.querySelector('input');
  expect(input, `input inside label "${label}"`).toBeTruthy();
  return input!;
}

async function fill(label: string, value: string) {
  const input = inputByLabel(label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushAsync(1);
}

describe('AuthPanel', () => {
  it('renders anonymous API-mode copy and auth actions in zh and en', () => {
    mountComponent(AuthPanel, {
      lang: 'zh',
      status: 'anonymous',
      user: null,
      message: null,
      busy: false,
    });

    expect(document.body.textContent).toContain('尚未登入');
    expect(document.body.textContent).toContain('登入');
    expect(document.body.textContent).toContain('建立帳號');
    expect(document.body.textContent).toContain('API mode 會用瀏覽器工作階段還原你的狀態');

    cleanupMounted();
    mountComponent(AuthPanel, {
      lang: 'en',
      status: 'anonymous',
      user: null,
      message: null,
      busy: false,
    });

    expect(document.body.textContent).toContain('Signed out');
    expect(document.body.textContent).toContain('Sign in');
    expect(document.body.textContent).toContain('Create account');
    expect(document.body.textContent).toContain('restore your browser session');
  });

  it('uses visible form labels, autocomplete, stable submit buttons, and disables while busy', () => {
    mountComponent(AuthPanel, {
      lang: 'zh',
      status: 'anonymous',
      user: null,
      message: null,
      busy: true,
    });

    const email = inputByLabel('Email');
    const password = inputByLabel('密碼');
    const signIn = document.body.querySelector<HTMLButtonElement>('[data-testid="auth-login-submit"]');

    expect(email.autocomplete).toBe('email');
    expect(password.autocomplete).toBe('current-password');
    expect(signIn).toBeTruthy();
    expect(signIn!.disabled).toBe(true);
    expect(signIn!.className).toContain('auth-submit');
  });

  it('emits safe login, register, and logout requests without rendering passwords', async () => {
    const onLogin = vi.fn();
    const onRegister = vi.fn();
    const onLogout = vi.fn();
    mountComponent(AuthPanel, {
      lang: 'zh',
      status: 'authenticated',
      user: {
        id: 1,
        uuid: 'u-1',
        email: 'yuan@example.com',
        username: 'yuan',
        role: 'USER',
        status: 'ACTIVE',
      },
      message: null,
      busy: false,
      onLogin,
      onRegister,
      onLogout,
    });

    expect(document.body.textContent).toContain('已登入');
    expect(document.body.textContent).toContain('yuan@example.com');
    expect(document.body.textContent).toContain('登出');
    document.body.querySelector<HTMLButtonElement>('[data-testid="auth-logout"]')!.click();
    await flushAsync(1);
    expect(onLogout).toHaveBeenCalledTimes(1);

    cleanupMounted();
    mountComponent(AuthPanel, {
      lang: 'zh',
      status: 'anonymous',
      user: null,
      message: null,
      busy: false,
      onLogin,
      onRegister,
      onLogout,
    });

    await fill('Email', 'yuan@example.com');
    await fill('密碼', 'super-secret-password');
    document.body.querySelector<HTMLButtonElement>('[data-testid="auth-login-submit"]')!.click();
    await flushAsync(1);
    expect(onLogin).toHaveBeenCalledWith({ email: 'yuan@example.com', password: 'super-secret-password' });
    expect(document.body.textContent).not.toContain('super-secret-password');

    document.body.querySelector<HTMLButtonElement>('[data-testid="auth-tab-register"]')!.click();
    await flushAsync(1);
    await fill('Email', 'new@example.com');
    await fill('使用者名稱', 'newuser');
    await fill('密碼', 'new-secret-password');
    document.body.querySelector<HTMLButtonElement>('[data-testid="auth-register-submit"]')!.click();
    await flushAsync(1);
    expect(onRegister).toHaveBeenCalledWith({
      email: 'new@example.com',
      username: 'newuser',
      password: 'new-secret-password',
    });
    expect(document.body.textContent).not.toContain('new-secret-password');
  });
});
