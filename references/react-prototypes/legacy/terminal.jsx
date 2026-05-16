// Direction 1: BLOOMBERG TERMINAL — dense, monospace, dark, amber/green accents
// Compact rows, hard grid lines, ALL CAPS chrome.

const { SYMBOLS: S1, CRYPTO: C1, FX: FX1, BONDS: B1, POSITIONS: P1, TRADES: T1, NOTIFS: N1, NEWS: NE1, OPLOG: O1, genSeries: gs1, genCandles: gc1, fmtNum: fn1, fmtPct: fp1, t: tt1 } = window.STOCK_DATA;

function TerminalArtboard({ tweaks }) {
  const lang = tweaks.lang;
  const [page, setPage] = React.useState('overview');
  const [tab, setTab] = React.useState('stocks');
  const [cmdk, setCmdk] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const accent = tweaks.accent;
  const upClr = tweaks.upGreen ? '#00d97e' : '#e54545';
  const dnClr = tweaks.upGreen ? '#e54545' : '#00d97e';

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); }
      if (e.key === 'Escape') setCmdk(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isDark = tweaks.theme === 'dark';
  const rootStyle = {
    '--bg': isDark ? '#0a0a0a' : '#f4f1e8',
    '--surface': isDark ? '#121212' : '#fbf8ee',
    '--surface2': isDark ? '#1a1a1a' : '#f0ecd8',
    '--fg': isDark ? '#e8e4d2' : '#1a1610',
    '--fg-dim': isDark ? '#888070' : '#5a5040',
    '--fg-mute': isDark ? '#555040' : '#8a8070',
    '--border': isDark ? '#2a2620' : '#d4cdb0',
    '--accent': accent,
    '--up': upClr, '--dn': dnClr,
    background: 'var(--bg)', color: 'var(--fg)',
    fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", Menlo, monospace',
    fontSize: tweaks.density === 'compact' ? 11 : tweaks.density === 'comfy' ? 13 : 12,
    lineHeight: 1.5,
    height: '100%', display: 'flex', flexDirection: 'column',
  };

  const px = tweaks.density === 'compact' ? 4 : tweaks.density === 'comfy' ? 10 : 6;

  return (
    <div style={rootStyle}>
      {/* Top bar — terminal style */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ padding: `${px}px 14px`, borderRight: '1px solid var(--border)', fontWeight: 700, letterSpacing: 1, color: 'var(--accent)' }}>RSC&lt;TERM&gt;</div>
        {[
          { k: 'overview', n: '01' }, { k: 'markets', n: '02' }, { k: 'positions', n: '03' },
          { k: 'trades', n: '04' }, { k: 'notifications', n: '05' }, { k: 'settings', n: '06' },
          ...(tweaks.admin ? [{ k: 'ops', n: '99' }] : []),
        ].map((it) => (
          <button key={it.k} onClick={() => setPage(it.k)} style={{
            padding: `${px}px 12px`, borderRight: '1px solid var(--border)', background: page === it.k ? 'var(--accent)' : 'transparent',
            color: page === it.k ? '#000' : 'var(--fg-dim)', border: 0, borderRight: '1px solid var(--border)',
            fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: page === it.k ? 700 : 500,
          }}>
            <span style={{ opacity: 0.6, marginRight: 6 }}>{it.n}</span>{tt1(lang, it.k)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setCmdk(true)} style={{ padding: `${px}px 10px`, background: 'transparent', border: 0, color: 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>
          ⌘K {tt1(lang, 'search')}
        </button>
        <div style={{ padding: `${px}px 12px`, borderLeft: '1px solid var(--border)', color: 'var(--accent)' }}>● LIVE</div>
        <div style={{ padding: `${px}px 12px`, borderLeft: '1px solid var(--border)', color: 'var(--fg-dim)' }}>
          🔔 <span style={{ color: 'var(--up)', marginLeft: 4 }}>3</span>
        </div>
        <div style={{ padding: `${px}px 14px`, borderLeft: '1px solid var(--border)', color: 'var(--fg-dim)' }}>
          14:32:08 EDT
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {page === 'overview' && <TermOverview lang={lang} upClr={upClr} dnClr={dnClr} />}
        {page === 'markets' && <TermMarkets lang={lang} tab={tab} setTab={setTab} upClr={upClr} dnClr={dnClr} />}
        {page === 'positions' && <TermPositions lang={lang} upClr={upClr} dnClr={dnClr} />}
        {page === 'trades' && <TermTrades lang={lang} upClr={upClr} dnClr={dnClr} />}
        {page === 'notifications' && <TermNotifs lang={lang} />}
        {page === 'settings' && <TermSettings lang={lang} />}
        {page === 'ops' && <TermOps lang={lang} onAct={(m) => showToast(m)} />}
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--surface)', fontSize: 10.5, color: 'var(--fg-dim)', padding: '3px 14px', gap: 18, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        <span>SESS · S&P +0.42%</span>
        <span style={{ color: upClr }}>VIX 14.2 ▼</span>
        <span>10Y 4.218</span>
        <span>DXY 105.8</span>
        <div style={{ flex: 1 }} />
        <span>READY · {lang.toUpperCase()}</span>
      </div>

      <CmdK open={cmdk} onClose={() => setCmdk(false)} lang={lang} onNavigate={setPage} />
      <Toast msg={toast} />
    </div>
  );
}

function TermOverview({ lang, upClr, dnClr }) {
  const series = gs1(80, 1_000_000, 0.012, 5);
  const last = series[series.length - 1];
  const first = series[0];
  const ret = (last - first) / first * 100;
  const cells = [
    { l: tt1(lang, 'totalAssets'), v: '$' + fn1(last, 0), s: fp1(ret), up: ret >= 0 },
    { l: tt1(lang, 'todayPnl'), v: '+$12,481', s: '+1.04%', up: true },
    { l: tt1(lang, 'availableCash'), v: '$84,210', s: '8.4% ' + tt1(lang, 'allocations'), up: null },
    { l: tt1(lang, 'totalReturn'), v: fp1(ret), s: tt1(lang, 'annualized') + ' 18.4%', up: ret >= 0 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 0 }}>
      {/* Top KPI strip */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {cells.map((c, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--border)' : 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)' }}>{c.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{c.v}</div>
            <div style={{ fontSize: 11, color: c.up == null ? 'var(--fg-dim)' : c.up ? upClr : dnClr, marginTop: 2 }}>{c.s}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div style={{ gridColumn: '1 / 9', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '6px 12px', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', flex: 1 }}>// {tt1(lang, 'assetTrend')} · USD</div>
          {['1D','1W','1M','3M','6M','1Y','ALL'].map((p) => (
            <button key={p} style={{ padding: '6px 10px', background: p === '6M' ? 'var(--accent)' : 'transparent', color: p === '6M' ? '#000' : 'var(--fg-dim)', border: 0, borderLeft: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', textTransform: 'uppercase' }}>{p}</button>
          ))}
        </div>
        <div style={{ height: 200, padding: 8, color: 'var(--accent)' }}>
          <LineChart data={series} fill="var(--accent)" axis />
        </div>
      </div>

      {/* Allocation */}
      <div style={{ gridColumn: '9 / 13', borderBottom: '1px solid var(--border)', padding: '8px 12px' }}>
        <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', marginBottom: 6 }}>// {tt1(lang, 'allocation')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: 'var(--accent)' }}>
            <Donut size={120} thickness={20} slices={[
              { value: 52, color: '#ffb000' }, { value: 22, color: '#00d97e' },
              { value: 14, color: '#4ea1ff' }, { value: 8, color: '#a87cf3' }, { value: 4, color: '#888' },
            ]} />
          </div>
          <div style={{ flex: 1, fontSize: 11 }}>
            {[
              ['Equity', 52, '#ffb000'], ['Crypto', 22, '#00d97e'],
              ['FX', 14, '#4ea1ff'], ['Bonds', 8, '#a87cf3'], ['Cash', 4, '#888'],
            ].map(([n, v, c]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: c, marginRight: 6 }} /> {n}</span>
                <span style={{ color: 'var(--fg-dim)' }}>{v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div style={{ gridColumn: '1 / 7', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '6px 12px', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', borderBottom: '1px solid var(--border)' }}>// ★ {tt1(lang, 'watchlist')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>
            {S1.filter(s => s.star).concat(C1.filter(c => c.star)).map((s) => (
              <tr key={s.sym} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 12px', color: 'var(--accent)', fontWeight: 600 }}>{s.sym}</td>
                <td style={{ padding: '5px 0', color: 'var(--fg-dim)' }}>{s.name}</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fn1(s.price)}</td>
                <td style={{ padding: '5px 12px', textAlign: 'right', color: s.chgPct >= 0 ? upClr : dnClr, width: 70 }}>{fp1(s.chgPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* News */}
      <div style={{ gridColumn: '7 / 13', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '6px 12px', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', borderBottom: '1px solid var(--border)' }}>// {tt1(lang, 'news')}</div>
        {NE1.map((n, i) => (
          <div key={i} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, fontSize: 11 }}>
            <span style={{ color: 'var(--accent)', width: 60, flexShrink: 0 }}>{n.src}</span>
            <span style={{ flex: 1 }}>{n.t}</span>
            <span style={{ color: 'var(--fg-mute)', width: 40, textAlign: 'right' }}>{n.time}</span>
          </div>
        ))}
      </div>

      {/* Recent trades */}
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ padding: '6px 12px', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', borderBottom: '1px solid var(--border)' }}>// {tt1(lang, 'recentTrades')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>
            {T1.slice(0, 5).map((tr, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 12px', color: 'var(--fg-dim)', width: 100 }}>{tr.d}</td>
                <td style={{ padding: '5px 0', color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--accent)', width: 50, fontWeight: 600 }}>{tr.type}</td>
                <td style={{ padding: '5px 0' }}>{tr.sym}</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{tr.qty}</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fn1(tr.px)}</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fn1(tr.qty * tr.px)}</td>
                <td style={{ padding: '5px 12px', color: 'var(--fg-mute)' }}>{tr.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TermMarkets({ lang, tab, setTab, upClr, dnClr }) {
  const data = tab === 'stocks' ? S1 : tab === 'crypto' ? C1 : tab === 'forex' ? FX1 : B1;
  const isB = tab === 'bonds';
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {['stocks','forex','crypto','bonds','watchlist'].map((k) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 16px', background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#000' : 'var(--fg-dim)', border: 0, borderRight: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, cursor: 'pointer' }}>
            {tt1(lang, k)}
          </button>
        ))}
        <div style={{ flex: 1, borderRight: '1px solid var(--border)' }} />
        <input placeholder={tt1(lang, 'search')} style={{ background: 'var(--surface)', border: 0, borderRight: '1px solid var(--border)', color: 'inherit', fontFamily: 'inherit', fontSize: 11, padding: '0 12px', outline: 'none', width: 200 }} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <th style={{ textAlign: 'left', padding: '5px 12px' }}>★</th>
            <th style={{ textAlign: 'left', padding: '5px 0' }}>{tt1(lang, 'symbol')}</th>
            <th style={{ textAlign: 'left' }}>{tt1(lang, 'name')}</th>
            {isB && <th>Country</th>}
            <th style={{ textAlign: 'right', padding: '5px 12px' }}>{isB ? 'Yield' : tt1(lang, 'price')}</th>
            <th style={{ textAlign: 'right', padding: '5px 12px' }}>{tt1(lang, 'change')}</th>
            {!isB && <th style={{ textAlign: 'right', padding: '5px 12px' }}>{tt1(lang, 'volume')}</th>}
            {!isB && <th style={{ textAlign: 'right', padding: '5px 12px' }}>{tt1(lang, 'high')}</th>}
            {!isB && <th style={{ textAlign: 'right', padding: '5px 12px' }}>{tt1(lang, 'low')}</th>}
            <th style={{ width: 40 }}>🔔</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const ch = row.chgPct ?? row.chg;
            return (
              <tr key={row.sym} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 12px', color: row.star ? '#ffb000' : 'var(--fg-mute)' }}>★</td>
                <td style={{ padding: '5px 0', color: 'var(--accent)', fontWeight: 600 }}>{row.sym}</td>
                <td style={{ color: 'var(--fg-dim)' }}>{row.name}</td>
                {isB && <td>{row.country}</td>}
                <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(row.price ?? row.yield, isB ? 3 : 2)}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px', color: ch >= 0 ? upClr : dnClr }}>{fp1(ch)}</td>
                {!isB && <td style={{ textAlign: 'right', padding: '5px 12px', color: 'var(--fg-dim)' }}>{row.vol}</td>}
                {!isB && <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(row.high)}</td>}
                {!isB && <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(row.low)}</td>}
                <td style={{ textAlign: 'center', color: 'var(--fg-mute)' }}>○</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tab === 'bonds' && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', marginBottom: 8 }}>// YIELD CURVE — by country</div>
          <div style={{ height: 140, color: 'var(--accent)' }}>
            <Bars data={B1.map(b => ({ label: b.country, v: b.yield, color: '#ffb000' }))} />
          </div>
        </div>
      )}

      {/* Symbol detail strip preview */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: 'var(--surface)' }}>
        <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)' }}>// NVDA · NVIDIA · CHART</div>
        <div style={{ height: 220, marginTop: 6 }}>
          <Candles data={gc1(50, 1100, 0.018, 7)} up={upClr} down={dnClr} volume={gs1(50, 30_000_000, 0.4, 12)} />
        </div>
      </div>
    </div>
  );
}

function TermPositions({ lang, upClr, dnClr }) {
  const totalCost = P1.reduce((s, p) => s + p.qty * p.avg, 0);
  const totalVal = P1.reduce((s, p) => s + p.qty * p.price, 0);
  const pnl = totalVal - totalCost;
  const roi = pnl / totalCost * 100;
  const kpis = [
    [tt1(lang, 'mktValue'), '$' + fn1(totalVal, 0)],
    ['Cost', '$' + fn1(totalCost, 0)],
    [tt1(lang, 'unrealized'), '$' + fn1(pnl, 0), pnl >= 0],
    [tt1(lang, 'roi'), fp1(roi), roi >= 0],
    [tt1(lang, 'sharpe'), '1.84'],
    [tt1(lang, 'annualized'), '+18.4%', true],
    [tt1(lang, 'maxDd'), '-12.4%', false],
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRight: i < 6 ? '1px solid var(--border)' : 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)' }}>{k[0]}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, fontVariantNumeric: 'tabular-nums', color: k[2] === undefined ? 'var(--fg)' : k[2] ? upClr : dnClr }}>{k[1]}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 160, padding: 8, color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>
        <LineChart data={gs1(120, 800_000, 0.011, 11)} fill="var(--accent)" axis />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <th style={{ textAlign: 'left', padding: '6px 12px' }}>{tt1(lang, 'symbol')}</th>
            <th style={{ textAlign: 'left' }}>{tt1(lang, 'name')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'qty')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'avgCost')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'price')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'mktValue')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>P&L</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'weight')}</th>
          </tr>
        </thead>
        <tbody>
          {P1.map((p) => {
            const v = p.qty * p.price; const c = p.qty * p.avg; const d = v - c; const pct = d / c * 100;
            const w = v / totalVal * 100;
            return (
              <tr key={p.sym} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 12px', color: 'var(--accent)', fontWeight: 600 }}>{p.sym}</td>
                <td style={{ color: 'var(--fg-dim)' }}>{p.name}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px' }}>{p.qty}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px', color: 'var(--fg-dim)' }}>{fn1(p.avg)}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(p.price)}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(v, 0)}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px', color: d >= 0 ? upClr : dnClr }}>{fp1(pct)}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px', color: 'var(--fg-dim)' }}>
                  <div style={{ display: 'inline-block', width: 50, height: 6, background: 'var(--border)', position: 'relative', verticalAlign: 'middle', marginRight: 6 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: 'var(--accent)' }} />
                  </div>
                  {w.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TermTrades({ lang, upClr, dnClr }) {
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: 8, gap: 8 }}>
        <input placeholder={tt1(lang, 'date') + ' >='} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'inherit', fontFamily: 'inherit', fontSize: 11, padding: '4px 8px', outline: 'none' }} defaultValue="2026-01-01" />
        <select style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'inherit', fontFamily: 'inherit', fontSize: 11, padding: '4px 8px' }}><option>ALL TYPES</option><option>BUY</option><option>SELL</option><option>DIV</option></select>
        <input placeholder={tt1(lang, 'symbol')} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'inherit', fontFamily: 'inherit', fontSize: 11, padding: '4px 8px', outline: 'none' }} />
        <div style={{ flex: 1 }} />
        <button style={{ background: 'var(--accent)', color: '#000', border: 0, padding: '4px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, cursor: 'pointer' }}>+ {tt1(lang, 'addTrade')}</button>
        <button style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-dim)', padding: '4px 12px', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, cursor: 'pointer' }}>{tt1(lang, 'export')}</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <th style={{ textAlign: 'left', padding: '6px 12px' }}>{tt1(lang, 'date')}</th>
            <th style={{ textAlign: 'left' }}>{tt1(lang, 'type')}</th>
            <th style={{ textAlign: 'left' }}>{tt1(lang, 'symbol')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'qty')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'price')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'total')}</th>
            <th style={{ textAlign: 'right', padding: '6px 12px' }}>{tt1(lang, 'fee')}</th>
            <th style={{ textAlign: 'left', padding: '6px 12px' }}>{tt1(lang, 'notes')}</th>
          </tr>
        </thead>
        <tbody>
          {T1.map((tr, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '5px 12px', color: 'var(--fg-dim)' }}>{tr.d}</td>
              <td style={{ color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--accent)', fontWeight: 600 }}>{tr.type}</td>
              <td style={{ color: 'var(--accent)' }}>{tr.sym}</td>
              <td style={{ textAlign: 'right', padding: '5px 12px' }}>{tr.qty}</td>
              <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(tr.px)}</td>
              <td style={{ textAlign: 'right', padding: '5px 12px' }}>{fn1(tr.qty * tr.px, 0)}</td>
              <td style={{ textAlign: 'right', padding: '5px 12px', color: 'var(--fg-dim)' }}>{tr.fee}</td>
              <td style={{ padding: '5px 12px', color: 'var(--fg-dim)' }}>{tr.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TermNotifs({ lang }) {
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '8px 12px', gap: 12, alignItems: 'center' }}>
        <span style={{ color: 'var(--accent)' }}>● 3 {tt1(lang, 'unread')}</span>
        <div style={{ flex: 1 }} />
        <button style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-dim)', padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer' }}>{tt1(lang, 'markRead')}</button>
        <button style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-dim)', padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer' }}>{tt1(lang, 'clearAll')}</button>
      </div>
      {N1.map((n) => (
        <div key={n.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, background: n.unread ? 'rgba(255,176,0,0.04)' : 'transparent' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.unread ? 'var(--accent)' : 'var(--border)', marginTop: 5, flexShrink: 0 }} />
          <span style={{ color: 'var(--fg-mute)', textTransform: 'uppercase', fontSize: 9, width: 60, paddingTop: 2 }}>{n.type}</span>
          {n.sym && <span style={{ color: 'var(--accent)', fontWeight: 600, width: 70 }}>{n.sym}</span>}
          <span style={{ flex: 1 }}>{n.text}</span>
          <span style={{ color: 'var(--fg-mute)' }}>{n.time}</span>
        </div>
      ))}
    </div>
  );
}

function TermSettings({ lang }) {
  const [tab, setTab] = React.useState('profile');
  const tabs = ['profile','security','notifPref','display','data'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr' }}>
      <div style={{ borderRight: '1px solid var(--border)', minHeight: 400 }}>
        {tabs.map(k => (
          <button key={k} onClick={() => setTab(k)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#000' : 'var(--fg-dim)', border: 0, borderBottom: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, cursor: 'pointer' }}>
            {tt1(lang, k)}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {tab === 'profile' && (
          <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
            <Field label="Username" v="trader_42" />
            <Field label="Email" v="trader@example.com" />
            <Field label="Timezone" v="Asia/Taipei" />
            <Field label={tt1(lang, 'language')} v={lang === 'zh' ? '繁體中文' : 'English'} />
          </div>
        )}
        {tab === 'security' && (
          <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
            <button style={termBtn}>{tt1(lang, 'changePassword')}</button>
            <button style={termBtn}>2FA · OFF</button>
            <button style={{ ...termBtn, color: 'var(--dn)', borderColor: 'var(--dn)' }}>{tt1(lang, 'signOutAll')}</button>
          </div>
        )}
        {tab === 'display' && (
          <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
            <Field label={tt1(lang, 'theme')} v="DARK" />
            <Field label={tt1(lang, 'currency')} v="USD" />
            <Field label={tt1(lang, 'numFormat')} v="1,234.56" />
          </div>
        )}
      </div>
    </div>
  );
}

const termBtn = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 12px', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, cursor: 'pointer', textAlign: 'left' };

function Field({ label, v }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', marginBottom: 3 }}>{label}</div>
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    </div>
  );
}

function TermOps({ lang, onAct }) {
  const [confirm, setConfirm] = React.useState(null);
  const acts = [
    { k: 'refetchNews', d: 'Force-pull from all news sources' },
    { k: 'refetchMkt', d: 'Re-pull all market quotes' },
    { k: 'recalcPos', d: 'Recompute holdings & cost basis' },
    { k: 'recalcRoi', d: 'Recompute ROI / Sharpe / drawdown' },
    { k: 'refetchBonds', d: 'Pull yield curves from Treasury feeds' },
    { k: 'reimportKline', d: 'Re-ingest historical OHLCV (slow)' },
  ];
  const sys = [
    ['CPU', '32%', 0.32, '#00d97e'],
    ['MEM', '6.2/16 GB', 0.39, '#00d97e'],
    ['HEAP', '1.8/4 GB', 0.45, '#ffb000'],
    ['DB', '12/50', 0.24, '#00d97e'],
    ['WS', '847', 0.5, '#ffb000'],
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {sys.map(([n, v, p, c], i) => (
          <div key={n} style={{ padding: '10px 12px', borderRight: i < 4 ? '1px solid var(--border)' : 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)' }}>{n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            <div style={{ height: 4, background: 'var(--border)', marginTop: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (p * 100) + '%', background: c }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)', marginBottom: 8 }}>// {tt1(lang, 'syncOps')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {acts.map((a) => (
            <button key={a.k} onClick={() => setConfirm(a)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>▶ {tt1(lang, a.k)}</div>
              <div style={{ color: 'var(--fg-dim)', marginTop: 3, fontSize: 10 }}>{a.d}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '6px 14px', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fg-mute)' }}>// {tt1(lang, 'oplog')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
          <tbody>
            {O1.map((o, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '5px 12px', color: 'var(--fg-dim)' }}>{o.d}</td>
                <td>{o.op}</td>
                <td style={{ color: 'var(--fg-mute)' }}>{o.who}</td>
                <td style={{ color: o.ok ? 'var(--up)' : 'var(--dn)', fontWeight: 600 }}>{o.ok ? 'OK' : 'FAIL'}</td>
                <td style={{ textAlign: 'right', padding: '5px 12px', color: 'var(--fg-dim)' }}>{o.dur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirm && (
        <div onClick={() => setConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--accent)', padding: 20, width: 360 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.6 }}>// CONFIRM</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{tt1(lang, confirm.k)}</div>
            <div style={{ color: 'var(--fg-dim)', marginTop: 6, fontSize: 11 }}>{confirm.d}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setConfirm(null)} style={{ ...termBtn, flex: 1 }}>CANCEL</button>
              <button onClick={() => { setConfirm(null); onAct(tt1(lang, confirm.k) + ' ✓'); }} style={{ background: 'var(--accent)', color: '#000', border: 0, padding: '8px 12px', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, cursor: 'pointer', flex: 1 }}>EXECUTE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.TerminalArtboard = TerminalArtboard;
