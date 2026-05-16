// Robinhood Minimal — light bg, single line, big number, no candles
const RobinhoodMinimal = () => {
  const W = 720, H = 460;
  const CHART_H = 240;
  const PAD_L = 20, PAD_R = 20, PAD_T = 130;

  const candles = CANDLES.slice(-60);
  const minP = Math.min(...candles.map(c => c.close)) - 1;
  const maxP = Math.max(...candles.map(c => c.close)) + 1;

  const xStep = (W - PAD_L - PAD_R) / (candles.length - 1);
  const yPrice = v => PAD_T + (1 - (v - minP) / (maxP - minP)) * CHART_H;

  const last = candles[candles.length - 1];
  const isUp = CHANGE >= 0;
  const accent = isUp ? '#00c805' : '#ff5000'; // RH green / orange

  // Build line path
  const linePath = candles.map((c, i) => `${i === 0 ? 'M' : 'L'} ${PAD_L + i * xStep},${yPrice(c.close)}`).join(' ');
  // Area fill path
  const areaPath = `${linePath} L ${PAD_L + (candles.length - 1) * xStep},${PAD_T + CHART_H} L ${PAD_L},${PAD_T + CHART_H} Z`;

  // Hover point at index 42
  const hoverIdx = 42;
  const hoverX = PAD_L + hoverIdx * xStep;
  const hoverY = yPrice(candles[hoverIdx].close);

  return (
    <div style={rhStyles.container}>
      {/* Top bar */}
      <div style={rhStyles.topBar}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c805', display: 'inline-block' }}></span>
          <span style={{ fontSize: 11, color: '#737d8c' }}>Market open</span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#737d8c' }}>
          <span>Watch</span>
          <span style={{ color: '#1e2329', fontWeight: 600, borderBottom: '2px solid #00c805', paddingBottom: 6 }}>Stocks</span>
          <span>Crypto</span>
          <span>Options</span>
        </div>
      </div>

      {/* Hero number */}
      <div style={{ padding: '18px 24px 10px' }}>
        <div style={{ fontSize: 13, color: '#737d8c', fontWeight: 500 }}>Apple Inc.</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: '#1e2329', letterSpacing: -0.8, marginTop: 2, lineHeight: 1 }}>${fmt(last.close)}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 6 }}>
          <span style={{ color: accent, fontSize: 14, fontWeight: 600 }}>
            {isUp ? '+' : ''}${fmt(Math.abs(CHANGE))} ({isUp ? '+' : ''}{fmt(CHANGE_PCT)}%)
          </span>
          <span style={{ color: '#737d8c', fontSize: 12 }}>Today</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: '#fff' }}>
        <defs>
          <linearGradient id="rhArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.12" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Subtle horizontal at hover */}
        <line x1={PAD_L} x2={W - PAD_R} y1={hoverY} y2={hoverY} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2 4" />

        {/* Area fill */}
        <path d={areaPath} fill="url(#rhArea)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover dot */}
        <circle cx={hoverX} cy={hoverY} r="5" fill="#fff" stroke={accent} strokeWidth="2" />

        {/* Hover label */}
        <g transform={`translate(${hoverX - 38},${hoverY - 30})`}>
          <rect width="76" height="20" rx="3" fill="#1e2329" />
          <text x="38" y="13" fill="#fff" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="Inter, sans-serif">Oct 24 · ${fmt(candles[hoverIdx].close)}</text>
        </g>

        {/* Bottom date row */}
        <text x={PAD_L} y={H - 50} fill="#737d8c" fontSize="11" fontFamily="Inter, sans-serif">9:30 AM</text>
        <text x={W / 2 - 18} y={H - 50} fill="#737d8c" fontSize="11" fontFamily="Inter, sans-serif">12:30 PM</text>
        <text x={W - PAD_R - 50} y={H - 50} fill="#737d8c" fontSize="11" fontFamily="Inter, sans-serif">4:00 PM</text>
      </svg>

      {/* Time selector */}
      <div style={rhStyles.tfRow}>
        {['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'All'].map(t => (
          <span key={t} style={{ ...rhStyles.tfBtn, ...(t === '1D' ? { color: accent, fontWeight: 700 } : {}) }}>{t}</span>
        ))}
      </div>
    </div>
  );
};

const rhStyles = {
  container: { background: '#fff', color: '#1e2329', fontFamily: 'Inter, sans-serif', height: '100%', display: 'flex', flexDirection: 'column' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px 0', borderBottom: '1px solid #f0f1f3' },
  tfRow: { display: 'flex', justifyContent: 'space-around', padding: '14px 24px 18px', borderTop: '1px solid #f0f1f3', marginTop: 'auto' },
  tfBtn: { fontSize: 12, color: '#737d8c', fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3 },
};

window.RobinhoodMinimal = RobinhoodMinimal;
