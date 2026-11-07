// useTweaks composable — runtime preferences for theme/lang/density/accent/admin
import { reactive, watch, readonly } from 'vue';
import type { Lang, Theme, Density } from './types';
import { accentTextFor } from './accentTokens';

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
  // quick-261107-1j4 2d A2:accent 的文字安全版跟 accent / 主題一起換;非 preset 的自訂值移除 inline,
  // 退回 styles.css 的主題預設(預設 accent #ff6600 的淺 / 深值)。
  const accentText = accentTextFor(v.accent, v.theme);
  if (accentText) document.documentElement.style.setProperty('--accent-text', accentText);
  else document.documentElement.style.removeProperty('--accent-text');
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
