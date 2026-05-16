import { describe, expect, it } from 'vitest';
import { normalizeRuntimeDataMode } from './runtimeDataMode';

describe('runtime data mode', () => {
  it('defaults to mock for empty or unknown values', () => {
    expect(normalizeRuntimeDataMode(undefined)).toBe('mock');
    expect(normalizeRuntimeDataMode('')).toBe('mock');
    expect(normalizeRuntimeDataMode('local')).toBe('mock');
  });

  it('accepts api and mock explicitly', () => {
    expect(normalizeRuntimeDataMode('api')).toBe('api');
    expect(normalizeRuntimeDataMode('mock')).toBe('mock');
  });
});
