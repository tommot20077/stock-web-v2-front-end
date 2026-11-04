import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveQuoteStatus from './LiveQuoteStatus.vue';
import { t, tf } from '../i18n';
import type { QuoteStreamStatus } from '../services/quoteStream';
import { cleanupMounted, flushAsync, mountComponent } from '../testUtils';

// Phase 04.2 Plan 24(WATCH-04;D-23 / D-24;UI-SPEC §9、U-19、U-26):即時報價狀態列。
// 非 live 狀態不得出現實心圓點或「即時報價」(liveQuoteLive)——不假裝即時。

/** 本機時間 2026-11-04 15:00;「更新於」以本機時間格式化(今天 HH:mm,其他日 MM-DD HH:mm)。 */
const NOW = new Date(2026, 10, 4, 15, 0, 0);
const TODAY_1405 = new Date(2026, 10, 4, 14, 5, 0).getTime();
const YESTERDAY_1405 = new Date(2026, 10, 3, 14, 5, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanupMounted();
});

async function mountStatus(status: QuoteStreamStatus, updatedAt: number | null = TODAY_1405, onReconnect = vi.fn()) {
  mountComponent(LiveQuoteStatus, { lang: 'zh', status, updatedAt, onReconnect });
  await flushAsync(1);
  return onReconnect;
}

function root(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid="live-quote-status"]');
}

function requireRoot(): HTMLElement {
  const el = root();
  expect(el, 'live-quote-status').not.toBeNull();
  return el!;
}

function dot(): HTMLElement | null {
  return requireRoot().querySelector<HTMLElement>('.live-dot');
}

function reconnectButton(): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>('[data-testid="live-quote-reconnect"]');
}

describe('LiveQuoteStatus — 六態(UI-SPEC §9)', () => {
  it('idle → 不渲染', async () => {
    await mountStatus('idle');
    expect(root()).toBeNull();
  });

  it('根節點:data-live-status、role=status、aria-live=polite', async () => {
    await mountStatus('connecting');
    const el = requireRoot();
    expect(el.getAttribute('data-live-status')).toBe('connecting');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('connecting → 空心圓點(aria-hidden)+ liveQuoteConnecting,無重新連線鈕', async () => {
    await mountStatus('connecting');
    expect(requireRoot().textContent?.trim()).toBe(t('zh', 'liveQuoteConnecting'));
    const el = dot();
    expect(el, 'connecting 圓點').not.toBeNull();
    expect(el!.classList.contains('hollow')).toBe(true);
    expect(el!.classList.contains('solid')).toBe(false);
    expect(el!.getAttribute('aria-hidden')).toBe('true');
    expect(reconnectButton()).toBeNull();
  });

  it('live → 實心圓點 + liveQuoteLive(Label 600)', async () => {
    await mountStatus('live');
    expect(requireRoot().getAttribute('data-live-status')).toBe('live');
    expect(requireRoot().textContent?.trim()).toBe(t('zh', 'liveQuoteLive'));
    expect(dot()?.classList.contains('solid')).toBe(true);
    expect(requireRoot().querySelector('.live-label')?.textContent?.trim()).toBe(t('zh', 'liveQuoteLive'));
  });

  it('degraded → 無圓點,liveQuoteDegraded 的 {time} = 今天 HH:mm(live-quote-time)', async () => {
    await mountStatus('degraded', TODAY_1405);
    expect(requireRoot().getAttribute('data-live-status')).toBe('degraded');
    expect(dot()).toBeNull();
    expect(requireRoot().textContent?.trim()).toBe(tf('zh', 'liveQuoteDegraded', { time: '14:05' }));
    expect(document.body.querySelector('[data-testid="live-quote-time"]')?.textContent).toBe('14:05');
  });

  it('degraded:更新時間不是今天 → MM-DD HH:mm(U-19)', async () => {
    await mountStatus('degraded', YESTERDAY_1405);
    expect(document.body.querySelector('[data-testid="live-quote-time"]')?.textContent).toBe('11-03 14:05');
  });

  it('degraded:從未收到資料(updatedAt null)→ 時間顯示 —,不渲染 NaN', async () => {
    await mountStatus('degraded', null);
    expect(document.body.querySelector('[data-testid="live-quote-time"]')?.textContent).toBe('—');
    expect(requireRoot().textContent).not.toContain('NaN');
  });

  it('replaced → liveQuoteReplaced + liveQuoteReplacedHint + 重新連線鈕;點擊 emit reconnect 一次', async () => {
    const onReconnect = await mountStatus('replaced');
    const text = requireRoot().textContent ?? '';
    expect(text).toContain(t('zh', 'liveQuoteReplaced'));
    expect(text).toContain(t('zh', 'liveQuoteReplacedHint'));
    expect(dot()).toBeNull();

    const button = reconnectButton();
    expect(button, 'live-quote-reconnect').not.toBeNull();
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.textContent?.trim()).toBe(t('zh', 'liveQuoteReconnectHere'));
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('closed → liveQuoteClosed(含更新時間),無圓點、無重新連線鈕(SessionBanner 負責)', async () => {
    await mountStatus('closed', TODAY_1405);
    expect(requireRoot().textContent?.trim()).toBe(tf('zh', 'liveQuoteClosed', { time: '14:05' }));
    expect(dot()).toBeNull();
    expect(reconnectButton()).toBeNull();
  });

  it('U-26:非 live 狀態不出現實心圓點,也不出現 liveQuoteLive 字樣作為狀態', async () => {
    for (const status of ['connecting', 'degraded', 'replaced', 'closed'] as const) {
      cleanupMounted();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      await mountStatus(status);
      expect(document.body.querySelector('.live-dot.solid'), status).toBeNull();
      expect(requireRoot().querySelector('.live-label'), status).toBeNull();
    }
  });
});
