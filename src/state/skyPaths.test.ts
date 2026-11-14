import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanWindows } from '../astro';
import type { HorizonProfile, VisWindow } from '../astro';
import { parseHorizonProfile } from '../data/horizons';
import { getSite, siteGeo } from '../data/sites';
import { computeSkyPaths, pathState, splitRuns, type PathPoint } from './skyPaths';

const DAY = 86_400_000;
// Same range as the guided tour: power OK 66%, comms OK 55% at Connecting Ridge (tour.test.ts).
const start = new Date('2027-03-14T00:00:00Z');

const ridgeSite = getSite('connecting_ridge');
if (!ridgeSite) throw new Error('connecting_ridge missing from sites.json');
const RIDGE = siteGeo(ridgeSite);
const ridgeProfile = parseHorizonProfile(
  JSON.parse(readFileSync(new URL('../../public/horizons/connecting_ridge.json', import.meta.url), 'utf8')),
  'connecting_ridge',
);

const flatProfile = (elDeg: number): HorizonProfile => ({
  siteId: 'flat',
  az0: 0,
  azStepDeg: 0.5,
  elevDeg: new Array(720).fill(elDeg),
  distKm: new Array(720).fill(10),
  minReachKm: 10,
  nearFieldResM: 80,
  observerHeightM: 2,
  maxRangeKm: 300,
  source: 'synthetic',
});

const pt = (azDeg: number, visible: boolean, ok: boolean, h = 0): PathPoint => ({
  t: new Date(start.getTime() + h * 3_600_000),
  azDeg,
  elDeg: 1,
  horizonElDeg: 0,
  visible,
  ok,
});

/** In a window, out of one, or too close to a refined edge (1-minute bisection) to call. */
function inWindows(ws: VisWindow[], tMs: number): boolean | null {
  for (const w of ws) {
    const s = w.start.getTime();
    const e = w.end.getTime();
    if ((!w.clippedStart && Math.abs(tMs - s) < 120_000) || (!w.clippedEnd && Math.abs(tMs - e) < 120_000)) return null;
    if (tMs >= s && tMs <= e) return true;
  }
  return false;
}

describe('computeSkyPaths', () => {
  const paths = computeSkyPaths(RIDGE, ridgeProfile, start);

  it('samples 30 days hourly, both ends included', () => {
    expect(paths.sun).toHaveLength(721);
    expect(paths.earth).toHaveLength(721);
    expect(paths.sun[0].t.getTime()).toBe(start.getTime());
    expect(paths.sun[720].t.getTime()).toBe(start.getTime() + 30 * DAY);
    expect(paths.earth[1].t.getTime() - paths.earth[0].t.getTime()).toBe(3_600_000);
  });

  it('closes a range that is not a whole number of steps at its exact end', () => {
    const p = computeSkyPaths(RIDGE, ridgeProfile, start, 1, 50);
    expect(p.sun).toHaveLength(30); // 0, 50, ..., 1400 min, then 1440
    expect(p.sun[29].t.getTime() - p.sun[28].t.getTime()).toBe(40 * 60_000);
    expect(p.sun[29].t.getTime()).toBe(start.getTime() + DAY);
  });

  it('agrees with scanWindows (sunUp, powerOk, earthVisible, commsOk) at every hourly sample', () => {
    const scan = scanWindows(RIDGE, ridgeProfile, start, new Date(start.getTime() + 30 * DAY));
    let compared = 0;
    const counts = { sunVis: 0, sunOk: 0, earthVis: 0, earthOk: 0 };
    for (let i = 0; i < paths.sun.length; i++) {
      const tMs = paths.sun[i].t.getTime();
      const checks: [boolean | null, boolean, keyof typeof counts][] = [
        [inWindows(scan.sunUp, tMs), paths.sun[i].visible, 'sunVis'],
        [inWindows(scan.powerOk, tMs), paths.sun[i].ok, 'sunOk'],
        [inWindows(scan.earthVisible, tMs), paths.earth[i].visible, 'earthVis'],
        [inWindows(scan.commsOk, tMs), paths.earth[i].ok, 'earthOk'],
      ];
      for (const [expected, got, k] of checks) {
        if (expected === null) continue;
        expect(got, `${k} at ${paths.sun[i].t.toISOString()}`).toBe(expected);
        compared++;
        if (got) counts[k]++;
      }
    }
    expect(compared).toBeGreaterThan(4 * 700);
    // The range has both states for every flag, so the comparison is not vacuous.
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[k]).toBeGreaterThan(0);
      expect(counts[k]).toBeLessThan(721);
    }
  });

  it('reports the terrain horizon at the body azimuth, and 0 for the smooth Moon', () => {
    const smooth = computeSkyPaths(RIDGE, null, start, 2);
    expect(smooth.sun.every((p) => p.horizonElDeg === 0)).toBe(true);
    expect(smooth.earth.every((p) => p.horizonElDeg === 0)).toBe(true);
    expect(paths.sun.some((p) => p.horizonElDeg !== 0)).toBe(true);
  });

  it('marks a body hidden (and not ok) when it is below the terrain', () => {
    const walled = computeSkyPaths(RIDGE, flatProfile(20), start, 30);
    for (const p of [...walled.sun, ...walled.earth]) {
      expect(p.horizonElDeg).toBe(20);
      expect(p.elDeg).toBeLessThan(20);
      expect(p.visible).toBe(false);
      expect(p.ok).toBe(false);
      expect(pathState(p)).toBe('hidden');
    }
  });

  it('marks the Sun visible but not power OK when only its upper limb clears the terrain', () => {
    // Sun about 0.27 deg in radius: put the horizon 0.1 deg above the centre at one instant.
    const sun0 = computeSkyPaths(RIDGE, null, start, 0).sun[0];
    const p = computeSkyPaths(RIDGE, flatProfile(sun0.elDeg + 0.1), start, 0).sun[0];
    expect(p.visible).toBe(true);
    expect(p.ok).toBe(false);
    expect(pathState(p)).toBe('visible-only');
  });
});

describe('splitRuns', () => {
  it('groups by state and joins runs at each change with the previous point', () => {
    const pts = [pt(10, true, true, 0), pt(11, true, true, 1), pt(12, true, false, 2), pt(13, false, false, 3), pt(14, false, false, 4)];
    const runs = splitRuns(pts);
    expect(runs.map((r) => r.state)).toEqual(['visible-ok', 'visible-only', 'hidden']);
    expect(runs[0].points).toEqual([pts[0], pts[1]]);
    expect(runs[1].points).toEqual([pts[1], pts[2]]);
    expect(runs[2].points).toEqual([pts[2], pts[3], pts[4]]);
  });

  it('breaks a run at the 0/360 azimuth wrap with no shared point', () => {
    const pts = [pt(358, true, true, 0), pt(359.5, true, true, 1), pt(0.8, true, true, 2), pt(2, true, true, 3)];
    const runs = splitRuns(pts);
    expect(runs).toHaveLength(2);
    expect(runs[0].points).toEqual([pts[0], pts[1]]);
    expect(runs[1].points).toEqual([pts[2], pts[3]]);
    // Wrap going the other way, combined with a state change at the same step.
    const back = splitRuns([pt(1, true, true, 0), pt(359, false, false, 1)]);
    expect(back.map((r) => [r.state, r.points.length])).toEqual([
      ['visible-ok', 1],
      ['hidden', 1],
    ]);
  });

  it('keeps one run across the wrap when breakAtWrap is false (3D view)', () => {
    const pts = [pt(359, true, true, 0), pt(1, true, true, 1)];
    expect(splitRuns(pts, pathState, { breakAtWrap: false })).toHaveLength(1);
  });

  it('accepts a custom key and handles empty input', () => {
    const pts = [pt(10, true, true, 0), pt(11, true, false, 1), pt(12, false, false, 2)];
    const runs = splitRuns(pts, (p) => (p.visible ? 'on' : 'off'));
    expect(runs.map((r) => r.state)).toEqual(['on', 'off']);
    expect(splitRuns([])).toEqual([]);
  });

  it('splits the real 30-day Sun path at Connecting Ridge into consistent runs', () => {
    const { sun } = computeSkyPaths(RIDGE, ridgeProfile, start);
    const runs = splitRuns(sun);
    for (const r of runs) {
      // Every point after a run's first has the run's state; no segment inside a run jumps > 180 deg.
      for (let i = 1; i < r.points.length; i++) {
        expect(pathState(r.points[i])).toBe(r.state);
        expect(Math.abs(r.points[i].azDeg - r.points[i - 1].azDeg)).toBeLessThanOrEqual(180);
      }
    }
    expect(new Set(runs.map((r) => r.state)).size).toBeGreaterThan(1);
  });
});
