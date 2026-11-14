// Loads public/space/manifest.json (SpaceManifest). Null when it is missing or malformed: the
// view then draws plain grey and blue spheres and shows no texture credits.

import type { SpaceManifest, SpaceTexture } from '../../state/space.types';

const isTexture = (t: unknown): t is SpaceTexture =>
  typeof t === 'object' &&
  t !== null &&
  typeof (t as SpaceTexture).file === 'string' &&
  Number.isFinite((t as SpaceTexture).lonAtLeftEdgeDeg);

/**
 * The manifest in the contract shape, or null. The Moon relief is read from `moonRelief` and, for
 * manifests written before the key was renamed, from `moonNormal`.
 */
export function parseSpaceManifest(m: unknown): SpaceManifest | null {
  if (typeof m !== 'object' || m === null) return null;
  const raw = m as Partial<SpaceManifest> & { moonNormal?: unknown };
  const s = { ...raw, moonRelief: raw.moonRelief ?? raw.moonNormal } as SpaceManifest & { moonNormal?: unknown };
  delete s.moonNormal;
  return isSpaceManifest(s) ? s : null;
}

export function isSpaceManifest(m: unknown): m is SpaceManifest {
  if (typeof m !== 'object' || m === null) return false;
  const s = m as SpaceManifest;
  return (
    isTexture(s.moonColor) &&
    isTexture(s.moonRelief) &&
    isTexture(s.earthColor) &&
    typeof s.radiiKm === 'object' &&
    s.radiiKm !== null &&
    s.radiiKm.moon > 0 &&
    s.radiiKm.earth > 0
  );
}

/** URL of a manifest texture; `file` is a path under /space/ (a leading "space/" or "/" is tolerated). */
export function textureUrl(t: Pick<SpaceTexture, 'file'>): string {
  return `/space/${t.file.replace(/^\/?(space\/)?/, '')}`;
}

let pending: Promise<SpaceManifest | null> | null = null;

export function loadSpaceManifest(): Promise<SpaceManifest | null> {
  pending ??= fetch('/space/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => parseSpaceManifest(j))
    .catch(() => null);
  return pending;
}
