import { computed, reactive, ref } from 'vue';
import type { AiAccessApi } from '../services/aiAccessApi';
import { getRuntimeApiClients } from '../services/pageApiClients';
import {
  formatLastUsed,
  keyFromDto,
  mergeKeyDtoIntoView,
  type ApiKeyView,
  type Hitl,
} from '../settingsAiAccessView';
import type {
  AiAccessKeyDto,
  AiAgentDto,
  AiAuditCallDto,
  AiHitlMode,
  McpEndpointDto,
} from '../services/apiTypes';
import type { Lang } from '../types';

export interface Source {
  id: string;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
  icon: string;
  color: string;
  enabled: boolean;
  available: boolean;
  connected: boolean;
  feed: 'livefeed' | 'cached' | 'sandbox';
}

export interface Provider {
  id: string;
  name: string;
  short: string;
  color: string;
  kind: 'crypto' | 'stocks' | 'news' | 'fx';
  rate: number;
  tradeable: boolean;
}

export interface McpServer {
  id: string;
  tk: string;
  dk: string;
  kind: 'read' | 'write' | 'admin';
  url: string;
  tools: string[];
  enabled: boolean;
  editable: boolean;
}

export interface AgentView {
  id: string;
  name: string;
  icon: string;
  scopes: string[];
  last: string;
  status: 'live' | 'disabled';
}

export interface AuditCallView {
  id: string;
  t: string;
  agent: string;
  tool: string;
  args: string;
  ok: boolean;
  ms: number;
}

interface UseAiAccessSettingsOptions {
  api?: AiAccessApi;
  lang: () => Lang;
  emitToast: (message: string) => void;
}

export const PROVIDERS: Provider[] = [
  { id: 'binance', name: 'Binance', short: 'BN', color: '#F59E0B', kind: 'crypto', rate: 1200, tradeable: true },
  { id: 'coinbase', name: 'Coinbase', short: 'CB', color: '#3B82F6', kind: 'crypto', rate: 600, tradeable: true },
  { id: 'kraken', name: 'Kraken', short: 'KR', color: '#7C3AED', kind: 'crypto', rate: 300, tradeable: true },
  { id: 'alpaca', name: 'Alpaca', short: 'AL', color: '#FBBF24', kind: 'stocks', rate: 200, tradeable: true },
  { id: 'polygon', name: 'Polygon.io', short: 'PG', color: '#1E40AF', kind: 'stocks', rate: 100, tradeable: false },
  { id: 'finnhub', name: 'Finnhub', short: 'FH', color: '#059669', kind: 'news', rate: 60, tradeable: false },
  { id: 'oanda', name: 'OANDA', short: 'OA', color: '#DC2626', kind: 'fx', rate: 120, tradeable: true },
];

export const hitlOptions: { id: Hitl; tk: string; dk: string; icon: string }[] = [
  { id: 'manual', tk: 'hitlManual', dk: 'hitlManualDesc', icon: '✋' },
  { id: 'confirm', tk: 'hitlConfirm', dk: 'hitlConfirmDesc', icon: '✓' },
  { id: 'auto', tk: 'hitlAuto', dk: 'hitlAutoDesc', icon: '⚡' },
];

function initialSources(): Source[] {
  return [
    { id: 'crypto', zh: '加密貨幣', en: 'Crypto', descZh: 'Binance / Coinbase 公開 API', descEn: 'Binance / Coinbase public APIs', icon: '₿', color: '#F59E0B', enabled: true, available: true, connected: true, feed: 'livefeed' },
    { id: 'stocks', zh: '股市', en: 'Stocks', descZh: '美股 / 港股 / 台股 — 接口受限', descEn: 'US / HK / TW — limited access', icon: '📈', color: '#3B82F6', enabled: false, available: false, connected: false, feed: 'cached' },
    { id: 'forex', zh: '外匯', en: 'Forex', descZh: '主要貨幣對', descEn: 'Major currency pairs', icon: '$', color: '#10B981', enabled: false, available: true, connected: false, feed: 'cached' },
    { id: 'bonds', zh: '政府債券', en: 'Government bonds', descZh: '殖利率曲線（離線資料）', descEn: 'Yield curve (offline data)', icon: '%', color: '#8B5CF6', enabled: true, available: true, connected: false, feed: 'cached' },
    { id: 'news', zh: '新聞', en: 'News', descZh: 'Finnhub / NewsAPI', descEn: 'Finnhub / NewsAPI', icon: '✦', color: '#EF4444', enabled: true, available: true, connected: true, feed: 'livefeed' },
  ];
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAiAccessSettings(options: UseAiAccessSettingsOptions) {
  const api = options.api ?? getRuntimeApiClients().aiAccess;
  const sources = reactive<Source[]>(initialSources());
  const keys = reactive<ApiKeyView[]>([]);
  const readKeys = computed(() => keys.filter(k => k.permissions === 'read'));
  const brokerKeys = computed(() => keys.filter(k => k.permissions === 'trade'));
  const copiedId = ref<string | null>(null);

  const addOpen = ref(false);
  const addMode = ref<'read' | 'trade'>('trade');
  const draft = reactive({
    provider: 'binance',
    key: '',
    secret: '',
    env: 'sandbox' as 'sandbox' | 'live',
    label: '',
  });
  const filteredProviders = computed(() =>
    addMode.value === 'trade' ? PROVIDERS.filter(p => p.tradeable) : PROVIDERS.filter(p => !p.tradeable || p.kind === 'news')
  );

  const mcpServers = reactive<McpServer[]>([]);
  const agents = reactive<AgentView[]>([]);
  const calls = reactive<AuditCallView[]>([]);

  function providerOf(id: string): Provider {
    return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
  }

  function replaceKeys(nextKeys: AiAccessKeyDto[]) {
    keys.splice(0, keys.length, ...nextKeys.map(keyFromDto));
  }

  function copyKey(k: ApiKeyView) {
    if (!k.canCopy) return;
    navigator.clipboard?.writeText(k.key);
    copiedId.value = k.id;
    setTimeout(() => { if (copiedId.value === k.id) copiedId.value = null; }, 1400);
  }

  function copyText(text: string, id: string) {
    navigator.clipboard?.writeText(text);
    copiedId.value = id;
    setTimeout(() => { if (copiedId.value === id) copiedId.value = null; }, 1400);
  }

  async function testKey(k: ApiKeyView) {
    if (k.testing) return;
    k.testing = true;
    k.lastTest = null;
    try {
      const result = await api.testKey(k.id);
      const liveKey = keys.find(item => item.id === k.id);
      if (liveKey) {
        liveKey.lastTest = result.status;
        liveKey.lastUsedLabel = formatLastUsed(result.testedAt);
        liveKey.testing = false;
      }
      await refreshAuditCalls();
      options.emitToast(options.lang() === 'zh' ? '已完成模擬連線測試' : 'Simulated connection test complete');
    } catch {
      const liveKey = keys.find(item => item.id === k.id);
      if (liveKey) {
        liveKey.lastTest = 'fail';
        liveKey.testing = false;
      }
      options.emitToast(options.lang() === 'zh' ? '模擬連線測試失敗' : 'Simulated connection test failed');
    }
  }

  async function revokeKey(k: ApiKeyView) {
    try {
      await api.revokeKey(k.id);
      const i = keys.findIndex(x => x.id === k.id);
      if (i >= 0) keys.splice(i, 1);
    } catch {
      options.emitToast(options.lang() === 'zh' ? '撤銷失敗' : 'Revoke failed');
    }
  }

  async function updatePolicy(k: ApiKeyView, hitl: AiHitlMode) {
    if (k.permissions !== 'trade') return;
    const previous = k.hitl;
    k.hitl = hitl;
    try {
      const updated = await api.updatePolicy(k.id, {
        hitl,
        riskLimits: {
          maxSingleUsd: k.maxSingle ?? 0,
          maxDailyUsd: k.maxDaily ?? 0,
          allowedSymbols: k.allowed ? k.allowed.split(',').map(symbol => symbol.trim()).filter(Boolean) : [],
          expiresAt: k.expires ? `${k.expires}T00:00:00Z` : null,
        },
      });
      const index = keys.findIndex(item => item.id === k.id);
      if (index >= 0) mergeKeyDtoIntoView(keys[index], updated);
    } catch {
      k.hitl = previous;
      options.emitToast(options.lang() === 'zh' ? '交易政策更新失敗' : 'Trading policy update failed');
    }
  }

  function openAdd(mode: 'read' | 'trade') {
    addMode.value = mode;
    draft.provider = mode === 'trade' ? 'binance' : 'finnhub';
    draft.key = '';
    draft.secret = '';
    draft.env = 'sandbox';
    draft.label = '';
    addOpen.value = true;
  }

  async function saveKey() {
    if (!draft.key) return;
    try {
      const created = await api.createKey({
        provider: draft.provider,
        apiKey: draft.key,
        apiSecret: draft.secret || 'demo-secret-placeholder',
        environment: draft.env,
        permission: addMode.value,
        label: draft.label,
        hitl: addMode.value === 'trade' ? 'manual' : undefined,
        riskLimits: addMode.value === 'trade'
          ? { maxSingleUsd: 1000, maxDailyUsd: 5000, allowedSymbols: [], expiresAt: null }
          : undefined,
      });
      keys.unshift(keyFromDto(created));
      addOpen.value = false;
    } catch {
      options.emitToast(options.lang() === 'zh' ? '金鑰儲存失敗' : 'Key save failed');
    }
  }

  function endpointText(endpoint: McpEndpointDto) {
    if (endpoint.kind === 'read') return { tk: 'readonlyServer', dk: 'readonlyDesc' };
    if (endpoint.kind === 'write') return { tk: 'tradingServer', dk: 'tradingDesc' };
    return { tk: 'adminServer', dk: 'adminDesc' };
  }

  function endpointFromDto(endpoint: McpEndpointDto): McpServer {
    return { ...endpointText(endpoint), ...endpoint };
  }

  function agentIcon(agent: AiAgentDto) {
    if (agent.name.includes('Claude')) return '◆';
    if (agent.name.includes('Cursor')) return '⌘';
    return '◯';
  }

  function agentFromDto(agent: AiAgentDto): AgentView {
    return {
      id: agent.id,
      name: agent.name,
      icon: agentIcon(agent),
      scopes: agent.scopes,
      last: formatLastUsed(agent.lastUsedAt) || (options.lang() === 'zh' ? '尚未使用' : 'never'),
      status: agent.status,
    };
  }

  function callFromDto(call: AiAuditCallDto): AuditCallView {
    return {
      id: call.id,
      t: call.time.slice(11, 19),
      agent: call.agent,
      tool: call.tool,
      args: call.argsSummary,
      ok: call.ok,
      ms: call.durationMs,
    };
  }

  async function loadAiAccessData() {
    try {
      const [nextKeys, nextEndpoints, nextAgents] = await Promise.all([
        api.listKeys(),
        api.listMcpEndpoints(),
        api.listAgents(),
      ]);
      replaceKeys(nextKeys);
      mcpServers.splice(0, mcpServers.length, ...nextEndpoints.map(endpointFromDto));
      agents.splice(0, agents.length, ...nextAgents.map(agentFromDto));
      await refreshAuditCalls();
    } catch (error) {
      replaceKeys([]);
      mcpServers.splice(0, mcpServers.length);
      agents.splice(0, agents.length);
      calls.splice(0, calls.length);
      options.emitToast(errorMessage(error, options.lang() === 'zh' ? 'AI Access 載入失敗' : 'AI Access load failed'));
    }
  }

  async function refreshAuditCalls() {
    try {
      const nextCalls = await api.listAuditCalls({ limit: 20 });
      calls.splice(0, calls.length, ...nextCalls.data.map(callFromDto));
    } catch {
      calls.splice(0, calls.length);
    }
  }

  async function toggleMcpEndpoint(endpoint: McpServer) {
    try {
      const updated = await api.updateMcpEndpoint(endpoint.id, { enabled: endpoint.enabled });
      const index = mcpServers.findIndex(item => item.id === updated.id);
      if (index >= 0) mcpServers[index] = endpointFromDto(updated);
    } catch {
      endpoint.enabled = !endpoint.enabled;
      options.emitToast(options.lang() === 'zh' ? 'MCP 端點更新失敗' : 'MCP endpoint update failed');
    }
  }

  async function revokeAgent(agent: AgentView) {
    try {
      await api.revokeAgent(agent.id);
      const index = agents.findIndex(item => item.id === agent.id);
      if (index >= 0) agents.splice(index, 1);
    } catch {
      options.emitToast(options.lang() === 'zh' ? 'Agent 撤銷失敗' : 'Agent revoke failed');
    }
  }

  return {
    sources,
    keys,
    readKeys,
    brokerKeys,
    providerOf,
    hitlOptions,
    copiedId,
    copyKey,
    copyText,
    testKey,
    revokeKey,
    updatePolicy,
    addOpen,
    addMode,
    draft,
    filteredProviders,
    openAdd,
    saveKey,
    mcpServers,
    agents,
    calls,
    loadAiAccessData,
    refreshAuditCalls,
    toggleMcpEndpoint,
    revokeAgent,
  };
}
