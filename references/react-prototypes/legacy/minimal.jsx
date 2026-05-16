// Direction 2: MODERN FINTECH MINIMAL — generous whitespace, refined sans-serif,
// single accent color, soft cards, clean lines. Light-default friendly.

const { SYMBOLS: S2, CRYPTO: C2, FX: FX2, BONDS: B2, POSITIONS: P2, TRADES: T2, NOTIFS: N2, NEWS: NE2, OPLOG: O2, genSeries: gs2, genCandles: gc2, fmtNum: fn2, fmtPct: fp2, t: tt2 } = window.STOCK_DATA;

function MinimalArtboard({ tweaks }) {
  const lang = tweaks.lang;
  const [page, setPage] = React.useState('overview');
  const [tab, setTab] = React.useState('stocks');
  const [cmdk, setCmdk] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const upClr = tweaks.upGreen ? '#16a34a' : '#dc2626';
  const dnClr = tweaks.upGreen ? '#dc2626' : '#16a34a';

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); }
      if (e.key === 'Escape') { setCmdk(false); setBell(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isDark = tweaks.theme === 'dark';
  const rootStyle = {
    '--bg': isDark ? '#0c0d10' : '#fafaf9',
    '--surface': isDark ? '#15171c' : '#ffffff',
    '--surface2': isDark ? '#1c1e25' : '#f4f3f0',
    '--fg': isDark ? '#e7e5e0' : '#15171c',
    '--fg-dim': isDark ? '#a8a59c' : '#52525b',
    '--fg-mute': isDark ? '#62605a' : '#a1a1aa',
    '--border': isDark ? '#262830' : '#e7e5e0',
    '--accent': tweaks.accent,
    '--up': upClr, '--dn': dnClr,
    '--radius': '12px',
    background: 'var(--bg)', color: 'var(--fg)',
    fontFamily: '"Söhne", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: tweaks.density === 'compact' ? 12 : tweaks.density === 'comfy' ? 14 : 13,
    height: '100%', display: 'flex', flexDirection: 'column',
    fontFeatureSettings: '"cv11", "ss01"',
  };

  const pad = tweaks.density === 'compact' ? 16 : tweaks.density === 'comfy' ? 28 : 22;
  const rowPy = tweaks.density === 'compact' ? 8 : tweaks.density === 'comfy' ? 14 : 11;

  const navItems = [
    { k: 'overview', l: tt2(lang, 'overview') }, { k: 'markets', l: tt2(lang, 'markets') },
    { k: 'positions', l: tt2(lang, 'positions') }, { k: 'trades', l: tt2(lang, 'trades') },
    { k: 'notifications', l: tt2(lang, 'notifications') }, { k: 'settings', l: tt2(lang, 'settings') },
  ];
  if (tweaks.admin) navItems.push({ k: 'ops', l: tt2(lang, 'ops') });

  return (
    <div style={rootStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${pad}px`, height: 60, borderBottom: '1px solid var(--border)', gap: 24, background: 'var(--surface)' }}>
        <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, background: 'var(--accent)', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>R</span>
          Resource
        </div>
        <nav style={{ display: 'flex', gap: 2 }}>
          {navItems.map((it) => (
            <button key={it.k} onClick={() => setPage(it.k)} style={{
              padding: '6px 12px', borderRadius: 6, background: page === it.k ? 'var(--surface2)' : 'transparent',
              color: page === it.k ? 'var(--fg)' : 'var(--fg-dim)', border: 0, fontFamily: 'inherit', fontSize: 13,
              fontWeight: page === it.k ? 600 : 500, cursor: 'pointer',
            }}>{it.l}</button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCmdk(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', minWidth: 220 }}>
          <span>🔍</span><span style={{ flex: 1, textAlign: 'left' }}>{tt2(lang, 'search')}</span>
          <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>⌘K</kbd>
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setBell(b => !b)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, borderRadius: 8, cursor: 'pointer', color: 'var(--fg-dim)', position: 'relative' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', border: '2px solid var(--surface)' }} />
          </button>
          {bell && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 44, right: 0, width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 20 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{tt2(lang, 'notifications')}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>3 {tt2(lang, 'unread')}</span>
              </div>
              {N2.slice(0, 4).map(n => (
                <div key={n.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: n.unread ? 'var(--accent)' : 'transparent', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12.5 }}>
                    {n.sym && <span style={{ fontWeight: 600, marginRight: 6 }}>{n.sym}</span>}
                    <span>{n.text}</span>
                    <div style={{ color: 'var(--fg-mute)', fontSize: 11, marginTop: 2 }}>{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>JL</div>
      </div>

      {/* Page */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {page === 'overview' && <MinOverview lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} />}
        {page === 'markets' && <MinMarkets lang={lang} pad={pad} tab={tab} setTab={setTab} upClr={upClr} dnClr={dnClr} rowPy={rowPy} />}
        {page === 'positions' && <MinPositions lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} rowPy={rowPy} />}
        {page === 'trades' && <MinTrades lang={lang} pad={pad} upClr={upClr} dnClr={dnClr} rowPy={rowPy} />}
        {page === 'notifications' && <MinNotifs lang={lang} pad={pad} />}
        {page === 'settings' && <MinSettings lang={lang} pad={pad} />}
        {page === 'ops' && <MinOps lang={lang} pad={pad} onAct={showToast} />}
      </div>

      <CmdK open={cmdk} onClose={() => setCmdk(false)} lang={lang} onNavigate={setPage} />
      <Toast msg={toast} />
    </div>
  );
}

const minCard = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' };

function MinOverview({ lang, pad, upClr, dnClr }) {
  const [range, setRange] = React.useState('6M');
  const series = gs2(80, 1_000_000, 0.012, 5);
  const last = series[series.length - 1];
  const ret = (last - series[0]) / series[0] * 100;
  const kpis = [
    { l: tt2(lang, 'totalAssets'), v: '$' + fn2(last, 0), s: '+1.04% ' + tt2(lang, 'yesterday'), up: true, big: true },
    { l: tt2(lang, 'todayPnl'), v: '+$12,481', s: '+1.04%', up: true },
    { l: tt2(lang, 'availableCash'), v: '$84,210', s: '8.4%', up: null },
    { l: tt2(lang, 'totalReturn'), v: fp2(ret), s: tt2(lang, 'annualized') + ' 18.4%', up: true },
  ];
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
      {kpis.map((k, i) => (
        <div key={i} style={{ ...minCard, gridColumn: 'span 3', padding: '18px 20px' }}>
          <div style={{ color: 'var(--fg-dim)', fontSize: 12 }}>{k.l}</div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: k.up == null ? 'var(--fg-dim)' : k.up ? upClr : dnClr, display: 'flex', alignItems: 'center', gap: 4 }}>
            {k.up != null && (k.up ? '↗' : '↘')} {k.s}
          </div>
        </div>
      ))}

      <div style={{ ...minCard, gridColumn: 'span 8', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{tt2(lang, 'assetTrend')}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{tt2(lang, 'totalReturn')} {fp2(ret)}</div>
          </div>
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2 }}>
            {['1D','1W','1M','3M','6M','1Y','All'].map(r => (
              <button key={r} onClick={() => setRange(r)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, background: range === r ? 'var(--surface)' : 'transparent', border: 0, borderRadius: 6, color: range === r ? 'var(--fg)' : 'var(--fg-dim)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: range === r ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 220, color: 'var(--accent)' }}>
          <LineChart data={series} fill="var(--accent)" axis />
        </div>
      </div>

      <div style={{ ...minCard, gridColumn: 'span 4', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{tt2(lang, 'allocation')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: 'var(--accent)' }}>
          <Donut size={150} thickness={22} slices={[
            { value: 52, color: 'var(--accent)' }, { value: 22, color: '#3b82f6' },
            { value: 14, color: '#a855f7' }, { value: 8, color: '#f59e0b' }, { value: 4, color: '#94a3b8' },
          ]} />
        </div>
        <div>
          {[
            ['Equity', 52, 'var(--accent)'], ['Crypto', 22, '#3b82f6'],
            ['FX', 14, '#a855f7'], ['Bonds', 8, '#f59e0b'], ['Cash', 4, '#94a3b8'],
          ].map(([n, v, c]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />{n}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--fg-dim)' }}>{v}%</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...minCard, gridColumn: 'span 6', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>★ {tt2(lang, 'watchlist')}</div>
          <button style={{ background: 'transparent', border: 0, color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer' }}>→</button>
        </div>
        {S2.filter(s => s.star).concat(C2.filter(c => c.star)).map(s => (
          <div key={s.sym} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'var(--surface2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{s.sym.slice(0, 2)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{s.sym}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{s.name}</div>
            </div>
            <div style={{ width: 70, height: 24, color: s.chgPct >= 0 ? upClr : dnClr }}>
              <LineChart data={gs2(20, s.price, 0.02, s.sym.charCodeAt(0))} />
            </div>
            <div style={{ textAlign: 'right', minWidth: 90 }}>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fn2(s.price)}</div>
              <div style={{ fontSize: 11, color: s.chgPct >= 0 ? upClr : dnClr, fontVariantNumeric: 'tabular-nums' }}>{fp2(s.chgPct)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...minCard, gridColumn: 'span 6', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{tt2(lang, 'news')}</div>
        {NE2.map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ width: 36, height: 36, background: 'var(--surface2)', borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fg-dim)', marginBottom: 3 }}>
                <span style={{ fontWeight: 500 }}>{n.src}</span>
                <span style={{ width: 3, height: 3, background: 'var(--fg-mute)', borderRadius: '50%' }} />
                <span>{n.time}</span>
                <span style={{ marginLeft: 'auto', padding: '1px 8px', background: 'var(--surface2)', borderRadius: 99, fontSize: 10, fontWeight: 500 }}>{n.tag}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.t}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...minCard, gridColumn: 'span 12', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{tt2(lang, 'recentTrades')}</div>
          <button style={{ background: 'var(--accent)', color: '#fff', border: 0, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>+ {tt2(lang, 'addTrade')}</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg-dim)', fontSize: 11, textAlign: 'left' }}>
              <th style={{ padding: '8px 0', fontWeight: 500 }}>{tt2(lang, 'date')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'type')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'total')}</th>
            </tr>
          </thead>
          <tbody>
            {T2.slice(0, 5).map((tr, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <td style={{ padding: '10px 0', color: 'var(--fg-dim)' }}>{tr.d}</td>
                <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: tr.type === 'BUY' ? 'rgba(22,163,74,0.12)' : tr.type === 'SELL' ? 'rgba(220,38,38,0.12)' : 'var(--surface2)', color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--fg-dim)' }}>{tr.type}</span></td>
                <td style={{ fontWeight: 500 }}>{tr.sym}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tr.qty}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn2(tr.px)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn2(tr.qty * tr.px, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MinMarkets({ lang, pad, tab, setTab, upClr, dnClr, rowPy }) {
  const data = tab === 'stocks' ? S2 : tab === 'crypto' ? C2 : tab === 'forex' ? FX2 : B2;
  const isB = tab === 'bonds';
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{tt2(lang, 'markets')}</h2>
        <input placeholder={tt2(lang, 'search')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none', width: 240 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {['stocks','forex','crypto','bonds','watchlist'].map(k => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 14px', background: 'transparent', border: 0, borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent', color: tab === k ? 'var(--fg)' : 'var(--fg-dim)', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 600 : 500, cursor: 'pointer', marginBottom: -1 }}>{tt2(lang, k)}</button>
        ))}
      </div>
      <div style={{ ...minCard, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--fg-dim)', fontSize: 11, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ padding: '10px 16px', fontWeight: 500, width: 36 }}></th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'name')}</th>
              {isB && <th>Country</th>}
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{isB ? 'Yield' : tt2(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'change')}</th>
              {!isB && <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'volume')}</th>}
              <th style={{ fontWeight: 500, textAlign: 'right', paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const ch = row.chgPct ?? row.chg;
              return (
                <tr key={row.sym} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: `${rowPy}px 16px`, color: row.star ? 'var(--accent)' : 'var(--fg-mute)', fontSize: 14 }}>★</td>
                  <td style={{ fontWeight: 600 }}>{row.sym}</td>
                  <td style={{ color: 'var(--fg-dim)' }}>{row.name}</td>
                  {isB && <td>{row.country}</td>}
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fn2(row.price ?? row.yield, isB ? 3 : 2)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ch >= 0 ? upClr : dnClr }}>{fp2(ch)}</td>
                  {!isB && <td style={{ textAlign: 'right', color: 'var(--fg-dim)' }}>{row.vol}</td>}
                  <td style={{ textAlign: 'right', paddingRight: 16, color: 'var(--fg-mute)' }}>🔔</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tab === 'bonds' && (
        <div style={{ ...minCard, marginTop: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Yield by country</div>
          <div style={{ height: 160, color: 'var(--accent)' }}>
            <Bars data={B2.map(b => ({ label: b.country, v: b.yield, color: 'currentColor' }))} />
          </div>
        </div>
      )}
    </div>
  );
}

function MinPositions({ lang, pad, upClr, dnClr, rowPy }) {
  const totalCost = P2.reduce((s, p) => s + p.qty * p.avg, 0);
  const totalVal = P2.reduce((s, p) => s + p.qty * p.price, 0);
  const pnl = totalVal - totalCost;
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0, gridColumn: 'span 12' }}>{tt2(lang, 'positions')}</h2>
      {[
        [tt2(lang, 'mktValue'), '$' + fn2(totalVal, 0), null],
        [tt2(lang, 'unrealized'), '$' + fn2(pnl, 0), pnl >= 0],
        [tt2(lang, 'roi'), fp2(pnl/totalCost*100), pnl >= 0],
        [tt2(lang, 'sharpe'), '1.84', null],
        [tt2(lang, 'annualized'), '+18.4%', true],
        [tt2(lang, 'maxDd'), '-12.4%', false],
      ].map(([l, v, up], i) => (
        <div key={i} style={{ ...minCard, gridColumn: 'span 2', padding: 16 }}>
          <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>{l}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: up == null ? 'var(--fg)' : up ? upClr : dnClr }}>{v}</div>
        </div>
      ))}
      <div style={{ ...minCard, gridColumn: 'span 12', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{tt2(lang, 'assetTrend')}</div>
        <div style={{ height: 180, color: 'var(--accent)' }}>
          <LineChart data={gs2(120, 800_000, 0.011, 11)} fill="var(--accent)" axis />
        </div>
      </div>
      <div style={{ ...minCard, gridColumn: 'span 12', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--fg-dim)', fontSize: 11, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ padding: '10px 16px', fontWeight: 500 }}>{tt2(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'name')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'avgCost')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'mktValue')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>P&L %</th>
              <th style={{ fontWeight: 500, paddingRight: 16, textAlign: 'right' }}>{tt2(lang, 'weight')}</th>
            </tr>
          </thead>
          <tbody>
            {P2.map(p => {
              const v = p.qty * p.price; const c = p.qty * p.avg; const d = v - c; const pct = d/c*100; const w = v/totalVal*100;
              return (
                <tr key={p.sym} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: `${rowPy}px 16px`, fontWeight: 600 }}>{p.sym}</td>
                  <td style={{ color: 'var(--fg-dim)' }}>{p.name}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.qty}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--fg-dim)' }}>${fn2(p.avg)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn2(p.price)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn2(v, 0)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: d >= 0 ? upClr : dnClr }}>{fp2(pct)}</td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: 'var(--surface2)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: 'var(--accent)' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--fg-dim)', minWidth: 36, textAlign: 'right' }}>{w.toFixed(1)}%</span>
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

function MinTrades({ lang, pad, upClr, dnClr, rowPy }) {
  const [showForm, setShowForm] = React.useState(false);
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{tt2(lang, 'trades')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>{tt2(lang, 'export')}</button>
          <button onClick={() => setShowForm(true)} style={{ background: 'var(--accent)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>+ {tt2(lang, 'addTrade')}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['All', 'Buy', 'Sell', 'Dividend', '2026'].map((c, i) => (
          <span key={c} style={{ padding: '5px 12px', background: i === 0 ? 'var(--fg)' : 'var(--surface)', color: i === 0 ? 'var(--bg)' : 'var(--fg-dim)', border: i === 0 ? 0 : '1px solid var(--border)', borderRadius: 99, fontSize: 12, fontWeight: 500 }}>{c}</span>
        ))}
      </div>
      <div style={{ ...minCard, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--fg-dim)', fontSize: 11, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ padding: '10px 16px', fontWeight: 500 }}>{tt2(lang, 'date')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'type')}</th>
              <th style={{ fontWeight: 500 }}>{tt2(lang, 'symbol')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'qty')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'price')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'total')}</th>
              <th style={{ fontWeight: 500, textAlign: 'right' }}>{tt2(lang, 'fee')}</th>
              <th style={{ fontWeight: 500, paddingRight: 16 }}>{tt2(lang, 'notes')}</th>
            </tr>
          </thead>
          <tbody>
            {T2.map((tr, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: `${rowPy}px 16px`, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{tr.d}</td>
                <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: tr.type === 'BUY' ? 'rgba(22,163,74,0.12)' : tr.type === 'SELL' ? 'rgba(220,38,38,0.12)' : 'var(--surface2)', color: tr.type === 'BUY' ? upClr : tr.type === 'SELL' ? dnClr : 'var(--fg-dim)' }}>{tr.type}</span></td>
                <td style={{ fontWeight: 500 }}>{tr.sym}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tr.qty}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fn2(tr.px)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fn2(tr.qty * tr.px, 0)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--fg-dim)' }}>${tr.fee}</td>
                <td style={{ paddingRight: 16, color: 'var(--fg-dim)' }}>{tr.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...minCard, width: 420, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{tt2(lang, 'addTrade')}</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Buy','Sell','Dividend'].map((x, i) => (
                  <button key={x} style={{ flex: 1, padding: '8px', background: i === 0 ? 'var(--accent)' : 'var(--surface2)', color: i === 0 ? '#fff' : 'var(--fg)', border: 0, borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{x}</button>
                ))}
              </div>
              <input placeholder="Symbol — search…" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input placeholder="Quantity" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none' }} />
                <input placeholder="Price" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none' }} />
              </div>
              <input type="date" defaultValue="2026-04-30" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none' }} />
              <textarea placeholder="Notes…" rows="2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none', resize: 'none' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: 'var(--surface2)', color: 'var(--fg)', border: 0, borderRadius: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MinNotifs({ lang, pad }) {
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{tt2(lang, 'notifications')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>{tt2(lang, 'markRead')}</button>
          <button style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>{tt2(lang, 'clearAll')}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['All','Alerts','News','System'].map((c, i) => (
          <button key={c} style={{ padding: '6px 14px', background: i === 0 ? 'var(--fg)' : 'var(--surface)', color: i === 0 ? 'var(--bg)' : 'var(--fg-dim)', border: i === 0 ? 0 : '1px solid var(--border)', borderRadius: 99, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>{c}</button>
        ))}
      </div>
      <div style={{ ...minCard }}>
        {N2.map((n, i) => (
          <div key={n.id} style={{ display: 'flex', gap: 14, padding: 16, borderTop: i ? '1px solid var(--border)' : 0, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: n.type === 'alert' ? 'rgba(22,163,74,0.12)' : n.type === 'news' ? 'var(--surface2)' : 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
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

function MinSettings({ lang, pad }) {
  const [tab, setTab] = React.useState('profile');
  const tabs = [['profile','👤'],['security','🔒'],['notifPref','🔔'],['display','🎨'],['data','💾']];
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: '0 0 16px' }}>{tt2(lang, 'settings')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(([k, ic]) => (
            <button key={k} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: tab === k ? 'var(--surface2)' : 'transparent', color: tab === k ? 'var(--fg)' : 'var(--fg-dim)', border: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 600 : 500, cursor: 'pointer', textAlign: 'left' }}>
              <span>{ic}</span>{tt2(lang, k)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ ...minCard, padding: 24 }}>
        {tab === 'profile' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600 }}>JL</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Justin Lin</div>
                <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>justin.lin@example.com</div>
              </div>
              <button style={{ marginLeft: 'auto', padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>Change avatar</button>
            </div>
            {[
              ['Display name', 'Justin Lin'], ['Email', 'justin.lin@example.com'],
              ['Timezone', 'Asia/Taipei (UTC+8)'], [tt2(lang, 'language'), lang === 'zh' ? '繁體中文' : 'English'],
            ].map(([l, v]) => (
              <div key={l} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'display' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <SettingRow label={tt2(lang, 'theme')} sub="Light, dark, or follow system">
              <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', padding: 3, borderRadius: 6 }}>
                {['Light','Dark','System'].map((x, i) => (
                  <button key={x} style={{ padding: '5px 12px', background: i === 1 ? 'var(--surface)' : 'transparent', color: 'var(--fg)', border: 0, borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>{x}</button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label={tt2(lang, 'currency')} sub="Default display currency">
              <select style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}><option>USD</option><option>TWD</option><option>EUR</option></select>
            </SettingRow>
            <SettingRow label={tt2(lang, 'numFormat')} sub="Decimal & thousand separators"><span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>1,234.56</span></SettingRow>
          </div>
        )}
        {tab === 'security' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <SettingRow label={tt2(lang, 'changePassword')} sub="Update your account password">
              <button style={{ padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>Change</button>
            </SettingRow>
            <SettingRow label="Two-factor authentication" sub="Off">
              <button style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>Enable</button>
            </SettingRow>
            <SettingRow label={tt2(lang, 'devices')} sub="3 active sessions">
              <button style={{ padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--fg)' }}>View</button>
            </SettingRow>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function MinOps({ lang, pad, onAct }) {
  const [confirm, setConfirm] = React.useState(null);
  const sys = [
    ['CPU', '32%', 0.32], ['Memory', '6.2 / 16 GB', 0.39], ['JVM Heap', '1.8 / 4 GB', 0.45],
    ['DB connections', '12 / 50', 0.24], ['WebSocket', '847 active', 0.5],
  ];
  const acts = [
    ['refetchNews', 'Force-pull news from all sources'],
    ['refetchMkt', 'Re-pull all market quotes'],
    ['recalcPos', 'Recompute holdings & cost basis'],
    ['recalcRoi', 'Recompute ROI / Sharpe / drawdown'],
    ['refetchBonds', 'Pull yield curves'],
    ['reimportKline', 'Re-ingest historical OHLCV'],
  ];
  return (
    <div style={{ padding: pad, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0, gridColumn: 'span 12' }}>{tt2(lang, 'ops')}</h2>
      {sys.map(([n, v, p]) => (
        <div key={n} style={{ ...minCard, gridColumn: 'span 2', padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{n}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (p*100)+'%', background: p > 0.7 ? '#f59e0b' : 'var(--accent)' }} />
          </div>
        </div>
      ))}
      <div style={{ ...minCard, gridColumn: 'span 2', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--up)', marginBottom: 6 }} />
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>All services</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--up)' }}>Healthy</div>
      </div>

      <div style={{ ...minCard, gridColumn: 'span 7', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{tt2(lang, 'syncOps')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {acts.map(([k, d]) => (
            <button key={k} onClick={() => setConfirm({k, d})} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--fg)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{tt2(lang, k)}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 3 }}>{d}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...minCard, gridColumn: 'span 5', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{tt2(lang, 'oplog')}</div>
        {O2.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 0, fontSize: 12 }}>
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
          <div onClick={(e) => e.stopPropagation()} style={{ ...minCard, width: 380, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Confirm action</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>{tt2(lang, confirm.k)}</div>
            <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 4 }}>{confirm.d}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: 9, background: 'var(--surface2)', color: 'var(--fg)', border: 0, borderRadius: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirm(null); onAct('✓ ' + tt2(lang, confirm.k)); }} style={{ flex: 1, padding: 9, background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Run</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.MinimalArtboard = MinimalArtboard;
