import { ApiClientError, apiPaginatedRequest, apiRequest, buildQueryString } from './apiClient';
import type {
  AiAccessKeyDto,
  AiAccessKeyTestDto,
  AiAgentDto,
  AiAuditCallDto,
  AiProviderDto,
  CreateAiAccessKeyRequest,
  McpEndpointDto,
  PaginatedResponse,
  RuntimeDataMode,
  UpdateAiTradingPolicyRequest,
} from './apiTypes';

export interface AiAccessApi {
  mode: RuntimeDataMode;
  listProviders(): Promise<AiProviderDto[]>;
  listKeys(): Promise<AiAccessKeyDto[]>;
  createKey(request: CreateAiAccessKeyRequest): Promise<AiAccessKeyDto>;
  testKey(keyId: string): Promise<AiAccessKeyTestDto>;
  updatePolicy(keyId: string, request: UpdateAiTradingPolicyRequest): Promise<AiAccessKeyDto>;
  revokeKey(keyId: string): Promise<{ revoked: boolean }>;
  listMcpEndpoints(): Promise<McpEndpointDto[]>;
  updateMcpEndpoint(endpointId: string, request: { enabled: boolean }): Promise<McpEndpointDto>;
  listAgents(): Promise<AiAgentDto[]>;
  revokeAgent(agentId: string): Promise<{ revoked: boolean }>;
  listAuditCalls(params?: { page?: number; size?: number }): Promise<PaginatedResponse<AiAuditCallDto>>;
}

const providers: AiProviderDto[] = [
  { id: 'binance', name: 'Binance', kind: 'crypto', rateLimitPerMinute: 1200, tradeable: true, supportsSandbox: true },
  { id: 'coinbase', name: 'Coinbase', kind: 'crypto', rateLimitPerMinute: 600, tradeable: true, supportsSandbox: true },
  { id: 'alpaca', name: 'Alpaca', kind: 'stocks', rateLimitPerMinute: 200, tradeable: true, supportsSandbox: true },
  { id: 'polygon', name: 'Polygon.io', kind: 'stocks', rateLimitPerMinute: 100, tradeable: false, supportsSandbox: false },
  { id: 'finnhub', name: 'Finnhub', kind: 'news', rateLimitPerMinute: 60, tradeable: false, supportsSandbox: false },
];

function maskKey(key: string): string {
  if (key.length <= 10) return '******';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function deterministicKeyStatus(id: string): 'ok' | 'fail' {
  const sum = id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return sum % 5 === 0 ? 'fail' : 'ok';
}

function cloneKey(key: AiAccessKeyDto): AiAccessKeyDto {
  return {
    ...key,
    riskLimits: key.riskLimits
      ? { ...key.riskLimits, allowedSymbols: [...key.riskLimits.allowedSymbols] }
      : undefined,
  };
}

function cloneEndpoint(endpoint: McpEndpointDto): McpEndpointDto {
  return { ...endpoint, tools: [...endpoint.tools] };
}

function cloneAgent(agent: AiAgentDto): AiAgentDto {
  return { ...agent, scopes: [...agent.scopes] };
}

function cloneAuditCall(call: AiAuditCallDto): AiAuditCallDto {
  return { ...call };
}

function normalizeSize(size: number | undefined, fallback: number): number {
  return Number.isFinite(size) && size !== undefined && size > 0 ? Math.floor(size) : fallback;
}

function findKey(keys: AiAccessKeyDto[], keyId: string): AiAccessKeyDto {
  const key = keys.find(item => item.id === keyId);
  if (!key) {
    throw new ApiClientError({
      status: 404,
      code: 'AI_ACCESS_KEY_NOT_FOUND',
      message: 'API key not found',
    });
  }
  return key;
}

function buildAuditCall(input: Omit<AiAuditCallDto, 'id' | 'time'>, seq: number): AiAuditCallDto {
  return {
    id: `call_${seq}`,
    time: new Date(Date.UTC(2026, 4, 16, 1, seq, 0)).toISOString(),
    ...input,
  };
}

export function createMockAiAccessApi(): AiAccessApi {
  let keySeq = 5;
  let callSeq = 5;
  const keys: AiAccessKeyDto[] = [
    {
      id: 'key_1',
      provider: 'binance',
      environment: 'live',
      permission: 'trade',
      label: 'Main account',
      maskedKey: maskKey('DEMO-BINANCE-LIVE-KEY-0001'),
      lastTest: 'ok',
      lastUsedAt: '2026-05-16T01:00:00Z',
      hitl: 'confirm',
      riskLimits: { maxSingleUsd: 5000, maxDailyUsd: 25000, allowedSymbols: ['BTC', 'ETH', 'SOL', 'BNB'], expiresAt: '2026-12-31T00:00:00Z' },
    },
    {
      id: 'key_3',
      provider: 'coinbase',
      environment: 'sandbox',
      permission: 'trade',
      label: 'Test',
      maskedKey: maskKey('DEMO-COINBASE-SANDBOX-KEY-0002'),
      lastTest: 'ok',
      lastUsedAt: '2026-05-15T23:00:00Z',
      hitl: 'auto',
      riskLimits: { maxSingleUsd: 1000, maxDailyUsd: 10000, allowedSymbols: [], expiresAt: null },
    },
    {
      id: 'key_4',
      provider: 'alpaca',
      environment: 'sandbox',
      permission: 'trade',
      label: 'Paper',
      maskedKey: maskKey('DEMO-ALPACA-PAPER-KEY-0004'),
      lastTest: null,
      lastUsedAt: null,
      hitl: 'manual',
      riskLimits: { maxSingleUsd: 2000, maxDailyUsd: 8000, allowedSymbols: [], expiresAt: null },
    },
    {
      id: 'key_2',
      provider: 'finnhub',
      environment: 'live',
      permission: 'read',
      label: 'News feed',
      maskedKey: maskKey('DEMO-FINNHUB-READ-KEY-0003'),
      lastTest: null,
      lastUsedAt: null,
    },
    {
      id: 'key_5',
      provider: 'polygon',
      environment: 'live',
      permission: 'read',
      label: 'Markets',
      maskedKey: maskKey('DEMO-POLYGON-READ-KEY-0005'),
      lastTest: 'ok',
      lastUsedAt: null,
    },
  ];
  const endpoints: McpEndpointDto[] = [
    { id: 'readonly', kind: 'read', label: 'Readonly Server', url: 'https://mcp.resource.app/v1/readonly', tools: ['markets.get_quote', 'markets.list', 'positions.list', 'news.recent'], enabled: true, editable: true },
    { id: 'trading', kind: 'write', label: 'Trading Server', url: 'https://mcp.resource.app/v1/trading', tools: ['orders.place', 'orders.cancel', 'orders.modify', 'orders.list'], enabled: false, editable: true },
    { id: 'admin', kind: 'admin', label: 'Admin Server', url: 'https://mcp.resource.app/v1/admin', tools: ['settings.update', 'keys.create', 'keys.revoke'], enabled: false, editable: false },
  ];
  const agents: AiAgentDto[] = [
    { id: 'agent_1', name: 'Claude Desktop', scopes: ['readonly'], status: 'live', lastUsedAt: '2026-05-16T01:35:00Z' },
    { id: 'agent_2', name: 'Cursor', scopes: ['readonly'], status: 'live', lastUsedAt: '2026-05-16T00:15:00Z' },
  ];
  const calls: AiAuditCallDto[] = [
    buildAuditCall({ agent: 'Claude Desktop', tool: 'markets.get_quote', argsSummary: 'symbol=AAPL', ok: true, durationMs: 84, errorCode: null }, 5),
    buildAuditCall({ agent: 'Cursor', tool: 'positions.list', argsSummary: 'account=main', ok: true, durationMs: 112, errorCode: null }, 4),
    buildAuditCall({ agent: 'Claude Desktop', tool: 'news.recent', argsSummary: 'symbol=NVDA', ok: true, durationMs: 98, errorCode: null }, 3),
    buildAuditCall({ agent: 'Cursor', tool: 'orders.place', argsSummary: 'symbol=BTC', ok: false, durationMs: 142, errorCode: 'AI_ACCESS_PERMISSION_DENIED' }, 2),
    buildAuditCall({ agent: 'Claude Desktop', tool: 'markets.list', argsSummary: 'kind=stocks', ok: true, durationMs: 73, errorCode: null }, 1),
  ];

  return {
    mode: 'mock',
    async listProviders() {
      return providers.map(provider => ({ ...provider }));
    },
    async listKeys() {
      return keys.map(cloneKey);
    },
    async createKey(request) {
      if (!providers.some(provider => provider.id === request.provider)) {
        throw new ApiClientError({
          status: 404,
          code: 'AI_ACCESS_PROVIDER_NOT_FOUND',
          message: 'AI provider not found',
          field: 'provider',
        });
      }
      if (!request.apiKey.trim() || !request.apiSecret.trim()) {
        throw new ApiClientError({
          status: 400,
          code: 'AI_ACCESS_KEY_INVALID',
          message: 'API key and secret are required',
        });
      }

      keySeq += 1;
      const key: AiAccessKeyDto = {
        id: `key_${keySeq}`,
        provider: request.provider,
        environment: request.environment,
        permission: request.permission,
        label: request.label,
        maskedKey: maskKey(request.apiKey),
        lastTest: null,
        lastUsedAt: null,
        hitl: request.permission === 'trade' ? request.hitl ?? 'manual' : undefined,
        riskLimits: request.permission === 'trade' && request.riskLimits
          ? { ...request.riskLimits, allowedSymbols: [...request.riskLimits.allowedSymbols] }
          : undefined,
      };
      keys.unshift(key);
      return cloneKey(key);
    },
    async testKey(keyId) {
      const key = findKey(keys, keyId);
      const status = deterministicKeyStatus(key.id + key.provider);
      key.lastTest = status;
      key.lastUsedAt = new Date(Date.UTC(2026, 4, 16, 2, callSeq, 0)).toISOString();

      callSeq += 1;
      calls.unshift(buildAuditCall({
        agent: 'System',
        tool: 'keys.test',
        argsSummary: `keyId=${keyId}`,
        ok: status === 'ok',
        durationMs: 218,
        errorCode: status === 'ok' ? null : 'AI_ACCESS_KEY_TEST_FAILED',
      }, callSeq));

      return {
        keyId,
        status,
        testedAt: key.lastUsedAt,
        latencyMs: 218,
        message: status === 'ok' ? 'Connected' : 'Connection failed',
      };
    },
    async updatePolicy(keyId, request) {
      const key = findKey(keys, keyId);
      if (key.permission !== 'trade') {
        throw new ApiClientError({
          status: 400,
          code: 'AI_ACCESS_TRADING_POLICY_INVALID',
          message: 'Key is not trading-capable',
        });
      }

      key.hitl = request.hitl;
      key.riskLimits = { ...request.riskLimits, allowedSymbols: [...request.riskLimits.allowedSymbols] };
      return cloneKey(key);
    },
    async revokeKey(keyId) {
      const index = keys.findIndex(item => item.id === keyId);
      if (index < 0) {
        throw new ApiClientError({
          status: 404,
          code: 'AI_ACCESS_KEY_NOT_FOUND',
          message: 'API key not found',
        });
      }
      keys.splice(index, 1);
      return { revoked: true };
    },
    async listMcpEndpoints() {
      return endpoints.map(cloneEndpoint);
    },
    async updateMcpEndpoint(endpointId, request) {
      const endpoint = endpoints.find(item => item.id === endpointId);
      if (!endpoint) {
        throw new ApiClientError({
          status: 404,
          code: 'AI_ACCESS_ENDPOINT_NOT_FOUND',
          message: 'MCP endpoint not found',
        });
      }
      if (!endpoint.editable) {
        throw new ApiClientError({
          status: 403,
          code: 'AI_ACCESS_ENDPOINT_NOT_EDITABLE',
          message: 'MCP endpoint is not editable',
        });
      }

      endpoint.enabled = request.enabled;
      return cloneEndpoint(endpoint);
    },
    async listAgents() {
      return agents.map(cloneAgent);
    },
    async revokeAgent(agentId) {
      const index = agents.findIndex(agent => agent.id === agentId);
      if (index < 0) {
        throw new ApiClientError({
          status: 404,
          code: 'AI_ACCESS_AGENT_NOT_FOUND',
          message: 'Agent not found',
        });
      }
      agents.splice(index, 1);
      return { revoked: true };
    },
    async listAuditCalls(params = {}) {
      const size = normalizeSize(params.size, 20);
      const page = params.page ?? 0;

      return {
        items: calls.slice(page * size, page * size + size).map(cloneAuditCall),
        page,
        size,
        totalElements: calls.length,
        totalPages: Math.ceil(calls.length / size),
      };
    },
  };
}

export function createHttpAiAccessApi(basePath = '/api/v1'): AiAccessApi {
  return {
    mode: 'api',
    listProviders: () => apiRequest<AiProviderDto[]>(`${basePath}/ai-access/providers`),
    listKeys: () => apiRequest<AiAccessKeyDto[]>(`${basePath}/ai-access/keys`),
    createKey: request => apiRequest<AiAccessKeyDto>(`${basePath}/ai-access/keys`, { method: 'POST', json: request }),
    testKey: keyId => apiRequest<AiAccessKeyTestDto>(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}/test`, { method: 'POST' }),
    updatePolicy: (keyId, request) => apiRequest<AiAccessKeyDto>(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}/policy`, { method: 'PATCH', json: request }),
    revokeKey: keyId => apiRequest<{ revoked: boolean }>(`${basePath}/ai-access/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
    listMcpEndpoints: () => apiRequest<McpEndpointDto[]>(`${basePath}/ai-access/mcp-endpoints`),
    updateMcpEndpoint: (endpointId, request) => apiRequest<McpEndpointDto>(`${basePath}/ai-access/mcp-endpoints/${encodeURIComponent(endpointId)}`, { method: 'PATCH', json: request }),
    listAgents: () => apiRequest<AiAgentDto[]>(`${basePath}/ai-access/agents`),
    revokeAgent: agentId => apiRequest<{ revoked: boolean }>(`${basePath}/ai-access/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' }),
    listAuditCalls: params => apiPaginatedRequest<AiAuditCallDto>(
      `${basePath}/ai-access/audit-calls${buildQueryString({ page: params?.page ?? 0, size: params?.size ?? 20 })}`,
    ),
  };
}

export function createAiAccessApi(mode: RuntimeDataMode, basePath = '/api/v1'): AiAccessApi {
  return mode === 'api' ? createHttpAiAccessApi(basePath) : createMockAiAccessApi();
}
