import { describe, expect, it } from 'vitest';
import { createMockAiAccessApi, type AiAccessApi } from '../services/aiAccessApi';
import { useAiAccessSettings } from './useAiAccessSettings';

function failingAiAccessApi(message: string): AiAccessApi {
  return {
    mode: 'api',
    listProviders: async () => [],
    listKeys: async () => { throw new Error(message); },
    createKey: async () => { throw new Error(message); },
    testKey: async () => { throw new Error(message); },
    updatePolicy: async () => { throw new Error(message); },
    revokeKey: async () => { throw new Error(message); },
    listMcpEndpoints: async () => { throw new Error(message); },
    updateMcpEndpoint: async () => { throw new Error(message); },
    listAgents: async () => { throw new Error(message); },
    revokeAgent: async () => { throw new Error(message); },
    listAuditCalls: async () => { throw new Error(message); },
  };
}

describe('useAiAccessSettings', () => {
  it('loads keys, MCP endpoints, agents, and audit calls from the adapter', async () => {
    const settings = useAiAccessSettings({
      api: createMockAiAccessApi(),
      lang: () => 'en',
      emitToast: () => {},
    });

    await settings.loadAiAccessData();

    expect(settings.readKeys.value.map(key => key.provider)).toContain('finnhub');
    expect(settings.brokerKeys.value.map(key => key.provider)).toContain('binance');
    expect(settings.mcpServers.map(endpoint => endpoint.id)).toEqual(['readonly', 'trading', 'admin']);
    expect(settings.agents.map(agent => agent.name)).toContain('Claude Desktop');
    expect(settings.calls.map(call => call.tool)).toContain('markets.get_quote');
  });

  it('falls back to empty state and emits a toast when loading fails', async () => {
    const toasts: string[] = [];
    const settings = useAiAccessSettings({
      api: failingAiAccessApi('AI access unavailable'),
      lang: () => 'en',
      emitToast: message => toasts.push(message),
    });

    await settings.loadAiAccessData();

    expect(settings.readKeys.value).toEqual([]);
    expect(settings.brokerKeys.value).toEqual([]);
    expect(settings.mcpServers).toEqual([]);
    expect(settings.agents).toEqual([]);
    expect(settings.calls).toEqual([]);
    expect(toasts).toEqual(['AI access unavailable']);
  });
});
