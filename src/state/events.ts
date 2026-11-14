// Site events (S16): every real start / end of the DR-HACK-10 states, read straight off a scan.
// Pure TS, no React or DOM, worker-safe. No new maths: the crossings are scanWindows' own
// refined window edges (bisection to 1 min). Edges that only mark the scanned range are dropped.

import type { ScanResult, VisWindow } from '../astro/types';
import type { EventKind, SiteEvent } from './events.types';

type ScanKey = keyof ScanResult;

/** Window list -> [start kind, end kind]. */
const KINDS: Record<ScanKey, readonly [EventKind, EventKind]> = {
  sunUp: ['sunrise', 'sunset'],
  powerOk: ['powerStart', 'powerEnd'],
  earthVisible: ['earthrise', 'earthset'],
  commsOk: ['commsStart', 'commsEnd'],
  both: ['bothStart', 'bothEnd'],
};

/**
 * Tie order for events at the same instant (e.g. bothEnd and powerEnd share a refined time):
 * starts in cause-then-effect order, ends in effect-then-cause order.
 */
const KIND_ORDER: readonly EventKind[] = [
  'sunrise',
  'powerStart',
  'earthrise',
  'commsStart',
  'bothStart',
  'bothEnd',
  'commsEnd',
  'earthset',
  'powerEnd',
  'sunset',
];
const rank = (k: EventKind): number => KIND_ORDER.indexOf(k);

const FAR_FUTURE_MS = 8.64e15; // largest valid Date

function pushEdges(out: SiteEvent[], windows: readonly VisWindow[], key: ScanKey, fromMs: number, toMs: number): void {
  const [startKind, endKind] = KINDS[key];
  for (const w of windows) {
    const s = w.start.getTime();
    const e = w.end.getTime();
    if (!w.clippedStart && s >= fromMs && s <= toMs) out.push({ t: new Date(s), kind: startKind });
    if (!w.clippedEnd && e >= fromMs && e <= toMs) out.push({ t: new Date(e), kind: endKind });
  }
}

/**
 * Every real start / end of sunUp, powerOk, earthVisible, commsOk and both inside [from, to]
 * (inclusive), sorted by time. Window edges that are only range clips are not events.
 */
export function listEvents(scan: ScanResult, from: Date, to: Date): SiteEvent[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const out: SiteEvent[] = [];
  if (!(toMs >= fromMs)) return out;
  for (const key of Object.keys(KINDS) as ScanKey[]) pushEdges(out, scan[key], key, fromMs, toMs);
  out.sort((a, b) => a.t.getTime() - b.t.getTime() || rank(a.kind) - rank(b.kind));
  return out;
}

/** The first `n` events strictly after `t` (an event exactly at `t` counts as passed). */
export function nextEvents(scan: ScanResult, t: Date, n: number): SiteEvent[] {
  if (!(n > 0)) return [];
  return listEvents(scan, t, new Date(FAR_FUTURE_MS))
    .filter((e) => e.t.getTime() > t.getTime())
    .slice(0, Math.floor(n));
}
