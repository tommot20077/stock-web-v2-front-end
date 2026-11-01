import { createAiAccessApi, type AiAccessApi } from './aiAccessApi';
import { createAuthApi, type AuthApi } from './authApi';
import { createBacktestApi, type BacktestApi } from './backtestApi';
import { createCashApi, type CashApi } from './cashApi';
import { createHoldingEventApi, type HoldingEventApi } from './holdingEventApi';
import { createOpsApi, type OpsApi } from './opsApi';
import { createPortfolioApi, type PortfolioApi } from './portfolioApi';
import { createProfileApi, type ProfileApi } from './profileApi';
import { createTradingApi, type TradingApi } from './tradingApi';
import { createMarketApi, type MarketApi } from './marketApi';
import { createQuoteStream, type QuoteStream } from './quoteStream';
import type { RuntimeDataMode } from './apiTypes';
import { getRuntimeDataMode } from './runtimeDataMode';

interface RuntimeApiClients {
  mode: RuntimeDataMode;
  basePath: string;
  auth: AuthApi;
  aiAccess: AiAccessApi;
  backtest: BacktestApi;
  ops: OpsApi;
  portfolio: PortfolioApi;
  trading: TradingApi;
  market: MarketApi;
  cash: CashApi;
  profile: ProfileApi;
  /** 股利與股數調整(DIV-01 / ADJ-01):對話框只經此介面寫入 */
  holdingEvents: HoldingEventApi;
  /** 即時報價 WS client(WATCH-04):模組級 singleton,同分頁所有消費者共用一條連線(D-23) */
  quotes: QuoteStream;
}

let clients: RuntimeApiClients | null = null;

export function getRuntimeApiClients(basePath = '/api/v1'): RuntimeApiClients {
  const mode = getRuntimeDataMode();
  if (!clients || clients.mode !== mode || clients.basePath !== basePath) {
    clients?.quotes.dispose();
    clients = {
      mode,
      basePath,
      auth: createAuthApi(mode, basePath),
      aiAccess: createAiAccessApi(mode, basePath),
      backtest: createBacktestApi(mode, basePath),
      ops: createOpsApi(mode, basePath),
      portfolio: createPortfolioApi(mode, basePath),
      trading: createTradingApi(mode, basePath),
      market: createMarketApi(mode, basePath),
      cash: createCashApi(mode, basePath),
      profile: createProfileApi(mode, basePath),
      holdingEvents: createHoldingEventApi(mode, basePath),
      quotes: createQuoteStream(mode, { basePath }),
    };
  }
  return clients;
}

export function resetRuntimeApiClientsForTests() {
  clients?.quotes.dispose();
  clients = null;
}
