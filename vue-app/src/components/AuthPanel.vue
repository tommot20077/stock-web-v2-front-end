<template>
  <section class="auth-panel" aria-live="polite" :aria-busy="busy">
    <template v-if="status === 'authenticated' && user">
      <div class="panel-head">
        <span class="auth-dot signed-in" />
        <div>
          <h2>{{ t(lang, 'authSignedIn') }}</h2>
          <p>{{ user.email || user.username }}</p>
        </div>
      </div>
      <div class="signout-copy">{{ t(lang, 'authSignOutConfirm') }}</div>
      <button
        class="auth-submit danger"
        data-testid="auth-logout"
        type="button"
        :disabled="busy"
        @click="emit('logout')"
      >
        {{ t(lang, 'authSignOut') }}
      </button>
    </template>

    <template v-else>
      <div class="panel-head">
        <span class="auth-dot" />
        <div>
          <h2 tabindex="-1">{{ t(lang, 'authSignedOut') }}</h2>
          <p>{{ t(lang, 'authSignedOutBody') }}</p>
        </div>
      </div>

      <div class="seg-pill" role="tablist" :aria-label="t(lang, 'authSignedOut')">
        <button
          type="button"
          :class="{ active: mode === 'login' }"
          data-testid="auth-tab-login"
          :disabled="busy"
          @click="mode = 'login'"
        >
          {{ t(lang, 'authSignIn') }}
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          data-testid="auth-tab-register"
          :disabled="busy"
          @click="mode = 'register'"
        >
          {{ t(lang, 'authCreateAccount') }}
        </button>
      </div>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="submitLogin">
        <label>
          <span>{{ t(lang, 'authEmail') }}</span>
          <input v-model="loginEmail" type="email" autocomplete="email" required :disabled="busy">
        </label>
        <label>
          <span>{{ t(lang, 'authPassword') }}</span>
          <input v-model="loginPassword" type="password" autocomplete="current-password" required :disabled="busy">
        </label>
        <button
          class="auth-submit"
          data-testid="auth-login-submit"
          type="submit"
          :disabled="busy"
        >
          {{ t(lang, 'authSignIn') }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="submitRegister">
        <label>
          <span>{{ t(lang, 'authEmail') }}</span>
          <input v-model="registerEmail" type="email" autocomplete="email" required :disabled="busy">
        </label>
        <label>
          <span>{{ t(lang, 'authUsername') }}</span>
          <input v-model="registerUsername" autocomplete="username" required :disabled="busy">
        </label>
        <label>
          <span>{{ t(lang, 'authPassword') }}</span>
          <input v-model="registerPassword" type="password" autocomplete="new-password" required :disabled="busy">
        </label>
        <button
          class="auth-submit"
          data-testid="auth-register-submit"
          type="submit"
          :disabled="busy"
        >
          {{ t(lang, 'authCreateAccount') }}
        </button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { t } from '../i18n';
import type { Lang } from '../types';
import type { AuthUser, LoginRequest, RegisterRequest } from '../services/authApi';
import type { SessionMessage, SessionState } from '../services/authSession';

defineProps<{
  lang: Lang;
  status: SessionState['status'];
  user: AuthUser | null;
  message: SessionMessage | null;
  busy: boolean;
}>();

const emit = defineEmits<{
  login: [request: LoginRequest];
  register: [request: RegisterRequest];
  logout: [];
}>();

const mode = ref<'login' | 'register'>('login');
const loginEmail = ref('');
const loginPassword = ref('');
const registerEmail = ref('');
const registerUsername = ref('');
const registerPassword = ref('');

function submitLogin() {
  emit('login', {
    email: loginEmail.value,
    password: loginPassword.value,
  });
}

function submitRegister() {
  emit('register', {
    email: registerEmail.value,
    username: registerUsername.value,
    password: registerPassword.value,
  });
}
</script>

<style scoped>
.auth-panel {
  width: clamp(360px, 38vw, 420px);
  max-width: calc(100vw - 32px);
  padding: 24px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface);
  color: var(--fg); font-size: 13px; line-height: 1.45;
}
.panel-head {
  display: flex; align-items: flex-start; gap: 12px;
  margin-bottom: 24px;
}
.auth-dot {
  width: 10px; height: 10px; margin-top: 6px;
  border-radius: 50%; background: var(--fg-mute); flex-shrink: 0;
}
.auth-dot.signed-in { background: var(--accent); }
h2 {
  margin: 0; font-size: 16px; line-height: 1.35;
  font-weight: 600; letter-spacing: 0;
}
p { margin: 4px 0 0; color: var(--fg-dim); }
.seg-pill {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  padding: 4px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface2);
}
.seg-pill button {
  min-height: 36px; border: 0; border-radius: 6px;
  background: transparent; color: var(--fg-dim);
  font: inherit; font-size: 13px; font-weight: 600;
}
.seg-pill button.active {
  background: var(--surface); color: var(--fg);
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.auth-form { display: flex; flex-direction: column; gap: 16px; margin-top: 24px; }
label { display: flex; flex-direction: column; gap: 8px; color: var(--fg-dim); font-size: 12px; }
input {
  min-height: 36px; padding: 0 11px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface2); color: var(--fg);
  font: inherit; font-size: 13px;
}
input:focus {
  outline: 2px solid color-mix(in oklch, var(--accent) 35%, transparent);
  border-color: var(--accent);
}
.auth-submit {
  min-height: 36px; border: 0; border-radius: 6px;
  background: var(--accent); color: #fff;
  font: inherit; font-size: 13px; font-weight: 600;
}
.auth-submit.danger { background: var(--dn); }
.auth-submit:disabled, .seg-pill button:disabled, input:disabled {
  opacity: .62; cursor: not-allowed;
}
.signout-copy { margin-bottom: 16px; color: var(--fg-dim); }
@media (max-width: 480px) {
  .auth-panel { width: calc(100vw - 32px); padding: 16px; }
}
</style>
