import { describe, expect, it } from 'vitest';
import { discVerticalScale } from './scene';

describe('sky-height stretch keeps partly visible discs honest', () => {
  it('disc vertical radius follows the sky scale so the visible part matches', () => {
    expect(discVerticalScale(1)).toBe(1);
    expect(discVerticalScale(3)).toBe(3);
    expect(discVerticalScale(0)).toBe(1);
    expect(discVerticalScale(Number.NaN)).toBe(1);
    // Earth centre 0.5 deg below the skyline, radius 0.95 deg: limb 0.45 deg above.
    // Centre and radius both scale by k, so the limb stays above the stretched skyline.
    const k = discVerticalScale(3);
    expect(-0.5 * k + 0.95 * k).toBeCloseTo(0.45 * k, 9);
  });
});
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { HorizonProfile, SiteMetrics } from '../../astro/types';
import type { PathPoint, PathRun } from '../../state/skyPaths';
import type { TerrainTile } from '../Scene3D/terrain';
import {
  HOME,
  angDiffDeg,
  circularMeanDeg,
  clampAboveGround,
  hfovFor,
  homePose,
  homeYawDeg,
  vfovDeg,
  viewCentreOffset,
} from './camera';
import { COPY } from './copy';
import { describeNow } from './describeNow';
import { BAND, gridArrays, heightAt, skylineBand, starfield } from './geometry';
import { earthStateText, nowFromMetrics, sunStateText } from './labels';
import {
  boxesOverlap,
  freeRect,
  pickPathAnchor,
  placeLabel,
  projectRuns,
  projectToScreen,
  pxPerDeg,
  skyEl,
  skyPoint,
  type ScreenPt,
} from './project';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('camera rule', () => {
  it('angDiffDeg and circularMeanDeg wrap through north', () => {
    expect(angDiffDeg(350, 10)).toBe(20);
    expect(angDiffDeg(10, 350)).toBe(-20);
    close(circularMeanDeg([350, 10]) ?? NaN, 0);
    close(circularMeanDeg([80, 100]) ?? NaN, 90);
    expect(circularMeanDeg([])).toBeNull();
    expect(circularMeanDeg([0, 180])).toBeNull();
  });

  it('homeYawDeg frames both bodies when they fit, else looks at Earth', () => {
    // Malapert-like: Earth mean 0, Sun 48 -> 24 (visual-spec v5 home yaw).
    close(homeYawDeg(0, 48, 84), 24);
    close(homeYawDeg(350, 30, 84), 10);
    // Sun 150 deg away: does not fit in 84 deg, keep Earth.
    close(homeYawDeg(5, 155, 84), 5);
    close(homeYawDeg(null, 200, 84), 200);
    close(homeYawDeg(30, null, 84), 30);
    expect(homeYawDeg(null, null, 84)).toBe(0);
  });

  it('homePose puts the eye 8 km behind the site, 2.3 km up, pitched -7 deg at a target above the site', () => {
    const { eye, target } = homePose(0, 100, () => -500);
    close(eye.e, 0);
    close(eye.n, -HOME.distM);
    close(eye.u, 100 + HOME.heightM);
    expect(target).toMatchObject({ e: 0, n: 0 });
    const pitch = (Math.atan2(target.u - eye.u, HOME.distM) * 180) / Math.PI;
    close(pitch, HOME.pitchDeg, 1e-9);
    const east = homePose(90, 0, () => null).eye;
    close(east.e, -HOME.distM);
    close(east.n, 0, 1e-9);
  });

  it('homePose and clampAboveGround keep the eye above high ground', () => {
    const { eye } = homePose(0, 0, () => 3000);
    expect(eye.u).toBe(3000 + HOME.clearanceM);
    expect(clampAboveGround(100, 50)).toBe(50 + HOME.clearanceM);
    expect(clampAboveGround(1000, 50)).toBe(1000);
    expect(clampAboveGround(-5, null)).toBe(-5);
  });

  it('vfovDeg gives the horizontal FOV across the width and caps portrait screens', () => {
    const v = vfovDeg(84, 1.6);
    const h = 2 * Math.atan(Math.tan((v * Math.PI) / 360) * 1.6);
    close((h * 180) / Math.PI, 84, 1e-9);
    expect(vfovDeg(hfovFor(390 / 844), 390 / 844)).toBe(HOME.maxVfovDeg);
    expect(hfovFor(1.6)).toBe(84);
    expect(hfovFor(0.5)).toBe(70);
  });

  it('viewCentreOffset centres the scene in the area the chrome leaves free (v5: +150 px, -20 px)', () => {
    const o = viewCentreOffset({ left: 304, right: 0, top: 48, bottom: 130 });
    expect(o.x).toBe(152);
    close(o.y, -20.5);
  });
});

describe('projection and labels', () => {
  const cam = new PerspectiveCamera(60, 2, 1, 1e6);
  cam.position.set(0, 0, 0);
  cam.lookAt(new Vector3(0, 0, -1)); // looking north (three z = -north)
  cam.updateMatrixWorld();
  const vp = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;

  it('projectToScreen matches three for points in front and flags points behind', () => {
    const p = new Vector3(300, 120, -1000);
    const ndc = p.clone().project(cam);
    const s = projectToScreen(vp, [300, 120, -1000], 800, 400);
    close(s.x, ((ndc.x + 1) / 2) * 800, 1e-6);
    close(s.y, ((1 - ndc.y) / 2) * 400, 1e-6);
    expect(s.front).toBe(true);
    expect(projectToScreen(vp, [0, 0, 1000], 800, 400).front).toBe(false);
  });

  it('skyPoint applies the ×3 stretch to elevation only and places azimuth north = -z, east = +x', () => {
    expect(skyEl(2, 3)).toBe(6);
    expect(skyEl(40, 3)).toBe(89.9);
    const n = skyPoint(0, 0, 1, 10);
    close(n[0], 0);
    close(n[2], -10);
    const e = skyPoint(90, 0, 1, 10);
    close(e[0], 10);
    const up = skyPoint(0, 10, 3, 1);
    close(up[1], Math.sin((30 * Math.PI) / 180));
  });

  it('a body at the horizon straight ahead projects to the screen centre row', () => {
    const s = projectToScreen(vp, skyPoint(0, 0, 1, 1e4), 800, 400);
    close(s.x, 400, 1e-6);
    close(s.y, 200, 1e-6);
    const above = projectToScreen(vp, skyPoint(0, 5, 1, 1e4), 800, 400);
    expect(above.y).toBeLessThan(200);
  });

  const pt = (azDeg: number, elDeg: number, visible = true): PathPoint => ({
    t: new Date(0),
    azDeg,
    elDeg,
    horizonElDeg: 0,
    visible,
    ok: visible,
  });

  it('projectRuns keeps run styles and cuts where a point is behind the camera', () => {
    const runs: PathRun[] = [
      { state: 'visible-ok', points: [pt(-10, 1), pt(0, 1), pt(10, 1)] },
      { state: 'hidden', points: [pt(10, -1, false), pt(170, -1, false), pt(180, -1, false), pt(20, -1, false), pt(30, -1, false)] },
    ];
    const lines = projectRuns(runs, (az, el) => projectToScreen(vp, skyPoint(az, el, 1, 1e4), 800, 400));
    expect(lines.map((l) => [l.state, l.pts.length])).toEqual([
      ['visible-ok', 3],
      ['hidden', 2],
    ]);
  });

  it('pickPathAnchor prefers on-screen visible points and avoids the body label area', () => {
    const rect = { left: 0, top: 0, right: 800, bottom: 400 };
    const S = (x: number, y: number, front = true): ScreenPt => ({ x, y, front });
    const pts = [
      { s: S(-50, 100), visible: true },
      { s: S(100, 100), visible: false },
      { s: S(200, 100), visible: true },
      { s: S(300, 100), visible: true },
      { s: S(400, 100), visible: true },
      { s: S(500, 100, false), visible: true },
    ];
    expect(pickPathAnchor(pts, rect)).toBe(3);
    expect(pickPathAnchor(pts, rect, 60, { x: 300, y: 100, r: 50 })).toBe(4);
    expect(pickPathAnchor([{ s: S(-5, -5), visible: true }], rect)).toBeNull();
  });

  it('placeLabel offsets from the anchor, right-aligns, and clamps inside the free area', () => {
    const r = freeRect(1440, 900, { left: 304, right: 0, top: 48, bottom: 130 });
    expect(r).toEqual({ left: 312, top: 56, right: 1432, bottom: 762 });
    const a = placeLabel({ x: 700, y: 300 }, { dx: 46, dy: -34 }, { w: 100, h: 18 }, r, false);
    expect(a).toEqual({ x: 746, y: 257, attachX: 746, attachY: 266 });
    const b = placeLabel({ x: 700, y: 300 }, { dx: -36, dy: -46 }, { w: 100, h: 18 }, r, true);
    expect(b.x).toBe(564);
    expect(b.attachX).toBe(664);
    const c = placeLabel({ x: 320, y: 60 }, { dx: -36, dy: -46 }, { w: 100, h: 18 }, r, true);
    expect(c.x).toBe(312);
    expect(c.y).toBe(56);
  });

  it('boxesOverlap and pxPerDeg', () => {
    expect(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 12, y: 0, w: 10, h: 10 })).toBe(true);
    expect(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false);
    close(pxPerDeg(90, 200), 100 * Math.tan(Math.PI / 180));
  });
});

function tile(size: number, halfWidthM: number, h: (e: number, n: number) => number): TerrainTile {
  const step = (2 * halfWidthM) / (size - 1);
  const heights = new Float32Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) heights[r * size + c] = h(-halfWidthM + c * step, halfWidthM - r * step);
  return {
    meta: { siteId: 't', size, spacingM: step, halfWidthM, heightMinM: 0, heightMaxM: 1, source: 'test' },
    heights,
  };
}

describe('geometry', () => {
  const plane = tile(5, 100, (e, n) => 2 * e + n);

  it('heightAt is bilinear (exact on a plane), row 0 = north, and null outside', () => {
    close(heightAt(plane, 0, 0) ?? NaN, 0, 1e-4);
    close(heightAt(plane, 30, -70) ?? NaN, 60 - 70, 1e-4);
    close(heightAt(plane, 100, 100) ?? NaN, 300, 1e-4);
    expect(heightAt(plane, 101, 0)).toBeNull();
  });

  it('gridArrays maps ENU to three, drops heights and cuts the hole under the near tile', () => {
    const g = gridArrays(plane, { dropM: 10 });
    // vertex (row 0, col 0) = north-west corner: e = -100, n = 100 -> three (-100, h - 10, -100)
    expect(Array.from(g.positions.slice(0, 3))).toEqual([-100, -200 + 100 - 10, -100]);
    expect(g.indices.length).toBe(4 * 4 * 6);
    const holed = gridArrays(tile(9, 400, () => 0), { holeHalfM: 200 });
    // 8 x 8 cells, the inner 2 x 2 (|e|, |n| <= 100 at all corners... strictly < 200) are cut.
    expect(holed.indices.length).toBe((64 - 4) * 6);
  });

  const profile: HorizonProfile = {
    siteId: 'p',
    az0: 0,
    azStepDeg: 90,
    elevDeg: [2, 4, 2, 0],
    distKm: [1, 1, 1, 1],
    minReachKm: 1,
    nearFieldResM: 5,
    observerHeightM: 0,
    maxRangeKm: 1,
    source: 'test',
  };

  it('skylineBand puts the top ring at the profile elevation (×scale) and lights Sun-facing azimuths', () => {
    const b = skylineBand(profile, 3, { azDeg: 90, elDeg: 1 }, 1);
    const n = 4;
    expect(b.positions.length).toBe(n * 4 * 3);
    // azimuth 90 (east), top ring: elevation 12 deg after ×3
    close(Math.asin(b.positions[1 * 3 + 1]) * (180 / Math.PI), 12, 1e-5);
    close(b.positions[1 * 3], Math.cos((12 * Math.PI) / 180), 1e-6);
    // rim colour brighter facing the Sun (az 90) than facing away (az 270)
    expect(b.colors[1 * 3]).toBeGreaterThan(b.colors[3 * 3]);
    close(b.colors[3 * 3], (BAND.rimBase * 250) / 255, 1e-6);
    expect(b.indices.length).toBe(3 * n * 6);
    expect(b.line.length).toBe(n * 3);
  });

  it('skylineBand without a profile is the smooth-Moon horizon at 0 deg; no rim when the Sun is far down', () => {
    const b = skylineBand(null, 1, { azDeg: 0, elDeg: -5 }, 1);
    expect(b.positions.length).toBe(720 * 4 * 3);
    close(b.positions[1], 0, 1e-9);
    close(b.colors[0], (BAND.rimBase * 250) / 255, 1e-6);
  });

  it('starfield is fixed (same every call) with the spec size and alpha ranges', () => {
    const a = starfield();
    const b = starfield();
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.sizes.length).toBe(500);
    expect(Math.min(...a.sizes)).toBeGreaterThanOrEqual(0.3 - 1e-6); // Float32 storage
    expect(Math.max(...a.sizes)).toBeLessThanOrEqual(1.1 + 1e-6);
    const alphas = Array.from(a.colors).filter((_, i) => i % 4 === 3);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.12 - 1e-6);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.62 + 1e-6);
  });
});

describe('body labels from metrics', () => {
  const metrics = (sun: [number, number, number], earth: [number, number, boolean]): SiteMetrics =>
    ({
      sun: { azDeg: 45, elDeg: sun[0], aboveHorizonDeg: sun[1], visibleFraction: sun[2], angDiamDeg: 0.53 },
      earth: { azDeg: 0, elDeg: earth[0], aboveHorizonDeg: earth[1], visible: earth[2], angDiamDeg: 1.9 },
    }) as unknown as SiteMetrics;

  it('Sun: above, partly, behind the ridge, below the horizon', () => {
    expect(sunStateText(metrics([2, 1, 1], [5, 1, true]))).toBe(COPY.sunState.above);
    expect(sunStateText(metrics([1, 0.1, 0.6], [5, 1, true]))).toBe(COPY.sunState.partly);
    expect(sunStateText(metrics([1, -1, 0], [5, 1, true]))).toBe(COPY.sunState.ridge);
    expect(sunStateText(metrics([-1, -1, 0], [5, 1, true]))).toBe(COPY.sunState.below);
  });

  it('Earth: in view, behind the ridge, below the horizon', () => {
    expect(earthStateText(metrics([1, 1, 1], [5, 1, true]))).toBe(COPY.earthState.inView);
    expect(earthStateText(metrics([1, 1, 1], [2, -1, false]))).toBe(COPY.earthState.hidden);
    expect(earthStateText(metrics([1, 1, 1], [-2, -3, false]))).toBe(COPY.earthState.below);
  });

  it('nowFromMetrics feeds describeNow the terrain horizon and the limb visibility', () => {
    const now = nowFromMetrics(metrics([1, -1, 0], [5, 1, true]));
    expect(now.sun).toEqual({ azDeg: 45, elDeg: 1, horizonElDeg: 2, visible: false });
    expect(now.earth.visible).toBe(true);
    expect(describeNow(now)).toContain('behind a ridge');
  });
});
