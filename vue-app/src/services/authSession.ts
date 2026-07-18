import { shallowRef, type ShallowRef } from 'vue';
import { ApiClientError, configureApiClientSessionHandlers, type ApiClientSessionError } from './apiClient';
import { getRuntimeApiClients } from './pageApiClients';
import type { AuthApi, AuthUser, BrowserSessionMetadata, LoginRequest, RegisterRequest } from './authApi';
import type { RuntimeDataMode } from './apiTypes';

export interface SessionMessage {
  code: string;
  message: string;
  status: number | null;
  requestId: string | null;
  /** 欄位級驗證錯誤(契約 error.fields);無則省略 */
  fields?: Record<string, string> | null;
}

interface SessionBase {
  user: AuthUser | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  message: SessionMessage | null;
}

export type SessionState =
  | (SessionBase & { status: 'checking'; user: null; message: null })
  | (SessionBase & { status: 'authenticated'; user: AuthUser; message: null })
  | (SessionBase & { status: 'anonymous'; user: null })
  | (SessionBase & { status: 'refreshing'; message: null })
  | (SessionBase & { status: 'error'; user: null; message: SessionMessage });

export interface AuthSession {
  state: ShallowRef<SessionState>;
  restore(): Promise<void>;
  login(request: LoginRequest): Promise<void>;
  register(request: RegisterRequest): Promise<void>;
  logout(): Promise<void>;
}

interface CreateAuthSessionOptions {
  api?: AuthApi;
  mode?: RuntimeDataMode;
  emitSessionMessage?: (message: SessionMessage) => void;
}

function anonymousState(message: SessionMessage | null = null): SessionState {
  return {
    status: 'anonymous',
    user: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    message,
  };
}

function checkingState(): SessionState {
  return {
    status: 'checking',
    user: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    message: null,
  };
}

function authenticatedState(session: BrowserSessionMetadata): SessionState {
  return {
    status: 'authenticated',
    user: { ...session.user },
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    message: null,
  };
}

function restoredState(user: AuthUser): SessionState {
  return {
    status: 'authenticated',
    user: { ...user },
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    message: null,
  };
}

function messageFrom(error: unknown): SessionMessage {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      requestId: error.requestId,
      fields: error.fields,
    };
  }

  const fallbackMessage = error instanceof Error ? error.message : 'Unknown session error';
  return {
    code: 'UNKNOWN_SESSION_ERROR',
    message: fallbackMessage,
    status: null,
    requestId: null,
  };
}

function messageFromSessionError(error: ApiClientSessionError): SessionMessage {
  return {
    code: error.code,
    message: error.message,
    status: error.status,
    requestId: error.requestId,
  };
}

function isAnonymousError(message: SessionMessage): boolean {
  return message.status === 401
    || message.code === 'AUTH_INVALID_CREDENTIALS'
    || message.code === 'AUTH_TOKEN_EXPIRED'
    || message.code === 'AUTH_REFRESH_TOKEN_INVALID';
}

export function createAuthSession(options: CreateAuthSessionOptions = {}): AuthSession {
  const runtimeClients = options.api ? null : getRuntimeApiClients();
  const auth = options.api ?? runtimeClients!.auth;
  const mode = options.mode ?? options.api?.mode ?? runtimeClients!.mode;
  const state = shallowRef<SessionState>(mode === 'api' ? checkingState() : anonymousState());

  function setMessageState(message: SessionMessage) {
    options.emitSessionMessage?.(message);
    state.value = isAnonymousError(message)
      ? anonymousState(message)
      : {
        status: 'error',
        user: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        message,
      };
  }

  function markRefreshing() {
    state.value = {
      status: 'refreshing',
      user: state.value.user ? { ...state.value.user } : null,
      accessTokenExpiresAt: state.value.accessTokenExpiresAt,
      refreshTokenExpiresAt: state.value.refreshTokenExpiresAt,
      message: null,
    };
  }

  configureApiClientSessionHandlers({
    onRefreshing: markRefreshing,
    onRefreshFailed: error => setMessageState(messageFromSessionError(error)),
  });

  async function restore() {
    if (mode !== 'api') {
      state.value = anonymousState();
      return;
    }

    state.value = checkingState();
    try {
      const user = await auth.me();
      state.value = user ? restoredState(user) : anonymousState();
    } catch (error) {
      setMessageState(messageFrom(error));
    }
  }

  async function login(request: LoginRequest) {
    try {
      state.value = authenticatedState(await auth.login(request));
    } catch (error) {
      // 登入失敗(帳密錯誤/鎖定/驗證失敗)仍是未登入態,錯誤細節交由 UI 顯示
      state.value = anonymousState(messageFrom(error));
    }
  }

  async function register(request: RegisterRequest) {
    try {
      state.value = authenticatedState(await auth.register(request));
    } catch (error) {
      state.value = anonymousState(messageFrom(error));
    }
  }

  async function logout() {
    await auth.logout();
    state.value = anonymousState();
  }

  return {
    state,
    restore,
    login,
    register,
    logout,
  };
}
