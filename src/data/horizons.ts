import type { HorizonProfile } from '../astro/types';

/**
 * Site ids with a terrain profile in public/horizons/ (curated sites at lat <= -80,
 * built by scripts/horizon). horizons.test.ts checks this list against the files.
 */
export const HORIZON_SITE_IDS: readonly string[] = [
  'a3_cabeusb',
  'a3_haworth',
  'a3_malapert',
  'a3_monsmouton',
  'a3_nobile1',
  'a3_nobile2',
  'a3_slater',
  'connecting_ridge',
  'connecting_ridge_ext',
  'griffin1',
  'im1',
  'im2',
  'peak_near_shackleton',
  'shackleton_rim',
];

/** 720 azimuths at 0.5 deg from az 0 (plan.md section 5). */
export const HORIZON_SAMPLES = 720;

export function hasHorizonProfile(siteId: string): boolean {
  return HORIZON_SITE_IDS.includes(siteId);
}

export function horizonUrl(siteId: string): string {
  return `/horizons/${encodeURIComponent(siteId)}.json`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Checks the shape of a parsed profile file; throws with the reason if it is malformed. */
export function parseHorizonProfile(data: unknown, siteId: string): HorizonProfile {
  if (typeof data !== 'object' || data === null) throw new Error(`horizon ${siteId}: not an object`);
  const p = data as Record<string, unknown>;
  if (p.siteId !== siteId) throw new Error(`horizon ${siteId}: siteId is ${String(p.siteId)}`);
  for (const key of ['az0', 'azStepDeg', 'minReachKm', 'nearFieldResM', 'observerHeightM', 'maxRangeKm']) {
    if (!isFiniteNumber(p[key])) throw new Error(`horizon ${siteId}: ${key} is not a number`);
  }
  const step = p.azStepDeg as number;
  const n = HORIZON_SAMPLES;
  if (p.az0 !== 0 || step !== 360 / n) throw new Error(`horizon ${siteId}: expected az0 0 and azStepDeg ${360 / n}`);
  for (const key of ['elevDeg', 'distKm']) {
    const arr = p[key];
    if (!Array.isArray(arr) || arr.length !== n || !arr.every(isFiniteNumber)) {
      throw new Error(`horizon ${siteId}: ${key} must be ${n} numbers`);
    }
  }
  if (typeof p.source !== 'string') throw new Error(`horizon ${siteId}: source is not a string`);
  return {
    siteId,
    az0: p.az0 as number,
    azStepDeg: step,
    elevDeg: p.elevDeg as number[],
    distKm: p.distKm as number[],
    minReachKm: p.minReachKm as number,
    nearFieldResM: p.nearFieldResM as number,
    observerHeightM: p.observerHeightM as number,
    maxRangeKm: p.maxRangeKm as number,
    source: p.source,
  };
}

const cache = new Map<string, HorizonProfile>();

/**
 * Loads the terrain horizon profile for a site from /horizons/<id>.json.
 * Never rejects: resolves to null when the site has no profile, on 404, on a
 * network error, on a dev-server HTML fallback, or on a malformed file (the app
 * then uses the smooth-Moon horizon with its badge). Profiles are cached per
 * site id; a null result is not cached, so a later call retries.
 */
export async function loadHorizon(siteId: string): Promise<HorizonProfile | null> {
  if (!hasHorizonProfile(siteId)) return null;
  const hit = cache.get(siteId);
  if (hit) return hit;
  try {
    const res = await fetch(horizonUrl(siteId));
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return null;
    const profile = parseHorizonProfile(await res.json(), siteId);
    cache.set(siteId, profile);
    return profile;
  } catch {
    return null;
  }
}

/** Test hook: forget cached profiles. */
export function clearHorizonCache(): void {
  cache.clear();
}
