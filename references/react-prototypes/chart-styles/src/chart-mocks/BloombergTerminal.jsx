// Bloomberg Terminal — black background, amber/cyan, dense data, monospace everything
const BloombergTerminal = () => {
  const W = 720, H = 460;
  const PRICE_H = 220, VOL_H = 50, GAP = 4;
  const PAD_L = 50, PAD_R = 12, PAD_T = 50;

  const candles = CANDLES.slice(-60);
  const ma20 = computeMA(candles, 20);

  const minP = Math.min(...candles.map(c => c.low)) - 1;
  const maxP = Math.max(...candles.map(c => c.high)) + 1;
  const maxV = Math.max(...candles.map(c => c.vol)) * 1.1;

  const xStep = (W - PAD_L - PAD_R) / candles.length;
  const candleW = xStep * 0.55;

  const yPrice = v => PAD_T + (1 - (v - minP) / (maxP - minP)) * PRICE_H;
  const yVol = v => PAD_T + PRICE_H + GAP + (1 - v / maxV) * VOL_H;

  const priceTicks = [];
  for (let i = 0; i <= 6; i++) {
    const v = minP + (maxP - minP) * (i / 6);
    priceTicks.push({ v, y: yPrice(v) });
  }

  const last = candles[candles.length - 1];

  // Mini stat panel data
  const stats = [
    ['1D', '+1.21%', '+'], ['5D', '+3.45%', '+'], ['MTD', '+2.18%', '+'],
    ['YTD', '+18.74%', '+'], ['52W H', '199.62', ''], ['52W L', '164.08', ''],
    ['MKT CAP', '2.94T', ''], ['P/E', '31.4', ''], ['DIV YLD', '0.43%', ''],
    ['BETA', '1.28', ''], ['VOL', '52.3M', ''], ['AVG VOL', '58.7M', ''],
  ];

  return (
    <div style={bbStyles.container}>
      {/* Top function bar */}
      <div style={bbStyles.fnBar}>
        <span style={bbStyles.fnBlock}>AAPL <span style={{ color: '#ffa500' }}>US</span> Equity</span>
        <span style={{ color: '#ffa500' }}>GIP</span>
        <span style={{ color: '#787878' }}>›</span>
        <span style={bbStyles.fnText}>Intraday Price Chart</span>
        <div style={{ flex: 1 }}></div>
        <span style={{ color: '#787878', fontSize: 10 }}>15:42:18 EST</span>
        <span style={{ color: '#22ee44', fontSize: 10 }}>● LIVE</span>
      </div>

      {/* Price header */}
      <div style={bbStyles.priceHeader}>
        <div>
          <div style={{ color: '#787878', fontSize: 9, letterSpacing: 1 }}>APPLE INC · NASDAQ GS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ color: '#ffa500', fontSize: 22, fontWeight: 600, fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(last.close)}</span>
            <span style={{ color: CHANGE >= 0 ? '#22ee44' : '#ff3344', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
              {CHANGE >= 0 ? '+' : ''}{fmt(CHANGE)} ({CHANGE >= 0 ? '+' : ''}{fmt(CHANGE_PCT)}%)
            </span>
            <span style={{ color: '#787878', fontSize: 9, marginLeft: 8 }}>USD</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, auto)', gap: '2px 14px', alignContent: 'center', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}>
          {stats.map(([k, v, sign], i) => (
            <React.Fragment key={i}>
              <span style={{ color: '#787878', fontSize: 9, letterSpacing: 0.5 }}>{k}</span>
              <span style={{ color: sign === '+' ? '#22ee44' : '#d4d4d4', textAlign: 'right' }}>{v}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: '#000' }}>
        {/* Border */}
        <rect x={PAD_L - 0.5} y={PAD_T - 0.5} width={W - PAD_L - PAD_R + 1} height={PRICE_H + 1} fill="none" stroke="#3a3a3a" strokeWidth="0.5" />
        <rect x={PAD_L - 0.5} y={PAD_T + PRICE_H + GAP - 0.5} width={W - PAD_L - PAD_R + 1} height={VOL_H + 1} fill="none" stroke="#3a3a3a" strokeWidth="0.5" />

        {/* Gridlines */}
        {priceTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#1a1a1a" strokeWidth="0.5" strokeDasharray="1 2" />
        ))}

        {/* Candles */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          // Bloomberg uses cyan/magenta or white outlined
          const color = up ? '#22ee44' : '#ff3344';
          const yO = yPrice(c.open);
          const yC = yPrice(c.close);
          const yH = yPrice(c.high);
          const yL = yPrice(c.low);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="0.6" />
              <rect x={x - candleW / 2} y={Math.min(yO, yC)} width={candleW} height={Math.max(Math.abs(yO - yC), 1)} fill={up ? '#000' : color} stroke={color} strokeWidth="0.6" />
            </g>
          );
        })}

        {/* MA line in cyan */}
        <polyline
          points={candles.map((c, i) => ma20[i] != null ? `${PAD_L + i * xStep + xStep / 2},${yPrice(ma20[i])}` : '').filter(Boolean).join(' ')}
          fill="none" stroke="#00d4ff" strokeWidth="0.8" />

        {/* Left price axis */}
        {priceTicks.map((t, i) => (
          <text key={i} x={PAD_L - 4} y={t.y + 3} fill="#ffa500" fontSize="9" fontFamily="IBM Plex Mono, monospace" textAnchor="end">{fmt(t.v, 2)}</text>
        ))}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const x = PAD_L + i * xStep + xStep / 2;
          const up = c.close >= c.open;
          const yV = yVol(c.vol);
          return <rect key={i} x={x - candleW / 2} y={yV} width={candleW} height={PAD_T + PRICE_H + GAP + VOL_H - yV} fill={up ? '#22ee44' : '#ff3344'} fillOpacity="0.6" />;
        })}

        {/* Volume axis label */}
        <text x={PAD_L - 4} y={PAD_T + PRICE_H + GAP + 8} fill="#787878" fontSize="8" fontFamily="IBM Plex Mono, monospace" textAnchor="end">VOL</text>
        <text x={PAD_L - 4} y={PAD_T + PRICE_H + GAP + VOL_H - 2} fill="#787878" fontSize="8" fontFamily="IBM Plex Mono, monospace" textAnchor="end">0</text>

        {/* Bottom timeline */}
        <text x={PAD_L} y={H - 26} fill="#ffa500" fontSize="8" fontFamily="IBM Plex Mono, monospace">08-15</text>
        <text x={PAD_L + 20 * xStep} y={H - 26} fill="#ffa500" fontSize="8" fontFamily="IBM Plex Mono, monospace">09-15</text>
        <text x={PAD_L + 40 * xStep} y={H - 26} fill="#ffa500" fontSize="8" fontFamily="IBM Plex Mono, monospace">10-15</text>
        <text x={W - PAD_R - 30} y={H - 26} fill="#ffa500" fontSize="8" fontFamily="IBM Plex Mono, monospace">11-15</text>
      </svg>

      {/* Bottom command bar */}
      <div style={bbStyles.cmdBar}>
        <span style={{ color: '#ffa500' }}>Cmd»</span>
        <span style={{ color: '#fff', borderRight: '6px solid #fff', marginLeft: 2 }}></span>
        <div style={{ flex: 1 }}></div>
        <span style={bbStyles.fnKey}>F1 HELP</span>
        <span style={bbStyles.fnKey}>F2 GIP</span>
        <span style={bbStyles.fnKey}>F3 DES</span>
        <span style={bbStyles.fnKey}>F4 CN</span>
        <span style={bbStyles.fnKey}>F5 GP</span>
      </div>
    </div>
  );
};

const bbStyles = {
  container: { background: '#000', color: '#ffa500', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, height: '100%', display: 'flex', flexDirection: 'column' },
  fnBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #3a3a3a', fontSize: 10 },
  fnBlock: { color: '#fff', fontWeight: 600 },
  fnText: { color: '#d4d4d4' },
  priceHeader: { display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #3a3a3a' },
  cmdBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderTop: '1px solid #3a3a3a', background: '#0a0a0a', fontSize: 9 },
  fnKey: { color: '#787878', padding: '0 4px' },
};

window.BloombergTerminal = BloombergTerminal;
