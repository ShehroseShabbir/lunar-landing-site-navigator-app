import type { HorizonProfile } from '../astro/types';

// Minimal stand-in for S3's loader; S3's version replaces this file on merge.
export const HORIZON_SITE_IDS: readonly string[] = [];

export async function loadHorizon(siteId: string): Promise<HorizonProfile | null> {
  try {
    const res = await fetch(`/horizons/${siteId}.json`);
    if (!res.ok) return null;
    return (await res.json()) as HorizonProfile;
  } catch {
    return null;
  }
}
