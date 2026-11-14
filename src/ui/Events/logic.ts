// Pure helpers for Events & triggers: wording, filters, presets, URL glue. No astronomy here.
import type { EventKind, SiteEvent, TriggerMatch, TriggerRule } from '../../state/events.types';
import { decodeRules, encodeRules } from '../../state/triggers';
import { formatUtc } from '../../state/time';
import { formatDurationLong, formatDay } from '../Compare/logic';
import { EV } from './copy';

export type EventGroup = 'sun' | 'earth' | 'both';
export type EventFilter = 'all' | EventGroup;

const GROUP: Record<EventKind, EventGroup> = {
  sunrise: 'sun',
  sunset: 'sun',
  powerStart: 'sun',
  powerEnd: 'sun',
  earthrise: 'earth',
  earthset: 'earth',
  commsStart: 'earth',
  commsEnd: 'earth',
  bothStart: 'both',
  bothEnd: 'both',
};

export function eventGroup(kind: EventKind): EventGroup {
  return GROUP[kind];
}

export function filterEvents(events: SiteEvent[], f: EventFilter): SiteEvent[] {
  return f === 'all' ? events : events.filter((e) => GROUP[e.kind] === f);
}

/** "in 2 days 4 hours", "3 hours ago", "now". */
export function relativeTime(from: Date, to: Date): string {
  const diff = to.getTime() - from.getTime();
  if (Math.abs(diff) < 60_000) return 'now';
  const d = formatDurationLong(Math.abs(diff));
  return diff > 0 ? `in ${d}` : `${d} ago`;
}

/** "Sunset in 2 days 4 hours". */
export function eventSentence(ev: SiteEvent, t: Date): string {
  const rel = relativeTime(t, ev.t);
  return rel === 'now' ? `${EV.kinds[ev.kind]} now` : `${EV.kinds[ev.kind]} ${rel}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "22 Nov 2026 at 06:12 UTC" */
export function utcWords(d: Date): string {
  const s = formatUtc(d); // 22 Nov 2026 06:12 UTC
  const i = s.lastIndexOf(' ', s.length - 5);
  return `${s.slice(0, i)} at ${s.slice(i + 1)}`;
}

/** "Go to sunset on 22 Nov 2026 at 06:12 UTC" */
export function eventActionLabel(ev: SiteEvent): string {
  return EV.go(lowerFirst(EV.kinds[ev.kind]), utcWords(ev.t));
}

/** "22 Nov, 06:12 UTC" short stamp for list rows. */
export function shortStamp(d: Date): string {
  const s = formatUtc(d).split(' '); // [22, Nov, 2026, 06:12, UTC]
  return `${s[0]} ${s[1]}, ${s[3]} UTC`;
}

/** "3 Dec 2026, 14:20 UTC" */
export function openingStamp(d: Date): string {
  return `${formatDay(d)}, ${formatUtc(d).split(' ')[3]} UTC`;
}

export function matchLasts(m: Pick<TriggerMatch, 'durationH'>): string {
  return formatDurationLong(m.durationH * 3_600_000);
}

export const MAX_RULES = 6;
export const SEARCH_SPANS = [30, 90, 180, 365] as const;
export const MAX_FIND_MATCHES = 5;

export type PresetKey = 'landing' | 'radio' | 'sunlight';
export interface Preset {
  key: PresetKey;
  label: string;
  rule: Omit<TriggerRule, 'id'>;
}

export const PRESETS: Preset[] = [
  { key: 'landing', label: EV.presets.landing, rule: { name: 'Landing window', requirePower: true, requireComms: true, minDurationH: 12 } },
  { key: 'radio', label: EV.presets.radio, rule: { name: 'Radio pass', requirePower: false, requireComms: true, minDurationH: 6 } },
  { key: 'sunlight', label: EV.presets.sunlight, rule: { name: 'Long sunlight', requirePower: true, requireComms: false, minDurationH: 72 } },
];

export function ruleFromPreset(p: Preset, id: string): TriggerRule {
  return { ...p.rule, id };
}

export function blankRule(id: string): TriggerRule {
  return { id, name: 'My trigger', requirePower: true, requireComms: false, minDurationH: 0 };
}

/** Next unused id, `r1`, `r2`, … */
export function nextRuleId(rules: TriggerRule[]): string {
  const used = new Set(rules.map((r) => r.id));
  for (let i = 1; ; i++) if (!used.has(`r${i}`)) return `r${i}`;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clamps a decoded rule to safe values; null when unusable. Never trusts the URL. */
export function sanitizeRule(r: unknown): TriggerRule | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 16) return null;
  const requirePower = o.requirePower === true;
  const requireComms = o.requireComms === true;
  const rule: TriggerRule = {
    id: o.id,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'Trigger',
    requirePower,
    requireComms,
    minDurationH: finite(o.minDurationH) ? Math.min(720, Math.max(0, o.minDurationH)) : 0,
  };
  if (finite(o.sunMinAboveTerrainDeg)) rule.sunMinAboveTerrainDeg = Math.min(90, Math.max(0, o.sunMinAboveTerrainDeg));
  if (finite(o.earthMinAboveTerrainDeg)) rule.earthMinAboveTerrainDeg = Math.min(90, Math.max(0, o.earthMinAboveTerrainDeg));
  if (!requirePower && !requireComms && rule.sunMinAboveTerrainDeg === undefined && rule.earthMinAboveTerrainDeg === undefined) return null;
  return rule;
}

/** Rules in a query string's `rules=` value. Bad or missing value gives []. */
export function rulesFromSearch(search: string): TriggerRule[] {
  const v = new URLSearchParams(search).get('rules');
  if (!v) return [];
  let decoded: unknown[];
  try {
    decoded = decodeRules(v);
  } catch {
    return [];
  }
  const out: TriggerRule[] = [];
  const seen = new Set<string>();
  for (const r of decoded) {
    const s = sanitizeRule(r);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

/** The query string with `rules=` set (or removed when empty), every other param kept as is. */
export function searchWithRules(search: string, rules: TriggerRule[]): string {
  const p = new URLSearchParams(search);
  if (rules.length === 0) p.delete('rules');
  else p.set('rules', encodeRules(rules));
  return p.toString();
}

/** Stable key for memoising a rule's results (id excluded: only conditions matter). */
export function ruleKey(r: TriggerRule): string {
  return [
    r.id,
    r.requirePower ? 1 : 0,
    r.requireComms ? 1 : 0,
    r.sunMinAboveTerrainDeg ?? '',
    r.earthMinAboveTerrainDeg ?? '',
    r.minDurationH,
  ].join('|');
}

/** A safe .ics file name from a rule name. */
export function icsFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'trigger'}.ics`;
}

/** Parses a numeric field: '' gives undefined (blank), invalid gives null. */
export function parseOptionalNumber(s: string, min: number, max: number): number | undefined | null {
  const v = s.trim();
  if (v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
