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

export async function flushAsync(times = 6) {
  for (let i = 0; i < times; i += 1) {
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
