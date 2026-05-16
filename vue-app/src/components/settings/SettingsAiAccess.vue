<template>
  <div>
    <div class="banner ai-banner">
      <div class="banner-icon ai-icon">✦</div>
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">{{ t(lang, 'aiAccess') }} <span class="soon-pill">{{ t(lang, 'preview') }}</span></div>
        <div style="font-size:12px;line-height:1.55;color:var(--fg-dim)">{{ t(lang, 'aiAccessIntro') }}</div>
      </div>
    </div>

    <div class="sec-h">{{ t(lang, 'mcpEndpoints') }}</div>
    <div class="mcp-list">
      <div v-for="m in mcpServers" :key="m.id" class="mcp" :class="m.kind">
        <div class="mcp-head">
          <div class="mcp-tag" :class="m.kind">{{ m.kind === 'read' ? t(lang, 'readonly') : m.kind === 'write' ? t(lang, 'risk') : 'admin' }}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">{{ t(lang, m.tk) }}</div>
            <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">{{ t(lang, m.dk) }}</div>
          </div>
          <label class="sw" :class="{ disabled: !m.editable }">
            <input type="checkbox" v-model="m.enabled" :disabled="!m.editable" @change="toggleMcpEndpoint(m)">
            <span class="sw-track"></span>
          </label>
        </div>
        <div class="mcp-url">
          <code>{{ m.url }}</code>
          <button class="micro" @click="copyText(m.url, m.id)">{{ copiedId === m.id ? '✓' : t(lang, 'copy') }}</button>
        </div>
        <div class="mcp-tools">
          <span v-for="(tool, i) in m.tools" :key="i" class="tool">{{ tool }}</span>
        </div>
      </div>
    </div>

    <div class="sec-h" style="margin-top:28px">{{ t(lang, 'connectedAgents') }}</div>
    <div class="agents">
      <div v-for="a in agents" :key="a.id" class="agent">
        <div class="agent-icon">{{ a.icon }}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">{{ a.name }}</div>
          <div style="font-size:11px;color:var(--fg-mute);margin-top:2px">
            {{ a.scopes.join(' · ') }} · {{ t(lang, 'lastUsed') }} {{ a.last }}
          </div>
        </div>
        <span class="chip" :class="a.status">{{ a.status === 'live' ? '● ' + t(lang, 'connected') : '○ ' + t(lang, 'disabled') }}</span>
        <button class="btn-ghost danger" @click="revokeAgent(a)">{{ t(lang, 'revoke') }}</button>
      </div>
    </div>

    <div class="sec-h" style="margin-top:28px">{{ t(lang, 'recentCalls') }} <span class="sec-h-sub">· {{ lang === 'zh' ? '最近 24 小時' : 'last 24h' }}</span></div>
    <div class="audit">
      <div v-for="(c, i) in calls" :key="i" class="call">
        <div class="call-time">{{ c.t }}</div>
        <div class="call-agent">{{ c.agent }}</div>
        <div class="call-tool"><code>{{ c.tool }}</code></div>
        <div class="call-args" style="color:var(--fg-mute)">{{ c.args }}</div>
        <span class="chip" :class="c.ok ? 'ok' : 'warn'">{{ c.ok ? '✓' : '✗' }} {{ c.ms }}ms</span>
      </div>
    </div>

    <div class="sec-h" style="margin-top:28px">{{ t(lang, 'cliToken') }}</div>
    <div class="cli-card">
      <div class="cli-head">
        <code>$ resource login --token rsc_••••••••••••••••</code>
        <button class="micro">{{ t(lang, 'copy') }}</button>
      </div>
      <div style="font-size:11px;color:var(--fg-mute);margin-top:8px">
        {{ lang === 'zh' ? 'CLI 與 MCP 共用 token；scope 由 token 本身決定。' : 'CLI shares the token with MCP; scope determined by the token.' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
import type { AgentView, AuditCallView, McpServer } from '../../composables/useAiAccessSettings';
import type { Lang } from '../../types';

defineProps<{
  lang: Lang;
  copiedId: string | null;
  mcpServers: McpServer[];
  agents: AgentView[];
  calls: AuditCallView[];
  copyText: (text: string, id: string) => void;
  toggleMcpEndpoint: (endpoint: McpServer) => void | Promise<void>;
  revokeAgent: (agent: AgentView) => void | Promise<void>;
}>();
</script>

<style scoped>
.banner {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 14px; background: color-mix(in oklch, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in oklch, var(--accent) 22%, transparent);
  border-radius: 10px; margin-bottom: 24px;
}
.banner-icon {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; font-style: italic;
  font-family: Georgia, serif;
}
.banner.ai-banner {
  background: color-mix(in oklch, #8B5CF6 7%, transparent);
  border-color: color-mix(in oklch, #8B5CF6 24%, transparent);
}
.banner.ai-banner .ai-icon { background: #8B5CF6; font-style: normal; font-family: inherit; font-size: 10px; }
.soon-pill {
  display: inline-block; margin-left: 6px;
  font-size: 10px; padding: 1px 7px; border-radius: 4px;
  background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6;
  text-transform: uppercase; letter-spacing: .4px; font-weight: 600;
}
.sec-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--fg-dim); margin-bottom: 12px; }
.sec-h-sub { color: var(--fg-mute); font-weight: 500; text-transform: none; letter-spacing: 0; }
.chip {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-dim);
  font-weight: 500; letter-spacing: .2px;
  white-space: nowrap;
}
.chip.ok { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.warn { background: color-mix(in oklch, var(--dn) 14%, transparent); color: var(--dn); }
.chip.live { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.chip.disabled { color: var(--fg-mute); }
.micro {
  background: transparent; border: 0; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; color: var(--fg-mute); cursor: pointer; font-family: inherit;
  text-transform: uppercase; letter-spacing: .3px;
}
.micro:hover { color: var(--accent); background: var(--surface); }
.btn-ghost {
  background: var(--surface2); border: 1px solid var(--border); padding: 6px 12px;
  border-radius: 6px; font-size: 12px; color: var(--fg); cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-ghost.danger:hover { border-color: var(--dn); color: var(--dn); }
.sw { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
.sw input { opacity: 0; width: 0; height: 0; }
.sw-track { position: absolute; inset: 0; background: var(--border); border-radius: 999px; transition: background .2s; }
.sw-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: #fff; border-radius: 50%;
  transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.sw input:checked + .sw-track { background: var(--accent); }
.sw input:checked + .sw-track::before { transform: translateX(16px); }
.sw input:disabled + .sw-track { opacity: .5; cursor: not-allowed; }
.sw.disabled { opacity: .5; }
.mcp-list { display: flex; flex-direction: column; gap: 10px; }
.mcp {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px;
}
.mcp.write { border-color: color-mix(in oklch, #8B5CF6 28%, var(--border)); }
.mcp.admin { opacity: .6; }
.mcp-head { display: flex; gap: 12px; align-items: flex-start; }
.mcp-tag {
  flex-shrink: 0; padding: 2px 8px; border-radius: 4px;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
  background: var(--surface); color: var(--fg-dim);
  margin-top: 1px;
}
.mcp-tag.read { background: color-mix(in oklch, var(--up) 15%, transparent); color: var(--up); }
.mcp-tag.write { background: color-mix(in oklch, #8B5CF6 18%, transparent); color: #8B5CF6; }
.mcp-tag.admin { background: color-mix(in oklch, var(--dn) 14%, transparent); color: var(--dn); }
.mcp-url {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  padding: 8px 10px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px;
}
.mcp-url code {
  flex: 1; font-family: var(--mono, ui-monospace, monospace); font-size: 11px;
  color: var(--fg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mcp-tools { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 10px; }
.tool {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--surface); color: var(--fg-mute);
  font-family: var(--mono, ui-monospace, monospace);
}
.agents { display: flex; flex-direction: column; gap: 8px; }
.agent {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 10px;
}
.agent-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--surface); display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.audit {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden;
}
.call {
  display: grid;
  grid-template-columns: 76px 140px 180px 1fr auto;
  gap: 12px; align-items: center;
  padding: 9px 14px; font-size: 11px;
}
.call + .call { border-top: 1px solid var(--border); }
.call-time { font-family: var(--mono, ui-monospace, monospace); color: var(--fg-mute); }
.call-agent { color: var(--fg); font-weight: 500; }
.call-tool code { font-family: var(--mono, ui-monospace, monospace); color: var(--accent); font-size: 11px; }
.call-args { font-family: var(--mono, ui-monospace, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cli-card {
  padding: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
}
.cli-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px;
}
.cli-head code {
  flex: 1; font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: var(--fg);
}
</style>
