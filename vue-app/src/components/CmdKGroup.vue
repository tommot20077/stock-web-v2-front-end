<template>
  <div v-if="items.length" class="grp">
    <div class="grp-title">{{ title }}</div>
    <button v-for="it in items" :key="it.id" class="grp-row" @click="$emit('pick', it)">
      <span class="grp-icon">{{ icon }}</span>
      <span class="grp-label">{{ it.label }}</span>
      <span v-if="it.sub" class="grp-sub">{{ it.sub }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
interface Item { id: string; label: string; sub?: string; }
defineProps<{ title: string; items: Item[]; icon: string }>();
defineEmits<{ pick: [item: Item] }>();
</script>

<style scoped>
.grp { padding: 4px 0; }
.grp-title {
  padding: 6px 12px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--fg-mute); font-weight: 600;
}
.grp-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 12px; background: transparent; border: 0;
  border-radius: 6px; cursor: pointer; text-align: left;
  font-size: 13px; color: var(--fg);
}
.grp-row:hover { background: var(--surface2); }
.grp-icon { width: 20px; color: var(--fg-mute); font-size: 12px; }
.grp-label { flex: 1; font-weight: 500; }
.grp-sub { color: var(--fg-dim); font-size: 11px; }
</style>
