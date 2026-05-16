// Generate realistic OHLC candle data for AAPL-like
// 90 days of data, ending around $192

const generateCandles = () => {
  const candles = [];
  let price = 178;
  const seed = (i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  for (let i = 0; i < 90; i++) {
    const r1 = Math.abs(seed(i + 1));
    const r2 = Math.abs(seed(i + 7));
    const r3 = Math.abs(seed(i + 13));
    const trend = i / 90 * 14; // overall up
    const wiggle = Math.sin(i * 0.4) * 6 + Math.sin(i * 0.13) * 4;
    const noise = (r1 - 0.5) * 4;
    const close = 178 + trend + wiggle + noise;
    const open = i === 0 ? 178 : candles[i - 1].close + (r2 - 0.5) * 1.2;
    const high = Math.max(open, close) + r3 * 2.5;
    const low = Math.min(open, close) - r1 * 2.5;
    const vol = 30 + Math.abs(r2 - 0.5) * 80 + (Math.abs(close - open) > 2 ? 40 : 0);
    candles.push({ i, open, high, low, close, vol, ts: Date.now() - (90 - i) * 86400000 });
    price = close;
  }
  return candles;
};

const CANDLES = generateCandles();
const LATEST = CANDLES[CANDLES.length - 1];
const PREV = CANDLES[CANDLES.length - 2];
const CHANGE = LATEST.close - PREV.close;
const CHANGE_PCT = (CHANGE / PREV.close) * 100;

// Helpers
const fmt = (n, d = 2) => n.toFixed(d);
const fmtVol = (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'B' : v.toFixed(1) + 'M';

// Compute MA
const computeMA = (candles, period) => {
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    const sum = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0);
    return sum / period;
  });
};

// Bollinger Bands
const computeBB = (candles, period = 20, mult = 2) => {
  const ma = computeMA(candles, period);
  return candles.map((c, i) => {
    if (i < period - 1) return { upper: null, lower: null, mid: null };
    const slice = candles.slice(i - period + 1, i + 1);
    const m = ma[i];
    const variance = slice.reduce((s, x) => s + (x.close - m) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: m + mult * std, lower: m - mult * std, mid: m };
  });
};

Object.assign(window, { CANDLES, LATEST, PREV, CHANGE, CHANGE_PCT, fmt, fmtVol, computeMA, computeBB });
