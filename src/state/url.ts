// URL query <-> view state. Pure functions, no DOM.
import { DEFAULT_SITE_ID, getSite } from '../data/sites';
import { parseLat, parseLon } from './coords';
import { RANGE_DAYS, DAY_MS, roundToHour } from './time';

export interface Scenario {
  /** Compare slip in days applied to rangeStart (S7). */
  slipDays: number;
}

export interface CustomCoords {
  latDeg: number;
  lonDeg: number;
}

export interface ViewState {
  siteId: string;
  /** Set only for custom coordinates; siteId is then ignored. */
  custom: CustomCoords | null;
  rangeStart: Date;
  t: Date;
  scenarios: Scenario[];
}

export const MAX_SCENARIOS = 8;
const MAX_SLIP_DAYS = 365;

/** `2027-03-14T06:00Z`, or with seconds when non-zero. */
export function formatIso(d: Date): string {
  const s = d.toISOString(); // 2027-03-14T06:00:00.000Z
  return d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 ? s.slice(0, 16) + 'Z' : s;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

export function parseIso(s: string | null): Date | null {
  if (!s || !ISO_RE.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function defaultState(now: Date): ViewState {
  const start = roundToHour(now);
  return { siteId: DEFAULT_SITE_ID, custom: null, rangeStart: start, t: start, scenarios: [] };
}

function num(s: string): ParsedNum {
  if (s.trim() === '') return { ok: false, message: 'empty' };
  return { ok: true, value: Number(s) };
}
type ParsedNum = { ok: true; value: number } | { ok: false; message: string };

export function encodeState(s: ViewState): string {
  const p = new URLSearchParams();
  if (s.custom) {
    p.set('lat', String(s.custom.latDeg));
    p.set('lon', String(s.custom.lonDeg));
  } else {
    p.set('site', s.siteId);
  }
  p.set('start', formatIso(s.rangeStart));
  p.set('t', formatIso(s.t));
  if (s.scenarios.length > 0) p.set('slip', s.scenarios.map((x) => x.slipDays).join(','));
  return p.toString();
}

/** Decode a query string. Anything missing or invalid falls back to the default for that field. */
export function decodeState(search: string, now: Date): ViewState {
  const base = defaultState(now);
  const p = new URLSearchParams(search);

  let siteId = base.siteId;
  let custom: CustomCoords | null = null;
  const latS = p.get('lat');
  const lonS = p.get('lon');
  if (latS !== null && lonS !== null) {
    const lat = parseLat(latS);
    const lon = parseLon(lonS);
    if (lat.ok && lon.ok) custom = { latDeg: lat.value, lonDeg: lon.value };
  }
  const id = p.get('site');
  if (!custom && id && getSite(id)) siteId = id;

  const rangeStart = parseIso(p.get('start')) ?? base.rangeStart;
  let t = parseIso(p.get('t')) ?? rangeStart;
  const ms = t.getTime();
  if (ms < rangeStart.getTime() || ms > rangeStart.getTime() + RANGE_DAYS * DAY_MS) t = rangeStart;

  const scenarios: Scenario[] = [];
  const slip = p.get('slip');
  if (slip) {
    for (const part of slip.split(',').slice(0, MAX_SCENARIOS)) {
      const n = num(part);
      if (n.ok && Number.isInteger(n.value) && Math.abs(n.value) <= MAX_SLIP_DAYS) {
        scenarios.push({ slipDays: n.value });
      }
    }
  }

  return { siteId, custom, rangeStart, t, scenarios };
}
