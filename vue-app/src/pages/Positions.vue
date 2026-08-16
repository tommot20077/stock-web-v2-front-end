<template>
  <div class="page grid">
    <div class="row-between" style="grid-column: span 12; align-items:center">
      <div>
        <h2>{{ t(lang, 'positions') }}</h2>
        <!-- 標題列彙總:mock 由持倉陣列加總,API mode 讀 summary 後端欄位(D-04) -->
        <div v-if="live" class="sub">${{ fmtNum(totalVal, 0) }} · {{ mockPositions.length }} {{ lang === 'zh' ? '檔' : 'holdings' }}</div>
        <div v-else-if="summary" class="sub" data-testid="positions-header-summary">
          ${{ fmtNum(summary.totalMarketValue, 0) }} · {{ summary.holdingCount }} {{ lang === 'zh' ? '檔' : 'holdings' }}
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <!--
          range 選擇器與時光機都建構在 genSeries / priceAt 的合成序列之上,
          後端沒有日級歷史可推導 → API mode 隱藏(D-16)。
        -->
        <template v-if="live">
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
        </template>
        <button class="btn-accent" @click="$emit('order')">+ {{ t(lang, 'newOrder') }}</button>
      </div>
    </div>

    <!-- ===== Time machine scrubber(mock only,D-16) ===== -->
    <div v-if="live && scrubOn" class="tm-bar" style="grid-column: span 12">
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

    <!--
      U-05 / U-06:成交後重讀的指示列。刻意**不新增卡片、不改任何 grid span**,
      只在彙總條上方插入一條 12px 說明列;失敗時就地換成 stale 提示 + 診斷列 + 重試。
    -->
    <div v-if="!live && summaryRefreshing" class="refresh-strip" style="grid-column: span 12">
      <div class="refresh-note" data-testid="positions-refreshing">{{ t(lang, 'portfolioRefreshing') }}</div>
    </div>
    <div v-else-if="!live && summaryRefreshError" class="refresh-strip" style="grid-column: span 12">
      <!-- role="status" 而非 alert:交易已經成功,這不是需要打斷使用者的錯誤(U-06) -->
      <div class="refresh-stale" role="status" data-testid="positions-refresh-error">
        <div>{{ t(lang, 'portfolioStaleAfterTrade') }}</div>
        <div class="details">
          <span data-testid="positions-refresh-error-code">{{ summaryRefreshError.code }}</span>
          <span v-if="summaryRefreshError.traceId" data-testid="positions-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ summaryRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-refresh-retry" @click="refreshSummary">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
    </div>

    <!--
      彙總條。mock:六張含 Sharpe/年化/MaxDD 的合成卡照舊。
      API mode(D-14 落點 + D-16):六張全部改讀 summary 後端欄位,假 KPI 就地被取代。
    -->
    <div
      v-if="!live && summaryLoading"
      class="card stat block-state"
      data-testid="positions-summary-loading"
      style="grid-column: span 12"
    >
      {{ t(lang, 'loading') }}
    </div>
    <div
      v-else-if="!live && summaryError"
      class="card stat block-error"
      data-testid="positions-summary-error"
      style="grid-column: span 12"
    >
      <div>{{ t(lang, 'loadFailed') }}</div>
      <div class="details">
        <span data-testid="positions-summary-error-code">{{ summaryError.code }}</span>
        <span v-if="summaryError.traceId" data-testid="positions-summary-trace-id">
          {{ t(lang, 'authRequestId') }} {{ summaryError.traceId }}
        </span>
      </div>
      <button class="block-retry" data-testid="positions-summary-retry" @click="loadSummary">
        {{ t(lang, 'authRetry') }}
      </button>
    </div>
    <template v-else>
      <div
        v-for="(s, i) in statCards"
        :key="i"
        class="card stat"
        data-testid="positions-stat"
        :class="{ scrubbed: scrubDays > 0, 'block-refreshing': summaryRefreshing }"
        :aria-busy="summaryRefreshing"
      >
        <div class="stat-l">{{ s.l }}</div>
        <div class="stat-v num" :style="{ color: s.up == null ? 'var(--fg)' : s.up ? 'var(--up)' : 'var(--dn)' }">{{ s.v }}</div>
        <div v-if="s.delta" class="stat-d num" :style="{ color: s.up ? 'var(--up)' : 'var(--dn)' }">{{ s.delta }}</div>
      </div>
    </template>

    <!-- Equity curve:genSeries 合成序列,需日級歷史 → API mode 隱藏(D-16) -->
    <div v-if="live" class="card chart" style="grid-column: span 8">
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

    <!-- Top movers:API mode 由後端 unrealizedPnl 排序推導(D-16 例外:可真實推導者不隱藏) -->
    <div v-if="live || movers.length" class="card" :style="{ gridColumn: live ? 'span 4' : 'span 12', padding: '20px' }">
      <div class="ttl" style="margin-bottom:14px">{{ t(lang, 'topMovers') }}</div>
      <div v-for="m in movers" :key="m.sym" class="mover">
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

    <!--
      Sector breakdown:HoldingDto 無 sector,API mode 全部持倉會歸 'Other' 等同假資料
      → 隱藏(D-01 更正 + D-16)。mock mode 照舊。
    -->
    <div v-if="live" class="card" style="grid-column: span 12; padding: 20px">
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
    <div
      class="card"
      style="grid-column: span 12; overflow: hidden"
      :class="{ 'block-refreshing': holdingsRefreshing }"
      :aria-busy="holdingsRefreshing"
    >
      <!-- U-05 / U-06:重讀期間保留整張表格,只在頂端加一條指示列(見上方 summary 的同型說明) -->
      <div v-if="!live && holdingsRefreshing" class="refresh-note" data-testid="positions-refreshing">
        {{ t(lang, 'portfolioRefreshing') }}
      </div>
      <div
        v-else-if="!live && holdingsRefreshError"
        class="refresh-stale"
        role="status"
        data-testid="positions-refresh-error"
      >
        <div>{{ t(lang, 'portfolioStaleAfterTrade') }}</div>
        <div class="details">
          <span data-testid="positions-refresh-error-code">{{ holdingsRefreshError.code }}</span>
          <span v-if="holdingsRefreshError.traceId" data-testid="positions-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ holdingsRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-refresh-retry" @click="refreshHoldings">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <!--
        Q5(大清單):loading 不依賴資料筆數,先渲染固定骨架列,資料到位後一次填入完整表格。
        本階段不做虛擬捲動(holdings 後端不分頁,實測筆數見 SUMMARY)。
      -->
      <div v-if="!live && holdingsLoading" class="block-state" data-testid="positions-holdings-loading">
        <div style="margin-bottom:10px">{{ t(lang, 'loading') }}</div>
        <div v-for="i in 6" :key="i" class="skeleton-row" />
      </div>
      <div v-else-if="!live && holdingsError" class="block-error" data-testid="positions-holdings-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="positions-holdings-error-code">{{ holdingsError.code }}</span>
          <span v-if="holdingsError.traceId" data-testid="positions-holdings-trace-id">
            {{ t(lang, 'authRequestId') }} {{ holdingsError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-holdings-retry" @click="loadHoldings">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <div v-else-if="!live && !holdings.length" class="block-state" data-testid="positions-holdings-empty">
        {{ t(lang, 'noHoldings') }}
      </div>
      <table v-else>
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
        <!-- mock 路徑:計算邏輯與 Phase 3 之前逐字相同(含時光機 scrub 效果與 lastFill 高亮) -->
        <tbody v-if="live">
          <tr
            v-for="p in sortedPositions"
            :key="p.sym"
            data-testid="positions-row"
            :class="{ fresh: effectiveLastFill && p.sym === effectiveLastFill.sym, scrubbed: scrubDays > 0 }"
            @click="$emit('order', { sym: p.sym })"
          >
            <td style="font-weight:600;padding-left:16px">
              {{ p.sym }}
              <!-- U-12:不只靠顏色與動畫 —— 色盲 / 高對比 / 動畫播完的使用者都要看得出是哪一列 -->
              <span
                v-if="effectiveLastFill && p.sym === effectiveLastFill.sym"
                class="fresh-badge"
                data-testid="positions-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
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
        <!--
          API 路徑:每一格都是後端欄位(D-04)。唯一的前端衍生是 weight,
          且分母是 summary.totalMarketValue 而非 qty×price 的自行加總(D-04 例外條款)。
          D-13:fresh 的來源是 effectiveLastFill(API mode 由 post-trade refetch 提供)。
        -->
        <tbody v-else>
          <tr
            v-for="h in sortedHoldings"
            :key="h.assetId"
            data-testid="positions-row"
            :class="{ fresh: effectiveLastFill && h.symbol === effectiveLastFill.sym }"
            @click="$emit('order', { sym: h.symbol })"
          >
            <td style="font-weight:600;padding-left:16px">
              {{ h.symbol }}
              <!-- U-12:不只靠顏色與動畫的線索,mock / API 兩條路徑一致 -->
              <span
                v-if="effectiveLastFill && h.symbol === effectiveLastFill.sym"
                class="fresh-badge"
                data-testid="positions-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
            <td style="color:var(--fg-dim)">{{ h.assetName }}</td>
            <td class="num" style="text-align:right">{{ h.totalQuantity }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ fmtNum(h.avgCost) }}</td>
            <td class="num" style="text-align:right">
              ${{ fmtNum(h.marketPrice) }}
              <!-- D-03:行情來自快取可能延遲,顯示時間讓使用者知道資料新鮮度 -->
              <div class="scrub-cmp" data-testid="positions-price-time" :title="t(lang, 'priceAsOf')">{{ fmtDateTime(h.priceTime) }}</div>
            </td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(h.marketValue, 0) }}</td>
            <td class="num" style="text-align:right" :style="{ color: h.unrealizedPnl >= 0 ? 'var(--up)' : 'var(--dn)' }">
              <div>{{ signedMoney(h.unrealizedPnl) }}</div>
              <div style="font-size:11px">{{ fmtPct(h.roi * 100) }}</div>
            </td>
            <td style="text-align:right;padding-right:16px">
              <div style="display:inline-flex;align-items:center;gap:8px">
                <div class="bar"><div class="bar-fill" :style="{ width: holdingWeightWidth(h) }" /></div>
                <span data-testid="positions-weight" style="font-size:11px;color:var(--fg-dim);min-width:36px;text-align:right">{{ holdingWeightLabel(h) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h as createElement, onMounted, ref, watch } from 'vue';
import { t } from '../i18n';
import { genSeries, fmtNum, fmtPct } from '../data';
import type { Lang, Position } from '../types';
import { ApiClientError } from '../services/apiClient';
import type { HoldingDto, PortfolioSummaryDto } from '../services/apiTypes';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { apiLastFill, portfolioRevision } from '../services/portfolioRevision';
import LineChart from '../components/LineChart.vue';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order', preset?: { sym: string }): void }>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const api = getRuntimeApiClients().portfolio;
const live = api.live;

// live 的 getter 每次存取才解析 store,故必須在 computed / render 內取用才有 reactivity。
const mockPositions = computed<Position[]>(() => (live ? live.positions : []));

/**
 * D-13:fresh 高亮的來源切換。mock mode 有 Pinia 的成交事件,API mode 由 `apiLastFill` 補上。
 * 兩者形狀逐字相同(04-07 的刻意設計),所以**綁定表達式一個字都不用改,只是來源換了**。
 */
const effectiveLastFill = computed(() => (live ? live.lastFill : apiLastFill.value));

// =============== API mode 區塊狀態機(D-11:兩區塊各自載入、各自重試) ===============
interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

const summaryState = ref<BlockState<PortfolioSummaryDto>>({ status: 'loading' });
const holdingsState = ref<BlockState<HoldingDto[]>>({ status: 'loading' });

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const summaryLoading = computed(() => summaryState.value.status === 'loading');
const summaryError = computed(() => (summaryState.value.status === 'error' ? summaryState.value.error : null));
const summary = computed(() => (summaryState.value.status === 'loaded' ? summaryState.value.data : null));

const holdingsLoading = computed(() => holdingsState.value.status === 'loading');
const holdingsError = computed(() => (holdingsState.value.status === 'error' ? holdingsState.value.error : null));
const holdings = computed(() => (holdingsState.value.status === 'loaded' ? holdingsState.value.data : []));

// D-12:診斷資訊只在錯誤狀態出現,且只露 code / traceId(不外洩後端 message)。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

async function loadSummary() {
  summaryState.value = { status: 'loading' };
  try {
    summaryState.value = { status: 'loaded', data: await api.getSummary() };
  } catch (error) {
    summaryState.value = { status: 'error', error: describeError(error) };
  }
}

async function loadHoldings() {
  holdingsState.value = { status: 'loading' };
  try {
    holdingsState.value = { status: 'loaded', data: await api.listHoldings() };
  } catch (error) {
    holdingsState.value = { status: 'error', error: describeError(error) };
  }
}

onMounted(() => {
  // mock mode 完全走 live 委派,不打任何網路。
  if (live) return;
  void loadSummary();
  void loadHoldings();
});

// =============== U-05 / U-06:成交後重讀的並存狀態(不取代 status 三態) ===============
/*
 * Phase 3 的 `status: 'loading'` 會把表格換成骨架列。交易剛成功卻讓整頁資料消失再長回來,
 * 是「看起來像出錯了」的典型誤導 —— 正是 D-12 要避免的「以為交易沒成功 → 再送一次」。
 * 因此重讀走一組**與 status 並存**的旗標:舊值留在畫面上,只多一條「更新中…」;
 * 失敗時也不進 `status: 'error'`(那會清掉舊值),改用 stale 提示明示「可能不是最新」。
 *
 * 兩個資料源各有自己的一組旗標(D-12:四個資料源各自獨立,一個失敗不影響其他)。
 */
const summaryRefreshing = ref(false);
const summaryRefreshError = ref<BlockError | null>(null);
const holdingsRefreshing = ref(false);
const holdingsRefreshError = ref<BlockError | null>(null);

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

async function refreshHoldings() {
  if (holdingsState.value.status !== 'loaded') {
    await loadHoldings();
    return;
  }
  holdingsRefreshing.value = true;
  holdingsRefreshError.value = null;
  try {
    holdingsState.value = { status: 'loaded', data: await api.listHoldings() };
  } catch (error) {
    holdingsRefreshError.value = describeError(error);
  } finally {
    holdingsRefreshing.value = false;
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
  void refreshHoldings();
});

function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${fmtNum(Math.abs(value), 0)}`;
}

/** D-03:priceTime 為 ISO-8601 或 null(mock 端恆為 null),格式化為本地日期時間短格式。 */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * D-04 明文例外:後端 HoldingDto / PortfolioSummaryDto 都沒有 weight,只能前端衍生。
 * 但分母必須是後端的 summary.totalMarketValue —— 不得改用本頁 holdings 的 qty×price 自行加總。
 * summary 尚未載入(或分母為 0)時回 null,呈現為破折號而非編造 0.0%。
 */
function holdingWeight(holding: HoldingDto): number | null {
  const s = summary.value;
  if (!s || !Number.isFinite(s.totalMarketValue) || s.totalMarketValue === 0) return null;
  if (!Number.isFinite(holding.marketValue)) return null;
  return holding.marketValue / s.totalMarketValue * 100;
}

function holdingWeightLabel(holding: HoldingDto): string {
  const w = holdingWeight(holding);
  return w === null ? '—' : `${w.toFixed(1)}%`;
}

function holdingWeightWidth(holding: HoldingDto): string {
  const w = holdingWeight(holding);
  return `${w === null ? 0 : Math.max(0, Math.min(100, w))}%`;
}

// =============== mock mode:以下計算與模板與 Phase 3 之前完全相同 ===============
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

const totalCost = computed(() => mockPositions.value.reduce((s, p) => s + p.qty * p.avg, 0));
const totalVal = computed(() => mockPositions.value.reduce((s, p) => s + p.qty * p.price, 0));

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

const mockStats = computed(() => {
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

/**
 * API mode 的六張卡全部來自 summary 後端欄位(D-14 授權落點 + D-04);
 * roi 是比值,×100 是顯示格式化而非平行重算。Sharpe / 年化 / MaxDD 三張寫死卡就地被取代(D-16)。
 */
const apiStats = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { l: t(props.lang, 'mktValue'), v: '$' + fmtNum(s.totalMarketValue, 0), up: null as boolean | null, delta: '' },
    { l: t(props.lang, 'unrealized'), v: signedMoney(s.unrealizedPnl), up: (s.unrealizedPnl >= 0) as boolean | null, delta: '' },
    { l: t(props.lang, 'roi'), v: fmtPct(s.roi * 100), up: (s.roi >= 0) as boolean | null, delta: '' },
    { l: t(props.lang, 'realizedPnl'), v: signedMoney(s.realizedPnl), up: (s.realizedPnl >= 0) as boolean | null, delta: '' },
    { l: t(props.lang, 'totalPnlLabel'), v: signedMoney(s.totalPnl), up: (s.totalPnl >= 0) as boolean | null, delta: '' },
    { l: t(props.lang, 'costBasis'), v: '$' + fmtNum(s.totalCostBasis, 0), up: null as boolean | null, delta: '' },
  ];
});

const statCards = computed(() => (live ? mockStats.value : apiStats.value));

// Top movers (P&L abs) — top 4
const mockTopMovers = computed(() => {
  return [...mockPositions.value]
    .map(p => ({ sym: p.sym, name: p.name, pnl: pnl(p), pct: pnlPct(p) }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 4);
});

// D-16 例外:可由後端 unrealizedPnl / roi 真實推導,故不隱藏。
const apiTopMovers = computed(() => {
  return [...holdings.value]
    .map(x => ({ sym: x.symbol, name: x.assetName, pnl: x.unrealizedPnl, pct: x.roi * 100 }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 4);
});

const movers = computed(() => (live ? mockTopMovers.value : apiTopMovers.value));

// Sector breakdown(mock only)
const SECTOR_COLORS = ['var(--accent)', '#3b82f6', '#a855f7', '#f59e0b', '#94a3b8', '#10b981'];
function sectorColor(i: number) { return SECTOR_COLORS[i % SECTOR_COLORS.length]; }

const sectorStats = computed(() => {
  const map: Record<string, { value: number; cost: number; count: number }> = {};
  for (const p of mockPositions.value) {
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
  const rows = [...mockPositions.value];
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

/**
 * API 路徑的排序值一律取後端欄位(D-04);holdings 為完整 List 不分頁,
 * client-side 排序因此是正確的 —— 與 trades 的分頁情境不同,勿套用後端排序(CONTEXT specifics)。
 */
const sortedHoldings = computed(() => {
  const rows = [...holdings.value];
  if (!sortKey.value) return rows;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const k = sortKey.value;
  rows.sort((a, b) => {
    let va: any, vb: any;
    switch (k) {
      case 'sym': va = a.symbol; vb = b.symbol; break;
      case 'qty': va = a.totalQuantity; vb = b.totalQuantity; break;
      case 'avg': va = a.avgCost; vb = b.avgCost; break;
      case 'price': va = a.marketPrice; vb = b.marketPrice; break;
      case 'value': va = a.marketValue; vb = b.marketValue; break;
      case 'pnl': va = a.unrealizedPnl; vb = b.unrealizedPnl; break;
      case 'weight': va = holdingWeight(a) ?? 0; vb = holdingWeight(b) ?? 0; break;
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
  p.k === p.sk ? createElement('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

function safePct(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator * 100;
}
function pnl(p: Position) { return p.qty * p.price - p.qty * p.avg; }
function pnlPct(p: Position) { return safePct(pnl(p), p.qty * p.avg); }
function weight(p: Position) { return safePct(p.qty * p.price, totalVal.value); }

// =============== Time machine(mock only,D-16) ===============
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
  return mockPositions.value.reduce((s, p) => s + p.qty * effPrice(p), 0);
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

/* 區塊級狀態(D-11/D-12):診斷樣式沿用 SessionBanner / Overview 的 code/traceId 呈現慣例 */
.block-state { padding: 18px 20px; font-size: 13px; color: var(--fg-dim); }
.block-error { padding: 18px 20px; font-size: 13px; }
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
.refresh-note { padding: 8px 20px; font-size: 12px; color: var(--fg-dim); }
.refresh-stale { padding: 14px 20px; font-size: 13px; }
.refresh-stale .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.refresh-stale .details span { overflow-wrap: anywhere; }
.block-refreshing { opacity: .72; transition: opacity .15s; }

/*
 * U-12:剛成交列的非顏色線索。形狀沿用 Trades 的 .pill,但**只有水平內距**:
 * 12px × line-height 1.2 = 14.4px,小於本列 13px 文字的行高,因此 inline-block
 * 完整落在既有 line box 內 —— §Layout Contract 的「不改列高」是這樣達成的。
 */
.fresh-badge {
  display: inline-block; margin-left: 8px;
  padding: 0 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  background: color-mix(in oklch, var(--accent) 16%, transparent); color: var(--fg);
}

/*
 * U-12 / a11y:動畫關掉,標記照常顯示 —— 這正是「不只靠動畫」的價值所在。
 * 高亮的壽命由 App.vue 的 v-if 切頁卸載界定,**不用計時器**(計時器會讓測試時間相依而 flaky)。
 */
@media (prefers-reduced-motion: reduce) {
  tbody tr.fresh { animation: none; }
  .skeleton-row { animation: none; }
  .block-refreshing { transition: none; }
}

/* Q5:骨架列固定筆數,載入呈現不隨資料量變動 */
.skeleton-row {
  height: 14px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
