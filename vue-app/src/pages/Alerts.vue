<template>
  <div class="page alerts-page">
    <!-- Header -->
    <div class="hdr-row">
      <div>
        <h2 style="margin:0">{{ t(lang, 'alerts') }}</h2>
        <div class="intro">{{ t(lang, 'alertsIntro') }}</div>
      </div>
      <button class="btn-accent" @click="openNew">
        <span class="btn-plus">+</span>
        {{ t(lang, 'addAlert') }}
        <kbd class="btn-kbd">A</kbd>
      </button>
    </div>

    <!-- KPI strip -->
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-l">{{ t(lang, 'activeAlerts') }}</div>
        <div class="kpi-v">{{ counts.active }}</div>
        <div class="kpi-bar"><span class="kpi-bar-fill" :style="{ width: barPct(counts.active) + '%', background: 'var(--accent)' }" /></div>
      </div>
      <div class="kpi">
        <div class="kpi-l">{{ t(lang, 'triggeredAlerts') }}</div>
        <div class="kpi-v" :style="{ color: counts.triggered > 0 ? 'var(--neg)' : 'var(--fg)' }">{{ counts.triggered }}</div>
        <div class="kpi-bar"><span class="kpi-bar-fill" :style="{ width: barPct(counts.triggered) + '%', background: 'var(--neg)' }" /></div>
      </div>
      <div class="kpi">
        <div class="kpi-l">{{ t(lang, 'mutedAlerts') }}</div>
        <div class="kpi-v" style="color: var(--fg-dim)">{{ counts.muted }}</div>
        <div class="kpi-bar"><span class="kpi-bar-fill" :style="{ width: barPct(counts.muted) + '%', background: 'var(--fg-dim)' }" /></div>
      </div>
      <div class="kpi">
        <div class="kpi-l">{{ t(lang, 'allTimeTriggered') }}</div>
        <div class="kpi-v">{{ counts.fires }}</div>
        <div class="kpi-spark">
          <span v-for="(c, i) in fireSpark" :key="i" class="kpi-bar2" :style="{ height: 4 + c * 14 + 'px', opacity: 0.4 + c * 0.6 }" />
        </div>
      </div>
    </div>

    <div class="grid-main">
      <!-- Alerts list -->
      <div class="card list-card">
        <div class="filter-row">
          <div class="chips">
            <button v-for="f in filters" :key="f.k"
              :class="['chip', { active: filter === f.k }]"
              @click="filter = f.k">
              {{ f.l }}<span class="chip-count">{{ f.n }}</span>
            </button>
          </div>
          <input v-model="search" :placeholder="t(lang, 'search')" class="srch" />
        </div>

        <div v-if="!filteredAlerts.length" class="empty">{{ t(lang, 'noAlerts') }}</div>

        <div v-else class="alerts-list">
          <div v-for="a in filteredAlerts" :key="a.id"
            :class="['alert-row', a.status]">
            <!-- Status pill -->
            <div class="al-status">
              <span :class="['dot', a.status]" />
              <span class="al-status-l">{{ statusLabel(a.status) }}</span>
            </div>

            <!-- Symbol + condition -->
            <div class="al-main">
              <div class="al-head">
                <span class="al-sym">{{ a.sym }}</span>
                <span class="al-name">{{ a.name }}</span>
              </div>
              <div class="al-cond">
                <span class="al-cond-text">{{ conditionText(a) }}</span>
                <span v-if="a.note" class="al-note">· {{ a.note }}</span>
              </div>
              <!-- Distance bar -->
              <div v-if="hasDistance(a)" class="dist">
                <div class="dist-l">{{ t(lang, 'distanceToTrigger') }}</div>
                <div class="dist-bar">
                  <div class="dist-fill" :style="{ width: distancePct(a) + '%', background: distanceColor(a) }" />
                  <div class="dist-marker" :style="{ left: distancePct(a) + '%' }" />
                </div>
                <div class="dist-vals">
                  <span class="num">{{ fmtNum(currentPrice(a)) }}</span>
                  <span class="num al-target">{{ fmtNum(a.target) }}</span>
                </div>
              </div>
            </div>

            <!-- Channels -->
            <div class="al-channels">
              <span v-for="ch in a.channels" :key="ch" :title="t(lang, channelKey(ch))" class="ch-pill">
                {{ channelIcon(ch) }}
              </span>
            </div>

            <!-- Trigger meta -->
            <div class="al-meta">
              <div v-if="a.lastTriggered" class="al-meta-row">
                <span class="al-meta-l">{{ t(lang, 'alertLastTriggered') }}</span>
                <span class="al-meta-v">{{ a.lastTriggered }}</span>
              </div>
              <div v-else class="al-meta-row">
                <span class="al-meta-l">{{ t(lang, 'alertCreated') }}</span>
                <span class="al-meta-v">{{ a.created }}</span>
              </div>
              <div v-if="a.triggerCount > 0" class="al-meta-row">
                <span class="al-meta-l">×</span>
                <span class="al-meta-v"><span class="num">{{ a.triggerCount }}</span></span>
              </div>
            </div>

            <!-- Actions -->
            <div class="al-actions">
              <button class="ico-btn" :title="a.status === 'muted' ? t(lang, 'unmute') : t(lang, 'mute')"
                @click="mockNotifications.toggleAlertMute(a.id)">
                <svg v-if="a.status === 'muted'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </button>
              <button class="ico-btn" :title="t(lang, 'editAlert')" @click="openEdit(a)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="ico-btn" :title="t(lang, 'deleteAlert')" @click="onDelete(a.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent triggers -->
      <div class="card events-card">
        <div class="events-head">
          <div class="ttl">{{ t(lang, 'recentTriggers') }}</div>
        </div>
        <div class="events-list">
          <div v-for="ev in recentEvents" :key="ev.id" class="ev-row" :class="{ unread: !ev.read }">
            <div class="ev-time">{{ relTime(ev.time) }}</div>
            <div class="ev-body">
              <span class="ev-sym">{{ ev.sym }}</span>
              <span class="ev-cond">{{ eventText(ev) }}</span>
            </div>
            <span v-if="!ev.read" class="ev-dot" />
          </div>
        </div>
      </div>
    </div>

    <!-- Form modal -->
    <Teleport to="body">
      <div v-if="formOpen" class="modal-mask" @click="formOpen = false">
        <div class="modal" @click.stop>
          <div class="modal-head">
            <span class="modal-title">{{ editingId ? t(lang, 'editAlert') : t(lang, 'addAlert') }}</span>
            <button class="modal-close" @click="formOpen = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <label class="lbl">{{ t(lang, 'symbol') }}
                <select v-model="form.sym" class="inp">
                  <option v-for="s in allSymbols" :key="s.sym" :value="s.sym">{{ s.sym }} — {{ s.name }}</option>
                </select>
              </label>

              <label class="lbl">{{ t(lang, 'alertCondition') }}
                <select v-model="form.condition" class="inp" @change="formError = ''">
                  <option v-for="c in conditions" :key="c" :value="c">{{ t(lang, condKey(c)) }}</option>
                </select>
              </label>

              <label v-if="needsTarget" class="lbl">
                {{ targetLabel }}
                <input v-model.number="form.target" type="number" :step="targetStep" class="inp" @input="formError = ''" />
              </label>

              <label v-if="needsWindow" class="lbl">{{ t(lang, 'alertWindow') }}
                <select v-model="form.window" class="inp">
                  <option value="1h">1h</option>
                  <option value="24h">24h</option>
                  <option value="1w">1w</option>
                </select>
              </label>

              <div class="lbl" style="grid-column: 1 / -1">
                <span style="font-size:11px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;display:block">{{ t(lang, 'alertChannels') }}</span>
                <div class="ch-row">
                  <button v-for="ch in ALL_CHANNELS" :key="ch"
                    :class="['ch-toggle', { on: form.channels.includes(ch) }]"
                    @click="toggleChannel(ch)">
                    <span class="ch-icon">{{ channelIcon(ch) }}</span>
                    <span>{{ t(lang, channelKey(ch)) }}</span>
                  </button>
                </div>
              </div>

              <label class="lbl" style="grid-column: 1 / -1">{{ t(lang, 'notes') }}
                <input v-model="form.note" type="text" class="inp" />
              </label>
            </div>

            <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>

            <!-- Preview -->
            <div class="preview">
              <div class="prev-l">{{ t(lang, 'preview') }}</div>
              <div class="prev-text">{{ previewText }}</div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn-ghost" @click="formOpen = false">{{ t(lang, 'cancel') }}</button>
            <button class="btn-accent" @click="saveForm">{{ t(lang, 'save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { t } from '../i18n';
import { SYMBOLS, CRYPTO, FX, BONDS, fmtNum } from '../data';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import type { Lang, Alert, AlertCondition, AlertChannel, AlertEvent, AlertStatus } from '../types';

const props = defineProps<{ lang: Lang }>();
const mockNotifications = useMockNotificationsStore();

const filter = ref<'all' | 'active' | 'triggered' | 'muted'>('all');
const search = ref('');
const formOpen = ref(false);
const editingId = ref<string | null>(null);
const formError = ref('');

const conditions: AlertCondition[] = ['above', 'below', 'cross_up', 'cross_down', 'pct_up', 'pct_down', 'vol_spike', 'news'];
const ALL_CHANNELS: AlertChannel[] = ['push', 'email', 'sound'];

const form = reactive<{
  sym: string;
  condition: AlertCondition;
  target: number;
  window: string;
  channels: AlertChannel[];
  note: string;
}>({
  sym: 'AAPL',
  condition: 'above',
  target: 220,
  window: '24h',
  channels: ['push'],
  note: '',
});

const allSymbols = computed(() => [...SYMBOLS, ...CRYPTO, ...FX, ...BONDS]);

function findSymInfo(sym: string) {
  return allSymbols.value.find(s => s.sym === sym);
}
function symCat(sym: string): Alert['cat'] {
  const s = findSymInfo(sym);
  return (s?.cat ?? 'stock') as Alert['cat'];
}
function symName(sym: string): string {
  return findSymInfo(sym)?.name ?? sym;
}

const counts = computed(() => ({
  active: mockNotifications.alerts.filter(a => a.status === 'active').length,
  triggered: mockNotifications.alerts.filter(a => a.status === 'triggered').length,
  muted: mockNotifications.alerts.filter(a => a.status === 'muted').length,
  fires: mockNotifications.alerts.reduce((s, a) => s + a.triggerCount, 0),
}));

const filters = computed(() => [
  { k: 'all', l: props.lang === 'zh' ? '全部' : 'All', n: mockNotifications.alerts.length },
  { k: 'active', l: t(props.lang, 'activeStatus'), n: counts.value.active },
  { k: 'triggered', l: t(props.lang, 'triggeredStatus'), n: counts.value.triggered },
  { k: 'muted', l: t(props.lang, 'mutedStatus'), n: counts.value.muted },
] as const);

const filteredAlerts = computed(() => {
  let xs = [...mockNotifications.alerts];
  if (filter.value !== 'all') xs = xs.filter(a => a.status === filter.value);
  if (search.value.trim()) {
    const s = search.value.trim().toLowerCase();
    xs = xs.filter(a =>
      a.sym.toLowerCase().includes(s)
      || a.name.toLowerCase().includes(s)
      || (a.note ?? '').toLowerCase().includes(s));
  }
  // Triggered first, active next, muted last
  const order: Record<AlertStatus, number> = { triggered: 0, active: 1, muted: 2 };
  xs.sort((a, b) => order[a.status] - order[b.status]);
  return xs;
});

const recentEvents = computed<AlertEvent[]>(() =>
  [...mockNotifications.alertEvents]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 10)
);

const fireSpark = computed(() => {
  // last 8 days fire counts
  const buckets = new Array(8).fill(0);
  const today = new Date('2026-04-30T00:00:00');
  mockNotifications.alertEvents.forEach(ev => {
    const d = new Date(ev.time.replace(' ', 'T'));
    const days = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (days >= 0 && days < 8) buckets[7 - days]++;
  });
  const max = Math.max(1, ...buckets);
  return buckets.map(b => b / max);
});

function barPct(n: number): number {
  const total = Math.max(1, mockNotifications.alerts.length);
  return Math.round((n / total) * 100);
}

// === Conditions ===
function condKey(c: AlertCondition): string {
  return ({
    above: 'condAbove', below: 'condBelow',
    cross_up: 'condCrossUp', cross_down: 'condCrossDown',
    pct_up: 'condPctUp', pct_down: 'condPctDown',
    vol_spike: 'condVolSpike', news: 'condNews',
  } as const)[c];
}

function conditionText(a: Alert): string {
  const cond = t(props.lang, condKey(a.condition));
  if (a.condition === 'news') return cond;
  if (a.condition === 'vol_spike') {
    return `${cond} ${a.target}% (${a.window ?? '1h'})`;
  }
  if (a.condition === 'pct_up' || a.condition === 'pct_down') {
    return `${cond} ${a.target}% (${a.window ?? '24h'})`;
  }
  return `${cond} ${fmtNum(a.target)}`;
}

function hasDistance(a: Alert): boolean {
  return a.condition === 'above' || a.condition === 'below'
      || a.condition === 'cross_up' || a.condition === 'cross_down';
}

function currentPrice(a: Alert): number {
  const info = findSymInfo(a.sym);
  return info && 'price' in info ? info.price : a.target;
}

function distancePct(a: Alert): number {
  const cur = currentPrice(a);
  const tgt = a.target;
  // Render as how close current is to target
  const span = Math.max(Math.abs(tgt - cur), tgt * 0.05);
  if (a.condition === 'above' || a.condition === 'cross_up') {
    // 0% when far below, 100% when at or above target
    if (cur >= tgt) return 100;
    return Math.max(5, 100 - (tgt - cur) / span * 100);
  } else {
    if (cur <= tgt) return 100;
    return Math.max(5, 100 - (cur - tgt) / span * 100);
  }
}

function distanceColor(a: Alert): string {
  const p = distancePct(a);
  if (p >= 95) return 'var(--neg)';
  if (p >= 70) return 'var(--accent)';
  return 'var(--fg-dim)';
}

// === Channels ===
function channelKey(ch: AlertChannel): string {
  return ({ push: 'chPush', email: 'chEmail', sound: 'chSound' } as const)[ch];
}
function channelIcon(ch: AlertChannel): string {
  return ({ push: '🔔', email: '✉', sound: '🔊' } as const)[ch];
}

function toggleChannel(ch: AlertChannel) {
  formError.value = '';
  const idx = form.channels.indexOf(ch);
  if (idx >= 0) form.channels.splice(idx, 1);
  else form.channels.push(ch);
}

function statusLabel(s: AlertStatus): string {
  return t(props.lang, s + 'Status');
}

function eventText(ev: AlertEvent): string {
  const cond = t(props.lang, condKey(ev.condition));
  if (ev.condition === 'news') return cond;
  if (ev.condition === 'pct_up' || ev.condition === 'pct_down') {
    return `${cond} ${ev.target}% (actual ${ev.actual.toFixed(2)}%)`;
  }
  return `${cond} ${fmtNum(ev.target)} (${fmtNum(ev.actual)})`;
}

function relTime(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  const today = new Date('2026-04-30T12:00:00');
  const diff = (today.getTime() - d.getTime()) / 1000;
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// === Form ===
const needsTarget = computed(() => form.condition !== 'news');
const needsWindow = computed(() =>
  form.condition === 'pct_up' || form.condition === 'pct_down' || form.condition === 'vol_spike');

const targetLabel = computed(() => {
  if (form.condition === 'pct_up' || form.condition === 'pct_down') return '%';
  if (form.condition === 'vol_spike') return '%';
  return t(props.lang, 'price');
});
const targetStep = computed(() => form.condition === 'pct_up' || form.condition === 'pct_down' || form.condition === 'vol_spike' ? 0.5 : 1);

function alertFormError(): string {
  if (form.channels.length === 0) {
    return props.lang === 'zh' ? '請至少選擇一個通知管道' : 'Select at least one channel';
  }
  if (needsTarget.value) {
    const target = Number(form.target);
    if (!Number.isFinite(target) || target <= 0) {
      return props.lang === 'zh' ? '請輸入大於 0 的目標值' : 'Enter a target greater than 0';
    }
  }
  return '';
}

const previewText = computed(() => {
  const a: Alert = {
    id: '_preview', sym: form.sym, name: symName(form.sym),
    cat: symCat(form.sym),
    condition: form.condition, target: form.target,
    window: form.window, status: 'active',
    channels: form.channels, created: '', triggerCount: 0,
  };
  return `${a.sym} · ${conditionText(a)}`;
});

function openNew() {
  editingId.value = null;
  formError.value = '';
  form.sym = 'AAPL';
  form.condition = 'above';
  form.target = 220;
  form.window = '24h';
  form.channels = ['push'];
  form.note = '';
  formOpen.value = true;
}

function openEdit(a: Alert) {
  editingId.value = a.id;
  formError.value = '';
  form.sym = a.sym;
  form.condition = a.condition;
  form.target = a.target;
  form.window = a.window ?? '24h';
  form.channels = [...a.channels];
  form.note = a.note ?? '';
  formOpen.value = true;
}

function saveForm() {
  const error = alertFormError();
  if (error) {
    formError.value = error;
    return;
  }
  const target = needsTarget.value ? Number(form.target) : 0;
  const payload = {
    sym: form.sym,
    name: symName(form.sym),
    cat: symCat(form.sym),
    condition: form.condition,
    target,
    window: needsWindow.value ? form.window : undefined,
    channels: [...form.channels],
    note: form.note || undefined,
  };
  const saved = editingId.value
    ? mockNotifications.updateAlert(editingId.value, payload)
    : mockNotifications.addAlert(payload);
  if (!saved) {
    formError.value = props.lang === 'zh' ? '請確認警示設定' : 'Check alert settings';
    return;
  }
  formOpen.value = false;
}

function onDelete(id: string) {
  mockNotifications.removeAlert(id);
}

// "a" hotkey to open new alert
function onKey(e: KeyboardEvent) {
  if (formOpen.value) return;
  const tgt = e.target as HTMLElement;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    openNew();
  }
}
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.alerts-page { padding: 24px; max-width: 1320px; margin: 0 auto; }
.hdr-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.intro { color: var(--fg-dim); font-size: 13px; max-width: 640px; margin-top: 4px; line-height: 1.5; }

.btn-accent {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-radius: 8px;
  background: var(--accent); color: white; border: 0;
  font-size: 13px; font-weight: 600;
  white-space: nowrap; transition: filter 0.12s, transform 0.12s;
}
.btn-accent:hover { filter: brightness(1.08); }
.btn-accent:active { transform: scale(0.98); }
.btn-plus { font-size: 16px; line-height: 1; opacity: 0.9; }
.btn-kbd {
  font-size: 10px; padding: 1px 5px;
  background: rgba(255,255,255,0.18); border-radius: 3px;
  font-family: ui-monospace, monospace;
}

.kpi-row {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  margin-bottom: 22px;
}
.kpi {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px 18px;
}
.kpi-l {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--fg-mute); font-weight: 600; margin-bottom: 8px;
}
.kpi-v {
  font-size: 28px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px; line-height: 1;
}
.kpi-bar {
  height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden;
}
.kpi-bar-fill {
  display: block; height: 100%;
  transition: width 0.4s ease-out;
}
.kpi-spark {
  display: flex; align-items: flex-end; gap: 3px; height: 16px;
}
.kpi-bar2 { width: 6px; background: var(--accent); border-radius: 1px; }

.grid-main {
  display: grid; grid-template-columns: 2.4fr 1fr; gap: 18px;
}

.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px;
}

/* List */
.list-card { display: flex; flex-direction: column; min-width: 0; }
.filter-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--border); background: transparent;
  color: var(--fg-dim); font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.chip:hover { background: var(--surface2); color: var(--fg); }
.chip.active { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.chip-count {
  font-size: 10px; opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.srch {
  margin-left: auto; padding: 6px 12px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; color: var(--fg); font-size: 12px;
  width: 200px; outline: none;
}
.srch:focus { border-color: var(--accent); }

.empty {
  padding: 60px 20px; text-align: center;
  color: var(--fg-dim); font-size: 13px;
}

.alerts-list { display: flex; flex-direction: column; }
.alert-row {
  display: grid;
  grid-template-columns: 96px 1fr 88px 160px 96px;
  gap: 16px; align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.alert-row:last-child { border-bottom: 0; }
.alert-row:hover { background: var(--surface2); }
.alert-row.muted { opacity: 0.6; }
.alert-row.triggered::before {
  content: ''; position: absolute; left: 0; width: 3px; height: 100%;
  background: var(--neg);
}
.alert-row.triggered { position: relative; }

.al-status { display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.active { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent); animation: pulse 2.4s infinite; }
.dot.triggered { background: var(--neg); }
.dot.muted { background: var(--fg-dim); }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--accent) 0%, transparent); }
}
.al-status-l { font-size: 11px; font-weight: 600; color: var(--fg-dim); }

.al-main { min-width: 0; }
.al-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.al-sym { font-weight: 600; font-size: 14px; }
.al-name { color: var(--fg-dim); font-size: 12px; }
.al-cond { font-size: 12.5px; color: var(--fg); margin-bottom: 8px; }
.al-cond-text { font-weight: 500; }
.al-note { color: var(--fg-mute); font-size: 12px; }

.dist { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; }
.dist-l { font-size: 10px; color: var(--fg-mute); text-transform: uppercase; letter-spacing: 0.5px; }
.dist-bar {
  position: relative; height: 6px;
  background: var(--surface2); border-radius: 3px;
}
.dist-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  border-radius: 3px;
  transition: width 0.4s ease-out, background 0.3s;
}
.dist-marker {
  position: absolute; top: -3px; width: 2px; height: 12px;
  background: var(--fg); border-radius: 1px;
  transform: translateX(-50%);
}
.dist-vals { display: flex; gap: 12px; font-size: 11px; }
.al-target { color: var(--accent); font-weight: 600; }

.num { font-variant-numeric: tabular-nums; }

.al-channels { display: flex; gap: 4px; }
.ch-pill {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 6px;
  background: var(--surface2); font-size: 13px;
}

.al-meta { font-size: 11px; }
.al-meta-row { display: flex; gap: 8px; }
.al-meta-l { color: var(--fg-mute); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.al-meta-v { color: var(--fg-dim); }

.al-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ico-btn {
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--fg-dim); cursor: pointer; transition: all 0.15s;
}
.ico-btn:hover { background: var(--surface2); color: var(--fg); }

/* Events */
.events-card { padding: 0; }
.events-head { padding: 14px 18px; border-bottom: 1px solid var(--border); }
.ttl { font-weight: 600; font-size: 13px; }
.events-list { padding: 4px 0; max-height: 540px; overflow: auto; }
.ev-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.ev-row:last-child { border-bottom: 0; }
.ev-row.unread { background: color-mix(in oklab, var(--accent) 4%, transparent); }
.ev-time {
  font-size: 11px; color: var(--fg-mute);
  min-width: 32px; padding-top: 1px;
  font-variant-numeric: tabular-nums;
}
.ev-body { flex: 1; min-width: 0; }
.ev-sym { font-weight: 600; margin-right: 6px; }
.ev-cond { color: var(--fg-dim); }
.ev-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); margin-top: 5px; }

/* Modal */
.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 1050; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.modal {
  width: 540px; max-width: 92vw; max-height: 86vh;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 30px 80px rgba(0,0,0,0.4);
}
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--border); }
.modal-title { font-weight: 600; font-size: 14px; }
.modal-close { width: 28px; height: 28px; border-radius: 6px; background: transparent; border: 0; color: var(--fg-dim); font-size: 20px; line-height: 1; cursor: pointer; }
.modal-close:hover { background: var(--surface2); color: var(--fg); }
.modal-body { padding: 22px; overflow: auto; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.lbl { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--fg-dim); font-weight: 500; }
.inp {
  padding: 8px 10px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 7px;
  color: var(--fg); font-size: 13px; outline: none;
  transition: border-color 0.15s;
}
.inp:focus { border-color: var(--accent); }
.ch-row { display: flex; gap: 8px; }
.ch-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--fg-dim); font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.ch-toggle:hover { color: var(--fg); }
.ch-toggle.on {
  background: color-mix(in oklab, var(--accent) 12%, var(--surface));
  border-color: var(--accent); color: var(--accent);
}
.ch-icon { font-size: 14px; }

.form-error {
  margin-top: 14px; padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--neg) 34%, var(--border));
  border-radius: 7px; color: var(--neg);
  background: color-mix(in oklab, var(--neg) 8%, var(--surface));
  font-size: 12px; font-weight: 600;
}

.preview {
  margin-top: 18px; padding: 14px 16px;
  background: var(--surface2); border: 1px dashed var(--border);
  border-radius: 8px;
}
.prev-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fg-mute); font-weight: 600; margin-bottom: 6px; }
.prev-text { font-size: 13px; font-weight: 500; }

.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--border); background: var(--surface2); }
.btn-ghost {
  padding: 8px 14px; background: transparent; border: 1px solid var(--border);
  border-radius: 7px; color: var(--fg); font-size: 13px; cursor: pointer;
}
.btn-ghost:hover { background: var(--surface); }

@media (max-width: 1100px) {
  .grid-main { grid-template-columns: 1fr; }
  .alert-row { grid-template-columns: 80px 1fr 88px 80px; }
  .al-meta { display: none; }
}
</style>
