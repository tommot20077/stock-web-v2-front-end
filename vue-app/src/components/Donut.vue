<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
    <g :transform="`translate(${size/2},${size/2}) rotate(-90)`">
      <circle :r="r" cx="0" cy="0" fill="none" :stroke="track" :stroke-width="thickness" />
      <circle
        v-for="(s, i) in segments"
        :key="i"
        :r="r" cx="0" cy="0"
        fill="none"
        :stroke="s.color"
        :stroke-width="thickness"
        :stroke-dasharray="`${s.len} ${circ}`"
        :stroke-dashoffset="-s.offset"
        stroke-linecap="butt"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Slice { value: number; color: string; }

const props = withDefaults(defineProps<{
  slices: Slice[];
  size?: number;
  thickness?: number;
  track?: string;
}>(), { size: 140, thickness: 26, track: 'var(--surface2)' });

const r = computed(() => props.size / 2 - props.thickness / 2);
const circ = computed(() => 2 * Math.PI * r.value);

const segments = computed(() => {
  const total = props.slices.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return props.slices.map((s) => {
    const len = (s.value / total) * circ.value;
    const seg = { color: s.color, len, offset };
    offset += len;
    return seg;
  });
});
</script>
