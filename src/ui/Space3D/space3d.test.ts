import { describe, expect, it } from 'vitest';
import type { Mat3, SpaceGeometry, Vec3 } from '../../state/space.types';
import {
  distancesText,
  earthLabelText,
  earthPhaseText,
  formatKm,
  formatMillionKm,
  siteLight,
  spaceCanvasLabel,
  sunLabelText,
} from './copy';
import {
  COMPRESSED_EARTH_RADII,
  MOON_BUMP_SCALE,
  MOON_MAX_DIST,
  MOON_MIN_DIST,
  SUN_EARTH_DISTANCES,
  homeDir,
  latLonToMe,
  layoutBodies,
  levelLimits,
  levelPose,
  mat3Apply,
  mat3MeToThree,
  meToThree,
  moonHomeDist,
  nextLevel,
  segmentHitsSphere,
  siteFacing,
  surfacePointVisible,
  textureOffsetU,
  vec,
  vfovFor,
} from './frame';
import { isSpaceManifest, parseSpaceManifest, textureUrl } from './manifest';
import { COPY } from './copy';

const RADII = { moon: 1737.4, earth: 6378.137 };
const close = (a: Vec3, b: Vec3, eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(eps)));

const geom = (over: Partial<SpaceGeometry> = {}): SpaceGeometry => ({
  t: new Date(Date.UTC(2026, 10, 20, 0, 0)),
  sunDirMe: [0, 1, 0],
  sunDistKm: 1.48e8,
  earthDirMe: [1, 0, 0],
  earthDistKm: 384_400,
  siteDirMe: latLonToMe(-85.99, -2.93),
  earthFixedToMe: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  earthPhaseDeg: 90,
  ...over,
});

describe('frame mapping (ME → three)', () => {
  it('maps ME x, y, z to three x, −z, y and keeps handedness', () => {
    close(meToThree([1, 0, 0]), [1, 0, 0]);
    close(meToThree([0, 1, 0]), [0, 0, -1]);
    close(meToThree([0, 0, 1]), [0, 1, 0]);
    // x' × y' = z' (right-handed after mapping).
    close(vec.cross(meToThree([1, 0, 0]), meToThree([0, 1, 0])), meToThree([0, 0, 1]));
  });

  it('expresses an ME rotation in three axes consistently', () => {
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    const rz: Mat3 = [c, -s, 0, s, c, 0, 0, 0, 1]; // about ME z
    const rt = mat3MeToThree(rz);
    for (const v of [[0.3, -0.5, 0.8], [1, 0, 0], [0, 0, 1]] as Vec3[]) {
      close(mat3Apply(rt, meToThree(v)), meToThree(mat3Apply(rz, v)));
    }
  });

  it('offsets an equirectangular texture so its longitudes land on the same ME longitudes', () => {
    expect(textureOffsetU(-180)).toBe(0);
    expect(textureOffsetU(0)).toBeCloseTo(0.5);
    expect(textureOffsetU(180)).toBeCloseTo(0);
    // Sphere u for longitude g is (g + 180) / 360; the sampled image column must be (g − L) / 360.
    for (const L of [-180, 0, 90]) {
      for (const g of [-150, 0, 30, 170]) {
        const sampled = ((g + 180) / 360 + textureOffsetU(L)) % 1;
        const want = ((((g - L) / 360) % 1) + 1) % 1;
        expect(sampled).toBeCloseTo(want, 9);
      }
    }
  });
});

describe('layout (compressed and true scale)', () => {
  it('puts Earth at 12 Moon radii by default and at the real distance in true scale; sizes true in both', () => {
    const g = geom();
    const c = layoutBodies(g, 'compressed', RADII);
    close(c.earthPos, [COMPRESSED_EARTH_RADII, 0, 0]);
    expect(c.earthR).toBeCloseTo(3.671, 3);
    const t = layoutBodies(g, 'true', RADII);
    expect(t.earthDist).toBeCloseTo(221.25, 1);
    expect(t.earthR).toBeCloseTo(c.earthR, 9);
  });

  it('keeps the Sun along its real direction, always compressed', () => {
    const c = layoutBodies(geom(), 'compressed', RADII);
    close(c.sunPos, vec.scale(meToThree([0, 1, 0]), SUN_EARTH_DISTANCES * COMPRESSED_EARTH_RADII));
    const t = layoutBodies(geom(), 'true', RADII);
    expect(t.sunDist).toBeLessThan(1.48e8 / RADII.moon / 50);
  });
});

describe('camera levels', () => {
  it('home looks straight down on an equatorial site and obliquely (north up) on a polar one', () => {
    close(homeDir([1, 0, 0]), [1, 0, 0]);
    const polar = homeDir(latLonToMe(-89.5, 40));
    expect((Math.asin(polar[1]) * 180) / Math.PI).toBeCloseTo(-50, 6);
  });

  it('faces the site at home and not from the far side', () => {
    const site = latLonToMe(-85.99, -2.93);
    const home = levelPose('moon', layoutBodies(geom(), 'compressed', RADII), site, 14);
    expect(siteFacing(home.eye, site)).toBe(true);
    expect(siteFacing(vec.scale(home.eye, -1), site)).toBe(false);
    expect(surfacePointVisible(home.eye, meToThree(site))).toBe(true);
  });

  it('keeps the Moon-level camera clear of the compressed Earth', () => {
    const L = layoutBodies(geom(), 'compressed', RADII);
    expect(MOON_MAX_DIST).toBeLessThan(L.earthDist - L.earthR);
    expect(moonHomeDist(5)).toBeLessThan(MOON_MAX_DIST);
    expect(moonHomeDist(30)).toBeGreaterThan(MOON_MIN_DIST);
  });

  it('frames the Earth–Moon and Sun levels from outside every body, in both scales', () => {
    for (const mode of ['compressed', 'true'] as const) {
      const L = layoutBodies(geom(), mode, RADII);
      for (const level of ['system', 'sun'] as const) {
        const p = levelPose(level, L, [1, 0, 0], 14);
        const lim = levelLimits(level, L, 14);
        const d = vec.len(vec.sub(p.eye, p.target));
        expect(d).toBeGreaterThan(lim.min);
        expect(d).toBeLessThan(lim.max);
        // Closest approach (min distance from the target) still clears the Earth and the Moon.
        expect(lim.min).toBeGreaterThan(vec.len(vec.sub(L.earthPos, p.target)) + L.earthR);
        expect(lim.min).toBeGreaterThan(vec.len(p.target) + 1);
      }
    }
  });

  it('keeps a 35° horizontal view on portrait screens', () => {
    expect(vfovFor(16 / 9)).toBe(35);
    const v = vfovFor(390 / 844);
    const hfov = (2 * Math.atan(Math.tan((v / 2) * (Math.PI / 180)) * (390 / 844)) * 180) / Math.PI;
    expect(hfov).toBeCloseTo(35, 6);
    expect(vfovFor(0.2)).toBe(75);
  });

  it('steps between levels and hands over to the surface from the Moon', () => {
    expect(nextLevel('moon', 1)).toBe('surface');
    expect(nextLevel('moon', -1)).toBe('system');
    expect(nextLevel('system', -1)).toBe('sun');
    expect(nextLevel('sun', -1)).toBeNull();
    expect(nextLevel('sun', 1)).toBe('system');
  });

  it('detects a body hidden behind a sphere', () => {
    expect(segmentHitsSphere([5, 0, 0], [-40, 0, 0], [0, 0, 0], 1)).toBe(true);
    expect(segmentHitsSphere([5, 0, 0], [-40, 12, 0], [0, 0, 0], 1)).toBe(false);
    expect(segmentHitsSphere([5, 0, 0], [3, 0, 0], [0, 0, 0], 1)).toBe(false);
  });
});

describe('copy', () => {
  it('words Earth’s phase with the lit percentage', () => {
    expect(earthPhaseText(0)).toEqual({ words: 'full', pct: 100 });
    expect(earthPhaseText(60)).toEqual({ words: 'more than half lit', pct: 75 });
    expect(earthPhaseText(90)).toEqual({ words: 'about half lit', pct: 50 });
    expect(earthPhaseText(140).words).toBe('a crescent');
    expect(earthPhaseText(180).pct).toBe(0);
    expect(earthLabelText(90)).toBe('50% lit as seen from the Moon');
  });

  it('formats distances', () => {
    expect(formatKm(384_400.4)).toBe('384,400 km');
    expect(formatMillionKm(1.496e8)).toBe('150 million km');
    expect(sunLabelText(1.47e8)).toBe('147 million km away, not to scale');
  });

  it('says day, night or the terminator for the site on a smooth Moon', () => {
    expect(siteLight([1, 0, 0], [1, 0, 0])).toBe('day');
    expect(siteLight([1, 0, 0], [-1, 0, 0])).toBe('night');
    expect(siteLight(latLonToMe(-89, 0), [1, 0, 0])).toBe('edge');
  });

  it('builds the canvas label and the distances list from the data', () => {
    const g = geom();
    const label = spaceCanvasLabel(g, 'Malapert Massif', 'compressed');
    expect(label).toContain('The Moon from space at 20 Nov 2026 00:00 UTC.');
    expect(label).toContain('Malapert Massif');
    expect(label).toContain('Earth is about half lit as seen from the Moon (50% of its disc lit).');
    expect(label).toContain('Not to scale');
    expect(spaceCanvasLabel(g, 'X', 'true')).toContain('true scale');
    const d = distancesText(g, RADII);
    expect(d[0]).toBe('Earth is 384,400 km from the Moon, centre to centre (221 Moon radii).');
    expect(d[1]).toBe('The Sun is 148 million km from the Moon.');
  });
});

describe('manifest', () => {
  it('validates the manifest shape and builds texture URLs under /space/', () => {
    const tex = { file: 'moon_color_2k.jpg', width: 2048, height: 1024, lonAtLeftEdgeDeg: -180, kind: 'color', credit: 'c', sourceUrl: 'u' };
    const radiiKm = { moon: 1737.4, earth: 6371, sun: 695700 };
    expect(isSpaceManifest({ moonColor: tex, moonRelief: tex, earthColor: tex, radiiKm })).toBe(true);
    // Older manifests name the relief moonNormal; it is read as moonRelief.
    expect(parseSpaceManifest({ moonColor: tex, moonNormal: tex, earthColor: tex, radiiKm })?.moonRelief).toEqual(tex);
    expect(parseSpaceManifest({ moonColor: tex, earthColor: tex, radiiKm })).toBeNull();
    expect(isSpaceManifest({ moonColor: tex })).toBe(false);
    expect(textureUrl({ file: 'moon_color_2k.jpg' })).toBe('/space/moon_color_2k.jpg');
    expect(textureUrl({ file: '/space/earth.jpg' })).toBe('/space/earth.jpg');
  });
});

describe('relief credit', () => {
  it('states the bump exaggeration actually used', () => {
    expect(COPY.relief).toContain(`bump scale ${MOON_BUMP_SCALE}`);
  });
});
