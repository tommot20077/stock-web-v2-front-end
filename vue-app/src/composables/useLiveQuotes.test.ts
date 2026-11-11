import { afterEach, describe, expect, it } from 'vitest';
import { effectScope, ref, shallowRef, type EffectScope, type Ref } from 'vue';
import type { Asset } from '../services/apiTypes';
import { isDecimal, parseNullableDecimal, toWire, type Decimal } from '../services/decimal';
import type { LiveTick, QuoteStream, QuoteStreamStatus } from '../services/quoteStream';
import { useLiveQuotes } from './useLiveQuotes';

type QuoteKey = 'latestPrice' | 'change' | 'changePercent' | 'high' | 'low';
/** 報價欄以 wire 字串指定(與後端 `AssetDto` 同形),其餘欄位同 domain。 */
type AssetOverrides = Partial<Omit<Asset, QuoteKey>> & Partial<Record<QuoteKey, string | null>> & { symbol: string };

/** domain `Asset` 列(報價欄 Decimal,Phase 5 D-08);預設值同 Phase 5 前的 number fixture。 */
function asset(overrides: AssetOverrides): Asset {
  const { latestPrice = '200', change = '2', changePercent = '1.01', high = '205', low = '195', ...rest } = overrides;
  return {
    uuid: `uuid-${overrides.symbol}`,
    name: overrides.symbol,
    assetType: 'STOCK',
    market: 'US',
    currency: 'USD',
    sector: 'Tech',
    tradeable: true,
    volumeText: '52.1M',
    ...rest,
    latestPrice: parseNullableDecimal(latestPrice),
    change: parseNullableDecimal(change),
    changePercent: parseNullableDecimal(changePercent),
    high: parseNullableDecimal(high),
    low: parseNullableDecimal(low),
  };
}

/** Decimal → 一般記號字串(null 原樣);斷言比對正規化後的字面(big.js 去尾零)。 */
function w(value: Decimal | null): string | null {
  return value === null ? null : toWire(value);
}

/** 測試用 QuoteStream 替身:status / ticks 由測試直接控制 */
function fakeStream(initialStatus: QuoteStreamStatus = 'live') {
  const status = ref<QuoteStreamStatus>(initialStatus);
  const ticks = shallowRef<ReadonlyMap<string, LiveTick>>(new Map());
  const stream: QuoteStream = {
    mode: 'api',
    status,
    ticks,
    lastDataAt: ref(null),
    resyncSeq: ref(0),
    watch: () => () => {},
    reconnect: () => {},
    dispose: () => {},
  };
  function pushTick(symbol: string, price: number, receivedAt = 1000) {
    const next = new Map(ticks.value);
    next.set(symbol, { symbol, price, time: '2026-10-31T01:23:45.678Z', receivedAt });
    ticks.value = next;
  }
  return { stream, status, ticks, pushTick };
}

let scopes: EffectScope[] = [];

function setup(rows: Ref<readonly Asset[]>, stream: QuoteStream, restFetchedAt?: Ref<number | null>) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useLiveQuotes(rows, stream, restFetchedAt ? { restFetchedAt } : undefined))!;
}

afterEach(() => {
  scopes.forEach(scope => scope.stop());
  scopes = [];
});

describe('useLiveQuotes — tick 疊加(RESEARCH W5、P-W5)', () => {
  it('以 GET 反推前收重算漲跌(2 位 half-up),high 擴張、low 與 volumeText 不變', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('AAPL', 218.4);
    const row = live.rows.value[0];

    expect(w(row.latestPrice)).toBe('218.4');
    expect(w(row.change)).toBe('20.4');
    expect(w(row.changePercent)).toBe('10.3');
    expect(w(row.high)).toBe('218.4');
    expect(w(row.low)).toBe('195');
    expect(row.volumeText).toBe('52.1M');
    expect(row.quoteSource).toBe('ws');
    expect(live.isLive('AAPL')).toBe(true);
    // 純 computed 疊加:不寫回原 rows
    expect(w(rows.value[0].latestPrice)).toBe('200');
  });

  it('tick 低於 low 時 low 擴張;負漲跌也依 half-up 捨入', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'TSLA', latestPrice: '178.22', change: '-3.18', changePercent: '-1.75', high: '182.6', low: '177.4' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('TSLA', 170);
    const row = live.rows.value[0];

    // 前收 = 181.4;change = -11.4;pct = -11.4 / 181.4 × 100 = -6.2844… → -6.28
    expect(w(row.change)).toBe('-11.4');
    expect(w(row.changePercent)).toBe('-6.28');
    expect(w(row.low)).toBe('170');
    expect(w(row.high)).toBe('182.6');
  });

  it('latestPrice 或 change 為 null → 無法反推前收:價格以 tick 覆寫,change / changePercent 維持原值', () => {
    const rows = ref<readonly Asset[]>([
      asset({ symbol: 'NOPRICE', latestPrice: null, change: null, changePercent: null, high: null, low: null }),
      asset({ symbol: 'NOCHANGE', latestPrice: '50', change: null, changePercent: null }),
    ]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('NOPRICE', 12.5);
    s.pushTick('NOCHANGE', 51);
    const [noPrice, noChange] = live.rows.value;

    expect(w(noPrice.latestPrice)).toBe('12.5');
    expect(noPrice.change).toBeNull();
    expect(noPrice.changePercent).toBeNull();
    expect(noPrice.quoteSource).toBe('ws');
    expect(w(noChange.latestPrice)).toBe('51');
    expect(noChange.change).toBeNull();
    expect(noChange.changePercent).toBeNull();
  });
});

describe('useLiveQuotes — Decimal 疊加(05-22 / D-08)', () => {
  it('row 100 / 2、tick 103 → change 5、changePercent 5.1(5 × 100 ÷ 98 = 5.102… → 2 位 HALF_UP)', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL', latestPrice: '100', change: '2', high: '101', low: '97' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('AAPL', 103);
    const row = live.rows.value[0];

    expect(isDecimal(row.latestPrice)).toBe(true);
    expect(isDecimal(row.change)).toBe(true);
    expect(isDecimal(row.changePercent)).toBe(true);
    expect(w(row.latestPrice)).toBe('103');
    expect(w(row.change)).toBe('5');
    expect(w(row.changePercent)).toBe('5.1');
    // cmp 取極值:tick 高於 high → high 擴張;low 不變
    expect(w(row.high)).toBe('103');
    expect(w(row.low)).toBe('97');
  });

  it('change 是精確差值(沒有浮點殘差):218.4 − 198 = 20.4;大額 8 位小數不失真', () => {
    const rows = ref<readonly Asset[]>([
      asset({ symbol: 'AAPL', latestPrice: '200', change: '2' }),
      asset({ symbol: 'BIG', latestPrice: '123456789012.12345678', change: '0.00000001', high: null, low: null }),
    ]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('AAPL', 218.4);
    s.pushTick('BIG', 123456789013);
    const [aapl, big] = live.rows.value;

    // number 版:218.4 - 198 = 20.400000000000006,需另外清殘差;Decimal 直接精確。
    expect(w(aapl.change)).toBe('20.4');
    // 前收 = 123456789012.12345677;change = 123456789013 − 前收
    expect(w(big.change)).toBe('0.87654323');
    expect(big.high).toBeNull();
    expect(big.low).toBeNull();
  });

  it('負值的 .5 捨入遠離 0(與後端 BigDecimal HALF_UP 一致),正值亦然', () => {
    // 前收 = 200;pct = change × 100 ÷ 200 = change ÷ 2
    const rows = ref<readonly Asset[]>([
      asset({ symbol: 'DOWN', latestPrice: '198', change: '-2' }),
      asset({ symbol: 'UP', latestPrice: '198', change: '-2' }),
    ]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('DOWN', 199.75);
    s.pushTick('UP', 200.25);
    const [down, up] = live.rows.value;

    expect(w(down.change)).toBe('-0.25');
    // -0.125 → -0.13(Math.round 會往 +∞ 得 -0.12)
    expect(w(down.changePercent)).toBe('-0.13');
    expect(w(up.change)).toBe('0.25');
    expect(w(up.changePercent)).toBe('0.13');
    // tick 低於 low(195)?否:low 不變;tick 199.75 < high 205 → high 不變
    expect(w(down.low)).toBe('195');
    expect(w(down.high)).toBe('205');
  });

  it('previousClose = 0 → changePercent 維持原值(不除以 0),change 仍更新', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'ZERO', latestPrice: '2', change: '2', changePercent: '1.01' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('ZERO', 3);
    const row = live.rows.value[0];

    expect(w(row.change)).toBe('3');
    expect(w(row.changePercent)).toBe('1.01');
  });

  it('tick 與 high / low 相等時保留原值(cmp 取極值)', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'EDGE', high: '205', low: '195' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('EDGE', 205);
    expect(w(live.rows.value[0].high)).toBe('205');
    s.pushTick('EDGE', 195, 2000);
    expect(w(live.rows.value[0].low)).toBe('195');
    expect(w(live.rows.value[0].high)).toBe('205');
  });
});

describe('useLiveQuotes — quoteSource(UI-SPEC §9 data-quote-source)', () => {
  it('無 tick:latestPrice 非 null → rest;latestPrice null → none;不在 rows 的代號 → none', () => {
    const rows = ref<readonly Asset[]>([
      asset({ symbol: 'AAPL' }),
      asset({ symbol: 'EMPTY', latestPrice: null, change: null, changePercent: null }),
    ]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    expect(live.quoteSource('AAPL')).toBe('rest');
    expect(live.quoteSource('EMPTY')).toBe('none');
    expect(live.quoteSource('MISSING')).toBe('none');
    expect(live.rows.value.map(row => row.quoteSource)).toEqual(['rest', 'none']);
    expect(live.isLive('AAPL')).toBe(false);
  });

  it('只有「上次 rows 更新之後」收到的 tick 才算:rows 重讀後回到 GET 值與 rest,新 tick 進來才變 ws', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('AAPL', 218.4);
    expect(live.quoteSource('AAPL')).toBe('ws');

    rows.value = [asset({ symbol: 'AAPL', latestPrice: '219', change: '21', changePercent: '10.61' })];
    expect(live.quoteSource('AAPL')).toBe('rest');
    expect(w(live.rows.value[0].latestPrice)).toBe('219');

    s.pushTick('AAPL', 220, 2000);
    expect(live.quoteSource('AAPL')).toBe('ws');
    expect(w(live.rows.value[0].latestPrice)).toBe('220');
  });

  it('掛載前就存在的 tick 不算(GET 為較新的基準)', () => {
    const s = fakeStream();
    s.pushTick('AAPL', 150);
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' })]);
    const live = setup(rows, s.stream);

    expect(live.quoteSource('AAPL')).toBe('rest');
    expect(w(live.rows.value[0].latestPrice)).toBe('200');
  });

  it('stream 變 degraded → 原 ws 列變 rest,價格停在最後一筆 tick;回到 live 才又是 ws', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('AAPL', 218.4);
    expect(live.quoteSource('AAPL')).toBe('ws');

    s.status.value = 'degraded';
    expect(live.quoteSource('AAPL')).toBe('rest');
    expect(live.isLive('AAPL')).toBe(false);
    expect(w(live.rows.value[0].latestPrice)).toBe('218.4');

    s.status.value = 'live';
    expect(live.quoteSource('AAPL')).toBe('ws');
  });

  it('FX / BOND 列永遠不是 ws(也不套用 tick)', () => {
    const rows = ref<readonly Asset[]>([
      asset({ symbol: 'USD/TWD', assetType: 'FX', latestPrice: '32.4', change: '0.02' }),
      asset({ symbol: 'US10Y', assetType: 'BOND', latestPrice: null, change: null, changePercent: null }),
    ]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    s.pushTick('USD/TWD', 33);
    s.pushTick('US10Y', 4.2);

    expect(live.quoteSource('USD/TWD')).toBe('rest');
    expect(live.quoteSource('US10Y')).toBe('none');
    expect(w(live.rows.value[0].latestPrice)).toBe('32.4');
    expect(live.rows.value[1].latestPrice).toBeNull();
  });
});

describe('useLiveQuotes — lastUpdatedAt(「更新於」)', () => {
  it('= max(restFetchedAt, 本 composable 範圍內最後一筆 tick 的 receivedAt)', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' }), asset({ symbol: 'USD/TWD', assetType: 'FX' })]);
    const restFetchedAt = ref<number | null>(null);
    const s = fakeStream();
    const live = setup(rows, s.stream, restFetchedAt);

    expect(live.lastUpdatedAt.value).toBeNull();

    restFetchedAt.value = 1000;
    expect(live.lastUpdatedAt.value).toBe(1000);

    s.pushTick('AAPL', 218.4, 5000);
    expect(live.lastUpdatedAt.value).toBe(5000);

    // 不在 rows(或 FX)的 tick 不影響
    s.pushTick('TSLA', 170, 9000);
    s.pushTick('USD/TWD', 33, 9500);
    expect(live.lastUpdatedAt.value).toBe(5000);

    restFetchedAt.value = 12000;
    expect(live.lastUpdatedAt.value).toBe(12000);
  });

  it('沒有 restFetchedAt 選項時只看 tick', () => {
    const rows = ref<readonly Asset[]>([asset({ symbol: 'AAPL' })]);
    const s = fakeStream();
    const live = setup(rows, s.stream);

    expect(live.lastUpdatedAt.value).toBeNull();
    s.pushTick('AAPL', 218.4, 7000);
    expect(live.lastUpdatedAt.value).toBe(7000);
  });
});
