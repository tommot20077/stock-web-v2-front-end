<template>
  <div class="panel">
    <button class="toggle" @click="open = !open">⚙ Tweaks</button>
    <div v-if="open" class="body">
      <div class="head">
        <span style="font-weight:600;font-size:13px">Tweaks</span>
        <button class="x" @click="open = false">×</button>
      </div>
      <div class="row">
        <span class="lab">Theme</span>
        <div class="seg">
          <button v-for="t in ['light','dark']" :key="t" :class="{ active: tweaks.theme === t }" @click="emit('set', { key: 'theme', value: t })">{{ t }}</button>
        </div>
      </div>
      <div class="row">
        <span class="lab">Language</span>
        <div class="seg">
          <button v-for="l in ['zh','en']" :key="l" :class="{ active: tweaks.lang === l }" @click="emit('set', { key: 'lang', value: l })">{{ l === 'zh' ? '中' : 'EN' }}</button>
        </div>
      </div>
      <div class="row">
        <span class="lab">Density</span>
        <div class="seg">
          <button v-for="d in ['compact','cozy','comfy']" :key="d" :class="{ active: tweaks.density === d }" @click="emit('set', { key: 'density', value: d })">{{ d }}</button>
        </div>
      </div>
      <div class="row">
        <span class="lab">Accent</span>
        <div class="swatches">
          <button v-for="c in accents" :key="c" :style="{ background: c }" :class="{ active: tweaks.accent === c }" @click="emit('set', { key: 'accent', value: c })" />
        </div>
      </div>
      <div class="row">
        <span class="lab">Up = green</span>
        <button class="toggle-sw" :class="{ on: tweaks.upGreen }" @click="emit('set', { key: 'upGreen', value: !tweaks.upGreen })" />
      </div>
      <div class="row">
        <span class="lab">Admin role</span>
        <button class="toggle-sw" :class="{ on: tweaks.admin }" @click="emit('set', { key: 'admin', value: !tweaks.admin })" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Tweaks } from '../useTweaks';

defineProps<{ tweaks: Tweaks }>();
const emit = defineEmits<{ set: [{ key: string; value: any }] }>();

const open = ref(false);
const accents = ['#ff6600', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#f59e0b', '#0ea5e9'];
</script>

<style scoped>
.panel { position: fixed; bottom: 16px; right: 16px; z-index: 500; }
.toggle {
  background: var(--fg); color: var(--bg); border: 0;
  padding: 8px 14px; border-radius: 99px;
  font-size: 12px; font-weight: 500;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
}
.body {
  position: absolute; bottom: 44px; right: 0; width: 280px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
}
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.x { background: transparent; border: 0; font-size: 18px; color: var(--fg-dim); cursor: pointer; }
.row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); }
.row:first-of-type { border-top: 0; }
.lab { font-size: 12px; color: var(--fg-dim); }
.seg { display: flex; gap: 2px; background: var(--surface2); border-radius: 6px; padding: 2px; }
.seg button { background: transparent; border: 0; padding: 4px 10px; border-radius: 4px; font-size: 11px; color: var(--fg-dim); }
.seg button.active { background: var(--surface); color: var(--fg); }
.swatches { display: flex; gap: 6px; }
.swatches button { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.swatches button.active { border-color: var(--fg); }
.toggle-sw {
  width: 32px; height: 18px; background: var(--surface2);
  border-radius: 99px; border: 0; position: relative; cursor: pointer;
}
.toggle-sw::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--fg-dim); transition: all 160ms;
}
.toggle-sw.on { background: var(--accent); }
.toggle-sw.on::after { left: 16px; background: #fff; }
</style>
