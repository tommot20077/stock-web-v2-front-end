<template>
  <span v-if="false" />
</template>

<script setup lang="ts">
// 04.2-24 RED 骨架:props / emits 介面先就位,行為待 GREEN 實作。
import type { QuoteStreamStatus } from '../services/quoteStream';
import type { Lang } from '../types';

defineProps<{ lang: Lang; status: QuoteStreamStatus; updatedAt: number | null }>();
defineEmits<{ reconnect: [] }>();
</script>
