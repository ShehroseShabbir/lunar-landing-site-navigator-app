import { describe, expect, it } from 'vitest';
import { bodyAltAz } from './ephem';
import { deg2rad } from './units';

// Tolerance from plan.md section 4 (DR-HACK-11).
const TOL_DEG = 0.05;
const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

describe('bodyAltAz', () => {
  it('matches the IM-1 Horizons reference point (research.md 3(b))', () => {
    // IM-1 (-80.13, 1.44 E), 2024-02-22 00:00 UT: Horizons Sun az 30.60, el 9.65.
    const r = bodyAltAz('Sun', { latDeg: -80.13, lonDeg: 1.44, heightM: 0 }, new Date('2024-02-22T00:00:00Z'));
    expect(Math.abs(r.elDeg - 9.65)).toBeLessThanOrEqual(TOL_DEG);
    expect(Math.abs(wrap180(r.azDeg - 30.6)) * Math.cos(deg2rad(r.elDeg))).toBeLessThanOrEqual(TOL_DEG);
  });

  it('gives disc sizes and distances in the expected ranges', () => {
    const site = { latDeg: 0.674, lonDeg: 23.473 };
    const t = new Date('2027-01-15T00:00:00Z');
    const sun = bodyAltAz('Sun', site, t);
    const earth = bodyAltAz('Earth', site, t);
    expect(sun.angDiamDeg).toBeGreaterThan(0.52);
    expect(sun.angDiamDeg).toBeLessThan(0.55);
    expect(sun.distanceKm).toBeGreaterThan(1.45e8);
    expect(earth.angDiamDeg).toBeGreaterThan(1.75);
    expect(earth.angDiamDeg).toBeLessThan(2.05);
    expect(earth.distanceKm).toBeGreaterThan(350_000);
    expect(earth.distanceKm).toBeLessThan(410_000);
  });

  it('puts Earth high in the sky near the sub-Earth point', () => {
    const r = bodyAltAz('Earth', { latDeg: 0, lonDeg: 0 }, new Date('2027-05-15T00:00:00Z'));
    expect(r.elDeg).toBeGreaterThan(80); // libration keeps it within about 10 deg of zenith
  });

  it('includes the observer offset from the Moon centre', () => {
    // Opposite limbs see Earth in directions about 2 * 1737.4 / 384400 rad = 0.52 deg apart,
    // so the Earth elevations at two limb sites sum to more than the zero a centre view would give.
    const t = new Date('2027-05-15T00:00:00Z');
    const east = bodyAltAz('Earth', { latDeg: 0, lonDeg: 90 }, t);
    const west = bodyAltAz('Earth', { latDeg: 0, lonDeg: -90 }, t);
    expect(east.elDeg + west.elDeg).toBeLessThan(-0.4);
    expect(east.elDeg + west.elDeg).toBeGreaterThan(-0.6);
  });

  it('stays finite at the pole (azimuth pinned to the site meridian)', () => {
    const r = bodyAltAz('Sun', { latDeg: -90, lonDeg: 0 }, new Date('2027-01-15T00:00:00Z'));
    expect(Number.isFinite(r.azDeg)).toBe(true);
    expect(r.azDeg).toBeGreaterThanOrEqual(0);
    expect(r.azDeg).toBeLessThan(360);
    expect(Math.abs(r.elDeg)).toBeLessThan(2);
  });
});
