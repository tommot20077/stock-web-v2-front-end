<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <div>
        <h2>{{ t(lang, 'watchlist') }}</h2>
        <div class="sub">{{ lang === 'zh' ? '自訂多個清單、拖拉排序、即時行情更新' : 'Custom lists, drag to reorder, live quotes' }}</div>
      </div>
      <button class="btn-accent" @click="newList">+ {{ lang === 'zh' ? '新增清單' : 'New list' }}</button>
    </div>

    <!-- List tabs -->
    <div class="tabs">
      <button v-for="(l, i) in lists" :key="l.id"
              :class="['tab', { on: activeIdx === i }]"
              @click="activeIdx = i">
        {{ l.name }} <span class="count">{{ l.syms.length }}</span>
      </button>
      <button class="tab-add" @click="newList">+</button>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th>{{ t(lang, 'symbol') }}</th>
            <th>{{ t(lang, 'name') }}</th>
            <th class="right">{{ lang === 'zh' ? '價格/殖利率' : 'Price/Yield' }}</th>
            <th class="right">{{ t(lang, 'change') }}</th>
            <th class="right">{{ t(lang, 'volume') }}</th>
            <th class="right">{{ lang === 'zh' ? '走勢' : 'Trend' }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in activeRows" :key="s.sym"
              draggable="true"
              @dragstart="onDragStart(i)"
              @dragend="clearDrag"
              @dragover.prevent
              @drop="onDrop(i)"
              @click="$emit('chart', { sym: s.sym })">
            <td class="grip">⋮⋮</td>
            <td class="sym">{{ s.sym }}</td>
            <td class="dim">{{ s.name }}</td>
            <td class="right num">{{ priceText(s) }}</td>
            <td class="right num" :class="changeValue(s) >= 0 ? 'up' : 'dn'">
              {{ changeText(s) }}
            </td>
            <td class="right num dim">{{ volumeText(s) }}</td>
            <td class="right">
              <svg width="60" height="20" viewBox="0 0 60 20">
                <polyline :points="sparkPoints(s.sym)" fill="none"
                          :stroke="changeValue(s) >= 0 ? 'var(--up)' : 'var(--dn)'" stroke-width="1.4" />
              </svg>
            </td>
            <td class="right">
              <button class="x" @click.stop="remove(s.sym)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="activeRows.length === 0" class="empty">
        {{ lang === 'zh' ? '清單是空的 — 從行情頁加入標的' : 'Empty list — add symbols from Markets' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, FX, BONDS } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang } from '../types';

defineProps<{ lang: Lang }>();
defineEmits<{ chart: [p: { sym: string }] }>();

const portfolio = useMockPortfolioStore();
const lists = computed(() => portfolio.watchlists);
const activeIdx = ref(0);
const dragIdx = ref(-1);
const dragListId = ref('');

const ALL = computed(() => [...SYMBOLS, ...CRYPTO, ...FX, ...BONDS]);
const activeList = computed(() => portfolio.watchlists[activeIdx.value]);
const activeRows = computed(() => (activeList.value?.syms ?? [])
  .map(s => ALL.value.find(x => x.sym === s))
  .filter(Boolean) as any[]);

watchEffect(() => {
  if (activeIdx.value < 0) activeIdx.value = 0;
  if (activeIdx.value >= portfolio.watchlists.length) {
    activeIdx.value = Math.max(0, portfolio.watchlists.length - 1);
  }
});

function newList() {
  portfolio.addWatchlist('New list');
  activeIdx.value = portfolio.watchlists.length - 1;
}
function remove(sym: string) {
  if (activeList.value) portfolio.removeFromWatchlist(activeList.value.id, sym);
}
function onDragStart(idx: number) {
  dragIdx.value = idx;
  dragListId.value = activeList.value?.id ?? '';
}
function clearDrag() {
  dragIdx.value = -1;
  dragListId.value = '';
}
function onDrop(toIdx: number) {
  const list = activeList.value;
  const fromIdx = dragIdx.value;
  if (
    list &&
    dragListId.value === list.id &&
    fromIdx >= 0 &&
    toIdx >= 0 &&
    fromIdx < list.syms.length &&
    toIdx < list.syms.length &&
    fromIdx !== toIdx
  ) {
    portfolio.moveWatchSymbol(list.id, fromIdx, toIdx);
  }
  clearDrag();
}

function sparkPoints(sym: string) {
  const seed = sym.charCodeAt(0) + sym.charCodeAt(1);
  const pts: string[] = [];
  for (let i = 0; i < 20; i++) {
    const v = 10 + Math.sin(i * 0.5 + seed) * 6 + Math.cos(i * 0.3 + seed) * 3;
    pts.push(`${i * 3},${20 - v}`);
  }
  return pts.join(' ');
}
function isBondRow(row: any) {
  return row.cat === 'bond';
}
function priceValue(row: any) {
  return row.price ?? row.yld;
}
function priceText(row: any) {
  const dp = row.cat === 'fx' ? 4 : isBondRow(row) ? 3 : 2;
  const value = priceValue(row);
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(dp);
}
function changeValue(row: any) {
  return row.chgPct ?? row.chg ?? 0;
}
function changeText(row: any) {
  const value = changeValue(row);
  if (isBondRow(row)) return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
function volumeText(row: any) {
  return row.vol ?? '—';
}
</script>

<style scoped>
.page { padding: 22px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }

.tabs { display: flex; gap: 6px; margin-bottom: 14px; align-items: center; }
.tab { padding: 7px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; color: var(--fg-dim); cursor: pointer; font-weight: 500; }
.tab.on { background: var(--surface2); color: var(--fg); border-color: var(--fg-mute); font-weight: 600; }
.tab .count { font-size: 10px; color: var(--fg-mute); margin-left: 4px; }
.tab-add { padding: 7px 12px; background: transparent; border: 1px dashed var(--border); border-radius: 8px; color: var(--fg-mute); cursor: pointer; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
table { width: 100%; }
thead th { text-align: left; padding: 10px 14px; font-size: 11px; color: var(--fg-dim); font-weight: 500; border-bottom: 1px solid var(--border); }
.right { text-align: right; }
tbody tr { border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
tbody tr:hover { background: var(--surface2); }
tbody td { padding: 10px 14px; font-size: 13px; }
.grip { color: var(--fg-mute); cursor: grab; font-size: 10px; }
.sym { font-weight: 600; }
.dim { color: var(--fg-dim); }
.num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.up { color: var(--up); }
.dn { color: var(--dn); }
.x { background: transparent; border: 0; color: var(--fg-mute); font-size: 12px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.x:hover { background: var(--surface2); color: var(--dn); }
.empty { padding: 40px; text-align: center; color: var(--fg-mute); font-size: 13px; }
</style>
