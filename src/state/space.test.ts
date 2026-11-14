import { Body, Illumination, Rotation_EQD_EQJ, RotateVector, SearchMoonPhase, Vector, MakeTime } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { bodyAltAz, ephemSnapshot, siteFrame } from '../astro/ephem';
import type { SiteGeo } from '../astro/types';
import { deg2rad, rad2deg } from '../astro/units';
import { applyMat3, computeSpaceGeometry } from './space';
import type { Mat3, Vec3 } from './space.types';

const IM1: SiteGeo = { latDeg: -80.13, lonDeg: 1.44, heightM: 0 }; // research.md 3(b) reference site
const APOLLO11: SiteGeo = { latDeg: 0.674, lonDeg: 23.473 };
const TIMES = ['2024-02-22T00:00:00Z', '2026-11-14T05:00:00Z', '2027-05-15T13:30:00Z', '2028-01-03T22:10:00Z'].map(
  (s) => new Date(s),
);

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const angle = (a: Vec3, b: Vec3): number =>
  rad2deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b))))));

/** Az/el of a body seen from the site, from the Moon-centred vector minus the site's position. */
function topoAzEl(site: SiteGeo, dir: Vec3, distKm: number): { azDeg: number; elDeg: number } {
  const f = siteFrame(site);
  const d: Vec3 = [distKm * dir[0] - f.rBf[0], distKm * dir[1] - f.rBf[1], distKm * dir[2] - f.rBf[2]];
  const n = Math.sqrt(dot(d, d));
  const elDeg = rad2deg(Math.asin(dot(d, f.upBf) / n));
  const azDeg = (rad2deg(Math.atan2(dot(d, f.eastBf), dot(d, f.northBf))) + 360) % 360;
  return { azDeg, elDeg };
}

/** NOAA general solar position formulae (fractional year), independent of astronomy-engine. */
function noaaSubSolar(t: Date): { latDeg: number; lonDeg: number } {
  const start = Date.UTC(t.getUTCFullYear(), 0, 1);
  const doy = Math.floor((t.getTime() - start) / 86_400_000) + 1;
  const hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eqTimeMin =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { latDeg: rad2deg(decl), lonDeg: wrap180(-15 * (hour - 12 + eqTimeMin / 60)) };
}

describe('computeSpaceGeometry', () => {
  it('returns unit vectors and plausible distances', () => {
    const g = computeSpaceGeometry(IM1, TIMES[1]);
    for (const v of [g.sunDirMe, g.earthDirMe, g.siteDirMe]) expect(Math.abs(Math.hypot(...v) - 1)).toBeLessThan(1e-12);
    expect(g.earthDistKm).toBeGreaterThan(356_000);
    expect(g.earthDistKm).toBeLessThan(407_000);
    expect(g.sunDistKm).toBeGreaterThan(1.46e8);
    expect(g.sunDistKm).toBeLessThan(1.53e8);
    expect(g.t).toBe(TIMES[1]);
  });

  it('puts the site at its latitude and longitude', () => {
    const g = computeSpaceGeometry(IM1, TIMES[0]);
    expect(rad2deg(Math.asin(g.siteDirMe[2]))).toBeCloseTo(-80.13, 9);
    expect(rad2deg(Math.atan2(g.siteDirMe[1], g.siteDirMe[0]))).toBeCloseTo(1.44, 9);
  });

  it('agrees with bodyAltAz once the site offset from the Moon centre is applied (0.05 deg)', () => {
    let maxRawEarthDiff = 0;
    for (const site of [IM1, APOLLO11]) {
      for (const t of TIMES) {
        const g = computeSpaceGeometry(site, t);
        for (const [body, dir, dist] of [
          ['Sun', g.sunDirMe, g.sunDistKm],
          ['Earth', g.earthDirMe, g.earthDistKm],
        ] as const) {
          const ref = bodyAltAz(body, site, t);
          const mine = topoAzEl(site, dir, dist);
          expect(Math.abs(mine.elDeg - ref.elDeg)).toBeLessThanOrEqual(0.05);
          expect(Math.abs(wrap180(mine.azDeg - ref.azDeg)) * Math.cos(deg2rad(ref.elDeg))).toBeLessThanOrEqual(0.05);
          if (body === 'Earth') {
            // Without the offset, Earth's direction differs by up to 1737.4 / 384400 rad = 0.26 deg.
            const f = siteFrame(site);
            const rawEl = rad2deg(Math.asin(dot(dir, f.upBf)));
            maxRawEarthDiff = Math.max(maxRawEarthDiff, Math.abs(rawEl - ref.elDeg));
          }
        }
      }
    }
    expect(maxRawEarthDiff).toBeGreaterThan(0.1); // the offset matters, so the test above really checks it
  });

  it('builds a proper rotation for earthFixedToMe', () => {
    const m = computeSpaceGeometry(APOLLO11, TIMES[2]).earthFixedToMe;
    const mt = transpose(m);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const e = mt[3 * i] * m[j] + mt[3 * i + 1] * m[3 + j] + mt[3 * i + 2] * m[6 + j];
        expect(Math.abs(e - (i === j ? 1 : 0))).toBeLessThan(1e-12);
      }
    }
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    expect(det).toBeCloseTo(1, 12);
  });

  it("maps Earth's north pole to the Earth spin axis in ME", () => {
    for (const t of TIMES) {
      const g = computeSpaceGeometry(IM1, t);
      const pole = applyMat3(g.earthFixedToMe, [0, 0, 1]);
      const s = ephemSnapshot(t, false);
      const toMe = (v: Vec3): Vec3 => [dot(v, s.xAxis), dot(v, s.yAxis), dot(v, s.zAxis)];
      // Of-date pole from astronomy-engine's own rotation, then into ME.
      const pd = RotateVector(Rotation_EQD_EQJ(MakeTime(t)), new Vector(0, 0, 1, MakeTime(t)));
      expect(angle(pole, toMe([pd.x, pd.y, pd.z]))).toBeLessThan(1e-6);
      // J2000 pole (EQJ z): differs only by precession and nutation since 2000, well under 0.5 deg.
      expect(angle(pole, toMe([0, 0, 1]))).toBeLessThan(0.5);
    }
  });

  it('gives the sub-solar point on Earth within 1 deg of the NOAA formulae', () => {
    const dates = ['2026-03-20T12:00:00Z', '2026-06-21T03:15:00Z', '2026-11-14T05:00:00Z', '2027-02-11T19:45:00Z'];
    for (const s of dates) {
      const t = new Date(s);
      const g = computeSpaceGeometry(IM1, t);
      const sunFromEarth: Vec3 = [0, 1, 2].map((i) => g.sunDistKm * g.sunDirMe[i] - g.earthDistKm * g.earthDirMe[i]) as Vec3;
      const v = applyMat3(transpose(g.earthFixedToMe), sunFromEarth);
      const lon = rad2deg(Math.atan2(v[1], v[0]));
      const lat = rad2deg(Math.atan2(v[2], Math.hypot(v[0], v[1])));
      const ref = noaaSubSolar(t);
      expect(Math.abs(wrap180(lon - ref.lonDeg))).toBeLessThan(1);
      expect(Math.abs(lat - ref.latDeg)).toBeLessThan(1);
    }
  });

  it('shows a new Earth at full Moon and a full Earth at new Moon', () => {
    // Penumbral lunar eclipse, greatest 2024-03-25 07:12 UTC; total solar eclipse 2024-04-08 18:17 UTC.
    expect(computeSpaceGeometry(IM1, new Date('2024-03-25T07:12:00Z')).earthPhaseDeg).toBeGreaterThan(178);
    expect(computeSpaceGeometry(IM1, new Date('2024-04-08T18:17:00Z')).earthPhaseDeg).toBeLessThan(1);
    const full = SearchMoonPhase(180, MakeTime(new Date('2026-11-14T00:00:00Z')), 40);
    expect(full).not.toBeNull();
    // The Moon is at most about 5.2 deg off the ecliptic, so the angle is at least about 174.8 deg.
    expect(computeSpaceGeometry(IM1, full!.date).earthPhaseDeg).toBeGreaterThan(174.5);
  });

  it("matches 180 deg minus the Moon's phase angle (Earth-Sun-Moon angle is under 0.2 deg)", () => {
    for (const t of TIMES) {
      const g = computeSpaceGeometry(APOLLO11, t);
      const moonPhase = Illumination(Body.Moon, t).phase_angle;
      expect(Math.abs(g.earthPhaseDeg - (180 - moonPhase))).toBeLessThan(0.2);
    }
  });

  it('runs in under 1 ms per call', () => {
    const t0 = Date.parse('2026-11-14T00:00:00Z');
    for (let i = 0; i < 50; i++) computeSpaceGeometry(IM1, new Date(t0 + i * 3_600_000));
    const n = 500;
    const start = performance.now();
    for (let i = 0; i < n; i++) computeSpaceGeometry(IM1, new Date(t0 + i * 600_000));
    expect((performance.now() - start) / n).toBeLessThan(1);
  });
});
