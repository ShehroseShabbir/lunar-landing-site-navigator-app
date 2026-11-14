// Pure formatting for the metrics panel (ui-spec section 6.1). No astronomy here.
import type { ScanResult, SiteMetrics } from '../../astro/types';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const REFINE_MS = 60_000;
export const RANGE_LIMIT_DAYS = 30;
const MINUS = '−';

/** "3 d 4 h", "2 d", "9 h 20 min", "45 min", "< 1 min", "≥ 30 d". Days drop minutes; otherwise largest two units. */
export function formatDuration(ms: number): string {
  if (ms >= RANGE_LIMIT_DAYS * DAY_MS) return '≥ 30 d';
  const total = Math.floor(Math.max(0, ms) / MIN_MS);
  if (total < 1) return '< 1 min';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  return parts.join(' ');
}

/** Duration from t to a crossing, or null when there is no crossing. */
export function countdown(t: Date, to: Date | null): string | null {
  return to ? formatDuration(to.getTime() - t.getTime()) : null;
}

/** Longest dark period, from hours; "≥ " prefix when clipped by a range edge. */
export function formatLongestDark(hours: number, clipped: boolean): string {
  if (hours <= 0) return 'No dark period';
  const text = formatDuration(hours * HOUR_MS);
  return clipped && !text.startsWith('≥') ? `≥ ${text}` : text;
}

/** Integer percent. Exact 0 and 100 are kept; other values never round to those. */
export function formatPercent(value: number): string {
  if (value <= 0) return '0%';
  if (value < 1) return '< 1%';
  if (value >= 100) return '100%';
  return `${Math.min(99, Math.round(value))}%`;
}

/** Disk fraction 0..1 as a percent string. */
export function formatFraction(fraction: number): string {
  return formatPercent(fraction * 100);
}

/** Degrees, one decimal, true minus sign. */
export function formatDeg(deg: number): string {
  const r = Math.round(deg * 10) / 10;
  if (r === 0) return '0.0°';
  return `${r < 0 ? MINUS : ''}${Math.abs(r).toFixed(1)}°`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number): string => String(n).padStart(2, '0');

/** "14 Mar 2027 06:00 UTC" */
export function formatUtc(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}

export interface Chip {
  ok: boolean;
  text: string;
}
export function powerChip(ok: boolean): Chip {
  return { ok, text: ok ? 'Power OK' : 'Power not OK' };
}
export function commsChip(ok: boolean): Chip {
  return { ok, text: ok ? 'Comms OK' : 'Comms not OK' };
}

export interface Row {
  label: string;
  value: string;
}

/** "Sets in" / "Rises in" row (limb rule: sunUp / earthVisible). A null date means no crossing in 30 d. */
export function riseSetRow(up: boolean, t: Date, nextSet: Date | null, nextRise: Date | null): Row {
  if (up) {
    const c = countdown(t, nextSet);
    return { label: 'Sets in', value: c ?? 'Does not set in the next 30 d' };
  }
  const c = countdown(t, nextRise);
  return { label: 'Rises in', value: c ?? 'Does not rise in the next 30 d' };
}

type OkWindows = ScanResult['powerOk'];

/**
 * "Power OK for another" / "Power OK in" / "Power not OK in range" (and the Comms equivalents).
 * `ends` is the end of the current OK window; `windows` is the scan's list for the same state,
 * used only to find the next start when not OK now.
 */
export function okRow(kind: 'Power' | 'Comms', ok: boolean, t: Date, ends: Date | null, windows: OkWindows | null): Row {
  if (ok) {
    return { label: `${kind} OK for another`, value: countdown(t, ends) ?? '≥ 30 d' };
  }
  const tMs = t.getTime();
  const next = windows?.find((w) => w.start.getTime() > tMs - REFINE_MS);
  if (next) return { label: `${kind} OK in`, value: formatDuration(Math.max(0, next.start.getTime() - tMs)) };
  return { label: `${kind} not OK in range`, value: '' };
}

export interface MetricsView {
  sun: Row[];
  earth: Row[];
  tiles: Row[];
  note: string | null;
}

export function buildView(m: SiteMetrics, t: Date, scan: ScanResult | null): MetricsView {
  const sunUp = m.sun.visibleFraction > 0;
  const sun: Row[] = [
    { label: 'Elevation above terrain', value: formatDeg(m.sun.aboveHorizonDeg) },
    { label: 'Visible disk', value: formatFraction(m.sun.visibleFraction) },
    riseSetRow(sunUp, t, m.sun.nextSet, m.sun.nextRise),
    okRow('Power', m.sun.powerOk, t, m.sun.powerOkEnds, scan?.powerOk ?? null),
  ];
  const earth: Row[] = [
    { label: 'Elevation above terrain', value: formatDeg(m.earth.aboveHorizonDeg) },
    riseSetRow(m.earth.visible, t, m.earth.nextSet, m.earth.nextRise),
    okRow('Comms', m.earth.commsOk, t, m.earth.commsOkEnds, scan?.commsOk ?? null),
  ];
  const tiles: Row[] = [
    { label: 'Power OK', value: formatPercent(m.pctPowerOk) },
    { label: 'Comms OK', value: formatPercent(m.pctCommsOk) },
    { label: 'Both OK', value: formatPercent(m.pctBoth) },
    { label: 'Longest dark period', value: formatLongestDark(m.longestDarkHours, m.longestDarkClipped) },
  ];
  const note = m.pctEarthVisible <= 0 ? 'Earth is below the terrain horizon for the whole range.' : null;
  return { sun, earth, tiles, note };
}
