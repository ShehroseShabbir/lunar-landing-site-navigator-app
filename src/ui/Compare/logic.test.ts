import { describe, expect, it } from 'vitest';
import type { SiteMetrics } from '../../astro/types';
import { scenarioName, verdict, type VerdictRow, percentRank, addScenario, bestIndices, buildColumn, clampSlip, effectiveStart, formatSlip, removeScenario, shiftSlip } from './logic';
import type { Scenario } from '../../state/url';

const sc = (slip = 0): Scenario => ({ site: 'im2', startISO: '2027-03-14T06:00Z', slipDays: slip });
const T = new Date('2027-03-14T06:00:00Z');
const AZ = { azDeg: 0, elDeg: 0, distanceKm: 384400, angDiamDeg: 0.5 };
const at = (h: number | null) => (h === null ? null : new Date(T.getTime() + h * 3_600_000));

interface O {
  sunUp?: boolean;
  setH?: number | null;
  earthUp?: boolean;
  earthSetH?: number | null;
  pPow?: number;
  dark?: number;
  powerOk?: boolean;
  commsOk?: boolean;
}
function metrics(o: O): SiteMetrics {
  return {
    sun: { ...AZ, aboveHorizonDeg: 1, visibleFraction: o.sunUp === false ? 0 : 1, powerOk: o.powerOk ?? true, nextSet: at(o.setH ?? null), nextRise: at(5), powerOkEnds: null },
    earth: { ...AZ, aboveHorizonDeg: 1, visible: o.earthUp ?? true, commsOk: o.commsOk ?? true, nextSet: at(o.earthSetH ?? null), nextRise: at(7), commsOkEnds: null },
    pctSunUp: 50,
    pctPowerOk: o.pPow ?? 50,
    pctEarthVisible: 50,
    pctCommsOk: 40,
    pctBoth: 30,
    longestDarkHours: o.dark ?? 10,
    longestDarkClipped: false,
  };
}

describe('slip arithmetic', () => {
  it('shifts the start by whole days', () => {
    expect(effectiveStart(sc(14)).toISOString()).toBe('2027-03-28T06:00:00.000Z');
    expect(effectiveStart(sc(-14)).toISOString()).toBe('2027-02-28T06:00:00.000Z');
  });
  it('clamps to +-60 and integers', () => {
    expect(clampSlip(99)).toBe(60);
    expect(clampSlip(-99)).toBe(-60);
    expect(clampSlip(2.6)).toBe(3);
    expect(clampSlip(NaN)).toBe(0);
    expect(shiftSlip(sc(59), 7).slipDays).toBe(60);
  });
  it('formats with a true minus', () => {
    expect(formatSlip(14)).toBe('+14 d');
    expect(formatSlip(-3)).toBe('−3 d');
    expect(formatSlip(0)).toBe('0 d');
  });
});

describe('list edits', () => {
  it('caps at 4 and keeps the last scenario', () => {
    let l = [sc()];
    for (let i = 0; i < 6; i++) l = addScenario(l, sc(i));
    expect(l).toHaveLength(4);
    expect(removeScenario([sc()], 0)).toHaveLength(1);
    expect(removeScenario(l, 1)).toHaveLength(3);
  });
});

describe('best per row', () => {
  it('99.6 percent never ties with 100', () => {
    expect(percentRank(99.6)).toBe(99);
    expect(percentRank(100)).toBe(100);
    expect(percentRank(0.4)).toBe(0.5);
    const cols = [metrics({ pPow: 99.6 }), metrics({ pPow: 100 })].map((m) => buildColumn(m, T));
    expect([...bestIndices(cols.map((c) => c.power))]).toEqual([1]);
  });
  it('a clipped dark period is never Best', () => {
    const clipped = { ...metrics({ dark: 5 }), longestDarkClipped: true };
    const cols = [buildColumn(clipped, T), buildColumn(metrics({ dark: 100 }), T)];
    expect([...bestIndices(cols.map((c) => c.dark))]).toEqual([1]);
  });
  it('higher is better for percent, ties all marked', () => {
    const cols = [metrics({ pPow: 62 }), metrics({ pPow: 55 }), metrics({ pPow: 62 })].map((m) => buildColumn(m, T));
    expect([...bestIndices(cols.map((c) => c.power))]).toEqual([0, 2]);
  });
  it('lower is better for the longest dark period', () => {
    const cols = [metrics({ dark: 120 }), metrics({ dark: 80 })].map((m) => buildColumn(m, T));
    expect([...bestIndices(cols.map((c) => c.dark))]).toEqual([1]);
  });
  it('later sunset wins; a down Sun is never marked', () => {
    const cols = [metrics({ setH: 30 }), metrics({ setH: 100 }), metrics({ sunUp: false })].map((m) => buildColumn(m, T));
    expect([...bestIndices(cols.map((c) => c.sunset))]).toEqual([1]);
    expect(cols[2].sunset.text).toMatch(/^Rises in/);
  });
  it('a body that does not set beats one that does', () => {
    const cols = [metrics({ earthSetH: 30 }), metrics({ earthSetH: null })].map((m) => buildColumn(m, T));
    expect([...bestIndices(cols.map((c) => c.earthset))]).toEqual([1]);
  });
  it('OK beats Not OK; all Not OK marks nothing', () => {
    const a = [metrics({ powerOk: true }), metrics({ powerOk: false })].map((m) => buildColumn(m, T));
    expect([...bestIndices(a.map((c) => c.powerNow))]).toEqual([0]);
    const b = [metrics({ powerOk: false }), metrics({ powerOk: false })].map((m) => buildColumn(m, T));
    expect(bestIndices(b.map((c) => c.powerNow)).size).toBe(0);
  });
  it('a single column is never marked', () => {
    expect(bestIndices([buildColumn(metrics({}), T).power]).size).toBe(0);
  });
});

describe('scenarioName and verdict (plain)', () => {
  const base: Scenario = { site: 'im2', startISO: '2027-03-14T06:00Z', slipDays: 0 };
  it('names cards', () => {
    expect(scenarioName(base, base)).toBe('Original date');
    expect(scenarioName({ ...base }, base)).toBe('Copy of A');
    expect(scenarioName({ ...base, slipDays: 3 }, base)).toBe('Delayed 3 days');
    expect(scenarioName({ ...base, slipDays: 1 }, base)).toBe('Delayed 1 day');
    expect(scenarioName({ ...base, slipDays: -2 }, base)).toBe('Earlier by 2 days');
    expect(scenarioName({ ...base, startISO: '2027-03-16T06:00Z', slipDays: -2 }, base)).toBe('Copy of A');
    expect(scenarioName({ ...base, site: 'im1' }, base)).toBe('Other site');
    expect(scenarioName({ ...base, site: 'im1', slipDays: 4 }, base)).toBe('Other site, delayed 4 days');
    expect(scenarioName({ ...base, site: 'im1', slipDays: -1 }, base)).toBe('Other site, earlier by 1 day');
  });
  const row = (name: string, sunPct: number, earthPct: number, darkHours: number, darkClipped = false): VerdictRow => ({ name, site: 'IM-2', sunPct, earthPct, darkHours, darkClipped });
  it('best on all three', () => {
    expect(verdict([row('Original date', 50, 30, 100), row('Delayed 3 days', 60, 40, 50)])).toBe('Delayed 3 days (IM-2) is best on all three.');
  });
  it('best on k of 3, with the full-sunlight sentence', () => {
    expect(verdict([row('Original date', 100, 30, 100), row('Delayed 3 days', 60, 30, 100)])).toBe('Original date is best on 1 of 3. It has sunlight for the whole 30 days.');
    expect(verdict([row('A', 50, 30, 10), row('B', 60, 40, 50), row('C', 40, 30, 50)])).toBe('B is best on 2 of 3.');
  });
  it('ties and no winner', () => {
    expect(verdict([row('A', 50, 30, 50), row('B', 60, 20, 50)])).toBe('No clear winner; see below.');
    expect(verdict([row('A', 50, 30, 10), row('B', 50, 30, 10)])).toBe('No clear winner; see below.');
    expect(verdict([row('A', 50, 30, 10, true), row('B', 50, 30, 10, true)])).toBe('No clear winner; see below.');
    expect(verdict([row('A', 50, 30, 10)])).toBe('');
  });
});
