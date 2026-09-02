import { expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resetRuntimeApiClientsForTests } from './services/pageApiClients';

const mounted: Array<() => void> = [];

export function mountWithPinia(component: Component, props: Record<string, unknown> = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp(component, props);
  app.use(pinia);
  app.mount(el);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    app.unmount();
    el.remove();
  };
  mounted.push(cleanup);
  return cleanup;
}

export function mountComponent(component: Component, props: Record<string, unknown> = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(component, props);
  app.mount(el);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    app.unmount();
    el.remove();
  };
  mounted.push(cleanup);
  return cleanup;
}

export function unmountAll() {
  while (mounted.length) mounted.pop()?.();
}

export function cleanupMounted() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  unmountAll();
  document.body.innerHTML = '';
  resetRuntimeApiClientsForTests();
}

/**
 * 把「fetch mock → apiClient 解析信封 → 元件重新渲染」這串非同步鏈跑完。
 *
 * 真計時器下每輪先做一次 macrotask hop(`setImmediate`):它會把佇列裡**所有**已排入的 microtask
 * 清空,不受鏈長影響。固定輪數的 microtask 清法在 Node 20 會漏——`Response.json()` 在 Node 20 的
 * undici 需要比 Node 24 更多個 tick,本機(Node 24)綠、CI(Node 20)紅,04-12 三頁的 refetch 測試
 * 就是這樣在 CI 掛掉的。假計時器下 `setTimeout` 不會自己觸發,退回純 microtask 輪次。
 */
/**
 * 一次 macrotask hop。優先用 Node 的 `setImmediate`(vitest 的 jsdom 環境有它):
 * `setTimeout(0)` 在 jsdom 對巢狀計時器套 4ms 最小延遲,一個迴圈 11 種 code 的測試
 * 累積上千次 hop 會撞到 5s 逾時。`setImmediate` 不在 DOM lib 型別裡,故經 globalThis 取用,
 * 沒有時退回 `setTimeout(0)`。
 */
function macrotaskHop(): Promise<void> {
  return new Promise<void>(resolve => {
    const g = globalThis as unknown as { setImmediate?: (callback: () => void) => unknown };
    if (typeof g.setImmediate === 'function') {
      g.setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function flushAsync(times = 6) {
  for (let i = 0; i < times; i += 1) {
    if (!vi.isFakeTimers()) {
      await macrotaskHop();
    }
    await Promise.resolve();
    await nextTick();
  }
}

export function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}"`).toBeTruthy();
  return button!;
}

export async function clickButton(text: string) {
  buttonByText(text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

export function buttonsByText(text: string): HTMLButtonElement[] {
  const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .filter(btn => btn.textContent?.includes(text));
  expect(buttons.length, `buttons containing "${text}"`).toBeGreaterThan(0);
  return buttons;
}

export async function clickLastButton(text: string) {
  const buttons = buttonsByText(text);
  buttons[buttons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

export function rowByText(selector: string, text: string): HTMLElement {
  const row = [...document.body.querySelectorAll<HTMLElement>(selector)]
    .find(el => el.textContent?.includes(text));
  expect(row, `${selector} containing "${text}"`).toBeTruthy();
  return row!;
}

export function buttonWithin(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(btn => btn.textContent?.includes(text));
  expect(button, `button containing "${text}" inside container`).toBeTruthy();
  return button!;
}

export async function clickButtonWithin(container: HTMLElement, text: string) {
  buttonWithin(container, text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}
