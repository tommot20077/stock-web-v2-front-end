<template>
  <Transition name="toast">
    <div v-if="msg" class="toast">
      <span class="dot" />
      {{ msg }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ msg: string }>();
</script>

<style scoped>
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--fg); color: var(--bg);
  padding: 10px 18px; border-radius: 99px;
  font-size: 13px; font-weight: 500;
  display: flex; align-items: center; gap: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  z-index: 2000;
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.toast-enter-active, .toast-leave-active { transition: all 220ms ease; }
</style>
