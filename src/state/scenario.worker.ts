// Module worker: runs the 30-day scan off the main thread. Profiles are cached by siteId so
// astro's identity-keyed scan cache is hit on later requests.
import type { HorizonProfile, ScanResult, SiteGeo } from '../astro/types';
import { compute } from './scenarioCache';

export interface WorkerRequest {
  id: number;
  /** Hook instance. Its scan is retained until it sends a release (unmount). */
  owner: number;
  release?: boolean;
  siteGeo: SiteGeo;
  siteId: string | null;
  profile?: HorizonProfile;
  rangeStart: Date;
  t: Date;
  needScan: boolean;
}

const profiles = new Map<string, HorizonProfile>();
// Per-owner pin of the last scan: kept so the owner's scan is never re-sent or lost to the shared astro LRU's bookkeeping.
const owned = new Map<number, ScanResult>();
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(m: unknown): void;
};

ctx.onmessage = (e) => {
  const r = e.data;
  if (r.release) {
    owned.delete(r.owner);
    return;
  }
  try {
    if (r.siteId && r.profile) profiles.set(r.siteId, r.profile);
    const profile = r.siteId ? (profiles.get(r.siteId) ?? null) : null;
    const out = compute(r.siteGeo, profile, r.rangeStart, r.t, r.needScan);
    if (out.scan) owned.set(r.owner, out.scan);
    ctx.postMessage({ id: r.id, ok: true, ...out });
  } catch (err) {
    ctx.postMessage({ id: r.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
