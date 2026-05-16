<template>
  <div>
    <div class="pref-section">
      <div class="sec-h">{{ lang === 'zh' ? '價格警示' : 'Price alerts' }}</div>
      <div class="pref-grid">
        <label v-for="pref in priceAlertPrefs" :key="pref.key" class="pref-row">
          <input :name="pref.key" type="checkbox" v-model="notifPrefs[pref.key]">
          <span class="pref-copy">
            <strong>{{ lang === 'zh' ? pref.zh : pref.en }}</strong>
            <small>{{ lang === 'zh' ? pref.descZh : pref.descEn }}</small>
          </span>
        </label>
      </div>
    </div>

    <div class="pref-section">
      <div class="sec-h">{{ lang === 'zh' ? '訂單事件' : 'Order events' }}</div>
      <div class="pref-grid">
        <label v-for="pref in orderEventPrefs" :key="pref.key" class="pref-row">
          <input :name="pref.key" type="checkbox" v-model="notifPrefs[pref.key]">
          <span class="pref-copy">
            <strong>{{ lang === 'zh' ? pref.zh : pref.en }}</strong>
            <small>{{ lang === 'zh' ? pref.descZh : pref.descEn }}</small>
          </span>
        </label>
      </div>
    </div>

    <div class="pref-section">
      <div class="sec-h">{{ lang === 'zh' ? '安靜時段' : 'Quiet hours' }}</div>
      <div class="pref-grid quiet-grid">
        <label class="pref-row quiet-toggle">
          <input name="quietEnable" type="checkbox" v-model="notifPrefs.quietEnable">
          <span class="pref-copy">
            <strong>{{ lang === 'zh' ? '啟用安靜時段' : 'Enable quiet hours' }}</strong>
            <small>{{ lang === 'zh' ? '在指定時間只保留高優先通知' : 'Only priority notifications during the selected window' }}</small>
          </span>
        </label>
        <div class="pref-time">
          <label>
            <span>{{ lang === 'zh' ? '開始' : 'From' }}</span>
            <input name="quietFrom" class="inp" type="time" v-model="notifPrefs.quietFrom">
          </label>
          <label>
            <span>{{ lang === 'zh' ? '結束' : 'To' }}</span>
            <input name="quietTo" class="inp" type="time" v-model="notifPrefs.quietTo">
          </label>
        </div>
      </div>
    </div>

    <div class="pref-actions">
      <button class="btn-accent" @click="saveNotifPrefs">{{ t(lang, 'save') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
import type { Lang, NotificationPrefs } from '../../types';

type BooleanNotificationPref = Exclude<keyof NotificationPrefs, 'quietFrom' | 'quietTo'>;

interface PrefToggle {
  key: BooleanNotificationPref;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
}

defineProps<{
  lang: Lang;
  notifPrefs: NotificationPrefs;
  saveNotifPrefs: () => void;
}>();

const priceAlertPrefs: PrefToggle[] = [
  { key: 'alertCross', zh: '價格穿越', en: 'Price crosses', descZh: '價格突破指定門檻', descEn: 'Threshold crossing alerts' },
  { key: 'alertVol', zh: '量能異常', en: 'Volume spikes', descZh: '量能放大或異常波動', descEn: 'Unusual volume alerts' },
  { key: 'alertNews', zh: '新聞提及', en: 'News mentions', descZh: '重大新聞與標的提及', descEn: 'Important news and symbol mentions' },
];

const orderEventPrefs: PrefToggle[] = [
  { key: 'orderFill', zh: '完全成交', en: 'Filled orders', descZh: '訂單完全成交時通知', descEn: 'Notify when orders fill' },
  { key: 'orderPartial', zh: '部分成交', en: 'Partial fills', descZh: '訂單部分成交時通知', descEn: 'Notify on partial fills' },
  { key: 'orderReject', zh: '委託拒絕', en: 'Rejected orders', descZh: '交易接口拒絕委託時通知', descEn: 'Notify when a broker rejects an order' },
  { key: 'orderStop', zh: '停損觸發', en: 'Stop triggers', descZh: '停損或停利觸發時通知', descEn: 'Notify when stops or take-profit rules trigger' },
];
</script>

<style scoped>
.sec-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--fg-dim); margin-bottom: 12px; }
.pref-section + .pref-section { margin-top: 24px; }
.pref-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.pref-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px;
  cursor: pointer;
}
.pref-row input[type="checkbox"] { margin-top: 2px; accent-color: var(--accent); }
.pref-copy { display: grid; gap: 3px; min-width: 0; }
.pref-copy strong { font-size: 13px; font-weight: 600; color: var(--fg); }
.pref-copy small { font-size: 11px; line-height: 1.45; color: var(--fg-mute); }
.quiet-grid { grid-template-columns: 1fr; }
.quiet-toggle { max-width: 520px; }
.pref-time { display: flex; gap: 12px; flex-wrap: wrap; }
.pref-time label { display: grid; gap: 5px; min-width: 150px; font-size: 11px; color: var(--fg-dim); }
.pref-actions {
  display: flex; justify-content: flex-end;
  padding-top: 18px; margin-top: 24px; border-top: 1px solid var(--border);
}
.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; padding: 7px 10px; font-size: 13px; color: var(--fg);
  font-family: inherit; transition: border-color .15s; box-sizing: border-box;
}
.inp:focus { outline: 0; border-color: var(--accent); }
.btn-accent {
  background: var(--accent); color: #fff; border: 0; padding: 7px 14px;
  border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.btn-accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.12); }
</style>
