import { describe, expect, it } from 'vitest';
import { horizonElevAt, visibleFraction } from './horizon';
import type { HorizonProfile } from './types';

const profile = (elevDeg: number[], azStepDeg: number): HorizonProfile => ({
  siteId: 'test',
  az0: 0,
  azStepDeg,
  elevDeg,
  distKm: elevDeg.map(() => 10),
  minReachKm: 10,
  nearFieldResM: 80,
  observerHeightM: 2,
  maxRangeKm: 300,
  source: 'synthetic',
});

describe('horizonElevAt', () => {
  it('is 0 for the smooth Moon (null profile)', () => {
    expect(horizonElevAt(null, 123)).toBe(0);
  });
  it('interpolates linearly and wraps through 360', () => {
    const p = profile([0, 2, 4, 6], 90); // samples at 0, 90, 180, 270
    expect(horizonElevAt(p, 45)).toBeCloseTo(1, 12);
    expect(horizonElevAt(p, 180)).toBeCloseTo(4, 12);
    expect(horizonElevAt(p, 315)).toBeCloseTo(3, 12); // between 270 (6) and 360 = 0 (0)
    expect(horizonElevAt(p, -45)).toBeCloseTo(3, 12);
    expect(horizonElevAt(p, 405)).toBeCloseTo(1, 12);
  });
});

describe('visibleFraction', () => {
  const D = 0.53;
  it('is 0 when the disc is fully below the horizon', () => {
    expect(visibleFraction(-1, 0, D)).toBe(0);
    expect(visibleFraction(-D / 2, 0, D)).toBe(0); // upper limb exactly on the horizon
  });
  it('is 1 when the disc is fully above the horizon', () => {
    expect(visibleFraction(3, 2, D)).toBe(1);
    expect(visibleFraction(2 + D / 2, 2, D)).toBe(1); // lower limb exactly on the horizon
  });
  it('is one half when the centre sits on the horizon', () => {
    expect(visibleFraction(1.5, 1.5, D)).toBeCloseTo(0.5, 12);
  });
  it('matches the circular-segment area and is symmetric', () => {
    // Centre r/2 above the line: segment below has area r^2 (pi/3 - sqrt(3)/4).
    const expected = 1 - (Math.PI / 3 - Math.sqrt(3) / 4) / Math.PI;
    expect(visibleFraction(D / 4, 0, D)).toBeCloseTo(expected, 12);
    expect(visibleFraction(D / 4, 0, D) + visibleFraction(-D / 4, 0, D)).toBeCloseTo(1, 12);
  });
  it('is monotonic in elevation', () => {
    let prev = -1;
    for (let el = -0.4; el <= 0.4; el += 0.01) {
      const f = visibleFraction(el, 0, D);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});
