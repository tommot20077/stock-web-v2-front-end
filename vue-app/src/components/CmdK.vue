<template>
  <Teleport to="body">
    <div v-if="open" class="cmdk-mask" @click="$emit('close')">
      <div class="cmdk-modal" @click.stop>
        <div class="cmdk-input-row">
          <span style="opacity:0.5">⌘</span>
          <input
            ref="inputEl"
            v-model="q"
            :placeholder="t(lang, 'cmdkPlaceholder')"
            class="cmdk-input"
            @keydown="onInputKey"
          />
          <kbd class="cmdk-kbd">ESC</kbd>
        </div>
        <div ref="listEl" class="cmdk-list">
          <div v-if="pages.length" class="grp">
            <div class="grp-title">{{ t(lang, 'cmdkPages') }}</div>
            <button
              v-for="it in pages" :key="'p-' + it.id"
              :ref="(el) => registerRow('p-' + it.id, el)"
              class="grp-row" :class="{ active: activeId === 'p-' + it.id }"
              @click="onPick(it)" @mousemove="activeId = 'p-' + it.id"
            >
              <span class="grp-icon">→</span>
              <span class="grp-label">{{ it.label }}</span>
              <span v-if="it.shortcut" class="grp-shortcut">
                <kbd v-for="(k, i) in it.shortcut.split(' ')" :key="i">{{ k }}</kbd>
              </span>
            </button>
          </div>
          <div v-if="assets.length" class="grp">
            <div class="grp-title">{{ t(lang, 'cmdkAssets') }}</div>
            <button
              v-for="it in assets" :key="'a-' + it.id"
              :ref="(el) => registerRow('a-' + it.id, el)"
              class="grp-row" :class="{ active: activeId === 'a-' + it.id }"
              @click="onPick(it)" @mousemove="activeId = 'a-' + it.id"
            >
              <span class="grp-icon">$</span>
              <span class="grp-label">{{ it.label }}</span>
              <span v-if="it.sub" class="grp-sub">{{ it.sub }}</span>
            </button>
          </div>
          <div v-if="actions.length" class="grp">
            <div class="grp-title">{{ t(lang, 'cmdkActions') }}</div>
            <button
              v-for="it in actions" :key="'x-' + it.id"
              :ref="(el) => registerRow('x-' + it.id, el)"
              class="grp-row" :class="{ active: activeId === 'x-' + it.id }"
              @click="onPick(it)" @mousemove="activeId = 'x-' + it.id"
            >
              <span class="grp-icon">⚡</span>
              <span class="grp-label">{{ it.label }}</span>
              <span v-if="it.shortcut" class="grp-shortcut">
                <kbd v-for="(k, i) in it.shortcut.split(' ')" :key="i">{{ k }}</kbd>
              </span>
            </button>
          </div>
          <div v-if="!flat.length" class="cmdk-empty">No matches</div>
        </div>
        <div class="cmdk-foot">
          <span class="ft-hint"><kbd>↑</kbd><kbd>↓</kbd> {{ lang === 'zh' ? '選擇' : 'select' }}</span>
          <span class="ft-hint"><kbd>↵</kbd> {{ lang === 'zh' ? '執行' : 'go' }}</span>
          <span class="ft-hint"><kbd>?</kbd> {{ lang === 'zh' ? '快速鍵' : 'shortcuts' }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO } from '../data';
import type { Lang, Page } from '../types';

const props = defineProps<{ open: boolean; lang: Lang }>();
const emit = defineEmits<{ close: []; navigate: [page: Page]; openHelp: [] }>();

const q = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const rowEls: Record<string, HTMLElement> = {};
const activeId = ref<string>('');

function registerRow(id: string, el: any) {
  if (el) rowEls[id] = el as HTMLElement;
  else delete rowEls[id];
}

watch(() => props.open, (v) => {
  if (v) {
    q.value = '';
    nextTick(() => inputEl.value?.focus());
  }
});

interface Item {
  id: string; label: string; sub?: string;
  shortcut?: string;
  action: () => void;
  closeBeforeAction?: boolean;
}

function pageLabel(page: Page) {
  if (page === 'chart') return props.lang === 'zh' ? '走勢圖' : 'Chart';
  return t(props.lang, page);
}

const pages = computed<Item[]>(() => {
  const map: Array<[Page, string]> = [
    ['overview', 'g o'], ['markets', 'g m'], ['chart', 'g c'], ['positions', 'g p'],
    ['analytics', 'g a'], ['trades', 'g t'], ['watchlist', 'g w'],
    ['backtest', 'g b'], ['alerts', 'g l'], ['notifications', 'g n'],
    ['settings', 'g s'], ['ops', 'g x'],
  ];
  const all: Item[] = map.map(([p, sc]) => ({
    id: p, label: pageLabel(p), shortcut: sc,
    action: () => emit('navigate', p),
  }));
  return filter(all);
});

const assets = computed<Item[]>(() => {
  const all: Item[] = [...SYMBOLS, ...CRYPTO].map(s => ({
    id: s.sym, label: s.sym, sub: s.name, action: () => emit('navigate', 'markets'),
  }));
  return filter(all);
});

const actions = computed<Item[]>(() => {
  const all: Item[] = [
    { id: 'addTrade', label: t(props.lang, 'addTrade'), shortcut: 'n', action: () => emit('navigate', 'trades') },
    { id: 'help', label: props.lang === 'zh' ? '鍵盤快速鍵' : 'Keyboard shortcuts', shortcut: '?', action: () => emit('openHelp'), closeBeforeAction: true },
    { id: 'recalcRoi', label: t(props.lang, 'recalcRoi'), action: () => emit('navigate', 'ops') },
  ];
  return filter(all);
});

const flat = computed(() => [
  ...pages.value.map(i => ({ ...i, _key: 'p-' + i.id })),
  ...assets.value.map(i => ({ ...i, _key: 'a-' + i.id })),
  ...actions.value.map(i => ({ ...i, _key: 'x-' + i.id })),
]);

watch(() => props.open, (v) => {
  if (v) activeId.value = flat.value[0]?._key ?? '';
});

watch(flat, (list) => {
  if (!list.find(i => i._key === activeId.value)) {
    activeId.value = list[0]?._key ?? '';
  }
}, { immediate: true });

function filter(items: Item[]) {
  const s = q.value.trim().toLowerCase();
  if (!s) return items;
  return items.filter(i => (
    i.id + ' ' + i.label + ' ' + (i.sub || '') + ' ' + (i.shortcut || '')
  ).toLowerCase().includes(s));
}

function runAfterClose(action: () => void) {
  emit('close');
  nextTick(action);
}

function openHelpAfterClose() {
  runAfterClose(() => emit('openHelp'));
}

function onPick(item: Item) {
  if (item.closeBeforeAction) {
    runAfterClose(item.action);
    return;
  }
  item.action();
  emit('close');
}

function onInputKey(e: KeyboardEvent) {
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    openHelpAfterClose();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const list = flat.value;
    if (!list.length) return;
    const idx = list.findIndex(i => i._key === activeId.value);
    const next = e.key === 'ArrowDown'
      ? (idx + 1) % list.length
      : (idx - 1 + list.length) % list.length;
    activeId.value = list[next]._key;
    nextTick(() => {
      const el = rowEls[activeId.value];
      if (el && listEl.value) {
        const lr = listEl.value.getBoundingClientRect();
        const rr = el.getBoundingClientRect();
        if (rr.bottom > lr.bottom) listEl.value.scrollTop += rr.bottom - lr.bottom + 8;
        else if (rr.top < lr.top) listEl.value.scrollTop -= lr.top - rr.top + 8;
      }
    });
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = flat.value.find(i => i._key === activeId.value);
    if (item) onPick(item);
  }
}
</script>

<style scoped>
.cmdk-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh; z-index: 1000;
}
.cmdk-modal {
  width: 600px; max-width: 90vw;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.25);
  overflow: hidden; display: flex; flex-direction: column;
}
.cmdk-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.cmdk-input {
  flex: 1; background: transparent; border: 0; outline: none;
  font-size: 14px; color: var(--fg);
}
.cmdk-kbd {
  font-size: 10px; padding: 2px 6px;
  border: 1px solid var(--border); border-radius: 4px;
  color: var(--fg-dim);
}
.cmdk-list { max-height: 50vh; overflow: auto; padding: 6px; }
.cmdk-empty { padding: 24px; text-align: center; color: var(--fg-dim); font-size: 12px; }
.grp { padding: 4px 0; }
.grp-title {
  padding: 6px 12px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--fg-mute); font-weight: 600;
}
.grp-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 12px; background: transparent; border: 0;
  border-radius: 6px; cursor: pointer; text-align: left;
  font-size: 13px; color: var(--fg);
}
.grp-row.active { background: var(--surface2); }
.grp-row.active .grp-icon { color: var(--accent); }
.grp-icon { width: 20px; color: var(--fg-mute); font-size: 12px; }
.grp-label { flex: 1; font-weight: 500; }
.grp-sub { color: var(--fg-dim); font-size: 11px; }
.grp-shortcut { display: flex; gap: 3px; }
.grp-shortcut kbd {
  display: inline-block; min-width: 18px; padding: 2px 5px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 4px; font-family: ui-monospace, monospace;
  font-size: 10px; color: var(--fg-dim);
}
.cmdk-foot {
  display: flex; align-items: center; gap: 18px;
  padding: 8px 14px; border-top: 1px solid var(--border);
  background: var(--surface2); font-size: 11px; color: var(--fg-dim);
}
.ft-hint { display: inline-flex; align-items: center; gap: 4px; }
.ft-hint kbd {
  display: inline-block; min-width: 16px; padding: 1px 4px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 3px; font-family: ui-monospace, monospace;
  font-size: 10px; color: var(--fg);
}
</style>
