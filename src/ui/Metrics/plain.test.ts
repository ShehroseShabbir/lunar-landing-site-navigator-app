import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cachedScan, siteMetrics } from '../../astro';
import type { HorizonProfile, ScanResult, SiteMetrics, VisWindow } from '../../astro/types';
import { answerComms, answerPower, contextSentence, farSideLine, spellDuration } from './plain';

const MIN = 60_000;
const H = 3_600_000;
const D = 86_400_000;

describe('spellDuration', () => {
  it('spells the largest two units, plural-aware', () => {
    expect(spellDuration(D + 7 * H)).toBe('1 day 7 hours');
    expect(spellDuration(47 * MIN)).toBe('47 minutes');
    expect(spellDuration(H)).toBe('1 hour');
    expect(spellDuration(2 * D + 3 * MIN)).toBe('2 days 3 minutes');
    expect(spellDuration(D + 5 * MIN)).toBe('1 day 5 minutes');
    expect(spellDuration(H + MIN)).toBe('1 hour 1 minute');
    expect(spellDuration(3 * D + 4 * H + 5 * MIN)).toBe('3 days 4 hours');
  });
  it('is never negative and handles tiny or bad input', () => {
    expect(spellDuration(-5 * H)).toBe('less than a minute');
    expect(spellDuration(59_999)).toBe('less than a minute');
    expect(spellDuration(NaN)).toBe('less than a minute');
  });
});

const T = new Date('2026-11-20T00:00:00Z');
const win = (state: VisWindow['state'], s: number, e: number): VisWindow => ({
  state, start: new Date(T.getTime() + s * H), end: new Date(T.getTime() + e * H), clippedStart: false, clippedEnd: false, maxElDeg: 1,
});
const AZ = { azDeg: 0, elDeg: 0, distanceKm: 1, angDiamDeg: 0.5 };
function fake(o: { power: boolean; pEnd?: number | null; comms: boolean; cEnd?: number | null }): SiteMetrics {
  const at = (h: number | null | undefined) => (h == null ? null : new Date(T.getTime() + h * H));
  return {
    sun: { ...AZ, aboveHorizonDeg: 1, visibleFraction: 1, powerOk: o.power, nextSet: null, nextRise: null, powerOkEnds: at(o.pEnd) },
    earth: { ...AZ, aboveHorizonDeg: 1, visible: o.comms, commsOk: o.comms, nextSet: null, nextRise: null, commsOkEnds: at(o.cEnd) },
    pctSunUp: 0, pctPowerOk: 0, pctEarthVisible: 0, pctCommsOk: 0, pctBoth: 0, longestDarkHours: 0, longestDarkClipped: false,
  };
}
const scanOf = (power: VisWindow[], comms: VisWindow[]): ScanResult => ({ sunUp: [], powerOk: power, earthVisible: [], commsOk: comms, both: [] });

describe('answers: real Malapert Massif 2026-11-20', () => {
  const profile = JSON.parse(readFileSync(new URL('../../../public/horizons/a3_malapert.json', import.meta.url), 'utf8')) as HorizonProfile;
  const site = { latDeg: -85.995, lonDeg: -0.236 };
  const end = new Date(T.getTime() + 30 * D);
  const m = siteMetrics(site, profile, T, T);
  const scan = cachedScan(site, profile, T, end);
  it('power: Not yet, back in 1 day 7 hours', () => {
    const a = answerPower(m, T, scan);
    expect(a.word).toBe('Not yet');
    expect(a.sentence).toBe('Starts in 1 day 7 hours');
    expect(a.precise).toBe('Power not OK');
  });
  it('comms: Yes, ends in 9 days 16 hours', () => {
    const a = answerComms(m, T, scan);
    expect(a.word).toBe('Yes');
    expect(a.sentence).toBe('For another 9 days 16 hours');
    expect(a.precise).toBe('Comms OK');
  });
});

describe('answers: state table rows (synthetic)', () => {
  it('OK now', () => {
    const m = fake({ power: true, pEnd: 31, comms: true, cEnd: 0.75 });
    expect(answerPower(m, T, null)).toEqual({ word: 'Yes', sentence: 'For another 1 day 7 hours', precise: 'Power OK' });
    expect(answerComms(m, T, null)).toEqual({ word: 'Yes', sentence: 'For another 45 minutes', precise: 'Comms OK' });
  });
  it('OK later in range', () => {
    const m = fake({ power: false, comms: false });
    const s = scanOf([win('powerOk', -10, -5), win('powerOk', 31, 40)], [win('commsOk', 2.5, 9)]);
    expect(answerPower(m, T, s)).toEqual({ word: 'Not yet', sentence: 'Starts in 1 day 7 hours', precise: 'Power not OK' });
    expect(answerComms(m, T, s)).toEqual({ word: 'Not yet', sentence: 'Starts in 2 hours 30 minutes', precise: 'Comms not OK' });
  });
  it('not in range (empty list, no scan, or only past windows)', () => {
    const m = fake({ power: false, comms: false });
    for (const s of [scanOf([], []), null, scanOf([win('powerOk', -9, -3)], [win('commsOk', -9, -3)])]) {
      expect(answerPower(m, T, s)).toEqual({ word: 'No', sentence: 'Not in the next 30 days', precise: 'Power not OK in range' });
      expect(answerComms(m, T, s)).toEqual({ word: 'No', sentence: 'Not in the next 30 days', precise: 'Comms not OK in range' });
    }
  });
  it('OK all range (no end, or end 30 d away)', () => {
    for (const e of [null, 720]) {
      const m = fake({ power: true, pEnd: e, comms: true, cEnd: e });
      expect(answerPower(m, T, null).sentence).toBe('For all of the next 30 days');
      expect(answerComms(m, T, null).word).toBe('Yes');
    }
  });
  it('a next window starting within the refine tolerance counts as later, not never', () => {
    const m = fake({ power: false, comms: false });
    const s = scanOf([{ ...win('powerOk', 0, 5), start: new Date(T.getTime() - 30_000) }], []);
    expect(answerPower(m, T, s).word).toBe('Not yet');
    expect(answerPower(m, T, s).sentence).toBe('Starts in less than a minute');
  });
});

describe('answers: next window beyond the scan range (Apollo 11)', () => {
  const site = { latDeg: 0.674, lonDeg: 23.473 };
  const r0 = new Date('2027-03-01T00:00:00Z');
  const rangeEnd = new Date(r0.getTime() + 30 * D);
  const t = new Date('2027-03-28T07:18:00Z');
  const m = siteMetrics(site, null, t, r0);
  const scan = cachedScan(site, null, r0, rangeEnd);
  it('says Starts in about 14.7 days, not No', () => {
    expect(m.sun.powerOk).toBe(false);
    const a = answerPower(m, t, scan, { site, profile: null, rangeEnd });
    expect(a.word).toBe('Not yet');
    expect(a.sentence).toMatch(/^Starts in 1[45] days/);
    // without the context the old answer is "No"
    expect(answerPower(m, t, scan).word).toBe('No');
  });
});

describe('contextSentence', () => {
  it('uses the feature from the name', () => {
    expect(contextSentence('Malapert Massif', true, -86)).toBe("Malapert Massif is a mountain near the Moon's south pole. The Sun stays low here, so ridges can hide it for days.");
    expect(contextSentence('Shackleton Rim', true, -89.7)).toContain('is a crater rim near');
    expect(contextSentence('Connecting Ridge', true, -89.4)).toContain('so ridges can hide it');
    expect(contextSentence('Haworth', true, -87)).toContain('is a site near');
    expect(contextSentence('Haworth', true, -87)).toContain('so ridges can hide it');
  });
  it('is null without terrain', () => {
    expect(contextSentence('Malapert Massif', false, -86)).toBeNull();
  });
});

describe('farSideLine', () => {
  const never = { pctEarthVisible: 0 };
  it('needs no Earth in range AND |lon| > 90', () => {
    expect(farSideLine(never, 177.6, -45.5)).toMatch(/^Earth is never in view from the far side/);
    expect(farSideLine(never, -154, -41.6)).not.toBeNull();
    expect(farSideLine(never, 0, -86)).toBeNull(); // polar site with Earth just hidden
    expect(farSideLine(never, -102, -89.03)).toBeNull(); // connecting_ridge_ext: terrain hides Earth, not the far side
    expect(farSideLine({ pctEarthVisible: 12 }, 177, -45)).toBeNull();
  });
});
