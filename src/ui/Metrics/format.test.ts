import type { SiteMetrics } from '../../astro/types';
import { describe, expect, it } from 'vitest';
import {
  commsChip, formatDeg, formatDuration, formatFraction, formatLongestDark, formatPercent, formatUtc,
  buildView, okRow, powerChip, riseSetRow,
} from './format';

const H = 3_600_000;
const t = new Date('2027-03-14T06:00:00Z');
const at = (h: number) => new Date(t.getTime() + h * H);

describe('formatDuration', () => {
  it('uses two largest units and drops zeros', () => {
    expect(formatDuration(100 * H)).toBe('4 d 4 h');
    expect(formatDuration(9 * H + 20 * 60_000)).toBe('9 h 20 m');
    expect(formatDuration(45 * 60_000)).toBe('45 m');
    expect(formatDuration(48 * H)).toBe('2 d');
    expect(formatDuration(49 * H + 5 * 60_000)).toBe('2 d 1 h');
    expect(formatDuration(30_000)).toBe('< 1 m');
    expect(formatDuration(30 * 24 * H)).toBe('≥ 30 d');
  });
});
describe('formatPercent and fraction', () => {
  it('follows the rounding rules', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.4)).toBe('< 1%');
    expect(formatPercent(57.6)).toBe('58%');
    expect(formatPercent(99.7)).toBe('99%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatFraction(0.62)).toBe('62%');
    expect(formatFraction(1)).toBe('100%');
    expect(formatFraction(0.998)).toBe('99%');
  });
});
describe('formatDeg', () => {
  it('uses true minus and one decimal', () => {
    expect(formatDeg(1.84)).toBe('1.8°');
    expect(formatDeg(-0.4)).toBe('−0.4°');
    expect(formatDeg(-0.02)).toBe('0.0°');
  });
});
describe('longest dark', () => {
  it('adds ≥ when clipped', () => {
    expect(formatLongestDark(122, false)).toBe('5 d 2 h');
    expect(formatLongestDark(122, true)).toBe('≥ 5 d 2 h');
    expect(formatLongestDark(720, true)).toBe('≥ 30 d');
    expect(formatLongestDark(0, false)).toBe('None in range');
  });
});
describe('formatUtc', () => {
  it('formats', () => expect(formatUtc(t)).toBe('14 Mar 2027 06:00 UTC'));
});
describe('chips', () => {
  it('carry text for both states', () => {
    expect(powerChip(true).text).toBe('Power OK');
    expect(powerChip(false).text).toBe('Power not OK');
    expect(commsChip(true).text).toBe('Comms OK');
    expect(commsChip(false).text).toBe('Comms not OK');
  });
});
describe('riseSetRow', () => {
  it('handles up, down and no crossing', () => {
    expect(riseSetRow(true, t, at(76), null)).toEqual({ label: 'Sets in', value: '3 d 4 h' });
    expect(riseSetRow(false, t, null, at(26))).toEqual({ label: 'Rises in', value: '1 d 2 h' });
    expect(riseSetRow(true, t, null, null).value).toBe('Does not set in the next 30 d');
    expect(riseSetRow(false, t, null, null).value).toBe('Does not rise in the next 30 d');
  });
});
describe('okRow', () => {
  const win = (s: number, e: number) => ({
    state: 'powerOk' as const, start: at(s), end: at(e), clippedStart: false, clippedEnd: false, maxElDeg: 1,
  });
  it('covers ok, upcoming and none', () => {
    expect(okRow('Power', true, t, at(70), null)).toEqual({ label: 'Power OK for another', value: '2 d 22 h' });
    expect(okRow('Comms', true, t, null, null).value).toBe('≥ 30 d');
    expect(okRow('Power', false, t, null, [win(-5, -1), win(5, 9)])).toEqual({ label: 'Power OK in', value: '5 h' });
    expect(okRow('Comms', false, t, null, [])).toEqual({ label: 'Comms not OK in range', value: '' });
  });
});

describe('buildView', () => {
  it('uses the limb for Sets in and the operational state for Comms OK in', () => {
    const base = { azDeg: 0, elDeg: 0.2, distanceKm: 1, angDiamDeg: 1.9, aboveHorizonDeg: 0.2 };
    const m = {
      sun: { ...base, visibleFraction: 1, powerOk: true, nextSet: at(10), nextRise: null, powerOkEnds: at(8) },
      earth: { ...base, visible: true, commsOk: false, nextSet: at(3), nextRise: null, commsOkEnds: null },
      pctSunUp: 50, pctPowerOk: 40, pctEarthVisible: 30, pctCommsOk: 20, pctBoth: 10,
      longestDarkHours: 5, longestDarkClipped: false,
    } as SiteMetrics;
    const comms = { state: 'commsOk' as const, start: at(6), end: at(9), clippedStart: false, clippedEnd: false, maxElDeg: 1 };
    const v = buildView(m, t, { powerOk: [], commsOk: [comms] } as never);
    expect(v.earth[1]).toEqual({ label: 'Sets in', value: '3 h' });
    expect(v.earth[2]).toEqual({ label: 'Comms OK in', value: '6 h' });
    expect(v.sun[3]).toEqual({ label: 'Power OK for another', value: '8 h' });
  });
});
