import { describe, expect, it } from 'vitest';
import {
  AXIS_BOTTOM_DEG,
  axisTopDeg,
  azToX,
  circlePath,
  earthBoundDeg,
  elToY,
  INSET,
  insetAzHalfRange,
  insetProject,
  insetScale,
  insetTerrainPoints,
  panoramaTerrainPath,
  pinBody,
  profileMaxDeg,
  skyRegionPath,
  verticalScale,
  wrapDeltaAz,
  type PlotBox,
} from './geometry';

const box: PlotBox = { left: 50, top: 10, width: 900, height: 240 };

describe('axis top (DR-HACK-14)', () => {
  it('polar site C1 gets 20 deg', () => {
    expect(axisTopDeg(-89.44, -137.17, 0)).toBe(20);
  });
  it('equatorial Apollo 11 gets 90 deg', () => {
    expect(axisTopDeg(0.67408, 23.47297, 3)).toBe(90);
  });
  it('IM-1 region gets 30 deg (Earth bound drives it)', () => {
    expect(axisTopDeg(-80.13, 1.4, 0)).toBe(30);
  });
  it('a 15 deg terrain peak keeps 20 deg at the pole, 20 deg at 28 deg peak is too low', () => {
    expect(axisTopDeg(-89.9, 0, 15)).toBe(20);
    expect(axisTopDeg(-89.9, 0, 19)).toBe(30);
    expect(axisTopDeg(-89.9, 0, 28)).toBe(30);
    expect(axisTopDeg(-89.9, 0, 29)).toBe(45);
  });
  it('earth bound at the sub-Earth point is 101 deg', () => {
    expect(earthBoundDeg(0, 0)).toBeCloseTo(101, 6);
  });
  it('profile max', () => {
    expect(profileMaxDeg([1, 15, -3])).toBe(15);
    expect(profileMaxDeg([])).toBe(0);
  });
});

describe('panorama mapping', () => {
  it('maps azimuth and elevation to the box', () => {
    expect(azToX(0, box)).toBe(50);
    expect(azToX(180, box)).toBe(500);
    expect(azToX(360, box)).toBe(950);
    expect(elToY(20, 20, box)).toBe(10);
    expect(elToY(AXIS_BOTTOM_DEG, 20, box)).toBe(250);
  });
  it('vertical scale is exaggerated at low tops and below 1 at 90 deg', () => {
    expect(verticalScale(20, box)).toBeCloseTo(240 / 30 / 2.5, 9);
    expect(verticalScale(90, box)).toBeLessThan(1);
  });
  it('pins bodies below the axis bottom', () => {
    expect(pinBody(-34.2)).toEqual({ pinned: true, drawElDeg: -10, belowDeg: 34.2 });
    expect(pinBody(-10).pinned).toBe(false);
    expect(pinBody(5).drawElDeg).toBe(5);
  });
  it('terrain path closes along the bottom and clamps', () => {
    const { fill } = panoramaTerrainPath(() => 100, 20, box, 90);
    expect(fill.startsWith('M50 10')).toBe(true);
    expect(fill.endsWith('L50 250Z')).toBe(true);
  });
});

describe('inset projection', () => {
  it('wraps azimuth', () => {
    expect(wrapDeltaAz(359, 1)).toBe(-2);
    expect(wrapDeltaAz(1, 359)).toBe(2);
  });
  it('centre maps to the middle and scale is equal on both axes', () => {
    const c = insetProject(100, 30, 100, 30);
    expect(c).toEqual({ x: INSET.widthPx / 2, y: INSET.heightPx / 2 });
    const s = insetScale();
    const p = insetProject(100, 31, 100, 30);
    expect(c.y - p.y).toBeCloseTo(s, 9);
    // x = delta az * cos(el): 2 deg az at el 60 is 1 deg projected
    const q = insetProject(102, 60, 100, 60);
    expect(q.x - INSET.widthPx / 2).toBeCloseTo(s, 9);
  });
  it('az half range widens with elevation', () => {
    expect(insetAzHalfRange(0)).toBeCloseTo(3, 9);
    expect(insetAzHalfRange(60)).toBeCloseTo(6, 9);
  });
  it('terrain points follow the horizon and the sky path closes at the top', () => {
    const pts = insetTerrainPoints(() => 0.5, 10, 0.5);
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(INSET.widthPx);
    expect(pts.every((p) => Math.abs(p.y - INSET.heightPx / 2) < 1e-9)).toBe(true);
    expect(skyRegionPath(pts, 0).endsWith('L0 0Z')).toBe(true);
  });
  it('circle path is closed', () => {
    expect(circlePath(10, 10, 5)).toMatch(/^M5 10a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z$/);
  });
});
