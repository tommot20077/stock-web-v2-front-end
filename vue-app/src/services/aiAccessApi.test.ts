import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiAccessApi, createHttpAiAccessApi, createMockAiAccessApi } from './aiAccessApi';
import type { CreateAiAccessKeyRequest, UpdateAiTradingPolicyRequest } from './apiTypes';

const createTradeKeyRequest: CreateAiAccessKeyRequest = {
  provider: 'binance',
  apiKey: 'DEMO-BINANCE-TRADE-KEY-1234',
  apiSecret: 'demo-secret-value',
  environment: 'sandbox',
  permission: 'trade',
  label: 'Paper',
  hitl: 'manual',
  riskLimits: { maxSingleUsd: 1000, maxDailyUsd: 5000, allowedSymbols: [], expiresAt: null },
};

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  vi.unstubAllGlobals();
});

function lastFetchInit(): RequestInit {
  const calls = vi.mocked(fetch).mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function jsonBody(init: RequestInit): unknown {
  return JSON.parse(String(init.body));
}

describe('aiAccessApi', () => {
  it('mock adapter manages keys without returning raw secrets', async () => {
    const api = createMockAiAccessApi();
    const created = await api.createKey(createTradeKeyRequest);
    const keys = await api.listKeys();
    const serialized = JSON.stringify({ created, keys });

    expect(created.maskedKey).not.toBe(createTradeKeyRequest.apiKey);
    expect(created.maskedKey).toContain('...');
    expect(serialized).not.toContain(createTradeKeyRequest.apiKey);
    expect(serialized).not.toContain(createTradeKeyRequest.apiSecret);
    expect(keys.some(key => key.id === created.id)).toBe(true);
  });

  it('mock adapter tests and revokes keys', async () => {
    const api = createMockAiAccessApi();
    const [first] = await api.listKeys();
    const tested = await api.testKey(first.id);

    expect(tested.keyId).toBe(first.id);
    expect(['ok', 'fail']).toContain(tested.status);
    expect((await api.listKeys()).find(key => key.id === first.id)?.lastTest).toBe(tested.status);

    await api.revokeKey(first.id);
    expect((await api.listKeys()).some(key => key.id === first.id)).toBe(false);
  });

  it('mock adapter rejects enabling non-editable admin endpoint', async () => {
    const api = createMockAiAccessApi();

    await expect(api.updateMcpEndpoint('admin', { enabled: true })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'AI_ACCESS_ENDPOINT_NOT_EDITABLE',
    });
  });

  it('mock adapter returns cloned mutable state', async () => {
    const api = createMockAiAccessApi();
    const [firstKey] = await api.listKeys();
    firstKey.riskLimits?.allowedSymbols.push('MUTATED');
    firstKey.label = 'Changed outside';

    const [freshKey] = await api.listKeys();
    expect(freshKey.label).not.toBe('Changed outside');
    expect(freshKey.riskLimits?.allowedSymbols).not.toContain('MUTATED');

    const [firstEndpoint] = await api.listMcpEndpoints();
    firstEndpoint.tools.push('mutated.tool');

    const [freshEndpoint] = await api.listMcpEndpoints();
    expect(freshEndpoint.tools).not.toContain('mutated.tool');

    const [firstAgent] = await api.listAgents();
    firstAgent.scopes.push('mutated');

    const [freshAgent] = await api.listAgents();
    expect(freshAgent.scopes).not.toContain('mutated');
  });

  it('mock adapter paginates audit calls with stable call id cursors', async () => {
    const api = createMockAiAccessApi();

    const firstPage = await api.listAuditCalls({ limit: 2 });
    const secondPage = await api.listAuditCalls({ limit: 2, cursor: firstPage.page.nextCursor });

    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.page).toEqual({ nextCursor: firstPage.data[1].id, hasMore: true });
    expect(secondPage.data.map(call => call.id)).not.toContain(firstPage.data[0].id);
    expect(secondPage.data.map(call => call.id)).not.toContain(firstPage.data[1].id);
  });

  it('mock adapter keeps audit pagination stable when a newer call is prepended', async () => {
    const api = createMockAiAccessApi();

    const firstPage = await api.listAuditCalls({ limit: 2 });
    await api.testKey('key_1');
    const secondPage = await api.listAuditCalls({ limit: 2, cursor: firstPage.page.nextCursor });

    expect(new Set([...firstPage.data, ...secondPage.data].map(call => call.id)).size)
      .toBe(firstPage.data.length + secondPage.data.length);
    expect(secondPage.data.map(call => call.id)).not.toContain(firstPage.data[0].id);
    expect(secondPage.data.map(call => call.id)).not.toContain(firstPage.data[1].id);
  });

  it('http adapter calls expected endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-ai-access; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          requestId: 'req_csrf',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/ai-access/providers')) {
        return new Response(JSON.stringify({ data: [], requestId: 'req_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/ai-access/keys/key_1')) {
        return new Response(JSON.stringify({ data: { revoked: true }, requestId: 'req_2' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: [], page: { nextCursor: null, hasMore: false }, requestId: 'req_3' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpAiAccessApi('/api/v1');
    await api.listProviders();
    await api.revokeKey('key_1');
    await api.listAuditCalls({ limit: 5, cursor: 'call 1/2' });
    const auditInit = lastFetchInit();

    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-access/providers', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-access/keys/key_1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-access/audit-calls?limit=5&cursor=call%201%2F2', expect.any(Object));
    expect(auditInit.credentials).toBe('include');
  });

  it('http adapter sends POST and PATCH payloads through json', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-ai-access-write; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          requestId: 'req_csrf',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/ai-access/keys')) {
        return new Response(JSON.stringify({
          data: {
            id: 'key_3',
            provider: 'binance',
            environment: 'sandbox',
            permission: 'trade',
            label: 'Paper',
            maskedKey: 'DEMO-BINANCE-...-LIVE',
            lastTest: null,
            lastUsedAt: null,
            hitl: 'manual',
            riskLimits: createTradeKeyRequest.riskLimits,
          },
          requestId: 'req_4',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: {
          id: 'key_3',
          provider: 'binance',
          environment: 'sandbox',
          permission: 'trade',
          label: 'Paper',
          maskedKey: 'DEMO-BINANCE-...-LIVE',
          lastTest: null,
          lastUsedAt: null,
          hitl: 'confirm',
          riskLimits: { maxSingleUsd: 2000, maxDailyUsd: 6000, allowedSymbols: ['BTC'], expiresAt: null },
        },
        requestId: 'req_5',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpAiAccessApi('/api/v1');
    await api.createKey(createTradeKeyRequest);
    const createInit = lastFetchInit();

    const policy: UpdateAiTradingPolicyRequest = {
      hitl: 'confirm',
      riskLimits: { maxSingleUsd: 2000, maxDailyUsd: 6000, allowedSymbols: ['BTC'], expiresAt: null },
    };
    await api.updatePolicy('key_3', policy);
    const policyInit = lastFetchInit();

    expect(createInit.method).toBe('POST');
    expect(new Headers(createInit.headers).get('x-xsrf-token')).toBe('csrf-ai-access-write');
    expect(jsonBody(createInit)).toEqual(createTradeKeyRequest);
    expect(policyInit.method).toBe('PATCH');
    expect(new Headers(policyInit.headers).get('x-xsrf-token')).toBe('csrf-ai-access-write');
    expect(jsonBody(policyInit)).toEqual(policy);
  });

  it('http adapter converts failed audit envelopes to typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AI_ACCESS_PERMISSION_DENIED', message: 'Forbidden' },
      requestId: 'req_6',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpAiAccessApi('/api/v1');

    await expect(api.listAuditCalls({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'AI_ACCESS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'req_6',
    });
  });

  it('http adapter listAuditCalls uses shared paginated error parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AI_ACCESS_PERMISSION_DENIED', message: 'Forbidden' },
      meta: { traceId: 'trace_ai_access' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpAiAccessApi('/api/v1');

    await expect(api.listAuditCalls({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'AI_ACCESS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'trace_ai_access',
    });
  });

  it('factory selects mock or http implementation', () => {
    expect(createAiAccessApi('mock').mode).toBe('mock');
    expect(createAiAccessApi('api', '/api/v1').mode).toBe('api');
  });
});
