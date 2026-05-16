import type { ApiFailure, ApiSuccess } from './apiTypes';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    field?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.field = input.field;
    this.details = input.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

export function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isApiFailure(value: unknown): value is ApiFailure {
  const error = isRecord(value) ? value.error : null;
  return !!value
    && typeof value === 'object'
    && isRecord(error)
    && typeof error.code === 'string'
    && typeof error.message === 'string';
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return !!value && typeof value === 'object' && 'data' in value;
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

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { json, headers: headersInit, ...requestOptions } = options;
  const headers = new Headers(headersInit);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const init: RequestInit = { ...requestOptions, headers };
  if (json !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    init.body = JSON.stringify(json);
  }

  const response = await fetch(path, init);
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

  if (!isApiSuccess<T>(payload)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a data envelope',
      requestId: null,
    });
  }

  return payload.data;
}
