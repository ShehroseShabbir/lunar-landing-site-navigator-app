// Pure timeline geometry: no DOM, no astronomy. Times are epoch milliseconds.
import type { VisWindow } from '../../astro/types';

export interface Axis {
  startMs: number;
  spanMs: number;
  x0: number;
  x1: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Time to x, clamped to the plot area. */
export function timeToX(ms: number, a: Axis): number {
  const f = clamp((ms - a.startMs) / a.spanMs, 0, 1);
  return a.x0 + f * (a.x1 - a.x0);
}

/** x to time, clamped to the range (so the playhead never leaves the scanned window). */
export function xToTime(x: number, a: Axis): number {
  const f = clamp((x - a.x0) / (a.x1 - a.x0), 0, 1);
  return a.startMs + f * a.spanMs;
}

export interface Rect {
  x: number;
  width: number;
}

/** Window to a horizontal rectangle, clipped to the axis, at least `minWidth` wide so short windows stay visible. */
export function windowRect(w: Pick<VisWindow, 'start' | 'end'>, a: Axis, minWidth = 2): Rect {
  const xa = timeToX(w.start.getTime(), a);
  const xb = timeToX(w.end.getTime(), a);
  const width = Math.max(minWidth, xb - xa);
  return { x: Math.min(xa, a.x1 - width), width };
}

/** Intersection of two sorted window lists as [startMs, endMs] pairs (zero-length overlaps dropped). */
export function overlap(a: VisWindow[], b: VisWindow[]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start.getTime(), b[j].start.getTime());
    const e = Math.min(a[i].end.getTime(), b[j].end.getTime());
    if (e > s) out.push([s, e]);
    if (a[i].end.getTime() < b[j].end.getTime()) i++;
    else j++;
  }
  return out;
}

/** Window whose bar contains x, or null. */
export function windowAtX(ws: VisWindow[], x: number, a: Axis): VisWindow | null {
  for (const w of ws) {
    const r = windowRect(w, a);
    if (x >= r.x && x <= r.x + r.width) return w;
  }
  return null;
}

/** `2 d 20 h`, `5 h 10 min`, `42 min`. */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

/**
 * Parts of `a` not covered by `b` (both sorted). A piece keeps a clipped flag only where it
 * still touches the original window's clipped edge; edges cut by `b` are real boundaries.
 */
export function subtractWindows(a: VisWindow[], b: VisWindow[]): VisWindow[] {
  const out: VisWindow[] = [];
  for (const w of a) {
    const ws = w.start.getTime();
    const we = w.end.getTime();
    let cur = ws;
    for (const c of b) {
      const cs = c.start.getTime();
      const ce = c.end.getTime();
      if (ce <= cur) continue;
      if (cs >= we) break;
      if (cs > cur) {
        out.push({ ...w, start: new Date(cur), end: new Date(cs), clippedStart: cur === ws && w.clippedStart, clippedEnd: false });
      }
      cur = Math.max(cur, ce);
      if (cur >= we) break;
    }
    if (cur < we) {
      out.push({ ...w, start: new Date(cur), end: w.end, clippedStart: cur === ws && w.clippedStart, clippedEnd: w.clippedEnd });
    }
  }
  return out;
}
