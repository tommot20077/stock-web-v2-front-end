import type { ApiFailure, ApiSuccess, PaginatedResponse } from './apiTypes';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  /** 欄位級驗證錯誤(契約 error.fields,見 ai-docs/browser-auth-contract.md) */
  readonly fields: Record<string, string> | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    field?: string;
    details?: Record<string, unknown>;
    fields?: Record<string, string> | null;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.field = input.field;
    this.details = input.details;
    this.fields = input.fields ?? null;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

export interface CsrfTokenNames {
  cookieName: 'XSRF-TOKEN';
  headerName: 'X-XSRF-TOKEN';
}

export interface ApiClientSessionError {
  status: number;
  code: string;
  message: string;
  requestId: string | null;
}

export interface ApiClientSessionHandlers {
  onRefreshing?: () => void;
  onRefreshFailed?: (error: ApiClientSessionError) => void;
}

const DEFAULT_API_BASE_PATH = '/api/v1';
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const REFRESH_PATH = endpoint(DEFAULT_API_BASE_PATH, 'auth/refresh');
// 這些端點的 401 是語意結果(帳密錯誤),不代表 session 過期,不觸發 refresh 重試
const SESSION_ENTRY_PATHS = ['auth/login', 'auth/register', 'auth/token']
  .map(path => endpoint(DEFAULT_API_BASE_PATH, path));
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let refreshPromise: Promise<void> | null = null;
let sessionHandlers: ApiClientSessionHandlers = {};

export function configureApiClientSessionHandlers(handlers: ApiClientSessionHandlers): void {
  sessionHandlers = handlers;
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

// 這兩個 type guard 刻意「結構寬容」:只看 data / error 是否存在,不要求 success === true/false。
// 這是刻意的設計,不是漏寫——client 對輸入應寬容(be liberal in what you accept),
// 而 data / error 的存在本身已足以判別分支;多要求 success 只增加破裂風險而沒有任何收益。
// 請勿以「對齊後端契約」為由把 success 檢查加回來。
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

function isPageResponse<T>(value: unknown): value is PaginatedResponse<T> {
  return isRecord(value)
    && Array.isArray(value.items)
    && typeof value.page === 'number'
    && typeof value.size === 'number'
    && typeof value.totalElements === 'number'
    && typeof value.totalPages === 'number';
}

function isCsrfTokenNames(value: unknown): value is CsrfTokenNames {
  return isRecord(value)
    && value.cookieName === CSRF_COOKIE_NAME
    && value.headerName === CSRF_HEADER_NAME;
}

/** 後端 ApiResponse 只在 meta.traceId 帶追蹤 id;沒有其他來源。 */
function requestIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const meta = isRecord(value.meta) ? value.meta : null;
  return typeof meta?.traceId === 'string' ? meta.traceId : null;
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

function isRefreshPath(path: string): boolean {
  return path === REFRESH_PATH || path.endsWith(REFRESH_PATH);
}

function isSessionEntryPath(path: string): boolean {
  return SESSION_ENTRY_PATHS.some(entry => path === entry || path.endsWith(entry));
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

function fieldsFrom(error: unknown): Record<string, string> | null {
  if (!isRecord(error) || !isRecord(error.fields)) return null;
  const entries = Object.entries(error.fields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length ? Object.fromEntries(entries) : null;
}

function errorFromResponse(response: Response, payload: unknown): ApiClientError {
  if (isApiFailure(payload)) {
    return new ApiClientError({
      status: response.status,
      code: payload.error.code,
      message: payload.error.message,
      requestId: requestIdFrom(payload),
      fields: fieldsFrom(payload.error),
    });
  }
  return new ApiClientError({
    status: response.status,
    code: 'HTTP_ERROR',
    message: `Request failed with status ${response.status}`,
    requestId: null,
  });
}

function safeSessionError(error: unknown): ApiClientSessionError {
  if (error instanceof ApiClientError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    };
  }
  return {
    status: 0,
    code: 'UNKNOWN_SESSION_ERROR',
    message: error instanceof Error ? error.message : 'Unknown session error',
    requestId: null,
  };
}

async function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    sessionHandlers.onRefreshing?.();
    refreshPromise = (async () => {
      const init = await prepareRequestInit({ method: 'POST' });
      const response = await fetch(REFRESH_PATH, init);
      const payload = await readJson(response);

      if (!response.ok) {
        throw errorFromResponse(response, payload);
      }

      if (!isApiSuccess<unknown>(payload)) {
        throw new ApiClientError({
          status: response.status,
          code: 'INVALID_API_RESPONSE',
          message: 'Response did not include a data envelope',
          requestId: requestIdFrom(payload),
        });
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function fetchWithSessionRecovery(
  path: string,
  options: ApiRequestOptions,
  retried = false,
): Promise<{ response: Response; payload: unknown }> {
  const init = await prepareRequestInit(options);
  const response = await fetch(path, init);
  const payload = await readJson(response);

  if (response.status !== 401 || retried || isRefreshPath(path) || isSessionEntryPath(path)) {
    return { response, payload };
  }

  try {
    await refreshSession();
  } catch (error) {
    sessionHandlers.onRefreshFailed?.(safeSessionError(error));
    throw error;
  }

  const replayInit = await prepareRequestInit(options);
  const replayResponse = await fetch(path, replayInit);
  const replayPayload = await readJson(replayResponse);
  if (replayResponse.status === 401) {
    sessionHandlers.onRefreshFailed?.(safeSessionError(errorFromResponse(replayResponse, replayPayload)));
  }
  return { response: replayResponse, payload: replayPayload };
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { response, payload } = await fetchWithSessionRecovery(path, options);

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

/**
 * 分頁端點 helper:消費後端 ApiResponse<PageResponse<T>>
 * (= { success, data: { items, page, size, totalElements, totalPages }, error, meta.traceId }),
 * 拆掉信封後回傳 PageResponse 本體。
 */
export async function apiPaginatedRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<PaginatedResponse<T>> {
  const { response, payload } = await fetchWithSessionRecovery(path, options);

  if (!response.ok) {
    throw errorFromResponse(response, payload);
  }

  if (!isApiSuccess<unknown>(payload) || !isPageResponse<T>(payload.data)) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      message: 'Response did not include a paginated envelope',
      requestId: requestIdFrom(payload),
    });
  }

  return payload.data;
}
