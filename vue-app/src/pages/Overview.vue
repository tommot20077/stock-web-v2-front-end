<template>
  <div class="page grid">
    <!--
      KPI 區。mock mode:四張合成卡照舊。
      API mode(D-14):只有 totalMarketValue 與 roi 兩張有後端資料的卡;
      今日損益 / 可用現金無後端來源,直接不渲染(不顯示假資料)。
    -->
    <!--
      U-05 / U-06:成交後重讀的指示列。刻意**不新增卡片、不改任何 grid span**,
      只在 KPI 區上方插入一條 12px 說明列;失敗時就地換成 stale 提示 + 診斷列 + 重試。
    -->
    <div v-if="!live && summaryRefreshing" class="refresh-strip" :style="{ gridColumn: 'span 12' }">
      <div class="refresh-note" data-testid="overview-refreshing">{{ t(lang, 'portfolioRefreshing') }}</div>
    </div>
    <div v-else-if="!live && summaryRefreshError" class="refresh-strip" :style="{ gridColumn: 'span 12' }">
      <!-- role="status" 而非 alert:交易已經成功,這不是需要打斷使用者的錯誤(U-06) -->
      <div class="refresh-stale" role="status" data-testid="overview-refresh-error">
        <div>{{ t(lang, 'portfolioStaleAfterTrade') }}</div>
        <div class="details">
          <span data-testid="overview-refresh-error-code">{{ summaryRefreshError.code }}</span>
          <span v-if="summaryRefreshError.traceId" data-testid="overview-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ summaryRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="overview-refresh-retry" @click="refreshSummary">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
    </div>

    <div
      v-if="!live && summaryLoading"
      class="card kpi block-state"
      data-testid="overview-summary-loading"
      :style="{ gridColumn: 'span 12' }"
    >
      <div class="kpi-l">{{ t(lang, 'loading') }}</div>
    </div>
    <div
      v-else-if="!live && summaryError"
      class="card kpi block-error"
      data-testid="overview-summary-error"
      :style="{ gridColumn: 'span 12' }"
    >
      <div class="kpi-l">{{ t(lang, 'loadFailed') }}</div>
      <div class="details">
        <span data-testid="overview-summary-error-code">{{ summaryError.code }}</span>
        <span v-if="summaryError.traceId" data-testid="overview-summary-trace-id">
          {{ t(lang, 'authRequestId') }} {{ summaryError.traceId }}
        </span>
      </div>
      <button class="block-retry" data-testid="overview-summary-retry" @click="loadSummary">
        {{ t(lang, 'authRetry') }}
      </button>
    </div>
    <template v-else>
      <div
        v-for="(k, i) in kpiCards"
        :key="i"
        class="card kpi"
        data-testid="overview-kpi"
        :class="{ 'block-refreshing': summaryRefreshing }"
        :aria-busy="summaryRefreshing"
        :style="{ gridColumn: `span ${kpiSpan}` }"
      >
        <div class="kpi-l">{{ k.l }}</div>
        <div class="kpi-v num">{{ k.v }}</div>
        <div class="kpi-s" :style="{ color: k.up == null ? 'var(--fg-dim)' : k.up ? 'var(--up)' : 'var(--dn)' }">
          <template v-if="k.up != null">{{ k.up ? '↗' : '↘' }} </template>{{ k.s }}
        </div>
      </div>
    </template>

    <!-- 資產走勢圖:genSeries 亂數,無後端日級歷史來源 → API mode 隱藏(D-16) -->
    <div v-if="live" class="card" style="grid-column: span 8; padding: 20px">
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

    <!-- 資產配置 donut:寫死陣列,需資產分類 → API mode 隱藏(D-14) -->
    <div v-if="live" class="card" style="grid-column: span 4; padding: 20px">
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

    <!-- 近期交易。API mode 走 GET /trades?page=0&size=5(D-09),與交易頁不共用狀態。 -->
    <div
      class="card"
      style="grid-column: span 12; padding: 20px"
      :class="{ 'block-refreshing': tradesRefreshing }"
      :aria-busy="tradesRefreshing"
    >
      <div class="row-between" style="margin-bottom:12px">
        <div class="ttl">{{ t(lang, 'recentTrades') }}</div>
        <button class="btn-accent" @click="emit('order')">+ {{ t(lang, 'addTrade') }}</button>
      </div>
      <!-- U-05 / U-06:重讀期間保留整張表格,只在區塊頂端加一條指示列 -->
      <div v-if="!live && tradesRefreshing" class="refresh-note" data-testid="overview-refreshing">
        {{ t(lang, 'portfolioRefreshing') }}
      </div>
      <div
        v-else-if="!live && tradesRefreshError"
        class="refresh-stale"
        role="status"
        data-testid="overview-refresh-error"
      >
        <div>{{ t(lang, 'portfolioStaleAfterTrade') }}</div>
        <div class="details">
          <span data-testid="overview-refresh-error-code">{{ tradesRefreshError.code }}</span>
          <span v-if="tradesRefreshError.traceId" data-testid="overview-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ tradesRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="overview-refresh-retry" @click="refreshRecentTrades">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <div v-if="!live && tradesLoading" class="block-state" data-testid="overview-trades-loading">
        {{ t(lang, 'loading') }}
      </div>
      <div v-else-if="!live && tradesError" class="block-error" data-testid="overview-trades-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="overview-trades-error-code">{{ tradesError.code }}</span>
          <span v-if="tradesError.traceId" data-testid="overview-trades-trace-id">
            {{ t(lang, 'authRequestId') }} {{ tradesError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="overview-trades-retry" @click="loadRecentTrades">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <div v-else-if="!live && !recentTrades.length" class="block-state" data-testid="overview-trades-empty">
        {{ t(lang, 'noTrades') }}
      </div>
      <table v-else>
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
        <tbody v-if="live">
          <tr
            v-for="tr in mockRecentTrades"
            :key="tr.d + tr.type + tr.sym + tr.qty + tr.px + tr.fee + tr.note"
            data-testid="overview-trade-row"
          >
            <td style="color:var(--fg-dim)">{{ tr.d }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">{{ tr.sym }}</td>
            <td class="num" style="text-align:right">{{ tr.qty }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.px) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.qty * tr.px, 0) }}</td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="tr in recentTrades" :key="tr.id" data-testid="overview-trade-row">
            <td style="color:var(--fg-dim)">{{ tradeDate(tr) }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">{{ tr.symbol }}</td>
            <td class="num" style="text-align:right">{{ tr.quantity }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.price) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.quantity * tr.price, 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, NEWS, genSeries, fmtNum, fmtPct } from '../data';
import type { Lang } from '../types';
import { ApiClientError } from '../services/apiClient';
import type { PortfolioSummaryDto, TradeDto } from '../services/apiTypes';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { portfolioRevision } from '../services/portfolioRevision';
import LineChart from '../components/LineChart.vue';
import Donut from '../components/Donut.vue';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{
  order: [];
  navigate: [page: 'watchlist' | 'trades' | 'positions'];
}>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const api = getRuntimeApiClients().portfolio;
const live = api.live;

interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

const summaryState = ref<BlockState<PortfolioSummaryDto>>({ status: 'loading' });
const tradesState = ref<BlockState<TradeDto[]>>({ status: 'loading' });

const summaryLoading = computed(() => summaryState.value.status === 'loading');
const summaryError = computed(() => (summaryState.value.status === 'error' ? summaryState.value.error : null));
const summary = computed(() => (summaryState.value.status === 'loaded' ? summaryState.value.data : null));

const tradesLoading = computed(() => tradesState.value.status === 'loading');
const tradesError = computed(() => (tradesState.value.status === 'error' ? tradesState.value.error : null));
const recentTrades = computed(() => (tradesState.value.status === 'loaded' ? tradesState.value.data : []));

// D-12:診斷資訊只在錯誤狀態出現,且只露 code / traceId。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

// D-11:兩個區塊各自載入、各自重試,一邊失敗不影響另一邊。
async function loadSummary() {
  summaryState.value = { status: 'loading' };
  try {
    summaryState.value = { status: 'loaded', data: await api.getSummary() };
  } catch (error) {
    summaryState.value = { status: 'error', error: describeError(error) };
  }
}

async function loadRecentTrades() {
  tradesState.value = { status: 'loading' };
  try {
    const page = await api.listTrades({ page: 0, size: 5 });
    tradesState.value = { status: 'loaded', data: page.items };
  } catch (error) {
    tradesState.value = { status: 'error', error: describeError(error) };
  }
}

onMounted(() => {
  // mock mode 完全走 live 委派,不打任何網路。
  if (live) return;
  void loadSummary();
  void loadRecentTrades();
});

// =============== U-05 / U-06:成交後重讀的並存狀態(不取代 status 三態) ===============
/*
 * Phase 3 的 `status: 'loading'` 會把區塊換成 loading 文字/骨架。交易剛成功卻讓資料消失
 * 再長回來,是「看起來像出錯了」的典型誤導 —— 正是 D-12 要避免的「以為交易沒成功 →
 * 再送一次」。因此重讀走一組**與 status 並存**的旗標:舊值留在畫面上,只多一條「更新中…」;
 * 失敗時也不進 `status: 'error'`(那會清掉舊值),改用 stale 提示明示「可能不是最新」。
 *
 * 兩個資料源各有自己的一組旗標(D-12:四個資料源各自獨立,一個失敗不影響其他)。
 */
const summaryRefreshing = ref(false);
const summaryRefreshError = ref<BlockError | null>(null);
const tradesRefreshing = ref(false);
const tradesRefreshError = ref<BlockError | null>(null);

async function refreshSummary() {
  // 還沒有可保留的舊值(首次載入中,或首次就失敗)→ 沒有 U-05 要保護的東西,退回一般載入。
  if (summaryState.value.status !== 'loaded') {
    await loadSummary();
    return;
  }
  summaryRefreshing.value = true;
  summaryRefreshError.value = null;
  try {
    summaryState.value = { status: 'loaded', data: await api.getSummary() };
  } catch (error) {
    summaryRefreshError.value = describeError(error);
  } finally {
    summaryRefreshing.value = false;
  }
}

async function refreshRecentTrades() {
  if (tradesState.value.status !== 'loaded') {
    await loadRecentTrades();
    return;
  }
  tradesRefreshing.value = true;
  tradesRefreshError.value = null;
  try {
    const result = await api.listTrades({ page: 0, size: 5 });
    tradesState.value = { status: 'loaded', data: result.items };
  } catch (error) {
    tradesRefreshError.value = describeError(error);
  } finally {
    tradesRefreshing.value = false;
  }
}

/*
 * D-10:成交後由**已掛載**的頁自己重讀自己的資料源。
 * `App.vue:36` 用 `v-if` 切頁,未掛載的頁沒有任何消費者,代它發請求是純粹的無效工。
 */
watch(portfolioRevision, () => {
  // mock mode 完全走 live 委派(Pinia reactivity),不打任何網路 —— 與 onMounted 同一條規則。
  if (live) return;
  void refreshSummary();
  void refreshRecentTrades();
});

const ranges = ['1D','1W','1M','3M','6M','1Y','All'];
const range = ref('6M');

const series = genSeries(80, 1_000_000, 0.012, 5);
const last = series[series.length - 1];
const ret = (last - series[0]) / series[0] * 100;

const mockKpis = computed(() => [
  { l: t(props.lang, 'totalAssets'), v: '$' + fmtNum(last, 0), s: '+1.04% ' + t(props.lang, 'yesterday'), up: true as boolean | null },
  { l: t(props.lang, 'todayPnl'), v: '+$12,481', s: '+1.04%', up: true as boolean | null },
  { l: t(props.lang, 'availableCash'), v: '$84,210', s: '8.4%', up: null as boolean | null },
  { l: t(props.lang, 'totalReturn'), v: fmtPct(ret), s: t(props.lang, 'annualized') + ' 18.4%', up: true as boolean | null },
]);

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${fmtNum(Math.abs(value), 0)}`;
}

// D-14:API mode 兩張卡皆為後端值。roi 是比值,×100 純屬顯示格式化(D-04 非平行重算);
// totalPnl 與 holdingCount 落在兩張卡的副標,取代原本的假副標。
const apiKpis = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    {
      l: t(props.lang, 'totalAssets'),
      v: '$' + fmtNum(s.totalMarketValue, 0),
      s: `${s.holdingCount} ${t(props.lang, 'positions')}`,
      up: null as boolean | null,
    },
    {
      l: t(props.lang, 'totalReturn'),
      v: fmtPct(s.roi * 100),
      s: `${t(props.lang, 'totalPnlLabel')} ${signedMoney(s.totalPnl)}`,
      up: (s.totalPnl >= 0) as boolean | null,
    },
  ];
});

const kpiCards = computed(() => (live ? mockKpis.value : apiKpis.value));
const kpiSpan = computed(() => (live ? 3 : 6));

const alloc = [
  { n: 'Equity', v: 52, c: 'var(--accent)' }, { n: 'Crypto', v: 22, c: '#3b82f6' },
  { n: 'FX', v: 14, c: '#a855f7' }, { n: 'Bonds', v: 8, c: '#f59e0b' }, { n: 'Cash', v: 4, c: '#94a3b8' },
];

// getter 每次存取才解析 store,reactivity 由 computed 追蹤(03-02-SUMMARY 提醒 4)。
const mockRecentTrades = computed(() => (live ? live.trades.slice(0, 5) : []));

/** executedAt 是 ISO-8601,表格只顯示日期部分。 */
function tradeDate(trade: TradeDto): string {
  return trade.executedAt.slice(0, 10);
}

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
/* 區塊級狀態(D-11/D-12):診斷樣式沿用 SessionBanner 的 code/traceId 呈現慣例 */
.block-state { padding: 14px 0; font-size: 13px; color: var(--fg-dim); }
.block-error { padding: 14px 20px; font-size: 13px; }
.card.block-error { padding: 18px 20px; }
.block-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span { overflow-wrap: anywhere; }
.block-retry {
  margin-top: 8px; min-height: 32px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font: inherit; font-size: 13px; font-weight: 600;
}
/* U-05 / U-06:重讀指示與 stale 提示。不新增卡片,只在既有版位內插入一條低調說明列 */
.refresh-note { padding: 4px 0 8px; font-size: 12px; color: var(--fg-dim); }
.refresh-stale { padding: 4px 0 12px; font-size: 13px; }
.refresh-stale .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.refresh-stale .details span { overflow-wrap: anywhere; }
.block-refreshing { opacity: .72; transition: opacity .15s; }
@media (prefers-reduced-motion: reduce) {
  .block-refreshing { transition: none; }
}
</style>
