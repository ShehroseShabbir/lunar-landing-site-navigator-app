// Pure compare logic (ui-spec section 2.3): slip arithmetic, row values, best-per-row. No astronomy here.
import type { SiteMetrics } from '../../astro/types';
import { formatDuration, formatLongestDark, formatPercent, riseSetRow } from '../Metrics/format';
import { MAX_SCENARIOS, MAX_SLIP_DAYS, formatIso, parseIso, type Scenario } from '../../state/url';

export { MAX_SCENARIOS, MAX_SLIP_DAYS };
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
export const SCENARIO_LABELS = ['A', 'B', 'C', 'D'] as const;

export function clampSlip(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n);
  return Math.max(-MAX_SLIP_DAYS, Math.min(MAX_SLIP_DAYS, r)) || 0;
}

/** Base start shifted by the slip. */
export function effectiveStart(sc: Pick<Scenario, 'startISO' | 'slipDays'>): Date {
  const base = parseIso(sc.startISO) ?? new Date(0);
  return new Date(base.getTime() + sc.slipDays * DAY_MS);
}

export function withSlip(sc: Scenario, slipDays: number): Scenario {
  return { ...sc, slipDays: clampSlip(slipDays) };
}
export function shiftSlip(sc: Scenario, delta: number): Scenario {
  return withSlip(sc, sc.slipDays + delta);
}
/** Sets the base start to a new date, keeping the slip. */
export function withBaseStart(sc: Scenario, d: Date): Scenario {
  return { ...sc, startISO: formatIso(d) };
}

export function formatSlip(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} d`;
}

export function addScenario(list: Scenario[], from: Scenario): Scenario[] {
  return list.length >= MAX_SCENARIOS ? list : [...list, from];
}
/** The last scenario cannot be removed. */
export function removeScenario(list: Scenario[], index: number): Scenario[] {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

export type RowKey = 'power' | 'comms' | 'both' | 'dark' | 'sunset' | 'earthset' | 'powerNow' | 'commsNow';

export const ROW_LABELS: Record<RowKey, string> = {
  power: 'Power OK (30 d)',
  comms: 'Comms OK (30 d)',
  both: 'Both OK (30 d)',
  dark: 'Longest dark period',
  sunset: 'Next sunset',
  earthset: 'Next Earthset',
  powerNow: 'Power now',
  commsNow: 'Comms now',
};
export const ROW_ORDER: RowKey[] = ['power', 'comms', 'both', 'dark', 'sunset', 'earthset', 'powerNow', 'commsNow'];

export interface Cell {
  text: string;
  /** Higher is better; null means not ranked (never marked Best). */
  rank: number | null;
}

/** Rank follows the displayed value: 0, "< 1%" (0.5), 1..99 (never rounds up to 100), 100. */
export function percentRank(v: number): number {
  if (v <= 0) return 0;
  if (v < 1) return 0.5;
  if (v >= 100) return 100;
  return Math.min(99, Math.round(v));
}
const pct = (v: number): Cell => ({ text: formatPercent(v), rank: percentRank(v) });

function setCell(up: boolean, t: Date, nextSet: Date | null, nextRise: Date | null): Cell {
  if (up) {
    return nextSet
      ? { text: formatDuration(nextSet.getTime() - t.getTime()), rank: Math.round((nextSet.getTime() - t.getTime()) / MIN_MS) }
      : { text: 'Does not set in the next 30 d', rank: Infinity };
  }
  const r = riseSetRow(false, t, null, nextRise);
  return { text: `${r.label} ${r.value}`, rank: null };
}

/** Display text and rank for each row, for one scenario. `t` is the scenario start. */
export function buildColumn(m: SiteMetrics, t: Date): Record<RowKey, Cell> {
  return {
    power: pct(m.pctPowerOk),
    comms: pct(m.pctCommsOk),
    both: pct(m.pctBoth),
    dark: { text: formatLongestDark(m.longestDarkHours, m.longestDarkClipped), rank: m.longestDarkClipped ? null : -Math.round(m.longestDarkHours * 60) },
    sunset: setCell(m.sun.visibleFraction > 0, t, m.sun.nextSet, m.sun.nextRise),
    earthset: setCell(m.earth.visible, t, m.earth.nextSet, m.earth.nextRise),
    powerNow: { text: m.sun.powerOk ? 'OK' : 'Not OK', rank: m.sun.powerOk ? 1 : null },
    commsNow: { text: m.earth.commsOk ? 'OK' : 'Not OK', rank: m.earth.commsOk ? 1 : null },
  };
}

/** Indices of the best cells in a row; ties all marked. Needs at least two columns. */
export function bestIndices(cells: (Cell | null)[]): Set<number> {
  const out = new Set<number>();
  if (cells.length < 2) return out;
  let best = -Infinity;
  for (const c of cells) if (c && c.rank !== null && c.rank > best) best = c.rank;
  if (best === -Infinity) return out;
  cells.forEach((c, i) => {
    if (c && c.rank === best) out.add(i);
  });
  return out;
}

// ---- Plain naming and verdict (visual-spec v2, "Compare dates or sites") ----

const dayWord = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Card name. `scenario === base` (same object) is "Original date". Same site: later start gives "Delayed N days",
 * earlier gives "Earlier by N days", identical start gives "Copy of A". Different site gives "Other site"
 * (plus ", delayed N days" / ", earlier by N days" when the start differs).
 */
export function scenarioName(scenario: Scenario, base: Scenario): string {
  if (scenario === base) return 'Original date';
  const days = Math.round((effectiveStart(scenario).getTime() - effectiveStart(base).getTime()) / DAY_MS);
  const sameSite = JSON.stringify(scenario.site) === JSON.stringify(base.site);
  const shift = days > 0 ? `delayed ${dayWord(days)}` : days < 0 ? `earlier by ${dayWord(-days)}` : '';
  if (sameSite) return shift ? shift.charAt(0).toUpperCase() + shift.slice(1) : 'Copy of A';
  return shift ? `Other site, ${shift}` : 'Other site';
}

export interface VerdictRow {
  name: string;
  site: string;
  /** Sunlight % (30 d). */
  sunPct: number;
  /** Earth in view % (30 d). */
  earthPct: number;
  /** Longest dark period in hours; shorter is better. */
  darkHours: number;
  /** Clipped by a range edge: not ranked (as in buildColumn). */
  darkClipped?: boolean;
}

/**
 * One plain sentence. A row only counts when it separates the scenarios (all-equal rows are skipped);
 * ties tag every tied scenario as best on that row.
 */
export function verdict(rows: VerdictRow[]): string {
  if (rows.length < 2) return '';
  const ranks: (number | null)[][] = [
    rows.map((r) => percentRank(r.sunPct)),
    rows.map((r) => percentRank(r.earthPct)),
    rows.map((r) => (r.darkClipped ? null : -Math.round(r.darkHours * 60))),
  ];
  const counts = rows.map(() => 0);
  for (const col of ranks) {
    const vals = col.filter((v): v is number => v !== null);
    if (vals.length < 2 || vals.every((v) => v === vals[0])) continue;
    const best = Math.max(...vals);
    col.forEach((v, i) => {
      if (v === best) counts[i]++;
    });
  }
  const top = Math.max(...counts);
  const leaders = counts.flatMap((c, i) => (c === top ? [i] : []));
  if (top === 0 || leaders.length !== 1) return 'No clear winner; see below.';
  const w = rows[leaders[0]];
  const first = top === 3 ? `${w.site} (${w.name}) is best on all three.` : `${w.name} is best on ${top} of 3.`;
  return percentRank(w.sunPct) === 100 ? `${first} It has sunlight for all 30 days.` : first;
}

// ---- Verdict helpers (compare drawer) ----

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Spelled-out duration, largest two units: "1 day 7 hours", "47 minutes", "less than a minute". */
export function formatDurationLong(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / MIN_MS);
  if (total < 1) return 'less than a minute';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (d) parts.push(plural(d, 'day'));
  if (h) parts.push(plural(h, 'hour'));
  if (m) parts.push(plural(m, 'minute'));
  return parts.slice(0, 2).join(' ');
}

/** First scenario (after the first) at the same site as the first but starting later, with the delay in whole days. */
export function delayedPair(scenarios: Scenario[]): { index: number; days: number } | null {
  if (scenarios.length < 2) return null;
  const base = scenarios[0];
  const baseSite = JSON.stringify(base.site);
  for (let i = 1; i < scenarios.length; i++) {
    if (JSON.stringify(scenarios[i].site) !== baseSite) continue;
    const days = Math.round((effectiveStart(scenarios[i]).getTime() - effectiveStart(base).getTime()) / DAY_MS);
    if (days > 0) return { index: i, days };
  }
  return null;
}

/**
 * "At {site}, a N-day delay makes the longest dark period {delta} longer/shorter." Empty when the two periods are
 * equal or either is clipped by a range edge (no honest difference can be stated).
 */
export function delayNote(base: VerdictRow, delayed: VerdictRow, days: number): string {
  if (days <= 0 || base.darkClipped || delayed.darkClipped) return '';
  const diffMin = Math.round((delayed.darkHours - base.darkHours) * 60);
  if (diffMin === 0) return '';
  return `At ${base.site}, a ${days}-day delay makes the longest dark period ${formatDurationLong(Math.abs(diffMin) * MIN_MS)} ${diffMin > 0 ? 'longer' : 'shorter'}.`;
}

/** Splits a verdict into its first sentence (shown bold) and the rest. */
export function splitVerdict(text: string): [string, string] {
  const i = text.indexOf('. ');
  return i < 0 ? [text, ''] : [text.slice(0, i + 1), text.slice(i + 2)];
}

/** Bar width in percent, clamped to 0-100. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Nov 2026" in UTC. */
export function formatDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole-day shift of a scenario's effective start against the base, as "(+14 days)"; '' when equal. */
export function shiftLabel(scenario: Scenario, base: Scenario): string {
  const days = Math.round((effectiveStart(scenario).getTime() - effectiveStart(base).getTime()) / DAY_MS);
  if (days === 0) return '';
  return `(${days > 0 ? '+' : '−'}${plural(Math.abs(days), 'day')})`;
}

/** Longest-dark bars are drawn against the 30-day range. */
export const DARK_BAR_MAX_HOURS = 30 * 24;
