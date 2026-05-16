<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <h2>{{ t(lang, 'trades') }}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost" @click="exportCsv">{{ t(lang, 'export') }}</button>
        <button class="btn-accent" @click="$emit('order')">+ {{ t(lang, 'addTrade') }}</button>
      </div>
    </div>
    <div class="filters">
      <button
        v-for="c in chips"
        :key="c"
        type="button"
        :class="['chip', { active: activeFilter === c }]"
        @click="activeFilter = c"
      >{{ c }}</button>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="padding-left:16px">{{ t(lang, 'date') }}</th>
            <th>{{ t(lang, 'type') }}</th>
            <th>{{ t(lang, 'symbol') }}</th>
            <th style="text-align:right">{{ t(lang, 'qty') }}</th>
            <th style="text-align:right">{{ t(lang, 'price') }}</th>
            <th style="text-align:right">{{ t(lang, 'total') }}</th>
            <th style="text-align:right">{{ t(lang, 'fee') }}</th>
            <th style="padding-right:16px">{{ t(lang, 'notes') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(tr, i) in filteredTrades"
            :key="tr.d + tr.type + tr.sym + tr.qty + tr.px + tr.fee + tr.note"
            :class="{ fresh: i === 0 && portfolio.lastFill && tr.sym === portfolio.lastFill.sym }"
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
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { fmtNum } from '../data';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang, Trade } from '../types';

defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order'): void }>();
type TradeFilter = 'All' | 'Buy' | 'Sell' | 'Dividend' | '2026';
const portfolio = useMockPortfolioStore();
const chips: TradeFilter[] = ['All', 'Buy', 'Sell', 'Dividend', '2026'];
const activeFilter = ref<TradeFilter>('All');

const filteredTrades = computed(() => {
  switch (activeFilter.value) {
    case 'Buy':
      return portfolio.trades.filter(tr => tr.type === 'BUY');
    case 'Sell':
      return portfolio.trades.filter(tr => tr.type === 'SELL');
    case 'Dividend':
      return portfolio.trades.filter(tr => tr.type === 'DIV');
    case '2026':
      return portfolio.trades.filter(tr => tr.d.startsWith('2026'));
    default:
      return portfolio.trades;
  }
});

function exportCsv() {
  const header = ['date', 'type', 'symbol', 'qty', 'price', 'total', 'fee', 'note'];
  const rows = filteredTrades.value.map(tr => [
    tr.d,
    tr.type,
    tr.sym,
    tr.qty,
    tr.px,
    tr.qty * tr.px,
    tr.fee,
    tr.note,
  ]);
  const csv = [header, ...rows]
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

function csvCell(value: Trade[keyof Trade] | number | string) {
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
</style>
