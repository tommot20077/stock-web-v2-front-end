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
          <div id="cash-type-label" class="lab">{{ t(lang, 'type') }}</div>
          <div class="type-toggle" role="group" aria-labelledby="cash-type-label">
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

          <div id="cash-currency-label" class="lab">{{ t(lang, 'cashCurrency') }}</div>
          <div class="ccy-seg" role="group" aria-labelledby="cash-currency-label">
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
            aria-describedby="cash-amount-hint"
            :disabled="submitting"
          />
          <p id="cash-amount-hint" class="hint">{{ t(lang, 'cashAmountHint') }}</p>

          <label class="lab" for="cash-occurred-at">{{ t(lang, 'cashOccurredAt') }}</label>
          <input
            id="cash-occurred-at"
            v-model="occurredAt"
            type="datetime-local"
            class="inp"
            data-testid="cash-occurred-at"
            aria-describedby="cash-occurred-at-hint"
            :max="maxOccurredAt"
            :disabled="submitting"
          />
          <p id="cash-occurred-at-hint" class="hint">{{ t(lang, 'cashOccurredAtHint') }}</p>

          <label class="lab" for="cash-note">{{ t(lang, 'notes') }}</label>
          <textarea
            id="cash-note"
            v-model="note"
            rows="2"
            maxlength="500"
            class="inp"
            data-testid="cash-note"
            :disabled="submitting"
          />

          <!-- 常駐揭露:這裡只記帳(D-01),寫入後不可改(append-only,錯了只能沖銷) -->
          <p class="hint note-first">{{ t(lang, 'cashLedgerOnlyNote') }}</p>
          <p class="hint">{{ t(lang, 'cashIrreversibleNote') }}</p>
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
          </div>
        </div>

        <!-- 送出錯誤:body 與 footer 之間的單一區域;診斷列只露 code 與 traceId,絕不露後端 message -->
        <div
          v-if="submitError"
          class="form-error submit-error"
          role="alert"
          data-testid="cash-error"
        >
          <div>{{ submitErrorMessage }}</div>
          <div class="details">
            <span data-testid="cash-error-code">{{ submitError.code }}</span>
            <span v-if="submitError.traceId" data-testid="cash-error-trace-id">
              {{ t(lang, 'authRequestId') }} {{ submitError.traceId }}
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
              type="button"
              class="btn-ghost"
              data-testid="cash-record-another"
              @click="recordAnother"
            >{{ t(lang, 'recordAnother') }}</button>
            <button type="button" class="btn-accent" data-testid="cash-done" @click="emit('close')">
              {{ t(lang, 'cashDone') }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { t } from '../i18n';
import { ApiClientError } from '../services/apiClient';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { notifyCashEntryCreated } from '../services/portfolioRevision';
import { BASE_CURRENCY_OPTIONS } from '../services/profileApi';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import { fmtMoneyAmount, fmtSignedMoney, minorUnits } from '../moneyFormat';
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

const submitting = ref(false);
const recorded = ref<CashEntryDto | null>(null);

const amountInput = ref<HTMLInputElement | null>(null);
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

function resetForm() {
  step.value = 'form';
  type.value = props.initialType;
  currency.value = props.initialCurrency;
  amount.value = '';
  note.value = '';
  const now = new Date();
  occurredAt.value = toLocalInputValue(now);
  maxOccurredAt.value = toLocalInputValue(now);
  recorded.value = null;
  submitError.value = null;
  currentKey.value = null;
  dirtySinceSubmit.value = false;
}

watch(() => props.open, async (open) => {
  if (!open) return;
  resetForm();
  await nextTick();
  // 焦點落在 form 的唯一 Display 元素(金額)。
  amountInput.value?.focus();
}, { immediate: true });

const dialogTitle = computed(() => {
  if (step.value === 'result') return resultTitleText.value;
  return type.value === 'DEPOSIT' ? t(props.lang, 'cashRecordDeposit') : t(props.lang, 'cashRecordWithdrawal');
});

const submitLabel = computed(() =>
  type.value === 'DEPOSIT' ? t(props.lang, 'cashRecordDeposit') : t(props.lang, 'cashRecordWithdrawal'));

const resultTitleText = computed(() =>
  recorded.value?.type === 'WITHDRAWAL' ? t(props.lang, 'cashWithdrawalRecorded') : t(props.lang, 'cashDepositRecorded'));

const recordedTypeLabel = computed(() => {
  const kind = recorded.value?.type;
  if (kind === 'DEPOSIT') return t(props.lang, 'cashTypeDeposit');
  if (kind === 'WITHDRAWAL') return t(props.lang, 'cashTypeWithdrawal');
  return kind ?? '—';
});

/** 副標:帶號金額(入金 +、出金 -);數字一律取後端回傳值。 */
const resultSubText = computed(() => {
  const entry = recorded.value;
  if (!entry) return '';
  const signed = entry.type === 'WITHDRAWAL' ? -entry.amount : entry.amount;
  return fmtSignedMoney(signed, entry.currency, minorUnits(entry.currency));
});

const parsedAmount = computed(() => Number(amount.value.trim()));
const canSubmit = computed(() => parsedAmount.value > 0);

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
  if (!canSubmit.value) return;
  submitting.value = true;
  const idempotencyKey = ensureIdempotencyKey();
  try {
    const entry = await getRuntimeApiClients().cash.createEntry({
      type: type.value,
      currency: currency.value,
      amount: parsedAmount.value,
      note: note.value ? note.value : null,
      // 後端是 OffsetDateTime,必須帶 offset(datetime-local 是本地時區的裸字串)。
      occurredAt: toLocalIso(new Date(occurredAt.value)),
      reversalOfId: null,
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

function handleSubmitFailure(error: unknown) {
  const described: SubmitError = error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };
  submitError.value = described;
}

const submitErrorMessage = computed(() => (submitError.value ? t(props.lang, 'cashErrUnknown') : ''));

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
