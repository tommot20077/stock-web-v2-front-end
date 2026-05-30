<template>
  <div class="root">
    <AppHeader
      :page="page"
      :lang="tweaks.lang"
      :admin="tweaks.admin"
      :session-status="apiMode ? sessionState.status : undefined"
      :session-user="apiMode ? sessionState.user : null"
      :session-busy="sessionBusy"
      @navigate="page = $event"
      @open-cmdk="cmdk = true"
      @logout="logout"
    />
    <section v-if="apiMode" class="session-shell">
      <SessionBanner
        :lang="tweaks.lang"
        :status="sessionState.status"
        :message="sessionState.message"
        @retry="restoreSession"
        @sign-in-again="focusAuthPanel"
      />
      <AuthPanel
        v-if="showAuthPanel"
        ref="authPanelRef"
        :lang="tweaks.lang"
        :status="sessionState.status"
        :user="sessionState.user"
        :message="sessionState.message"
        :busy="sessionBusy"
        @login="login"
        @register="register"
        @logout="logout"
      />
    </section>
    <main class="main">
      <Overview v-if="page === 'overview'" :lang="tweaks.lang" @order="openTicket" @navigate="page = $event" />
      <Markets v-else-if="page === 'markets'" :lang="tweaks.lang" @order="openTicket" @chart="openChart" />
      <Chart v-else-if="page === 'chart'" :lang="tweaks.lang" :sym="chartSymbol" :theme-mode="tweaks.chartTheme" @order="openTicket" @back="page = 'markets'" />
      <Positions v-else-if="page === 'positions'" :lang="tweaks.lang" @order="openTicket" />
      <Analytics v-else-if="page === 'analytics'" :lang="tweaks.lang" @order="openTicket" @toast="showToast" />
      <Trades v-else-if="page === 'trades'" :lang="tweaks.lang" @order="openTicket" />
      <Alerts v-else-if="page === 'alerts'" :lang="tweaks.lang" />
      <Notifications v-else-if="page === 'notifications'" :lang="tweaks.lang" />
      <Settings v-else-if="page === 'settings'" :lang="tweaks.lang" :theme="tweaks.theme" @set-tweak="onSettingsTweak" @toast="showToast" />
      <Watchlist v-else-if="page === 'watchlist'" :lang="tweaks.lang" @chart="openChart" />
      <Backtest v-else-if="page === 'backtest'" :lang="tweaks.lang" />
      <Ops v-else-if="page === 'ops'" :lang="tweaks.lang" @toast="showToast" />
    </main>
    <CmdK :open="cmdk" :lang="tweaks.lang" @close="cmdk = false" @navigate="onCmdkNav" @open-help="helpOpen = true" />
    <KeyboardHelp :open="helpOpen" :lang="tweaks.lang" @close="helpOpen = false" />
    <PrefixIndicator :prefix="prefix" :lang="tweaks.lang" />
    <OrderTicket
      :open="ticketOpen"
      :lang="tweaks.lang"
      :preset="ticketPreset"
      @close="ticketOpen = false"
      @navigate="onTicketNav"
      @toast="showToast"
    />
    <Toast :msg="toast" />
    <TweaksPanel :tweaks="tweaks" @set="onTweaksPanelSet" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTweaks, type Tweaks } from './useTweaks';
import { useShortcuts } from './useShortcuts';
import type { Page } from './types';
import { t } from './i18n';
import AppHeader from './components/Header.vue';
import AuthPanel from './components/AuthPanel.vue';
import CmdK from './components/CmdK.vue';
import KeyboardHelp from './components/KeyboardHelp.vue';
import PrefixIndicator from './components/PrefixIndicator.vue';
import SessionBanner from './components/SessionBanner.vue';
import OrderTicket from './components/OrderTicket.vue';
import Toast from './components/Toast.vue';
import TweaksPanel from './components/TweaksPanel.vue';
import { createAuthSession } from './services/authSession';
import { getRuntimeApiClients } from './services/pageApiClients';
import { getRuntimeDataMode } from './services/runtimeDataMode';
import type { LoginRequest, RegisterRequest } from './services/authApi';
import Overview from './pages/Overview.vue';
import Markets from './pages/Markets.vue';
import Chart from './pages/Chart.vue';
import Positions from './pages/Positions.vue';
import Analytics from './pages/Analytics.vue';
import Trades from './pages/Trades.vue';
import Notifications from './pages/Notifications.vue';
import Settings from './pages/Settings.vue';
import Ops from './pages/Ops.vue';
import Watchlist from './pages/Watchlist.vue';
import Backtest from './pages/Backtest.vue';
import Alerts from './pages/Alerts.vue';

const { tweaks, set } = useTweaks();
const page = ref<Page>('overview');
const cmdk = ref(false);
const helpOpen = ref(false);
const toast = ref('');
const ticketOpen = ref(false);
const ticketPreset = ref<{ sym: string; side?: 'BUY' | 'SELL' } | null>(null);
const chartSymbol = ref<string>('AAPL');
const runtimeMode = getRuntimeDataMode();
const apiMode = runtimeMode === 'api';
const authSession = createAuthSession({ mode: runtimeMode });
const sessionState = computed(() => authSession.state.value);
const sessionBusy = ref(false);
const authPanelRef = ref<InstanceType<typeof AuthPanel> | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

type TweakPayload<K extends keyof Tweaks = keyof Tweaks> =
  K extends keyof Tweaks ? { key: K; value: Tweaks[K] } : never;
type SettingsTweakPayload = TweakPayload<'theme'> | TweakPayload<'lang'>;

function showToast(m: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = m;
  toastTimer = setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 1800);
}
function onCmdkNav(p: Page) { page.value = p; cmdk.value = false; }
function openTicket(preset?: { sym: string; side?: 'BUY' | 'SELL' }) {
  ticketPreset.value = preset ?? null;
  ticketOpen.value = true;
}
function openChart(preset: { sym: string }) {
  chartSymbol.value = preset.sym;
  page.value = 'chart';
}
function onTicketNav(p: 'positions') { page.value = p; ticketOpen.value = false; }
function onSettingsTweak(payload: SettingsTweakPayload) {
  if (payload.key === 'theme') {
    set('theme', payload.value);
  } else {
    set('lang', payload.value);
  }
}
function onTweaksPanelSet(payload: { key: string; value: unknown }) {
  switch (payload.key) {
    case 'theme':
      if (payload.value === 'light' || payload.value === 'dark') set('theme', payload.value);
      break;
    case 'lang':
      if (payload.value === 'zh' || payload.value === 'en') set('lang', payload.value);
      break;
    case 'density':
      if (payload.value === 'compact' || payload.value === 'cozy' || payload.value === 'comfy') set('density', payload.value);
      break;
    case 'accent':
      if (typeof payload.value === 'string') set('accent', payload.value);
      break;
    case 'upGreen':
      if (typeof payload.value === 'boolean') set('upGreen', payload.value);
      break;
    case 'admin':
      if (typeof payload.value === 'boolean') set('admin', payload.value);
      break;
    case 'chartTheme':
      if (payload.value === 'tv' || payload.value === 'mixed') set('chartTheme', payload.value);
      break;
  }
}

const showAuthPanel = computed(() => apiMode
  && (sessionState.value.status === 'anonymous' || sessionState.value.status === 'error'));

async function restoreSession() {
  if (!apiMode) return;
  sessionBusy.value = true;
  try {
    await getRuntimeApiClients().auth.csrf();
    await authSession.restore();
  } finally {
    sessionBusy.value = false;
  }
}

async function login(request: LoginRequest) {
  sessionBusy.value = true;
  try {
    await authSession.login(request);
  } finally {
    sessionBusy.value = false;
  }
}

async function register(request: RegisterRequest) {
  sessionBusy.value = true;
  try {
    await authSession.register(request);
  } finally {
    sessionBusy.value = false;
  }
}

async function logout() {
  sessionBusy.value = true;
  try {
    await authSession.logout();
    showToast(t(tweaks.lang, 'authSignOut'));
  } finally {
    sessionBusy.value = false;
  }
}

function focusAuthPanel() {
  authPanelRef.value?.$el?.querySelector('h2')?.focus();
}

onMounted(() => {
  if (apiMode) void restoreSession();
});

onBeforeUnmount(() => {
  if (!toastTimer) return;
  clearTimeout(toastTimer);
  toastTimer = null;
});

const { prefix } = useShortcuts({
  navigate: (p) => { page.value = p; },
  openCmdk: () => { cmdk.value = true; },
  openTicket: () => { ticketPreset.value = null; ticketOpen.value = true; },
  openHelp: () => { helpOpen.value = true; },
  closeAll: () => {
    cmdk.value = false;
    helpOpen.value = false;
    ticketOpen.value = false;
  },
  currentPage: () => page.value,
});
</script>

<style scoped>
.root { height: 100%; display: flex; flex-direction: column; }
.main { flex: 1; overflow: auto; }
.session-shell {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 16px 22px; border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.session-shell :deep(.session-banner) {
  width: min(100%, 980px);
}
</style>
