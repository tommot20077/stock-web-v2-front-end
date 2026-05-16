<template>
  <div class="row">
    <div>
      <div class="l">{{ label }}</div>
      <div class="s">{{ sub }}</div>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; sub: string }>();
</script>

<style scoped>
.row {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; border-bottom: 1px solid var(--border);
}
.l { font-size: 13px; font-weight: 500; }
.s { font-size: 11px; color: var(--fg-dim); margin-top: 2px; }
</style>
