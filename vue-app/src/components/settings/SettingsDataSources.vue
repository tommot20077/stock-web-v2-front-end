<template>
  <div>
    <div class="banner">
      <div class="banner-icon">i</div>
      <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'realtimeNote') }}</div>
    </div>

    <div class="sec-h">{{ t(lang, 'dataSources') }}</div>
    <div class="src-grid">
      <div v-for="s in sources" :key="s.id" class="src-card" :class="{ off: !s.enabled }">
        <div class="src-head">
          <div class="src-l">
            <div class="src-icon" :style="{ background: s.color + '22', color: s.color }">{{ s.icon }}</div>
            <div>
              <div style="font-size:13px;font-weight:600">{{ lang === 'zh' ? s.zh : s.en }}</div>
              <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">{{ lang === 'zh' ? s.descZh : s.descEn }}</div>
            </div>
          </div>
          <label class="sw">
            <input type="checkbox" v-model="s.enabled" :disabled="!s.available">
            <span class="sw-track"></span>
          </label>
        </div>
        <div class="src-meta">
          <span class="chip" :class="s.feed">{{ t(lang, s.feed) }}</span>
          <span v-if="!s.available" class="chip warn">{{ lang === 'zh' ? '無公開接口' : 'No public API' }}</span>
          <span v-else-if="s.enabled && s.connected" class="chip ok">● {{ t(lang, 'connected') }}</span>
          <span v-else-if="s.enabled" class="chip mute">○ {{ t(lang, 'notConnected') }}</span>
          <span v-else class="chip mute">{{ t(lang, 'disabled') }}</span>
        </div>
      </div>
    </div>

    <div class="sec-h sec-row" style="margin-top:28px">
      <span>{{ t(lang, 'apiKeys') }}
        <span class="sec-h-sub">· {{ lang === 'zh' ? '唯讀來源' : 'read-only sources' }}</span>
      </span>
      <button class="btn-ghost" @click="openAdd('read')">+ {{ t(lang, 'addKey') }}</button>
    </div>
    <div style="font-size:11px;color:var(--fg-mute);margin-bottom:12px">{{ t(lang, 'envOnly') }}</div>

    <div v-if="readKeys.length === 0" class="empty">
      <div style="font-size:13px;color:var(--fg-dim)">{{ lang === 'zh' ? '尚未設定任何資料來源金鑰' : 'No data-source keys yet' }}</div>
    </div>
    <div v-else class="keys">
      <div v-for="k in readKeys" :key="k.id" class="key-row">
        <div class="key-l">
          <div class="key-icon" :style="{ background: providerOf(k.provider).color + '22', color: providerOf(k.provider).color }">
            {{ providerOf(k.provider).short }}
          </div>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-weight:600;font-size:13px">{{ providerOf(k.provider).name }}</span>
              <span v-if="k.label" class="tag-mute">{{ k.label }}</span>
              <span class="chip readonly">{{ t(lang, 'readOnly') }}</span>
            </div>
            <div class="key-mono">
              <span>{{ k.key }}</span>
              <button v-if="k.canReveal" class="micro" @click="k.show = !k.show">{{ k.show ? t(lang, 'hide') : t(lang, 'show') }}</button>
              <button v-if="k.canCopy" class="micro" @click="copyKey(k)">{{ copiedId === k.id ? '✓' : t(lang, 'copy') }}</button>
            </div>
            <div style="font-size:11px;color:var(--fg-mute);margin-top:4px">
              {{ t(lang, 'rateLimit') }}: {{ providerOf(k.provider).rate }} {{ t(lang, 'requests') }} / {{ t(lang, 'perMinute') }}
            </div>
          </div>
        </div>
        <div class="key-r">
          <button class="btn-ghost" :disabled="k.testing" @click="testKey(k)">
            <span v-if="k.testing">{{ t(lang, 'testing') }}</span>
            <span v-else-if="k.lastTest === 'ok'" style="color:var(--up)">✓ {{ t(lang, 'connected') }}</span>
            <span v-else-if="k.lastTest === 'fail'" style="color:var(--dn)">! {{ lang === 'zh' ? '失敗' : 'Failed' }}</span>
            <span v-else>{{ t(lang, 'testConnection') }}</span>
          </button>
          <button class="btn-ghost danger" @click="revokeKey(k)">{{ t(lang, 'revoke') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
import type { ApiKeyView } from '../../settingsAiAccessView';
import type { Provider, Source } from '../../composables/useAiAccessSettings';
import type { Lang } from '../../types';

defineProps<{
  lang: Lang;
  sources: Source[];
  readKeys: ApiKeyView[];
  copiedId: string | null;
  providerOf: (id: string) => Provider;
  openAdd: (mode: 'read' | 'trade') => void;
  copyKey: (key: ApiKeyView) => void;
  testKey: (key: ApiKeyView) => void | Promise<void>;
  revokeKey: (key: ApiKeyView) => void | Promise<void>;
}>();
</script>

<style scoped>
.banner {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 14px; background: color-mix(in oklch, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in oklch, var(--accent) 22%, transparent);
  border-radius: 10px; margin-bottom: 24px;
}
.banner-icon {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; font-style: italic;
  font-family: Georgia, serif;
}
.sec-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--fg-dim); margin-bottom: 12px; }
.sec-h-sub { color: var(--fg-mute); font-weight: 500; text-transform: none; letter-spacing: 0; }
.sec-row { display: flex; align-items: center; justify-content: space-between; }
.src-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.src-card {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px; transition: all .15s;
}
.src-card.off { opacity: .65; }
.src-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.src-l { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.src-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
}
.src-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-dim);
  font-weight: 500; letter-spacing: .2px;
  white-space: nowrap;
}
.chip.livefeed { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.cached { background: var(--surface); color: var(--fg-mute); }
.chip.sandbox { background: color-mix(in oklch, var(--accent) 14%, transparent); color: var(--accent); }
.chip.readonly { background: var(--surface); color: var(--fg-dim); }
.chip.ok { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.warn { background: color-mix(in oklch, var(--dn) 14%, transparent); color: var(--dn); }
.chip.mute { color: var(--fg-mute); }
.sw { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
.sw input { opacity: 0; width: 0; height: 0; }
.sw-track { position: absolute; inset: 0; background: var(--border); border-radius: 999px; transition: background .2s; }
.sw-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: #fff; border-radius: 50%;
  transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.sw input:checked + .sw-track { background: var(--accent); }
.sw input:checked + .sw-track::before { transform: translateX(16px); }
.sw input:disabled + .sw-track { opacity: .5; cursor: not-allowed; }
.empty { text-align: center; padding: 36px 20px; border: 1px dashed var(--border); border-radius: 10px; }
.keys { display: flex; flex-direction: column; gap: 10px; }
.key-row {
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
}
.key-l { display: flex; gap: 12px; flex: 1; min-width: 0; }
.key-icon {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; letter-spacing: .3px;
}
.key-mono {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
  font-family: var(--mono, ui-monospace, monospace); font-size: 11px;
  color: var(--fg-dim); flex-wrap: wrap;
}
.micro {
  background: transparent; border: 0; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; color: var(--fg-mute); cursor: pointer; font-family: inherit;
  text-transform: uppercase; letter-spacing: .3px;
}
.micro:hover { color: var(--accent); background: var(--surface); }
.tag-mute { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--surface); color: var(--fg-dim); }
.key-r { display: flex; gap: 6px; flex-shrink: 0; }
.btn-ghost {
  background: var(--surface2); border: 1px solid var(--border); padding: 6px 12px;
  border-radius: 6px; font-size: 12px; color: var(--fg); cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-ghost:disabled {
  opacity: .48; cursor: not-allowed; color: var(--fg-mute);
  border-color: var(--border); background: color-mix(in oklch, var(--surface2) 70%, transparent);
}
.btn-ghost.danger:hover { border-color: var(--dn); color: var(--dn); }
</style>
