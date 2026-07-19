import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpOpsApi, createMockOpsApi, createOpsApi } from './opsApi';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function lastFetchInit(): RequestInit {
  const calls = vi.mocked(fetch).mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function headerValue(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

async function finishJob<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(650);
  return promise;
}

describe('opsApi', () => {
  it('mock adapter exposes actions, current job, and logs', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const actions = await api.getActions();
    const runPromise = api.triggerJob({ actionKey: 'refetchNews', params: {}, idempotencyKey: 'k1' });
    const current = await api.getCurrentJob();

    expect(actions.some(action => action.key === 'refetchNews')).toBe(true);
    expect(current?.actionKey).toBe('refetchNews');

    const job = await finishJob(runPromise);
    const logs = await api.listLogs({ size: 10 });

    expect(job.status).toBe('success');
    expect(await api.getCurrentJob()).toBeNull();
    expect(logs.items[0]).toMatchObject({ actionKey: 'refetchNews', status: 'success' });
    expect(logs).toMatchObject({ page: 0, size: 10, totalElements: 1, totalPages: 1 });
  });

  it('mock adapter rejects duplicate jobs while busy', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const runPromise = api.triggerJob({ actionKey: 'refetchNews', params: {} });

    await expect(api.triggerJob({ actionKey: 'recalcPos', params: {} })).rejects.toMatchObject({
      code: 'OPS_JOB_ALREADY_RUNNING',
    });
    await finishJob(runPromise);
  });

  it('mock adapter paginates logs by page number', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const firstJob = await finishJob(api.triggerJob({ actionKey: 'refetchNews', params: {} }));
    const secondJob = await finishJob(api.triggerJob({ actionKey: 'recalcPos', params: {} }));
    const thirdJob = await finishJob(api.triggerJob({ actionKey: 'recalcRoi', params: {} }));

    const firstPage = await api.listLogs({ size: 2 });
    const secondPage = await api.listLogs({ size: 2, page: 1 });

    expect(firstPage.items.map(item => item.actionKey)).toEqual([thirdJob.actionKey, secondJob.actionKey]);
    expect(firstPage).toMatchObject({ page: 0, size: 2, totalElements: 3, totalPages: 2 });
    expect(secondPage.items.map(item => item.actionKey)).toEqual([firstJob.actionKey]);
    expect(secondPage).toMatchObject({ page: 1, size: 2, totalElements: 3, totalPages: 2 });
  });

  it('mock adapter reports page-number drift when a newer log is prepended', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const firstJob = await finishJob(api.triggerJob({ actionKey: 'refetchNews', params: {} }));
    const secondJob = await finishJob(api.triggerJob({ actionKey: 'recalcPos', params: {} }));
    const thirdJob = await finishJob(api.triggerJob({ actionKey: 'recalcRoi', params: {} }));

    const firstPage = await api.listLogs({ size: 2 });
    await finishJob(api.triggerJob({ actionKey: 'refetchMkt', params: {} }));
    const secondPage = await api.listLogs({ size: 2, page: 1 });

    expect(firstPage.items.map(item => item.actionKey)).toEqual([thirdJob.actionKey, secondJob.actionKey]);
    // page-number 分頁與後端一致:新資料插入後,第 2 頁會往後位移,故 secondJob 會重複出現
    expect(secondPage.items.map(item => item.actionKey)).toEqual([secondJob.actionKey, firstJob.actionKey]);
    expect(secondPage.totalElements).toBe(4);
    expect(secondPage.totalPages).toBe(2);
  });

  it('http adapter sends idempotency key header', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/csrf')) {
        document.cookie = 'XSRF-TOKEN=csrf-ops; path=/';
        return new Response(JSON.stringify({
          data: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
          requestId: 'req_csrf',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
      data: {
        id: 'ops_1',
        actionKey: 'refetchNews',
        label: 'Refetch news',
        status: 'running',
        startedAt: '2026-05-16T00:00:00Z',
        completedAt: null,
        startedBy: 'admin',
        message: null,
      },
      requestId: 'req_1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const api = createHttpOpsApi('/api/v1');
    await api.triggerJob({ actionKey: 'refetchNews', params: {}, idempotencyKey: 'idem_1' });

    const init = lastFetchInit();
    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/jobs', expect.any(Object));
    expect(headerValue(init, 'idempotency-key')).toBe('idem_1');
    expect(headerValue(init, 'x-xsrf-token')).toBe('csrf-ops');
    expect(JSON.parse(String(init.body))).toEqual({ actionKey: 'refetchNews', params: {} });
  });

  it('http adapter encodes listLogs query and returns page envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [{
          id: 'log_1',
          time: '2026-05-16T00:00:00Z',
          actionKey: 'refetchNews',
          operation: 'Refetch news',
          actor: 'admin',
          status: 'success',
          durationMs: 700,
          message: 'Completed',
        }],
        page: 1,
        size: 5,
        totalElements: 11,
        totalPages: 3,
      },
      meta: { traceId: 'req_2' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');
    const logs = await api.listLogs({ page: 1, size: 5 });
    const init = lastFetchInit();

    expect(logs).toMatchObject({ page: 1, size: 5, totalElements: 11, totalPages: 3 });
    expect(logs.items[0].id).toBe('log_1');
    expect(init.credentials).toBe('include');
    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/logs?page=1&size=5', expect.any(Object));
  });

  it('http adapter defaults listLogs to page 0 size 30', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { items: [], page: 0, size: 30, totalElements: 0, totalPages: 0 },
      meta: { traceId: 'req_default' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');
    await api.listLogs();

    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/logs?page=0&size=30', expect.any(Object));
  });

  it('http adapter listLogs uses shared paginated error parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
      meta: { traceId: 'trace_ops' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');

    await expect(api.listLogs({ size: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'OPS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'trace_ops',
    });
  });

  it('http adapter converts failed listLogs envelopes to typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
      requestId: 'req_3',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');

    await expect(api.listLogs({ size: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'OPS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'req_3',
    });
  });

  it('http adapter rejects malformed listLogs paginated envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { items: [], page: 'first', size: 5 },
      requestId: 'req_4',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');

    await expect(api.listLogs({ size: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: 'req_4',
    });
  });

  it('factory selects mock or http implementation', () => {
    expect(createOpsApi('mock').mode).toBe('mock');
    expect(createOpsApi('api', '/api/v1').mode).toBe('api');
  });
});
