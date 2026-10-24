<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click="onMaskClick">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-dialog-title"
        :aria-busy="submitting ? 'true' : 'false'"
        data-testid="cash-dialog"
        @click.stop
      >
        <div class="hd">
          <!-- 兩步(form → result)沒有進度可言,所以不放 step dots(UI-SPEC §3) -->
          <div id="cash-dialog-title" class="hd-ttl">{{ dialogTitle }}</div>
          <button
            type="button"
            class="x"
            data-testid="cash-dialog-close"
            :aria-label="t(lang, 'closeCashDialog')"
            @click="onClose"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <!-- FORM -->
        <div v-if="step === 'form'" class="body">
          <!-- 沖銷模式:類型 / 幣別 / 金額由原紀錄帶入且不可編輯,發生時間不顯示(送出時為現在,U-04) -->
          <template v-if="reversalOf">
            <div class="quote-card" data-testid="cash-reversal-original">
              <div class="quote-lab">{{ t(lang, 'cashReversalOriginal') }}</div>
              <div class="sum-row">
                <span>{{ t(lang, 'cashOccurredAt') }}</span>
                <b class="num">{{ formatDateTime(reversalOf.occurredAt) }}</b>
              </div>
              <div class="sum-row">
                <span>{{ t(lang, 'type') }}</span>
                <b>{{ typeLabel(reversalOf.type) }}</b>
              </div>
              <div class="sum-row">
                <span>{{ t(lang, 'cashAmount') }}</span>
                <b class="num">{{ fmtMoney(reversalOf.amount, reversalOf.currency, minorUnits(reversalOf.currency)) }}</b>
              </div>
              <div v-if="reversalOf.note" class="sum-row">
                <span>{{ t(lang, 'notes') }}</span>
                <b class="wrap-any">{{ reversalOf.note }}</b>
              </div>
            </div>
            <!-- 沖銷模式唯一的 Display 級元素:方向相反的預覽 -->
            <div class="reversal-preview" data-testid="cash-reversal-preview">
              <span class="rp-lab">{{ t(lang, 'cashReversalWillRecord') }}</span>
              {{ typeLabel(type) }} {{ fmtMoney(reversalOf.amount, reversalOf.currency, minorUnits(reversalOf.currency)) }}
            </div>
          </template>

          <template v-else>
          <div id="cash-type-label" class="lab">{{ t(lang, 'type') }}</div>
          <div
            class="type-toggle"
            role="group"
            aria-labelledby="cash-type-label"
            :aria-describedby="describedBy('type')"
          >
            <button
              type="button"
              :class="['type-btn', { active: type === 'DEPOSIT' }]"
              data-testid="cash-type-deposit"
              :aria-pressed="type === 'DEPOSIT' ? 'true' : 'false'"
              :disabled="submitting"
              @click="type = 'DEPOSIT'"
            >{{ t(lang, 'cashTypeDeposit') }}</button>
            <button
              type="button"
              :class="['type-btn', { active: type === 'WITHDRAWAL' }]"
              data-testid="cash-type-withdrawal"
              :aria-pressed="type === 'WITHDRAWAL' ? 'true' : 'false'"
              :disabled="submitting"
              @click="type = 'WITHDRAWAL'"
            >{{ t(lang, 'cashTypeWithdrawal') }}</button>
          </div>
          <!-- 欄位級錯誤節點不加 role="alert":多個欄位同時出錯會連續朗讀,語意由 aria-describedby 承擔 -->
          <p
            v-if="fieldErrorText('type')"
            :id="fieldErrorId('type')"
            class="field-error"
            data-testid="cash-field-error-type"
          >{{ fieldErrorText('type') }}</p>

          <div id="cash-currency-label" class="lab">{{ t(lang, 'cashCurrency') }}</div>
          <div
            class="ccy-seg"
            role="group"
            aria-labelledby="cash-currency-label"
            :aria-describedby="describedBy('currency')"
          >
            <button
              v-for="code in BASE_CURRENCY_OPTIONS"
              :key="code"
              type="button"
              :class="['ccy-btn', { active: currency === code }]"
              :data-testid="`cash-currency-${code}`"
              :aria-pressed="currency === code ? 'true' : 'false'"
              :disabled="submitting"
              @click="currency = code"
            >{{ code }}</button>
          </div>
          <p
            v-if="fieldErrorText('currency')"
            :id="fieldErrorId('currency')"
            class="field-error"
            data-testid="cash-field-error-currency"
          >{{ fieldErrorText('currency') }}</p>

          <label class="lab" for="cash-amount">{{ t(lang, 'cashAmount') }}</label>
          <input
            id="cash-amount"
            ref="amountInput"
            v-model="amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            class="inp big"
            data-testid="cash-amount"
            :aria-invalid="invalidAttr('amount')"
            :aria-describedby="describedBy('amount', 'cash-amount-hint', overBalance ? 'cash-over-balance-hint' : '')"
            :disabled="submitting"
            @blur="touched.amount = true"
          />
          <p id="cash-amount-hint" class="hint">{{ t(lang, 'cashAmountHint') }}</p>
          <!-- 出金大於該幣別目前餘額:資訊,不是錯誤,不阻擋(D-01 / U-16);前端只比較大小,不做會計 -->
          <p
            v-if="overBalance"
            id="cash-over-balance-hint"
            class="hint"
            data-testid="cash-withdraw-over-balance"
          >{{ tf(lang, 'cashWithdrawOverBalance', { code: currency }) }}</p>
          <p
            v-if="fieldErrorText('amount')"
            :id="fieldErrorId('amount')"
            class="field-error"
            data-testid="cash-field-error-amount"
          >{{ fieldErrorText('amount') }}</p>

          <label class="lab" for="cash-occurred-at">{{ t(lang, 'cashOccurredAt') }}</label>
          <input
            id="cash-occurred-at"
            v-model="occurredAt"
            type="datetime-local"
            class="inp"
            data-testid="cash-occurred-at"
            :aria-invalid="invalidAttr('occurredAt')"
            :aria-describedby="describedBy('occurredAt', 'cash-occurred-at-hint')"
            :max="maxOccurredAt"
            :disabled="submitting"
            @blur="touched.occurredAt = true"
          />
          <p id="cash-occurred-at-hint" class="hint">{{ t(lang, 'cashOccurredAtHint') }}</p>
          <p
            v-if="fieldErrorText('occurredAt')"
            :id="fieldErrorId('occurredAt')"
            class="field-error"
            data-testid="cash-field-error-occurredAt"
          >{{ fieldErrorText('occurredAt') }}</p>

          </template>

          <label class="lab" for="cash-note">{{ t(lang, 'notes') }}</label>
          <textarea
            id="cash-note"
            ref="noteInput"
            v-model="note"
            rows="2"
            maxlength="500"
            class="inp"
            data-testid="cash-note"
            :aria-invalid="invalidAttr('note')"
            :aria-describedby="describedBy('note')"
            :disabled="submitting"
          />
          <p
            v-if="fieldErrorText('note')"
            :id="fieldErrorId('note')"
            class="field-error"
            data-testid="cash-field-error-note"
          >{{ fieldErrorText('note') }}</p>

          <p v-if="reversalOf" class="hint note-first">{{ t(lang, 'cashReversalNote') }}</p>
          <template v-else>
            <!-- 常駐揭露:這裡只記帳(D-01),寫入後不可改(append-only,錯了只能沖銷) -->
            <p class="hint note-first">{{ t(lang, 'cashLedgerOnlyNote') }}</p>
            <p class="hint">{{ t(lang, 'cashIrreversibleNote') }}</p>
          </template>
          <p
            v-if="submitting"
            class="submitting-note"
            role="status"
            aria-live="polite"
            data-testid="cash-submitting-status"
          >{{ t(lang, 'recordingTrade') }}</p>
        </div>

        <!-- RESULT:只渲染後端回傳的 CashEntryDto,不顯示表單值(D-09) -->
        <div v-else class="body result" data-testid="cash-result">
          <div class="check" aria-hidden="true">✓</div>
          <h2 ref="resultTitle" class="result-ttl" tabindex="-1">{{ resultTitleText }}</h2>
          <div class="result-sub">{{ resultSubText }}</div>
          <div class="rev-grid">
            <div class="span-2">
              <span>{{ t(lang, 'cashEntryId') }}</span>
              <b class="entry-id" data-testid="cash-result-entry-id">{{ recorded?.id }}</b>
            </div>
            <div>
              <span>{{ t(lang, 'type') }}</span>
              <b>{{ recordedTypeLabel }}</b>
            </div>
            <div>
              <span>{{ t(lang, 'cashCurrency') }}</span>
              <b>{{ recorded?.currency }}</b>
            </div>
            <div class="span-2">
              <span>{{ t(lang, 'cashAmount') }}</span>
              <b class="num">{{ fmtMoneyAmount(recorded?.amount, recorded?.currency) }}</b>
            </div>
            <div class="span-2">
              <span>{{ t(lang, 'cashOccurredAt') }}</span>
              <b class="num entry-id">{{ recorded?.occurredAt }}</b>
            </div>
            <div class="span-2">
              <span>{{ t(lang, 'notes') }}</span>
              <b class="entry-id">{{ recorded?.note || '—' }}</b>
            </div>
            <!-- 沖銷分錄以日期指回原紀錄,不露 reversalOfId 原始值 -->
            <div v-if="reversalOfDate" class="span-2" data-testid="cash-result-reversal-of">
              <span>{{ tf(lang, 'cashReversalOf', { date: reversalOfDate }) }}</span>
            </div>
          </div>
        </div>

        <!-- 送出錯誤:body 與 footer 之間的單一區域;診斷列只露 code 與 traceId,絕不露後端 message -->
        <div
          v-if="shownError && !hasFieldLevelErrors"
          class="form-error submit-error"
          role="alert"
          data-testid="cash-error"
        >
          <div>{{ submitErrorMessage }}</div>
          <div class="details">
            <span data-testid="cash-error-code">{{ shownError.code }}</span>
            <span v-if="shownError.traceId" data-testid="cash-error-trace-id">
              {{ t(lang, 'authRequestId') }} {{ shownError.traceId }}
            </span>
          </div>
        </div>

        <div class="ft">
          <template v-if="step === 'form'">
            <button
              type="button"
              class="btn-ghost"
              data-testid="cash-cancel"
              :disabled="submitting"
              @click="onClose"
            >{{ t(lang, 'cancel') }}</button>
            <button
              type="button"
              class="btn-accent btn-submit"
              data-testid="cash-submit"
              :disabled="submitting || !canSubmit"
              @click="submitEntry"
            >{{ submitting ? t(lang, 'recordingTrade') : submitLabel }}</button>
          </template>
          <template v-else>
            <button
              v-if="!reversalOf"
              type="button"
              class="btn-ghost"
              data-testid="cash-record-another"
              @click="recordAnother"
            >{{ t(lang, 'recordAnother') }}</button>
            <!-- 沖銷模式只有「完成」(右):flex 的 space-between 在單一子元素時會靠左,所以補 margin-left:auto -->
            <button type="button" class="btn-accent btn-done" data-testid="cash-done" @click="emit('close')">
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
import { notifyCashEntryCreated } from '../services/portfolioRevision';
import { BASE_CURRENCY_OPTIONS } from '../services/profileApi';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import { fmtMoney, fmtMoneyAmount, fmtSignedMoney, minorUnits } from '../moneyFormat';
import type { CashBalanceDto } from '../services/apiTypes';
import type { CashEntryDto, CashEntryType } from '../services/cashApi';
import type { Lang } from '../types';

const props = withDefaults(defineProps<{
  open: boolean;
  lang: Lang;
  initialType?: CashEntryType;
  initialCurrency?: string;
  balances?: CashBalanceDto[] | null;
  reversalOf?: CashEntryDto | null;
}>(), {
  initialType: 'DEPOSIT',
  initialCurrency: 'TWD',
  balances: null,
  reversalOf: null,
});
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'recorded', entry: CashEntryDto): void;
  (e: 'reversalConflict', code: string): void;
}>();

type Step = 'form' | 'result';
const step = ref<Step>('form');

const type = ref<CashEntryType>('DEPOSIT');
const currency = ref('TWD');
const amount = ref('');
const occurredAt = ref('');
const maxOccurredAt = ref('');
const note = ref('');

/** 欄位被使用者離開過才算「碰過」:空欄位在 blur 前不提早罵人。 */
const touched = reactive({ amount: false, occurredAt: false });

const submitting = ref(false);
const recorded = ref<CashEntryDto | null>(null);

const amountInput = ref<HTMLInputElement | null>(null);
const noteInput = ref<HTMLTextAreaElement | null>(null);
const resultTitle = ref<HTMLElement | null>(null);

// =================== Idempotency-Key 的生命週期(Phase 4 D-14 / 04.1 D-11) ===================
// 規則 1:key 在「按下送出」那一刻產生,同一次嘗試的重試沿用同一把。
// 規則 2:使用者自上次送出後動過任何欄位 → 下次送出換新 key(改過欄位 = 新意圖)。
// `currentKey` 絕不得綁進任何模板節點 —— 顯示 key 只會邀請使用者去改它。
const currentKey = ref<string | null>(null);
// 不做表單物件深比較:「改了又改回原值」在使用者心智模型裡仍是「我動過了」,他期待新 key。
const dirtySinceSubmit = ref(false);

/** 診斷只露 `code` 與 `traceId`,絕不顯示後端 `message`。 */
interface SubmitError {
  code: string;
  traceId: string | null;
  fields: Record<string, string> | null;
  status: number;
}
const submitError = ref<SubmitError | null>(null);
/**
 * 沖銷衝突(原紀錄已沖銷 / 不可沖銷 / 找不到)的鎖定狀態。與 `submitError` 分開存放:
 * `submitError` 會在使用者改欄位時清掉,而鎖定後「送出鈕 disabled 的可見原因」必須持續顯示。
 */
const lockedError = ref<SubmitError | null>(null);
const shownError = computed(() => submitError.value ?? lockedError.value);

/** 沖銷模式:類型 / 幣別 / 金額由原紀錄帶入,唯一可編輯的是備註。 */
const isReversal = computed(() => props.reversalOf !== null);

function resetForm() {
  step.value = 'form';
  const original = props.reversalOf;
  // 方向相反、幣別與金額照原紀錄:DB 層會擋不一致,UI 自動帶值讓它不可能送出不一致的組合(D-25)。
  type.value = original ? (original.type === 'DEPOSIT' ? 'WITHDRAWAL' : 'DEPOSIT') : props.initialType;
  currency.value = original ? original.currency : props.initialCurrency;
  amount.value = original ? String(original.amount) : '';
  note.value = '';
  const now = new Date();
  occurredAt.value = toLocalInputValue(now);
  maxOccurredAt.value = toLocalInputValue(now);
  recorded.value = null;
  touched.amount = false;
  touched.occurredAt = false;
  submitError.value = null;
  lockedError.value = null;
  currentKey.value = null;
  dirtySinceSubmit.value = false;
}

watch(() => props.open, async (open) => {
  if (!open) return;
  resetForm();
  await nextTick();
  // form 焦點落在唯一 Display 元素(金額);沖銷模式落在備註,不落在送出鈕以免 Enter 誤送。
  (isReversal.value ? noteInput.value : amountInput.value)?.focus();
}, { immediate: true });

const dialogTitle = computed(() => {
  if (step.value === 'result') return resultTitleText.value;
  if (isReversal.value) return t(props.lang, 'cashDialogTitleReversal');
  return type.value === 'DEPOSIT' ? t(props.lang, 'cashRecordDeposit') : t(props.lang, 'cashRecordWithdrawal');
});

const submitLabel = computed(() => {
  if (isReversal.value) return t(props.lang, 'cashRecordReversal');
  return type.value === 'DEPOSIT' ? t(props.lang, 'cashRecordDeposit') : t(props.lang, 'cashRecordWithdrawal');
});

const resultTitleText = computed(() => {
  if (isReversal.value) return t(props.lang, 'cashReversalRecorded');
  return recorded.value?.type === 'WITHDRAWAL' ? t(props.lang, 'cashWithdrawalRecorded') : t(props.lang, 'cashDepositRecorded');
});

function typeLabel(kind: string | null | undefined): string {
  if (kind === 'DEPOSIT') return t(props.lang, 'cashTypeDeposit');
  if (kind === 'WITHDRAWAL') return t(props.lang, 'cashTypeWithdrawal');
  return kind ?? '—';
}
const recordedTypeLabel = computed(() => typeLabel(recorded.value?.type));

/** 本機時區的 `YYYY-MM-DD HH:mm`(與發生時間輸入框同一個時區語意)。 */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : toLocalInputValue(time).replace('T', ' ');
}

/** result 的「沖銷 {date} 的紀錄」:日期取後端的 `reversalOfOccurredAt`,缺時退回原紀錄的發生時間。 */
const reversalOfDate = computed(() => {
  if (!isReversal.value || !recorded.value) return '';
  return formatDateTime(recorded.value.reversalOfOccurredAt ?? props.reversalOf?.occurredAt).slice(0, 10);
});

/** 副標:帶號金額(入金 +、出金 -);數字一律取後端回傳值。 */
const resultSubText = computed(() => {
  const entry = recorded.value;
  if (!entry) return '';
  const signed = entry.type === 'WITHDRAWAL' ? -entry.amount : entry.amount;
  return fmtSignedMoney(signed, entry.currency, minorUnits(entry.currency));
});

// =================== 前端自檢(UI-SPEC §3 欄位契約) ===================
// 後端 `@DecimalMax` / `@Digits` 才是權威;這裡只是在送出前把「必定被拒」的輸入擋下並說明原因。
// 上限與小數位數與 `cashErrAmount` 的靜態文案一致(文案不從錯誤訊息解析)。
const AMOUNT_MAX = 1_000_000_000_000;
const AMOUNT_MAX_DECIMALS = 8;
const AMOUNT_PATTERN = /^(\d+\.?\d*|\.\d+)$/;

const parsedAmount = computed(() => Number(amount.value.trim()));

const amountValid = computed(() => {
  const text = amount.value.trim();
  if (!AMOUNT_PATTERN.test(text)) return false;
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  if (decimals > AMOUNT_MAX_DECIMALS) return false;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= AMOUNT_MAX;
});

/** 不快取:送出當下要用「現在」重新判斷,避免對話框開很久後的舊 `max`。 */
function isOccurredAtValid(): boolean {
  if (!occurredAt.value) return false;
  const time = new Date(occurredAt.value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
const occurredAtValid = computed(() => isOccurredAtValid());

const canSubmit = computed(() => {
  if (lockedError.value) return false;
  // 沖銷模式沒有可輸入的金額 / 時間,自檢不適用。
  if (isReversal.value) return true;
  return amountValid.value && occurredAtValid.value;
});

/** 出金超過該幣別目前餘額 —— 只決定提示是否顯示,不顯示差額,前端不做會計。 */
const overBalance = computed(() => {
  if (isReversal.value || type.value !== 'WITHDRAWAL' || !props.balances || !amountValid.value) return false;
  const balance = props.balances.find(b => b.currency === currency.value)?.amount ?? 0;
  return parsedAmount.value > balance;
});

// =================== 欄位級錯誤(後端 fields + 前端自檢共用同一組節點) ===================
/**
 * `fields` 的 key → 前端自己的 i18n 文案。
 * **只用 key 判斷「哪個欄位錯了」** —— value 是 Bean Validation 的英文預設訊息,絕不入 DOM。
 */
const FIELD_ERROR_COPY: Record<string, string> = {
  type: 'cashErrType',
  currency: 'cashErrCurrency',
  amount: 'cashErrAmount',
  occurredAt: 'cashErrOccurredAt',
  note: 'tradeErrNote',
};

const serverFieldKeys = computed(() => Object.keys(submitError.value?.fields ?? {}));

/**
 * `fields` 至少有一個 key 對得到輸入框,才算「欄位級」呈現。
 * 一個都對不到(例如 `Idempotency-Key` 這類 header)時退回底部的一般驗證錯誤 —— 否則按了送出卻什麼都看不到。
 */
const hasFieldLevelErrors = computed(() => serverFieldKeys.value.some(field => field in FIELD_ERROR_COPY));

function fieldErrorId(field: string): string {
  return `cash-${field}-error`;
}

function localFieldInvalid(field: string): boolean {
  if (field === 'amount') return !amountValid.value && (touched.amount || amount.value !== '');
  if (field === 'occurredAt') return !occurredAtValid.value && (touched.occurredAt || occurredAt.value !== '');
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
 * `flush: 'sync'` 是刻意的:使用者改完欄位可能**立刻**按送出,
 * 預設的 pre-flush 會讓那一次仍沿用舊 key。
 */
watch(
  () => [type.value, currency.value, amount.value, occurredAt.value, note.value],
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

async function submitEntry() {
  if (submitting.value) return;
  submitError.value = null;
  if (!canSubmit.value || (!isReversal.value && !isOccurredAtValid())) {
    // 正常路徑到不了這裡(送出鈕已 disabled);程式化觸發時讓欄位錯誤可見,不得靜默。
    touched.amount = true;
    touched.occurredAt = true;
    return;
  }
  submitting.value = true;
  const idempotencyKey = ensureIdempotencyKey();
  try {
    const entry = await getRuntimeApiClients().cash.createEntry({
      type: type.value,
      currency: currency.value,
      // 沖銷直接取原紀錄的數字,不經字串往返(例如 1e-8 的 String 化)。
      amount: props.reversalOf ? props.reversalOf.amount : parsedAmount.value,
      note: note.value ? note.value : null,
      // 後端是 OffsetDateTime,必須帶 offset(datetime-local 是本地時區的裸字串)。
      // 沖銷不送發生時間(U-04):由後端帶 now()。
      occurredAt: props.reversalOf ? null : toLocalIso(new Date(occurredAt.value)),
      reversalOfId: props.reversalOf ? props.reversalOf.id : null,
    }, idempotencyKey);
    recorded.value = entry;
    // 冪等命中(同一把 key 拿回既有分錄)與首次建立走完全同一條路徑;重讀同一份資料無害。
    notifyCashEntryCreated(entry);
    // 下一筆是新意圖,key 不得沿用。
    currentKey.value = null;
    dirtySinceSubmit.value = false;
    step.value = 'result';
    await nextTick();
    resultTitle.value?.focus();
    // 不發 toast(U-17):result 步驟本身就是確認。
    emit('recorded', entry);
  } catch (error) {
    handleSubmitFailure(error);
  } finally {
    submitting.value = false;
  }
}

/** 底部錯誤依 `error.code` 分派(不假設錯誤順序);每個 code 對應 UI-SPEC 的一條文案。 */
const SUBMIT_ERROR_COPY: Record<string, string> = {
  VALIDATION_FAILED: 'cashErrValidation',
  CASH_IDEMPOTENCY_KEY_REUSED: 'cashErrKeyReused',
  AUTH_CSRF_TOKEN_INVALID: 'cashErrCsrf',
  // 前端合成(`apiClient` 的 `ensureCsrfToken`:bootstrap 後仍拿不到 cookie),後端不會送。
  AUTH_CSRF_TOKEN_MISSING: 'cashErrCsrf',
  AUTH_FORBIDDEN: 'cashErrForbidden',
  // 前端合成的診斷碼:後端不會回這個值,所以與「後端回了未知 code」可明確區分。
  NETWORK_ERROR: 'cashErrNetwork',
  CASH_ENTRY_ALREADY_REVERSED: 'cashErrAlreadyReversed',
  CASH_ENTRY_NOT_REVERSIBLE: 'cashErrNotReversible',
  CASH_ENTRY_NOT_FOUND: 'cashErrOriginalNotFound',
};

/** 沖銷三衝突:此原紀錄不會再能被沖銷,丟棄 key、鎖定送出、通知開啟者重讀列表。 */
const REVERSAL_CONFLICT_CODES = ['CASH_ENTRY_ALREADY_REVERSED', 'CASH_ENTRY_NOT_REVERSIBLE', 'CASH_ENTRY_NOT_FOUND'];

const submitErrorMessage = computed(() => {
  const error = shownError.value;
  if (!error) return '';
  const key = SUBMIT_ERROR_COPY[error.code] ?? (error.status === 403 ? 'cashErrForbidden' : 'cashErrUnknown');
  return t(props.lang, key);
});

/**
 * 送出失敗的統一落點。
 *
 * **key 的處置:預設一律保留** —— 「這次沒寫入(或結果未知),但意圖沒變」,沿用同一把重送是安全且正確的
 * (這正是 `cashErrNetwork` 敢寫「直接再送出一次不會重複記錄」的前提)。
 * 網路失敗、5xx、`VALIDATION_FAILED`、CSRF / 403 都走這條。
 *
 * **例外是 `CASH_IDEMPOTENCY_KEY_REUSED`:必須丟棄 key。** 否則使用者照文案「確認欄位後重新送出」
 * 會用同一把 key 再吃一次 409,形成無出路的迴圈。
 */
function handleSubmitFailure(error: unknown) {
  const described: SubmitError = error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };

  // 401 / refresh 失敗**不在對話框顯示**,走全域 SessionBanner(`apiClient` 已負責升級)。
  // key 保留:登入回來後重送的是同一個意圖。
  if (described.status === 401) return;

  if (isReversal.value && REVERSAL_CONFLICT_CODES.includes(described.code)) {
    currentKey.value = null;
    lockedError.value = described;
    submitError.value = null;
    emit('reversalConflict', described.code);
    return;
  }

  submitError.value = described;
  if (described.code === 'CASH_IDEMPOTENCY_KEY_REUSED') currentKey.value = null;
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
.x:focus-visible, .type-btn:focus-visible, .ccy-btn:focus-visible,
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

/* 沖銷原紀錄摘要卡:OrderTicket .quote-card 的形狀(此卡在對話框內,不在頁面卡片內) */
.quote-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.quote-lab { font-size: 12px; font-weight: 600; letter-spacing: 0; color: var(--fg-mute); margin-bottom: 4px; }
.sum-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 400; padding: 4px 0; }
.sum-row span { color: var(--fg-dim); }
.sum-row b { font-weight: 600; text-align: right; }
.wrap-any { overflow-wrap: anywhere; }
/* 沖銷模式唯一的 Display 級元素 */
.reversal-preview { margin-top: 16px; font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: 0; }
.rp-lab { font-size: 12px; font-weight: 600; color: var(--fg-dim); margin-right: 8px; }

/* 欄位級錯誤:輸入框下方 12px --dn 文字 */
.field-error {
  margin: 8px 0 0; font-size: 12px; font-weight: 600; line-height: 1.35;
  color: var(--dn); overflow-wrap: anywhere;
}
.submitting-note { margin: 8px 0 0; font-size: 12px; font-weight: 600; color: var(--fg-dim); }

/* 類型:OrderTicket .side-btn 的形狀,選中態為中性(損益顏色語意不屬於入出金) */
.type-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.type-btn {
  padding: 12px; min-height: 44px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; font-weight: 600; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.type-btn.active { background: var(--surface); color: var(--fg); border: 1px solid var(--fg); }
.type-btn:disabled, .ccy-btn:disabled { opacity: .5; cursor: not-allowed; }

.ccy-seg { display: flex; background: var(--surface2); border-radius: 8px; padding: 4px; gap: 4px; }
.ccy-btn {
  flex: 1; padding: 8px 12px; min-height: 36px; background: transparent; border: 0; border-radius: 8px;
  font-size: 12px; font-weight: 600; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.ccy-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

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
  標籤切換(`記錄出金` ↔ `記錄中…`、`Record withdrawal` ↔ `Recording…`)不得讓按鈕縮放而造成版位跳動,
  所以由最寬的標籤(en `Record withdrawal`,13px/600 約 125px + 48px 水平內距)決定下限。
*/
.btn-submit { min-width: 176px; }
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

/* < 400px:面板 92vw 約 294px,footer 內距與主按鈕內距降為 16px,否則最長標籤會溢出 */
@media (max-width: 399px) {
  .ft { padding-left: 16px; padding-right: 16px; }
  .btn-accent { padding-left: 16px; padding-right: 16px; }
  .btn-submit { min-width: 160px; }
}

@media (prefers-reduced-motion: reduce) {
  .mask, .dialog, .check { animation: none; }
}
</style>
