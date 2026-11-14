import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHorizonProfile } from '../../data/horizons';
import { getSite, siteGeo } from '../../data/sites';
import { computeSkyPaths } from '../../state/skyPaths';
import { canvasLabel, compassPoint, describeNow, LOW_EL_DEG, PATHS_SENTENCE, type BodyNow } from './describeNow';

const body = (azDeg: number, elDeg: number, horizonElDeg: number, visible: boolean): BodyNow => ({
  azDeg,
  elDeg,
  horizonElDeg,
  visible,
});
const EARTH_N = body(0, 20, 0, true);
const SUN_UP = body(90, 3, 1, true);

describe('compassPoint', () => {
  it('names the 8 points at their centres', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPoint)).toEqual([
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ]);
  });

  it('uses 45-deg sectors with each boundary at +22.5 deg belonging to the next point', () => {
    expect(compassPoint(22.49)).toBe('north');
    expect(compassPoint(22.5)).toBe('north-east');
    expect(compassPoint(67.49)).toBe('north-east');
    expect(compassPoint(67.5)).toBe('east');
    expect(compassPoint(157.5)).toBe('south');
    expect(compassPoint(202.49)).toBe('south');
    expect(compassPoint(202.5)).toBe('south-west');
    expect(compassPoint(337.49)).toBe('north-west');
    expect(compassPoint(337.5)).toBe('north');
  });

  it('wraps azimuths outside 0..360', () => {
    expect(compassPoint(360)).toBe('north');
    expect(compassPoint(359.9)).toBe('north');
    expect(compassPoint(-10)).toBe('north');
    expect(compassPoint(-45)).toBe('north-west');
    expect(compassPoint(405)).toBe('north-east');
  });
});

describe('describeNow', () => {
  it('Sun above the terrain', () => {
    expect(describeNow({ sun: SUN_UP, earth: EARTH_N })).toBe(
      'The Sun is above the terrain. Earth is in the north, in view.',
    );
  });

  it('Sun counts as above the terrain while only its upper limb clears it (limb rule)', () => {
    expect(describeNow({ sun: body(90, 0.9, 1, true), earth: EARTH_N })).toMatch(/^The Sun is above the terrain\. /);
  });

  it('Sun above 0 deg but below the terrain', () => {
    expect(describeNow({ sun: body(54, 3.9, 5, false), earth: EARTH_N })).toMatch(
      /^The Sun is up but behind a ridge\. /,
    );
  });

  it('Sun below 0 deg, with or without terrain above it', () => {
    expect(describeNow({ sun: body(200, -2, 0, false), earth: EARTH_N })).toMatch(/^The Sun is below the horizon\. /);
    expect(describeNow({ sun: body(200, -0.5, 1.5, false), earth: EARTH_N })).toMatch(/^The Sun is below the horizon\. /);
    expect(describeNow({ sun: body(200, 0, 1.5, false), earth: EARTH_N })).toMatch(/^The Sun is below the horizon\. /);
  });

  it('Earth low only below 10 deg', () => {
    expect(describeNow({ sun: SUN_UP, earth: body(90, LOW_EL_DEG - 0.01, 0, true) })).toContain(
      'Earth is low in the east, in view.',
    );
    expect(describeNow({ sun: SUN_UP, earth: body(90, LOW_EL_DEG, 0, true) })).toContain('Earth is in the east, in view.');
  });

  it('Earth above 0 deg XX', () => {
    expect(describeNow({ sun: SUN_UP, earth: body(181, 2, 4, false) })).toContain(
      'Earth is low in the south, behind the terrain.',
    );
    expect(describeNow({ sun: SUN_UP, earth: body(300, 12, 15, false) })).toContain(
      'Earth is in the north-west, behind the terrain.',
    );
  });

  it('Earth below 0 deg and not visible is below the horizon, not behind terrain', () => {
    expect(describeNow({ sun: SUN_UP, earth: body(10, -3, 0, false) })).toContain('Earth is below the horizon.');
  });

  it('canvas label always ends with the paths sentence; the caption does not carry it', () => {
    for (const sun of [SUN_UP, body(54, 3.9, 5, false), body(200, -2, 0, false)]) {
      for (const earth of [EARTH_N, body(181, 2, 4, false), body(10, -3, 0, false)]) {
        expect(canvasLabel('X', { sun, earth }).endsWith(` ${PATHS_SENTENCE}`)).toBe(true);
        expect(describeNow({ sun, earth })).not.toContain(PATHS_SENTENCE);
      }
    }
  });
});

describe('canvasLabel', () => {
  it('names the site and gives the Sun direction when it is up', () => {
    expect(canvasLabel('Malapert Massif', { sun: body(54, 3.9, 5, false), earth: body(353, 7.1, 4.4, true) })).toBe(
      '3D view of the terrain around Malapert Massif. The Sun is up but behind a ridge to the north-east. ' +
        'Earth is low in the north, in view. Thin lines show where each moves over the next 30 days.',
    );
    expect(canvasLabel('Apollo 11', { sun: body(95, 40, 0, true), earth: EARTH_N })).toBe(
      '3D view of the terrain around Apollo 11. The Sun is above the terrain in the east. ' +
        'Earth is in the north, in view. Thin lines show where each moves over the next 30 days.',
    );
    expect(canvasLabel('X', { sun: body(200, -2, 0, false), earth: body(10, -3, 0, false) })).toBe(
      '3D view of the terrain around X. The Sun is below the horizon. Earth is below the horizon. ' +
        'Thin lines show where each moves over the next 30 days.',
    );
  });
});

describe('Malapert Massif, 2026-11-20 00:00 UTC (mockup example, measured)', () => {
  const site = getSite('a3_malapert');
  if (!site) throw new Error('a3_malapert missing from sites.json');
  const profile = parseHorizonProfile(
    JSON.parse(readFileSync(new URL('../../../public/horizons/a3_malapert.json', import.meta.url), 'utf8')),
    'a3_malapert',
  );
  const now = computeSkyPaths(siteGeo(site), profile, new Date('2026-11-20T00:00:00Z'), 0);
  const sun = now.sun[0];
  const earth = now.earth[0];

  it('Sun is above 0 deg but below the terrain; Earth is low in the north and visible', () => {
    expect(sun.azDeg).toBeCloseTo(54.0, 1);
    expect(sun.elDeg).toBeGreaterThan(3.8);
    expect(sun.elDeg).toBeLessThan(4.0); // 3.90 deg
    expect(sun.horizonElDeg).toBeGreaterThan(4.9); // 5.00 deg: the ridge is ~1.1 deg above the Sun
    expect(sun.visible).toBe(false);
    expect(earth.azDeg).toBeCloseTo(353.0, 0);
    expect(earth.elDeg).toBeGreaterThan(7.0);
    expect(earth.elDeg).toBeLessThan(7.3); // 7.15 deg, 2.8 deg above the 4.35 deg terrain
    expect(earth.elDeg - earth.horizonElDeg).toBeCloseTo(2.8, 1);
    expect(earth.visible).toBe(true);
  });

  it('gives the rule-built caption', () => {
    expect(describeNow({ sun, earth })).toBe(
      'The Sun is up but behind a ridge. Earth is low in the north, in view.',
    );
  });
});
