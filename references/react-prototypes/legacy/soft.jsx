// Direction 3: SOFT NEO-TECH — muted pastels, generous rounded radii,
// friendly serif/sans pairing, soft shadows. Warm and approachable but data-rich.

const { SYMBOLS: S3, CRYPTO: C3, FX: FX3, BONDS: B3, POSITIONS: P3, TRADES: T3, NOTIFS: N3, NEWS: NE3, OPLOG: O3, genSeries: gs3, genCandles: gc3, fmtNum: fn3, fmtPct: fp3, t: tt3 } = window.STOCK_DATA;

function SoftArtboard({ tweaks }) {
  const lang = tweaks.lang;
  const [page, setPage] = React.useState('overview');
  const [tab, setTab] = React.useState('stocks');
  const [cmdk, setCmdk] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const upClr = tweaks.upGreen ? '#34a880' : '#d97468';
  const dnClr = tweaks.upGreen ? '#d97468' : '#34a880';

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
    '--bg': isDark ? '#1a1815' : '#f5f1ea',
    '--surface': isDark ? '#26221d' : '#fdfaf3',
    '--surface2': isDark ? '#2e2a24' : '#ede7dc',
    '--fg': isDark ? '#f0e9dc' : '#2c2620',
    '--fg-dim': isDark ? '#b5ad9d' : '#6b6155',
    '--fg-mute': isDark ? '#7a7164' : '#a89c8b',
    '--border': isDark ? '#3a342c' : '#e0d7c5',
    '--accent': tweaks.accent,
    '--up': upClr, '--dn': dnClr,
    '--radius': '18px',
    background: 'var(--bg)', color: 'var(--fg)',
    fontFamily: '"Söhne", "Inter", system-ui, sans-serif',
    fontSize: tweaks.density === 'compact' ? 12.5 : tweaks.density === 'comfy' ? 14.5 : 13.5,
    height: '100%', display: 'flex',
  };

  const pad = tweaks.density === 'compact' ? 18 : tweaks.density === 'comfy' ? 32 : 24;
  const navItems = [
    { k: 'overview', l: tt3(lang, 'overview'), i: '◐' },
    { k: 'markets', l: tt3(lang, 'markets'), i: '⊞' },
    { k: 'positions', l: tt3(lang, 'positions'), i: '◇' },
    { k: 'trades', l: tt3(lang, 'trades'), i: '⇄' },
    { k: 'notifications', l: tt3(lang, 'notifications'), i: '◉' },
    { k: 'settings', l: tt3(lang, 'settings'), i: '⚙' },
  ];
  if (tweaks.admin) navItems.push({ k: 'ops', l: tt3(lang, 'ops'), i: '◈' });

  return (
    <div style={rootStyle}>
      {/* Side rail */}
      <div style={{ width: 220, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', padding: '20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 18px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontFamily: '"Fraunces", serif' }}>r</div>
          <div>
            <div style={{ fontFamily: '"Fraunces", "Crimson Pro", Georgia, serif', fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>Resource</div>
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: 0.4 }}>v2 · {lang.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(it => (
            <button key={it.k} onClick={() => setPage(it.k)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12, background: page === it.k ? 'var(--surface2)' : 'transparent', color: page === it.k ? 'var(--fg)' : 'var(--fg-dim)', border: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: page === it.k ? 600 : 500, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: page === it.k ? 'var(--accent)' : 'var(--fg-mute)', fontSize: 14 }}>{it.i}</span>
              {it.l}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCmdk(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface2)', border: 0, borderRadius: 10, color: 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
          <span>🔍</span><span style={{ flex: 1, textAlign: 'left' }}>{tt3(lang, 'search')}</span>
          <kbd style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'var(--surface)', color: 'var(--fg-dim)' }}>⌘K</kbd>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 6px 0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>JL</div>
          <div style={{ flex: 1, fontSize: 12 }}><div style={{ fontWeight: 500 }}>Justin</div></div>
          <span style={{ fontSize: 12, color: 'var(--accent)', position: 'relative' }}>🔔<span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span></span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {page === 'overview' && <SoftOverview lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} />}
        {page === 'markets' && <SoftMarkets lang={lang} pad={pad} tab={tab} setTab={setTab} upClr={upClr} dnClr={dnClr} />}
        {page === 'positions' && <SoftPositions lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} />}
        {page === 'trades' && <SoftTrades lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} />}
        {page === 'notifications' && <SoftNotifs lang={lang} pad={pad} />}
        {page === 'settings' && <SoftSettings lang={lang} pad={pad} />}
        {page === 'ops' && <SoftOps lang={lang} pad={pad} onAct={showToast} />}
      </div>

      <CmdK open={cmdk} onClose={() => setCmdk(false)} lang={lang} onNavigate={setPage} />
      <Toast msg={toast} />
    </div>
  );
}

const softCard = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 8px 24px -16px rgba(0,0,0,0.08)' };
const softHead = { fontFamily: '"Fraunces", "Crimson Pro", Georgia, serif', letterSpacing: -0.4 };

function SoftOverview({ lang, pad, upClr, dnClr }) {
  const series = gs3(80, 1_000_000, 0.012, 5);
  const last = series[series.length - 1];
  const ret = (last - series[0]) / series[0] * 100;
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
      <div style={{ gridColumn: 'span 12', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{tt3(lang, 'goodMorning')}, Justin</div>
          <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: '4px 0 0' }}>{tt3(lang, 'overview')}</h1>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Wed · Apr 30 · 14:32 EDT</div>
      </div>

      {/* Hero card — total assets */}
      <div style={{ ...softCard, gridColumn: 'span 8', padding: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', opacity: 0.18, borderRadius: '50%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{tt3(lang, 'totalAssets')}</div>
            <div style={{ ...softHead, fontSize: 38, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>${fn3(last, 0)}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5 }}>
              <span style={{ color: upClr, display: 'flex', alignItems: 'center', gap: 4 }}>↗ +$12,481 today</span>
              <span style={{ color: 'var(--fg-dim)' }}>{tt3(lang, 'totalReturn')} <strong style={{ color: 'var(--fg)' }}>{fp3(ret)}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 99, padding: 3 }}>
            {['1D','1W','1M','3M','6M','1Y','All'].map((r, i) => (
              <button key={r} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 500, background: i === 4 ? 'var(--surface)' : 'transparent', border: 0, borderRadius: 99, color: 'var(--fg)', cursor: 'pointer', fontFamily: 'inherit' }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 180, color: 'var(--accent)' }}>
          <LineChart data={series} fill="var(--accent)" axis />
        </div>
      </div>

      {/* Stack of 3 KPIs */}
      <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          [tt3(lang, 'todayPnl'), '+$12,481', '+1.04%', upClr],
          [tt3(lang, 'availableCash'), '$84,210', '8.4% ' + tt3(lang, 'allocations'), null],
          [tt3(lang, 'winRate'), '68%', '34/50 ' + tt3(lang, 'trades'), upClr],
        ].map(([l, v, s, c]) => (
          <div key={l} style={{ ...softCard, padding: '16px 18px', flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
            <div style={{ ...softHead, fontSize: 22, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            <div style={{ fontSize: 11.5, color: c || 'var(--fg-dim)', marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Allocation */}
      <div style={{ ...softCard, gridColumn: 'span 4', padding: 22 }}>
        <div style={{ ...softHead, fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{tt3(lang, 'allocation')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: 'var(--accent)' }}>
            <Donut size={120} thickness={20} slices={[
              { value: 52, color: '#d4956b' }, { value: 22, color: '#88a395' },
              { value: 14, color: '#a89bc6' }, { value: 8, color: '#d9c97a' }, { value: 4, color: '#c4b8a8' },
            ]} />
          </div>
          <div style={{ flex: 1, fontSize: 12 }}>
            {[
              ['Equity', 52, '#d4956b'], ['Crypto', 22, '#88a395'],
              ['FX', 14, '#a89bc6'], ['Bonds', 8, '#d9c97a'], ['Cash', 4, '#c4b8a8'],
            ].map(([n, v, c]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />{n}</span>
                <span style={{ color: 'var(--fg-dim)' }}>{v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div style={{ ...softCard, gridColumn: 'span 4', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ ...softHead, fontSize: 16, fontWeight: 600 }}>★ {tt3(lang, 'watchlist')}</div>
        </div>
        {S3.filter(s => s.star).concat(C3.filter(c => c.star)).map(s => (
          <div key={s.sym} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderTop: '1px dashed var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.sym}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>{s.name}</div>
            </div>
            <div style={{ width: 50, height: 18, color: s.chgPct >= 0 ? upClr : dnClr, marginRight: 10 }}>
              <LineChart data={gs3(20, s.price, 0.02, s.sym.charCodeAt(0))} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 12.5 }}>{fn3(s.price)}</div>
              <div style={{ fontSize: 10.5, color: s.chgPct >= 0 ? upClr : dnClr }}>{fp3(s.chgPct)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* News */}
      <div style={{ ...softCard, gridColumn: 'span 4', padding: 22 }}>
        <div style={{ ...softHead, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{tt3(lang, 'news')}</div>
        {NE3.slice(0, 4).map((n, i) => (
          <div key={i} style={{ padding: '10px 0', borderTop: '1px dashed var(--border)' }}>
            <div style={{ display: 'flex', gap: 6, fontSize: 10.5, color: 'var(--fg-dim)', marginBottom: 3 }}>
              <span style={{ fontWeight: 500 }}>{n.src}</span><span>·</span><span>{n.time}</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{n.t}</div>
          </div>
        ))}
      </div>

      {/* Recent trades + quick action */}
      <div style={{ ...softCard, gridColumn: 'span 12', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ ...softHead, fontSize: 16, fontWeight: 600 }}>{tt3(lang, 'recentTrades')}</div>
          <button style={{ background: 'var(--accent)', color: '#fff', border: 0, padding: '7px 16px', borderRadius: 99, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>+ {tt3(lang, 'addTrade')}</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', fontSize: 10.5, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={{ padding: '8px 0', fontWeight: 500 }}>{tt3(lang, 'date')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'type')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'total')}</th>
            </tr>
          </thead>
          <tbody>
            {T3.slice(0, 5).map((tr, i) => (
              <tr key={i} style={{ borderTop: '1px dashed var(--border)' }}>
                <td style={{ padding: '9px 0', color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{tr.d}</td>
                <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 500, background: tr.type === 'BUY' ? 'rgba(52,168,128,0.15)' : tr.type === 'SELL' ? 'rgba(217,116,104,0.15)' : 'var(--surface2)', color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--fg-dim)' }}>{tr.type}</span></td>
                <td style={{ fontWeight: 500 }}>{tr.sym}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tr.qty}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn3(tr.px)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn3(tr.qty * tr.px, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoftMarkets({ lang, pad, tab, setTab, upClr, dnClr }) {
  const data = tab === 'stocks' ? S3 : tab === 'crypto' ? C3 : tab === 'forex' ? FX3 : B3;
  const isB = tab === 'bonds';
  return (
    <div style={{ padding: pad }}>
      <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: '0 0 4px' }}>{tt3(lang, 'markets')}</h1>
      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 20 }}>Browse, search and ★ watch any asset</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['stocks','forex','crypto','bonds','watchlist'].map(k => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 16px', background: tab === k ? 'var(--accent)' : 'var(--surface)', color: tab === k ? '#fff' : 'var(--fg-dim)', border: 0, borderRadius: 99, fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 600 : 500, cursor: 'pointer' }}>{tt3(lang, k)}</button>
        ))}
      </div>
      <div style={{ ...softCard, padding: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', fontSize: 10.5, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={{ padding: '10px 16px', fontWeight: 500, width: 36 }}></th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'name')}</th>
              {isB && <th style={{ fontWeight: 500 }}>Country</th>}
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{isB ? 'Yield' : tt3(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'change')}</th>
              {!isB && <th style={{ fontWeight: 500, textAlign: 'right' }}>Trend</th>}
              <th style={{ fontWeight: 500, paddingRight: 16, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const ch = row.chgPct ?? row.chg;
              return (
                <tr key={row.sym} style={{ borderTop: i ? '1px dashed var(--border)' : 0 }}>
                  <td style={{ padding: '11px 16px', color: row.star ? '#d9b56b' : 'var(--fg-mute)', fontSize: 14, cursor: 'pointer' }}>★</td>
                  <td style={{ fontWeight: 600 }}>{row.sym}</td>
                  <td style={{ color: 'var(--fg-dim)' }}>{row.name}</td>
                  {isB && <td><span style={{ padding: '2px 8px', background: 'var(--surface2)', borderRadius: 99, fontSize: 10.5 }}>{row.country}</span></td>}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fn3(row.price ?? row.yield, isB ? 3 : 2)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ch >= 0 ? upClr : dnClr }}>{fp3(ch)}</td>
                  {!isB && <td style={{ textAlign: 'right' }}><div style={{ display: 'inline-block', width: 70, height: 22, color: ch >= 0 ? upClr : dnClr }}><LineChart data={gs3(20, row.price || 100, 0.02, row.sym.charCodeAt(0))} /></div></td>}
                  <td style={{ textAlign: 'right', paddingRight: 16, color: 'var(--fg-mute)', fontSize: 13 }}>🔔</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoftPositions({ lang, pad, upClr, dnClr }) {
  const totalCost = P3.reduce((s, p) => s + p.qty * p.avg, 0);
  const totalVal = P3.reduce((s, p) => s + p.qty * p.price, 0);
  const pnl = totalVal - totalCost;
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
      <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: 0, gridColumn: 'span 12' }}>{tt3(lang, 'positions')}</h1>
      {[
        [tt3(lang, 'mktValue'), '$' + fn3(totalVal, 0), null],
        [tt3(lang, 'unrealized'), '$' + fn3(pnl, 0), pnl >= 0],
        [tt3(lang, 'roi'), fp3(pnl/totalCost*100), pnl >= 0],
        [tt3(lang, 'sharpe'), '1.84', null],
        [tt3(lang, 'annualized'), '+18.4%', true],
        [tt3(lang, 'maxDd'), '-12.4%', false],
      ].map(([l, v, up], i) => (
        <div key={i} style={{ ...softCard, gridColumn: 'span 2', padding: '14px 16px' }}>
          <div style={{ color: 'var(--fg-dim)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
          <div style={{ ...softHead, fontSize: 18, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: up == null ? 'var(--fg)' : up ? upClr : dnClr }}>{v}</div>
        </div>
      ))}
      <div style={{ ...softCard, gridColumn: 'span 12', padding: 22, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', fontSize: 10.5, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={{ padding: '0 0 10px', fontWeight: 500 }}>{tt3(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'name')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'avgCost')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'mktValue')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>P&L %</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'weight')}</th>
            </tr>
          </thead>
          <tbody>
            {P3.map(p => {
              const v = p.qty * p.price; const c = p.qty * p.avg; const d = v - c; const pct = d/c*100; const w = v/totalVal*100;
              return (
                <tr key={p.sym} style={{ borderTop: '1px dashed var(--border)' }}>
                  <td style={{ padding: '11px 0', fontWeight: 600 }}>{p.sym}</td>
                  <td style={{ color: 'var(--fg-dim)' }}>{p.name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.qty}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--fg-dim)' }}>${fn3(p.avg)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn3(p.price)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn3(v, 0)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: d >= 0 ? upClr : dnClr }}>{fp3(pct)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 56, height: 5, background: 'var(--surface2)', borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: 'var(--accent)', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', minWidth: 32, textAlign: 'right' }}>{w.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoftTrades({ lang, pad, upClr, dnClr }) {
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: 0 }}>{tt3(lang, 'trades')}</h1>
        <button style={{ background: 'var(--accent)', color: '#fff', border: 0, padding: '9px 18px', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>+ {tt3(lang, 'addTrade')}</button>
      </div>
      <div style={{ ...softCard, padding: 22 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--fg-dim)', fontSize: 10.5, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={{ padding: '0 0 10px', fontWeight: 500 }}>{tt3(lang, 'date')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'type')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt3(lang, 'total')}</th>
              <th style={{ fontWeight: 500 }}>{tt3(lang, 'notes')}</th>
            </tr>
          </thead>
          <tbody>
            {T3.map((tr, i) => (
              <tr key={i} style={{ borderTop: '1px dashed var(--border)' }}>
                <td style={{ padding: '11px 0', color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{tr.d}</td>
                <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 500, background: tr.type === 'BUY' ? 'rgba(52,168,128,0.15)' : tr.type === 'SELL' ? 'rgba(217,116,104,0.15)' : 'var(--surface2)', color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--fg-dim)' }}>{tr.type}</span></td>
                <td style={{ fontWeight: 600 }}>{tr.sym}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tr.qty}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn3(tr.px)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn3(tr.qty * tr.px, 0)}</td>
                <td style={{ color: 'var(--fg-dim)' }}>{tr.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoftNotifs({ lang, pad }) {
  return (
    <div style={{ padding: pad }}>
      <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: '0 0 4px' }}>{tt3(lang, 'notifications')}</h1>
      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 20 }}>3 {tt3(lang, 'unread')}</div>
      <div style={{ ...softCard, padding: 8 }}>
        {N3.map((n, i) => (
          <div key={n.id} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderTop: i ? '1px dashed var(--border)' : 0, alignItems: 'flex-start' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: n.type === 'alert' ? 'rgba(52,168,128,0.12)' : n.type === 'news' ? 'var(--surface2)' : 'rgba(168,155,198,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {n.type === 'alert' ? '🔔' : n.type === 'news' ? '📰' : '⚙'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.sym && <strong>{n.sym} · </strong>}{n.text}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>{n.time} ago</div>
            </div>
            {n.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 14 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SoftSettings({ lang, pad }) {
  const [tab, setTab] = React.useState('profile');
  const tabs = [['profile','👤'],['security','🔒'],['notifPref','🔔'],['display','🎨'],['data','💾']];
  return (
    <div style={{ padding: pad }}>
      <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: '0 0 18px' }}>{tt3(lang, 'settings')}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tabs.map(([k, ic]) => (
            <button key={k} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 12, background: tab === k ? 'var(--surface)' : 'transparent', color: tab === k ? 'var(--fg)' : 'var(--fg-dim)', border: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 600 : 500, cursor: 'pointer', textAlign: 'left' }}>
              <span>{ic}</span>{tt3(lang, k)}
            </button>
          ))}
        </div>
        <div style={{ ...softCard, padding: 24 }}>
          {tab === 'profile' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: '#fff' }}>JL</div>
                <div>
                  <div style={{ ...softHead, fontSize: 18, fontWeight: 600 }}>Justin Lin</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>justin.lin@example.com · UTC+8</div>
                </div>
              </div>
              {[['Display name', 'Justin Lin'], ['Email', 'justin.lin@example.com'], ['Timezone', 'Asia/Taipei'], [tt3(lang, 'language'), lang === 'zh' ? '繁體中文' : 'English']].map(([l, v]) => (
                <div key={l} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 13 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'display' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{tt3(lang, 'theme')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Light','Dark','System'].map((x, i) => <button key={x} style={{ padding: '8px 16px', background: i === 1 ? 'var(--accent)' : 'var(--surface2)', color: i === 1 ? '#fff' : 'var(--fg)', border: 0, borderRadius: 99, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>{x}</button>)}
                </div>
              </div>
              <div><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{tt3(lang, 'currency')}</div>
                <select style={{ background: 'var(--surface2)', border: 0, borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}><option>USD</option><option>TWD</option></select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SoftOps({ lang, pad, onAct }) {
  const [confirm, setConfirm] = React.useState(null);
  const sys = [['CPU', '32%', 0.32], ['Memory', '6.2/16G', 0.39], ['Heap', '1.8/4G', 0.45], ['DB', '12/50', 0.24], ['WS', '847', 0.5]];
  const acts = [['refetchNews','Re-pull all news'], ['refetchMkt','Re-pull market quotes'], ['recalcPos','Recompute holdings'], ['recalcRoi','Recompute metrics'], ['refetchBonds','Pull yield curves'], ['reimportKline','Re-ingest OHLCV']];
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
      <h1 style={{ ...softHead, fontSize: 30, fontWeight: 600, margin: 0, gridColumn: 'span 12' }}>{tt3(lang, 'ops')}</h1>
      {sys.map(([n, v, p], i) => (
        <div key={n} style={{ ...softCard, gridColumn: 'span 2', padding: 16 }}>
          <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{n}</div>
          <div style={{ ...softHead, fontSize: 16, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (p*100)+'%', background: p > 0.7 ? '#d9b56b' : 'var(--accent)', borderRadius: 99 }} />
          </div>
        </div>
      ))}
      <div style={{ ...softCard, gridColumn: 'span 2', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--up)', marginBottom: 4 }} />
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Services</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--up)' }}>Healthy</div>
      </div>
      <div style={{ ...softCard, gridColumn: 'span 7', padding: 22 }}>
        <div style={{ ...softHead, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{tt3(lang, 'syncOps')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {acts.map(([k, d]) => (
            <button key={k} onClick={() => setConfirm({ k, d })} style={{ background: 'var(--surface2)', border: 0, borderRadius: 12, padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--fg)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{tt3(lang, k)}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 3 }}>{d}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ ...softCard, gridColumn: 'span 5', padding: 22 }}>
        <div style={{ ...softHead, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{tt3(lang, 'oplog')}</div>
        {O3.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px dashed var(--border)' : 0, fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.ok ? 'var(--up)' : 'var(--dn)', marginTop: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{o.op}</div>
              <div style={{ color: 'var(--fg-dim)', fontSize: 11, marginTop: 2 }}>{o.d} · {o.who} · {o.dur}</div>
            </div>
          </div>
        ))}
      </div>
      {confirm && (
        <div onClick={() => setConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...softCard, width: 380, padding: 24 }}>
            <div style={{ ...softHead, fontSize: 17, fontWeight: 600 }}>Confirm action</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>{tt3(lang, confirm.k)}</div>
            <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 4 }}>{confirm.d}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: 10, background: 'var(--surface2)', color: 'var(--fg)', border: 0, borderRadius: 99, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirm(null); onAct('✓ ' + tt3(lang, confirm.k)); }} style={{ flex: 1, padding: 10, background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 99, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Run</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.SoftArtboard = SoftArtboard;
