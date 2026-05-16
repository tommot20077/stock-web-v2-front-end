// Reactive shared store — positions + trades + alerts mutable across pages
import { reactive } from 'vue';
import { POSITIONS, TRADES, ALERTS, ALERT_EVENTS } from './data';
import type { Position, Trade, Alert, AlertEvent } from './types';

interface Store {
  positions: Position[];
  trades: Trade[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
  lastFill: { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null;
}

function clonePosition(position: Position): Position {
  return { ...position };
}

function cloneTrade(trade: Trade): Trade {
  return { ...trade };
}

function cloneAlert(alert: Alert): Alert {
  return { ...alert, channels: [...alert.channels] };
}

function cloneAlertEvent(event: AlertEvent): AlertEvent {
  return { ...event };
}

export const store: Store = reactive({
  positions: POSITIONS.map(clonePosition),
  trades: TRADES.map(cloneTrade),
  alerts: ALERTS.map(cloneAlert),
  alertEvents: ALERT_EVENTS.map(cloneAlertEvent),
  lastFill: null,
});

let alertSeq = 100;
export function nextAlertId(): string { return 'al' + (++alertSeq); }

export function addAlert(a: Omit<Alert, 'id' | 'created' | 'triggerCount' | 'status'> & { status?: Alert['status'] }) {
  const created = new Date().toISOString().slice(0, 10);
  store.alerts.unshift({
    ...a,
    channels: [...a.channels],
    id: nextAlertId(),
    created,
    triggerCount: 0,
    status: a.status ?? 'active',
  });
}

export function updateAlert(id: string, patch: Partial<Alert>) {
  const idx = store.alerts.findIndex(a => a.id === id);
  if (idx >= 0) store.alerts[idx] = { ...store.alerts[idx], ...patch };
}

export function removeAlert(id: string) {
  const idx = store.alerts.findIndex(a => a.id === id);
  if (idx >= 0) store.alerts.splice(idx, 1);
}

export function toggleAlertMute(id: string) {
  const idx = store.alerts.findIndex(x => x.id === id);
  if (idx < 0) return;
  const a = store.alerts[idx];
  store.alerts[idx] = { ...a, status: a.status === 'muted' ? 'active' : 'muted' };
}

function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function executeOrder(opts: {
  sym: string;
  name: string;
  side: 'BUY' | 'SELL';
  qty: number;
  px: number;
  fee: number;
  sector: string;
  note?: string;
}) {
  const { sym, name, side, qty, px, fee, sector, note = '' } = opts;
  // Append trade
  store.trades.unshift({ d: todayStr(), type: side, sym, qty, px, fee, note });

  // Update positions
  const idx = store.positions.findIndex(p => p.sym === sym);
  if (side === 'BUY') {
    if (idx >= 0) {
      const p = store.positions[idx];
      const newQty = p.qty + qty;
      const newAvg = (p.qty * p.avg + qty * px) / newQty;
      store.positions[idx] = { ...p, qty: newQty, avg: newAvg, price: px };
    } else {
      store.positions.unshift({ sym, name, qty, avg: px, price: px, sector });
    }
  } else {
    if (idx >= 0) {
      const p = store.positions[idx];
      const newQty = Math.max(0, p.qty - qty);
      if (newQty === 0) {
        store.positions.splice(idx, 1);
      } else {
        store.positions[idx] = { ...p, qty: newQty, price: px };
      }
    }
  }
  store.lastFill = { sym, type: side, qty, px };
}
