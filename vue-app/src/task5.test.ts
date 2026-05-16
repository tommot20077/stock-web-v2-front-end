import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Alerts from './pages/Alerts.vue';
import Notifications from './pages/Notifications.vue';
import { useMockNotificationsStore } from './stores/mockNotifications';
import type { AlertChannel, MockNotification } from './types';

const mounted: Array<() => void> = [];

function setupStore() {
  setActivePinia(createPinia());
  return useMockNotificationsStore();
}

function mountWithPinia(component: Component, props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(component, props);
  app.use(pinia);
  app.mount(el);
  mounted.push(() => {
    app.unmount();
    el.remove();
  });
}

function clickButtonByText(text: string) {
  const button = [...document.body.querySelectorAll('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}"`).toBeTruthy();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function notification(id: string, kind: MockNotification['kind'], unread: boolean): MockNotification {
  return {
    id,
    kind,
    sym: kind === 'system' ? undefined : 'AAPL',
    text: `${kind} notification`,
    time: 'now',
    unread,
    dateKey: '2026-05-16',
  };
}

afterEach(() => {
  vi.useRealTimers();
  while (mounted.length) mounted.pop()?.();
  document.body.innerHTML = '';
});

describe('Task 5 notification coherence', () => {
  it('addAlert creates an unread alert notification', () => {
    const store = setupStore();
    const initialNotifications = store.notifications.length;

    store.addAlert({
      sym: 'AAPL',
      name: 'Apple Inc.',
      cat: 'stock',
      condition: 'above',
      target: 220,
      channels: ['push'],
    });

    expect(store.notifications).toHaveLength(initialNotifications + 1);
    expect(store.notifications[0]).toMatchObject({
      kind: 'alert',
      sym: 'AAPL',
      time: 'now',
      unread: true,
    });
    expect(store.notifications[0].text).toContain('AAPL');
  });

  it('markAllNotificationsRead clears unread flags', () => {
    const store = setupStore();
    store.notifications = [
      notification('n-a', 'alert', true),
      notification('n-o', 'order', true),
      notification('n-s', 'system', false),
    ];

    store.markAllNotificationsRead();

    expect(store.notifications.every(n => !n.unread)).toBe(true);
  });

  it('clearNotifications empties the notification list', () => {
    const store = setupStore();
    store.notifications = [
      notification('n-a', 'alert', true),
      notification('n-o', 'order', false),
    ];

    store.clearNotifications();

    expect(store.notifications).toEqual([]);
  });

  it('updateNotificationPrefs persists changed flags', () => {
    const store = setupStore();

    store.updateNotificationPrefs({ alertVol: false, quietEnable: true });

    expect(store.notificationPrefs.alertVol).toBe(false);
    expect(store.notificationPrefs.quietEnable).toBe(true);
  });

  it('clones channels when adding and updating alerts', () => {
    const store = setupStore();
    const createChannels: AlertChannel[] = ['push'];

    store.addAlert({
      sym: 'MSFT',
      name: 'Microsoft Corp.',
      cat: 'stock',
      condition: 'below',
      target: 300,
      channels: createChannels,
    });
    createChannels.push('email');
    expect(store.alerts[0].channels).toEqual(['push']);

    const updateChannels: AlertChannel[] = ['email'];
    store.updateAlert(store.alerts[0].id, { channels: updateChannels });
    updateChannels.push('sound');

    expect(store.alerts[0].channels).toEqual(['email']);
  });

  it('uses local date keys for default pushed notifications', () => {
    vi.useFakeTimers();
    const localEarlyMorning = new Date(2026, 4, 16, 1, 0, 0);
    vi.setSystemTime(localEarlyMorning);
    const store = setupStore();
    store.notifications = [];

    store.pushNotification({
      kind: 'system',
      text: 'local date check',
      time: 'now',
      unread: true,
    });

    expect(store.notifications[0].dateKey).toBe(localDateKey(localEarlyMorning));
  });

  it('counts today notifications in the local today heatmap cell', async () => {
    vi.useFakeTimers();
    const localEarlyMorning = new Date(2026, 4, 16, 1, 0, 0);
    vi.setSystemTime(localEarlyMorning);
    mountWithPinia(Notifications, { lang: 'en' });
    const store = useMockNotificationsStore();
    store.notifications = [
      {
        id: 'n-local-today',
        kind: 'alert',
        sym: 'AAPL',
        text: 'local today alert',
        time: 'now',
        unread: true,
        dateKey: localDateKey(localEarlyMorning),
      },
    ];
    await nextTick();

    expect(document.body.textContent).toContain('1 notifications');
    expect(document.body.querySelectorAll('.hm-cell:not(.empty):not(.lvl-0)')).toHaveLength(1);
  });

  it('creates alerts through Alerts.vue using the notification store', async () => {
    mountWithPinia(Alerts, { lang: 'en' });
    const store = useMockNotificationsStore();
    const initialAlerts = store.alerts.length;
    const initialNotifications = store.notifications.length;

    clickButtonByText('New alert');
    await nextTick();
    clickButtonByText('Save');
    await nextTick();

    expect(store.alerts).toHaveLength(initialAlerts + 1);
    expect(store.notifications).toHaveLength(initialNotifications + 1);
    expect(store.notifications[0]).toMatchObject({
      kind: 'alert',
      sym: 'AAPL',
      unread: true,
    });
  });

  it('Notifications.vue mark-read and clear-all mutate the notification store', async () => {
    mountWithPinia(Notifications, { lang: 'en' });
    const store = useMockNotificationsStore();
    store.notifications = [
      notification('n-a', 'alert', true),
      notification('n-o', 'order', true),
    ];
    await nextTick();

    clickButtonByText('Mark read');
    await nextTick();
    expect(store.notifications.every(n => !n.unread)).toBe(true);

    clickButtonByText('Clear all');
    await nextTick();
    expect(store.notifications).toEqual([]);
    expect(document.body.textContent).toContain('No notifications match this filter');
  });

  it('Notifications.vue clear-all resets a selected heatmap day before later notifications arrive', async () => {
    const now = new Date();
    const todayKey = localDateKey(now);
    const yesterdayKey = localDateKey(addDays(now, -1));
    mountWithPinia(Notifications, { lang: 'en' });
    const store = useMockNotificationsStore();
    store.notifications = [
      { ...notification('n-yesterday', 'alert', true), dateKey: yesterdayKey },
      { ...notification('n-today', 'order', true), dateKey: todayKey },
    ];
    await nextTick();

    const activeCells = [...document.body.querySelectorAll<HTMLElement>('.hm-cell')]
      .filter(cell => !cell.classList.contains('empty') && !cell.classList.contains('lvl-0'));
    expect(activeCells.length).toBeGreaterThan(0);
    activeCells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('.day-pin')).toBeTruthy();

    clickButtonByText('Clear all');
    await nextTick();
    expect(document.body.querySelector('.day-pin')).toBeFalsy();

    store.notifications = [
      { ...notification('n-after-clear', 'order', true), dateKey: todayKey, text: 'visible after clear' },
    ];
    await nextTick();
    expect(document.body.textContent).toContain('visible after clear');
  });

  it('Notifications.vue saves edited rules to notification preferences', async () => {
    mountWithPinia(Notifications, { lang: 'en' });
    const store = useMockNotificationsStore();

    clickButtonByText('Rules');
    await nextTick();
    const checkboxes = [...document.body.querySelectorAll<HTMLInputElement>('.rule-row input[type="checkbox"]')];
    expect(checkboxes.length).toBeGreaterThan(1);
    expect(store.notificationPrefs.alertVol).toBe(true);

    checkboxes[1].click();
    await nextTick();
    clickButtonByText('Save Rules');
    await nextTick();

    expect(store.notificationPrefs.alertVol).toBe(false);
    expect(document.body.textContent).toContain('Saved');
  });

  it('Alerts.vue rejects alert creation with no selected channels', async () => {
    mountWithPinia(Alerts, { lang: 'en' });
    const store = useMockNotificationsStore();
    const initialAlerts = store.alerts.length;
    const initialNotifications = store.notifications.length;

    clickButtonByText('New alert');
    await nextTick();
    clickButtonByText('Push');
    await nextTick();
    clickButtonByText('Save');
    await nextTick();

    expect(store.alerts).toHaveLength(initialAlerts);
    expect(store.notifications).toHaveLength(initialNotifications);
    expect(document.body.textContent).toContain('Select at least one channel');
  });

  it('Alerts.vue rejects alert creation with an invalid target', async () => {
    mountWithPinia(Alerts, { lang: 'en' });
    const store = useMockNotificationsStore();
    const initialAlerts = store.alerts.length;
    const targetInput = () => document.body.querySelector<HTMLInputElement>('input[type="number"]');

    clickButtonByText('New alert');
    await nextTick();
    expect(targetInput()).toBeTruthy();
    targetInput()!.value = '0';
    targetInput()!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    clickButtonByText('Save');
    await nextTick();

    expect(store.alerts).toHaveLength(initialAlerts);
    expect(document.body.textContent).toContain('Enter a target greater than 0');
  });

  it('rejects invalid alert channel and target payloads in the store', () => {
    const store = setupStore();
    const initialAlerts = store.alerts.length;
    const initialNotifications = store.notifications.length;

    store.addAlert({
      sym: 'AAPL',
      name: 'Apple Inc.',
      cat: 'stock',
      condition: 'above',
      target: 220,
      channels: [],
    });
    store.addAlert({
      sym: 'MSFT',
      name: 'Microsoft Corp.',
      cat: 'stock',
      condition: 'below',
      target: Number.NaN,
      channels: ['push'],
    });

    expect(store.alerts).toHaveLength(initialAlerts);
    expect(store.notifications).toHaveLength(initialNotifications);

    const alert = store.alerts[0];
    const originalChannels = [...alert.channels];
    const originalTarget = alert.target;
    store.updateAlert(alert.id, { channels: [] });
    store.updateAlert(alert.id, { target: Number.POSITIVE_INFINITY });

    expect(store.alerts[0].channels).toEqual(originalChannels);
    expect(store.alerts[0].target).toBe(originalTarget);
  });
});
