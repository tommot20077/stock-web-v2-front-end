<template>
  <div class="se">
    <div class="se-hd">
      <div class="se-hd-l">
        <select v-model="presetId" class="inp" @change="loadPreset">
          <option value="">— Templates —</option>
          <option value="ma_cross">MA Cross (20/50)</option>
          <option value="rsi_mr">RSI Mean Reversion</option>
          <option value="momentum">Momentum 3M</option>
          <option value="dca">DCA Weekly</option>
        </select>
        <span v-if="status === 'ok'" class="status ok">✓ Compiled · 0 errors</span>
        <span v-else-if="status === 'err'" class="status err">✗ {{ errorMsg }}</span>
        <span v-else class="status">— Edit and click Run</span>
      </div>
      <button class="btn-accent" @click="$emit('run', code)">▶ Run</button>
    </div>

    <div class="se-body">
      <div class="ed-wrap">
        <div class="gutter">
          <div v-for="n in lineCount" :key="n" class="ln">{{ n }}</div>
        </div>
        <textarea
          v-model="code"
          spellcheck="false"
          class="ed"
          @input="checkSyntax"
          @keydown.tab.prevent="onTab"
        ></textarea>
      </div>

      <aside class="se-side">
        <div class="side-sec">
          <div class="side-ttl">Available API</div>
          <div class="api-list">
            <code>bars</code><span>OHLCV array</span>
            <code>indicators.ma(p)</code><span>moving avg</span>
            <code>indicators.ema(p)</code><span>exp. moving avg</span>
            <code>indicators.rsi(p)</code><span>relative strength</span>
            <code>indicators.atr(p)</code><span>avg true range</span>
            <code>broker.buy({pct, qty})</code><span>open long</span>
            <code>broker.sell({all, pct})</code><span>close / short</span>
            <code>broker.position</code><span>current pos</span>
            <code>broker.cash</code><span>available cash</span>
            <code>i</code><span>current bar idx</span>
          </div>
        </div>
        <div class="side-sec">
          <div class="side-ttl">Sandbox</div>
          <div class="api-list dim-text">
            <span>● Strict mode</span>
            <span>● No fetch / window / DOM</span>
            <span>● 5s execution timeout</span>
            <span>● Per-bar invocation</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

defineEmits<{ run: [code: string] }>();

const presetId = ref('ma_cross');

const PRESETS: Record<string, string> = {
  ma_cross: `// MA Crossover (20/50)
function strategy({ bars, indicators, broker, i }) {
  if (i < 50) return;
  const ma20 = indicators.ma(20);
  const ma50 = indicators.ma(50);
  const crossUp = ma20[i] > ma50[i] && ma20[i-1] <= ma50[i-1];
  const crossDn = ma20[i] < ma50[i] && ma20[i-1] >= ma50[i-1];

  if (crossUp && broker.position === 0) {
    broker.buy({ pct: 1.0 });
  }
  if (crossDn && broker.position > 0) {
    broker.sell({ all: true });
  }
}`,
  rsi_mr: `// RSI Mean Reversion
function strategy({ bars, indicators, broker, i }) {
  if (i < 14) return;
  const rsi = indicators.rsi(14);

  if (rsi[i] < 30 && broker.position === 0) {
    broker.buy({ pct: 0.5 });
  }
  if (rsi[i] > 70 && broker.position > 0) {
    broker.sell({ all: true });
  }
}`,
  momentum: `// 3-Month Momentum
function strategy({ bars, indicators, broker, i }) {
  if (i < 60) return;
  const ret = (bars[i].close / bars[i-60].close - 1) * 100;

  if (ret > 10 && broker.position === 0) {
    broker.buy({ pct: 1.0 });
  } else if (ret < -5 && broker.position > 0) {
    broker.sell({ all: true });
  }
}`,
  dca: `// DCA — buy weekly
function strategy({ bars, broker, i }) {
  if (i % 5 === 0 && broker.cash > 1000) {
    broker.buy({ qty: 1000 / bars[i].close });
  }
}`,
};

const code = ref(PRESETS.ma_cross);
const status = ref<'idle' | 'ok' | 'err'>('idle');
const errorMsg = ref('');

const lineCount = computed(() => Math.max(code.value.split('\n').length, 1));

function loadPreset() {
  if (presetId.value && PRESETS[presetId.value]) {
    code.value = PRESETS[presetId.value];
    status.value = 'idle';
  }
}

function checkSyntax() {
  try {
    new Function(code.value + '; return strategy;')();
    status.value = 'ok';
    errorMsg.value = '';
  } catch (e: any) {
    status.value = 'err';
    errorMsg.value = e.message;
  }
}

function onTab(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement;
  const s = ta.selectionStart;
  const v = code.value;
  code.value = v.slice(0, s) + '  ' + v.slice(ta.selectionEnd);
  setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
}

onMounted(checkSyntax);
</script>

<style scoped>
.se { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.se-hd { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface2); }
.se-hd-l { display: flex; gap: 12px; align-items: center; }
.inp { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 12px; color: var(--fg); font-family: inherit; }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.status { font-size: 11px; color: var(--fg-mute); font-family: 'JetBrains Mono', monospace; }
.status.ok { color: var(--up); }
.status.err { color: var(--dn); }

.se-body { display: grid; grid-template-columns: 1fr 240px; min-height: 360px; }
.ed-wrap { display: flex; background: #0d1117; }
.gutter { padding: 12px 8px; user-select: none; text-align: right; color: #5a6470; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.6; }
.ln { padding: 0 6px; }
.ed {
  flex: 1; background: transparent; border: 0; outline: none;
  color: #d4d4d4; font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px; line-height: 1.6; padding: 12px; resize: none;
  caret-color: var(--accent); tab-size: 2;
}

.se-side { background: var(--surface2); border-left: 1px solid var(--border); padding: 14px; overflow: auto; }
.side-sec + .side-sec { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); }
.side-ttl { font-size: 10px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; font-weight: 600; }
.api-list { display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 11px; }
.api-list code { font-family: 'JetBrains Mono', monospace; color: var(--accent); font-size: 11px; padding: 1px 5px; background: var(--surface); border-radius: 3px; display: inline-block; }
.api-list span { color: var(--fg-dim); font-size: 10.5px; padding-left: 4px; }
.dim-text span { color: var(--fg-dim); display: block; font-size: 10.5px; }
</style>
