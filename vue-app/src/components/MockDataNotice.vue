<template>
  <div v-if="isApiMode" class="mock-data-notice" role="note" data-testid="mock-data-notice">
    <span class="mdn-tag">{{ t(lang, 'mockDataNoticeTag') }}</span>
    <span class="mdn-text">{{ t(lang, 'mockDataNoticeText') }}</span>
    <span v-if="exception" class="mdn-exception" data-testid="mock-data-notice-exception">{{ t(lang, exception) }}</span>
  </div>
</template>

<script setup lang="ts">
// 鐵律 6：尚未接後端的功能必須標示。這個標示只在 API mode 出現——
// mock mode 本來就是明確的示範模式（鐵律 3），再標一次只是雜訊。
import { t } from '../i18n';
import { getRuntimeDataMode } from '../services/runtimeDataMode';
import type { Lang } from '../types';

// exception:選填的 i18n key。頁面裡有「已接後端的例外控制」時,在既有文案下方多一行說明(U-12)。
defineProps<{ lang: Lang; exception?: string }>();

const isApiMode = getRuntimeDataMode() === 'api';
</script>

<style scoped>
.mock-data-notice {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px dashed var(--border, #3a3f4b);
  border-radius: 6px;
  font-size: 12px;
  color: var(--fg-dim, #8b93a1);
}
.mdn-tag {
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.mdn-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.mdn-exception {
  flex-basis: 100%;
  min-width: 0;
  font-size: 12px;
  color: var(--fg-dim, #8b93a1);
  overflow-wrap: anywhere;
}
</style>
