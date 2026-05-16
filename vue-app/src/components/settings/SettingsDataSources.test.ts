import { afterEach, describe, expect, it } from 'vitest';
import SettingsDataSources from './SettingsDataSources.vue';
import { cleanupMounted, clickButton, mountComponent, rowByText } from '../../testUtils';
import { keyFromDto } from '../../settingsAiAccessView';
import type { Provider, Source } from '../../composables/useAiAccessSettings';

const sources: Source[] = [
  { id: 'news', zh: '新聞', en: 'News', descZh: '新聞來源', descEn: 'News source', icon: 'N', color: '#EF4444', enabled: true, available: true, connected: true, feed: 'livefeed' },
];

const provider: Provider = {
  id: 'finnhub',
  name: 'Finnhub',
  short: 'FH',
  color: '#059669',
  kind: 'news',
  rate: 60,
  tradeable: false,
};

const key = keyFromDto({
  id: 'key_2',
  provider: 'finnhub',
  environment: 'live',
  permission: 'read',
  label: 'News feed',
  maskedKey: 'DEMO-F...0003',
  lastTest: null,
  lastUsedAt: null,
});

afterEach(() => {
  cleanupMounted();
});

describe('SettingsDataSources', () => {
  it('renders data-source status and forwards add/test/revoke actions', async () => {
    const actions: string[] = [];

    mountComponent(SettingsDataSources, {
      lang: 'en',
      sources,
      readKeys: [key],
      copiedId: null,
      providerOf: () => provider,
      openAdd: (mode: string) => actions.push(`add:${mode}`),
      copyKey: () => {},
      testKey: () => actions.push('test'),
      revokeKey: () => actions.push('revoke'),
    });

    expect(document.body.textContent).toContain('Data sources');
    expect(document.body.textContent).toContain('Finnhub');
    expect(rowByText('.key-row', 'Finnhub').textContent).toContain('DEMO-F...0003');

    await clickButton('Add key');
    await clickButton('Test connection');
    await clickButton('Revoke');

    expect(actions).toEqual(['add:read', 'test', 'revoke']);
  });
});
