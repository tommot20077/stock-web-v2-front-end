<template>
  <div class="page" data-testid="cash-page">
    <div class="page-head">
      <h2 data-testid="cash-page-title">{{ t(lang, 'cash') }}</h2>
    </div>

    <div class="card entries-card" data-testid="cash-entries">
      <h3 class="ttl" tabindex="-1">{{ t(lang, 'cashEntries') }}</h3>

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
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-date">{{ t(lang, 'date') }}</th>
              <th>{{ t(lang, 'type') }}</th>
              <th class="col-right">{{ t(lang, 'cashAmount') }}</th>
              <th>{{ t(lang, 'notes') }}</th>
              <th class="col-right">{{ t(lang, 'cashColStatus') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" data-testid="cash-entries-row">
              <td class="num col-date">{{ fmtDateTime(row.occurredAt) }}</td>
              <td>
                <span class="type-pill">{{ typeLabel(row.type) }}</span>
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
                >{{ t(lang, 'cashReverseThis') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { t, tf } from '../i18n';
import { fmtMoney, minorUnits } from '../moneyFormat';
import { ApiClientError } from '../services/apiClient';
import type { PaginatedResponse } from '../services/apiTypes';
import type { CashEntryDto } from '../services/cashApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();

// judgment §3:頁面只認 domain service,永不 import mock store;兩模式都經 cash adapter。
const cashApi = getRuntimeApiClients().cash;

/** UI-SPEC §Interaction 4:每頁 10 筆(明確送出,不倚賴後端預設)。 */
const PAGE_SIZE = 10;

interface BlockError {
  code: string;
  traceId: string | null;
}

type EntriesState =
  | { status: 'loading' }
  | { status: 'loaded'; data: PaginatedResponse<CashEntryDto> }
  | { status: 'error'; error: BlockError };

const entriesState = ref<EntriesState>({ status: 'loading' });
const pageNo = ref(0);

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const entriesLoading = computed(() => entriesState.value.status === 'loading');
const entriesError = computed(() => (entriesState.value.status === 'error' ? entriesState.value.error : null));
const items = computed<CashEntryDto[]>(() => (entriesState.value.status === 'loaded' ? entriesState.value.data.items : []));

// 診斷資訊只露 code / traceId(不外洩後端 message)。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

async function loadEntries(): Promise<void> {
  entriesState.value = { status: 'loading' };
  try {
    const result = await cashApi.listEntries({ page: pageNo.value, size: PAGE_SIZE });
    entriesState.value = { status: 'loaded', data: result };
  } catch (error) {
    entriesState.value = { status: 'error', error: describeError(error) };
  }
}

function reloadEntries() {
  void loadEntries();
}

onMounted(() => {
  void loadEntries();
});

// =============== 格式化 ===============
const pad2 = (n: number) => String(n).padStart(2, '0');

/** `occurredAt` 的本機 `YYYY-MM-DD`;無法解析時退回字串前 10 碼,缺值為 `—`。 */
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
.page-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.entries-card { padding: 20px; overflow-x: auto; }
.ttl { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.ttl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hint { font-size: 12px; color: var(--fg-dim); }

table { width: 100%; font-size: 13px; border-collapse: collapse; }
thead th { padding: 8px 12px 8px 0; font-size: 12px; font-weight: 600; text-align: left; color: var(--fg-dim); }
tbody tr { border-top: 1px solid var(--border); }
tbody td { padding: 12px 12px 12px 0; vertical-align: top; }
.col-right { text-align: right; }
.col-date { white-space: nowrap; }
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
  font-size: 12px; font-weight: 600; line-height: 1.2;
  background: var(--surface2); color: var(--fg-dim);
}
.type-pill { color: var(--fg); }

.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.btn-ghost-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.block-state { padding: 16px 0; font-size: 13px; color: var(--fg-dim); }
.empty-title { font-size: 13px; color: var(--fg); margin-bottom: 4px; }
.block-error { padding: 16px 0; font-size: 13px; }
.block-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span { overflow-wrap: anywhere; }
.block-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.block-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) {
  .skeleton-row { animation: none; }
}
</style>
