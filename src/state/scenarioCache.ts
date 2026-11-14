// Pure helpers for the scenario hook: cache keys, profile cache, shared compute.
import { cachedScan, siteMetrics } from '../astro';
import type { HorizonProfile, ScanResult, SiteGeo, SiteMetrics } from '../astro/types';

const RANGE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** Key for the 30-day scan: site coordinates, terrain identity and range start. Excludes t. */
export function scanKey(siteGeo: SiteGeo, siteId: string | null, rangeStart: Date): string {
  return `${siteId ?? 'custom'}|${siteGeo.latDeg}|${siteGeo.lonDeg}|${rangeStart.getTime()}`;
}

/** Profiles are cached by siteId so astro's identity-keyed scan cache is hit. Custom sites: null, no fetch. */
export function createProfileCache(load: (id: string) => Promise<HorizonProfile | null>) {
  const map = new Map<string, Promise<HorizonProfile | null>>();
  return {
    get(siteId: string | null): Promise<HorizonProfile | null> {
      if (siteId === null) return Promise.resolve(null);
      let p = map.get(siteId);
      if (!p) {
        const pr = load(siteId).catch(() => {
          // Failure (not a 404, which load resolves to null): forget it so the next get retries.
          if (map.get(siteId) === pr) map.delete(siteId);
          return null;
        });
        map.set(siteId, pr);
        p = pr;
      }
      return p;
    },
    size: () => map.size,
  };
}

export interface ComputeOutput {
  metrics: SiteMetrics;
  /** Present only when requested (the caller has no scan for this key yet). */
  scan?: ScanResult;
}

export function compute(
  siteGeo: SiteGeo,
  profile: HorizonProfile | null,
  rangeStart: Date,
  t: Date,
  needScan: boolean,
): ComputeOutput {
  const metrics = siteMetrics(siteGeo, profile, t, rangeStart, RANGE_DAYS);
  if (!needScan) return { metrics };
  const end = new Date(rangeStart.getTime() + RANGE_DAYS * MS_PER_DAY);
  return { metrics, scan: cachedScan(siteGeo, profile, rangeStart, end) };
}

/** postMessage structured clone keeps Date; this revives them only if a transport turned them into ISO strings. */
export function reviveDates<T>(value: T): T {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string' && iso.test(v)) return new Date(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
