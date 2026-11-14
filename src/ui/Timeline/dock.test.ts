import { describe, expect, it } from 'vitest';
import { dayMonth, dayOfRange, dockTime } from './dock';

const start = new Date('2026-11-14T00:00:00Z');

describe('dock helpers', () => {
  it('formats the dock time', () => {
    expect(dockTime(new Date('2026-11-20T00:00:00Z'))).toBe('20 Nov 2026 · 00:00 UTC');
    expect(dayMonth(start)).toBe('14 Nov');
  });
  it('day of range is 1-based and clamped', () => {
    expect(dayOfRange(start, start)).toBe(1);
    expect(dayOfRange(new Date('2026-11-20T00:00:00Z'), start)).toBe(7);
    expect(dayOfRange(new Date('2026-12-14T00:00:00Z'), start)).toBe(30);
    expect(dayOfRange(new Date('2026-11-01T00:00:00Z'), start)).toBe(1);
  });
});
