<template>
  <Teleport to="body">
    <div
      v-if="open"
      :id="WATCHLIST_PICKER_ID"
      ref="panelEl"
      class="wl-picker"
      role="dialog"
      :aria-labelledby="titleId"
      data-testid="watchlist-picker"
      :style="positionStyle"
      @focusout="onFocusOut"
    >
      <div class="wp-head">
        <div class="wp-head-text">
          <h3 :id="titleId" class="wp-title">{{ t(lang, 'watchlistPickerTitle') }}</h3>
          <span class="wp-symbol">{{ symbol }}</span>
        </div>
        <button
          ref="closeEl"
          type="button"
          class="wp-close"
          data-testid="watchlist-picker-close"
          :aria-label="t(lang, 'closeWatchlistPicker')"
          @click="requestClose(true)"
        ><span aria-hidden="true">✕</span></button>
      </div>

      <div class="wp-body" role="group" :aria-labelledby="titleId">
        <!-- 載入失敗(尚無清單資料):loadFailed + 診斷列(只露 code / traceId)+ 重試 -->
        <div v-if="!lists && loadError && !loading" class="wp-load-error" role="alert" data-testid="watchlist-picker-error">
          <div>{{ t(lang, 'loadFailed') }}</div>
          <div class="wp-details">
            <span data-testid="watchlist-picker-error-code">{{ loadError.code }}</span>
            <span v-if="loadError.requestId" data-testid="watchlist-picker-trace-id">
              {{ t(lang, 'authRequestId') }} {{ loadError.requestId }}
            </span>
          </div>
          <button type="button" class="wp-retry" data-testid="watchlist-picker-retry" @click="emit('retry')">
            {{ t(lang, 'authRetry') }}
          </button>
        </div>
        <!-- 載入中:一律有文字,骨架只是輔助 -->
        <div v-else-if="!lists" class="wp-loading" data-testid="watchlist-picker-loading">
          <div>{{ t(lang, 'loading') }}</div>
          <div class="skeleton-row" aria-hidden="true" />
          <div class="skeleton-row" aria-hidden="true" />
        </div>
        <template v-else>
          <div
            v-for="list in lists"
            :key="list.id"
            class="wp-option"
            data-testid="watchlist-picker-option"
            :data-list-id="list.id"
          >
            <label class="wp-row">
              <input
                type="checkbox"
                class="wp-check"
                data-testid="watchlist-picker-checkbox"
                :checked="contains(list)"
                :disabled="isSaving(list.id) || isFull(list)"
                :aria-describedby="itemErrors[list.id] ? optionErrorId(list.id) : undefined"
                @change="toggle(list, $event)"
              />
              <span class="wp-name">{{ list.name }}</span>
              <span
                v-if="isSaving(list.id)"
                class="wp-meta"
                role="status"
                data-testid="watchlist-picker-option-saving"
              >{{ t(lang, 'settingSaving') }}</span>
              <span v-else-if="isFull(list)" class="wp-meta" data-testid="watchlist-picker-option-full">
                {{ t(lang, 'watchlistItemsFull') }}
              </span>
              <span v-else class="wp-meta">{{ tf(lang, 'watchlistCount', { n: list.items.length }) }}</span>
            </label>
            <div
              v-if="itemErrors[list.id]"
              :id="optionErrorId(list.id)"
              class="field-error"
              role="alert"
              data-testid="watchlist-picker-option-error"
            >
              <div>{{ errorCopy(itemErrors[list.id]) }}</div>
              <div class="wp-details">
                <span>{{ itemErrors[list.id].code }}</span>
                <span v-if="itemErrors[list.id].traceId">{{ t(lang, 'authRequestId') }} {{ itemErrors[list.id].traceId }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 底部:+ 新增清單 → 行內表單「建立並加入」(U-13);20 個清單時 disabled + 上限文案 -->
      <div v-if="lists" class="wp-foot">
        <template v-if="!creating">
          <button
            ref="newButtonEl"
            type="button"
            class="wp-text-btn"
            data-testid="watchlist-picker-new"
            :disabled="atListLimit"
            :aria-describedby="atListLimit ? 'watchlist-picker-limit' : undefined"
            @click="openCreate"
          ><span aria-hidden="true">+ </span>{{ t(lang, 'watchlistNewList') }}</button>
          <p v-if="atListLimit" id="watchlist-picker-limit" class="wp-hint" data-testid="watchlist-picker-limit">
            {{ t(lang, 'watchlistListsLimitReached') }}
          </p>
        </template>
        <form v-else class="wp-form" novalidate @submit.prevent="submitCreate">
          <label for="watchlist-picker-new-name" class="wp-label">{{ t(lang, 'watchlistListName') }}</label>
          <input
            id="watchlist-picker-new-name"
            ref="nameInputEl"
            v-model="newName"
            class="wp-input"
            data-testid="watchlist-picker-new-name"
            maxlength="30"
            autocomplete="off"
            :disabled="createBusy"
            :aria-invalid="shownNameError ? 'true' : undefined"
            :aria-describedby="shownNameError ? 'watchlist-picker-name-hint watchlist-picker-name-error' : 'watchlist-picker-name-hint'"
            @input="onNameInput"
          />
          <p id="watchlist-picker-name-hint" class="wp-hint">{{ t(lang, 'watchlistNameHint') }}</p>
          <div v-if="shownNameError" id="watchlist-picker-name-error" class="field-error" data-testid="watchlist-picker-name-error">
            <div>{{ shownNameError }}</div>
            <div v-if="createError" class="wp-details">
              <span>{{ createError.code }}</span>
              <span v-if="createError.traceId">{{ t(lang, 'authRequestId') }} {{ createError.traceId }}</span>
            </div>
          </div>
          <div class="wp-form-actions">
            <button
              type="submit"
              class="wp-submit"
              data-testid="watchlist-picker-new-submit"
              :disabled="createBusy || Boolean(nameTouched && nameCheckError)"
            >{{ t(lang, 'watchlistCreateAndAdd') }}</button>
            <button
              type="button"
              class="wp-text-btn"
              data-testid="watchlist-picker-new-cancel"
              :disabled="createBusy"
              @click="cancelCreate"
            >{{ t(lang, 'cancel') }}</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
/** 面板 id:觸發鈕的 `aria-controls` 指向它(同頁同時最多一個選擇器)。 */
export const WATCHLIST_PICKER_ID = 'watchlist-picker-panel';
</script>

<script setup lang="ts">
// Phase 04.2 Plan 22(D-16 / U-12):觀察清單選擇器,非 modal popover。
// 清單狀態由頁面持有(lists prop);勾選即時寫入、**不做樂觀更新**——寫入回應的 WatchlistRecord 以
// `changed` 交回頁面,勾選與檔數只跟著 prop 變。寫入只經 getRuntimeApiClients().watchlist(鐵律 1 / 3)。
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { t, tf } from '../i18n';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { WATCHLIST_MAX_ITEMS, WATCHLIST_MAX_LISTS, type WatchlistRecord } from '../services/watchlistApi';
import type { Lang } from '../types';

const props = defineProps<{
  open: boolean;
  lang: Lang;
  symbol: string;
  anchor: HTMLElement | null;
  lists: WatchlistRecord[] | null;
  loading: boolean;
  loadError: ApiClientError | null;
  /**
   * 觸發鈕已被移出 DOM 時(例如 Markets「觀察清單」視圖取消勾選讓該列消失),關閉後焦點改落在這裡
   * (04.2-review WR-08)。頁面傳一個穩定、可程式聚焦的元素;觸發鈕不會消失的頁面不必傳。
   */
  fallbackFocus?: HTMLElement | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changed', list: WatchlistRecord): void;
  (e: 'created', list: WatchlistRecord): void;
  (e: 'retry'): void;
}>();

const titleId = 'watchlist-picker-title';
/** 四邊至少留 16px(s-16);與觸發鈕間距 8px(s-8)。 */
const EDGE = 16;
const GAP = 8;

const panelEl = ref<HTMLElement | null>(null);
const closeEl = ref<HTMLButtonElement | null>(null);
const position = ref<{ top: number; left: number } | null>(null);
const saving = reactive<Record<string, boolean>>({});
const newButtonEl = ref<HTMLButtonElement | null>(null);
const nameInputEl = ref<HTMLInputElement | null>(null);

/** 診斷只露 `code` 與 `traceId`,絕不顯示後端 `message`。 */
interface PickerError {
  code: string;
  traceId: string | null;
  fields: Record<string, string> | null;
  status: number;
}

const itemErrors = reactive<Record<string, PickerError>>({});

/** error.code → 文案(§Copywriting 觀察清單錯誤表);除 DUPLICATE_RESOURCE 外,`fields` 的 key 先於 code 判斷。 */
const ERROR_COPY: Record<string, string> = {
  DUPLICATE_RESOURCE: 'watchlistErrDuplicateName',
  WATCHLIST_NOT_FOUND: 'watchlistErrNotFound',
  ASSET_NOT_FOUND: 'watchlistErrAsset',
  AUTH_FORBIDDEN: 'watchlistErrForbidden',
  AUTH_CSRF_TOKEN_INVALID: 'watchlistErrCsrf',
  // 前端合成(`apiClient` 拿不到 CSRF cookie / 網路失敗),後端不會送。
  AUTH_CSRF_TOKEN_MISSING: 'watchlistErrCsrf',
  NETWORK_ERROR: 'watchlistErrNetwork',
};

function describeError(error: unknown): PickerError {
  return error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };
}

function errorCopyKey(error: PickerError): string {
  // 409 重名的 fields 也帶 `name`,code 比 fields 精確,先判斷。
  if (error.code === 'DUPLICATE_RESOURCE') return 'watchlistErrDuplicateName';
  if (error.fields?.items) return 'watchlistErrItemLimit';
  if (error.fields?.watchlists) return 'watchlistErrListLimit';
  if (error.fields?.name) return 'watchlistErrName';
  return ERROR_COPY[error.code] ?? (error.status === 403 ? 'watchlistErrForbidden' : 'watchlistErrUnknown');
}

function errorCopy(error: PickerError): string {
  const key = errorCopyKey(error);
  return key === 'watchlistErrItemLimit' ? tf(props.lang, key, { symbol: props.symbol }) : t(props.lang, key);
}

/** 清單不存在或結果不確定:文案承諾「清單已重新整理」,所以請頁面重讀。 */
function needsReload(error: PickerError): boolean {
  const key = errorCopyKey(error);
  return key === 'watchlistErrNotFound' || key === 'watchlistErrUnknown';
}

/** 寫入失敗的統一落點;401 不在這裡顯示(apiClient 已升級為全域 SessionBanner)。 */
function recordItemFailure(listId: string, error: unknown) {
  const described = describeError(error);
  if (described.status === 401) return;
  itemErrors[listId] = described;
  if (needsReload(described)) emit('retry');
}

function optionErrorId(listId: string): string {
  return `watchlist-picker-option-error-${listId}`;
}

function isFull(list: WatchlistRecord): boolean {
  return !contains(list) && list.items.length >= WATCHLIST_MAX_ITEMS;
}

const atListLimit = computed(() => (props.lists?.length ?? 0) >= WATCHLIST_MAX_LISTS);

// ── 新增清單(U-13:建立並加入)────────────────────────────────
const NAME_MAX = 30;
const creating = ref(false);
const createBusy = ref(false);
const newName = ref('');
const nameTouched = ref(false);
const submitAttempted = ref(false);
const createError = ref<PickerError | null>(null);

/** 前端自檢:trim 後 1–30 字、不與已載入清單同名。 */
const nameCheckError = computed(() => {
  const name = newName.value.trim();
  if (name.length < 1 || name.length > NAME_MAX) return t(props.lang, 'watchlistErrName');
  if ((props.lists ?? []).some(list => list.name === name)) return t(props.lang, 'watchlistErrDuplicateName');
  return '';
});

const shownNameError = computed(() => {
  if (createError.value) return errorCopy(createError.value);
  return nameTouched.value || submitAttempted.value ? nameCheckError.value : '';
});

function resetCreate() {
  creating.value = false;
  createBusy.value = false;
  newName.value = '';
  nameTouched.value = false;
  submitAttempted.value = false;
  createError.value = null;
}

async function openCreate() {
  if (atListLimit.value) return;
  resetCreate();
  creating.value = true;
  await nextTick();
  nameInputEl.value?.focus();
}

async function cancelCreate() {
  resetCreate();
  await nextTick();
  newButtonEl.value?.focus();
}

function onNameInput() {
  nameTouched.value = true;
  createError.value = null;
}

async function submitCreate() {
  submitAttempted.value = true;
  if (createBusy.value || nameCheckError.value) return;
  const name = newName.value.trim();
  // 04.2-review WR-10:await 期間選擇器可能被換到別的代號(watch 會 resetCreate),
  // 一律加入送出當下的代號,不在 await 之後讀 props.symbol。
  const symbol = props.symbol;
  const watchlist = getRuntimeApiClients().watchlist;

  createBusy.value = true;
  let created: WatchlistRecord;
  try {
    created = await watchlist.create(name);
  } catch (error) {
    createBusy.value = false;
    const described = describeError(error);
    if (described.status !== 401) createError.value = described;
    await nextTick();
    nameInputEl.value?.focus();
    return;
  }

  emit('created', created);
  resetCreate();
  saving[created.id] = true;
  try {
    emit('changed', await watchlist.addItem(created.id, symbol));
  } catch (error) {
    recordItemFailure(created.id, error);
  } finally {
    saving[created.id] = false;
    await refocusRow(created.id);
  }
}

const positionStyle = computed(() => (position.value
  ? { '--wp-top': `${position.value.top}px`, '--wp-left': `${position.value.left}px` }
  : {}));

function contains(list: WatchlistRecord): boolean {
  return list.items.some(item => item.symbol === props.symbol);
}

function isSaving(listId: string): boolean {
  return saving[listId] === true;
}

async function toggle(list: WatchlistRecord, event: Event) {
  const input = event.target as HTMLInputElement;
  const wasChecked = contains(list);
  // 不樂觀:瀏覽器已自行翻轉 checkbox,先翻回 prop 狀態,等回應 DTO 再由 prop 驅動。
  input.checked = wasChecked;
  if (isSaving(list.id) || isFull(list)) return;

  const watchlist = getRuntimeApiClients().watchlist;
  saving[list.id] = true;
  delete itemErrors[list.id];
  try {
    let updated: WatchlistRecord;
    if (wasChecked) {
      // 移除以回應 DTO 中該代號的 asset uuid 指定(路徑只放 UUID,T-04.2-39)。
      const assetId = list.items.find(item => item.symbol === props.symbol)?.uuid;
      if (!assetId) return;
      updated = await watchlist.removeItem(list.id, assetId);
    } else {
      updated = await watchlist.addItem(list.id, props.symbol);
    }
    emit('changed', updated);
  } catch (error) {
    recordItemFailure(list.id, error);
  } finally {
    saving[list.id] = false;
    await refocusRow(list.id);
  }
}

/** 儲存中 checkbox 被 disabled 會丟焦點;還原後把焦點放回同一列(焦點仍在面板外時不搶)。 */
async function refocusRow(listId: string) {
  await nextTick();
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const option = [...(panelEl.value?.querySelectorAll<HTMLElement>('[data-testid="watchlist-picker-option"]') ?? [])]
    .find(el => el.getAttribute('data-list-id') === listId);
  option?.querySelector<HTMLInputElement>('[data-testid="watchlist-picker-checkbox"]')?.focus();
}

function requestClose(restoreFocus: boolean) {
  emit('close');
  if (!restoreFocus) return;
  // 04.2-review WR-08:觸發鈕已脫離 DOM 時 focus() 會讓焦點掉到 body,改給頁面提供的穩定元素。
  if (props.anchor?.isConnected) props.anchor.focus();
  else props.fallbackFocus?.focus();
}

function focusInitial() {
  const first = panelEl.value?.querySelector<HTMLInputElement>('[data-testid="watchlist-picker-checkbox"]');
  (first ?? closeEl.value)?.focus();
}

/** 依觸發鈕定位於其下方、右緣對齊;下方放不下時翻上;四邊留 16px。`< 480px` 由 CSS 改為底部面板。 */
function reposition() {
  const panel = panelEl.value;
  const anchor = props.anchor;
  if (!panel || !anchor) return;
  // 04.2-review WR-08:脫離 DOM 的觸發鈕 rect 全為 0,面板會跳到左上角;保留上次位置。
  if (!anchor.isConnected) return;
  const rect = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const left = Math.max(EDGE, Math.min(rect.right - width, viewportWidth - EDGE - width));
  let top = rect.bottom + GAP;
  if (top + height > viewportHeight - EDGE && rect.top - GAP - height >= EDGE) {
    top = rect.top - GAP - height;
  }
  top = Math.max(EDGE, Math.min(top, viewportHeight - EDGE - height));
  position.value = { top, left };
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') requestClose(true);
}

/** 點擊面板外關閉;點觸發鈕本身交給頁面切換,不在這裡關(否則會關了又被 click 打開)。 */
function onPointerDown(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (panelEl.value?.contains(target) || props.anchor?.contains(target)) return;
  requestClose(true);
}

/** Tab 離開面板 → 關閉、不搶回焦點。relatedTarget 為 null(例如 checkbox 被 disabled)不算離開。 */
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (!next) return;
  if (panelEl.value?.contains(next) || props.anchor?.contains(next)) return;
  requestClose(false);
}

function bindGlobal() {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('mousedown', onPointerDown);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
}

function unbindGlobal() {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('mousedown', onPointerDown);
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
}

watch(
  () => [props.open, props.anchor, props.symbol] as const,
  async ([open], previous) => {
    const wasOpen = previous?.[0] ?? false;
    if (!open) {
      unbindGlobal();
      position.value = null;
    }
    // 換代號或關閉:上一檔的列錯誤與新增表單不帶過來。
    if (!open || previous?.[2] !== props.symbol) {
      for (const key of Object.keys(itemErrors)) delete itemErrors[key];
      resetCreate();
    }
    if (!open) return;
    if (!wasOpen) bindGlobal();
    await nextTick();
    reposition();
    focusInitial();
  },
  { immediate: true },
);

// 清單資料晚到(開啟時仍在載入):到了就重新定位;焦點只在仍停在 ✕ 時移到第一個 checkbox。
watch(
  () => props.lists,
  async () => {
    if (!props.open) return;
    await nextTick();
    reposition();
    if (document.activeElement === closeEl.value) focusInitial();
  },
);

onBeforeUnmount(unbindGlobal);
</script>

<style scoped>
.wl-picker {
  position: fixed;
  top: var(--wp-top, 16px);
  left: var(--wp-left, 16px);
  z-index: 150;
  display: flex;
  flex-direction: column;
  width: 288px;
  max-width: calc(100vw - 32px);
  max-height: min(360px, calc(100vh - 32px));
  padding: 16px;
  box-sizing: border-box;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  color: var(--fg);
}
/* U-12:< 480px 改為底部面板 */
@media (max-width: 479px) {
  .wl-picker {
    top: auto;
    left: 16px;
    right: 16px;
    bottom: 16px;
    width: auto;
    max-width: none;
  }
}

.wp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.wp-head-text {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}
.wp-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.35; letter-spacing: 0; }
.wp-symbol { font-size: 12px; font-weight: 600; color: var(--fg-dim); overflow-wrap: anywhere; }
.wp-close {
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-dim);
  font-size: 13px;
  cursor: pointer;
}
.wp-close:hover { background: var(--surface2); color: var(--fg); }

.wp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.wp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 8px 0;
  box-sizing: border-box;
  cursor: pointer;
}
.wp-check {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--fg);
  cursor: pointer;
}
.wp-check:disabled { cursor: not-allowed; }
.wp-name { flex: 1 1 0; min-width: 0; font-size: 13px; font-weight: 400; line-height: 1.45; overflow-wrap: anywhere; }
.wp-meta { flex: none; font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); white-space: nowrap; }

.wp-loading { font-size: 13px; color: var(--fg-dim); padding: 8px 0; }
.skeleton-row {
  height: 12px;
  margin-top: 8px;
  border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.wp-load-error { font-size: 13px; color: var(--fg); padding: 8px 0; }
.wp-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--fg-dim);
}
.wp-details span { overflow-wrap: anywhere; user-select: text; }
.wp-retry {
  margin-top: 8px;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--fg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

/* 列錯誤:該列下方 12px --dn 文字 */
.field-error {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.wp-foot { flex: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.wp-text-btn {
  min-height: 36px;
  padding: 8px 0;
  background: transparent;
  border: 0;
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.wp-text-btn:disabled { color: var(--fg-dim); cursor: not-allowed; }
.wp-hint { margin: 4px 0 0; font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); }
.wp-form { display: flex; flex-direction: column; }
.wp-label { font-size: 12px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; }
.wp-input {
  min-height: 36px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--fg);
  font: inherit;
  font-size: 13px;
}
.wp-input[aria-invalid='true'] { border-color: var(--danger); }
.wp-form .field-error { margin: 8px 0 0; }
.wp-form-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 8px; }
.wp-submit {
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--fg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.wp-submit:disabled { color: var(--fg-dim); cursor: not-allowed; }

.wp-close:focus-visible,
.wp-check:focus-visible,
.wp-retry:focus-visible,
.wp-text-btn:focus-visible,
.wp-submit:focus-visible,
.wp-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row { animation: none; }
}
</style>
