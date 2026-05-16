<template>
  <div class="page">
    <h2 style="margin:0 0 16px">{{ t(lang, 'settings') }}</h2>
    <div class="layout">
      <div class="sidebar">
        <button v-for="[k, ic] in tabs" :key="k" :class="['s-btn', { active: tab === k }]" @click="tab = k">
          <span class="ic">{{ ic }}</span>{{ t(lang, k) }}
          <span v-if="k === 'aiAccess'" class="soon">{{ lang === 'zh' ? '預覽' : 'preview' }}</span>
        </button>
      </div>
      <div class="card">
        <!-- ───────────────────── PROFILE ───────────────────── -->
        <template v-if="tab === 'profile'">
          <div class="profile-head">
            <div class="avatar">JL</div>
            <div>
              <div style="font-size:16px;font-weight:600">Justin Lin</div>
              <div style="font-size:12px;color:var(--fg-dim)">justin.lin@example.com</div>
            </div>
            <button class="btn-ghost" style="margin-left:auto" disabled>
              {{ lang === 'zh' ? '頭像編輯預覽' : 'Avatar edit preview' }}
            </button>
          </div>
          <div v-for="[l, v] in profile" :key="l" class="field">
            <div class="field-l">{{ l }}</div>
            <div class="field-v">{{ v }}</div>
          </div>
        </template>

        <!-- ───────────────────── DISPLAY ───────────────────── -->
        <template v-else-if="tab === 'display'">
          <div class="rows">
            <SettingRow :label="t(lang, 'theme')" :sub="lang === 'zh' ? '淺色或深色顯示' : 'Light or dark display'">
              <div class="seg-pill">
                <button :class="{ active: theme === 'light' }" @click="emit('setTweak', { key: 'theme', value: 'light' })">
                  {{ lang === 'zh' ? '淺色' : 'Light' }}
                </button>
                <button :class="{ active: theme === 'dark' }" @click="emit('setTweak', { key: 'theme', value: 'dark' })">
                  {{ lang === 'zh' ? '深色' : 'Dark' }}
                </button>
              </div>
            </SettingRow>
            <SettingRow :label="t(lang, 'language')" :sub="lang === 'zh' ? '切換介面語系' : 'Switch interface language'">
              <div class="seg-pill">
                <button :class="{ active: lang === 'en' }" @click="emit('setTweak', { key: 'lang', value: 'en' })">
                  English
                </button>
                <button :class="{ active: lang === 'zh' }" @click="emit('setTweak', { key: 'lang', value: 'zh' })">
                  {{ lang === 'zh' ? '繁體中文' : 'Traditional Chinese' }}
                </button>
              </div>
            </SettingRow>
            <SettingRow :label="t(lang, 'currency')" sub="Default display currency">
              <select class="select"><option>USD</option><option>TWD</option><option>EUR</option></select>
            </SettingRow>
            <SettingRow :label="t(lang, 'numFormat')" sub="Decimal &amp; thousand separators">
              <span class="num">1,234.56</span>
            </SettingRow>
          </div>
        </template>

        <!-- ───────────────────── SECURITY ───────────────────── -->
        <template v-else-if="tab === 'security'">
          <div class="rows">
            <SettingRow :label="t(lang, 'changePassword')" sub="Update your account password">
              <button class="btn-ghost" disabled>{{ lang === 'zh' ? '密碼流程預覽' : 'Password flow preview' }}</button>
            </SettingRow>
            <SettingRow label="Two-factor authentication" sub="Off">
              <button class="btn-accent" disabled>{{ lang === 'zh' ? '雙因素驗證預覽' : '2FA preview' }}</button>
            </SettingRow>
            <SettingRow :label="t(lang, 'devices')" sub="3 active sessions">
              <button class="btn-ghost" disabled>{{ lang === 'zh' ? '裝置管理預覽' : 'Device management preview' }}</button>
            </SettingRow>
          </div>
        </template>

        <!-- ───────────────────── DATA SOURCES (read-only) ───────────────────── -->
        <template v-else-if="tab === 'providers'">
          <SettingsDataSources
            :lang="lang"
            :sources="sources"
            :read-keys="readKeys"
            :copied-id="copiedId"
            :provider-of="providerOf"
            :open-add="openAdd"
            :copy-key="copyKey"
            :test-key="testKey"
            :revoke-key="revokeKey"
          />
        </template>

        <!-- ───────────────────── BROKERS (write) ───────────────────── -->
        <template v-else-if="tab === 'brokers'">
          <SettingsBrokers
            :lang="lang"
            :broker-keys="brokerKeys"
            :copied-id="copiedId"
            :hitl-options="hitlOptions"
            :provider-of="providerOf"
            :open-add="openAdd"
            :copy-key="copyKey"
            :test-key="testKey"
            :revoke-key="revokeKey"
            :update-policy="updatePolicy"
          />
        </template>

        <!-- ───────────────────── AI ACCESS ───────────────────── -->
        <template v-else-if="tab === 'aiAccess'">
          <SettingsAiAccess
            :lang="lang"
            :copied-id="copiedId"
            :mcp-servers="mcpServers"
            :agents="agents"
            :calls="calls"
            :copy-text="copyText"
            :toggle-mcp-endpoint="toggleMcpEndpoint"
            :revoke-agent="revokeAgent"
          />
        </template>

        <!-- ───────────────────── NOTIFICATION PREFERENCES ───────────────────── -->
        <template v-else-if="tab === 'notifPref'">
          <SettingsNotificationPreferences
            :lang="lang"
            :notif-prefs="notifPrefs"
            :save-notif-prefs="saveNotifPrefs"
          />
        </template>

        <template v-else>
          <div style="color:var(--fg-dim);font-size:13px">{{ t(lang, tab) }} settings…</div>
        </template>
      </div>
    </div>

    <!-- ─── Add key modal ─── -->
    <div v-if="addOpen" class="modal-bg" @click.self="addOpen = false">
      <div class="modal">
        <div class="modal-h">
          <div style="font-size:15px;font-weight:600">
            {{ addMode === 'trade' ? t(lang, 'addBroker') : t(lang, 'addKey') }}
          </div>
          <button class="x" @click="addOpen = false">×</button>
        </div>
        <div class="modal-b">
          <div class="form-row">
            <label>Provider</label>
            <div class="prov-grid">
              <button v-for="p in filteredProviders" :key="p.id"
                      :class="['prov-chip', { active: draft.provider === p.id }]"
                      @click="draft.provider = p.id">
                <span class="prov-dot" :style="{ background: p.color }" />
                <span>{{ p.name }}</span>
                <span class="prov-tag">{{ p.kind }}</span>
              </button>
            </div>
          </div>
          <div class="form-row">
            <label>{{ t(lang, 'apiKey') }}</label>
            <input class="inp mono" v-model="draft.key" placeholder="sk_live_...">
          </div>
          <div class="form-row" v-if="addMode === 'trade'">
            <label>{{ t(lang, 'apiSecret') }}</label>
            <input class="inp mono" v-model="draft.secret" placeholder="••••••••" type="password">
          </div>
          <div class="form-row" v-if="addMode === 'trade'">
            <label>Environment</label>
            <div class="seg-pill" style="display:flex">
              <button :class="{ active: draft.env === 'sandbox' }" @click="draft.env = 'sandbox'" style="flex:1">{{ t(lang, 'sandbox') }}</button>
              <button :class="{ active: draft.env === 'live' }" @click="draft.env = 'live'" style="flex:1">{{ t(lang, 'livefeed') }}</button>
            </div>
          </div>
          <div class="form-row">
            <label>{{ t(lang, 'label') }} ({{ lang === 'zh' ? '選填' : 'optional' }})</label>
            <input class="inp" v-model="draft.label" :placeholder="lang === 'zh' ? '例：主帳戶' : 'e.g. Main account'">
          </div>
        </div>
        <div class="modal-f">
          <button class="btn-ghost" @click="addOpen = false">{{ t(lang, 'cancel') }}</button>
          <button class="btn-accent" :disabled="!draft.key" @click="saveKey()">{{ t(lang, 'save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { t } from '../i18n';
import type { Lang, NotificationPrefs, Theme } from '../types';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { useAiAccessSettings } from '../composables/useAiAccessSettings';
import SettingRow from '../components/SettingRow.vue';
import SettingsAiAccess from '../components/settings/SettingsAiAccess.vue';
import SettingsBrokers from '../components/settings/SettingsBrokers.vue';
import SettingsDataSources from '../components/settings/SettingsDataSources.vue';
import SettingsNotificationPreferences from '../components/settings/SettingsNotificationPreferences.vue';

type SettingsTweakPayload =
  | { key: 'theme'; value: Theme }
  | { key: 'lang'; value: Lang };

const props = defineProps<{ lang: Lang; theme?: Theme }>();
const emit = defineEmits<{
  toast: [m: string];
  setTweak: [payload: SettingsTweakPayload];
}>();

const mockNotifications = useMockNotificationsStore();
const notifPrefs = reactive<NotificationPrefs>({ ...mockNotifications.notificationPrefs });
const {
  sources,
  readKeys,
  brokerKeys,
  providerOf,
  hitlOptions,
  copiedId,
  copyKey,
  copyText,
  testKey,
  revokeKey,
  updatePolicy,
  addOpen,
  addMode,
  draft,
  filteredProviders,
  openAdd,
  saveKey,
  mcpServers,
  agents,
  calls,
  loadAiAccessData,
  toggleMcpEndpoint,
  revokeAgent,
} = useAiAccessSettings({
  lang: () => props.lang,
  emitToast: message => emit('toast', message),
});

function exposedNotificationPrefsPatch(): Partial<NotificationPrefs> {
  return {
    alertCross: notifPrefs.alertCross,
    alertVol: notifPrefs.alertVol,
    alertNews: notifPrefs.alertNews,
    orderFill: notifPrefs.orderFill,
    orderPartial: notifPrefs.orderPartial,
    orderReject: notifPrefs.orderReject,
    orderStop: notifPrefs.orderStop,
    quietEnable: notifPrefs.quietEnable,
    quietFrom: notifPrefs.quietFrom,
    quietTo: notifPrefs.quietTo,
  };
}

function saveNotifPrefs() {
  mockNotifications.updateNotificationPrefs(exposedNotificationPrefsPatch());
  emit('toast', props.lang === 'zh' ? '通知偏好已儲存' : 'Notification preferences saved');
}

const tabs: [string, string][] = [
  ['profile', '👤'],
  ['security', '🔒'],
  ['providers', '📡'],
  ['brokers', '💱'],
  ['aiAccess', '🤖'],
  ['notifPref', '🔔'],
  ['display', '🎨'],
  ['data', '💾'],
];
const tab = ref('brokers');

const profile = [
  ['Display name', 'Justin Lin'], ['Email', 'justin.lin@example.com'],
  ['Timezone', 'Asia/Taipei (UTC+8)'], [t(props.lang, 'language'), props.lang === 'zh' ? '繁體中文' : 'English'],
];

onMounted(() => {
  void loadAiAccessData();
});
</script>

<style scoped>
.page { padding: 22px; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; }
.layout { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
.sidebar { display: flex; flex-direction: column; gap: 2px; }
.s-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px; background: transparent; border: 0;
  color: var(--fg-dim); font-size: 13px; font-weight: 500; text-align: left;
  font-family: inherit; cursor: pointer; transition: all .15s;
}
.s-btn:hover { color: var(--fg); background: var(--surface2); }
.s-btn.active { background: var(--surface2); color: var(--fg); font-weight: 600; }
.ic { width: 18px; text-align: center; }
.soon {
  margin-left: auto; font-size: 9px; padding: 1px 5px; border-radius: 3px;
  background: color-mix(in oklch, var(--accent) 18%, transparent); color: var(--accent);
  text-transform: uppercase; letter-spacing: .4px; font-weight: 600;
}

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }

/* Profile */
.profile-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.avatar {
  width: 64px; height: 64px; border-radius: 50%; background: var(--surface2);
  display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;
}
.field { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--border); }
.field-l { font-size: 11px; color: var(--fg-dim); margin-bottom: 4px; }
.field-v { font-size: 13px; }
.rows { display: grid; gap: 16px; }

/* Buttons */
.btn-ghost {
  background: var(--surface2); border: 1px solid var(--border); padding: 6px 12px;
  border-radius: 6px; font-size: 12px; color: var(--fg); cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-ghost:disabled {
  opacity: .48; cursor: not-allowed; color: var(--fg-mute);
  border-color: var(--border); background: color-mix(in oklch, var(--surface2) 70%, transparent);
}
.btn-ghost:disabled:hover { border-color: var(--border); color: var(--fg-mute); }
.btn-ghost.danger:hover { border-color: var(--dn); color: var(--dn); }
.btn-accent {
  background: var(--accent); color: #fff; border: 0; padding: 7px 14px;
  border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.btn-accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.12); }
.btn-accent:disabled { opacity: .42; cursor: not-allowed; filter: grayscale(.25); }
.btn-accent:disabled:hover { transform: none; box-shadow: none; }
.seg-pill { display: inline-flex; gap: 4px; background: var(--surface2); padding: 3px; border-radius: 6px; }
.seg-pill button {
  padding: 5px 12px; background: transparent; color: var(--fg-dim); border: 0;
  border-radius: 4px; font-size: 12px; cursor: pointer; font-family: inherit;
  transition: all .15s;
}
.seg-pill button.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.seg-pill button:disabled { opacity: .45; cursor: not-allowed; }
.select { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; color: inherit; }

.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; padding: 7px 10px; font-size: 13px; color: var(--fg);
  font-family: inherit; transition: border-color .15s; box-sizing: border-box;
}
.inp:focus { outline: 0; border-color: var(--accent); }
.inp.mono { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; }

/* Modal */
.modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(2px); animation: fadeIn .15s ease-out;
}
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
.modal {
  width: min(520px, 92vw); background: var(--surface);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.25);
  display: flex; flex-direction: column;
  animation: slideUp .2s cubic-bezier(.2,.8,.2,1);
}
@keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.modal-h {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
}
.x {
  background: transparent; border: 0; font-size: 22px; line-height: 1;
  color: var(--fg-dim); cursor: pointer; padding: 0; width: 28px; height: 28px;
  border-radius: 6px;
}
.x:hover { background: var(--surface2); color: var(--fg); }
.modal-b { padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-f { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
.form-row label { display: block; font-size: 11px; color: var(--fg-dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .4px; font-weight: 500; }
.prov-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.prov-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--fg); cursor: pointer;
  font-family: inherit; transition: all .15s; text-align: left;
}
.prov-chip:hover { border-color: var(--accent); }
.prov-chip.active { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 8%, var(--surface2)); }
.prov-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.prov-tag { margin-left: auto; font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--surface); color: var(--fg-mute); text-transform: uppercase; letter-spacing: .3px; }
</style>
