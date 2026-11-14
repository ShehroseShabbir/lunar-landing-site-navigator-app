import { describe, expect, it } from 'vitest';
import { HORIZON_SITE_IDS } from '../../data/horizons';
import { SITES } from '../../data/sites';
import { terrainTileIds } from './tiles';

const metaFiles = import.meta.glob('../../../public/terrain/*.json', { eager: true, import: 'default' });
const binFiles = import.meta.glob('../../../public/terrain/*.bin', { eager: true, query: '?url', import: 'default' });
const base = (path: string) => path.replace(/^.*\/([^/]+)\.(json|bin)$/, '$1');
const metaIds = new Set(Object.keys(metaFiles).map(base));
const binIds = new Set(Object.keys(binFiles).map(base));

describe('terrain tile availability', () => {
  it('every site with a horizon profile has near and wide tiles (json + bin), and no tile is unlisted', () => {
    const expected = HORIZON_SITE_IDS.flatMap((id) => {
      const t = terrainTileIds(id);
      return t ? [t.near, t.wide] : [];
    }).sort();
    expect(expected).toHaveLength(HORIZON_SITE_IDS.length * 2);
    expect([...metaIds].sort()).toEqual(expected);
    expect([...binIds].sort()).toEqual(expected);
  });

  it('sites without terrain request nothing', () => {
    expect(terrainTileIds('apollo11')).toBeNull();
    expect(terrainTileIds(null)).toBeNull();
    expect(terrainTileIds('')).toBeNull();
    const withTerrain = SITES.filter((s) => terrainTileIds(s.id) !== null).map((s) => s.id);
    expect(withTerrain.sort()).toEqual([...HORIZON_SITE_IDS].sort());
    expect(SITES.some((s) => terrainTileIds(s.id) === null)).toBe(true);
  });

  it('names the near and wide tiles for a terrain site', () => {
    expect(terrainTileIds('connecting_ridge')).toEqual({ near: 'connecting_ridge', wide: 'connecting_ridge_wide' });
  });
});
