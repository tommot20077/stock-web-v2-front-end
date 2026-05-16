// TradingView Classic — dark, red/green candles, right price axis, volume bars
const TradingViewClassic = () => {
  const W = 720, H = 460;
  const PRICE_H = 320, VOL_H = 90, GAP = 6;
  const PAD_L = 14, PAD_R = 60, PAD_T = 38;

  const candles = CANDLES.slice(-60); // last 60 days
  const ma20 = computeMA(candles, 20);
  const ma50 = computeMA(candles, 50);

  const minP = Math.min(...candles.map(c => c.low)) - 1;
  const maxP = Math.max(...candles.map(c => c.high)) + 1;
  const maxV = Math.max(...candles.map(c => c.vol)) * 1.1;

  const xStep = (W - PAD_L - PAD_R) / candles.length;
  const candleW = xStep * 0.65;

  const yPrice = v => PAD_T + (1 - (v - minP) / (maxP - minP)) * PRICE_H;
  const yVol = v => PAD_T + PRICE_H + GAP + (1 - v / maxV) * VOL_H;

  // gridlines (price)
  const priceTicks = [];
  for (let i = 0; i <= 5; i++) {
    const v = minP + (maxP - minP) * (i / 5);
    priceTicks.push({ v, y: yPrice(v) });
  }

  const last = candles[candles.length - 1];
  const isUp = last.close > last.open;

  return (
    <div style={tvStyles.container}>
      {/* Header bar */}
      <div style={tvStyles.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={tvStyles.symbol}>AAPL</div>
          <div style={tvStyles.exchange}>· NASDAQ</div>
          <div style={tvStyles.timeframe}>1D</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'JetBrains Mono, monospace' }}>
          <div style={{ color: '#787b86', fontSize: 11 }}>O <span style={{ color: '#d1d4dc' }}>{fmt(last.open)}</span></div>
          <div style={{ color: '#787b86', fontSize: 11 }}>H <span style={{ color: '#d1d4dc' }}>{fmt(last.high)}</span></div>
          <div style={{ color: '#787b86', fontSize: 11 }}>L <span style={{ color: '#d1d4dc' }}>{fmt(last.low)}</span></div>
          <div style={{ color: '#787b86', fontSize: 11 }}>C <span style={{ color: isUp ? '#26a69a' : '#ef5350' }}>{fmt(last.close)}</span></div>
          <div style={{ color: isUp ? '#26a69a' : '#ef5350', fontSize: 11, marginLeft: 4 }}>
            {CHANGE >= 0 ? '+' : ''}{fmt(CHANGE)} ({CHANGE >= 0 ? '+' : ''}{fmt(CHANGE_PCT)}%)
          </div>
        </div>
      </div>

      {/* Indicator labels */}
      <div style={tvStyles.indicators}>
        <span style={{ color: '#2962ff' }}>MA(20) {fmt(ma20[ma20.length - 1] || 0)}</span>
        <span style={{ color: '#ff9800' }}>MA(50) {fmt(ma50[ma50.length - 1] || 0)}</span>
        <span style={{ color: '#787b86' }}>Vol</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: '#131722' }}>
        {/* Horizontal gridlines */}
        {priceTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#1e222d" strokeWidth="1" />
        ))}
        {/* Vertical gridlines (every 10 candles) */}
        {candles.map((_, i) => i % 10 === 0 && (
          <line key={`v${i}`} x1={PAD_L + i * xStep + xStep / 2} x2={PAD_L + i * xStep + xStep / 2} y1={PAD_T} y2={PAD_T + PRICE_H} stroke="#1e222d" strokeWidth="1" />
        ))}

        {/* MA lines */}
        <polyline
          points={candles.map((c, i) => ma20[i] != null ? `${PAD_L + i * xStep + xStep / 2},${yPrice(ma20[i])}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#2962ff" strokeWidth="1.2" />
        <polyline
          points={candles.map((c, i) => ma50[i] != null ? `${PAD_L + i * xStep + xStep / 2},${yPrice(ma50[i])}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#ff9800" strokeWidth="1.2" />

        {/* Candles */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          const color = up ? '#26a69a' : '#ef5350';
          const yO = yPrice(c.open);
          const yC = yPrice(c.close);
          const yH = yPrice(c.high);
          const yL = yPrice(c.low);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
              <rect x={x - candleW / 2} y={Math.min(yO, yC)} width={candleW} height={Math.max(Math.abs(yO - yC), 1)} fill={color} />
            </g>
          );
        })}

        {/* Right-side price axis */}
        <rect x={W - PAD_R} y={PAD_T} width={PAD_R} height={PRICE_H + GAP + VOL_H} fill="#131722" />
        {priceTicks.map((t, i) => (
          <text key={i} x={W - PAD_R + 6} y={t.y + 3} fill="#787b86" fontSize="9.5" fontFamily="JetBrains Mono, monospace">{fmt(t.v, 1)}</text>
        ))}

        {/* Last price tag */}
        <g>
          <rect x={W - PAD_R + 1} y={yPrice(last.close) - 8} width={PAD_R - 2} height={16} fill={isUp ? '#26a69a' : '#ef5350'} />
          <text x={W - PAD_R + 6} y={yPrice(last.close) + 3} fill="#fff" fontSize="10" fontWeight="600" fontFamily="JetBrains Mono, monospace">{fmt(last.close)}</text>
        </g>

        {/* Volume bars */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          const yV = yVol(c.vol);
          return <rect key={i} x={x - candleW / 2} y={yV} width={candleW} height={PAD_T + PRICE_H + GAP + VOL_H - yV} fill={up ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)'} />;
        })}

        {/* Crosshair simulation */}
        <line x1={PAD_L + 42 * xStep + xStep / 2} x2={PAD_L + 42 * xStep + xStep / 2} y1={PAD_T} y2={PAD_T + PRICE_H + GAP + VOL_H} stroke="#787b86" strokeWidth="0.5" strokeDasharray="2 2" />
        <line x1={PAD_L} x2={W - PAD_R} y1={yPrice(192)} y2={yPrice(192)} stroke="#787b86" strokeWidth="0.5" strokeDasharray="2 2" />

        {/* Bottom timeline */}
        <text x={PAD_L} y={H - 4} fill="#787b86" fontSize="9" fontFamily="JetBrains Mono, monospace">Aug</text>
        <text x={PAD_L + 20 * xStep} y={H - 4} fill="#787b86" fontSize="9" fontFamily="JetBrains Mono, monospace">Sep</text>
        <text x={PAD_L + 40 * xStep} y={H - 4} fill="#787b86" fontSize="9" fontFamily="JetBrains Mono, monospace">Oct</text>
        <text x={PAD_L + 55 * xStep} y={H - 4} fill="#787b86" fontSize="9" fontFamily="JetBrains Mono, monospace">Nov</text>
      </svg>

      {/* Bottom toolbar (TV-style) */}
      <div style={tvStyles.toolbar}>
        {['1m', '5m', '15m', '1H', '1D', '1W', '1M'].map(t => (
          <span key={t} style={{ ...tvStyles.tfBtn, ...(t === '1D' ? tvStyles.tfBtnOn : {}) }}>{t}</span>
        ))}
        <div style={{ width: 1, background: '#2a2e39', height: 14, margin: '0 4px' }}></div>
        <span style={tvStyles.tfBtn}>📊 Indicators</span>
        <span style={tvStyles.tfBtn}>✏️ Draw</span>
        <span style={tvStyles.tfBtn}>↔️ Compare</span>
        <div style={{ flex: 1 }}></div>
        <span style={tvStyles.tfBtn}>⚙</span>
      </div>
    </div>
  );
};

const tvStyles = {
  container: { background: '#131722', color: '#d1d4dc', fontFamily: 'Inter, sans-serif', fontSize: 12, height: '100%', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 6px', borderBottom: '1px solid #1e222d' },
  symbol: { fontSize: 16, fontWeight: 700, letterSpacing: 0.3 },
  exchange: { color: '#787b86', fontSize: 11 },
  timeframe: { background: '#2a2e39', color: '#d1d4dc', padding: '2px 6px', borderRadius: 3, fontSize: 10, marginLeft: 8 },
  indicators: { padding: '5px 14px', display: 'flex', gap: 14, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, borderBottom: '1px solid #1e222d' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderTop: '1px solid #1e222d', background: '#181c25' },
  tfBtn: { padding: '3px 8px', borderRadius: 3, color: '#787b86', fontSize: 11, cursor: 'pointer' },
  tfBtnOn: { background: '#2a2e39', color: '#d1d4dc' },
};

window.TradingViewClassic = TradingViewClassic;
