<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <h2>{{ t(lang, 'trades') }}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost" data-testid="trades-export" :disabled="exporting" @click="exportCsv">
          {{ t(lang, 'export') }}
        </button>
        <button class="btn-accent" @click="$emit('order')">+ {{ t(lang, 'addTrade') }}</button>
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
      chips。mock:五個(含 Dividend 與寫死的 2026)照舊。
      API mode:後端 TradeType 只有 BUY/SELL,永遠回不出 DIV → 不渲染 Dividend(D-02);
      年度 chip 為動態當年度,不寫死(D-05)。
    -->
    <div class="filters">
      <button
        v-for="c in chips"
        :key="c"
        type="button"
        data-testid="trades-chip"
        :class="['chip', { active: activeFilter === c }]"
        @click="selectChip(c)"
      >{{ c }}</button>
    </div>

    <div class="card">
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
      <div v-else-if="!live && !apiTrades.length" class="block-state" data-testid="trades-empty">
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
            <th style="padding-right:16px">{{ t(lang, 'notes') }}</th>
          </tr>
        </thead>
        <!-- mock 路徑:client-side 篩選在無分頁下是正確的,逐字保留 Phase 3 之前的行為 -->
        <tbody v-if="live">
          <tr
            v-for="(tr, i) in filteredTrades"
            :key="tr.d + tr.type + tr.sym + tr.qty + tr.px + tr.fee + tr.note"
            data-testid="trades-row"
            :class="{ fresh: i === 0 && mockLastFill && tr.sym === mockLastFill.sym }"
          >
            <td class="num" style="color:var(--fg-dim);padding-left:16px">{{ tr.d }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">{{ tr.sym }}</td>
            <td class="num" style="text-align:right">{{ tr.qty }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.px) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.qty * tr.px, 0) }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ tr.fee }}</td>
            <td style="padding-right:16px;color:var(--fg-dim)">{{ tr.note || '—' }}</td>
          </tr>
        </tbody>
        <!--
          API 路徑:整份列表就是後端當前頁的回應,前端不再做任何本地篩選或排序(T-03-15)。
          :key 用 TradeDto.id(uuid),取代原本的多欄拼接 key —— 同內容不同筆的交易才不會撞 key。
          lastFill 在 API mode 無成交事件來源,故不綁 fresh(Phase 4 接 post-trade refetch)。
        -->
        <tbody v-else>
          <tr v-for="tr in apiTrades" :key="tr.id" data-testid="trades-row">
            <td class="num" style="color:var(--fg-dim);padding-left:16px">{{ tradeDate(tr) }}</td>
            <td><span :class="['pill', tr.type.toLowerCase()]">{{ tr.type }}</span></td>
            <td style="font-weight:500">{{ tr.symbol }}</td>
            <td class="num" style="text-align:right">{{ tr.quantity }}</td>
            <td class="num" style="text-align:right">${{ fmtNum(tr.price) }}</td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(tr.quantity * tr.price, 0) }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ tr.fee }}</td>
            <td style="padding-right:16px;color:var(--fg-dim)">{{ tr.note || '—' }}</td>
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
  </div>
</template>

<script setup lang="ts">
import { computed, h as createElement, onMounted, ref } from 'vue';
import { t } from '../i18n';
import { fmtNum } from '../data';
import { ApiClientError } from '../services/apiClient';
import type { PaginatedResponse, TradeDto } from '../services/apiTypes';
import type { TradeListParams } from '../services/portfolioApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { toLocalIso } from '../services/localTime';
import type { Lang, Trade } from '../types';

defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order'): void }>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const api = getRuntimeApiClients().portfolio;
const live = api.live;

// live 的 getter 每次存取才解析 store,故必須在 computed / render 內取用才有 reactivity。
const mockTrades = computed<Trade[]>(() => (live ? live.trades : []));
const mockLastFill = computed(() => (live ? live.lastFill : null));

// D-05:mock 保留寫死的 '2026';API mode 一律動態當年度(2027 年不會突然壞掉)。
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_CHIP = String(CURRENT_YEAR);
const MOCK_CHIPS = ['All', 'Buy', 'Sell', 'Dividend', '2026'];
const API_CHIPS = ['All', 'Buy', 'Sell', YEAR_CHIP];

const chips = computed(() => (live ? MOCK_CHIPS : API_CHIPS));
const activeFilter = ref<string>('All');

// D-07:預設 executedAt 降序、size 20(明確送出,不倚賴後端預設)。
const PAGE_SIZE = 20;
// D-10 / T-03-19:匯出以後端 clamp 上限的 size 減少請求數。
const EXPORT_PAGE_SIZE = 100;

type SortKey = NonNullable<TradeListParams['sort']>;
const sortKey = ref<SortKey>('executedAt');
const sortDir = ref<NonNullable<TradeListParams['direction']>>('desc');
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

const tradesState = ref<BlockState<PaginatedResponse<TradeDto>>>({ status: 'loading' });

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const tradesLoading = computed(() => tradesState.value.status === 'loading');
const tradesError = computed(() => (tradesState.value.status === 'error' ? tradesState.value.error : null));
const tradesPage = computed(() => (tradesState.value.status === 'loaded' ? tradesState.value.data : null));
const apiTrades = computed<TradeDto[]>(() => tradesPage.value?.items ?? []);
const totalPages = computed(() => tradesPage.value?.totalPages ?? 0);

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
 * dateFrom 含、dateTo 不含),因此「當年度」= 今年年初 ≤ executedAt < 明年年初。
 */
function filterParams(): Pick<TradeListParams, 'type' | 'dateFrom' | 'dateTo'> {
  if (activeFilter.value === 'Buy') return { type: 'BUY' };
  if (activeFilter.value === 'Sell') return { type: 'SELL' };
  if (activeFilter.value === YEAR_CHIP) {
    return {
      dateFrom: toLocalIso(new Date(CURRENT_YEAR, 0, 1)),
      dateTo: toLocalIso(new Date(CURRENT_YEAR + 1, 0, 1)),
    };
  }
  return {};
}

/** 篩選 + 排序參數的單一來源:列表與 CSV 匯出共用,兩者語意不可能漂移(D-10)。 */
function queryParams(): TradeListParams {
  return { ...filterParams(), sort: sortKey.value, direction: sortDir.value };
}

/**
 * D-15 溢出回退:請求頁碼 ≥ totalPages 且回空時,以 `totalPages - 1` 重新請求一次,
 * 避免「其實有資料卻顯示空列表」。
 * **防迴圈**:回退後的那次請求以 `allowOverflowFallback = false` 發出,因此自動重試至多一次;
 * 即使伺服端總頁數連續縮水,也只會多打一個請求就停在已載入狀態。
 */
async function loadTrades(allowOverflowFallback = true): Promise<void> {
  tradesState.value = { status: 'loading' };
  const requestedPage = pageNo.value;
  try {
    const result = await api.listTrades({ ...queryParams(), page: requestedPage, size: PAGE_SIZE });
    if (
      allowOverflowFallback
      && result.items.length === 0
      && result.totalPages > 0
      && requestedPage >= result.totalPages
    ) {
      pageNo.value = result.totalPages - 1;
      await loadTrades(false);
      return;
    }
    tradesState.value = { status: 'loaded', data: result };
  } catch (error) {
    tradesState.value = { status: 'error', error: describeError(error) };
  }
}

/** 重試鈕:只重發列表請求,不連帶做別的事(D-11)。 */
function reloadTrades() {
  void loadTrades();
}

/** D-15:任何篩選或排序變更都經此入口,頁碼一律重置為 0 後再請求。 */
function applyQueryChange(mutate: () => void) {
  mutate();
  pageNo.value = 0;
  void loadTrades();
}

function selectChip(chip: string) {
  if (live) {
    activeFilter.value = chip;
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

/** 換頁不是篩選/排序變更,不套 D-15 重置。 */
function goToPage(delta: number) {
  const next = pageNo.value + delta;
  if (next < 0 || next >= totalPages.value) return;
  pageNo.value = next;
  void loadTrades();
}

onMounted(() => {
  // mock mode 完全走 live 委派,不打任何網路。
  if (live) return;
  void loadTrades();
});

const SortArrow = (p: { k: string; sk: string; sd: 'asc' | 'desc' }) =>
  p.k === p.sk ? createElement('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

/** executedAt 是 ISO-8601,表格只顯示日期部分。 */
function tradeDate(trade: TradeDto): string {
  return trade.executedAt.slice(0, 10);
}

// =============== mock mode:以下篩選與 Phase 3 之前逐字相同 ===============
const filteredTrades = computed(() => {
  switch (activeFilter.value) {
    case 'Buy':
      return mockTrades.value.filter(tr => tr.type === 'BUY');
    case 'Sell':
      return mockTrades.value.filter(tr => tr.type === 'SELL');
    case 'Dividend':
      return mockTrades.value.filter(tr => tr.type === 'DIV');
    case '2026':
      return mockTrades.value.filter(tr => tr.d.startsWith('2026'));
    default:
      return mockTrades.value;
  }
});

// =============== CSV ===============
const CSV_HEADER = ['date', 'type', 'symbol', 'qty', 'price', 'total', 'fee', 'note'];

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
    const collected: TradeDto[] = [];
    let requestPage = 0;
    let pages = 1;
    do {
      const result = await api.listTrades({
        ...queryParams(),
        page: requestPage,
        size: EXPORT_PAGE_SIZE,
      });
      collected.push(...result.items);
      pages = result.totalPages;
      requestPage += 1;
    } while (requestPage < pages);

    downloadCsv(collected.map(tr => [
      tradeDate(tr),
      tr.type,
      tr.symbol,
      tr.quantity,
      tr.price,
      tr.quantity * tr.price,
      tr.fee,
      tr.note,
    ]));
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
  // mock 路徑:來源仍是 filteredTrades,欄序與檔名與 Phase 3 之前相同。
  downloadCsv(filteredTrades.value.map(tr => [
    tr.d,
    tr.type,
    tr.sym,
    tr.qty,
    tr.px,
    tr.qty * tr.px,
    tr.fee,
    tr.note,
  ]));
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
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; }
.btn-ghost { background: var(--surface); border: 1px solid var(--border); padding: 8px 14px; border-radius: 8px; font-size: 13px; color: var(--fg); cursor: pointer; }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.filters { display: flex; gap: 8px; margin-bottom: 14px; }
.chip {
  padding: 5px 12px; background: var(--surface); color: var(--fg-dim);
  border: 1px solid var(--border); border-radius: 99px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit;
}
.chip.active { background: var(--fg); color: var(--bg); border: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
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
.pill.buy { background: rgba(22,163,74,0.12); color: var(--up); }
.pill.sell { background: rgba(220,38,38,0.12); color: var(--dn); }
.pill.div { background: rgba(168,85,247,0.12); color: #a855f7; }

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

/* D-08:換頁按鈕 + 頁碼指示器 */
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }
.pager-at { font-size: 12px; color: var(--fg-dim); min-width: 60px; text-align: center; }
</style>
