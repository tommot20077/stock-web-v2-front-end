import { describe, expect, it } from 'vitest';
import { keyFromDto, mergeKeyDtoIntoView } from './settingsAiAccessView';
import type { AiAccessKeyDto } from './services/apiTypes';

const baseDto: AiAccessKeyDto = {
  id: 'key_1',
  provider: 'binance',
  environment: 'live',
  permission: 'trade',
  label: 'Main account',
  maskedKey: 'DEMO-B...0001',
  lastTest: 'ok',
  lastUsedAt: '2026-05-16T01:00:00Z',
  hitl: 'confirm',
  riskLimits: {
    maxSingleUsd: 5000,
    maxDailyUsd: 25000,
    allowedSymbols: ['BTC', 'ETH'],
    expiresAt: '2026-12-31T00:00:00Z',
  },
};

describe('Settings AI Access view helpers', () => {
  it('maps adapter keys to masked-only view models', () => {
    const key = keyFromDto(baseDto);

    expect(key.key).toBe('DEMO-B...0001');
    expect(key.canReveal).toBe(false);
    expect(key.canCopy).toBe(false);
    expect(key.show).toBe(false);
    expect(key.allowed).toBe('BTC,ETH');
    expect(key.expires).toBe('2026-12-31');
  });

  it('merges adapter updates while preserving UI-only fields', () => {
    const key = keyFromDto(baseDto);
    key.show = true;
    key.testing = true;
    const updated: AiAccessKeyDto = {
      ...baseDto,
      label: 'Updated account',
      lastTest: 'fail',
      hitl: 'auto',
      riskLimits: {
        maxSingleUsd: 1000,
        maxDailyUsd: 5000,
        allowedSymbols: ['SOL'],
        expiresAt: null,
      },
    };

    mergeKeyDtoIntoView(key, updated);

    expect(key.label).toBe('Updated account');
    expect(key.lastTest).toBe('fail');
    expect(key.hitl).toBe('auto');
    expect(key.allowed).toBe('SOL');
    expect(key.expires).toBe('');
    expect(key.show).toBe(true);
    expect(key.testing).toBe(true);
  });
});
