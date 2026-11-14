// Time rules (plan.md section 2): rangeStart = start of the 30-day window, t = playhead inside it.

export const RANGE_DAYS = 30;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export interface TimeState {
  rangeStart: Date;
  t: Date;
}

export function roundToHour(d: Date): Date {
  return new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);
}

export function rangeEnd(rangeStart: Date): Date {
  return new Date(rangeStart.getTime() + RANGE_DAYS * DAY_MS);
}

/** Date/time inputs, "Now", compare slip: new window, playhead at its start. */
export function setRangeStart(d: Date): TimeState {
  return { rangeStart: d, t: d };
}

/**
 * Move the playhead. If it leaves rangeStart ... rangeStart + 30 d (inclusive),
 * the window moves: forward, a new window starts at t; backward, the window ends at t
 * (so repeated back steps do not re-anchor the scan every click).
 */
export function setT(state: TimeState, t: Date): TimeState {
  const ms = t.getTime();
  const start = state.rangeStart.getTime();
  if (ms < start) return { rangeStart: new Date(ms - RANGE_DAYS * DAY_MS), t };
  if (ms > start + RANGE_DAYS * DAY_MS) return { rangeStart: t, t };
  return { rangeStart: state.rangeStart, t };
}

export function stepT(state: TimeState, deltaMs: number): TimeState {
  return setT(state, new Date(state.t.getTime() + deltaMs));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `2027-03-14` (UTC) */
export function toDateInput(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `06:00` (UTC) */
export function toTimeInput(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Parse the two input strings as UTC. Null if either is empty or invalid. */
export function fromInputs(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, da, h, mi] = [dm[1], dm[2], dm[3], tm[1], tm[2]].map(Number);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  if (y < 1900 || y > 2100) return null;
  const d = new Date(0);
  d.setUTCFullYear(y, mo - 1, da);
  d.setUTCHours(h, mi, 0, 0);
  if (d.getUTCMonth() !== mo - 1) return null; // e.g. 31 Feb rolled over
  return d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `14 Mar 2027 06:00 UTC` */
export function formatUtc(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${toTimeInput(d)} UTC`;
}
