import { ApiClientError, apiRequest, buildQueryString } from './apiClient';
import type {
  ApiFailure,
  OpsActionDto,
  OpsJobDto,
  OpsLogDto,
  PaginatedResponse,
  RuntimeDataMode,
  TriggerOpsJobRequest,
} from './apiTypes';

export interface OpsApi {
  mode: RuntimeDataMode;
  getActions(): Promise<OpsActionDto[]>;
  triggerJob(request: TriggerOpsJobRequest): Promise<OpsJobDto>;
  getCurrentJob(): Promise<OpsJobDto | null>;
  getJob(jobId: string): Promise<OpsJobDto>;
  listLogs(params?: { limit?: number; cursor?: string | null }): Promise<PaginatedResponse<OpsLogDto>>;
}

const actions: OpsActionDto[] = [
  { key: 'refetchNews', label: 'Refetch news', description: 'Force-pull news from all sources', risk: 'low', requiresConfirm: true, enabled: true },
  { key: 'refetchMkt', label: 'Refetch market quotes', description: 'Re-pull all market quotes', risk: 'low', requiresConfirm: true, enabled: true },
  { key: 'recalcPos', label: 'Recalculate positions', description: 'Recompute holdings and cost basis', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'recalcRoi', label: 'Recalculate ROI and Sharpe', description: 'Recompute ROI, Sharpe, and drawdown', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'refetchBonds', label: 'Refetch government bonds', description: 'Pull yield curves', risk: 'medium', requiresConfirm: true, enabled: true },
  { key: 'reimportKline', label: 'Reimport historical K lines', description: 'Re-ingest historical OHLCV', risk: 'high', requiresConfirm: true, enabled: true },
];

function cloneJob(job: OpsJobDto): OpsJobDto {
  return { ...job };
}

function cloneLog(log: OpsLogDto): OpsLogDto {
  return { ...log };
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Number.isFinite(limit) && limit !== undefined && limit > 0 ? Math.floor(limit) : fallback;
}

function startIndexAfterCursor(logs: OpsLogDto[], cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const index = logs.findIndex(log => log.id === cursor);
  return index >= 0 ? index + 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isApiFailure(value: unknown): value is ApiFailure {
  const error = isRecord(value) ? value.error : null;
  return isRecord(value)
    && isRecord(error)
    && typeof error.code === 'string'
    && typeof error.message === 'string'
    && typeof value.requestId === 'string';
}

function isPaginatedResponse<T>(value: unknown): value is PaginatedResponse<T> {
  const page = isRecord(value) ? value.page : null;
  return isRecord(value)
    && Array.isArray(value.data)
    && isRecord(page)
    && (typeof page.nextCursor === 'string' || page.nextCursor === null)
    && typeof page.hasMore === 'boolean'
    && typeof value.requestId === 'string';
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Response body was not valid JSON',
      requestId: null,
    });
  }
}

async function apiPaginatedRequest<T>(path: string): Promise<PaginatedResponse<T>> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  const response = await fetch(path, { headers });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiFailure(payload)) {
      throw new ApiClientError({
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        requestId: payload.requestId,
        field: payload.error.field,
        details: payload.error.details,
      });
    }
    throw new ApiClientError({
      status: response.status,
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`,
      requestId: null,
    });
  }

  if (!isPaginatedResponse<T>(payload)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: null,
    });
  }

  return payload;
}

export function createMockOpsApi(): OpsApi {
  const logs: OpsLogDto[] = [];
  const jobs: OpsJobDto[] = [];
  let seq = 0;
  let currentJob: OpsJobDto | null = null;

  return {
    mode: 'mock',
    async getActions() {
      return actions.map(action => ({ ...action }));
    },
    async triggerJob(request) {
      if (currentJob) {
        throw new ApiClientError({
          status: 409,
          code: 'OPS_JOB_ALREADY_RUNNING',
          message: 'An ops job is already running',
        });
      }

      const action = actions.find(item => item.key === request.actionKey);
      if (!action) {
        throw new ApiClientError({
          status: 404,
          code: 'OPS_ACTION_NOT_FOUND',
          message: 'Ops action not found',
        });
      }
      if (!action.enabled) {
        throw new ApiClientError({
          status: 403,
          code: 'OPS_ACTION_DISABLED',
          message: 'Ops action is disabled',
        });
      }

      seq += 1;
      const startedAt = new Date().toISOString();
      const job: OpsJobDto = {
        id: `ops_${seq}`,
        actionKey: action.key,
        label: action.label,
        status: 'running',
        startedAt,
        completedAt: null,
        startedBy: 'admin',
        message: null,
      };

      currentJob = job;
      jobs.unshift(job);

      await new Promise(resolve => setTimeout(resolve, 650));

      const failed = action.key === 'refetchBonds';
      job.status = failed ? 'failed' : 'success';
      job.completedAt = new Date().toISOString();
      job.message = failed ? `${action.label} failed` : `${action.label} completed`;
      logs.unshift({
        id: `log_${seq}`,
        time: job.completedAt,
        actionKey: job.actionKey,
        operation: job.label,
        actor: job.startedBy,
        status: failed ? 'failed' : 'success',
        durationMs: failed ? 800 : 700,
        message: job.message,
      });

      if (currentJob?.id === job.id) currentJob = null;
      return cloneJob(job);
    },
    async getCurrentJob() {
      return currentJob ? cloneJob(currentJob) : null;
    },
    async getJob(jobId) {
      const job = jobs.find(item => item.id === jobId);
      if (!job) {
        throw new ApiClientError({
          status: 404,
          code: 'OPS_JOB_NOT_FOUND',
          message: 'Ops job not found',
        });
      }
      return cloneJob(job);
    },
    async listLogs(params = {}) {
      const limit = normalizeLimit(params.limit, 30);
      const startIndex = startIndexAfterCursor(logs, params.cursor);
      const pageData = logs.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + pageData.length < logs.length;

      return {
        data: pageData.map(cloneLog),
        page: { nextCursor: hasMore && pageData.length > 0 ? pageData[pageData.length - 1].id : null, hasMore },
        requestId: 'mock',
      };
    },
  };
}

export function createHttpOpsApi(basePath = '/api/v1'): OpsApi {
  return {
    mode: 'api',
    getActions: () => apiRequest<OpsActionDto[]>(`${basePath}/ops/actions`),
    triggerJob: request => {
      const headers: Record<string, string> = {};
      if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;
      return apiRequest<OpsJobDto>(`${basePath}/ops/jobs`, {
        method: 'POST',
        headers,
        json: { actionKey: request.actionKey, params: request.params },
      });
    },
    getCurrentJob: () => apiRequest<OpsJobDto | null>(`${basePath}/ops/jobs/current`),
    getJob: jobId => apiRequest<OpsJobDto>(`${basePath}/ops/jobs/${encodeURIComponent(jobId)}`),
    listLogs: params => apiPaginatedRequest<OpsLogDto>(`${basePath}/ops/logs${buildQueryString(params ?? {})}`),
  };
}

export function createOpsApi(mode: RuntimeDataMode, basePath = '/api/v1'): OpsApi {
  return mode === 'api' ? createHttpOpsApi(basePath) : createMockOpsApi();
}
