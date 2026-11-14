import { describe, expect, it } from 'vitest';
import { advance, reducedStep, shouldUpdate, SPEEDS, windowEnd } from './playback';

const H = 3_600_000;
const D = 24 * H;

describe('playback', () => {
  it('speeds are 1 h/s, 6 h/s, 1 d/s', () => {
    expect(SPEEDS.map((s) => s.simMsPerSec)).toEqual([H, 6 * H, D]);
  });
  it('advances by elapsed real time x speed', () => {
    expect(advance(0, 500, H, 10 * D)).toEqual({ tMs: H / 2, ended: false });
    expect(advance(0, 1000, D, 10 * D)).toEqual({ tMs: D, ended: false });
  });
  it('clamps at the window end and reports ended', () => {
    const end = windowEnd(0);
    expect(end).toBe(30 * D);
    expect(advance(end - H, 5000, D, end)).toEqual({ tMs: end, ended: true });
    expect(advance(end - D, 1000, D, end).ended).toBe(true);
  });
  it('ignores negative elapsed time', () => {
    expect(advance(100, -50, H, D).tMs).toBe(100);
  });
  it('reduced motion steps one speed unit', () => {
    expect(reducedStep(0, 6 * H, 30 * D)).toEqual({ tMs: 6 * H, ended: false });
    expect(reducedStep(29.9 * D, D, 30 * D).ended).toBe(true);
  });
  it('throttles to 10 updates per second', () => {
    expect(shouldUpdate(16)).toBe(false);
    expect(shouldUpdate(100)).toBe(true);
  });
});
