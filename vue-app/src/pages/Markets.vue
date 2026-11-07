<template>
  <div class="page">
    <MockDataNotice :lang="lang" exception="mockDataNoticeExceptWatchlist" />
    <div class="row-between" style="margin-bottom:18px">
      <h2>{{ t(lang, 'markets') }}</h2>
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input v-model="query" :placeholder="t(lang, 'search')" class="search" />
        <span v-if="query" class="search-x" @click="query = ''">✕</span>
      </div>
    </div>

    <div class="tabs">
      <!-- < 640px:tabs 在列內水平捲動,LIVE 鈕固定在右側不被壓縮(quick-261106-fbs A3) -->
      <div class="tab-scroll">
        <button
          v-for="k in tabs"
          :key="k"
          :class="['tab', { active: tab === k }]"
          @click="tab = k; sortKey = ''"
        >{{ t(lang, k) }} <span class="tab-count">{{ tabCount(k) }}</span></button>
      </div>
      <button class="live" :class="{ on: liveOn }" @click="liveOn = !liveOn">
        <span class="live-dot" />
        {{ liveOn ? 'LIVE' : 'PAUSED' }}
      </button>
    </div>

    <!-- 清單載入失敗:行內提示 + 重試,不擋行情列表(UI-SPEC §Interaction 7) -->
    <div v-if="listsError" class="wl-load-error" role="alert" data-testid="markets-watchlist-error">
      <span class="wl-load-error-text">{{ t(lang, 'watchlistLoadFailedInline') }}</span>
      <span class="wl-load-error-details">
        <span>{{ listsError.code }}</span>
        <span v-if="listsError.requestId">{{ t(lang, 'authRequestId') }} {{ listsError.requestId }}</span>
      </span>
      <button type="button" class="wl-retry" data-testid="markets-watchlist-retry" @click="loadLists">
        {{ t(lang, 'authRetry') }}
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
      <!-- tabindex="-1":只供選擇器在觸發列消失時回填焦點(WR-08),不進 Tab 順序 -->
      <table ref="tableEl" tabindex="-1" data-testid="markets-table">
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
              <!-- D-16:星號開觀察清單選擇器;字符是裝飾,語意由 aria-label 承擔 -->
              <button
                type="button"
                class="star-btn"
                :class="{ on: isWatched(row.sym) }"
                data-testid="markets-star"
                :data-symbol="row.sym"
                :aria-label="tf(lang, isWatched(row.sym) ? 'watchlistStarManage' : 'watchlistStarAdd', { symbol: row.sym })"
                aria-haspopup="dialog"
                :aria-expanded="pickerSymbol === row.sym ? 'true' : 'false'"
                :aria-controls="pickerSymbol === row.sym ? WATCHLIST_PICKER_ID : undefined"
                @click.stop="togglePicker(row.sym, $event)"
              ><span aria-hidden="true">★</span></button>
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
              :style="{ color: changeOf(row) >= 0 ? 'var(--up-text)' : 'var(--dn)' }"
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

    <WatchlistPicker
      :open="pickerSymbol !== null"
      :lang="lang"
      :symbol="pickerSymbol ?? ''"
      :anchor="pickerAnchor"
      :lists="lists"
      :loading="listsLoading"
      :load-error="listsError"
      :fallback-focus="tableEl"
      @close="closePicker"
      @changed="onListChanged"
      @created="onListCreated"
      @retry="loadLists"
    />
  </div>
</template>

<script setup lang="ts">
import MockDataNotice from '../components/MockDataNotice.vue';
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue';
import { t, tf } from '../i18n';
import { SYMBOLS, CRYPTO, FX, BONDS, fmtNum, fmtPct } from '../data';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { WatchlistDto } from '../services/watchlistApi';
import type { Lang, MarketTab } from '../types';
import Bars from '../components/Bars.vue';
import WatchlistPicker, { WATCHLIST_PICKER_ID } from '../components/WatchlistPicker.vue';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order', preset: { sym: string }): void; (e: 'chart', preset: { sym: string }): void }>();

// WATCH-03 / judgment §3:觀察清單只經 watchlist service(不 import mock store)。頁級 ref 是星號、
// ★ 觀察 chip、觀察清單 tab 與選擇器的唯一狀態來源;選擇器寫入後以回應 DTO 回填(不樂觀更新)。
const lists = ref<WatchlistDto[] | null>(null);
const listsLoading = ref(false);
const listsError = ref<ApiClientError | null>(null);

/**
 * WR-06:過時回應守門。每次 GET 開始與每次選擇器寫入回填都遞增;GET 回來時序號已不是最新 → 丟棄
 * (選擇器要求重讀後又寫入成功時,較舊的 GET 快照不得蓋掉較新的回應 DTO)。
 */
let listsSeq = 0;
/** 最近一次 loadLists 的序號:只有它結束時才收起 listsLoading。 */
let latestLoadSeq = 0;

async function loadLists() {
  const seq = ++listsSeq;
  latestLoadSeq = seq;
  listsLoading.value = true;
  listsError.value = null;
  try {
    const data = await getRuntimeApiClients().watchlist.list();
    if (seq !== listsSeq) return;
    lists.value = data;
  } catch (error) {
    if (seq !== listsSeq) return;
    listsError.value = error instanceof ApiClientError
      ? error
      : new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
  } finally {
    if (seq === latestLoadSeq) listsLoading.value = false;
  }
}

function onListChanged(updated: WatchlistDto) {
  listsSeq += 1;
  lists.value = (lists.value ?? []).map(list => (list.id === updated.id ? updated : list));
}

function onListCreated(created: WatchlistDto) {
  listsSeq += 1;
  lists.value = [...(lists.value ?? []).filter(list => list.id !== created.id), created];
}

const pickerSymbol = ref<string | null>(null);
const pickerAnchor = ref<HTMLElement | null>(null);
/**
 * 04.2-review WR-08:「觀察清單」tab 與 ★ chip 下,取消勾選會讓觸發列(含星號)卸載;
 * 選擇器關閉時改把焦點還給行情表本身(同一張表、使用者剛操作的位置附近,一直都在)。
 */
const tableEl = ref<HTMLTableElement | null>(null);

function togglePicker(sym: string, event: MouseEvent) {
  if (pickerSymbol.value === sym) {
    closePicker();
    return;
  }
  pickerAnchor.value = event.currentTarget as HTMLElement;
  pickerSymbol.value = sym;
}

function closePicker() {
  pickerSymbol.value = null;
}

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
/** 所有清單 symbol 的聯集(RESEARCH Q9.4,與舊 mock isWatched 同義)。 */
const watchedSymbols = computed(() => {
  const seen = new Set<string>();
  for (const list of lists.value ?? []) {
    for (const item of list.items) seen.add(item.symbol);
  }
  return [...seen];
});
const watchedSet = computed(() => new Set(watchedSymbols.value));
function isWatched(sym: string): boolean {
  return watchedSet.value.has(sym);
}
// 聯集中不在 data.ts 的代號在 Markets 不顯示(行情是示範資料;Watchlist 頁才是權威畫面)。
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
  if (k === 'watchlist') return watchedRows.value.length;
  return SYMBOLS.length;
}

const displayRows = computed(() => {
  let rows: any[] = [...baseRows.value];

  // filter chip (only stocks/crypto/fx/watchlist)
  if (!isBonds.value) {
    if (chip.value === 'gainers') rows = rows.filter(r => changeOf(r) >= 0);
    else if (chip.value === 'losers') rows = rows.filter(r => changeOf(r) < 0);
    else if (chip.value === 'star') rows = rows.filter(r => isWatched(r.sym));
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
  void loadLists();
});
onUnmounted(() => {
  if (tickIv) clearInterval(tickIv);
  tickTimeouts.forEach(timeout => clearTimeout(timeout));
  tickTimeouts.clear();
});
</script>

<style scoped>
.page { padding: 22px; }
/* 頁首:窄螢幕時搜尋框換到標題下一列,不撐寬 .main(quick-261106-fbs A3) */
.row-between { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }

/* 寬度由外層決定:最多 280px(focus 時 320px),但不超過容器寬;input 填滿外層 */
.search-wrap { position: relative; flex: 0 1 280px; min-width: 0; max-width: 100%; transition: flex-basis .2s; }
.search-wrap:focus-within { flex-basis: 320px; }
.search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--fg-mute); font-size: 14px; pointer-events: none; }
.search-x { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--fg-mute); font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.search-x:hover { background: var(--surface2); color: var(--fg); }
.search {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 14px 8px 32px; font-size: 13px; outline: none; width: 100%;
  color: var(--fg); transition: border .15s;
}
.search:focus { border-color: var(--accent); }

.tabs {
  display: flex; gap: 8px; margin-bottom: 14px; align-items: center;
  border-bottom: 1px solid var(--border);
}
/*
  tabs 自己的捲動容器(比照 Watchlist.vue 的 tabs):flex 1 + min-width 0 讓它可縮到比內容窄,
  超出時在列內水平捲動而不撐寬 .main。底線壓在 .tabs 的下框線上:-1px 改由捲動容器負責,
  tab 本身不再用負 margin(否則會在捲動容器內溢出 1px、多出垂直捲軸)。
*/
.tab-scroll {
  display: flex; gap: 4px; flex: 1 1 auto; min-width: 0;
  overflow-x: auto; overflow-y: hidden; margin-bottom: -1px;
}
.tab {
  flex: none; white-space: nowrap;
  padding: 10px 14px; background: transparent; border: 0;
  border-bottom: 2px solid transparent;
  color: var(--fg-dim); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: color .15s;
  display: flex; align-items: center; gap: 6px;
}
.tab:hover { color: var(--fg); }
.tab.active { border-bottom-color: var(--accent); color: var(--fg); font-weight: 600; }
.tab-count { background: var(--surface2); color: var(--fg-mute); border-radius: 10px; padding: 1px 6px; font-size: 10px; font-weight: 500; }
.tab.active .tab-count { background: color-mix(in oklch, var(--accent) 18%, transparent); color: var(--accent-text); }

.live {
  flex: none; white-space: nowrap;
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; background: transparent; border: 1px solid var(--border);
  border-radius: 99px; font-size: 11px; font-weight: 600; letter-spacing: .6px;
  color: var(--fg-mute); cursor: pointer; margin-bottom: 8px;
}
.live.on { color: var(--success); border-color: color-mix(in oklch, var(--success) 35%, var(--border)); }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-mute); }
.live.on .live-dot { background: var(--success); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 color-mix(in oklch, var(--success) 50%, transparent); }
  50% { opacity: .6; box-shadow: 0 0 0 4px color-mix(in oklch, var(--success) 0%, transparent); }
}

.wl-load-error {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px;
  margin-bottom: 12px; font-size: 13px; color: var(--fg);
}
.wl-load-error-text { flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; }
.wl-load-error-details { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 12px; color: var(--fg-dim); }
.wl-load-error-details span { overflow-wrap: anywhere; user-select: text; }
.wl-retry {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.wl-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
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
/* 選擇器回填焦點(WR-08)時鍵盤使用者看得到落點;內縮避免被卡片圓角裁掉 */
table:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
thead tr {
  background: var(--surface2); color: var(--fg-dim);
  font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;
}
thead th { padding: 10px 0; font-weight: 500; cursor: pointer; user-select: none; transition: color .15s; }
thead th:hover { color: var(--fg); }
thead th:first-child { padding-left: 16px; cursor: default; }
thead th.s { color: var(--accent-text); }
.sort-a { display: inline-block; margin-left: 4px; font-size: 10px; }

tbody tr.row { border-top: 1px solid var(--border); cursor: pointer; transition: background .15s; }
tbody tr.row:hover { background: var(--surface2); }
tbody td { padding: 11px 0; }

.px-cell { transition: background .35s ease-out, color .25s; position: relative; padding-right: 16px !important; border-radius: 4px; }
.star-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 8px;
  margin-block: -8px;
  background: transparent;
  border: 0;
  color: var(--fg-mute);
  font-size: 16px;
  line-height: 1;
  border-radius: 8px;
  cursor: pointer;
}
.star-btn.on { color: var(--accent); }
.star-btn:hover { background: var(--surface2); }
.star-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.quick-order {
  background: var(--surface2); border: 1px solid var(--border); color: var(--fg-mute);
  width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all .15s; padding: 0;
}
.quick-order:hover { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
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
.tick-up { color: var(--up-text); animation: flash-up .6s ease-out; }
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
