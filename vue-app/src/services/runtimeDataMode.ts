import type { RuntimeDataMode } from './apiTypes';

export function normalizeRuntimeDataMode(value: unknown): RuntimeDataMode {
  return value === 'api' ? 'api' : 'mock';
}

export function getRuntimeDataMode(): RuntimeDataMode {
  return normalizeRuntimeDataMode(import.meta.env.VITE_DATA_MODE);
}
