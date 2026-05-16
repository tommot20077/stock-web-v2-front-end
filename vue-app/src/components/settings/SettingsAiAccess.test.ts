import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsAiAccess from './SettingsAiAccess.vue';
import { cleanupMounted, clickButtonWithin, mountComponent, rowByText } from '../../testUtils';
import type { AgentView, AuditCallView, McpServer } from '../../composables/useAiAccessSettings';

const endpoints: McpServer[] = [
  {
    id: 'readonly',
    tk: 'readonlyServer',
    dk: 'readonlyDesc',
    kind: 'read',
    url: 'https://mcp.resource.app/v1/readonly',
    tools: ['markets.get_quote'],
    enabled: true,
    editable: true,
  },
];

const agents: AgentView[] = [
  { id: 'agent_1', name: 'Claude Desktop', icon: '◆', scopes: ['readonly'], last: '2026-05-16 01:35', status: 'live' },
];

const calls: AuditCallView[] = [
  { id: 'call_1', t: '01:35:00', agent: 'Claude Desktop', tool: 'markets.get_quote', args: 'symbol=AAPL', ok: true, ms: 84 },
];

afterEach(() => {
  cleanupMounted();
});

describe('SettingsAiAccess', () => {
  it('renders AI access data and forwards copy/revoke actions', async () => {
    const copied: string[] = [];
    const revoked: string[] = [];

    mountComponent(SettingsAiAccess, {
      lang: 'en',
      copiedId: null,
      mcpServers: endpoints,
      agents,
      calls,
      copyText: (text: string) => copied.push(text),
      toggleMcpEndpoint: vi.fn(),
      revokeAgent: (agent: AgentView) => revoked.push(agent.id),
    });

    expect(document.body.textContent).toContain('AI access');
    expect(document.body.textContent).toContain('Readonly server');
    expect(document.body.textContent).toContain('Claude Desktop');
    expect(document.body.textContent).toContain('markets.get_quote');

    await clickButtonWithin(rowByText('.mcp', 'Readonly server'), 'Copy');
    await clickButtonWithin(rowByText('.agent', 'Claude Desktop'), 'Revoke');

    expect(copied).toEqual(['https://mcp.resource.app/v1/readonly']);
    expect(revoked).toEqual(['agent_1']);
  });
});
