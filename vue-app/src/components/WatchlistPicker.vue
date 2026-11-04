<template>
  <Teleport to="body">
    <div v-if="open" />
  </Teleport>
</template>

<script setup lang="ts">
import type { ApiClientError } from '../services/apiClient';
import type { WatchlistDto } from '../services/watchlistApi';
import type { Lang } from '../types';

// RED 空殼:讓測試紅在斷言而非 import(04.2-18 前例)。
defineProps<{
  open: boolean;
  lang: Lang;
  symbol: string;
  anchor: HTMLElement | null;
  lists: WatchlistDto[] | null;
  loading: boolean;
  loadError: ApiClientError | null;
}>();
</script>
