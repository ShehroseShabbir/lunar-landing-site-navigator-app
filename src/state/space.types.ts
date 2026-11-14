// Shared contract for S17 "Zoom out to the Moon, Earth and Sun" (logic: src/state/space.ts; data: public/space/**;
// scene: src/ui/Space3D/**). All vectors are in the Moon's body-fixed mean-Earth (ME) frame used by src/astro:
// +x toward 0° N 0° E, +z toward the north pole, +y completing a right-handed set (90° E). Distances in km.

export type Vec3 = [number, number, number];
/** Row-major 3x3 rotation matrix: v_me = M · v_src. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface SpaceGeometry {
  t: Date;
  /** Unit vector from the Moon's centre toward the Sun, and the distance. */
  sunDirMe: Vec3;
  sunDistKm: number;
  /** Unit vector from the Moon's centre toward the Earth's centre, and the distance. */
  earthDirMe: Vec3;
  earthDistKm: number;
  /** Unit vector of the landing site on the lunar sphere (from latDeg/lonDeg). */
  siteDirMe: Vec3;
  /** Earth body-fixed (x: 0° lon on the equator, z: north pole) → Moon ME, including Earth's rotation at t. */
  earthFixedToMe: Mat3;
  /** Sun–Earth–Moon phase angle at the Earth, degrees (0 = full Earth seen from the Moon). */
  earthPhaseDeg: number;
}

/** One texture in public/space/manifest.json. */
export interface SpaceTexture {
  file: string; // path under /space/
  width: number;
  height: number;
  /** Equirectangular: longitude (east-positive, degrees) at the image's left edge; latitude +90 at the top row. */
  lonAtLeftEdgeDeg: number;
  kind: 'color' | 'normal';
  credit: string;
  sourceUrl: string;
}

export interface SpaceManifest {
  moonColor: SpaceTexture;
  moonNormal: SpaceTexture;
  earthColor: SpaceTexture;
  radiiKm: { moon: number; earth: number; sun: number };
}
