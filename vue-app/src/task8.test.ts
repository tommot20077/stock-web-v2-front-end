import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { Component } from 'vue';
import CmdK from './components/CmdK.vue';
import KeyboardHelp from './components/KeyboardHelp.vue';
import { useShortcuts } from './useShortcuts';
import type { Page } from './types';

const mounted: Array<() => void> = [];

function mountComponent(component: Component, props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(component, props);
  app.mount(el);
  mounted.push(() => {
    app.unmount();
    el.remove();
  });
}

function cmdkRows(groupTitle: string): HTMLButtonElement[] {
  const group = [...document.body.querySelectorAll<HTMLElement>('.grp')]
    .find(el => el.querySelector('.grp-title')?.textContent === groupTitle);
  expect(group, `CmdK group "${groupTitle}"`).toBeTruthy();
  return [...group!.querySelectorAll<HTMLButtonElement>('.grp-row')];
}

function rowLabel(row: HTMLElement): string {
  return row.querySelector('.grp-label')?.textContent ?? '';
}

function rowShortcut(row: HTMLElement): string {
  return [...row.querySelectorAll('kbd')].map(kbd => kbd.textContent).join(' ');
}

async function setCmdKSearch(value: string) {
  const input = document.body.querySelector<HTMLInputElement>('.cmdk-input');
  expect(input, 'CmdK input').toBeTruthy();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function dispatchKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (mounted.length) mounted.pop()?.();
  document.body.innerHTML = '';
});

describe('Task 8 CmdK, shortcuts, and reachability', () => {
  it('CmdK lists all reachable pages with aligned shortcuts and no empty export action', async () => {
    const navigated: Page[] = [];
    let helpOpened = false;
    mountComponent(CmdK, {
      open: true,
      lang: 'en',
      onNavigate: (page: Page) => navigated.push(page),
      onOpenHelp: () => { helpOpened = true; },
      onClose: () => {},
    });
    await nextTick();

    expect(cmdkRows('Pages').map(row => [rowLabel(row), rowShortcut(row)])).toEqual([
      ['Overview', 'g o'],
      ['Markets', 'g m'],
      ['Chart', 'g c'],
      ['Positions', 'g p'],
      ['Analytics', 'g a'],
      ['Trades', 'g t'],
      ['Watchlist', 'g w'],
      ['Backtest', 'g b'],
      ['Alerts', 'g l'],
      ['Inbox', 'g n'],
      ['Settings', 'g s'],
      ['Ops', 'g x'],
    ]);

    const actions = cmdkRows('Actions');
    expect(actions.map(rowLabel)).toEqual(['New trade', 'Keyboard shortcuts', 'Recalc ROI/Sharpe']);
    expect(actions.map(rowShortcut)).toEqual(['n', '?', '']);

    actions[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    actions[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    actions[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(navigated).toEqual(['trades', 'ops']);
    await nextTick();
    expect(helpOpened).toBe(true);
    expect(document.body.textContent).not.toContain('Export CSV');
  });

  it('CmdK opens keyboard help after closing from help action and focused ? key', async () => {
    const events: string[] = [];
    mountComponent(CmdK, {
      open: true,
      lang: 'en',
      onOpenHelp: () => { events.push('help'); },
      onClose: () => { events.push('close'); },
    });
    await nextTick();

    const helpRow = cmdkRows('Actions').find(row => rowLabel(row) === 'Keyboard shortcuts');
    expect(helpRow, 'help action row').toBeTruthy();
    helpRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events).toEqual(['close']);
    await nextTick();
    expect(events).toEqual(['close', 'help']);

    events.length = 0;
    const input = document.body.querySelector<HTMLInputElement>('.cmdk-input');
    expect(input, 'CmdK input').toBeTruthy();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(events).toEqual(['close']);
    await nextTick();
    expect(events).toEqual(['close', 'help']);
  });

  it('CmdK resets active row to the first visible command when reopened after search clears', async () => {
    const navigated: Page[] = [];
    const open = ref(true);
    const Host = defineComponent({
      setup() {
        return () => h(CmdK, {
          open: open.value,
          lang: 'en',
          onNavigate: (page: Page) => navigated.push(page),
          onClose: () => { open.value = false; },
          onOpenHelp: () => {},
        });
      },
    });

    mountComponent(Host, {});
    await nextTick();

    await setCmdKSearch('settings');
    open.value = false;
    await nextTick();
    open.value = true;
    await nextTick();

    const input = document.body.querySelector<HTMLInputElement>('.cmdk-input');
    expect(input, 'CmdK input after reopen').toBeTruthy();
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(navigated).toEqual(['overview']);
  });

  it('CmdK search finds the Task 8 reachable pages including notification alias', async () => {
    mountComponent(CmdK, { open: true, lang: 'en', onClose: () => {} });
    await nextTick();

    for (const query of ['Alerts', 'Backtest', 'Ops', 'Settings', 'Notifications']) {
      await setCmdKSearch(query);
      expect(cmdkRows('Pages').length, `page result for "${query}"`).toBeGreaterThan(0);
    }
  });

  it('g-prefix shortcuts and bracket navigation reach alerts, backtest, notifications, settings, and ops', async () => {
    const navigated: Page[] = [];
    let current: Page = 'overview';
    const Host = defineComponent({
      setup() {
        useShortcuts({
          navigate: (page) => {
            navigated.push(page);
            current = page;
          },
          openCmdk: () => {},
          openTicket: () => {},
          openHelp: () => {},
          closeAll: () => {},
          currentPage: () => current,
        });
        return () => h('div');
      },
    });

    mountComponent(Host, {});
    await nextTick();

    for (const key of ['c', 'b', 'l', 'n', 's', 'x']) {
      dispatchKey('g');
      dispatchKey(key);
    }

    expect(navigated).toEqual(['chart', 'backtest', 'alerts', 'notifications', 'settings', 'ops']);

    navigated.length = 0;
    current = 'markets';
    dispatchKey(']');
    dispatchKey(']');
    expect(navigated).toEqual(['chart', 'positions']);

    navigated.length = 0;
    current = 'positions';
    dispatchKey('[');
    expect(navigated).toEqual(['chart']);

    navigated.length = 0;
    current = 'backtest';
    dispatchKey(']');
    dispatchKey(']');
    dispatchKey(']');
    dispatchKey(']');
    expect(navigated).toEqual(['alerts', 'notifications', 'settings', 'ops']);

    navigated.length = 0;
    current = 'alerts';
    dispatchKey('[');
    expect(navigated).toEqual(['backtest']);
  });

  it('KeyboardHelp documents the Task 8 navigation rows', async () => {
    mountComponent(KeyboardHelp, { open: true, lang: 'en', onClose: () => {} });
    await nextTick();

    const rows = [...document.body.querySelectorAll<HTMLElement>('.kh-row')].map(row => ({
      keys: [...row.querySelectorAll('kbd')].map(kbd => kbd.textContent).join(' '),
      desc: row.querySelector('.kh-desc')?.textContent,
    }));

    expect(rows).toContainEqual({ keys: 'g l', desc: 'Alerts' });
    expect(rows).toContainEqual({ keys: 'g b', desc: 'Backtest' });
    expect(rows).toContainEqual({ keys: 'g x', desc: 'Ops' });
    expect(rows).toContainEqual({ keys: '/', desc: 'Search' });
    expect([...document.body.querySelectorAll('kbd')].map(kbd => kbd.textContent)).not.toContain('');
  });
});
