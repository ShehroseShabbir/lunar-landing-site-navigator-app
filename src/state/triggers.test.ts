// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bodyAltAz } from '../astro/ephem';
import { horizonElevAt } from '../astro/horizon';
import { scanWindows } from '../astro/windows';
import type { SiteGeo } from '../astro/types';
import { parseHorizonProfile } from '../data/horizons';
import malJson from '../../public/horizons/a3_malapert.json';
import type { TriggerRule } from './events.types';
import {
  CHUNK_DAYS,
  decodeRules,
  encodeRules,
  evaluateTrigger,
  findLandingWindows,
  foldLine,
  ruleToText,
  toICS,
} from './triggers';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
const MAL: SiteGeo = { latDeg: -85.995, lonDeg: -0.236 };
const malProfile = parseHorizonProfile(malJson, 'a3_malapert');
const from = new Date('2026-11-14T00:00:00Z');
const to = new Date(from.getTime() + 30 * DAY);

const BOTH12: TriggerRule = {
  id: 'both12',
  name: 'Power and radio',
  requirePower: true,
  requireComms: true,
  minDurationH: 12,
};

describe('evaluateTrigger', () => {
  it('power + comms >= 12 h at Malapert equals the scan "both" windows >= 12 h', () => {
    const scan = scanWindows(MAL, malProfile, from, to);
    const expected = scan.both.filter((w) => w.end.getTime() - w.start.getTime() >= 12 * HOUR);
    const got = evaluateTrigger(BOTH12, MAL, malProfile, from, to);
    expect(expected.length).toBeGreaterThan(0);
    expect(got.map((m) => [m.start.getTime(), m.end.getTime()])).toEqual(
      expected.map((w) => [w.start.getTime(), w.end.getTime()]),
    );
    for (const m of got) {
      expect(m.ruleId).toBe('both12');
      expect(m.durationH).toBeCloseTo((m.end.getTime() - m.start.getTime()) / HOUR, 9);
      expect(m.durationH).toBeGreaterThanOrEqual(12);
      expect(m.clippedEnd).toBe(m.end.getTime() === to.getTime());
    }
  });

  it('elevation-threshold edges are within 1 min of the direct bodyAltAz crossing', () => {
    const rule: TriggerRule = { id: 'sun2', name: 'High Sun', requirePower: false, requireComms: false, sunMinAboveTerrainDeg: 1, minDurationH: 0 };
    const got = evaluateTrigger(rule, MAL, malProfile, from, to);
    expect(got.length).toBeGreaterThan(0);
    const margin = (t: number): number => {
      const a = bodyAltAz('Sun', MAL, new Date(t));
      return a.elDeg - horizonElevAt(malProfile, a.azDeg) - 1;
    };
    let checked = 0;
    for (const m of got) {
      if (m.start.getTime() > from.getTime()) {
        expect(margin(m.start.getTime() - MIN)).toBeLessThan(0);
        expect(margin(m.start.getTime() + MIN)).toBeGreaterThanOrEqual(0);
        checked++;
      }
      if (!m.clippedEnd) {
        expect(margin(m.end.getTime() - MIN)).toBeGreaterThanOrEqual(0);
        expect(margin(m.end.getTime() + MIN)).toBeLessThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a rule with no conditions matches nothing; minDuration filters', () => {
    const none: TriggerRule = { id: 'x', name: 'x', requirePower: false, requireComms: false, minDurationH: 0 };
    expect(evaluateTrigger(none, MAL, malProfile, from, to)).toEqual([]);
    const long = evaluateTrigger({ ...BOTH12, minDurationH: 24 * 40 }, MAL, malProfile, from, to);
    expect(long).toEqual([]);
  });
});

describe('findLandingWindows', () => {
  it('merges a match that crosses a chunk boundary (same result as one long scan)', () => {
    // Pick a 'both' match, then start the search so the 30-day chunk edge falls inside it.
    const ref = evaluateTrigger(BOTH12, MAL, malProfile, from, new Date(from.getTime() + 60 * DAY));
    const long = ref.find((m) => !m.clippedEnd && m.start.getTime() > from.getTime() + 31 * DAY && m.durationH > 6) ??
      ref.find((m) => !m.clippedEnd && m.durationH > 6 && m.start.getTime() > from.getTime());
    expect(long).toBeDefined();
    const mid = Math.round((long!.start.getTime() + long!.end.getTime()) / 2 / MIN) * MIN;
    const sFrom = new Date(mid - CHUNK_DAYS * DAY);
    const span = 2 * CHUNK_DAYS;
    const sTo = new Date(sFrom.getTime() + span * DAY);
    const found = findLandingWindows({ rule: BOTH12, from: sFrom, spanDays: span, maxMatches: 100 }, MAL, malProfile);
    const direct = evaluateTrigger(BOTH12, MAL, malProfile, sFrom, sTo);
    expect(found.length).toBe(direct.length);
    found.forEach((m, i) => {
      expect(Math.abs(m.start.getTime() - direct[i].start.getTime())).toBeLessThanOrEqual(MIN);
      expect(Math.abs(m.end.getTime() - direct[i].end.getTime())).toBeLessThanOrEqual(MIN);
      expect(m.clippedEnd).toBe(direct[i].clippedEnd);
    });
    const crossing = found.find((m) => m.start.getTime() < mid && m.end.getTime() > mid);
    expect(crossing).toBeDefined();
    expect(Math.abs(crossing!.start.getTime() - long!.start.getTime())).toBeLessThanOrEqual(MIN);
    expect(Math.abs(crossing!.end.getTime() - long!.end.getTime())).toBeLessThanOrEqual(MIN);
  });

  it('180 days at a 10-min step finishes quickly and stops at maxMatches', () => {
    const t0 = performance.now();
    const all = findLandingWindows({ rule: BOTH12, from, spanDays: 180, maxMatches: 1000 }, MAL, malProfile);
    const ms = performance.now() - t0;
    console.log(`[S16] findLandingWindows Malapert 180 d, 10-min step: ${ms.toFixed(0)} ms, ${all.length} matches`);
    expect(all.length).toBeGreaterThan(3);
    expect(ms).toBeLessThan(5000); // target < 1500 ms; looser bound so a slow CI box doesn't flake
    for (let i = 1; i < all.length; i++) expect(all[i].start.getTime()).toBeGreaterThan(all[i - 1].end.getTime());
    const first3 = findLandingWindows({ rule: BOTH12, from, spanDays: 180, maxMatches: 3 }, MAL, malProfile);
    expect(first3).toEqual(all.slice(0, 3));
    expect(findLandingWindows({ rule: BOTH12, from, spanDays: 0, maxMatches: 3 }, MAL, malProfile)).toEqual([]);
  });
});

describe('ruleToText', () => {
  it('reads as plain English', () => {
    expect(ruleToText(BOTH12)).toBe('Sunlight for power and Earth in view for radio, both for at least 12 hours');
    expect(ruleToText({ ...BOTH12, requireComms: false, minDurationH: 1 })).toBe('Sunlight for power, for at least 1 hour');
    expect(ruleToText({ ...BOTH12, earthMinAboveTerrainDeg: 3, minDurationH: 0 })).toBe(
      'Sunlight for power, Earth in view for radio and Earth centre at least 3° above the terrain',
    );
    expect(ruleToText({ ...BOTH12, requirePower: false, requireComms: false })).toBe('No conditions set');
  });
});

describe('encodeRules / decodeRules', () => {
  it('round-trips', () => {
    const rules: TriggerRule[] = [
      BOTH12,
      { id: 'r2', name: 'Sun_high * 50%, Earth', requirePower: false, requireComms: true, sunMinAboveTerrainDeg: 2.5, minDurationH: 0.5 },
    ];
    const s = encodeRules(rules);
    expect(s).toBe('both12_pc_12___Power%20and%20radio*r2_c_0.5_2.5__Sun%5Fhigh%20%2A%2050%25%2C%20Earth');
    expect(decodeRules(s)).toEqual(rules);
    expect(decodeRules(new URLSearchParams(new URLSearchParams({ tr: s }).toString()).get('tr'))).toEqual(rules);
  });

  it('is robust to bad input', () => {
    expect(decodeRules(null)).toEqual([]);
    expect(decodeRules('')).toEqual([]);
    expect(decodeRules('garbage')).toEqual([]);
    expect(decodeRules('a_x_1___n')).toEqual([]); // bad flags
    expect(decodeRules('a_p_abc___n')).toEqual([]); // bad duration
    expect(decodeRules('a_p_1___%E0%A4%A')).toEqual([]); // bad percent-encoding
    const [r] = decodeRules('bad id!_p_99999_200_-50_');
    expect(r).toEqual({ id: 'r1', name: 'Rule 1', requirePower: true, requireComms: false, minDurationH: 8760, sunMinAboveTerrainDeg: 90, earthMinAboveTerrainDeg: -5 });
    const dup = decodeRules('a_p_1___x*a_c_1___y');
    expect(dup.map((x) => x.id)).toEqual(['a', 'r2']);
    expect(decodeRules(Array(20).fill('a_p_1___x').join('*'))).toHaveLength(8);
  });
});

describe('toICS', () => {
  it('is a valid RFC 5545 calendar: CRLF, folded <= 75 octets, UTC times, unique UIDs', () => {
    const matches = evaluateTrigger(BOTH12, MAL, malProfile, from, to);
    const name = 'Malapert Massif, a very long site name to force folding — with ünïcödé';
    const ics = toICS(matches, BOTH12, name, new Date('2026-11-14T03:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const physical = ics.split('\r\n').slice(0, -1);
    for (const l of physical) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // Unfold and parse back.
    const logical = ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
    const get = (key: string): string[] => logical.filter((l) => l.startsWith(key + ':')).map((l) => l.slice(key.length + 1));
    expect(get('DTSTAMP').every((v) => v === '20261114T030000Z')).toBe(true);
    const starts = get('DTSTART');
    expect(starts).toHaveLength(matches.length);
    starts.forEach((v, i) => {
      expect(v).toMatch(/^\d{8}T\d{6}Z$/);
      const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}Z`;
      expect(Math.abs(new Date(iso).getTime() - matches[i].start.getTime())).toBeLessThan(1000);
    });
    expect(new Set(get('UID')).size).toBe(matches.length);
    expect(get('SUMMARY')[0]).toBe('Malapert Massif\\, a very long site name to force folding — with ünïcödé: Power and radio');
    expect(get('DESCRIPTION')[0]).toContain('Geometry only — not a power or link budget.');
    expect(foldLine('x'.repeat(200)).split('\r\n').map((l) => l.length)).toEqual([75, 75, 52]);
  });
});

describe('match already open at from', () => {
  it('is flagged clippedStart and starts at from; later matches are not', () => {
    const scan = scanWindows(MAL, malProfile, from, to);
    const w = scan.both.find((x) => x.end.getTime() - x.start.getTime() >= 3 * HOUR && !x.clippedStart);
    expect(w).toBeDefined();
    const mid = new Date((w as { start: Date }).start.getTime() + HOUR);
    const rule: TriggerRule = { ...BOTH12, id: 'any', minDurationH: 0 };
    const got = evaluateTrigger(rule, MAL, malProfile, mid, to);
    expect(got[0].start.getTime()).toBe(mid.getTime());
    expect(got[0].clippedStart).toBe(true);
    expect(got.slice(1).every((m) => !m.clippedStart)).toBe(true);
    expect(toICS([got[0]], rule, 'Malapert')).toContain('Already open');
  });
});
