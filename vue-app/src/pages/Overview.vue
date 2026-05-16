<template>
  <div class="page grid">
    <div v-for="(k, i) in kpis" :key="i" class="card kpi" style="grid-column: span 3">
      <div class="kpi-l">{{ k.l }}</div>
      <div class="kpi-v num">{{ k.v }}</div>
      <div class="kpi-s" :style="{ color: k.up == null ? 'var(--fg-dim)' : k.up ? 'var(--up)' : 'var(--dn)' }">
        <template v-if="k.up != null">{{ k.up ? '↗' : '↘' }} </template>{{ k.s }}
      </div>
    </div>

    <div class="card" style="grid-column: span 8; padding: 20px">
      <div class="row-between" style="margin-bottom:12px">
        <div>
          <div class="ttl">{{ t(lang, 'assetTrend') }}</div>
          <div class="sub">{{ t(lang, 'totalReturn') }} {{ fmtPct(ret) }}</div>
        </div>
        <div class="seg">
          <button v-for="r in ranges" :key="r" :class="['seg-btn', { active: range === r }]" @click="range = r">{{ r }}</button>
        </div>
      </div>
      <div style="height:220px;color:var(--accent)">
        <LineChart :data="series" fill="var(--accent)" />
      </div>
    </div>

    <div class="card" style="grid-column: span 4; padding: 20px">
      <div class="ttl" style="margin-bottom:16px">{{ t(lang, 'allocation') }}</div>
      <div style="display:flex;justify-content:center;margin-bottom:16px">
        <Donut :size="150" :thickness="22" :slices="alloc.map(a => ({ value: a.v, color: a.c }))" />
      </div>
      <div>
        <div v-for="a in alloc" :key="a.n" class="alloc-row">
          <span style="display:flex;align-items:center;gap:8px">
            <span :style="{ width: '8px', height: '8px', background: a.c, borderRadius: '2px' }" />{{ a.n }}
          </span>
          <span class="num" style="color:var(--fg-dim)">{{ a.v }}%</span>
        </div>
      </div>
    </div>

    <div class="card" style="grid-column: span 6; padding: 20px">
      <div class="row-between" style="margin-bottom:12px">
        <div class="ttl">★ {{ t(lang, 'watchlist') }}</div>
        <button class="link" @click="emit('navigate', 'watchlist')">→</button>
      </div>
      <div v-for="s in watchlist" :key="s.sym" class="wl-row">
        <div class="wl-tag">{{ s.sym.slice(0, 2) }}</div>
        <div style="flex:1">
          <div style="font-weight:500">{{ s.sym }}</div>
          <div style="font-size:11px;color:var(--fg-dim)">{{ s.name }}</div>
        </div>
        <div style="width:70px;height:24px" :style="{ color: s.chgPct >= 0 ? 'var(--up)' : 'var(--dn)' }">
          <LineChart :data="genSeries(20, s.price, 0.02, s.sym.charCodeAt(0))" />
        </div>
        <div style="text-align:right;min-width:90px">
          <div class="num" style="font-weight:500">{{ fmtNum(s.price) }}</div>
          <div class="num" style="font-size:11px" :style="{ color: s.chgPct >= 0 ? 'var(--up)' : 'var(--dn)' }">{{ fmtPct(s.chgPct) }}</div>
        </div>
      </div>
    </div>

    <div class="card" style="grid-column: span 6; padding: 20px">
      <div class="ttl" style="margin-bottom:12px">{{ t(lang, 'news') }}</div>
      <div v-for="(n, i) in NEWS" :key="i" class="news-row">
        <div class="news-thumb" />
        <div style="flex:1">
          <div class="news-meta">
            <span style="font-weight:500">{{ n.src }}</span>
            <span class="news-bullet" />
            <span>{{ n.time }}</span>
            <span class="news-tag">{{ n.tag }}</span>
          </div>
          <div style="font-size:13px;line-height:1.4">{{ n.t }}</div>
        </div>
      </div>
    </div>

    <div class="card" style="grid-column: span 12; padding: 20px">
      <div class="row-between" style="margin-bottom:12px">
        <div class="ttl">{{ t(lang, 'recentTrades') }}</div>
        <button class="btn-accent" @click="emit('order')">+ {{ t(lang, 'addTrade') }}</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>{{ t(lang, 'date') }}</th>
            <th>{{ t(lang, 'type') }}</th>
            <th>{{ t(lang, 'symbol') }}</th>
            <th style="text-align:right">{{ t(lang, 'qty') }}</th>
            <th style="text-align:right">{{ t(lang, 'price') }}</th>
            <th style="text-align:right">{{ t(lang, 'total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tr in portfolio.trades.slice(0, 5)" :key="tr.d + tr.type + tr.sym + tr.qty + tr.px + tr.fee + tr.note">
            <td style="color:var(--fg-dim)">{{ tr.d }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">{{ tr.sym }}</td>
            <td class="num" style="text-align:right">{{ tr.qty }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.px) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.qty * tr.px, 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, NEWS, genSeries, fmtNum, fmtPct } from '../data';
import type { Lang } from '../types';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import LineChart from '../components/LineChart.vue';
import Donut from '../components/Donut.vue';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{
  order: [];
  navigate: [page: 'watchlist' | 'trades' | 'positions'];
}>();
const portfolio = useMockPortfolioStore();

const ranges = ['1D','1W','1M','3M','6M','1Y','All'];
const range = ref('6M');

const series = genSeries(80, 1_000_000, 0.012, 5);
const last = series[series.length - 1];
const ret = (last - series[0]) / series[0] * 100;

const kpis = computed(() => [
  { l: t(props.lang, 'totalAssets'), v: '$' + fmtNum(last, 0), s: '+1.04% ' + t(props.lang, 'yesterday'), up: true as boolean | null },
  { l: t(props.lang, 'todayPnl'), v: '+$12,481', s: '+1.04%', up: true as boolean | null },
  { l: t(props.lang, 'availableCash'), v: '$84,210', s: '8.4%', up: null as boolean | null },
  { l: t(props.lang, 'totalReturn'), v: fmtPct(ret), s: t(props.lang, 'annualized') + ' 18.4%', up: true as boolean | null },
]);

const alloc = [
  { n: 'Equity', v: 52, c: 'var(--accent)' }, { n: 'Crypto', v: 22, c: '#3b82f6' },
  { n: 'FX', v: 14, c: '#a855f7' }, { n: 'Bonds', v: 8, c: '#f59e0b' }, { n: 'Cash', v: 4, c: '#94a3b8' },
];


const watchlist = computed(() => [...SYMBOLS.filter(s => s.star), ...CRYPTO.filter(c => c.star)]);
</script>

<style scoped>
.page { padding: 22px; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.kpi { padding: 18px 20px; }
.kpi-l { color: var(--fg-dim); font-size: 12px; }
.kpi-v { font-size: 26px; font-weight: 600; letter-spacing: -0.5px; margin-top: 6px; }
.kpi-s { font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.ttl { font-size: 14px; font-weight: 600; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 2px; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.seg { display: flex; background: var(--surface2); border-radius: 8px; padding: 2px; }
.seg-btn {
  padding: 4px 10px; font-size: 11px; font-weight: 500;
  background: transparent; border: 0; border-radius: 6px;
  color: var(--fg-dim);
}
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.alloc-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
.wl-row { display: flex; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); gap: 12px; }
.wl-tag {
  width: 32px; height: 32px; background: var(--surface2); border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
}
.news-row { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.news-thumb { width: 36px; height: 36px; background: var(--surface2); border-radius: 8px; flex-shrink: 0; }
.news-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--fg-dim); margin-bottom: 3px; }
.news-bullet { width: 3px; height: 3px; background: var(--fg-mute); border-radius: 50%; }
.news-tag { margin-left: auto; padding: 1px 8px; background: var(--surface2); border-radius: 99px; font-size: 10px; font-weight: 500; }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.link { background: transparent; border: 0; color: var(--fg-dim); font-size: 12px; }
table { width: 100%; }
thead th {
  text-align: left; padding: 8px 0; font-weight: 500;
  color: var(--fg-dim); font-size: 11px;
  border-bottom: 1px solid var(--border);
}
tbody td { padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.pill {
  display: inline-block; padding: 2px 8px; border-radius: 99px;
  font-size: 11px; font-weight: 500;
  background: var(--surface2); color: var(--fg-dim);
}
.pill.buy { background: rgba(22,163,74,0.12); color: var(--up); }
.pill.sell { background: rgba(220,38,38,0.12); color: var(--dn); }
</style>
