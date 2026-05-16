<template>
  <svg :viewBox="`0 0 ${w} ${h}`" :style="{ width: '100%', height: '100%', display: 'block' }" preserveAspectRatio="none">
    <g v-for="(d, i) in data" :key="i">
      <rect
        :x="i * bw + 2"
        :y="h - 22 - barH(d.v)"
        :width="bw - 8"
        :height="barH(d.v)"
        :fill="d.color || 'currentColor'"
        rx="2"
      />
      <text
        :x="i * bw + bw / 2 - 2"
        :y="h - 6"
        font-size="10"
        fill="var(--fg-dim)"
        text-anchor="middle"
      >{{ d.label }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Bar { label: string; v: number; color?: string; }

const props = withDefaults(defineProps<{
  data: Bar[];
  w?: number;
  h?: number;
}>(), { w: 600, h: 160 });

const bw = computed(() => (props.w - 4) / props.data.length);
const max = computed(() => Math.max(...props.data.map(d => Math.abs(d.v))) || 1);
function barH(v: number) { return Math.abs(v) / max.value * (props.h - 30); }
</script>
