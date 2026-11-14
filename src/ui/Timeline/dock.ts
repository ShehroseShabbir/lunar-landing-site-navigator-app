// Pure helpers for the time dock readout. No astronomy.
import { DAY_MS, RANGE_DAYS } from '../../state/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Nov" (UTC). */
export function dayMonth(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "20 Nov 2026 · 00:00 UTC" */
export function dockTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dayMonth(d)} ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 November 2026, 00:00 UTC" (screen-reader time). */
export function longUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** 1-based day of the 30-day range that `t` falls in, clamped to 1..total. */
export function dayOfRange(t: Date, rangeStart: Date, total = RANGE_DAYS): number {
  const day = Math.floor((t.getTime() - rangeStart.getTime()) / DAY_MS) + 1;
  return Math.min(total, Math.max(1, day));
}
