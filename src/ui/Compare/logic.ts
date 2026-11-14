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
