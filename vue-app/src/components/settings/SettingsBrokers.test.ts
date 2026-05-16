import { afterEach, describe, expect, it } from 'vitest';
import SettingsBrokers from './SettingsBrokers.vue';
import { cleanupMounted, clickButton, clickButtonWithin, mountComponent, rowByText } from '../../testUtils';
import { keyFromDto } from '../../settingsAiAccessView';
import { hitlOptions, type Provider } from '../../composables/useAiAccessSettings';

const provider: Provider = {
  id: 'binance',
  name: 'Binance',
  short: 'BN',
  color: '#F59E0B',
  kind: 'crypto',
  rate: 1200,
  tradeable: true,
};

const key = keyFromDto({
  id: 'key_1',
  provider: 'binance',
  environment: 'live',
  permission: 'trade',
  label: 'Main account',
  maskedKey: 'DEMO-B...0001',
  lastTest: null,
  lastUsedAt: '2026-05-16T01:00:00Z',
  hitl: 'confirm',
  riskLimits: { maxSingleUsd: 5000, maxDailyUsd: 25000, allowedSymbols: ['BTC'], expiresAt: '2026-12-31T00:00:00Z' },
});

afterEach(() => {
  cleanupMounted();
});

describe('SettingsBrokers', () => {
  it('renders broker policy controls and forwards actions', async () => {
    const actions: string[] = [];

    mountComponent(SettingsBrokers, {
      lang: 'en',
      brokerKeys: [key],
      copiedId: null,
      hitlOptions,
      providerOf: () => provider,
      openAdd: (mode: string) => actions.push(`add:${mode}`),
      copyKey: () => {},
      testKey: () => actions.push('test'),
      revokeKey: () => actions.push('revoke'),
      updatePolicy: (_key: unknown, hitl: string) => actions.push(`hitl:${hitl}`),
    });

    const broker = rowByText('.broker', 'Binance');
    expect(broker.textContent).toContain('DEMO-B...0001');
    expect(broker.textContent).toContain('AI proposes, human confirms');

    await clickButton('Add broker');
    await clickButtonWithin(broker, 'Test connection');
    await clickButtonWithin(broker, 'Revoke');
    await clickButtonWithin(broker, 'AI fully automated');

    expect(actions).toEqual(['add:trade', 'test', 'revoke', 'hitl:auto']);
  });
});
