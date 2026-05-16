import { defineStore } from 'pinia';
import { ALERTS, ALERT_EVENTS } from '../data';
import type { Alert, AlertChannel, AlertEvent, MockNotification, NotificationPrefs } from '../types';

const VALID_ALERT_CHANNELS = new Set<AlertChannel>(['push', 'email', 'sound']);

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  alertCross: true,
  alertVol: true,
  alertNews: false,
  orderFill: true,
  orderPartial: true,
  orderReject: true,
  orderStop: true,
  sysApi: true,
  sysMargin: true,
  sysAi: true,
  quietEnable: false,
  quietFrom: '22:00',
  quietTo: '07:00',
};

export function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const todayKey = localDateKey();

const DEFAULT_NOTIFICATIONS: MockNotification[] = [
  { id: 'n1', kind: 'alert', sym: 'NVDA', text: 'NVDA crossed above $1,140', time: '2m', unread: true, dateKey: todayKey },
  { id: 'n2', kind: 'news', sym: '2330.TW', text: 'TSMC Q1 revenue beats estimates +12% YoY', time: '14m', unread: true, dateKey: todayKey },
  { id: 'n3', kind: 'order', sym: 'BTC', text: 'BUY 0.05 BTC @ market filled', time: '1h', unread: true, dateKey: todayKey },
  { id: 'n4', kind: 'system', text: 'Portfolio recalculation completed', time: '3h', unread: false, dateKey: todayKey },
];

function cloneAlert(alert: Alert): Alert {
  return { ...alert, channels: [...alert.channels] };
}

function cloneAlertEvent(event: AlertEvent): AlertEvent {
  return { ...event };
}

function cloneNotification(notification: MockNotification): MockNotification {
  return { ...notification };
}

function normalizeChannels(channels: AlertChannel[] | undefined): AlertChannel[] | null {
  if (!Array.isArray(channels)) return null;
  const normalized = channels.filter((channel, index) =>
    VALID_ALERT_CHANNELS.has(channel) && channels.indexOf(channel) === index);
  return normalized.length > 0 ? normalized : null;
}

function hasValidTarget(condition: Alert['condition'], target: number): boolean {
  if (condition === 'news') return true;
  return Number.isFinite(target) && target > 0;
}

export const useMockNotificationsStore = defineStore('mockNotifications', {
  state: () => ({
    alerts: ALERTS.map(cloneAlert) as Alert[],
    alertEvents: ALERT_EVENTS.map(cloneAlertEvent) as AlertEvent[],
    notifications: DEFAULT_NOTIFICATIONS.map(cloneNotification) as MockNotification[],
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS } as NotificationPrefs,
    alertSeq: 100,
    notificationSeq: 100,
  }),
  actions: {
    pushNotification(input: Omit<MockNotification, 'id' | 'dateKey'> & { dateKey?: string }) {
      this.notifications.unshift({
        ...input,
        id: 'n' + (++this.notificationSeq),
        dateKey: input.dateKey ?? localDateKey(),
      });
    },
    addAlert(a: Omit<Alert, 'id' | 'created' | 'triggerCount' | 'status'> & { status?: Alert['status'] }) {
      const channels = normalizeChannels(a.channels);
      if (!channels || !hasValidTarget(a.condition, a.target)) return null;
      const created = localDateKey();
      const alert = {
        ...a,
        channels,
        id: 'al' + (++this.alertSeq),
        created,
        triggerCount: 0,
        status: a.status ?? 'active',
      };
      this.alerts.unshift(alert);
      this.pushNotification({
        kind: 'alert',
        sym: a.sym,
        text: `${a.sym} alert created: ${a.condition}`,
        time: 'now',
        unread: true,
      });
      return alert;
    },
    updateAlert(id: string, patch: Partial<Alert>) {
      const idx = this.alerts.findIndex(a => a.id === id);
      if (idx >= 0) {
        const current = this.alerts[idx];
        const next = { ...current, ...patch, channels: [...current.channels] };
        if ('channels' in patch) {
          const channels = normalizeChannels(patch.channels);
          if (!channels) return false;
          next.channels = channels;
        }
        if (!hasValidTarget(next.condition, next.target)) return false;
        this.alerts[idx] = next;
        return true;
      }
      return false;
    },
    removeAlert(id: string) {
      const idx = this.alerts.findIndex(a => a.id === id);
      if (idx >= 0) this.alerts.splice(idx, 1);
    },
    toggleAlertMute(id: string) {
      const idx = this.alerts.findIndex(x => x.id === id);
      if (idx < 0) return;
      const a = this.alerts[idx];
      this.alerts[idx] = { ...a, status: a.status === 'muted' ? 'active' : 'muted' };
    },
    markAllNotificationsRead() {
      this.notifications = this.notifications.map(n => ({ ...n, unread: false }));
    },
    clearNotifications() {
      this.notifications.splice(0, this.notifications.length);
    },
    updateNotificationPrefs(patch: Partial<NotificationPrefs>) {
      Object.assign(this.notificationPrefs, patch);
    },
  },
});
