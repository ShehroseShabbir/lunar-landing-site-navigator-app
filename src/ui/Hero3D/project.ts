// Screen projection and path/label placement for the 3D hero. Pure: no three, React or DOM.
// Sky objects are directions (at infinity); a point is placed on a sphere of radius R round the camera.

import type { PathRun, RunState } from '../../state/skyPaths';
import { azElToThree, type Vec3 } from '../Scene3D/mapping';

export interface ScreenPt {
  x: number;
  y: number;
  /** In front of the camera. */
  front: boolean;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Elevation drawn in the sky: true angles (scale 1) or stretched (scale 3), kept inside (-89.9, 89.9). */
export function skyEl(elDeg: number, scale: number): number {
  return Math.max(-89.9, Math.min(89.9, elDeg * scale));
}

/** Three-space point on the sky sphere of radius r for a body at (az, el), with the sky scale applied. */
export function skyPoint(azDeg: number, elDeg: number, scale: number, r: number): Vec3 {
  const d = azElToThree(azDeg, skyEl(elDeg, scale));
  return [d[0] * r, d[1] * r, d[2] * r];
}

/**
 * Projects a three-space point with a column-major 4x4 view-projection matrix (three's
 * Matrix4.elements) to CSS pixels in a w x h viewport (origin top-left).
 */
export function projectToScreen(m: ArrayLike<number>, p: Vec3, w: number, h: number): ScreenPt {
  const [x, y, z] = p;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!(cw > 1e-6)) return { x: NaN, y: NaN, front: false };
  return { x: ((cx / cw + 1) / 2) * w, y: ((1 - cy / cw) / 2) * h, front: true };
}

export interface StyledLine {
  state: RunState;
  pts: [number, number][];
}

/**
 * Screen polylines for path runs. A run is cut where a point falls behind the camera,
 * and pieces with fewer than two points are dropped.
 */
export function projectRuns(
  runs: readonly PathRun[],
  project: (azDeg: number, elDeg: number) => ScreenPt,
): StyledLine[] {
  const out: StyledLine[] = [];
  for (const run of runs) {
    let cur: [number, number][] = [];
    for (const p of run.points) {
      const s = project(p.azDeg, p.elDeg);
      if (!s.front) {
        if (cur.length > 1) out.push({ state: run.state, pts: cur });
        cur = [];
        continue;
      }
      cur.push([s.x, s.y]);
    }
    if (cur.length > 1) out.push({ state: run.state, pts: cur });
  }
  return out;
}

export function insideRect(p: ScreenPt, r: Rect, margin = 0): boolean {
  return (
    p.front &&
    p.x >= r.left + margin &&
    p.x <= r.right - margin &&
    p.y >= r.top + margin &&
    p.y <= r.bottom - margin
  );
}

/**
 * Index of the point to hang a path label on: the middle one of the points (in path order)
 * that are on screen with a margin and outside `avoid` (the body's own label area), preferring
 * points where the body is visible. Null when none.
 */
export function pickPathAnchor(
  pts: readonly { s: ScreenPt; visible: boolean }[],
  r: Rect,
  margin = 60,
  avoid: { x: number; y: number; r: number } | null = null,
): number | null {
  const on: number[] = [];
  const onVisible: number[] = [];
  pts.forEach((p, i) => {
    if (!insideRect(p.s, r, margin)) return;
    if (avoid && Math.hypot(p.s.x - avoid.x, p.s.y - avoid.y) < avoid.r) return;
    on.push(i);
    if (p.visible) onVisible.push(i);
  });
  const pool = onVisible.length > 0 ? onVisible : on;
  return pool.length > 0 ? pool[Math.floor(pool.length / 2)] : null;
}

export interface LabelBox {
  /** Top-left of the label box (px). */
  x: number;
  y: number;
  /** Where the leader line meets the label (px). */
  attachX: number;
  attachY: number;
}

/**
 * Places a leader-line label: the box starts at anchor + offset (its left edge, or its right edge
 * when `alignRight`), vertically centred there, then clamped so the whole box stays inside `r`.
 */
export function placeLabel(
  anchor: { x: number; y: number },
  offset: { dx: number; dy: number },
  size: { w: number; h: number },
  r: Rect,
  alignRight: boolean,
): LabelBox {
  const ax = anchor.x + offset.dx;
  const ay = anchor.y + offset.dy;
  let x = alignRight ? ax - size.w : ax;
  let y = ay - size.h / 2;
  x = Math.min(Math.max(x, r.left), Math.max(r.left, r.right - size.w));
  y = Math.min(Math.max(y, r.top), Math.max(r.top, r.bottom - size.h));
  const attachX = alignRight ? x + size.w : x;
  return { x, y, attachX, attachY: y + size.h / 2 };
}

/** Rectangle of the viewport left free by the chrome, shrunk by a margin. */
export function freeRect(w: number, h: number, safe: { left: number; right: number; top: number; bottom: number }, margin = 8): Rect {
  return {
    left: safe.left + margin,
    top: safe.top + margin,
    right: w - safe.right - margin,
    bottom: h - safe.bottom - margin,
  };
}

/** Pixels per degree at the view centre for a vertical FOV and viewport height. */
export function pxPerDeg(vfovDeg: number, heightPx: number): number {
  const f = heightPx / 2 / Math.tan((vfovDeg * Math.PI) / 360);
  return f * Math.tan(Math.PI / 180);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when two label boxes overlap or come closer than `pad` px. */
export function boxesOverlap(a: Box, b: Box, pad = 4): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

/** Width kept clear of labels at the right edge for the icon column. */
export const ICON_COLUMN_PX = 60;
