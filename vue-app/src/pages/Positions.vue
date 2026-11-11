<template>
  <div class="page grid">
    <div class="row-between" style="grid-column: span 12; align-items:center">
      <div>
        <h2>{{ t(lang, 'positions') }}</h2>
        <!-- 標題列彙總:mock 由持倉陣列加總,API mode 讀 summary 後端欄位(D-04) -->
        <div v-if="live" class="sub">${{ fmtNum(totalVal, 0) }} · {{ mockPositions.length }} {{ lang === 'zh' ? '檔' : 'holdings' }}</div>
        <div v-else-if="summary" class="sub" data-testid="positions-header-summary">
          <!-- 04.1-16:summary 是基準幣(D-05);數值與代碼拆成兩個 span(UI-SPEC §Money) -->
          <span class="num">{{ fmtMoneyAmount(summary.totalMarketValue, summary.baseCurrency, 0) }}</span><span v-if="summary.totalMarketValue != null" class="stat-ccy">{{ summary.baseCurrency }}</span>
          · {{ summary.holdingCount }} {{ lang === 'zh' ? '檔' : 'holdings' }}
        </div>
        <!-- D-04:缺匯率的持倉不計入總額,明說而不是靜默少算 -->
        <div v-if="!live && summary && summary.fxExcludedCount > 0" class="sub" data-testid="positions-fx-excluded">
          {{ tf(lang, 'fxExcludedHint', { n: summary.fxExcludedCount, base: summary.baseCurrency }) }}
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <!--
          range 選擇器與時光機都建構在 genSeries / priceAt 的合成序列之上,
          後端沒有日級歷史可推導 → API mode 隱藏(D-16)。
        -->
        <template v-if="live">
          <div class="seg">
            <button
              v-for="r in ranges"
              :key="r.id"
              :class="['seg-btn', { active: range === r.id }]"
              @click="range = r.id"
            >{{ r.label }}</button>
          </div>
          <button class="btn-tm" :class="{ on: scrubOn }" @click="toggleScrub">
            <span style="font-size:13px">🕐</span>
            {{ lang === 'zh' ? '時光機' : 'Time machine' }}
          </button>
        </template>
        <button class="btn-accent" @click="$emit('order')">+ {{ t(lang, 'newOrder') }}</button>
      </div>
    </div>

    <!-- ===== Time machine scrubber(mock only,D-16) ===== -->
    <div v-if="live && scrubOn" class="tm-bar" style="grid-column: span 12">
      <div class="tm-l">
        <span class="tm-icon">📅</span>
        <div>
          <div class="tm-date">{{ scrubDateLabel }}</div>
          <div class="tm-sub">
            <span v-if="scrubDays === 0" style="color:var(--fg-mute)">{{ lang === 'zh' ? '即時' : 'Live' }}</span>
            <span v-else>
              {{ scrubDays }} {{ lang === 'zh' ? '天前' : 'days ago' }}
              <span style="color:var(--fg-mute);margin:0 6px">·</span>
              <span :style="{ color: scrubDelta >= 0 ? 'var(--up-text)' : 'var(--dn)' }">
                {{ lang === 'zh' ? '相對今日' : 'vs today' }} {{ scrubDelta >= 0 ? '+' : '' }}${{ fmtNum(Math.abs(scrubDelta), 0) }}
                ({{ fmtPct(safePct(scrubDelta, totalCost)) }})
              </span>
            </span>
          </div>
        </div>
      </div>
      <div class="tm-slider-wrap">
        <input type="range" :min="0" :max="365" step="1"
               :value="365 - scrubDays"
               @input="onScrubInput"
               class="tm-slider" />
        <div class="tm-ticks">
          <span>1Y {{ lang === 'zh' ? '前' : 'ago' }}</span>
          <span>6M</span>
          <span>3M</span>
          <span>1M</span>
          <span>{{ lang === 'zh' ? '今天' : 'Today' }}</span>
        </div>
      </div>
      <div class="tm-r">
        <button class="tm-step" @click="scrubDays = Math.min(365, scrubDays + 7)" :disabled="scrubDays >= 365">‹‹ 7d</button>
        <button class="tm-step" @click="scrubDays = Math.min(365, scrubDays + 1)" :disabled="scrubDays >= 365">‹</button>
        <button class="tm-step" @click="scrubDays = Math.max(0, scrubDays - 1)" :disabled="scrubDays <= 0">›</button>
        <button class="tm-step" @click="scrubDays = Math.max(0, scrubDays - 7)" :disabled="scrubDays <= 0">7d ››</button>
        <button class="tm-now" @click="scrubDays = 0" :disabled="scrubDays === 0">{{ lang === 'zh' ? '回到今天' : 'Back to today' }}</button>
      </div>
    </div>

    <!--
      U-05 / U-06:成交後重讀的指示列。刻意**不新增卡片、不改任何 grid span**,
      只在彙總條上方插入一條 12px 說明列;失敗時就地換成 stale 提示 + 診斷列 + 重試。
    -->
    <div v-if="!live && summaryRefreshing" class="refresh-strip" style="grid-column: span 12">
      <div class="refresh-note" data-testid="positions-refreshing">{{ t(lang, 'portfolioRefreshing') }}</div>
    </div>
    <div v-else-if="!live && summaryRefreshError" class="refresh-strip" style="grid-column: span 12">
      <!-- role="status" 而非 alert:交易已經成功,這不是需要打斷使用者的錯誤(U-06) -->
      <div class="refresh-stale" role="status" data-testid="positions-refresh-error">
        <div>{{ staleText(summaryRefreshCause) }}</div>
        <div class="details">
          <span data-testid="positions-refresh-error-code">{{ summaryRefreshError.code }}</span>
          <span v-if="summaryRefreshError.traceId" data-testid="positions-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ summaryRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-refresh-retry" @click="refreshSummary">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
    </div>

    <!--
      彙總條。mock:六張含 Sharpe/年化/MaxDD 的合成卡照舊。
      API mode(D-14 落點 + D-16):六張全部改讀 summary 後端欄位,假 KPI 就地被取代。
    -->
    <div
      v-if="!live && summaryLoading"
      class="card stat block-state"
      data-testid="positions-summary-loading"
      style="grid-column: span 12"
    >
      {{ t(lang, 'loading') }}
    </div>
    <div
      v-else-if="!live && summaryError"
      class="card stat block-error"
      data-testid="positions-summary-error"
      style="grid-column: span 12"
    >
      <div>{{ t(lang, 'loadFailed') }}</div>
      <div class="details">
        <span data-testid="positions-summary-error-code">{{ summaryError.code }}</span>
        <span v-if="summaryError.traceId" data-testid="positions-summary-trace-id">
          {{ t(lang, 'authRequestId') }} {{ summaryError.traceId }}
        </span>
      </div>
      <button class="block-retry" data-testid="positions-summary-retry" @click="loadSummary">
        {{ t(lang, 'authRetry') }}
      </button>
    </div>
    <template v-else>
      <div
        v-for="(s, i) in statCards"
        :key="i"
        class="card stat"
        data-testid="positions-stat"
        :class="{ scrubbed: scrubDays > 0, 'block-refreshing': summaryRefreshing }"
        :aria-busy="summaryRefreshing"
      >
        <div class="stat-l">{{ s.l }}</div>
        <div class="stat-v num" :style="{ color: s.up == null ? 'var(--fg)' : s.up ? 'var(--up-text)' : 'var(--dn)' }">{{ s.v }}<span v-if="s.ccy" class="stat-ccy">{{ s.ccy }}</span></div>
        <div v-if="s.delta" class="stat-d num" :style="{ color: s.up ? 'var(--up-text)' : 'var(--dn)' }">{{ s.delta }}</div>
        <!-- 04.2-21(DIV-02):總損益卡的股利收入附加列;API mode 且股利收入或預扣稅不為 0 才渲染 -->
        <div v-if="s.note" class="stat-note" data-testid="positions-stat-dividend-income">{{ s.note }}</div>
      </div>
    </template>

    <!-- Equity curve:genSeries 合成序列,需日級歷史 → API mode 隱藏(D-16) -->
    <div v-if="live" class="card chart" style="grid-column: span 8">
      <div class="row-between" style="margin-bottom:6px">
        <div>
          <div class="ttl">{{ t(lang, 'assetTrend') }}</div>
          <div class="sub" style="margin-top:2px">
            <span :style="{ color: pnlAbs >= 0 ? 'var(--up-text)' : 'var(--dn)' }">
              {{ pnlAbs >= 0 ? '+' : '' }}${{ fmtNum(Math.abs(pnlAbs), 0) }}
            </span>
            <span style="color:var(--fg-dim)">·</span>
            <span :style="{ color: pnlAbs >= 0 ? 'var(--up-text)' : 'var(--dn)' }">{{ fmtPct(safePct(pnlAbs, totalCost)) }}</span>
            <span style="color:var(--fg-mute);margin-left:8px;font-size:11px">{{ rangeLabel }}</span>
          </div>
        </div>
      </div>
      <div style="height:200px;color:var(--accent);position:relative">
        <LineChart :data="series" fill="var(--accent)" />
        <!-- Scrubber position marker -->
        <div v-if="scrubOn && scrubDays > 0" class="scrub-marker"
             :style="{ left: scrubMarkerPct + '%' }">
          <div class="sm-pill">{{ scrubDateLabel }}</div>
        </div>
      </div>
    </div>

    <!--
      Top movers:API mode 以後端基準幣 unrealizedPnlInBase 的絕對值排序(D-16 例外:可真實推導者不隱藏;
      quick-261106-fbs:不再以原幣 unrealizedPnl 跨幣別比大小)。缺匯率(null)的持倉不進榜,以提示列出檔數。
    -->
    <div v-if="live || movers.length || moversFxExcluded > 0" class="card" :style="{ gridColumn: live ? 'span 4' : 'span 12', padding: '20px' }">
      <div class="ttl" style="margin-bottom:14px">{{ t(lang, 'topMovers') }}</div>
      <div v-for="m in movers" :key="m.sym" class="mover">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          <div class="mtag">{{ m.sym.slice(0, 2) }}</div>
          <div style="min-width:0">
            <div style="font-weight:500;font-size:13px">{{ m.sym }}</div>
            <div style="font-size:11px;color:var(--fg-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.name }}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="num" style="font-size:13px;font-weight:500" :style="{ color: m.pnl >= 0 ? 'var(--up-text)' : 'var(--dn)' }">
            {{ fmtSignedMoney(m.pnl, m.ccy, 0) }}
          </div>
          <div class="num" style="font-size:11px" :style="{ color: m.pnl >= 0 ? 'var(--up-text)' : 'var(--dn)' }">{{ fmtPct(m.pct) }}</div>
        </div>
      </div>
      <div v-if="moversFxExcluded > 0" data-testid="positions-movers-fx-excluded" class="movers-note">
        {{ tf(lang, 'topMoversFxExcluded', { n: moversFxExcluded, base: moversBaseCurrency }) }}
      </div>
    </div>

    <!--
      Sector breakdown(04.1-16 / PORT-12 / D-19):兩模式共用同一份模板,吃 view-model `sectorRows`。
      mock 由既有 sectorStats 映射;API mode 由 summary.sectorAllocation 映射(Phase 3 因 HoldingDto 無 sector
      而隱藏,現在後端提供分組,資料來源是真的)。summary 載入中 / 失敗時不渲染 —— 單一重試點在頂端錯誤區塊(U-19)。
    -->
    <div v-if="live || summary" class="card" style="grid-column: span 12; padding: 20px" data-testid="positions-sector">
      <div class="ttl" style="margin-bottom:16px">{{ t(lang, 'sectorBreakdown') }}</div>
      <div v-if="!sectorRows.length" class="block-state" style="padding:0" data-testid="positions-sector-empty">
        {{ t(lang, 'noHoldings') }}
      </div>
      <div v-else class="sectors">
        <div
          v-for="s in sectorRows"
          :key="s.key"
          class="sector"
          :data-testid="s.uncategorized ? 'positions-sector-uncategorized' : undefined"
        >
          <div class="row-between" style="margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px">
              <span class="sec-swatch" :style="{ background: s.color }" />
              <span style="font-weight:600">{{ s.label }}</span>
              <span style="color:var(--fg-dim);font-size:12px">{{ s.count }}</span>
            </div>
            <div class="num" style="font-size:13px;font-weight:600">{{ s.valueText }}</div>
          </div>
          <div class="sec-bar">
            <div class="sec-fill" :style="{ width: s.weight + '%', background: s.color }" />
          </div>
          <div class="row-between" style="font-size:12px;color:var(--fg-dim);margin-top:4px">
            <span>{{ s.weightText }}</span>
            <span class="sec-pnl" :style="{ color: s.pnlUp ? 'var(--up-text)' : 'var(--dn)' }">{{ s.pnlText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Holdings table -->
    <div
      class="card"
      data-testid="positions-table"
      style="grid-column: span 12; overflow-x: auto; position: relative"
      :class="{ 'block-refreshing': holdingsRefreshing }"
      :aria-busy="holdingsRefreshing"
    >
      <!-- U-05 / U-06:重讀期間保留整張表格,只在頂端加一條指示列(見上方 summary 的同型說明) -->
      <div v-if="!live && holdingsRefreshing" class="refresh-note" data-testid="positions-refreshing">
        {{ t(lang, 'portfolioRefreshing') }}
      </div>
      <div
        v-else-if="!live && holdingsRefreshError"
        class="refresh-stale"
        role="status"
        data-testid="positions-refresh-error"
      >
        <div>{{ staleText(holdingsRefreshCause) }}</div>
        <div class="details">
          <span data-testid="positions-refresh-error-code">{{ holdingsRefreshError.code }}</span>
          <span v-if="holdingsRefreshError.traceId" data-testid="positions-refresh-trace-id">
            {{ t(lang, 'authRequestId') }} {{ holdingsRefreshError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-refresh-retry" @click="refreshHoldings">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <!-- 04.1-16(PORT-10):各列金額是原幣,權重是基準幣;summary 未就緒時沒有 {base} 可填 → 整行不渲染 -->
      <div
        v-if="!live && summary && holdings.length"
        class="currency-note"
        data-testid="positions-currency-note"
      >{{ tf(lang, 'holdingsCurrencyNote', { base: summary.baseCurrency }) }}</div>
      <!--
        Q5(大清單):loading 不依賴資料筆數,先渲染固定骨架列,資料到位後一次填入完整表格。
        本階段不做虛擬捲動(holdings 後端不分頁,實測筆數見 SUMMARY)。
      -->
      <div v-if="!live && holdingsLoading" class="block-state" data-testid="positions-holdings-loading">
        <div style="margin-bottom:10px">{{ t(lang, 'loading') }}</div>
        <div v-for="i in 6" :key="i" class="skeleton-row" />
      </div>
      <div v-else-if="!live && holdingsError" class="block-error" data-testid="positions-holdings-error">
        <div>{{ t(lang, 'loadFailed') }}</div>
        <div class="details">
          <span data-testid="positions-holdings-error-code">{{ holdingsError.code }}</span>
          <span v-if="holdingsError.traceId" data-testid="positions-holdings-trace-id">
            {{ t(lang, 'authRequestId') }} {{ holdingsError.traceId }}
          </span>
        </div>
        <button class="block-retry" data-testid="positions-holdings-retry" @click="loadHoldings">
          {{ t(lang, 'authRetry') }}
        </button>
      </div>
      <div v-else-if="!live && !holdings.length" class="block-state" data-testid="positions-holdings-empty">
        {{ t(lang, 'noHoldings') }}
      </div>
      <table v-else>
        <thead>
          <tr>
            <th @click="sort('sym')" :class="{ s: sortKey === 'sym' }">{{ t(lang, 'symbol') }}<SortArrow :k="'sym'" :sk="sortKey" :sd="sortDir" /></th>
            <th>{{ t(lang, 'name') }}</th>
            <th @click="sort('qty')" :class="{ s: sortKey === 'qty' }" style="text-align:right">{{ t(lang, 'qty') }}<SortArrow :k="'qty'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('avg')" :class="{ s: sortKey === 'avg' }" style="text-align:right">{{ t(lang, 'avgCost') }}<SortArrow :k="'avg'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('price')" :class="{ s: sortKey === 'price' }" style="text-align:right">{{ t(lang, 'price') }}<SortArrow :k="'price'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('value')" :class="{ s: sortKey === 'value' }" style="text-align:right">{{ t(lang, 'mktValue') }}<SortArrow :k="'value'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('pnl')" :class="{ s: sortKey === 'pnl' }" style="text-align:right">P&amp;L<SortArrow :k="'pnl'" :sk="sortKey" :sd="sortDir" /></th>
            <!-- 04.1-16:今日損益(原幣,PORT-11)。mock 沒有此資料 → 只在 API mode 出現,mock 欄數不變 -->
            <th v-if="!live" @click="sort('dayPnl')" :class="{ s: sortKey === 'dayPnl' }" style="text-align:right">{{ t(lang, 'todayPnl') }}<SortArrow :k="'dayPnl'" :sk="sortKey" :sd="sortDir" /></th>
            <th @click="sort('weight')" :class="{ s: sortKey === 'weight' }" style="text-align:right;padding-right:16px">{{ t(lang, 'weight') }}<SortArrow :k="'weight'" :sk="sortKey" :sd="sortDir" /></th>
            <!-- 04.2-21(D-11):動作欄可見表頭留空,只給輔助科技讀「動作」 -->
            <th class="col-actions"><span class="sr-only">{{ t(lang, 'positionsActionsHeader') }}</span></th>
          </tr>
        </thead>
        <!-- mock 路徑:計算邏輯與 Phase 3 之前逐字相同(含時光機 scrub 效果與 lastFill 高亮) -->
        <tbody v-if="live">
          <tr
            v-for="p in sortedPositions"
            :key="p.sym"
            data-testid="positions-row"
            :class="{ fresh: effectiveLastFill && p.sym === effectiveLastFill.sym, scrubbed: scrubDays > 0 }"
            @click="$emit('order', { sym: p.sym })"
          >
            <td style="font-weight:600;padding-left:16px">
              {{ p.sym }}
              <!-- U-12:不只靠顏色與動畫 —— 色盲 / 高對比 / 動畫播完的使用者都要看得出是哪一列 -->
              <span
                v-if="effectiveLastFill && p.sym === effectiveLastFill.sym"
                class="fresh-badge"
                data-testid="positions-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
            <td style="color:var(--fg-dim)">{{ p.name }}</td>
            <td class="num" style="text-align:right">{{ p.qty }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">${{ fmtNum(p.avg) }}</td>
            <td class="num" style="text-align:right">
              ${{ fmtNum(effPrice(p)) }}
              <div v-if="scrubDays > 0" class="scrub-cmp" :style="{ color: p.price > effPrice(p) ? 'var(--up-text)' : 'var(--dn)' }">
                {{ lang === 'zh' ? '今' : 'now' }} ${{ fmtNum(p.price) }}
              </div>
            </td>
            <td class="num" style="text-align:right;font-weight:500">${{ fmtNum(p.qty * effPrice(p), 0) }}</td>
            <td class="num" style="text-align:right" :style="{ color: effPnl(p) >= 0 ? 'var(--up-text)' : 'var(--dn)' }">
              <div>{{ effPnl(p) >= 0 ? '+' : '-' }}${{ fmtNum(Math.abs(effPnl(p)), 0) }}</div>
              <div style="font-size:11px">{{ fmtPct(effPnlPct(p)) }}</div>
            </td>
            <td style="text-align:right;padding-right:16px">
              <div style="display:inline-flex;align-items:center;gap:8px">
                <div class="bar"><div class="bar-fill" :style="{ width: effWeight(p) + '%' }" /></div>
                <span style="font-size:11px;color:var(--fg-dim);min-width:36px;text-align:right">{{ effWeight(p).toFixed(1) }}%</span>
              </div>
            </td>
            <td class="col-actions">
              <button
                type="button"
                class="btn-ghost-sm"
                data-testid="positions-holding-event"
                :aria-label="tf(lang, 'holdingEventRowActionAria', { symbol: p.sym })"
                @click.stop="openHoldingEvent(p.sym, mockHoldingOf(p))"
              >{{ t(lang, 'holdingEventRowAction') }}</button>
            </td>
          </tr>
        </tbody>
        <!--
          API 路徑:每一格都是後端欄位(D-04)。唯一的前端衍生是 weight,
          且分母是 summary.totalMarketValue 而非 qty×price 的自行加總(D-04 例外條款)。
          D-13:fresh 的來源是 effectiveLastFill(API mode 由 post-trade refetch 提供)。
        -->
        <tbody v-else>
          <tr
            v-for="h in sortedHoldings"
            :key="h.assetId"
            data-testid="positions-row"
            :class="{ fresh: effectiveLastFill && h.symbol === effectiveLastFill.sym }"
            @click="$emit('order', { sym: h.symbol })"
          >
            <td style="font-weight:600;padding-left:16px">
              {{ h.symbol }}
              <!-- 04.1-16:幣別標籤一次,該列金額改裸數字;currency 缺值不猜、不退回 $ -->
              <span v-if="h.currency" class="ccy-tag" data-testid="positions-ccy-tag">{{ h.currency }}</span>
              <!-- U-12:不只靠顏色與動畫的線索,mock / API 兩條路徑一致 -->
              <span
                v-if="effectiveLastFill && h.symbol === effectiveLastFill.sym"
                class="fresh-badge"
                data-testid="positions-fresh-badge"
              >{{ t(lang, 'freshBadge') }}</span>
            </td>
            <td style="color:var(--fg-dim)">{{ h.assetName }}</td>
            <td class="num" style="text-align:right">{{ h.totalQuantity }}</td>
            <td class="num" style="text-align:right;color:var(--fg-dim)">{{ fmtMoneyAmount(h.avgCost, h.currency, 2) }}</td>
            <td class="num" style="text-align:right">
              {{ fmtMoneyAmount(h.marketPrice, h.currency, 2) }}
              <!-- D-03:行情來自快取可能延遲,顯示時間讓使用者知道資料新鮮度 -->
              <div class="scrub-cmp" data-testid="positions-price-time" :title="t(lang, 'priceAsOf')">{{ fmtDateTime(h.priceTime) }}</div>
            </td>
            <td class="num" style="text-align:right;font-weight:600">{{ fmtMoneyAmount(h.marketValue, h.currency, 0) }}</td>
            <td class="num" style="text-align:right" :style="{ color: h.unrealizedPnl >= 0 ? 'var(--up-text)' : 'var(--dn)' }">
              <div>{{ fmtSignedMoneyAmount(h.unrealizedPnl, h.currency, 0) }}</div>
              <div style="font-size:12px">{{ fmtPct(h.roi * 100) }}</div>
            </td>
            <!--
              04.1-16(D-14 / D-17 / D-26、U-13):單檔今日損益是原幣價格損益,沒有匯率參與,
              所以列層級不放「不含匯差」。dayPricePnl 為 null(缺前收或最新價)→ — + 螢幕閱讀器文字。
            -->
            <td
              v-if="!live"
              class="num"
              :class="dayPnlClass(h)"
              style="text-align:right"
              data-testid="positions-day-pnl"
            >
              <template v-if="h.dayPricePnl === null">
                <span aria-hidden="true">—</span>
                <span class="sr-only">{{ t(lang, 'dayPnlUnavailable') }}</span>
              </template>
              <template v-else>
                <div>{{ fmtSignedMoneyAmount(h.dayPricePnl, h.currency, 0) }}</div>
                <div v-if="fmtRatioPct(h.dayPricePnlRatio) !== null" style="font-size:12px">{{ fmtRatioPct(h.dayPricePnlRatio) }}</div>
              </template>
            </td>
            <td style="text-align:right;padding-right:16px">
              <div style="display:inline-flex;align-items:center;gap:8px">
                <div class="bar"><div class="bar-fill" :style="{ width: holdingWeightWidth(h) }" /></div>
                <span data-testid="positions-weight" style="font-size:12px;color:var(--fg-dim);min-width:36px;text-align:right">{{ holdingWeightLabel(h) }}</span>
              </div>
            </td>
            <td class="col-actions">
              <button
                type="button"
                class="btn-ghost-sm"
                data-testid="positions-holding-event"
                :aria-label="tf(lang, 'holdingEventRowActionAria', { symbol: h.symbol })"
                @click.stop="openHoldingEvent(h.symbol, apiHoldingOf(h))"
              >{{ t(lang, 'holdingEventRowAction') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!--
      04.2-21(D-11):本頁自己的「股利與股數調整」對話框實例(標的鎖定、預設現金股利)。
      寫入成功後對話框發 notifyHoldingEventCreated,下方 watch(portfolioRevision) 依 cause 重讀;焦點回落由對話框還給開啟它的列動作鈕。
    -->
    <HoldingEventDialog
      :open="holdingEventOpen"
      :lang="lang"
      :symbol="holdingEventTarget?.symbol ?? null"
      :holding="holdingEventTarget?.holding ?? null"
      initial-mode="cashDividend"
      @close="holdingEventOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h as createElement, onMounted, onUnmounted, ref, watch } from 'vue';
import { t, tf } from '../i18n';
import { fmtMoney, fmtMoneyAmount, fmtRatioPct, fmtSignedMoney, fmtSignedMoneyAmount, fmtWeightPct } from '../moneyFormat';
import { genSeries, fmtNum, fmtPct } from '../data';
import type { Lang, Position } from '../types';
import { ApiClientError } from '../services/apiClient';
import type { HoldingDto, PortfolioSummary } from '../services/apiTypes';
import { numberToWire, parseDecimal, ROUND_HALF_UP, toChartNumber, ZERO, type Decimal } from '../services/decimal';
import { getRuntimeApiClients } from '../services/pageApiClients';
import {
  apiLastFill,
  clearLastFill,
  portfolioRevision,
  portfolioRevisionCause,
  type PortfolioRevisionCause,
} from '../services/portfolioRevision';
import HoldingEventDialog from '../components/HoldingEventDialog.vue';
import type { HoldingEventHolding } from '../components/HoldingEventDialog.vue';
import LineChart from '../components/LineChart.vue';

const props = defineProps<{ lang: Lang }>();
defineEmits<{ (e: 'order', preset?: { sym: string }): void }>();

// judgment §3:頁面只認 domain service,永不 import mock store。
// 分支條件是 `live` 是否存在,不是 mode 字串(見 03-02-SUMMARY 的消費契約)。
const api = getRuntimeApiClients().portfolio;
const live = api.live;

// live 的 getter 每次存取才解析 store,故必須在 computed / render 內取用才有 reactivity。
const mockPositions = computed<Position[]>(() => (live ? live.positions : []));

/**
 * D-13:fresh 高亮的來源切換。mock mode 有 Pinia 的成交事件,API mode 由 `apiLastFill` 補上。
 * 兩者形狀逐字相同(04-07 的刻意設計),所以**綁定表達式一個字都不用改,只是來源換了**。
 */
const effectiveLastFill = computed(() => (live ? live.lastFill : apiLastFill.value));

// =============== API mode 區塊狀態機(D-11:兩區塊各自載入、各自重試) ===============
interface BlockError {
  code: string;
  traceId: string | null;
}

type BlockState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: BlockError };

const summaryState = ref<BlockState<PortfolioSummary>>({ status: 'loading' });
const holdingsState = ref<BlockState<HoldingDto[]>>({ status: 'loading' });

// 模板不做型別窄化(vue-tsc 對模板內 union 窄化支援不穩),一律先投影成 computed。
const summaryLoading = computed(() => summaryState.value.status === 'loading');
const summaryError = computed(() => (summaryState.value.status === 'error' ? summaryState.value.error : null));
const summary = computed(() => (summaryState.value.status === 'loaded' ? summaryState.value.data : null));

const holdingsLoading = computed(() => holdingsState.value.status === 'loading');
const holdingsError = computed(() => (holdingsState.value.status === 'error' ? holdingsState.value.error : null));
const holdings = computed(() => (holdingsState.value.status === 'loaded' ? holdingsState.value.data : []));

// D-12:診斷資訊只在錯誤狀態出現,且只露 code / traceId(不外洩後端 message)。
function describeError(error: unknown): BlockError {
  if (error instanceof ApiClientError) return { code: error.code, traceId: error.requestId };
  return { code: 'UNKNOWN_ERROR', traceId: null };
}

async function loadSummary() {
  summaryState.value = { status: 'loading' };
  try {
    summaryState.value = { status: 'loaded', data: await api.getSummary() };
  } catch (error) {
    summaryState.value = { status: 'error', error: describeError(error) };
  }
}

async function loadHoldings() {
  holdingsState.value = { status: 'loading' };
  try {
    holdingsState.value = { status: 'loaded', data: await api.listHoldings() };
  } catch (error) {
    holdingsState.value = { status: 'error', error: describeError(error) };
  }
}

onMounted(() => {
  // mock mode 完全走 live 委派,不打任何網路。
  if (live) return;
  void loadSummary();
  void loadHoldings();
});

// UI-SPEC §9:「新」標記的壽命到頁面 unmount 為止(App.vue 的 v-if 切頁會卸載本頁),不靠計時器。
onUnmounted(() => {
  clearLastFill();
});

// =============== U-05 / U-06:成交後重讀的並存狀態(不取代 status 三態) ===============
/*
 * Phase 3 的 `status: 'loading'` 會把表格換成骨架列。交易剛成功卻讓整頁資料消失再長回來,
 * 是「看起來像出錯了」的典型誤導 —— 正是 D-12 要避免的「以為交易沒成功 → 再送一次」。
 * 因此重讀走一組**與 status 並存**的旗標:舊值留在畫面上,只多一條「更新中…」;
 * 失敗時也不進 `status: 'error'`(那會清掉舊值),改用 stale 提示明示「可能不是最新」。
 *
 * 兩個資料源各有自己的一組旗標(D-12:四個資料源各自獨立,一個失敗不影響其他)。
 */
const summaryRefreshing = ref(false);
const summaryRefreshError = ref<BlockError | null>(null);
const holdingsRefreshing = ref(false);
const holdingsRefreshError = ref<BlockError | null>(null);
/**
 * 各區塊最近一次重讀的觸發來源(U-09):stale 文案依它選,而不是依「現在」的 cause ——
 * 股利只重讀 summary,holdings 上一次交易留下的 stale 提示不得因此改口成「紀錄已寫入」。
 */
const summaryRefreshCause = ref<PortfolioRevisionCause | null>(null);
const holdingsRefreshCause = ref<PortfolioRevisionCause | null>(null);

/**
 * U-09 / T-04.2-46:重讀失敗的 stale 文案依觸發來源選擇,非交易的寫入不得顯示「交易已記錄」。
 * 入出金、股利、股數調整共用「紀錄已寫入」;cause 未知時退回交易文案(與 Overview 相同)。
 */
function staleText(cause: PortfolioRevisionCause | null): string {
  if (cause === 'cash' || cause === 'dividend' || cause === 'shareAdjustment') {
    return t(props.lang, 'portfolioStaleAfterCashEntry');
  }
  if (cause === 'baseCurrency') return t(props.lang, 'portfolioStaleAfterBaseCurrency');
  return t(props.lang, 'portfolioStaleAfterTrade');
}

async function refreshSummary() {
  // 還沒有可保留的舊值(首次載入中,或首次就失敗)→ 沒有 U-05 要保護的東西,退回一般載入。
  if (summaryState.value.status !== 'loaded') {
    await loadSummary();
    return;
  }
  summaryRefreshing.value = true;
  summaryRefreshError.value = null;
  try {
    summaryState.value = { status: 'loaded', data: await api.getSummary() };
  } catch (error) {
    summaryRefreshError.value = describeError(error);
  } finally {
    summaryRefreshing.value = false;
  }
}

async function refreshHoldings() {
  if (holdingsState.value.status !== 'loaded') {
    await loadHoldings();
    return;
  }
  holdingsRefreshing.value = true;
  holdingsRefreshError.value = null;
  try {
    holdingsState.value = { status: 'loaded', data: await api.listHoldings() };
  } catch (error) {
    holdingsRefreshError.value = describeError(error);
  } finally {
    holdingsRefreshing.value = false;
  }
}

/*
 * D-10:成交後由**已掛載**的頁自己重讀自己的資料源。
 * `App.vue:36` 用 `v-if` 切頁,未掛載的頁沒有任何消費者,代它發請求是純粹的無效工。
 */
watch(portfolioRevision, () => {
  // mock mode 完全走 live 委派(Pinia reactivity),不打任何網路 —— 與 onMounted 同一條規則。
  if (live) return;
  const cause = portfolioRevisionCause.value;
  summaryRefreshCause.value = cause;
  void refreshSummary();
  // UI-SPEC §11 / RESEARCH Q7:現金股利不改持倉估值 → 只重讀 summary;其餘來源(含股數調整)兩者都重讀。
  if (cause === 'dividend') return;
  holdingsRefreshCause.value = cause;
  void refreshHoldings();
});

// =============== 04.2-21(D-11):列動作「股利與股數調整」 ===============

/**
 * mock 宇宙(data.ts)是美股報價,mock 持倉幣別一律 USD(與 portfolioApi / holdingEventApi 的 `MOCK_CURRENCY` 同義);
 * mock 表格本身也以 `$` 呈現,所以對話框顯示 USD 與頁面一致。
 */
const MOCK_POSITION_CURRENCY = 'USD';

const holdingEventOpen = ref(false);
const holdingEventTarget = ref<{ symbol: string; holding: HoldingEventHolding } | null>(null);

/**
 * 對話框只顯示、不計算持倉(Phase 3 D-04);幣別缺值不猜測(對話框以 — 代替)。
 * quick-261107-1j4 E2:`assetType` / `market` 原樣帶入,對話框以此決定除權日的市場今天(不再另查 searchAssets)。
 */
function apiHoldingOf(h: HoldingDto): HoldingEventHolding {
  return {
    totalQuantity: h.totalQuantity,
    currency: h.currency ?? undefined,
    name: h.assetName,
    assetType: h.assetType,
    market: h.market,
  };
}

function mockHoldingOf(p: Position): HoldingEventHolding {
  return {
    totalQuantity: p.qty,
    currency: MOCK_POSITION_CURRENCY,
    name: p.name,
    assetType: p.assetType ?? null,
    market: p.market ?? null,
  };
}

function openHoldingEvent(symbol: string, holding: HoldingEventHolding) {
  holdingEventTarget.value = { symbol, holding };
  holdingEventOpen.value = true;
}

/** D-03:priceTime 為 ISO-8601 或 null(mock 端恆為 null),格式化為本地日期時間短格式。 */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 比值 → 百分比的乘數(Decimal;strict 模式下常數以字串建構)。 */
const HUNDRED = parseDecimal('100');

/**
 * 彙總條 roi 卡:比值 × 100(格式化縮放,D-04)。Decimal 版本沿用既有 `fmtPct` 的輸出格式
 * (非負帶 `+`、2 位小數、無千分位),捨入改為與後端一致的 HALF_UP。
 */
function fmtRoiPct(roi: Decimal): string {
  const pct = roi.times(HUNDRED);
  return `${pct.gte(ZERO) ? '+' : ''}${pct.toFixed(2, ROUND_HALF_UP)}%`;
}

/**
 * D-04 明文例外:後端 HoldingDto / PortfolioSummaryDto 都沒有 weight,只能前端衍生。
 * 04.1-16(RESEARCH Q1.4 / Pitfall 3):D-05 之後 summary.totalMarketValue 是**基準幣**,
 * 而持倉列的 marketValue 仍是**原幣**。分子必須用後端已折好的 marketValueInBase(同為基準幣),
 * 前端不知道匯率(D-21),只做比值。
 * 回傳 0..1 的比值(Decimal,div 後 round(8, HALF_UP),Phase 5 D-08);summary 未載入、分母為 0、
 * 或 marketValueInBase 為 null(缺匯率)→ null,呈現為破折號而非編造 0.0%。
 *
 * 型別閉包交接點(05-17 → 05-18):分母 `summary.totalMarketValue` 已是 Decimal,分子 `marketValueInBase`
 * 屬 HoldingDto,05-18 才轉 Decimal;在此之前只在這一處把既有 number 轉成 Decimal(方向一律 number → Decimal)。
 * 05-18 持倉轉 Decimal 時刪除此轉換(並以 grep 驗證 Positions.vue 不再出現 numberToWire)。
 */
function holdingWeight(holding: HoldingDto): Decimal | null {
  const s = summary.value;
  if (!s || s.totalMarketValue.eq(ZERO)) return null;
  if (holding.marketValueInBase === null || !Number.isFinite(holding.marketValueInBase)) return null;
  const marketValueInBase = parseDecimal(numberToWire(holding.marketValueInBase));
  return marketValueInBase.div(s.totalMarketValue).round(8, ROUND_HALF_UP);
}

/** 今日損益格的色彩 class:null → fg-dim;其餘依正負(0 視為 up,與同列 P&L 一致)。 */
function dayPnlClass(holding: HoldingDto): string {
  if (holding.dayPricePnl === null) return 'day-na';
  return holding.dayPricePnl >= 0 ? 'day-up' : 'day-dn';
}

function holdingWeightLabel(holding: HoldingDto): string {
  return fmtWeightPct(holdingWeight(holding));
}

/** 權重 bar 的 CSS 寬度:視覺近似值,Decimal → number 只在這個顯示出口發生。 */
function holdingWeightWidth(holding: HoldingDto): string {
  const w = holdingWeight(holding);
  return `${w === null ? 0 : Math.max(0, Math.min(100, toChartNumber(w.times(HUNDRED))))}%`;
}

// =============== mock mode:以下計算與模板與 Phase 3 之前完全相同 ===============
type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
const range = ref<Range>('1M');
const ranges = computed(() => [
  { id: '1D' as Range, label: '1D' },
  { id: '1W' as Range, label: '1W' },
  { id: '1M' as Range, label: '1M' },
  { id: '3M' as Range, label: '3M' },
  { id: '1Y' as Range, label: '1Y' },
  { id: 'ALL' as Range, label: props.lang === 'zh' ? '全部' : 'All' },
]);

const rangeLabel = computed(() => {
  const labels = {
    '1D': props.lang === 'zh' ? '今日' : 'Today',
    '1W': props.lang === 'zh' ? '本週' : 'This week',
    '1M': props.lang === 'zh' ? '近 30 日' : 'Last 30 days',
    '3M': props.lang === 'zh' ? '近 90 日' : 'Last 90 days',
    '1Y': props.lang === 'zh' ? '近一年' : 'Last 12 months',
    'ALL': props.lang === 'zh' ? '自開戶' : 'Since inception',
  };
  return labels[range.value];
});

// Range config: data length + return multiplier (vs total) + start factor
const rangeCfg: Record<Range, { n: number; mult: number; vol: number; sharpe: string; annual: string; dd: string; seed: number }> = {
  '1D':  { n: 24,  mult: 0.012, vol: 0.0028, sharpe: '—',    annual: '—',     dd: '-0.4%',  seed: 1 },
  '1W':  { n: 35,  mult: 0.038, vol: 0.0042, sharpe: '1.42', annual: '+15.2%', dd: '-1.8%',  seed: 4 },
  '1M':  { n: 60,  mult: 0.082, vol: 0.0065, sharpe: '1.68', annual: '+17.4%', dd: '-3.4%',  seed: 7 },
  '3M':  { n: 90,  mult: 0.142, vol: 0.0080, sharpe: '1.74', annual: '+18.0%', dd: '-6.2%',  seed: 11 },
  '1Y':  { n: 120, mult: 0.246, vol: 0.0095, sharpe: '1.84', annual: '+18.4%', dd: '-12.4%', seed: 22 },
  'ALL': { n: 180, mult: 0.348, vol: 0.0110, sharpe: '1.62', annual: '+16.8%', dd: '-18.6%', seed: 41 },
};

const totalCost = computed(() => mockPositions.value.reduce((s, p) => s + p.qty * p.avg, 0));
const totalVal = computed(() => mockPositions.value.reduce((s, p) => s + p.qty * p.price, 0));

// Range-scoped P&L (so it changes with range)
const rangePnl = computed(() => {
  const cfg = rangeCfg[range.value];
  const fullPnl = totalVal.value - totalCost.value;
  // Scale full pnl by how much of total return falls in this window
  return fullPnl * (cfg.mult / 0.348);
});
const pnlAbs = computed(() => rangePnl.value);

const series = computed(() => {
  const cfg = rangeCfg[range.value];
  const start = totalVal.value - rangePnl.value;
  return genSeries(cfg.n, start, cfg.vol, cfg.seed);
});

/** 彙總卡的共同形狀。ccy 為空字串 = 不渲染代碼 span(mock 與比率卡)。 */
interface StatCard { l: string; v: string; ccy: string; up: boolean | null; delta: string; note?: string }

const mockStats = computed<StatCard[]>(() => {
  const cfg = rangeCfg[range.value];
  const pnl = rangePnl.value;
  return [
    {
      l: t(props.lang, 'mktValue'),
      v: '$' + fmtNum(totalVal.value, 0),
      ccy: '',
      up: null as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'unrealized'),
      v: (pnl >= 0 ? '+' : '−') + '$' + fmtNum(Math.abs(pnl), 0),
      ccy: '',
      up: pnl >= 0 as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'roi'),
      v: fmtPct(safePct(pnl, totalCost.value)),
      ccy: '',
      up: pnl >= 0 as boolean | null,
      delta: rangeLabel.value,
    },
    {
      l: t(props.lang, 'sharpe'),
      v: cfg.sharpe,
      ccy: '',
      up: null as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'annualized'),
      v: cfg.annual,
      ccy: '',
      up: cfg.annual.startsWith('+') as boolean | null,
      delta: '',
    },
    {
      l: t(props.lang, 'maxDd'),
      v: cfg.dd,
      ccy: '',
      up: false as boolean | null,
      delta: '',
    },
  ];
});

/**
 * API mode 的六張卡全部來自 summary 後端欄位(D-14 授權落點 + D-04);
 * roi 是比值,×100 是顯示格式化而非平行重算。Sharpe / 年化 / MaxDD 三張寫死卡就地被取代(D-16)。
 */
const apiStats = computed<StatCard[]>(() => {
  const s = summary.value;
  if (!s) return [];
  const base = s.baseCurrency;
  // 基準幣金額:數值與代碼拆兩個 span(UI-SPEC §Money)。金額是 Decimal(mapper 保證有值,Phase 5 D-08)。
  const money = (value: Decimal): Pick<StatCard, 'v' | 'ccy'> => ({ v: fmtMoneyAmount(value, base, 0), ccy: base });
  const signed = (value: Decimal): Pick<StatCard, 'v' | 'ccy'> => ({ v: fmtSignedMoneyAmount(value, base, 0), ccy: base });
  return [
    { l: t(props.lang, 'mktValue'), ...money(s.totalMarketValue), up: null, delta: '' },
    { l: t(props.lang, 'unrealized'), ...signed(s.unrealizedPnl), up: s.unrealizedPnl.gte(ZERO), delta: '' },
    { l: t(props.lang, 'roi'), v: fmtRoiPct(s.roi), ccy: '', up: s.roi.gte(ZERO), delta: '' },
    { l: t(props.lang, 'realizedPnl'), ...signed(s.realizedPnl), up: s.realizedPnl.gte(ZERO), delta: '' },
    { l: t(props.lang, 'totalPnlLabel'), ...signed(s.totalPnl), up: s.totalPnl.gte(ZERO), delta: '', note: dividendIncomeNote(s) },
    { l: t(props.lang, 'costBasis'), ...money(s.totalCostBasis), up: null, delta: '' },
  ];
});

/**
 * DIV-02 / UI-SPEC §Interaction 4:總損益卡的股利收入附加列(基準幣,後端值,前端不重算)。
 * 股利收入與預扣稅皆 0 → 空字串(不渲染,U-10);有預扣稅 → 另列。mock 不走這裡(mock KPI 寫死)。
 */
function dividendIncomeNote(s: PortfolioSummary): string {
  if (s.dividendIncome.eq(ZERO) && s.dividendTaxWithheld.eq(ZERO)) return '';
  const amount = fmtSignedMoney(s.dividendIncome, s.baseCurrency, 0);
  if (s.dividendTaxWithheld.gt(ZERO)) {
    return tf(props.lang, 'dividendIncomeLineWithTax', { amount, tax: fmtMoney(s.dividendTaxWithheld, s.baseCurrency, 0) });
  }
  return tf(props.lang, 'dividendIncomeLine', { amount });
}

const statCards = computed(() => (live ? mockStats.value : apiStats.value));

// Top movers (P&L abs) — top 4
// mock 宇宙單一幣別:金額代碼取 MOCK_POSITION_CURRENCY(與對話框一致),不再寫死 `$`。
const mockTopMovers = computed(() => {
  return [...mockPositions.value]
    .map(p => ({ sym: p.sym, name: p.name, pnl: pnl(p), pct: pnlPct(p), ccy: MOCK_POSITION_CURRENCY }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 4);
});

/**
 * D-16 例外:由後端 unrealizedPnlInBase / roi 真實推導,故不隱藏。
 * quick-261106-fbs:以**基準幣**未實現損益排序 —— 原幣 unrealizedPnl 跨幣別直接比大小是錯的(同 04.1 D-05)。
 * 前端不換匯(D-21):unrealizedPnlInBase 為 null(缺匯率)的持倉不進榜,檔數另以 moversFxExcluded 提示。
 */
function hasBasePnl(x: HoldingDto): x is HoldingDto & { unrealizedPnlInBase: number } {
  return x.unrealizedPnlInBase !== null && Number.isFinite(x.unrealizedPnlInBase);
}

const apiTopMovers = computed(() => {
  return holdings.value
    .filter(hasBasePnl)
    .map(x => ({ sym: x.symbol, name: x.assetName, pnl: x.unrealizedPnlInBase, pct: x.roi * 100, ccy: x.baseCurrency }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 4);
});

/** 因缺匯率而未列入 Top movers 的持倉檔數(mock 單一幣別恆為 0)。 */
const moversFxExcluded = computed(() => (live ? 0 : holdings.value.filter(x => !hasBasePnl(x)).length));

/** 提示文案的基準幣代碼:summary 優先,summary 未載入時取持倉列(兩者同值,見 HoldingDto.baseCurrency)。 */
const moversBaseCurrency = computed(() => summary.value?.baseCurrency ?? holdings.value[0]?.baseCurrency ?? '');

const movers = computed(() => (live ? mockTopMovers.value : apiTopMovers.value));

// Sector breakdown 的分類色輪替與 mock 的 sectorStats(API mode 走 summary.sectorAllocation,見 sectorRows)
const SECTOR_COLORS = ['var(--accent)', '#3b82f6', '#a855f7', '#f59e0b', '#94a3b8', '#10b981'];
function sectorColor(i: number) { return SECTOR_COLORS[i % SECTOR_COLORS.length]; }

const sectorStats = computed(() => {
  const map: Record<string, { value: number; cost: number; count: number }> = {};
  for (const p of mockPositions.value) {
    const k = p.sector || 'Other';
    if (!map[k]) map[k] = { value: 0, cost: 0, count: 0 };
    map[k].value += p.qty * p.price;
    map[k].cost += p.qty * p.avg;
    map[k].count += 1;
  }
  return Object.entries(map)
    .map(([name, x]) => ({
      name,
      value: x.value,
      count: x.count,
      weight: safePct(x.value, totalVal.value),
      pnl: x.value - x.cost,
      pnlPct: safePct(x.value - x.cost, x.cost),
    }))
    .sort((a, b) => b.value - a.value);
});

/**
 * 產業卡的 view-model(兩模式共用模板)。weight 是 0..100 的 bar 寬度,weightText 是已格式化的標籤。
 * mock:既有 sectorStats 原樣映射(美元金額、損益 %,輸出與改寫前逐字相同)。
 * API:summary.sectorAllocation —— 金額與損益都是後端的基準幣值,前端不換匯(D-21);
 *     損益只顯示金額、不顯示 %(比率要由前端以 pnl / (value − pnl) 推導,違反 Phase 3 D-04「不平行重算」)。
 */
interface SectorRow {
  key: string;
  label: string;
  color: string;
  count: number;
  valueText: string;
  weight: number;
  weightText: string;
  pnlText: string;
  pnlUp: boolean;
  uncategorized: boolean;
}

const UNCATEGORIZED_COLOR = 'var(--fg-dim)';

const sectorRows = computed<SectorRow[]>(() => {
  if (live) {
    return sectorStats.value.map((x, i) => ({
      key: x.name,
      label: x.name,
      color: sectorColor(i),
      count: x.count,
      valueText: '$' + fmtNum(x.value, 0),
      weight: x.weight,
      weightText: x.weight.toFixed(1) + '%',
      pnlText: fmtPct(x.pnlPct),
      pnlUp: x.pnl >= 0,
      uncategorized: false,
    }));
  }
  const s = summary.value;
  if (!s) return [];
  const base = s.baseCurrency;
  // 後端已依 value 降冪、null 最後;這裡再做一次穩定分割,不把「未分類排最後」押在後端順序上。
  // 缺 sectorAllocation(舊後端 / 欄位遺失)時 mapper 已補成空清單 → 空狀態,不讓整頁炸掉(04.1 IN-04)。
  const allocation = s.sectorAllocation;
  const classified = allocation.filter(x => x.sector !== null);
  const unclassified = allocation.filter(x => x.sector === null);
  return [...classified, ...unclassified].map((x, i) => {
    const uncategorized = x.sector === null;
    return {
      key: uncategorized ? '__uncategorized__' : (x.sector as string),
      label: uncategorized ? t(props.lang, 'sectorUncategorized') : (x.sector as string),
      // 未分類固定色、不參與輪替:有分類的組別依序取色,不因為 null 佔掉一格
      color: uncategorized ? UNCATEGORIZED_COLOR : sectorColor(i),
      count: x.holdingCount,
      valueText: fmtMoney(x.value, base, 0),
      // bar 寬度是視覺近似值:Decimal 權重 × 100 後才經 toChartNumber 轉出(唯一的 number 出口)。
      weight: Math.max(0, Math.min(100, toChartNumber(x.weight.times(HUNDRED)))),
      weightText: fmtWeightPct(x.weight),
      pnlText: fmtSignedMoney(x.unrealizedPnl, base, 0),
      pnlUp: x.unrealizedPnl.gte(ZERO),
      uncategorized,
    };
  });
});

// Sortable holdings
type SortKey = 'sym' | 'qty' | 'avg' | 'price' | 'value' | 'pnl' | 'dayPnl' | 'weight';
const sortKey = ref<SortKey | ''>('value');
const sortDir = ref<'asc' | 'desc'>('desc');

const sortedPositions = computed(() => {
  const rows = [...mockPositions.value];
  if (!sortKey.value) return rows;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const k = sortKey.value;
  rows.sort((a, b) => {
    let va: any, vb: any;
    switch (k) {
      case 'sym': va = a.sym; vb = b.sym; break;
      case 'qty': va = a.qty; vb = b.qty; break;
      case 'avg': va = a.avg; vb = b.avg; break;
      case 'price': va = a.price; vb = b.price; break;
      case 'value': va = a.qty * a.price; vb = b.qty * b.price; break;
      case 'pnl': va = pnl(a); vb = pnl(b); break;
      case 'weight': va = weight(a); vb = weight(b); break;
    }
    if (typeof va === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  return rows;
});

/**
 * API 路徑的排序值一律取後端欄位(D-04);holdings 為完整 List 不分頁,
 * client-side 排序因此是正確的 —— 與 trades 的分頁情境不同,勿套用後端排序(CONTEXT specifics)。
 */
const sortedHoldings = computed(() => {
  const rows = [...holdings.value];
  if (!sortKey.value) return rows;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const k = sortKey.value;
  rows.sort((a, b) => {
    // 權重是 Decimal(05-17):以 cmp 比較;null(summary 未載入 / 缺匯率)不論升降冪一律排最後。
    if (k === 'weight') {
      const wa = holdingWeight(a);
      const wb = holdingWeight(b);
      if (wa === null || wb === null) return wa === wb ? 0 : wa === null ? 1 : -1;
      return wa.cmp(wb) * dir;
    }
    let va: any, vb: any;
    switch (k) {
      case 'sym': va = a.symbol; vb = b.symbol; break;
      case 'qty': va = a.totalQuantity; vb = b.totalQuantity; break;
      case 'avg': va = a.avgCost; vb = b.avgCost; break;
      case 'price': va = a.marketPrice; vb = b.marketPrice; break;
      case 'value': va = a.marketValue; vb = b.marketValue; break;
      case 'pnl': va = a.unrealizedPnl; vb = b.unrealizedPnl; break;
      // 跨幣別可比的是比率,不是原幣金額;null(缺資料)不論升降冪一律排最後。
      case 'dayPnl': va = a.dayPricePnlRatio; vb = b.dayPricePnlRatio; break;
    }
    if (k === 'dayPnl') {
      const aMissing = va === null || !Number.isFinite(va);
      const bMissing = vb === null || !Number.isFinite(vb);
      if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    }
    if (typeof va === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  return rows;
});

function sort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = k;
    sortDir.value = k === 'sym' ? 'asc' : 'desc';
  }
}

const SortArrow = (p: { k: string; sk: string; sd: 'asc' | 'desc' }) =>
  p.k === p.sk ? createElement('span', { class: 'sort-a' }, p.sd === 'asc' ? '↑' : '↓') : null;

function safePct(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator * 100;
}
function pnl(p: Position) { return p.qty * p.price - p.qty * p.avg; }
function pnlPct(p: Position) { return safePct(pnl(p), p.qty * p.avg); }
function weight(p: Position) { return safePct(p.qty * p.price, totalVal.value); }

// =============== Time machine(mock only,D-16) ===============
const scrubOn = ref(false);
const scrubDays = ref(0); // 0 = today, 365 = a year ago

function toggleScrub() {
  scrubOn.value = !scrubOn.value;
  if (!scrubOn.value) scrubDays.value = 0;
}

function onScrubInput(e: Event) {
  scrubDays.value = 365 - +(e.target as HTMLInputElement).value;
}

// Deterministic historical price for a symbol N days ago
function priceAt(p: Position, daysAgo: number) {
  if (daysAgo === 0) return p.price;
  const seed = p.sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  // smooth pseudo-random walk
  const trendAnnual = ((seed * 7) % 40 - 12) / 100; // -12% to +28% trailing-year drift
  const driftPerDay = trendAnnual / 365;
  const noise = Math.sin((seed + daysAgo) * 0.31) * 0.04 + Math.sin((seed + daysAgo) * 0.07) * 0.06;
  // current is today; older = subtract drift to roll back
  const factor = 1 - (driftPerDay * daysAgo) - noise;
  return Math.max(p.price * factor, p.price * 0.4);
}

function effPrice(p: Position) {
  return scrubOn.value && scrubDays.value > 0 ? priceAt(p, scrubDays.value) : p.price;
}
function effPnl(p: Position) {
  return p.qty * effPrice(p) - p.qty * p.avg;
}
function effPnlPct(p: Position) {
  return safePct(effPnl(p), p.qty * p.avg);
}
function effTotalVal() {
  return mockPositions.value.reduce((s, p) => s + p.qty * effPrice(p), 0);
}
function effWeight(p: Position) {
  return safePct(p.qty * effPrice(p), effTotalVal());
}

const scrubDelta = computed(() => {
  if (scrubDays.value === 0) return 0;
  return effTotalVal() - totalVal.value;
});

const scrubDateLabel = computed(() => {
  const d = new Date();
  d.setDate(d.getDate() - scrubDays.value);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (scrubDays.value === 0) return props.lang === 'zh' ? '今天' : 'Today';
  return props.lang === 'zh' ? `${y}/${m}/${day}` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${day}, ${y}`;
});

// Scrubber marker position on the chart (% from left)
const scrubMarkerPct = computed(() => {
  // Map scrubDays vs current range's lookback window
  // approx days the curve spans
  const spanDays: Record<Range, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 365 };
  const span = spanDays[range.value];
  if (scrubDays.value > span) return 0; // off-screen left
  return ((span - scrubDays.value) / span) * 100;
});
</script>

<style scoped>
.page { padding: 22px; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.row-between { display: flex; justify-content: space-between; align-items: flex-start; }
.btn-accent { background: var(--accent); color: var(--on-accent); border: 0; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap; }
.btn-accent:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin: 0; }
.sub { font-size: 12px; color: var(--fg-dim); margin-top: 4px; }

.seg { display: inline-flex; background: var(--surface2); border-radius: 8px; padding: 3px; gap: 2px; }
.seg-btn {
  padding: 6px 12px; background: transparent; border: 0; border-radius: 6px;
  font-size: 12px; font-weight: 500; color: var(--fg-dim); cursor: pointer; transition: all .15s;
  font-family: inherit;
}
.seg-btn:hover { color: var(--fg); }
.seg-btn.active { background: var(--surface); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.stat { grid-column: span 2; padding: 16px; }
.stat-l { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.stat-v { font-size: 20px; font-weight: 600; margin-top: 6px; letter-spacing: -0.2px; }
.stat-ccy { margin-left: 4px; font-size: 12px; font-weight: 600; color: var(--fg-dim); }
.stat-d { font-size: 11px; margin-top: 2px; color: var(--fg-mute); }
/* 04.2-21(DIV-02):總損益卡的股利收入附加列 */
.stat-note { margin-top: 4px; font-size: 12px; font-weight: 400; color: var(--fg-dim); }
/* 六張統計卡:span 2 在窄螢幕放不下 9 位數金額 + 幣別代碼,會把 main 撐出水平捲動(04.1-19 L5 抓到) */
@media (max-width: 1279px) { .stat { grid-column: span 4; } }
@media (max-width: 639px) { .stat { grid-column: span 12; } }
.chart { padding: 20px; }
.ttl { font-size: 16px; font-weight: 600; }

/* Top movers */
.mover { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
.mover + .mover { border-top: 1px solid var(--border); }
.movers-note { font-size: 12px; color: var(--fg-dim); line-height: 1.5; }
.mover + .movers-note { margin-top: 8px; }
.mtag {
  width: 30px; height: 30px; border-radius: 7px; background: var(--surface2);
  font-size: 10px; font-weight: 700; color: var(--fg-dim);
  display: flex; align-items: center; justify-content: center;
}

/* Sector breakdown */
.sectors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 24px; }
@media (max-width: 899px) { .sectors { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 559px) { .sectors { grid-template-columns: 1fr; } }
.sec-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.sec-bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
.sec-fill { height: 100%; transition: width .4s cubic-bezier(.2,.8,.2,1); }

/* Table */
table { width: 100%; font-size: 13px; }
thead tr {
  background: var(--surface2); color: var(--fg-dim);
  font-size: 11px; text-align: left; text-transform: uppercase; letter-spacing: 0.4px;
}
thead th { padding: 10px 0; font-weight: 500; cursor: pointer; user-select: none; transition: color .15s; }
thead th:first-child { padding-left: 16px; }
thead th:hover { color: var(--fg); }
thead th.s { color: var(--accent-text); }
.sort-a { display: inline-block; margin-left: 4px; font-size: 10px; }
tbody tr { border-top: 1px solid var(--border); cursor: pointer; transition: background .15s; }
tbody tr:hover { background: var(--surface2); }
tbody tr.fresh { animation: highlight 1.6s ease-out; }
@keyframes highlight {
  0% { background: color-mix(in oklch, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}
tbody td { padding: 12px 0; }
/* 相鄰儲存格至少隔 12px(04.1-31):窄螢幕欄寬被壓到最小時,靠右的數字格不再黏在一起;第一欄 padding-left: 16px 不受影響 */
thead th + th, tbody td + td { padding-left: 12px; }
/* 04.1-16:幣別標籤(同 Trades.vue 的 .ccy-tag,UI-SPEC §Interaction 7);只有水平內距,不改列高 */
.ccy-tag {
  display: inline-block; margin-left: 8px; padding: 0 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  border-radius: 99px; background: var(--surface2); color: var(--fg-dim);
}
.currency-note { padding: 8px 16px; font-size: 12px; font-weight: 400; line-height: 1.35; color: var(--fg-dim); }
.day-up { color: var(--up-text); }
.day-dn { color: var(--dn); }
.day-na { color: var(--fg-dim); }
/* 04.2-21(D-11):動作欄在最右;動作鈕中性(不是 accent),12px / 600、36px 觸控目標 */
.col-actions { padding-right: 16px; text-align: right; white-space: nowrap; }
.btn-ghost-sm {
  min-height: 36px; padding: 8px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.btn-ghost-sm:hover { background: var(--surface2); }
.btn-ghost-sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.bar { width: 60px; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); transition: width .3s; }

/* ===== Time machine ===== */
.btn-tm {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px dashed var(--border);
  color: var(--fg-dim); padding: 7px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit; transition: all .15s; white-space: nowrap;
}
.btn-tm:hover { color: var(--fg); border-color: var(--fg-mute); border-style: solid; }
.btn-tm.on {
  background: linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.12));
  border-color: #a855f7; border-style: solid; color: #a855f7;
}

.tm-bar {
  display: grid; grid-template-columns: minmax(220px, auto) 1fr auto;
  gap: 24px; align-items: center;
  padding: 14px 18px;
  background: linear-gradient(135deg, color-mix(in oklch, #a855f7 6%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in oklch, #a855f7 30%, var(--border));
  border-radius: 10px;
  animation: slideDown .25s ease-out;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.tm-l { display: flex; align-items: center; gap: 12px; }
.tm-icon { font-size: 18px; }
.tm-date { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tm-sub { font-size: 11.5px; color: var(--fg-dim); margin-top: 2px; }

.tm-slider-wrap { display: flex; flex-direction: column; gap: 4px; }
.tm-slider {
  width: 100%; height: 5px; -webkit-appearance: none; appearance: none;
  background: linear-gradient(90deg, var(--surface2), #a855f7);
  border-radius: 3px; outline: none; cursor: pointer;
}
.tm-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 3px solid #a855f7;
  cursor: grab; box-shadow: 0 2px 8px rgba(168,85,247,0.4);
}
.tm-slider::-webkit-slider-thumb:active { cursor: grabbing; }
.tm-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 3px solid #a855f7;
  cursor: grab;
}
.tm-ticks { display: flex; justify-content: space-between; font-size: 10px; color: var(--fg-mute); padding: 0 2px; }

.tm-r { display: flex; gap: 4px; align-items: center; }
.tm-step {
  background: var(--surface); border: 1px solid var(--border);
  color: var(--fg-dim); padding: 5px 9px; border-radius: 6px;
  font-size: 11px; font-family: 'JetBrains Mono', monospace;
  cursor: pointer; transition: all .1s;
}
.tm-step:hover:not(:disabled) { color: #a855f7; border-color: #a855f7; }
.tm-step:disabled { opacity: 0.3; cursor: not-allowed; }
.tm-now {
  background: #a855f7; color: #fff; border: 0;
  padding: 6px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 600;
  cursor: pointer; margin-left: 6px; font-family: inherit;
}
.tm-now:disabled { opacity: 0.4; cursor: not-allowed; }

.stat.scrubbed .stat-v { color: #a855f7 !important; }
tr.scrubbed { background: color-mix(in oklch, #a855f7 3%, transparent); }
tr.scrubbed:hover { background: color-mix(in oklch, #a855f7 8%, transparent); }
.scrub-cmp { font-size: 10px; color: var(--fg-mute); margin-top: 2px; font-weight: 400; }

.scrub-marker {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: #a855f7; pointer-events: none;
  transition: left .15s;
}
.scrub-marker .sm-pill {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: #a855f7; color: #fff;
  padding: 2px 8px; border-radius: 10px;
  font-size: 10px; font-weight: 600; white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* 區塊級狀態(D-11/D-12):診斷樣式沿用 SessionBanner / Overview 的 code/traceId 呈現慣例 */
.block-state { padding: 18px 20px; font-size: 13px; color: var(--fg-dim); }
.block-error { padding: 18px 20px; font-size: 13px; }
.block-error .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.block-error .details span { overflow-wrap: anywhere; }
.block-retry {
  margin-top: 8px; min-height: 32px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface2);
  color: var(--danger); font: inherit; font-size: 13px; font-weight: 600;
}
/* U-05 / U-06:重讀指示與 stale 提示。不新增卡片,只在既有版位內插入一條低調說明列 */
.refresh-note { padding: 8px 20px; font-size: 12px; color: var(--fg-dim); }
.refresh-stale { padding: 14px 20px; font-size: 13px; }
.refresh-stale .details {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 4px; color: var(--fg-dim); font-size: 12px;
}
.refresh-stale .details span { overflow-wrap: anywhere; }
.block-refreshing { opacity: .72; transition: opacity .15s; }

/*
 * U-12:剛成交列的非顏色線索。形狀沿用 Trades 的 .pill,但**只有水平內距**:
 * 12px × line-height 1.2 = 14.4px,小於本列 13px 文字的行高,因此 inline-block
 * 完整落在既有 line box 內 —— §Layout Contract 的「不改列高」是這樣達成的。
 */
.fresh-badge {
  display: inline-block; margin-left: 8px;
  padding: 0 8px; border-radius: 99px;
  font-size: 12px; font-weight: 600; line-height: 1.2;
  background: color-mix(in oklch, var(--accent) 16%, transparent); color: var(--fg);
}

/*
 * U-12 / a11y:動畫關掉,標記照常顯示 —— 這正是「不只靠動畫」的價值所在。
 * 高亮的壽命由 App.vue 的 v-if 切頁卸載界定,**不用計時器**(計時器會讓測試時間相依而 flaky)。
 */
@media (prefers-reduced-motion: reduce) {
  tbody tr.fresh { animation: none; }
  .skeleton-row { animation: none; }
  .block-refreshing { transition: none; }
}

/* Q5:骨架列固定筆數,載入呈現不隨資料量變動 */
.skeleton-row {
  height: 14px; margin: 8px 0; border-radius: 4px;
  background: var(--surface2);
  animation: skeletonPulse 1.2s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
