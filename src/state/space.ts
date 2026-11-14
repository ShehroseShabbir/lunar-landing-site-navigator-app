// Geometry for the S17 space view: Sun, Earth and the landing site around the Moon, all in the
// Moon's body-fixed mean-Earth (ME) frame of src/astro (contract: ./space.types.ts).
// Pure TS, no React or DOM. Same ephemeris as bodyAltAz (geometric positions, IAU Moon rotation),
// so the directions here agree with the sky view; the only difference is that these start at the
// Moon's centre, not at the site.

import { MakeTime, Rotation_EQD_EQJ, SiderealTime } from 'astronomy-engine';
import { ephemSnapshot, siteFrame } from '../astro/ephem';
import type { SiteGeo } from '../astro/types';
import { deg2rad, rad2deg } from '../astro/units';
import type { Mat3, SpaceGeometry, Vec3 } from './space.types';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Row-major product a · b. */
export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
    }
  }
  return out as Mat3;
}

/** m · v for a row-major matrix. */
export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Angle between two vectors, degrees. atan2 form stays accurate near 0 and 180. */
function angleDeg(a: Vec3, b: Vec3): number {
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return rad2deg(Math.atan2(norm(c), dot(a, b)));
}

export function computeSpaceGeometry(site: SiteGeo, t: Date): SpaceGeometry {
  const snap = ephemSnapshot(t, true);
  const { xAxis: x, yAxis: y, zAxis: z, moonGeoKm: m } = snap;
  const eh = snap.earthHelioKm as Vec3; // built with the Sun, never null here

  // EQJ -> ME: the rows are the ME axes expressed in EQJ.
  const eqjToMe: Mat3 = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];

  // From the Moon's centre (EQJ, km): Earth = -geoMoon; Sun = -(helioEarth + geoMoon).
  const earthEqj: Vec3 = [-m[0], -m[1], -m[2]];
  const sunEqj: Vec3 = [-(eh[0] + m[0]), -(eh[1] + m[1]), -(eh[2] + m[2])];
  const earthDistKm = norm(earthEqj);
  const sunDistKm = norm(sunEqj);
  const earthMe = applyMat3(eqjToMe, earthEqj);
  const sunMe = applyMat3(eqjToMe, sunEqj);

  // EQD (true equator and equinox of date) -> EQJ. astronomy-engine stores rot[i][j] as the
  // contribution of source axis i to target axis j (see RotateVector), so transpose it.
  const time = MakeTime(t);
  const r = Rotation_EQD_EQJ(time).rot;
  const eqdToEqj: Mat3 = [
    r[0][0], r[1][0], r[2][0],
    r[0][1], r[1][1], r[2][1],
    r[0][2], r[1][2], r[2][2],
  ];
  // Earth-fixed -> EQD: rotate by Greenwich apparent sidereal time about the true pole
  // (polar motion ignored: under 1 arcsecond).
  const gast = deg2rad(15 * SiderealTime(time));
  const c = Math.cos(gast);
  const s = Math.sin(gast);
  const rz: Mat3 = [c, -s, 0, s, c, 0, 0, 0, 1];
  const earthFixedToMe = mulMat3(eqjToMe, mulMat3(eqdToEqj, rz));

  // Sun-Earth-Moon angle at the Earth: Sun seen from Earth vs Moon seen from Earth.
  const sunFromEarth: Vec3 = [-eh[0], -eh[1], -eh[2]];
  const earthPhaseDeg = angleDeg(sunFromEarth, m);

  return {
    t,
    sunDirMe: [sunMe[0] / sunDistKm, sunMe[1] / sunDistKm, sunMe[2] / sunDistKm],
    sunDistKm,
    earthDirMe: [earthMe[0] / earthDistKm, earthMe[1] / earthDistKm, earthMe[2] / earthDistKm],
    earthDistKm,
    siteDirMe: siteFrame(site).upBf,
    earthFixedToMe,
    earthPhaseDeg,
  };
}
