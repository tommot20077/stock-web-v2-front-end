<template>
  <div>
    <div class="banner warn-banner">
      <div class="banner-icon warn-icon">!</div>
      <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'brokerNote') }}</div>
    </div>

    <div class="sec-h sec-row">
      <span>{{ t(lang, 'brokers') }}</span>
      <button class="btn-ghost" @click="openAdd('trade')">+ {{ t(lang, 'addBroker') }}</button>
    </div>

    <div v-if="brokerKeys.length === 0" class="empty">
      <div style="font-size:13px;color:var(--fg-dim)">{{ lang === 'zh' ? '尚未配置交易接口' : 'No brokers configured' }}</div>
    </div>
    <div v-else class="brokers">
      <div v-for="k in brokerKeys" :key="k.id" class="broker">
        <div class="broker-head">
          <div class="key-l">
            <div class="key-icon" :style="{ background: providerOf(k.provider).color + '22', color: providerOf(k.provider).color }">
              {{ providerOf(k.provider).short }}
            </div>
            <div style="min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:600;font-size:14px">{{ providerOf(k.provider).name }}</span>
                <span v-if="k.label" class="tag-mute">{{ k.label }}</span>
                <span class="chip" :class="k.env">{{ k.env === 'live' ? t(lang, 'livefeed') : t(lang, 'sandbox') }}</span>
                <span class="chip trade">{{ t(lang, 'tradingEnabled') }}</span>
              </div>
              <div class="key-mono">
                <span>{{ k.key }}</span>
                <button v-if="k.canReveal" class="micro" @click="k.show = !k.show">{{ k.show ? t(lang, 'hide') : t(lang, 'show') }}</button>
                <button v-if="k.canCopy" class="micro" @click="copyKey(k)">{{ copiedId === k.id ? '✓' : t(lang, 'copy') }}</button>
              </div>
              <div style="font-size:11px;color:var(--fg-mute);margin-top:4px">
                {{ t(lang, 'lastUsed') }}: {{ k.lastUsedLabel || t(lang, 'neverUsed') }}
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

        <div class="broker-section">
          <div class="bs-l">{{ t(lang, 'hitlMode') }}</div>
          <div class="hitl">
            <button v-for="m in hitlOptions" :key="m.id"
                    :class="['hitl-card', { active: k.hitl === m.id, 'hitl-auto': m.id === 'auto' && k.hitl === 'auto' }]"
                    @click="updatePolicy(k, m.id)">
              <div class="hitl-icon">{{ m.icon }}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:12px">{{ t(lang, m.tk) }}</div>
                <div style="font-size:10px;color:var(--fg-mute);margin-top:2px;line-height:1.4">{{ t(lang, m.dk) }}</div>
              </div>
              <div class="radio" :class="{ on: k.hitl === m.id }"></div>
            </button>
          </div>
        </div>

        <div class="broker-section">
          <div class="bs-l">{{ t(lang, 'riskLimits') }}</div>
          <div class="risk-grid">
            <div class="risk">
              <div class="risk-l">{{ t(lang, 'maxSingle') }}</div>
              <div class="risk-input">
                <span class="risk-prefix">$</span>
                <input class="inp inp-num" type="number" v-model.number="k.maxSingle" min="0" step="100">
              </div>
            </div>
            <div class="risk">
              <div class="risk-l">{{ t(lang, 'maxDaily') }}</div>
              <div class="risk-input">
                <span class="risk-prefix">$</span>
                <input class="inp inp-num" type="number" v-model.number="k.maxDaily" min="0" step="1000">
              </div>
            </div>
            <div class="risk">
              <div class="risk-l">{{ t(lang, 'allowedSymbols') }}</div>
              <input class="inp" v-model="k.allowed" :placeholder="lang === 'zh' ? '空 = 全部' : 'empty = all'">
            </div>
            <div class="risk">
              <div class="risk-l">{{ t(lang, 'keyExpires') }}</div>
              <input class="inp" v-model="k.expires" placeholder="2026-12-31">
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
import type { ApiKeyView, Hitl } from '../../settingsAiAccessView';
import type { Provider } from '../../composables/useAiAccessSettings';
import type { AiHitlMode } from '../../services/apiTypes';
import type { Lang } from '../../types';

defineProps<{
  lang: Lang;
  brokerKeys: ApiKeyView[];
  copiedId: string | null;
  hitlOptions: { id: Hitl; tk: string; dk: string; icon: string }[];
  providerOf: (id: string) => Provider;
  openAdd: (mode: 'read' | 'trade') => void;
  copyKey: (key: ApiKeyView) => void;
  testKey: (key: ApiKeyView) => void | Promise<void>;
  revokeKey: (key: ApiKeyView) => void | Promise<void>;
  updatePolicy: (key: ApiKeyView, hitl: AiHitlMode) => void | Promise<void>;
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
.banner.warn-banner {
  background: color-mix(in oklch, var(--dn) 7%, transparent);
  border-color: color-mix(in oklch, var(--dn) 22%, transparent);
}
.banner.warn-banner .banner-icon { background: var(--dn); }
.sec-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--fg-dim); margin-bottom: 12px; }
.sec-row { display: flex; align-items: center; justify-content: space-between; }
.empty { text-align: center; padding: 36px 20px; border: 1px dashed var(--border); border-radius: 10px; }
.brokers { display: flex; flex-direction: column; gap: 14px; }
.broker {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden;
}
.broker-head {
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  padding: 16px;
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
.key-r { display: flex; gap: 6px; flex-shrink: 0; }
.tag-mute { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--surface); color: var(--fg-dim); }
.chip {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-dim);
  font-weight: 500; letter-spacing: .2px;
  white-space: nowrap;
}
.chip.sandbox { background: color-mix(in oklch, var(--accent) 14%, transparent); color: var(--accent); }
.chip.live { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.trade { background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6; }
.micro {
  background: transparent; border: 0; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; color: var(--fg-mute); cursor: pointer; font-family: inherit;
  text-transform: uppercase; letter-spacing: .3px;
}
.micro:hover { color: var(--accent); background: var(--surface); }
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
.broker-section {
  border-top: 1px solid var(--border);
  padding: 14px 16px;
  background: var(--surface);
}
.bs-l {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
  color: var(--fg-dim); margin-bottom: 10px;
}
.hitl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.hitl-card {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; cursor: pointer; font-family: inherit; text-align: left;
  transition: all .15s;
}
.hitl-card:hover { border-color: var(--accent); }
.hitl-card.active { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 8%, var(--surface2)); }
.hitl-card.hitl-auto.active { border-color: #8B5CF6; background: color-mix(in oklch, #8B5CF6 8%, var(--surface2)); }
.hitl-icon { font-size: 16px; }
.radio {
  flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%;
  border: 1.5px solid var(--border); background: var(--surface);
  position: relative; transition: all .15s;
}
.radio.on { border-color: var(--accent); }
.radio.on::after {
  content: ''; position: absolute; inset: 2px; border-radius: 50%; background: var(--accent);
}
.risk-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.risk-l { font-size: 11px; color: var(--fg-mute); margin-bottom: 4px; }
.risk-input { display: flex; align-items: stretch; }
.risk-prefix {
  background: var(--surface2); border: 1px solid var(--border); border-right: 0;
  padding: 6px 10px; border-radius: 6px 0 0 6px; font-size: 13px; color: var(--fg-dim);
}
.risk-input .inp-num { border-radius: 0 6px 6px 0; }
.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; padding: 7px 10px; font-size: 13px; color: var(--fg);
  font-family: inherit; transition: border-color .15s; box-sizing: border-box;
}
.inp:focus { outline: 0; border-color: var(--accent); }
</style>
