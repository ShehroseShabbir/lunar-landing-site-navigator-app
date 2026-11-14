// Which catalogue sites have terrain tiles in public/terrain/ (S19a). Pure: no React or DOM.
// scripts/horizon builds the tiles for the same sites as the horizon profiles, so the horizon
// list is the manifest; tiles.test.ts checks it against the files.

import { hasHorizonProfile } from '../../data/horizons';

export interface TerrainTileIds {
  /** 20 km tile around the site. */
  near: string;
  /** Wide context tile. */
  wide: string;
}

/** Tile ids to fetch for a site, or null when it has none (so nothing is requested and nothing 404s). */
export function terrainTileIds(siteId: string | null): TerrainTileIds | null {
  if (!siteId || !hasHorizonProfile(siteId)) return null;
  return { near: siteId, wide: `${siteId}_wide` };
}
