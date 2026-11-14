// Camera rule for the 3D hero (visual-spec v5 section 5). Pure: no three, React or DOM.
// Positions are local ENU metres at the site: e = east, n = north, u = up.

export const HOME = {
  /** Horizontal distance from the site, behind it as seen along the view yaw. */
  distM: 8000,
  /** Height above the site's ground. */
  heightM: 2300,
  pitchDeg: -7,
  /** Never closer than this to the ground under the camera. */
  clearanceM: 150,
  hfovWideDeg: 84,
  hfovNarrowDeg: 70,
  maxVfovDeg: 75,
  /** Sun and Earth both framed when they are at most this share of the horizontal FOV apart. */
  frameShare: 0.8,
} as const;

export interface Enu {
  e: number;
  n: number;
  u: number;
}

export interface SafeArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function normDeg(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Signed shortest turn from a to b, in (-180, 180]. */
export function angDiffDeg(a: number, b: number): number {
  const d = normDeg(b - a);
  return d > 180 ? d - 360 : d;
}

/** Circular mean of azimuths (deg); null for an empty list or when they cancel out. */
export function circularMeanDeg(azs: readonly number[]): number | null {
  let s = 0;
  let c = 0;
  for (const a of azs) {
    const r = (a * Math.PI) / 180;
    s += Math.sin(r);
    c += Math.cos(r);
  }
  if (azs.length === 0 || Math.hypot(s, c) < 1e-9 * azs.length) return null;
  return normDeg((Math.atan2(s, c) * 180) / Math.PI);
}

/**
 * Home yaw: the mean of Earth's 30-day mean azimuth and the Sun's azimuth now, when both fit
 * in the view; otherwise Earth's mean azimuth (Earth barely moves at the pole, the Sun circles).
 */
export function homeYawDeg(earthMeanAz: number | null, sunAz: number | null, hfovDeg: number): number {
  if (earthMeanAz === null && sunAz === null) return 0;
  if (earthMeanAz === null) return normDeg(sunAz as number);
  if (sunAz === null) return normDeg(earthMeanAz);
  const d = angDiffDeg(earthMeanAz, sunAz);
  return Math.abs(d) <= HOME.frameShare * hfovDeg ? normDeg(earthMeanAz + d / 2) : normDeg(earthMeanAz);
}

/**
 * Camera eye and orbit target for the home view: HOME.distM behind the site along the yaw,
 * HOME.heightM above the site ground (or HOME.clearanceM above the ground under the eye),
 * looking at the yaw with HOME.pitchDeg. The target sits above the site, so orbiting circles it.
 */
export function homePose(
  yawDeg: number,
  siteGroundM: number,
  groundAt: (e: number, n: number) => number | null,
): { eye: Enu; target: Enu } {
  const y = (yawDeg * Math.PI) / 180;
  const e = -HOME.distM * Math.sin(y);
  const n = -HOME.distM * Math.cos(y);
  const g = groundAt(e, n);
  const u = Math.max(siteGroundM + HOME.heightM, g === null ? -Infinity : g + HOME.clearanceM);
  const drop = HOME.distM * Math.tan((-HOME.pitchDeg * Math.PI) / 180);
  return { eye: { e, n, u }, target: { e: 0, n: 0, u: u - drop } };
}

/** Horizontal FOV for a viewport aspect (w / h): wide on landscape, narrower on portrait. */
export function hfovFor(aspect: number): number {
  return aspect >= 1 ? HOME.hfovWideDeg : HOME.hfovNarrowDeg;
}

/**
 * Horizontal FOV across the whole canvas that puts `hfovDeg` across the part the chrome leaves free
 * (`visibleW` of `canvasW` px), so the framing is judged on what the user can see.
 */
export function canvasHfovDeg(hfovDeg: number, canvasW: number, visibleW: number): number {
  const vis = Math.min(canvasW, Math.max(visibleW, canvasW * 0.3));
  const t = Math.tan((hfovDeg * Math.PI) / 360) * (canvasW / vis);
  return (2 * Math.atan(t) * 180) / Math.PI;
}

/** Vertical FOV (deg) giving `hfovDeg` across the width, capped so portrait screens don't fish-eye. */
export function vfovDeg(hfovDeg: number, aspect: number, maxDeg: number = HOME.maxVfovDeg): number {
  const h = (hfovDeg * Math.PI) / 360;
  const v = (2 * Math.atan(Math.tan(h) / Math.max(aspect, 1e-6)) * 180) / Math.PI;
  return Math.min(v, maxDeg);
}

/** Screen shift (px) of the view centre so the scene centres in the area the chrome leaves free. */
export function viewCentreOffset(safe: SafeArea): { x: number; y: number } {
  return { x: (safe.left - safe.right) / 2, y: (safe.top - safe.bottom) / 4 };
}

/** Camera height kept above the ground under it. */
export function clampAboveGround(u: number, ground: number | null): number {
  return ground === null ? u : Math.max(u, ground + HOME.clearanceM);
}
