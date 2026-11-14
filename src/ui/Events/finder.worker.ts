// Module worker: trigger evaluation and landing-window search, off the main thread.
import type { HorizonProfile, SiteGeo } from '../../astro/types';
import type { TriggerMatch, TriggerRule, WindowSearch } from '../../state/events.types';
import { evaluateTrigger, findLandingWindows } from '../../state/triggers';

export type FinderRequest =
  | { id: number; op: 'evaluate'; rule: TriggerRule; site: SiteGeo; profile: HorizonProfile | null; from: Date; to: Date }
  | { id: number; op: 'find'; search: WindowSearch; site: SiteGeo; profile: HorizonProfile | null };

export type FinderReply = { id: number; ok: true; matches: TriggerMatch[] } | { id: number; ok: false; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<FinderRequest>) => void) | null;
  postMessage(m: FinderReply): void;
};

ctx.onmessage = (e) => {
  const r = e.data;
  try {
    const matches =
      r.op === 'evaluate'
        ? evaluateTrigger(r.rule, r.site, r.profile, r.from, r.to)
        : findLandingWindows(r.search, r.site, r.profile);
    ctx.postMessage({ id: r.id, ok: true, matches });
  } catch (err) {
    ctx.postMessage({ id: r.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
