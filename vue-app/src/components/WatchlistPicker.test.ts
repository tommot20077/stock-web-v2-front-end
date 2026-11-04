import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import WatchlistPicker from './WatchlistPicker.vue';
import pickerSource from './WatchlistPicker.vue?raw';
import { t, tf } from '../i18n';
import { ApiClientError } from '../services/apiClient';
import { resetRuntimeApiClientsForTests } from '../services/pageApiClients';
import type { WatchlistDto } from '../services/watchlistApi';
import { cleanupMounted, flushAsync, mountWithPinia } from '../testUtils';
import {
  apiSuccess,
  callsTo,
  watchlistDto,
  watchlistFetch,
  type WatchlistFetch,
} from '../testing/watchlistFetchDouble';

// Phase 04.2 Plan 22(D-16):觀察清單選擇器。勾選即時寫入、不樂觀更新;清單狀態由宿主持有,
// 選擇器寫入後 emit 新 DTO。API mode 一律 stub fetch,讓請求走真的 watchlistApi → apiClient。

afterEach(() => {
  cleanupMounted();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

const MY_LIST = watchlistDto('wl-1', '我的自選', []);
const AI_LIST = watchlistDto('wl-2', 'AI 概念', ['NVDA', 'AAPL']);

interface MountOptions {
  lists?: WatchlistDto[] | null;
  loading?: boolean;
  loadError?: ApiClientError | null;
  symbol?: string;
  fetchImpl?: WatchlistFetch;
}

interface Mounted {
  fetchImpl: WatchlistFetch;
  anchor: HTMLButtonElement;
  events: string[];
  changed: WatchlistDto[];
  created: WatchlistDto[];
  lists: () => WatchlistDto[] | null;
}

/** 宿主:持有清單狀態,收 changed / created 後以回應 DTO 更新(與 Markets 頁同責任分工)。 */
async function mountPicker(options: MountOptions = {}): Promise<Mounted> {
  const fetchImpl = options.fetchImpl ?? watchlistFetch(options.lists ?? []);
  document.cookie = 'XSRF-TOKEN=csrf-picker; path=/';
  vi.stubEnv('VITE_DATA_MODE', 'api');
  resetRuntimeApiClientsForTests();
  vi.stubGlobal('fetch', fetchImpl);

  const anchor = document.createElement('button');
  anchor.textContent = 'anchor';
  document.body.appendChild(anchor);
  anchor.focus();

  const events: string[] = [];
  const changed: WatchlistDto[] = [];
  const created: WatchlistDto[] = [];
  const lists = ref<WatchlistDto[] | null>(options.lists === undefined ? [] : options.lists);
  const open = ref(true);

  const Host = defineComponent({
    setup() {
      return () => h(WatchlistPicker, {
        open: open.value,
        lang: 'zh',
        symbol: options.symbol ?? 'AAPL',
        anchor,
        lists: lists.value,
        loading: options.loading ?? false,
        loadError: options.loadError ?? null,
        onClose: () => { events.push('close'); open.value = false; },
        onRetry: () => { events.push('retry'); },
        onChanged: (list: WatchlistDto) => {
          changed.push(list);
          lists.value = (lists.value ?? []).map(candidate => (candidate.id === list.id ? list : candidate));
        },
        onCreated: (list: WatchlistDto) => {
          created.push(list);
          lists.value = [...(lists.value ?? []), list];
        },
      });
    },
  });

  mountWithPinia(Host);
  await flushAsync();
  return { fetchImpl, anchor, events, changed, created, lists: () => lists.value };
}

function picker(): HTMLElement | null {
  return document.body.querySelector('[data-testid="watchlist-picker"]');
}

function option(listId: string): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(`[data-testid="watchlist-picker-option"][data-list-id="${listId}"]`);
  expect(el, `option ${listId}`).not.toBeNull();
  return el!;
}

function checkbox(listId: string): HTMLInputElement {
  const el = option(listId).querySelector<HTMLInputElement>('[data-testid="watchlist-picker-checkbox"]');
  expect(el, `checkbox ${listId}`).not.toBeNull();
  return el!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('WatchlistPicker:結構與開啟', () => {
  it('非 modal 的 dialog,Teleport 到 body,每個清單一列(原生 checkbox、名稱、檔數)', async () => {
    await mountPicker({ lists: [MY_LIST, AI_LIST] });

    const panel = picker();
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('role')).toBe('dialog');
    expect(panel!.getAttribute('aria-modal')).not.toBe('true');
    expect(panel!.parentElement).toBe(document.body);
    const titleId = panel!.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toContain(t('zh', 'watchlistPickerTitle'));

    const options = [...document.body.querySelectorAll('[data-testid="watchlist-picker-option"]')];
    expect(options.map(el => el.getAttribute('data-list-id'))).toEqual(['wl-1', 'wl-2']);
    expect(option('wl-1').textContent).toContain('我的自選');
    expect(option('wl-1').textContent).toContain(tf('zh', 'watchlistCount', { n: 0 }));
    expect(option('wl-2').textContent).toContain(tf('zh', 'watchlistCount', { n: 2 }));
    expect(checkbox('wl-1').type).toBe('checkbox');
    expect(checkbox('wl-1').checked).toBe(false);
    expect(checkbox('wl-2').checked).toBe(true);
  });

  it('開啟時焦點在第一個 checkbox', async () => {
    await mountPicker({ lists: [MY_LIST, AI_LIST] });

    expect(document.activeElement).toBe(checkbox('wl-1'));
  });
});

describe('WatchlistPicker:勾選即時寫入(不樂觀更新)', () => {
  it('勾選 → addItem(listId, symbol);儲存中 disabled + 儲存中…;回應後依 DTO 勾選與更新檔數', async () => {
    const gate = deferred<Response>();
    const fetchImpl = watchlistFetch([MY_LIST, AI_LIST], {
      addItem: listId => (listId === 'wl-1' ? gate.promise : undefined),
    });
    const mounted = await mountPicker({ lists: [MY_LIST, AI_LIST], fetchImpl });

    checkbox('wl-1').click();
    await flushAsync();

    const posts = callsTo(mounted.fetchImpl, 'POST', '/watchlists/wl-1/items');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ symbol: 'AAPL' });
    // 不樂觀:回應前仍是原狀態,且不可再點。
    expect(checkbox('wl-1').checked).toBe(false);
    expect(checkbox('wl-1').disabled).toBe(true);
    const saving = option('wl-1').querySelector('[data-testid="watchlist-picker-option-saving"]');
    expect(saving?.textContent).toContain(t('zh', 'settingSaving'));
    expect(saving?.getAttribute('role')).toBe('status');

    gate.resolve(apiSuccess(watchlistDto('wl-1', '我的自選', ['AAPL'])));
    await flushAsync();

    expect(checkbox('wl-1').checked).toBe(true);
    expect(checkbox('wl-1').disabled).toBe(false);
    expect(option('wl-1').querySelector('[data-testid="watchlist-picker-option-saving"]')).toBeNull();
    expect(option('wl-1').textContent).toContain(tf('zh', 'watchlistCount', { n: 1 }));
    expect(mounted.changed.map(list => list.id)).toEqual(['wl-1']);
  });

  it('取消勾選 → removeItem(listId, 回應 DTO 中該代號的 uuid),路徑不放 symbol', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST, AI_LIST] });
    const aaplUuid = AI_LIST.items.find(item => item.symbol === 'AAPL')!.uuid;

    checkbox('wl-2').click();
    await flushAsync();

    const deletes = callsTo(mounted.fetchImpl, 'DELETE', '/watchlists/wl-2/items/');
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toContain(`/watchlists/wl-2/items/${aaplUuid}`);
    expect(deletes[0][0]).not.toContain('AAPL');
    expect(checkbox('wl-2').checked).toBe(false);
    expect(option('wl-2').textContent).toContain(tf('zh', 'watchlistCount', { n: 1 }));
  });

  it('寫入只經 watchlist service(原始碼不自己 fetch、不 import mock store)', () => {
    expect(pickerSource).toMatch(/watchlist\.addItem/);
    expect(pickerSource).toMatch(/watchlist\.removeItem/);
    expect(pickerSource).not.toMatch(/\bfetch\(/);
    expect(pickerSource).not.toContain('stores/mockPortfolio');
  });
});

describe('WatchlistPicker:關閉與焦點', () => {
  it('Esc 關閉並把焦點還給觸發鈕', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST] });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();

    expect(mounted.events).toContain('close');
    expect(picker()).toBeNull();
    expect(document.activeElement).toBe(mounted.anchor);
  });

  it('✕ 關閉並把焦點還給觸發鈕', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST] });
    const close = document.body.querySelector<HTMLButtonElement>('[data-testid="watchlist-picker-close"]');
    expect(close?.getAttribute('aria-label')).toBe(t('zh', 'closeWatchlistPicker'));

    close!.click();
    await flushAsync();

    expect(mounted.events).toContain('close');
    expect(document.activeElement).toBe(mounted.anchor);
  });

  it('點擊面板外關閉;點擊面板內不關閉', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST] });
    const panel = picker();
    expect(panel, 'picker panel').not.toBeNull();

    panel!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushAsync();
    expect(mounted.events).not.toContain('close');

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushAsync();
    expect(mounted.events).toContain('close');
  });
});
