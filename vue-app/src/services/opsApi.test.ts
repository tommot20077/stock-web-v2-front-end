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
    const logs = await api.listLogs({ limit: 10 });

    expect(job.status).toBe('success');
    expect(await api.getCurrentJob()).toBeNull();
    expect(logs.data[0]).toMatchObject({ actionKey: 'refetchNews', status: 'success' });
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

  it('mock adapter paginates logs with stable log id cursors', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const firstJob = await finishJob(api.triggerJob({ actionKey: 'refetchNews', params: {} }));
    const secondJob = await finishJob(api.triggerJob({ actionKey: 'recalcPos', params: {} }));
    const thirdJob = await finishJob(api.triggerJob({ actionKey: 'recalcRoi', params: {} }));

    const firstPage = await api.listLogs({ limit: 2 });
    const secondPage = await api.listLogs({ limit: 2, cursor: firstPage.page.nextCursor });

    expect(firstPage.data.map(item => item.actionKey)).toEqual([thirdJob.actionKey, secondJob.actionKey]);
    expect(firstPage.page).toEqual({ nextCursor: firstPage.data[1].id, hasMore: true });
    expect(secondPage.data.map(item => item.actionKey)).toEqual([firstJob.actionKey]);
    expect(secondPage.page).toEqual({ nextCursor: null, hasMore: false });
  });

  it('mock adapter keeps page 2 stable when a newer log is prepended', async () => {
    vi.useFakeTimers();
    const api = createMockOpsApi();

    const firstJob = await finishJob(api.triggerJob({ actionKey: 'refetchNews', params: {} }));
    const secondJob = await finishJob(api.triggerJob({ actionKey: 'recalcPos', params: {} }));
    const thirdJob = await finishJob(api.triggerJob({ actionKey: 'recalcRoi', params: {} }));

    const firstPage = await api.listLogs({ limit: 2 });
    await finishJob(api.triggerJob({ actionKey: 'refetchMkt', params: {} }));
    const secondPage = await api.listLogs({ limit: 2, cursor: firstPage.page.nextCursor });

    expect(firstPage.data.map(item => item.actionKey)).toEqual([thirdJob.actionKey, secondJob.actionKey]);
    expect(secondPage.data.map(item => item.actionKey)).toEqual([firstJob.actionKey]);
    expect(new Set([...firstPage.data, ...secondPage.data].map(item => item.id)).size).toBe(3);
  });

  it('http adapter sends idempotency key header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
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
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');
    await api.triggerJob({ actionKey: 'refetchNews', params: {}, idempotencyKey: 'idem_1' });

    const init = lastFetchInit();
    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/jobs', expect.any(Object));
    expect(headerValue(init, 'idempotency-key')).toBe('idem_1');
    expect(JSON.parse(String(init.body))).toEqual({ actionKey: 'refetchNews', params: {} });
  });

  it('http adapter encodes listLogs query and returns paginated envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{
        id: 'log_1',
        time: '2026-05-16T00:00:00Z',
        actionKey: 'refetchNews',
        operation: 'Refetch news',
        actor: 'admin',
        status: 'success',
        durationMs: 700,
        message: 'Completed',
      }],
      page: { nextCursor: 'log_1', hasMore: true },
      requestId: 'req_2',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');
    const logs = await api.listLogs({ limit: 5, cursor: 'log 2/3' });

    expect(logs.page).toEqual({ nextCursor: 'log_1', hasMore: true });
    expect(logs.data[0].id).toBe('log_1');
    expect(fetch).toHaveBeenCalledWith('/api/v1/ops/logs?limit=5&cursor=log%202%2F3', expect.any(Object));
  });

  it('http adapter converts failed listLogs envelopes to typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'OPS_PERMISSION_DENIED', message: 'Forbidden' },
      requestId: 'req_3',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');

    await expect(api.listLogs({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'OPS_PERMISSION_DENIED',
      message: 'Forbidden',
      requestId: 'req_3',
    });
  });

  it('http adapter rejects malformed listLogs paginated envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [],
      page: { nextCursor: 3, hasMore: 'yes' },
      requestId: 'req_4',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const api = createHttpOpsApi('/api/v1');

    await expect(api.listLogs({ limit: 5 })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 200,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: null,
    });
  });

  it('factory selects mock or http implementation', () => {
    expect(createOpsApi('mock').mode).toBe('mock');
    expect(createOpsApi('api', '/api/v1').mode).toBe('api');
  });
});
