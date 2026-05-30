import { describe, expect, it } from 'vitest';
import { RuntimeDataModeError, normalizeRuntimeDataMode } from './runtimeDataMode';

describe('runtime data mode', () => {
  it('defaults to mock only for absent or empty values', () => {
    expect(normalizeRuntimeDataMode(undefined)).toBe('mock');
    expect(normalizeRuntimeDataMode(null)).toBe('mock');
    expect(normalizeRuntimeDataMode('')).toBe('mock');
  });

  it('accepts api and mock explicitly', () => {
    expect(normalizeRuntimeDataMode('api')).toBe('api');
    expect(normalizeRuntimeDataMode('mock')).toBe('mock');
  });

  it('throws a typed error for invalid explicit values', () => {
    for (const value of ['local', 'prod', 'invalid']) {
      expect(() => normalizeRuntimeDataMode(value)).toThrow(RuntimeDataModeError);
      expect(() => normalizeRuntimeDataMode(value)).toThrow('Invalid VITE_DATA_MODE');
    }
  });
});
