<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <h2>{{ t(lang, 'markets') }}</h2>
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input v-model="query" :placeholder="t(lang, 'search')" class="search" />
        <span v-if="query" class="search-x" @click="query = ''">✕</span>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="k in tabs"
        :key="k"
        :class="['tab', { active: tab === k }]"
        @click="tab = k; sortKey = ''"
      >{{ t(lang, k) }} <span class="tab-count">{{ tabCount(k) }}</span></button>
      <div style="flex:1" />
      <button class="live" :class="{ on: liveOn }" @click="liveOn = !liveOn">
        <span class="live-dot" />
        {{ liveOn ? 'LIVE' : 'PAUSED' }}
      </button>
    </div>

    <div class="filters" v-if="!isBonds">
      <span
        v-for="f in filters"
        :key="f.id"
        :class="['chip', { active: chip === f.id }]"
        @click="chip = f.id"
      >{{ f.label }}</span>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th @click="sort('sym')" :class="{ s: sortKey === 'sym' }">
              {{ t(lang, 'symbol') }}<SortArrow :k="'sym'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th @click="sort('name')" :class="{ s: sortKey === 'name' }">
              {{ t(lang, 'name') }}<SortArrow :k="'name'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th v-if="isBonds" @click="sort('country')" :class="{ s: sortKey === 'country' }">
              {{ t(lang, 'country') }}<SortArrow :k="'country'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th @click="sort('px')" :class="{ s: sortKey === 'px' }" style="text-align:right">
              {{ tab === 'watchlist' ? (lang === 'zh' ? '價格/殖利率' : 'Price/Yield') : isBonds ? 'Yield' : t(lang, 'price') }}<SortArrow :k="'px'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th @click="sort('chg')" :class="{ s: sortKey === 'chg' }" style="text-align:right">
              {{ t(lang, 'change') }}<SortArrow :k="'chg'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th v-if="!isBonds" @click="sort('vol')" :class="{ s: sortKey === 'vol' }" style="text-align:right">
              {{ t(lang, 'volume') }}<SortArrow :k="'vol'" :sk="sortKey" :sd="sortDir" />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in displayRows"
            :key="row.sym"
            class="row"
            @click="$emit('chart', { sym: row.sym })"
          >
            <td style="padding-left:16px">
              <button
                class="star-btn"
                :class="{ on: portfolio.isWatched(row.sym) }"
                :title="portfolio.isWatched(row.sym) ? 'Watched' : 'Add to watchlist'"
                @click.stop="portfolio.toggleWatch(row.sym)"
              >★</button>
            </td>
            <td style="font-weight:600">{{ row.sym }}</td>
            <td style="color:var(--fg-dim)">{{ row.name }}</td>
            <td v-if="isBonds">{{ row.country }}</td>
            <td
              class="num px-cell"
              style="text-align:right;font-weight:500"
              :class="tickClass(row.sym)"
            >
              {{ valueText(row) }}
            </td>
            <td
              class="num"
              style="text-align:right"
              :style="{ color: changeOf(row) >= 0 ? 'var(--up)' : 'var(--dn)' }"
            >
              {{ changeText(row) }}
            </td>
            <td v-if="!isBonds" style="text-align:right;color:var(--fg-dim)">{{ volumeText(row) }}</td>
            <td style="text-align:right;padding-right:16px;white-space:nowrap">
              <button
                v-if="!isBondRow(row)"
                class="quick-order"
                :title="lang === 'zh' ? '快速下單 (O)' : 'Quick order (O)'"
                @click.stop="$emit('order', { sym: row.sym })"
              >⚡</button>
              <span
                v-else
                class="order-unavailable"
                :title="lang === 'zh' ? '債券殖利率不可下單' : 'Bond yield orders unavailable'"
              >—</span>
            </td>
          </tr>
          <tr v-if="!displayRows.length">
            <td colspan="8" style="text-align:center;padding:40px;color:var(--fg-mute);font-size:13px">
              {{ lang === 'zh' ? '沒有符合的標的' : 'No matching symbols' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="isBonds" class="card" style="margin-top:16px;padding:20px">
      <div class="ttl" style="margin-bottom:12px">Yield by country</div>
      <div style="height:160px;color:var(--accent)">
        <Bars :data="bondRows.map(b => ({ label: b.country, v: b.yld }))" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, FX, BONDS, fmtNum, fmtPct } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang, MarketTab } from '../types';
import Bars from '../components/Bars.vue';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order', preset: { sym: string }): void; (e: 'chart', preset: { sym: string }): void }>();

const portfolio = useMockPortfolioStore();

const tabs: MarketTab[] = ['stocks','forex','crypto','bonds','watchlist'];
const tab = ref<MarketTab>('stocks');
const isBonds = computed(() => tab.value === 'bonds');

const query = ref('');
const chip = ref('all');
const sortKey = ref<'' | 'sym' | 'name' | 'country' | 'px' | 'chg' | 'vol'>('');
const sortDir = ref<'asc' | 'desc'>('desc');

const liveOn = ref(true);
// per-symbol live overrides
const live = reactive<Record<string, { price: number; chg: number; chgPct: number; tick: 'up' | 'dn' | null }>>({});
let tickIv: ReturnType<typeof setInterval> | null = null;
const tickTimeouts = new Set<ReturnType<typeof setTimeout>>();

const SortArrow = (p: { k: string; sk: string; sd: 'asc' | 'desc' }) =>
  p.k === p.sk ? h('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

const filters = computed(() => {
  const zh = props.lang === 'zh';
  return [
    { id: 'all', label: zh ? '全部' : 'All' },
    { id: 'gainers', label: zh ? '上漲' : 'Gainers' },
    { id: 'losers', label: zh ? '下跌' : 'Losers' },
    { id: 'star', label: '★ ' + (zh ? '觀察' : 'Watchlist') },
  ];
});

const stockRows = computed(() => SYMBOLS);
const cryptoRows = computed(() => CRYPTO);
const fxRows = computed(() => FX);
const bondRows = computed(() => BONDS);
const watchableRows = computed(() => [...SYMBOLS, ...CRYPTO, ...FX, ...BONDS]);
const watchedSymbols = computed(() =>
  portfolio.watchlists
    .flatMap(l => l.syms)
    .filter((sym, idx, all) => all.indexOf(sym) === idx),
);
const watchedRows = computed(() =>
  watchedSymbols.value
    .map(sym => watchableRows.value.find(s => s.sym === sym))
    .filter(Boolean) as any[],
);

const baseRows = computed(() => {
  switch (tab.value) {
    case 'crypto': return cryptoRows.value;
    case 'forex': return fxRows.value;
    case 'bonds': return bondRows.value;
    case 'watchlist': return watchedRows.value;
    default: return stockRows.value;
  }
});

function changeOf(r: any) {
  return live[r.sym]?.chgPct ?? r.chgPct ?? r.chg ?? 0;
}
function priceOf(r: any) {
  return live[r.sym]?.price ?? r.price ?? r.yld;
}
function isBondRow(r: any) {
  return r.cat === 'bond';
}
function valueText(r: any) {
  const dp = r.cat === 'fx' ? 4 : isBondRow(r) ? 3 : 2;
  return fmtNum(priceOf(r), dp);
}
function changeText(r: any) {
  if (isBondRow(r)) {
    const value = changeOf(r);
    return (value >= 0 ? '+' : '') + fmtNum(value, 3);
  }
  return fmtPct(changeOf(r));
}
function volumeText(r: any) {
  return r.vol ?? '—';
}
function tickClass(sym: string) {
  const dir = live[sym]?.tick;
  return dir === 'up' ? 'tick-up' : dir === 'dn' ? 'tick-dn' : '';
}

function tabCount(k: MarketTab): number {
  if (k === 'crypto') return CRYPTO.length;
  if (k === 'forex') return FX.length;
  if (k === 'bonds') return BONDS.length;
  if (k === 'watchlist') return watchedSymbols.value.length;
  return SYMBOLS.length;
}

const displayRows = computed(() => {
  let rows: any[] = [...baseRows.value];

  // filter chip (only stocks/crypto/fx/watchlist)
  if (!isBonds.value) {
    if (chip.value === 'gainers') rows = rows.filter(r => changeOf(r) >= 0);
    else if (chip.value === 'losers') rows = rows.filter(r => changeOf(r) < 0);
    else if (chip.value === 'star') rows = rows.filter(r => portfolio.isWatched(r.sym));
  }

  // search
  const q = query.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter(r =>
      r.sym.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }

  // sort
  if (sortKey.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey.value) {
        case 'sym': va = a.sym; vb = b.sym; break;
        case 'name': va = a.name; vb = b.name; break;
        case 'country': va = a.country; vb = b.country; break;
        case 'px': va = priceOf(a); vb = priceOf(b); break;
        case 'chg': va = changeOf(a); vb = changeOf(b); break;
        case 'vol': va = String(a.vol); vb = String(b.vol); break;
        default: return 0;
      }
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  return rows;
});

function sort(k: 'sym' | 'name' | 'country' | 'px' | 'chg' | 'vol') {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = k;
    sortDir.value = k === 'sym' || k === 'name' || k === 'country' ? 'asc' : 'desc';
  }
}

// Live ticks: every 1.4s, randomly nudge 2-3 visible symbols
function tick() {
  if (!liveOn.value) return;
  const visible = displayRows.value.slice(0, 12);
  if (!visible.length) return;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const r = visible[Math.floor(Math.random() * visible.length)];
    if (!r) continue;
    const cur = live[r.sym] ?? { price: r.price ?? r.yld, chg: r.chg ?? 0, chgPct: r.chgPct ?? r.chg, tick: null };
    const delta = (Math.random() - 0.48) * 0.0035;
    const newPx = +(cur.price * (1 + delta)).toFixed(r.cat === 'fx' || r.cat === 'bond' ? 4 : 2);
    const dir = newPx > cur.price ? 'up' : newPx < cur.price ? 'dn' : null;
    const baseChgPct = r.chgPct ?? r.chg ?? 0;
    const newChgPct = +(baseChgPct + delta * 100).toFixed(2);
    live[r.sym] = { price: newPx, chg: cur.chg, chgPct: newChgPct, tick: dir };
    // clear tick highlight after 600ms
    const timeout = setTimeout(() => {
      tickTimeouts.delete(timeout);
      if (live[r.sym]) live[r.sym] = { ...live[r.sym], tick: null };
    }, 600);
    tickTimeouts.add(timeout);
  }
}

onMounted(() => {
  tickIv = setInterval(tick, 1400);
});
onUnmounted(() => {
  if (tickIv) clearInterval(tickIv);
  tickTimeouts.forEach(timeout => clearTimeout(timeout));
  tickTimeouts.clear();
});
</script>

<style scoped>
.page { padding: 22px; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }

.search-wrap { position: relative; }
.search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--fg-mute); font-size: 14px; pointer-events: none; }
.search-x { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--fg-mute); font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.search-x:hover { background: var(--surface2); color: var(--fg); }
.search {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 14px 8px 32px; font-size: 13px; outline: none; width: 280px;
  color: var(--fg); transition: border .15s, width .2s;
}
.search:focus { border-color: var(--accent); width: 320px; }

.tabs {
  display: flex; gap: 4px; margin-bottom: 14px; align-items: center;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 10px 14px; background: transparent; border: 0;
  border-bottom: 2px solid transparent;
  color: var(--fg-dim); font-size: 13px; font-weight: 500;
  margin-bottom: -1px; cursor: pointer; transition: color .15s;
  display: flex; align-items: center; gap: 6px;
}
.tab:hover { color: var(--fg); }
.tab.active { border-bottom-color: var(--accent); color: var(--fg); font-weight: 600; }
.tab-count { background: var(--surface2); color: var(--fg-mute); border-radius: 10px; padding: 1px 6px; font-size: 10px; font-weight: 500; }
.tab.active .tab-count { background: color-mix(in oklch, var(--accent) 18%, transparent); color: var(--accent); }

.live {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; background: transparent; border: 1px solid var(--border);
  border-radius: 99px; font-size: 11px; font-weight: 600; letter-spacing: .6px;
  color: var(--fg-mute); cursor: pointer; margin-bottom: 8px;
}
.live.on { color: var(--up); border-color: color-mix(in oklch, var(--up) 35%, var(--border)); }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-mute); }
.live.on .live-dot { background: var(--up); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 color-mix(in oklch, var(--up) 50%, transparent); }
  50% { opacity: .6; box-shadow: 0 0 0 4px color-mix(in oklch, var(--up) 0%, transparent); }
}

.filters { display: flex; gap: 8px; margin-bottom: 12px; }
.chip {
  padding: 5px 12px; background: var(--surface); color: var(--fg-dim);
  border: 1px solid var(--border); border-radius: 99px;
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s;
  white-space: nowrap;
}
.chip:hover { color: var(--fg); }
.chip.active { background: var(--fg); color: var(--bg); border-color: var(--fg); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.ttl { font-size: 14px; font-weight: 600; }
table { width: 100%; font-size: 13px; }
thead tr {
  background: var(--surface2); color: var(--fg-dim);
  font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;
}
thead th { padding: 10px 0; font-weight: 500; cursor: pointer; user-select: none; transition: color .15s; }
thead th:hover { color: var(--fg); }
thead th:first-child { padding-left: 16px; cursor: default; }
thead th.s { color: var(--accent); }
.sort-a { display: inline-block; margin-left: 4px; font-size: 10px; }

tbody tr.row { border-top: 1px solid var(--border); cursor: pointer; transition: background .15s; }
tbody tr.row:hover { background: var(--surface2); }
tbody td { padding: 11px 0; }

.px-cell { transition: background .35s ease-out, color .25s; position: relative; padding-right: 16px !important; border-radius: 4px; }
.star-btn {
  background: transparent;
  border: 0;
  color: var(--fg-mute);
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.star-btn.on { color: var(--accent); }
.star-btn:hover { background: var(--surface2); }
.quick-order {
  background: var(--surface2); border: 1px solid var(--border); color: var(--fg-mute);
  width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all .15s; padding: 0;
}
.quick-order:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.row:hover .quick-order { color: var(--accent); border-color: color-mix(in oklch, var(--accent) 35%, var(--border)); }
.order-unavailable {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--fg-mute);
  font-size: 13px;
}
.tick-up { color: var(--up); animation: flash-up .6s ease-out; }
.tick-dn { color: var(--dn); animation: flash-dn .6s ease-out; }
@keyframes flash-up {
  0% { background: color-mix(in oklch, var(--up) 22%, transparent); }
  100% { background: transparent; }
}
@keyframes flash-dn {
  0% { background: color-mix(in oklch, var(--dn) 22%, transparent); }
  100% { background: transparent; }
}
</style>
