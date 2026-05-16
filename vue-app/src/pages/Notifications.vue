<template>
  <div class="page">
    <div class="row-between" style="margin-bottom:18px">
      <div>
        <h2>{{ t(lang, 'notifications') }}</h2>
        <div class="sub">{{ lang === 'zh' ? '價格警示、訂單事件、系統通知 · 過去 90 天' : 'Price alerts, order events, system notifications · last 90 days' }}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost" @click="showRules = !showRules" :class="{ active: showRules }">
          ⚙ {{ lang === 'zh' ? '規則' : 'Rules' }}
        </button>
        <button class="btn-ghost" @click="saveRules" :class="{ active: savedRules }">
          {{ savedRules ? (lang === 'zh' ? '已儲存' : 'Saved') : (lang === 'zh' ? '儲存規則' : 'Save Rules') }}
        </button>
        <button class="btn-ghost" @click="mockNotifications.markAllNotificationsRead()">{{ t(lang, 'markRead') }}</button>
        <button class="btn-ghost" @click="clearAllNotifications">{{ t(lang, 'clearAll') }}</button>
      </div>
    </div>

    <!-- ===== Heatmap card ===== -->
    <div class="card padlg" style="margin-bottom:14px">
      <div class="row-between" style="margin-bottom:14px">
        <div>
          <div class="ttl">{{ lang === 'zh' ? '通知熱力圖' : 'Activity heatmap' }}</div>
          <div class="hint">
            {{ totalNotifs }} {{ lang === 'zh' ? '則通知 ·' : 'notifications ·' }}
            <span class="up">{{ peakDay.count }}</span> {{ lang === 'zh' ? '最高（' + peakDay.label + '）' : 'peak (' + peakDay.label + ')' }} ·
            {{ avgPerDay.toFixed(1) }} {{ lang === 'zh' ? '日均' : '/day avg' }}
          </div>
        </div>
        <div class="row" style="gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--fg-mute)">{{ lang === 'zh' ? '顯示' : 'Show' }}:</span>
          <div class="seg">
            <button :class="{on: hmFilter === 'all'}" @click="hmFilter = 'all'">{{ lang === 'zh' ? '全部' : 'All' }}</button>
            <button :class="{on: hmFilter === 'alert'}" @click="hmFilter = 'alert'"><i class="dot-c alert" />{{ lang === 'zh' ? '警示' : 'Alerts' }}</button>
            <button :class="{on: hmFilter === 'order'}" @click="hmFilter = 'order'"><i class="dot-c order" />{{ lang === 'zh' ? '訂單' : 'Orders' }}</button>
            <button :class="{on: hmFilter === 'system'}" @click="hmFilter = 'system'"><i class="dot-c system" />{{ lang === 'zh' ? '系統' : 'System' }}</button>
          </div>
        </div>
      </div>

      <div class="hm-wrap">
        <!-- Day-of-week labels -->
        <div class="dow-col">
          <span></span>
          <span>Mon</span>
          <span></span>
          <span>Wed</span>
          <span></span>
          <span>Fri</span>
          <span></span>
        </div>

        <!-- Cells grid -->
        <div class="hm-grid">
          <!-- Month labels -->
          <div class="month-row">
            <span v-for="m in monthLabels" :key="m.k"
                  :style="{ gridColumnStart: m.col, gridColumnEnd: 'span ' + m.span }"
                  class="month-lbl">{{ m.label }}</span>
          </div>
          <!-- Cells -->
          <div class="cells">
            <div v-for="cell in cells" :key="cell.key"
                 class="hm-cell"
                 :class="[cell.empty ? 'empty' : '', 'lvl-' + cell.level, cell.dominant]"
                 :style="cell.empty ? '' : { background: cell.bg }"
                 @mouseenter="hover = cell"
                 @mouseleave="hover = null"
                 @click="cell.empty ? null : selectDay(cell)">
            </div>
          </div>
        </div>

        <!-- Hover tooltip -->
        <div v-if="hover && !hover.empty" class="hm-tip" :style="hoverTipStyle">
          <div style="font-weight:600;margin-bottom:4px">{{ hover.dateLabel }}</div>
          <div v-if="hover.count === 0" class="hint">{{ lang === 'zh' ? '無事件' : 'No events' }}</div>
          <template v-else>
            <div class="tip-row" v-if="hover.alerts > 0">
              <i class="dot-c alert" /><span>{{ hover.alerts }} {{ lang === 'zh' ? '警示' : 'alert' + (hover.alerts > 1 ? 's' : '') }}</span>
            </div>
            <div class="tip-row" v-if="hover.orders > 0">
              <i class="dot-c order" /><span>{{ hover.orders }} {{ lang === 'zh' ? '訂單' : 'order' + (hover.orders > 1 ? 's' : '') }}</span>
            </div>
            <div class="tip-row" v-if="hover.system > 0">
              <i class="dot-c system" /><span>{{ hover.system }} {{ lang === 'zh' ? '系統' : 'system' }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Legend -->
      <div class="legend">
        <span style="color:var(--fg-mute);font-size:11px">{{ lang === 'zh' ? '少' : 'Less' }}</span>
        <i v-for="lv in [0, 1, 2, 3, 4]" :key="lv" :class="['lg-cell', 'lvl-' + lv]" />
        <span style="color:var(--fg-mute);font-size:11px">{{ lang === 'zh' ? '多' : 'More' }}</span>
        <span style="margin-left:24px;color:var(--fg-mute);font-size:11px">{{ lang === 'zh' ? '主色 = 當日最多的事件類型' : 'Hue = dominant event type' }}</span>
      </div>
    </div>

    <!-- ===== Rules editor (collapsible) ===== -->
    <div v-if="showRules" class="card padlg" style="margin-bottom:14px">
      <div class="row-between" style="margin-bottom:14px">
        <div class="ttl">{{ lang === 'zh' ? '通知規則' : 'Notification rules' }}</div>
        <button class="btn-ghost sm" @click="showRules = false">✕</button>
      </div>

      <div class="rules-grid">
        <div class="rule-cat">
          <div class="rc-hd"><i class="dot-c alert" />{{ lang === 'zh' ? '價格警示' : 'Price alerts' }}</div>
          <label class="rule-row"><input type="checkbox" v-model="rules.alertCross"><span>{{ lang === 'zh' ? '突破設定價位' : 'Crosses threshold' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.alertVol"><span>{{ lang === 'zh' ? '異常成交量（>3σ）' : 'Volume spike (>3σ)' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.alertNews"><span>{{ lang === 'zh' ? '相關新聞' : 'Relevant news' }}</span></label>
        </div>
        <div class="rule-cat">
          <div class="rc-hd"><i class="dot-c order" />{{ lang === 'zh' ? '訂單事件' : 'Order events' }}</div>
          <label class="rule-row"><input type="checkbox" v-model="rules.orderFill"><span>{{ lang === 'zh' ? '成交' : 'Fill' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.orderPartial"><span>{{ lang === 'zh' ? '部分成交' : 'Partial fill' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.orderReject"><span>{{ lang === 'zh' ? '拒絕 / 失敗' : 'Reject / fail' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.orderStop"><span>{{ lang === 'zh' ? '停損 / 停利觸發' : 'Stop / take-profit triggered' }}</span></label>
        </div>
        <div class="rule-cat">
          <div class="rc-hd"><i class="dot-c system" />{{ lang === 'zh' ? '系統' : 'System' }}</div>
          <label class="rule-row"><input type="checkbox" v-model="rules.sysApi"><span>{{ lang === 'zh' ? 'API 金鑰將過期' : 'API key expiring' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.sysMargin"><span>{{ lang === 'zh' ? '保證金 / 餘額警示' : 'Margin / balance warning' }}</span></label>
          <label class="rule-row"><input type="checkbox" v-model="rules.sysAi"><span>{{ lang === 'zh' ? 'AI 提案需審核' : 'AI proposal pending review' }}</span></label>
        </div>
        <div class="rule-cat">
          <div class="rc-hd">🌙 {{ lang === 'zh' ? '安靜時段' : 'Quiet hours' }}</div>
          <label class="rule-row"><input type="checkbox" v-model="rules.quietEnable"><span>{{ lang === 'zh' ? '啟用' : 'Enable' }}</span></label>
          <div class="rule-row" style="opacity: 1">
            <span style="color:var(--fg-mute);font-size:11px">{{ lang === 'zh' ? '從' : 'From' }}</span>
            <input type="time" v-model="rules.quietFrom" class="time-in" :disabled="!rules.quietEnable" />
            <span style="color:var(--fg-mute);font-size:11px">{{ lang === 'zh' ? '到' : 'to' }}</span>
            <input type="time" v-model="rules.quietTo" class="time-in" :disabled="!rules.quietEnable" />
          </div>
          <div class="hint" style="font-size:10.5px;margin-top:4px">{{ lang === 'zh' ? '緊急通知（保證金、強平）仍會送達' : 'Critical alerts (margin call) still delivered' }}</div>
        </div>
      </div>
    </div>

    <!-- ===== Filter chips + day selection ===== -->
    <div class="filters">
      <button v-for="(c, i) in chips" :key="c.k" :class="['chip', { active: chip === c.k }]" @click="chip = c.k">
        {{ c.l }}
        <span class="chip-num">{{ c.n }}</span>
      </button>
      <div v-if="selectedDay" class="day-pin">
        📅 {{ selectedDay.dateLabel }}
        <button class="x" @click="selectedDay = null">✕</button>
      </div>
    </div>

    <!-- ===== Notifications list ===== -->
    <div class="card">
      <div v-for="(n, i) in filteredNotifs" :key="n.id" class="notif-row" :style="{ borderTop: i ? '1px solid var(--border)' : '0' }">
        <div class="ic" :class="n.kind">
          <span v-if="n.kind === 'alert'">🔔</span>
          <span v-else-if="n.kind === 'order'">📋</span>
          <span v-else-if="n.kind === 'news'">📰</span>
          <span v-else>⚙</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;line-height:1.4">
            <strong v-if="n.sym" class="mono">{{ n.sym }} · </strong>{{ n.text }}
          </div>
          <div style="font-size:11px;color:var(--fg-dim);margin-top:4px">{{ n.time }}</div>
        </div>
        <span v-if="n.unread" class="udot" />
      </div>
      <div v-if="filteredNotifs.length === 0" class="empty-state">
        {{ lang === 'zh' ? '此條件下沒有通知' : 'No notifications match this filter' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { t } from '../i18n';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import type { Lang, MockNotificationKind, NotificationPrefs } from '../types';

const props = defineProps<{ lang: Lang }>();
const mockNotifications = useMockNotificationsStore();

// =============== Heatmap data (90 days, from notification store) ===============
type Kind = MockNotificationKind;
type ActivityKind = Exclude<Kind, 'news'>;
interface DayData { date: Date; key: string; alerts: number; orders: number; system: number; count: number }

const HEATMAP_DAYS = 90;

function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const days = computed<DayData[]>(() => {
  const counts = new Map<string, Pick<DayData, 'alerts' | 'orders' | 'system'>>();
  mockNotifications.notifications.forEach(n => {
    const current = counts.get(n.dateKey) ?? { alerts: 0, orders: 0, system: 0 };
    if (n.kind === 'order') current.orders++;
    else if (n.kind === 'system') current.system++;
    else current.alerts++;
    counts.set(n.dateKey, current);
  });

  const out: DayData[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const dayCounts = counts.get(key) ?? { alerts: 0, orders: 0, system: 0 };
    out.push({
      date: d,
      key,
      alerts: dayCounts.alerts,
      orders: dayCounts.orders,
      system: dayCounts.system,
      count: dayCounts.alerts + dayCounts.orders + dayCounts.system,
    });
  }
  return out;
});

const totalNotifs = computed(() => days.value.reduce((s, d) => s + d.count, 0));
const avgPerDay = computed(() => totalNotifs.value / HEATMAP_DAYS);
const peakDay = computed(() => {
  const p = days.value.reduce((m, d) => d.count > m.count ? d : m, days.value[0]);
  return { count: p.count, label: fmtDate(p.date) };
});

// =============== Heatmap layout (week columns) ===============
type HmFilter = 'all' | ActivityKind;
const hmFilter = ref<HmFilter>('all');
const hover = ref<any>(null);
const selectedDay = ref<any>(null);

interface Cell { key: string; empty: boolean; level: number; bg: string; dominant: string; alerts: number; orders: number; system: number; count: number; date: Date; dateLabel: string }

const cells = computed<Cell[]>(() => {
  // Layout: 7 rows (Sun..Sat) × N columns (weeks).
  // First column has empty cells for days before earliest date.
  const ds = days.value;
  const firstDow = ds[0].date.getDay();
  const totalCells = firstDow + ds.length;
  const numWeeks = Math.ceil(totalCells / 7);
  const out: Cell[] = [];
  // Pad start
  for (let i = 0; i < firstDow; i++) {
    out.push({ key: 'pad-' + i, empty: true, level: 0, bg: '', dominant: '', alerts: 0, orders: 0, system: 0, count: 0, date: new Date(), dateLabel: '' });
  }
  for (const d of ds) {
    const filtered = filterCount(d);
    const level = levelFor(filtered);
    const dom = dominantOf(d);
    out.push({
      key: d.key, empty: false, level,
      bg: bgFor(level, dom),
      dominant: dom,
      alerts: d.alerts, orders: d.orders, system: d.system,
      count: filtered,
      date: d.date,
      dateLabel: fmtDate(d.date),
    });
  }
  // Pad end
  while (out.length < numWeeks * 7) {
    out.push({ key: 'pad-end-' + out.length, empty: true, level: 0, bg: '', dominant: '', alerts: 0, orders: 0, system: 0, count: 0, date: new Date(), dateLabel: '' });
  }
  return out;
});

function filterCount(d: DayData) {
  if (hmFilter.value === 'all') return d.count;
  if (hmFilter.value === 'alert') return d.alerts;
  if (hmFilter.value === 'order') return d.orders;
  return d.system;
}

function levelFor(n: number) {
  if (n === 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 9) return 3;
  return 4;
}

function dominantOf(d: DayData) {
  if (hmFilter.value !== 'all') return hmFilter.value;
  if (d.count === 0) return '';
  const arr = [['alert', d.alerts], ['order', d.orders], ['system', d.system]] as const;
  return arr.reduce((m, c) => c[1] > m[1] ? c : m)[0];
}

function bgFor(level: number, dom: string) {
  if (level === 0) return 'var(--surface2)';
  const colorMap: Record<string, string> = {
    alert: '239,68,68',    // red
    order: '99,102,241',   // accent indigo
    system: '59,130,246',  // blue
  };
  const c = colorMap[dom] || '99,102,241';
  const alpha = [0, 0.18, 0.36, 0.62, 0.92][level];
  return `rgba(${c},${alpha})`;
}

const monthLabels = computed(() => {
  // Compute which week-column each month-start lands in
  const out: { k: string; label: string; col: number; span: number }[] = [];
  const monthFmt = props.lang === 'zh'
    ? ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let lastMonth = -1;
  let weekIdx = 0;
  cells.value.forEach((c, i) => {
    if (i % 7 === 0) {
      // New week column starts. Look at first non-empty in this week
      const weekCells = cells.value.slice(i, i + 7).filter(c => !c.empty);
      if (weekCells.length === 0) { weekIdx++; return; }
      const m = weekCells[0].date.getMonth();
      if (m !== lastMonth) {
        if (out.length > 0) {
          out[out.length - 1].span = weekIdx + 1 - out[out.length - 1].col;
        }
        out.push({ k: weekIdx + '-' + m, label: monthFmt[m], col: weekIdx + 1, span: 1 });
        lastMonth = m;
      }
      weekIdx++;
    }
  });
  if (out.length > 0) out[out.length - 1].span = weekIdx + 1 - out[out.length - 1].col;
  return out;
});

const hoverTipStyle = computed(() => {
  if (!hover.value || hover.value.empty) return {};
  // Simple tooltip near top-right of heatmap
  return {};
});

function selectDay(cell: Cell) {
  selectedDay.value = selectedDay.value && selectedDay.value.key === cell.key ? null : cell;
}

function clearAllNotifications() {
  selectedDay.value = null;
  hover.value = null;
  mockNotifications.clearNotifications();
}

function fmtDate(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (props.lang === 'zh') return `${m}/${day}`;
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${day}`;
}

// =============== Rules ===============
const showRules = ref(false);
const savedRules = ref(false);
const rules = ref<NotificationPrefs>({ ...mockNotifications.notificationPrefs });
let saveRulesTimer: ReturnType<typeof window.setTimeout> | undefined;

function saveRules() {
  mockNotifications.updateNotificationPrefs({ ...rules.value });
  savedRules.value = true;
  if (saveRulesTimer !== undefined) window.clearTimeout(saveRulesTimer);
  saveRulesTimer = window.setTimeout(() => {
    savedRules.value = false;
    saveRulesTimer = undefined;
  }, 1400);
}

onUnmounted(() => {
  if (saveRulesTimer !== undefined) window.clearTimeout(saveRulesTimer);
});

// =============== Notifications list ===============
type ChipKey = 'all' | 'unread' | ActivityKind;

const notifList = computed(() => mockNotifications.notifications);

function matchesActivityKind(kind: Kind, filterKind: ActivityKind): boolean {
  if (filterKind === 'alert') return kind === 'alert' || kind === 'news';
  return kind === filterKind;
}

function isActivityChip(value: ChipKey): value is ActivityKind {
  return value === 'alert' || value === 'order' || value === 'system';
}

const chip = ref<ChipKey>('all');
const chips = computed(() => {
  const all = notifList.value;
  return [
    { k: 'all' as ChipKey, l: props.lang === 'zh' ? '全部' : 'All', n: all.length },
    { k: 'unread' as ChipKey, l: props.lang === 'zh' ? '未讀' : 'Unread', n: all.filter(n => n.unread).length },
    { k: 'alert' as ChipKey, l: props.lang === 'zh' ? '警示' : 'Alerts', n: all.filter(n => matchesActivityKind(n.kind, 'alert')).length },
    { k: 'order' as ChipKey, l: props.lang === 'zh' ? '訂單' : 'Orders', n: all.filter(n => n.kind === 'order').length },
    { k: 'system' as ChipKey, l: props.lang === 'zh' ? '系統' : 'System', n: all.filter(n => n.kind === 'system').length },
  ];
});

const filteredNotifs = computed(() => {
  let list = notifList.value;
  if (selectedDay.value) list = list.filter(n => n.dateKey === selectedDay.value.key);
  if (chip.value === 'unread') return list.filter(n => n.unread);
  const activeChip = chip.value;
  if (isActivityChip(activeChip)) return list.filter(n => matchesActivityKind(n.kind, activeChip));
  return list;
});
</script>

<style scoped>
.page { padding: 22px 28px; }
.row-between { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }
.row { display: flex; align-items: center; }
.ttl { font-size: 13px; font-weight: 600; }
.hint { font-size: 11.5px; color: var(--fg-mute); margin-top: 2px; }
.up { color: var(--up); font-weight: 600; }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.padlg { padding: 18px 22px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.btn-ghost { background: var(--surface); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 12px; color: var(--fg); cursor: pointer; font-family: inherit; }
.btn-ghost:hover { border-color: var(--fg-mute); }
.btn-ghost.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-ghost.sm { padding: 3px 8px; font-size: 14px; }

.seg { display: inline-flex; background: var(--surface2); border-radius: 6px; padding: 2px; gap: 2px; }
.seg button { padding: 5px 10px; border: 0; background: transparent; color: var(--fg-mute); font-size: 11.5px; border-radius: 4px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit; }
.seg button.on { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.dot-c { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.dot-c.alert { background: rgba(239,68,68,0.92); }
.dot-c.order { background: rgba(99,102,241,0.92); }
.dot-c.system { background: rgba(59,130,246,0.92); }

/* ===== Heatmap ===== */
.hm-wrap { position: relative; display: flex; gap: 8px; padding: 4px 2px; }
.dow-col { display: grid; grid-template-rows: repeat(7, 14px); gap: 3px; padding-top: 22px; font-size: 10px; color: var(--fg-mute); }
.dow-col span { display: flex; align-items: center; height: 14px; }
.hm-grid { flex: 1; min-width: 0; }
.month-row { display: grid; grid-template-columns: repeat(14, 1fr); height: 18px; margin-bottom: 4px; }
.month-lbl { font-size: 10.5px; color: var(--fg-mute); }
.cells { display: grid; grid-template-rows: repeat(7, 14px); grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; }
.hm-cell { width: 100%; height: 14px; border-radius: 3px; cursor: pointer; transition: outline 0.1s; outline: 1px solid transparent; }
.hm-cell:hover:not(.empty) { outline: 1.5px solid var(--fg); }
.hm-cell.empty { background: transparent; cursor: default; }
.hm-cell.lvl-0:not(.empty) { background: var(--surface2); }

.hm-tip {
  position: absolute; right: 0; top: -4px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.08);
  font-size: 11.5px; min-width: 140px; pointer-events: none; z-index: 5;
}
.tip-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }

.legend { display: flex; align-items: center; gap: 4px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
.lg-cell { width: 12px; height: 12px; border-radius: 2px; background: var(--surface2); }
.lg-cell.lvl-1 { background: rgba(99,102,241,0.18); }
.lg-cell.lvl-2 { background: rgba(99,102,241,0.36); }
.lg-cell.lvl-3 { background: rgba(99,102,241,0.62); }
.lg-cell.lvl-4 { background: rgba(99,102,241,0.92); }

/* ===== Rules ===== */
.rules-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.rule-cat { background: var(--surface2); border-radius: 8px; padding: 14px 16px; }
.rc-hd { font-size: 12px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.rule-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12.5px; cursor: pointer; }
.rule-row input[type="checkbox"] { accent-color: var(--accent); cursor: pointer; }
.time-in { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 11.5px; font-family: inherit; color: var(--fg); }
.time-in:disabled { opacity: 0.4; }

/* ===== Filters / list ===== */
.filters { display: flex; gap: 6px; margin: 14px 0; flex-wrap: wrap; align-items: center; }
.chip {
  padding: 5px 12px; background: var(--surface); color: var(--fg-dim);
  border: 1px solid var(--border); border-radius: 99px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  font-family: inherit;
}
.chip:hover { border-color: var(--fg-mute); }
.chip.active { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.chip-num { font-size: 10.5px; padding: 1px 6px; border-radius: 8px; background: var(--surface2); color: var(--fg-mute); }
.chip.active .chip-num { background: rgba(255,255,255,0.18); color: inherit; }

.day-pin {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 8px 5px 12px; background: rgba(99,102,241,0.1);
  color: var(--accent); border: 1px solid rgba(99,102,241,0.3);
  border-radius: 99px; font-size: 12px; font-weight: 500;
}
.day-pin .x { background: transparent; border: 0; color: var(--accent); cursor: pointer; padding: 0 2px; font-size: 13px; }

.notif-row { display: flex; gap: 14px; padding: 14px 16px; align-items: flex-start; }
.notif-row .ic {
  width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 14px;
  background: var(--surface2);
}
.ic.alert { background: rgba(239,68,68,0.12); }
.ic.order { background: rgba(99,102,241,0.12); }
.ic.system { background: rgba(59,130,246,0.12); }
.ic.news { background: rgba(245,158,11,0.12); }
.udot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-top: 14px; flex-shrink: 0; }

.empty-state { padding: 40px 16px; text-align: center; color: var(--fg-mute); font-size: 13px; }
</style>
