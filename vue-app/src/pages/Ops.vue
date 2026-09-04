<template>
  <div class="page grid">
    <h2 style="grid-column: span 12; margin: 0">{{ t(lang, 'ops') }}</h2>
    <div v-for="s in sysStats" :key="s[0]" class="card stat">
      <div class="l">{{ s[0] }}</div>
      <div class="v num">{{ s[1] }}</div>
      <div class="bar"><div class="fill" :style="{ width: (s[2] * 100) + '%', background: s[2] > 0.7 ? '#f59e0b' : 'var(--accent)' }" /></div>
    </div>
    <div class="card stat health">
      <span class="hdot" />
      <div class="l">All services</div>
      <div class="v" style="color:var(--up)">Healthy</div>
    </div>

    <div class="card" style="grid-column: span 7; padding: 20px">
      <div class="ttl" style="margin-bottom:12px">{{ t(lang, 'syncOps') }}</div>
      <div v-if="currentJob" class="run-status">
        {{ lang === 'zh' ? '模擬執行中：' : 'Simulated run in progress: ' }}{{ currentJob.label }}
      </div>
      <div class="acts">
        <button v-for="action in actions" :key="action.key" class="act" :disabled="isBusy || !action.enabled" @click="openConfirm(action)">
          <div style="font-size:13px;font-weight:500">{{ t(lang, action.key) }}</div>
          <div style="font-size:11px;color:var(--fg-dim);margin-top:3px">{{ action.description }}</div>
        </button>
      </div>
    </div>

    <div class="card" style="grid-column: span 5; padding: 20px">
      <div class="ttl" style="margin-bottom:12px">{{ t(lang, 'oplog') }}</div>
      <div v-for="(o, i) in logs" :key="o.id" class="log" :style="{ borderTop: i ? '1px solid var(--border)' : '0' }">
        <span class="ldot" :style="{ background: o.status === 'success' ? 'var(--up)' : 'var(--dn)' }" />
        <div style="flex:1">
          <div style="font-weight:500">{{ o.operation }}</div>
          <div style="color:var(--fg-dim);font-size:11px;margin-top:2px">{{ formatLogTime(o.time) }} · {{ o.actor }} · {{ formatDuration(o.durationMs) }}</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="confirm" class="modal-mask" @click="closeConfirm">
        <div class="modal" @click.stop>
          <div class="m-ttl">{{ t(lang, 'confirmAction') }}</div>
          <div style="margin-top:8px;font-size:13px">{{ t(lang, confirm.k) }}</div>
          <div style="color:var(--fg-dim);font-size:12px;margin-top:4px">{{ confirm.d }}</div>
          <div style="display:flex;gap:8px;margin-top:18px">
            <button class="btn-ghost" style="flex:1" :disabled="isSubmitting" @click="closeConfirm">{{ t(lang, 'cancel') }}</button>
            <button class="btn-accent" style="flex:1" :disabled="isBusy" @click="run">{{ t(lang, 'run') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { t } from '../i18n';
import { getRuntimeApiClients } from '../services/pageApiClients';
import type { OpsActionDto, OpsJobDto, OpsLogDto } from '../services/apiTypes';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{ toast: [m: string] }>();
const opsApi = getRuntimeApiClients().ops;

const sysStats: [string, string, number][] = [
  ['CPU', '32%', 0.32], ['Memory', '6.2 / 16 GB', 0.39], ['JVM Heap', '1.8 / 4 GB', 0.45],
  ['DB connections', '12 / 50', 0.24], ['WebSocket', '847 active', 0.5],
];
const actions = ref<OpsActionDto[]>([]);
const logs = ref<OpsLogDto[]>([]);
const currentJob = ref<OpsJobDto | null>(null);
const confirm = ref<{ k: string; d: string } | null>(null);
const isSubmitting = ref(false);
const isBusy = computed(() => isSubmitting.value || Boolean(currentJob.value));

onMounted(() => {
  void refreshOpsData();
});

function formatLogTime(value: string) {
  return value.slice(0, 16).replace('T', ' ');
}

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function refreshOpsData() {
  try {
    const [nextActions, nextCurrentJob, nextLogs] = await Promise.all([
      opsApi.getActions(),
      opsApi.getCurrentJob(),
      opsApi.listLogs({ size: 30 }),
    ]);
    actions.value = nextActions;
    currentJob.value = nextCurrentJob;
    logs.value = nextLogs.items;
  } catch (error: any) {
    actions.value = [];
    currentJob.value = null;
    logs.value = [];
    emit('toast', error?.message || (props.lang === 'zh' ? 'Ops 載入失敗' : 'Ops load failed'));
  }
}

function openConfirm(action: OpsActionDto) {
  if (isBusy.value) return;
  confirm.value = { k: action.key, d: action.description };
}

function closeConfirm() {
  if (isSubmitting.value) return;
  confirm.value = null;
}

async function run() {
  const item = confirm.value;
  if (!item || isBusy.value) return;
  isSubmitting.value = true;
  confirm.value = null;
  const label = t(props.lang, item.k);
  try {
    const pendingJob = opsApi.triggerJob({
      actionKey: item.k,
      params: {},
      idempotencyKey: `ui-${Date.now()}-${item.k}`,
    });
    currentJob.value = await opsApi.getCurrentJob();
    const job = await pendingJob;
    currentJob.value = null;
    await refreshOpsData();
    emit('toast', `${job.status === 'success' ? '✓' : '✗'} ${label}`);
  } catch {
    currentJob.value = null;
    await refreshOpsData();
    emit('toast', `✗ ${label}`);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.page { padding: 22px; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.stat { grid-column: span 2; padding: 16px; }
.l { font-size: 11px; color: var(--fg-dim); }
.v { font-size: 16px; font-weight: 600; margin-top: 4px; }
.bar { height: 4px; background: var(--surface2); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.fill { height: 100%; }
.health { display: flex; flex-direction: column; justify-content: center; align-items: center; }
.hdot { width: 8px; height: 8px; border-radius: 50%; background: var(--up); margin-bottom: 6px; }
.health .v { color: var(--up); font-size: 13px; }
.ttl { font-size: 14px; font-weight: 600; }
.run-status {
  margin-bottom: 12px; border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--border));
  background: color-mix(in oklch, var(--accent) 8%, transparent);
  color: var(--accent); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; font-weight: 600;
}
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.act {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px; text-align: left; color: var(--fg);
}
.act:disabled, .btn-ghost:disabled, .btn-accent:disabled { opacity: .55; cursor: not-allowed; }
.log { display: flex; gap: 10px; padding: 8px 0; font-size: 12px; }
.ldot { width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 380px; padding: 22px; }
.m-ttl { font-size: 15px; font-weight: 600; }
.btn-ghost { background: var(--surface2); border: 0; padding: 9px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--fg); }
.btn-accent { background: var(--accent); color: #fff; border: 0; padding: 9px; border-radius: 6px; font-size: 13px; font-weight: 500; }
</style>
