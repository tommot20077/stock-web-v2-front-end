<template>
  <div class="page" data-testid="cash-page">
    <div class="page-head">
      <div class="head-main">
        <h2 data-testid="cash-page-title">{{ t(lang, 'cash') }}</h2>

        <!--
          頁首餘額列(CASH-02 第二個呈現點,只在 API mode 渲染):mock 沒有與 mock 分錄自洽的現金彙總,
          寧可不顯示也不顯示寫死數字(UI-SPEC §0 / U-26)。載入中與失敗只影響這一列,不擋列表與按鈕。
        -->
        <div v-if="!live" class="balances">
          <div v-if="summaryLoading" class="hint" data-testid="cash-page-balances-loading">
            {{ t(lang, 'loading') }}
          </div>
          <div v-else-if="summaryError" class="balances-error" data-testid="cash-page-balances-error">
            <div class="hint">{{ t(lang, 'loadFailed') }}</div>
            <div class="details">
              <span data-testid="cash-page-balances-error-code">{{ summaryError.code }}</span>
              <span v-if="summaryError.traceId" data-testid="cash-page-balances-trace-id">
                {{ t(lang, 'authRequestId') }} {{ summaryError.traceId }}
              </span>
            </div>
            <button type="button" class="block-retry" data-testid="cash-page-balances-retry" @click="reloadSummary">
              {{ t(lang, 'authRetry') }}
            </button>
          </div>
          <template v-else-if="summary">
            <div class="balances-main" data-testid="cash-page-balances">
              <span class="avail">{{ t(lang, 'availableCash') }} {{ fmtMoney(summary.cash, summary.baseCurrency, 0) }}</span>
              <span v-if="balanceListText" class="hint ccy-list">{{ balanceListText }}</span>
            </div>
            <!-- U-07:只看各幣別,不看折算後總額;數值不變紅(U-06) -->
            <div v-if="negativeCodes.length" class="hint" data-testid="cash-page-negative">
              <span aria-hidden="true">⚠</span>
              {{ tf(lang, 'cashNegativeHint', { codes: joinCodes(negativeCodes) }) }}
            </div>
            <div v-if="fxExcludedCodes.length" class="hint" data-testid="cash-page-fx-excluded">
              <span aria-hidden="true">⚠</span>
              {{ tf(lang, 'cashFxExcludedHint', { codes: joinCodes(fxExcludedCodes), base: summary.baseCurrency }) }}
            </div>
          </template>
        </div>
      </div>

      <div class="head-actions">
        <button type="button" class="btn-ghost-sm" data-testid="cash-page-deposit" @click="openEntryDialog('DEPOSIT', $event)">
          {{ t(lang, 'cashTypeDeposit') }}
        </button>
        <button type="button" class="btn-ghost-sm" data-testid="cash-page-withdraw" @click="openEntryDialog('WITHDRAWAL', $event)">
          {{ t(lang, 'cashTypeWithdrawal') }}
        </button>
      </div>
    </div>

    <div
      class="card entries-card"
      :class="{ 'block-refreshing': refreshing }"
      :aria-busy="refreshing"
      data-testid="cash-entries"
    >
      <!-- §3 焦點回落點:從某列沖銷成功後該列的按鈕已消失,關閉對話框時焦點落在這裡 -->
      <h3 ref="cardTitle" class="ttl" tabindex="-1">{{ t(lang, 'cashEntries') }}</h3>

      <!-- U-05 / U-06:重讀期間保留整張表格,只在區塊頂端加一條指示列 -->
      <div v-if="refreshing" class="refresh-note" data-testid="cash-entries-refreshing">
        {{ t(lang, 'portfolioRefreshing') }}
      </div>
      <div v-else-if="refreshError" class="refresh-stale" role="status" data-testid="cash-entries-refresh-error">
        <div>{{ t(lang, 'portfolioStaleAfterCashEntry') }}</div>
        <div class="details">
          <span data-testid="cash-entries-refresh-error-code">{{ refreshError.code }}</span>
          <span v-if="refreshError.traceId" data-testid="cash-entries-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ refreshError.traceId }}
          </span>
        </div>
        <button type="button" class="block-retry" data-testid="cash-entries-refresh-retry" @click="retryRefresh">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <!-- 不是錯誤,所以不用錯誤色;判定只比 id,不在前端重算排序 -->
      <div v-if="notInView" class="view-hint" data-testid="cash-entries-not-in-view">
        {{ t(lang, 'cashEntryNotInView') }}
      </div>

      <template v-if="entriesLoading">
        <div class="block-state" data-testid="cash-entries-loading">{{ t(lang, 'loading') }}</div>
        <div class="skeletons" aria-hidden="true">
          <div v-for="i in 3" :key="i" class="skeleton-row" />
        </div>
      </template>
      <div v-else-if="entriesError" class="block-error" data-testid="cash-entries-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="cash-entries-error-code">{{ entriesError.code }}</span>
          <span v-if="entriesError.traceId" data-testid="cash-entries-trace-id">
            {{ t(lang, 'authRequestId') }} {{ entriesError.traceId }}
          </span>
        </div>
        <button type="button" class="block-retry" data-testid="cash-entries-retry" @click="reloadEntries">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <div v-else-if="!items.length" class="block-state" data-testid="cash-entries-empty">
        <div class="empty-title">{{ t(lang, 'cashEntriesEmpty') }}</div>
        <div class="hint">{{ t(lang, 'cashEntriesEmptyBody') }}</div>
        <button
          type="button"
          class="btn-ghost-sm empty-action"
          data-testid="cash-entries-empty-deposit"
          @click="openEntryDialog('DEPOSIT', $event)"
        >{{ t(lang, 'cashRecordDeposit') }}</button>
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-date">{{ t(lang, 'date') }}</th>
              <th class="col-type">{{ t(lang, 'type') }}</th>
              <th class="col-right">{{ t(lang, 'cashAmount') }}</th>
              <th>{{ t(lang, 'notes') }}</th>
              <th class="col-right">{{ t(lang, 'cashColStatus') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              data-testid="cash-entries-row"
              :class="{ fresh: isFresh(row) }"
            >
              <td class="num col-date">{{ fmtDateTime(row.occurredAt) }}</td>
              <td class="col-type">
                <span class="type-pill">{{ typeLabel(row.type) }}</span>
                <!-- 不只靠動畫與顏色:新列有文字標記(U-24) -->
                <span v-if="isFresh(row)" class="fresh-badge" data-testid="cash-entries-fresh-badge">
                  {{ t(lang, 'freshBadge') }}
                </span>
                <!-- T-04.1-52:以日期指回原紀錄,不顯示 reversalOfId 原始值 -->
                <div v-if="row.reversalOfId != null" class="hint" data-testid="cash-entries-reversal-of">
                  {{ tf(lang, 'cashReversalOf', { date: fmtDate(row.reversalOfOccurredAt) }) }}
                </div>
              </td>
              <td class="num col-right">
                <span :class="['amount', { 'is-reversed': row.reversed }]">{{ amountText(row) }}</span>
              </td>
              <td class="col-note">
                <!-- 文字插值(Vue 自動轉義),備註是使用者輸入,不使用 v-html -->
                <div class="note" :title="row.note || undefined">{{ row.note || '—' }}</div>
              </td>
              <td class="col-right">
                <!-- U-18:「是否已沖銷」只取後端欄位,前端不推導 -->
                <span v-if="row.reversed" class="status-pill" data-testid="cash-entries-reversed-pill">
                  {{ t(lang, 'cashReversed') }}
                </span>
                <button
                  v-else-if="row.reversalOfId == null"
                  type="button"
                  class="btn-ghost-sm"
                  :data-testid="`cash-entries-reverse-${row.id}`"
                  :aria-label="reverseAria(row)"
                  @click="openReversal(row, $event)"
                >{{ t(lang, 'cashReverseThis') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 換頁按鈕(樣式與文案沿用 Trades):totalPages > 1 才渲染,邊界 disabled -->
    <div v-if="totalPages > 1" class="pager" data-testid="cash-entries-pagination">
      <button
        type="button"
        class="btn-ghost-sm"
        data-testid="cash-entries-prev"
        :disabled="pageNo <= 0"
        @click="goToPage(-1)"
      >{{ t(lang, 'prevPage') }}</button>
      <span class="pager-at num" data-testid="cash-entries-page-indicator">{{ pageNo + 1 }} / {{ totalPages }}</span>
      <button
        type="button"
        class="btn-ghost-sm"
        data-testid="cash-entries-next"
        :disabled="pageNo >= totalPages - 1"
        @click="goToPage(1)"
      >{{ t(lang, 'nextPage') }}</button>
    </div>

    <!-- 本頁自己的對話框實例;開啟者負責焦點回落與 reversalConflict 後的重讀(04.1-15 契約) -->
    <CashEntryDialog
      :open="dialogOpen"
      :lang="lang"
      :initial-type="dialogType"
      :initial-currency="dialogCurrency"
      :balances="dialogBalances"
      :reversal-of="dialogReversal"
      @close="onDialogClose"
      @recorded="onDialogRecorded"
      @reversal-conflict="onReversalConflict"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CashEntryDialog from '../components/CashEntryDialog.vue';
import { t, tf } from '../i18n';
import { fmtMoney, fmtMoneyAmount, minorUnits } from '../moneyFormat';
import { ApiClientError } from '../services/apiClient';
import type { PaginatedResponse, PortfolioSummaryDto } from '../services/apiTypes';
import type { CashEntryDto, CashEntryType } from '../services/cashApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { BASE_CURRENCY_OPTIONS } from '../services/profileApi';
import {
  clearLastCreatedCashEntry,
  lastCreatedCashEntryId,
  portfolioRevision,
  portfolioRevisionCause,
} from '../services/portfolioRevision';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();

// judgment §3:頁面只認 domain service,永不 import mock store;兩模式的列表都經 cash adapter。
const clients = getRuntimeApiClients();
const cashApi = clients.cash;
const portfolioApi = clients.portfolio;
// 分支條件是 `live` 是否存在(mock mode),不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const live = portfolioApi.live;

/** UI-SPEC §Interaction 4:每頁 10 筆(明確送出,不倚賴後端預設)。 */
const PAGE_SIZE = 10;

interface BlockError {
  code: string;
  traceId: string | null;
}

// 診斷資訊只露 code / traceId(不外洩後端 message)。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

// =============== 入出金列表 ===============
type EntriesState =
  | { status: 'loading' }
  | { status: 'loaded'; data: PaginatedResponse<CashEntryDto> }
  | { status: 'error'; error: BlockError };

const entriesState = ref<EntriesState>({ status: 'loading' });
const pageNo = ref(0);
/** 與 status 並存的重讀旗標:舊列留在畫面上,只多一條「更新中…」(U-05 / U-06)。 */
const refreshing = ref(false);
const refreshError = ref<BlockError | null>(null);
let entriesSeq = 0;

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const entriesLoading = computed(() => entriesState.value.status === 'loading');
const entriesError = computed(() => (entriesState.value.status === 'error' ? entriesState.value.error : null));
const entriesPage = computed(() => (entriesState.value.status === 'loaded' ? entriesState.value.data : null));
const items = computed<CashEntryDto[]>(() => entriesPage.value?.items ?? []);
const totalPages = computed(() => entriesPage.value?.totalPages ?? 0);

interface LoadEntriesOptions {
  /** true = 保留舊列的重讀;false / 省略 = 會清空列表的一般載入。 */
  refresh?: boolean;
  /** 防迴圈:頁碼溢出回退後的那一次請求關掉它,自動重試至多一次。 */
  allowOverflowFallback?: boolean;
}

/**
 * 讀取目前頁碼的入出金紀錄。
 *
 * 以序號丟棄過期回應:快速連按換頁或重讀時,較晚發出的請求才有資格寫入畫面。
 * 頁碼溢出(請求頁 ≥ totalPages 且回空,例如別處把紀錄刪光)時回退到最後一頁一次。
 */
async function loadEntries(options: LoadEntriesOptions = {}): Promise<void> {
  // 沒有已載入的舊列就沒有 U-05 要保護的東西 → 退回一般載入路徑。
  const refresh = options.refresh === true && entriesState.value.status === 'loaded';
  const allowOverflowFallback = options.allowOverflowFallback !== false;
  entriesSeq += 1;
  const seq = entriesSeq;
  refreshError.value = null;
  if (refresh) {
    refreshing.value = true;
  } else {
    // 一般載入會清掉列表;先前未完成的重讀已被序號作廢,旗標由這裡收尾。
    refreshing.value = false;
    entriesState.value = { status: 'loading' };
  }
  const requestedPage = pageNo.value;
  try {
    const result = await cashApi.listEntries({ page: requestedPage, size: PAGE_SIZE });
    if (seq !== entriesSeq) return;
    if (
      allowOverflowFallback
      && result.items.length === 0
      && result.totalPages > 0
      && requestedPage >= result.totalPages
    ) {
      pageNo.value = result.totalPages - 1;
      await loadEntries({ refresh, allowOverflowFallback: false });
      return;
    }
    entriesState.value = { status: 'loaded', data: result };
  } catch (error) {
    if (seq !== entriesSeq) return;
    if (refresh) refreshError.value = describeError(error);
    else entriesState.value = { status: 'error', error: describeError(error) };
  } finally {
    if (refresh && seq === entriesSeq) refreshing.value = false;
  }
}

/** 重試鈕:只重發列表請求(一般載入)。 */
function reloadEntries() {
  void loadEntries();
}

/** stale 提示的重試鈕:同樣保留舊列,失敗只更新 stale 提示。 */
function retryRefresh() {
  void loadEntries({ refresh: true });
}

/** 換頁不是篩選條件變更,但一樣是「使用者改了檢視」:「新」標記與不在本頁提示到此結束。 */
function goToPage(delta: number) {
  const next = pageNo.value + delta;
  if (next < 0 || next >= totalPages.value) return;
  pageNo.value = next;
  clearLastCreatedCashEntry();
  void loadEntries();
}

// =============== 新紀錄標記(只比 id,不使用計時器) ===============
function isFresh(row: CashEntryDto): boolean {
  const created = lastCreatedCashEntryId.value;
  return created !== null && row.id === created;
}

/** 重讀還沒落地前不下結論 —— 否則提示會在重讀期間先閃一下再消失。 */
const notInView = computed(() => {
  const created = lastCreatedCashEntryId.value;
  if (created === null || refreshing.value || entriesPage.value === null) return false;
  return !items.value.some(row => row.id === created);
});

// =============== 頁首餘額列(API mode) ===============
type SummaryState =
  | { status: 'loading' }
  | { status: 'loaded'; data: PortfolioSummaryDto }
  | { status: 'error'; error: BlockError };

const summaryState = ref<SummaryState>({ status: 'loading' });
let summarySeq = 0;

const summaryLoading = computed(() => summaryState.value.status === 'loading');
const summaryError = computed(() => (summaryState.value.status === 'error' ? summaryState.value.error : null));
const summary = computed(() => (summaryState.value.status === 'loaded' ? summaryState.value.data : null));

async function loadSummary(options: { refresh?: boolean } = {}): Promise<void> {
  const refresh = options.refresh === true && summaryState.value.status === 'loaded';
  summarySeq += 1;
  const seq = summarySeq;
  // 重讀時保留舊數字,避免每次交易 / 入金後餘額列閃成「載入中…」。
  if (!refresh) summaryState.value = { status: 'loading' };
  try {
    const data = await portfolioApi.getSummary();
    if (seq !== summarySeq) return;
    summaryState.value = { status: 'loaded', data };
  } catch (error) {
    if (seq !== summarySeq) return;
    // 數字可能已過期:重讀失敗不保留舊值冒充最新,改為只影響這一列的錯誤態。
    summaryState.value = { status: 'error', error: describeError(error) };
  }
}

function reloadSummary() {
  void loadSummary();
}

/** 非零幣別,依 TWD / USD / EUR / JPY 固定順序(UI-SPEC §1);未知幣別排在後面。 */
const orderedBalances = computed(() => {
  const order = (code: string) => {
    const at = (BASE_CURRENCY_OPTIONS as readonly string[]).indexOf(code);
    return at === -1 ? BASE_CURRENCY_OPTIONS.length : at;
  };
  return (summary.value?.cashBalances ?? [])
    .filter(balance => balance.amount !== 0)
    .sort((a, b) => order(a.currency) - order(b.currency));
});

const balanceListText = computed(() => orderedBalances.value
  .map(balance => `${balance.currency} ${fmtMoneyAmount(balance.amount, balance.currency)}`)
  .join(' · '));

/** U-07:只看各幣別,不看折算後總額 —— 總額可能為正而 USD 為負。 */
const negativeCodes = computed(() => orderedBalances.value.filter(b => b.amount < 0).map(b => b.currency));

const fxExcludedCodes = computed(() => {
  const unconverted = summary.value?.unconvertedCurrencies ?? [];
  return orderedBalances.value.filter(b => unconverted.includes(b.currency)).map(b => b.currency);
});

function joinCodes(codes: string[]): string {
  return codes.join(props.lang === 'zh' ? '、' : ', ');
}

// =============== 入金 / 出金 / 沖銷對話框 ===============
const dialogOpen = ref(false);
const dialogType = ref<CashEntryType>('DEPOSIT');
const dialogCurrency = ref('TWD');
const dialogReversal = ref<CashEntryDto | null>(null);
/** 出金超額提示用;mock mode 與 summary 讀取失敗時不傳(UI-SPEC §3)。 */
const dialogBalances = computed(() => (live || !summary.value ? null : summary.value.cashBalances));

const cardTitle = ref<HTMLElement | null>(null);
let openerEl: HTMLElement | null = null;
let openedFromRow = false;
let recordedWhileOpen = false;

/** 幣別預設規則(§1):入金 → 第一個餘額為負的幣別,否則基準幣;出金 → 基準幣;mock mode → TWD。 */
function defaultCurrency(kind: CashEntryType): string {
  if (live || !summary.value) return 'TWD';
  if (kind === 'DEPOSIT') {
    const negative = orderedBalances.value.find(balance => balance.amount < 0);
    if (negative) return negative.currency;
  }
  return summary.value.baseCurrency;
}

function beginDialog(event: Event, fromRow: boolean) {
  // 再次開啟對話框 = 使用者不再需要「新」標記與不在本頁提示。
  clearLastCreatedCashEntry();
  openerEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  openedFromRow = fromRow;
  recordedWhileOpen = false;
}

function openEntryDialog(kind: CashEntryType, event: Event) {
  beginDialog(event, false);
  dialogType.value = kind;
  dialogCurrency.value = defaultCurrency(kind);
  dialogReversal.value = null;
  dialogOpen.value = true;
}

function openReversal(row: CashEntryDto, event: Event) {
  beginDialog(event, true);
  dialogReversal.value = row;
  dialogOpen.value = true;
}

function onDialogRecorded() {
  recordedWhileOpen = true;
}

/** 沖銷衝突:對話框只通知,這裡立刻重讀(一般載入,不宣稱「紀錄已寫入」)。 */
function onReversalConflict() {
  void loadEntries();
}

async function onDialogClose() {
  dialogOpen.value = false;
  dialogReversal.value = null;
  await nextTick();
  // 從某列沖銷成功後該按鈕已消失 → 焦點到卡片標題;其餘回到開啟它的按鈕。
  const opener = openerEl;
  openerEl = null;
  if (opener && opener.isConnected && !(openedFromRow && recordedWhileOpen)) opener.focus();
  else cardTitle.value?.focus();
}

// =============== 重讀與生命週期 ===============
/*
 * 重讀規則(U-10),頁碼重置只有 cash 這一個入口(沿用 Trades D-11 的單一入口原則):
 * - cause = 'cash':頁碼歸零並重讀列表;
 * - 頁首餘額列對 cash / trade / baseCurrency 三種 cause 都重讀(交易會動到現金)。
 * 交易與基準幣變更不影響入出金紀錄(金額是原幣),重讀列表只會無端把使用者踢回第 1 頁。
 */
watch(portfolioRevision, () => {
  if (portfolioRevisionCause.value === 'cash') {
    pageNo.value = 0;
    void loadEntries({ refresh: true });
  }
  if (!live) void loadSummary({ refresh: true });
});

onMounted(() => {
  void loadEntries();
  if (!live) void loadSummary();
});

// 「新」標記的壽命到頁面 unmount 為止(App.vue 的 v-if 切頁會卸載本頁)。
onBeforeUnmount(() => {
  clearLastCreatedCashEntry();
});

// =============== 格式化 ===============
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 本機 `YYYY-MM-DD`;無法解析時退回字串前 10 碼,缺值為 `—`。 */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本機 `YYYY-MM-DD HH:mm`。 */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fmtDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function typeLabel(kind: string): string {
  if (kind === 'DEPOSIT') return t(props.lang, 'cashTypeDeposit');
  if (kind === 'WITHDRAWAL') return t(props.lang, 'cashTypeWithdrawal');
  return kind;
}

/** 入金 `+`、出金 `-`(U-06:中性色,不是損益);未知類型不猜測方向。 */
function amountText(row: CashEntryDto): string {
  const sign = row.type === 'DEPOSIT' ? '+' : row.type === 'WITHDRAWAL' ? '-' : '';
  return `${sign}${fmtMoney(row.amount, row.currency, minorUnits(row.currency))}`;
}

function reverseAria(row: CashEntryDto): string {
  return tf(props.lang, 'cashReverseThisAria', {
    date: fmtDateTime(row.occurredAt),
    type: typeLabel(row.type),
    amount: amountText(row),
  });
}
</script>

<style scoped>
.page { padding: 24px; position: relative; }
.page-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.head-main { flex: 1 1 240px; min-width: 0; }
.head-actions { display: flex; gap: 8px; margin-left: auto; }
@media (max-width: 639px) {
  .head-actions { margin-left: 0; }
}
h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.entries-card { padding: 20px; overflow-x: auto; }
.ttl { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.ttl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hint { font-size: 12px; color: var(--fg-dim); }

/* 餘額列:會長的文字項目以 flex-basis: 0 參與換行,金額不使用省略號(LEARNINGS 2026-10-23) */
.balances { margin-top: 4px; font-size: 13px; }
.balances > * + * { margin-top: 4px; }
.balances-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.avail { flex: none; color: var(--fg); }
.ccy-list { flex: 1 1 0; min-width: 160px; overflow-wrap: anywhere; }
.balances-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.balances-error .details span { overflow-wrap: anywhere; }

table { width: 100%; font-size: 13px; border-collapse: collapse; }
thead th { padding: 8px 12px 8px 0; font-size: 12px; font-weight: 600; text-align: left; color: var(--fg-dim); }
tbody tr { border-top: 1px solid var(--border); }
tbody td { padding: 12px 12px 12px 0; vertical-align: top; }
tbody tr.fresh { animation: highlight 1.6s ease-out; }
@keyframes highlight {
  0% { background: color-mix(in oklch, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}
.col-right { text-align: right; }
.col-date { white-space: nowrap; }
/*
 * 類型欄保底寬度:沖銷註記(「沖銷 2026-10-26 的紀錄」)在欄內換行。表格比卡片窄時,瀏覽器會把
 * 可壓縮欄壓到最小,類型欄被壓到約 40px,膠囊逐字換行、註記折成 8 行(04.1-30)。
 * 保底後表格改在卡內水平捲動,而不是擠壓這一欄。
 */
.col-type { min-width: 160px; }
.col-note { min-width: 160px; max-width: 320px; }
.amount { font-weight: 600; white-space: nowrap; }
.is-reversed { text-decoration: line-through; color: var(--fg-dim); }
.note { overflow-wrap: anywhere; color: var(--fg-dim); }
@media (min-width: 640px) {
  .note {
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
    overflow: hidden;
  }
}

.type-pill, .status-pill {
  display: inline-block; padding: 4px 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap;
  background: var(--surface2); color: var(--fg-dim);
}
.type-pill { color: var(--fg); }
.fresh-badge {
  display: inline-block; margin-left: 8px; padding: 0 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  background: color-mix(in oklch, var(--accent) 16%, transparent); color: var(--fg);
}

.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
tbody .btn-ghost-sm { font-size: 12px; }
.btn-ghost-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.block-state { padding: 16px 0; font-size: 13px; color: var(--fg-dim); }
.empty-title { font-size: 13px; color: var(--fg); margin-bottom: 4px; }
.empty-action { margin-top: 12px; }
.block-error { padding: 16px 0; font-size: 13px; }
.block-error .details, .refresh-stale .details {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span, .refresh-stale .details span { overflow-wrap: anywhere; }
.block-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.block-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* U-05 / U-06:重讀指示與 stale 提示。不新增卡片,只在既有版位內插入一條低調說明列 */
.refresh-note { padding: 8px 0; font-size: 12px; color: var(--fg-dim); }
.refresh-stale { padding: 8px 0 12px; font-size: 13px; }
.view-hint { padding: 8px 0; font-size: 12px; color: var(--fg-dim); }
.block-refreshing { opacity: .72; transition: opacity .15s; }

.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.pager-at { font-size: 12px; color: var(--fg-dim); min-width: 60px; text-align: center; }

.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* 動畫關掉,「新」標記照常顯示 —— 這正是「不只靠動畫」的價值所在 */
@media (prefers-reduced-motion: reduce) {
  tbody tr.fresh { animation: none; }
  .skeleton-row { animation: none; }
  .block-refreshing { transition: none; }
}
</style>
