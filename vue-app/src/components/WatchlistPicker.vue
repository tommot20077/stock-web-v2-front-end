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
        <template v-if="lists">
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
                :disabled="isSaving(list.id)"
                @change="toggle(list, $event)"
              />
              <span class="wp-name">{{ list.name }}</span>
              <span
                v-if="isSaving(list.id)"
                class="wp-meta"
                role="status"
                data-testid="watchlist-picker-option-saving"
              >{{ t(lang, 'settingSaving') }}</span>
              <span v-else class="wp-meta">{{ tf(lang, 'watchlistCount', { n: list.items.length }) }}</span>
            </label>
          </div>
        </template>
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
// 清單狀態由頁面持有(lists prop);勾選即時寫入、**不做樂觀更新**——寫入回應的 WatchlistDto 以
// `changed` 交回頁面,勾選與檔數只跟著 prop 變。寫入只經 getRuntimeApiClients().watchlist(鐵律 1 / 3)。
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { t, tf } from '../i18n';
import type { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { WatchlistDto } from '../services/watchlistApi';
import type { Lang } from '../types';

const props = defineProps<{
  open: boolean;
  lang: Lang;
  symbol: string;
  anchor: HTMLElement | null;
  lists: WatchlistDto[] | null;
  loading: boolean;
  loadError: ApiClientError | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changed', list: WatchlistDto): void;
  (e: 'created', list: WatchlistDto): void;
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

const positionStyle = computed(() => (position.value
  ? { '--wp-top': `${position.value.top}px`, '--wp-left': `${position.value.left}px` }
  : {}));

function contains(list: WatchlistDto): boolean {
  return list.items.some(item => item.symbol === props.symbol);
}

function isSaving(listId: string): boolean {
  return saving[listId] === true;
}

async function toggle(list: WatchlistDto, event: Event) {
  const input = event.target as HTMLInputElement;
  const wasChecked = contains(list);
  // 不樂觀:瀏覽器已自行翻轉 checkbox,先翻回 prop 狀態,等回應 DTO 再由 prop 驅動。
  input.checked = wasChecked;
  if (isSaving(list.id)) return;

  const watchlist = getRuntimeApiClients().watchlist;
  saving[list.id] = true;
  try {
    let updated: WatchlistDto;
    if (wasChecked) {
      // 移除以回應 DTO 中該代號的 asset uuid 指定(路徑只放 UUID,T-04.2-39)。
      const assetId = list.items.find(item => item.symbol === props.symbol)?.uuid;
      if (!assetId) return;
      updated = await watchlist.removeItem(list.id, assetId);
    } else {
      updated = await watchlist.addItem(list.id, props.symbol);
    }
    emit('changed', updated);
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
  if (restoreFocus) props.anchor?.focus();
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
      return;
    }
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

.wp-close:focus-visible,
.wp-check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
