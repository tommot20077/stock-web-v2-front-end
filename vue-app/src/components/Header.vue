<template>
  <header class="hdr">
    <div class="brand">
      <span class="logo">R</span>
      Resource
    </div>
    <nav class="nav">
      <button
        v-for="it in navItems"
        :key="it.k"
        :class="['nav-btn', { active: page === it.k }]"
        @click="$emit('navigate', it.k)"
      >{{ it.l }}</button>
    </nav>
    <div style="flex:1" />
    <button class="search-btn" @click="$emit('open-cmdk')">
      <span>🔍</span>
      <span class="search-label">{{ t(lang, 'search') }}</span>
      <kbd>⌘K</kbd>
    </button>
    <div class="bell-wrap">
      <button class="icon-btn" @click="bellOpen = !bellOpen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span class="bell-dot" />
      </button>
      <div v-if="bellOpen" class="bell-pop" @click.stop>
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

const props = defineProps<{ page: Page; lang: Lang; admin: boolean }>();
defineEmits<{ navigate: [p: Page]; 'open-cmdk': [] }>();

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
</script>

<style scoped>
.hdr {
  display: flex; align-items: center; gap: 24px;
  height: 60px; padding: 0 22px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: relative;
}
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; letter-spacing: -0.3px; }
.logo {
  width: 22px; height: 22px; background: var(--accent); border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 12px; font-weight: 700;
}
.nav { display: flex; gap: 2px; flex-shrink: 0 }
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
.search-label { flex: 1; text-align: left; }
.search-btn kbd { font-size: 10px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border); }
.bell-wrap { position: relative; }
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
  position: absolute; top: 44px; right: 0; width: 320px;
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
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--surface2); display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600;
}
</style>
