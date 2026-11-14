import { describe, expect, it } from 'vitest';
import { siteMetrics } from './metrics';
import type { HorizonProfile, SiteGeo, VisWindow } from './types';
import { scanWindows } from './windows';

const DAY = 86_400_000;
const APOLLO11: SiteGeo = { latDeg: 0.674, lonDeg: 23.473 };
const POLAR: SiteGeo = { latDeg: -89.44, lonDeg: -137.17 };
const rangeStart = new Date('2027-01-01T00:00:00Z');

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

describe('siteMetrics', () => {
  it('reports consistent percentages and countdowns at an equatorial site', () => {
    const scan = scanWindows(APOLLO11, null, rangeStart, new Date(rangeStart.getTime() + 60 * DAY));
    const day = scan.sunUp.find((w) => !w.clippedStart && !w.clippedEnd) as VisWindow;
    expect(day).toBeDefined();
    // Range starts 1 h before sunrise, so the following lunar night (~354 h) fits inside it.
    const r0 = new Date(day.start.getTime() - 3_600_000);
    const t = new Date(day.start.getTime() + 2 * DAY);
    const m = siteMetrics(APOLLO11, null, t, r0);

    expect(m.sun.visibleFraction).toBe(1);
    expect(m.sun.powerOk).toBe(true);
    expect(m.sun.aboveHorizonDeg).toBeCloseTo(m.sun.elDeg, 12); // smooth Moon: horizon 0
    expect(Math.abs((m.sun.nextSet as Date).getTime() - day.end.getTime())).toBeLessThanOrEqual(60_000);
    expect((m.sun.nextRise as Date).getTime()).toBeGreaterThan(day.end.getTime());
    expect((m.sun.powerOkEnds as Date).getTime()).toBeLessThan((m.sun.nextSet as Date).getTime());

    expect(m.earth.visible && m.earth.commsOk).toBe(true);
    expect(m.earth.nextSet).toBeNull(); // Earth never sets at the near-side equator
    expect(m.pctEarthVisible).toBeCloseTo(100, 9);
    expect(m.pctSunUp).toBeGreaterThan(45);
    expect(m.pctSunUp).toBeLessThan(55);
    expect(m.pctPowerOk).toBeLessThanOrEqual(m.pctSunUp);
    expect(m.pctBoth).toBeLessThanOrEqual(Math.min(m.pctPowerOk, m.pctCommsOk) + 1e-9);
    expect(m.longestDarkHours).toBeGreaterThan(340);
    expect(m.longestDarkHours).toBeLessThan(370);
    expect(m.longestDarkClipped).toBe(false);
  });

  it('countdowns agree with the exact state at t near a refined window edge (M1 regression)', () => {
    // James's probe: power OK is true at t, but the refined window edge sat 1 s before t.
    const t = new Date('2027-01-28T02:39:42.250Z');
    const m = siteMetrics(APOLLO11, null, t, rangeStart);
    expect(m.sun.powerOk).toBe(true);
    const ends = (m.sun.powerOkEnds as Date).getTime();
    expect(ends).toBeGreaterThanOrEqual(t.getTime());
    expect(ends - t.getTime()).toBeLessThanOrEqual(60_000);
  });

  it('set and rise countdowns never jump a lunar cycle within a minute of the crossing', () => {
    const scan = scanWindows(APOLLO11, null, rangeStart, new Date(rangeStart.getTime() + 30 * DAY));
    const day = scan.sunUp.find((w) => !w.clippedStart && !w.clippedEnd) as VisWindow;
    for (let dt = -45_000; dt <= 45_000; dt += 1_000) {
      // Around sunset: if the Sun is still up, it sets within a minute.
      const ts = new Date(day.end.getTime() + dt);
      const ms = siteMetrics(APOLLO11, null, ts, rangeStart);
      if (ms.sun.visibleFraction > 0) {
        expect((ms.sun.nextSet as Date).getTime() - ts.getTime()).toBeLessThanOrEqual(60_000);
      } else {
        expect((ms.sun.nextSet as Date).getTime() - ts.getTime()).toBeGreaterThan(10 * DAY);
      }
      // Around sunrise: if the Sun is still down, it rises within a minute.
      const tr = new Date(day.start.getTime() + dt);
      const mr = siteMetrics(APOLLO11, null, tr, rangeStart);
      const rise = (mr.sun.nextRise as Date).getTime() - tr.getTime();
      expect(rise).toBeGreaterThanOrEqual(0);
      if (mr.sun.visibleFraction === 0) expect(rise).toBeLessThanOrEqual(60_000);
      else expect(rise).toBeGreaterThan(10 * DAY);
    }
  });

  it('Sun never sets in range: 100 % up, no dark period', () => {
    const m = siteMetrics(POLAR, flatProfile(-5), new Date(rangeStart.getTime() + DAY), rangeStart);
    expect(m.pctSunUp).toBeCloseTo(100, 9);
    expect(m.longestDarkHours).toBe(0);
    expect(m.longestDarkClipped).toBe(false);
    expect(m.sun.nextSet).toBeNull();
    expect(m.sun.powerOkEnds).toBeNull();
  });

  it('Sun never rises in range: whole range dark, clipped', () => {
    const m = siteMetrics(POLAR, flatProfile(5), new Date(rangeStart.getTime() + DAY), rangeStart);
    expect(m.pctSunUp).toBe(0);
    expect(m.pctPowerOk).toBe(0);
    expect(m.pctBoth).toBe(0);
    expect(m.sun.visibleFraction).toBe(0);
    expect(m.sun.powerOk).toBe(false);
    expect(m.sun.nextRise).toBeNull();
    expect(m.longestDarkHours).toBeCloseTo(30 * 24, 9);
    expect(m.longestDarkClipped).toBe(true);
  });

  it('honours rangeDays', () => {
    const m = siteMetrics(POLAR, flatProfile(5), rangeStart, rangeStart, 10);
    expect(m.longestDarkHours).toBeCloseTo(10 * 24, 9);
  });
});
