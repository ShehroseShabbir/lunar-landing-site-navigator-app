// Terrain horizon lookup and visible disc fraction (plan.md section 3, DR-HACK-10).

import type { HorizonProfile } from './types';

/**
 * Terrain horizon elevation (deg) at an azimuth (deg, clockwise from north).
 * Returns 0 for a null profile (smooth-Moon horizon). Linear interpolation between samples,
 * wrapping around 360 deg. Always call it with the body CENTRE's azimuth.
 */
export function horizonElevAt(profile: HorizonProfile | null, azDeg: number): number {
  if (profile === null) return 0;
  const n = profile.elevDeg.length;
  if (n === 0 || !(profile.azStepDeg > 0)) return 0;
  let x = (azDeg - profile.az0) / profile.azStepDeg;
  x = ((x % n) + n) % n;
  const i0 = Math.floor(x);
  const f = x - i0;
  const a = profile.elevDeg[i0 % n];
  const b = profile.elevDeg[(i0 + 1) % n];
  return a + f * (b - a);
}

/**
 * Fraction (0..1) of a body's disc above a horizontal horizon line, by circular-segment area.
 * elDeg: disc-centre elevation; horizonElDeg: horizon elevation at the centre's azimuth;
 * angDiamDeg: apparent diameter. Centre exactly on the horizon gives 0.5.
 */
export function visibleFraction(elDeg: number, horizonElDeg: number, angDiamDeg: number): number {
  const d = elDeg - horizonElDeg;
  const r = angDiamDeg / 2;
  if (!(r > 0)) return d > 0 ? 1 : d < 0 ? 0 : 0.5;
  if (d >= r) return 1;
  if (d <= -r) return 0;
  const x = d / r;
  // Area below the line, as a fraction of the disc, is (acos(x) - x*sqrt(1 - x^2)) / pi.
  const below = (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
  return Math.min(1, Math.max(0, 1 - below));
}
