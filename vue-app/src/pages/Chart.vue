<script lang="ts">
const tradingViewScriptSrc = 'https://s3.tradingview.com/tv.js';
let tradingViewLoadPromise: Promise<void> | null = null;
let tradingViewLoadState: 'idle' | 'loading' | 'loaded' | 'failed' = 'idle';

function removeTradingViewScript(script: HTMLScriptElement | null) {
  if (script?.parentNode) script.parentNode.removeChild(script);
}

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('TradingView is only available in the browser'));
  }
  if ((window as any).TradingView) {
    tradingViewLoadState = 'loaded';
    return Promise.resolve();
  }
  if (tradingViewLoadPromise) return tradingViewLoadPromise;
  if (tradingViewLoadState === 'failed') {
    document.querySelectorAll<HTMLScriptElement>(`script[src="${tradingViewScriptSrc}"]`).forEach(removeTradingViewScript);
    tradingViewLoadState = 'idle';
  }

  tradingViewLoadPromise = new Promise((resolve, reject) => {
    let existing = document.querySelector<HTMLScriptElement>(`script[src="${tradingViewScriptSrc}"]`);
    if (existing) {
      removeTradingViewScript(existing);
      existing = null;
    }
    const script = existing ?? document.createElement('script');
    tradingViewLoadState = 'loading';
    script.dataset.tvLoadState = 'loading';

    const fail = () => {
      script.dataset.tvLoadState = 'failed';
      tradingViewLoadState = 'failed';
      tradingViewLoadPromise = null;
      removeTradingViewScript(script);
      reject(new Error('TradingView script failed to load'));
    };
    const done = () => {
      if ((window as any).TradingView) {
        script.dataset.tvLoadState = 'loaded';
        tradingViewLoadState = 'loaded';
        resolve();
      } else {
        fail();
      }
    };

    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', fail, { once: true });

    if (!existing) {
      script.src = tradingViewScriptSrc;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return tradingViewLoadPromise;
}
</script>

<template>
  <div class="page">
    <!-- Top bar -->
    <div class="topbar">
      <button class="back" @click="$emit('back')">← {{ t(lang, 'markets') }}</button>
      <div class="sym-block">
        <div class="sym-line">
          <span class="sym-tag">{{ (symbol?.cat || 'unknown').toUpperCase() }}</span>
          <h1 class="sym-name">{{ sym }}</h1>
          <span class="sym-co">{{ symbol?.name || '' }}</span>
          <span class="exch">{{ exchangeLabel }}</span>
        </div>
        <div class="px-line">
          <span class="px num">{{ primaryValue }}</span>
          <span v-if="primaryChange" class="px-chg" :class="changeClass">
            {{ primaryChange }}
          </span>
          <span class="live-pill"><span class="live-dot" />LIVE</span>
        </div>
      </div>
      <div class="top-actions">
        <button class="btn-ghost" @click="portfolio.toggleWatch(sym)">{{ starred ? '★' : '☆' }} Watch</button>
        <template v-if="canOrder">
          <button class="btn-accent buy" @click="$emit('order', { sym, side: 'BUY' })">{{ t(lang, 'buy') }}</button>
          <button class="btn-accent sell" @click="$emit('order', { sym, side: 'SELL' })">{{ t(lang, 'sell') }}</button>
        </template>
        <span v-else class="order-unavailable" :title="orderUnavailableText">{{ orderUnavailableText }}</span>
      </div>
    </div>

    <!-- TradingView widget -->
    <div class="chart-card">
      <div v-if="chartError" class="chart-fallback">
        <div style="font-weight:600">{{ lang === 'zh' ? '圖表暫時無法載入' : 'Chart unavailable' }}</div>
        <div style="color:var(--fg-dim);margin-top:4px">{{ chartError }}</div>
      </div>
      <div :id="containerId" class="tv-chart"></div>
    </div>

    <!-- Bottom row: stats + order book + tape -->
    <div class="bottom-grid">
      <div class="card">
        <div class="card-hd">Key statistics</div>
        <div class="stat-grid">
          <div v-for="stat in statItems" :key="stat.label">
            <span>{{ stat.label }}</span>
            <b class="num">{{ stat.value }}</b>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd">Order book <span class="hd-sub">L2 · 0.01</span></div>
        <table v-if="marketSimulationAvailable" class="ob">
          <tbody>
            <tr v-for="(o, i) in asks" :key="'a' + i" class="ask">
              <td class="num">{{ fmt(o.px) }}</td>
              <td class="num dim">{{ o.qty }}</td>
              <td><div class="depth dn-bg" :style="{ width: o.pct + '%' }" /></td>
            </tr>
            <tr class="spread"><td colspan="3"><span>Spread {{ spread }} · Mid {{ midText }}</span></td></tr>
            <tr v-for="(o, i) in bids" :key="'b' + i" class="bid">
              <td class="num">{{ fmt(o.px) }}</td>
              <td class="num dim">{{ o.qty }}</td>
              <td><div class="depth up-bg" :style="{ width: o.pct + '%' }" /></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="mini-empty">{{ simulationUnavailableText }}</div>
      </div>

      <div class="card">
        <div class="card-hd">Time &amp; sales</div>
        <table v-if="marketSimulationAvailable" class="ts">
          <tbody>
            <tr v-for="(t2, i) in tape" :key="i" :class="t2.side">
              <td class="num">{{ t2.time }}</td>
              <td class="num">{{ fmt(t2.px) }}</td>
              <td class="num dim">{{ t2.qty }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="mini-empty">{{ simulationUnavailableText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { SYMBOLS, CRYPTO, FX, BONDS } from '../data';
import { t } from '../i18n';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang; sym: string; themeMode: 'tv' | 'mixed' }>();
defineEmits<{ order: [preset: { sym: string; side?: 'BUY' | 'SELL' }]; back: [] }>();

const portfolio = useMockPortfolioStore();
const allInstruments = computed(() => [...SYMBOLS, ...CRYPTO, ...FX, ...BONDS]);
const symbol = computed(() => allInstruments.value.find(s => s.sym === props.sym));
const chartError = ref('');
const starred = computed(() => portfolio.isWatched(props.sym));
const canOrder = computed(() => !!symbol.value && symbol.value.cat !== 'bond');
const orderUnavailableText = computed(() =>
  props.lang === 'zh' ? '債券殖利率不可下單' : 'Bond yield orders unavailable',
);

const containerId = `tv_chart_${Math.random().toString(36).slice(2, 8)}`;

// Map our symbols to TradingView ticker format
function tvSymbol(s: string): string | null {
  const instrument = allInstruments.value.find(item => item.sym === s);
  if (!instrument) return null;
  if (instrument.cat === 'bond') return null;
  if (['BTC', 'ETH', 'SOL'].includes(s)) return `BINANCE:${s}USDT`;
  if (s === '2330.TW') return 'TPE:2330';
  if (instrument.cat === 'fx') return 'FX_IDC:' + s.replace('/', '');
  return `NASDAQ:${s}`;
}

const exchangeLabel = computed(() => {
  const tv = tvSymbol(props.sym);
  if (!symbol.value) return 'UNRESOLVED';
  if (symbol.value.cat === 'bond') {
    const bond = symbol.value as any;
    return `${bond.country ?? 'BOND'} · ${bond.dur ?? 'Yield'}`;
  }
  if (!tv) return 'UNAVAILABLE';
  return tv.split(':')[0] + ' · ' + (symbol.value.cat === 'fx' ? 'FX' : 'USD');
});

let widget: any = null;
let mountSeq = 0;
let unmounted = false;

function cleanupWidget() {
  const current = widget;
  widget = null;
  if (current) {
    try {
      if (typeof current.remove === 'function') current.remove();
      else if (typeof current.destroy === 'function') current.destroy();
    } catch {
      // Third-party widgets are allowed to fail cleanup; the container is still cleared below.
    }
  }
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

async function mountWidget() {
  const seq = ++mountSeq;
  chartError.value = '';
  cleanupWidget();

  const tv = tvSymbol(props.sym);
  if (!symbol.value) {
    chartError.value = props.lang === 'zh' ? '找不到此標的資料' : 'Instrument data is unavailable';
    return;
  }
  if (!tv) {
    chartError.value = props.lang === 'zh' ? '此債券殖利率暫無 TradingView 圖表' : 'TradingView widget is unavailable for this bond yield';
    return;
  }

  try {
    await loadTradingViewScript();
    if (unmounted || seq !== mountSeq) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    widget = new (window as any).TradingView.widget({
      container_id: containerId,
      symbol: tv,
      interval: 'D',
      timezone: 'Asia/Taipei',
      theme: props.themeMode === 'mixed' ? 'dark' : 'dark',
      style: '1',
      locale: props.lang === 'zh' ? 'zh_TW' : 'en',
      enable_publishing: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      studies: ['MASimple@tv-basicstudies', 'Volume@tv-basicstudies'],
      autosize: true,
      backgroundColor: props.themeMode === 'mixed' ? '#0d1117' : '#131722',
      gridColor: props.themeMode === 'mixed' ? '#1f2632' : '#1e222d',
    });
  } catch (e: any) {
    if (unmounted || seq !== mountSeq) return;
    chartError.value = e?.message || 'Chart unavailable';
  }
}

onMounted(mountWidget);
onBeforeUnmount(() => {
  unmounted = true;
  mountSeq++;
  cleanupWidget();
});
watch(() => [props.sym, props.themeMode, props.lang], () => { mountWidget(); });

// --- Order book / tape (synthetic) ---
const quotePrice = computed(() => {
  const instrument = symbol.value as any;
  if (!instrument || instrument.cat === 'bond' || typeof instrument.price !== 'number') return null;
  return instrument.price;
});
const marketSimulationAvailable = computed(() => quotePrice.value != null);
const mid = computed(() => quotePrice.value);
const midText = computed(() => fmt(mid.value));
const spread = computed(() => (mid.value == null ? '—' : (mid.value * 0.0003).toFixed(2)));
const asks = computed(() => {
  const out: { px: number; qty: number; pct: number }[] = [];
  if (mid.value == null) return out;
  for (let i = 0; i < 8; i++) {
    const px = mid.value + (i + 1) * mid.value * 0.0003;
    const qty = Math.floor((Math.sin(i + 3) + 1.5) * 800 + 200);
    out.push({ px, qty, pct: 30 + Math.abs(Math.sin(i + 3)) * 60 });
  }
  return out.reverse();
});
const bids = computed(() => {
  const out: { px: number; qty: number; pct: number }[] = [];
  if (mid.value == null) return out;
  for (let i = 0; i < 8; i++) {
    const px = mid.value - (i + 1) * mid.value * 0.0003;
    const qty = Math.floor((Math.cos(i + 1) + 1.5) * 800 + 200);
    out.push({ px, qty, pct: 30 + Math.abs(Math.cos(i + 1)) * 60 });
  }
  return out;
});

const tape = computed(() => {
  const out: { time: string; px: number; qty: number; side: 'b' | 's' }[] = [];
  if (mid.value == null) return out;
  for (let i = 0; i < 12; i++) {
    const r = Math.sin(i * 7.3 + (props.sym.charCodeAt(1) || 0));
    const px = mid.value + r * mid.value * 0.0008;
    const qty = Math.floor(Math.abs(r * 600) + 50);
    const time = `15:${String(59 - Math.floor(i / 3)).padStart(2, '0')}:${String(58 - (i * 7) % 60).padStart(2, '0')}`;
    out.push({ time, px, qty, side: r > 0 ? 'b' : 's' });
  }
  return out;
});

const primaryValue = computed(() => {
  const instrument = symbol.value as any;
  if (!instrument) return '—';
  if (instrument.cat === 'bond') return `${fmt(instrument.yld, 3)}%`;
  return fmt(instrument.price, instrument.cat === 'fx' ? 4 : 2);
});
const primaryChangeValue = computed(() => {
  const instrument = symbol.value as any;
  if (!instrument || typeof instrument.chg !== 'number') return null;
  return instrument.chg;
});
const primaryChange = computed(() => {
  const instrument = symbol.value as any;
  if (!instrument || primaryChangeValue.value == null) return '';
  if (instrument.cat === 'bond') return signedFmt(primaryChangeValue.value, 3);
  return `${signedFmt(primaryChangeValue.value, instrument.cat === 'fx' ? 4 : 2)} (${signedFmt(instrument.chgPct, 2)}%)`;
});
const changeClass = computed(() => (primaryChangeValue.value ?? 0) >= 0 ? 'up' : 'dn');
const statItems = computed(() => {
  const instrument = symbol.value as any;
  if (!instrument) {
    return [
      { label: 'Status', value: 'Unavailable' },
      { label: 'Symbol', value: props.sym },
    ];
  }
  if (instrument.cat === 'bond') {
    return [
      { label: 'Yield', value: `${fmt(instrument.yld, 3)}%` },
      { label: 'Change', value: signedFmt(instrument.chg, 3) },
      { label: 'Country', value: instrument.country ?? '—' },
      { label: 'Duration', value: instrument.dur ?? '—' },
    ];
  }
  if (instrument.cat === 'fx') {
    return [
      { label: 'Open', value: fmt(instrument.price - instrument.chg, 4) },
      { label: 'Day high', value: fmt(instrument.high, 4) },
      { label: 'Day low', value: fmt(instrument.low, 4) },
      { label: 'Change', value: `${signedFmt(instrument.chg, 4)} (${signedFmt(instrument.chgPct, 2)}%)` },
      { label: 'Volume', value: instrument.vol ?? '—' },
      { label: 'Market', value: 'FX' },
    ];
  }
  return [
    { label: 'Open', value: fmt(instrument.price - instrument.chg) },
    { label: 'P/E', value: instrument.pe ?? '—' },
    { label: 'Day high', value: fmt(instrument.high) },
    { label: '52W high', value: fmt(instrument.high + 8) },
    { label: 'Day low', value: fmt(instrument.low) },
    { label: '52W low', value: fmt(instrument.low - 12) },
    { label: 'Volume', value: instrument.vol ?? '—' },
    { label: 'Mkt cap', value: instrument.mcap ?? '—' },
  ];
});
const simulationUnavailableText = computed(() =>
  props.lang === 'zh' ? '此標的不提供模擬逐筆資料' : 'Simulated market microstructure is unavailable for this instrument',
);

function fmt(n: number | null | undefined, d = 2) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—';
}
function signedFmt(n: number | null | undefined, d = 2) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmt(n, d)}`;
}
</script>

<style scoped>
.page { padding: 18px 22px 22px; }

/* Topbar */
.topbar { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
.back { background: transparent; border: 0; color: var(--fg-dim); font-size: 12px; cursor: pointer; padding: 4px 8px; }
.back:hover { color: var(--fg); }
.sym-block { flex: 1; display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap; }
.sym-line { display: flex; align-items: baseline; gap: 10px; }
.sym-tag { font-size: 9px; padding: 2px 6px; background: var(--surface2); border-radius: 4px; letter-spacing: 0.6px; color: var(--fg-dim); font-weight: 600; }
.sym-name { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sym-co { font-size: 13px; color: var(--fg-dim); }
.exch { font-size: 10px; color: var(--fg-mute); padding: 2px 6px; background: var(--surface2); border-radius: 4px; letter-spacing: .4px; }
.px-line { display: flex; align-items: baseline; gap: 10px; }
.px { font-size: 26px; font-weight: 600; letter-spacing: -0.6px; }
.px-chg { font-size: 13px; font-weight: 500; }
.px-chg.up { color: var(--up); }
.px-chg.dn { color: var(--dn); }
.live-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; background: rgba(22,163,74,0.12); color: var(--up); border-radius: 99px; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; }
.live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--up); animation: pulse 1.6s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.top-actions { display: flex; gap: 8px; }

.btn-ghost { background: var(--surface); border: 1px solid var(--border); color: var(--fg); padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; }
.btn-ghost:hover { background: var(--surface2); }
.btn-accent { color: #fff; border: 0; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-accent.buy { background: var(--up); }
.btn-accent.sell { background: var(--dn); }
.btn-accent:hover { transform: translateY(-1px); }
.order-unavailable {
  display: inline-flex;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--fg-mute);
  background: var(--surface);
  font-size: 12px;
  font-weight: 500;
}

/* Chart */
.chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; height: 560px; margin-bottom: 14px; position: relative; }
.chart-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--fg);
}
.tv-chart { width: 100%; height: 100%; }

/* Bottom 3-col grid */
.bottom-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.card-hd { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; }
.hd-sub { font-size: 10px; color: var(--fg-mute); font-weight: 400; font-family: 'JetBrains Mono', monospace; }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 4px; }
.stat-grid > div { display: flex; justify-content: space-between; padding: 9px 12px; font-size: 12px; }
.stat-grid > div span { color: var(--fg-dim); }
.stat-grid > div b { font-weight: 600; }

/* Order book / tape */
.ob, .ts { width: 100%; font-size: 11px; font-family: 'JetBrains Mono', monospace; }
.ob td, .ts td { padding: 3px 10px; position: relative; }
.ob td:first-child, .ts td:first-child { padding-left: 14px; }
.ob td:last-child, .ts td:last-child { padding-right: 10px; text-align: right; }
.ob .ask td:first-child { color: var(--dn); }
.ob .bid td:first-child { color: var(--up); }
.ts tr.b td:nth-child(2) { color: var(--up); }
.ts tr.s td:nth-child(2) { color: var(--dn); }
.dim { color: var(--fg-dim); }
.depth { height: 14px; border-radius: 2px; }
.depth.dn-bg { background: rgba(220, 38, 38, 0.18); }
.depth.up-bg { background: rgba(22, 163, 74, 0.18); }
.spread td { padding: 6px 14px; background: var(--surface2); color: var(--fg-dim); font-size: 10px; text-align: center; letter-spacing: .4px; }

.num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
</style>
