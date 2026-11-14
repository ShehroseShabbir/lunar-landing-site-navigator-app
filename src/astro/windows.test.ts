import { describe, expect, it } from 'vitest';
import { bodyAltAz } from './ephem';
import type { HorizonProfile, SiteGeo, VisWindow } from './types';
import { nextCrossing, scanWindows } from './windows';

const MIN = 60_000;
const DAY = 86_400_000;
const APOLLO11: SiteGeo = { latDeg: 0.674, lonDeg: 23.473 };
const POLAR: SiteGeo = { latDeg: -89.44, lonDeg: -137.17 };

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

const start = new Date('2027-01-01T00:00:00Z');
const end60 = new Date(start.getTime() + 60 * DAY);
const scan60 = scanWindows(APOLLO11, null, start, end60);
const fullDay = scan60.sunUp.find((w) => !w.clippedStart && !w.clippedEnd) as VisWindow;

describe('scanWindows', () => {
  it('finds lunar days of about half a synodic month at the equator', () => {
    expect(fullDay).toBeDefined();
    const hours = (fullDay.end.getTime() - fullDay.start.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(340);
    expect(hours).toBeLessThan(370);
    expect(fullDay.maxElDeg).toBeGreaterThan(60);
  });

  it('sunrise is the upper limb on the horizon, refined to about a minute', () => {
    const r = bodyAltAz('Sun', APOLLO11, fullDay.start);
    expect(Math.abs(r.elDeg + r.angDiamDeg / 2)).toBeLessThan(0.01);
    const before = bodyAltAz('Sun', APOLLO11, new Date(fullDay.start.getTime() - 2 * MIN));
    const after = bodyAltAz('Sun', APOLLO11, new Date(fullDay.start.getTime() + 2 * MIN));
    expect(before.elDeg + before.angDiamDeg / 2).toBeLessThan(0);
    expect(after.elDeg + after.angDiamDeg / 2).toBeGreaterThan(0);
  });

  it('power OK starts when the Sun centre reaches the horizon, after the limb sunrise', () => {
    const p = scan60.powerOk.find((w) => w.start > fullDay.start && w.start < fullDay.end) as VisWindow;
    expect(p).toBeDefined();
    expect(Math.abs(bodyAltAz('Sun', APOLLO11, p.start).elDeg)).toBeLessThan(0.01);
    expect(p.end.getTime()).toBeLessThan(fullDay.end.getTime());
  });

  it('clips a window at both scan edges', () => {
    const s = new Date(fullDay.start.getTime() + DAY);
    const e = new Date(fullDay.end.getTime() - DAY);
    const r = scanWindows(APOLLO11, null, s, e);
    expect(r.sunUp).toHaveLength(1);
    const w = r.sunUp[0];
    expect(w.clippedStart).toBe(true);
    expect(w.clippedEnd).toBe(true);
    expect(w.start.getTime()).toBe(s.getTime());
    expect(w.end.getTime()).toBe(e.getTime());
  });

  it('clips only the start when the range begins mid-window', () => {
    const s = new Date(fullDay.start.getTime() + DAY + 7 * MIN); // off the original sample grid
    const e = new Date(fullDay.end.getTime() + DAY);
    const w = scanWindows(APOLLO11, null, s, e).sunUp[0];
    expect(w.clippedStart).toBe(true);
    expect(w.clippedEnd).toBe(false);
    expect(Math.abs(w.end.getTime() - fullDay.end.getTime())).toBeLessThanOrEqual(MIN);
  });

  it('Earth is always visible and comms OK from the near-side equator', () => {
    expect(scan60.earthVisible).toHaveLength(1);
    expect(scan60.commsOk[0].clippedStart && scan60.commsOk[0].clippedEnd).toBe(true);
  });

  it("'both' windows lie inside a power OK window and a comms OK window", () => {
    const polar = scanWindows(POLAR, null, start, new Date(start.getTime() + 30 * DAY));
    const inside = (w: VisWindow, ws: VisWindow[]): boolean =>
      ws.some((x) => x.start <= w.start && x.end >= w.end);
    for (const w of polar.both) {
      expect(w.state).toBe('both');
      expect(inside(w, polar.powerOk)).toBe(true);
      expect(inside(w, polar.commsOk)).toBe(true);
    }
    for (const w of scan60.both) expect(inside(w, scan60.powerOk)).toBe(true);
  });

  it('handles a Sun that never sets in range (depressed horizon)', () => {
    const r = scanWindows(POLAR, flatProfile(-5), start, new Date(start.getTime() + 30 * DAY));
    expect(r.sunUp).toHaveLength(1);
    expect(r.sunUp[0].clippedStart && r.sunUp[0].clippedEnd).toBe(true);
    expect(r.powerOk).toHaveLength(1);
  });

  it('handles a Sun that never rises in range (high horizon)', () => {
    const r = scanWindows(POLAR, flatProfile(5), start, new Date(start.getTime() + 30 * DAY));
    expect(r.sunUp).toHaveLength(0);
    expect(r.powerOk).toHaveLength(0);
    expect(r.both).toHaveLength(0);
  });

  it('rejects a bad step or a reversed range', () => {
    expect(() => scanWindows(APOLLO11, null, start, end60, 0)).toThrow(RangeError);
    expect(() => scanWindows(APOLLO11, null, end60, start)).toThrow(RangeError);
  });
});

describe('nextCrossing', () => {
  it('finds the sunset that ends the current lunar day', () => {
    const from = new Date(fullDay.start.getTime() + 3 * DAY);
    const set = nextCrossing('sunUp', 'set', APOLLO11, null, from);
    expect(set).not.toBeNull();
    expect(Math.abs((set as Date).getTime() - fullDay.end.getTime())).toBeLessThanOrEqual(MIN);
  });

  it('finds the next sunrise, skipping the set in between', () => {
    const from = new Date(fullDay.start.getTime() + 3 * DAY);
    const next = scan60.sunUp.find((w) => w.start > fullDay.end) as VisWindow;
    const rise = nextCrossing('sunUp', 'rise', APOLLO11, null, from, 40);
    expect(Math.abs((rise as Date).getTime() - next.start.getTime())).toBeLessThanOrEqual(MIN);
  });

  it('returns null when the state never changes within the limit', () => {
    expect(nextCrossing('sunUp', 'rise', POLAR, flatProfile(5), start, 10)).toBeNull();
    expect(nextCrossing('earthVisible', 'set', APOLLO11, null, start, 10)).toBeNull();
  });
});
