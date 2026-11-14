// Pure geometry for the 3D scene. Local ENU: x east, y north, z up. Three (y-up): x east, y up, z = -north.

export type Vec3 = [number, number, number];

export function enuToThree(east: number, north: number, up: number): Vec3 {
  return [east, up, -north];
}

/** Unit direction towards a body at azimuth (from north, clockwise) and elevation, in three coordinates. */
export function azElToThree(azDeg: number, elDeg: number): Vec3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** Vertex position for grid cell (row, col); row 0 is the north edge, col 0 the west edge. */
export function gridVertex(
  row: number,
  col: number,
  size: number,
  halfWidthM: number,
  zM: number,
  exaggeration: number,
): Vec3 {
  const step = (2 * halfWidthM) / (size - 1);
  const east = -halfWidthM + col * step;
  const north = halfWidthM - row * step;
  return enuToThree(east, north, zM * exaggeration);
}

export function describeView(site: string, widthKm: number, sunAz: number, sunEl: number, sunUp: boolean = sunEl > 0): string {
  const sun =
    sunUp
      ? `lit by the Sun at az ${sunAz.toFixed(0)}°, el ${sunEl.toFixed(1)}°`
      : 'with the Sun below the horizon';
  return `3D terrain around ${site}, ${widthKm} km across, ${sun}`;
}
