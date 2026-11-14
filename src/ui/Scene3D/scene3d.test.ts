import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTerrainCache, decodeHeights, loadTerrain, type TerrainMeta } from './terrain';
import { azElToThree, enuToThree, gridVertex } from './mapping';

const meta: TerrainMeta = {
  siteId: 't',
  size: 3,
  spacingM: 1,
  halfWidthM: 1,
  heightMinM: -100,
  heightMaxM: 300,
  source: 'synthetic',
};
function buf(vals: number[]): ArrayBuffer {
  const b = new ArrayBuffer(vals.length * 2);
  const v = new DataView(b);
  vals.forEach((x, i) => v.setUint16(i * 2, x, true));
  return b;
}

describe('decodeHeights', () => {
  it('maps 0 and 65535 to min and max, little endian', () => {
    const h = decodeHeights(buf([0, 65535, 0, 0, 0, 0, 0, 0, 0]), meta)!;
    expect(h[0]).toBe(-100);
    expect(h[1]).toBeCloseTo(300, 3);
  });
  it('rejects a wrong length', () => {
    expect(decodeHeights(new ArrayBuffer(10), meta)).toBeNull();
  });
});

describe('mapping', () => {
  it('ENU to three', () => {
    expect(enuToThree(1, 2, 3)).toEqual([1, 3, -2]);
  });
  it('az/el vectors', () => {
    const n = azElToThree(0, 0);
    expect(n[0]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(-1);
    expect(azElToThree(90, 0)[0]).toBeCloseTo(1);
    expect(azElToThree(123, 90)[1]).toBeCloseTo(1);
    expect(Math.hypot(...azElToThree(200, 35))).toBeCloseTo(1);
  });
  it('grid corners: row 0 col 0 is north-west', () => {
    expect(gridVertex(0, 0, 257, 10000, 5, 3)).toEqual([-10000, 15, -10000]);
    expect(gridVertex(256, 256, 257, 10000, 0, 1)).toEqual([10000, 0, 10000]);
  });
});

describe('loadTerrain', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTerrainCache();
  });
  const res = (ok: boolean, type: string, body: unknown) => ({
    ok,
    headers: { get: () => type },
    json: async () => body,
    arrayBuffer: async () => body as ArrayBuffer,
  });
  it('returns null on 404 and on HTML', async () => {
    vi.stubGlobal('fetch', async () => res(false, '', null));
    expect(await loadTerrain('x')).toBeNull();
    vi.stubGlobal('fetch', async () => res(true, 'text/html', null));
    expect(await loadTerrain('x')).toBeNull();
  });
  it('loads a synthetic tile and rejects a bad length', async () => {
    vi.stubGlobal('fetch', async (u: string) =>
      u.endsWith('.json') ? res(true, 'application/json', meta) : res(true, 'application/octet-stream', buf(new Array(9).fill(0))),
    );
    expect((await loadTerrain('x'))?.heights.length).toBe(9);
    clearTerrainCache();
    vi.stubGlobal('fetch', async (u: string) =>
      u.endsWith('.json') ? res(true, 'application/json', meta) : res(true, 'application/octet-stream', new ArrayBuffer(4)),
    );
    expect(await loadTerrain('x')).toBeNull();
  });
});
