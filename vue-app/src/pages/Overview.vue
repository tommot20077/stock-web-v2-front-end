<template>
  <div class="page grid">
    <!--
      KPI 區。mock mode:四張合成卡照舊。
      API mode(04.1-18):四張後端卡 —— 總資產(totalEquity)/ 今日損益 / 可用現金 / 總報酬率。
      缺資料時誠實標示(null 顯示 —,不顯示 0),真實為零才顯示 0。
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
        <div>{{ staleText }}</div>
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
      <!--
        基準幣工具列(D-03,API mode 才渲染)。左:缺匯率提示;右:Label + 四鍵切換。
        不做確認框(U-02):切換是可逆的設定值,PATCH 冪等。
      -->
      <div v-if="!live" class="kpi-toolbar" data-testid="overview-kpi-toolbar">
        <div v-if="summary && summary.fxExcludedCount > 0" class="toolbar-hint hint" data-testid="overview-fx-excluded">
          <span aria-hidden="true">⚠</span>
          {{ tf(lang, 'fxExcludedHint', { n: summary.fxExcludedCount, base: summary.baseCurrency }) }}
        </div>
        <div class="ccy-switch">
          <span id="overview-base-currency-label" class="ccy-label">{{ t(lang, 'baseCurrency') }}</span>
          <div
            class="ccy-seg"
            role="group"
            aria-labelledby="overview-base-currency-label"
            data-testid="base-currency-switch"
          >
            <button
              v-for="code in BASE_CURRENCY_OPTIONS"
              :key="code"
              type="button"
              class="ccy-btn"
              :class="{ active: selectedCurrency === code }"
              :aria-pressed="selectedCurrency === code ? 'true' : 'false'"
              :disabled="currencyBusy"
              :data-testid="`base-currency-option-${code}`"
              @click="selectBaseCurrency(code)"
            >{{ code }}</button>
          </div>
          <span
            v-if="currencyPhase === 'switching'"
            class="hint"
            role="status"
            aria-live="polite"
            data-testid="base-currency-switching"
          >{{ t(lang, 'baseCurrencySwitching') }}</span>
        </div>
        <div v-if="currencyError" class="ccy-error" role="alert" data-testid="base-currency-error">
          <div class="ccy-error-msg">{{ t(lang, currencyError.messageKey) }}</div>
          <div class="details">
            <span data-testid="base-currency-error-code">{{ currencyError.code }}</span>
            <span v-if="currencyError.traceId" data-testid="base-currency-trace-id">
              {{ t(lang, 'authRequestId') }} {{ currencyError.traceId }}
            </span>
          </div>
        </div>
      </div>

      <div
        v-for="(k, i) in kpiCards"
        :key="i"
        class="card kpi kpi-card"
        data-testid="overview-kpi"
        :class="{ 'block-refreshing': summaryRefreshing }"
        :aria-busy="summaryRefreshing"
      >
        <div class="kpi-l">{{ k.l }}</div>
        <!-- 數值與幣別代碼拆成兩個 span:代碼是 Label 級,不與 Display 數值爭焦點(UI-SPEC §Money) -->
        <div class="kpi-v"><span class="num">{{ k.v }}</span><span v-if="k.ccy" class="kpi-ccy">{{ k.ccy }}</span></div>
        <div v-if="k.s" class="kpi-s" :data-testid="k.sTestid" :style="{ color: toneColor(k.tone) }">
          <span v-if="k.arrow" aria-hidden="true">{{ k.arrow }}</span>{{ k.s }}
        </div>
        <div v-for="n in k.notes ?? []" :key="n.testid" class="kpi-hint" :data-testid="n.testid">{{ n.text }}</div>
        <!--
          可用現金卡(D-07 / D-08 / D-11 / D-29)。各幣別餘額、負現金、缺匯率只在 API mode;
          入金 / 出金鈕也只在 API mode(mock 的現金是寫死值,按了數字不會變 → 違反鐵律 6);
          「入出金紀錄 →」兩模式都有(現金頁在 mock mode 完整可用)。
        -->
        <template v-if="k.isCash">
          <template v-if="!live">
            <div v-if="balanceListText" class="kpi-hint" data-testid="overview-kpi-cash-balances">{{ balanceListText }}</div>
            <!-- U-07:只看各幣別,不看折算後總額;數值不變紅(U-06) -->
            <div v-if="negativeCodes.length" class="kpi-hint" data-testid="overview-kpi-cash-negative">
              <span aria-hidden="true">⚠</span>
              {{ tf(lang, 'cashNegativeHint', { codes: joinCurrencyCodes(negativeCodes, lang) }) }}
            </div>
            <div v-if="fxExcludedCodes.length && summary" class="kpi-hint" data-testid="overview-kpi-cash-fx-excluded">
              <span aria-hidden="true">⚠</span>
              {{ tf(lang, 'cashFxExcludedHint', { codes: joinCurrencyCodes(fxExcludedCodes, lang), base: summary.baseCurrency }) }}
            </div>
          </template>
          <div class="kpi-actions">
            <template v-if="!live">
              <button type="button" class="btn-ghost-sm" data-testid="overview-cash-deposit" @click="openCashDialog('DEPOSIT', $event)">
                {{ t(lang, 'cashTypeDeposit') }}
              </button>
              <button type="button" class="btn-ghost-sm" data-testid="overview-cash-withdraw" @click="openCashDialog('WITHDRAWAL', $event)">
                {{ t(lang, 'cashTypeWithdrawal') }}
              </button>
            </template>
            <button type="button" class="link-btn" data-testid="overview-cash-view-entries" @click="emit('navigate', 'cash')">
              {{ t(lang, 'cashViewEntries') }}
            </button>
          </div>
        </template>
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

    <!--
      資產配置 donut(D-18)。兩模式共用 view-model 模板:mock 由既有 alloc 映射(legend 只有百分比),
      API mode 由 summary.allocation 映射(legend 帶基準幣金額)。summary 失敗時整張卡不渲染
      (單一重試點是 KPI 區的 summary 錯誤區塊,U-19);載入中卡內顯示 載入中…。
    -->
    <div
      v-if="live || !summaryError"
      class="card alloc-card"
      :class="live ? 'col-4' : 'col-4 stack-narrow'"
      style="padding: 20px"
      :data-testid="!live && summaryLoading ? 'overview-allocation-loading' : 'overview-allocation'"
    >
      <div class="ttl" style="margin-bottom:16px">{{ t(lang, 'allocation') }}</div>
      <div v-if="!live && summaryLoading" class="hint">{{ t(lang, 'loading') }}</div>
      <template v-else>
        <div v-if="allocRows.length" style="display:flex;justify-content:center;margin-bottom:16px">
          <Donut aria-hidden="true" :size="150" :thickness="22" :slices="allocRows.map(a => ({ value: a.value, color: a.color }))" />
        </div>
        <div v-else class="hint" data-testid="overview-allocation-empty">{{ t(lang, 'allocationEmpty') }}</div>
        <ul v-if="allocRows.length" class="alloc-list">
          <li v-for="a in allocRows" :key="a.key" class="alloc-row" data-testid="overview-allocation-row">
            <span class="alloc-name">
              <span class="alloc-swatch" :style="{ background: a.color }" :data-color="a.color" />{{ a.label }}
            </span>{{ ' ' }}
            <span class="alloc-vals">
              <span v-if="a.amount" class="alloc-amt num">{{ a.amount }}</span>{{ ' ' }}
              <span class="alloc-w num">{{ a.weightText }}</span>
            </span>
          </li>
        </ul>
        <div v-if="allocNegativeCash" class="hint alloc-note" data-testid="overview-allocation-negative-cash">
          {{ t(lang, 'allocationNegativeCash') }}
        </div>
      </template>
    </div>

    <!-- 近期交易。API mode 走 GET /trades?page=0&size=5(D-09),與交易頁不共用狀態。
         U-27:位於資產配置之後、觀察清單之前;API mode span 8(配置旁),mock mode span 12。 -->
    <div
      class="card trades-card"
      data-testid="overview-recent-trades"
      :class="[live ? 'col-12' : 'col-8 stack-narrow', { 'block-refreshing': tradesRefreshing }]"
      style="padding: 20px"
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
        <div>{{ staleText }}</div>
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
      <div v-else class="trades-scroll">
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
            <td style="font-weight:600">
              {{ tr.symbol }}
              <!-- D-28:幣別以標的後的標籤表示一次,金額格只放數字;currency 缺值時不渲染、不猜測 -->
              <span v-if="tr.currency" class="ccy-tag" data-testid="overview-trade-ccy-tag">{{ tr.currency }}</span>
            </td>
            <!-- Phase 5 D-08:數量 / 價格為 Decimal;股數以一般記號原值顯示(去尾零,與改字串前的 number 相同),總額在 Decimal 內相乘 -->
            <td class="num" style="text-align:right">{{ toWire(tr.quantity) }}</td>
            <td class="num" style="text-align:right">{{ fmtMoneyAmount(tr.price, tr.currency) }}</td>
            <td class="num" style="text-align:right;font-weight:600">{{ fmtMoneyAmount(tr.quantity.times(tr.price), tr.currency, 0) }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <!--
      觀察清單卡(D-26)。mock mode:沿用 data.ts 的 star 列與 sparkline(不改)。
      API mode:watchlist service 第一個清單的前 6 檔 + 即時價(U-21);只 watch 其中的 STOCK / CRYPTO(U-20)。
    -->
    <div class="card col-6 stack-mobile" style="padding: 20px" data-testid="overview-watchlist">
      <div class="wl-head">
        <div class="row-between">
          <div class="wl-title">
            <div class="ttl"><span aria-hidden="true">★ </span>{{ t(lang, 'watchlist') }}</div>
            <span
              v-if="!live && wlFirst"
              class="wl-list-name"
              data-testid="overview-watchlist-name"
              :title="wlFirst.name"
            >{{ wlFirst.name }}</span>
          </div>
          <button
            type="button"
            class="link"
            data-testid="overview-watchlist-go"
            :aria-label="t(lang, 'overviewWatchlistGo')"
            @click="emit('navigate', 'watchlist')"
          >→</button>
        </div>
        <LiveQuoteStatus
          v-if="!live"
          :lang="lang"
          :status="wlStreamStatus"
          :updated-at="wlLastUpdatedAt"
          @reconnect="quotes.reconnect()"
        />
      </div>

      <template v-if="!live">
        <div v-if="wlState.status === 'loading'" class="wl-state" data-testid="overview-watchlist-loading">
          <div>{{ t(lang, 'loading') }}</div>
          <div class="skeleton-row" aria-hidden="true" />
          <div class="skeleton-row" aria-hidden="true" />
          <div class="skeleton-row" aria-hidden="true" />
        </div>
        <div v-else-if="wlState.status === 'error'" class="wl-error" role="alert" data-testid="overview-watchlist-error">
          <div>{{ t(lang, 'loadFailed') }}</div>
          <div class="wl-details">
            <span data-testid="overview-watchlist-error-code">{{ wlState.error.code }}</span>
            <span v-if="wlState.error.traceId" data-testid="overview-watchlist-trace-id">
              {{ t(lang, 'authRequestId') }} {{ wlState.error.traceId }}
            </span>
          </div>
          <button type="button" class="wl-retry" data-testid="overview-watchlist-retry" @click="loadWatchlist">
            {{ t(lang, 'authRetry') }}
          </button>
        </div>
        <div v-else-if="wlRows.length === 0" class="wl-empty" data-testid="overview-watchlist-empty">
          <div>{{ tf(lang, 'overviewWatchlistEmpty', { name: wlFirst?.name ?? '' }) }}</div>
          <button type="button" class="link-btn wl-empty-go" @click="emit('navigate', 'markets')">
            {{ t(lang, 'watchlistGoMarkets') }}
          </button>
        </div>
        <template v-else>
          <div
            v-for="s in wlLiveRows"
            :key="s.uuid"
            class="wl-row"
            data-testid="overview-watchlist-row"
            :data-symbol="s.symbol"
            :data-quote-source="s.quoteSource"
          >
            <div class="wl-tag">{{ s.symbol.slice(0, 2) }}</div>
            <div class="wl-main">
              <div class="wl-sym">{{ s.symbol }}</div>
              <div class="wl-name">{{ s.name }}</div>
            </div>
            <div class="wl-quote">
              <div class="num wl-price">
                <!-- ● 與 sr-only「即時」只在 ws 列(D-23:非 live 不標示) -->
                <span v-if="s.quoteSource === 'ws'" class="row-live" data-testid="overview-watchlist-row-live"><span
                  class="live-dot"
                  aria-hidden="true"
                /><span class="sr-only">{{ t(lang, 'liveQuoteRowLive') }}</span></span>{{ wlPriceText(s) }}
              </div>
              <div class="num wl-chg" :class="wlChangeTone(s)">{{ wlChangeText(s) }}</div>
            </div>
          </div>
          <div v-if="wlMore > 0" class="wl-more-row">
            <button type="button" class="link-btn wl-more" data-testid="overview-watchlist-more" @click="emit('navigate', 'watchlist')">
              {{ tf(lang, 'overviewWatchlistMore', { n: wlMore }) }}
            </button>
          </div>
        </template>
      </template>

      <div v-for="s in watchlist" :key="s.sym" class="wl-row">
        <div class="wl-tag">{{ s.sym.slice(0, 2) }}</div>
        <div style="flex:1">
          <div style="font-weight:500">{{ s.sym }}</div>
          <div style="font-size:11px;color:var(--fg-dim)">{{ s.name }}</div>
        </div>
        <!-- 走勢圖容器:color 只驅動 SVG currentColor 的線條(非文字),維持圖表色 --up -->
        <div style="width:70px;height:24px" :style="{ color: s.chgPct >= 0 ? 'var(--up)' : 'var(--dn)' }">
          <LineChart :data="genSeries(20, s.price, 0.02, s.sym.charCodeAt(0))" />
        </div>
        <div style="text-align:right;min-width:90px">
          <div class="num" style="font-weight:500">{{ fmtNum(s.price) }}</div>
          <div class="num" style="font-size:11px" :style="{ color: s.chgPct >= 0 ? 'var(--up-text)' : 'var(--dn)' }">{{ fmtPct(s.chgPct) }}</div>
        </div>
      </div>
    </div>

    <!-- 新聞卡仍是示範資料(無後端來源):API mode 由 MockDataNotice 標示(鐵律 6、D-26) -->
    <div class="card col-6 stack-mobile" style="padding: 20px" data-testid="overview-news">
      <div class="ttl" style="margin-bottom:12px">{{ t(lang, 'news') }}</div>
      <MockDataNotice :lang="lang" />
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

    <!-- D-11:Overview 自己掛載的入出金對話框(API mode)。寫入成功由對話框發出 cash 重讀訊號。 -->
    <CashEntryDialog
      v-if="!live"
      :open="cashDialogOpen"
      :lang="lang"
      :initial-type="cashDialogType"
      :initial-currency="cashDialogCurrency"
      :balances="cashDialogBalances"
      @close="onCashDialogClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { t, tf } from '../i18n';
import { SYMBOLS, CRYPTO, NEWS, genSeries, fmtNum, fmtPct } from '../data';
import { fmtMoney, fmtMoneyAmount, fmtRatioPct, fmtSignedMoney, fmtSignedMoneyAmount, fmtWeightPct } from '../moneyFormat';
import type { Lang } from '../types';
import { ApiClientError } from '../services/apiClient';
import type { Asset, PortfolioSummary, TradeRecord } from '../services/apiTypes';
import { ZERO, toChartNumber, toWire, type Decimal } from '../services/decimal';
import type { WatchlistRecord } from '../services/watchlistApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { BASE_CURRENCY_OPTIONS } from '../services/profileApi';
import { baseCurrencyErrorKey } from '../baseCurrencyErrorKey';
import {
  cashBalanceListText,
  defaultCashEntryCurrency,
  joinCurrencyCodes,
  negativeCashCurrencies,
  orderCashBalances,
  unconvertedCashCurrencies,
} from '../cashBalanceView';
import type { CashEntryType } from '../services/cashApi';
import { bumpPortfolioRevision, portfolioRevision, portfolioRevisionCause } from '../services/portfolioRevision';
import LineChart from '../components/LineChart.vue';
import Donut from '../components/Donut.vue';
import CashEntryDialog from '../components/CashEntryDialog.vue';
import LiveQuoteStatus from '../components/LiveQuoteStatus.vue';
import MockDataNotice from '../components/MockDataNotice.vue';
import { useLiveQuotes } from '../composables/useLiveQuotes';
import { useQuoteRefresh } from '../composables/useQuoteRefresh';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{
  order: [];
  navigate: [page: 'watchlist' | 'trades' | 'positions' | 'cash' | 'markets'];
}>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const clients = getRuntimeApiClients();
const api = clients.portfolio;
const live = api.live;

interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

const summaryState = ref<BlockState<PortfolioSummary>>({ status: 'loading' });
const tradesState = ref<BlockState<TradeRecord[]>>({ status: 'loading' });

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
/** 遞增序號:較舊的 summary 回應(例如基準幣切換與交易重讀交疊)一律丟棄,不覆蓋較新的資料。 */
let summarySeq = 0;

async function loadSummary() {
  const seq = ++summarySeq;
  summaryState.value = { status: 'loading' };
  try {
    const data = await api.getSummary();
    if (seq !== summarySeq) return;
    summaryState.value = { status: 'loaded', data };
  } catch (error) {
    if (seq !== summarySeq) return;
    summaryState.value = { status: 'error', error: describeError(error) };
  }
}

/**
 * 近期交易同樣以遞增序號守門(quick-261106-fbs,04.1 IN-03):首次載入、重試與成交後重讀可能交疊,
 * 較舊請求晚回來時一律丟棄,不覆蓋較新的結果(與 summarySeq 同模式)。
 */
let tradesSeq = 0;

async function loadRecentTrades() {
  const seq = ++tradesSeq;
  tradesState.value = { status: 'loading' };
  try {
    const page = await api.listTrades({ page: 0, size: 5 });
    if (seq !== tradesSeq) return;
    tradesState.value = { status: 'loaded', data: page.items };
  } catch (error) {
    if (seq !== tradesSeq) return;
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
  const seq = ++summarySeq;
  summaryRefreshing.value = true;
  summaryRefreshError.value = null;
  try {
    const data = await api.getSummary();
    if (seq !== summarySeq) return;
    summaryState.value = { status: 'loaded', data };
    // 新 summary 是基準幣的真值,不再需要本地暫存的「剛儲存的值」。
    savedCurrency.value = null;
  } catch (error) {
    if (seq !== summarySeq) return;
    summaryRefreshError.value = describeError(error);
  } finally {
    if (seq === summarySeq) {
      summaryRefreshing.value = false;
      // 基準幣切換的最後一段(重讀)結束,不論成敗,工具列解鎖。
      if (currencyPhase.value === 'reloading') currencyPhase.value = 'idle';
    }
  }
}

async function refreshRecentTrades() {
  if (tradesState.value.status !== 'loaded') {
    await loadRecentTrades();
    return;
  }
  const seq = ++tradesSeq;
  tradesRefreshing.value = true;
  tradesRefreshError.value = null;
  try {
    const result = await api.listTrades({ page: 0, size: 5 });
    if (seq !== tradesSeq) return;
    tradesState.value = { status: 'loaded', data: result.items };
  } catch (error) {
    if (seq !== tradesSeq) return;
    tradesRefreshError.value = describeError(error);
  } finally {
    if (seq === tradesSeq) tradesRefreshing.value = false;
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

/**
 * U-09:重讀失敗的 stale 文案依「觸發來源」選擇,不得讓非交易的變更顯示「交易已記錄」。
 * cause 尚未設定(理論上不會發生:能重讀就代表有人 bump 過)時退回交易文案。
 */
const staleText = computed(() => {
  const cause = portfolioRevisionCause.value;
  // 04.2-review IN-06:股利 / 股數調整與入出金同屬「非交易的帳本異動」,文案比照 Positions。
  if (cause === 'cash' || cause === 'dividend' || cause === 'shareAdjustment') {
    return t(props.lang, 'portfolioStaleAfterCashEntry');
  }
  if (cause === 'baseCurrency') return t(props.lang, 'portfolioStaleAfterBaseCurrency');
  return t(props.lang, 'portfolioStaleAfterTrade');
});

// =============== 基準幣快速切換(D-03)===============
/*
 * 狀態機:idle → switching(PATCH in flight)→ reloading(PATCH 成功,summary 重讀中)→ idle;
 * PATCH 失敗直接 switching → idle 並回到原值。switching 與 reloading 期間四鍵都 disabled。
 * 選中值 = 被點的那顆(switching)?? 剛儲存的值(重讀期間 / 重讀失敗)?? summary.baseCurrency。
 */
type CurrencyPhase = 'idle' | 'switching' | 'reloading';
const currencyPhase = ref<CurrencyPhase>('idle');
const pendingCurrency = ref<string | null>(null);
const savedCurrency = ref<string | null>(null);
const currencyError = ref<{ messageKey: string; code: string; traceId: string | null } | null>(null);

const selectedCurrency = computed(
  () => pendingCurrency.value ?? savedCurrency.value ?? summary.value?.baseCurrency ?? null,
);
const currencyBusy = computed(() => currencyPhase.value !== 'idle');

async function selectBaseCurrency(code: string) {
  // 點已選中者:這是「已是此值」,不發請求;進行中的切換也不重入。
  if (currencyBusy.value || code === selectedCurrency.value) return;
  currencyError.value = null;
  pendingCurrency.value = code;
  currencyPhase.value = 'switching';
  try {
    const updated = await clients.profile.updateBaseCurrency(code);
    savedCurrency.value = updated.baseCurrency;
    pendingCurrency.value = null;
    currencyPhase.value = 'reloading';
    // 重讀由下方 watch(portfolioRevision) 觸發;結束時 refreshSummary 把 phase 放回 idle。
    bumpPortfolioRevision('baseCurrency');
  } catch (error) {
    // 失敗一律回到原值;PATCH 冪等,再點一次即重試,所以不放重試鈕。
    pendingCurrency.value = null;
    currencyPhase.value = 'idle';
    // 文案分派與 Settings 共用(baseCurrencyErrorKey);401 回 null,交給全域 SessionBanner。
    const messageKey = baseCurrencyErrorKey(error);
    const diagnostics = error instanceof ApiClientError
      ? { code: error.code, traceId: error.requestId }
      : { code: 'NETWORK_ERROR', traceId: null };
    currencyError.value = messageKey ? { messageKey, ...diagnostics } : null;
  }
}

// =============== 可用現金卡(D-07 / D-08 / D-11)===============
// 排序 / 篩選 / 串接與現金頁共用 cashBalanceView(04.1 IN-02);這裡只包一層 computed。
/** 非零幣別,依 TWD / USD / EUR / JPY 固定順序;未知幣別排在後面。 */
const orderedBalances = computed(() => orderCashBalances(summary.value?.cashBalances));

const balanceListText = computed(() => cashBalanceListText(orderedBalances.value));

/** U-07:只看各幣別,不看折算後總額 —— 總額可能為正而 USD 為負。 */
const negativeCodes = computed(() => negativeCashCurrencies(orderedBalances.value));

const fxExcludedCodes = computed(() => unconvertedCashCurrencies(orderedBalances.value, summary.value?.unconvertedCurrencies));

// =============== 入金 / 出金對話框(D-11)===============
const cashDialogOpen = ref(false);
const cashDialogType = ref<CashEntryType>('DEPOSIT');
const cashDialogCurrency = ref('TWD');
/** 出金超額提示用;summary 尚未載入時不傳。 */
const cashDialogBalances = computed(() => summary.value?.cashBalances ?? null);
let cashOpenerEl: HTMLElement | null = null;

/** 幣別預設規則:入金 → 第一個餘額為負的幣別,沒有則基準幣;出金 → 基準幣。 */
function defaultCashCurrency(kind: CashEntryType): string {
  return defaultCashEntryCurrency(kind, orderedBalances.value, summary.value?.baseCurrency ?? 'TWD');
}

function openCashDialog(kind: CashEntryType, event: Event) {
  cashOpenerEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  cashDialogType.value = kind;
  cashDialogCurrency.value = defaultCashCurrency(kind);
  cashDialogOpen.value = true;
}

async function onCashDialogClose() {
  cashDialogOpen.value = false;
  await nextTick();
  // 焦點回到開啟它的按鈕(按鈕在重讀期間仍在 DOM:KPI 卡保留舊值)。
  const opener = cashOpenerEl;
  cashOpenerEl = null;
  if (opener && opener.isConnected) opener.focus();
}

const ranges = ['1D','1W','1M','3M','6M','1Y','All'];
const range = ref('6M');

const series = genSeries(80, 1_000_000, 0.012, 5);
const last = series[series.length - 1];
const ret = (last - series[0]) / series[0] * 100;

type KpiTone = 'up' | 'dn' | 'dim';

interface KpiCard {
  l: string;
  /** Display 數值(不含幣別代碼)。 */
  v: string;
  /** 獨立的幣別代碼 span;數值缺值(—)時不帶。 */
  ccy?: string;
  /** 副標 / 比率列文字。 */
  s?: string;
  sTestid?: string;
  /** 副標的 ↗ / ↘(aria-hidden);無則不渲染。 */
  arrow?: '↗' | '↘';
  tone: KpiTone;
  /** 副標下方的常駐說明列(Hint)。 */
  notes?: { testid: string; text: string }[];
  /** 可用現金卡:附加各幣別餘額、動作列與現金頁入口。 */
  isCash?: boolean;
}

function toneColor(tone: KpiTone): string {
  // KPI 副標是文字:上漲用 --up-text(quick-261106-fbs A2),--up 只留給圖表 / 圓點。
  return tone === 'up' ? 'var(--up-text)' : tone === 'dn' ? 'var(--dn)' : 'var(--fg-dim)';
}

/** 依已格式化文字的正負號決定色調:四捨五入後為零的值不上色、不加箭頭。 */
function signTone(text: string | null): { tone: KpiTone; arrow?: '↗' | '↘' } {
  if (text?.startsWith('+')) return { tone: 'up', arrow: '↗' };
  if (text?.startsWith('-')) return { tone: 'dn', arrow: '↘' };
  return { tone: 'dim' };
}

const mockKpis = computed<KpiCard[]>(() => [
  { l: t(props.lang, 'totalAssets'), v: '$' + fmtNum(last, 0), s: '+1.04% ' + t(props.lang, 'yesterday'), tone: 'up', arrow: '↗' },
  { l: t(props.lang, 'todayPnl'), v: '+$12,481', s: '+1.04%', tone: 'up', arrow: '↗' },
  { l: t(props.lang, 'availableCash'), v: '$84,210', s: '8.4%', tone: 'dim', isCash: true },
  { l: t(props.lang, 'totalReturn'), v: fmtPct(ret), s: t(props.lang, 'annualized') + ' 18.4%', tone: 'up', arrow: '↗' },
]);

// API mode:四張卡皆為後端值(D-14 / D-22)。前端唯一的算術是 ratio × 100 的格式化(D-04 / D-21),不換匯。
// 金額是 Decimal(Phase 5 D-08):判斷用 Decimal 方法,顯示交給 moneyFormat。
const apiKpis = computed<KpiCard[]>(() => {
  const s = summary.value;
  if (!s) return [];
  const base = s.baseCurrency;
  const lang = props.lang;

  // 今日損益:null 是「全部被排除」,顯示 — 而非 0;真實為零才顯示 0(T-04.1-55)。
  const hasDayPnl = s.dayPricePnl != null;
  const ratioText = hasDayPnl ? fmtRatioPct(s.dayPricePnlRatio) : null;
  const dayNotes = [{ testid: 'overview-kpi-day-pnl-note', text: t(lang, 'dayPnlNote') }];
  if (s.dayPnlExcludedCount > 0) {
    dayNotes.push({
      testid: 'overview-kpi-day-pnl-excluded',
      text: tf(lang, 'dayPnlExcluded', { n: s.dayPnlExcludedCount }),
    });
  }

  const roiText = fmtRatioPct(s.roi);
  const pnlSign = signTone(fmtSignedMoney(s.totalPnl, base, 0));
  // DIV-02(D-01、U-10):roi / totalPnl 已含股利(後端),這裡只另列股利收入;兩者皆 0 不渲染。
  const roiNotes = dividendIncomeNotes(s);

  return [
    {
      l: t(lang, 'totalAssets'),
      v: fmtMoneyAmount(s.totalEquity, base, 0),
      ccy: base,
      s: `${s.holdingCount} ${t(lang, 'positions')}`,
      tone: 'dim',
    },
    {
      l: t(lang, 'todayPnl'),
      v: fmtSignedMoneyAmount(s.dayPricePnl, base, 0),
      ccy: hasDayPnl ? base : undefined,
      s: ratioText ?? undefined,
      sTestid: 'overview-kpi-day-pnl-ratio',
      ...signTone(ratioText),
      notes: dayNotes,
    },
    {
      l: t(lang, 'availableCash'),
      v: fmtMoneyAmount(s.cash, base, 0),
      ccy: base,
      tone: 'dim',
      isCash: true,
    },
    {
      l: t(lang, 'totalReturn'),
      v: roiText ?? '—',
      s: `${t(lang, 'totalPnlLabel')} ${fmtSignedMoney(s.totalPnl, base, 0)}`,
      ...pnlSign,
      notes: roiNotes,
    },
  ];
});

/** KPI #4 的股利收入 Hint(`--fg-dim`,中性):有預扣稅另列;金額為基準幣、0 位小數(UI-SPEC §4)。 */
function dividendIncomeNotes(s: PortfolioSummary): { testid: string; text: string }[] {
  const income = s.dividendIncome;
  const tax = s.dividendTaxWithheld;
  if (income.eq(ZERO) && tax.eq(ZERO)) return [];
  const amount = fmtSignedMoney(income, s.baseCurrency, 0);
  const text = tax.gt(ZERO)
    ? tf(props.lang, 'dividendIncomeLineWithTax', { amount, tax: fmtMoney(tax, s.baseCurrency, 0) })
    : tf(props.lang, 'dividendIncomeLine', { amount });
  return [{ testid: 'overview-kpi-dividend-income', text }];
}

const kpiCards = computed(() => (live ? mockKpis.value : apiKpis.value));

// =============== 資產配置(D-18)===============
/** 兩模式共用的 legend / donut view-model。amount 缺省時(mock)該 span 不渲染。 */
interface AllocRow {
  key: string;
  label: string;
  color: string;
  /** Donut 切片的相對大小(只看比例)。 */
  value: number;
  amount: string | null;
  weightText: string;
}

/** 分類色與標籤 key(UI-SPEC §Color,兩模式一致,寫成常數);未知 enum 值走 assetTypeOther + --fg-dim。 */
const ALLOCATION_CATEGORIES: Record<string, { color: string; labelKey: string }> = {
  STOCK: { color: 'var(--accent)', labelKey: 'assetTypeStock' },
  CRYPTO: { color: '#3b82f6', labelKey: 'assetTypeCrypto' },
  FX: { color: '#a855f7', labelKey: 'assetTypeFx' },
  BOND: { color: '#f59e0b', labelKey: 'assetTypeBond' },
  CASH: { color: '#94a3b8', labelKey: 'assetTypeCash' },
};
const UNKNOWN_CATEGORY = { color: 'var(--fg-dim)', labelKey: 'assetTypeOther' };

// mock 的既有寫死 alloc(legend 只顯示百分比,沒有金額)。
const MOCK_ALLOC = [
  { n: 'Equity', v: 52, c: 'var(--accent)' }, { n: 'Crypto', v: 22, c: '#3b82f6' },
  { n: 'FX', v: 14, c: '#a855f7' }, { n: 'Bonds', v: 8, c: '#f59e0b' }, { n: 'Cash', v: 4, c: '#94a3b8' },
];

const allocRows = computed<AllocRow[]>(() => {
  if (live) {
    return MOCK_ALLOC.map(a => ({
      key: a.n, label: a.n, color: a.c, value: a.v, amount: null, weightText: fmtWeightPct(a.v / 100),
    }));
  }
  const s = summary.value;
  if (!s) return [];
  // 舊形狀 / 快取的 summary 沒有 allocation 時,mapper(toPortfolioSummary)已補成空清單。
  return s.allocation.map(slice => {
    const meta = ALLOCATION_CATEGORIES[slice.category] ?? UNKNOWN_CATEGORY;
    return {
      key: slice.category,
      label: t(props.lang, meta.labelKey),
      color: meta.color,
      // Donut 只看比例,近似值即可:Decimal → number 只在這個圖表出口發生。
      value: toChartNumber(slice.value),
      amount: fmtMoney(slice.value, s.baseCurrency, 0),
      weightText: fmtWeightPct(slice.weight),
    };
  });
});

/** D-18:現金為負時後端不列 CASH 塊,legend 下方說明原因。 */
const allocNegativeCash = computed(() => !live && summary.value != null && summary.value.cash.lt(ZERO));

// getter 每次存取才解析 store,reactivity 由 computed 追蹤(03-02-SUMMARY 提醒 4)。
const mockRecentTrades = computed(() => (live ? live.trades.slice(0, 5) : []));

/** executedAt 是 ISO-8601,表格只顯示日期部分。 */
function tradeDate(trade: TradeRecord): string {
  return trade.executedAt.slice(0, 10);
}

// =============== 觀察清單卡(D-26;UI-SPEC §10、U-20 / U-21,API mode)===============
/** U-21:第一個清單的前 6 檔 */
const OVERVIEW_WATCHLIST_LIMIT = 6;
const NO_ROWS: readonly Asset[] = [];
const quotes = clients.quotes;

const wlState = ref<BlockState<WatchlistRecord[]>>({ status: 'loading' });
/** 最後一次 GET 成功的前端收到時間(「更新於」下限,U-19) */
const wlRestFetchedAt = ref<number | null>(null);
/** 較舊的清單回應(重試與靜默重讀交疊)一律丟棄 */
let wlSeq = 0;

const wlFirst = computed(() => (wlState.value.status === 'loaded' ? wlState.value.data[0] ?? null : null));
const wlRows = computed<readonly Asset[]>(() => wlFirst.value?.items.slice(0, OVERVIEW_WATCHLIST_LIMIT) ?? NO_ROWS);
const wlMore = computed(() => Math.max(0, (wlFirst.value?.items.length ?? 0) - OVERVIEW_WATCHLIST_LIMIT));
const wlLive = useLiveQuotes(wlRows, quotes, { restFetchedAt: wlRestFetchedAt });
const wlLiveRows = wlLive.rows;
const wlLastUpdatedAt = wlLive.lastUpdatedAt;
const wlStreamStatus = computed(() => quotes.status.value);

async function loadWatchlist() {
  const seq = ++wlSeq;
  wlState.value = { status: 'loading' };
  try {
    const data = await clients.watchlist.list();
    if (seq !== wlSeq) return;
    wlState.value = { status: 'loaded', data };
    wlRestFetchedAt.value = Date.now();
  } catch (error) {
    if (seq !== wlSeq) return;
    wlState.value = { status: 'error', error: describeError(error) };
  }
}

/** 靜默重讀(resyncSeq / 每 5 分鐘 / 回前景):不閃 loading;失敗保留舊值,「更新於」停在上次成功時間。 */
async function refreshWatchlist() {
  const seq = ++wlSeq;
  try {
    const data = await clients.watchlist.list();
    if (seq !== wlSeq) return;
    wlState.value = { status: 'loaded', data };
    wlRestFetchedAt.value = Date.now();
  } catch {
    // 保留舊值:這是背景重讀,不打擾使用者。
  }
}

// mock mode 完全不碰 watchlist service 與報價串流(卡片維持 data.ts 原樣)。
useQuoteRefresh(wlRows, quotes, refreshWatchlist, {
  enabled: !live,
  canRefresh: () => wlState.value.status === 'loaded',
});

onMounted(() => {
  if (live) return;
  void loadWatchlist();
});

/** 固定 dp 位小數、千分位(經 moneyFormat,Decimal 不經 JS number;Phase 5 D-08)。 */
function wlFixed(value: Decimal, dp: number): string {
  return fmtMoneyAmount(value, null, dp);
}

/** 與 Watchlist 頁同一套(UI-SPEC §Money:觀察清單):FX 4 位、BOND 3 位(殖利率)、其餘 2 位;缺價顯示 —(不當 0) */
function wlPriceText(row: Asset): string {
  if (row.latestPrice === null) return '—';
  const dp = row.assetType === 'FX' ? 4 : row.assetType === 'BOND' ? 3 : 2;
  return wlFixed(row.latestPrice, dp);
}

/** BOND 用 change(殖利率變動,3 位、不加 %),其餘用 changePercent */
function wlChangeValue(row: Asset): Decimal | null {
  return row.assetType === 'BOND' ? row.change : row.changePercent;
}

/** 正負號由 Decimal 比較決定(未捨入的原值,同 Phase 5 前的 number 版),本體為絕對值。 */
function wlChangeText(row: Asset): string {
  const value = wlChangeValue(row);
  if (value === null) return '—';
  const sign = value.gt(ZERO) ? '+' : value.lt(ZERO) ? '-' : '';
  const body = row.assetType === 'BOND' ? wlFixed(value.abs(), 3) : `${wlFixed(value.abs(), 2)}%`;
  return `${sign}${body}`;
}

function wlChangeTone(row: Asset): string {
  const value = wlChangeValue(row);
  if (value === null) return 'na';
  return value.gt(ZERO) ? 'up' : value.lt(ZERO) ? 'dn' : '';
}

/** mock mode 的觀察清單卡(data.ts star 列,不改);API mode 不渲染這組列,改用 wlLiveRows(D-26)。 */
const watchlist = computed(() => (live ? [...SYMBOLS.filter(s => s.star), ...CRYPTO.filter(c => c.star)] : []));
</script>

<style scoped>
.page { padding: 22px; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.kpi { padding: 16px 20px; }
.kpi-card { grid-column: span 3; }
.kpi-l { color: var(--fg-dim); font-size: 12px; }
.kpi-v { font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: 0; margin-top: 4px; }
.kpi-ccy { margin-left: 4px; font-size: 12px; font-weight: 600; color: var(--fg-dim); }
.kpi-s { font-size: 12px; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.kpi-hint { font-size: 12px; font-weight: 400; line-height: 1.35; margin-top: 4px; color: var(--fg-dim); }
.ttl { font-size: 16px; font-weight: 600; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 2px; }
.kpi-card { container-type: inline-size; }
.kpi-toolbar {
  grid-column: span 12;
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center;
  gap: 8px 16px;
}
/* 會長的文字以 flex-basis: 0 / min-width: 0 參與換行(LEARNINGS 2026-10-23),不得 ellipsis */
.toolbar-hint { flex: 1 1 0; min-width: 0; }
.hint { font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); overflow-wrap: anywhere; }
.ccy-switch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.ccy-label { font-size: 12px; font-weight: 600; line-height: 1.35; color: var(--fg-dim); }
.ccy-seg { display: inline-flex; gap: 4px; padding: 4px; border-radius: 8px; background: var(--surface2); }
.ccy-btn {
  min-height: 36px; padding: 8px 12px; border: 0; border-radius: 4px;
  background: transparent; color: var(--fg-dim);
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.ccy-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.ccy-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ccy-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ccy-error { flex-basis: 100%; font-size: 12px; line-height: 1.35; }
.ccy-error-msg { font-weight: 600; color: var(--danger); }
.ccy-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px;
  color: var(--fg-dim); font-weight: 400;
}
.ccy-error .details span { overflow-wrap: anywhere; }
.kpi-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-ghost-sm:focus-visible, .link-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.link-btn {
  margin-left: auto; min-height: 36px; padding: 8px 0; background: transparent; border: 0;
  color: var(--fg); font: inherit; font-size: 12px; font-weight: 600; text-decoration: underline; cursor: pointer;
}
/* 窄卡:連結換到下一列並靠左(margin-left:auto 在換行後仍會靠右,所以改用容器查詢) */
@container (max-width: 340px) {
  .link-btn { margin-left: 0; flex-basis: 100%; text-align: left; }
}
.row-between { display: flex; justify-content: space-between; align-items: center; }
.seg { display: flex; background: var(--surface2); border-radius: 8px; padding: 2px; }
.seg-btn {
  padding: 4px 10px; font-size: 11px; font-weight: 500;
  background: transparent; border: 0; border-radius: 6px;
  color: var(--fg-dim);
}
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.col-4 { grid-column: span 4; }
.col-6 { grid-column: span 6; }
.col-8 { grid-column: span 8; }
.col-12 { grid-column: span 12; }
.alloc-list { list-style: none; margin: 0; padding: 0; }
.alloc-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; font-size: 12px; font-weight: 400; }
.alloc-name { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.alloc-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.alloc-vals { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: baseline; gap: 4px 12px; }
.alloc-amt { color: var(--fg-dim); }
.alloc-w { font-weight: 600; color: var(--fg); }
.alloc-note { margin-top: 8px; }
.trades-scroll { overflow-x: auto; }
/* D-28:交易列的幣別標籤。與 Trades.vue 同尺寸規格,line-height 1.2 讓它落在既有 line box 內、不改列高。 */
.ccy-tag {
  display: inline-block; margin-left: 8px; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  border-radius: 99px; background: var(--surface2); color: var(--fg-dim);
}
.wl-row { display: flex; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); gap: 12px; }
/* 04.2-24 觀察清單卡 API 模板(UI-SPEC §10;Typography 遷移 #8:代號 13/600、名稱 12/400、價格 13/600、漲跌 12/400) */
.wl-head { margin-bottom: 12px; }
.wl-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.wl-list-name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim);
}
.wl-main { flex: 1 1 0; min-width: 0; }
.wl-sym { font-size: 13px; font-weight: 600; line-height: 1.45; }
.wl-name { font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); overflow-wrap: anywhere; }
.wl-quote { text-align: right; white-space: nowrap; }
.wl-price { font-size: 13px; font-weight: 600; line-height: 1.45; }
.wl-chg { font-size: 12px; font-weight: 400; line-height: 1.35; }
.wl-chg.up { color: var(--up-text); }
.wl-chg.dn { color: var(--dn); }
.wl-chg.na { color: var(--fg-dim); }
/* 即時列標記:6px 實心圓點(圖形尺寸,Exception 2)+ sr-only「即時」 */
.row-live { display: inline-flex; align-items: center; margin-right: 4px; vertical-align: middle; }
.live-dot { display: inline-block; width: 6px; height: 6px; border-radius: 99px; background: var(--success); }
.wl-more-row { display: flex; justify-content: flex-end; border-top: 1px solid var(--border); }
.wl-state { padding: 16px 0; font-size: 13px; color: var(--fg-dim); }
.wl-error { padding: 16px 0; font-size: 13px; }
.wl-details {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px; font-weight: 400;
}
.wl-details span { overflow-wrap: anywhere; user-select: text; }
.wl-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.wl-retry:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wl-empty { padding: 16px 0; font-size: 13px; overflow-wrap: anywhere; }
.wl-empty .wl-empty-go { margin-left: 0; }
.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.wl-tag {
  width: 32px; height: 32px; background: var(--surface2); border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
}
.news-row { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.news-thumb { width: 36px; height: 36px; background: var(--surface2); border-radius: 8px; flex-shrink: 0; }
.news-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--fg-dim); margin-bottom: 3px; }
.news-bullet { width: 3px; height: 3px; background: var(--fg-mute); border-radius: 50%; }
.news-tag { margin-left: auto; padding: 1px 8px; background: var(--surface2); border-radius: 99px; font-size: 10px; font-weight: 500; }
.btn-accent { background: var(--accent); color: var(--on-accent); border: 0; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.link { background: transparent; border: 0; color: var(--fg-dim); font-size: 12px; }
table { width: 100%; }
thead th {
  text-align: left; padding: 8px 0; font-weight: 500;
  color: var(--fg-dim); font-size: 11px;
  border-bottom: 1px solid var(--border);
}
tbody td { padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
/*
 * 相鄰儲存格至少隔 12px(04.1-31):欄位在窄螢幕被壓到內容最小寬時,靠右對齊的數字格沒有內距,
 * 數量 `0.5` 與單價 `60,000.00` 會黏成 `0.560,000.00`。內距加在「前面有同層格」的格子左側,
 * 第一欄各自的 padding-left: 16px(inline)不受影響;L9 以 >= 6px 量測。
 */
thead th + th, tbody td + td { padding-left: 12px; }
.pill {
  display: inline-block; padding: 2px 8px; border-radius: 99px;
  font-size: 11px; font-weight: 500;
  background: var(--surface2); color: var(--fg-dim);
}
.pill.buy { background: color-mix(in oklch, var(--up) 12%, transparent); color: var(--up-text); }
.pill.sell { background: color-mix(in oklch, var(--dn) 12%, transparent); color: var(--dn); }
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
  color: var(--danger); font: inherit; font-size: 13px; font-weight: 600;
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
  .skeleton-row { animation: none; }
}
/* 響應式(U-27):只作用於本 phase 渲染的元素;宣告順序必須在 .col-* / .kpi-card 之後才能覆寫 */
@media (max-width: 1099px) {
  .kpi-card { grid-column: span 6; }
  .stack-narrow { grid-column: span 12; }
}
@media (max-width: 639px) {
  .kpi-card { grid-column: span 12; }
  /* 觀察清單 / 新聞:兩欄並排在 <640px 會把 main 撐出水平捲動(04.1-19 L2 抓到),改為單欄堆疊 */
  .stack-mobile { grid-column: span 12; }
  .toolbar-hint { flex: 1 1 100%; }
  .ccy-switch { margin-left: 0; }
}
</style>
