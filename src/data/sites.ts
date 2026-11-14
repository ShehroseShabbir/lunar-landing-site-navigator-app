import raw from './sites.json';
import type { SiteGeo } from '../astro/types';

export interface Site {
  id: string;
  name: string;
  lat: number; // selenographic degrees, + north
  lon: number; // degrees, + east, -180..180
  mission: string;
  agency: string;
  status: string;
  region: string;
  sourceUrl: string;
  note: string;
}

export const SITES: readonly Site[] = raw as Site[];

export const DEFAULT_SITE_ID = 'connecting_ridge';

export interface SiteGroup {
  key: string;
  label: string;
  sites: Site[];
}

const SOUTH_POLE_MAX_LAT = -80;

function groupKey(s: Site): string {
  if (s.region === 'Reference points' || s.status === 'reference point') return 'reference';
  if (s.mission.startsWith('Apollo')) return 'apollo';
  if (s.lat <= SOUTH_POLE_MAX_LAT) {
    if (s.status === 'landed') return 'pole-landed';
    if (s.status === 'planned') return 'pole-planned';
    return 'pole-candidate';
  }
  return 'other';
}

const GROUP_LABELS: [string, string][] = [
  ['pole-landed', 'South pole: landed'],
  ['pole-planned', 'South pole: planned'],
  ['pole-candidate', 'South pole: candidate regions'],
  ['apollo', 'Apollo'],
  ['other', 'Other programmes'],
  ['reference', 'Reference points (crater or tile centres, not the named region)'],
];

/** Sites grouped for the picker, in display order; empty groups are omitted. */
export function groupSites(sites: readonly Site[] = SITES): SiteGroup[] {
  return GROUP_LABELS.map(([key, label]) => ({
    key,
    label,
    sites: sites.filter((s) => groupKey(s) === key),
  })).filter((g) => g.sites.length > 0);
}

export function getSite(id: string): Site | undefined {
  return SITES.find((s) => s.id === id);
}

export function siteGeo(s: { lat: number; lon: number }): SiteGeo {
  return { latDeg: s.lat, lonDeg: s.lon };
}

/** Case-insensitive match on name, mission, region and agency. Empty query matches all. */
export function filterSites(sites: readonly Site[], query: string): Site[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...sites];
  return sites.filter((s) =>
    [s.name, s.mission, s.region, s.agency].some((f) => f.toLowerCase().includes(q)),
  );
}
