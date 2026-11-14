import { describe, expect, it } from 'vitest';
import { deg2rad, rad2deg } from './units';

describe('units', () => {
  it('converts degrees to radians', () => {
    expect(deg2rad(180)).toBeCloseTo(Math.PI, 12);
    expect(deg2rad(90)).toBeCloseTo(Math.PI / 2, 12);
  });
  it('round-trips', () => {
    expect(rad2deg(deg2rad(-37.25))).toBeCloseTo(-37.25, 12);
  });
});
