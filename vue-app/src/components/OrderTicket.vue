<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click="onMaskClick">
      <div class="ticket" @click.stop>
        <div class="hd">
          <div class="hd-l">
            <div class="step-dots">
              <span v-for="(_, i) in 4" :key="i" :class="['dot', { on: i <= stepIdx, done: i < stepIdx }]" />
            </div>
            <div class="hd-ttl">{{ stepTitle }}</div>
          </div>
          <button class="x" @click="onClose">✕</button>
        </div>

        <!-- STEP 1: Ticket -->
        <div v-if="step === 'ticket'" class="body two-col">
          <div class="left">
            <label class="lab">{{ t(lang, 'symbol') }}</label>
            <div class="sym-wrap">
              <input
                ref="symInput"
                v-model="symQuery"
                class="inp big"
                :placeholder="t(lang, 'selectSymbol')"
                @focus="symOpen = true"
                @input="onSymInput"
              />
              <div v-if="selected" class="sym-meta">
                <span class="sym-tag">{{ selected.cat.toUpperCase() }}</span>
                <span style="color:var(--fg-dim)">{{ selected.name }}</span>
              </div>
              <div v-if="symOpen && filtered.length" class="sym-pop">
                <div
                  v-for="s in filtered"
                  :key="s.sym"
                  class="sym-row"
                  @mousedown.prevent="pickSym(s)"
                >
                  <div>
                    <div style="font-weight:600">{{ s.sym }}</div>
                    <div style="font-size:11px;color:var(--fg-dim)">{{ s.name }}</div>
                  </div>
                  <div class="num" style="text-align:right">
                    <div style="font-weight:500">{{ fmtNum(s.price) }}</div>
                    <div style="font-size:11px" :style="{ color: s.chgPct >= 0 ? 'var(--up)' : 'var(--dn)' }">
                      {{ fmtPct(s.chgPct) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <label class="lab">{{ t(lang, 'side') }}</label>
            <div class="side-toggle">
              <button :class="['side-btn', 'buy', { active: side === 'BUY' }]" @click="side = 'BUY'">
                ↗ {{ t(lang, 'buy') }}
              </button>
              <button :class="['side-btn', 'sell', { active: side === 'SELL' }]" @click="side = 'SELL'">
                ↘ {{ t(lang, 'sell') }}
              </button>
            </div>

            <label class="lab">{{ t(lang, 'orderType') }}</label>
            <div class="seg">
              <button :class="['seg-btn', { active: ordType === 'MKT' }]" @click="ordType = 'MKT'">{{ t(lang, 'market') }}</button>
              <button :class="['seg-btn', { active: ordType === 'LMT' }]" @click="ordType = 'LMT'">{{ t(lang, 'limit') }}</button>
            </div>

            <div class="row2">
              <div>
                <label class="lab">{{ t(lang, 'qty') }}</label>
                <input v-model.number="qty" type="number" class="inp" min="0" :step="qtyStep" />
              </div>
              <div>
                <label class="lab">{{ t(lang, 'price') }}</label>
                <input
                  v-model.number="px"
                  type="number"
                  class="inp"
                  :disabled="ordType === 'MKT'"
                  step="0.01"
                />
              </div>
            </div>

            <label class="lab">{{ t(lang, 'tif') }}</label>
            <div class="seg">
              <button :class="['seg-btn', { active: tif === 'DAY' }]" @click="tif = 'DAY'">{{ t(lang, 'day') }}</button>
              <button :class="['seg-btn', { active: tif === 'GTC' }]" @click="tif = 'GTC'">{{ t(lang, 'gtc') }}</button>
            </div>
            <div v-if="validationError" class="form-error">{{ validationError }}</div>
          </div>

          <div class="right">
            <div v-if="selected" class="quote-card">
              <div class="row-between">
                <div>
                  <div style="font-size:11px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.4px">{{ t(lang, 'last') }}</div>
                  <div class="num" style="font-size:24px;font-weight:600;margin-top:2px">{{ fmtNum(selected.price) }}</div>
                </div>
                <div class="num" style="text-align:right" :style="{ color: selected.chgPct >= 0 ? 'var(--up)' : 'var(--dn)' }">
                  <div style="font-weight:500">{{ selected.chgPct >= 0 ? '+' : '' }}{{ fmtNum(selected.chg) }}</div>
                  <div style="font-size:12px">{{ fmtPct(selected.chgPct) }}</div>
                </div>
              </div>

              <div style="height:90px;color:var(--accent);margin:14px 0 10px">
                <LineChart :data="quoteSeries" fill="var(--accent)" />
              </div>

              <div class="quote-meta">
                <div>
                  <div class="qm-l">{{ t(lang, 'dayRange') }}</div>
                  <div class="num qm-v">{{ fmtNum(selected.low) }} – {{ fmtNum(selected.high) }}</div>
                </div>
                <div>
                  <div class="qm-l">{{ t(lang, 'volume') }}</div>
                  <div class="num qm-v">{{ selected.vol }}</div>
                </div>
              </div>
            </div>
            <div v-else class="quote-empty">
              {{ t(lang, 'selectSymbol') }}
            </div>

            <div class="summary">
              <div class="sum-row">
                <span>{{ t(lang, 'estTotal') }}</span>
                <span class="num" style="font-weight:600">${{ fmtNum(estTotal, 2) }}</span>
              </div>
              <div class="sum-row dim">
                <span>{{ t(lang, 'estFee') }}</span>
                <span class="num">${{ fmtNum(estFee, 2) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: Review -->
        <div v-else-if="step === 'review'" class="body review">
          <div class="big-side" :class="side.toLowerCase()">
            {{ side === 'BUY' ? t(lang, 'buy') : t(lang, 'sell') }} {{ qty }} {{ selected?.sym }}
          </div>
          <div class="rev-grid">
            <div><span>{{ t(lang, 'orderType') }}</span><b>{{ ordType === 'MKT' ? t(lang, 'market') : t(lang, 'limit') }} · {{ tif }}</b></div>
            <div><span>{{ t(lang, 'price') }}</span><b class="num">${{ fmtNum(px) }}</b></div>
            <div><span>{{ t(lang, 'qty') }}</span><b class="num">{{ qty }}</b></div>
            <div><span>{{ t(lang, 'estFee') }}</span><b class="num">${{ fmtNum(estFee, 2) }}</b></div>
            <div class="span-2 highlight"><span>{{ t(lang, 'estTotal') }}</span><b class="num">${{ fmtNum(estTotal, 2) }}</b></div>
            <div class="span-2 dim"><span>{{ t(lang, 'cashAfter') }}</span><b class="num">${{ fmtNum(cashAfter, 0) }}</b></div>
          </div>
        </div>

        <!-- STEP 3: Placing -->
        <div v-else-if="step === 'placing'" class="body placing">
          <div class="spinner" />
          <div class="placing-steps">
            <div v-for="(s, i) in placeSteps" :key="i" :class="['p-step', { done: placeStage > i, active: placeStage === i }]">
              <span class="p-mark">{{ placeStage > i ? '✓' : placeStage === i ? '·' : '' }}</span>
              <span>{{ s }}</span>
            </div>
          </div>
        </div>

        <!-- STEP 4: Filled -->
        <div v-else-if="step === 'filled'" class="body filled">
          <div class="check">✓</div>
          <div class="filled-ttl">{{ t(lang, 'filled') }}</div>
          <div class="filled-sub">{{ side === 'BUY' ? t(lang, 'buy') : t(lang, 'sell') }} {{ qty }} {{ selected?.sym }} @ ${{ fmtNum(fillPx) }}</div>
          <div class="rev-grid" style="margin-top:18px">
            <div><span>{{ t(lang, 'avgFillPx') }}</span><b class="num">${{ fmtNum(fillPx) }}</b></div>
            <div><span>{{ t(lang, 'orderId') }}</span><b class="num">#{{ orderId }}</b></div>
            <div class="span-2"><span>{{ t(lang, 'estTotal') }}</span><b class="num">${{ fmtNum(qty * fillPx, 2) }}</b></div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ft">
          <template v-if="step === 'ticket'">
            <button class="btn-ghost" @click="onClose">{{ t(lang, 'cancel') }}</button>
            <button class="btn-accent" :disabled="!canSubmit" @click="step = 'review'">{{ t(lang, 'review') }} →</button>
          </template>
          <template v-else-if="step === 'review'">
            <button class="btn-ghost" @click="step = 'ticket'">← {{ t(lang, 'cancel') }}</button>
            <button :class="['btn-accent', side.toLowerCase()]" @click="placeOrder">{{ t(lang, 'placeOrder') }}</button>
          </template>
          <template v-else-if="step === 'filled'">
            <button class="btn-ghost" @click="resetAndClose">{{ t(lang, 'newOrder') }}</button>
            <button class="btn-accent" @click="goPositions">{{ t(lang, 'viewPositions') }} →</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, FX, fmtNum, fmtPct, genSeries } from '../data';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { useMockPortfolioStore } from '../stores/mockPortfolio';
import type { Lang, Symbol as Sym } from '../types';
import LineChart from './LineChart.vue';

const props = defineProps<{ open: boolean; lang: Lang; preset?: { sym: string; side?: 'BUY' | 'SELL' } | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'navigate', p: 'positions'): void; (e: 'toast', m: string): void }>();

const ALL: Sym[] = [...SYMBOLS, ...CRYPTO, ...FX];
const portfolio = useMockPortfolioStore();
const notifications = useMockNotificationsStore();
type Step = 'ticket' | 'review' | 'placing' | 'filled';

const step = ref<Step>('ticket');
const stepIdx = computed(() => ['ticket', 'review', 'placing', 'filled'].indexOf(step.value));
const stepTitle = computed(() => {
  const lang = props.lang;
  switch (step.value) {
    case 'ticket': return t(lang, 'newOrder');
    case 'review': return t(lang, 'review');
    case 'placing': return t(lang, 'placing') + '…';
    case 'filled': return t(lang, 'filled');
  }
});

const symInput = ref<HTMLInputElement | null>(null);
const symQuery = ref('');
const symOpen = ref(false);
const selected = ref<Sym | null>(null);

const side = ref<'BUY' | 'SELL'>('BUY');
const ordType = ref<'MKT' | 'LMT'>('MKT');
const tif = ref<'DAY' | 'GTC'>('DAY');
const qty = ref<number>(0);
const px = ref<number>(0);

const orderId = ref('');
const fillPx = ref(0);
const placeStage = ref(0);
const placing = ref(false);
const orderError = ref('');
const placeSteps = computed(() => [t(props.lang, 'placing'), t(props.lang, 'routingMatch'), t(props.lang, 'filled')]);

const filtered = computed(() => {
  const q = symQuery.value.trim().toLowerCase();
  if (!q) return ALL.slice(0, 6);
  return ALL.filter(s => s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 6);
});

const qtyStep = computed(() => selected.value?.cat === 'crypto' ? 0.01 : 1);

const estTotal = computed(() => qty.value * px.value);
const estFee = computed(() => Math.max(1, estTotal.value * 0.001));
const cashAfter = computed(() => 124_580 - (side.value === 'BUY' ? estTotal.value + estFee.value : -(estTotal.value - estFee.value)));

const quoteSeries = computed(() =>
  selected.value ? genSeries(40, selected.value.price * 0.985, 0.012, selected.value.sym.charCodeAt(0)) : []
);

const selectedMatchesQuery = computed(() =>
  !!selected.value && symQuery.value.trim().toUpperCase() === selected.value.sym.toUpperCase()
);
const sellValidationError = computed(() => {
  if (side.value !== 'SELL' || !selected.value || qty.value <= 0) return '';
  const holding = portfolio.positions.find(p => p.sym === selected.value!.sym);
  if (!holding || holding.qty <= 0) return 'No holdings available to sell';
  if (qty.value > holding.qty) return 'Sell quantity exceeds current holding';
  return '';
});
const validationError = computed(() => orderError.value || sellValidationError.value);
const canSubmit = computed(() =>
  !!selected.value &&
  selectedMatchesQuery.value &&
  qty.value > 0 &&
  (ordType.value === 'MKT' || px.value > 0) &&
  !validationError.value
);

function pickSym(s: Sym) {
  orderError.value = '';
  selected.value = s;
  symQuery.value = s.sym;
  symOpen.value = false;
  px.value = +s.price.toFixed(2);
  if (qty.value === 0) qty.value = s.cat === 'crypto' ? 0.05 : 10;
}

function clearSelection(preserveQuery = false) {
  orderError.value = '';
  selected.value = null;
  if (!preserveQuery) symQuery.value = '';
  symOpen.value = false;
  qty.value = 0;
  px.value = 0;
}

function resetIntent() {
  side.value = 'BUY';
  ordType.value = 'MKT';
  tif.value = 'DAY';
  orderError.value = '';
}

function onSymInput() {
  symOpen.value = true;
  orderError.value = '';
  const q = symQuery.value.trim();
  const exact = ALL.find(s => s.sym.toUpperCase() === q.toUpperCase());
  if (exact) {
    pickSym(exact);
    return;
  }
  if (!selected.value || q.toUpperCase() !== selected.value.sym.toUpperCase()) {
    clearSelection(true);
    symOpen.value = true;
  }
}

watch(() => props.open, async (o) => {
  if (o) {
    step.value = 'ticket';
    placing.value = false;
    orderId.value = '';
    fillPx.value = 0;
    placeStage.value = 0;
    resetIntent();
    clearSelection();
    if (props.preset) {
      const found = ALL.find(s => s.sym === props.preset!.sym);
      if (found) pickSym(found);
      else clearSelection();
      if (props.preset.side) side.value = props.preset.side;
    }
    await nextTick();
    symInput.value?.focus();
  }
});

watch(ordType, (v) => {
  if (v === 'MKT' && selected.value) px.value = +selected.value.price.toFixed(2);
});

function onMaskClick() {
  if (step.value === 'placing') return;
  onClose();
}
function onClose() {
  if (step.value === 'placing') return;
  emit('close');
}
function resetAndClose() {
  resetIntent();
  clearSelection();
  step.value = 'ticket';
}

async function placeOrder() {
  if (placing.value || step.value === 'placing') return;
  if (!selected.value || !canSubmit.value) return;
  placing.value = true;
  step.value = 'placing';
  placeStage.value = 0;
  await wait(420);
  placeStage.value = 1;
  await wait(640);
  placeStage.value = 2;
  await wait(380);

  if (!selected.value) {
    placing.value = false;
    return;
  }
  const slip = (Math.random() - 0.5) * 0.002;
  fillPx.value = +(px.value * (1 + slip)).toFixed(2);
  orderId.value = String(Math.floor(Math.random() * 90_000_000) + 10_000_000);

  const filled = portfolio.executeOrder({
    sym: selected.value.sym,
    name: selected.value.name,
    side: side.value,
    qty: qty.value,
    px: fillPx.value,
    fee: +estFee.value.toFixed(2),
    sector: selected.value.sector ?? selected.value.cat.toUpperCase(),
    note: tif.value === 'GTC' ? 'GTC' : '',
  });
  if (!filled) {
    step.value = 'ticket';
    orderError.value = sellValidationError.value || 'Order rejected';
    placing.value = false;
    return;
  }
  notifications.pushNotification({
    kind: 'order',
    sym: selected.value.sym,
    text: `${side.value} ${qty.value} ${selected.value.sym} @ ${fmtNum(fillPx.value)} filled`,
    time: 'now',
    unread: true,
  });

  step.value = 'filled';
  placing.value = false;
  emit('toast', `${side.value} ${qty.value} ${selected.value.sym} @ ${fmtNum(fillPx.value)}`);
}

function goPositions() {
  emit('navigate', 'positions');
  resetAndClose();
  emit('close');
}

function wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
</script>

<style scoped>
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.42); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 200;
  animation: fade .18s ease-out;
}
.ticket {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  width: 720px; max-width: 92vw; box-shadow: 0 24px 64px rgba(0,0,0,0.18);
  animation: rise .22s cubic-bezier(.2,.7,.2,1);
  overflow: hidden;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

.hd { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--border); }
.hd-l { display: flex; align-items: center; gap: 14px; }
.hd-ttl { font-size: 15px; font-weight: 600; }
.step-dots { display: flex; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--surface2); transition: all .25s; }
.dot.on { background: var(--accent); width: 20px; border-radius: 3px; }
.dot.done { background: var(--accent); opacity: .55; }
.x { background: transparent; border: 0; color: var(--fg-dim); font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.x:hover { background: var(--surface2); color: var(--fg); }

.body { padding: 22px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

.lab { display: block; font-size: 11px; color: var(--fg-dim); text-transform: uppercase; letter-spacing: .5px; margin: 14px 0 6px; font-weight: 500; }
.lab:first-child { margin-top: 0; }

.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  padding: 9px 12px; font-size: 13px; color: var(--fg); outline: none; font-family: inherit;
  transition: border .15s;
}
.inp:focus { border-color: var(--accent); }
.inp.big { font-size: 15px; padding: 11px 14px; font-weight: 500; }
.inp:disabled { opacity: .5; cursor: not-allowed; }

.sym-wrap { position: relative; }
.sym-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 12px; }
.sym-tag { background: var(--accent); color: #fff; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; letter-spacing: .4px; }
.sym-pop {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.12); z-index: 10; max-height: 280px; overflow: auto;
}
.sym-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; cursor: pointer; font-size: 13px; }
.sym-row:hover { background: var(--surface2); }
.sym-row + .sym-row { border-top: 1px solid var(--border); }

.side-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.side-btn {
  padding: 11px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; font-weight: 600; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.side-btn.buy.active { background: rgba(22,163,74,0.12); color: var(--up); border-color: var(--up); }
.side-btn.sell.active { background: rgba(220,38,38,0.10); color: var(--dn); border-color: var(--dn); }

.seg { display: inline-flex; background: var(--surface2); border-radius: 8px; padding: 3px; gap: 2px; }
.seg-btn {
  flex: 1; padding: 7px 14px; background: transparent; border: 0; border-radius: 6px;
  font-size: 12px; font-weight: 500; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.quote-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.quote-empty { background: var(--surface2); border: 1px dashed var(--border); border-radius: 10px; padding: 40px 16px; text-align: center; color: var(--fg-mute); font-size: 13px; }
.row-between { display: flex; justify-content: space-between; align-items: flex-start; }
.quote-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.qm-l { font-size: 10px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: .4px; }
.qm-v { font-size: 12px; margin-top: 2px; }

.summary { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.sum-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
.sum-row.dim { color: var(--fg-dim); font-size: 12px; }
.form-error {
  margin-top: 12px; padding: 8px 10px; border-radius: 8px;
  background: rgba(220,38,38,0.10); color: var(--dn);
  font-size: 12px; font-weight: 500;
}

/* Review */
.review { padding: 32px; text-align: center; }
.big-side { font-size: 28px; font-weight: 600; letter-spacing: -0.6px; margin-bottom: 22px; }
.big-side.buy { color: var(--up); }
.big-side.sell { color: var(--dn); }
.rev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; text-align: left; }
.rev-grid > div { display: flex; justify-content: space-between; padding: 13px 16px; font-size: 13px; background: var(--surface); }
.rev-grid > div span { color: var(--fg-dim); }
.rev-grid > div b { font-weight: 600; }
.rev-grid > div.span-2 { grid-column: span 2; }
.rev-grid > div.highlight { background: var(--surface2); font-size: 14px; }
.rev-grid > div.highlight b { font-size: 16px; }
.rev-grid > div.dim { color: var(--fg-dim); }
.rev-grid > div + div { border-top: 1px solid var(--border); }
.rev-grid > div:nth-child(odd):not(.span-2) + div:not(.span-2) { border-left: 1px solid var(--border); border-top: 1px solid var(--border); }
.rev-grid > div:nth-child(1), .rev-grid > div:nth-child(2) { border-top: 0; }

/* Placing */
.placing { padding: 56px 32px; text-align: center; }
.spinner {
  width: 44px; height: 44px; margin: 0 auto 24px; border-radius: 50%;
  border: 3px solid var(--surface2); border-top-color: var(--accent);
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
.placing-steps { display: inline-flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.p-step { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--fg-mute); transition: color .25s; }
.p-step.active { color: var(--fg); font-weight: 500; }
.p-step.done { color: var(--fg-dim); }
.p-mark { width: 18px; height: 18px; border-radius: 50%; background: var(--surface2); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
.p-step.done .p-mark { background: var(--accent); color: #fff; }
.p-step.active .p-mark { background: var(--accent); color: #fff; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.2) } }

/* Filled */
.filled { padding: 48px 32px; text-align: center; }
.check {
  width: 64px; height: 64px; border-radius: 50%; background: var(--up); color: #fff;
  font-size: 30px; display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 18px;
  animation: pop .45s cubic-bezier(.2,1.4,.4,1);
}
@keyframes pop { 0% { transform: scale(0) } 100% { transform: scale(1) } }
.filled-ttl { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; }
.filled-sub { color: var(--fg-dim); font-size: 13px; margin-top: 6px; }

/* Footer */
.ft { display: flex; justify-content: space-between; gap: 12px; padding: 16px 22px; border-top: 1px solid var(--border); background: var(--surface2); }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
.btn-accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.btn-accent:disabled { opacity: .4; cursor: not-allowed; }
.btn-accent.buy { background: var(--up); }
.btn-accent.sell { background: var(--dn); }
.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--fg); padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; }
.btn-ghost:hover { background: var(--surface); }
</style>
