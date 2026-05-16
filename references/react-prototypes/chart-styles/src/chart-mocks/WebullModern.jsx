// Webull Modern — dark with gradient area fill, neon accent, contemporary feel
const WebullModern = () => {
  const W = 720, H = 460;
  const PRICE_H = 290, VOL_H = 80, GAP = 8;
  const PAD_L = 14, PAD_R = 56, PAD_T = 60;

  const candles = CANDLES.slice(-60);
  const ma20 = computeMA(candles, 20);
  const bb = computeBB(candles, 20);

  const minP = Math.min(...candles.map(c => c.low)) - 1;
  const maxP = Math.max(...candles.map(c => c.high)) + 1;
  const maxV = Math.max(...candles.map(c => c.vol)) * 1.1;

  const xStep = (W - PAD_L - PAD_R) / candles.length;
  const candleW = xStep * 0.6;

  const yPrice = v => PAD_T + (1 - (v - minP) / (maxP - minP)) * PRICE_H;
  const yVol = v => PAD_T + PRICE_H + GAP + (1 - v / maxV) * VOL_H;

  const last = candles[candles.length - 1];
  const isUp = CHANGE >= 0;

  // BB area path
  const bbUpPath = candles.map((c, i) => bb[i].upper != null ? `${i === 0 || bb[i - 1]?.upper == null ? 'M' : 'L'} ${PAD_L + i * xStep + xStep / 2},${yPrice(bb[i].upper)}` : '').filter(Boolean).join(' ');
  const bbLoPath = candles.map((c, i) => bb[i].lower != null ? `${i === 0 || bb[i - 1]?.lower == null ? 'M' : 'L'} ${PAD_L + i * xStep + xStep / 2},${yPrice(bb[i].lower)}` : '').filter(Boolean).join(' ');

  const priceTicks = [];
  for (let i = 0; i <= 5; i++) {
    const v = minP + (maxP - minP) * (i / 5);
    priceTicks.push({ v, y: yPrice(v) });
  }

  return (
    <div style={wbStyles.container}>
      {/* Header */}
      <div style={wbStyles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={wbStyles.logo}>🍎</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Apple Inc.</div>
              <div style={{ fontSize: 10, color: '#8b929b' }}>AAPL · NASDAQ · USD</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>{fmt(last.close)}</div>
          <div style={{ fontSize: 11, color: isUp ? '#00d68f' : '#ff5757', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ background: isUp ? 'rgba(0,214,143,0.15)' : 'rgba(255,87,87,0.15)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
              {isUp ? '▲' : '▼'} {fmt(Math.abs(CHANGE))} ({isUp ? '+' : ''}{fmt(CHANGE_PCT)}%)
            </span>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: 'linear-gradient(180deg, #0d1117 0%, #161b24 100%)' }}>
        <defs>
          <linearGradient id="bbFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="upFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00d68f" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00d68f" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {priceTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#1f2632" strokeWidth="0.5" strokeDasharray="2 4" />
        ))}

        {/* BB band */}
        <path d={`${bbUpPath} ${candles.slice().reverse().map((c, j) => { const i = candles.length - 1 - j; return bb[i].lower != null ? `L ${PAD_L + i * xStep + xStep / 2},${yPrice(bb[i].lower)}` : ''; }).filter(Boolean).join(' ')} Z`} fill="url(#bbFill)" />
        <path d={bbUpPath} fill="none" stroke="#7c5cff" strokeWidth="0.8" strokeOpacity="0.5" />
        <path d={bbLoPath} fill="none" stroke="#7c5cff" strokeWidth="0.8" strokeOpacity="0.5" />

        {/* Candles - hollow on up */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          const color = up ? '#00d68f' : '#ff5757';
          const yO = yPrice(c.open);
          const yC = yPrice(c.close);
          const yH = yPrice(c.high);
          const yL = yPrice(c.low);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
              <rect x={x - candleW / 2} y={Math.min(yO, yC)} width={candleW} height={Math.max(Math.abs(yO - yC), 1)} fill={up ? 'transparent' : color} stroke={color} strokeWidth="1" />
            </g>
          );
        })}

        {/* MA(20) glow */}
        <polyline
          points={candles.map((c, i) => ma20[i] != null ? `${PAD_L + i * xStep + xStep / 2},${yPrice(ma20[i])}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#fbbf24" strokeWidth="1.5" />

        {/* Right price axis */}
        {priceTicks.map((t, i) => (
          <text key={i} x={W - PAD_R + 6} y={t.y + 3} fill="#8b929b" fontSize="9.5" fontFamily="JetBrains Mono, monospace">{fmt(t.v, 1)}</text>
        ))}

        {/* Last price tag with neon */}
        <g>
          <rect x={W - PAD_R + 1} y={yPrice(last.close) - 9} width={PAD_R - 2} height={18} rx="3" fill={isUp ? '#00d68f' : '#ff5757'} />
          <text x={W - PAD_R + 6} y={yPrice(last.close) + 4} fill="#0d1117" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono, monospace">{fmt(last.close)}</text>
        </g>

        {/* Volume bars with rounded tops */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          const yV = yVol(c.vol);
          return <rect key={i} x={x - candleW / 2} y={yV} width={candleW} height={PAD_T + PRICE_H + GAP + VOL_H - yV} rx="1" fill={up ? '#00d68f' : '#ff5757'} fillOpacity="0.4" />;
        })}

        {/* Bottom timeline */}
        <text x={PAD_L} y={H - 4} fill="#8b929b" fontSize="9.5" fontFamily="Inter, sans-serif">Aug</text>
        <text x={PAD_L + 20 * xStep} y={H - 4} fill="#8b929b" fontSize="9.5" fontFamily="Inter, sans-serif">Sep</text>
        <text x={PAD_L + 40 * xStep} y={H - 4} fill="#8b929b" fontSize="9.5" fontFamily="Inter, sans-serif">Oct</text>
      </svg>

      {/* Bottom action bar */}
      <div style={wbStyles.actionBar}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['1D', '5D', '1M', '3M', '1Y', '5Y', 'All'].map(t => (
            <span key={t} style={{ ...wbStyles.tfPill, ...(t === '3M' ? wbStyles.tfPillOn : {}) }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={wbStyles.buyBtn}>Buy</button>
          <button style={wbStyles.sellBtn}>Sell</button>
        </div>
      </div>
    </div>
  );
};

const wbStyles = {
  container: { background: '#0d1117', color: '#d8dee9', fontFamily: 'Inter, sans-serif', height: '100%', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1f2632' },
  logo: { width: 32, height: 32, background: '#1f2632', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  actionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #1f2632', background: '#0d1117' },
  tfPill: { padding: '4px 10px', borderRadius: 14, fontSize: 11, color: '#8b929b', fontWeight: 500, cursor: 'pointer' },
  tfPillOn: { background: '#7c5cff', color: '#fff' },
  buyBtn: { background: '#00d68f', color: '#0d1117', border: 'none', padding: '6px 18px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  sellBtn: { background: '#ff5757', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
};

window.WebullModern = WebullModern;
