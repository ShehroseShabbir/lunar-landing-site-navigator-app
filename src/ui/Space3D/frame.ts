// Pure geometry for the space view (S17). No three, React or DOM.
//
// World frame: the Moon's body-fixed mean-Earth (ME) frame of src/state/space.types.ts, mapped to
// three's y-up axes as
//     three x = ME x (0° N 0° E),   three y = ME z (north pole, "up"),   three z = −ME y (90° W).
// That is a proper rotation (det +1), so handedness is kept. The Moon's centre is the origin and
// 1 world unit = 1 Moon radius. Earth-fixed vectors use the same axis mapping before being rotated.

import type { Mat3, SpaceGeometry, Vec3 } from '../../state/space.types';

const DEG = Math.PI / 180;

/** ME vector → three world vector. */
export function meToThree(v: Vec3): Vec3 {
  return [v[0], v[2], -v[1]];
}

/** Row-major 3x3 · vector. */
export function mat3Apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * A rotation given in ME axes (v_me = M · v_src, both sides in the ME-style axis order) expressed
 * in three axes: P · M · Pᵀ with P the meToThree permutation. Row-major.
 */
export function mat3MeToThree(m: Mat3): Mat3 {
  // P rows: [1,0,0], [0,0,1], [0,−1,0]. (P M Pᵀ)[i][j] = Σ P[i][a] M[a][b] P[j][b].
  const M = (r: number, c: number) => m[r * 3 + c];
  // Row i of P picks (index, sign): 0 → (0,+), 1 → (2,+), 2 → (1,−).
  const pick: [number, number][] = [
    [0, 1],
    [2, 1],
    [1, -1],
  ];
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) out[i * 3 + j] = pick[i][1] * pick[j][1] * M(pick[i][0], pick[j][0]);
  return out as Mat3;
}

/**
 * Horizontal texture offset (three `Texture.offset.x`, RepeatWrapping) that puts an equirectangular
 * image whose left edge is at `lonAtLeftEdgeDeg` (east-positive) on a three SphereGeometry in this
 * frame. SphereGeometry's u = 0 sits at longitude −180° and u grows eastward (u = 0.5 at 0°), so
 * the image sample for geometry longitude g is u_img = (g − L) / 360 = u + (−180 − L) / 360.
 */
export function textureOffsetU(lonAtLeftEdgeDeg: number): number {
  const o = (-180 - lonAtLeftEdgeDeg) / 360;
  const r = o - Math.floor(o);
  return r === 1 ? 0 : r;
}

/** Unit direction for a selenographic latitude and east-positive longitude, in ME axes. */
export function latLonToMe(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** three bumpScale for the LOLA height map: relief is exaggerated for visibility (said in the credits). */
export const MOON_BUMP_SCALE = 3;

// --- layout: where the bodies sit in the scene ---------------------------------------------------

export type ScaleMode = 'compressed' | 'true';

/** Default Earth centre distance in Moon radii; the real one is about 221 (labelled "not to scale"). */
export const COMPRESSED_EARTH_RADII = 12;
/** The Sun is never drawn at its distance or size: it sits this many Earth distances out. */
export const SUN_EARTH_DISTANCES = 4;

export interface Radii {
  moon: number;
  earth: number;
}

export interface Layout {
  mode: ScaleMode;
  /** Earth centre (three world, Moon radii) and radius (true ratio to the Moon in both modes). */
  earthPos: Vec3;
  earthR: number;
  earthDist: number;
  /** Sun glow position (three world, always compressed). */
  sunPos: Vec3;
  sunDist: number;
}

/** Earth along earthDirMe at a compressed (default) or true distance; sizes are true in both modes. */
export function layoutBodies(g: Pick<SpaceGeometry, 'earthDirMe' | 'sunDirMe' | 'earthDistKm'>, mode: ScaleMode, radiiKm: Radii): Layout {
  const earthDist = mode === 'true' ? g.earthDistKm / radiiKm.moon : COMPRESSED_EARTH_RADII;
  const sunDist = SUN_EARTH_DISTANCES * earthDist;
  return {
    mode,
    earthPos: scale(meToThree(unit(g.earthDirMe)), earthDist),
    earthR: radiiKm.earth / radiiKm.moon,
    earthDist,
    sunPos: scale(meToThree(unit(g.sunDirMe)), sunDist),
    sunDist,
  };
}

// --- zoom levels ---------------------------------------------------------------------------------

export type ZoomLevel = 'moon' | 'system' | 'sun';
export const LEVELS: readonly ZoomLevel[] = ['moon', 'system', 'sun'];

/** Camera distance from the Moon's centre at the "Moon from orbit" home view. */
export const MOON_HOME_DIST = 5;
/** Closest approach at the Moon level; zooming in further (site facing) returns to the surface. */
export const MOON_MIN_DIST = 1.3;
/** Farthest the Moon level goes; beyond it the view snaps to the Earth–Moon level. */
export const MOON_MAX_DIST = 8;
/** The site counts as facing the camera within this angle of the view direction. */
export const SITE_FACING_DEG = 45;

export interface Pose {
  target: Vec3;
  eye: Vec3;
}

export interface LevelLimits {
  min: number;
  max: number;
}

/**
 * Home view direction (three world) for a site: straight over it, with the latitude clamped to
 * ±50° so polar sites are seen obliquely with north up (OrbitControls cannot sit on the pole).
 */
export function homeDir(siteDirMe: Vec3): Vec3 {
  const s = unit(siteDirMe);
  const lat = Math.asin(Math.max(-1, Math.min(1, s[2]))) / DEG;
  const lon = Math.atan2(s[1], s[0]) / DEG;
  return meToThree(latLonToMe(Math.max(-50, Math.min(50, lat)), lon));
}

/** Unit vector perpendicular to `axis`, as close as possible to `prefer` (falls back to world up). */
export function perpendicularTo(axis: Vec3, prefer: Vec3): Vec3 {
  const a = unit(axis);
  const p = sub(prefer, scale(a, dot(prefer, a)));
  if (len(p) > 1e-3) return unit(p);
  const up: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return unit(cross(cross(a, up), a));
}

/** Distance that fits a sphere of radius r round the target into the smaller half field of view. */
export function fitDistance(r: number, minHalfFovDeg: number): number {
  return r / Math.tan(0.8 * minHalfFovDeg * DEG);
}

/** Home distance at the Moon level: the Moon fills most of the free view, clamped to the level's range. */
export function moonHomeDist(minHalfFovDeg: number): number {
  return Math.max(MOON_HOME_DIST, Math.min(MOON_MAX_DIST - 0.5, fitDistance(1.25, minHalfFovDeg)));
}

/** Camera pose for a level, looking from the site's side of the Moon. */
export function levelPose(level: ZoomLevel, layout: Layout, siteDirMe: Vec3, minHalfFovDeg: number): Pose {
  const home = homeDir(siteDirMe);
  if (level === 'moon') return { target: [0, 0, 0], eye: scale(home, moonHomeDist(minHalfFovDeg)) };
  if (level === 'system') {
    const target = scale(layout.earthPos, 0.5);
    const d = fitDistance(layout.earthDist / 2 + layout.earthR + 1, minHalfFovDeg);
    return { target, eye: add(target, scale(perpendicularTo(layout.earthPos, home), d)) };
  }
  const target = scale(layout.sunPos, 0.5);
  const d = fitDistance(layout.sunDist / 2 + layout.earthR + 1, minHalfFovDeg);
  return { target, eye: add(target, scale(perpendicularTo(layout.sunPos, home), d)) };
}

/** OrbitControls dolly limits per level (distance from the level's target). */
export function levelLimits(level: ZoomLevel, layout: Layout, minHalfFovDeg: number): LevelLimits {
  if (level === 'moon') return { min: MOON_MIN_DIST, max: MOON_MAX_DIST };
  const home = levelPose(level, layout, [1, 0, 0], minHalfFovDeg);
  const d = len(sub(home.eye, home.target));
  return { min: d * 0.55, max: d * 1.8 };
}

export function nextLevel(level: ZoomLevel, dir: 1 | -1): ZoomLevel | 'surface' | null {
  const i = LEVELS.indexOf(level) - dir;
  if (i < 0) return 'surface';
  return i < LEVELS.length ? LEVELS[i] : null;
}

/** True when the site is on the camera's side of the Moon and within SITE_FACING_DEG of the view axis. */
export function siteFacing(eye: Vec3, siteDirMe: Vec3): boolean {
  return dot(unit(eye), meToThree(unit(siteDirMe))) >= Math.cos(SITE_FACING_DEG * DEG);
}

/** True when a surface point (unit direction, three world) on the Moon faces the camera. */
export function surfacePointVisible(eye: Vec3, dirThree: Vec3): boolean {
  return dot(dirThree, sub(eye, dirThree)) > 0;
}

/** True when the segment eye → point passes through the sphere (centre c, radius r) before reaching the point. */
export function segmentHitsSphere(eye: Vec3, point: Vec3, c: Vec3, r: number): boolean {
  const d = sub(point, eye);
  const L = len(d);
  if (L === 0) return false;
  const u = scale(d, 1 / L);
  const tc = dot(sub(c, eye), u);
  if (tc <= 0 || tc >= L) return false;
  const closest = add(eye, scale(u, tc));
  return len(sub(closest, c)) < r;
}

/** Projection centre shift (px) so the scene centres in the area the chrome leaves free. */
export function centreOffset(safe: { left: number; right: number; top: number; bottom: number }): { x: number; y: number } {
  return { x: (safe.left - safe.right) / 2, y: (safe.top - safe.bottom) / 2 };
}

/** Base vertical field of view (degrees) of the space camera. */
export const SPACE_FOV_DEG = 35;

/**
 * Vertical FOV for an aspect ratio: 35° on landscape screens; on portrait ones it widens so the
 * horizontal view stays 35° (capped at 75°), and the Moon fits a phone's width.
 */
export function vfovFor(aspect: number): number {
  if (!(aspect > 0) || aspect >= 1) return SPACE_FOV_DEG;
  const half = Math.atan(Math.tan((SPACE_FOV_DEG / 2) * DEG) / aspect);
  return Math.min(75, (2 * half) / DEG);
}

/** Ease-out cubic for camera tweens (unused under prefers-reduced-motion). */
export function easeOut(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return 1 - (1 - c) ** 3;
}

export const vec = { dot, add, sub, scale, len, cross };
