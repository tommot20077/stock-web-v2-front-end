import { createAiAccessApi, type AiAccessApi } from './aiAccessApi';
import { createBacktestApi, type BacktestApi } from './backtestApi';
import { createOpsApi, type OpsApi } from './opsApi';
import type { RuntimeDataMode } from './apiTypes';
import { getRuntimeDataMode } from './runtimeDataMode';

interface RuntimeApiClients {
  mode: RuntimeDataMode;
  basePath: string;
  aiAccess: AiAccessApi;
  backtest: BacktestApi;
  ops: OpsApi;
}

let clients: RuntimeApiClients | null = null;

export function getRuntimeApiClients(basePath = '/api/v1'): RuntimeApiClients {
  const mode = getRuntimeDataMode();
  if (!clients || clients.mode !== mode || clients.basePath !== basePath) {
    clients = {
      mode,
      basePath,
      aiAccess: createAiAccessApi(mode, basePath),
      backtest: createBacktestApi(mode, basePath),
      ops: createOpsApi(mode, basePath),
    };
  }
  return clients;
}

export function resetRuntimeApiClientsForTests() {
  clients = null;
}
