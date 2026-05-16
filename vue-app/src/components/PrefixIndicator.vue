<template>
  <Transition name="pi">
    <div v-if="prefix" class="pi">
      <kbd>{{ prefix }}</kbd>
      <span class="pi-hint">{{ lang === 'zh' ? '等待目標鍵…' : 'waiting for next key…' }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { Lang } from '../types';

defineProps<{ prefix: string; lang: Lang }>();
</script>

<style scoped>
.pi {
  position: fixed; bottom: 24px; left: 24px;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,0.18);
  z-index: 900; font-size: 12px;
}
.pi-hint { color: var(--fg-dim); }
kbd {
  display: inline-block; min-width: 18px; padding: 3px 8px;
  background: var(--accent); color: white;
  border-radius: 5px; font-family: ui-monospace, monospace;
  font-size: 12px; font-weight: 700; text-align: center;
  text-transform: uppercase;
}
.pi-enter-active, .pi-leave-active { transition: opacity 0.15s, transform 0.15s; }
.pi-enter-from, .pi-leave-to { opacity: 0; transform: translateY(6px); }
</style>
