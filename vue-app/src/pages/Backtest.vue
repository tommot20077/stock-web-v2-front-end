<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:14px">
      <div>
        <div class="title-line">
          <h2>{{ t(lang, 'backtest') }}</h2>
          <span class="preview-badge">{{ lang === 'zh' ? '模擬' : 'Simulated' }}</span>
        </div>
        <div class="sub">{{ lang === 'zh' ? '模擬策略回測：曲線、回報熱力圖、交易明細' : 'Simulated strategy backtest: equity curve, return heatmap, trade log' }}</div>
      </div>
    </div>

    <!-- Strategy config bar -->
    <div class="config card">
      <div class="cfg-grp">
        <span class="lab">{{ lang === 'zh' ? '策略' : 'Strategy' }}</span>
        <select v-model="strategy" class="inp">
          <option value="ma_cross">MA Cross (20/50)</option>
          <option value="rsi">RSI Mean Reversion</option>
          <option value="momentum">Momentum (3M)</option>
          <option value="dca">DCA Weekly</option>
          <option value="custom">⚡ Custom JS</option>
        </select>
      </div>
      <div class="cfg-grp">
        <span class="lab">{{ lang === 'zh' ? '標的' : 'Symbol' }}</span>
        <select v-model="sym" class="inp">
          <option v-for="s in ['AAPL', 'NVDA', 'MSFT', 'BTC', 'ETH', '2330.TW']" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="cfg-grp">
        <span class="lab">{{ lang === 'zh' ? '期間' : 'Period' }}</span>
        <select v-model="period" class="inp">
          <option value="1Y">1 Year</option>
          <option value="3Y">3 Years</option>
          <option value="5Y">5 Years</option>
        </select>
      </div>
      <div class="cfg-grp">
        <span class="lab">{{ lang === 'zh' ? '初始資金' : 'Initial' }}</span>
        <input type="number" v-model.number="initial" class="inp" style="width:120px" min="1" required />
      </div>
      <button class="btn-ghost" @click="showEditor = !showEditor" :class="{ active: showEditor }">
        <span class="caret">{{ showEditor ? '▾' : '▸' }}</span>
        {{ lang === 'zh' ? '客製化策略' : 'Customize' }}
        <span v-if="strategy === 'custom'" class="dot"></span>
      </button>
      <button class="btn-accent" @click="run">▶ {{ lang === 'zh' ? '執行回測' : 'Run' }}</button>
    </div>
    <div v-if="latestRun" class="run-note">
      <span class="dim">{{ lang === 'zh' ? '最新模擬回測' : 'Latest simulated run' }}</span>
      <strong>{{ latestRunLabel }}</strong>
      <span>{{ latestRun.symbol }}</span>
      <span>{{ latestRun.period }}</span>
    </div>
    <div v-if="runError" class="strategy-error">{{ runError }}</div>
    <div v-if="strategyError" class="strategy-error">
      {{ lang === 'zh' ? '策略編譯錯誤' : 'Strategy compile error' }}: {{ strategyError }}
    </div>

    <!-- Collapsible JS strategy editor -->
    <div v-if="showEditor" class="editor-wrap">
      <StrategyEditor @run="onRun" />
    </div>

    <!-- KPI strip -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kl">{{ lang === 'zh' ? '總報酬' : 'Total return' }}</div>
        <div class="kv num" :class="result.totalRet >= 0 ? 'up' : 'dn'">{{ result.totalRet >= 0 ? '+' : '' }}{{ result.totalRet.toFixed(1) }}%</div>
        <div class="ks dim">vs B&H {{ result.bhRet.toFixed(1) }}%</div>
      </div>
      <div class="kpi-card">
        <div class="kl">Sharpe</div>
        <div class="kv num">{{ result.sharpe.toFixed(2) }}</div>
        <div class="ks dim">{{ lang === 'zh' ? '年化' : 'Annualized' }} {{ result.cagr.toFixed(1) }}%</div>
      </div>
      <div class="kpi-card">
        <div class="kl">{{ lang === 'zh' ? '最大回撤' : 'Max DD' }}</div>
        <div class="kv num dn">-{{ result.maxDD.toFixed(1) }}%</div>
        <div class="ks dim">{{ result.ddDays }} {{ lang === 'zh' ? '天' : 'days' }}</div>
      </div>
      <div class="kpi-card">
        <div class="kl">{{ lang === 'zh' ? '勝率' : 'Win rate' }}</div>
        <div class="kv num">{{ result.winRate.toFixed(0) }}%</div>
        <div class="ks dim">{{ result.trades }} {{ lang === 'zh' ? '筆' : 'trades' }}</div>
      </div>
      <div class="kpi-card">
        <div class="kl">{{ lang === 'zh' ? '盈虧比' : 'Profit factor' }}</div>
        <div class="kv num">{{ result.pf.toFixed(2) }}</div>
        <div class="ks dim">{{ lang === 'zh' ? '平均交易' : 'Avg trade' }} {{ result.avgTrade >= 0 ? '+' : '' }}{{ result.avgTrade.toFixed(2) }}%</div>
      </div>
    </div>

    <!-- Equity curve -->
    <div class="card padlg" style="margin-top:14px">
      <div class="ttl">Equity curve · {{ activeRunConfig.strategy }} vs Buy &amp; Hold</div>
      <svg viewBox="0 0 1100 280" class="eq-svg">
        <line v-for="(g, i) in [0, 1, 2, 3, 4]" :key="i" :x1="40" :x2="1080" :y1="20 + g * 56" :y2="20 + g * 56" stroke="var(--border)" stroke-dasharray="2 3" />
        <polyline :points="bhPoints" fill="none" stroke="var(--fg-mute)" stroke-width="1.2" stroke-dasharray="3 3" />
        <polyline :points="stratPoints" fill="none" stroke="var(--accent)" stroke-width="2" />
        <text v-for="(g, i) in 5" :key="'g'+i" x="6" :y="24 + g * 56" font-size="10" fill="var(--fg-mute)" font-family="JetBrains Mono, monospace">${{ fmtK(activeRunConfig.initial * (2.4 - g * 0.4)) }}</text>
      </svg>
      <div class="legend">
        <span><i style="background:var(--accent)" /> {{ activeRunConfig.strategy }}</span>
        <span><i style="background:var(--fg-mute);border:1px dashed var(--fg-mute)" /> Buy &amp; Hold</span>
      </div>
    </div>

    <!-- Monthly heatmap + Drawdown -->
    <div class="grid2" style="margin-top:14px">
      <div class="card padlg">
        <div class="ttl">{{ lang === 'zh' ? '月度回報熱力圖' : 'Monthly returns' }}</div>
        <table class="heat">
          <thead>
            <tr>
              <th></th>
              <th v-for="m in months" :key="m">{{ m }}</th>
              <th class="right">YTD</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in heatmap" :key="row.year">
              <td class="yr">{{ row.year }}</td>
              <td v-for="(c, i) in row.cells" :key="i" class="cell" :style="{ background: heatColor(c) }">
                {{ c == null ? '' : (c >= 0 ? '+' : '') + c.toFixed(1) }}
              </td>
              <td class="right num" :class="row.ytd >= 0 ? 'up' : 'dn'" style="font-weight:600">
                {{ row.ytd >= 0 ? '+' : '' }}{{ row.ytd.toFixed(1) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card padlg">
        <div class="ttl">{{ lang === 'zh' ? '回撤曲線' : 'Drawdown' }}</div>
        <svg viewBox="0 0 540 200" class="dd-svg">
          <line v-for="i in 4" :key="i" x1="30" x2="530" :y1="20 + i * 38" :y2="20 + i * 38" stroke="var(--border)" stroke-dasharray="2 3" />
          <path :d="ddPath" fill="rgba(220,38,38,0.18)" stroke="var(--dn)" stroke-width="1.3" />
        </svg>
        <div class="dd-stats">
          <div><span class="ml">{{ lang === 'zh' ? '最大' : 'Max' }}</span><span class="num dn">-{{ result.maxDD.toFixed(1) }}%</span></div>
          <div><span class="ml">{{ lang === 'zh' ? '平均' : 'Avg' }}</span><span class="num dim">-{{ (result.maxDD / 3).toFixed(1) }}%</span></div>
          <div><span class="ml">{{ lang === 'zh' ? '回復' : 'Recovery' }}</span><span class="num">{{ Math.floor(result.ddDays / 1.4) }}d</span></div>
        </div>
      </div>
    </div>

    <!-- Trade log -->
    <div class="card" style="margin-top:14px">
      <div class="card-hd"><div class="ttl">{{ lang === 'zh' ? '交易明細' : 'Trade log' }}</div></div>
      <table class="tl">
        <thead>
          <tr><th>#</th><th>Date</th><th>Side</th><th class="right">Entry</th><th class="right">Exit</th><th class="right">Bars</th><th class="right">P&amp;L</th><th class="right">P&amp;L %</th></tr>
        </thead>
        <tbody>
          <tr v-for="(tr, i) in trades" :key="i">
            <td class="dim">{{ i + 1 }}</td>
            <td class="dim">{{ tr.date }}</td>
            <td><span :class="['pill', tr.side.toLowerCase()]">{{ tr.side }}</span></td>
            <td class="right num">{{ fmt(tr.entry) }}</td>
            <td class="right num">{{ fmt(tr.exit) }}</td>
            <td class="right num dim">{{ tr.bars }}</td>
            <td class="right num" :class="tr.pnl >= 0 ? 'up' : 'dn'">{{ tr.pnl >= 0 ? '+' : '' }}{{ tr.pnl.toFixed(0) }}</td>
            <td class="right num" :class="tr.pnlPct >= 0 ? 'up' : 'dn'">{{ tr.pnlPct >= 0 ? '+' : '' }}{{ tr.pnlPct.toFixed(2) }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '../i18n';
import StrategyEditor from '../components/StrategyEditor.vue';
import { createBacktestApi } from '../services/backtestApi';
import { getRuntimeDataMode } from '../services/runtimeDataMode';
import type { BacktestPeriod, BacktestRunDto, BacktestStrategyId } from '../services/apiTypes';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();
const backtestApi = createBacktestApi(getRuntimeDataMode());

const customSeed = ref(0);
const customStrategyCode = ref<string | null>(null);
const showEditor = ref(false);
const runNonce = ref(0);
const strategyError = ref('');
const runError = ref('');

const strategy = ref('ma_cross');
const sym = ref('AAPL');
const period = ref('3Y');
const initial = ref(100000);
const latestRun = ref<BacktestRunDto | null>(null);

interface ActiveRunConfig {
  strategy: string;
  sym: string;
  period: string;
  initial: number;
  runNonce: number;
  customSeed: number;
  seed: number;
  label: string;
}

const strategyLabels: Record<string, { zh: string; en: string }> = {
  ma_cross: { zh: 'MA 交叉 (20/50)', en: 'MA Cross (20/50)' },
  rsi: { zh: 'RSI 均值回歸', en: 'RSI Mean Reversion' },
  momentum: { zh: '動能 (3M)', en: 'Momentum (3M)' },
  dca: { zh: '每週定期投入', en: 'DCA Weekly' },
  custom: { zh: '客製化策略', en: 'Custom JS' },
};

function computeSeed(strategyId: string, symbol: string, runPeriod: string, nonce: number, custom: number) {
  return strategyId.charCodeAt(0) +
    symbol.charCodeAt(0) +
    runPeriod.charCodeAt(0) +
    nonce * 37 +
    custom;
}

function strategyLabel(strategyId: string) {
  return strategyLabels[strategyId]?.[props.lang] ?? strategyId;
}

const latestRunLabel = computed(() => latestRun.value ? strategyLabel(latestRun.value.strategyId) : '');

function makeRunConfig(strategyId: string, symbol: string, runPeriod: string, capital: number, nonce: number, custom: number): ActiveRunConfig {
  return {
    strategy: strategyId,
    sym: symbol,
    period: runPeriod,
    initial: capital,
    runNonce: nonce,
    customSeed: custom,
    seed: computeSeed(strategyId, symbol, runPeriod, nonce, custom),
    label: strategyLabel(strategyId),
  };
}

const activeRunConfig = ref<ActiveRunConfig>(
  makeRunConfig(strategy.value, sym.value, period.value, initial.value, runNonce.value, customSeed.value)
);

async function onRun(code: string) {
  // Sandbox: compile user's strategy fn and tag the run
  try {
    const fn = new Function('"use strict"; ' + code + '; return strategy;')();
    if (typeof fn !== 'function') throw new Error('strategy() not defined');
    strategyError.value = '';
    strategy.value = 'custom';
    customStrategyCode.value = code;
    customSeed.value = code.length + (code.charCodeAt(0) || 0);
    await run();
  } catch (e: any) {
    strategyError.value = e?.message || 'Invalid strategy';
  }
}

const result = computed(() => {
  const seed = activeRunConfig.value.seed;
  const totalRet = 30 + (seed * 7) % 60;
  const bhRet = totalRet * 0.6 + ((seed * 3) % 20);
  return {
    totalRet, bhRet,
    sharpe: 0.8 + ((seed * 5) % 18) / 10,
    cagr: totalRet / 3,
    maxDD: 8 + (seed * 11) % 18,
    ddDays: 30 + (seed * 13) % 90,
    winRate: 48 + (seed * 17) % 30,
    trades: 30 + (seed * 19) % 80,
    pf: 1.1 + ((seed * 7) % 22) / 10,
    avgTrade: 0.4 + ((seed * 11) % 30) / 10,
  };
});

async function run() {
  if (!Number.isFinite(initial.value) || initial.value <= 0) {
    runError.value = props.lang === 'zh' ? '初始資金必須大於 0' : 'Initial capital must be greater than 0';
    return;
  }

  const nextRunNonce = runNonce.value + 1;
  const nextConfig = makeRunConfig(strategy.value, sym.value, period.value, initial.value, nextRunNonce, customSeed.value);
  runError.value = '';
  strategyError.value = '';
  try {
    latestRun.value = await backtestApi.createRun({
      strategyId: nextConfig.strategy as BacktestStrategyId,
      strategyCode: nextConfig.strategy === 'custom' ? customStrategyCode.value : null,
      symbol: nextConfig.sym,
      period: nextConfig.period as BacktestPeriod,
      initialCapital: nextConfig.initial,
      currency: 'USD',
      benchmark: 'buy_hold',
      dataMode: 'cached',
    });
    runNonce.value = nextRunNonce;
    activeRunConfig.value = nextConfig;
  } catch (error: any) {
    runError.value = error?.message || (props.lang === 'zh' ? '回測執行失敗' : 'Backtest run failed');
  }
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const heatmap = computed(() => {
  const seed = activeRunConfig.value.seed;
  const years = activeRunConfig.value.period === '1Y' ? [2025] : activeRunConfig.value.period === '3Y' ? [2023, 2024, 2025, 2026] : [2021, 2022, 2023, 2024, 2025, 2026];
  return years.map(y => {
    const cells: (number | null)[] = months.map((_, m) => {
      if (y === 2026 && m > 4) return null;
      return Math.sin(y * 0.7 + m * 1.3 + seed) * 6 + Math.cos(m * 0.4 + seed) * 3;
    });
    const ytd = cells.filter(c => c != null).reduce((s: number, c) => s + (c as number), 0);
    return { year: y, cells, ytd };
  });
});

function heatColor(c: number | null) {
  if (c == null) return 'transparent';
  const a = Math.min(Math.abs(c) / 8, 1);
  return c >= 0
    ? `rgba(22, 163, 74, ${0.15 + a * 0.5})`
    : `rgba(220, 38, 38, ${0.15 + a * 0.5})`;
}

const stratPoints = computed(() => {
  const seed = activeRunConfig.value.seed;
  const out: string[] = [];
  for (let i = 0; i < 100; i++) {
    const v = 220 - (i / 100) * 130 - Math.sin(i * 0.2 + seed) * 14 - Math.cos(i * 0.07) * 8;
    out.push(`${40 + i * 10.4},${v}`);
  }
  return out.join(' ');
});

const bhPoints = computed(() => {
  const seed = activeRunConfig.value.sym.charCodeAt(0);
  const out: string[] = [];
  for (let i = 0; i < 100; i++) {
    const v = 220 - (i / 100) * 90 - Math.sin(i * 0.18 + seed) * 16;
    out.push(`${40 + i * 10.4},${v}`);
  }
  return out.join(' ');
});

const ddPath = computed(() => {
  const seed = activeRunConfig.value.seed;
  const pts: string[] = [`M 30,20`];
  for (let i = 0; i < 100; i++) {
    const v = 20 + Math.abs(Math.sin(i * 0.13 + seed) * 80 + Math.sin(i * 0.04) * 40);
    pts.push(`L ${30 + i * 5},${Math.min(v, 180)}`);
  }
  pts.push(`L 530,20 Z`);
  return pts.join(' ');
});

const trades = computed(() => {
  const seed = activeRunConfig.value.seed;
  const out: any[] = [];
  for (let i = 0; i < 12; i++) {
    const r = Math.sin(i * 1.7 + seed);
    const entry = 100 + Math.sin(i + seed) * 30;
    const pnlPct = r * 5 + Math.cos(i * 0.5) * 2;
    const exit = entry * (1 + pnlPct / 100);
    out.push({
      date: `2025-${String(((i * 2) % 12) + 1).padStart(2, '0')}-${String((i * 7) % 28 + 1).padStart(2, '0')}`,
      side: r > 0 ? 'BUY' : 'SELL',
      entry, exit,
      bars: 4 + Math.floor(Math.abs(r) * 30),
      pnl: (exit - entry) * 100,
      pnlPct,
    });
  }
  return out;
});

function fmt(n: number) { return n.toFixed(2); }
function fmtK(n: number) { return n >= 1000 ? (n / 1000).toFixed(0) + 'K' : n.toFixed(0); }
</script>

<style scoped>
.page { padding: 22px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.title-line { display: flex; align-items: center; gap: 8px; }
.preview-badge {
  display: inline-flex; align-items: center; height: 20px;
  border: 1px solid color-mix(in oklch, var(--accent) 45%, var(--border));
  border-radius: 999px; padding: 0 8px; font-size: 10px; font-weight: 700;
  color: var(--accent); background: color-mix(in oklch, var(--accent) 10%, transparent);
  letter-spacing: .4px;
}
.ttl { font-size: 13px; font-weight: 600; }

.config { display: flex; gap: 14px; padding: 14px 16px; align-items: center; flex-wrap: wrap; }
.cfg-grp { display: flex; flex-direction: column; gap: 4px; }
.lab { font-size: 10px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: .4px; }
.inp { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px; color: var(--fg); font-family: inherit; }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-end; }
.btn-ghost {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px dashed var(--border);
  color: var(--fg-dim); padding: 7px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 500; cursor: pointer; align-self: flex-end;
  font-family: inherit; transition: all .15s;
}
.btn-ghost:hover { color: var(--fg); border-color: var(--fg-mute); border-style: solid; }
.btn-ghost.active { color: var(--accent); border-color: var(--accent); border-style: solid; background: color-mix(in oklch, var(--accent) 8%, transparent); }
.btn-ghost .caret { font-size: 10px; opacity: .7; }
.btn-ghost .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-left: 2px; }
.editor-wrap { margin-top: 12px; animation: slideDown .2s ease-out; }
.run-note {
  display: flex; align-items: center; gap: 10px; margin-top: 8px;
  font-size: 12px; color: var(--fg-dim);
}
.run-note strong { color: var(--fg); font-weight: 600; }
.strategy-error {
  margin-top: 8px; border: 1px solid rgba(220,38,38,0.35);
  background: rgba(220,38,38,0.1); color: var(--dn);
  border-radius: 8px; padding: 9px 11px; font-size: 12px;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 14px; }
.kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.kl { font-size: 11px; color: var(--fg-dim); }
.kv { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin-top: 4px; }
.ks { font-size: 11px; margin-top: 2px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.padlg { padding: 16px 18px; }
.card-hd { padding: 12px 16px; border-bottom: 1px solid var(--border); }

.eq-svg { width: 100%; height: 280px; display: block; margin-top: 8px; }
.legend { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; color: var(--fg-dim); }
.legend i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }

.grid2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; }

.heat { width: 100%; font-size: 11px; margin-top: 10px; border-collapse: separate; border-spacing: 2px; }
.heat th { font-weight: 500; color: var(--fg-mute); font-size: 10px; padding: 4px 0; }
.heat .yr { font-weight: 600; color: var(--fg-dim); padding-right: 6px; font-size: 11px; }
.heat .cell { text-align: center; padding: 6px 0; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--fg); }
.right { text-align: right; }

.dd-svg { width: 100%; height: 200px; display: block; margin-top: 8px; }
.dd-stats { display: flex; gap: 18px; margin-top: 10px; font-size: 12px; }
.dd-stats > div { display: flex; flex-direction: column; gap: 2px; }
.ml { font-size: 10px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: .4px; }

.tl { width: 100%; font-size: 12px; }
.tl thead th { padding: 10px 14px; font-weight: 500; color: var(--fg-dim); font-size: 11px; border-bottom: 1px solid var(--border); text-align: left; }
.tl tbody td { padding: 8px 14px; border-bottom: 1px solid var(--border); }
.tl tbody tr:last-child td { border-bottom: 0; }
.pill { padding: 2px 8px; font-size: 10px; font-weight: 600; border-radius: 4px; letter-spacing: .3px; }
.pill.buy { background: rgba(22,163,74,0.12); color: var(--up); }
.pill.sell { background: rgba(220,38,38,0.12); color: var(--dn); }

.num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.up { color: var(--up); }
.dn { color: var(--dn); }
.dim { color: var(--fg-dim); }
</style>
