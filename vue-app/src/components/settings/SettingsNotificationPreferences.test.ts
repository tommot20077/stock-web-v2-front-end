import { afterEach, describe, expect, it } from 'vitest';
import SettingsNotificationPreferences from './SettingsNotificationPreferences.vue';
import { cleanupMounted, clickButton, mountComponent } from '../../testUtils';
import type { NotificationPrefs } from '../../types';

const prefs: NotificationPrefs = {
  alertCross: true,
  alertVol: true,
  alertNews: true,
  orderFill: true,
  orderPartial: true,
  orderReject: true,
  orderStop: true,
  quietEnable: false,
  quietFrom: '22:00',
  quietTo: '07:00',
  sysApi: true,
  sysMargin: true,
  sysAi: true,
};

afterEach(() => {
  cleanupMounted();
});

describe('SettingsNotificationPreferences', () => {
  it('renders exposed notification preference groups and forwards save', async () => {
    const actions: string[] = [];

    mountComponent(SettingsNotificationPreferences, {
      lang: 'en',
      notifPrefs: { ...prefs },
      saveNotifPrefs: () => actions.push('save'),
    });

    expect(document.body.textContent).toContain('Price alerts');
    expect(document.body.textContent).toContain('Order events');
    expect(document.body.textContent).toContain('Quiet hours');

    await clickButton('Save');

    expect(actions).toEqual(['save']);
  });
});
