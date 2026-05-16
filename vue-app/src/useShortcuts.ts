// Vim-style keyboard shortcuts: g-prefix navigation, single-key actions.
// Returns reactive state for the prefix indicator.
import { onMounted, onUnmounted, ref } from 'vue';
import type { Page } from './types';

// g + key → page
const G_MAP: Record<string, Page> = {
  o: 'overview',  // (o)verview
  d: 'overview',  // (d)ashboard alias
  m: 'markets',
  c: 'chart',
  p: 'positions',
  a: 'analytics',
  t: 'trades',
  w: 'watchlist',
  b: 'backtest',
  n: 'notifications',
  s: 'settings',
  l: 'alerts',   // a(l)erts
  x: 'ops',       // o(x)= ops, since o is overview
};

const NAV_ORDER: Page[] = [
  'overview', 'markets', 'chart', 'positions', 'analytics',
  'trades', 'watchlist', 'backtest', 'alerts', 'notifications', 'settings', 'ops',
];

interface Handlers {
  navigate: (p: Page) => void;
  openCmdk: () => void;
  openTicket: () => void;
  openHelp: () => void;
  closeAll: () => void;
  currentPage: () => Page;
}

export function useShortcuts(h: Handlers) {
  const prefix = ref<string>(''); // 'g' when waiting for next key
  let prefixTimer: number | undefined;

  function clearPrefix() {
    prefix.value = '';
    if (prefixTimer) { clearTimeout(prefixTimer); prefixTimer = undefined; }
  }

  function setPrefix(p: string) {
    prefix.value = p;
    if (prefixTimer) clearTimeout(prefixTimer);
    prefixTimer = window.setTimeout(clearPrefix, 1500);
  }

  function inEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function onKey(e: KeyboardEvent) {
    // Always handle CmdK + Esc, even in inputs
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); h.openCmdk(); return;
    }
    if (e.key === 'Escape') { clearPrefix(); h.closeAll(); return; }

    // Skip the rest if user is typing
    if (inEditable(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();

    // g-prefix completion
    if (prefix.value === 'g') {
      e.preventDefault();
      const target = G_MAP[key];
      if (target) h.navigate(target);
      clearPrefix();
      return;
    }

    // Single-key shortcuts
    switch (e.key) {
      case 'g':
        e.preventDefault();
        setPrefix('g');
        return;
      case '?':
        e.preventDefault();
        h.openHelp();
        return;
      case '/':
        e.preventDefault();
        h.openCmdk();
        return;
      case 'n':
      case 'N':
        e.preventDefault();
        h.openTicket();
        return;
      case '[': {
        e.preventDefault();
        const idx = NAV_ORDER.indexOf(h.currentPage());
        if (idx > 0) h.navigate(NAV_ORDER[idx - 1]);
        return;
      }
      case ']': {
        e.preventDefault();
        const idx = NAV_ORDER.indexOf(h.currentPage());
        if (idx >= 0 && idx < NAV_ORDER.length - 1) h.navigate(NAV_ORDER[idx + 1]);
        return;
      }
    }
  }

  onMounted(() => document.addEventListener('keydown', onKey));
  onUnmounted(() => {
    document.removeEventListener('keydown', onKey);
    if (prefixTimer) clearTimeout(prefixTimer);
  });

  return { prefix };
}
