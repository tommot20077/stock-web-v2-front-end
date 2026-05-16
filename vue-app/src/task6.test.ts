import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import App from './App.vue';
import Settings from './pages/Settings.vue';
import { useMockNotificationsStore } from './stores/mockNotifications';
import { useTweaks } from './useTweaks';
import {
  buttonByText,
  cleanupMounted,
  clickButton,
  clickButtonWithin,
  flushAsync,
  mountWithPinia,
  rowByText,
} from './testUtils';

function mountSettings(props: Record<string, unknown> = {}) {
  return mountWithPinia(Settings, { lang: 'en', ...props });
}

function keyPanelByProvider(provider: string): HTMLElement {
  return rowByText('.broker, .key-row', provider);
}

function inputByName(name: string): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `input named "${name}"`).toBeTruthy();
  return input!;
}

afterEach(() => {
  cleanupMounted();
  useTweaks().reset();
  localStorage.clear();
});

describe('Task 6 settings mock completeness', () => {
  it('emits display theme and language tweak changes', async () => {
    const tweaks: Array<{ key: string; value: unknown }> = [];
    mountSettings({ onSetTweak: (payload: { key: string; value: unknown }) => tweaks.push(payload) });

    await clickButton('Display');
    await clickButton('Light');
    await clickButton('Dark');
    await clickButton('English');
    await clickButton('Traditional Chinese');

    expect(tweaks).toEqual([
      { key: 'theme', value: 'light' },
      { key: 'theme', value: 'dark' },
      { key: 'lang', value: 'en' },
      { key: 'lang', value: 'zh' },
    ]);
    expect(document.body.textContent).not.toContain('System');
  });

  it('saves notification preferences through the mock notifications store', async () => {
    const toasts: string[] = [];
    mountSettings({ onToast: (message: string) => toasts.push(message) });
    const store = useMockNotificationsStore();
    store.updateNotificationPrefs({
      alertVol: true,
      quietEnable: false,
      quietFrom: '22:00',
      quietTo: '07:00',
    });

    await clickButton('Notifications');
    inputByName('alertVol').click();
    inputByName('quietEnable').click();
    const quietFrom = inputByName('quietFrom');
    quietFrom.value = '21:30';
    quietFrom.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    await clickButton('Save');

    expect(store.notificationPrefs.alertVol).toBe(false);
    expect(store.notificationPrefs.quietEnable).toBe(true);
    expect(store.notificationPrefs.quietFrom).toBe('21:30');
    expect(toasts).toEqual(['Notification preferences saved']);
  });

  it('preserves hidden system notification prefs changed elsewhere while saving exposed prefs', async () => {
    const toasts: string[] = [];
    mountSettings({ onToast: (message: string) => toasts.push(message) });
    const store = useMockNotificationsStore();

    store.updateNotificationPrefs({
      sysApi: false,
      sysMargin: false,
      sysAi: false,
      alertVol: true,
    });

    await clickButton('Notifications');
    inputByName('alertVol').click();
    await nextTick();
    await clickButton('Save');

    expect(store.notificationPrefs.alertVol).toBe(false);
    expect(store.notificationPrefs.sysApi).toBe(false);
    expect(store.notificationPrefs.sysMargin).toBe(false);
    expect(store.notificationPrefs.sysAi).toBe(false);
    expect(toasts).toEqual(['Notification preferences saved']);
  });

  it('runs simulated API key tests through the adapter and reports completion', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const toasts: string[] = [];
    mountSettings({ onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    const alpaca = keyPanelByProvider('Alpaca');
    await clickButtonWithin(alpaca, 'Test connection');
    await flushAsync();

    expect(alpaca.textContent).not.toContain('Testing');
    expect(alpaca.textContent).toMatch(/Connected|Failed/);
    expect(toasts).toEqual(['Simulated connection test complete']);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('revokes API keys through the adapter', async () => {
    const toasts: string[] = [];
    mountSettings({ onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    const alpaca = keyPanelByProvider('Alpaca');
    await clickButtonWithin(alpaca, 'Revoke');
    await flushAsync();
    expect(document.body.textContent).not.toContain('Alpaca');

    expect(toasts).toEqual([]);
  });

  it('keeps adapter-loaded key rows stable when Settings unmounts', async () => {
    const toasts: string[] = [];
    const cleanup = mountSettings({ onToast: (message: string) => toasts.push(message) });
    await flushAsync();

    const alpaca = keyPanelByProvider('Alpaca');
    expect(alpaca.textContent).toContain('Alpaca');
    cleanup();
    await flushAsync();

    expect(toasts).toEqual([]);
  });

  it('marks profile and security controls as disabled previews', async () => {
    mountSettings();

    await clickButton('Profile');
    const avatarButton = buttonByText('Avatar edit preview');
    expect(avatarButton.disabled).toBe(true);

    await clickButton('Security');
    expect(buttonByText('Password flow preview').disabled).toBe(true);
    expect(buttonByText('2FA preview').disabled).toBe(true);
    expect(buttonByText('Device management preview').disabled).toBe(true);
  });

  it('keeps the latest App toast visible when a previous toast timer expires', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { set } = useTweaks();
    set('lang', 'en');
    mountWithPinia(App, {});

    await clickButton('Settings');
    await clickButton('Notifications');
    await clickButton('Save');
    expect(document.body.textContent).toContain('Notification preferences saved');

    vi.advanceTimersByTime(1000);
    await nextTick();
    await clickButton('Save');
    expect(clearTimeoutSpy).toHaveBeenCalled();

    vi.advanceTimersByTime(1031);
    await nextTick();
    expect(document.body.textContent).toContain('Notification preferences saved');
  });
});
