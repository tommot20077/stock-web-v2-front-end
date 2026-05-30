import type { ApiFailure, ApiSuccess, PaginatedResponse } from './apiTypes';

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

export interface CsrfTokenNames {
  cookieName: 'XSRF-TOKEN';
  headerName: 'X-XSRF-TOKEN';
}

const DEFAULT_API_BASE_PATH = '/api/v1';
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function isPaginatedResponse<T>(value: unknown): value is PaginatedResponse<T> {
  const page = isRecord(value) ? value.page : null;
  return isRecord(value)
    && Array.isArray(value.data)
    && isRecord(page)
    && (typeof page.nextCursor === 'string' || page.nextCursor === null)
    && typeof page.hasMore === 'boolean';
}

function isCsrfTokenNames(value: unknown): value is CsrfTokenNames {
  return isRecord(value)
    && value.cookieName === CSRF_COOKIE_NAME
    && value.headerName === CSRF_HEADER_NAME;
}

function requestIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const meta = isRecord(value.meta) ? value.meta : null;
  if (typeof meta?.traceId === 'string') return meta.traceId;
  return typeof value.requestId === 'string' ? value.requestId : null;
}

function endpoint(basePath: string, path: string): string {
  return `${basePath.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  if (!match) return null;
  return decodeURIComponent(match.slice(prefix.length));
}

function isUnsafeMethod(method: string | undefined): boolean {
  return UNSAFE_METHODS.has((method ?? 'GET').toUpperCase());
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

function buildRequestInit(options: ApiRequestOptions): RequestInit {
  const { json, headers: headersInit, ...requestOptions } = options;
  const headers = new Headers(headersInit);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const init: RequestInit = { credentials: 'include', ...requestOptions, headers };
  if (json !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    init.body = JSON.stringify(json);
  }
  return init;
}

export async function bootstrapCsrf(basePath = DEFAULT_API_BASE_PATH): Promise<CsrfTokenNames> {
  const response = await fetch(endpoint(basePath, 'csrf'), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw errorFromResponse(response, payload);
  }

  if (!isApiSuccess<unknown>(payload) || !isCsrfTokenNames(payload.data)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include CSRF token names',
      requestId: requestIdFrom(payload),
    });
  }

  return payload.data;
}

export async function ensureCsrfToken(basePath = DEFAULT_API_BASE_PATH): Promise<string> {
  const currentToken = readCookie(CSRF_COOKIE_NAME);
  if (currentToken) return currentToken;

  await bootstrapCsrf(basePath);
  const bootstrappedToken = readCookie(CSRF_COOKIE_NAME);
  if (bootstrappedToken) return bootstrappedToken;

  throw new ApiClientError({
    status: 0,
    code: 'AUTH_CSRF_TOKEN_MISSING',
    message: 'CSRF token cookie was not available after bootstrap',
    requestId: null,
  });
}

async function prepareRequestInit(options: ApiRequestOptions): Promise<RequestInit> {
  const init = buildRequestInit(options);
  if (isUnsafeMethod(init.method)) {
    const headers = new Headers(init.headers);
    headers.set(CSRF_HEADER_NAME, await ensureCsrfToken());
    init.headers = headers;
  }
  return init;
}

function errorFromResponse(response: Response, payload: unknown): ApiClientError {
  if (isApiFailure(payload)) {
    return new ApiClientError({
      status: response.status,
      code: payload.error.code,
      message: payload.error.message,
      requestId: requestIdFrom(payload),
      field: payload.error.field,
      details: payload.error.details,
    });
  }
  return new ApiClientError({
    status: response.status,
    code: 'HTTP_ERROR',
    message: `Request failed with status ${response.status}`,
    requestId: null,
  });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const init = await prepareRequestInit(options);
  const response = await fetch(path, init);
  const payload = await readJson(response);

  if (!response.ok) {
    throw errorFromResponse(response, payload);
  }

  if (!isApiSuccess<T>(payload)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a data envelope',
      requestId: requestIdFrom(payload),
    });
  }

  return payload.data;
}

export async function apiPaginatedRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<PaginatedResponse<T>> {
  const init = await prepareRequestInit(options);
  const response = await fetch(path, init);
  const payload = await readJson(response);

  if (!response.ok) {
    throw errorFromResponse(response, payload);
  }

  if (!isPaginatedResponse<T>(payload)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: requestIdFrom(payload),
    });
  }

  return {
    data: payload.data,
    page: payload.page,
  } as PaginatedResponse<T>;
}
