<template>
  <Teleport to="body">
    <div v-if="open" class="kh-mask" @click="$emit('close')">
      <div class="kh-modal" @click.stop>
        <div class="kh-head">
          <div class="kh-title">{{ lang === 'zh' ? '鍵盤快速鍵' : 'Keyboard Shortcuts' }}</div>
          <button class="kh-close" @click="$emit('close')">×</button>
        </div>
        <div class="kh-body">
          <div class="kh-col">
            <div class="kh-section">{{ lang === 'zh' ? '導覽' : 'Navigation' }}</div>
            <div v-for="r in nav" :key="r.k" class="kh-row">
              <div class="kh-keys">
                <kbd v-for="(k, i) in r.k.split(' ')" :key="i">{{ k }}</kbd>
              </div>
              <div class="kh-desc">{{ lang === 'zh' ? r.zh : r.en }}</div>
            </div>
          </div>
          <div class="kh-col">
            <div class="kh-section">{{ lang === 'zh' ? '動作' : 'Actions' }}</div>
            <div v-for="r in actions" :key="r.k" class="kh-row">
              <div class="kh-keys">
                <kbd v-for="(k, i) in r.k.split(' ')" :key="i">{{ k }}</kbd>
              </div>
              <div class="kh-desc">{{ lang === 'zh' ? r.zh : r.en }}</div>
            </div>
            <div class="kh-section" style="margin-top:18px">CmdK</div>
            <div v-for="r in cmdk" :key="r.k" class="kh-row">
              <div class="kh-keys">
                <kbd v-for="(k, i) in r.k.split(' ')" :key="i">{{ k }}</kbd>
              </div>
              <div class="kh-desc">{{ lang === 'zh' ? r.zh : r.en }}</div>
            </div>
          </div>
        </div>
        <div class="kh-foot">
          <span>{{ lang === 'zh' ? '提示：先按 g，再按目標頁的字母' : 'Tip: press g, then the page letter' }}</span>
          <kbd>ESC</kbd>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Lang } from '../types';

defineProps<{ open: boolean; lang: Lang }>();
defineEmits<{ close: [] }>();

const nav = [
  { k: 'g o', zh: '總覽', en: 'Overview' },
  { k: 'g m', zh: '行情', en: 'Markets' },
  { k: 'g c', zh: '走勢圖', en: 'Chart' },
  { k: 'g p', zh: '持倉', en: 'Positions' },
  { k: 'g a', zh: '分析', en: 'Analytics' },
  { k: 'g t', zh: '交易', en: 'Trades' },
  { k: 'g w', zh: '自選', en: 'Watchlist' },
  { k: 'g b', zh: '回測', en: 'Backtest' },
  { k: 'g l', zh: '警示', en: 'Alerts' },
  { k: 'g n', zh: '通知', en: 'Notifications' },
  { k: 'g s', zh: '設定', en: 'Settings' },
  { k: 'g x', zh: '運維', en: 'Ops' },
  { k: '[', zh: '上一頁', en: 'Previous page' },
  { k: ']', zh: '下一頁', en: 'Next page' },
];

const actions = [
  { k: 'n', zh: '新訂單', en: 'New order' },
  { k: '/', zh: '搜尋', en: 'Search' },
  { k: '⌘ K', zh: '指令面板', en: 'Command palette' },
  { k: '?', zh: '此說明', en: 'This help' },
  { k: 'ESC', zh: '關閉視窗', en: 'Close overlay' },
];

const cmdk = [
  { k: '↑ ↓', zh: '選擇', en: 'Select' },
  { k: '↵', zh: '執行', en: 'Run' },
  { k: 'ESC', zh: '關閉', en: 'Close' },
];
</script>

<style scoped>
.kh-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1100; backdrop-filter: blur(4px);
}
.kh-modal {
  width: 720px; max-width: 92vw; max-height: 86vh;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; overflow: hidden;
}
.kh-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid var(--border);
}
.kh-title { font-size: 15px; font-weight: 600; }
.kh-close {
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: 0; color: var(--fg-dim);
  font-size: 20px; cursor: pointer; line-height: 1;
}
.kh-close:hover { background: var(--surface2); color: var(--fg); }
.kh-body {
  display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
  padding: 22px; overflow: auto;
}
.kh-col { display: flex; flex-direction: column; }
.kh-section {
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--fg-mute); font-weight: 700; margin-bottom: 10px;
}
.kh-row {
  display: flex; align-items: center; gap: 14px;
  padding: 7px 0;
}
.kh-keys { display: flex; gap: 4px; min-width: 88px; }
.kh-desc { font-size: 13px; color: var(--fg); }
kbd {
  display: inline-block; min-width: 22px; padding: 3px 7px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 5px; font-family: ui-monospace, monospace;
  font-size: 11px; color: var(--fg); text-align: center;
  box-shadow: 0 1px 0 var(--border);
}
.kh-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 22px; border-top: 1px solid var(--border);
  background: var(--surface2); font-size: 12px; color: var(--fg-dim);
}
</style>
