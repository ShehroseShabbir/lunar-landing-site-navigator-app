// Pure ranking logic for the rank drawer. No astronomy here: metrics come from the shared scenario path.
import type { SiteMetrics } from '../../astro/types';
import { hasHorizonProfile } from '../../data/horizons';
import type { Site } from '../../data/sites';
import { percentRank } from '../Compare/logic';
import { formatLongestDark as fmtDark, formatPercent } from '../Metrics/format';

/** Rank only: keep a duration such as "≥ 13 d 20 m" on one line. */
const formatLongestDark = (h: number, clipped: boolean): string => fmtDark(h, clipped).replace(/ /g, '\u00a0');

export interface RankRow {
  siteId: string;
  name: string;
  /** Sunlight %, 30 days (Power OK). */
  sunPct: number;
  /** Earth in view %, 30 days (Comms OK). */
  earthPct: number;
  /** Both at once %. */
  bothPct: number;
  /** Longest dark period, hours. */
  darkHours: number;
  darkClipped: boolean;
}

export type SortKey = 'name' | 'sun' | 'earth' | 'both' | 'dark';
export type SortDir = 'asc' | 'desc';

/** Only sites with a LOLA horizon profile are ranked: a flat horizon is not comparable near the pole. */
export function rankableSites(sites: readonly Site[]): Site[] {
  return sites.filter((s) => hasHorizonProfile(s.id));
}

export function toRankRow(site: Pick<Site, 'id' | 'name'>, m: SiteMetrics): RankRow {
  return {
    siteId: site.id,
    name: site.name,
    sunPct: m.pctPowerOk,
    earthPct: m.pctCommsOk,
    bothPct: m.pctBoth,
    darkHours: m.longestDarkHours,
    darkClipped: m.longestDarkClipped,
  };
}

const darkMin = (r: RankRow): number => Math.round(r.darkHours * 60);
/** Clipped (≥) periods are only a lower bound, so they sort after unclipped ones, then by length. */
const darkCmp = (a: RankRow, b: RankRow): number =>
  Number(a.darkClipped) - Number(b.darkClipped) || darkMin(a) - darkMin(b);

/** Default order: most time with both at once (as displayed), then the shorter longest dark period, then name. */
export function compareDefault(a: RankRow, b: RankRow): number {
  return percentRank(b.bothPct) - percentRank(a.bothPct) || darkCmp(a, b) || a.name.localeCompare(b.name);
}

export function rankOrder(rows: readonly RankRow[]): RankRow[] {
  return [...rows].sort(compareDefault);
}

/** Natural direction when a column is first chosen. */
export function defaultDir(key: SortKey): SortDir {
  return key === 'name' || key === 'dark' ? 'asc' : 'desc';
}

function primary(key: SortKey, a: RankRow, b: RankRow): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'sun':
      return percentRank(a.sunPct) - percentRank(b.sunPct);
    case 'earth':
      return percentRank(a.earthPct) - percentRank(b.earthPct);
    case 'both':
      return percentRank(a.bothPct) - percentRank(b.bothPct);
    case 'dark':
      return darkCmp(a, b);
  }
}

/** Sorts by a column; equal values fall back to the default ranking. The direction flips the column only. */
export function sortRows(rows: readonly RankRow[], key: SortKey, dir: SortDir): RankRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * primary(key, a, b) || compareDefault(a, b));
}

/** Position (1-based) of each site in the default ranking. */
export function rankNumbers(rows: readonly RankRow[]): Map<string, number> {
  return new Map(rankOrder(rows).map((r, i) => [r.siteId, i + 1]));
}

/** Plain verdict about the top row, with a caution when it has a dark period. Empty with no rows. */
export function rankVerdict(rows: readonly RankRow[]): string {
  const order = rankOrder(rows);
  if (order.length === 0) return '';
  const top = order[0];
  const pct = formatPercent(top.bothPct);
  const sameBoth = order.slice(1).filter((r) => percentRank(r.bothPct) === percentRank(top.bothPct));
  let text = `${top.name} has the most time with both sunlight and Earth in view: ${pct}`;
  if (sameBoth.length === 0) {
    text += '.';
  } else {
    const darkBroke = sameBoth.some((r) => darkCmp(top, r) !== 0);
    const others = sameBoth.length === 1 ? sameBoth[0].name : `${sameBoth.length} other sites`;
    text += `, level with ${others}.`;
    if (darkBroke) {
      text += ` It is listed first because its longest dark period is shorter (${formatLongestDark(top.darkHours, top.darkClipped)}).`;
    }
  }
  if (top.darkHours > 0) {
    text += ` But it has a dark period of ${formatLongestDark(top.darkHours, top.darkClipped)}.`;
    const rest = order.slice(1);
    const noDark = rest.find((r) => r.darkHours <= 0);
    if (noDark) {
      text += ` The best site with no dark period is ${noDark.name}: ${formatPercent(noDark.bothPct)} both at once.`;
    } else if (rest.length > 0) {
      const shortest = [...rest].sort(darkCmp)[0];
      if (darkCmp(shortest, top) < 0) {
        text += ` The site with the shortest dark period is ${shortest.name} (${formatLongestDark(shortest.darkHours, shortest.darkClipped)}): ${formatPercent(shortest.bothPct)} both at once.`;
      }
    }
  }
  return text;
}
