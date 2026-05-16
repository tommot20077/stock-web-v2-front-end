<template>
  <div class="page grid">
    <div class="row-between" style="grid-column: span 12; align-items:center">
      <div>
        <h2>{{ t(lang, 'positions') }}</h2>
        <div class="sub">${{ fmtNum(totalVal, 0) }} · {{ portfolio.positions.length }} {{ lang === 'zh' ? '檔' : 'holdings' }}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <div class="seg">
          <button
            v-for="r in ranges"
            :key="r.id"
            :class="['seg-btn', { active: range === r.id }]"
            @click="range = r.id"
          >{{ r.label }}</button>
        </div>
        <button class="btn-tm" :class="{ on: scrubOn }" @click="toggleScrub">
          <span style="font-size:13px">🕐</span>
          {{ lang === 'zh' ? '時光機' : 'Time machine' }}
        </button>
        <button class="btn-accent" @click="$emit('order')">+ {{ t(lang, 'newOrder') }}</button>
      </div>
    </div>

    <!-- ===== Time machine scrubber ===== -->
    <div v-if="scrubOn" class="tm-bar" style="grid-column: span 12">
      <div class="tm-l">
        <span class="tm-icon">📅</span>
        <div>
          <div class="tm-date">{{ scrubDateLabel }}</div>
          <div class="tm-sub">
            <span v-if="scrubDays === 0" style="color:var(--fg-mute)">{{ lang === 'zh' ? '即時' : 'Live' }}</span>
            <span v-else>
              {{ scrubDays }} {{ lang === 'zh' ? '天前' : 'days ago' }}
              <span style="color:var(--fg-mute);margin:0 6px">·</span>
              <span :style="{ color: scrubDelta >= 0 ? 'var(--up)' : 'var(--dn)' }">
                {{ lang === 'zh' ? '相對今日' : 'vs today' }} {{ scrubDelta >= 0 ? '+' : '' }}${{ fmtNum(Math.abs(scrubDelta), 0) }}
                ({{ fmtPct(safePct(scrubDelta, totalCost)) }})
              </span>
            </span>
          </div>
        </div>
      </div>
      <div class="tm-slider-wrap">
        <input type="range" :min="0" :max="365" step="1"
               :value="365 - scrubDays"
               @input="onScrubInput"
               class="tm-slider" />
        <div class="tm-ticks">
          <span>1Y {{ lang === 'zh' ? '前' : 'ago' }}</span>
          <span>6M</span>
          <span>3M</span>
          <span>1M</span>
          <span>{{ lang === 'zh' ? '今天' : 'Today' }}</span>
        </div>
      </div>
      <div class="tm-r">
        <button class="tm-step" @click="scrubDays = Math.min(365, scrubDays + 7)" :disabled="scrubDays >= 365">‹‹ 7d</button>
        <button class="tm-step" @click="scrubDays = Math.min(365, scrubDays + 1)" :disabled="scrubDays >= 365">‹</button>
        <button class="tm-step" @click="scrubDays = Math.max(0, scrubDays - 1)" :disabled="scrubDays <= 0">›</button>
        <button class="tm-step" @click="scrubDays = Math.max(0, scrubDays - 7)" :disabled="scrubDays <= 0">7d ››</button>
        <button class="tm-now" @click="scrubDays = 0" :disabled="scrubDays === 0">{{ lang === 'zh' ? '回到今天' : 'Back to today' }}</button>
      </div>
    </div>

    <!-- KPIs (animated, change with range/scrub) -->
    <div v-for="(s, i) in stats" :key="i" class="card stat" :class="{ scrubbed: scrubDays > 0 }">
      <div class="stat-l">{{ s.l }}</div>
      <div class="stat-v num" :style="{ color: s.up == null ? 'var(--fg)' : s.up ? 'var(--up)' : 'var(--dn)' }">{{ s.v }}</div>
      <div v-if="s.delta" class="stat-d num" :style="{ color: s.up ? 'var(--up)' : 'var(--dn)' }">{{ s.delta }}</div>
    </div>

    <!-- Equity curve -->
    <div class="card chart" style="grid-column: span 8">
      <div class="row-between" style="margin-bottom:6px">
        <div>
          <div class="ttl">{{ t(lang, 'assetTrend') }}</div>
          <div class="sub" style="margin-top:2px">
            <span :style="{ color: pnlAbs >= 0 ? 'var(--up)' : 'var(--dn)' }">
              {{ pnlAbs >= 0 ? '+' : '' }}${{ fmtNum(Math.abs(pnlAbs), 0) }}
            </span>
            <span style="color:var(--fg-dim)">·</span>
            <span :style="{ color: pnlAbs >= 0 ? 'var(--up)' : 'var(--dn)' }">{{ fmtPct(safePct(pnlAbs, totalCost)) }}</span>
            <span style="color:var(--fg-mute);margin-left:8px;font-size:11px">{{ rangeLabel }}</span>
          </div>
        </div>
      </div>
      <div style="height:200px;color:var(--accent);position:relative">
        <LineChart :data="series" fill="var(--accent)" />
        <!-- Scrubber position marker -->
        <div v-if="scrubOn && scrubDays > 0" class="scrub-marker"
             :style="{ left: scrubMarkerPct + '%' }">
          <div class="sm-pill">{{ scrubDateLabel }}</div>
        </div>
      </div>
    </div>

    <!-- Top movers -->
    <div class="card" style="grid-column: span 4; padding: 20px">
      <div class="ttl" style="margin-bottom:14px">{{ t(lang, 'topMovers') }}</div>
      <div v-for="m in topMovers" :key="m.sym" class="mover">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          <div class="mtag">{{ m.sym.slice(0, 2) }}</div>
          <div style="min-width:0">
            <div style="font-weight:500;font-size:13px">{{ m.sym }}</div>
            <div style="font-size:11px;color:var(--fg-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.name }}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="num" style="font-size:13px;font-weight:500" :style="{ color: m.pnl >= 0 ? 'var(--up)' : 'var(--dn)' }">
            {{ m.pnl >= 0 ? '+' : '-' }}${{ fmtNum(Math.abs(m.pnl), 0) }}
          </div>
          <div class="num" style="font-size:11px" :style="{ color: m.pnl >= 0 ? 'var(--up)' : 'var(--dn)' }">{{ fmtPct(m.pct) }}</div>
        </div>
      </div>
    </div>

    <!-- Sector breakdown -->
    <div class="card" style="grid-column: span 12; padding: 20px">
      <div class="ttl" style="margin-bottom:16px">{{ t(lang, 'sectorBreakdown') }}</div>
      <div class="sectors">
        <div v-for="(s, i) in sectorStats" :key="s.name" class="sector">
          <div class="row-between" style="margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px">
              <span :style="{ width: '8px', height: '8px', background: sectorColor(i), borderRadius: '2px' }" />
              <span style="font-weight:500">{{ s.name }}</span>
              <span style="color:var(--fg-mute);font-size:11px">{{ s.count }}</span>
            </div>
            <div class="num" style="font-size:13px;font-weight:500">${{ fmtNum(s.value, 0) }}</div>
          </div>
          <div class="sec-bar">
            <div class="sec-fill" :style="{ width: s.weight + '%', background: sectorColor(i) }" />
          </div>
          <div class="row-between" style="font-size:11px;color:var(--fg-dim);margin-top:4px">
            <span>{{ s.weight.toFixed(1) }}%</span>
            <span :style="{ color: s.pnl >= 0 ? 'var(--up)' : 'var(--dn)' }">{{ fmtPct(s.pnlPct) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Holdings table -->
    <div class="card" style="grid-column: span 12; overflow: hidden">
      <table>
        <thead>
          <tr>
            <th @click="sort('sym')" :class="{ s: sortKey === 'sym' }">{{ t(lang, 'symbol') }}<SortArrow :k="'sym'" :sk="sortKey" :sd="sortDir" /></th>
            <th>{{ t(lang, 'name') }}</th>
            <th @click="sort('qty')" :class="{ s: sortKey === 'qty' }" style="text-align:right">{{ t(lang, 'qty') }}<SortArrow :k="'qty'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('avg')" :class="{ s: sortKey === 'avg' }" style="text-align:right">{{ t(lang, 'avgCost') }}<SortArrow :k="'avg'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('price')" :class="{ s: sortKey === 'price' }" style="text-align:right">{{ t(lang, 'price') }}<SortArrow :k="'price'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('value')" :class="{ s: sortKey === 'value' }" style="text-align:right">{{ t(lang, 'mktValue') }}<SortArrow :k="'value'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('pnl')" :class="{ s: sortKey === 'pnl' }" style="text-align:right">P&amp;L<SortArrow :k="'pnl'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('weight')" :class="{ s: sortKey === 'weight' }" style="text-align:right;padding-right:16px">{{ t(lang, 'weight') }}<SortArrow :k="'weight'" :sk="sortKey" :sd="sortDir" /></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in sortedPositions"
            :key="p.sym"
            :class="{ fresh: portfolio.lastFill && p.sym === portfolio.lastFill.sym, scrubbed: scrubDays > 0 }"
            @click="$emit('order', { sym: p.sym })"
          >
            <td style="font-weight:600;padding-left:16px">{{ p.sym }}</td>
            <td style="color:var(--fg-dim)">{{ p.name }}</td>
            <td class="num" style="text-align:right">{{ p.qty }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ fmtNum(p.avg) }}</td>
            <td class="num" style="text-align:right">
              ${{ fmtNum(effPrice(p)) }}
              <div v-if="scrubDays > 0" class="scrub-cmp" :style="{ color: p.price > effPrice(p) ? 'var(--up)' : 'var(--dn)' }">
                {{ lang === 'zh' ? '今' : 'now' }} ${{ fmtNum(p.price) }}
              </div>
            </td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(p.qty * effPrice(p), 0) }}</td>
            <td class="num" style="text-align:right" :style="{ color: effPnl(p) >= 0 ? 'var(--up)' : 'var(--dn)' }">
              <div>{{ effPnl(p) >= 0 ? '+' : '-' }}${{ fmtNum(Math.abs(effPnl(p)), 0) }}</div>
              <div style="font-size:11px">{{ fmtPct(effPnlPct(p)) }}</div>
            </td>
            <td style="text-align:right;padding-right:16px">
              <div style="display:inline-flex;align-items:center;gap:8px">
                <div class="bar"><div class="bar-fill" :style="{ width: effWeight(p) + '%' }" /></div>
                <span style="font-size:11px;color:var(--fg-dim);min-width:36px;text-align:right">{{ effWeight(p).toFixed(1) }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { t } from '../i18n';
import { genSeries, fmtNum, fmtPct } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang, Position } from '../types';
import LineChart from '../components/LineChart.vue';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order', preset?: { sym: string }): void }>();
const portfolio = useMockPortfolioStore();

type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
const range = ref<Range>('1M');
const ranges = computed(() => [
  { id: '1D' as Range, label: '1D' },
  { id: '1W' as Range, label: '1W' },
  { id: '1M' as Range, label: '1M' },
  { id: '3M' as Range, label: '3M' },
  { id: '1Y' as Range, label: '1Y' },
  { id: 'ALL' as Range, label: props.lang === 'zh' ? '全部' : 'All' },
]);

const rangeLabel = computed(() => {
  const labels = {
    '1D': props.lang === 'zh' ? '今日' : 'Today',
    '1W': props.lang === 'zh' ? '本週' : 'This week',
    '1M': props.lang === 'zh' ? '近 30 日' : 'Last 30 days',
    '3M': props.lang === 'zh' ? '近 90 日' : 'Last 90 days',
    '1Y': props.lang === 'zh' ? '近一年' : 'Last 12 months',
    'ALL': props.lang === 'zh' ? '自開戶' : 'Since inception',
  };
  return labels[range.value];
});

// Range config: data length + return multiplier (vs total) + start factor
const rangeCfg: Record<Range, { n: number; mult: number; vol: number; sharpe: string; annual: string; dd: string; seed: number }> = {
  '1D':  { n: 24,  mult: 0.012, vol: 0.0028, sharpe: '—',    annual: '—',     dd: '-0.4%',  seed: 1 },
  '1W':  { n: 35,  mult: 0.038, vol: 0.0042, sharpe: '1.42', annual: '+15.2%', dd: '-1.8%',  seed: 4 },
  '1M':  { n: 60,  mult: 0.082, vol: 0.0065, sharpe: '1.68', annual: '+17.4%', dd: '-3.4%',  seed: 7 },
  '3M':  { n: 90,  mult: 0.142, vol: 0.0080, sharpe: '1.74', annual: '+18.0%', dd: '-6.2%',  seed: 11 },
  '1Y':  { n: 120, mult: 0.246, vol: 0.0095, sharpe: '1.84', annual: '+18.4%', dd: '-12.4%', seed: 22 },
  'ALL': { n: 180, mult: 0.348, vol: 0.0110, sharpe: '1.62', annual: '+16.8%', dd: '-18.6%', seed: 41 },
};

const totalCost = computed(() => portfolio.positions.reduce((s, p) => s + p.qty * p.avg, 0));
const totalVal = computed(() => portfolio.positions.reduce((s, p) => s + p.qty * p.price, 0));

// Range-scoped P&L (so it changes with range)
const rangePnl = computed(() => {
  const cfg = rangeCfg[range.value];
  const fullPnl = totalVal.value - totalCost.value;
  // Scale full pnl by how much of total return falls in this window
  return fullPnl * (cfg.mult / 0.348);
});
const pnlAbs = computed(() => rangePnl.value);

const series = computed(() => {
  const cfg = rangeCfg[range.value];
  const start = totalVal.value - rangePnl.value;
  return genSeries(cfg.n, start, cfg.vol, cfg.seed);
});

const stats = computed(() => {
  const cfg = rangeCfg[range.value];
  const pnl = rangePnl.value;
  return [
    {
      l: t(props.lang, 'mktValue'),
      v: '$' + fmtNum(totalVal.value, 0),
      up: null as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'unrealized'),
      v: (pnl >= 0 ? '+' : '−') + '$' + fmtNum(Math.abs(pnl), 0),
      up: pnl >= 0 as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'roi'),
      v: fmtPct(safePct(pnl, totalCost.value)),
      up: pnl >= 0 as boolean | null,
      delta: rangeLabel.value,
    },
    {
      l: t(props.lang, 'sharpe'),
      v: cfg.sharpe,
      up: null as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'annualized'),
      v: cfg.annual,
      up: cfg.annual.startsWith('+') as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'maxDd'),
      v: cfg.dd,
      up: false as boolean | null,
      delta: '',
    },
  ];
});

// Top movers (P&L abs) — top 4
const topMovers = computed(() => {
  return [...portfolio.positions]
    .map(p => ({ sym: p.sym, name: p.name, pnl: pnl(p), pct: pnlPct(p) }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 4);
});

// Sector breakdown
const SECTOR_COLORS = ['var(--accent)', '#3b82f6', '#a855f7', '#f59e0b', '#94a3b8', '#10b981'];
function sectorColor(i: number) { return SECTOR_COLORS[i % SECTOR_COLORS.length]; }

const sectorStats = computed(() => {
  const map: Record<string, { value: number; cost: number; count: number }> = {};
  for (const p of portfolio.positions) {
    const k = p.sector || 'Other';
    if (!map[k]) map[k] = { value: 0, cost: 0, count: 0 };
    map[k].value += p.qty * p.price;
    map[k].cost += p.qty * p.avg;
    map[k].count += 1;
  }
  return Object.entries(map)
    .map(([name, x]) => ({
      name,
      value: x.value,
      count: x.count,
      weight: safePct(x.value, totalVal.value),
      pnl: x.value - x.cost,
      pnlPct: safePct(x.value - x.cost, x.cost),
    }))
    .sort((a, b) => b.value - a.value);
});

// Sortable holdings
type SortKey = 'sym' | 'qty' | 'avg' | 'price' | 'value' | 'pnl' | 'weight';
const sortKey = ref<SortKey | ''>('value');
const sortDir = ref<'asc' | 'desc'>('desc');

const sortedPositions = computed(() => {
  const rows = [...portfolio.positions];
  if (!sortKey.value) return rows;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const k = sortKey.value;
  rows.sort((a, b) => {
    let va: any, vb: any;
    switch (k) {
      case 'sym': va = a.sym; vb = b.sym; break;
      case 'qty': va = a.qty; vb = b.qty; break;
      case 'avg': va = a.avg; vb = b.avg; break;
      case 'price': va = a.price; vb = b.price; break;
      case 'value': va = a.qty * a.price; vb = b.qty * b.price; break;
      case 'pnl': va = pnl(a); vb = pnl(b); break;
      case 'weight': va = weight(a); vb = weight(b); break;
    }
    if (typeof va === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  return rows;
});

function sort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = k;
    sortDir.value = k === 'sym' ? 'asc' : 'desc';
  }
}

const SortArrow = (p: { k: string; sk: string; sd: 'asc' | 'desc' }) =>
  p.k === p.sk ? h('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

function safePct(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator * 100;
}
function pnl(p: Position) { return p.qty * p.price - p.qty * p.avg; }
function pnlPct(p: Position) { return safePct(pnl(p), p.qty * p.avg); }
function weight(p: Position) { return safePct(p.qty * p.price, totalVal.value); }

// =============== Time machine ===============
const scrubOn = ref(false);
const scrubDays = ref(0); // 0 = today, 365 = a year ago

function toggleScrub() {
  scrubOn.value = !scrubOn.value;
  if (!scrubOn.value) scrubDays.value = 0;
}

function onScrubInput(e: Event) {
  scrubDays.value = 365 - +(e.target as HTMLInputElement).value;
}

// Deterministic historical price for a symbol N days ago
function priceAt(p: Position, daysAgo: number) {
  if (daysAgo === 0) return p.price;
  const seed = p.sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  // smooth pseudo-random walk
  const trendAnnual = ((seed * 7) % 40 - 12) / 100; // -12% to +28% trailing-year drift
  const driftPerDay = trendAnnual / 365;
  const noise = Math.sin((seed + daysAgo) * 0.31) * 0.04 + Math.sin((seed + daysAgo) * 0.07) * 0.06;
  // current is today; older = subtract drift to roll back
  const factor = 1 - (driftPerDay * daysAgo) - noise;
  return Math.max(p.price * factor, p.price * 0.4);
}

function effPrice(p: Position) {
  return scrubOn.value && scrubDays.value > 0 ? priceAt(p, scrubDays.value) : p.price;
}
function effPnl(p: Position) {
  return p.qty * effPrice(p) - p.qty * p.avg;
}
function effPnlPct(p: Position) {
  return safePct(effPnl(p), p.qty * p.avg);
}
function effTotalVal() {
  return portfolio.positions.reduce((s, p) => s + p.qty * effPrice(p), 0);
}
function effWeight(p: Position) {
  return safePct(p.qty * effPrice(p), effTotalVal());
}

const scrubDelta = computed(() => {
  if (scrubDays.value === 0) return 0;
  return effTotalVal() - totalVal.value;
});

const scrubDateLabel = computed(() => {
  const d = new Date();
  d.setDate(d.getDate() - scrubDays.value);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (scrubDays.value === 0) return props.lang === 'zh' ? '今天' : 'Today';
  return props.lang === 'zh' ? `${y}/${m}/${day}` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${day}, ${y}`;
});

// Scrubber marker position on the chart (% from left)
const scrubMarkerPct = computed(() => {
  // Map scrubDays vs current range's lookback window
  const cfg = rangeCfg[range.value];
  // approx days the curve spans
  const spanDays: Record<Range, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 365 };
  const span = spanDays[range.value];
  if (scrubDays.value > span) return 0; // off-screen left
  return ((span - scrubDays.value) / span) * 100;
});
</script>

<style scoped>
.page { padding: 22px; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.row-between { display: flex; justify-content: space-between; align-items: flex-start; }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap; }
.btn-accent:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }

.seg { display: inline-flex; background: var(--surface2); border-radius: 8px; padding: 3px; gap: 2px; }
.seg-btn {
  padding: 6px 12px; background: transparent; border: 0; border-radius: 6px;
  font-size: 12px; font-weight: 500; color: var(--fg-dim); cursor: pointer; transition: all .15s;
  font-family: inherit;
}
.seg-btn:hover { color: var(--fg); }
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.stat { grid-column: span 2; padding: 16px; }
.stat-l { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.stat-v { font-size: 20px; font-weight: 600; margin-top: 6px; letter-spacing: -0.2px; }
.stat-d { font-size: 11px; margin-top: 2px; color: var(--fg-mute); }
.chart { padding: 20px; }
.ttl { font-size: 14px; font-weight: 600; }

/* Top movers */
.mover { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
.mover + .mover { border-top: 1px solid var(--border); }
.mtag {
  width: 30px; height: 30px; border-radius: 7px; background: var(--surface2);
  font-size: 10px; font-weight: 700; color: var(--fg-dim);
  display: flex; align-items: center; justify-content: center;
}

/* Sector breakdown */
.sectors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 24px; }
.sec-bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
.sec-fill { height: 100%; transition: width .4s cubic-bezier(.2,.8,.2,1); }

/* Table */
table { width: 100%; font-size: 13px; }
thead tr {
  background: var(--surface2); color: var(--fg-dim);
  font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;
}
thead th { padding: 10px 0; font-weight: 500; cursor: pointer; user-select: none; transition: color .15s; }
thead th:first-child { padding-left: 16px; }
thead th:hover { color: var(--fg); }
thead th.s { color: var(--accent); }
.sort-a { display: inline-block; margin-left: 4px; font-size: 10px; }
tbody tr { border-top: 1px solid var(--border); cursor: pointer; transition: background .15s; }
tbody tr:hover { background: var(--surface2); }
tbody tr.fresh { animation: highlight 1.6s ease-out; }
@keyframes highlight {
  0% { background: color-mix(in oklch, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}
tbody td { padding: 12px 0; }
.bar { width: 60px; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); transition: width .3s; }

/* ===== Time machine ===== */
.btn-tm {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px dashed var(--border);
  color: var(--fg-dim); padding: 7px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit; transition: all .15s; white-space: nowrap;
}
.btn-tm:hover { color: var(--fg); border-color: var(--fg-mute); border-style: solid; }
.btn-tm.on {
  background: linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.12));
  border-color: #a855f7; border-style: solid; color: #a855f7;
}

.tm-bar {
  display: grid; grid-template-columns: minmax(220px, auto) 1fr auto;
  gap: 24px; align-items: center;
  padding: 14px 18px;
  background: linear-gradient(135deg, color-mix(in oklch, #a855f7 6%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in oklch, #a855f7 30%, var(--border));
  border-radius: 10px;
  animation: slideDown .25s ease-out;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.tm-l { display: flex; align-items: center; gap: 12px; }
.tm-icon { font-size: 18px; }
.tm-date { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tm-sub { font-size: 11.5px; color: var(--fg-dim); margin-top: 2px; }

.tm-slider-wrap { display: flex; flex-direction: column; gap: 4px; }
.tm-slider {
  width: 100%; height: 5px; -webkit-appearance: none; appearance: none;
  background: linear-gradient(90deg, var(--surface2), #a855f7);
  border-radius: 3px; outline: none; cursor: pointer;
}
.tm-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 3px solid #a855f7;
  cursor: grab; box-shadow: 0 2px 8px rgba(168,85,247,0.4);
}
.tm-slider::-webkit-slider-thumb:active { cursor: grabbing; }
.tm-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 3px solid #a855f7;
  cursor: grab;
}
.tm-ticks { display: flex; justify-content: space-between; font-size: 10px; color: var(--fg-mute); padding: 0 2px; }

.tm-r { display: flex; gap: 4px; align-items: center; }
.tm-step {
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg-dim); padding: 5px 9px; border-radius: 6px;
  font-size: 11px; font-family: 'JetBrains Mono', monospace;
  cursor: pointer; transition: all .1s;
}
.tm-step:hover:not(:disabled) { color: #a855f7; border-color: #a855f7; }
.tm-step:disabled { opacity: 0.3; cursor: not-allowed; }
.tm-now {
  background: #a855f7; color: #fff; border: 0;
  padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 600;
  cursor: pointer; margin-left: 6px; font-family: inherit;
}
.tm-now:disabled { opacity: 0.4; cursor: not-allowed; }

.stat.scrubbed .stat-v { color: #a855f7 !important; }
tr.scrubbed { background: color-mix(in oklch, #a855f7 3%, transparent); }
tr.scrubbed:hover { background: color-mix(in oklch, #a855f7 8%, transparent); }
.scrub-cmp { font-size: 10px; color: var(--fg-mute); margin-top: 2px; font-weight: 400; }

.scrub-marker {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: #a855f7; pointer-events: none;
  transition: left .15s;
}
.scrub-marker .sm-pill {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: #a855f7; color: #fff;
  padding: 2px 8px; border-radius: 10px;
  font-size: 10px; font-weight: 600; white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
