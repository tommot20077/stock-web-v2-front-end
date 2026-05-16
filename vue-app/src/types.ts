// Type definitions shared across the app
export type Lang = 'zh' | 'en';
export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'cozy' | 'comfy';
export type Page = 'overview' | 'markets' | 'positions' | 'analytics' | 'trades' | 'notifications' | 'settings' | 'ops' | 'chart' | 'watchlist' | 'backtest' | 'alerts';

export type AlertCondition = 'above' | 'below' | 'cross_up' | 'cross_down' | 'pct_up' | 'pct_down' | 'vol_spike' | 'news';
export type AlertStatus = 'active' | 'triggered' | 'muted';
export type AlertChannel = 'push' | 'email' | 'sound';

export interface Alert {
  id: string;
  sym: string;
  name: string;
  cat: 'stock' | 'crypto' | 'fx' | 'bond';
  condition: AlertCondition;
  target: number;        // price or percent
  window?: string;       // e.g. '24h', '1w' for pct conditions
  status: AlertStatus;
  channels: AlertChannel[];
  created: string;       // ISO date
  lastTriggered?: string;
  triggerCount: number;
  note?: string;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  sym: string;
  condition: AlertCondition;
  target: number;
  actual: number;
  time: string;          // ISO datetime
  read: boolean;
}
export type MarketTab = 'stocks' | 'forex' | 'crypto' | 'bonds' | 'watchlist';
export type AssetCat = 'stock' | 'crypto' | 'fx' | 'bond';

export interface Symbol {
  sym: string;
  name: string;
  price: number;
  chg: number;
  chgPct: number;
  vol: string;
  high: number;
  low: number;
  mcap?: string;
  pe?: number;
  sector?: string;
  cat: Exclude<AssetCat, 'bond'>;
  star?: boolean;
}

export interface Bond {
  sym: string;
  name: string;
  country: string;
  yld: number;
  chg: number;
  dur: string;
  cat: 'bond';
  star?: boolean;
}

export interface Position {
  sym: string;
  name: string;
  qty: number;
  avg: number;
  price: number;
  sector: string;
}

export interface Trade {
  d: string;
  type: 'BUY' | 'SELL' | 'DIV';
  sym: string;
  qty: number;
  px: number;
  fee: number;
  note: string;
}

export interface Notif {
  id: number;
  type: 'alert' | 'news' | 'system';
  sym?: string;
  text: string;
  time: string;
  unread: boolean;
}

export interface NewsItem {
  src: string;
  t: string;
  tag: string;
  time: string;
}

export interface OpLogEntry {
  d: string;
  op: string;
  who: string;
  ok: boolean;
  dur: string;
}

export interface KPI {
  l: string;
  v: string;
  s: string;
  up: boolean | null;
}

export interface Watchlist {
  id: string;
  name: string;
  syms: string[];
}

export type MockNotificationKind = 'alert' | 'order' | 'news' | 'system';

export interface MockNotification {
  id: string;
  kind: MockNotificationKind;
  sym?: string;
  text: string;
  time: string;
  unread: boolean;
  dateKey: string;
}

export interface NotificationPrefs {
  alertCross: boolean;
  alertVol: boolean;
  alertNews: boolean;
  orderFill: boolean;
  orderPartial: boolean;
  orderReject: boolean;
  orderStop: boolean;
  sysApi: boolean;
  sysMargin: boolean;
  sysAi: boolean;
  quietEnable: boolean;
  quietFrom: string;
  quietTo: string;
}

export interface OpsRun {
  id: string;
  key: string;
  label: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
}

export interface BacktestRun {
  id: string;
  strategy: string;
  sym: string;
  period: string;
  initial: number;
  seed: number;
  createdAt: string;
  label: string;
}
