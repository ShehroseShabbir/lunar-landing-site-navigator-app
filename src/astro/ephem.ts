// Sun and Earth azimuth/elevation from a site on the lunar surface.
// Pipeline: research.md section 3(a) steps 1-6. All vectors are J2000 mean equator (EQJ), in km.
// Degrees at the boundary, radians inside. No refraction (the Moon has no atmosphere).

import {
  Body as AEBody,
  GeoMoon,
  HelioVector,
  KM_PER_AU,
  MakeTime,
  RotationAxis,
} from 'astronomy-engine';
import type { AltAz, Body, SiteGeo } from './types';
import { deg2rad, rad2deg } from './units';

/** Mean lunar radius of the ME / LOLA reference sphere (km), same as Horizons' 1737.4 km sphere. */
export const MOON_RADIUS_KM = 1737.4;
/** IAU 2015 nominal solar radius (km). */
export const SUN_RADIUS_KM = 695700;
/** Earth equatorial radius (km), used for the apparent disc diameter seen from the Moon. */
export const EARTH_RADIUS_KM = 6378.137;

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Site geometry in the Moon body-fixed (ME) frame: position (km) and local ENU unit vectors. */
export interface SiteFrame {
  rBf: Vec3;
  upBf: Vec3;
  eastBf: Vec3;
  northBf: Vec3;
}

/**
 * Step 1 and step 5 of the pipeline, done once per site.
 * East = (-sin lon, cos lon, 0) is the same as unit(pole x up) on the sphere, but it stays
 * defined at the poles (azimuth is then pinned to the site's meridian).
 */
export function siteFrame(site: SiteGeo): SiteFrame {
  const lat = deg2rad(site.latDeg);
  const lon = deg2rad(site.lonDeg);
  const rKm = MOON_RADIUS_KM + (site.heightM ?? 0) / 1000;
  const cLat = Math.cos(lat);
  const sLat = Math.sin(lat);
  const cLon = Math.cos(lon);
  const sLon = Math.sin(lon);
  const upBf: Vec3 = [cLat * cLon, cLat * sLon, sLat];
  return {
    rBf: [rKm * upBf[0], rKm * upBf[1], rKm * upBf[2]],
    upBf,
    eastBf: [-sLon, cLon, 0],
    northBf: [-sLat * cLon, -sLat * sLon, cLat],
  };
}

/** Moon orientation and positions at one instant, shared by both bodies. */
export interface EphemSnapshot {
  /** Body-fixed X, Y, Z axes expressed in EQJ (unit vectors). */
  xAxis: Vec3;
  yAxis: Vec3;
  zAxis: Vec3;
  /** Geocentric Moon centre (km, EQJ). */
  moonGeoKm: Vec3;
  /** Heliocentric Earth (km, EQJ); null when only Earth directions are needed. */
  earthHelioKm: Vec3 | null;
}

/**
 * Steps 2-3: body-fixed -> EQJ from the IAU lunar rotation model (alpha0, delta0, W).
 * Z = pole; X = prime meridian = cos W * Q + sin W * (Z x Q), where Q = unit(EQJ z x Z) is the
 * ascending node of the lunar equator (RA alpha0 + 90 deg). This equals
 * Rz(alpha0 + 90) Rx(90 - delta0) Rz(W) applied to the body-fixed axes.
 */
export function ephemSnapshot(t: Date, withSun: boolean): EphemSnapshot {
  const time = MakeTime(t);
  const ax = RotationAxis(AEBody.Moon, time);
  const ra = deg2rad(15 * ax.ra);
  const dec = deg2rad(ax.dec);
  const w = deg2rad(ax.spin);
  const z: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const q: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const zxq: Vec3 = [
    z[1] * q[2] - z[2] * q[1],
    z[2] * q[0] - z[0] * q[2],
    z[0] * q[1] - z[1] * q[0],
  ];
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const x: Vec3 = [cw * q[0] + sw * zxq[0], cw * q[1] + sw * zxq[1], cw * q[2] + sw * zxq[2]];
  const y: Vec3 = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  const m = GeoMoon(time);
  let earthHelioKm: Vec3 | null = null;
  if (withSun) {
    const e = HelioVector(AEBody.Earth, time);
    earthHelioKm = [e.x * KM_PER_AU, e.y * KM_PER_AU, e.z * KM_PER_AU];
  }
  return {
    xAxis: x,
    yAxis: y,
    zAxis: z,
    moonGeoKm: [m.x * KM_PER_AU, m.y * KM_PER_AU, m.z * KM_PER_AU],
    earthHelioKm,
  };
}

/** Steps 4 and 6: observer-to-body vector (observer offset included), then az/el in local ENU. */
export function altAzFrom(body: Body, frame: SiteFrame, snap: EphemSnapshot): AltAz {
  const { xAxis: x, yAxis: y, zAxis: z, moonGeoKm: m } = snap;
  const r = frame.rBf;
  // Observer position relative to the Moon centre, EQJ.
  const o: Vec3 = [
    x[0] * r[0] + y[0] * r[1] + z[0] * r[2],
    x[1] * r[0] + y[1] * r[1] + z[1] * r[2],
    x[2] * r[0] + y[2] * r[1] + z[2] * r[2],
  ];
  // Observer relative to the Earth centre.
  const og: Vec3 = [m[0] + o[0], m[1] + o[1], m[2] + o[2]];
  let d: Vec3;
  let radiusKm: number;
  if (body === 'Earth') {
    d = [-og[0], -og[1], -og[2]];
    radiusKm = EARTH_RADIUS_KM;
  } else {
    const eh = snap.earthHelioKm;
    if (eh === null) throw new Error('ephemSnapshot was built without the Sun');
    d = [-(eh[0] + og[0]), -(eh[1] + og[1]), -(eh[2] + og[2])];
    radiusKm = SUN_RADIUS_KM;
  }
  const distanceKm = norm(d);
  // Direction in body-fixed coordinates.
  const dBf: Vec3 = [dot(d, x) / distanceKm, dot(d, y) / distanceKm, dot(d, z) / distanceKm];
  const up = Math.max(-1, Math.min(1, dot(dBf, frame.upBf)));
  const elDeg = rad2deg(Math.asin(up));
  let azDeg = rad2deg(Math.atan2(dot(dBf, frame.eastBf), dot(dBf, frame.northBf)));
  if (azDeg < 0) azDeg += 360;
  if (azDeg >= 360) azDeg -= 360;
  const angDiamDeg = rad2deg(2 * Math.asin(Math.min(1, radiusKm / distanceKm)));
  return { azDeg, elDeg, distanceKm, angDiamDeg };
}

/** Apparent (airless, geometric-direction) az/el of the Sun or Earth from a lunar site. */
export function bodyAltAz(body: Body, site: SiteGeo, t: Date): AltAz {
  return altAzFrom(body, siteFrame(site), ephemSnapshot(t, body === 'Sun'));
}
