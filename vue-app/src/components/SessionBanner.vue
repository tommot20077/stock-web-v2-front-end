<template>
  <div
    v-if="visible"
    :class="['session-banner', tone]"
    data-testid="session-banner"
    role="status"
    :aria-live="assertive ? 'assertive' : 'polite'"
  >
    <span class="status-dot" />
    <div class="banner-copy">
      <div class="banner-title">{{ copy }}</div>
      <div v-if="message" class="details" :aria-label="t(lang, 'authDetails')">
        <span data-testid="session-error-code">{{ message.code }}</span>
        <span v-if="message.status !== null">{{ t(lang, 'authStatus') }} {{ message.status }}</span>
        <span v-if="message.requestId" data-testid="session-request-id">{{ t(lang, 'authRequestId') }} {{ message.requestId }}</span>
      </div>
    </div>
    <button
      v-if="showSignInAgain"
      class="banner-action"
      data-testid="session-sign-in-again"
      @click="emit('signInAgain')"
    >
      {{ t(lang, 'authSignInAgain') }}
    </button>
    <button
      v-else-if="showRetry"
      class="banner-action"
      data-testid="session-retry"
      @click="emit('retry')"
    >
      {{ t(lang, 'authRetry') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../i18n';
import type { Lang } from '../types';
import type { SessionMessage, SessionState } from '../services/authSession';

const props = defineProps<{
  lang: Lang;
  status: SessionState['status'];
  message: SessionMessage | null;
}>();

const emit = defineEmits<{
  retry: [];
  signInAgain: [];
}>();

const visible = computed(() => props.status === 'checking'
  || props.status === 'refreshing'
  || props.status === 'error'
  || !!props.message);

const assertive = computed(() => props.status === 'error'
  || props.message?.code === 'AUTH_CSRF_TOKEN_INVALID'
  || props.message?.status === 401);

const expiredCodes = new Set(['AUTH_REFRESH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED', 'AUTH_INVALID_CREDENTIALS']);

const copy = computed(() => {
  if (props.status === 'checking') return t(props.lang, 'authChecking');
  if (props.status === 'refreshing') return t(props.lang, 'authRefreshing');
  const code = props.message?.code;
  if (code === 'AUTH_CSRF_TOKEN_INVALID') return t(props.lang, 'authCsrfError');
  if (code === 'INVALID_RUNTIME_DATA_MODE') return t(props.lang, 'authInvalidRuntimeMode');
  if (code && (expiredCodes.has(code) || props.message?.status === 401)) return t(props.lang, 'authExpired');
  if (code === 'NETWORK_ERROR' || props.message?.status === 0 || props.message?.status === 503) {
    return t(props.lang, 'authBackendUnavailable');
  }
  return t(props.lang, 'authBackendUnavailable');
});

const showSignInAgain = computed(() => !!props.message
  && (props.message.status === 401 || expiredCodes.has(props.message.code)));

const showRetry = computed(() => !!props.message
  && !showSignInAgain.value
  && props.message.code !== 'INVALID_RUNTIME_DATA_MODE');

const tone = computed(() => assertive.value ? 'danger' : 'neutral');
</script>

<style scoped>
.session-banner {
  display: flex; align-items: center; gap: 12px;
  min-height: 44px; padding: 12px 14px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; font-size: 13px; line-height: 1.45;
}
.session-banner.danger {
  border-color: color-mix(in oklch, var(--dn) 42%, var(--border));
  background: color-mix(in oklch, var(--dn) 8%, var(--surface));
}
.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent); flex-shrink: 0;
}
.danger .status-dot { background: var(--dn); }
.banner-copy { flex: 1; min-width: 0; }
.banner-title { font-weight: 600; overflow-wrap: anywhere; }
.details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.details span { overflow-wrap: anywhere; }
.banner-action {
  min-height: 36px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
  white-space: nowrap;
}
.danger .banner-action { color: var(--dn); }
@media (max-width: 760px) {
  .session-banner { align-items: flex-start; flex-wrap: wrap; }
  .banner-action { width: 100%; }
}
</style>
