<template>
  <svg :viewBox="`0 0 ${w} ${h}`" :style="{ width: '100%', height: '100%', display: 'block' }" preserveAspectRatio="none">
    <defs v-if="fill">
      <linearGradient :id="gradId" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" :stop-color="fill" stop-opacity="0.18" />
        <stop offset="100%" :stop-color="fill" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="fill" :d="areaPath" :fill="`url(#${gradId})`" stroke="none" />
    <path :d="linePath" :stroke="color" :stroke-width="strokeWidth" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  padding?: number;
}>(), {
  w: 800, h: 200, color: 'currentColor', strokeWidth: 1.6, padding: 4,
});

const gradId = `lg-${Math.random().toString(36).slice(2, 8)}`;

const points = computed(() => {
  const d = props.data;
  if (!d?.length) return [] as { x: number; y: number }[];
  const min = Math.min(...d), max = Math.max(...d);
  const span = max - min || 1;
  return d.map((v, i) => ({
    x: (i / (d.length - 1 || 1)) * (props.w - props.padding * 2) + props.padding,
    y: props.h - props.padding - ((v - min) / span) * (props.h - props.padding * 2),
  }));
});

const linePath = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ');
});

const areaPath = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  return linePath.value + ` L ${pts[pts.length - 1].x.toFixed(2)} ${props.h} L ${pts[0].x.toFixed(2)} ${props.h} Z`;
});
</script>
