// Visibility windows and state crossings (plan.md section 3, DR-HACK-10 definitions).
// Sampled at a fixed step, each state change refined by bisection to 1 minute.

import { altAzFrom, ephemSnapshot, siteFrame, type SiteFrame } from './ephem';
import { horizonElevAt } from './horizon';
import type { AltAz, Body, HorizonProfile, ScanResult, SiteGeo, VisState, VisWindow } from './types';

export const DEFAULT_STEP_MIN = 10;
export const DEFAULT_LIMIT_DAYS = 30;
/** Bisection stops when the bracket is at most this long; the crossing is its midpoint. */
export const REFINE_MS = 60_000;
/** Comms OK needs the Earth centre at least this far above the terrain horizon (deg). */
export const COMMS_MARGIN_DEG = 0.5;

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export const stateBody = (state: VisState): Body =>
  state === 'sunUp' || state === 'powerOk' ? 'Sun' : 'Earth';

/**
 * Signed margin (deg) whose sign decides the state.
 * sunUp / earthVisible: upper limb above the terrain horizon (centre + radius > horizon).
 * powerOk: Sun centre at or above the horizon (visible fraction >= 0.5).
 * commsOk: Earth centre at least 0.5 deg above the horizon.
 */
export function stateMargin(state: VisState, alt: AltAz, profile: HorizonProfile | null): number {
  const above = alt.elDeg - horizonElevAt(profile, alt.azDeg);
  switch (state) {
    case 'sunUp':
    case 'earthVisible':
      return above + alt.angDiamDeg / 2;
    case 'powerOk':
      return above;
    case 'commsOk':
      return above - COMMS_MARGIN_DEG;
  }
}

/** Limb states need a visible fraction > 0 (strict); centre states are inclusive (>= 0). */
export const stateIsOn = (state: VisState, margin: number): boolean =>
  state === 'sunUp' || state === 'earthVisible' ? margin > 0 : margin >= 0;

function stateAt(state: VisState, frame: SiteFrame, profile: HorizonProfile | null, tMs: number): boolean {
  const body = stateBody(state);
  const alt = altAzFrom(body, frame, ephemSnapshot(new Date(tMs), body === 'Sun'));
  return stateIsOn(state, stateMargin(state, alt, profile));
}

/** Bisect a bracket [loMs, hiMs] whose ends have different states; returns the crossing time (ms). */
function refineCrossing(
  state: VisState,
  frame: SiteFrame,
  profile: HorizonProfile | null,
  loMs: number,
  hiMs: number,
  loOn: boolean,
): number {
  let lo = loMs;
  let hi = hiMs;
  while (hi - lo > REFINE_MS) {
    const mid = (lo + hi) / 2;
    if (stateAt(state, frame, profile, mid) === loOn) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

const STATES: readonly VisState[] = ['sunUp', 'powerOk', 'earthVisible', 'commsOk'];

function maxOver(times: Float64Array, el: Float64Array, sMs: number, eMs: number): number {
  let m = -Infinity;
  for (let k = 0; k < times.length; k++) {
    if (times[k] >= sMs && times[k] <= eMs && el[k] > m) m = el[k];
  }
  return m;
}

/**
 * Sun and Earth visibility windows over [start, end].
 * A window already open at `start` has start = `start` and clippedStart; one still open at `end`
 * has end = `end` and clippedEnd. Windows shorter than one step can be missed.
 * maxElDeg is the body's highest sampled centre elevation in the window (the Sun's for 'both').
 */
export function scanWindows(
  site: SiteGeo,
  profile: HorizonProfile | null,
  start: Date,
  end: Date,
  stepMin: number = DEFAULT_STEP_MIN,
): ScanResult {
  if (!(stepMin > 0) || !Number.isFinite(stepMin)) throw new RangeError('stepMin must be > 0');
  const t0 = start.getTime();
  const t1 = end.getTime();
  if (!(t1 >= t0)) throw new RangeError('end must not be before start');
  const stepMs = stepMin * MS_PER_MIN;
  const frame = siteFrame(site);

  const nInner = Math.ceil((t1 - t0) / stepMs);
  const times: number[] = [];
  for (let k = 0; k < nInner; k++) times.push(t0 + k * stepMs);
  times.push(t1);
  const n = times.length;
  const tArr = Float64Array.from(times);
  const sunEl = new Float64Array(n);
  const earthEl = new Float64Array(n);
  const on: Record<VisState, Uint8Array> = {
    sunUp: new Uint8Array(n),
    powerOk: new Uint8Array(n),
    earthVisible: new Uint8Array(n),
    commsOk: new Uint8Array(n),
  };
  for (let k = 0; k < n; k++) {
    const snap = ephemSnapshot(new Date(tArr[k]), true);
    const sun = altAzFrom('Sun', frame, snap);
    const earth = altAzFrom('Earth', frame, snap);
    sunEl[k] = sun.elDeg;
    earthEl[k] = earth.elDeg;
    for (const s of STATES) {
      on[s][k] = stateIsOn(s, stateMargin(s, stateBody(s) === 'Sun' ? sun : earth, profile)) ? 1 : 0;
    }
  }

  const build = (state: VisState): VisWindow[] => {
    const flags = on[state];
    const el = stateBody(state) === 'Sun' ? sunEl : earthEl;
    const out: VisWindow[] = [];
    let open = flags[0] === 1;
    let wStart = t0;
    let clippedStart = open;
    let maxEl = open ? el[0] : -Infinity;
    for (let k = 1; k < n; k++) {
      const now = flags[k] === 1;
      if (now !== open) {
        const tc = refineCrossing(state, frame, profile, tArr[k - 1], tArr[k], open);
        if (now) {
          wStart = tc;
          clippedStart = false;
          maxEl = el[k];
        } else {
          out.push({ state, start: new Date(wStart), end: new Date(tc), clippedStart, clippedEnd: false, maxElDeg: maxEl });
        }
        open = now;
      } else if (now && el[k] > maxEl) {
        maxEl = el[k];
      }
    }
    if (open) {
      out.push({ state, start: new Date(wStart), end: new Date(t1), clippedStart, clippedEnd: true, maxElDeg: maxEl });
    }
    return out;
  };

  const sunUp = build('sunUp');
  const powerOk = build('powerOk');
  const earthVisible = build('earthVisible');
  const commsOk = build('commsOk');

  // 'both' = power OK and comms OK at the same time: intersection of the refined windows.
  const both: VisWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < powerOk.length && j < commsOk.length) {
    const a = powerOk[i];
    const b = commsOk[j];
    const s = Math.max(a.start.getTime(), b.start.getTime());
    const e = Math.min(a.end.getTime(), b.end.getTime());
    if (e > s) {
      let maxEl = maxOver(tArr, sunEl, s, e);
      if (maxEl === -Infinity) {
        maxEl = altAzFrom('Sun', frame, ephemSnapshot(new Date((s + e) / 2), true)).elDeg;
      }
      both.push({
        state: 'both',
        start: new Date(s),
        end: new Date(e),
        clippedStart: a.clippedStart && b.clippedStart,
        clippedEnd: a.clippedEnd && b.clippedEnd,
        maxElDeg: maxEl,
      });
    }
    if (a.end.getTime() <= b.end.getTime()) i++;
    else j++;
  }

  return { sunUp, powerOk, earthVisible, commsOk, both };
}

/**
 * Next time after `from` that `state` turns on ('rise') or off ('set'), searched at the
 * default step up to `limitDays` ahead and refined to 1 minute. Null if none in that span.
 */
export function nextCrossing(
  state: VisState,
  kind: 'rise' | 'set',
  site: SiteGeo,
  profile: HorizonProfile | null,
  from: Date,
  limitDays: number = DEFAULT_LIMIT_DAYS,
): Date | null {
  const frame = siteFrame(site);
  const stepMs = DEFAULT_STEP_MIN * MS_PER_MIN;
  const t0 = from.getTime();
  const tLimit = t0 + limitDays * MS_PER_DAY;
  let prevT = t0;
  let prevOn = stateAt(state, frame, profile, t0);
  while (prevT < tLimit) {
    const t = Math.min(prevT + stepMs, tLimit);
    const now = stateAt(state, frame, profile, t);
    if (now !== prevOn && now === (kind === 'rise')) {
      return new Date(refineCrossing(state, frame, profile, prevT, t, prevOn));
    }
    prevT = t;
    prevOn = now;
  }
  return null;
}
