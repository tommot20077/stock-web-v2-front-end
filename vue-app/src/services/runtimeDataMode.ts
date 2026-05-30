import type { RuntimeDataMode } from './apiTypes';

export class RuntimeDataModeError extends Error {
  readonly code = 'INVALID_RUNTIME_DATA_MODE';
  readonly value: unknown;

  constructor(value: unknown) {
    super(`Invalid VITE_DATA_MODE: ${String(value)}`);
    this.name = 'RuntimeDataModeError';
    this.value = value;
  }
}

export function normalizeRuntimeDataMode(value: unknown): RuntimeDataMode {
  if (value === undefined || value === null || value === '') return 'mock';
  if (value === 'mock' || value === 'api') return value;
  throw new RuntimeDataModeError(value);
}

export function getRuntimeDataMode(): RuntimeDataMode {
  return normalizeRuntimeDataMode(import.meta.env.VITE_DATA_MODE);
}
