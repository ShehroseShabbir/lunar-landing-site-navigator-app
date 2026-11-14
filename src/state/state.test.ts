import { describe, expect, it } from 'vitest';
import { formatCoords, parseLat, parseLon } from './coords';
import { DAY_MS, HOUR_MS, RANGE_DAYS, formatUtc, fromInputs, roundToHour, setRangeStart, setT, stepT } from './time';
import { decodeState, defaultState, encodeState, formatIso } from './url';
import { SITES, filterSites, getSite, groupSites } from '../data/sites';

const NOW = new Date('2026-11-14T03:42:10Z');

describe('coordinates', () => {
  it('accepts valid and true-minus input', () => {
    expect(parseLat('−89.9')).toEqual({ ok: true, value: -89.9 });
    expect(parseLon(' 31.0 ')).toEqual({ ok: true, value: 31 });
  });
  it('rejects empty, non-numeric, out of range', () => {
    expect(parseLat('')).toMatchObject({ ok: false, message: 'Enter a latitude.' });
    expect(parseLon('')).toMatchObject({ ok: false, message: 'Enter a longitude.' });
    expect(parseLat('abc').ok).toBe(false);
    expect(parseLat('12abc').ok).toBe(false);
    expect(parseLat('91').ok).toBe(false);
    expect(parseLon('-181').ok).toBe(false);
  });
  it('never accepts exactly +/-90 latitude', () => {
    expect(parseLat('90').ok).toBe(false);
    expect(parseLat('-90').ok).toBe(false);
    expect(parseLat('-89.99').ok).toBe(true);
  });
  it('suggests the east-positive value for 180 < lon <= 360', () => {
    const r = parseLon('200');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Did you mean −160°?');
    const r2 = parseLon('400');
    if (!r2.ok) expect(r2.message).not.toContain('Did you mean');
  });
  it('formats with hemisphere letters', () => {
    expect(formatCoords(-89.9, 0)).toBe('89.9° S · 0.0° E');
    expect(formatCoords(26.1, -23.4)).toBe('26.1° N · 23.4° W');
  });
});

describe('time rules', () => {
  const s0 = setRangeStart(new Date('2027-03-14T06:00:00Z'));
  it('rounds to the hour', () => {
    expect(roundToHour(NOW).toISOString()).toBe('2026-11-14T03:00:00.000Z');
  });
  it('setRangeStart moves t to it', () => {
    const s = setRangeStart(new Date('2027-01-01T00:00:00Z'));
    expect(s.t).toBe(s.rangeStart);
  });
  it('steps move t only while inside the range', () => {
    const s = stepT(s0, HOUR_MS);
    expect(s.rangeStart).toBe(s0.rangeStart);
    expect(s.t.toISOString()).toBe('2027-03-14T07:00:00.000Z');
  });
  it('t at the range end is still inside', () => {
    const end = new Date(s0.rangeStart.getTime() + RANGE_DAYS * DAY_MS);
    expect(setT(s0, end).rangeStart).toBe(s0.rangeStart);
  });
  it('t leaving the range moves rangeStart', () => {
    const fwd = stepT({ rangeStart: s0.rangeStart, t: new Date(s0.rangeStart.getTime() + RANGE_DAYS * DAY_MS) }, HOUR_MS);
    expect(fwd.rangeStart).toBe(fwd.t);
    const back = stepT(s0, -HOUR_MS);
    expect(back.t.toISOString()).toBe('2027-03-14T05:00:00.000Z');
    expect(back.rangeStart.getTime()).toBe(back.t.getTime() - RANGE_DAYS * DAY_MS);
    const back2 = stepT(back, -HOUR_MS);
    expect(back2.rangeStart).toBe(back.rangeStart);
  });
  it('parses inputs as UTC and rejects bad dates', () => {
    expect(fromInputs('2027-03-14', '06:00')?.toISOString()).toBe('2027-03-14T06:00:00.000Z');
    expect(fromInputs('2027-02-31', '06:00')).toBeNull();
    expect(fromInputs('', '06:00')).toBeNull();
    expect(fromInputs('0020-03-14', '06:00')).toBeNull();
    expect(fromInputs('0002-03-14', '06:00')).toBeNull();
    expect(fromInputs('2027-03-14', '24:00')).toBeNull();
  });
  it('formats UTC', () => {
    expect(formatUtc(new Date('2027-03-14T06:00:00Z'))).toBe('14 Mar 2027 06:00 UTC');
  });
});

describe('URL state', () => {
  it('defaults: Connecting Ridge, now rounded to the hour', () => {
    const d = decodeState('', NOW);
    expect(d.siteId).toBe('connecting_ridge');
    expect(d.rangeStart.toISOString()).toBe('2026-11-14T03:00:00.000Z');
    expect(d.t).toEqual(d.rangeStart);
    expect(d.custom).toBeNull();
  });
  it('round-trips a catalogue site with scenarios', () => {
    const s = {
      siteId: 'im2',
      custom: null,
      rangeStart: new Date('2027-03-14T06:00:00Z'),
      t: new Date('2027-03-20T12:00:00Z'),
      scenarios: [
        { site: 'im2', startISO: '2027-03-14T06:00Z', slipDays: 7 },
        { site: { latDeg: -88.5, lonDeg: 12.25 }, startISO: '2027-03-20T12:00Z', slipDays: -3 },
      ],
    };
    const q = encodeState(s);
    expect(q).toContain('start=2027-03-14T06%3A00Z');
    expect(decodeState(q, NOW)).toEqual(s);
  });
  it('round-trips custom coordinates', () => {
    const s = {
      ...defaultState(NOW),
      custom: { latDeg: -88.5, lonDeg: 123.25 },
    };
    expect(decodeState(encodeState(s), NOW).custom).toEqual({ latDeg: -88.5, lonDeg: 123.25 });
  });
  it('falls back on bad values', () => {
    const d = decodeState('?site=nope&lat=95&lon=0&start=garbage&t=2027-01-01T00:00Z&sc=x@2027-01-01T00:00Z@1,im2@bad@1,im2@2027-01-01T00:00Z@1.5,im2@2027-01-01T00:00Z@61,im2@2027-01-01T00:00Z@9', NOW);
    expect(d.siteId).toBe('connecting_ridge');
    expect(d.custom).toBeNull();
    expect(d.rangeStart.toISOString()).toBe('2026-11-14T03:00:00.000Z');
    expect(d.t).toEqual(d.rangeStart); // t outside the range is reset
    expect(d.scenarios).toEqual([{ site: 'im2', startISO: '2027-01-01T00:00Z', slipDays: 9 }]);
  });
  it('keeps at most 4 scenarios', () => {
    const one = 'im2@2027-01-01T00:00Z@0';
    expect(decodeState(`?sc=${[one, one, one, one, one, one].join(',')}`, NOW).scenarios).toHaveLength(4);
  });
  it('formatIso drops zero seconds', () => {
    expect(formatIso(new Date('2027-03-14T06:00:00Z'))).toBe('2027-03-14T06:00Z');
  });
});

describe('site catalogue', () => {
  it('has unique ids and valid coordinates', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) {
      expect(s.lat).toBeGreaterThan(-90);
      expect(s.lat).toBeLessThan(90);
      expect(s.lon).toBeGreaterThanOrEqual(-180);
      expect(s.lon).toBeLessThanOrEqual(180);
      expect(s.sourceUrl).toMatch(/^https?:\/\//);
    }
    expect(getSite('connecting_ridge')).toBeDefined();
  });
  it('renames the four DR-HACK-9 rows and groups them as reference points', () => {
    const ref = groupSites().find((g) => g.key === 'reference');
    expect(ref?.sites.map((s) => s.id).sort()).toEqual(['a3_cabeusb', 'a3_haworth', 'a3_slater', 'griffin1']);
    const names = ref!.sites.map((s) => s.name).join('|');
    expect(names).toMatch(/Haworth DEM tile centre/);
    expect(names).toMatch(/Cabeus B crater centre/);
    expect(names).toMatch(/Slater crater centre/);
    expect(names).toMatch(/Nobile crater centre/);
  });
  it('puts every site in exactly one group', () => {
    const n = groupSites().reduce((a, g) => a + g.sites.length, 0);
    expect(n).toBe(SITES.length);
  });
  it('filters by name, case-insensitively', () => {
    expect(filterSites(SITES, 'APOLLO 1').length).toBeGreaterThanOrEqual(5);
    expect(filterSites(SITES, 'zzzz')).toEqual([]);
    expect(filterSites(SITES, '  ')).toHaveLength(SITES.length);
  });
});
