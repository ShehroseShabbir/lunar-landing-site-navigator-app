// Terrain tile loader and pure helpers (no three import, so it stays testable in node).

export interface TerrainMeta {
  siteId: string;
  size: number;
  spacingM: number;
  halfWidthM: number;
  heightMinM: number;
  heightMaxM: number;
  source: string;
  grid?: string;
}

export interface TerrainTile {
  meta: TerrainMeta;
  /** Metres above the local tangent plane, row-major, row 0 = north edge, col 0 = west edge. */
  heights: Float32Array;
}

/** Uint16 little-endian samples to metres: heightMin + v * (heightMax - heightMin) / 65535. */
export function decodeHeights(buf: ArrayBuffer, meta: TerrainMeta): Float32Array | null {
  const n = meta.size * meta.size;
  if (!Number.isInteger(meta.size) || meta.size < 2 || buf.byteLength !== n * 2) return null;
  const view = new DataView(buf);
  const out = new Float32Array(n);
  const scale = (meta.heightMaxM - meta.heightMinM) / 65535;
  for (let i = 0; i < n; i++) out[i] = meta.heightMinM + view.getUint16(i * 2, true) * scale;
  return out;
}

function validMeta(m: unknown): m is TerrainMeta {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.siteId === 'string' &&
    ['size', 'spacingM', 'halfWidthM', 'heightMinM', 'heightMaxM'].every(
      (k) => typeof o[k] === 'number' && Number.isFinite(o[k]),
    )
  );
}

const cache = new Map<string, TerrainTile>();

/** Null on 404, HTML fallback, malformed metadata or wrong byte length. Nulls are not cached. */
export async function loadTerrain(siteId: string): Promise<TerrainTile | null> {
  const hit = cache.get(siteId);
  if (hit) return hit;
  try {
    const id = encodeURIComponent(siteId);
    const [jr, br] = await Promise.all([fetch(`/terrain/${id}.json`), fetch(`/terrain/${id}.bin`)]);
    if (!jr.ok || !br.ok) return null;
    if ((jr.headers.get('content-type') ?? '').includes('text/html')) return null;
    if ((br.headers.get('content-type') ?? '').includes('text/html')) return null;
    const meta: unknown = await jr.json();
    if (!validMeta(meta)) return null;
    const heights = decodeHeights(await br.arrayBuffer(), meta);
    if (!heights) return null;
    const tile = { meta, heights };
    cache.set(siteId, tile);
    return tile;
  } catch {
    return null;
  }
}

export function clearTerrainCache(): void {
  cache.clear();
}
