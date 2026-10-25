<template>
  <div class="page">
    <MockDataNotice :lang="lang" exception="mockDataNoticeExceptBaseCurrency" />
    <h2 style="margin:0 0 16px">{{ t(lang, 'settings') }}</h2>
    <div class="layout">
      <div class="sidebar">
        <button
          v-for="[k, ic] in tabs"
          :key="k"
          :class="['s-btn', { active: tab === k }]"
          :data-testid="`settings-tab-${k}`"
          @click="tab = k"
        >
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
            <SettingRow :label="t(lang, 'baseCurrency')" :sub="t(lang, 'baseCurrencySub')">
              <div class="ccy-field">
                <select
                  class="ccy-select"
                  data-testid="settings-base-currency"
                  :aria-label="t(lang, 'baseCurrency')"
                  :value="ccySelected"
                  :disabled="ccyBusy"
                  @change="onBaseCurrencyChange"
                >
                  <option v-for="code in BASE_CURRENCY_OPTIONS" :key="code" :value="code">
                    {{ code }} · {{ t(lang, 'currencyName' + code) }}
                  </option>
                </select>
                <span class="ccy-status" data-testid="settings-base-currency-status" role="status">{{ ccyStatusText }}</span>
                <div v-if="ccyError" class="ccy-error" data-testid="settings-base-currency-error" role="alert">
                  <span class="ccy-error-text">{{ t(lang, ccyError.messageKey) }}</span>
                  <span class="ccy-diag">
                    <span data-testid="settings-base-currency-error-code">{{ ccyError.code }}</span>
                    <span v-if="ccyError.traceId" data-testid="settings-base-currency-trace-id">
                      {{ t(lang, 'authRequestId') }} {{ ccyError.traceId }}
                    </span>
                  </span>
                  <button
                    v-if="ccyPhase === 'loadError'"
                    class="ccy-retry"
                    data-testid="settings-base-currency-retry"
                    @click="loadBaseCurrency"
                  >
                    {{ t(lang, 'authRetry') }}
                  </button>
                </div>
              </div>
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
import MockDataNotice from '../components/MockDataNotice.vue';
import { ref, reactive, computed, onMounted } from 'vue';
import { t } from '../i18n';
import type { Lang, NotificationPrefs, Theme } from '../types';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { useAiAccessSettings } from '../composables/useAiAccessSettings';
import SettingRow from '../components/SettingRow.vue';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { BASE_CURRENCY_OPTIONS } from '../services/profileApi';
import { bumpPortfolioRevision } from '../services/portfolioRevision';
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

// ───────────────────── 基準幣(PORT-09,D-03) ─────────────────────
// 這欄原本是靜默 no-op 的 <select>(鐵律 6)。現在經 profileApi 讀寫:API mode 走 GET /me 與
// PATCH /me/preferences,mock mode 走模組內狀態(選了會保留、零網路)。元件不碰 mock store、不自行 fetch。
const clients = getRuntimeApiClients();

type CurrencyPhase = 'loading' | 'loadError' | 'idle' | 'saving' | 'saved' | 'saveError';
const ccyPhase = ref<CurrencyPhase>('loading');
/** 後端(或 mock)確認過的值;未設定時後端預設 TWD,所以讀取完成前先以 TWD 顯示並 disabled。 */
const ccySaved = ref<string>(BASE_CURRENCY_OPTIONS[0]);
/** select 目前顯示的值:儲存中是使用者剛選的新值,失敗時回到 ccySaved。 */
const ccySelected = ref<string>(BASE_CURRENCY_OPTIONS[0]);

/** 只保留 i18n key、code 與 traceId:後端的 error.message 與 fields 的 value 一律不進 DOM。 */
interface CurrencyError {
  messageKey: string;
  code: string;
  traceId: string | null;
}
const ccyError = ref<CurrencyError | null>(null);

const ccyBusy = computed(() => ccyPhase.value !== 'idle' && ccyPhase.value !== 'saved' && ccyPhase.value !== 'saveError');
const ccyStatusText = computed(() => {
  if (ccyPhase.value === 'loading') return t(props.lang, 'loading');
  if (ccyPhase.value === 'saving') return t(props.lang, 'settingSaving');
  if (ccyPhase.value === 'saved') return t(props.lang, 'settingSaved');
  return '';
});

function diagnosticsOf(error: unknown): { code: string; traceId: string | null } {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'NETWORK_ERROR', traceId: null };
}

/** 儲存失敗的文案分派(UI-SPEC 基準幣表)。401 回傳 null:交給全域 SessionBanner,這裡不重複顯示。 */
function saveErrorKey(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return 'baseCurrencyErrNetwork';
  if (error.status === 401) return null;
  if (error.code === 'VALIDATION_FAILED' && error.fields && 'baseCurrency' in error.fields) {
    return 'baseCurrencyErrUnsupported';
  }
  if (error.code === 'AUTH_CSRF_TOKEN_INVALID' || error.code === 'AUTH_CSRF_TOKEN_MISSING') {
    return 'baseCurrencyErrCsrf';
  }
  if (error.status === 403) return 'baseCurrencyErrForbidden';
  return 'baseCurrencyErrUnknown';
}

async function loadBaseCurrency() {
  ccyPhase.value = 'loading';
  ccyError.value = null;
  try {
    const preferences = await clients.profile.getPreferences();
    ccySaved.value = preferences.baseCurrency;
    ccySelected.value = preferences.baseCurrency;
    ccyPhase.value = 'idle';
  } catch (error) {
    ccyError.value = { messageKey: 'loadFailed', ...diagnosticsOf(error) };
    ccyPhase.value = 'loadError';
  }
}

async function onBaseCurrencyChange(event: Event) {
  const next = (event.target as HTMLSelectElement).value;
  if (next === ccySaved.value) return;
  ccySelected.value = next;
  ccyError.value = null;
  ccyPhase.value = 'saving';
  try {
    const updated = await clients.profile.updateBaseCurrency(next);
    ccySaved.value = updated.baseCurrency;
    ccySelected.value = updated.baseCurrency;
    ccyPhase.value = 'saved';
    // 已掛載且顯示金額的頁會依此重讀(Settings 自己通常是唯一掛載的頁,故多半是無害的 no-op)。
    bumpPortfolioRevision('baseCurrency');
  } catch (error) {
    // 失敗一律回到已儲存值;PATCH 冪等,再選一次即重試,所以不放重試鈕。
    ccySelected.value = ccySaved.value;
    const messageKey = saveErrorKey(error);
    ccyError.value = messageKey ? { messageKey, ...diagnosticsOf(error) } : null;
    ccyPhase.value = 'saveError';
  }
}

onMounted(() => {
  void loadAiAccessData();
  void loadBaseCurrency();
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

/* 基準幣欄位(UI-SPEC §8):select + 狀態列直排、靠右 */
.ccy-field { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 280px; }
.ccy-select {
  min-height: 36px; padding: 8px 12px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-weight: 400;
  color: inherit; font-family: inherit;
}
.ccy-select:disabled { opacity: .6; cursor: not-allowed; }
.ccy-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ccy-status { font-size: 12px; color: var(--fg-dim); }
.ccy-status:empty { display: none; }
.ccy-error { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
.ccy-error-text { font-size: 12px; color: var(--dn); overflow-wrap: anywhere; }
.ccy-diag { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 10px; font-size: 12px; color: var(--fg-dim); }
.ccy-diag span { overflow-wrap: anywhere; }
.ccy-retry {
  min-height: 36px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.ccy-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

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
