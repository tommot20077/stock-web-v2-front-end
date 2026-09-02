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
                :aria-expanded="symPopoverOpen ? 'true' : 'false'"
                :aria-activedescendant="activeOptionId"
                :aria-invalid="invalidAttr('symbol')"
                :aria-describedby="describedBy('symbol')"
                :placeholder="t(lang, 'selectSymbol')"
                :disabled="submitting"
                @focus="onSymFocus"
                @input="onSymInput"
                @keydown="onSymKeydown"
              />
              <!--
                欄位級錯誤節點**不加 `role="alert"`**:六個欄位同時出錯會連續朗讀六次。
                語意由 `aria-describedby` 在聚焦時承擔(§Accessibility Contract)。
              -->
              <p
                v-if="fieldErrorText('symbol')"
                :id="fieldErrorId('symbol')"
                class="field-error"
                data-testid="ticket-field-error-symbol"
              >{{ fieldErrorText('symbol') }}</p>
              <div v-if="selected" class="sym-meta">
                <span class="sym-tag">{{ selected.assetType }}</span>
                <span class="sym-name">{{ selected.name }}</span>
              </div>

              <!--
                七態下拉(§Interaction Contract 2)。狀態機形狀複製 Positions.vue:336-368
                的 per-block 四態,模板不做型別窄化 —— 一律先投影成 computed。
                **這一區的任何狀態都不得阻擋 ticket 的其他欄位**(錯誤只屬於這個區塊)。
              -->
              <div v-if="symPopoverOpen" class="sym-pop">
                <div v-if="symbolLoading" class="block-state" data-testid="ticket-symbol-loading">
                  <!-- Loading 一律有可讀文字,不得只有 spinner(§Interaction Contract 2) -->
                  <div>{{ t(lang, 'loading') }}</div>
                  <div v-for="i in 3" :key="i" class="skeleton-row" />
                </div>
                <div v-else-if="symbolError" class="block-error" data-testid="ticket-symbol-error">
                  <div>{{ t(lang, 'symbolSearchFailed') }}</div>
                  <!-- T-04-09:只露 code 與 traceId,不顯示後端 message -->
                  <div class="details">
                    <span data-testid="ticket-symbol-error-code">{{ symbolError.code }}</span>
                    <span v-if="symbolError.traceId" data-testid="ticket-symbol-trace-id">
                      {{ t(lang, 'authRequestId') }} {{ symbolError.traceId }}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="block-retry"
                    data-testid="ticket-symbol-retry"
                    @click="retrySymbolSearch"
                  >{{ t(lang, 'authRetry') }}</button>
                </div>
                <template v-else>
                  <div
                    v-if="visibleOptions.length"
                    id="trade-symbol-options"
                    class="sym-list"
                    role="listbox"
                    data-testid="ticket-symbol-options"
                  >
                    <div
                      v-for="(asset, index) in visibleOptions"
                      :id="`trade-symbol-option-${index}`"
                      :key="asset.uuid"
                      :class="['sym-row', { active: index === activeIndex }]"
                      role="option"
                      :aria-selected="asset.symbol === selected?.symbol ? 'true' : 'false'"
                      :data-testid="`ticket-symbol-option-${asset.symbol}`"
                      @mousedown.prevent="pickAsset(asset)"
                    >
                      <div>
                        <div class="sym-opt-sym">{{ asset.symbol }}</div>
                        <div class="sym-opt-name">{{ asset.name }}</div>
                      </div>
                      <div class="num sym-opt-right">
                        <div class="sym-opt-px">{{ numOrDash(asset.latestPrice) }}</div>
                        <div class="sym-opt-chg" :style="{ color: changeColor(asset.changePercent) }">
                          {{ pctOrDash(asset.changePercent) }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- U-10:有結果但全部不可交易,必須與「查無結果」分開,否則使用者以為打錯字 -->
                  <div
                    v-else-if="symbolNoTradable"
                    class="block-state"
                    data-testid="ticket-symbol-no-tradable"
                  >{{ t(lang, 'symbolNoTradable') }}</div>
                  <div
                    v-else
                    class="block-state"
                    data-testid="ticket-symbol-empty"
                  >{{ t(lang, 'symbolNoResults') }}</div>
                  <!-- U-09:不做分頁/無限捲動,只提示縮小關鍵字 -->
                  <div
                    v-if="symbolTruncated"
                    class="sym-truncated"
                    data-testid="ticket-symbol-truncated"
                  >{{ t(lang, 'symbolMoreResults') }}</div>
                </template>
              </div>
            </div>

            <label class="lab" for="trade-side-buy">{{ t(lang, 'side') }}</label>
            <div class="side-toggle">
              <button
                id="trade-side-buy"
                type="button"
                data-testid="ticket-side-buy"
                :class="['side-btn', 'buy', { active: side === 'BUY' }]"
                :disabled="submitting"
                @click="side = 'BUY'"
              >
                <span aria-hidden="true">↗</span> {{ t(lang, 'buy') }}
              </button>
              <button
                type="button"
                data-testid="ticket-side-sell"
                :class="['side-btn', 'sell', { active: side === 'SELL' }]"
                :disabled="submitting"
                @click="side = 'SELL'"
              >
                <span aria-hidden="true">↘</span> {{ t(lang, 'sell') }}
              </button>
            </div>
            <p
              v-if="fieldErrorText('type')"
              :id="fieldErrorId('type')"
              class="field-error"
              data-testid="ticket-field-error-type"
            >{{ fieldErrorText('type') }}</p>

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
                  :aria-invalid="invalidAttr('quantity')"
                  :aria-describedby="describedBy('quantity')"
                  :disabled="submitting"
                />
                <p
                  v-if="fieldErrorText('quantity')"
                  :id="fieldErrorId('quantity')"
                  class="field-error"
                  data-testid="ticket-field-error-quantity"
                >{{ fieldErrorText('quantity') }}</p>
                <!--
                  D-15:可賣數量三態。失敗**不阻擋送出** —— 後端仍是權威。
                  只讀 `symbol` 與 `totalQuantity`,不碰任何損益欄位(Phase 3 D-04)。
                -->
                <template v-if="side === 'SELL'">
                  <p
                    v-if="holdingsLoading"
                    class="hint"
                    data-testid="ticket-sellable-loading"
                  >{{ t(lang, 'sellableQtyLoading') }}</p>
                  <p
                    v-else-if="holdingsFailed"
                    class="hint"
                    data-testid="ticket-sellable-failed"
                  >{{ t(lang, 'sellableQtyFailed') }}</p>
                  <p
                    v-else-if="sellableQty !== null"
                    class="hint num"
                    data-testid="ticket-sellable-qty"
                  >{{ sellableQtyText }}</p>
                </template>
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
                  :aria-invalid="invalidAttr('price')"
                  :aria-describedby="describedBy('price')"
                  :disabled="submitting"
                />
                <p
                  v-if="fieldErrorText('price')"
                  :id="fieldErrorId('price')"
                  class="field-error"
                  data-testid="ticket-field-error-price"
                >{{ fieldErrorText('price') }}</p>
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
                  :aria-invalid="invalidAttr('fee')"
                  :aria-describedby="describedBy('fee', 'trade-fee-hint')"
                  :disabled="submitting"
                />
                <p id="trade-fee-hint" class="hint">{{ t(lang, 'tradeFeeHint') }}</p>
                <p
                  v-if="fieldErrorText('fee')"
                  :id="fieldErrorId('fee')"
                  class="field-error"
                  data-testid="ticket-field-error-fee"
                >{{ fieldErrorText('fee') }}</p>
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
                  :aria-invalid="invalidAttr('executedAt')"
                  :aria-describedby="describedBy('executedAt', 'trade-executed-at-hint')"
                  :disabled="submitting"
                />
                <p id="trade-executed-at-hint" class="hint">{{ t(lang, 'tradeExecutedAtHint') }}</p>
                <!--
                  executedAt 在後端沒有任何 Bean Validation 註解,所以**不會**出現在
                  `fields` 裡;這個節點承接的是前端自檢(未來時間)之外的意外情況。
                -->
                <p
                  v-if="fieldErrorText('executedAt')"
                  :id="fieldErrorId('executedAt')"
                  class="field-error"
                  data-testid="ticket-field-error-executedAt"
                >{{ fieldErrorText('executedAt') }}</p>
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
              :aria-invalid="invalidAttr('note')"
              :aria-describedby="describedBy('note')"
              :disabled="submitting"
            />
            <p
              v-if="fieldErrorText('note')"
              :id="fieldErrorId('note')"
              class="field-error"
              data-testid="ticket-field-error-note"
            >{{ fieldErrorText('note') }}</p>

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
            <!--
              D-16 的**例外分支**:報價卡的每一格後端都有(`AssetDto.java:9-24`),
              所以走「真實資料」而不是「隱藏」。六格全部來自**同一份** AssetDto,
              不需要第二個請求,而且**只做格式化、不做任何計算**(judgment §7 / Phase 3 D-04)。
            -->
            <div v-if="selected" class="quote-card">
              <div class="row-between">
                <div>
                  <div class="quote-lab">{{ t(lang, 'last') }}</div>
                  <div class="num quote-last" data-testid="ticket-quote-last">
                    {{ numOrDash(selected.latestPrice) }}
                  </div>
                </div>
                <div class="num quote-chg-wrap" :style="{ color: changeColor(selected.changePercent) }">
                  <div class="quote-chg" data-testid="ticket-quote-change">
                    {{ signedNumOrDash(selected.change) }}
                  </div>
                  <div class="quote-chg-pct" data-testid="ticket-quote-change-pct">
                    {{ pctOrDash(selected.changePercent) }}
                  </div>
                </div>
              </div>

              <!--
                走勢圖三態。**U-11 硬規則**:任何一態都不得阻擋送出 —— 它是輔助資訊,
                不是交易前提。error 態的高度不鎖死(診斷列 + 重試鈕放不進 96px),
                但以 min-height 保住同樣的版位下限。
              -->
              <div v-if="chartError" class="chart-error block-error" data-testid="ticket-quote-chart-error">
                <div>{{ t(lang, 'quoteChartError') }}</div>
                <div class="details">
                  <span data-testid="ticket-quote-chart-error-code">{{ chartError.code }}</span>
                  <span v-if="chartError.traceId" data-testid="ticket-quote-chart-trace-id">
                    {{ t(lang, 'authRequestId') }} {{ chartError.traceId }}
                  </span>
                </div>
                <button
                  type="button"
                  class="block-retry"
                  data-testid="ticket-quote-chart-retry"
                  @click="retryKlines"
                >{{ t(lang, 'authRetry') }}</button>
              </div>
              <div v-else :class="['quote-chart', { plot: chartSeries.length > 0 }]">
                <div v-if="chartLoading" class="chart-loading" data-testid="ticket-quote-chart-loading">
                  <div>{{ t(lang, 'loading') }}</div>
                  <div class="skeleton-row" />
                </div>
                <!-- market_prices 需要 backfill 過才有資料,dev/demo 環境的空序列是常態 -->
                <div
                  v-else-if="!chartSeries.length"
                  data-testid="ticket-quote-chart-empty"
                >{{ t(lang, 'quoteChartEmpty') }}</div>
                <LineChart
                  v-else
                  :data="chartSeries"
                  :h="96"
                  color="var(--accent)"
                  fill="var(--accent)"
                />
              </div>

              <div class="quote-meta">
                <div>
                  <div class="qm-l">{{ t(lang, 'dayRange') }}</div>
                  <div class="num qm-v" data-testid="ticket-quote-range">
                    {{ numOrDash(selected.low) }} – {{ numOrDash(selected.high) }}
                  </div>
                </div>
                <div>
                  <div class="qm-l">{{ t(lang, 'volume') }}</div>
                  <!--
                    volumeText 後端就是已格式化的 String,前端不得重算。
                    `AssetRepository:29` 是 `left join asset_latest_prices` ——
                    沒有行情列時 `rs.getString("volume_text")` 會是 null(型別宣告為 string
                    只是還沒對齊),所以這裡與其他五格一樣要落到 `—` 而不是空白。
                  -->
                  <div class="num qm-v" data-testid="ticket-quote-volume">
                    {{ selected.volumeText || '—' }}
                  </div>
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
          <!--
            鐵律 6:review 步驟沒有輸入框,但 canSubmit 仍可能在這裡翻成 false
            (SELL 的 holdings 晚於「確認內容」才落地)。錯誤必須在這一步就看得到,
            不得讓「記錄交易」按下去零回饋。
          -->
          <div
            v-if="validationError"
            class="form-error"
            role="alert"
            data-testid="ticket-review-error"
          >{{ validationError }}</div>
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
            <div>
              <span>{{ t(lang, 'qty') }}</span>
              <b class="num" data-testid="ticket-result-qty">{{ recorded?.quantity }}</b>
            </div>
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

        <!--
          §7 版位表:依 `error.code` 分派的錯誤一律落在 **ticket 底部的單一區域**
          (`role="alert"` —— 一次只有一條,適合立即播報)。
          有 `error.fields` 時改走欄位級呈現,底部不重複顯示同一件事。
          診斷列是常駐低調單列(U-07:不用 `<details>`、不加複製按鈕),
          只露 `code` 與 traceId,**絕不露後端 `message`**(Phase 3 D-12 / T-04-09)。
        -->
        <div
          v-if="submitError && !submitError.fields"
          class="form-error submit-error"
          role="alert"
          data-testid="ticket-error"
        >
          <div>{{ submitErrorMessage }}</div>
          <div class="details">
            <span data-testid="ticket-error-code">{{ submitError.code }}</span>
            <!-- 非 ApiClientError 時 traceId 為 null → 整格不渲染(不顯示 `null`) -->
            <span v-if="submitError.traceId" data-testid="ticket-error-trace-id">
              {{ t(lang, 'authRequestId') }} {{ submitError.traceId }}
            </span>
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
              :class="['btn-accent', 'btn-submit', side.toLowerCase()]"
              data-testid="ticket-submit"
              :disabled="submitting || !canSubmit"
              @click="submitTrade"
            >{{ submitting ? t(lang, 'recordingTrade') : t(lang, 'recordTrade') }}</button>
          </template>
          <template v-else>
            <button
              type="button"
              class="btn-ghost"
              data-testid="ticket-record-another"
              @click="recordAnother"
            >{{ t(lang, 'recordAnother') }}</button>
            <button type="button" class="btn-accent" @click="goPositions">{{ t(lang, 'viewPositions') }} →</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { t } from '../i18n';
// 只取格式化純函式(`data.ts:91,98`,純 toLocaleString / toFixed,不觸及任何資料集);
// 標的、報價與走勢資料一律經 market adapter,本檔對本地假資料集與序列產生器零引用。
import { fmtNum, fmtPct } from '../data';
import LineChart from './LineChart.vue';
import { ApiClientError } from '../services/apiClient';
// closeSeries 是 KlineDto.close(JSON string)→ number[] 的**唯一**轉換點(04-06 已單測鎖住)。
// 不得在本檔自己寫 Number() —— 那正是 vue-tsc 在模板內抓不到的 Pitfall 8。
import { closeSeries } from '../services/marketApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import {
  clearLastCreatedTrade,
  clearLastFill,
  notifyTradeCreated,
  portfolioRevision,
} from '../services/portfolioRevision';
import { toLocalInputValue, toLocalIso } from '../services/localTime';
import type { AssetDto, HoldingDto, KlineDto, PaginatedResponse, TradeDto } from '../services/apiTypes';
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

// =================== D-14:idempotency key 的生命週期 ===================
// 兩條規則就蓋完所有情境:
//   1. key 在「按下送出」那一刻產生;同一次嘗試的重試(手動或 401 replay)沿用同一把。
//   2. 使用者改過**任何**欄位 → 下次送出換新 key(改過欄位 = 新意圖)。
//
// **這兩條刻意避開與 D-07 的互鎖**:若採「一張 ticket 一把 key」,驗證失敗(400)後
// 使用者改數量再送就會吃 409 `TRADE_IDEMPOTENCY_KEY_REUSED`,卡死且不知道要關掉
// ticket 才能繼續。這是設計時發現的實際問題,不是理論風險。
//
// **T-04-03:`currentKey` 絕不得綁進任何模板節點** —— UI 顯示 key 只會邀請使用者手動改動。
const currentKey = ref<string | null>(null);
/**
 * DP-11:**不做 form 物件深比較**。「改了又改回原值」在使用者心智模型裡是「我動過了」,
 * 他期待新 key;深比較會讓他拿到舊 key 而吃 409。
 */
const dirtySinceSubmit = ref(false);

/** T-04-09:診斷只露 `code` 與 `traceId`,絕不顯示後端 `message`。 */
interface SubmitError {
  code: string;
  traceId: string | null;
  /** 後端 `error.fields`。**只用 key 判斷哪個欄位錯了,value(英文 Bean Validation 訊息)絕不入 DOM。** */
  fields: Record<string, string> | null;
  status: number;
}

const submitError = ref<SubmitError | null>(null);

// =================== symbol typeahead 的 per-block 狀態機(D-01 / UI-SPEC §2) ===================
// 形狀複製 `Positions.vue:336-368`(Phase 3 D-11 的 per-block 四態),多一個 `idle`:
// ticket 尚未查過任何一次時下拉不該存在。

/** T-04-09:診斷只露 code 與 traceId,絕不顯示後端 message。 */
interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

/** typeahead 下拉最多 10 筆(§2:後端 `size` 上限 100)。 */
const SEARCH_SIZE = 10;
/** idle(聚焦未輸入)只列前 6 筆 —— 對齊既有慣例,且不宣稱任何排序語意。 */
const IDLE_LIMIT = 6;
/** §Interaction Contract 2 明定 250ms。自行以 setTimeout/clearTimeout 實作,不引入任何套件。 */
const SEARCH_DEBOUNCE_MS = 250;

const symbolState = ref<BlockState<PaginatedResponse<AssetDto>>>({ status: 'idle' });
/** 目前畫面上這份結果對應的查詢字串(空字串 = idle 列表)。 */
const activeQuery = ref('');
const activeIndex = ref(-1);

function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const symbolLoading = computed(() => symbolState.value.status === 'loading');
const symbolError = computed(() => (symbolState.value.status === 'error' ? symbolState.value.error : null));
const symbolPage = computed(() => (symbolState.value.status === 'loaded' ? symbolState.value.data : null));

// D-01:唯一允許的本地過濾 —— 只列可交易標的。**不得**再做任何關鍵字過濾:
// 後端已依 query 篩選,前端重做等於複製後端邏輯。
const options = computed<AssetDto[]>(() => (symbolPage.value?.items ?? []).filter(asset => asset.tradeable));
const visibleOptions = computed(() => (
  activeQuery.value === '' ? options.value.slice(0, IDLE_LIMIT) : options.value
));

/** loaded 的兩個推導子態。 */
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
  activeIndex.value >= 0 && activeIndex.value < visibleOptions.value.length
    ? `trade-symbol-option-${activeIndex.value}`
    : undefined
));

/** `AssetDto` 的價格欄位可為 null;顯示 `—` 而不是 NaN,也不得被當成 0。 */
function numOrDash(value: number | null | undefined): string {
  return value == null ? '—' : fmtNum(value);
}

function pctOrDash(value: number | null | undefined): string {
  return value == null ? '—' : fmtPct(value);
}

/** 漲跌值:正數補 `+`(負號由 fmtNum 自帶)。同樣只格式化,不重算。 */
function signedNumOrDash(value: number | null | undefined): string {
  return value == null ? '—' : `${value >= 0 ? '+' : ''}${fmtNum(value)}`;
}

function changeColor(value: number | null | undefined): string {
  if (value == null) return 'var(--fg-mute)';
  return value >= 0 ? 'var(--up)' : 'var(--dn)';
}

// ---- debounce + 「只採最後一次結果」(DP-12 / T-04-11) ----
// 兩件事都必須做:debounce 壓請求量,遞增 request id 壓亂序返回。
// 慢網路下 `AAP` 的回應覆蓋 `AAPL` 的是使用者可見的正確性錯誤,單靠 debounce 擋不住。
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;
let searchController: AbortController | null = null;

function cancelPendingSearch() {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

/**
 * @param closeOnExact 只有 preset 解析會帶 true(解析成功即關閉下拉);
 *                     使用者打字時的精準命中**不關閉**下拉,否則他還沒看清楚候選就被收走。
 */
async function runSymbolSearch(query: string, closeOnExact = false) {
  cancelPendingSearch();
  const seq = ++searchSeq;
  activeQuery.value = query;
  activeIndex.value = -1;
  symbolState.value = { status: 'loading' };
  // 取消上一個仍在飛的請求(T-04-11:對公開端點的好公民行為)。
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  try {
    const page = await apiClients().market.searchAssets(
      { query, page: 0, size: SEARCH_SIZE },
      controller.signal,
    );
    // 不是最後一次請求就整包丟棄。
    if (seq !== searchSeq) return;
    symbolState.value = { status: 'loaded', data: page };
    const exact = page.items.find(
      asset => asset.tradeable && asset.symbol.toUpperCase() === query.toUpperCase(),
    );
    if (exact) pickAsset(exact, { close: closeOnExact });
  } catch (error) {
    // 已被新查詢取代的請求一律不寫回狀態 —— 這同時吃掉 AbortController 造成的
    // `DOMException`(abort 讓 fetch reject,但那是「已取消」不是「錯誤」,不得顯示錯誤態)。
    if (seq !== searchSeq) return;
    symbolState.value = { status: 'error', error: describeError(error) };
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

onBeforeUnmount(() => {
  cancelPendingSearch();
  searchController?.abort();
});

// =================== 走勢圖的 per-block 狀態機(D-01 / UI-SPEC §Interaction Contract 3) ===================
// 資料來自 `GET /api/v1/market/{symbol}/klines` —— 前端第一個消費該端點的地方。

/**
 * 48 小時 × `1h` = 48 點,密度與骨架階段的假序列相當。
 * ⚠️ 這組參數是 `04-RESEARCH.md` A8 的 **[ASSUMED]** 建議值,不是既有慣例;
 * 若實際資料密度不合適可調整,不需要視為契約。
 */
const KLINE_WINDOW_MS = 48 * 60 * 60 * 1000;

const klineState = ref<BlockState<KlineDto[]>>({ status: 'idle' });
const chartLoading = computed(() => klineState.value.status === 'loading');
const chartError = computed(() => (klineState.value.status === 'error' ? klineState.value.error : null));
const chartSeries = computed(() => (
  klineState.value.status === 'loaded' ? closeSeries(klineState.value.data) : []
));

let klineSeq = 0;

async function loadKlines(symbol: string) {
  const seq = ++klineSeq;
  klineState.value = { status: 'loading' };
  try {
    // 後端 `from` 是 `@RequestParam Instant`,必須是完整 ISO instant ——
    // 格式錯在 develop 上會回 **500** 而不是 400。
    const from = new Date(Date.now() - KLINE_WINDOW_MS).toISOString();
    // symbol 直接用 AssetDto.symbol(後端原值),**不得 toUpperCase()**:
    // `MarketController` javadoc 明文大小寫敏感(encodeURIComponent 已在 adapter 內處理)。
    const klines = await apiClients().market.listKlines(symbol, {
      interval: '1h',
      from,
      limit: 48,
    });
    if (seq !== klineSeq) return;
    klineState.value = { status: 'loaded', data: klines };
  } catch (error) {
    if (seq !== klineSeq) return;
    klineState.value = { status: 'error', error: describeError(error) };
  }
}

function retryKlines() {
  if (selected.value) void loadKlines(selected.value.symbol);
}

watch(() => selected.value?.symbol, (symbol) => {
  if (!symbol) {
    klineSeq += 1;
    klineState.value = { status: 'idle' };
    return;
  }
  void loadKlines(symbol);
});

const qtyStep = computed(() => (selected.value?.assetType === 'CRYPTO' ? 0.01 : 1));
const estTotal = computed(() => qty.value * px.value);
// mock mode 專屬的展示值(D-04:API mode 不渲染,後端沒有帳戶餘額模型)。
const cashAfter = computed(() => 124_580 - (side.value === 'BUY'
  ? estTotal.value + fee.value
  : -(estTotal.value - fee.value)));

const selectedMatchesQuery = computed(() =>
  !!selected.value && symQuery.value.trim().toUpperCase() === selected.value.symbol.toUpperCase()
);

// =================== D-15:SELL 預檢(可賣數量) ===================
// **預檢只是 UX,不是防護**(judgment §5)。後端 409 `TRADE_INSUFFICIENT_HOLDING`
// 永遠是最終權威 —— 另一個分頁剛賣掉的併發情境,前端不可能知道。
//
// **只讀 `symbol` 與 `totalQuantity` 兩個欄位。** `HoldingDto` 其餘的成本、市值、
// 已實現/未實現損益與報酬率欄位**一律不得使用** —— 用它們算「賣出後的損益預估」
// 會踩 Phase 3 D-04 與 judgment §7(前端絕不重算成本或損益)。
//
// 本段刻意不寫出那些欄位的**字面名稱**,好讓「沒有引用」可被 `?raw` 機械驗證
// (04-07 Deviation #2 的教訓:註解會被字面檢查與編譯器一併讀到)。

type HoldingsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: HoldingDto[] }
  | { status: 'error' };

const holdingsState = ref<HoldingsState>({ status: 'idle' });
let holdingsSeq = 0;

async function loadSellableHoldings() {
  const seq = ++holdingsSeq;
  holdingsState.value = { status: 'loading' };
  try {
    const holdings = await apiClients().portfolio.listHoldings();
    if (seq !== holdingsSeq) return;
    holdingsState.value = { status: 'loaded', data: holdings };
  } catch {
    // 讀不到持倉**不阻擋送出** —— 後端仍會檢查(§Interaction Contract 4)。
    if (seq !== holdingsSeq) return;
    holdingsState.value = { status: 'error' };
  }
}

// Q9.2 的取捨:只有 SELL 需要;一次拿全部,之後換 symbol 不必再打
// (`HoldingDto[]` 對單一使用者是小陣列)。
watch(side, (value) => {
  if (value !== 'SELL') return;
  if (holdingsState.value.status !== 'idle') return;
  void loadSellableHoldings();
});

// 交易成功會改變持倉,快取必須跟著失效(§Interaction Contract 4 末段)。
// 只設回 idle 不主動重讀 —— 使用者可能已經在 result 畫面,那時發請求沒有消費者。
watch(portfolioRevision, () => {
  holdingsSeq += 1;
  holdingsState.value = { status: 'idle' };
});

const holdingsLoading = computed(() => holdingsState.value.status === 'loading');
const holdingsFailed = computed(() => holdingsState.value.status === 'error');

/** `null` = 還不知道(未載入 / 失敗 / 未選標的);`0` = 確定可賣 0。 */
const sellableQty = computed<number | null>(() => {
  const state = holdingsState.value;
  if (state.status !== 'loaded' || !selected.value) return null;
  const match = state.data.find(item => item.symbol === selected.value!.symbol);
  return match ? match.totalQuantity : 0;
});

/**
 * 零持倉一律顯示「可賣數量:0」,**不得**寫成「您未持有此標的」——
 * 後端 SQL 有 `total_quantity > 0` 過濾(`JdbcTradingRepository.java:210`),
 * 「從未持有」與「已全數賣出」在回應裡根本不可分,宣稱前者是在編造事實。
 */
const sellableQtyText = computed(() => {
  const separator = props.lang === 'zh' ? ':' : ': ';
  return `${t(props.lang, 'sellableQty')}${separator}${sellableQty.value ?? 0}`;
});

const oversellError = computed(() => {
  if (side.value !== 'SELL' || sellableQty.value === null || qty.value <= 0) return '';
  return qty.value > sellableQty.value ? t(props.lang, 'tradeErrOversell') : '';
});

/**
 * mock mode 專屬的同步預檢(mock adapter 的 reactive 視窗)。API mode 走上方的
 * `oversellError`;後端 409 `TRADE_INSUFFICIENT_HOLDING` 在兩個 mode 都是最終權威。
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
  orderError.value || sellPrecheckError.value || oversellError.value
  || executedAtError.value || feeError.value
);

// =================== D-16:錯誤分派 ===================

/**
 * 底部錯誤的文案對照表(`04-UI-SPEC.md` §Copywriting Contract 是權威來源)。
 *
 * **依 `error.code` 分派,絕不假設錯誤出現的順序。** PR #15 會把「type 打錯 +
 * symbol 不存在」的優先序從 `ASSET_NOT_FOUND` 改回 `TRADE_UNSUPPORTED_TYPE`;
 * 任何「第一個錯誤一定是 X」的假設都會在那天靜默壞掉。
 *
 * `NETWORK_ERROR` 是前端合成的診斷碼(後端不會回這個值),讓「連不上伺服器」
 * 與「後端回了一個我不認識的 code」可以明確區分 —— 前者的文案是唯一
 * 敢說「結果未知但重試不會建立重複交易」的那一條。
 */
const SUBMIT_ERROR_COPY: Record<string, string> = {
  TRADE_INSUFFICIENT_HOLDING: 'tradeErrOversell',
  ASSET_NOT_FOUND: 'tradeErrAssetNotFound',
  TRADE_UNSUPPORTED_TYPE: 'tradeErrValidation',
  TRADE_INVALID_QUANTITY: 'tradeErrValidation',
  TRADE_INVALID_PRICE: 'tradeErrValidation',
  VALIDATION_FAILED: 'tradeErrValidation',
  TRADE_CONFLICT: 'tradeErrConflict',
  TRADE_IDEMPOTENCY_KEY_REUSED: 'tradeErrKeyReused',
  // U-08(刻意覆寫 `02-UI-SPEC.md:144`):app 啟動時的 CSRF bootstrap 失敗 → 全域 banner;
  // 單一 unsafe 請求被 CSRF 拒絕 → 該請求的發起處,也就是這裡。
  AUTH_CSRF_TOKEN_INVALID: 'tradeErrCsrf',
  AUTH_CSRF_TOKEN_MISSING: 'tradeErrCsrf',
  ACCESS_DENIED: 'tradeErrForbidden',
  FORBIDDEN: 'tradeErrForbidden',
  NETWORK_ERROR: 'tradeErrNetwork',
};

const submitErrorMessage = computed(() => {
  const error = submitError.value;
  if (!error) return '';
  const key = SUBMIT_ERROR_COPY[error.code]
    ?? (error.status === 403 ? 'tradeErrForbidden' : 'tradeErrUnknown');
  return t(props.lang, key);
});

/**
 * `fields` 的 key → 前端自己的 i18n 文案。
 * **只用 key 判斷「哪個欄位錯了」** —— value 是 Bean Validation 的英文預設訊息,
 * 既是使用者看不懂的內部細節,也會隨後端版本漂移(D-16 明文禁止直接顯示)。
 */
const FIELD_ERROR_COPY: Record<string, string> = {
  symbol: 'tradeErrSymbol',
  type: 'tradeErrType',
  quantity: 'tradeErrQuantity',
  price: 'tradeErrPrice',
  fee: 'tradeErrFee',
  note: 'tradeErrNote',
  executedAt: 'tradeErrExecutedAt',
};

const fieldErrorKeys = computed(() => Object.keys(submitError.value?.fields ?? {}));

function fieldErrorId(field: string): string {
  return `trade-${field}-error`;
}

function fieldErrorText(field: string): string {
  if (!fieldErrorKeys.value.includes(field)) return '';
  const key = FIELD_ERROR_COPY[field];
  return key ? t(props.lang, key) : '';
}

/** 多個 id 以空白分隔;沒有任何關聯節點時回 undefined(不渲染空屬性)。 */
function describedBy(field: string, ...hintIds: string[]): string | undefined {
  const ids = [...hintIds];
  if (fieldErrorText(field)) ids.push(fieldErrorId(field));
  return ids.length ? ids.join(' ') : undefined;
}

function invalidAttr(field: string): 'true' | undefined {
  return fieldErrorText(field) ? 'true' : undefined;
}

/**
 * **U-11 硬規則:這個 computed 不得引用 klines / 走勢圖的任何狀態。**
 * 走勢圖是輔助資訊,不是交易前提 —— 行情圖掛掉不該讓使用者記不了已經成交的交易。
 * 若未來有人「順手」把 chartLoading / chartError 加進來,Test 20 會立刻紅。
 */
const canSubmit = computed(() =>
  !!selected.value
  && selectedMatchesQuery.value
  && qty.value > 0
  && px.value > 0
  && !validationError.value
);

function pickAsset(asset: AssetDto, { close = true }: { close?: boolean } = {}) {
  orderError.value = '';
  selected.value = asset;
  symQuery.value = asset.symbol;
  if (close) {
    symOpen.value = false;
    activeIndex.value = -1;
    cancelPendingSearch();
  }
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
  // 關閉並重開 ticket = 全新的意圖,key 一律重置(D-14)。
  currentKey.value = null;
  dirtySinceSubmit.value = false;
  submitError.value = null;
  const now = new Date();
  maxExecutedAt.value = toLocalInputValue(now);
  executedAt.value = maxExecutedAt.value;
  cancelPendingSearch();
  searchController?.abort();
  symbolState.value = { status: 'idle' };
  activeQuery.value = '';
  activeIndex.value = -1;
  klineSeq += 1;
  klineState.value = { status: 'idle' };
  clearSelection();
}

function onSymFocus() {
  symOpen.value = true;
  // 關掉下拉之後又回到欄位時補一次查詢,讓 idle 列表重新出現。
  if (symbolState.value.status === 'idle') void runSymbolSearch(symQuery.value.trim());
}

function onSymInput() {
  symOpen.value = true;
  orderError.value = '';
  const query = symQuery.value.trim();
  if (!selected.value || query.toUpperCase() !== selected.value.symbol.toUpperCase()) {
    clearSelection(true);
    symOpen.value = true;
  }
  scheduleSymbolSearch(query);
}

/** §Accessibility Contract:combobox 必須可完全用鍵盤操作 —— 現況只綁 @mousedown。 */
function onSymKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
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
    const asset = rows[activeIndex.value];
    if (!asset) return;
    event.preventDefault();
    pickAsset(asset);
  }
}

watch(() => props.open, async (open) => {
  if (!open) return;
  apiClients();
  resetTicket();
  // UI-SPEC §9 / D-11:再次開啟 ticket = 上一筆的「新」標記與「不在檢視範圍」提示都到此為止。
  clearLastFill();
  clearLastCreatedTrade();
  const preset = props.preset;
  if (preset?.side) side.value = preset.side;
  // 先開下拉再送查詢:preset 解析中必須看得到 loading 態,不得靜默留空(§2)。
  symOpen.value = true;
  void runSymbolSearch(preset?.sym ?? '', true);
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
  symOpen.value = true;
  void runSymbolSearch('');
  await nextTick();
  symInput.value?.focus();
}

function goPositions() {
  emit('navigate', 'positions');
  resetTicket();
  emit('close');
}

/**
 * D-14 / T-04-10:key 在「按下送出」時產生,且必須是 CSPRNG。
 * `crypto.randomUUID()` 是 Web Crypto 的 CSPRNG;**絕不得**改用非密碼學的偽亂數 ——
 * 碰撞會讓別人的交易被當成你的重試回傳(`(user_id, key)` 的 user_id 維度把影響
 * 限縮在同一使用者內,但那是縱深防禦,不是可以放寬隨機來源的理由)。
 *
 * 規則:沒有 key、或使用者自上次送出後動過任何欄位 → 換新的;否則沿用。
 */
function ensureIdempotencyKey(): string {
  if (currentKey.value === null || dirtySinceSubmit.value) {
    currentKey.value = crypto.randomUUID();
  }
  dirtySinceSubmit.value = false;
  return currentKey.value;
}

/**
 * 任何欄位變動都會讓下一次送出換新 key,並清掉上一次的送出錯誤。
 * `flush: 'sync'` 是刻意的:使用者改完欄位可能**立刻**按送出,
 * 預設的 pre-flush 會讓那一次仍沿用舊 key。
 */
watch(
  () => [
    selected.value?.symbol,
    side.value,
    qty.value,
    px.value,
    fee.value,
    note.value,
    executedAt.value,
  ],
  () => {
    dirtySinceSubmit.value = true;
    submitError.value = null;
  },
  { flush: 'sync' },
);

async function submitTrade() {
  if (submitting.value) return;
  orderError.value = '';
  submitError.value = null;
  if (!selected.value || !canSubmit.value) {
    // 正常路徑到不了這裡(送出鈕已 disabled);程式化觸發時退回 ticket,讓欄位級錯誤可見,不得靜默。
    step.value = 'ticket';
    return;
  }
  submitting.value = true;
  const idempotencyKey = ensureIdempotencyKey();
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
    }, idempotencyKey);
    recorded.value = trade;
    // U-03:冪等命中(同一把 key 拿回既有交易)與首次建立**完全同一條路徑**。
    // 目前的 API 契約沒有任何 replay 訊號,所以不做「這筆已存在」的變體;
    // 而 notifyTradeCreated 在 replay 時**也要呼叫** —— 重讀同一份資料無害,
    // 少做會讓「網路失敗後重試成功」的使用者看不到 portfolio 更新(§6 連帶契約)。
    notifyTradeCreated(trade);
    // 下一筆是新意圖,key 不得沿用。
    currentKey.value = null;
    dirtySinceSubmit.value = false;
    step.value = 'result';
    emit('toast', `${t(props.lang, 'tradeRecordedToast')} ${trade.type} ${trade.quantity} ${trade.symbol} @ ${fmtNum(trade.price)}`);
    await nextTick();
    resultTitle.value?.focus();
  } catch (error) {
    handleSubmitFailure(error);
  } finally {
    submitting.value = false;
  }
}

/**
 * 送出失敗的統一落點。
 *
 * **key 的處置(U-04 對照表):預設一律保留** —— 「這次沒寫入,但意圖沒變」,
 * 沿用同一把重送是安全且正確的(這正是文案敢寫「不會建立重複交易」的前提)。
 * `TRADE_CONFLICT`、5xx、網路失敗、`fields` 類、oversell、CSRF/403 全部走這條。
 *
 * **唯一例外是 `TRADE_IDEMPOTENCY_KEY_REUSED`:必須丟棄 key。**
 * 否則使用者照文案「確認欄位後重新送出」會用同一把 key 再吃一次 409,
 * 形成無出路的迴圈 —— 他甚至不會知道要關掉整張 ticket 才能繼續。
 */
function handleSubmitFailure(error: unknown) {
  const described: SubmitError = error instanceof ApiClientError
    ? { code: error.code, traceId: error.requestId, fields: error.fields, status: error.status }
    // 前端合成的診斷碼:後端不會回這個值,所以它與「後端回了未知 code」可明確區分。
    : { code: 'NETWORK_ERROR', traceId: null, fields: null, status: 0 };

  // 401 / refresh 失敗**不在 ticket 顯示**,走全域 SessionBanner
  // (Phase 3 D-13 / Phase 2 D-14;`apiClient.ts:315,323` 已負責升級)。
  // key 保留:登入回來後重送的是同一個意圖。
  if (described.status === 401) return;

  submitError.value = described;
  if (described.code === 'TRADE_IDEMPOTENCY_KEY_REUSED') currentKey.value = null;
  // 欄位級錯誤必須讓使用者看得到出錯的欄位,review 步驟沒有輸入框(§7 版位表)。
  if (described.fields) step.value = 'ticket';
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
  box-shadow: 0 12px 32px rgba(0,0,0,0.12); z-index: 10;
}
.sym-list { max-height: 280px; overflow: auto; }
.sym-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; cursor: pointer; font-size: 13px; font-weight: 400;
}
.sym-row:hover, .sym-row.active { background: var(--surface2); }
.sym-truncated {
  padding: 8px 16px; border-top: 1px solid var(--border);
  color: var(--fg-mute); font-size: 12px; font-weight: 400; line-height: 1.35;
}

/* 區塊級狀態:形狀沿用 Positions.vue:856-873(Phase 3 D-11/D-12 的診斷呈現慣例) */
.block-state { padding: 12px 16px; font-size: 12px; font-weight: 400; color: var(--fg-dim); }
.block-error { padding: 12px 16px; font-size: 12px; font-weight: 400; color: var(--dn); }
.block-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 8px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span { overflow-wrap: anywhere; }
.block-retry {
  margin-top: 8px; min-height: 36px; padding: 8px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--dn); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.block-retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* 骨架列固定筆數,載入呈現不隨資料量變動(Positions.vue:868-873) */
.skeleton-row {
  height: 16px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
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
/* §Layout Contract:走勢圖區固定 96px 高 */
.quote-chart {
  height: 96px; margin: 16px 0 8px;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: 8px;
  color: var(--fg-mute); font-size: 12px; font-weight: 400;
  overflow: hidden;
}
/* 真的畫得出線時不需要空狀態的虛線框 */
.quote-chart.plot { border-color: transparent; }
.chart-loading { width: 100%; padding: 0 16px; text-align: center; }
/* error 態放不進 96px(診斷列 + 重試鈕),以 min-height 保住同樣的版位下限 */
.chart-error { min-height: 96px; margin: 16px 0 8px; }
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
/* 欄位級錯誤:輸入框下方 12px --dn 文字(§7 版位表) */
.field-error {
  margin: 8px 0 0; font-size: 12px; font-weight: 600; line-height: 1.35;
  color: var(--dn); overflow-wrap: anywhere;
}
/* 底部錯誤區:ticket body 內、footer 之上,全寬(§Layout Contract) */
.submit-error { margin: 0 24px 16px; }
.submit-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 8px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px; font-weight: 400;
}
/* 320px 下 code 與 traceId 必須換行完整顯示,且可被選取複製(U-07:不做複製按鈕) */
.submit-error .details span { overflow-wrap: anywhere; user-select: text; }

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
/*
  §5 / §Responsive:`記錄交易` ↔ `記錄中…`、`Record trade` ↔ `Recording…` 的標籤切換
  不得讓按鈕縮放而造成版位跳動,所以由**最寬的那個標籤**決定下限。
  136px = 13px/600 下 `Record trade`(最寬者)約 88px + `.btn-accent` 的 48px 水平內距。
  320px 時 footer 可用寬度為 320 − 48(內距) = 272px,ghost 鈕約 118px + 12px gap
  + 136px = 266px,仍不換行。
*/
.btn-submit { min-width: 136px; }
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
