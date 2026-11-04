<template>
  <div class="page" data-testid="watchlist-page">
    <div class="page-head">
      <div class="head-main">
        <h2>{{ t(lang, 'watchlist') }}</h2>
        <!-- 04.2-24(D-23):即時報價狀態列(margin-top: 4px 由元件提供),取代舊副標 -->
        <LiveQuoteStatus :lang="lang" :status="streamStatus" :updated-at="lastUpdatedAt" @reconnect="quotes.reconnect()" />
      </div>
      <div class="head-actions">
        <button
          ref="newListEl"
          type="button"
          class="btn-ghost-sm"
          data-testid="watchlist-new-list"
          :disabled="lists === null || atListLimit"
          :aria-describedby="atListLimit ? 'watchlist-limit-lists' : undefined"
          @click="openCreate"
        ><span aria-hidden="true">+ </span>{{ t(lang, 'watchlistNewList') }}</button>
      </div>
    </div>
    <p v-if="atListLimit" id="watchlist-limit-lists" class="hint limit-hint" data-testid="watchlist-limit-lists">
      {{ t(lang, 'watchlistListsLimitReached') }}
    </p>

    <!-- 建立表單:開啟即聚焦;Enter 送出、Esc 取消;名稱自檢在送出前顯示並 disable 送出 -->
    <form v-if="creating" class="name-form create-form" novalidate data-testid="watchlist-create-form" @submit.prevent="submitCreate">
      <label for="watchlist-create-name" class="lab">{{ t(lang, 'watchlistListName') }}</label>
      <div class="name-row">
        <input
          id="watchlist-create-name"
          ref="createInputEl"
          v-model="createName"
          class="inp"
          data-testid="watchlist-create-name"
          maxlength="30"
          autocomplete="off"
          :disabled="busy"
          :aria-invalid="createError ? 'true' : undefined"
          :aria-describedby="createError ? 'watchlist-create-hint watchlist-name-error' : 'watchlist-create-hint'"
          @input="createTouched = true"
          @keydown.escape.prevent="cancelCreate"
        />
        <button type="submit" class="btn-ghost-sm" data-testid="watchlist-create-submit" :disabled="busy || createError !== ''">
          {{ t(lang, 'watchlistCreate') }}
        </button>
        <button type="button" class="btn-ghost-sm" data-testid="watchlist-create-cancel" :disabled="busy" @click="cancelCreate">
          {{ t(lang, 'cancel') }}
        </button>
      </div>
      <p id="watchlist-create-hint" class="hint field-hint">{{ t(lang, 'watchlistNameHint') }}</p>
      <div v-if="createError" id="watchlist-name-error" class="field-error" data-testid="watchlist-name-error">{{ createError }}</div>
    </form>

    <!-- 讀取失敗(尚無清單資料):loadFailed + 診斷列(只露 code / traceId)+ 重試 -->
    <div v-if="lists === null && loadError && !loading" class="card list-card">
      <div class="block-error" role="alert" data-testid="watchlist-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="watchlist-error-code">{{ loadError.code }}</span>
          <span v-if="loadError.requestId" data-testid="watchlist-trace-id">
            {{ t(lang, 'authRequestId') }} {{ loadError.requestId }}
          </span>
        </div>
        <button type="button" class="block-retry" data-testid="watchlist-retry" @click="loadLists">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
    </div>

    <!-- 首次載入:一律有文字,骨架只是輔助 -->
    <div v-else-if="lists === null" class="card list-card">
      <div class="block-state" data-testid="watchlist-loading">
        <div>{{ t(lang, 'loading') }}</div>
        <div class="skeleton-row" aria-hidden="true" />
        <div class="skeleton-row" aria-hidden="true" />
        <div class="skeleton-row" aria-hidden="true" />
      </div>
    </div>

    <template v-else>
      <div ref="tablistEl" class="tabs" role="tablist" :aria-label="t(lang, 'watchlist')" data-testid="watchlist-tabs">
        <button
          v-for="(list, index) in lists"
          :id="tabId(list.id)"
          :key="list.id"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: list.id === activeListId }"
          :aria-selected="list.id === activeListId ? 'true' : 'false'"
          :aria-controls="PANEL_ID"
          :tabindex="list.id === activeListId ? 0 : -1"
          :title="list.name"
          data-testid="watchlist-tab"
          :data-list-id="list.id"
          @click="selectTab(list.id)"
          @keydown="onTabKeydown($event, index)"
        >
          <span class="tab-name">{{ list.name }}</span>
          <span class="tab-count">{{ list.items.length }}</span>
        </button>
      </div>

      <!-- 操作錯誤(建立 / 改名 / 刪除 / 移除 / 排序):單一 role=alert 區 + 診斷列;下一次成功或切 tab 清除 -->
      <div v-if="opError" class="form-error op-error" role="alert" data-testid="watchlist-op-error">
        <div>{{ opErrorCopy }}</div>
        <div class="details">
          <span data-testid="watchlist-op-error-code">{{ opError.code }}</span>
          <span v-if="opError.traceId" data-testid="watchlist-op-error-trace-id">{{ t(lang, 'authRequestId') }} {{ opError.traceId }}</span>
        </div>
      </div>

      <section
        v-if="activeList"
        :id="PANEL_ID"
        class="card list-card"
        role="tabpanel"
        :aria-labelledby="tabId(activeList.id)"
      >
        <div class="toolbar">
          <form v-if="renaming" class="name-form rename-form" novalidate @submit.prevent="submitRename">
            <label for="watchlist-rename-input" class="sr-only">{{ t(lang, 'watchlistListName') }}</label>
            <div class="name-row">
              <input
                id="watchlist-rename-input"
                ref="renameInputEl"
                v-model="renameName"
                class="inp"
                data-testid="watchlist-rename-input"
                maxlength="30"
                autocomplete="off"
                :disabled="busy"
                :aria-invalid="renameError ? 'true' : undefined"
                :aria-describedby="renameError ? 'watchlist-rename-hint watchlist-name-error' : 'watchlist-rename-hint'"
                @input="renameTouched = true"
                @keydown.escape.prevent="cancelRename"
              />
              <button type="submit" class="btn-ghost-sm" data-testid="watchlist-rename-save" :disabled="busy || renameError !== ''">
                {{ t(lang, 'watchlistSaveName') }}
              </button>
              <button type="button" class="btn-ghost-sm" data-testid="watchlist-rename-cancel" :disabled="busy" @click="cancelRename">
                {{ t(lang, 'cancel') }}
              </button>
            </div>
            <p id="watchlist-rename-hint" class="hint field-hint">{{ t(lang, 'watchlistNameHint') }}</p>
            <div v-if="renameError" id="watchlist-name-error" class="field-error" data-testid="watchlist-name-error">{{ renameError }}</div>
          </form>
          <div v-else class="toolbar-title">
            <h3 ref="titleEl" class="ttl" tabindex="-1" data-testid="watchlist-toolbar-name">{{ activeList.name }}</h3>
            <span class="hint" data-testid="watchlist-count">{{ tf(lang, 'watchlistCount', { n: activeList.items.length }) }}</span>
          </div>
          <div v-if="!renaming" class="toolbar-actions">
            <span
              v-if="reorderSaving"
              class="hint saving-note"
              role="status"
              data-testid="watchlist-reorder-saving"
            >{{ t(lang, 'watchlistReorderSaving') }}</span>
            <button
              type="button"
              class="btn-ghost-sm"
              data-testid="watchlist-reorder"
              :aria-pressed="reordering ? 'true' : 'false'"
              :disabled="activeList.items.length === 0 && !reordering"
              @click="toggleReorder"
            >{{ t(lang, reordering ? 'watchlistReorderDone' : 'watchlistReorder') }}</button>
            <button
              ref="renameBtnEl"
              type="button"
              class="btn-ghost-sm"
              data-testid="watchlist-rename"
              :disabled="busy"
              @click="openRename"
            >{{ t(lang, 'watchlistRename') }}</button>
            <button
              ref="deleteBtnEl"
              type="button"
              class="btn-ghost-sm"
              data-testid="watchlist-delete"
              :disabled="busy"
              @click="openDelete"
            >{{ t(lang, 'watchlistDelete') }}</button>
          </div>
        </div>

        <!-- 刪除確認:頁面行內(非 modal),焦點落在取消,不落在破壞性按鈕(U-14) -->
        <div
          v-if="confirmingDelete"
          class="delete-confirm"
          role="group"
          aria-labelledby="watchlist-delete-confirm-text"
          data-testid="watchlist-delete-confirm"
        >
          <p id="watchlist-delete-confirm-text" class="confirm-text">
            {{ tf(lang, 'watchlistDeleteConfirm', { name: activeList.name, n: activeList.items.length }) }}
          </p>
          <p v-if="lists.length === 1" class="hint">{{ t(lang, 'watchlistDeleteLastNote') }}</p>
          <div class="confirm-actions">
            <button
              type="button"
              class="btn-danger"
              data-testid="watchlist-delete-confirm-submit"
              :disabled="busy"
              @click="confirmDelete"
            >{{ t(lang, 'watchlistDelete') }}</button>
            <button
              ref="deleteCancelEl"
              type="button"
              class="btn-ghost-sm"
              data-testid="watchlist-delete-confirm-cancel"
              :disabled="busy"
              @click="cancelDelete"
            >{{ t(lang, 'cancel') }}</button>
          </div>
        </div>

        <!-- 清單空:標題 + 說明 + 前往行情 -->
        <div v-if="activeList.items.length === 0" class="empty-state" data-testid="watchlist-empty">
          <div class="empty-title">{{ t(lang, 'watchlistEmpty') }}</div>
          <div class="hint">{{ t(lang, 'watchlistEmptyBody') }}</div>
          <button
            type="button"
            class="btn-ghost-sm empty-action"
            data-testid="watchlist-empty-go-markets"
            @click="emit('navigate', 'markets')"
          >{{ t(lang, 'watchlistGoMarkets') }}</button>
        </div>

        <template v-else>
          <div class="table-wrap">
            <table role="table" data-testid="watchlist-table" :class="{ reordering }">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" class="col-grip"></th>
                  <th role="columnheader" class="col-sym">{{ t(lang, 'symbol') }}</th>
                  <th role="columnheader" class="col-name">{{ t(lang, 'name') }}</th>
                  <th role="columnheader" class="col-price right">{{ t(lang, 'price') }}</th>
                  <th role="columnheader" class="col-change right">{{ t(lang, 'change') }}</th>
                  <th role="columnheader" class="col-vol right">{{ t(lang, 'volume') }}</th>
                  <th role="columnheader" class="col-act right"></th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                <tr
                  v-for="(item, index) in liveRows"
                  :key="item.uuid"
                  role="row"
                  :class="dropClass(index)"
                  :draggable="reordering ? 'false' : 'true'"
                  data-testid="watchlist-row"
                  :data-symbol="item.symbol"
                  :data-quote-source="item.quoteSource"
                  @click="onRowClick(item)"
                  @dragstart="onDragStart(index)"
                  @dragover.prevent="onDragOver(index)"
                  @drop.prevent="onDrop(index)"
                  @dragend="clearDrag"
                >
                  <td role="cell" class="col-grip">
                    <div v-if="reordering" class="move-group">
                      <button
                        type="button"
                        class="icon-btn"
                        data-testid="watchlist-move-up"
                        :aria-label="tf(lang, 'watchlistMoveUp', { symbol: item.symbol })"
                        :disabled="index === 0"
                        @click.stop="move(index, -1, 'up')"
                      ><span aria-hidden="true">↑</span></button>
                      <button
                        type="button"
                        class="icon-btn"
                        data-testid="watchlist-move-down"
                        :aria-label="tf(lang, 'watchlistMoveDown', { symbol: item.symbol })"
                        :disabled="index === activeList.items.length - 1"
                        @click.stop="move(index, 1, 'down')"
                      ><span aria-hidden="true">↓</span></button>
                    </div>
                    <span v-else class="grip" aria-hidden="true">⋮⋮</span>
                  </td>
                  <td role="cell" class="col-sym">
                    <span class="sym">{{ item.symbol }}</span>
                    <span v-if="hasCcyTag(item)" class="ccy-tag">{{ item.currency }}</span>
                  </td>
                  <td role="cell" class="col-name">{{ item.name }}</td>
                  <td role="cell" class="col-price right num" data-testid="watchlist-row-price">
                    <!-- ● 與 sr-only「即時」只在 ws 列(stream live 且 GET 後收過 tick);FX / 債券永不出現(P-W6) -->
                    <span v-if="item.quoteSource === 'ws'" class="row-live" data-testid="watchlist-row-live"><span
                      class="live-dot"
                      aria-hidden="true"
                    /><span class="sr-only">{{ t(lang, 'liveQuoteRowLive') }}</span></span>{{ priceText(item) }}
                  </td>
                  <td
                    role="cell"
                    class="col-change right num"
                    :class="changeClass(item)"
                    data-testid="watchlist-row-change"
                  >{{ changeText(item) }}</td>
                  <td role="cell" class="col-vol right num">{{ volumeText(item) }}</td>
                  <td role="cell" class="col-act right">
                    <button
                      v-if="!reordering"
                      type="button"
                      class="icon-btn"
                      data-testid="watchlist-remove"
                      :aria-label="tf(lang, 'watchlistRemoveAria', { name: activeList.name, symbol: item.symbol })"
                      :disabled="removing[item.uuid] === true"
                      @click.stop="removeItem(item)"
                    ><span aria-hidden="true">✕</span></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="hint quote-note" data-testid="watchlist-quote-note">{{ t(lang, 'watchlistQuoteNote') }}</p>
          <!-- 排序播報:每次移動以 role=status 讀出新位置 -->
          <p class="sr-only" role="status">{{ moveAnnouncement }}</p>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// Phase 04.2 Plan 23(WATCH-03、D-14 / D-15 / D-17 / D-18 / D-20):Watchlist 頁整頁重建。
// 清單與報價只經 getRuntimeApiClients().watchlist(鐵律 1 / 3;judgment §3:元件不 import mock store)。
// 頁級 `lists` / `activeListId` 是唯一狀態來源;04.2-24 在此之上疊加即時報價(data-quote-source 加 `ws`)。
// 即時報價只經 getRuntimeApiClients().quotes + useLiveQuotes(D-24:元件不直接建立瀏覽器連線)。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import LiveQuoteStatus from '../components/LiveQuoteStatus.vue';
import { useLiveQuotes } from '../composables/useLiveQuotes';
import { useQuoteRefresh } from '../composables/useQuoteRefresh';
import { t, tf } from '../i18n';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { AssetDto } from '../services/apiTypes';
import { WATCHLIST_MAX_LISTS, type WatchlistDto } from '../services/watchlistApi';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{
  chart: [p: { sym: string }];
  navigate: [page: 'markets'];
}>();

const PANEL_ID = 'watchlist-panel';

const lists = ref<WatchlistDto[] | null>(null);
const activeListId = ref<string | null>(null);
const loading = ref(false);
const loadError = ref<ApiClientError | null>(null);
const tablistEl = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);

const activeList = computed(() => lists.value?.find(list => list.id === activeListId.value) ?? null);

// ── 即時報價(WATCH-04;D-21 / D-23)──────────────────────────────
const quotes = getRuntimeApiClients().quotes;
const NO_ROWS: readonly AssetDto[] = [];
/** 作用中清單的列;陣列被替換(GET 重讀、操作回應)時 useLiveQuotes 以當下 ticks 為新基準。 */
const activeRows = computed<readonly AssetDto[]>(() => activeList.value?.items ?? NO_ROWS);
/** 最後一次 GET 成功的前端收到時間(「更新於」的下限,U-19)。 */
const restFetchedAt = ref<number | null>(null);
const live = useLiveQuotes(activeRows, quotes, { restFetchedAt });
const liveRows = live.rows;
const lastUpdatedAt = live.lastUpdatedAt;
const streamStatus = computed(() => quotes.status.value);

const atListLimit = computed(() => (lists.value?.length ?? 0) >= WATCHLIST_MAX_LISTS);

function watchlistApi() {
  return getRuntimeApiClients().watchlist;
}

function toApiError(error: unknown): ApiClientError {
  return error instanceof ApiClientError
    ? error
    : new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
}

/** 作用中清單不存在(首次載入、被刪除)→ 改為第一個清單。 */
function ensureActive() {
  const current = lists.value ?? [];
  if (!current.some(list => list.id === activeListId.value)) {
    activeListId.value = current[0]?.id ?? null;
  }
}

/**
 * WR-06:過時回應守門。每次 GET 開始與每次本地寫入(操作回應、樂觀重排、建立 / 刪除)都遞增;
 * GET 回來時序號已不是最新 → 丟棄(它的快照早於較新的本地狀態,套用會讓已移除項目復活、還原排序、吃掉新清單)。
 */
let listsSeq = 0;
/** 最近一次 loadLists 的序號:只有它結束時才收起 loading。 */
let latestLoadSeq = 0;

/** 本地寫入清單的唯一入口(同時讓在飛中的 GET 失效)。 */
function setLists(next: WatchlistDto[]) {
  listsSeq += 1;
  lists.value = next;
}

/** 首次載入與重試;已有清單資料時(重讀)不清空畫面、不閃 loading。 */
async function loadLists() {
  const seq = ++listsSeq;
  latestLoadSeq = seq;
  loading.value = true;
  loadError.value = null;
  try {
    const data = await getRuntimeApiClients().watchlist.list();
    if (seq !== listsSeq) return;
    lists.value = data;
    restFetchedAt.value = Date.now();
    ensureActive();
  } catch (error) {
    if (seq !== listsSeq) return;
    loadError.value = toApiError(error);
  } finally {
    if (seq === latestLoadSeq) loading.value = false;
  }
}

/** 重讀(操作結果不確定 / 清單不存在 / 刪光後);失敗不打擾,保留目前畫面。 */
async function reloadLists() {
  const seq = ++listsSeq;
  try {
    const data = await watchlistApi().list();
    if (seq !== listsSeq) return;
    lists.value = data;
    restFetchedAt.value = Date.now();
    ensureActive();
  } catch {
    // 保留舊值:操作錯誤區已說明狀況,讀取失敗不再疊一層錯誤。
  }
}

function replaceList(updated: WatchlistDto) {
  setLists((lists.value ?? []).map(list => (list.id === updated.id ? updated : list)));
}

// ── 操作錯誤(§Copywriting 觀察清單表;診斷只露 code / traceId,絕不顯示後端 message)────────
interface OpError {
  code: string;
  traceId: string | null;
  fields: Record<string, string> | null;
  status: number;
}

const opError = ref<OpError | null>(null);

const ERROR_COPY: Record<string, string> = {
  DUPLICATE_RESOURCE: 'watchlistErrDuplicateName',
  WATCHLIST_NOT_FOUND: 'watchlistErrNotFound',
  WATCHLIST_ORDER_CONFLICT: 'watchlistErrOrderConflict',
  ASSET_NOT_FOUND: 'watchlistErrAsset',
  AUTH_FORBIDDEN: 'watchlistErrForbidden',
  AUTH_CSRF_TOKEN_INVALID: 'watchlistErrCsrf',
  // 前端合成(`apiClient` 拿不到 CSRF cookie / 網路失敗),後端不會送。
  AUTH_CSRF_TOKEN_MISSING: 'watchlistErrCsrf',
  NETWORK_ERROR: 'watchlistErrNetwork',
};

function describeError(error: unknown): OpError {
  return error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };
}

function errorCopyKey(error: OpError): string {
  // 409 重名的 fields 也帶 `name`,code 比 fields 精確,先判斷。
  if (error.code === 'DUPLICATE_RESOURCE') return 'watchlistErrDuplicateName';
  if (error.fields?.watchlists) return 'watchlistErrListLimit';
  if (error.fields?.name) return 'watchlistErrName';
  return ERROR_COPY[error.code] ?? (error.status === 403 ? 'watchlistErrForbidden' : 'watchlistErrUnknown');
}

const opErrorCopy = computed(() => (opError.value ? t(props.lang, errorCopyKey(opError.value)) : ''));

/** 文案承諾「清單已重新整理」的情境:清單不存在、結果不確定。 */
function needsReload(error: OpError): boolean {
  const copyKey = errorCopyKey(error);
  return copyKey === 'watchlistErrNotFound' || copyKey === 'watchlistErrUnknown' || copyKey === 'watchlistErrOrderConflict';
}

/**
 * 操作失敗的統一落點;401 不在這裡顯示(apiClient 已升級為全域 SessionBanner)。
 * `alwaysReload`:排序失敗一律回到伺服器順序(樂觀重排已改了畫面)。
 */
async function failOp(error: unknown, alwaysReload = false) {
  const described = describeError(error);
  if (described.status === 401) {
    if (alwaysReload) await reloadLists();
    return;
  }
  opError.value = described;
  if (alwaysReload || needsReload(described)) await reloadLists();
}

// ── 名稱自檢(trim 後 1–30 字、不與其他清單同名)────────────────────
const NAME_MAX = 30;
const busy = ref(false);

function nameCheck(name: string, excludeId: string | null): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) return t(props.lang, 'watchlistErrName');
  if ((lists.value ?? []).some(list => list.id !== excludeId && list.name === trimmed)) {
    return t(props.lang, 'watchlistErrDuplicateName');
  }
  return '';
}

// ── 建立清單 ─────────────────────────────────────────────
const newListEl = ref<HTMLButtonElement | null>(null);
const createInputEl = ref<HTMLInputElement | null>(null);
const creating = ref(false);
const createName = ref('');
const createTouched = ref(false);
const createAttempted = ref(false);

const createError = computed(() => (createTouched.value || createAttempted.value ? nameCheck(createName.value, null) : ''));

async function openCreate() {
  if (lists.value === null || atListLimit.value) return;
  closeRename();
  confirmingDelete.value = false;
  creating.value = true;
  createName.value = '';
  createTouched.value = false;
  createAttempted.value = false;
  await nextTick();
  createInputEl.value?.focus();
}

function closeCreate() {
  creating.value = false;
  createName.value = '';
  createTouched.value = false;
  createAttempted.value = false;
}

async function cancelCreate() {
  if (busy.value) return;
  closeCreate();
  await nextTick();
  newListEl.value?.focus();
}

async function submitCreate() {
  createAttempted.value = true;
  if (busy.value || nameCheck(createName.value, null)) return;
  busy.value = true;
  let created: WatchlistDto | null = null;
  let failure: unknown = null;
  try {
    created = await watchlistApi().create(createName.value.trim());
  } catch (error) {
    failure = error;
  }
  busy.value = false;
  if (!created) {
    await failOp(failure);
    await nextTick();
    createInputEl.value?.focus();
    return;
  }
  const newList = created;
  setLists([...(lists.value ?? []).filter(list => list.id !== newList.id), newList]);
  activeListId.value = newList.id;
  opError.value = null;
  closeCreate();
  await focusTab(newList.id);
}

// ── 改名 ───────────────────────────────────────────────
const renameBtnEl = ref<HTMLButtonElement | null>(null);
const renameInputEl = ref<HTMLInputElement | null>(null);
const renaming = ref(false);
const renameName = ref('');
const renameTouched = ref(false);

const renameError = computed(() => (renaming.value && renameTouched.value
  ? nameCheck(renameName.value, activeListId.value)
  : ''));

async function openRename() {
  const list = activeList.value;
  if (!list) return;
  closeCreate();
  confirmingDelete.value = false;
  renaming.value = true;
  renameName.value = list.name;
  renameTouched.value = false;
  await nextTick();
  renameInputEl.value?.focus();
}

function closeRename() {
  renaming.value = false;
  renameName.value = '';
  renameTouched.value = false;
}

async function cancelRename() {
  if (busy.value) return;
  closeRename();
  await nextTick();
  renameBtnEl.value?.focus();
}

async function submitRename() {
  const list = activeList.value;
  renameTouched.value = true;
  if (!list || busy.value || nameCheck(renameName.value, list.id)) return;
  busy.value = true;
  let updated: WatchlistDto | null = null;
  let failure: unknown = null;
  try {
    updated = await watchlistApi().rename(list.id, renameName.value.trim());
  } catch (error) {
    failure = error;
  }
  busy.value = false;
  if (!updated) {
    await failOp(failure);
    await nextTick();
    renameInputEl.value?.focus();
    return;
  }
  replaceList(updated);
  opError.value = null;
  closeRename();
  await nextTick();
  renameBtnEl.value?.focus();
}

// ── 刪除清單(行內確認)──────────────────────────────────────
const deleteBtnEl = ref<HTMLButtonElement | null>(null);
const deleteCancelEl = ref<HTMLButtonElement | null>(null);
const confirmingDelete = ref(false);

async function openDelete() {
  closeCreate();
  closeRename();
  confirmingDelete.value = true;
  await nextTick();
  deleteCancelEl.value?.focus();
}

async function cancelDelete() {
  if (busy.value) return;
  confirmingDelete.value = false;
  await nextTick();
  deleteBtnEl.value?.focus();
}

async function confirmDelete() {
  const list = activeList.value;
  if (!list || busy.value) return;
  busy.value = true;
  let failure: unknown = null;
  let ok = false;
  try {
    await watchlistApi().remove(list.id);
    ok = true;
  } catch (error) {
    failure = error;
  }
  busy.value = false;
  confirmingDelete.value = false;
  if (!ok) {
    await failOp(failure);
    return;
  }
  opError.value = null;
  const remaining = (lists.value ?? []).filter(candidate => candidate.id !== list.id);
  setLists(remaining);
  // 刪光 → 後端在下一次 GET 重建空的「我的自選」(D-17)。
  if (remaining.length === 0) await reloadLists();
  activeListId.value = lists.value?.[0]?.id ?? null;
  if (activeListId.value) await focusTab(activeListId.value);
}

// ── 移除項目(U-18:立即、不確認)─────────────────────────────────
const removing = reactive<Record<string, boolean>>({});

async function removeItem(item: AssetDto) {
  const list = activeList.value;
  if (!list || removing[item.uuid]) return;
  const index = list.items.findIndex(candidate => candidate.uuid === item.uuid);
  removing[item.uuid] = true;
  let updated: WatchlistDto | null = null;
  let failure: unknown = null;
  try {
    updated = await watchlistApi().removeItem(list.id, item.uuid);
  } catch (error) {
    failure = error;
  }
  delete removing[item.uuid];
  if (!updated) {
    await failOp(failure);
    return;
  }
  if (reorderSaving.value) {
    // 尚有未送出 / 在飛的排序:保留本地順序只去掉這一檔,待送的整份順序才與伺服器集合一致。
    const current = lists.value?.find(candidate => candidate.id === list.id);
    if (current) replaceList({ ...current, items: current.items.filter(candidate => candidate.uuid !== item.uuid) });
  } else {
    replaceList(updated);
  }
  opError.value = null;
  await nextTick();
  // 焦點移到下一列的 ✕(原位置的新列);沒有下一列 → 清單名稱。
  const removeButtons = [...document.querySelectorAll<HTMLButtonElement>(`#${PANEL_ID} [data-testid="watchlist-remove"]`)];
  const next = removeButtons[index];
  if (next) next.focus();
  else titleEl.value?.focus();
}

// ── 排序(U-17:拖拉 + 排序模式 ↑ ↓;樂觀重排、500 ms debounce、單一請求在飛、失敗重讀)────────
const REORDER_DEBOUNCE_MS = 500;
const reordering = ref(false);
const moveAnnouncement = ref('');
const reorderInFlight = ref(false);
/** 有尚未送出的本地順序(debounce 中或等前一個請求完成)。 */
const pendingReorderListId = ref<string | null>(null);
let reorderTimer: ReturnType<typeof setTimeout> | null = null;

const reorderSaving = computed(() => reorderInFlight.value || pendingReorderListId.value !== null);

function toggleReorder() {
  reordering.value = !reordering.value;
  clearDrag();
}

function onRowClick(item: AssetDto) {
  if (reordering.value) return;
  emit('chart', { sym: item.symbol });
}

/** 本地重排(樂觀)並排程儲存;回傳被移動的項目。 */
function reorderLocal(from: number, to: number): AssetDto | null {
  const list = activeList.value;
  if (!list || from === to || from < 0 || to < 0 || from >= list.items.length || to >= list.items.length) return null;
  const items = [...list.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  replaceList({ ...list, items });
  scheduleReorderSave(list.id);
  return moved;
}

function scheduleReorderSave(listId: string) {
  // 換了清單還有待送的順序 → 先送出前一份,不讓它被覆蓋。
  if (pendingReorderListId.value && pendingReorderListId.value !== listId) flushReorderNow();
  pendingReorderListId.value = listId;
  if (reorderTimer) clearTimeout(reorderTimer);
  reorderTimer = setTimeout(() => {
    reorderTimer = null;
    void sendReorder();
  }, REORDER_DEBOUNCE_MS);
}

function flushReorderNow() {
  if (reorderTimer) {
    clearTimeout(reorderTimer);
    reorderTimer = null;
  }
  void sendReorder();
}

/** 送整份順序;同時間只有一個請求在飛,在飛期間的新變更等它完成後再送最新順序。 */
async function sendReorder() {
  if (reorderInFlight.value) return;
  const listId = pendingReorderListId.value;
  if (!listId) return;
  const list = lists.value?.find(candidate => candidate.id === listId);
  pendingReorderListId.value = null;
  if (!list) return;

  reorderInFlight.value = true;
  let failure: unknown = null;
  let updated: WatchlistDto | null = null;
  try {
    updated = await getRuntimeApiClients().watchlist.reorder(listId, list.items.map(item => item.uuid));
  } catch (error) {
    failure = error;
  }
  reorderInFlight.value = false;

  if (!updated) {
    // 失敗:丟棄同一清單後續待送的順序,回到伺服器順序(重讀)。
    if (pendingReorderListId.value === listId) {
      pendingReorderListId.value = null;
      if (reorderTimer) {
        clearTimeout(reorderTimer);
        reorderTimer = null;
      }
    }
    await failOp(failure, true);
    return;
  }
  opError.value = null;
  // 在飛期間又有新順序 → 回應已過時,不覆蓋本地;等計時器到或立即送最新的。
  if (pendingReorderListId.value === null) replaceList(updated);
  else if (!reorderTimer) void sendReorder();
}

async function move(index: number, delta: number, direction: 'up' | 'down') {
  const moved = reorderLocal(index, index + delta);
  if (!moved) return;
  const position = index + delta + 1;
  moveAnnouncement.value = tf(props.lang, 'watchlistMovedAnnounce', { symbol: moved.symbol, pos: position });
  await nextTick();
  // 焦點跟著被移動的列停在同一顆按鈕;那顆變 disabled(到頂 / 到底)時改到另一顆。
  const rowEl = [...document.querySelectorAll<HTMLElement>(`#${PANEL_ID} [data-testid="watchlist-row"]`)][index + delta];
  const same = rowEl?.querySelector<HTMLButtonElement>(`[data-testid="watchlist-move-${direction}"]`);
  const other = rowEl?.querySelector<HTMLButtonElement>(`[data-testid="watchlist-move-${direction === 'up' ? 'down' : 'up'}"]`);
  if (same && !same.disabled) same.focus();
  else (other && !other.disabled ? other : same)?.focus();
}

// HTML5 DnD(滑鼠,≥ 640px):指示線在目標列上緣(往上拖)/ 下緣(往下拖)。
const dragFrom = ref(-1);
const dragOver = ref(-1);

function onDragStart(index: number) {
  if (reordering.value) return;
  dragFrom.value = index;
}

function onDragOver(index: number) {
  if (dragFrom.value < 0) return;
  dragOver.value = index;
}

function onDrop(index: number) {
  const from = dragFrom.value;
  clearDrag();
  if (from < 0) return;
  reorderLocal(from, index);
}

function clearDrag() {
  dragFrom.value = -1;
  dragOver.value = -1;
}

function dropClass(index: number): string {
  if (dragFrom.value < 0 || dragOver.value !== index || dragFrom.value === index) return '';
  return dragFrom.value > index ? 'drop-before' : 'drop-after';
}

// 離開頁面時還在 debounce 的順序立即送出,不讓最後一次移動遺失。
onBeforeUnmount(() => {
  if (reorderTimer) flushReorderNow();
});

async function focusTab(listId: string) {
  await nextTick();
  const el = tabElement(listId);
  el?.focus();
  el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function tabId(listId: string): string {
  return `watchlist-tab-${listId}`;
}

function tabElement(listId: string): HTMLElement | undefined {
  return [...(tablistEl.value?.querySelectorAll<HTMLElement>('[data-testid="watchlist-tab"]') ?? [])]
    .find(el => el.getAttribute('data-list-id') === listId);
}

/** 切換 tab:清除操作錯誤、收起改名與刪除確認(它們屬於前一個清單)。 */
function selectTab(listId: string) {
  if (listId !== activeListId.value) {
    closeRename();
    confirmingDelete.value = false;
    clearDrag();
    // 前一個清單還在 debounce 的順序立即送出。
    if (reorderTimer) flushReorderNow();
  }
  opError.value = null;
  activeListId.value = listId;
}

/** roving tabindex:← → 循環移動、Home / End 到頭尾;移動即啟用(自動啟用),焦點跟著走並捲入可視範圍。 */
async function onTabKeydown(event: KeyboardEvent, index: number) {
  const current = lists.value ?? [];
  if (current.length === 0) return;
  let next = -1;
  if (event.key === 'ArrowRight') next = (index + 1) % current.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + current.length) % current.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = current.length - 1;
  if (next < 0) return;
  event.preventDefault();
  const target = current[next];
  selectTab(target.id);
  await focusTab(target.id);
}

// ── 報價格式(UI-SPEC §Money:觀察清單)──────────────────────────
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fixed(value: number, dp: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** FX 4 位、BOND 3 位(殖利率)、其餘 2 位。 */
function priceDp(item: AssetDto): number {
  if (item.assetType === 'FX') return 4;
  if (item.assetType === 'BOND') return 3;
  return 2;
}

function priceText(item: AssetDto): string {
  return isFiniteNumber(item.latestPrice) ? fixed(item.latestPrice, priceDp(item)) : '—';
}

/** BOND 用 change(殖利率變動),其餘用 changePercent。 */
function changeValue(item: AssetDto): number | null {
  const value = item.assetType === 'BOND' ? item.change : item.changePercent;
  return isFiniteNumber(value) ? value : null;
}

function changeText(item: AssetDto): string {
  const value = changeValue(item);
  if (value === null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const body = item.assetType === 'BOND' ? fixed(Math.abs(value), 3) : `${fixed(Math.abs(value), 2)}%`;
  return `${sign}${body}`;
}

function changeClass(item: AssetDto): string {
  const value = changeValue(item);
  if (value === null) return 'na';
  if (value > 0) return 'up';
  if (value < 0) return 'dn';
  return '';
}

/** 後端 volumeText 原樣;null / 空字串 → —(tick 的 volume 不得覆寫,RESEARCH P-W5)。 */
function volumeText(item: AssetDto): string {
  return item.volumeText ? item.volumeText : '—';
}

/** U-16:幣別標籤只對 STOCK / CRYPTO(FX 匯率與債券殖利率沒有計價幣別語意)。 */
function hasCcyTag(item: AssetDto): boolean {
  return item.assetType === 'STOCK' || item.assetType === 'CRYPTO';
}

// 只 watch 作用中清單的 STOCK / CRYPTO(U-20);resyncSeq / 每 5 分鐘 / 回前景靜默重讀 GET(不閃 loading,失敗保留舊值)。
// 排序尚未儲存、寫入或項目移除進行中時略過:重讀回應會用伺服器舊快照蓋掉本地狀態(WR-06;
// 已在飛的 GET 則由 listsSeq 丟棄)。
useQuoteRefresh(activeRows, quotes, reloadLists, {
  canRefresh: () => lists.value !== null && !reorderSaving.value && !busy.value
    && Object.keys(removing).length === 0,
});

onMounted(loadLists);
</script>

<style scoped>
.page { padding: 24px; }
.page-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.head-main { flex: 1 1 0; min-width: 0; }
.head-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
h2 { font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: 0; margin: 0; }
.hint { font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); }

/* 清單 tabs:自己的列內水平捲動,不換行、不撐頁;選中以 --fg 邊框區分(不用 accent) */
.tabs { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 16px; }
.tab {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  min-height: 36px; max-width: 200px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border); color: var(--fg-dim);
  font: inherit; font-size: 12px; font-weight: 600; line-height: 1.35; cursor: pointer;
}
.tab.on { border-color: var(--fg); color: var(--fg); }
.tab-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-count { flex: none; font-size: 12px; font-weight: 400; color: var(--fg-dim); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.list-card { padding: 20px; }

.toolbar { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 12px; margin-bottom: 16px; }
/*
 * 04.2-25(L11):flex-basis 0 + min-width 0 讓標題永遠不觸發換行,375px en 三顆動作鈕(265px)把 30 字名稱擠成 8px。
 * 保底 min(100%, 160px):放不下時動作鈕整組換到下一列,標題吃滿整列(LEARNINGS 2026-10-23 的換行坑)。
 */
.toolbar-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; flex: 1 1 0; min-width: min(100%, 160px); }
.ttl { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; min-width: 0; }

.table-wrap { overflow-x: auto; }
table { width: 100%; font-size: 13px; border-collapse: collapse; }
thead th { padding: 8px 12px; font-size: 12px; font-weight: 600; line-height: 1.35; text-align: left; color: var(--fg-dim); white-space: nowrap; }
tbody tr { border-top: 1px solid var(--border); cursor: pointer; }
tbody tr:hover { background: var(--surface2); }
tbody td { padding: 12px 12px; font-size: 13px; font-weight: 400; line-height: 1.45; }
thead th:first-child, tbody td:first-child { padding-left: 0; }
.right { text-align: right; }
.sym { font-weight: 600; }
.col-name { color: var(--fg-dim); overflow-wrap: anywhere; }
.col-price, .col-change, .col-vol { white-space: nowrap; }
.col-vol { color: var(--fg-dim); }
.up { color: var(--up); }
.dn { color: var(--dn); }
.na { color: var(--fg-dim); }
.ccy-tag {
  display: inline-block; margin-left: 4px; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  border-radius: 99px; background: var(--surface2); color: var(--fg-dim);
}
.quote-note { margin: 12px 0 0; }
/* 即時列標記:6px 實心圓點(圖形尺寸,Exception 2)+ sr-only「即時」 */
.row-live { display: inline-flex; align-items: center; margin-right: 4px; vertical-align: middle; }
.live-dot { display: inline-block; width: 6px; height: 6px; border-radius: 99px; background: var(--up); }

.limit-hint { margin: 0 0 16px; }
.name-form { display: flex; flex-direction: column; min-width: 0; }
.create-form { margin-bottom: 16px; }
.rename-form { flex: 1 1 0; }
.lab { font-size: 12px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; }
.name-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.inp {
  flex: 1 1 0; min-width: 160px; max-width: 360px; min-height: 36px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
  color: var(--fg); font: inherit; font-size: 13px;
}
.inp[aria-invalid='true'] { border-color: var(--dn); }
.field-hint { margin: 4px 0 0; }
.field-error { margin-top: 8px; font-size: 12px; font-weight: 600; line-height: 1.35; color: var(--dn); overflow-wrap: anywhere; }
.form-error {
  margin-bottom: 16px; padding: 8px 12px; border-radius: 8px;
  background: rgba(220, 38, 38, 0.10); color: var(--dn);
  font-size: 13px; font-weight: 600; line-height: 1.45;
}

.toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px 12px; }
.delete-confirm {
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
}
.confirm-text { margin: 0; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
.delete-confirm .hint { margin: 0; }
.confirm-actions { display: flex; flex-wrap: wrap; gap: 8px 12px; }
.btn-danger {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--dn);
  color: var(--dn); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.col-act { white-space: nowrap; }
.col-grip { width: 32px; white-space: nowrap; }
.grip { font-size: 12px; color: var(--fg-dim); cursor: grab; user-select: none; }
.move-group { display: flex; gap: 8px; }
table.reordering tbody tr { cursor: default; }
.saving-note { align-self: center; }
/* 拖放指示線:2px --fg(不用 accent) */
tbody tr.drop-before { box-shadow: inset 0 2px 0 var(--fg); }
tbody tr.drop-after { box-shadow: inset 0 -2px 0 var(--fg); }
.icon-btn {
  width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px;
  background: transparent; color: var(--fg-dim); font: inherit; font-size: 13px; cursor: pointer;
}
.icon-btn:hover:not(:disabled) { background: var(--surface2); color: var(--fg); }
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/*
 * < 640px:每列堆疊成 grid(比照 Cash.vue 04.1-31),價格與漲跌不藏在卡內捲動後面。
 *   代號 + 幣別      價格     動作
 *   名稱            漲跌     動作
 * 成交量不渲染;thead 以 sr-only 手法保留給輔助科技,table 元素已補明確 ARIA role。
 */
@media (max-width: 639px) {
  .head-actions { margin-left: 0; }
  table, tbody { display: block; }
  thead {
    position: absolute; width: 1px; height: 1px; margin: 0; padding: 0;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "sym price act"
      "name change act";
    gap: 4px 12px; padding: 12px 0;
  }
  tbody td { display: block; min-width: 0; padding: 0; }
  tbody td:first-child { padding-left: 0; }
  td.col-sym { grid-area: sym; }
  td.col-name { grid-area: name; }
  td.col-price { grid-area: price; }
  td.col-change { grid-area: change; }
  td.col-vol { display: none; }
  td.col-act { grid-area: act; align-self: center; }
  /* 窄螢幕不渲染把手(觸控無 HTML5 DnD);排序模式的 ↑ ↓ 放進 act 區,✕ 讓位 */
  td.col-grip { display: none; }
  table.reordering td.col-grip { display: block; grid-area: act; align-self: center; }
  table.reordering td.col-act { display: none; }
}

.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-ghost-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.block-state { padding: 16px 0; font-size: 13px; color: var(--fg-dim); }
.block-error { padding: 16px 0; font-size: 13px; }
.details {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px; font-weight: 400;
}
.details span { overflow-wrap: anywhere; user-select: text; }
.block-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}

.empty-state { padding: 48px 16px; text-align: center; }
.empty-title { font-size: 13px; color: var(--fg); margin-bottom: 4px; }
.empty-action { margin-top: 12px; }

.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.tab:focus-visible,
.ttl:focus-visible,
.inp:focus-visible,
.btn-danger:focus-visible,
.icon-btn:focus-visible,
.btn-ghost-sm:focus-visible,
.block-retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row { animation: none; }
}
</style>
