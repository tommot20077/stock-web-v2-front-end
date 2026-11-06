<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <h2>{{ t(lang, 'trades') }}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost" data-testid="trades-export" :disabled="exporting" @click="exportCsv">
          {{ t(lang, 'export') }}
        </button>
        <!-- 04.2-21(D-28):頁籤專屬的記錄動作在匯出與新增交易之間;中性 .btn-ghost,主要 CTA 仍是新增交易 -->
        <button
          v-if="activeFilter === 'dividend'"
          type="button"
          class="btn-ghost"
          data-testid="trades-record-dividend"
          @click="openRecordDialog('cashDividend', $event)"
        >+ {{ t(lang, 'tradesRecordDividend') }}</button>
        <button
          v-else-if="activeFilter === 'shareAdjustment'"
          type="button"
          class="btn-ghost"
          data-testid="trades-record-share-adjustment"
          @click="openRecordDialog('stockDividend', $event)"
        >+ {{ t(lang, 'tradesRecordShareAdjustment') }}</button>
        <button class="btn-accent" data-testid="trades-add-trade" @click="$emit('order')">+ {{ t(lang, 'addTrade') }}</button>
      </div>
    </div>

    <!-- D-10:匯出失敗只中止匯出,不影響列表;診斷同樣只露 code / traceId(D-12) -->
    <div v-if="exportError" class="card block-error" data-testid="trades-export-error" style="margin-bottom:14px">
      <div>{{ t(lang, 'loadFailed') }}</div>
      <div class="details">
        <span data-testid="trades-export-error-code">{{ exportError.code }}</span>
        <span v-if="exportError.traceId" data-testid="trades-export-trace-id">
          {{ t(lang, 'authRequestId') }} {{ exportError.traceId }}
        </span>
      </div>
    </div>

    <!--
      04.2-20(D-12 / PORT-13 / U-25):chip 值為內部 id,標籤經 i18n。兩模式皆 6 顆:
      全部 / 買入 / 賣出 / 股利 / 股數調整 / 年度(mock 保留寫死的 2026;API 為動態當年度,D-05)。
      API mode 的每顆頁籤都是後端篩選(活動列表的 type 參數),前端不合併多個分頁端點。
      個別 id 的 testid(trades-chip-{id})在按鈕本身;既有共用的 trades-chip 保留在標籤 span 上。
    -->
    <div class="filters">
      <button
        v-for="c in chips"
        :key="c"
        type="button"
        :data-testid="`trades-chip-${chipTestId(c)}`"
        :class="['chip', { active: activeFilter === c }]"
        @click="selectChip(c)"
      ><span data-testid="trades-chip">{{ chipLabel(c) }}</span></button>
    </div>

    <!-- 04.2-21:tabindex=-1 是焦點回落點 —— 沖銷成功後該列的按鈕已消失,關閉對話框時焦點落在這裡 -->
    <div
      ref="tableCard"
      class="card"
      data-testid="trades-table"
      tabindex="-1"
      :class="{ 'block-refreshing': tradesRefreshing }"
      :aria-busy="tradesRefreshing"
    >
      <!-- U-05 / U-06:重讀期間保留整張表格,只在區塊頂端加一條指示列 -->
      <div v-if="!live && tradesRefreshing" class="refresh-note" data-testid="trades-refreshing">
        {{ t(lang, 'portfolioRefreshing') }}
      </div>
      <div
        v-else-if="!live && tradesRefreshError"
        class="refresh-stale"
        role="status"
        data-testid="trades-refresh-error"
      >
        <div>{{ staleText }}</div>
        <div class="details">
          <span data-testid="trades-refresh-error-code">{{ tradesRefreshError.code }}</span>
          <span v-if="tradesRefreshError.traceId" data-testid="trades-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ tradesRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="trades-refresh-retry" @click="retryRefresh">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <!--
        D-11:補登的交易(D-03)不保證落在第 0 頁,甚至可能不符當前篩選。
        「已記錄,但不在目前的檢視範圍」比讓使用者以為沒記錄成功好。這不是錯誤,故不用錯誤色。
      -->
      <div v-if="notInCurrentView" class="view-hint" data-testid="trades-not-in-current-view">
        <!-- 04.2-21:股利 / 股數調整的新紀錄用活動列文案(UI-SPEC §Interaction 3) -->
        {{ t(lang, eventNotInView ? 'tradesActivityNotInView' : 'tradeNotInCurrentView') }}
      </div>
      <!-- D-28:各列金額以該筆交易標的的幣別顯示(API mode 才渲染;mock 沒有幣別資料) -->
      <div
        v-if="!live && apiTrades.length"
        class="currency-note"
        data-testid="trades-currency-note"
      >{{ t(lang, 'tradesCurrencyNote') }}</div>
      <div v-if="!live && tradesLoading" class="block-state" data-testid="trades-loading">
        {{ t(lang, 'loading') }}
      </div>
      <div v-else-if="!live && tradesError" class="block-error" data-testid="trades-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="trades-error-code">{{ tradesError.code }}</span>
          <span v-if="tradesError.traceId" data-testid="trades-error-trace-id">
            {{ t(lang, 'authRequestId') }} {{ tradesError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="trades-retry" @click="reloadTrades">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <!-- 04.2-21:股利 / 股數調整頁籤的空狀態帶記錄動作(兩模式);其他頁籤(API mode)沿用 noTrades -->
      <div v-else-if="emptyKind === 'dividend'" class="empty-block" data-testid="trades-dividend-empty">
        <div class="empty-title">{{ t(lang, 'tradesDividendEmpty') }}</div>
        <div>{{ t(lang, 'tradesDividendEmptyBody') }}</div>
        <button
          type="button"
          class="btn-ghost-sm empty-action"
          data-testid="trades-empty-record-dividend"
          @click="openRecordDialog('cashDividend', $event)"
        >+ {{ t(lang, 'tradesRecordDividend') }}</button>
      </div>
      <div v-else-if="emptyKind === 'shareAdjustment'" class="empty-block" data-testid="trades-share-adjustment-empty">
        <div class="empty-title">{{ t(lang, 'tradesShareAdjustmentEmpty') }}</div>
        <div>{{ t(lang, 'tradesShareAdjustmentEmptyBody') }}</div>
        <button
          type="button"
          class="btn-ghost-sm empty-action"
          data-testid="trades-empty-record-share-adjustment"
          @click="openRecordDialog('stockDividend', $event)"
        >+ {{ t(lang, 'tradesRecordShareAdjustment') }}</button>
      </div>
      <div v-else-if="emptyKind === 'default'" class="block-state" data-testid="trades-empty">
        {{ t(lang, 'noTrades') }}
      </div>
      <table v-else>
        <thead>
          <tr>
            <!--
              只有 executedAt / total / quantity 可排序 —— 後端白名單刻意收斂(D-06),
              其餘表頭不綁 click,點了也不會發請求。mock mode 無伺服端排序,整列表頭皆不可點。
            -->
            <th
              style="padding-left:16px"
              :class="{ sortable: !live, s: !live && sortKey === 'executedAt' }"
              @click="toggleSort('executedAt')"
            >{{ t(lang, 'date') }}<SortArrow v-if="!live" :k="'executedAt'" :sk="sortKey" :sd="sortDir" /></th>
            <th>{{ t(lang, 'type') }}</th>
            <th>{{ t(lang, 'symbol') }}</th>
            <th
              style="text-align:right"
              :class="{ sortable: !live, s: !live && sortKey === 'quantity' }"
              @click="toggleSort('quantity')"
            >{{ t(lang, 'qty') }}<SortArrow v-if="!live" :k="'quantity'" :sk="sortKey" :sd="sortDir" /></th>
            <th style="text-align:right">{{ t(lang, 'price') }}</th>
            <th
              style="text-align:right"
              :class="{ sortable: !live, s: !live && sortKey === 'total' }"
              @click="toggleSort('total')"
            >{{ t(lang, 'total') }}<SortArrow v-if="!live" :k="'total'" :sk="sortKey" :sd="sortDir" /></th>
            <th style="text-align:right">{{ t(lang, 'fee') }}</th>
            <th>{{ t(lang, 'notes') }}</th>
            <!-- 04.2-20:兩模式同欄序,新增最後一欄「狀態」(已沖銷;04.2-21 在此放「沖銷這筆」) -->
            <th style="padding-right:16px">{{ t(lang, 'cashColStatus') }}</th>
          </tr>
        </thead>
        <!--
          活動列 tbody。API 路徑:整份列表就是後端當前頁的回應,前端不再做任何本地篩選或排序(T-03-15)。
          04.2-21 mock 路徑:本 session 由 mock 記錄的股利 / 股數調整走同一份模板(可沖銷),排在靜態交易列之前
          (UI-SPEC §Interaction 0:client-side 合併;mock 無分頁,合併是正確的)。
          :key 用活動列的 id(uuid,04.2-20 前為 TradeDto.id),取代原本的多欄拼接 key —— 同內容不同筆的紀錄才不會撞 key。
          D-13:fresh 的來源是 effectiveLastFill(API mode 由 post-trade refetch 提供)。
        -->
        <tbody v-if="activityRows.length">
          <tr
            v-for="(tr, i) in activityRows"
            :key="tr.id"
            data-testid="trades-row"
            :data-kind="tr.kind"
            :class="{ fresh: isActivityFresh(tr, i) }"
          >
            <!-- UI-SPEC §Interaction 3 欄位表:交易 = executedAt 日期;現金股利 = 本機 YYYY-MM-DD HH:mm;股數調整 = effectiveDate 原字串 -->
            <td class="num" style="color:var(--fg-dim);padding-left:16px">{{ activityDate(tr) }}</td>
            <td>
              <span :class="['kind-pill', kindPillClass(tr)]" data-testid="trades-kind-pill">{{ kindLabel(tr) }}</span>
              <!-- T-04.2-44:以原紀錄日期指回,不顯示 reversalOfId -->
              <div v-if="tr.reversalOfId != null" class="cell-hint" data-testid="trades-reversal-of">
                {{ tf(lang, 'cashReversalOf', { date: reversalOfDate(tr) }) }}
              </div>
            </td>
            <td style="font-weight:600">
              {{ tr.symbol }}
              <!-- D-28 / D-30:幣別以標的後的標籤表示一次,金額格只放數字;currency 缺值時不渲染、不猜測 -->
              <span v-if="tr.currency" class="ccy-tag" data-testid="trades-ccy-tag">{{ tr.currency }}</span>
              <!-- U-12:不只靠顏色與動畫的線索,mock / API 兩條路徑一致 -->
              <span
                v-if="isActivityFresh(tr, i)"
                class="pill fresh-badge"
                data-testid="trades-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
            <!-- 數量:交易沿用原值;股數調整帶號(拆股 / 合股另附比例行);現金股利不適用 -->
            <td class="num" style="text-align:right">
              <template v-if="isTrade(tr)">{{ tr.quantity }}</template>
              <template v-else-if="tr.kind === 'CASH_DIVIDEND'"><span class="na" aria-hidden="true">—</span></template>
              <template v-else>
                <span :class="{ 'is-reversed': tr.reversed }">{{ fmtSignedQuantity(tr.quantity) }}</span>
                <div v-if="tr.kind === 'SPLIT'" class="cell-hint" data-testid="trades-ratio-line">{{ ratioText(tr) }}</div>
              </template>
            </td>
            <td class="num" style="text-align:right">
              <template v-if="isTrade(tr)">{{ fmtMoneyAmount(tr.price, tr.currency) }}</template>
              <span v-else class="na" aria-hidden="true">—</span>
            </td>
            <td class="num" style="text-align:right;font-weight:600">
              <template v-if="isTrade(tr)">{{ fmtMoneyAmount(tradeTotal(tr), tr.currency, 0) }}</template>
              <template v-else-if="tr.kind === 'CASH_DIVIDEND'">
                <span :class="{ 'is-reversed': tr.reversed }">{{ fmtMoneyAmount(tr.amount, tr.currency) }}</span>
                <div v-if="(tr.withholdingTax ?? 0) > 0" class="cell-hint" data-testid="trades-tax-line">
                  {{ tf(lang, 'tradesTaxLine', { amount: fmtMoneyAmount(tr.withholdingTax, tr.currency) }) }}
                </div>
              </template>
              <span v-else class="na" aria-hidden="true">—</span>
            </td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">
              <template v-if="isTrade(tr)">{{ fmtMoneyAmount(tr.fee, tr.currency) }}</template>
              <span v-else class="na" aria-hidden="true">—</span>
            </td>
            <td style="color:var(--fg-dim)">{{ tr.note || '—' }}</td>
            <!-- U-18 慣例:「是否已沖銷」只取後端欄位,前端不推導;04.2-21 在此欄放「沖銷這筆」 -->
            <td class="col-status">
              <span v-if="tr.reversed" class="status-pill" data-testid="trades-reversed-pill">{{ t(lang, 'cashReversed') }}</span>
              <!-- 04.2-21(D-13):只有後端判定可沖銷、未被沖銷、本身不是沖銷列的事件列;BUY / SELL 永不出現 -->
              <button
                v-if="canReverse(tr)"
                type="button"
                class="btn-ghost-sm"
                data-testid="trades-reverse"
                :aria-label="reverseAria(tr)"
                @click="openReversal(tr, $event)"
              >{{ t(lang, 'cashReverseThis') }}</button>
            </td>
          </tr>
        </tbody>
        <!-- mock 路徑:client-side 篩選在無分頁下是正確的,逐字保留 Phase 3 之前的行為 -->
        <tbody v-if="live">
          <tr
            v-for="(tr, i) in filteredTrades"
            :key="tr.d + tr.type + tr.sym + tr.qty + tr.px + tr.fee + tr.note"
            data-testid="trades-row"
            :data-kind="mockKind(tr)"
            :class="{ fresh: i === 0 && effectiveLastFill && tr.sym === effectiveLastFill.sym }"
          >
            <td class="num" style="color:var(--fg-dim);padding-left:16px">{{ tr.d }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">
              {{ tr.sym }}
              <!-- U-12:不只靠顏色與動畫 —— 色盲 / 高對比 / 動畫播完的使用者都要看得出是哪一列 -->
              <span
                v-if="i === 0 && effectiveLastFill && tr.sym === effectiveLastFill.sym"
                class="pill fresh-badge"
                data-testid="trades-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
            <td class="num" style="text-align:right">{{ tr.qty }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.px) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.qty * tr.px, 0) }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ tr.fee }}</td>
            <td style="color:var(--fg-dim)">{{ tr.note || '—' }}</td>
            <!-- mock 靜態列沒有可沖銷的 id,也不會被沖銷 → 狀態欄恆空(UI-SPEC §Interaction 0) -->
            <td class="col-status"></td>
          </tr>
        </tbody>

      </table>
    </div>

    <!-- D-08:換頁按鈕而非 append/infinite-scroll(page-number 分頁在插入資料時會位移/重複) -->
    <div v-if="!live && apiTrades.length" class="pager" data-testid="trades-pagination">
      <button class="btn-ghost" data-testid="trades-prev" :disabled="pageNo <= 0" @click="goToPage(-1)">
        {{ t(lang, 'prevPage') }}
      </button>
      <span class="pager-at num" data-testid="trades-page-indicator">{{ pageNo + 1 }} / {{ totalPages }}</span>
      <button
        class="btn-ghost"
        data-testid="trades-next"
        :disabled="pageNo >= totalPages - 1"
        @click="goToPage(1)"
      >{{ t(lang, 'nextPage') }}</button>
    </div>

    <!--
      04.2-21:本頁自己的「股利與股數調整」對話框實例。頁首 / 空狀態開啟時不帶標的(typeahead,無持倉也能記,D-03);
      「沖銷這筆」只帶 reversalOf(值全取自該列)。開啟者負責 reversalConflict 後的重讀與「按鈕已消失」時的焦點回落。
    -->
    <HoldingEventDialog
      :open="dialogOpen"
      :lang="lang"
      :initial-mode="dialogMode"
      :reversal-of="dialogReversal"
      @close="onDialogClose"
      @recorded="onDialogRecorded"
      @reversal-conflict="onReversalConflict"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h as createElement, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import HoldingEventDialog from '../components/HoldingEventDialog.vue';
import { t, tf } from '../i18n';
import { fmtNum } from '../data';
import { fmtMoneyAmount, fmtSignedQuantity } from '../moneyFormat';
import { ApiClientError } from '../services/apiClient';
import type { PaginatedResponse, PortfolioActivityDto } from '../services/apiTypes';
import type { ActivityListParams } from '../services/portfolioApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import {
  apiLastFill,
  clearLastCreatedHoldingEvent,
  clearLastCreatedTrade,
  clearLastFill,
  lastCreatedHoldingEventId,
  lastCreatedTradeId,
  portfolioRevision,
  portfolioRevisionCause,
  type PortfolioRevisionCause,
} from '../services/portfolioRevision';
import { toLocalIso } from '../services/localTime';
import type { Lang, Trade } from '../types';
import type { PortfolioActivityKind } from '../services/apiTypes';

const props = defineProps<{
  lang: Lang;
  /** 04.2-21(U-11):掛載時預選的頁籤 id(例:現金頁連結傳 `'dividend'`);只在掛載時套用一次,無效值退回「全部」。 */
  initialFilter?: string;
}>();
defineEmits<{ (e: 'order'): void }>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const api = getRuntimeApiClients().portfolio;
const live = api.live;

// live 的 getter 每次存取才解析 store,故必須在 computed / render 內取用才有 reactivity。
const mockTrades = computed<Trade[]>(() => (live ? live.trades : []));

/**
 * D-13:fresh 高亮的來源切換。mock mode 有 Pinia 的成交事件,API mode 由 `apiLastFill` 補上。
 * 兩者形狀逐字相同(04-07 的刻意設計),所以**綁定表達式一個字都不用改,只是來源換了**。
 */
const effectiveLastFill = computed(() => (live ? live.lastFill : apiLastFill.value));

// D-05:mock 保留寫死的 '2026';API mode 一律動態當年度(2027 年不會突然壞掉)。
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_CHIP = String(CURRENT_YEAR);
const MOCK_YEAR_CHIP = '2026';

/**
 * 04.2-20(U-25):頁籤的內部 id。年度 chip 的 id 就是年份字串(檔名 `trades-2026-…` 沿用既有行為)。
 * 04.2-21 依此 id 決定頁首動作與空狀態。
 */
type TypeChipId = 'all' | 'buy' | 'sell' | 'dividend' | 'shareAdjustment';
type ChipId = TypeChipId | string;

const TYPE_CHIPS: readonly TypeChipId[] = ['all', 'buy', 'sell', 'dividend', 'shareAdjustment'];
const CHIP_LABEL_KEYS: Record<TypeChipId, string> = {
  all: 'tradesChipAll',
  buy: 'tradesChipBuy',
  sell: 'tradesChipSell',
  dividend: 'tradesChipDividend',
  shareAdjustment: 'tradesChipShareAdjustment',
};
/** 頁籤 → 活動列表 `type`(D-12);`all` 與年度不送 type(年度改送 dateFrom / dateTo)。 */
const CHIP_ACTIVITY_TYPE: Partial<Record<TypeChipId, NonNullable<ActivityListParams['type']>>> = {
  buy: 'BUY',
  sell: 'SELL',
  dividend: 'DIVIDEND',
  shareAdjustment: 'SHARE_ADJUSTMENT',
};

function isTypeChip(id: ChipId): id is TypeChipId {
  return (TYPE_CHIPS as readonly string[]).includes(id);
}

const chips = computed<ChipId[]>(() => [...TYPE_CHIPS, live ? MOCK_YEAR_CHIP : YEAR_CHIP]);
/** U-11:initialFilter 只在 setup 讀一次 —— 之後由使用者自己切換,prop 不再左右頁籤。 */
const activeFilter = ref<ChipId>(
  props.initialFilter && chips.value.includes(props.initialFilter) ? props.initialFilter : 'all',
);

function chipLabel(id: ChipId): string {
  return isTypeChip(id) ? t(props.lang, CHIP_LABEL_KEYS[id]) : id;
}

/** UI-SPEC §Test-Visible Contract:`trades-chip-{all|buy|sell|dividend|share-adjustment|year}`。 */
function chipTestId(id: ChipId): string {
  if (id === 'shareAdjustment') return 'share-adjustment';
  return isTypeChip(id) ? id : 'year';
}

// D-07:預設 executedAt 降序、size 20(明確送出,不倚賴後端預設)。
const PAGE_SIZE = 20;
// D-10 / T-03-19:匯出以後端 clamp 上限的 size 減少請求數。
const EXPORT_PAGE_SIZE = 100;

type SortKey = 'executedAt' | 'total' | 'quantity';
const sortKey = ref<SortKey>('executedAt');
const sortDir = ref<NonNullable<ActivityListParams['direction']>>('desc');
const pageNo = ref(0);

// =============== API mode 狀態機(D-11:區塊內嵌四態,retry 只重打自己) ===============
interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

const tradesState = ref<BlockState<PaginatedResponse<PortfolioActivityDto>>>({ status: 'loading' });

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const tradesLoading = computed(() => tradesState.value.status === 'loading');
const tradesError = computed(() => (tradesState.value.status === 'error' ? tradesState.value.error : null));
const tradesPage = computed(() => (tradesState.value.status === 'loaded' ? tradesState.value.data : null));
const apiTrades = computed<PortfolioActivityDto[]>(() => tradesPage.value?.items ?? []);
const totalPages = computed(() => tradesPage.value?.totalPages ?? 0);

/**
 * D-11:剛建立的那筆交易是否落在目前這一頁的結果集內。
 *
 * **判定只比 id。** 篩選與排序都在後端執行;前端重算「這筆符不符合目前的條件」等於
 * 複製一份後端邏輯,而第一個邊界情況(半開區間、時區)就會分歧
 * (Phase 3 D-04 / judgment §7)。沒有剛建立的交易時一律視為「在範圍內」,不顯示提示。
 */
const inResultSet = computed(() => {
  const created = lastCreatedTradeId.value;
  if (created === null) return true;
  return apiTrades.value.some(row => row.id === created);
});

const exporting = ref(false);
const exportError = ref<BlockError | null>(null);

// D-12:診斷資訊只在錯誤狀態出現,且只露 code / traceId(不外洩後端 message)。
// D-13:portfolio 讀取失敗不碰全域 SessionBanner,錯誤一律 inline。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

/**
 * chip → 後端篩選參數。日期為半開區間 [dateFrom, dateTo)(03-01-SUMMARY 契約:
 * dateFrom 含、dateTo 不含),因此「當年度」= 今年年初 ≤ occurredAt < 明年年初。
 * 04.2-20(D-12):股利 / 股數調整同樣是後端篩選(type=DIVIDEND / SHARE_ADJUSTMENT)。
 */
function filterParams(): Pick<ActivityListParams, 'type' | 'dateFrom' | 'dateTo'> {
  const id = activeFilter.value;
  if (isTypeChip(id)) {
    const type = CHIP_ACTIVITY_TYPE[id];
    return type ? { type } : {};
  }
  if (id === YEAR_CHIP) {
    return {
      dateFrom: toLocalIso(new Date(CURRENT_YEAR, 0, 1)),
      dateTo: toLocalIso(new Date(CURRENT_YEAR + 1, 0, 1)),
    };
  }
  return {};
}

/** 篩選 + 排序參數的單一來源:列表與 CSV 匯出共用,兩者語意不可能漂移(D-10)。 */
function queryParams(): ActivityListParams {
  return { ...filterParams(), sort: sortKey.value, direction: sortDir.value };
}

// =============== U-05 / U-06:成交後重讀的並存狀態(不取代 status 三態) ===============
/*
 * Phase 3 的 `status: 'loading'` 會把表格換成 loading 區塊。交易剛成功卻讓列表消失再長回來,
 * 是「看起來像出錯了」的典型誤導 —— 正是 D-12 要避免的「以為交易沒成功 → 再送一次」。
 * 因此重讀走一組**與 status 並存**的旗標:舊列留在畫面上,只多一條「更新中…」;
 * 失敗時也不進 `status: 'error'`(那會清掉舊列),改用 stale 提示明示「可能不是最新」。
 */
const tradesRefreshing = ref(false);
const tradesRefreshError = ref<BlockError | null>(null);
/** 最近一次重讀的觸發來源;stale 文案依它選(U-09 / T-04.2-46)。 */
const tradesRefreshCause = ref<PortfolioRevisionCause | null>(null);

/** 交易 → 「交易已記錄」;股利 / 股數調整 → 「紀錄已寫入」。事件寫入不得顯示「交易已記錄」。 */
const staleText = computed(() => {
  const cause = tradesRefreshCause.value;
  return t(props.lang, cause === null || cause === 'trade' ? 'portfolioStaleAfterTrade' : 'portfolioStaleAfterCashEntry');
});

/**
 * 04.2-21:mock 事件列的重讀訊號。mock 事件狀態在 adapter 模組內(非 reactive),
 * 於 portfolioRevision 變動或沖銷衝突時遞增,讓 `mockEventRows` 重新取值。
 */
const mockEventsVersion = ref(0);

/** 活動列 tbody 的資料:API = 後端當前頁;mock = 本 session 的 mock 事件(依當前頁籤篩選,最新在前)。 */
const activityRows = computed<PortfolioActivityDto[]>(() => (live ? mockEventRows.value : apiTrades.value));

/**
 * 股利 / 股數調整新紀錄是否不在目前的結果集內(判定只比 id,理由同 {@link inResultSet})。
 * API mode 重讀還沒落地前不下結論。
 */
const eventNotInView = computed(() => {
  const created = lastCreatedHoldingEventId.value;
  if (created === null) return false;
  if (!live && (tradesRefreshing.value || tradesPage.value === null)) return false;
  return !activityRows.value.some(row => row.id === created);
});

/** D-11 提示的顯示條件。重讀還沒落地前不下結論 —— 否則提示會在重讀期間先閃一下再消失。 */
const notInCurrentView = computed(() => eventNotInView.value || (!live && !tradesRefreshing.value && !inResultSet.value));

/**
 * 「新」標記:股利 / 股數調整只比 `lastCreatedHoldingEventId`;交易沿用 D-13 的第 0 列 + lastFill 規則
 * (只套在交易列,事件列不會因為同代號而被標成新)。
 */
function isActivityFresh(row: PortfolioActivityDto, index: number): boolean {
  const created = lastCreatedHoldingEventId.value;
  if (created !== null && row.id === created) return true;
  const fill = effectiveLastFill.value;
  return !live && index === 0 && isTrade(row) && fill !== null && row.symbol === fill.sym;
}

/** 04.2-21:空狀態的種類;null = 有列(或 mock 的其他頁籤:維持既有的空表格)。 */
const emptyKind = computed<'dividend' | 'shareAdjustment' | 'default' | null>(() => {
  const count = live ? mockEventRows.value.length + filteredTrades.value.length : apiTrades.value.length;
  if (count > 0) return null;
  if (activeFilter.value === 'dividend') return 'dividend';
  if (activeFilter.value === 'shareAdjustment') return 'shareAdjustment';
  return live ? null : 'default';
});

interface LoadTradesOptions {
  /** true = 保留舊列的重讀(U-05);false / 省略 = 會清空列表的一般載入。 */
  refresh?: boolean;
  /** D-15 防迴圈:回退後的那一次請求關掉它,自動重試因此至多一次。 */
  allowOverflowFallback?: boolean;
}

/**
 * D-15 溢出回退:請求頁碼 ≥ totalPages 且回空時,以 `totalPages - 1` 重新請求一次,
 * 避免「其實有資料卻顯示空列表」。
 * **防迴圈**:回退後的那次請求以 `allowOverflowFallback: false` 發出,因此自動重試至多一次;
 * 即使伺服端總頁數連續縮水,也只會多打一個請求就停在已載入狀態。
 */
/**
 * WR-11:過時回應守門。每次載入(篩選、排序、換頁、重讀、重試)遞增;回應 / 錯誤回來時序號已不是最新 → 丟棄,
 * 例如寫入後「全部」重讀較晚落地,不得蓋掉使用者隨後點的「股利」結果(含 totalPages)。
 * 溢出回退的那一次沿用呼叫端的序號(它是同一次載入的延續)。
 */
let tradesSeq = 0;

async function loadTrades(options: LoadTradesOptions = {}, inheritedSeq?: number): Promise<void> {
  const seq = inheritedSeq ?? ++tradesSeq;
  // 沒有已載入的舊列就沒有 U-05 要保護的東西 → 退回一般載入路徑。
  const refresh = options.refresh === true && tradesState.value.status === 'loaded';
  const allowOverflowFallback = options.allowOverflowFallback !== false;
  if (refresh) {
    tradesRefreshing.value = true;
    tradesRefreshError.value = null;
  } else {
    // 一般載入取代了可能還在飛的重讀:「更新中…」隨之結束(被丟棄的重讀不會再自己收起它)。
    tradesRefreshing.value = false;
    tradesState.value = { status: 'loading' };
  }
  const requestedPage = pageNo.value;
  try {
    const result = await api.listActivities({ ...queryParams(), page: requestedPage, size: PAGE_SIZE });
    if (seq !== tradesSeq) return;
    if (
      allowOverflowFallback
      && result.items.length === 0
      && result.totalPages > 0
      && requestedPage >= result.totalPages
    ) {
      pageNo.value = result.totalPages - 1;
      await loadTrades({ refresh, allowOverflowFallback: false }, seq);
      return;
    }
    tradesState.value = { status: 'loaded', data: result };
  } catch (error) {
    if (seq !== tradesSeq) return;
    if (refresh) tradesRefreshError.value = describeError(error);
    else tradesState.value = { status: 'error', error: describeError(error) };
  } finally {
    if (refresh && seq === tradesSeq) tradesRefreshing.value = false;
  }
}

/** 重試鈕:只重發列表請求,不連帶做別的事(D-11)。 */
function reloadTrades() {
  void loadTrades();
}

/** stale 提示的重試鈕:同樣保留舊列,失敗只更新 stale 提示(U-06)。 */
function retryRefresh() {
  void loadTrades({ refresh: true });
}

/**
 * D-15:任何篩選或排序變更都經此入口,頁碼一律重置為 0 後再請求。
 * D-11 的成交後重讀也走這裡(`options.refresh`),因此「保留篩選 + 保留排序 + 頁碼歸零」
 * 這三件事只有這一份實作 —— 不會有第二條重置邏輯漂移。
 */
function applyQueryChange(mutate: () => void, options: LoadTradesOptions = {}) {
  mutate();
  pageNo.value = 0;
  // D-11:使用者自己改了條件就代表他不再需要那條提示。
  // 成交後的重讀**不清**(那是提示的產生來源,清掉就永遠比不到)。
  // UI-SPEC §9:「新」標記同樣隨檢視變更結束 —— 重讀後第 0 列可能是另一筆同 symbol 的舊交易。
  if (options.refresh !== true) {
    clearLastCreatedTrade();
    clearLastFill();
    clearLastCreatedHoldingEvent();
  }
  void loadTrades(options);
}

function selectChip(chip: ChipId) {
  if (live) {
    activeFilter.value = chip;
    clearLastCreatedHoldingEvent();
    return;
  }
  applyQueryChange(() => {
    activeFilter.value = chip;
  });
}

function toggleSort(key: SortKey) {
  // mock mode 沒有伺服端排序,表頭不可點(維持 Phase 3 之前的行為)。
  if (live) return;
  applyQueryChange(() => {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey.value = key;
      sortDir.value = 'desc';
    }
  });
}

/** 換頁不是篩選/排序變更,不套 D-15 重置(但一樣是「使用者改了檢視」,D-11 提示要清掉)。 */
function goToPage(delta: number) {
  const next = pageNo.value + delta;
  if (next < 0 || next >= totalPages.value) return;
  pageNo.value = next;
  clearLastCreatedTrade();
  clearLastFill();
  clearLastCreatedHoldingEvent();
  void loadTrades();
}

onMounted(() => {
  // mock mode 完全走 live 委派,不打任何網路。
  if (live) return;
  void loadTrades();
});

// UI-SPEC §9:「新」標記的壽命到頁面 unmount 為止(App.vue 的 v-if 切頁會卸載本頁),不靠計時器。
onUnmounted(() => {
  clearLastFill();
  clearLastCreatedHoldingEvent();
});

/*
 * D-10 / D-11:成交後由**已掛載**的頁自己重讀。
 * 這裡刻意傳一個**空的** mutate 給 `applyQueryChange` —— 重用既有的單一重置入口,
 * 而不是另寫一份「頁碼歸零 + 重新請求」。D-11 要的三件事(保留篩選、保留排序、頁碼歸零)
 * 正好就是那個入口的既有語意。
 */
watch(portfolioRevision, () => {
  // mock mode 完全走 live 委派(Pinia reactivity),不打任何網路 —— 只讓 mock 事件列重新取值。
  if (live) {
    mockEventsVersion.value += 1;
    return;
  }
  // UI-SPEC §11:只有交易、股利、股數調整會改變活動列表;入出金與基準幣變更重讀只會把使用者踢回第 1 頁。
  const cause = portfolioRevisionCause.value;
  if (cause !== 'trade' && cause !== 'dividend' && cause !== 'shareAdjustment') return;
  tradesRefreshCause.value = cause;
  applyQueryChange(() => {}, { refresh: true });
});

// =============== 04.2-21:股利與股數調整對話框(D-28 / D-13) ===============
type RecordMode = 'cashDividend' | 'stockDividend';

const dialogOpen = ref(false);
const dialogMode = ref<RecordMode>('cashDividend');
const dialogReversal = ref<PortfolioActivityDto | null>(null);
const tableCard = ref<HTMLElement | null>(null);
let openerEl: HTMLElement | null = null;
let openedFromRow = false;
let recordedWhileOpen = false;

function beginDialog(event: Event, fromRow: boolean) {
  // 再次開啟對話框 = 使用者不再需要上一筆的「新」標記與不在本頁提示。
  clearLastCreatedHoldingEvent();
  openerEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  openedFromRow = fromRow;
  recordedWhileOpen = false;
}

/** 頁首 / 空狀態:不帶標的(對話框顯示 typeahead,無持倉也能記現金股利,D-03)。 */
function openRecordDialog(mode: RecordMode, event: Event) {
  beginDialog(event, false);
  dialogMode.value = mode;
  dialogReversal.value = null;
  dialogOpen.value = true;
}

/** 「沖銷這筆」:只帶 reversalOf,值全取自該列(D-13)。 */
function openReversal(row: PortfolioActivityDto, event: Event) {
  beginDialog(event, true);
  dialogReversal.value = row;
  dialogOpen.value = true;
}

function onDialogRecorded() {
  recordedWhileOpen = true;
}

/** 沖銷衝突:對話框只通知,這裡立刻重讀(一般載入,不宣稱「紀錄已寫入」)。 */
function onReversalConflict() {
  if (live) {
    mockEventsVersion.value += 1;
    return;
  }
  void loadTrades();
}

async function onDialogClose() {
  dialogOpen.value = false;
  dialogReversal.value = null;
  // 對話框關閉時已同步把焦點還給開啟者;開啟者已不在(沖銷成功後消失的按鈕、空狀態裡的動作鈕)時改落在表格卡。
  await nextTick();
  const opener = openerEl;
  openerEl = null;
  if (!opener || !opener.isConnected || (openedFromRow && recordedWhileOpen)) tableCard.value?.focus();
}

/** UI-SPEC §Interaction 3:`沖銷這筆` 的顯示條件(reversible 由後端判定;股數調整只有該標的最新一筆為 true)。 */
function canReverse(row: PortfolioActivityDto): boolean {
  const isEvent = row.kind === 'CASH_DIVIDEND' || row.kind === 'STOCK_DIVIDEND' || row.kind === 'SPLIT';
  return isEvent && row.reversible && !row.reversed && row.reversalOfId == null;
}

function reverseAria(row: PortfolioActivityDto): string {
  return tf(props.lang, 'tradesReverseAria', { date: activityDate(row), symbol: row.symbol ?? '—', type: kindLabel(row) });
}

const SortArrow = (p: { k: string; sk: string; sd: 'asc' | 'desc' }) =>
  p.k === p.sk ? createElement('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 本機 `YYYY-MM-DD`;無法解析時退回原字串前 10 碼(與 Cash.vue 同一套呈現)。 */
function localDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本機 `YYYY-MM-DD HH:mm`。 */
function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${localDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 日期欄(UI-SPEC §Interaction 3):交易列沿用 occurredAt(= executedAt)前 10 碼(既有行為);
 * 現金股利為本機 `YYYY-MM-DD HH:mm`;股數調整為 effectiveDate 原字串(除權日是日曆日,不做時區換算)。
 */
function activityDate(row: PortfolioActivityDto): string {
  if (row.kind === 'CASH_DIVIDEND') return localDateTime(row.occurredAt);
  if (row.kind === 'STOCK_DIVIDEND' || row.kind === 'SPLIT') return row.effectiveDate ?? row.occurredAt.slice(0, 10);
  return row.occurredAt.slice(0, 10);
}

/** 沖銷列指回的原紀錄日期:股利用 reversalOfOccurredAt 本機日期、股數調整用 reversalOfEffectiveDate(不輸出 uuid)。 */
function reversalOfDate(row: PortfolioActivityDto): string {
  if (row.kind === 'CASH_DIVIDEND') return localDate(row.reversalOfOccurredAt);
  return row.reversalOfEffectiveDate ?? localDate(row.reversalOfOccurredAt);
}

/** 比例行 `{new} : {old}`(拆股 4 : 1、合股 1 : 2)。 */
function ratioText(row: PortfolioActivityDto): string {
  return `${row.ratioNew ?? '—'} : ${row.ratioOld ?? '—'}`;
}

/** mock 靜態 `DIV` 示範列以 CASH_DIVIDEND 呈現(與 mock listActivities 的 kind 一致)。 */
function mockKind(trade: Trade): PortfolioActivityKind {
  return trade.type === 'DIV' ? 'CASH_DIVIDEND' : trade.type;
}

function isTrade(row: PortfolioActivityDto): boolean {
  return row.kind === 'BUY' || row.kind === 'SELL';
}

/** 交易總額 = quantity × price(不含 fee,與後端 total 排序鍵同語意)。 */
function tradeTotal(row: PortfolioActivityDto): number | null {
  if (row.quantity === null || row.price === null) return row.amount;
  return row.quantity * row.price;
}

/** 類型 pill 文字:買 / 賣沿用既有原字串;股利 / 配股 / 拆股 / 合股經 i18n(拆股 vs 合股看 ratioNew > ratioOld)。 */
function kindLabel(row: PortfolioActivityDto): string {
  switch (row.kind) {
    case 'CASH_DIVIDEND':
      return t(props.lang, 'activityKindCashDividend');
    case 'STOCK_DIVIDEND':
      return t(props.lang, 'activityKindStockDividend');
    case 'SPLIT':
      return t(props.lang, (row.ratioNew ?? 0) > (row.ratioOld ?? 0) ? 'activityKindSplit' : 'activityKindReverseSplit');
    default:
      return row.kind;
  }
}

function kindPillClass(row: PortfolioActivityDto): string {
  if (row.kind === 'BUY') return 'buy';
  if (row.kind === 'SELL') return 'sell';
  return row.kind === 'CASH_DIVIDEND' ? 'div' : '';
}

// =============== mock mode:以下篩選與 Phase 3 之前逐字相同 ===============
/**
 * 04.2-21:mock 股利寫進 mock 交易的 DIV 列已由事件列代表(可沖銷),靜態列表排除它,同一筆才不會出現兩次。
 */
const mockStaticTrades = computed<Trade[]>(() => (live ? mockTrades.value.filter(tr => !live.isHoldingEventTrade(tr)) : []));

const filteredTrades = computed(() => {
  switch (activeFilter.value) {
    case 'buy':
      return mockStaticTrades.value.filter(tr => tr.type === 'BUY');
    case 'sell':
      return mockStaticTrades.value.filter(tr => tr.type === 'SELL');
    case 'dividend':
      return mockStaticTrades.value.filter(tr => tr.type === 'DIV');
    // mock 交易沒有股數調整(mock 拆股 / 配股只攤薄持倉,不寫交易列)→ 靜態列恆為空;本 session 事件見 mockEventRows
    case 'shareAdjustment':
      return [];
    case MOCK_YEAR_CHIP:
      return mockStaticTrades.value.filter(tr => tr.d.startsWith('2026'));
    default:
      return mockStaticTrades.value;
  }
});

/**
 * 04.2-21(UI-SPEC §Interaction 0):本 session 由 mock 記錄的事件列,依當前頁籤 client-side 篩選、最新在前。
 * 買 / 賣頁籤不含事件;年度頁籤以畫面上的日期欄比對寫死的 2026(與靜態列同規則)。
 */
const mockEventRows = computed<PortfolioActivityDto[]>(() => {
  void mockEventsVersion.value;
  if (!live) return [];
  const id = activeFilter.value;
  return [...live.holdingEvents].reverse().filter(row => {
    if (id === 'all') return true;
    if (id === 'dividend') return row.kind === 'CASH_DIVIDEND';
    if (id === 'shareAdjustment') return row.kind === 'STOCK_DIVIDEND' || row.kind === 'SPLIT';
    if (id === MOCK_YEAR_CHIP) return activityDate(row).startsWith(MOCK_YEAR_CHIP);
    return false;
  });
});

// =============== CSV ===============
// 04.1-14(D-28 / UI-SPEC §Interaction 9):`currency` 緊接 `symbol`,兩模式共用同一份表頭。
// API 列填 `trade.currency`(缺值為空字串);mock 沒有幣別資料,留空而不猜(U-29)。
// 04.2-20(U-09):擴充 tax / ratio / reversal_of / reversed。數值一律未格式化原始數字;
// reversal_of 為原紀錄日期,**不輸出 uuid**(T-04.2-44);reversed 為 `true` 或空。
const CSV_HEADER = 'date,type,symbol,currency,qty,price,total,fee,tax,ratio,note,reversal_of,reversed'.split(',');

type CsvValue = string | number | null | undefined;

function downloadCsv(rows: CsvValue[][]) {
  const csv = [CSV_HEADER, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trades-${activeFilter.value.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * D-10:匯出 = **當前 type/date/sort/direction 條件下的所有頁**,不是當前頁,也不是忽略篩選的全部交易。
 * 以 size=100 逐頁拉到 totalPages;任一頁失敗即中止,不產生部分檔案(T-03-17)。
 */
async function exportApiCsv() {
  if (exporting.value) return;
  exporting.value = true;
  exportError.value = null;
  try {
    const collected: PortfolioActivityDto[] = [];
    let requestPage = 0;
    let pages = 1;
    do {
      const result = await api.listActivities({
        ...queryParams(),
        page: requestPage,
        size: EXPORT_PAGE_SIZE,
      });
      collected.push(...result.items);
      pages = result.totalPages;
      requestPage += 1;
    } while (requestPage < pages);

    downloadCsv(collected.map(activityCsvRow));
  } catch (error) {
    exportError.value = describeError(error);
  } finally {
    exporting.value = false;
  }
}

function exportCsv() {
  if (!live) {
    void exportApiCsv();
    return;
  }
  // mock 路徑:來源仍是 filteredTrades、檔名同前;表頭與 API 共用。mock 列沒有的資料欄位
  // (currency / tax / ratio / reversal_of / reversed)留空不猜;靜態 DIV 列 type 以 CASH_DIVIDEND 輸出(與 data-kind 一致)。
  // 04.2-21:本 session 的 mock 事件列走與 API 相同的活動列 CSV 規則,排在靜態列之前(與畫面同序)。
  downloadCsv([...mockEventRows.value.map(activityCsvRow), ...filteredTrades.value.map((tr): CsvValue[] => [
    tr.d,
    mockKind(tr),
    tr.sym,
    '',
    tr.qty,
    tr.px,
    tr.qty * tr.px,
    tr.fee,
    '',
    '',
    tr.note,
    '',
    '',
  ])]);
}

/**
 * 活動列 → CSV 列(依 kind 分支;不適用欄位在 DTO 恆為 null → 空字串)。
 * date:交易沿用 occurredAt 前 10 碼(既有);現金股利為本機日期;股數調整為 effectiveDate。
 */
function activityCsvRow(row: PortfolioActivityDto): CsvValue[] {
  const isAdjustment = row.kind === 'STOCK_DIVIDEND' || row.kind === 'SPLIT';
  let date = row.occurredAt.slice(0, 10);
  if (row.kind === 'CASH_DIVIDEND') date = localDate(row.occurredAt);
  else if (isAdjustment) date = row.effectiveDate ?? date;
  return [
    date,
    row.kind,
    row.symbol,
    row.currency ?? '',
    row.quantity,
    row.price,
    isTrade(row) ? tradeTotal(row) : row.amount,
    row.fee,
    row.kind === 'CASH_DIVIDEND' ? row.withholdingTax : null,
    row.kind === 'SPLIT' && row.ratioNew !== null && row.ratioOld !== null ? `${row.ratioNew}:${row.ratioOld}` : null,
    row.note,
    row.reversalOfId != null ? reversalOfDate(row) : null,
    row.reversed ? 'true' : null,
  ];
}

function csvCell(value: CsvValue) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
</script>

<style scoped>
.page { padding: 22px; position: relative; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.btn-accent { background: var(--accent); color: var(--on-accent); border: 0; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; }
.btn-ghost { background: var(--surface); border: 1px solid var(--border); padding: 8px 14px; border-radius: 8px; font-size: 13px; color: var(--fg); cursor: pointer; }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
/* 04.2-21:列內「沖銷這筆」與空狀態動作(12 / 600、36px 觸控目標、中性) */
.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.btn-ghost-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* 04.2-21:股利 / 股數調整頁籤的空狀態(48px 垂直留白,UI-SPEC §Spacing s-48) */
.empty-block { padding: 48px 16px; font-size: 13px; color: var(--fg-dim); }
.empty-title { font-size: 13px; font-weight: 600; color: var(--fg); margin-bottom: 4px; }
.empty-action { margin-top: 12px; }
/* 04.2-25(L14):6 顆 chip 在 en 窄螢幕(Share adjustments + 年度)超過一列 → 換行而不是撐寬 main;chip 本身單行 */
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip {
  padding: 5px 12px; background: var(--surface); color: var(--fg-dim);
  border: 1px solid var(--border); border-radius: 99px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit; white-space: nowrap;
}
.chip.active { background: var(--fg); color: var(--bg); border: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; }
table { width: 100%; font-size: 13px; }
thead tr {
  background: var(--surface2); color: var(--fg-dim);
  font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;
}
thead th { padding: 10px 0; font-weight: 500; }
thead th.sortable { cursor: pointer; user-select: none; transition: color .15s; }
thead th.sortable:hover { color: var(--fg); }
thead th.s { color: var(--accent); }
.sort-a { display: inline-block; margin-left: 4px; font-size: 10px; }
tbody tr { border-top: 1px solid var(--border); transition: background .4s; }
tbody td { padding: 11px 0; }
/*
 * 相鄰儲存格至少隔 12px(04.1-31):欄位在窄螢幕被壓到內容最小寬時,靠右對齊的數字格沒有內距,
 * 數量 `0.5` 與單價 `60,000.00` 會黏成 `0.560,000.00`。內距加在「前面有同層格」的格子左側,
 * 第一欄各自的 padding-left: 16px(inline)不受影響;L9 以 >= 6px 量測。
 */
thead th + th, tbody td + td { padding-left: 12px; }
tbody tr.fresh { animation: highlight 1.6s ease-out; }
@keyframes highlight {
  0% { background: color-mix(in oklch, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}
.pill {
  display: inline-block; padding: 2px 8px; border-radius: 99px;
  font-size: 11px; font-weight: 500;
  background: var(--surface2); color: var(--fg-dim);
}
.pill.buy { background: rgba(22,163,74,0.12); color: var(--up-text); }
.pill.sell { background: rgba(220,38,38,0.12); color: var(--dn); }
.pill.div { background: rgba(168,85,247,0.12); color: #a855f7; }
/*
 * 04.2-20(UI-SPEC §Typography 遷移規則第 9 列):API tbody 類型格的 pill(12 / 600)。
 * 買 / 賣沿用既有綠 / 紅;股利沿用既有紫色字面值;配股 / 拆股 / 合股中性(--surface2 底 + --fg 字)。
 */
.kind-pill {
  display: inline-block; padding: 4px 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap;
  background: var(--surface2); color: var(--fg);
}
.kind-pill.buy { background: rgba(22,163,74,0.12); color: var(--up-text); }
.kind-pill.sell { background: rgba(220,38,38,0.12); color: var(--dn); }
.kind-pill.div { background: rgba(168,85,247,0.12); color: #a855f7; }
/* 已沖銷:中性 pill(與 Cash.vue 的 .status-pill 同規格),原紀錄金額 / 股數加刪除線 */
.status-pill {
  display: inline-block; padding: 4px 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap;
  background: var(--surface2); color: var(--fg-dim);
}
.is-reversed { text-decoration: line-through; color: var(--fg-dim); }
/* 不適用的儲存格(—):--fg-dim、aria-hidden(表頭已說明欄位語意) */
.na { color: var(--fg-dim); }
td.col-status { padding-right: 16px; white-space: nowrap; }
/* 04.2-20:儲存格內第二行 Hint(預扣稅行 / 比例行 / 沖銷指回;UI-SPEC §Typography Hint 12/400) */
.cell-hint { margin-top: 4px; font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); }
/* D-28:交易列的幣別標籤。與 .fresh-badge 同尺寸規格,line-height 1.2 讓它落在既有 line box 內、不改列高。 */
.ccy-tag {
  display: inline-block; margin-left: 8px; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  border-radius: 99px; background: var(--surface2); color: var(--fg-dim);
}

/*
 * U-12:剛成交列的非顏色線索。覆寫 .pill 的內距為**只有水平**:
 * 12px × line-height 1.2 = 14.4px,小於同列 type pill 撐出的行高,
 * 因此完整落在既有 line box 內 —— §Layout Contract 的「不改列高」是這樣達成的。
 */
.fresh-badge {
  margin-left: 8px; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  background: color-mix(in oklch, var(--accent) 16%, transparent); color: var(--fg);
}

/*
 * U-12 / a11y:動畫關掉,標記照常顯示 —— 這正是「不只靠動畫」的價值所在。
 * 高亮的壽命由 App.vue 的 v-if 切頁卸載界定,**不用計時器**(計時器會讓測試時間相依而 flaky)。
 */
@media (prefers-reduced-motion: reduce) {
  tbody tr.fresh { animation: none; }
  .block-refreshing { transition: none; }
}

/* 區塊級狀態(D-11/D-12):沿用 Overview / Positions 的 code/traceId 呈現慣例 */
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
/* D-28:幣別說明列(Hint 12px、--fg-dim;padding 8px 16px 對齊 UI-SPEC §Interaction 9) */
.currency-note { padding: 8px 16px; font-size: 12px; color: var(--fg-dim); }
.refresh-stale { padding: 14px 20px; font-size: 13px; }
.refresh-stale .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.refresh-stale .details span { overflow-wrap: anywhere; }
.block-refreshing { opacity: .72; transition: opacity .15s; }
/* D-11:說明列,不是錯誤 —— 用 --fg-dim 而不是錯誤色 */
.view-hint { padding: 8px 20px; font-size: 12px; color: var(--fg-dim); }

/* D-08:換頁按鈕 + 頁碼指示器 */
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }
.pager-at { font-size: 12px; color: var(--fg-dim); min-width: 60px; text-align: center; }
</style>
