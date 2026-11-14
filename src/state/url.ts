// URL query <-> view state. Pure functions, no DOM.
import { DEFAULT_SITE_ID, getSite } from '../data/sites';
import { parseLat, parseLon } from './coords';
import { RANGE_DAYS, DAY_MS, roundToHour } from './time';

export interface CustomCoords {
  latDeg: number;
  lonDeg: number;
}

/** One compare scenario (S7): a catalogue site id or custom coordinates, a base start, and a slip. */
export interface Scenario {
  site: string | CustomCoords;
  /** Base start, `formatIso` form. The effective start is this plus slipDays. */
  startISO: string;
  /** Integer days, -60..60. */
  slipDays: number;
}

export interface ViewState {
  siteId: string;
  /** Set only for custom coordinates; siteId is then ignored. */
  custom: CustomCoords | null;
  rangeStart: Date;
  t: Date;
  scenarios: Scenario[];
}

export const MAX_SCENARIOS = 4;
export const MAX_SLIP_DAYS = 60;

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

/** `site@startISO@slip`, scenarios joined by `,`. Custom sites are written `lat/lon`. */
export function encodeScenarios(list: Scenario[]): string {
  return list
    .slice(0, MAX_SCENARIOS)
    .map((x) => {
      const site = typeof x.site === 'string' ? x.site : `${x.site.latDeg}/${x.site.lonDeg}`;
      return `${site}@${x.startISO}@${x.slipDays}`;
    })
    .join(',');
}

/** Bad entries are dropped; at most MAX_SCENARIOS are kept. */
export function decodeScenarios(raw: string | null): Scenario[] {
  const out: Scenario[] = [];
  if (!raw) return out;
  for (const part of raw.split(',')) {
    if (out.length >= MAX_SCENARIOS) break;
    const f = part.split('@');
    if (f.length !== 3) continue;
    const [siteTok, iso, slipTok] = f;
    const start = parseIso(iso);
    if (!start) continue;
    if (!/^-?\d+$/.test(slipTok)) continue;
    const slip = Number(slipTok);
    if (Math.abs(slip) > MAX_SLIP_DAYS) continue;
    let site: string | CustomCoords;
    if (siteTok.includes('/')) {
      const [la, lo] = siteTok.split('/');
      const lat = parseLat(la);
      const lon = parseLon(lo);
      if (!lat.ok || !lon.ok) continue;
      site = { latDeg: lat.value, lonDeg: lon.value };
    } else if (getSite(siteTok)) {
      site = siteTok;
    } else continue;
    out.push({ site, startISO: formatIso(start), slipDays: slip === 0 ? 0 : slip });
  }
  return out;
}

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
  if (s.scenarios.length > 0) p.set('sc', encodeScenarios(s.scenarios));
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

  const scenarios = decodeScenarios(p.get('sc'));

  return { siteId, custom, rangeStart, t, scenarios };
}
