<template>
  <div class="page">
    <!-- Header -->
    <div class="ah">
      <div>
        <h2 style="margin:0">{{ t(lang, 'analytics') }}</h2>
        <div class="sub">{{ t(lang, 'analyticsIntro') }}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button v-for="tb in tabs" :key="tb.k"
              :class="['tab', { on: tab === tb.k }]"
              @click="tab = tb.k">
        <span class="tab-icon" v-html="tb.icon" />
        <span>{{ t(lang, tb.k) }}</span>
      </button>
    </div>

    <!-- 1) Risk composition + What-if -->
    <section v-if="tab === 'riskComp'" class="grid">
      <div class="card span-12 padlg">
        <div class="row-between" style="margin-bottom:6px">
          <div>
            <div class="ttl">{{ t(lang, 'whatIfTitle') }}</div>
            <div class="hint">{{ t(lang, 'whatIfDesc') }}</div>
          </div>
          <div class="seg">
            <button :class="{on: !dirty}" disabled v-if="!dirty">—</button>
            <button v-if="dirty" @click="resetWeights">{{ t(lang, 'reset') }}</button>
          </div>
        </div>
      </div>

      <!-- Treemap -->
      <div class="card span-8 padlg">
        <div class="ttl" style="margin-bottom:14px">Treemap · {{ t(lang, 'currentWeight') }} → {{ t(lang, 'targetWeight') }}</div>
        <div class="treemap" :style="{ height: '420px' }">
          <div v-for="(t_, i) in treemap" :key="t_.sym"
               class="tile"
               :class="{ active: hoverIdx === i }"
               :style="{
                 left: t_.x + '%', top: t_.y + '%',
                 width: t_.w + '%', height: t_.h + '%',
                 background: t_.color
               }"
               @mouseenter="hoverIdx = i"
               @mouseleave="hoverIdx = -1">
            <div class="tile-inner" v-if="t_.w > 12 && t_.h > 18">
              <div class="tile-sym">{{ t_.sym }}</div>
              <div class="tile-pct" :class="t_.delta > 0 ? 'up' : t_.delta < 0 ? 'dn' : ''">
                {{ t_.weight.toFixed(1) }}%
                <span v-if="Math.abs(t_.delta) > 0.1" class="delta-pill">
                  {{ t_.delta > 0 ? '+' : '' }}{{ t_.delta.toFixed(1) }}
                </span>
              </div>
              <div class="tile-meta" v-if="t_.h > 24">{{ t_.sector }}</div>
            </div>
          </div>
        </div>
        <div class="legend">
          <span><i style="background:var(--accent)" />Tech</span>
          <span><i style="background:#a78bfa" />Crypto</span>
          <span><i style="background:#f59e0b" />Auto</span>
          <span><i style="background:#10b981" />Retail</span>
          <span style="margin-left:auto;color:var(--fg-mute);font-size:11px">面積 = 部位市值 · 邊框深淺 = 變動量</span>
        </div>
      </div>

      <!-- What-if sliders + risk metrics -->
      <div class="card span-4 padlg">
        <div class="ttl" style="margin-bottom:14px">{{ t(lang, 'targetWeight') }}</div>
        <div class="sliders">
          <div v-for="(p, i) in weights" :key="p.sym" class="slider-row">
            <div class="row-between" style="margin-bottom:4px">
              <span class="sym mono">{{ p.sym }}</span>
              <span class="num" :class="p.target !== p.current ? 'edited' : ''">
                {{ p.target.toFixed(1) }}%
                <span v-if="p.target !== p.current" class="delta">
                  ({{ p.target > p.current ? '+' : '' }}{{ (p.target - p.current).toFixed(1) }})
                </span>
              </span>
            </div>
            <input type="range" min="0" max="60" step="0.5"
                   v-model.number="p.target"
                   :style="{ '--accent-pct': (p.target / 60 * 100) + '%' }" />
          </div>
        </div>

        <div class="metrics">
          <div class="metric">
            <span class="ml">{{ t(lang, 'var95') }}</span>
            <span class="mv">
              <span class="num">{{ riskMetrics.var.toFixed(2) }}%</span>
              <span v-if="dirty" class="metric-delta" :class="riskMetrics.var < baselineRisk.var ? 'good' : 'bad'">
                {{ riskMetrics.var > baselineRisk.var ? '↑' : '↓' }}
                {{ Math.abs(riskMetrics.var - baselineRisk.var).toFixed(2) }}
              </span>
            </span>
          </div>
          <div class="metric">
            <span class="ml">{{ t(lang, 'volatility') }}</span>
            <span class="mv">
              <span class="num">{{ riskMetrics.vol.toFixed(2) }}%</span>
              <span v-if="dirty" class="metric-delta" :class="riskMetrics.vol < baselineRisk.vol ? 'good' : 'bad'">
                {{ riskMetrics.vol > baselineRisk.vol ? '↑' : '↓' }}
                {{ Math.abs(riskMetrics.vol - baselineRisk.vol).toFixed(2) }}
              </span>
            </span>
          </div>
          <div class="metric">
            <span class="ml">{{ t(lang, 'sharpe') }}</span>
            <span class="mv">
              <span class="num">{{ riskMetrics.sharpe.toFixed(2) }}</span>
              <span v-if="dirty" class="metric-delta" :class="riskMetrics.sharpe > baselineRisk.sharpe ? 'good' : 'bad'">
                {{ riskMetrics.sharpe > baselineRisk.sharpe ? '↑' : '↓' }}
                {{ Math.abs(riskMetrics.sharpe - baselineRisk.sharpe).toFixed(2) }}
              </span>
            </span>
          </div>
          <div class="metric">
            <span class="ml">{{ t(lang, 'maxDd') }}</span>
            <span class="mv">
              <span class="num">{{ riskMetrics.dd.toFixed(2) }}%</span>
              <span v-if="dirty" class="metric-delta" :class="Math.abs(riskMetrics.dd) < Math.abs(baselineRisk.dd) ? 'good' : 'bad'">
                {{ Math.abs(riskMetrics.dd) > Math.abs(baselineRisk.dd) ? '↑' : '↓' }}
                {{ Math.abs(Math.abs(riskMetrics.dd) - Math.abs(baselineRisk.dd)).toFixed(2) }}
              </span>
            </span>
          </div>
          <div class="metric">
            <span class="ml">{{ t(lang, 'beta') }}</span>
            <span class="mv">
              <span class="num">{{ riskMetrics.beta.toFixed(2) }}</span>
              <span v-if="dirty" class="metric-delta" :class="Math.abs(riskMetrics.beta - 1) < Math.abs(baselineRisk.beta - 1) ? 'good' : 'bad'">
                {{ riskMetrics.beta > baselineRisk.beta ? '↑' : '↓' }}
                {{ Math.abs(riskMetrics.beta - baselineRisk.beta).toFixed(2) }}
              </span>
            </span>
          </div>
        </div>

        <button class="apply-btn" :disabled="!dirty" @click="apply">
          {{ t(lang, 'applyChanges') }}
        </button>
      </div>
    </section>

    <!-- 2) Correlation network -->
    <section v-if="tab === 'correlation'" class="grid">
      <div class="card span-12 padlg">
        <div class="row-between" style="margin-bottom:8px">
          <div>
            <div class="ttl">{{ t(lang, 'correlation') }} · {{ t(lang, 'forceLayout') }}</div>
            <div class="hint">{{ t(lang, 'correlationDesc') }}</div>
          </div>
          <div class="row" style="gap:6px;align-items:center">
            <span style="font-size:11px;color:var(--fg-mute)">{{ t(lang, 'clusterBy') }}:</span>
            <div class="seg">
              <button :class="{on: cluster === 'sector'}" @click="cluster = 'sector'">{{ t(lang, 'bySector') }}</button>
              <button :class="{on: cluster === 'corr'}" @click="cluster = 'corr'">{{ t(lang, 'byCorrelation') }}</button>
              <button :class="{on: cluster === 'cat'}" @click="cluster = 'cat'">{{ t(lang, 'byCat') }}</button>
            </div>
          </div>
        </div>

        <div class="network-wrap">
          <svg viewBox="0 0 800 460" class="network">
            <!-- edges -->
            <line v-for="(e, i) in edges" :key="'e'+i"
                  :x1="nodes[e.a].x" :y1="nodes[e.a].y"
                  :x2="nodes[e.b].x" :y2="nodes[e.b].y"
                  :stroke="edgeColor(e.c)"
                  :stroke-width="Math.abs(e.c) * 4"
                  :stroke-opacity="hoverNode === -1 || hoverNode === e.a || hoverNode === e.b ? 0.6 : 0.08"
                  stroke-linecap="round" />
            <!-- nodes -->
            <g v-for="(n, i) in nodes" :key="n.sym"
               :class="{ dim: hoverNode !== -1 && hoverNode !== i && !connected(i) }"
               @mouseenter="hoverNode = i"
               @mouseleave="hoverNode = -1">
              <circle :cx="n.x" :cy="n.y" :r="n.r"
                      :fill="n.color"
                      :fill-opacity="0.18"
                      :stroke="n.color"
                      stroke-width="2" />
              <text :x="n.x" :y="n.y + 4" text-anchor="middle"
                    :font-size="n.r > 28 ? 13 : 11"
                    fill="var(--fg)" font-weight="600" class="mono">{{ n.sym }}</text>
            </g>
          </svg>

          <!-- hover detail card -->
          <div v-if="hoverNode !== -1" class="node-card">
            <div class="row-between">
              <span class="mono" style="font-weight:700;font-size:14px">{{ nodes[hoverNode].sym }}</span>
              <span class="chip" :style="{ background: nodes[hoverNode].color, color: '#fff' }">{{ nodes[hoverNode].sector }}</span>
            </div>
            <div class="hint" style="margin:6px 0">{{ nodes[hoverNode].name }}</div>
            <div style="font-size:11px;color:var(--fg-mute);margin-bottom:4px">最相關:</div>
            <div v-for="rel in topRelated(hoverNode)" :key="rel.sym" class="rel-row">
              <span class="mono">{{ rel.sym }}</span>
              <span class="rel-bar" :style="{ width: (Math.abs(rel.c) * 100) + '%', background: edgeColor(rel.c) }" />
              <span class="num" :class="rel.c > 0 ? 'up' : 'dn'">{{ rel.c > 0 ? '+' : '' }}{{ rel.c.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <div class="net-stats">
          <div class="stat-card">
            <div class="ml">{{ t(lang, 'avgCorr') }}</div>
            <div class="num lg">{{ networkStats.avg.toFixed(2) }}</div>
          </div>
          <div class="stat-card">
            <div class="ml">{{ t(lang, 'maxCorr') }}</div>
            <div class="num lg up">{{ networkStats.max.pair }}</div>
            <div class="hint" style="font-size:10.5px">{{ networkStats.max.c.toFixed(2) }}</div>
          </div>
          <div class="stat-card">
            <div class="ml">{{ t(lang, 'riskConcentration') }}</div>
            <div class="num lg" :class="networkStats.conc > 0.5 ? 'dn' : 'up'">{{ (networkStats.conc * 100).toFixed(0) }}%</div>
            <div class="hint" style="font-size:10.5px">Tech 集中</div>
          </div>
          <div class="stat-card">
            <div class="ml">{{ t(lang, 'diversification') }}</div>
            <div class="diversity-bar"><div class="fill" :style="{ width: (networkStats.div * 100) + '%' }" /></div>
            <div class="hint" style="font-size:10.5px">{{ (networkStats.div * 100).toFixed(0) }}/100</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3) Performance attribution waterfall -->
    <section v-if="tab === 'attribution'" class="grid">
      <div class="card span-12 padlg">
        <div class="row-between" style="margin-bottom:8px">
          <div>
            <div class="ttl">{{ t(lang, 'attribution') }} · {{ rangeLabel }}</div>
            <div class="hint">{{ t(lang, 'waterfallDesc') }}</div>
          </div>
          <div class="seg">
            <button v-for="r in ranges" :key="r" :class="{on: range === r}" @click="range = r">{{ r === 'ALL' ? t(lang, 'allTime') : r }}</button>
          </div>
        </div>

        <div class="waterfall">
          <svg viewBox="0 0 1100 360" class="wf-svg">
            <!-- baseline -->
            <line x1="60" :y1="wfBaselineY" x2="1080" :y2="wfBaselineY" stroke="var(--border)" stroke-dasharray="3 3" />
            <!-- bars -->
            <g v-for="(b, i) in waterfall" :key="b.l">
              <!-- connector -->
              <line v-if="i > 0 && i < waterfall.length - 1"
                    :x1="b.x - 4" :y1="b.connectorY"
                    :x2="b.x" :y2="b.connectorY"
                    stroke="var(--border)" stroke-dasharray="2 2" />
              <!-- bar -->
              <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h"
                    :fill="b.color" rx="2" />
              <!-- value -->
              <text :x="b.x + b.w/2" :y="b.valY" text-anchor="middle"
                    :font-size="11" :fill="b.kind === 'total' ? 'var(--fg)' : b.color"
                    font-weight="600">{{ b.label }}</text>
              <!-- label -->
              <text :x="b.x + b.w/2" :y="350" text-anchor="middle"
                    font-size="10.5" fill="var(--fg-mute)">{{ b.l }}</text>
            </g>
          </svg>
        </div>

        <div class="wf-summary">
          <div class="ws-card">
            <div class="ml">期初</div>
            <div class="num lg">${{ fmtK(waterfallRaw.start) }}</div>
          </div>
          <div class="ws-card">
            <div class="ml">總貢獻</div>
            <div class="num lg" :class="waterfallRaw.totalContrib >= 0 ? 'up' : 'dn'">
              {{ waterfallRaw.totalContrib >= 0 ? '+' : '' }}${{ fmtK(waterfallRaw.totalContrib) }}
            </div>
          </div>
          <div class="ws-card">
            <div class="ml">配息</div>
            <div class="num lg up">+${{ fmtK(waterfallRaw.div) }}</div>
          </div>
          <div class="ws-card">
            <div class="ml">費用</div>
            <div class="num lg dn">-${{ fmtK(waterfallRaw.fees) }}</div>
          </div>
          <div class="ws-card hl">
            <div class="ml">{{ t(lang, 'ending') }}</div>
            <div class="num lg">${{ fmtK(waterfallRaw.end) }}</div>
            <div class="hint" :class="waterfallRaw.end > waterfallRaw.start ? 'up' : 'dn'">
              {{ waterfallRaw.end > waterfallRaw.start ? '+' : '' }}{{ ((waterfallRaw.end / waterfallRaw.start - 1) * 100).toFixed(2) }}%
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4) Tax-loss harvest -->
    <section v-if="tab === 'taxLoss'" class="grid">
      <div class="card span-12 padlg">
        <div class="row-between" style="margin-bottom:14px">
          <div>
            <div class="ttl">{{ t(lang, 'taxLoss') }}</div>
            <div class="hint">{{ t(lang, 'taxLossDesc') }}</div>
          </div>
          <div class="row" style="gap:8px">
            <div class="kpi-pill">
              <span class="ml">{{ t(lang, 'wouldSave') }}</span>
              <span class="num lg dn">-${{ fmtK(totalHarvestable) }}</span>
            </div>
          </div>
        </div>

        <div class="harvest-list">
          <div v-for="h in harvestable" :key="h.sym" class="harvest-row">
            <div class="hsym">
              <div class="mono" style="font-weight:700;font-size:14px">{{ h.sym }}</div>
              <div class="hint">{{ h.name }}</div>
              <div class="dot-row">
                <span class="dot" :style="{ background: h.daysHeld > 365 ? 'var(--up)' : '#f59e0b' }" />
                <span class="hint">{{ h.daysHeld }} {{ lang === 'zh' ? '天' : 'days' }} · {{ h.daysHeld > 365 ? (lang === 'zh' ? '長期' : 'long-term') : (lang === 'zh' ? '短期' : 'short-term') }}</span>
              </div>
            </div>
            <div class="hcell">
              <div class="ml">{{ t(lang, 'qty') }}</div>
              <div class="num">{{ h.qty }}</div>
            </div>
            <div class="hcell">
              <div class="ml">{{ t(lang, 'avgCost') }}</div>
              <div class="num">${{ h.avg.toFixed(2) }}</div>
            </div>
            <div class="hcell">
              <div class="ml">{{ t(lang, 'price') }}</div>
              <div class="num">${{ h.price.toFixed(2) }}</div>
            </div>
            <div class="hcell">
              <div class="ml">{{ t(lang, 'unrealizedLoss') }}</div>
              <div class="num lg dn">-${{ fmtK(h.loss) }}</div>
              <div class="hint dn">{{ h.lossPct.toFixed(1) }}%</div>
            </div>
            <div class="sub-cell">
              <div class="ml">{{ t(lang, 'substituteIdea') }}</div>
              <div class="sub-chips">
                <span v-for="s in h.subs" :key="s" class="sub-chip mono">{{ s }}</span>
              </div>
              <div class="hint" style="font-size:10.5px;margin-top:3px">類似曝險、避免 wash sale</div>
            </div>
            <div class="hact">
              <button class="harvest-btn" @click="$emit('order', { sym: h.sym, side: 'SELL' })">
                {{ t(lang, 'harvest') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { t } from '../i18n';
import { POSITIONS } from '../data';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ order: [p: { sym: string; side?: 'BUY' | 'SELL' }]; toast: [m: string] }>();

type Tab = 'riskComp' | 'correlation' | 'attribution' | 'taxLoss';
const tab = ref<Tab>('riskComp');

const tabs: { k: Tab; icon: string }[] = [
  { k: 'riskComp', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="5" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>' },
  { k: 'correlation', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="12" r="2.5"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/><line x1="13.5" y1="13.5" x2="16.5" y2="16.5"/><line x1="13.5" y1="10.5" x2="16.5" y2="7.5"/><line x1="10.5" y1="13.5" x2="7.5" y2="16.5"/></svg>' },
  { k: 'attribution', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l4-4 4 2 5-7 5 5"/><path d="M3 21h18"/></svg>' },
  { k: 'taxLoss', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
];

// ============ 1) Risk composition ============
const SECTOR_COLOR: Record<string, string> = {
  Tech: 'var(--accent)',
  Crypto: '#a78bfa',
  Auto: '#f59e0b',
  Retail: '#10b981',
  Other: '#94a3b8',
};

interface Weight { sym: string; sector: string; current: number; target: number; mv: number; vol: number; beta: number }

// Currency-normalized market value (NT$ → USD ÷ 32; everything else assumed USD)
const fxAdjust = (sym: string, price: number) => sym.endsWith('.TW') ? price / 32 : price;
const totalMV = POSITIONS.reduce((s, p) => s + p.qty * fxAdjust(p.sym, p.price), 0);

const weights = reactive<Weight[]>(POSITIONS.map(p => {
  const mv = p.qty * fxAdjust(p.sym, p.price);
  const cur = (mv / totalMV) * 100;
  // Stable per-symbol vol/beta (deterministic from sym)
  const seed = p.sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const vol = 12 + ((seed * 7) % 30);
  const beta = 0.7 + ((seed * 13) % 100) / 100;
  return { sym: p.sym, sector: p.sector, current: cur, target: cur, mv, vol, beta };
}));

const dirty = computed(() => weights.some(w => Math.abs(w.target - w.current) > 0.05));

function resetWeights() { weights.forEach(w => { w.target = w.current; }); }
function apply() { weights.forEach(w => { w.current = w.target; }); }

// Treemap layout (slice-and-dice — sort desc, alternate split direction)
interface Tile { sym: string; sector: string; weight: number; delta: number; x: number; y: number; w: number; h: number; color: string }

const treemap = computed<Tile[]>(() => {
  const items = weights.map(w => ({ sym: w.sym, sector: w.sector, weight: w.target, delta: w.target - w.current }))
    .sort((a, b) => b.weight - a.weight);
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  const tiles: Tile[] = [];
  // simple squarified-ish: split into 2 columns roughly equal
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const leftTotal = left.reduce((s, i) => s + i.weight, 0);
  const rightTotal = right.reduce((s, i) => s + i.weight, 0);
  const leftW = (leftTotal / total) * 100;
  const rightW = 100 - leftW;
  let y = 0;
  left.forEach(it => {
    const h = (it.weight / leftTotal) * 100;
    tiles.push({
      sym: it.sym, sector: it.sector, weight: it.weight, delta: it.delta,
      x: 0, y, w: leftW, h, color: SECTOR_COLOR[it.sector] || SECTOR_COLOR.Other,
    });
    y += h;
  });
  y = 0;
  right.forEach(it => {
    const h = (it.weight / (rightTotal || 1)) * 100;
    tiles.push({
      sym: it.sym, sector: it.sector, weight: it.weight, delta: it.delta,
      x: leftW, y, w: rightW, h, color: SECTOR_COLOR[it.sector] || SECTOR_COLOR.Other,
    });
    y += h;
  });
  return tiles;
});

const hoverIdx = ref(-1);

const baselineRisk = computed(() => calcRisk(weights.map(w => ({ ...w, target: w.current }))));
const riskMetrics = computed(() => calcRisk(weights));

function calcRisk(ws: Weight[]) {
  // Weighted vol (assume 0.4 avg correlation)
  const totalW = ws.reduce((s, w) => s + w.target, 0) || 1;
  const wv = ws.map(w => ({ w: w.target / totalW, vol: w.vol, beta: w.beta }));
  // Portfolio vol (rough): sqrt(sum(w_i^2 * v_i^2) + 2*0.4*sum_pairs(w_i*w_j*v_i*v_j))
  let varSum = 0;
  for (let i = 0; i < wv.length; i++) {
    varSum += wv[i].w ** 2 * wv[i].vol ** 2;
    for (let j = i + 1; j < wv.length; j++) {
      varSum += 2 * 0.4 * wv[i].w * wv[j].w * wv[i].vol * wv[j].vol;
    }
  }
  const vol = Math.sqrt(varSum);
  const beta = wv.reduce((s, w) => s + w.w * w.beta, 0);
  const var95 = vol * 1.65 / Math.sqrt(252);
  const sharpe = (12 - 4) / vol; // assume 12% expected return, 4% rf
  const dd = -vol * 1.2;
  return { vol, var: var95, sharpe, dd, beta };
}

// ============ 2) Correlation network ============
type Cluster = 'sector' | 'corr' | 'cat';
const cluster = ref<Cluster>('sector');
const hoverNode = ref(-1);

interface Node { sym: string; name: string; sector: string; cat: string; r: number; x: number; y: number; color: string }

// Pre-laid-out positions per cluster mode (manually positioned for nice composition)
const NODES_BASE: Omit<Node, 'x' | 'y'>[] = POSITIONS.map(p => {
  const mv = p.qty * fxAdjust(p.sym, p.price);
  const r = 14 + Math.sqrt(mv) / 50;
  const cat = p.sector === 'Crypto' ? 'crypto' : 'stock';
  return {
    sym: p.sym, name: p.name, sector: p.sector, cat,
    r: Math.min(r, 38),
    color: SECTOR_COLOR[p.sector] || SECTOR_COLOR.Other,
  };
});

// Position by cluster mode. Stable.
const POS_BY_MODE: Record<Cluster, Record<string, [number, number]>> = {
  sector: {
    AAPL: [240, 180], NVDA: [320, 130], '2330.TW': [200, 250], MSFT: [340, 230],
    BTC: [560, 200], ETH: [620, 270],
  },
  corr: {
    AAPL: [280, 200], NVDA: [340, 160], MSFT: [240, 240], '2330.TW': [320, 250],
    BTC: [580, 170], ETH: [560, 250],
  },
  cat: {
    AAPL: [240, 230], NVDA: [310, 200], MSFT: [380, 230], '2330.TW': [310, 270],
    BTC: [580, 200], ETH: [580, 260],
  },
};

const nodes = computed<Node[]>(() => {
  const m = POS_BY_MODE[cluster.value];
  return NODES_BASE.map(n => {
    const [x, y] = m[n.sym] || [400, 230];
    return { ...n, x, y };
  });
});

// Stable correlation matrix (deterministic per pair)
function pairSeed(a: string, b: string) {
  const k = [a, b].sort().join('|');
  let s = 0;
  for (let i = 0; i < k.length; i++) s = (s * 31 + k.charCodeAt(i)) >>> 0;
  return s;
}
function corrOf(a: string, b: string) {
  const sa = NODES_BASE.find(n => n.sym === a)?.sector;
  const sb = NODES_BASE.find(n => n.sym === b)?.sector;
  const seed = pairSeed(a, b);
  let base = (seed % 1000) / 1000; // 0..1
  if (sa === sb) base = 0.5 + base * 0.45; // same sector = high
  else if ((sa === 'Tech' && sb === 'Crypto') || (sa === 'Crypto' && sb === 'Tech')) base = 0.25 + base * 0.3;
  else base = -0.2 + base * 0.5;
  return Math.max(-1, Math.min(1, base));
}

interface Edge { a: number; b: number; c: number }
const edges = computed<Edge[]>(() => {
  const out: Edge[] = [];
  for (let i = 0; i < nodes.value.length; i++) {
    for (let j = i + 1; j < nodes.value.length; j++) {
      const c = corrOf(nodes.value[i].sym, nodes.value[j].sym);
      if (Math.abs(c) > 0.2) out.push({ a: i, b: j, c });
    }
  }
  return out;
});

function edgeColor(c: number) {
  if (c > 0.5) return '#ef4444'; // red — high corr
  if (c > 0.2) return '#f59e0b'; // amber
  if (c < -0.2) return '#10b981'; // green — diversifying
  return 'var(--fg-mute)';
}

function connected(idx: number) {
  return edges.value.some(e => (e.a === idx && e.b === hoverNode.value) || (e.b === idx && e.a === hoverNode.value));
}

function topRelated(idx: number) {
  const sym = nodes.value[idx].sym;
  return nodes.value
    .filter((_, i) => i !== idx)
    .map(n => ({ sym: n.sym, c: corrOf(sym, n.sym) }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 3);
}

const networkStats = computed(() => {
  const cs = edges.value.map(e => e.c);
  const avg = cs.reduce((s, c) => s + c, 0) / (cs.length || 1);
  const max = edges.value.reduce<{ a: number; b: number; c: number; pair: string }>(
    (m, e) => Math.abs(e.c) > Math.abs(m.c) ? { ...e, pair: nodes.value[e.a].sym + '↔' + nodes.value[e.b].sym } : m,
    { a: 0, b: 0, c: 0, pair: '—' },
  );
  const techWeight = weights.filter(w => w.sector === 'Tech').reduce((s, w) => s + w.current, 0);
  const conc = techWeight / 100;
  const div = 1 - Math.max(0, avg);
  return { avg, max, conc, div };
});

// ============ 3) Performance attribution waterfall ============
type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';
const ranges: Range[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const range = ref<Range>('3M');
const rangeLabel = computed(() => range.value === 'ALL' ? t(props.lang, 'allTime') : range.value);

const RANGE_MULT: Record<Range, number> = { '1M': 0.3, '3M': 1.0, '6M': 1.7, '1Y': 2.6, 'ALL': 4.0 };

interface WfRaw { l: string; v: number; kind: 'start' | 'pos' | 'div' | 'fees' | 'total' }

const waterfallRaw = computed(() => {
  const m = RANGE_MULT[range.value];
  const start = totalMV - 80000 * m;
  const contribs = POSITIONS.map(p => {
    const seed = p.sym.charCodeAt(0) + p.sym.charCodeAt(1);
    const sign = ((seed * 7) % 5) > 1 ? 1 : -1;
    const val = sign * (3000 + (seed * 137) % 18000) * m;
    return { sym: p.sym, v: val };
  });
  const totalContrib = contribs.reduce((s, c) => s + c.v, 0);
  const div = 240 * m;
  const fees = 65 * m;
  const end = start + totalContrib + div - fees;
  return { start, contribs, totalContrib, div, fees, end };
});

const waterfall = computed(() => {
  const w = waterfallRaw.value;
  const items: WfRaw[] = [
    { l: '期初', v: w.start, kind: 'start' },
    ...w.contribs.map(c => ({ l: c.sym, v: c.v, kind: 'pos' as const })),
    { l: '配息', v: w.div, kind: 'div' },
    { l: '費用', v: -w.fees, kind: 'fees' },
    { l: '期末', v: w.end, kind: 'total' as const },
  ];
  // Compute y based on running total. Need to include EVERY trajectory point.
  const trajectory: number[] = [w.start];
  let r0 = w.start;
  for (const c of w.contribs) { r0 += c.v; trajectory.push(r0); }
  r0 += w.div; trajectory.push(r0);
  r0 -= w.fees; trajectory.push(r0);
  const minV = Math.min(...trajectory) * 0.97;
  const maxV = Math.max(...trajectory) * 1.03;
  const ySpan = 280;
  const yTop = 30;
  const scale = (v: number) => yTop + (1 - (v - minV) / (maxV - minV)) * ySpan;
  const xLeft = 60;
  const xRight = 1080;
  const barW = (xRight - xLeft) / items.length - 8;

  let running = w.start;
  const out: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x = xLeft + i * (barW + 8);
    let yTopBar: number, h: number, color: string;
    if (it.kind === 'start') {
      // Anchor bar from value down to baseline at minV
      yTopBar = scale(it.v);
      h = Math.max(scale(minV) - yTopBar, 4);
      color = 'var(--fg-mute)';
    } else if (it.kind === 'total') {
      yTopBar = scale(it.v);
      h = Math.max(scale(minV) - yTopBar, 4);
      color = 'var(--accent)';
    } else {
      const before = running;
      const after = running + it.v;
      const top = Math.max(before, after);
      const bot = Math.min(before, after);
      yTopBar = scale(top);
      h = Math.max(Math.abs(scale(top) - scale(bot)), 3);
      color = it.v >= 0 ? 'var(--up)' : 'var(--dn)';
      running = after;
    }
    const labelTxt = it.kind === 'start' || it.kind === 'total'
      ? '$' + fmtK(it.v)
      : (it.v >= 0 ? '+' : '') + fmtK(it.v);
    out.push({
      l: it.l, x, y: yTopBar, w: barW, h, color, kind: it.kind,
      label: labelTxt,
      valY: yTopBar - 6,
      connectorY: yTopBar + (it.v < 0 ? h : 0),
    });
  }
  return out;
});

const wfBaselineY = computed(() => {
  const w = waterfallRaw.value;
  const traj: number[] = [w.start];
  let r0 = w.start;
  for (const c of w.contribs) { r0 += c.v; traj.push(r0); }
  r0 += w.div; traj.push(r0);
  r0 -= w.fees; traj.push(r0);
  const minV = Math.min(...traj) * 0.97;
  const maxV = Math.max(...traj) * 1.03;
  return 30 + (1 - (w.start - minV) / (maxV - minV)) * 280;
});

// ============ 4) Tax-loss harvest ============
const TAX_MOCK: { sym: string; name: string; qty: number; avg: number; price: number; sector: string; daysHeld: number; subs: string[] }[] = [
  { sym: 'TSLA', name: 'Tesla, Inc.', qty: 25, avg: 248.40, price: 178.22, sector: 'Auto', daysHeld: 412, subs: ['F', 'GM', 'RIVN'] },
  { sym: 'AMZN', name: 'Amazon.com', qty: 30, avg: 218.20, price: 192.34, sector: 'Retail', daysHeld: 180, subs: ['SHOP', 'MELI'] },
  { sym: 'INTC', name: 'Intel Corp.', qty: 80, avg: 38.40, price: 24.18, sector: 'Tech', daysHeld: 290, subs: ['AMD', 'AVGO', 'QCOM'] },
  { sym: 'PYPL', name: 'PayPal Holdings', qty: 50, avg: 78.20, price: 62.10, sector: 'Fin', daysHeld: 540, subs: ['SQ', 'V', 'MA'] },
];

const harvestable = computed(() => TAX_MOCK.map(p => {
  const loss = (p.price - p.avg) * p.qty;
  const lossPct = (p.price / p.avg - 1) * 100;
  return { ...p, loss: Math.abs(loss), lossPct };
}));

const totalHarvestable = computed(() => harvestable.value.reduce((s, h) => s + h.loss, 0));

// ============ Helpers ============
function fmtK(n: number) {
  const v = Math.abs(n);
  if (v >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
</script>

<style scoped>
.page { padding: 22px 28px; }
.ah { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 24px }
.sub { font-size: 12.5px; color: var(--fg-dim); margin-top: 4px; max-width: 760px; line-height: 1.6 }
.row-between { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px }
.row { display: flex; align-items: center }
.ttl { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; color: var(--fg) }
.hint { font-size: 11.5px; color: var(--fg-mute); margin-top: 2px }
.ml { font-size: 11px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: 0.5px }
.num { font-variant-numeric: tabular-nums; font-weight: 500 }
.num.lg { font-size: 18px; font-weight: 600; margin-top: 4px }
.num.up, .up { color: var(--up) }
.num.dn, .dn { color: var(--dn) }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace }
.padlg { padding: 18px 22px }
.span-12 { grid-column: span 12 }
.span-8 { grid-column: span 8 }
.span-4 { grid-column: span 4 }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px }

.tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border); padding-bottom: 0 }
.tab {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; background: transparent; border: 0;
  color: var(--fg-mute); font-size: 13px; font-weight: 500;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: all 0.15s;
}
.tab:hover { color: var(--fg-dim) }
.tab.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600 }
.tab-icon { display: inline-flex; align-items: center; }

.seg { display: inline-flex; background: var(--surface2); border-radius: 6px; padding: 2px; gap: 2px }
.seg button { padding: 4px 10px; border: 0; background: transparent; color: var(--fg-mute); font-size: 11.5px; border-radius: 4px; font-weight: 500 }
.seg button.on { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06) }

/* Treemap */
.treemap { position: relative; border-radius: 8px; overflow: hidden; background: var(--surface2) }
.tile { position: absolute; transition: transform 0.15s, filter 0.15s; cursor: pointer; border: 1.5px solid var(--surface) }
.tile.active { z-index: 2; filter: brightness(1.08); border-color: var(--fg) }
.tile-inner { padding: 8px 10px; color: #fff; height: 100%; display: flex; flex-direction: column; justify-content: space-between }
.tile-sym { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; font-size: 13px; letter-spacing: -0.3px }
.tile-pct { font-size: 11.5px; opacity: 0.95; display: flex; align-items: center; gap: 4px; flex-wrap: wrap }
.tile-meta { font-size: 10.5px; opacity: 0.78; text-transform: uppercase; letter-spacing: 0.5px }
.delta-pill { background: rgba(255,255,255,0.22); padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600 }
.legend { display: flex; gap: 16px; align-items: center; margin-top: 12px; font-size: 11.5px; color: var(--fg-dim) }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle }

/* Sliders */
.sliders { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px }
.slider-row .sym { font-size: 12px; font-weight: 600 }
.slider-row .num.edited { color: var(--accent); font-weight: 600 }
.slider-row .delta { font-size: 10.5px; opacity: 0.7; margin-left: 4px }
.slider-row input[type="range"] {
  width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
  background: linear-gradient(90deg, var(--accent) var(--accent-pct), var(--surface2) var(--accent-pct));
  border-radius: 2px; outline: none;
}
.slider-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--surface); border: 2px solid var(--accent);
  cursor: pointer;
}

.metrics { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; padding-top: 14px; border-top: 1px solid var(--border) }
.metric { display: flex; justify-content: space-between; align-items: center; font-size: 12px }
.metric .ml { font-size: 11px }
.metric .mv { display: flex; gap: 6px; align-items: center }
.metric-delta { font-size: 10.5px; padding: 1px 5px; border-radius: 4px; font-weight: 600 }
.metric-delta.good { background: rgba(16,185,129,0.12); color: var(--up) }
.metric-delta.bad { background: rgba(239,68,68,0.12); color: var(--dn) }

.apply-btn {
  width: 100%; padding: 9px; background: var(--accent); color: #fff;
  border: 0; border-radius: 6px; font-weight: 600; font-size: 12.5px; cursor: pointer;
}
.apply-btn:disabled { background: var(--surface2); color: var(--fg-mute); cursor: not-allowed }

/* Network */
.network-wrap { position: relative; border-radius: 8px; overflow: hidden; background: var(--surface2); padding: 8px; margin: 14px 0 }
.network { width: 100%; height: 460px; display: block }
.network g { transition: opacity 0.2s }
.network g.dim { opacity: 0.18 }
.node-card {
  position: absolute; top: 12px; right: 12px; width: 240px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); z-index: 5;
}
.chip { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 8px }
.rel-row { display: grid; grid-template-columns: 56px 1fr 50px; align-items: center; gap: 8px; font-size: 11.5px; padding: 3px 0 }
.rel-bar { height: 5px; border-radius: 3px; }
.net-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 4px }
.stat-card { padding: 12px 14px; background: var(--surface2); border-radius: 6px }
.stat-card .ml { margin-bottom: 4px }
.diversity-bar { height: 5px; background: var(--border); border-radius: 3px; margin-top: 6px; overflow: hidden }
.diversity-bar .fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--up)); border-radius: 3px; transition: width 0.3s }

/* Waterfall */
.waterfall { background: var(--surface2); border-radius: 8px; padding: 14px; margin: 8px 0 }
.wf-svg { width: 100%; height: 360px; display: block }
.wf-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 14px }
.ws-card { padding: 10px 12px; background: var(--surface2); border-radius: 6px }
.ws-card.hl { background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(99,102,241,0.02)); border: 1px solid rgba(99,102,241,0.2) }

/* Tax-loss */
.kpi-pill { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: var(--surface2); border-radius: 8px }
.kpi-pill .num.lg { font-size: 16px; margin-top: 0 }
.harvest-list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border-radius: 8px; overflow: hidden }
.harvest-row {
  display: grid;
  grid-template-columns: 1.5fr 0.7fr 0.7fr 0.7fr 1fr 1.6fr 0.8fr;
  gap: 14px; padding: 14px 16px;
  background: var(--surface);
  align-items: center;
}
.harvest-row .ml { margin-bottom: 2px }
.hsym .dot-row { display: flex; align-items: center; gap: 5px; margin-top: 4px }
.dot { width: 6px; height: 6px; border-radius: 50% }
.sub-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px }
.sub-chip { font-size: 11px; padding: 2px 7px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; font-weight: 500 }
.harvest-btn {
  padding: 7px 14px; background: rgba(239,68,68,0.1); color: var(--dn);
  border: 1px solid rgba(239,68,68,0.25); border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.harvest-btn:hover { background: rgba(239,68,68,0.18) }
</style>
