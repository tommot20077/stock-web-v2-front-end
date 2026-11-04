<template>
  <div
    v-if="status !== 'idle'"
    class="live-quote-status"
    role="status"
    aria-live="polite"
    data-testid="live-quote-status"
    :data-live-status="status"
  >
    <template v-if="status === 'connecting'">
      <span class="live-line">
        <span class="live-dot hollow" aria-hidden="true" />
        <span class="live-text">{{ t(lang, 'liveQuoteConnecting') }}</span>
      </span>
    </template>
    <template v-else-if="status === 'live'">
      <span class="live-line">
        <span class="live-dot solid" aria-hidden="true" />
        <span class="live-label">{{ t(lang, 'liveQuoteLive') }}</span>
      </span>
    </template>
    <template v-else-if="status === 'replaced'">
      <span class="live-line">
        <span class="live-strong">{{ t(lang, 'liveQuoteReplaced') }}</span>
      </span>
      <span class="live-hint">{{ t(lang, 'liveQuoteReplacedHint') }}</span>
      <button
        type="button"
        class="btn-ghost-sm live-reconnect"
        data-testid="live-quote-reconnect"
        @click="emit('reconnect')"
      >{{ t(lang, 'liveQuoteReconnectHere') }}</button>
    </template>
    <template v-else>
      <!-- degraded / closed:無圓點(D-23 不得假裝即時),只說明最後更新時間 -->
      <span class="live-line">
        <span class="live-text">{{ timedParts[0] }}<span data-testid="live-quote-time">{{ timeText }}</span>{{ timedParts[1] }}</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
// Phase 04.2 Plan 24(WATCH-04;D-23 / D-24;UI-SPEC §9、U-19、U-26):即時報價狀態列。
// 只呈現 QuoteStream 的狀態,不碰瀏覽器連線(wsBoundary.test.ts 守門);非 live 狀態不顯示實心圓點與 liveQuoteLive。
import { computed } from 'vue';
import { t } from '../i18n';
import type { QuoteStreamStatus } from '../services/quoteStream';
import type { Lang } from '../types';

const props = defineProps<{ lang: Lang; status: QuoteStreamStatus; updatedAt: number | null }>();
const emit = defineEmits<{ reconnect: [] }>();

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** U-19:本機 24 小時 `HH:mm`;不是今天時 `MM-DD HH:mm`。沒有任何成功資料 → `—`。 */
const timeText = computed(() => {
  const at = props.updatedAt;
  if (at === null || !Number.isFinite(at)) return '—';
  const date = new Date(at);
  const now = new Date();
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  return sameDay ? hhmm : `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${hhmm}`;
});

/** 以 `{time}` 切開文案,讓時間落在自己的 span(`live-quote-time`),整句仍與 tf() 結果一致。 */
const timedParts = computed<[string, string]>(() => {
  const key = props.status === 'closed' ? 'liveQuoteClosed' : 'liveQuoteDegraded';
  const template = t(props.lang, key);
  const at = template.indexOf('{time}');
  if (at < 0) return [template, ''];
  return [template.slice(0, at), template.slice(at + '{time}'.length)];
});
</script>

<style scoped>
.live-quote-status {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
  margin-top: 4px;
  font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim);
}
.live-line { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.live-text { overflow-wrap: anywhere; }
.live-label { font-weight: 600; color: var(--fg); }
.live-strong { font-weight: 600; color: var(--fg); overflow-wrap: anywhere; }
.live-hint { flex-basis: 100%; overflow-wrap: anywhere; }
.live-dot {
  flex: none; display: inline-block; width: 6px; height: 6px; border-radius: 99px;
}
.live-dot.hollow { border: 1px solid var(--fg-dim); }
.live-dot.solid { background: var(--up); animation: livePulse 2s ease-in-out infinite; }
@keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-ghost-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .live-dot.solid { animation: none; }
}
</style>
