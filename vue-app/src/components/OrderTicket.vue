<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click="onMaskClick">
      <div
        class="ticket"
        role="dialog"
        aria-modal="true"
        :aria-busy="submitting ? 'true' : 'false'"
        @click.stop
      >
        <div class="hd">
          <div class="hd-l">
            <!-- 裝飾性進度指示:步驟語意由標題文字承擔,整組 aria-hidden(§Accessibility) -->
            <div class="step-dots" data-testid="ticket-step-dots" aria-hidden="true">
              <span v-for="(_, i) in 3" :key="i" :class="['dot', { on: i <= stepIdx, done: i < stepIdx }]" />
            </div>
            <div class="hd-ttl">{{ stepTitle }}</div>
          </div>
          <button
            type="button"
            class="x"
            data-testid="ticket-close"
            :aria-label="t(lang, 'closeTicket')"
            @click="onClose"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <!-- STEP 1: Ticket -->
        <div v-if="step === 'ticket'" class="body two-col">
          <div class="left">
            <label class="lab" for="trade-symbol">{{ t(lang, 'symbol') }}</label>
            <div class="sym-wrap">
              <input
                id="trade-symbol"
                ref="symInput"
                v-model="symQuery"
                class="inp big"
                data-testid="ticket-symbol-input"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="trade-symbol-options"
                :aria-expanded="symOpen && options.length > 0"
                :placeholder="t(lang, 'selectSymbol')"
                :disabled="submitting"
                @focus="symOpen = true"
                @input="onSymInput"
              />
              <div v-if="selected" class="sym-meta">
                <span class="sym-tag">{{ selected.assetType }}</span>
                <span class="sym-name">{{ selected.name }}</span>
              </div>
              <div
                v-if="symOpen && options.length"
                id="trade-symbol-options"
                class="sym-pop"
                role="listbox"
                data-testid="ticket-symbol-options"
              >
                <div
                  v-for="asset in options"
                  :key="asset.uuid"
                  class="sym-row"
                  role="option"
                  :aria-selected="asset.symbol === selected?.symbol"
                  :data-testid="`ticket-symbol-option-${asset.symbol}`"
                  @mousedown.prevent="pickAsset(asset)"
                >
                  <div>
                    <div class="sym-opt-sym">{{ asset.symbol }}</div>
                    <div class="sym-opt-name">{{ asset.name }}</div>
                  </div>
                  <div class="num sym-opt-right">
                    <div class="sym-opt-px">{{ fmtNum(asset.latestPrice ?? Number.NaN) }}</div>
                    <div
                      class="sym-opt-chg"
                      :style="{ color: (asset.changePercent ?? 0) >= 0 ? 'var(--up)' : 'var(--dn)' }"
                    >
                      {{ fmtPct(asset.changePercent ?? 0) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <label class="lab" for="trade-side-buy">{{ t(lang, 'side') }}</label>
            <div class="side-toggle">
              <button
                id="trade-side-buy"
                type="button"
                :class="['side-btn', 'buy', { active: side === 'BUY' }]"
                :disabled="submitting"
                @click="side = 'BUY'"
              >
                <span aria-hidden="true">↗</span> {{ t(lang, 'buy') }}
              </button>
              <button
                type="button"
                :class="['side-btn', 'sell', { active: side === 'SELL' }]"
                :disabled="submitting"
                @click="side = 'SELL'"
              >
                <span aria-hidden="true">↘</span> {{ t(lang, 'sell') }}
              </button>
            </div>

            <!-- D-04:訂單類型後端沒有對應概念,只在 mock mode 渲染(不留空版位) -->
            <template v-if="live">
              <label class="lab" for="trade-ord-type-mkt">{{ t(lang, 'orderType') }}</label>
              <div class="seg">
                <button
                  id="trade-ord-type-mkt"
                  type="button"
                  :class="['seg-btn', { active: ordType === 'MKT' }]"
                  @click="ordType = 'MKT'"
                >{{ t(lang, 'market') }}</button>
                <button
                  type="button"
                  :class="['seg-btn', { active: ordType === 'LMT' }]"
                  @click="ordType = 'LMT'"
                >{{ t(lang, 'limit') }}</button>
              </div>
            </template>

            <div class="row2">
              <div>
                <label class="lab" for="trade-qty">{{ t(lang, 'qty') }}</label>
                <input
                  id="trade-qty"
                  v-model.number="qty"
                  type="number"
                  inputmode="decimal"
                  class="inp"
                  data-testid="ticket-qty"
                  min="0"
                  :step="qtyStep"
                  :disabled="submitting"
                />
              </div>
              <div>
                <!-- D-04 連帶效果:MKT 鎖價機制移除,價格一律預填 latestPrice 但可編輯 -->
                <label class="lab" for="trade-price">{{ t(lang, 'price') }}</label>
                <input
                  id="trade-price"
                  v-model.number="px"
                  type="number"
                  inputmode="decimal"
                  class="inp"
                  data-testid="ticket-price"
                  min="0"
                  step="0.01"
                  :disabled="submitting"
                />
              </div>
            </div>

            <div class="row2">
              <div>
                <!-- D-02:手續費由使用者輸入,預設 0。前端不發明費率 —— fee 會進 avg_cost
                     與 realized_pnl,而 transactions 是 append-only,寫錯永久留存。 -->
                <label class="lab" for="trade-fee">{{ t(lang, 'fee') }}</label>
                <input
                  id="trade-fee"
                  v-model.number="fee"
                  type="number"
                  inputmode="decimal"
                  class="inp"
                  data-testid="ticket-fee"
                  min="0"
                  step="0.01"
                  aria-describedby="trade-fee-hint"
                  :disabled="submitting"
                />
                <p id="trade-fee-hint" class="hint">{{ t(lang, 'tradeFeeHint') }}</p>
              </div>
              <div>
                <!-- D-03:成交時間預設現在、不可晚於現在;送出時轉為帶 offset 的 ISO 字串 -->
                <label class="lab" for="trade-executed-at">{{ t(lang, 'tradeExecutedAt') }}</label>
                <input
                  id="trade-executed-at"
                  v-model="executedAt"
                  type="datetime-local"
                  class="inp"
                  data-testid="ticket-executed-at"
                  :max="maxExecutedAt"
                  aria-describedby="trade-executed-at-hint"
                  :disabled="submitting"
                />
                <p id="trade-executed-at-hint" class="hint">{{ t(lang, 'tradeExecutedAtHint') }}</p>
              </div>
            </div>

            <label class="lab" for="trade-note">{{ t(lang, 'notes') }}</label>
            <input
              id="trade-note"
              v-model="note"
              type="text"
              class="inp"
              data-testid="ticket-note"
              maxlength="500"
              :disabled="submitting"
            />

            <!-- D-04:TIF 後端沒有對應概念,只在 mock mode 渲染 -->
            <template v-if="live">
              <label class="lab" for="trade-tif-day">{{ t(lang, 'tif') }}</label>
              <div class="seg">
                <button
                  id="trade-tif-day"
                  type="button"
                  :class="['seg-btn', { active: tif === 'DAY' }]"
                  @click="tif = 'DAY'"
                >{{ t(lang, 'day') }}</button>
                <button
                  type="button"
                  :class="['seg-btn', { active: tif === 'GTC' }]"
                  @click="tif = 'GTC'"
                >{{ t(lang, 'gtc') }}</button>
              </div>
            </template>

            <div v-if="validationError" class="form-error" role="alert">{{ validationError }}</div>
          </div>

          <div class="right">
            <div v-if="selected" class="quote-card">
              <div class="row-between">
                <div>
                  <div class="quote-lab">{{ t(lang, 'last') }}</div>
                  <div class="num quote-last">{{ fmtNum(selected.latestPrice ?? Number.NaN) }}</div>
                </div>
                <div
                  class="num quote-chg-wrap"
                  :style="{ color: (selected.changePercent ?? 0) >= 0 ? 'var(--up)' : 'var(--dn)' }"
                >
                  <div class="quote-chg">
                    {{ (selected.changePercent ?? 0) >= 0 ? '+' : '' }}{{ fmtNum(selected.change ?? Number.NaN) }}
                  </div>
                  <div class="quote-chg-pct">{{ fmtPct(selected.changePercent ?? 0) }}</div>
                </div>
              </div>

              <!-- 走勢圖接 GET /market/{symbol}/klines 是 04-10 的範圍。骨架階段誠實顯示
                   「無走勢資料」,不用 genSeries() 生成看起來像真的假序列(D-16)。 -->
              <div class="quote-chart" data-testid="ticket-quote-chart-empty">
                {{ t(lang, 'quoteChartEmpty') }}
              </div>

              <div class="quote-meta">
                <div>
                  <div class="qm-l">{{ t(lang, 'dayRange') }}</div>
                  <div class="num qm-v">
                    {{ fmtNum(selected.low ?? Number.NaN) }} – {{ fmtNum(selected.high ?? Number.NaN) }}
                  </div>
                </div>
                <div>
                  <div class="qm-l">{{ t(lang, 'volume') }}</div>
                  <div class="num qm-v">{{ selected.volumeText }}</div>
                </div>
              </div>
            </div>
            <div v-else class="quote-empty">
              {{ t(lang, 'selectSymbol') }}
            </div>

            <div class="summary">
              <div class="sum-row">
                <span>{{ t(lang, 'estTotal') }}</span>
                <span class="num sum-strong">${{ fmtNum(estTotal, 2) }}</span>
              </div>
              <!-- D-04:交易後現金全 repo 無後端來源,只在 mock mode 渲染 -->
              <div v-if="live" class="sum-row dim">
                <span>{{ t(lang, 'cashAfter') }}</span>
                <span class="num">${{ fmtNum(cashAfter, 0) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: Review(DP-9:append-only 帳本的不可撤銷寫入需要一個確認關卡) -->
        <div v-else-if="step === 'review'" class="body review">
          <div class="big-side" :class="side.toLowerCase()">
            {{ side === 'BUY' ? t(lang, 'buy') : t(lang, 'sell') }} {{ qty }} {{ selected?.symbol }}
          </div>
          <div class="rev-grid">
            <div v-if="live">
              <span>{{ t(lang, 'orderType') }}</span>
              <b>{{ ordType === 'MKT' ? t(lang, 'market') : t(lang, 'limit') }} · {{ tif }}</b>
            </div>
            <div><span>{{ t(lang, 'price') }}</span><b class="num">${{ fmtNum(px) }}</b></div>
            <div><span>{{ t(lang, 'qty') }}</span><b class="num">{{ qty }}</b></div>
            <div><span>{{ t(lang, 'fee') }}</span><b class="num">${{ fmtNum(fee) }}</b></div>
            <div class="span-2">
              <span>{{ t(lang, 'tradeExecutedAt') }}</span>
              <b class="num">{{ executedAt.replace('T', ' ') }}</b>
            </div>
            <div class="span-2 highlight">
              <span>{{ t(lang, 'estTotal') }}</span><b class="num">${{ fmtNum(estTotal, 2) }}</b>
            </div>
            <div v-if="live" class="span-2 dim">
              <span>{{ t(lang, 'cashAfter') }}</span><b class="num">${{ fmtNum(cashAfter, 0) }}</b>
            </div>
          </div>
          <p class="irreversible">{{ t(lang, 'tradeIrreversibleNote') }}</p>
          <p
            v-if="submitting"
            class="submitting-note"
            role="status"
            aria-live="polite"
            data-testid="ticket-submitting-status"
          >{{ t(lang, 'recordingTrade') }}</p>
        </div>

        <!-- STEP 3: Result(只渲染回傳的 TradeDto,不顯示表單值 —— D-09) -->
        <div v-else class="body result" data-testid="ticket-result">
          <div class="check" aria-hidden="true">✓</div>
          <h2 ref="resultTitle" class="result-ttl" tabindex="-1">{{ t(lang, 'tradeRecorded') }}</h2>
          <div class="result-sub">
            {{ recorded?.type === 'BUY' ? t(lang, 'buy') : t(lang, 'sell') }}
            {{ recorded?.quantity }} {{ recorded?.symbol }} @ ${{ fmtNum(recorded?.price ?? Number.NaN) }}
          </div>
          <div class="rev-grid">
            <div class="span-2">
              <span>{{ t(lang, 'tradeId') }}</span>
              <b class="trade-id" data-testid="ticket-result-trade-id">{{ recorded?.id }}</b>
            </div>
            <div>
              <span>{{ t(lang, 'price') }}</span>
              <b class="num" data-testid="ticket-result-price">${{ fmtNum(recorded?.price ?? Number.NaN) }}</b>
            </div>
            <div><span>{{ t(lang, 'qty') }}</span><b class="num">{{ recorded?.quantity }}</b></div>
            <div><span>{{ t(lang, 'fee') }}</span><b class="num">${{ fmtNum(recorded?.fee ?? Number.NaN) }}</b></div>
            <div>
              <span>{{ t(lang, 'tradeExecutedAt') }}</span>
              <b class="num trade-id" data-testid="ticket-result-executed-at">{{ recorded?.executedAt }}</b>
            </div>
            <div class="span-2 highlight">
              <span>{{ t(lang, 'estTotal') }}</span>
              <b class="num">${{ fmtNum((recorded?.quantity ?? 0) * (recorded?.price ?? 0), 2) }}</b>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ft">
          <template v-if="step === 'ticket'">
            <button type="button" class="btn-ghost" @click="onClose">{{ t(lang, 'cancel') }}</button>
            <button
              type="button"
              class="btn-accent"
              data-testid="ticket-review-advance"
              :disabled="!canSubmit"
              @click="step = 'review'"
            >{{ t(lang, 'reviewTrade') }} →</button>
          </template>
          <template v-else-if="step === 'review'">
            <button
              type="button"
              class="btn-ghost"
              data-testid="ticket-back-to-edit"
              :disabled="submitting"
              @click="step = 'ticket'"
            >← {{ t(lang, 'backToEdit') }}</button>
            <button
              type="button"
              :class="['btn-accent', side.toLowerCase()]"
              data-testid="ticket-submit"
              :disabled="submitting"
              @click="submitTrade"
            >{{ submitting ? t(lang, 'recordingTrade') : t(lang, 'recordTrade') }}</button>
          </template>
          <template v-else>
            <button type="button" class="btn-ghost" @click="recordAnother">{{ t(lang, 'recordAnother') }}</button>
            <button type="button" class="btn-accent" @click="goPositions">{{ t(lang, 'viewPositions') }} →</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { t } from '../i18n';
// 只取格式化純函式;標的資料一律經 market adapter,本檔不再讀 data.ts 的假資料集
// (SYMBOLS / CRYPTO / FX / genSeries 全部移除)。
import { fmtNum, fmtPct } from '../data';
import { getRuntimeApiClients } from '../services/pageApiClients';
import { notifyTradeCreated } from '../services/portfolioRevision';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import type { AssetDto, TradeDto } from '../services/apiTypes';
import type { Lang } from '../types';

const props = defineProps<{ open: boolean; lang: Lang; preset?: { sym: string; side?: 'BUY' | 'SELL' } | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'navigate', p: 'positions'): void; (e: 'toast', m: string): void }>();

// judgment §3:元件只認 domain service,永不 import mock store。
// 分支條件是「mock 專屬 reactive 視窗是否存在」,不是 mode 字串(portfolioApi.ts:42-45)。
//
// **刻意延遲到 ticket 開啟才解析 adapter**:OrderTicket 是全域 overlay(`App.vue:52`),
// 不受 `showMainContent` 的 v-if 保護而永遠掛載。若在 setup 就呼叫 getRuntimeApiClients(),
// `VITE_DATA_MODE` 無效時會在 App 顯示設定錯誤畫面之前先丟 RuntimeDataModeError。
type RuntimeClients = ReturnType<typeof getRuntimeApiClients>;
const clients = shallowRef<RuntimeClients | null>(null);

function apiClients(): RuntimeClients {
  if (!clients.value) clients.value = getRuntimeApiClients();
  return clients.value;
}

const live = computed(() => clients.value?.trading.live);

// U-01 / U-16:三步驟。送出中**不切換步驟**(停在 review),只切 submitting。
type Step = 'ticket' | 'review' | 'result';
const STEPS: Step[] = ['ticket', 'review', 'result'];

const step = ref<Step>('ticket');
const stepIdx = computed(() => STEPS.indexOf(step.value));
const stepTitle = computed(() => {
  switch (step.value) {
    case 'ticket': return t(props.lang, 'recordTrade');
    case 'review': return t(props.lang, 'reviewTrade');
    default: return t(props.lang, 'tradeRecorded');
  }
});

const symInput = ref<HTMLInputElement | null>(null);
const resultTitle = ref<HTMLElement | null>(null);
const symQuery = ref('');
const symOpen = ref(false);
const options = ref<AssetDto[]>([]);
const selected = ref<AssetDto | null>(null);

const side = ref<'BUY' | 'SELL'>('BUY');
// D-04:ordType / tif 只在 mock mode 渲染;後端 CreateTradeRequest 沒有這兩個欄位,
// 因此它們永遠不會進入 payload(judgment §1 明文點名的反例)。
const ordType = ref<'MKT' | 'LMT'>('MKT');
const tif = ref<'DAY' | 'GTC'>('DAY');
const qty = ref<number>(0);
const px = ref<number>(0);
const fee = ref<number>(0);
const note = ref('');
const executedAt = ref('');
const maxExecutedAt = ref('');

const submitting = ref(false);
const orderError = ref('');
const recorded = ref<TradeDto | null>(null);

/** typeahead 下拉最多 10 筆(§2);debounce / AbortController / 七態是 04-10 的範圍。 */
const SEARCH_SIZE = 10;

async function searchAssets(query: string): Promise<AssetDto[]> {
  try {
    const page = await apiClients().market.searchAssets({ query: query.trim(), size: SEARCH_SIZE });
    // D-01:只有後端確認存在且 tradeable 的標的可以被選取。
    return page.items.filter(asset => asset.tradeable);
  } catch {
    // 下拉的 error 態(診斷列 + 重試)是 04-10;骨架階段不阻擋 ticket 的其他欄位。
    return [];
  }
}

const qtyStep = computed(() => (selected.value?.assetType === 'CRYPTO' ? 0.01 : 1));
const estTotal = computed(() => qty.value * px.value);
// mock mode 專屬的展示值(D-04:API mode 不渲染,後端沒有帳戶餘額模型)。
const cashAfter = computed(() => 124_580 - (side.value === 'BUY'
  ? estTotal.value + fee.value
  : -(estTotal.value - fee.value)));

const selectedMatchesQuery = computed(() =>
  !!selected.value && symQuery.value.trim().toUpperCase() === selected.value.symbol.toUpperCase()
);

/**
 * D-15 的最小預檢:只在 mock mode 生效(mock adapter 的 reactive 視窗是同步的)。
 * API mode 的持倉預檢(含「可賣數量」顯示與載入/失敗態)是 04-11 的範圍;
 * 後端 409 `TRADE_INSUFFICIENT_HOLDING` 在兩個 mode 都是最終權威(judgment §5)。
 */
const sellPrecheckError = computed(() => {
  const positions = clients.value?.portfolio.live?.positions;
  if (!positions || side.value !== 'SELL' || !selected.value || qty.value <= 0) return '';
  const holding = positions.find(position => position.sym === selected.value!.symbol);
  if (!holding || holding.qty <= 0) return 'No holdings available to sell';
  if (qty.value > holding.qty) return 'Sell quantity exceeds current holding';
  return '';
});

/** 前端自檢(Q8.4 的 (ii)):擋未來時間。**這是 UX,不是後端驗證的替代品**。 */
const executedAtError = computed(() => {
  const parsed = executedAt.value ? new Date(executedAt.value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return t(props.lang, 'tradeErrExecutedAt');
  return parsed.getTime() > Date.now() ? t(props.lang, 'tradeErrExecutedAt') : '';
});

const feeError = computed(() => (fee.value < 0 || !Number.isFinite(fee.value) ? t(props.lang, 'tradeErrFee') : ''));

const validationError = computed(() =>
  orderError.value || sellPrecheckError.value || executedAtError.value || feeError.value
);

const canSubmit = computed(() =>
  !!selected.value
  && selectedMatchesQuery.value
  && qty.value > 0
  && px.value > 0
  && !validationError.value
);

function pickAsset(asset: AssetDto) {
  orderError.value = '';
  selected.value = asset;
  symQuery.value = asset.symbol;
  symOpen.value = false;
  // 價格預填後端 latestPrice,但保持可編輯(D-04 連帶效果:這正是「手動記錄已成交價格」的語意)。
  px.value = asset.latestPrice ?? 0;
  if (qty.value === 0) qty.value = asset.assetType === 'CRYPTO' ? 0.05 : 10;
}

function clearSelection(preserveQuery = false) {
  orderError.value = '';
  selected.value = null;
  if (!preserveQuery) symQuery.value = '';
  symOpen.value = false;
  qty.value = 0;
  px.value = 0;
}

function resetTicket() {
  step.value = 'ticket';
  submitting.value = false;
  recorded.value = null;
  side.value = 'BUY';
  ordType.value = 'MKT';
  tif.value = 'DAY';
  fee.value = 0;
  note.value = '';
  orderError.value = '';
  const now = new Date();
  maxExecutedAt.value = toLocalInputValue(now);
  executedAt.value = maxExecutedAt.value;
  options.value = [];
  clearSelection();
}

function onSymInput() {
  symOpen.value = true;
  orderError.value = '';
  const query = symQuery.value.trim();
  if (!selected.value || query.toUpperCase() !== selected.value.symbol.toUpperCase()) {
    clearSelection(true);
    symOpen.value = true;
  }
  // 先清空舊結果:上一個查詢字串的結果不得留在畫面上冒充目前查詢的結果。
  // (下拉的 loading 骨架列是 04-10;骨架階段就是短暫的空下拉。)
  options.value = [];
  void searchAssets(query).then((assets) => {
    // 只採用「查詢字串仍然一致」的回應。完整的競態處理(AbortController / 遞增 request id)
    // 與 250ms debounce 是 04-10 的範圍。
    if (symQuery.value.trim().toUpperCase() !== query.toUpperCase()) return;
    options.value = assets;
    const exact = assets.find(asset => asset.symbol.toUpperCase() === query.toUpperCase());
    if (exact && selected.value?.symbol !== exact.symbol) pickAsset(exact);
  });
}

watch(() => props.open, async (open) => {
  if (!open) return;
  const api = apiClients();
  resetTicket();
  const preset = props.preset;
  if (preset?.side) side.value = preset.side;
  // 這裡刻意直接 await adapter(不經 searchAssets 包一層):開啟 ticket 是使用者等待中的路徑,
  // 多包一層 async 就多一輪 microtask,preset 解析會晚一個 tick 才出現在畫面上。
  let assets: AssetDto[] = [];
  try {
    const page = await api.market.searchAssets({ query: preset?.sym ?? '', size: SEARCH_SIZE });
    assets = page.items.filter(asset => asset.tradeable);
  } catch {
    assets = [];
  }
  if (!props.open) return;
  options.value = assets;
  if (preset) {
    const exact = assets.find(asset => asset.symbol.toUpperCase() === preset.sym.toUpperCase());
    // 解析不到就維持清空狀態,**不回退本地假資料**。
    if (exact) pickAsset(exact);
  }
  await nextTick();
  // 焦點落在 step 1 的唯一 Display 元素(§Accessibility:焦點必須進入對話框且落在動作起點)。
  symInput.value?.focus();
}, { immediate: true });

function onMaskClick() {
  if (submitting.value) return;
  onClose();
}

function onClose() {
  if (submitting.value) return;
  emit('close');
}

async function recordAnother() {
  resetTicket();
  options.value = await searchAssets('');
  await nextTick();
  symInput.value?.focus();
}

function goPositions() {
  emit('navigate', 'positions');
  resetTicket();
  emit('close');
}

/**
 * D-14 / T-04-10:key 在「按下送出」時產生,且必須是 CSPRNG ——
 * 非密碼學的偽亂數(例如 `crypto` 以外的隨機來源)會有碰撞風險,
 * 而碰撞會讓別人的交易被當成你的重試回傳。
 * key 的完整生命週期(重試沿用、改欄位換新)是 04-11 的範圍。
 */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function submitTrade() {
  if (submitting.value) return;
  if (!selected.value || !canSubmit.value) return;
  submitting.value = true;
  orderError.value = '';
  try {
    const trade = await apiClients().trading.createTrade({
      symbol: selected.value.symbol,
      type: side.value,
      quantity: qty.value,
      price: px.value,
      fee: fee.value,
      note: note.value ? note.value : null,
      // D-03:後端是 OffsetDateTime,必須帶 offset(datetime-local 是本地時區的裸字串)。
      executedAt: toLocalIso(new Date(executedAt.value)),
    }, newIdempotencyKey());
    recorded.value = trade;
    // D-10 / D-13:成功後的唯一訊號來源。消費端(三頁重讀與 fresh 高亮)在 04-12 接上。
    notifyTradeCreated(trade);
    step.value = 'result';
    emit('toast', `${t(props.lang, 'tradeRecordedToast')} ${trade.type} ${trade.quantity} ${trade.symbol} @ ${fmtNum(trade.price)}`);
    await nextTick();
    resultTitle.value?.focus();
  } catch {
    // 依 error.code 分派文案、欄位級錯誤綁定與診斷列是 04-11 的範圍;
    // 骨架階段沿用既有的表單層提示,不新增任何診斷顯示(T-04-09)。
    step.value = 'ticket';
    orderError.value = sellPrecheckError.value || 'Order rejected';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.42); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 200;
  animation: fade .18s ease-out;
}
.ticket {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  width: 720px; max-width: 92vw; box-shadow: 0 24px 64px rgba(0,0,0,0.18);
  animation: rise .22s cubic-bezier(.2,.7,.2,1);
  overflow: hidden;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

.hd { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--border); }
.hd-l { display: flex; align-items: center; gap: 12px; }
.hd-ttl { font-size: 16px; font-weight: 600; line-height: 1.35; }
.step-dots { display: flex; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--surface2); transition: all .25s; }
.dot.on { background: var(--accent); width: 20px; border-radius: 3px; }
.dot.done { background: var(--accent); opacity: .55; }
.x {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px;
  background: transparent; border: 0; color: var(--fg-dim); font-size: 16px; font-weight: 400;
  cursor: pointer; border-radius: 8px;
}
.x:hover { background: var(--surface2); color: var(--fg); }
.x:focus-visible, .side-btn:focus-visible, .seg-btn:focus-visible,
.btn-accent:focus-visible, .btn-ghost:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.body { padding: 24px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

.lab {
  display: block; font-size: 12px; font-weight: 600; line-height: 1.35;
  color: var(--fg-dim); letter-spacing: 0; margin: 16px 0 8px;
}
.lab:first-child { margin-top: 0; }
.hint { font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); margin: 4px 0 0; }

.inp {
  width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px; min-height: 36px; font-size: 13px; font-weight: 400; line-height: 1.45;
  color: var(--fg); outline: none; font-family: inherit; transition: border .15s;
}
.inp:focus { border-color: var(--accent); }
/* U-18:step 1 的唯一 Display 級元素 */
.inp.big { font-size: 20px; font-weight: 600; line-height: 1.25; padding: 12px 16px; min-height: 44px; }
.inp:disabled { opacity: .5; cursor: not-allowed; }

.sym-wrap { position: relative; }
.sym-meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-size: 12px; font-weight: 400; }
.sym-name { color: var(--fg-dim); }
.sym-tag {
  /* §Spacing 的「規則優先於下表」:遷移表寫 2px 8px,但 2px 既非 4 的倍數也不屬 5 類 Exceptions */
  background: var(--accent); color: #fff; padding: 4px 8px; border-radius: 4px;
  font-size: 12px; font-weight: 600; letter-spacing: 0;
}
.sym-pop {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.12); z-index: 10; max-height: 280px; overflow: auto;
}
.sym-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; cursor: pointer; font-size: 13px; font-weight: 400;
}
.sym-row:hover { background: var(--surface2); }
.sym-row + .sym-row { border-top: 1px solid var(--border); }
.sym-opt-sym { font-weight: 600; }
.sym-opt-name { font-size: 12px; font-weight: 400; color: var(--fg-dim); }
.sym-opt-right { text-align: right; }
.sym-opt-px { font-weight: 600; }
.sym-opt-chg { font-size: 12px; }

.side-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.side-btn {
  padding: 12px; min-height: 44px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; font-weight: 600; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.side-btn.buy.active { background: rgba(22,163,74,0.12); color: var(--up); border-color: var(--up); }
.side-btn.sell.active { background: rgba(220,38,38,0.10); color: var(--dn); border-color: var(--dn); }

.seg { display: inline-flex; background: var(--surface2); border-radius: 8px; padding: 4px; gap: 4px; }
.seg-btn {
  flex: 1; padding: 8px 12px; min-height: 36px; background: transparent; border: 0; border-radius: 8px;
  font-size: 12px; font-weight: 600; color: var(--fg-dim); cursor: pointer; transition: all .15s;
}
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.quote-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.quote-empty {
  background: var(--surface2); border: 1px dashed var(--border); border-radius: 10px;
  padding: 40px 16px; text-align: center; color: var(--fg-mute); font-size: 13px; font-weight: 400;
}
.row-between { display: flex; justify-content: space-between; align-items: flex-start; }
.quote-lab, .qm-l { font-size: 12px; font-weight: 600; letter-spacing: 0; color: var(--fg-mute); }
/* U-18:報價卡最新價降為 Heading,不與 step 1 的 Display 焦點競爭 */
.quote-last { font-size: 16px; font-weight: 600; line-height: 1.35; margin-top: 4px; }
.quote-chg-wrap { text-align: right; }
.quote-chg { font-weight: 600; }
.quote-chg-pct { font-size: 12px; }
.quote-chart {
  height: 96px; margin: 16px 0 8px;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: 8px;
  color: var(--fg-mute); font-size: 12px; font-weight: 400;
}
.quote-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.qm-v { font-size: 12px; margin-top: 4px; }

.summary { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
.sum-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 400; padding: 4px 0; }
.sum-row.dim { color: var(--fg-dim); font-size: 12px; }
.sum-strong { font-weight: 600; }
.form-error {
  margin-top: 12px; padding: 8px 12px; border-radius: 8px;
  background: rgba(220,38,38,0.10); color: var(--dn);
  font-size: 12px; font-weight: 600;
}

/* Review */
.review { padding: 32px; text-align: center; }
.big-side { font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: 0; margin-bottom: 24px; }
.big-side.buy { color: var(--up); }
.big-side.sell { color: var(--dn); }
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
.rev-grid > div.highlight { background: var(--surface2); font-size: 13px; }
.rev-grid > div.highlight b { font-size: 16px; }
.rev-grid > div.dim { color: var(--fg-dim); }
.rev-grid > div + div { border-top: 1px solid var(--border); }
.irreversible {
  margin: 16px 0 0; font-size: 12px; font-weight: 400; line-height: 1.35;
  color: var(--fg-dim); text-align: left;
}
.submitting-note { margin: 8px 0 0; font-size: 12px; font-weight: 600; color: var(--fg-dim); }

/* Result */
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
/* 交易編號 / 時間戳是除錯回報用途:一律完整顯示,不截斷(§Typography) */
.trade-id { font-weight: 600; overflow-wrap: anywhere; }

/* Footer */
.ft {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 16px 24px; border-top: 1px solid var(--border); background: var(--surface2);
}
.btn-accent {
  background: var(--accent); color: #fff; border: 0; padding: 8px 24px; min-height: 44px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.btn-accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.btn-accent:disabled { opacity: .4; cursor: not-allowed; }
.btn-accent.buy { background: var(--up); }
.btn-accent.sell { background: var(--dn); }
.btn-ghost {
  background: transparent; border: 1px solid var(--border); color: var(--fg);
  padding: 8px 16px; min-height: 36px; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-ghost:hover:not(:disabled) { background: var(--surface); }
.btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .mask, .ticket, .check { animation: none; }
}
</style>
