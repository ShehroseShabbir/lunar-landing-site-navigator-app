// Mesh arrays for the 3D hero: terrain grids, the skyline band and the starfield. Pure: no three, React or DOM.

import { horizonElevAt } from '../../astro/horizon';
import type { HorizonProfile } from '../../astro/types';
import type { TerrainTile } from '../Scene3D/terrain';
import { azElToThree, enuToThree } from '../Scene3D/mapping';
import { skyEl } from './project';

/** Bilinear ground height (m) at east/north (m) from the site; null outside the tile. */
export function heightAt(tile: TerrainTile, east: number, north: number): number | null {
  const { size, halfWidthM } = tile.meta;
  const step = (2 * halfWidthM) / (size - 1);
  const c = (east + halfWidthM) / step;
  const r = (halfWidthM - north) / step;
  if (!(c >= 0 && r >= 0 && c <= size - 1 && r <= size - 1)) return null;
  const c0 = Math.min(Math.floor(c), size - 2);
  const r0 = Math.min(Math.floor(r), size - 2);
  const fc = c - c0;
  const fr = r - r0;
  const h = tile.heights;
  const i = r0 * size + c0;
  const top = h[i] * (1 - fc) + h[i + 1] * fc;
  const bot = h[i + size] * (1 - fc) + h[i + size + 1] * fc;
  return top * (1 - fr) + bot * fr;
}

export interface GridArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Vertex positions (three coordinates, y up) and triangle indices for a terrain tile.
 * `dropM` lowers every vertex; cells lying wholly inside the square |e|, |n| < holeHalfM are left out
 * (the wide context tile under the near tile).
 */
export function gridArrays(tile: TerrainTile, opts: { dropM?: number; holeHalfM?: number } = {}): GridArrays {
  const { size, halfWidthM } = tile.meta;
  const drop = opts.dropM ?? 0;
  const hole = opts.holeHalfM ?? 0;
  const step = (2 * halfWidthM) / (size - 1);
  const positions = new Float32Array(size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      positions.set(enuToThree(-halfWidthM + c * step, halfWidthM - r * step, tile.heights[i] - drop), i * 3);
    }
  }
  const inHole = (r: number, c: number) =>
    Math.abs(-halfWidthM + c * step) < hole && Math.abs(halfWidthM - r * step) < hole;
  const idx: number[] = [];
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      if (hole > 0 && inHole(r, c) && inHole(r, c + 1) && inHole(r + 1, c) && inHole(r + 1, c + 1)) continue;
      const a = r * size + c;
      const b = a + 1;
      const d = a + size;
      const e = d + 1;
      // Counter-clockwise seen from above (+y).
      idx.push(a, d, b, b, d, e);
    }
  }
  return { positions, indices: Uint32Array.from(idx) };
}

/** sRGB 0..1 colours of the skyline band (visual-spec v5 placeholder ground). */
export const BAND = {
  rimBase: 0.1,
  rimSun: 0.1,
  under: [34 / 255, 35 / 255, 39 / 255] as const,
  deep: [22 / 255, 23 / 255, 26 / 255] as const,
  /** Ring elevations below the skyline (deg): rim, under, deep; then straight down. */
  offsets: [0, -0.5, -6] as const,
  bottomDeg: -89.5,
};

export interface BandArrays {
  positions: Float32Array;
  /** sRGB 0..1, three per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Skyline ring only (closed loop), for the thin horizon line. */
  line: Float32Array;
}

/**
 * The far terrain as seen from the site: a band from the horizon profile's elevation down to the
 * nadir, on a sphere of radius `radius`, at true angles (or stretched by `scale`). Azimuths facing
 * the Sun get a slight rim brightness when the Sun is not far below the horizon.
 * A null profile draws the smooth-Moon horizon (0 deg).
 */
export function skylineBand(
  profile: HorizonProfile | null,
  scale: number,
  sun: { azDeg: number; elDeg: number } | null,
  radius: number,
): BandArrays {
  const n = profile && profile.elevDeg.length > 0 && profile.azStepDeg > 0 ? profile.elevDeg.length : 720;
  const az0 = profile && n === profile.elevDeg.length ? profile.az0 : 0;
  const stepDeg = 360 / n;
  const rings = BAND.offsets.length + 1;
  const positions = new Float32Array(n * rings * 3);
  const colors = new Float32Array(n * rings * 3);
  const line = new Float32Array(n * 3);
  const sunLit = sun !== null && sun.elDeg > -1;
  for (let i = 0; i < n; i++) {
    const az = az0 + i * stepDeg;
    const top = skyEl(horizonElevAt(profile, az), scale);
    const facing = sunLit ? Math.max(0, Math.cos(((az - (sun as { azDeg: number }).azDeg) * Math.PI) / 180)) : 0;
    const rim = BAND.rimBase + BAND.rimSun * facing;
    const ringColors: (readonly number[])[] = [
      [(rim * 250) / 255, (rim * 248) / 255, (rim * 244) / 255],
      BAND.under,
      BAND.deep,
      BAND.deep,
    ];
    for (let k = 0; k < rings; k++) {
      const el = k < BAND.offsets.length ? Math.max(BAND.bottomDeg, top + BAND.offsets[k]) : BAND.bottomDeg;
      const d = azElToThree(az, el);
      const v = (k * n + i) * 3;
      positions[v] = d[0] * radius;
      positions[v + 1] = d[1] * radius;
      positions[v + 2] = d[2] * radius;
      colors.set(ringColors[k], v);
      if (k === 0) line.set([d[0] * radius * 0.995, d[1] * radius * 0.995, d[2] * radius * 0.995], i * 3);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  return { positions, colors, indices: Uint32Array.from(idx), line };
}

export interface StarArrays {
  /** Unit directions, three coordinates. */
  positions: Float32Array;
  /** Point size in CSS px (0.3-1.1). */
  sizes: Float32Array;
  /** sRGB 0..1 with alpha (0.12-0.62), four per star. */
  colors: Float32Array;
}

/** Fixed decorative starfield (not a star map): seeded, so it never changes between renders or sessions. */
export function starfield(count = 500, seed = 11): StarArrays {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const az = rnd() * 360;
    const z = -0.03 + rnd() * 1.03;
    const el = (Math.asin(Math.min(1, z)) * 180) / Math.PI;
    positions.set(azElToThree(az, el), i * 3);
    const m = rnd();
    const m3 = m * m * m;
    sizes[i] = 0.3 + 0.8 * m3;
    const t = rnd();
    const rgb = t < 0.12 ? [255, 224, 190] : t < 0.25 ? [200, 218, 255] : [236, 240, 248];
    colors.set([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0.12 + 0.5 * m3], i * 4);
  }
  return { positions, sizes, colors };
}
