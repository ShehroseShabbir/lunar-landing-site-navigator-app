// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scanWindows } from '../astro/windows';
import type { ScanResult, SiteGeo } from '../astro/types';
import { parseHorizonProfile } from '../data/horizons';
import crJson from '../../public/horizons/connecting_ridge.json';
import malJson from '../../public/horizons/a3_malapert.json';
import { listEvents, nextEvents } from './events';
import type { EventKind } from './events.types';

const DAY = 86_400_000;
const CR: SiteGeo = { latDeg: -89.4398, lonDeg: -137.17 };
const MAL: SiteGeo = { latDeg: -85.995, lonDeg: -0.236 };
const crProfile = parseHorizonProfile(crJson, 'connecting_ridge');
const malProfile = parseHorizonProfile(malJson, 'a3_malapert');
const from = new Date('2026-11-14T00:00:00Z');
const to = new Date(from.getTime() + 30 * DAY);

const PAIRS: [keyof ScanResult, EventKind, EventKind][] = [
  ['sunUp', 'sunrise', 'sunset'],
  ['powerOk', 'powerStart', 'powerEnd'],
  ['earthVisible', 'earthrise', 'earthset'],
  ['commsOk', 'commsStart', 'commsEnd'],
  ['both', 'bothStart', 'bothEnd'],
];

describe.each([
  ['Connecting Ridge', CR, crProfile],
  ['Malapert', MAL, malProfile],
])('listEvents at %s', (_name, site, profile) => {
  const scan = scanWindows(site, profile, from, to);
  const events = listEvents(scan, from, to);

  it('has one event per real window edge, none at the range clips', () => {
    for (const [key, startKind, endKind] of PAIRS) {
      const ws = scan[key];
      const starts = ws.filter((w) => !w.clippedStart).map((w) => w.start.getTime());
      const ends = ws.filter((w) => !w.clippedEnd).map((w) => w.end.getTime());
      expect(events.filter((e) => e.kind === startKind).map((e) => e.t.getTime())).toEqual(starts);
      expect(events.filter((e) => e.kind === endKind).map((e) => e.t.getTime())).toEqual(ends);
    }
    for (const e of events) {
      expect(e.t.getTime()).toBeGreaterThan(from.getTime());
      expect(e.t.getTime()).toBeLessThan(to.getTime());
    }
    expect(events.length).toBeGreaterThan(0);
  });

  it('is sorted and starts / ends alternate per state', () => {
    for (let i = 1; i < events.length; i++) {
      expect(events[i].t.getTime()).toBeGreaterThanOrEqual(events[i - 1].t.getTime());
    }
    for (const [key, startKind, endKind] of PAIRS) {
      const seq = events.filter((e) => e.kind === startKind || e.kind === endKind).map((e) => e.kind);
      const firstOpen = scan[key].length > 0 && scan[key][0].clippedStart;
      seq.forEach((k, i) => expect(k).toBe((i % 2 === 0) === firstOpen ? endKind : startKind));
    }
  });

  it('nextEvents returns the next n strictly after t', () => {
    const t = new Date(from.getTime() + 10 * DAY);
    const nx = nextEvents(scan, t, 3);
    const after = events.filter((e) => e.t.getTime() > t.getTime()).slice(0, 3);
    expect(nx).toEqual(after);
    expect(nextEvents(scan, t, 0)).toEqual([]);
  });

  it('sub-range filter keeps only events inside [from, to]', () => {
    const a = new Date(from.getTime() + 5 * DAY);
    const b = new Date(from.getTime() + 12 * DAY);
    const sub = listEvents(scan, a, b);
    expect(sub).toEqual(events.filter((e) => e.t >= a && e.t <= b));
    expect(listEvents(scan, b, a)).toEqual([]);
  });
});
