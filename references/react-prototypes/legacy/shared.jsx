// Shared chart primitives + lightweight UI used across all 3 directions.
// Each direction styles via CSS vars set on its root.

const { SYMBOLS, CRYPTO, FX, BONDS, POSITIONS, TRADES, NOTIFS, NEWS, OPLOG, genSeries, genCandles, fmtNum, fmtPct, t } = window.STOCK_DATA;

// Sparkline / line chart — pure SVG
function LineChart({ data, w = 800, h = 200, color = 'currentColor', fill, axis = false, baseline, padding = 4 }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const step = (w - padding * 2) / (data.length - 1);
  const pts = data.map((v, i) => [padding + i * step, padding + (h - padding * 2) * (1 - (v - min) / range)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dFill = d + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h - padding} L ${pts[0][0].toFixed(1)} ${h - padding} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {axis && [0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={padding} x2={w - padding} y1={padding + (h - padding * 2) * p} y2={padding + (h - padding * 2) * p}
              stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 4" />
      ))}
      {fill && <path d={dFill} fill={fill} opacity="0.18" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Candlestick chart
function Candles({ data, w = 800, h = 280, up = '#22c55e', down = '#ef4444', volume }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data.map(c => c.l));
  const max = Math.max(...data.map(c => c.h));
  const range = (max - min) || 1;
  const volH = volume ? 50 : 0;
  const chartH = h - volH - 12;
  const padX = 6;
  const cw = (w - padX * 2) / data.length;
  const bw = Math.max(1, cw * 0.65);
  const y = (v) => 4 + (chartH - 8) * (1 - (v - min) / range);
  const maxV = volume ? Math.max(...volume) : 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {[0.2, 0.4, 0.6, 0.8].map((p) => (
        <line key={p} x1="0" x2={w} y1={4 + (chartH - 8) * p} y2={4 + (chartH - 8) * p}
              stroke="currentColor" strokeOpacity="0.06" />
      ))}
      {data.map((c, i) => {
        const x = padX + i * cw + cw / 2;
        const isUp = c.c >= c.o;
        const col = isUp ? up : down;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" />
            <rect x={x - bw / 2} y={Math.min(y(c.o), y(c.c))} width={bw} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  fill={col} />
          </g>
        );
      })}
      {volume && volume.map((v, i) => {
        const x = padX + i * cw + cw / 2;
        const vh = (v / maxV) * (volH - 6);
        const isUp = data[i].c >= data[i].o;
        return <rect key={i} x={x - bw / 2} y={chartH + 12 + (volH - 6 - vh)} width={bw} height={vh}
                     fill={isUp ? up : down} opacity="0.4" />;
      })}
    </svg>
  );
}

// Donut/Pie
function Donut({ slices, size = 140, thickness = 26 }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth={thickness} />
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const off = (acc / total) * C;
        acc += s.value;
        return <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color}
                       strokeWidth={thickness} strokeDasharray={`${len} ${C}`} strokeDashoffset={-off}
                       transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="butt" />;
      })}
    </svg>
  );
}

// Bars
function Bars({ data, w = 600, h = 160, color = 'currentColor' }) {
  const max = Math.max(...data.map(d => Math.abs(d.v))) || 1;
  const bw = (w - 4) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {data.map((d, i) => {
        const bh = Math.abs(d.v) / max * (h - 24);
        return (
          <g key={i}>
            <rect x={2 + i * bw + bw * 0.15} y={h - 18 - bh} width={bw * 0.7} height={bh} fill={d.color || color} rx="1" />
            <text x={2 + i * bw + bw / 2} y={h - 4} fontSize="9" fill="currentColor" opacity="0.5" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Cmd+K palette (shared logic)
function CmdK({ open, onClose, lang, onNavigate }) {
  const [q, setQ] = React.useState('');
  React.useEffect(() => { if (open) setQ(''); }, [open]);
  if (!open) return null;
  const pages = [
    { k: 'overview', label: t(lang, 'overview') },
    { k: 'markets', label: t(lang, 'markets') },
    { k: 'positions', label: t(lang, 'positions') },
    { k: 'trades', label: t(lang, 'trades') },
    { k: 'notifications', label: t(lang, 'notifications') },
    { k: 'settings', label: t(lang, 'settings') },
    { k: 'ops', label: t(lang, 'ops') },
  ];
  const actions = [
    { k: 'add-trade', label: t(lang, 'addTrade') },
    { k: 'add-alert', label: t(lang, 'alert') + ' +' },
    { k: 'refetch-news', label: t(lang, 'refetchNews') },
    { k: 'recalc', label: t(lang, 'recalcPos') },
  ];
  const assets = [...SYMBOLS, ...CRYPTO].filter(a => !q || (a.sym + ' ' + a.name).toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}>
      <div onClick={(e) => e.stopPropagation()} className="cmdk-shell" style={{ width: 540, maxWidth: '90%', background: 'var(--surface)', color: 'var(--fg)', borderRadius: 'var(--radius, 8px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ opacity: 0.5, fontSize: 14 }}>⌘</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, 'cmdkPlaceholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 15, fontFamily: 'inherit' }} />
          <kbd style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', opacity: 0.5 }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
          <CmdKGroup title={t(lang, 'cmdkPages')} items={pages.filter(p => !q || p.label.toLowerCase().includes(q.toLowerCase()))} onPick={(k) => { onNavigate(k); onClose(); }} icon="→" />
          <CmdKGroup title={t(lang, 'cmdkActions')} items={actions.filter(a => !q || a.label.toLowerCase().includes(q.toLowerCase()))} onPick={onClose} icon="⚡" />
          <CmdKGroup title={t(lang, 'cmdkAssets')} items={assets.map(a => ({ k: a.sym, label: a.sym + ' · ' + a.name }))} onPick={onClose} icon="$" />
        </div>
      </div>
    </div>
  );
}

function CmdKGroup({ title, items, onPick, icon }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.5, padding: '8px 18px 4px' }}>{title}</div>
      {items.map((it) => (
        <button key={it.k} onClick={() => onPick(it.k)}
          className="cmdk-item"
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 18px', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}>
          <span style={{ width: 18, opacity: 0.5, fontSize: 12 }}>{icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// Toast (very small)
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--fg)', color: 'var(--bg)', padding: '8px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, zIndex: 80, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>{msg}</div>
  );
}

Object.assign(window, { LineChart, Candles, Donut, Bars, CmdK, Toast });
