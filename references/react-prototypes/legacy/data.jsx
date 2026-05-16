// Shared mock data + i18n + helpers for all 3 directions

const I18N = {
  zh: {
    overview: '總覽', markets: '行情', positions: '持倉', trades: '交易',
    notifications: '通知', settings: '設定', ops: '運維',
    totalAssets: '總資產', todayPnl: '今日損益', availableCash: '可用現金',
    totalReturn: '總報酬率', assetTrend: '資產走勢', allocation: '資產配置',
    watchlist: '我的觀察', news: '最新新聞', recentTrades: '最近交易',
    addTrade: '新增交易', viewPositions: '查看持倉',
    stocks: '股市', forex: '匯市', crypto: '加密', bonds: '政府債券',
    symbol: '代號', name: '名稱', price: '現價', change: '漲跌幅',
    volume: '成交量', high: '最高', low: '最低', search: '搜尋…',
    open: '開盤', mcap: '市值', pe: '本益比', alert: '警示',
    addToWatch: '加入觀察', buy: '買入', sell: '賣出',
    qty: '數量', avgCost: '平均成本', mktValue: '市值',
    unrealized: '未實現', weight: '權重', roi: '總報酬率',
    sharpe: 'Sharpe', maxDd: '最大回撤', annualized: '年化',
    date: '日期', type: '類型', total: '總額', fee: '手續費', notes: '備註',
    export: '匯出 CSV', filter: '篩選', new: '新增',
    cmdkPlaceholder: '搜尋標的、跳頁面、或執行動作…',
    cmdkPages: '頁面', cmdkActions: '動作', cmdkAssets: '標的',
    unread: '未讀', markRead: '標記已讀', clearAll: '全部清除',
    profile: '個人資料', security: '安全', notifPref: '通知偏好',
    display: '顯示', data: '資料', changePassword: '更改密碼',
    devices: '登入裝置', signOutAll: '登出所有裝置',
    theme: '主題', language: '語系', currency: '預設貨幣', numFormat: '數字格式',
    light: '淺色', dark: '深色', system: '跟隨系統',
    cpu: 'CPU', mem: '記憶體', heap: 'JVM Heap', dbConn: 'DB 連線',
    wsConn: 'WS 連線', svcStatus: '服務狀態',
    refetchNews: '重抓新聞', refetchMkt: '重抓行情', recalcPos: '重算持倉',
    recalcRoi: '重算 ROI/Sharpe', refetchBonds: '重拉政府債券',
    reimportKline: '重新匯入歷史 K 線',
    syncOps: '資料同步', oplog: '操作日誌',
    triggered: '觸發', executor: '執行人', result: '結果', duration: '耗時',
    mybalance: '帳戶餘額', goodMorning: '早安',
    quickActions: '快速入口', allocations: '配置比例',
    yesterday: '較昨日', winRate: '勝率',
    sigIn: '登入', email: 'Email', password: '密碼', remember: '記住我',
    forgotPw: '忘記密碼？', noAccount: '還沒有帳戶？', signUp: '立即註冊',
  },
  en: {
    overview: 'Overview', markets: 'Markets', positions: 'Positions', trades: 'Trades',
    notifications: 'Inbox', settings: 'Settings', ops: 'Ops',
    totalAssets: 'Total assets', todayPnl: "Today's P&L", availableCash: 'Available cash',
    totalReturn: 'Total return', assetTrend: 'Equity curve', allocation: 'Allocation',
    watchlist: 'Watchlist', news: 'Latest news', recentTrades: 'Recent trades',
    addTrade: 'New trade', viewPositions: 'View positions',
    stocks: 'Stocks', forex: 'Forex', crypto: 'Crypto', bonds: 'Gov. Bonds',
    symbol: 'Symbol', name: 'Name', price: 'Price', change: 'Change',
    volume: 'Volume', high: 'High', low: 'Low', search: 'Search…',
    open: 'Open', mcap: 'Mkt cap', pe: 'P/E', alert: 'Alert',
    addToWatch: 'Watch', buy: 'Buy', sell: 'Sell',
    qty: 'Qty', avgCost: 'Avg cost', mktValue: 'Mkt value',
    unrealized: 'Unrealized', weight: 'Weight', roi: 'Total return',
    sharpe: 'Sharpe', maxDd: 'Max DD', annualized: 'Annualized',
    date: 'Date', type: 'Type', total: 'Total', fee: 'Fee', notes: 'Notes',
    export: 'Export CSV', filter: 'Filter', new: 'New',
    cmdkPlaceholder: 'Search symbols, jump to page, run command…',
    cmdkPages: 'Pages', cmdkActions: 'Actions', cmdkAssets: 'Assets',
    unread: 'unread', markRead: 'Mark read', clearAll: 'Clear all',
    profile: 'Profile', security: 'Security', notifPref: 'Notifications',
    display: 'Display', data: 'Data', changePassword: 'Change password',
    devices: 'Devices', signOutAll: 'Sign out all',
    theme: 'Theme', language: 'Language', currency: 'Currency', numFormat: 'Numbers',
    light: 'Light', dark: 'Dark', system: 'System',
    cpu: 'CPU', mem: 'Memory', heap: 'JVM Heap', dbConn: 'DB',
    wsConn: 'WS', svcStatus: 'Services',
    refetchNews: 'Refetch news', refetchMkt: 'Refetch markets', recalcPos: 'Recalc positions',
    recalcRoi: 'Recalc ROI/Sharpe', refetchBonds: 'Refetch bonds',
    reimportKline: 'Reimport K-line',
    syncOps: 'Data sync', oplog: 'Operation log',
    triggered: 'Triggered', executor: 'By', result: 'Result', duration: 'Duration',
    mybalance: 'Balance', goodMorning: 'Good morning',
    quickActions: 'Quick actions', allocations: 'Mix',
    yesterday: 'vs yesterday', winRate: 'Win rate',
    sigIn: 'Sign in', email: 'Email', password: 'Password', remember: 'Remember me',
    forgotPw: 'Forgot password?', noAccount: "Don't have an account?", signUp: 'Sign up',
  },
};

const t = (lang, k) => (I18N[lang] && I18N[lang][k]) || k;

// Mock symbols
const SYMBOLS = [
  { sym: 'AAPL', name: 'Apple Inc.', price: 218.40, chg: 1.42, chgPct: 0.66, vol: '52.1M', high: 219.10, low: 215.80, mcap: '3.31T', pe: 33.4, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'NVDA', name: 'NVIDIA Corp.', price: 1142.83, chg: 28.40, chgPct: 2.55, vol: '38.4M', high: 1148.20, low: 1118.00, mcap: '2.81T', pe: 71.2, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'TSLA', name: 'Tesla, Inc.', price: 178.22, chg: -3.18, chgPct: -1.75, vol: '94.3M', high: 182.60, low: 177.40, mcap: '566B', pe: 45.1, sector: 'Auto', cat: 'stock' },
  { sym: 'MSFT', name: 'Microsoft Corp.', price: 432.85, chg: 2.10, chgPct: 0.49, vol: '18.2M', high: 433.90, low: 430.10, mcap: '3.22T', pe: 37.8, sector: 'Tech', cat: 'stock' },
  { sym: '2330.TW', name: '台積電 TSMC', price: 945.00, chg: 12.00, chgPct: 1.29, vol: '32.0M', high: 950.00, low: 932.00, mcap: 'NT$24.5T', pe: 28.6, sector: 'Tech', cat: 'stock', star: true },
  { sym: 'GOOGL', name: 'Alphabet Inc.', price: 174.62, chg: 0.84, chgPct: 0.48, vol: '21.0M', high: 175.10, low: 172.80, mcap: '2.15T', pe: 26.4, sector: 'Tech', cat: 'stock' },
  { sym: 'AMZN', name: 'Amazon.com', price: 192.34, chg: -1.04, chgPct: -0.54, vol: '32.4M', high: 195.20, low: 191.40, mcap: '2.02T', pe: 51.2, sector: 'Retail', cat: 'stock' },
  { sym: 'META', name: 'Meta Platforms', price: 514.20, chg: 4.32, chgPct: 0.85, vol: '14.8M', high: 516.00, low: 508.40, mcap: '1.30T', pe: 28.1, sector: 'Tech', cat: 'stock' },
];

const CRYPTO = [
  { sym: 'BTC', name: 'Bitcoin', price: 67_842.40, chg: 1842.10, chgPct: 2.79, vol: '$28.4B', high: 68_120, low: 65_400, mcap: '$1.34T', cat: 'crypto', star: true },
  { sym: 'ETH', name: 'Ethereum', price: 3_482.18, chg: 84.20, chgPct: 2.48, vol: '$14.2B', high: 3_510, low: 3_380, mcap: '$418B', cat: 'crypto' },
  { sym: 'SOL', name: 'Solana', price: 168.42, chg: -2.18, chgPct: -1.28, vol: '$3.4B', high: 172.20, low: 166.80, mcap: '$78B', cat: 'crypto' },
];

const FX = [
  { sym: 'USD/TWD', name: '美元/新台幣', price: 32.418, chg: 0.024, chgPct: 0.07, vol: '—', high: 32.450, low: 32.380, cat: 'fx' },
  { sym: 'EUR/USD', name: '歐元/美元', price: 1.0832, chg: -0.0014, chgPct: -0.13, vol: '—', high: 1.0851, low: 1.0820, cat: 'fx' },
  { sym: 'USD/JPY', name: '美元/日圓', price: 156.42, chg: 0.32, chgPct: 0.20, vol: '—', high: 156.80, low: 155.90, cat: 'fx' },
];

const BONDS = [
  { sym: 'US10Y', name: 'US 10-Year Treasury', country: 'US', yield: 4.218, chg: 0.014, dur: '10Y', cat: 'bond' },
  { sym: 'US2Y', name: 'US 2-Year Treasury', country: 'US', yield: 4.842, chg: -0.012, dur: '2Y', cat: 'bond' },
  { sym: 'DE10Y', name: 'German 10-Year Bund', country: 'DE', yield: 2.458, chg: 0.008, dur: '10Y', cat: 'bond' },
  { sym: 'JP10Y', name: 'Japan 10-Year', country: 'JP', yield: 0.984, chg: 0.018, dur: '10Y', cat: 'bond' },
  { sym: 'TW10Y', name: '中華民國 10-Year', country: 'TW', yield: 1.642, chg: 0.004, dur: '10Y', cat: 'bond' },
];

// Holdings (positions)
const POSITIONS = [
  { sym: 'AAPL', name: 'Apple Inc.', qty: 120, avg: 178.20, price: 218.40, sector: 'Tech' },
  { sym: 'NVDA', name: 'NVIDIA Corp.', qty: 40, avg: 480.10, price: 1142.83, sector: 'Tech' },
  { sym: '2330.TW', name: '台積電', qty: 1000, avg: 720.00, price: 945.00, sector: 'Tech' },
  { sym: 'BTC', name: 'Bitcoin', qty: 0.42, avg: 42_180, price: 67_842.40, sector: 'Crypto' },
  { sym: 'ETH', name: 'Ethereum', qty: 6.5, avg: 2_180, price: 3_482.18, sector: 'Crypto' },
  { sym: 'MSFT', name: 'Microsoft', qty: 30, avg: 348.40, price: 432.85, sector: 'Tech' },
];

const TRADES = [
  { d: '2026-04-29', type: 'BUY', sym: 'NVDA', qty: 10, px: 1138.40, fee: 5, note: '加碼' },
  { d: '2026-04-28', type: 'SELL', sym: 'TSLA', qty: 25, px: 182.10, fee: 4, note: '停利' },
  { d: '2026-04-26', type: 'DIV', sym: 'AAPL', qty: 120, px: 0.24, fee: 0, note: '季度配息' },
  { d: '2026-04-22', type: 'BUY', sym: 'BTC', qty: 0.05, px: 65_240, fee: 12, note: 'DCA' },
  { d: '2026-04-18', type: 'BUY', sym: '2330.TW', qty: 200, px: 932.00, fee: 28, note: '' },
  { d: '2026-04-12', type: 'SELL', sym: 'GOOGL', qty: 15, px: 172.80, fee: 4, note: '' },
  { d: '2026-04-08', type: 'BUY', sym: 'ETH', qty: 1.2, px: 3_280, fee: 8, note: '' },
];

const NOTIFS = [
  { id: 1, type: 'alert', sym: 'NVDA', text: 'NVDA crossed above $1,140', time: '2m', unread: true },
  { id: 2, type: 'news', sym: '2330.TW', text: 'TSMC Q1 revenue beats estimates +12% YoY', time: '14m', unread: true },
  { id: 3, type: 'alert', sym: 'BTC', text: 'BTC daily volatility > 4%', time: '1h', unread: true },
  { id: 4, type: 'system', text: 'Portfolio recalculation completed', time: '3h', unread: false },
  { id: 5, type: 'news', sym: 'AAPL', text: 'Apple announces new MacBook lineup', time: '5h', unread: false },
];

const NEWS = [
  { src: 'Reuters', t: 'Fed signals rate cuts may begin Q3 amid cooling inflation', tag: 'Macro', time: '8m' },
  { src: 'Bloomberg', t: 'NVIDIA closes above $1,140 on strong AI infrastructure demand', tag: 'NVDA', time: '24m' },
  { src: '經濟日報', t: '台積電 4 月營收創新高，AI 訂單續強', tag: '2330', time: '1h' },
  { src: 'CoinDesk', t: 'Bitcoin reclaims $67k as ETF inflows resume', tag: 'BTC', time: '2h' },
  { src: 'WSJ', t: 'Tesla deliveries miss as China competition intensifies', tag: 'TSLA', time: '3h' },
];

const OPLOG = [
  { d: '2026-04-30 09:14', op: 'Refetch news', who: 'admin', ok: true, dur: '2.4s' },
  { d: '2026-04-30 08:00', op: 'Recalc positions', who: 'system', ok: true, dur: '12.8s' },
  { d: '2026-04-29 23:00', op: 'Refetch markets', who: 'system', ok: true, dur: '4.1s' },
  { d: '2026-04-29 18:42', op: 'Refetch bonds', who: 'admin', ok: false, dur: '8.0s' },
  { d: '2026-04-29 14:12', op: 'Reimport K-line', who: 'admin', ok: true, dur: '1m 22s' },
];

// Generate price series for charts (deterministic)
function genSeries(n, start, vol, seed = 1) {
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out = []; let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + (r() - 0.48) * vol);
    out.push(p);
  }
  return out;
}

function genCandles(n, start, vol, seed = 1) {
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out = []; let p = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p * (1 + (r() - 0.48) * vol);
    const h = Math.max(o, c) * (1 + r() * vol * 0.5);
    const l = Math.min(o, c) * (1 - r() * vol * 0.5);
    out.push({ o, h, l, c });
    p = c;
  }
  return out;
}

// Format helpers
const fmtNum = (n, dp = 2) => {
  if (n == null) return '—';
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  return sign + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmtMoney = (n, ccy = '$') => ccy + fmtNum(n);

window.STOCK_DATA = {
  I18N, t, SYMBOLS, CRYPTO, FX, BONDS, POSITIONS, TRADES, NOTIFS, NEWS, OPLOG,
  genSeries, genCandles, fmtNum, fmtPct, fmtMoney,
};
