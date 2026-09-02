import { createAiAccessApi, type AiAccessApi } from './aiAccessApi';
import { createAuthApi, type AuthApi } from './authApi';
import { createBacktestApi, type BacktestApi } from './backtestApi';
import { createOpsApi, type OpsApi } from './opsApi';
import { createPortfolioApi, type PortfolioApi } from './portfolioApi';
import { createTradingApi, type TradingApi } from './tradingApi';
import { createMarketApi, type MarketApi } from './marketApi';
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
}

let clients: RuntimeApiClients | null = null;

export function getRuntimeApiClients(basePath = '/api/v1'): RuntimeApiClients {
  const mode = getRuntimeDataMode();
  if (!clients || clients.mode !== mode || clients.basePath !== basePath) {
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
    };
  }
  return clients;
}

export function resetRuntimeApiClientsForTests() {
  clients = null;
}
