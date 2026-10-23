<template>
  <header class="hdr">
    <div class="brand">
      <span class="logo">R</span>
      <span class="brand-name">Resource</span>
    </div>
    <nav class="nav">
      <button
        v-for="it in navItems"
        :key="it.k"
        :class="['nav-btn', { active: page === it.k }]"
        :data-testid="`nav-${it.k}`"
        @click="$emit('navigate', it.k)"
      >{{ it.l }}</button>
    </nav>
    <div class="spacer" />
    <button class="search-btn" :aria-label="t(lang, 'search')" @click="$emit('open-cmdk')">
      <span>🔍</span>
      <span class="search-label">{{ t(lang, 'search') }}</span>
      <kbd>⌘K</kbd>
    </button>
    <div v-if="sessionStatus" :class="['session-chip', sessionTone, { 'has-identity': safeSessionIdentity }]">
      <span class="session-dot" />
      <span class="session-copy" :title="sessionLabel">{{ sessionLabel }}</span>
      <span v-if="safeSessionIdentity" class="session-identity" data-testid="header-session-identity">{{ safeSessionIdentity }}</span>
      <button
        v-if="sessionStatus === 'authenticated'"
        class="session-logout"
        data-testid="header-logout"
        :disabled="sessionBusy"
        @click="$emit('logout')"
      >
        {{ t(lang, 'authSignOut') }}
      </button>
    </div>
    <div class="bell-wrap">
      <button
        class="icon-btn"
        data-testid="header-bell"
        :aria-label="t(lang, 'notifications')"
        :aria-expanded="bellOpen"
        @click="bellOpen = !bellOpen"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span class="bell-dot" />
      </button>
      <div v-if="bellOpen" class="bell-pop" data-testid="header-bell-pop" @click.stop>
        <div class="bell-head">
          <span style="font-weight:600">{{ t(lang, 'notifications') }}</span>
          <span style="font-size:11px;color:var(--fg-dim)">{{ unreadCount }} {{ t(lang, 'unread') }}</span>
        </div>
        <div v-for="n in NOTIFS.slice(0, 4)" :key="n.id" class="bell-row">
          <span class="bell-rowdot" :style="{ background: n.unread ? 'var(--accent)' : 'transparent' }" />
          <div style="flex:1;font-size:12.5px">
            <span v-if="n.sym" style="font-weight:600;margin-right:6px">{{ n.sym }}</span>
            <span>{{ n.text }}</span>
            <div style="color:var(--fg-mute);font-size:11px;margin-top:2px">{{ n.time }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="avatar">JL</div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { NOTIFS } from '../data';
import type { Lang, Page } from '../types';
import type { AuthUser } from '../services/authApi';
import type { SessionState } from '../services/authSession';

const props = defineProps<{
  page: Page;
  lang: Lang;
  admin: boolean;
  sessionStatus?: SessionState['status'];
  sessionUser?: AuthUser | null;
  sessionBusy?: boolean;
}>();
defineEmits<{ navigate: [p: Page]; 'open-cmdk': []; logout: [] }>();

const bellOpen = ref(false);
const unreadCount = computed(() => NOTIFS.filter(n => n.unread).length);

const navItems = computed(() => {
  const base: { k: Page; l: string }[] = [
    { k: 'overview', l: t(props.lang, 'overview') },
    { k: 'markets', l: t(props.lang, 'markets') },
    { k: 'watchlist', l: t(props.lang, 'watchlist') },
    { k: 'positions', l: t(props.lang, 'positions') },
    { k: 'backtest', l: t(props.lang, 'backtest') },
    { k: 'analytics', l: t(props.lang, 'analytics') },
    { k: 'trades', l: t(props.lang, 'trades') },
    { k: 'alerts', l: t(props.lang, 'alerts') },
    { k: 'notifications', l: t(props.lang, 'notifications') },
    { k: 'settings', l: t(props.lang, 'settings') },
  ];
  if (props.admin) base.push({ k: 'ops', l: t(props.lang, 'ops') });
  return base;
});

const safeSessionIdentity = computed(() => {
  if (props.sessionStatus !== 'authenticated') return '';
  return props.sessionUser?.email || props.sessionUser?.username || '';
});

const sessionLabel = computed(() => {
  switch (props.sessionStatus) {
    case 'authenticated':
      return t(props.lang, 'authSignedIn');
    case 'checking':
      return t(props.lang, 'authChecking');
    case 'refreshing':
      return t(props.lang, 'authRefreshing');
    case 'error':
      return t(props.lang, 'authBackendUnavailable');
    case 'anonymous':
      return t(props.lang, 'authSignedOut');
    default:
      return '';
  }
});

const sessionTone = computed(() => {
  if (props.sessionStatus === 'authenticated') return 'ready';
  if (props.sessionStatus === 'error') return 'danger';
  return 'neutral';
});
</script>

<style scoped>
.hdr {
  display: flex; align-items: center; gap: 24px;
  height: 60px; padding: 0 22px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: relative;
}
.brand { flex-shrink: 0; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; letter-spacing: -0.3px; }
.logo {
  width: 22px; height: 22px; background: var(--accent); border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 12px; font-weight: 700;
}
.nav {
  display: flex; gap: 2px; min-width: 0;
  /* 空間不夠時最後才縮(權重 = shrink × 寬度,其他項目先縮),縮了就在列內捲動 */
  flex: 0 0.01 auto;
  overflow-x: auto; scrollbar-width: thin;
}
.spacer { flex: 1; }
.nav-btn {
  padding: 6px 10px; border-radius: 6px;
  background: transparent; border: 0;
  color: var(--fg-dim); font-size: 13px; font-weight: 500;
  white-space: nowrap;
}
.nav-btn.active { background: var(--surface2); color: var(--fg); font-weight: 600; }
.search-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; min-width: 180px; max-width: 240px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--fg-dim); font-size: 12px;
  flex-shrink: 1;
}
.search-label { flex: 1; text-align: left; white-space: nowrap; }
.search-btn kbd { font-size: 10px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border); }
.session-chip {
  /* 不設 min-width: 0 —— 讓 chip 至少保住「狀態 + 登出」的內容寬,不夠時改由 nav 縮並捲動 */
  height: 36px; max-width: 300px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 10px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface2);
  color: var(--fg-dim); font-size: 12px; line-height: 1;
  flex-shrink: 1;
}
.session-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--fg-mute); flex-shrink: 0;
}
.session-chip.ready .session-dot { background: var(--accent); }
.session-chip.danger .session-dot { background: var(--dn); }
.session-copy, .session-identity {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.session-copy { flex-shrink: 1; min-width: 0; font-weight: 600; color: var(--fg); }
.session-identity { min-width: 0; }
/*
 * 有身分(email)時只縮身分:狀態文字只要分到一點點縮減量(即使 0.03px)就會出現省略號。
 * 沒有身分時(未登入 / 斷線)狀態文字是唯一能縮的,必須可縮,否則長文案會撐出 chip。
 */
.session-chip.has-identity .session-copy { flex-shrink: 0; }
.session-chip:not(.has-identity) .session-copy { min-width: 6em; }
.session-logout {
  height: 28px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--dn); font: inherit; font-size: 12px; font-weight: 600;
  white-space: nowrap;
}
.session-logout:disabled { opacity: .62; cursor: not-allowed; }
.bell-wrap { position: relative; flex-shrink: 0; }
.icon-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 0; border-radius: 8px;
  color: var(--fg-dim); position: relative;
}
.bell-dot {
  position: absolute; top: 6px; right: 6px;
  width: 8px; height: 8px; background: var(--accent);
  border-radius: 50%; border: 2px solid var(--surface);
}
.bell-pop {
  position: absolute; top: 44px; right: 0; width: min(320px, calc(100vw - 24px));
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.15);
  z-index: 20;
}
.bell-head {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.bell-row { padding: 10px 16px; border-bottom: 1px solid var(--border); display: flex; gap: 10px; align-items: flex-start; }
.bell-rowdot { width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.avatar {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: var(--surface2); display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600;
}
/*
 * 10 個導覽項加右側工具區的固有寬度約 1070px,flex-shrink: 0 的 nav 會把整頁撐出水平捲軸
 * (todo 2026-09-04-frontend-header-rwd-320px)。現在 nav 可縮並在列內橫向捲動;
 * 窄螢幕再改兩列:第一列品牌 + 工具區,第二列導覽。捲動一律留在 header 裡而不是整頁。
 */
@media (max-width: 1279px) {
  .hdr { flex-wrap: wrap; height: auto; min-height: 60px; padding: 10px 16px 0; gap: 8px 12px; }
  .nav { order: 10; flex: 1 0 100%; padding-bottom: 8px; }
  /*
   * 換行判斷用的是 flex-basis,不會先縮再換行:chip 若以內容寬參與換行,狀態文字一長
   * 就把通知鈴擠到下一列。basis 0 + min-width 0 + 高 grow 讓它拿走第一列剩餘空間
   * (上限仍是 max-width);登出鈕靠右,chip 變寬時不會留一段空白在按鈕後面。
   */
  .session-chip { flex: 100 1 0; min-width: 0; }
  .session-logout { margin-left: auto; flex-shrink: 0; }
}
@media (max-width: 900px) {
  .session-chip { max-width: 180px; }
  .session-identity { display: none; }
  .search-btn { min-width: 0; }
  .search-label, .search-btn kbd { display: none; }
}
@media (max-width: 480px) {
  .hdr { padding: 8px 12px 0; gap: 8px; }
  .brand-name { display: none; }
  /* 頭像目前是寫死的示範字樣、不可互動;登出與身分狀態仍在 session chip 內 */
  .avatar { display: none; }
  .session-chip { gap: 6px; padding: 0 8px; }
}
</style>
