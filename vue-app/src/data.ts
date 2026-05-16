// Mock data + helpers
import type { Symbol, Bond, Position, Trade, Notif, NewsItem, OpLogEntry, Alert, AlertEvent } from './types';

export const SYMBOLS: Symbol[] = [
  { sym: 'AAPL', name: 'Apple Inc.', price: 218.40, chg: 1.42, chgPct: 0.66, vol: '52.1M', high: 219.10, low: 215.80, mcap: '3.31T', pe: 33.4, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'NVDA', name: 'NVIDIA Corp.', price: 1142.83, chg: 28.40, chgPct: 2.55, vol: '38.4M', high: 1148.20, low: 1118.00, mcap: '2.81T', pe: 71.2, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'TSLA', name: 'Tesla, Inc.', price: 178.22, chg: -3.18, chgPct: -1.75, vol: '94.3M', high: 182.60, low: 177.40, mcap: '566B', pe: 45.1, sector: 'Auto', cat: 'stock' },
  { sym: 'MSFT', name: 'Microsoft Corp.', price: 432.85, chg: 2.10, chgPct: 0.49, vol: '18.2M', high: 433.90, low: 430.10, mcap: '3.22T', pe: 37.8, sector: 'Tech', cat: 'stock' },
  { sym: '2330.TW', name: '台積電 TSMC', price: 945.00, chg: 12.00, chgPct: 1.29, vol: '32.0M', high: 950.00, low: 932.00, mcap: 'NT$24.5T', pe: 28.6, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'GOOGL', name: 'Alphabet Inc.', price: 174.62, chg: 0.84, chgPct: 0.48, vol: '21.0M', high: 175.10, low: 172.80, mcap: '2.15T', pe: 26.4, sector: 'Tech', cat: 'stock' },
  { sym: 'AMZN', name: 'Amazon.com', price: 192.34, chg: -1.04, chgPct: -0.54, vol: '32.4M', high: 195.20, low: 191.40, mcap: '2.02T', pe: 51.2, sector: 'Retail', cat: 'stock' },
  { sym: 'META', name: 'Meta Platforms', price: 514.20, chg: 4.32, chgPct: 0.85, vol: '14.8M', high: 516.00, low: 508.40, mcap: '1.30T', pe: 28.1, sector: 'Tech', cat: 'stock' },
];

export const CRYPTO: Symbol[] = [
  { sym: 'BTC', name: 'Bitcoin', price: 67842.40, chg: 1842.10, chgPct: 2.79, vol: '$28.4B', high: 68120, low: 65400, mcap: '$1.34T', cat: 'crypto', star: true },
  { sym: 'ETH', name: 'Ethereum', price: 3482.18, chg: 84.20, chgPct: 2.48, vol: '$14.2B', high: 3510, low: 3380, mcap: '$418B', cat: 'crypto' },
  { sym: 'SOL', name: 'Solana', price: 168.42, chg: -2.18, chgPct: -1.28, vol: '$3.4B', high: 172.20, low: 166.80, mcap: '$78B', cat: 'crypto' },
];

export const FX: Symbol[] = [
  { sym: 'USD/TWD', name: '美元/新台幣', price: 32.418, chg: 0.024, chgPct: 0.07, vol: '—', high: 32.450, low: 32.380, cat: 'fx' },
  { sym: 'EUR/USD', name: '歐元/美元', price: 1.0832, chg: -0.0014, chgPct: -0.13, vol: '—', high: 1.0851, low: 1.0820, cat: 'fx' },
  { sym: 'USD/JPY', name: '美元/日圓', price: 156.42, chg: 0.32, chgPct: 0.20, vol: '—', high: 156.80, low: 155.90, cat: 'fx' },
];

export const BONDS: Bond[] = [
  { sym: 'US10Y', name: 'US 10-Year Treasury', country: 'US', yld: 4.218, chg: 0.014, dur: '10Y', cat: 'bond' },
  { sym: 'US2Y', name: 'US 2-Year Treasury', country: 'US', yld: 4.842, chg: -0.012, dur: '2Y', cat: 'bond' },
  { sym: 'DE10Y', name: 'German 10-Year Bund', country: 'DE', yld: 2.458, chg: 0.008, dur: '10Y', cat: 'bond' },
  { sym: 'JP10Y', name: 'Japan 10-Year', country: 'JP', yld: 0.984, chg: 0.018, dur: '10Y', cat: 'bond' },
  { sym: 'TW10Y', name: '中華民國 10-Year', country: 'TW', yld: 1.642, chg: 0.004, dur: '10Y', cat: 'bond' },
];

export const POSITIONS: Position[] = [
  { sym: 'AAPL', name: 'Apple Inc.', qty: 120, avg: 178.20, price: 218.40, sector: 'Tech' },
  { sym: 'NVDA', name: 'NVIDIA Corp.', qty: 40, avg: 480.10, price: 1142.83, sector: 'Tech' },
  { sym: '2330.TW', name: '台積電', qty: 1000, avg: 720.00, price: 945.00, sector: 'Tech' },
  { sym: 'BTC', name: 'Bitcoin', qty: 0.42, avg: 42180, price: 67842.40, sector: 'Crypto' },
  { sym: 'ETH', name: 'Ethereum', qty: 6.5, avg: 2180, price: 3482.18, sector: 'Crypto' },
  { sym: 'MSFT', name: 'Microsoft', qty: 30, avg: 348.40, price: 432.85, sector: 'Tech' },
];

export const TRADES: Trade[] = [
  { d: '2026-04-29', type: 'BUY', sym: 'NVDA', qty: 10, px: 1138.40, fee: 5, note: '加碼' },
  { d: '2026-04-28', type: 'SELL', sym: 'TSLA', qty: 25, px: 182.10, fee: 4, note: '停利' },
  { d: '2026-04-26', type: 'DIV', sym: 'AAPL', qty: 120, px: 0.24, fee: 0, note: '季度配息' },
  { d: '2026-04-22', type: 'BUY', sym: 'BTC', qty: 0.05, px: 65240, fee: 12, note: 'DCA' },
  { d: '2026-04-18', type: 'BUY', sym: '2330.TW', qty: 200, px: 932.00, fee: 28, note: '' },
  { d: '2026-04-12', type: 'SELL', sym: 'GOOGL', qty: 15, px: 172.80, fee: 4, note: '' },
  { d: '2026-04-08', type: 'BUY', sym: 'ETH', qty: 1.2, px: 3280, fee: 8, note: '' },
];

export const NOTIFS: Notif[] = [
  { id: 1, type: 'alert', sym: 'NVDA', text: 'NVDA crossed above $1,140', time: '2m', unread: true },
  { id: 2, type: 'news', sym: '2330.TW', text: 'TSMC Q1 revenue beats estimates +12% YoY', time: '14m', unread: true },
  { id: 3, type: 'alert', sym: 'BTC', text: 'BTC daily volatility > 4%', time: '1h', unread: true },
  { id: 4, type: 'system', text: 'Portfolio recalculation completed', time: '3h', unread: false },
  { id: 5, type: 'news', sym: 'AAPL', text: 'Apple announces new MacBook lineup', time: '5h', unread: false },
];

export const NEWS: NewsItem[] = [
  { src: 'Reuters', t: 'Fed signals rate cuts may begin Q3 amid cooling inflation', tag: 'Macro', time: '8m' },
  { src: 'Bloomberg', t: 'NVIDIA closes above $1,140 on strong AI demand', tag: 'NVDA', time: '24m' },
  { src: '經濟日報', t: '台積電 4 月營收創新高，AI 訂單續強', tag: '2330', time: '1h' },
  { src: 'CoinDesk', t: 'Bitcoin reclaims $67k as ETF inflows resume', tag: 'BTC', time: '2h' },
  { src: 'WSJ', t: 'Tesla deliveries miss as China competition intensifies', tag: 'TSLA', time: '3h' },
];

export const OPLOG: OpLogEntry[] = [
  { d: '2026-04-30 09:14', op: 'Refetch news', who: 'admin', ok: true, dur: '2.4s' },
  { d: '2026-04-30 08:00', op: 'Recalc positions', who: 'system', ok: true, dur: '12.8s' },
  { d: '2026-04-29 23:00', op: 'Refetch markets', who: 'system', ok: true, dur: '4.1s' },
  { d: '2026-04-29 18:42', op: 'Refetch bonds', who: 'admin', ok: false, dur: '8.0s' },
  { d: '2026-04-29 14:12', op: 'Reimport K-line', who: 'admin', ok: true, dur: '1m 22s' },
];

// Deterministic price-series generator for charts
export function genSeries(n: number, start: number, vol: number, seed = 1): number[] {
  let s = seed;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + (r() - 0.48) * vol);
    out.push(p);
  }
  return out;
}

export const fmtNum = (n: number, dp = 2): string => {
  if (n == null || !isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  return sign + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export const fmtPct = (n: number): string => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

export const ALERTS: Alert[] = [
  { id: 'al1', sym: 'NVDA', name: 'NVIDIA Corp.', cat: 'stock', condition: 'above', target: 1200, status: 'active', channels: ['push', 'email'], created: '2026-04-15', triggerCount: 0, note: '突破前高再加碼' },
  { id: 'al2', sym: 'AAPL', name: 'Apple Inc.', cat: 'stock', condition: 'below', target: 200, status: 'active', channels: ['push'], created: '2026-04-20', triggerCount: 0 },
  { id: 'al3', sym: 'BTC', name: 'Bitcoin', cat: 'crypto', condition: 'pct_down', target: 5, window: '24h', status: 'triggered', channels: ['push', 'sound'], created: '2026-04-10', lastTriggered: '2026-04-30 03:42', triggerCount: 3, note: '24h 跌 5% 通知' },
  { id: 'al4', sym: 'TSLA', name: 'Tesla, Inc.', cat: 'stock', condition: 'cross_down', target: 180, status: 'triggered', channels: ['push'], created: '2026-04-22', lastTriggered: '2026-04-29 14:12', triggerCount: 1 },
  { id: 'al5', sym: '2330.TW', name: '台積電', cat: 'stock', condition: 'above', target: 1000, status: 'active', channels: ['push', 'email'], created: '2026-04-05', triggerCount: 0, note: '到目標減碼' },
  { id: 'al6', sym: 'ETH', name: 'Ethereum', cat: 'crypto', condition: 'vol_spike', target: 200, window: '1h', status: 'active', channels: ['push'], created: '2026-04-25', triggerCount: 0 },
  { id: 'al7', sym: 'USD/TWD', name: '美元/新台幣', cat: 'fx', condition: 'above', target: 33, status: 'muted', channels: ['email'], created: '2026-03-28', triggerCount: 0 },
  { id: 'al8', sym: 'NVDA', name: 'NVIDIA Corp.', cat: 'stock', condition: 'news', target: 0, status: 'active', channels: ['push'], created: '2026-04-12', triggerCount: 7, lastTriggered: '2026-04-30 09:18' },
  { id: 'al9', sym: 'SOL', name: 'Solana', cat: 'crypto', condition: 'pct_up', target: 8, window: '24h', status: 'active', channels: ['push', 'sound'], created: '2026-04-26', triggerCount: 1, lastTriggered: '2026-04-28 21:04' },
];

export const ALERT_EVENTS: AlertEvent[] = [
  { id: 'ev1', alertId: 'al8', sym: 'NVDA', condition: 'news', target: 0, actual: 0, time: '2026-04-30 09:18', read: false },
  { id: 'ev2', alertId: 'al3', sym: 'BTC', condition: 'pct_down', target: 5, actual: -5.42, time: '2026-04-30 03:42', read: false },
  { id: 'ev3', alertId: 'al4', sym: 'TSLA', condition: 'cross_down', target: 180, actual: 178.22, time: '2026-04-29 14:12', read: true },
  { id: 'ev4', alertId: 'al9', sym: 'SOL', condition: 'pct_up', target: 8, actual: 9.10, time: '2026-04-28 21:04', read: true },
  { id: 'ev5', alertId: 'al8', sym: 'NVDA', condition: 'news', target: 0, actual: 0, time: '2026-04-28 16:00', read: true },
  { id: 'ev6', alertId: 'al3', sym: 'BTC', condition: 'pct_down', target: 5, actual: -5.10, time: '2026-04-25 11:20', read: true },
];
