// Site metrics at a playhead t over the 30-day range starting at rangeStart (plan.md section 3).
// The scan is memoised per (site, profile, range), so moving t never rescans (DR-HACK-9).

import { altAzFrom, ephemSnapshot, siteFrame } from './ephem';
import { horizonElevAt, visibleFraction } from './horizon';
import type { HorizonProfile, ScanResult, SiteGeo, SiteMetrics, VisState, VisWindow } from './types';
import { DEFAULT_STEP_MIN, REFINE_MS, nextCrossing, scanWindows, stateIsOn, stateMargin } from './windows';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const CACHE_SIZE = 8;

interface CacheEntry {
  key: string;
  profile: HorizonProfile | null;
  scan: ScanResult;
  /** Crossings searched from the range end, keyed by `${state}|${kind}`; they don't depend on t. */
  afterRange: Map<string, Date | null>;
}
const cache: CacheEntry[] = [];

function cachedEntry(site: SiteGeo, profile: HorizonProfile | null, start: Date, end: Date): CacheEntry {
  const key = `${site.latDeg}|${site.lonDeg}|${site.heightM ?? 0}|${start.getTime()}|${end.getTime()}`;
  const idx = cache.findIndex((c) => c.key === key && c.profile === profile);
  if (idx >= 0) {
    const [hit] = cache.splice(idx, 1);
    cache.push(hit);
    return hit;
  }
  const entry: CacheEntry = {
    key,
    profile,
    scan: scanWindows(site, profile, start, end, DEFAULT_STEP_MIN),
    afterRange: new Map(),
  };
  cache.push(entry);
  if (cache.length > CACHE_SIZE) cache.shift();
  return entry;
}

/** scanWindows at the default step, memoised (small LRU). Callers must not mutate the result. */
export function cachedScan(site: SiteGeo, profile: HorizonProfile | null, start: Date, end: Date): ScanResult {
  return cachedEntry(site, profile, start, end).scan;
}

const totalMs = (ws: VisWindow[]): number =>
  ws.reduce((acc, w) => acc + (w.end.getTime() - w.start.getTime()), 0);

export function siteMetrics(
  site: SiteGeo,
  profile: HorizonProfile | null,
  t: Date,
  rangeStart: Date,
  rangeDays: number = 30,
): SiteMetrics {
  if (!(rangeDays > 0)) throw new RangeError('rangeDays must be > 0');
  const r0 = rangeStart.getTime();
  const r1 = r0 + rangeDays * MS_PER_DAY;
  const rangeEnd = new Date(r1);
  const tMs = t.getTime();
  const entry = cachedEntry(site, profile, rangeStart, rangeEnd);
  const scan = entry.scan;
  const inRange = tMs >= r0 && tMs <= r1;

  const frame = siteFrame(site);
  const snap = ephemSnapshot(t, true);
  const sun = altAzFrom('Sun', frame, snap);
  const earth = altAzFrom('Earth', frame, snap);
  const sunHorizon = horizonElevAt(profile, sun.azDeg);
  const earthHorizon = horizonElevAt(profile, earth.azDeg);
  const onAt: Record<VisState, boolean> = {
    sunUp: stateIsOn('sunUp', stateMargin('sunUp', sun, profile)),
    powerOk: stateIsOn('powerOk', stateMargin('powerOk', sun, profile)),
    earthVisible: stateIsOn('earthVisible', stateMargin('earthVisible', earth, profile)),
    commsOk: stateIsOn('commsOk', stateMargin('commsOk', earth, profile)),
  };
  const powerOk = onAt.powerOk;
  const earthVisible = onAt.earthVisible;
  const commsOk = onAt.commsOk;

  // Next set/rise of a state after t: from the range's windows when the event is inside the
  // range, otherwise searched past the range end (or from t when t is outside the range).
  // The state at t is exact but window edges sit up to REFINE_MS/2 from the true crossing, so
  // windows are matched to t with a REFINE_MS tolerance and the result is clamped to >= t.
  const nextEvent = (state: VisState, kind: 'rise' | 'set'): Date | null => {
    if (!inRange) return nextCrossing(state, kind, site, profile, t);
    const ws = scan[state];
    const on = onAt[state];
    const clamp = (d: Date): Date => (d.getTime() < tMs ? new Date(tMs) : d);
    if (kind === 'set') {
      // On at t: the current window may already "end" just before t. Off at t: skip a window
      // whose refined end lies just after t (it has really ended).
      const after = on ? tMs - REFINE_MS : tMs + REFINE_MS;
      const w = ws.find((x) => x.end.getTime() > after);
      if (w && !w.clippedEnd) return clamp(w.end);
    } else {
      // Off at t: the next window may "start" just before t. On at t: skip the window that
      // has just started.
      const after = on ? tMs + REFINE_MS : tMs - REFINE_MS;
      const w = ws.find((x) => x.start.getTime() > after && !x.clippedStart);
      if (w) return clamp(w.start);
    }
    const k = `${state}|${kind}`;
    if (!entry.afterRange.has(k)) {
      entry.afterRange.set(k, nextCrossing(state, kind, site, profile, rangeEnd));
    }
    return entry.afterRange.get(k) ?? null;
  };

  const rangeMs = r1 - r0;
  const pct = (ws: VisWindow[]): number => (100 * totalMs(ws)) / rangeMs;

  // Longest stretch with the Sun's visible fraction 0 (gaps between sunUp windows).
  let longestDarkMs = 0;
  let longestDarkClipped = false;
  let cursor = r0;
  let cursorIsEdge = true;
  const consider = (s: number, e: number, clipped: boolean): void => {
    if (e - s > longestDarkMs) {
      longestDarkMs = e - s;
      longestDarkClipped = clipped;
    }
  };
  for (const w of scan.sunUp) {
    consider(cursor, w.start.getTime(), cursorIsEdge);
    cursor = w.end.getTime();
    cursorIsEdge = false;
  }
  const lastUp = scan.sunUp[scan.sunUp.length - 1];
  if (!lastUp || !lastUp.clippedEnd) consider(cursor, r1, true);

  return {
    sun: {
      ...sun,
      aboveHorizonDeg: sun.elDeg - sunHorizon,
      visibleFraction: visibleFraction(sun.elDeg, sunHorizon, sun.angDiamDeg),
      powerOk,
      nextSet: nextEvent('sunUp', 'set'),
      nextRise: nextEvent('sunUp', 'rise'),
      powerOkEnds: powerOk ? nextEvent('powerOk', 'set') : null,
    },
    earth: {
      ...earth,
      aboveHorizonDeg: earth.elDeg - earthHorizon,
      visible: earthVisible,
      commsOk,
      nextSet: nextEvent('earthVisible', 'set'),
      nextRise: nextEvent('earthVisible', 'rise'),
      commsOkEnds: commsOk ? nextEvent('commsOk', 'set') : null,
    },
    pctSunUp: pct(scan.sunUp),
    pctPowerOk: pct(scan.powerOk),
    pctEarthVisible: pct(scan.earthVisible),
    pctCommsOk: pct(scan.commsOk),
    pctBoth: pct(scan.both),
    longestDarkHours: longestDarkMs / MS_PER_HOUR,
    longestDarkClipped,
  };
}
