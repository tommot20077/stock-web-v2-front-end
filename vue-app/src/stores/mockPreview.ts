import { defineStore } from 'pinia';
import { OPLOG } from '../data';
import type { BacktestRun, OpLogEntry, OpsRun } from '../types';

export function deterministicKeyTest(id: string): 'ok' | 'fail' {
  const sum = id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return sum % 5 === 0 ? 'fail' : 'ok';
}

function cloneOpLogEntry(entry: OpLogEntry): OpLogEntry {
  return { ...entry };
}

export const useMockPreviewStore = defineStore('mockPreview', {
  state: () => ({
    opsLog: OPLOG.map(cloneOpLogEntry) as OpLogEntry[],
    currentOpsRun: null as OpsRun | null,
    backtestRuns: [] as BacktestRun[],
    opsSeq: 1,
    backtestSeq: 1,
  }),
  actions: {
    async runOpsAction(key: string, label: string) {
      const run: OpsRun = {
        id: 'ops' + (++this.opsSeq),
        key,
        label,
        status: 'running',
        startedAt: new Date().toISOString(),
      };
      this.currentOpsRun = run;
      await new Promise(resolve => setTimeout(resolve, 650));
      run.status = key === 'refetchBonds' ? 'failed' : 'success';
      this.opsLog.unshift({
        d: new Date().toISOString().slice(0, 16).replace('T', ' '),
        op: label,
        who: 'admin',
        ok: run.status === 'success',
        dur: run.status === 'success' ? '0.7s' : '0.8s',
      });
      if (this.currentOpsRun?.id === run.id) this.currentOpsRun = null;
      return run.status;
    },
    recordBacktestRun(run: Omit<BacktestRun, 'id' | 'createdAt'>) {
      this.backtestRuns.unshift({
        ...run,
        id: 'bt' + (++this.backtestSeq),
        createdAt: new Date().toISOString(),
      });
    },
  },
});
