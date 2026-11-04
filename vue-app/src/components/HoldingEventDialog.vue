<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click="onMaskClick">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="holding-event-dialog-title"
        :aria-busy="submitting ? 'true' : 'false'"
        data-testid="holding-event-dialog"
        @click.stop
      >
        <div class="hd">
          <!-- 兩步(form → result)沒有進度可言,所以不放 step dots;無 review 步驟(U-01) -->
          <div id="holding-event-dialog-title" class="hd-ttl">{{ dialogTitle }}</div>
          <button
            type="button"
            class="x"
            data-testid="holding-event-close"
            :aria-label="t(lang, 'closeHoldingEventDialog')"
            @click="onClose"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <!-- FORM -->
        <div v-if="step === 'form'" class="body">
          <div id="holding-event-symbol-label" class="lab">{{ t(lang, 'symbol') }}</div>
          <!--
            從 Trades 開啟(無 symbol):可搜尋 typeahead(D-28)。行為與七態逐項沿用 OrderTicket.vue:33-146;
            差異:輸入框是 13px `.inp`(Display 留給金額),listbox 在文件流內(U-04,body 會捲動,絕對定位會被裁切)。
          -->
          <div v-if="isTypeahead" ref="symBlock" class="sym-wrap">
            <input
              id="holding-event-symbol"
              ref="symInput"
              v-model="symQuery"
              type="text"
              autocomplete="off"
              class="inp"
              data-testid="holding-event-symbol-input"
              role="combobox"
              aria-autocomplete="list"
              aria-labelledby="holding-event-symbol-label"
              aria-controls="holding-event-symbol-options"
              :aria-expanded="symPopoverOpen ? 'true' : 'false'"
              :aria-activedescendant="activeOptionId"
              :aria-invalid="invalidAttr('symbol')"
              :aria-describedby="describedBy('symbol')"
              :placeholder="t(lang, 'selectSymbol')"
              :disabled="submitting"
              @focus="onSymFocus"
              @blur="onSymBlur"
              @input="onSymInput"
              @keydown="onSymKeydown"
            />
            <div v-if="pickedAsset" class="sym-meta">
              <span class="sym-name">{{ pickedAsset.name }}</span>
              <span class="ccy-tag">{{ pickedAsset.currency }}</span>
            </div>

            <!-- 七態下拉;這一區的任何狀態都不得阻擋其他欄位(錯誤只屬於這個區塊) -->
            <div v-if="symPopoverOpen" class="sym-pop">
              <div v-if="symbolLoading" class="block-state" data-testid="holding-event-symbol-loading">
                <!-- Loading 一律有可讀文字,不得只有骨架 -->
                <div>{{ t(lang, 'loading') }}</div>
                <div v-for="i in 3" :key="i" class="skeleton-row" />
              </div>
              <div v-else-if="symbolError" class="block-error" data-testid="holding-event-symbol-error">
                <div>{{ t(lang, 'symbolSearchFailed') }}</div>
                <!-- 只露 code 與 traceId,不顯示後端 message -->
                <div class="details">
                  <span data-testid="holding-event-symbol-error-code">{{ symbolError.code }}</span>
                  <span v-if="symbolError.traceId" data-testid="holding-event-symbol-trace-id">
                    {{ t(lang, 'authRequestId') }} {{ symbolError.traceId }}
                  </span>
                </div>
                <button
                  type="button"
                  class="block-retry"
                  data-testid="holding-event-symbol-retry"
                  @click="retrySymbolSearch"
                >{{ t(lang, 'authRetry') }}</button>
              </div>
              <template v-else>
                <div
                  v-if="visibleOptions.length"
                  id="holding-event-symbol-options"
                  class="sym-list"
                  role="listbox"
                  aria-labelledby="holding-event-symbol-label"
                  data-testid="holding-event-symbol-options"
                >
                  <div
                    v-for="(asset, index) in visibleOptions"
                    :id="`holding-event-symbol-option-${index}`"
                    :key="asset.uuid"
                    :class="['sym-row', { active: index === activeIndex }]"
                    role="option"
                    :aria-selected="asset.symbol === selectedSymbol ? 'true' : 'false'"
                    :data-testid="`holding-event-symbol-option-${asset.symbol}`"
                    @mousedown.prevent="pickAsset(asset)"
                  >
                    <span class="sym-code">{{ asset.symbol }}</span>
                    <span class="sym-name">{{ asset.name }}</span>
                    <span class="ccy-tag">{{ asset.currency }}</span>
                  </div>
                </div>
                <!-- 有結果但全部不可交易,必須與「查無結果」分開,否則使用者以為打錯字 -->
                <div
                  v-else-if="symbolNoTradable"
                  class="block-state"
                  data-testid="holding-event-symbol-no-tradable"
                >{{ t(lang, 'symbolNoTradable') }}</div>
                <div
                  v-else
                  class="block-state"
                  data-testid="holding-event-symbol-empty"
                >{{ t(lang, 'symbolNoResults') }}</div>
                <!-- 不做分頁 / 無限捲動,只提示縮小關鍵字 -->
                <div
                  v-if="symbolTruncated"
                  class="sym-truncated"
                  data-testid="holding-event-symbol-truncated"
                >{{ t(lang, 'symbolMoreResults') }}</div>
              </template>
            </div>
          </div>
          <!-- 從持倉開啟:標的鎖定顯示,不可改(D-11) -->
          <div
            v-else
            class="sym-locked"
            role="group"
            aria-labelledby="holding-event-symbol-label"
            data-testid="holding-event-symbol-locked"
          >
            <span class="sym-code">{{ selectedSymbol }}</span>
            <span v-if="holding?.name" class="sym-name">{{ holding.name }}</span>
            <span v-if="selectedCurrency" class="ccy-tag">{{ selectedCurrency }}</span>
          </div>
          <p
            v-if="fieldErrorText('symbol')"
            :id="fieldErrorId('symbol')"
            class="field-error"
            data-testid="holding-event-field-error-symbol"
          >{{ fieldErrorText('symbol') }}</p>

          <div id="holding-event-type-label" class="lab">{{ t(lang, 'type') }}</div>
          <div
            class="type-toggle"
            role="group"
            aria-labelledby="holding-event-type-label"
            :aria-describedby="describedBy('type')"
          >
            <button
              v-for="option in MODE_OPTIONS"
              :key="option.mode"
              type="button"
              :class="['type-btn', { active: mode === option.mode }]"
              :data-testid="option.testid"
              :aria-pressed="mode === option.mode ? 'true' : 'false'"
              :disabled="submitting"
              @click="selectMode(option.mode)"
            >{{ t(lang, option.labelKey) }}</button>
          </div>
          <p
            v-if="fieldErrorText('type')"
            :id="fieldErrorId('type')"
            class="field-error"
            data-testid="holding-event-field-error-type"
          >{{ fieldErrorText('type') }}</p>

          <!-- 現金股利:實領金額(Display)、預扣稅、入帳時間 -->
          <template v-if="mode === 'cashDividend'">
            <label class="lab" for="holding-event-amount">{{ t(lang, 'holdingEventAmount') }}</label>
            <div class="amount-row">
              <input
                id="holding-event-amount"
                ref="amountInput"
                v-model="amount"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                class="inp big"
                data-testid="holding-event-amount"
                :aria-invalid="invalidAttr('amount')"
                :aria-describedby="describedBy('amount', 'holding-event-amount-hint')"
                :disabled="submitting"
                @blur="touched.amount = true"
              />
              <span
                v-if="selectedCurrency"
                class="ccy-tag"
                data-testid="holding-event-amount-ccy"
              >{{ selectedCurrency }}</span>
            </div>
            <p id="holding-event-amount-hint" class="hint">{{ amountHint }}</p>
            <p
              v-if="fieldErrorText('amount')"
              :id="fieldErrorId('amount')"
              class="field-error"
              data-testid="holding-event-field-error-amount"
            >{{ fieldErrorText('amount') }}</p>

            <label class="lab" for="holding-event-tax">{{ t(lang, 'holdingEventTax') }}</label>
            <input
              id="holding-event-tax"
              v-model="tax"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              class="inp"
              data-testid="holding-event-tax"
              :aria-invalid="invalidAttr('withholdingTax')"
              :aria-describedby="describedBy('withholdingTax', 'holding-event-tax-hint')"
              :disabled="submitting"
            />
            <p id="holding-event-tax-hint" class="hint">{{ t(lang, 'holdingEventTaxHint') }}</p>
            <p
              v-if="fieldErrorText('withholdingTax')"
              :id="fieldErrorId('withholdingTax')"
              class="field-error"
              data-testid="holding-event-field-error-withholdingTax"
            >{{ fieldErrorText('withholdingTax') }}</p>

            <label class="lab" for="holding-event-paid-at">{{ t(lang, 'holdingEventPaidAt') }}</label>
            <input
              id="holding-event-paid-at"
              v-model="paidAt"
              type="datetime-local"
              class="inp"
              data-testid="holding-event-paid-at"
              :aria-invalid="invalidAttr('paidAt')"
              :aria-describedby="describedBy('paidAt', 'holding-event-paid-at-hint')"
              :max="maxPaidAt"
              :disabled="submitting"
              @blur="touched.paidAt = true"
            />
            <p id="holding-event-paid-at-hint" class="hint">{{ t(lang, 'holdingEventPaidAtHint') }}</p>
            <p
              v-if="fieldErrorText('paidAt')"
              :id="fieldErrorId('paidAt')"
              class="field-error"
              data-testid="holding-event-field-error-paidAt"
            >{{ fieldErrorText('paidAt') }}</p>

          </template>

          <!-- 配股:實領股數(Display);目前持股只顯示、不計算(D-05) -->
          <template v-else-if="mode === 'stockDividend'">
            <label class="lab" for="holding-event-shares">{{ t(lang, 'holdingEventShares') }}</label>
            <input
              id="holding-event-shares"
              ref="sharesInput"
              v-model="shares"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              class="inp big"
              data-testid="holding-event-shares"
              :aria-invalid="invalidAttr('quantity')"
              :aria-describedby="describedBy('quantity', 'holding-event-shares-hint', currentQtyText ? 'holding-event-current-qty' : '')"
              :disabled="submitting"
              @blur="touched.shares = true"
            />
            <p id="holding-event-shares-hint" class="hint">{{ t(lang, 'holdingEventSharesHint') }}</p>
            <p
              v-if="currentQtyText"
              id="holding-event-current-qty"
              class="hint num"
              data-testid="holding-event-current-qty"
            >{{ currentQtyText }}</p>
            <p
              v-if="fieldErrorText('quantity')"
              :id="fieldErrorId('quantity')"
              class="field-error"
              data-testid="holding-event-field-error-quantity"
            >{{ fieldErrorText('quantity') }}</p>
          </template>

          <!-- 拆股 / 合股:比例 new : old(兩個 96px Display 輸入視為一個焦點元素,D-08) -->
          <template v-else>
            <div id="holding-event-ratio-label" class="lab">{{ t(lang, 'holdingEventRatio') }}</div>
            <div
              class="ratio-group"
              role="group"
              aria-labelledby="holding-event-ratio-label"
              :aria-describedby="describedBy('ratio', 'holding-event-ratio-hint')"
            >
              <input
                id="holding-event-ratio-new"
                ref="ratioNewInput"
                v-model="ratioNew"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                class="inp big num"
                data-testid="holding-event-ratio-new"
                :aria-label="t(lang, 'holdingEventRatioNew')"
                :aria-invalid="invalidAttr('ratio')"
                :disabled="submitting"
                @blur="touched.ratio = true"
              />
              <span class="ratio-sep" aria-hidden="true">:</span>
              <input
                id="holding-event-ratio-old"
                v-model="ratioOld"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                class="inp big num"
                data-testid="holding-event-ratio-old"
                :aria-label="t(lang, 'holdingEventRatioOld')"
                :aria-invalid="invalidAttr('ratio')"
                :disabled="submitting"
                @blur="touched.ratio = true"
              />
            </div>
            <p id="holding-event-ratio-hint" class="hint">{{ t(lang, 'holdingEventRatioHint') }}</p>
            <!-- 讀法只是重述輸入(UI-SPEC §Money 唯一允許的前端衍生),不換算股數 -->
            <p v-if="ratioReadText" class="hint num" data-testid="holding-event-ratio-read">{{ ratioReadText }}</p>
            <p
              v-if="currentQtyText"
              class="hint num"
              data-testid="holding-event-current-qty"
            >{{ currentQtyText }}</p>
            <p
              v-if="fieldErrorText('ratio')"
              :id="fieldErrorId('ratio')"
              class="field-error"
              data-testid="holding-event-field-error-ratio"
            >{{ fieldErrorText('ratio') }}</p>
          </template>

          <!-- 配股、拆股:除權日原樣 YYYY-MM-DD,不轉時區(後端以 TradingDay.startOf 換算) -->
          <template v-if="mode !== 'cashDividend'">
            <label class="lab" for="holding-event-effective-date">{{ t(lang, 'holdingEventEffectiveDate') }}</label>
            <input
              id="holding-event-effective-date"
              v-model="effectiveDate"
              type="date"
              class="inp num"
              data-testid="holding-event-effective-date"
              :aria-invalid="invalidAttr('effectiveDate')"
              :aria-describedby="describedBy('effectiveDate', 'holding-event-effective-date-hint')"
              :max="maxEffectiveDate"
              :disabled="submitting"
              @blur="touched.effectiveDate = true"
            />
            <p id="holding-event-effective-date-hint" class="hint">{{ t(lang, 'holdingEventEffectiveDateHint') }}</p>
            <p
              v-if="fieldErrorText('effectiveDate')"
              :id="fieldErrorId('effectiveDate')"
              class="field-error"
              data-testid="holding-event-field-error-effectiveDate"
            >{{ fieldErrorText('effectiveDate') }}</p>
          </template>

          <label class="lab" for="holding-event-note">{{ t(lang, 'notes') }}</label>
          <textarea
            id="holding-event-note"
            v-model="note"
            rows="2"
            maxlength="500"
            class="inp"
            data-testid="holding-event-note"
            :aria-invalid="invalidAttr('note')"
            :aria-describedby="describedBy('note')"
            :disabled="submitting"
          />
          <p
            v-if="fieldErrorText('note')"
            :id="fieldErrorId('note')"
            class="field-error"
            data-testid="holding-event-field-error-note"
          >{{ fieldErrorText('note') }}</p>

          <!-- 常駐揭露:模式說明 → 只記帳(鐵律 5)→ 寫入後不可改(append-only,錯了只能沖銷) -->
          <p class="hint note-first">{{ modeNoteText }}</p>
          <p class="hint">{{ t(lang, 'holdingEventLedgerOnlyNote') }}</p>
          <p class="hint">{{ t(lang, 'holdingEventIrreversibleNote') }}</p>
          <p
            v-if="submitting"
            class="submitting-note"
            role="status"
            aria-live="polite"
            data-testid="holding-event-submitting-status"
          >{{ t(lang, 'recordingTrade') }}</p>
        </div>

        <!-- RESULT:只渲染後端回傳的 DTO,不顯示表單值(D-02) -->
        <div v-else class="body result" data-testid="holding-event-result">
          <div class="check" aria-hidden="true">✓</div>
          <h2 ref="resultTitle" class="result-ttl" tabindex="-1">{{ resultTitleText }}</h2>
          <div class="result-sub">{{ resultSubText }}</div>
          <div v-if="recorded" class="rev-grid">
            <div class="span-2">
              <span>{{ t(lang, 'cashEntryId') }}</span>
              <b class="entry-id" data-testid="holding-event-result-entry-id">{{ recorded.dto.id }}</b>
            </div>
            <div>
              <span>{{ t(lang, 'symbol') }}</span>
              <b>{{ recorded.dto.symbol }} <span class="ccy-tag">{{ recorded.dto.currency }}</span></b>
            </div>
            <div>
              <span>{{ t(lang, 'type') }}</span>
              <b>{{ recordedTypeLabel }}</b>
            </div>
            <template v-if="recorded.kind === 'dividend'">
              <div class="span-2">
                <span>{{ t(lang, 'holdingEventAmount') }}</span>
                <b class="num">{{ fmtMoney(recorded.dto.amount, recorded.dto.currency, minorUnits(recorded.dto.currency)) }}</b>
              </div>
              <div class="span-2" data-testid="holding-event-result-tax">
                <span class="num">{{ tf(lang, 'tradesTaxLine', { amount: fmtMoney(recorded.dto.withholdingTax, recorded.dto.currency, minorUnits(recorded.dto.currency)) }) }}</span>
              </div>
              <div class="span-2">
                <span>{{ t(lang, 'holdingEventPaidAt') }}</span>
                <b class="num entry-id">{{ formatDateTime(recorded.dto.paidAt) }}</b>
              </div>
            </template>
            <template v-else>
              <div class="span-2">
                <span>{{ t(lang, 'holdingEventQtyDelta') }}</span>
                <b class="num" data-testid="holding-event-result-qty-delta">{{ fmtSignedQuantity(recorded.dto.quantityDelta) }}</b>
              </div>
              <div v-if="recorded.dto.type === 'SPLIT'" class="span-2">
                <span>{{ t(lang, 'holdingEventRatio') }}</span>
                <b class="num">{{ recorded.dto.ratioNew }} : {{ recorded.dto.ratioOld }}</b>
              </div>
              <div class="span-2">
                <span>{{ t(lang, 'holdingEventEffectiveDate') }}</span>
                <b class="num">{{ recorded.dto.effectiveDate }}</b>
              </div>
            </template>
            <div class="span-2">
              <span>{{ t(lang, 'notes') }}</span>
              <b class="entry-id">{{ recorded.dto.note || '—' }}</b>
            </div>
          </div>
        </div>

        <!-- 送出錯誤:body 與 footer 之間的單一區域;診斷列只露 code 與 traceId,絕不露後端 message -->
        <div
          v-if="submitError && !hasFieldLevelErrors"
          class="form-error submit-error"
          role="alert"
          data-testid="holding-event-error"
        >
          <div>{{ submitErrorMessage }}</div>
          <div class="details">
            <span data-testid="holding-event-error-code">{{ submitError.code }}</span>
            <span v-if="submitError.traceId" data-testid="holding-event-error-trace-id">
              {{ t(lang, 'authRequestId') }} {{ submitError.traceId }}
            </span>
          </div>
        </div>

        <div class="ft">
          <template v-if="step === 'form'">
            <button
              type="button"
              class="btn-ghost"
              data-testid="holding-event-cancel"
              :disabled="submitting"
              @click="onClose"
            >{{ t(lang, 'cancel') }}</button>
            <button
              type="button"
              class="btn-accent btn-submit"
              data-testid="holding-event-submit"
              :disabled="submitting || !canSubmit"
              @click="submitEvent"
            >{{ submitting ? t(lang, 'recordingTrade') : submitLabel }}</button>
          </template>
          <template v-else>
            <button
              type="button"
              class="btn-ghost"
              data-testid="holding-event-record-another"
              @click="recordAnother"
            >{{ t(lang, 'recordAnother') }}</button>
            <button type="button" class="btn-accent btn-done" data-testid="holding-event-done" @click="emit('close')">
              {{ t(lang, 'cashDone') }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { t, tf } from '../i18n';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { notifyHoldingEventCreated } from '../services/portfolioRevision';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import { fmtMoney, fmtQuantity, fmtSignedMoney, fmtSignedQuantity, minorUnits } from '../moneyFormat';
import type { AssetDto, PaginatedResponse, PortfolioActivityDto } from '../services/apiTypes';
import type { DividendDto, ShareAdjustmentDto } from '../services/holdingEventApi';
import type { Lang } from '../types';

/** 三種記錄模式;名稱依 D-11(「股利與股數調整」)。 */
export type HoldingEventMode = 'cashDividend' | 'stockDividend' | 'split';

const props = withDefaults(defineProps<{
  open: boolean;
  lang: Lang;
  /** 有值 = 從持倉開啟,標的鎖定(D-11)。 */
  symbol?: string | null;
  /** 開啟者已知的持倉;只顯示、不計算(Phase 3 D-04)。 */
  holding?: { totalQuantity: number; currency?: string; name?: string } | null;
  initialMode?: HoldingEventMode;
  /** 沖銷模式由 04.2-19 實作。 */
  reversalOf?: PortfolioActivityDto | null;
}>(), {
  symbol: null,
  holding: null,
  initialMode: 'cashDividend',
  reversalOf: null,
});
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'recorded', event: DividendDto | ShareAdjustmentDto): void;
  (e: 'reversalConflict', code: string): void;
}>();

const MODE_OPTIONS: ReadonlyArray<{ mode: HoldingEventMode; testid: string; labelKey: string }> = [
  { mode: 'cashDividend', testid: 'holding-event-mode-cash-dividend', labelKey: 'holdingEventModeCashDividend' },
  { mode: 'stockDividend', testid: 'holding-event-mode-stock-dividend', labelKey: 'holdingEventModeStockDividend' },
  { mode: 'split', testid: 'holding-event-mode-split', labelKey: 'holdingEventModeSplit' },
];

type Step = 'form' | 'result';
const step = ref<Step>('form');
const mode = ref<HoldingEventMode>('cashDividend');

const selectedSymbol = ref<string | null>(null);
const selectedCurrency = ref<string | null>(null);
/** typeahead 選定的資產(只用於顯示名稱與幣別);鎖定標的時為 null。 */
const pickedAsset = ref<AssetDto | null>(null);
const amount = ref('');
const tax = ref('');
const paidAt = ref('');
const maxPaidAt = ref('');
const shares = ref('');
const ratioNew = ref('');
const ratioOld = ref('');
const effectiveDate = ref('');
const maxEffectiveDate = ref('');
const note = ref('');

/** 欄位被使用者離開過才算「碰過」:空欄位在 blur 前不提早罵人。 */
const touched = reactive({ symbol: false, amount: false, paidAt: false, shares: false, ratio: false, effectiveDate: false });

const submitting = ref(false);
type RecordedEvent = { kind: 'dividend'; dto: DividendDto } | { kind: 'shareAdjustment'; dto: ShareAdjustmentDto };
const recorded = ref<RecordedEvent | null>(null);

const amountInput = ref<HTMLInputElement | null>(null);
const symInput = ref<HTMLInputElement | null>(null);
const symBlock = ref<HTMLElement | null>(null);
const sharesInput = ref<HTMLInputElement | null>(null);
const ratioNewInput = ref<HTMLInputElement | null>(null);
const resultTitle = ref<HTMLElement | null>(null);

// =================== Idempotency-Key 的生命週期(D-13 = 04.1 D-11) ===================
// 規則 1:key 在「按下送出」那一刻產生,同一次嘗試的重試沿用同一把。
// 規則 2:使用者自上次送出後動過任何欄位(含模式)→ 下次送出換新 key(改過欄位 = 新意圖)。
// `currentKey` 絕不得綁進任何模板節點 —— 顯示 key 只會邀請使用者去改它。
const currentKey = ref<string | null>(null);
const dirtySinceSubmit = ref(false);

/** 診斷只露 `code` 與 `traceId`,絕不顯示後端 `message`。 */
interface SubmitError {
  code: string;
  traceId: string | null;
  fields: Record<string, string> | null;
  status: number;
}
const submitError = ref<SubmitError | null>(null);

/** 本機日期 `YYYY-MM-DD`;除權日是標的市場的交易日,前端只以本機日期擋「晚於今天」。 */
function todayLocalDate(): string {
  return toLocalInputValue(new Date()).slice(0, 10);
}

/** 清空模式專屬欄位(切換模式與開啟共用);標的與備註不在此列。 */
function resetModeFields() {
  amount.value = '';
  tax.value = '';
  shares.value = '';
  ratioNew.value = '';
  ratioOld.value = '';
  const now = new Date();
  paidAt.value = toLocalInputValue(now);
  maxPaidAt.value = toLocalInputValue(now);
  effectiveDate.value = todayLocalDate();
  maxEffectiveDate.value = todayLocalDate();
  touched.amount = false;
  touched.paidAt = false;
  touched.shares = false;
  touched.ratio = false;
  touched.effectiveDate = false;
}

function resetForm() {
  step.value = 'form';
  mode.value = props.initialMode;
  selectedSymbol.value = props.symbol;
  selectedCurrency.value = props.holding?.currency ?? null;
  note.value = '';
  resetModeFields();
  resetSymbolSearch();
  recorded.value = null;
  submitError.value = null;
  currentKey.value = null;
  dirtySinceSubmit.value = false;
}

// =================== 標的 typeahead(D-28;狀態機逐項沿用 OrderTicket.vue) ===================

/** 無 symbol(從 Trades 開啟)= 可搜尋;有 symbol(從持倉開啟)= 鎖定。 */
const isTypeahead = computed(() => props.symbol === null);

/** 診斷只露 code 與 traceId,絕不顯示後端 message。 */
interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

/** 下拉最多 10 筆(後端 `size` 上限 100);超量只提示縮小關鍵字。 */
const SEARCH_SIZE = 10;
/** idle(聚焦未輸入)只列前 6 筆,不宣稱任何排序語意。 */
const IDLE_LIMIT = 6;
const SEARCH_DEBOUNCE_MS = 250;

const symQuery = ref('');
const symOpen = ref(false);
const symbolState = ref<BlockState<PaginatedResponse<AssetDto>>>({ status: 'idle' });
/** 目前畫面上這份結果對應的查詢字串(空字串 = idle 列表)。 */
const activeQuery = ref('');
const activeIndex = ref(-1);

// 模板不做型別窄化,一律先投影成 computed。
const symbolLoading = computed(() => symbolState.value.status === 'loading');
const symbolError = computed(() => (symbolState.value.status === 'error' ? symbolState.value.error : null));
const symbolPage = computed(() => (symbolState.value.status === 'loaded' ? symbolState.value.data : null));

// 唯一允許的本地過濾:只列可交易標的(股利標的須 active + tradeable)。關鍵字過濾是後端的事。
const options = computed<AssetDto[]>(() => (symbolPage.value?.items ?? []).filter(asset => asset.tradeable));
const visibleOptions = computed(() => (
  activeQuery.value === '' ? options.value.slice(0, IDLE_LIMIT) : options.value
));
const symbolNoTradable = computed(() => (
  !!symbolPage.value && symbolPage.value.items.length > 0 && options.value.length === 0
));
const symbolTruncated = computed(() => (
  !!symbolPage.value
  && activeQuery.value !== ''
  && symbolPage.value.totalElements > symbolPage.value.items.length
));

const symPopoverOpen = computed(() => symOpen.value && symbolState.value.status !== 'idle');
const activeOptionId = computed(() => (
  symPopoverOpen.value && activeIndex.value >= 0 && activeIndex.value < visibleOptions.value.length
    ? `holding-event-symbol-option-${activeIndex.value}`
    : undefined
));

function describeSearchError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

// debounce 壓請求量,遞增 request id 壓亂序返回(慢網路下 `AAP` 的回應不得覆蓋 `AAPL`)。
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;
let searchController: AbortController | null = null;

function cancelPendingSearch() {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

async function runSymbolSearch(query: string) {
  cancelPendingSearch();
  const seq = ++searchSeq;
  activeQuery.value = query;
  activeIndex.value = -1;
  symbolState.value = { status: 'loading' };
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  try {
    const page = await getRuntimeApiClients().market.searchAssets(
      { query, page: 0, size: SEARCH_SIZE },
      controller.signal,
    );
    if (seq !== searchSeq) return;
    symbolState.value = { status: 'loaded', data: page };
    // 精準命中可交易標的即選定,但下拉不收起:使用者還沒看清楚候選就被收走不友善(沿用 OrderTicket)。
    const exact = page.items.find(
      asset => asset.tradeable && asset.symbol.toUpperCase() === query.toUpperCase(),
    );
    if (exact) pickAsset(exact, { close: false });
  } catch (error) {
    // 已被新查詢取代的請求(含 abort 造成的 DOMException)一律不寫回狀態。
    if (seq !== searchSeq) return;
    symbolState.value = { status: 'error', error: describeSearchError(error) };
  }
}

function scheduleSymbolSearch(query: string) {
  cancelPendingSearch();
  activeQuery.value = query;
  activeIndex.value = -1;
  // 舊查詢字串的結果不得留在畫面上冒充目前查詢的結果。
  symbolState.value = { status: 'loading' };
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void runSymbolSearch(query);
  }, SEARCH_DEBOUNCE_MS);
}

function retrySymbolSearch() {
  void runSymbolSearch(activeQuery.value);
}

function resetSymbolSearch() {
  cancelPendingSearch();
  searchController?.abort();
  searchController = null;
  searchSeq += 1;
  symbolState.value = { status: 'idle' };
  symQuery.value = '';
  symOpen.value = false;
  activeQuery.value = '';
  activeIndex.value = -1;
  pickedAsset.value = null;
}

function pickAsset(asset: AssetDto, { close = true }: { close?: boolean } = {}) {
  pickedAsset.value = asset;
  selectedSymbol.value = asset.symbol;
  selectedCurrency.value = asset.currency;
  symQuery.value = asset.symbol;
  if (close) {
    symOpen.value = false;
    activeIndex.value = -1;
    cancelPendingSearch();
  }
}

function clearPick() {
  pickedAsset.value = null;
  selectedSymbol.value = null;
  selectedCurrency.value = null;
}

function onSymFocus() {
  symOpen.value = true;
  // 收起下拉後又回到欄位時補一次查詢,讓 idle 列表重新出現。
  if (symbolState.value.status === 'idle') void runSymbolSearch(symQuery.value.trim());
}

/** 離開欄位:標記「碰過」(未選標的的錯誤此後可見);焦點移出整個標的區塊才收起下拉(重試鈕在區塊內)。 */
function onSymBlur(event: FocusEvent) {
  touched.symbol = true;
  const next = event.relatedTarget;
  if (next instanceof Node && symBlock.value?.contains(next)) return;
  symOpen.value = false;
  activeIndex.value = -1;
}

function onSymInput() {
  symOpen.value = true;
  const query = symQuery.value.trim();
  // 改了關鍵字 = 先前的選定作廢(否則畫面顯示 `AAP` 卻送出 `AAPL`)。
  if (!selectedSymbol.value || query.toUpperCase() !== selectedSymbol.value.toUpperCase()) clearPick();
  scheduleSymbolSearch(query);
}

/** combobox 必須可完全用鍵盤操作。 */
function onSymKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // 下拉開著時 Esc 只收起下拉,不連帶關閉對話框(document 層的 Esc 處理在冒泡階段)。
    if (!symPopoverOpen.value) return;
    event.stopPropagation();
    symOpen.value = false;
    activeIndex.value = -1;
    return;
  }
  const rows = visibleOptions.value;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    symOpen.value = true;
    if (!rows.length) return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = activeIndex.value < 0
      ? (delta > 0 ? 0 : rows.length - 1)
      : (activeIndex.value + delta + rows.length) % rows.length;
    return;
  }
  if (event.key === 'Enter') {
    const asset = symPopoverOpen.value ? rows[activeIndex.value] : undefined;
    if (!asset) return;
    event.preventDefault();
    pickAsset(asset);
  }
}

onBeforeUnmount(() => {
  cancelPendingSearch();
  searchController?.abort();
});

/**
 * 開啟焦點:Trades 開啟(typeahead)→ 標的輸入框;Positions 開啟 → 該模式唯一的 Display 元素。
 * 不落在送出鈕以免 Enter 誤送。
 */
function focusPrimaryField() {
  if (isTypeahead.value) {
    symInput.value?.focus();
    return;
  }
  const target = mode.value === 'cashDividend'
    ? amountInput.value
    : mode.value === 'stockDividend' ? sharesInput.value : ratioNewInput.value;
  target?.focus();
}

/** 開啟當下的焦點元素;關閉時把焦點還給它(開啟者)。 */
let returnFocusTarget: HTMLElement | null = null;

/**
 * 關閉時**同步**還焦點(pre-flush,早於開啟者自己排的 `nextTick`):
 * 開啟者若要改落點(例如成功後消失的 `沖銷這筆` → 表格卡),它的 `nextTick` 會在此之後執行而勝出。
 * 開啟者已不在 DOM 時不動,交給開啟者處理。
 */
function restoreFocus() {
  const target = returnFocusTarget;
  returnFocusTarget = null;
  if (target && target !== document.body && target.isConnected) target.focus();
}

watch(() => props.open, async (open) => {
  if (!open) {
    restoreFocus();
    return;
  }
  const active = document.activeElement;
  returnFocusTarget = active instanceof HTMLElement ? active : null;
  resetForm();
  await nextTick();
  focusPrimaryField();
}, { immediate: true });

/** 切換模式保留標的與備註,清空其餘欄位與錯誤;key 由下方 watch 標 dirty。 */
function selectMode(next: HoldingEventMode) {
  if (submitting.value || mode.value === next) return;
  mode.value = next;
  resetModeFields();
}

/** 未知幣別時文案的 `{code}` 以 `—` 代替,不猜測。 */
const currencyForCopy = computed(() => selectedCurrency.value ?? '—');

const amountHint = computed(() => (selectedSymbol.value
  ? tf(props.lang, 'holdingEventAmountHint', { code: currencyForCopy.value })
  : t(props.lang, 'holdingEventAmountHintNoSymbol')));

const modeNoteText = computed(() => {
  if (mode.value === 'stockDividend') return t(props.lang, 'holdingEventNoteStock');
  if (mode.value === 'split') return t(props.lang, 'holdingEventNoteSplit');
  return tf(props.lang, 'holdingEventNoteCash', { code: currencyForCopy.value });
});

/** 目前持股:只顯示開啟者給的值,不做任何加減(Phase 3 D-04)。 */
const currentQtyText = computed(() => {
  const quantity = props.holding?.totalQuantity;
  if (quantity === undefined || quantity === null) return '';
  return tf(props.lang, 'holdingEventCurrentQty', { qty: fmtQuantity(quantity) });
});

const dialogTitle = computed(() => (step.value === 'result' ? resultTitleText.value : t(props.lang, 'holdingEventTitle')));

const SUBMIT_LABEL_KEY: Record<HoldingEventMode, string> = {
  cashDividend: 'holdingEventRecordCashDividend',
  stockDividend: 'holdingEventRecordStockDividend',
  split: 'holdingEventRecordSplit',
};
const submitLabel = computed(() => t(props.lang, SUBMIT_LABEL_KEY[mode.value]));

/** result 標題只依後端 DTO 判斷;拆 / 合依回應的 `ratioNew > ratioOld`(D-02)。 */
const resultTitleText = computed(() => {
  const event = recorded.value;
  if (!event || event.kind === 'dividend') return t(props.lang, 'holdingEventCashDividendRecorded');
  if (event.dto.type === 'STOCK_DIVIDEND') return t(props.lang, 'holdingEventStockDividendRecorded');
  return (event.dto.ratioNew ?? 0) > (event.dto.ratioOld ?? 0)
    ? t(props.lang, 'holdingEventSplitRecorded')
    : t(props.lang, 'holdingEventReverseSplitRecorded');
});

const recordedTypeLabel = computed(() => {
  const event = recorded.value;
  if (!event || event.kind === 'dividend') return t(props.lang, 'holdingEventModeCashDividend');
  return event.dto.type === 'STOCK_DIVIDEND'
    ? t(props.lang, 'holdingEventModeStockDividend')
    : t(props.lang, 'holdingEventModeSplit');
});

/** 本機時區的 `YYYY-MM-DD HH:mm`(與入帳時間輸入框同一個時區語意)。 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : toLocalInputValue(time).replace('T', ' ');
}

/** 副標:數字一律取後端回傳值(股利帶號金額;股數調整 `{symbol} {帶號 quantityDelta}`)。 */
const resultSubText = computed(() => {
  const event = recorded.value;
  if (!event) return '';
  if (event.kind === 'dividend') {
    return fmtSignedMoney(event.dto.amount, event.dto.currency, minorUnits(event.dto.currency));
  }
  return `${event.dto.symbol} ${fmtSignedQuantity(event.dto.quantityDelta)}`;
});

// =================== 前端自檢(UI-SPEC §Interaction 1 欄位契約) ===================
// 後端 Bean Validation 才是權威;這裡只是在送出前把「必定被拒」的輸入擋下並說明原因。
// 上限與小數位數與靜態文案(holdingEventErrAmount / Tax / Shares / Ratio)一致,文案不從錯誤訊息解析。
const MONEY_MAX = 1_000_000_000_000;
const SHARES_MAX = 1_000_000_000;
const RATIO_MAX = 1000;
const MAX_DECIMALS = 8;
const DECIMAL_PATTERN = /^(\d+\.?\d*|\.\d+)$/;
const INTEGER_PATTERN = /^\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function decimalWithin(text: string, min: number, max: number, allowZero: boolean): boolean {
  if (!DECIMAL_PATTERN.test(text)) return false;
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  if (decimals > MAX_DECIMALS) return false;
  const value = Number(text);
  if (!Number.isFinite(value) || value > max) return false;
  return allowZero ? value >= min : value > min;
}

function ratioSideValid(text: string): boolean {
  if (!INTEGER_PATTERN.test(text)) return false;
  const value = Number(text);
  return value >= 1 && value <= RATIO_MAX;
}

const amountValid = computed(() => decimalWithin(amount.value.trim(), 0, MONEY_MAX, false));
/** 預扣稅選填:空 = 0。 */
const taxValid = computed(() => tax.value.trim() === '' || decimalWithin(tax.value.trim(), 0, MONEY_MAX, true));
const sharesValid = computed(() => decimalWithin(shares.value.trim(), 0, SHARES_MAX, false));
const ratioValid = computed(() => {
  const n = ratioNew.value.trim();
  const o = ratioOld.value.trim();
  return ratioSideValid(n) && ratioSideValid(o) && Number(n) !== Number(o);
});

/** 不快取:送出當下要用「現在」重新判斷,避免對話框開很久後的舊 `max`。 */
function isPaidAtValid(): boolean {
  if (!paidAt.value) return false;
  const time = new Date(paidAt.value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
const paidAtValid = computed(() => isPaidAtValid());

/** 只擋「晚於今天」;時序規則(早於最近一筆調整)由後端判斷,同一天多筆依記錄順序疊加,不擋。 */
function isEffectiveDateValid(): boolean {
  return DATE_PATTERN.test(effectiveDate.value) && effectiveDate.value <= todayLocalDate();
}
const effectiveDateValid = computed(() => isEffectiveDateValid());

/** 送出前自檢(送出當下重算時間類規則)。 */
function isFormValid(): boolean {
  if (!selectedSymbol.value) return false;
  if (mode.value === 'cashDividend') return amountValid.value && taxValid.value && isPaidAtValid();
  if (mode.value === 'stockDividend') return sharesValid.value && isEffectiveDateValid();
  return ratioValid.value && isEffectiveDateValid();
}

const canSubmit = computed(() => {
  if (!selectedSymbol.value) return false;
  if (mode.value === 'cashDividend') return amountValid.value && taxValid.value && paidAtValid.value;
  if (mode.value === 'stockDividend') return sharesValid.value && effectiveDateValid.value;
  return ratioValid.value && effectiveDateValid.value;
});

/** 比例讀法:兩邊皆合法且不相等時重述輸入(不換算股數)。 */
const ratioReadText = computed(() => {
  if (!ratioValid.value) return '';
  const n = Number(ratioNew.value.trim());
  const o = Number(ratioOld.value.trim());
  return tf(props.lang, n > o ? 'holdingEventRatioReadSplit' : 'holdingEventRatioReadReverse', { old: o, new: n });
});

// =================== 欄位級錯誤(後端 fields + 前端自檢共用同一組節點) ===================
/**
 * 前端欄位 → 自己的 i18n 文案。
 * 後端 `fields` **只用 key 判斷「哪個欄位錯了」** —— value 是 Bean Validation 的英文預設訊息,絕不入 DOM。
 */
const FIELD_ERROR_COPY: Record<string, string> = {
  symbol: 'holdingEventErrSymbol',
  type: 'holdingEventErrType',
  amount: 'holdingEventErrAmount',
  withholdingTax: 'holdingEventErrTax',
  paidAt: 'holdingEventErrPaidAt',
  quantity: 'holdingEventErrShares',
  ratio: 'holdingEventErrRatio',
  effectiveDate: 'holdingEventErrEffectiveDate',
  note: 'tradeErrNote',
};

/** 後端 `fields` 的 key 若與前端欄位名不同,在此對應(比例兩邊共用一個錯誤節點)。 */
const SERVER_FIELD_ALIAS: Record<string, string> = { ratioNew: 'ratio', ratioOld: 'ratio' };

/** 每個模式畫面上真的有錯誤節點的欄位。 */
const MODE_FIELDS: Record<HoldingEventMode, string[]> = {
  cashDividend: ['symbol', 'type', 'amount', 'withholdingTax', 'paidAt', 'note'],
  stockDividend: ['symbol', 'type', 'quantity', 'effectiveDate', 'note'],
  split: ['symbol', 'type', 'ratio', 'effectiveDate', 'note'],
};

const serverFields = computed(() => Object.keys(submitError.value?.fields ?? {})
  .map(key => SERVER_FIELD_ALIAS[key] ?? key));

/**
 * `fields` 至少有一個 key 對得到本模式的錯誤節點,才算「欄位級」呈現;
 * 一個都對不到(例如 `Idempotency-Key`)時退回底部的一般驗證錯誤 —— 否則按了送出卻什麼都看不到。
 */
const hasFieldLevelErrors = computed(() => serverFields.value.some(field => MODE_FIELDS[mode.value].includes(field)));

function fieldErrorId(field: string): string {
  return `holding-event-${field}-error`;
}

/** 本模式除標的外的欄位是否都合法(送出鈕 disabled 的唯一原因若是「未選標的」,該原因必須可見)。 */
const modeFieldsValid = computed(() => {
  if (mode.value === 'cashDividend') return amountValid.value && taxValid.value && paidAtValid.value;
  if (mode.value === 'stockDividend') return sharesValid.value && effectiveDateValid.value;
  return ratioValid.value && effectiveDateValid.value;
});

function localFieldInvalid(field: string): boolean {
  switch (field) {
    case 'symbol': return !selectedSymbol.value && (touched.symbol || modeFieldsValid.value);
    case 'amount': return !amountValid.value && (touched.amount || amount.value !== '');
    case 'withholdingTax': return !taxValid.value;
    case 'paidAt': return !paidAtValid.value && (touched.paidAt || paidAt.value !== '');
    case 'quantity': return !sharesValid.value && (touched.shares || shares.value !== '');
    // 只填了一邊時不提早罵人:兩邊都有輸入(或離開過欄位)才判斷。
    case 'ratio': return !ratioValid.value && (touched.ratio || (ratioNew.value !== '' && ratioOld.value !== ''));
    case 'effectiveDate': return !effectiveDateValid.value && (touched.effectiveDate || effectiveDate.value !== '');
    default: return false;
  }
}

function fieldErrorText(field: string): string {
  const key = FIELD_ERROR_COPY[field];
  if (!key) return '';
  if (serverFields.value.includes(field) || localFieldInvalid(field)) return t(props.lang, key);
  return '';
}

/** 多個 id 以空白分隔;沒有任何關聯節點時回 undefined(不渲染空屬性)。 */
function describedBy(field: string, ...hintIds: string[]): string | undefined {
  const ids = hintIds.filter(Boolean);
  if (fieldErrorText(field)) ids.push(fieldErrorId(field));
  return ids.length ? ids.join(' ') : undefined;
}

function invalidAttr(field: string): 'true' | undefined {
  return fieldErrorText(field) ? 'true' : undefined;
}

/**
 * 任何欄位(含模式、標的)變動都會讓下一次送出換新 key,並清掉上一次的送出錯誤。
 * `flush: 'sync'` 是刻意的:使用者改完欄位可能**立刻**按送出,預設的 pre-flush 會讓那一次仍沿用舊 key。
 */
watch(
  () => [
    mode.value, selectedSymbol.value, amount.value, tax.value, paidAt.value,
    shares.value, ratioNew.value, ratioOld.value, effectiveDate.value, note.value,
  ],
  () => {
    dirtySinceSubmit.value = true;
    submitError.value = null;
  },
  { flush: 'sync' },
);

/**
 * key 在「按下送出」時產生,且必須是 CSPRNG(`crypto.randomUUID()`)。
 * 規則:沒有 key、或自上次送出後動過任何欄位 → 換新的;否則沿用。
 */
function ensureIdempotencyKey(): string {
  if (currentKey.value === null || dirtySinceSubmit.value) {
    currentKey.value = crypto.randomUUID();
  }
  dirtySinceSubmit.value = false;
  return currentKey.value;
}

/** 依模式送出;回傳後端 DTO 與重讀訊號的 cause。 */
async function createEvent(symbol: string, idempotencyKey: string): Promise<RecordedEvent> {
  const clients = getRuntimeApiClients();
  const noteValue = note.value ? note.value : null;
  if (mode.value === 'cashDividend') {
    const dto = await clients.holdingEvents.createDividend({
      symbol,
      amount: Number(amount.value.trim()),
      withholdingTax: tax.value.trim() === '' ? null : Number(tax.value.trim()),
      // 後端是 OffsetDateTime,必須帶 offset(datetime-local 是本地時區的裸字串)。
      paidAt: toLocalIso(new Date(paidAt.value)),
      note: noteValue,
      reversalOfId: null,
    }, idempotencyKey);
    return { kind: 'dividend', dto };
  }
  const isStock = mode.value === 'stockDividend';
  const dto = await clients.holdingEvents.createShareAdjustment({
    symbol,
    type: isStock ? 'STOCK_DIVIDEND' : 'SPLIT',
    quantity: isStock ? Number(shares.value.trim()) : null,
    ratioNew: isStock ? null : Number(ratioNew.value.trim()),
    ratioOld: isStock ? null : Number(ratioOld.value.trim()),
    // 原字串送出,不轉時區(它是標的市場的交易日)。
    effectiveDate: effectiveDate.value,
    note: noteValue,
    reversalOfId: null,
  }, idempotencyKey);
  return { kind: 'shareAdjustment', dto };
}

/** 讓所有自檢錯誤可見(程式化觸發送出時不得靜默)。 */
function touchAll() {
  touched.symbol = true;
  touched.amount = true;
  touched.paidAt = true;
  touched.shares = true;
  touched.ratio = true;
  touched.effectiveDate = true;
}

async function submitEvent() {
  if (submitting.value) return;
  submitError.value = null;
  const symbol = selectedSymbol.value;
  if (!symbol || !isFormValid()) {
    // 正常路徑到不了這裡(送出鈕已 disabled)。
    touchAll();
    return;
  }
  submitting.value = true;
  const idempotencyKey = ensureIdempotencyKey();
  try {
    const event = await createEvent(symbol, idempotencyKey);
    recorded.value = event;
    // 冪等命中(同一把 key 拿回既有紀錄)與首次建立走完全同一條路徑;重讀同一份資料無害。
    notifyHoldingEventCreated(event.dto, event.kind === 'dividend' ? 'dividend' : 'shareAdjustment');
    // 下一筆是新意圖,key 不得沿用。
    currentKey.value = null;
    dirtySinceSubmit.value = false;
    step.value = 'result';
    await nextTick();
    resultTitle.value?.focus();
    // 不發 toast:result 步驟本身就是確認。
    emit('recorded', event.dto);
  } catch (error) {
    handleSubmitFailure(error);
  } finally {
    submitting.value = false;
  }
}

/**
 * 底部錯誤依 `error.code` 分派(不假設錯誤順序);每個 code 對應 UI-SPEC §錯誤狀態的一條文案。
 * 沖銷模式的對應(`TRADE_INSUFFICIENT_HOLDING` → `holdingEventErrReversalNoHolding`、三種沖銷衝突)由 04.2-19 接上。
 */
const SUBMIT_ERROR_COPY: Record<string, string> = {
  VALIDATION_FAILED: 'holdingEventErrValidation',
  DIVIDEND_IDEMPOTENCY_KEY_REUSED: 'holdingEventErrKeyReused',
  SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED: 'holdingEventErrKeyReused',
  // form 模式(配股 / 拆股):除權日或目前沒有持倉(D-06 / D-09)。
  TRADE_INSUFFICIENT_HOLDING: 'holdingEventErrNoHolding',
  ASSET_NOT_FOUND: 'holdingEventErrAsset',
  AUTH_FORBIDDEN: 'holdingEventErrForbidden',
  AUTH_CSRF_TOKEN_INVALID: 'cashErrCsrf',
  // 前端合成(`apiClient` 的 `ensureCsrfToken`:bootstrap 後仍拿不到 cookie),後端不會送。
  AUTH_CSRF_TOKEN_MISSING: 'cashErrCsrf',
  // 前端合成的診斷碼:非 ApiClientError(連線失敗);唯一能保證「再送一次不會重複」的情境。
  NETWORK_ERROR: 'cashErrNetwork',
};

/** 換新 key 才能脫困的 code:同一把 key 照文案重送只會再吃一次 409,形成無出路的迴圈。 */
const KEY_REUSED_CODES = ['DIVIDEND_IDEMPOTENCY_KEY_REUSED', 'SHARE_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED'];

/** 其他(含 5xx)= 結果不確定:`holdingEventErrUnknown` 說「可能已經寫入」並指向 Trades 頁籤,不斷言未寫入。 */
const submitErrorMessage = computed(() => {
  const error = submitError.value;
  if (!error) return '';
  const key = SUBMIT_ERROR_COPY[error.code] ?? (error.status === 403 ? 'holdingEventErrForbidden' : 'holdingEventErrUnknown');
  return t(props.lang, key);
});

/**
 * 送出失敗的統一落點。
 *
 * **key 的處置:預設一律保留** —— 「這次沒寫入(或結果未知),但意圖沒變」,沿用同一把重送是安全且正確的。
 * 網路失敗、5xx、`VALIDATION_FAILED`、`TRADE_INSUFFICIENT_HOLDING`、CSRF / 403、401 都走這條。
 * **例外是 `*_IDEMPOTENCY_KEY_REUSED`:必須丟棄 key。**
 *
 * `fields` 只在 `VALIDATION_FAILED` 時做欄位級呈現:`ASSET_NOT_FOUND` 也帶 `fields.symbol`,
 * 但它的文案(請重新選擇標的)屬於底部區,不是「欄位格式錯」。
 */
function handleSubmitFailure(error: unknown) {
  const described: SubmitError = error instanceof ApiClientError
    ? {
        code: error.code,
        traceId: error.requestId,
        fields: error.code === 'VALIDATION_FAILED' ? error.fields : null,
        status: error.status,
      }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };

  // 401 / refresh 失敗**不在對話框顯示**,走全域 SessionBanner(`apiClient` 已負責升級)。
  // key 保留:登入回來後重送的是同一個意圖。
  if (described.status === 401) return;

  submitError.value = described;
  if (KEY_REUSED_CODES.includes(described.code)) currentKey.value = null;
}

async function recordAnother() {
  resetForm();
  await nextTick();
  focusPrimaryField();
}

function onMaskClick() {
  if (submitting.value) return;
  onClose();
}

function onClose() {
  if (submitting.value) return;
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return;
  onClose();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.42); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 200;
  animation: fade .18s ease-out;
}
/* 面板 480px;header / footer 固定,只有 body 內捲(長備註不撐破面板) */
.dialog {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  width: 480px; max-width: 92vw; max-height: calc(100vh - 48px);
  box-shadow: 0 24px 64px rgba(0,0,0,0.18);
  animation: rise .22s cubic-bezier(.2,.7,.2,1);
  display: flex; flex-direction: column; overflow: hidden;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

.hd {
  display: flex; justify-content: space-between; align-items: center; flex: none;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
}
.hd-ttl { font-size: 16px; font-weight: 600; line-height: 1.35; }
.x {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px;
  background: transparent; border: 0; color: var(--fg-dim); font-size: 16px; font-weight: 400;
  cursor: pointer; border-radius: 8px;
}
.x:hover { background: var(--surface2); color: var(--fg); }
.x:focus-visible, .type-btn:focus-visible,
.btn-accent:focus-visible, .btn-ghost:focus-visible, .inp:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

.body { padding: 24px; flex: 1 1 auto; min-height: 0; overflow-y: auto; }

.lab {
  display: block; font-size: 12px; font-weight: 600; line-height: 1.35;
  color: var(--fg-dim); letter-spacing: 0; margin: 16px 0 8px;
}
.lab:first-child { margin-top: 0; }
.hint { font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); margin: 4px 0 0; }
.note-first { margin-top: 16px; }

/* 鎖定標的:代號 13/600 + 名稱 12/400 + 幣別 pill */
.sym-locked { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.sym-code { font-size: 13px; font-weight: 600; }
.sym-name { font-size: 12px; font-weight: 400; color: var(--fg-dim); overflow-wrap: anywhere; }
.ccy-tag {
  display: inline-block; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  border-radius: 99px; background: var(--surface2); color: var(--fg-dim);
}

/*
  標的 typeahead:樣式沿用 OrderTicket 的 `.sym-*` / `.block-*`;listbox 在文件流內(U-04),
  不是絕對定位 —— 對話框 body 會捲動,絕對定位的下拉會被裁切。
*/
.sym-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 8px; }
.sym-pop {
  margin-top: 8px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
}
.sym-list { max-height: 240px; overflow-y: auto; }
.sym-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
  padding: 8px 12px; min-height: 44px; cursor: pointer; font-size: 13px; font-weight: 400;
}
.sym-row:hover, .sym-row.active { background: var(--surface2); }
.sym-truncated {
  padding: 8px 12px; border-top: 1px solid var(--border);
  color: var(--fg-mute); font-size: 12px; font-weight: 400; line-height: 1.35;
}
.block-state { padding: 12px 16px; font-size: 12px; font-weight: 400; color: var(--fg-dim); }
.block-error { padding: 12px 16px; font-size: 12px; font-weight: 400; color: var(--dn); }
.block-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 8px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span { overflow-wrap: anywhere; user-select: text; }
.block-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.block-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* 骨架列固定 3 條,載入呈現不隨資料量變動 */
.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px; min-height: 36px; font-size: 13px; font-weight: 400; line-height: 1.45;
  color: var(--fg); outline: none; font-family: inherit; transition: border .15s;
}
.inp:focus { border-color: var(--accent); }
/* form 的唯一 Display 級元素(金額) */
.inp.big { font-size: 20px; font-weight: 600; line-height: 1.25; padding: 12px 16px; min-height: 44px; }
.inp:disabled { opacity: .5; cursor: not-allowed; }
textarea.inp { resize: vertical; }
.amount-row { display: flex; align-items: center; gap: 8px; }
.amount-row .inp { flex: 1 1 auto; min-width: 0; }
/* 比例輸入組:兩個 96px Display 輸入 + 中間 `:`(視為一個焦點元素) */
.ratio-group { display: flex; align-items: center; gap: 12px; }
.ratio-group .inp.big { width: 96px; text-align: center; }
.ratio-sep { font-size: 13px; font-weight: 600; color: var(--fg-dim); }

/* 欄位級錯誤:輸入框下方 12px --dn 文字 */
.field-error {
  margin: 8px 0 0; font-size: 12px; font-weight: 600; line-height: 1.35;
  color: var(--dn); overflow-wrap: anywhere;
}
.submitting-note { margin: 8px 0 0; font-size: 12px; font-weight: 600; color: var(--fg-dim); }

/* 模式:選中態為中性(損益顏色語意不屬於股利與股數調整) */
.type-toggle { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.type-btn {
  padding: 8px 12px; min-height: 36px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px; white-space: normal;
  font-size: 12px; font-weight: 600; line-height: 1.35; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.type-btn.active { background: var(--surface); color: var(--fg); border: 1px solid var(--fg); }
.type-btn:disabled { opacity: .5; cursor: not-allowed; }

.form-error {
  margin-top: 12px; padding: 8px 12px; border-radius: 8px;
  background: rgba(220,38,38,0.10); color: var(--dn);
  font-size: 12px; font-weight: 600;
}
/* 底部錯誤區:body 內、footer 之上,全寬 */
.submit-error { margin: 0 24px 16px; flex: none; }
.submit-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 8px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px; font-weight: 400;
}
/* 320px 下 code 與 traceId 必須換行完整顯示,且可被選取複製 */
.submit-error .details span { overflow-wrap: anywhere; user-select: text; }

.rev-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  border: 1px solid var(--border); border-radius: 10px; overflow: hidden; text-align: left;
}
.rev-grid > div {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 12px 16px; font-size: 13px; font-weight: 400; background: var(--surface);
}
.rev-grid > div span { color: var(--fg-dim); }
.rev-grid > div b { font-weight: 600; }
.rev-grid > div b .ccy-tag { margin-left: 4px; }
.rev-grid > div.span-2 { grid-column: span 2; }
.rev-grid > div + div { border-top: 1px solid var(--border); }

.result { padding: 48px 32px; text-align: center; }
.check {
  width: 48px; height: 48px; border-radius: 50%; background: var(--up); color: #fff;
  font-size: 20px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  animation: pop .45s cubic-bezier(.2,1.4,.4,1);
}
@keyframes pop { 0% { transform: scale(0) } 100% { transform: scale(1) } }
.result-ttl { font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: 0; margin: 0; }
.result-ttl:focus { outline: none; }
.result-sub { color: var(--fg-dim); font-size: 13px; font-weight: 400; margin-top: 8px; }
.result .rev-grid { margin-top: 16px; }
/* 紀錄編號 / 時間戳是除錯回報用途:一律完整顯示,不截斷 */
.entry-id { font-weight: 600; overflow-wrap: anywhere; text-align: right; }

.ft {
  display: flex; justify-content: space-between; gap: 12px; flex: none;
  padding: 16px 24px; border-top: 1px solid var(--border); background: var(--surface2);
}
.btn-accent {
  background: var(--accent); color: #fff; border: 0; padding: 8px 24px; min-height: 44px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
  white-space: nowrap;
}
/*
  標籤切換(`記錄現金股利` ↔ `記錄中…`)不得讓按鈕縮放而造成版位跳動,
  所以由三模式中最寬的標籤(en `Record stock dividend`,13px/600 約 150px + 48px 水平內距)決定下限。
*/
.btn-submit { min-width: 208px; }
.btn-done { margin-left: auto; }
.btn-accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.btn-accent:disabled { opacity: .4; cursor: not-allowed; }
.btn-ghost {
  background: transparent; border: 1px solid var(--border); color: var(--fg);
  padding: 8px 16px; min-height: 36px; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.btn-ghost:hover:not(:disabled) { background: var(--surface); }
.btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

/*
  < 400px:面板 92vw 約 294px,en `Record stock dividend` 放不下並排的兩顆按鈕(U-05)——
  footer 改直排:主要鈕在上、滿寬;取消在下、滿寬。DOM 順序不變(取消在前),以 column-reverse 讓主要鈕在上。
*/
@media (max-width: 399px) {
  .ft { flex-direction: column-reverse; gap: 8px; padding-left: 16px; padding-right: 16px; }
  .ft .btn-accent, .ft .btn-ghost { width: 100%; min-width: 0; }
  .btn-accent { padding-left: 16px; padding-right: 16px; }
  .btn-done { margin-left: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .mask, .dialog, .check, .skeleton-row { animation: none; }
}
</style>
