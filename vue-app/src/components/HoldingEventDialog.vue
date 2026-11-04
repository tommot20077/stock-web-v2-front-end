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
          <!-- 從持倉開啟:標的鎖定顯示,不可改(D-11) -->
          <div
            v-if="selectedSymbol"
            class="sym-locked"
            role="group"
            aria-labelledby="holding-event-symbol-label"
            data-testid="holding-event-symbol-locked"
          >
            <span class="sym-code">{{ selectedSymbol }}</span>
            <span v-if="holding?.name" class="sym-name">{{ holding.name }}</span>
            <span v-if="selectedCurrency" class="ccy-tag">{{ selectedCurrency }}</span>
          </div>
          <p v-else class="hint">{{ t(lang, 'holdingEventAmountHintNoSymbol') }}</p>
          <p
            v-if="fieldErrorText('symbol')"
            :id="fieldErrorId('symbol')"
            class="field-error"
            data-testid="holding-event-field-error-symbol"
          >{{ fieldErrorText('symbol') }}</p>

          <div id="holding-event-type-label" class="lab">{{ t(lang, 'type') }}</div>
          <div class="type-toggle" role="group" aria-labelledby="holding-event-type-label">
            <button
              type="button"
              class="type-btn active"
              data-testid="holding-event-mode-cash-dividend"
              aria-pressed="true"
              :disabled="submitting"
            >{{ t(lang, 'holdingEventModeCashDividend') }}</button>
          </div>

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
          <p class="hint note-first">{{ tf(lang, 'holdingEventNoteCash', { code: currencyForCopy }) }}</p>
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
import { fmtMoney, fmtSignedMoney, minorUnits } from '../moneyFormat';
import type { PortfolioActivityDto } from '../services/apiTypes';
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

type Step = 'form' | 'result';
const step = ref<Step>('form');

const selectedSymbol = ref<string | null>(null);
const selectedCurrency = ref<string | null>(null);
const amount = ref('');
const tax = ref('');
const paidAt = ref('');
const maxPaidAt = ref('');
const note = ref('');

/** 欄位被使用者離開過才算「碰過」:空欄位在 blur 前不提早罵人。 */
const touched = reactive({ amount: false, paidAt: false });

const submitting = ref(false);
type RecordedEvent = { kind: 'dividend'; dto: DividendDto } | { kind: 'shareAdjustment'; dto: ShareAdjustmentDto };
const recorded = ref<RecordedEvent | null>(null);

const amountInput = ref<HTMLInputElement | null>(null);
const resultTitle = ref<HTMLElement | null>(null);

// =================== Idempotency-Key 的生命週期(D-13 = 04.1 D-11) ===================
// 規則 1:key 在「按下送出」那一刻產生,同一次嘗試的重試沿用同一把。
// 規則 2:使用者自上次送出後動過任何欄位 → 下次送出換新 key(改過欄位 = 新意圖)。
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

function resetForm() {
  step.value = 'form';
  selectedSymbol.value = props.symbol;
  selectedCurrency.value = props.holding?.currency ?? null;
  amount.value = '';
  tax.value = '';
  note.value = '';
  const now = new Date();
  paidAt.value = toLocalInputValue(now);
  maxPaidAt.value = toLocalInputValue(now);
  recorded.value = null;
  touched.amount = false;
  touched.paidAt = false;
  submitError.value = null;
  currentKey.value = null;
  dirtySinceSubmit.value = false;
}

watch(() => props.open, async (open) => {
  if (!open) return;
  resetForm();
  await nextTick();
  // 焦點落在唯一 Display 元素(金額),不落在送出鈕以免 Enter 誤送。
  amountInput.value?.focus();
}, { immediate: true });

/** 未知幣別時文案的 `{code}` 以 `—` 代替,不猜測。 */
const currencyForCopy = computed(() => selectedCurrency.value ?? '—');

const amountHint = computed(() => (selectedSymbol.value
  ? tf(props.lang, 'holdingEventAmountHint', { code: currencyForCopy.value })
  : t(props.lang, 'holdingEventAmountHintNoSymbol')));

const dialogTitle = computed(() => (step.value === 'result' ? resultTitleText.value : t(props.lang, 'holdingEventTitle')));

const submitLabel = computed(() => t(props.lang, 'holdingEventRecordCashDividend'));

const resultTitleText = computed(() => t(props.lang, 'holdingEventCashDividendRecorded'));

const recordedTypeLabel = computed(() => t(props.lang, 'holdingEventModeCashDividend'));

/** 本機時區的 `YYYY-MM-DD HH:mm`(與入帳時間輸入框同一個時區語意)。 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : toLocalInputValue(time).replace('T', ' ');
}

/** 副標:數字一律取後端回傳值。 */
const resultSubText = computed(() => {
  const event = recorded.value;
  if (!event || event.kind !== 'dividend') return '';
  return fmtSignedMoney(event.dto.amount, event.dto.currency, minorUnits(event.dto.currency));
});

// =================== 前端自檢(UI-SPEC §Interaction 1 欄位契約) ===================
// 後端 Bean Validation 才是權威;這裡只是在送出前把「必定被拒」的輸入擋下並說明原因。
// 上限與小數位數與靜態文案(holdingEventErrAmount / holdingEventErrTax)一致,文案不從錯誤訊息解析。
const MONEY_MAX = 1_000_000_000_000;
const MAX_DECIMALS = 8;
const DECIMAL_PATTERN = /^(\d+\.?\d*|\.\d+)$/;

function decimalWithin(text: string, min: number, max: number, allowZero: boolean): boolean {
  if (!DECIMAL_PATTERN.test(text)) return false;
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  if (decimals > MAX_DECIMALS) return false;
  const value = Number(text);
  if (!Number.isFinite(value) || value > max) return false;
  return allowZero ? value >= min : value > min;
}

const amountValid = computed(() => decimalWithin(amount.value.trim(), 0, MONEY_MAX, false));
/** 預扣稅選填:空 = 0。 */
const taxValid = computed(() => tax.value.trim() === '' || decimalWithin(tax.value.trim(), 0, MONEY_MAX, true));

/** 不快取:送出當下要用「現在」重新判斷,避免對話框開很久後的舊 `max`。 */
function isPaidAtValid(): boolean {
  if (!paidAt.value) return false;
  const time = new Date(paidAt.value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
const paidAtValid = computed(() => isPaidAtValid());

const canSubmit = computed(() => Boolean(selectedSymbol.value) && amountValid.value && taxValid.value && paidAtValid.value);

// =================== 欄位級錯誤(後端 fields + 前端自檢共用同一組節點) ===================
/**
 * `fields` 的 key → 前端自己的 i18n 文案。
 * **只用 key 判斷「哪個欄位錯了」** —— value 是 Bean Validation 的英文預設訊息,絕不入 DOM。
 */
const FIELD_ERROR_COPY: Record<string, string> = {
  symbol: 'holdingEventErrSymbol',
  amount: 'holdingEventErrAmount',
  withholdingTax: 'holdingEventErrTax',
  paidAt: 'holdingEventErrPaidAt',
  note: 'tradeErrNote',
};

const serverFieldKeys = computed(() => Object.keys(submitError.value?.fields ?? {}));

const hasFieldLevelErrors = computed(() => serverFieldKeys.value.some(field => field in FIELD_ERROR_COPY));

function fieldErrorId(field: string): string {
  return `holding-event-${field}-error`;
}

function localFieldInvalid(field: string): boolean {
  if (field === 'amount') return !amountValid.value && (touched.amount || amount.value !== '');
  if (field === 'withholdingTax') return !taxValid.value;
  if (field === 'paidAt') return !paidAtValid.value && (touched.paidAt || paidAt.value !== '');
  return false;
}

function fieldErrorText(field: string): string {
  const key = FIELD_ERROR_COPY[field];
  if (!key) return '';
  if (serverFieldKeys.value.includes(field) || localFieldInvalid(field)) return t(props.lang, key);
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
 * 任何欄位變動都會讓下一次送出換新 key,並清掉上一次的送出錯誤。
 * `flush: 'sync'` 是刻意的:使用者改完欄位可能**立刻**按送出,預設的 pre-flush 會讓那一次仍沿用舊 key。
 */
watch(
  () => [selectedSymbol.value, amount.value, tax.value, paidAt.value, note.value],
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

async function submitEvent() {
  if (submitting.value) return;
  submitError.value = null;
  if (!canSubmit.value || !isPaidAtValid() || !selectedSymbol.value) {
    // 正常路徑到不了這裡(送出鈕已 disabled);程式化觸發時讓欄位錯誤可見,不得靜默。
    touched.amount = true;
    touched.paidAt = true;
    return;
  }
  submitting.value = true;
  const idempotencyKey = ensureIdempotencyKey();
  try {
    const dto = await getRuntimeApiClients().holdingEvents.createDividend({
      symbol: selectedSymbol.value,
      amount: Number(amount.value.trim()),
      withholdingTax: tax.value.trim() === '' ? null : Number(tax.value.trim()),
      // 後端是 OffsetDateTime,必須帶 offset(datetime-local 是本地時區的裸字串)。
      paidAt: toLocalIso(new Date(paidAt.value)),
      note: note.value ? note.value : null,
      reversalOfId: null,
    }, idempotencyKey);
    recorded.value = { kind: 'dividend', dto };
    // 冪等命中(同一把 key 拿回既有紀錄)與首次建立走完全同一條路徑;重讀同一份資料無害。
    notifyHoldingEventCreated(dto, 'dividend');
    // 下一筆是新意圖,key 不得沿用。
    currentKey.value = null;
    dirtySinceSubmit.value = false;
    step.value = 'result';
    await nextTick();
    resultTitle.value?.focus();
    // 不發 toast:result 步驟本身就是確認。
    emit('recorded', dto);
  } catch (error) {
    handleSubmitFailure(error);
  } finally {
    submitting.value = false;
  }
}

const submitErrorMessage = computed(() => (submitError.value ? t(props.lang, 'holdingEventErrUnknown') : ''));

/** 送出失敗的統一落點;key 預設保留(這次沒寫入或結果未知,但意圖沒變)。 */
function handleSubmitFailure(error: unknown) {
  const described: SubmitError = error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };
  // 401 / refresh 失敗**不在對話框顯示**,走全域 SessionBanner(`apiClient` 已負責升級)。
  if (described.status === 401) return;
  submitError.value = described;
}

async function recordAnother() {
  resetForm();
  await nextTick();
  amountInput.value?.focus();
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

@media (prefers-reduced-motion: reduce) {
  .mask, .dialog, .check { animation: none; }
}
</style>
