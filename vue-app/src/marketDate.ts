/**
 * 標的市場的「今天」(quick-261107-1j4,04.2 WR-09)。
 *
 * **本檔鏡像後端 `stock-common/.../common/model/TradingDay.java` 的 `of(assetType, market)`(:55-71)與
 * `dayStart` 的換日公式(:80-83);兩邊必須同步修改。** 後端把股數調整的除權日以 `TradingDay.startOf(effectiveDate)`
 * 換算成生效瞬間,晚於現在 5 分鐘以上回 400 `fields.effectiveDate`;所以「市場今天」恰好是後端可接受的最晚除權日。
 *
 * 對照表:
 * - `assetType == CRYPTO` → UTC,換日 0
 * - `assetType == FX` → America/New_York,換日 17 小時
 * - 其餘依 `market`(trim + 大寫):US / NASDAQ / NYSE / AMEX → 紐約;TW / TWSE / TPEX → 台北;
 *   JP / TSE → 東京;DE / XETRA → 柏林;null 或無法辨識 → UTC
 */

/** 一個市場的交易日切法:IANA 時區與「當地午夜後幾小時換日」。 */
export interface MarketDayRule {
  zone: string;
  startOffsetHours: number;
}

const UTC_RULE: MarketDayRule = { zone: 'UTC', startOffsetHours: 0 };
const NEW_YORK_RULE: MarketDayRule = { zone: 'America/New_York', startOffsetHours: 0 };
const FX_RULE: MarketDayRule = { zone: 'America/New_York', startOffsetHours: 17 };
const TAIPEI_RULE: MarketDayRule = { zone: 'Asia/Taipei', startOffsetHours: 0 };
const TOKYO_RULE: MarketDayRule = { zone: 'Asia/Tokyo', startOffsetHours: 0 };
const BERLIN_RULE: MarketDayRule = { zone: 'Europe/Berlin', startOffsetHours: 0 };

const MARKET_RULES: Record<string, MarketDayRule> = {
  US: NEW_YORK_RULE, NASDAQ: NEW_YORK_RULE, NYSE: NEW_YORK_RULE, AMEX: NEW_YORK_RULE,
  TW: TAIPEI_RULE, TWSE: TAIPEI_RULE, TPEX: TAIPEI_RULE,
  JP: TOKYO_RULE, TSE: TOKYO_RULE,
  DE: BERLIN_RULE, XETRA: BERLIN_RULE,
};

/**
 * 前端還不知道標的的市場時(查詢中、查詢失敗)使用的規則:紐約、換日 0。
 * 理由:支援的市場中紐約日期最晚換日,以它當預設 / max 不會讓除權日被後端判為未來而拒絕;
 * FX 不可新建股利 / 股數調整紀錄,不影響。提示會如實顯示這個 fallback 時區。
 */
export const FALLBACK_MARKET_DAY_RULE: MarketDayRule = NEW_YORK_RULE;

/**
 * 依資產類型與市場代號取得交易日規則(鏡像 `TradingDay.of`)。
 *
 * @param assetType `AssetDto.assetType`(大寫字串),可為 null
 * @param market `AssetDto.market`,大小寫與前後空白不拘,可為 null
 */
export function marketDayRuleOf(assetType: string | null | undefined, market: string | null | undefined): MarketDayRule {
  if (assetType === 'CRYPTO') return UTC_RULE;
  if (assetType === 'FX') return FX_RULE;
  if (market == null) return UTC_RULE;
  return MARKET_RULES[market.trim().toUpperCase()] ?? UTC_RULE;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * 該市場在 `nowMs` 這一刻的交易日(`YYYY-MM-DD`)。
 *
 * 與後端 `time.atZone(zone).toLocalDateTime().minus(startOffset).toLocalDate()` 相同:取該時區的**當地時鐘**
 * 年月日時分,當成 UTC 欄位組成毫秒值後減換日偏移,再取日期——當地時鐘算術,夏令切換日也維持「當地 17:00」。
 */
export function marketToday(rule: MarketDayRule, nowMs: number): string {
  const parts = formatterFor(rule.zone).formatToParts(new Date(nowMs));
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const localClock = new Date(0);
  localClock.setUTCFullYear(field('year'), field('month') - 1, field('day'));
  localClock.setUTCHours(field('hour'), field('minute'), 0, 0);
  const shifted = new Date(localClock.getTime() - rule.startOffsetHours * 60 * 60 * 1000);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 市場日期提示用的時區名稱 i18n 鍵(`holdingEventMarketDate` 的 `{zone}`)。 */
export function marketZoneLabelKey(rule: MarketDayRule): string {
  switch (rule.zone) {
    case 'America/New_York': return 'marketZoneNewYork';
    case 'Asia/Taipei': return 'marketZoneTaipei';
    case 'Asia/Tokyo': return 'marketZoneTokyo';
    case 'Europe/Berlin': return 'marketZoneBerlin';
    default: return 'marketZoneUtc';
  }
}
