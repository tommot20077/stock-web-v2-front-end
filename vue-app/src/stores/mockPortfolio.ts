import { defineStore } from 'pinia';
import { CRYPTO, POSITIONS, SYMBOLS, TRADES } from '../data';
import type { Position, Trade, Watchlist } from '../types';

const DEFAULT_WATCHLISTS: Watchlist[] = [
  { id: 'core', name: '核心持倉', syms: ['AAPL', 'NVDA', '2330.TW', 'MSFT'] },
  { id: 'crypto', name: 'Crypto', syms: ['BTC', 'ETH', 'SOL'] },
  { id: 'watchAI', name: 'AI 概念', syms: ['NVDA', 'META', 'GOOGL', 'AMZN'] },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function clonePosition(position: Position): Position {
  return { ...position };
}

function cloneTrade(trade: Trade): Trade {
  return { ...trade };
}

export const useMockPortfolioStore = defineStore('mockPortfolio', {
  state: () => ({
    positions: POSITIONS.map(clonePosition) as Position[],
    trades: TRADES.map(cloneTrade) as Trade[],
    watchlists: DEFAULT_WATCHLISTS.map(l => ({ ...l, syms: [...l.syms] })) as Watchlist[],
    lastFill: null as { sym: string; type: 'BUY' | 'SELL'; qty: number; px: number } | null,
    watchlistSeq: 10,
  }),
  getters: {
    allSymbols: () => [...SYMBOLS, ...CRYPTO],
  },
  actions: {
    isWatched(sym: string): boolean {
      return this.watchlists.some(l => l.syms.includes(sym));
    },
    toggleWatch(sym: string) {
      const list = this.watchlists[0];
      if (!list) return;
      if (this.isWatched(sym)) {
        this.watchlists.forEach(l => { l.syms = l.syms.filter(s => s !== sym); });
      } else {
        list.syms.unshift(sym);
      }
    },
    addWatchlist(name = 'New list') {
      this.watchlists.push({ id: 'wl' + (++this.watchlistSeq), name, syms: [] });
    },
    removeFromWatchlist(listId: string, sym: string) {
      const list = this.watchlists.find(l => l.id === listId);
      if (list) list.syms = list.syms.filter(s => s !== sym);
    },
    moveWatchSymbol(listId: string, from: number, to: number) {
      const list = this.watchlists.find(l => l.id === listId);
      if (!list || from < 0 || to < 0 || from >= list.syms.length || to >= list.syms.length) return;
      const [item] = list.syms.splice(from, 1);
      list.syms.splice(to, 0, item);
    },
    executeOrder(opts: {
      sym: string;
      name: string;
      side: 'BUY' | 'SELL';
      qty: number;
      px: number;
      fee: number;
      sector: string;
      note?: string;
    }): boolean {
      const { sym, name, side, qty, px, fee, sector, note = '' } = opts;
      if (!Number.isFinite(qty) || !Number.isFinite(px) || !Number.isFinite(fee) || qty <= 0 || px <= 0) return false;
      const idx = this.positions.findIndex(p => p.sym === sym);
      if (side === 'BUY') {
        this.trades.unshift({ d: todayStr(), type: side, sym, qty, px, fee, note });
        if (idx >= 0) {
          const p = this.positions[idx];
          const newQty = p.qty + qty;
          const newAvg = (p.qty * p.avg + qty * px) / newQty;
          this.positions[idx] = { ...p, qty: newQty, avg: newAvg, price: px };
        } else {
          this.positions.unshift({ sym, name, qty, avg: px, price: px, sector });
        }
      } else if (idx >= 0) {
        const p = this.positions[idx];
        if (qty > p.qty) return false;
        this.trades.unshift({ d: todayStr(), type: side, sym, qty, px, fee, note });
        const newQty = p.qty - qty;
        if (newQty === 0) this.positions.splice(idx, 1);
        else this.positions[idx] = { ...p, qty: newQty, price: px };
      } else {
        return false;
      }
      this.lastFill = { sym, type: side, qty, px };
      return true;
    },
  },
});
