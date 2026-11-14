// Sampled Sun and Earth sky paths over the 30-day range, for the 3D hero and the panorama.
// Pure TS, no React or DOM. Every state uses the scan's own rules (src/astro/windows.ts),
// so a path point is "visible" / "ok" exactly when scanWindows would say so at that instant.

import { altAzFrom, ephemSnapshot, siteFrame } from '../astro/ephem';
import { horizonElevAt } from '../astro/horizon';
import type { AltAz, HorizonProfile, SiteGeo, VisState } from '../astro/types';
import { stateIsOn, stateMargin } from '../astro/windows';

export interface PathPoint {
  t: Date;
  azDeg: number;
  elDeg: number;
  /** Terrain horizon elevation at the body centre's azimuth (0 for the smooth Moon). */
  horizonElDeg: number;
  /** Limb rule, same as sunUp / earthVisible: any part of the disc above the terrain horizon. */
  visible: boolean;
  /** powerOk for the Sun (centre at or above terrain), commsOk for Earth (centre >= 0.5 deg above). */
  ok: boolean;
}

export interface SkyPaths {
  sun: PathPoint[];
  earth: PathPoint[];
}

export type RunState = 'visible-ok' | 'visible-only' | 'hidden';

export interface PathRun<K extends string = RunState> {
  state: K;
  points: PathPoint[];
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

function point(
  t: Date,
  alt: AltAz,
  profile: HorizonProfile | null,
  limb: VisState,
  op: VisState,
): PathPoint {
  return {
    t,
    azDeg: alt.azDeg,
    elDeg: alt.elDeg,
    horizonElDeg: horizonElevAt(profile, alt.azDeg),
    visible: stateIsOn(limb, stateMargin(limb, alt, profile)),
    ok: stateIsOn(op, stateMargin(op, alt, profile)),
  };
}

/**
 * Sun and Earth positions every `stepMin` minutes from `rangeStart` to `rangeStart + rangeDays`
 * (both ends included; the last step is shortened if the range is not a whole number of steps).
 */
export function computeSkyPaths(
  site: SiteGeo,
  profile: HorizonProfile | null,
  rangeStart: Date,
  rangeDays = 30,
  stepMin = 60,
): SkyPaths {
  if (!(stepMin > 0) || !Number.isFinite(stepMin)) throw new RangeError('stepMin must be > 0');
  if (!(rangeDays >= 0) || !Number.isFinite(rangeDays)) throw new RangeError('rangeDays must be >= 0');
  const t0 = rangeStart.getTime();
  const t1 = t0 + rangeDays * MS_PER_DAY;
  const stepMs = stepMin * MS_PER_MIN;
  const nInner = Math.ceil((t1 - t0) / stepMs);
  const frame = siteFrame(site);
  const sun: PathPoint[] = [];
  const earth: PathPoint[] = [];
  for (let k = 0; k <= nInner; k++) {
    const t = new Date(k === nInner ? t1 : t0 + k * stepMs);
    const snap = ephemSnapshot(t, true);
    sun.push(point(t, altAzFrom('Sun', frame, snap), profile, 'sunUp', 'powerOk'));
    earth.push(point(t, altAzFrom('Earth', frame, snap), profile, 'earthVisible', 'commsOk'));
  }
  return { sun, earth };
}

/** Drawing state of one point: solid (visible and ok), faint solid (visible only), dotted (hidden). */
export function pathState(p: PathPoint): RunState {
  if (!p.visible) return 'hidden';
  return p.ok ? 'visible-ok' : 'visible-only';
}

/**
 * Groups consecutive points into runs of the same `key` state.
 * When the state changes, the new run starts with the previous point too, so the runs join up
 * with no gap (the segment across a change is drawn in the later run's style).
 * With `breakAtWrap` (default), a run is also broken where the azimuth jumps by more than 180 deg
 * (the 0/360 wrap); runs on either side of a wrap share no point, so a flat panorama never draws
 * a line across its whole width. The 3D view passes `breakAtWrap: false`.
 */
export function splitRuns<K extends string = RunState>(
  points: readonly PathPoint[],
  key: (p: PathPoint) => K = pathState as (p: PathPoint) => K,
  opts: { breakAtWrap?: boolean } = {},
): PathRun<K>[] {
  const breakAtWrap = opts.breakAtWrap ?? true;
  const runs: PathRun<K>[] = [];
  let cur: PathRun<K> | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const s = key(p);
    if (cur === null) {
      cur = { state: s, points: [p] };
      runs.push(cur);
      continue;
    }
    const prev = points[i - 1];
    const wrapped = breakAtWrap && Math.abs(p.azDeg - prev.azDeg) > 180;
    if (wrapped) {
      cur = { state: s, points: [p] };
      runs.push(cur);
    } else if (s !== cur.state) {
      cur = { state: s, points: [prev, p] };
      runs.push(cur);
    } else {
      cur.points.push(p);
    }
  }
  return runs;
}
