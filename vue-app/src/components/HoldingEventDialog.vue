<template>
  <Teleport to="body">
    <div v-if="open" class="mask" />
  </Teleport>
</template>

<script setup lang="ts">
import type { Lang } from '../types';

defineProps<{ open: boolean; lang: Lang }>();
</script>
