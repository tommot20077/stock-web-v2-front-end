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
  apiFailure,
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
  fallbackFocus?: HTMLElement | null;
}

interface Mounted {
  fetchImpl: WatchlistFetch;
  anchor: HTMLButtonElement;
  events: string[];
  changed: WatchlistDto[];
  created: WatchlistDto[];
  lists: () => WatchlistDto[] | null;
  setLists: (next: WatchlistDto[]) => void;
  setSymbol: (next: string) => void;
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
  const symbol = ref(options.symbol ?? 'AAPL');

  const Host = defineComponent({
    setup() {
      return () => h(WatchlistPicker, {
        open: open.value,
        lang: 'zh',
        symbol: symbol.value,
        anchor,
        fallbackFocus: options.fallbackFocus ?? null,
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
  return {
    fetchImpl,
    anchor,
    events,
    changed,
    created,
    lists: () => lists.value,
    setLists: next => { lists.value = next; },
    setSymbol: next => { symbol.value = next; },
  };
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

function fullList(id: string, name: string, extra: string[] = []): WatchlistDto {
  const symbols = Array.from({ length: 100 - extra.length }, (_, i) => `SYM${i}`);
  return watchlistDto(id, name, [...symbols, ...extra]);
}

function byTestId<T extends HTMLElement = HTMLElement>(testId: string): T | null {
  return document.body.querySelector<T>(`[data-testid="${testId}"]`);
}

function clickTestId(testId: string) {
  const el = byTestId<HTMLButtonElement>(testId);
  expect(el, testId).not.toBeNull();
  el!.click();
}

async function setInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushAsync();
}

describe('WatchlistPicker:載入中與載入失敗', () => {
  it('loading 且尚無清單 → 載入中…(文字)+ 2 條骨架,焦點在 ✕', async () => {
    await mountPicker({ lists: null, loading: true });

    const loading = byTestId('watchlist-picker-loading');
    expect(loading, 'loading block').not.toBeNull();
    expect(loading!.textContent).toContain(t('zh', 'loading'));
    expect(loading!.querySelectorAll('.skeleton-row')).toHaveLength(2);
    expect(document.body.querySelector('[data-testid="watchlist-picker-option"]')).toBeNull();
    expect(document.activeElement).toBe(byTestId('watchlist-picker-close'));
  });

  it('loadError → loadFailed + 診斷列(code / traceId,不露後端 message)+ 重試 emit retry', async () => {
    const loadError = new ApiClientError({
      status: 503, code: 'INTERNAL_ERROR', message: 'BackendMessageMustNotReachTheDom', requestId: 'trace-load-1',
    });
    const mounted = await mountPicker({ lists: null, loadError });

    const error = byTestId('watchlist-picker-error');
    expect(error, 'error block').not.toBeNull();
    expect(error!.getAttribute('role')).toBe('alert');
    expect(error!.textContent).toContain(t('zh', 'loadFailed'));
    expect(byTestId('watchlist-picker-error-code')?.textContent).toContain('INTERNAL_ERROR');
    expect(byTestId('watchlist-picker-trace-id')?.textContent).toContain('trace-load-1');
    expect(picker()!.textContent).not.toContain('BackendMessageMustNotReachTheDom');

    expect(byTestId('watchlist-picker-retry')?.textContent).toContain(t('zh', 'authRetry'));
    clickTestId('watchlist-picker-retry');
    await flushAsync();
    expect(mounted.events).toContain('retry');
  });
});

describe('WatchlistPicker:勾選失敗回原狀態 + 該列文案', () => {
  const CASES: Array<{ name: string; response: () => Response | Promise<Response>; copy: string; reload: boolean }> = [
    {
      name: '400 fields.items(第 101 檔)→ watchlistErrItemLimit',
      response: () => apiFailure('VALIDATION_FAILED', 'trace-items', 400, { items: 'at most 100 items' }),
      copy: tf('zh', 'watchlistErrItemLimit', { symbol: 'AAPL' }),
      reload: false,
    },
    {
      name: 'WATCHLIST_NOT_FOUND → watchlistErrNotFound 並要求頁面重讀',
      response: () => apiFailure('WATCHLIST_NOT_FOUND', 'trace-nf', 404),
      copy: t('zh', 'watchlistErrNotFound'),
      reload: true,
    },
    {
      name: 'ASSET_NOT_FOUND → watchlistErrAsset',
      response: () => apiFailure('ASSET_NOT_FOUND', 'trace-asset', 404, { symbol: 'not found' }),
      copy: t('zh', 'watchlistErrAsset'),
      reload: false,
    },
    {
      name: '403 → watchlistErrForbidden',
      response: () => apiFailure('AUTH_FORBIDDEN', 'trace-403', 403),
      copy: t('zh', 'watchlistErrForbidden'),
      reload: false,
    },
    {
      name: 'CSRF → watchlistErrCsrf',
      response: () => apiFailure('AUTH_CSRF_TOKEN_INVALID', 'trace-csrf', 403),
      copy: t('zh', 'watchlistErrCsrf'),
      reload: false,
    },
    {
      name: '網路失敗 → watchlistErrNetwork',
      response: () => Promise.reject(new TypeError('Failed to fetch')),
      copy: t('zh', 'watchlistErrNetwork'),
      reload: false,
    },
    {
      name: '其他(5xx)→ watchlistErrUnknown 並要求頁面重讀',
      response: () => apiFailure('INTERNAL_ERROR', 'trace-500', 500),
      copy: t('zh', 'watchlistErrUnknown'),
      reload: true,
    },
  ];

  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const fetchImpl = watchlistFetch([MY_LIST], { addItem: () => testCase.response() });
      const mounted = await mountPicker({ lists: [MY_LIST], fetchImpl });

      checkbox('wl-1').click();
      await flushAsync();

      expect(checkbox('wl-1').checked).toBe(false);
      expect(checkbox('wl-1').disabled).toBe(false);
      const error = option('wl-1').querySelector('[data-testid="watchlist-picker-option-error"]');
      expect(error, 'option error').not.toBeNull();
      expect(error!.textContent).toContain(testCase.copy);
      expect(picker()!.textContent).not.toContain('BackendMessageMustNotReachTheDom');
      expect(mounted.changed).toHaveLength(0);
      expect(mounted.events.includes('retry')).toBe(testCase.reload);
    });
  }

  it('失敗列的診斷列顯示 code 與 traceId;再次勾選成功後錯誤消失', async () => {
    let fail = true;
    const fetchImpl = watchlistFetch([MY_LIST], {
      addItem: () => (fail ? apiFailure('INTERNAL_ERROR', 'trace-diag', 500) : undefined),
    });
    await mountPicker({ lists: [MY_LIST], fetchImpl });

    checkbox('wl-1').click();
    await flushAsync();
    const error = option('wl-1').querySelector('[data-testid="watchlist-picker-option-error"]');
    expect(error?.textContent).toContain('INTERNAL_ERROR');
    expect(error?.textContent).toContain('trace-diag');

    fail = false;
    checkbox('wl-1').click();
    await flushAsync();
    expect(option('wl-1').querySelector('[data-testid="watchlist-picker-option-error"]')).toBeNull();
    expect(checkbox('wl-1').checked).toBe(true);
  });
});

describe('WatchlistPicker:上限', () => {
  it('100 檔且未含此代號 → checkbox disabled + 已滿 100 檔;已含此代號的滿清單仍可取消', async () => {
    const full = fullList('wl-full', '滿的');
    const fullWithAapl = fullList('wl-full-aapl', '滿的含 AAPL', ['AAPL']);
    await mountPicker({ lists: [full, fullWithAapl] });

    expect(checkbox('wl-full').disabled).toBe(true);
    const fullNote = option('wl-full').querySelector('[data-testid="watchlist-picker-option-full"]');
    expect(fullNote?.textContent).toContain(t('zh', 'watchlistItemsFull'));

    expect(checkbox('wl-full-aapl').checked).toBe(true);
    expect(checkbox('wl-full-aapl').disabled).toBe(false);
    expect(option('wl-full-aapl').querySelector('[data-testid="watchlist-picker-option-full"]')).toBeNull();
  });

  it('已 20 個清單 → + 新增清單 disabled + 上限文案', async () => {
    const lists = Array.from({ length: 20 }, (_, i) => watchlistDto(`wl-${i}`, `清單 ${i}`, []));
    await mountPicker({ lists });

    const create = byTestId<HTMLButtonElement>('watchlist-picker-new');
    expect(create?.disabled).toBe(true);
    expect(byTestId('watchlist-picker-limit')?.textContent).toContain(t('zh', 'watchlistListsLimitReached'));
  });

  it('未滿 20 個清單 → + 新增清單可用、不顯示上限文案', async () => {
    await mountPicker({ lists: [MY_LIST] });

    const create = byTestId<HTMLButtonElement>('watchlist-picker-new');
    expect(create?.disabled).toBe(false);
    expect(create?.textContent).toContain(t('zh', 'watchlistNewList'));
    expect(byTestId('watchlist-picker-limit')).toBeNull();
  });
});

describe('WatchlistPicker:建立並加入(U-13)', () => {
  async function openForm() {
    clickTestId('watchlist-picker-new');
    await flushAsync();
    const input = byTestId<HTMLInputElement>('watchlist-picker-new-name');
    expect(input, 'name input').not.toBeNull();
    return input!;
  }

  it('展開行內表單:maxlength 30、焦點在名稱輸入框;取消收合', async () => {
    await mountPicker({ lists: [MY_LIST] });
    const input = await openForm();

    expect(input.maxLength).toBe(30);
    expect(document.activeElement).toBe(input);
    expect(byTestId('watchlist-picker-new-submit')?.textContent).toContain(t('zh', 'watchlistCreateAndAdd'));

    clickTestId('watchlist-picker-new-cancel');
    await flushAsync();
    expect(byTestId('watchlist-picker-new-name')).toBeNull();
  });

  it('trim 後空白或超過 30 字 → watchlistErrName,不送出', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST] });
    const input = await openForm();

    await setInput(input, '   ');
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();
    expect(byTestId('watchlist-picker-name-error')?.textContent).toContain(t('zh', 'watchlistErrName'));

    await setInput(input, 'x'.repeat(31));
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();
    expect(byTestId('watchlist-picker-name-error')?.textContent).toContain(t('zh', 'watchlistErrName'));
    expect(callsTo(mounted.fetchImpl, 'POST', '/watchlists')).toHaveLength(0);
  });

  it('與已載入清單同名(trim 後)→ watchlistErrDuplicateName,不送出', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST, AI_LIST] });
    const input = await openForm();

    await setInput(input, '  AI 概念 ');
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();

    expect(byTestId('watchlist-picker-name-error')?.textContent).toContain(t('zh', 'watchlistErrDuplicateName'));
    expect(callsTo(mounted.fetchImpl, 'POST', '/watchlists')).toHaveLength(0);
  });

  it('建立並加入 → create(name) 後 addItem(新 id, symbol);新清單出現且已勾', async () => {
    const mounted = await mountPicker({ lists: [MY_LIST] });
    const input = await openForm();

    await setInput(input, ' 半導體 ');
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();

    const creates = callsTo(mounted.fetchImpl, 'POST', '/api/v1/watchlists').filter(([url]) => url.endsWith('/watchlists'));
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0][1]?.body))).toEqual({ name: '半導體' });
    const adds = callsTo(mounted.fetchImpl, 'POST', '/watchlists/wl-created-1/items');
    expect(adds).toHaveLength(1);
    expect(JSON.parse(String(adds[0][1]?.body))).toEqual({ symbol: 'AAPL' });

    expect(mounted.created.map(list => list.id)).toEqual(['wl-created-1']);
    expect(checkbox('wl-created-1').checked).toBe(true);
    expect(option('wl-created-1').textContent).toContain('半導體');
    expect(byTestId('watchlist-picker-new-name')).toBeNull();
  });

  it('建立被後端拒絕(同名 409)→ 名稱錯誤文案,不加入項目', async () => {
    const fetchImpl = watchlistFetch([MY_LIST], {
      create: () => apiFailure('DUPLICATE_RESOURCE', 'trace-dup', 409, { name: 'already exists' }),
    });
    const mounted = await mountPicker({ lists: [MY_LIST], fetchImpl });
    const input = await openForm();

    await setInput(input, '別處建立的');
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();

    expect(byTestId('watchlist-picker-name-error')?.textContent).toContain(t('zh', 'watchlistErrDuplicateName'));
    expect(callsTo(mounted.fetchImpl, 'POST', '/items')).toHaveLength(0);
    expect(mounted.created).toHaveLength(0);
  });
});

/** jsdom 不排版:以觸發鈕的假 rect 驗證定位;脫離 DOM 的節點與瀏覽器一樣回全 0。 */
function stubAnchorRect(anchor: HTMLElement) {
  anchor.getBoundingClientRect = () => (anchor.isConnected
    ? ({ top: 200, bottom: 232, left: 300, right: 340, width: 40, height: 32, x: 300, y: 200, toJSON: () => ({}) } as DOMRect)
    : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
}

function panelPosition(): { top: string; left: string } {
  const panel = picker();
  expect(panel, 'picker panel').not.toBeNull();
  return { top: panel!.style.getPropertyValue('--wp-top'), left: panel!.style.getPropertyValue('--wp-left') };
}

describe('WatchlistPicker:觸發鈕被移出 DOM(04.2-review WR-08)', () => {
  it('觸發鈕脫離 DOM 後重新定位 → 保留上次位置,不跳到左上角 16 / 16', async () => {
    const mounted = await mountPicker({ lists: [watchlistDto('wl-1', '我的自選', ['AAPL'])] });
    stubAnchorRect(mounted.anchor);
    window.dispatchEvent(new Event('resize'));
    await flushAsync();
    expect(panelPosition()).toEqual({ top: '240px', left: '340px' });

    mounted.anchor.remove();
    mounted.setLists([watchlistDto('wl-1', '我的自選', [])]);
    await flushAsync();
    window.dispatchEvent(new Event('resize'));
    await flushAsync();

    expect(panelPosition()).toEqual({ top: '240px', left: '340px' });
  });

  it('觸發鈕脫離 DOM 後按 Esc → 焦點落在頁面提供的 fallbackFocus(不掉到 body)', async () => {
    const fallback = document.createElement('div');
    fallback.tabIndex = -1;
    document.body.appendChild(fallback);
    const mounted = await mountPicker({ lists: [MY_LIST], fallbackFocus: fallback });

    mounted.anchor.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushAsync();

    expect(mounted.events).toContain('close');
    expect(document.activeElement).toBe(fallback);
  });

  it('觸發鈕仍在 DOM 時,即使有 fallbackFocus,✕ 關閉仍把焦點還給觸發鈕', async () => {
    const fallback = document.createElement('div');
    fallback.tabIndex = -1;
    document.body.appendChild(fallback);
    const mounted = await mountPicker({ lists: [MY_LIST], fallbackFocus: fallback });

    byTestId<HTMLButtonElement>('watchlist-picker-close')!.click();
    await flushAsync();

    expect(document.activeElement).toBe(mounted.anchor);
  });
});

describe('WatchlistPicker:建立並加入期間換代號(04.2-review WR-10)', () => {
  it('create 請求進行中 props.symbol 改變 → addItem 仍收到送出當下的代號', async () => {
    const pending = deferred<Response>();
    const fetchImpl = watchlistFetch([MY_LIST], { create: () => pending.promise });
    const mounted = await mountPicker({ lists: [MY_LIST], fetchImpl });

    clickTestId('watchlist-picker-new');
    await flushAsync();
    await setInput(byTestId<HTMLInputElement>('watchlist-picker-new-name')!, '半導體');
    clickTestId('watchlist-picker-new-submit');
    await flushAsync();

    mounted.setSymbol('TSLA');
    await flushAsync();
    pending.resolve(apiSuccess(watchlistDto('wl-new', '半導體', [])));
    await flushAsync();

    const adds = callsTo(mounted.fetchImpl, 'POST', '/watchlists/wl-new/items');
    expect(adds).toHaveLength(1);
    expect(JSON.parse(String(adds[0][1]?.body))).toEqual({ symbol: 'AAPL' });
  });
});
