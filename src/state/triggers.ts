// Triggers and the landing-window finder (S16). Pure TS, no React or DOM, worker-safe.
// Power OK / Comms OK come from scanWindows (DR-HACK-10). The optional "centre at least X deg
// above the terrain" conditions are sampled at the same step and refined by bisection to <= 1 min,
// the same method as scanWindows, with the horizon taken at the body centre's azimuth.

import { altAzFrom, ephemSnapshot, siteFrame, type EphemSnapshot, type SiteFrame } from '../astro/ephem';
import { horizonElevAt } from '../astro/horizon';
import type { Body, HorizonProfile, SiteGeo, VisWindow } from '../astro/types';
import { DEFAULT_STEP_MIN, REFINE_MS, scanWindows } from '../astro/windows';
import type { TriggerMatch, TriggerRule, WindowSearch } from './events.types';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** findLandingWindows scans in chunks of this many days and merges matches across chunk edges. */
export const CHUNK_DAYS = 30;

/** A time span in ms. `e === range end` means the span may continue past the range. */
interface Span {
  s: number;
  e: number;
}

const hasCondition = (r: TriggerRule): boolean =>
  r.requirePower ||
  r.requireComms ||
  Number.isFinite(r.sunMinAboveTerrainDeg) ||
  Number.isFinite(r.earthMinAboveTerrainDeg);

const toSpans = (ws: readonly VisWindow[]): Span[] => ws.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));

/** Intersection of two sorted, non-overlapping span lists. */
function intersect(a: readonly Span[], b: readonly Span[]): Span[] {
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].s, b[j].s);
    const e = Math.min(a[i].e, b[j].e);
    if (e > s) out.push({ s, e });
    if (a[i].e <= b[j].e) i++;
    else j++;
  }
  return out;
}

interface AboveCond {
  body: Body;
  minDeg: number;
}

/** Centre elevation above the terrain horizon (deg), minus the threshold. On when >= 0. */
const aboveMargin = (c: AboveCond, frame: SiteFrame, profile: HorizonProfile | null, snap: EphemSnapshot): number => {
  const alt = altAzFrom(c.body, frame, snap);
  return alt.elDeg - horizonElevAt(profile, alt.azDeg) - c.minDeg;
};

/**
 * For each condition, the spans in [t0, t1] where the body centre is at least `minDeg` above the
 * terrain horizon. Sampled at stepMs on the same grid as scanWindows (one ephemeris snapshot per
 * sample shared by all conditions), each change bisected to <= REFINE_MS.
 */
function aboveSpans(
  conds: readonly AboveCond[],
  frame: SiteFrame,
  profile: HorizonProfile | null,
  t0: number,
  t1: number,
  stepMs: number,
): Span[][] {
  const withSun = conds.some((c) => c.body === 'Sun');
  const isOn = (c: AboveCond, tMs: number): boolean =>
    aboveMargin(c, frame, profile, ephemSnapshot(new Date(tMs), c.body === 'Sun')) >= 0;
  const refine = (c: AboveCond, lo: number, hi: number, loOn: boolean): number => {
    while (hi - lo > REFINE_MS) {
      const mid = (lo + hi) / 2;
      if (isOn(c, mid) === loOn) lo = mid;
      else hi = mid;
    }
    return Math.round((lo + hi) / 2);
  };
  const out: Span[][] = conds.map(() => []);
  const snap0 = ephemSnapshot(new Date(t0), withSun);
  const open = conds.map((c) => aboveMargin(c, frame, profile, snap0) >= 0);
  const start = conds.map(() => t0);
  let prevT = t0;
  const nInner = Math.ceil((t1 - t0) / stepMs);
  for (let k = 1; k <= nInner; k++) {
    const t = k === nInner ? t1 : t0 + k * stepMs;
    const snap = ephemSnapshot(new Date(t), withSun);
    conds.forEach((c, i) => {
      const now = aboveMargin(c, frame, profile, snap) >= 0;
      if (now === open[i]) return;
      const tc = refine(c, prevT, t, open[i]);
      if (now) start[i] = tc;
      else out[i].push({ s: start[i], e: tc });
      open[i] = now;
    });
    prevT = t;
  }
  conds.forEach((_c, i) => {
    if (open[i]) out[i].push({ s: start[i], e: t1 });
  });
  return out;
}

/** All spans in [t0, t1] where every set condition holds (no duration filter). Empty rule -> []. */
function ruleSpans(
  rule: TriggerRule,
  site: SiteGeo,
  profile: HorizonProfile | null,
  t0: number,
  t1: number,
  stepMin: number,
): Span[] {
  if (!hasCondition(rule) || !(t1 > t0)) return [];
  const stepMs = stepMin * MS_PER_MIN;
  const lists: Span[][] = [];
  if (rule.requirePower || rule.requireComms) {
    const scan = scanWindows(site, profile, new Date(t0), new Date(t1), stepMin);
    if (rule.requirePower) lists.push(toSpans(scan.powerOk));
    if (rule.requireComms) lists.push(toSpans(scan.commsOk));
  }
  const conds: AboveCond[] = [];
  if (Number.isFinite(rule.sunMinAboveTerrainDeg)) conds.push({ body: 'Sun', minDeg: rule.sunMinAboveTerrainDeg as number });
  if (Number.isFinite(rule.earthMinAboveTerrainDeg)) {
    conds.push({ body: 'Earth', minDeg: rule.earthMinAboveTerrainDeg as number });
  }
  if (conds.length > 0) lists.push(...aboveSpans(conds, siteFrame(site), profile, t0, t1, stepMs));
  return lists.reduce((acc, l) => intersect(acc, l));
}

function toMatch(rule: TriggerRule, sp: Span, endMs: number, startMs: number): TriggerMatch | null {
  const minMs = Math.max(0, Number.isFinite(rule.minDurationH) ? rule.minDurationH : 0) * MS_PER_HOUR;
  const dur = sp.e - sp.s;
  if (dur <= 0 || dur < minMs) return null;
  return { ruleId: rule.id, start: new Date(sp.s), end: new Date(sp.e), durationH: dur / MS_PER_HOUR, clippedStart: sp.s <= startMs, clippedEnd: sp.e >= endMs };
}

/**
 * Matches in [from, to] where every set condition holds continuously for >= rule.minDurationH.
 * A match already open at `from` starts at `from`; one still open at `to` ends at `to` with
 * clippedEnd. A clipped match shorter than minDurationH is not listed (not proven long enough).
 * A rule with no condition set matches nothing.
 */
export function evaluateTrigger(
  rule: TriggerRule,
  site: SiteGeo,
  profile: HorizonProfile | null,
  from: Date,
  to: Date,
  stepMin: number = DEFAULT_STEP_MIN,
): TriggerMatch[] {
  if (!(stepMin > 0) || !Number.isFinite(stepMin)) throw new RangeError('stepMin must be > 0');
  const t0 = from.getTime();
  const t1 = to.getTime();
  const out: TriggerMatch[] = [];
  for (const sp of ruleSpans(rule, site, profile, t0, t1, stepMin)) {
    const m = toMatch(rule, sp, t1, t0);
    if (m) out.push(m);
  }
  return out;
}

/**
 * The landing-window finder: evaluateTrigger over search.spanDays from search.from, scanned in
 * CHUNK_DAYS chunks (one scan per chunk), merging matches that cross chunk edges. Stops after
 * search.maxMatches matches.
 */
export function findLandingWindows(
  search: WindowSearch,
  site: SiteGeo,
  profile: HorizonProfile | null,
  stepMin: number = DEFAULT_STEP_MIN,
): TriggerMatch[] {
  const { rule } = search;
  const max = Math.floor(search.maxMatches);
  const out: TriggerMatch[] = [];
  const t0 = search.from.getTime();
  if (!(search.spanDays > 0) || !Number.isFinite(search.spanDays) || !(max > 0) || !Number.isFinite(t0)) return out;
  const tEnd = t0 + search.spanDays * MS_PER_DAY;
  let pending: Span | null = null;
  const emit = (sp: Span): boolean => {
    const m = toMatch(rule, sp, tEnd, t0);
    if (m) out.push(m);
    return out.length >= max;
  };
  for (let c0 = t0; c0 < tEnd; ) {
    const c1 = Math.min(c0 + CHUNK_DAYS * MS_PER_DAY, tEnd);
    for (const sp of ruleSpans(rule, site, profile, c0, c1, stepMin)) {
      if (pending && pending.e === c0 && sp.s === c0) {
        pending.e = sp.e; // continues across the chunk edge
        continue;
      }
      if (pending && emit(pending)) return out;
      pending = { ...sp };
    }
    if (pending && pending.e < c1) {
      if (emit(pending)) return out;
      pending = null;
    }
    c0 = c1;
  }
  if (pending) emit(pending);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Plain English

const fmtNum = (x: number): string => String(Math.round(x * 10) / 10);

/** 12 -> "12 hours", 1 -> "1 hour", 0.5 -> "30 minutes". */
export function formatHours(h: number): string {
  if (h < 1) {
    const m = Math.round(h * 60);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const v = fmtNum(h);
  return `${v} hour${v === '1' ? '' : 's'}`;
}

/** e.g. "Sunlight for power and Earth in view for radio, both for at least 12 hours". */
export function ruleToText(rule: TriggerRule): string {
  const parts: string[] = [];
  if (rule.requirePower) parts.push('Sunlight for power');
  if (Number.isFinite(rule.sunMinAboveTerrainDeg)) {
    parts.push(`Sun centre at least ${fmtNum(rule.sunMinAboveTerrainDeg as number)}° above the terrain`);
  }
  if (rule.requireComms) parts.push('Earth in view for radio');
  if (Number.isFinite(rule.earthMinAboveTerrainDeg)) {
    parts.push(`Earth centre at least ${fmtNum(rule.earthMinAboveTerrainDeg as number)}° above the terrain`);
  }
  if (parts.length === 0) return 'No conditions set';
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  if (!(rule.minDurationH > 0)) return joined;
  const quant = parts.length === 1 ? '' : parts.length === 2 ? 'both ' : 'all ';
  return `${joined}, ${quant}for at least ${formatHours(rule.minDurationH)}`;
}

// ---------------------------------------------------------------------------------------------
// URL encoding: rules joined by '*', each `id_flags_minDurationH_sunMin_earthMin_name`.
// flags: 'p' power, 'c' comms, '0' none. Empty number field = unset. Name is percent-encoded.

export const MAX_RULES = 8;
export const MAX_NAME_LEN = 60;
const MAX_DURATION_H = 8760;
const ID_RE = /^[A-Za-z0-9-]{1,24}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

const encName = (s: string): string => encodeURIComponent(s).replace(/\*/g, '%2A').replace(/_/g, '%5F');

export function encodeRules(rules: readonly TriggerRule[]): string {
  return rules
    .slice(0, MAX_RULES)
    .map((r) => {
      const flags = `${r.requirePower ? 'p' : ''}${r.requireComms ? 'c' : ''}` || '0';
      const num = (x: number | undefined): string => (Number.isFinite(x) ? String(x) : '');
      return [ID_RE.test(r.id) ? r.id : '', flags, num(r.minDurationH), num(r.sunMinAboveTerrainDeg), num(r.earthMinAboveTerrainDeg), encName(r.name.slice(0, MAX_NAME_LEN))].join('_');
    })
    .join('*');
}

function parseNum(tok: string, lo: number, hi: number): number | undefined {
  if (!NUM_RE.test(tok)) return undefined;
  const v = Number(tok);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
}

/** Bad entries are dropped, numbers clamped, missing or duplicate ids regenerated; at most MAX_RULES. */
export function decodeRules(raw: string | null | undefined): TriggerRule[] {
  const out: TriggerRule[] = [];
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4000) return out;
  const ids = new Set<string>();
  for (const part of raw.split('*')) {
    if (out.length >= MAX_RULES) break;
    const f = part.split('_');
    if (f.length !== 6) continue;
    const [idTok, flags, durTok, sunTok, earthTok, nameTok] = f;
    if (!/^(0|p|c|pc)$/.test(flags)) continue;
    const dur = durTok === '' ? 0 : parseNum(durTok, 0, MAX_DURATION_H);
    if (dur === undefined) continue;
    let name: string;
    try {
      name = decodeURIComponent(nameTok).trim().slice(0, MAX_NAME_LEN);
    } catch {
      continue;
    }
    let id = ID_RE.test(idTok) && !ids.has(idTok) ? idTok : '';
    for (let k = out.length + 1; !id; k++) if (!ids.has(`r${k}`)) id = `r${k}`;
    ids.add(id);
    const rule: TriggerRule = {
      id,
      name: name || `Rule ${out.length + 1}`,
      requirePower: flags.includes('p'),
      requireComms: flags.includes('c'),
      minDurationH: dur,
    };
    const sun = parseNum(sunTok, -5, 90);
    const earth = parseNum(earthTok, -5, 90);
    if (sun !== undefined) rule.sunMinAboveTerrainDeg = sun;
    if (earth !== undefined) rule.earthMinAboveTerrainDeg = earth;
    out.push(rule);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// iCalendar (RFC 5545)

const icsTime = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const icsText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utf8Len = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds a content line to <= 75 octets per line (RFC 5545 3.1), never splitting a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Len(ch.codePointAt(0) as number);
    if (bytes + n > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** One VEVENT per match; UTC times; DESCRIPTION states it is geometry only. */
export function toICS(matches: readonly TriggerMatch[], rule: TriggerRule, siteName: string, now: Date = new Date()): string {
  const stamp = icsTime(now);
  const safeId = rule.id.replace(/[^A-Za-z0-9-]/g, '') || 'rule';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lunar Landing Site Navigator//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  matches.forEach((m, i) => {
    const open = m.clippedStart ? 'Already open when the search began, so it started earlier. ' : '';
    const dur = `${fmtNum(m.durationH)} h${m.clippedEnd ? ' or more (the search span ends while it is still open)' : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${safeId}-${icsTime(m.start)}-${i}@lunar-landing-site-navigator`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(m.start)}`,
      `DTEND:${icsTime(m.end)}`,
      `SUMMARY:${icsText(`${siteName}: ${rule.name}`)}`,
      `DESCRIPTION:${icsText(`${open}Duration ${dur}. ${ruleToText(rule)}. Geometry only — not a power or link budget.`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
