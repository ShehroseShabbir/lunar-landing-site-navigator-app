// Main-thread side of finder.worker.ts. One client per job type, so cancelling a long search
// (terminate + respawn) never disturbs the quick 30-day evaluations.
import type { TriggerMatch } from '../../state/events.types';
import { reviveDates } from '../../state/scenarioCache';
import type { FinderReply, FinderRequest } from './finder.worker';

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;
export type FinderJob = Distribute<FinderRequest>;

export interface FinderClient {
  /** Resolves with matches; rejects on error. Returns a cancel function. */
  run(job: FinderJob, done: (r: { ok: true; matches: TriggerMatch[] } | { ok: false; error: string }) => void): () => void;
  /** Aborts every running job by terminating the worker. */
  cancelAll(): void;
}

export function createFinderClient(): FinderClient {
  let worker: Worker | null = null;
  let broken = false;
  let nextId = 1;
  const pending = new Map<number, Parameters<FinderClient['run']>[1]>();

  function failAll(error: string) {
    for (const cb of pending.values()) cb({ ok: false, error });
    pending.clear();
  }

  function get(): Worker | null {
    if (broken) return null;
    if (worker) return worker;
    try {
      const w = new Worker(new URL('./finder.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<FinderReply>) => {
        const r = reviveDates(e.data);
        const cb = pending.get(r.id);
        pending.delete(r.id);
        if (cb) cb(r.ok ? { ok: true, matches: r.matches } : { ok: false, error: r.error });
      };
      w.onerror = () => {
        broken = true;
        worker = null;
        failAll('worker');
      };
      worker = w;
    } catch {
      broken = true;
    }
    return worker;
  }

  return {
    run(job, done) {
      const w = get();
      if (!w) {
        const h = window.setTimeout(() => done({ ok: false, error: 'worker' }), 0);
        return () => window.clearTimeout(h);
      }
      const id = nextId++;
      pending.set(id, done);
      w.postMessage({ ...job, id } as FinderRequest);
      return () => void pending.delete(id);
    },
    cancelAll() {
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
