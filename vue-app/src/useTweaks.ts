// useTweaks composable — runtime preferences for theme/lang/density/accent/admin
import { reactive, watch, readonly } from 'vue';
import type { Lang, Theme, Density } from './types';

export interface Tweaks {
  theme: Theme;
  lang: Lang;
  density: Density;
  accent: string;
  upGreen: boolean;
  admin: boolean;
  chartTheme: 'tv' | 'mixed';
}

const STORAGE_KEY = 'resource:tweaks:v1';

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {}
  return defaults();
}

function defaults(): Tweaks {
  return {
    theme: 'light',
    lang: 'zh',
    density: 'cozy',
    accent: '#ff6600',
    upGreen: true,
    admin: true,
    chartTheme: 'tv',
  };
}

const state = reactive<Tweaks>(load());

watch(() => ({ ...state }), (v) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
  document.documentElement.dataset.theme = v.theme;
  document.documentElement.style.setProperty('--accent', v.accent);
  // quick-261106-fbs:漲跌色改由 styles.css 的 :root[data-up-color="red"] 區塊對調。
  // 不再寫 inline --up / --dn:inline 優先權高於任何選擇器,會讓深色主題的 --dn 與 --up-text 等 token 失效。
  document.documentElement.dataset.upColor = v.upGreen ? 'green' : 'red';
  document.documentElement.style.removeProperty('--up');
  document.documentElement.style.removeProperty('--dn');
}, { immediate: true, deep: true });

export function useTweaks() {
  function set<K extends keyof Tweaks>(k: K, v: Tweaks[K]) { state[k] = v; }
  function reset() { Object.assign(state, defaults()); }
  return { tweaks: readonly(state), set, reset, raw: state };
}
