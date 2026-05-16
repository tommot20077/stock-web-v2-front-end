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
          <div class="banner">
            <div class="banner-icon">i</div>
            <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'realtimeNote') }}</div>
          </div>

          <div class="sec-h">{{ t(lang, 'dataSources') }}</div>
          <div class="src-grid">
            <div v-for="s in sources" :key="s.id" class="src-card" :class="{ off: !s.enabled }">
              <div class="src-head">
                <div class="src-l">
                  <div class="src-icon" :style="{ background: s.color + '22', color: s.color }">{{ s.icon }}</div>
                  <div>
                    <div style="font-size:13px;font-weight:600">{{ lang === 'zh' ? s.zh : s.en }}</div>
                    <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">{{ lang === 'zh' ? s.descZh : s.descEn }}</div>
                  </div>
                </div>
                <label class="sw">
                  <input type="checkbox" v-model="s.enabled" :disabled="!s.available">
                  <span class="sw-track"></span>
                </label>
              </div>
              <div class="src-meta">
                <span class="chip" :class="s.feed">{{ t(lang, s.feed) }}</span>
                <span v-if="!s.available" class="chip warn">{{ lang === 'zh' ? '無公開接口' : 'No public API' }}</span>
                <span v-else-if="s.enabled && s.connected" class="chip ok">● {{ t(lang, 'connected') }}</span>
                <span v-else-if="s.enabled" class="chip mute">○ {{ t(lang, 'notConnected') }}</span>
                <span v-else class="chip mute">{{ t(lang, 'disabled') }}</span>
              </div>
            </div>
          </div>

          <div class="sec-h sec-row" style="margin-top:28px">
            <span>{{ t(lang, 'apiKeys') }}
              <span class="sec-h-sub">· {{ lang === 'zh' ? '唯讀來源' : 'read-only sources' }}</span>
            </span>
            <button class="btn-ghost" @click="openAdd('read')">+ {{ t(lang, 'addKey') }}</button>
          </div>
          <div style="font-size:11px;color:var(--fg-mute);margin-bottom:12px">{{ t(lang, 'envOnly') }}</div>

          <div v-if="readKeys.length === 0" class="empty">
            <div style="font-size:13px;color:var(--fg-dim)">{{ lang === 'zh' ? '尚未設定任何資料來源金鑰' : 'No data-source keys yet' }}</div>
          </div>
          <div v-else class="keys">
            <div v-for="k in readKeys" :key="k.id" class="key-row">
              <div class="key-l">
                <div class="key-icon" :style="{ background: providerOf(k.provider).color + '22', color: providerOf(k.provider).color }">
                  {{ providerOf(k.provider).short }}
                </div>
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span style="font-weight:600;font-size:13px">{{ providerOf(k.provider).name }}</span>
                    <span v-if="k.label" class="tag-mute">{{ k.label }}</span>
                    <span class="chip readonly">{{ t(lang, 'readOnly') }}</span>
                  </div>
                  <div class="key-mono">
                    <span>{{ k.show ? k.key : maskKey(k.key) }}</span>
                    <button class="micro" @click="k.show = !k.show">{{ k.show ? t(lang, 'hide') : t(lang, 'show') }}</button>
                    <button class="micro" @click="copyKey(k)">{{ copiedId === k.id ? '✓' : t(lang, 'copy') }}</button>
                  </div>
                  <div style="font-size:11px;color:var(--fg-mute);margin-top:4px">
                    {{ t(lang, 'rateLimit') }}: {{ providerOf(k.provider).rate }} {{ t(lang, 'requests') }} / {{ t(lang, 'perMinute') }}
                  </div>
                </div>
              </div>
              <div class="key-r">
                <button class="btn-ghost" :disabled="k.testing" @click="testKey(k)">
                  <span v-if="k.testing">{{ t(lang, 'testing') }}</span>
                  <span v-else-if="k.lastTest === 'ok'" style="color:var(--up)">✓ {{ t(lang, 'connected') }}</span>
                  <span v-else-if="k.lastTest === 'fail'" style="color:var(--dn)">! {{ lang === 'zh' ? '失敗' : 'Failed' }}</span>
                  <span v-else>{{ t(lang, 'testConnection') }}</span>
                </button>
                <button class="btn-ghost danger" @click="revokeKey(k)">{{ t(lang, 'revoke') }}</button>
              </div>
            </div>
          </div>
        </template>

        <!-- ───────────────────── BROKERS (write) ───────────────────── -->
        <template v-else-if="tab === 'brokers'">
          <div class="banner warn-banner">
            <div class="banner-icon warn-icon">!</div>
            <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'brokerNote') }}</div>
          </div>

          <div class="sec-h sec-row">
            <span>{{ t(lang, 'brokers') }}</span>
            <button class="btn-ghost" @click="openAdd('trade')">+ {{ t(lang, 'addBroker') }}</button>
          </div>

          <div v-if="brokerKeys.length === 0" class="empty">
            <div style="font-size:13px;color:var(--fg-dim)">{{ lang === 'zh' ? '尚未配置交易接口' : 'No brokers configured' }}</div>
          </div>
          <div v-else class="brokers">
            <div v-for="k in brokerKeys" :key="k.id" class="broker">
              <div class="broker-head">
                <div class="key-l">
                  <div class="key-icon" :style="{ background: providerOf(k.provider).color + '22', color: providerOf(k.provider).color }">
                    {{ providerOf(k.provider).short }}
                  </div>
                  <div style="min-width:0;flex:1">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span style="font-weight:600;font-size:14px">{{ providerOf(k.provider).name }}</span>
                      <span v-if="k.label" class="tag-mute">{{ k.label }}</span>
                      <span class="chip" :class="k.env">{{ k.env === 'live' ? t(lang, 'livefeed') : t(lang, 'sandbox') }}</span>
                      <span class="chip trade">{{ t(lang, 'tradingEnabled') }}</span>
                    </div>
                    <div class="key-mono">
                      <span>{{ k.show ? k.key : maskKey(k.key) }}</span>
                      <button class="micro" @click="k.show = !k.show">{{ k.show ? t(lang, 'hide') : t(lang, 'show') }}</button>
                      <button class="micro" @click="copyKey(k)">{{ copiedId === k.id ? '✓' : t(lang, 'copy') }}</button>
                    </div>
                    <div style="font-size:11px;color:var(--fg-mute);margin-top:4px">
                      {{ t(lang, 'lastUsed') }}: {{ k.lastUsedLabel || t(lang, 'neverUsed') }}
                    </div>
                  </div>
                </div>
                <div class="key-r">
                  <button class="btn-ghost" :disabled="k.testing" @click="testKey(k)">
                    <span v-if="k.testing">{{ t(lang, 'testing') }}</span>
                    <span v-else-if="k.lastTest === 'ok'" style="color:var(--up)">✓ {{ t(lang, 'connected') }}</span>
                    <span v-else-if="k.lastTest === 'fail'" style="color:var(--dn)">! {{ lang === 'zh' ? '失敗' : 'Failed' }}</span>
                    <span v-else>{{ t(lang, 'testConnection') }}</span>
                  </button>
                  <button class="btn-ghost danger" @click="revokeKey(k)">{{ t(lang, 'revoke') }}</button>
                </div>
              </div>

              <!-- HITL mode -->
              <div class="broker-section">
                <div class="bs-l">{{ t(lang, 'hitlMode') }}</div>
                <div class="hitl">
                  <button v-for="m in hitlOptions" :key="m.id"
                          :class="['hitl-card', { active: k.hitl === m.id, 'hitl-auto': m.id === 'auto' && k.hitl === 'auto' }]"
                          @click="updatePolicy(k, m.id)">
                    <div class="hitl-icon">{{ m.icon }}</div>
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;font-size:12px">{{ t(lang, m.tk) }}</div>
                      <div style="font-size:10px;color:var(--fg-mute);margin-top:2px;line-height:1.4">{{ t(lang, m.dk) }}</div>
                    </div>
                    <div class="radio" :class="{ on: k.hitl === m.id }"></div>
                  </button>
                </div>
              </div>

              <!-- Risk limits -->
              <div class="broker-section">
                <div class="bs-l">{{ t(lang, 'riskLimits') }}</div>
                <div class="risk-grid">
                  <div class="risk">
                    <div class="risk-l">{{ t(lang, 'maxSingle') }}</div>
                    <div class="risk-input">
                      <span class="risk-prefix">$</span>
                      <input class="inp inp-num" type="number" v-model.number="k.maxSingle" min="0" step="100">
                    </div>
                  </div>
                  <div class="risk">
                    <div class="risk-l">{{ t(lang, 'maxDaily') }}</div>
                    <div class="risk-input">
                      <span class="risk-prefix">$</span>
                      <input class="inp inp-num" type="number" v-model.number="k.maxDaily" min="0" step="1000">
                    </div>
                  </div>
                  <div class="risk">
                    <div class="risk-l">{{ t(lang, 'allowedSymbols') }}</div>
                    <input class="inp" v-model="k.allowed" :placeholder="lang === 'zh' ? '空 = 全部' : 'empty = all'">
                  </div>
                  <div class="risk">
                    <div class="risk-l">{{ t(lang, 'keyExpires') }}</div>
                    <input class="inp" v-model="k.expires" placeholder="2026-12-31">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ───────────────────── AI ACCESS ───────────────────── -->
        <template v-else-if="tab === 'aiAccess'">
          <div class="banner ai-banner">
            <div class="banner-icon ai-icon">✦</div>
            <div>
              <div style="font-size:13px;font-weight:600;margin-bottom:4px">{{ t(lang, 'aiAccess') }} <span class="soon-pill">{{ t(lang, 'preview') }}</span></div>
              <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'aiAccessIntro') }}</div>
            </div>
          </div>

          <div class="sec-h">{{ t(lang, 'mcpEndpoints') }}</div>
          <div class="mcp-list">
            <div v-for="m in mcpServers" :key="m.id" class="mcp" :class="m.kind">
              <div class="mcp-head">
                <div class="mcp-tag" :class="m.kind">{{ m.kind === 'read' ? t(lang, 'readonly') : m.kind === 'write' ? t(lang, 'risk') : 'admin' }}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:13px">{{ t(lang, m.tk) }}</div>
                  <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">{{ t(lang, m.dk) }}</div>
                </div>
                <label class="sw" :class="{ disabled: !m.editable }">
                  <input type="checkbox" v-model="m.enabled" :disabled="!m.editable" @change="toggleMcpEndpoint(m)">
                  <span class="sw-track"></span>
                </label>
              </div>
              <div class="mcp-url">
                <code>{{ m.url }}</code>
                <button class="micro" @click="copyText(m.url, m.id)">{{ copiedId === m.id ? '✓' : t(lang, 'copy') }}</button>
              </div>
              <div class="mcp-tools">
                <span v-for="(tool, i) in m.tools" :key="i" class="tool">{{ tool }}</span>
              </div>
            </div>
          </div>

          <div class="sec-h" style="margin-top:28px">{{ t(lang, 'connectedAgents') }}</div>
          <div class="agents">
            <div v-for="a in agents" :key="a.id" class="agent">
              <div class="agent-icon">{{ a.icon }}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px">{{ a.name }}</div>
                <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">
                  {{ a.scopes.join(' · ') }} · {{ t(lang, 'lastUsed') }} {{ a.last }}
                </div>
              </div>
              <span class="chip" :class="a.status">{{ a.status === 'live' ? '● ' + t(lang, 'connected') : '○ ' + t(lang, 'disabled') }}</span>
              <button class="btn-ghost danger" @click="revokeAgent(a)">{{ t(lang, 'revoke') }}</button>
            </div>
          </div>

          <div class="sec-h" style="margin-top:28px">{{ t(lang, 'recentCalls') }} <span class="sec-h-sub">· {{ lang === 'zh' ? '最近 24 小時' : 'last 24h' }}</span></div>
          <div class="audit">
            <div v-for="(c, i) in calls" :key="i" class="call">
              <div class="call-time">{{ c.t }}</div>
              <div class="call-agent">{{ c.agent }}</div>
              <div class="call-tool"><code>{{ c.tool }}</code></div>
              <div class="call-args" style="color:var(--fg-mute)">{{ c.args }}</div>
              <span class="chip" :class="c.ok ? 'ok' : 'warn'">{{ c.ok ? '✓' : '✗' }} {{ c.ms }}ms</span>
            </div>
          </div>

          <div class="sec-h" style="margin-top:28px">{{ t(lang, 'cliToken') }}</div>
          <div class="cli-card">
            <div class="cli-head">
              <code>$ resource login --token rsc_••••••••••••••••</code>
              <button class="micro">{{ t(lang, 'copy') }}</button>
            </div>
            <div style="font-size:11px;color:var(--fg-mute);margin-top:8px">
              {{ lang === 'zh' ? 'CLI 與 MCP 共用 token；scope 由 token 本身決定。' : 'CLI shares the token with MCP; scope determined by the token.' }}
            </div>
          </div>
        </template>

        <!-- ───────────────────── NOTIFICATION PREFERENCES ───────────────────── -->
        <template v-else-if="tab === 'notifPref'">
          <div class="pref-section">
            <div class="sec-h">{{ lang === 'zh' ? '價格警示' : 'Price alerts' }}</div>
            <div class="pref-grid">
              <label v-for="pref in priceAlertPrefs" :key="pref.key" class="pref-row">
                <input :name="pref.key" type="checkbox" v-model="notifPrefs[pref.key]">
                <span class="pref-copy">
                  <strong>{{ lang === 'zh' ? pref.zh : pref.en }}</strong>
                  <small>{{ lang === 'zh' ? pref.descZh : pref.descEn }}</small>
                </span>
              </label>
            </div>
          </div>

          <div class="pref-section">
            <div class="sec-h">{{ lang === 'zh' ? '訂單事件' : 'Order events' }}</div>
            <div class="pref-grid">
              <label v-for="pref in orderEventPrefs" :key="pref.key" class="pref-row">
                <input :name="pref.key" type="checkbox" v-model="notifPrefs[pref.key]">
                <span class="pref-copy">
                  <strong>{{ lang === 'zh' ? pref.zh : pref.en }}</strong>
                  <small>{{ lang === 'zh' ? pref.descZh : pref.descEn }}</small>
                </span>
              </label>
            </div>
          </div>

          <div class="pref-section">
            <div class="sec-h">{{ lang === 'zh' ? '安靜時段' : 'Quiet hours' }}</div>
            <div class="pref-grid quiet-grid">
              <label class="pref-row quiet-toggle">
                <input name="quietEnable" type="checkbox" v-model="notifPrefs.quietEnable">
                <span class="pref-copy">
                  <strong>{{ lang === 'zh' ? '啟用安靜時段' : 'Enable quiet hours' }}</strong>
                  <small>{{ lang === 'zh' ? '在指定時間只保留高優先通知' : 'Only priority notifications during the selected window' }}</small>
                </span>
              </label>
              <div class="pref-time">
                <label>
                  <span>{{ lang === 'zh' ? '開始' : 'From' }}</span>
                  <input name="quietFrom" class="inp" type="time" v-model="notifPrefs.quietFrom">
                </label>
                <label>
                  <span>{{ lang === 'zh' ? '結束' : 'To' }}</span>
                  <input name="quietTo" class="inp" type="time" v-model="notifPrefs.quietTo">
                </label>
              </div>
            </div>
          </div>

          <div class="pref-actions">
            <button class="btn-accent" @click="saveNotifPrefs">{{ t(lang, 'save') }}</button>
          </div>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { t } from '../i18n';
import type { Lang, NotificationPrefs, Theme } from '../types';
import { useMockNotificationsStore } from '../stores/mockNotifications';
import { createAiAccessApi } from '../services/aiAccessApi';
import { getRuntimeDataMode } from '../services/runtimeDataMode';
import type {
  AiAccessKeyDto,
  AiAgentDto,
  AiAuditCallDto,
  AiHitlMode,
  McpEndpointDto,
} from '../services/apiTypes';
import SettingRow from '../components/SettingRow.vue';

type SettingsTweakPayload =
  | { key: 'theme'; value: Theme }
  | { key: 'lang'; value: Lang };

const props = defineProps<{ lang: Lang; theme?: Theme }>();
const emit = defineEmits<{
  toast: [m: string];
  setTweak: [payload: SettingsTweakPayload];
}>();

const aiAccessApi = createAiAccessApi(getRuntimeDataMode());
const mockNotifications = useMockNotificationsStore();
const notifPrefs = reactive<NotificationPrefs>({ ...mockNotifications.notificationPrefs });

type BooleanNotificationPref = Exclude<keyof NotificationPrefs, 'quietFrom' | 'quietTo'>;
interface PrefToggle {
  key: BooleanNotificationPref;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
}

const priceAlertPrefs: PrefToggle[] = [
  { key: 'alertCross', zh: '價格穿越', en: 'Price crosses', descZh: '價格突破指定門檻', descEn: 'Threshold crossing alerts' },
  { key: 'alertVol', zh: '量能異常', en: 'Volume spikes', descZh: '量能放大或異常波動', descEn: 'Unusual volume alerts' },
  { key: 'alertNews', zh: '新聞提及', en: 'News mentions', descZh: '重大新聞與標的提及', descEn: 'Important news and symbol mentions' },
];

const orderEventPrefs: PrefToggle[] = [
  { key: 'orderFill', zh: '完全成交', en: 'Filled orders', descZh: '訂單完全成交時通知', descEn: 'Notify when orders fill' },
  { key: 'orderPartial', zh: '部分成交', en: 'Partial fills', descZh: '訂單部分成交時通知', descEn: 'Notify on partial fills' },
  { key: 'orderReject', zh: '委託拒絕', en: 'Rejected orders', descZh: '交易接口拒絕委託時通知', descEn: 'Notify when a broker rejects an order' },
  { key: 'orderStop', zh: '停損觸發', en: 'Stop triggers', descZh: '停損或停利觸發時通知', descEn: 'Notify when stops or take-profit rules trigger' },
];

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

// ─── Data sources (read-only) ─────────────────────────────
interface Source {
  id: string; zh: string; en: string; descZh: string; descEn: string;
  icon: string; color: string;
  enabled: boolean; available: boolean; connected: boolean;
  feed: 'livefeed' | 'cached' | 'sandbox';
}
const sources = reactive<Source[]>([
  { id: 'crypto', zh: '加密貨幣', en: 'Crypto', descZh: 'Binance / Coinbase 公開 API', descEn: 'Binance / Coinbase public APIs', icon: '₿', color: '#F59E0B', enabled: true, available: true, connected: true, feed: 'livefeed' },
  { id: 'stocks', zh: '股市', en: 'Stocks', descZh: '美股 / 港股 / 台股 — 接口受限', descEn: 'US / HK / TW — limited access', icon: '📈', color: '#3B82F6', enabled: false, available: false, connected: false, feed: 'cached' },
  { id: 'forex', zh: '外匯', en: 'Forex', descZh: '主要貨幣對', descEn: 'Major currency pairs', icon: '$', color: '#10B981', enabled: false, available: true, connected: false, feed: 'cached' },
  { id: 'bonds', zh: '政府債券', en: 'Government bonds', descZh: '殖利率曲線（離線資料）', descEn: 'Yield curve (offline data)', icon: '%', color: '#8B5CF6', enabled: true, available: true, connected: false, feed: 'cached' },
  { id: 'news', zh: '新聞', en: 'News', descZh: 'Finnhub / NewsAPI', descEn: 'Finnhub / NewsAPI', icon: '✦', color: '#EF4444', enabled: true, available: true, connected: true, feed: 'livefeed' },
]);

// ─── Provider catalog ─────────────────────────────────────
interface Provider { id: string; name: string; short: string; color: string; kind: 'crypto' | 'stocks' | 'news' | 'fx'; rate: number; tradeable: boolean; }
const PROVIDERS: Provider[] = [
  { id: 'binance', name: 'Binance', short: 'BN', color: '#F59E0B', kind: 'crypto', rate: 1200, tradeable: true },
  { id: 'coinbase', name: 'Coinbase', short: 'CB', color: '#3B82F6', kind: 'crypto', rate: 600, tradeable: true },
  { id: 'kraken', name: 'Kraken', short: 'KR', color: '#7C3AED', kind: 'crypto', rate: 300, tradeable: true },
  { id: 'alpaca', name: 'Alpaca', short: 'AL', color: '#FBBF24', kind: 'stocks', rate: 200, tradeable: true },
  { id: 'polygon', name: 'Polygon.io', short: 'PG', color: '#1E40AF', kind: 'stocks', rate: 100, tradeable: false },
  { id: 'finnhub', name: 'Finnhub', short: 'FH', color: '#059669', kind: 'news', rate: 60, tradeable: false },
  { id: 'oanda', name: 'OANDA', short: 'OA', color: '#DC2626', kind: 'fx', rate: 120, tradeable: true },
];
function providerOf(id: string): Provider {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

// ─── Saved keys ───────────────────────────────────────────
type Hitl = 'manual' | 'confirm' | 'auto';
interface ApiKey {
  id: string; provider: string; key: string; secret: string;
  env: 'sandbox' | 'live';
  permissions: 'read' | 'trade';
  label: string;
  show: boolean; testing: boolean; lastTest: 'ok' | 'fail' | null;
  // Trading-only:
  hitl?: Hitl;
  maxSingle?: number; maxDaily?: number; allowed?: string; expires?: string;
  lastUsedLabel?: string;
}
const keys = reactive<ApiKey[]>([]);
const readKeys = computed(() => keys.filter(k => k.permissions === 'read'));
const brokerKeys = computed(() => keys.filter(k => k.permissions === 'trade'));

function formatLastUsed(value: string | null) {
  if (!value) return '';
  return value.slice(0, 16).replace('T', ' ');
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function keyFromDto(dto: AiAccessKeyDto): ApiKey {
  return {
    id: dto.id,
    provider: dto.provider,
    key: dto.maskedKey,
    secret: '',
    env: dto.environment,
    permissions: dto.permission,
    label: dto.label,
    show: false,
    testing: false,
    lastTest: dto.lastTest,
    hitl: dto.hitl,
    maxSingle: dto.riskLimits?.maxSingleUsd,
    maxDaily: dto.riskLimits?.maxDailyUsd,
    allowed: dto.riskLimits?.allowedSymbols.join(',') ?? '',
    expires: dateOnly(dto.riskLimits?.expiresAt),
    lastUsedLabel: formatLastUsed(dto.lastUsedAt),
  };
}

function replaceKeys(nextKeys: AiAccessKeyDto[]) {
  keys.splice(0, keys.length, ...nextKeys.map(keyFromDto));
}

const hitlOptions: { id: Hitl; tk: string; dk: string; icon: string }[] = [
  { id: 'manual', tk: 'hitlManual', dk: 'hitlManualDesc', icon: '✋' },
  { id: 'confirm', tk: 'hitlConfirm', dk: 'hitlConfirmDesc', icon: '✓' },
  { id: 'auto', tk: 'hitlAuto', dk: 'hitlAutoDesc', icon: '⚡' },
];

function maskKey(k: string): string {
  if (k.length < 12) return '•'.repeat(k.length);
  return k.slice(0, 6) + '••••••••••••' + k.slice(-4);
}

const copiedId = ref<string | null>(null);
function copyKey(k: ApiKey) {
  navigator.clipboard?.writeText(k.key);
  copiedId.value = k.id;
  setTimeout(() => { if (copiedId.value === k.id) copiedId.value = null; }, 1400);
}
function copyText(text: string, id: string) {
  navigator.clipboard?.writeText(text);
  copiedId.value = id;
  setTimeout(() => { if (copiedId.value === id) copiedId.value = null; }, 1400);
}
async function testKey(k: ApiKey) {
  if (k.testing) return;
  k.testing = true;
  k.lastTest = null;
  try {
    const result = await aiAccessApi.testKey(k.id);
    const liveKey = keys.find(item => item.id === k.id);
    if (liveKey) {
      liveKey.lastTest = result.status;
      liveKey.lastUsedLabel = formatLastUsed(result.testedAt);
      liveKey.testing = false;
    }
    await refreshAuditCalls();
    emit('toast', props.lang === 'zh' ? '已完成模擬連線測試' : 'Simulated connection test complete');
  } catch {
    const liveKey = keys.find(item => item.id === k.id);
    if (liveKey) {
      liveKey.lastTest = 'fail';
      liveKey.testing = false;
    }
    emit('toast', props.lang === 'zh' ? '模擬連線測試失敗' : 'Simulated connection test failed');
  }
}
async function revokeKey(k: ApiKey) {
  try {
    await aiAccessApi.revokeKey(k.id);
    const i = keys.findIndex(x => x.id === k.id);
    if (i >= 0) keys.splice(i, 1);
  } catch {
    emit('toast', props.lang === 'zh' ? '撤銷失敗' : 'Revoke failed');
  }
}

async function updatePolicy(k: ApiKey, hitl: AiHitlMode) {
  if (k.permissions !== 'trade') return;
  const previous = k.hitl;
  k.hitl = hitl;
  try {
    const updated = await aiAccessApi.updatePolicy(k.id, {
      hitl,
      riskLimits: {
        maxSingleUsd: k.maxSingle ?? 0,
        maxDailyUsd: k.maxDaily ?? 0,
        allowedSymbols: k.allowed ? k.allowed.split(',').map(symbol => symbol.trim()).filter(Boolean) : [],
        expiresAt: k.expires ? `${k.expires}T00:00:00Z` : null,
      },
    });
    const index = keys.findIndex(item => item.id === k.id);
    if (index >= 0) keys[index] = keyFromDto(updated);
  } catch {
    k.hitl = previous;
    emit('toast', props.lang === 'zh' ? '交易政策更新失敗' : 'Trading policy update failed');
  }
}

// ─── Add modal ────────────────────────────────────────────
const addOpen = ref(false);
const addMode = ref<'read' | 'trade'>('trade');
const draft = reactive({
  provider: 'binance', key: '', secret: '',
  env: 'sandbox' as 'sandbox' | 'live',
  label: '',
});
const filteredProviders = computed(() =>
  addMode.value === 'trade' ? PROVIDERS.filter(p => p.tradeable) : PROVIDERS.filter(p => !p.tradeable || p.kind === 'news')
);
function openAdd(mode: 'read' | 'trade') {
  addMode.value = mode;
  draft.provider = mode === 'trade' ? 'binance' : 'finnhub';
  draft.key = '';
  draft.secret = '';
  draft.env = 'sandbox';
  draft.label = '';
  addOpen.value = true;
}
async function saveKey() {
  if (!draft.key) return;
  try {
    const created = await aiAccessApi.createKey({
      provider: draft.provider,
      apiKey: draft.key,
      apiSecret: draft.secret || 'demo-secret-placeholder',
      environment: draft.env,
      permission: addMode.value,
      label: draft.label,
      hitl: addMode.value === 'trade' ? 'manual' : undefined,
      riskLimits: addMode.value === 'trade'
        ? { maxSingleUsd: 1000, maxDailyUsd: 5000, allowedSymbols: [], expiresAt: null }
        : undefined,
    });
    keys.unshift(keyFromDto(created));
    addOpen.value = false;
  } catch {
    emit('toast', props.lang === 'zh' ? '金鑰儲存失敗' : 'Key save failed');
  }
}

// ─── AI access (preview) ──────────────────────────────────
interface McpServer {
  id: string; tk: string; dk: string; kind: 'read' | 'write' | 'admin';
  url: string; tools: string[]; enabled: boolean; editable: boolean;
}

interface AgentView {
  id: string; name: string; icon: string; scopes: string[]; last: string; status: 'live' | 'disabled';
}

interface AuditCallView {
  id: string; t: string; agent: string; tool: string; args: string; ok: boolean; ms: number;
}

const mcpServers = reactive<McpServer[]>([]);
const agents = reactive<AgentView[]>([]);
const calls = reactive<AuditCallView[]>([]);

onMounted(() => {
  void loadAiAccessData();
});

function endpointText(endpoint: McpEndpointDto) {
  if (endpoint.kind === 'read') return { tk: 'readonlyServer', dk: 'readonlyDesc' };
  if (endpoint.kind === 'write') return { tk: 'tradingServer', dk: 'tradingDesc' };
  return { tk: 'adminServer', dk: 'adminDesc' };
}

function endpointFromDto(endpoint: McpEndpointDto): McpServer {
  return { ...endpointText(endpoint), ...endpoint };
}

function agentIcon(agent: AiAgentDto) {
  if (agent.name.includes('Claude')) return '◆';
  if (agent.name.includes('Cursor')) return '⌘';
  return '◯';
}

function agentFromDto(agent: AiAgentDto): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    icon: agentIcon(agent),
    scopes: agent.scopes,
    last: formatLastUsed(agent.lastUsedAt) || (props.lang === 'zh' ? '尚未使用' : 'never'),
    status: agent.status,
  };
}

function callFromDto(call: AiAuditCallDto): AuditCallView {
  return {
    id: call.id,
    t: call.time.slice(11, 19),
    agent: call.agent,
    tool: call.tool,
    args: call.argsSummary,
    ok: call.ok,
    ms: call.durationMs,
  };
}

async function loadAiAccessData() {
  const [nextKeys, nextEndpoints, nextAgents] = await Promise.all([
    aiAccessApi.listKeys(),
    aiAccessApi.listMcpEndpoints(),
    aiAccessApi.listAgents(),
  ]);
  replaceKeys(nextKeys);
  mcpServers.splice(0, mcpServers.length, ...nextEndpoints.map(endpointFromDto));
  agents.splice(0, agents.length, ...nextAgents.map(agentFromDto));
  await refreshAuditCalls();
}

async function refreshAuditCalls() {
  const nextCalls = await aiAccessApi.listAuditCalls({ limit: 20 });
  calls.splice(0, calls.length, ...nextCalls.data.map(callFromDto));
}

async function toggleMcpEndpoint(endpoint: McpServer) {
  try {
    const updated = await aiAccessApi.updateMcpEndpoint(endpoint.id, { enabled: endpoint.enabled });
    const index = mcpServers.findIndex(item => item.id === updated.id);
    if (index >= 0) mcpServers[index] = endpointFromDto(updated);
  } catch {
    endpoint.enabled = !endpoint.enabled;
    emit('toast', props.lang === 'zh' ? 'MCP 端點更新失敗' : 'MCP endpoint update failed');
  }
}

async function revokeAgent(agent: AgentView) {
  try {
    await aiAccessApi.revokeAgent(agent.id);
    const index = agents.findIndex(item => item.id === agent.id);
    if (index >= 0) agents.splice(index, 1);
  } catch {
    emit('toast', props.lang === 'zh' ? 'Agent 撤銷失敗' : 'Agent revoke failed');
  }
}
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

/* Banner */
.banner {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 14px; background: color-mix(in oklch, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in oklch, var(--accent) 22%, transparent);
  border-radius: 10px; margin-bottom: 24px;
}
.banner-icon {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; font-style: italic;
  font-family: Georgia, serif;
}
.banner.warn-banner {
  background: color-mix(in oklch, var(--dn) 7%, transparent);
  border-color: color-mix(in oklch, var(--dn) 22%, transparent);
}
.banner.warn-banner .banner-icon { background: var(--dn); }
.banner.ai-banner {
  background: color-mix(in oklch, #8B5CF6 7%, transparent);
  border-color: color-mix(in oklch, #8B5CF6 24%, transparent);
}
.banner.ai-banner .ai-icon { background: #8B5CF6; font-style: normal; font-family: inherit; font-size: 10px; }
.soon-pill {
  display: inline-block; margin-left: 6px;
  font-size: 10px; padding: 1px 7px; border-radius: 4px;
  background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6;
  text-transform: uppercase; letter-spacing: .4px; font-weight: 600;
}

.sec-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--fg-dim); margin-bottom: 12px; }
.sec-h-sub { color: var(--fg-mute); font-weight: 500; text-transform: none; letter-spacing: 0; }
.sec-row { display: flex; align-items: center; justify-content: space-between; }

/* Source cards */
.src-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.src-card {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px; transition: all .15s;
}
.src-card.off { opacity: .65; }
.src-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.src-l { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.src-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
}
.src-meta { display: flex; gap: 6px; flex-wrap: wrap; }

.chip {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-dim);
  font-weight: 500; letter-spacing: .2px;
  white-space: nowrap;
}
.chip.livefeed { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.cached { background: var(--surface); color: var(--fg-mute); }
.chip.sandbox { background: color-mix(in oklch, var(--accent) 14%, transparent); color: var(--accent); }
.chip.live { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.read, .chip.readonly { background: var(--surface); color: var(--fg-dim); }
.chip.trade { background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6; }
.chip.ok { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.warn { background: color-mix(in oklch, var(--dn) 14%, transparent); color: var(--dn); }
.chip.mute { color: var(--fg-mute); }

/* Switch */
.sw { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
.sw input { opacity: 0; width: 0; height: 0; }
.sw-track { position: absolute; inset: 0; background: var(--border); border-radius: 999px; transition: background .2s; }
.sw-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: #fff; border-radius: 50%;
  transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.sw input:checked + .sw-track { background: var(--accent); }
.sw input:checked + .sw-track::before { transform: translateX(16px); }
.sw input:disabled + .sw-track { opacity: .5; cursor: not-allowed; }
.sw.disabled { opacity: .5; }

/* Empty */
.empty { text-align: center; padding: 36px 20px; border: 1px dashed var(--border); border-radius: 10px; }

/* Key rows (read sources) */
.keys { display: flex; flex-direction: column; gap: 10px; }
.key-row {
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
}
.key-l { display: flex; gap: 12px; flex: 1; min-width: 0; }
.key-icon {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; letter-spacing: .3px;
}
.key-mono {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
  font-family: var(--mono, ui-monospace, monospace); font-size: 11px;
  color: var(--fg-dim); flex-wrap: wrap;
}
.micro {
  background: transparent; border: 0; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; color: var(--fg-mute); cursor: pointer; font-family: inherit;
  text-transform: uppercase; letter-spacing: .3px;
}
.micro:hover { color: var(--accent); background: var(--surface); }
.tag-mute { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--surface); color: var(--fg-dim); }
.key-r { display: flex; gap: 6px; flex-shrink: 0; }

/* Notification preferences */
.pref-section + .pref-section { margin-top: 24px; }
.pref-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.pref-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px;
  cursor: pointer;
}
.pref-row input[type="checkbox"] { margin-top: 2px; accent-color: var(--accent); }
.pref-copy { display: grid; gap: 3px; min-width: 0; }
.pref-copy strong { font-size: 13px; font-weight: 600; color: var(--fg); }
.pref-copy small { font-size: 11px; line-height: 1.45; color: var(--fg-mute); }
.quiet-grid { grid-template-columns: 1fr; }
.quiet-toggle { max-width: 520px; }
.pref-time { display: flex; gap: 12px; flex-wrap: wrap; }
.pref-time label { display: grid; gap: 5px; min-width: 150px; font-size: 11px; color: var(--fg-dim); }
.pref-actions {
  display: flex; justify-content: flex-end;
  padding-top: 18px; margin-top: 24px; border-top: 1px solid var(--border);
}

/* Brokers */
.brokers { display: flex; flex-direction: column; gap: 14px; }
.broker {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden;
}
.broker-head {
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding: 16px;
}
.broker-section {
  border-top: 1px solid var(--border);
  padding: 14px 16px;
  background: var(--surface);
}
.bs-l {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
  color: var(--fg-dim); margin-bottom: 10px;
}

/* HITL */
.hitl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.hitl-card {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; cursor: pointer; font-family: inherit; text-align: left;
  transition: all .15s;
}
.hitl-card:hover { border-color: var(--accent); }
.hitl-card.active { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 8%, var(--surface2)); }
.hitl-card.hitl-auto.active { border-color: #8B5CF6; background: color-mix(in oklch, #8B5CF6 8%, var(--surface2)); }
.hitl-icon { font-size: 16px; }
.radio {
  flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%;
  border: 1.5px solid var(--border); background: var(--surface);
  position: relative; transition: all .15s;
}
.radio.on { border-color: var(--accent); }
.radio.on::after {
  content: ''; position: absolute; inset: 2px; border-radius: 50%; background: var(--accent);
}

/* Risk grid */
.risk-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.risk-l { font-size: 11px; color: var(--fg-mute); margin-bottom: 4px; }
.risk-input { display: flex; align-items: stretch; }
.risk-prefix {
  background: var(--surface2); border: 1px solid var(--border); border-right: 0;
  padding: 6px 10px; border-radius: 6px 0 0 6px; font-size: 13px; color: var(--fg-dim);
}
.risk-input .inp-num { border-radius: 0 6px 6px 0; }

.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; padding: 7px 10px; font-size: 13px; color: var(--fg);
  font-family: inherit; transition: border-color .15s; box-sizing: border-box;
}
.inp:focus { outline: 0; border-color: var(--accent); }
.inp.mono { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; }

/* MCP */
.mcp-list { display: flex; flex-direction: column; gap: 10px; }
.mcp {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px;
}
.mcp.write { border-color: color-mix(in oklch, #8B5CF6 28%, var(--border)); }
.mcp.admin { opacity: .6; }
.mcp-head { display: flex; gap: 12px; align-items: flex-start; }
.mcp-tag {
  flex-shrink: 0; padding: 2px 8px; border-radius: 4px;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
  background: var(--surface); color: var(--fg-dim);
  margin-top: 1px;
}
.mcp-tag.read { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.mcp-tag.write { background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6; }
.mcp-tag.admin { background: color-mix(in oklch, var(--dn) 14%, transparent); color: var(--dn); }
.mcp-url {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  padding: 8px 10px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px;
}
.mcp-url code {
  flex: 1; font-family: var(--mono, ui-monospace, monospace); font-size: 11px;
  color: var(--fg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mcp-tools { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 10px; }
.tool {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-mute);
  font-family: var(--mono, ui-monospace, monospace);
}

/* Agents */
.agents { display: flex; flex-direction: column; gap: 8px; }
.agent {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 10px;
}
.agent-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--surface); display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}

/* Audit */
.audit {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden;
}
.call {
  display: grid;
  grid-template-columns: 76px 140px 180px 1fr auto;
  gap: 12px; align-items: center;
  padding: 9px 14px; font-size: 11px;
}
.call + .call { border-top: 1px solid var(--border); }
.call-time { font-family: var(--mono, ui-monospace, monospace); color: var(--fg-mute); }
.call-agent { color: var(--fg); font-weight: 500; }
.call-tool code { font-family: var(--mono, ui-monospace, monospace); color: var(--accent); font-size: 11px; }
.call-args { font-family: var(--mono, ui-monospace, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* CLI */
.cli-card {
  padding: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
}
.cli-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px;
}
.cli-head code {
  flex: 1; font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: var(--fg);
}

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
