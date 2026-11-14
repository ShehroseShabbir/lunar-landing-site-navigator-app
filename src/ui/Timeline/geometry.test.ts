import { describe, expect, it } from 'vitest';
import type { VisWindow } from '../../astro/types';
import { formatDuration, overlap, subtractWindows, timeToX, windowAtX, windowRect, xToTime, type Axis } from './geometry';

const DAY = 86_400_000;
const axis: Axis = { startMs: 0, spanMs: 30 * DAY, x0: 100, x1: 400 };
const win = (a: number, b: number): VisWindow => ({
  state: 'powerOk',
  start: new Date(a * DAY),
  end: new Date(b * DAY),
  clippedStart: false,
  clippedEnd: false,
  maxElDeg: 1,
});

describe('timeline geometry', () => {
  it('maps time to x and back', () => {
    expect(timeToX(0, axis)).toBe(100);
    expect(timeToX(15 * DAY, axis)).toBe(250);
    expect(timeToX(30 * DAY, axis)).toBe(400);
    expect(xToTime(250, axis)).toBe(15 * DAY);
  });
  it('clamps outside the range', () => {
    expect(timeToX(-5 * DAY, axis)).toBe(100);
    expect(timeToX(99 * DAY, axis)).toBe(400);
    expect(xToTime(0, axis)).toBe(0);
    expect(xToTime(9999, axis)).toBe(30 * DAY);
  });
  it('builds window rects, clipped to the axis, with a minimum width', () => {
    expect(windowRect(win(3, 6), axis)).toEqual({ x: 130, width: 30 });
    expect(windowRect(win(-4, 2), axis)).toEqual({ x: 100, width: 20 });
    expect(windowRect(win(10, 10.001), axis).width).toBe(2);
    const edge = windowRect(win(30, 31), axis);
    expect(edge.x + edge.width).toBe(400);
  });
  it('intersects window lists', () => {
    expect(overlap([win(0, 5), win(8, 12)], [win(3, 9), win(11, 20)])).toEqual([
      [3 * DAY, 5 * DAY],
      [8 * DAY, 9 * DAY],
      [11 * DAY, 12 * DAY],
    ]);
    expect(overlap([win(0, 1)], [win(1, 2)])).toEqual([]);
    expect(overlap([], [win(1, 2)])).toEqual([]);
  });
  it('finds the window under x', () => {
    const ws = [win(3, 6), win(10, 12)];
    expect(windowAtX(ws, 140, axis)).toBe(ws[0]);
    expect(windowAtX(ws, 180, axis)).toBeNull();
  });
  it('formats durations', () => {
    expect(formatDuration((2 * 24 + 20) * 3_600_000)).toBe('2 d 20 h');
    expect(formatDuration(5 * 3_600_000 + 10 * 60_000)).toBe('5 h 10 min');
    expect(formatDuration(42 * 60_000)).toBe('42 min');
    expect(formatDuration(3 * DAY)).toBe('3 d');
  });
  it('subtracts windows and keeps clipped flags only on untouched clipped edges', () => {
    const a = { ...win(0, 10), clippedStart: true, clippedEnd: true };
    const r = subtractWindows([a], [win(2, 4), win(6, 7)]);
    expect(r.map((w) => [w.start.getTime() / DAY, w.end.getTime() / DAY, w.clippedStart, w.clippedEnd])).toEqual([
      [0, 2, true, false],
      [4, 6, false, false],
      [7, 10, false, true],
    ]);
    expect(subtractWindows([win(1, 5)], [win(0, 9)])).toEqual([]);
    expect(subtractWindows([win(1, 5)], [])).toEqual([win(1, 5)]);
    const lead = subtractWindows([{ ...win(0, 5), clippedStart: true }], [win(0, 2)]);
    expect(lead).toHaveLength(1);
    expect(lead[0].clippedStart).toBe(false);
  });
});
