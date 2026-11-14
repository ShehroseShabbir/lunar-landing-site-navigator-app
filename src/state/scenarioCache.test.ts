import { describe, expect, it, vi } from 'vitest';
import { compute, createProfileCache, reviveDates, scanKey } from './scenarioCache';

const geo = { latDeg: -89.5, lonDeg: 10 };
const d = new Date('2026-11-14T00:00:00Z');

describe('scanKey', () => {
  it('ignores t, changes with range start, site and coordinates', () => {
    const a = scanKey(geo, 'x', d);
    expect(scanKey(geo, 'x', new Date(d))).toBe(a);
    expect(scanKey(geo, 'x', new Date(d.getTime() + 3.6e6))).not.toBe(a);
    expect(scanKey(geo, 'y', d)).not.toBe(a);
    expect(scanKey({ ...geo, latDeg: -89 }, null, d)).not.toBe(a);
  });
});

describe('profile cache', () => {
  it('loads once per site and never fetches for custom', async () => {
    const load = vi.fn(async (id: string) => ({ siteId: id }) as never);
    const c = createProfileCache(load);
    expect(await c.get(null)).toBeNull();
    const a = await c.get('s1');
    const b = await c.get('s1');
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('turns a rejected load into null', async () => {
    const c = createProfileCache(async () => {
      throw new Error('x');
    });
    expect(await c.get('s')).toBeNull();
  });
});

describe('compute', () => {
  it('returns the scan only when asked; moving t reuses the scan', () => {
    const first = compute(geo, null, d, d, true);
    expect(first.scan).toBeDefined();
    const t2 = new Date(d.getTime() + 5 * 86_400_000);
    const t0 = performance.now();
    const again = compute(geo, null, d, t2, false);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(again.scan).toBeUndefined();
    expect(compute(geo, null, d, t2, true).scan).toBe(first.scan);
  });
});

describe('reviveDates', () => {
  it('revives ISO strings and keeps Dates', () => {
    const out = reviveDates({ a: [{ s: '2026-11-14T00:00:00.000Z' }], b: d });
    expect(out.a[0]!.s).toBeInstanceOf(Date);
    expect(out.b).toBe(d);
  });
});
