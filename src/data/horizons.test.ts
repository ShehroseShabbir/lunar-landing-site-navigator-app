import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HORIZON_SAMPLES,
  HORIZON_SITE_IDS,
  clearHorizonCache,
  hasHorizonProfile,
  horizonUrl,
  loadHorizon,
  parseHorizonProfile,
} from './horizons';
import { SITES } from './sites';

const files = import.meta.glob('../../public/horizons/*.json', { eager: true, import: 'default' });
const byId = new Map(
  Object.entries(files).map(([path, data]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), data]),
);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('horizon profile files', () => {
  it('HORIZON_SITE_IDS matches public/horizons exactly', () => {
    expect([...byId.keys()].sort()).toEqual([...HORIZON_SITE_IDS].sort());
  });

  it('every file parses and has 720 samples at 0.5 deg', () => {
    for (const [id, data] of byId) {
      const p = parseHorizonProfile(data, id);
      expect(p.az0).toBe(0);
      expect(p.azStepDeg).toBe(0.5);
      expect(p.elevDeg).toHaveLength(HORIZON_SAMPLES);
      expect(p.distKm).toHaveLength(HORIZON_SAMPLES);
    }
  });

  it('every catalogue site at lat <= -80 has a profile, and no other site does', () => {
    for (const s of SITES) expect(hasHorizonProfile(s.id)).toBe(s.lat <= -80);
  });
});

describe('loadHorizon', () => {
  let urls: string[] = [];

  function stubFetch(respond: () => Response | Promise<Response>): void {
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return respond();
    });
  }

  beforeEach(() => {
    clearHorizonCache();
    urls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches /horizons/<id>.json, returns the profile and caches it', async () => {
    stubFetch(() => jsonResponse(byId.get('connecting_ridge')));
    const p = await loadHorizon('connecting_ridge');
    expect(urls).toEqual(['/horizons/connecting_ridge.json']);
    expect(p?.siteId).toBe('connecting_ridge');
    expect(p?.elevDeg).toHaveLength(HORIZON_SAMPLES);
    expect(p?.nearFieldResM).toBe(5);
    await loadHorizon('connecting_ridge');
    expect(urls).toHaveLength(1);
  });

  it('returns null without fetching for a site with no profile', async () => {
    stubFetch(() => jsonResponse({}));
    expect(await loadHorizon('apollo11')).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it('returns null on 404, a network error and an HTML fallback page', async () => {
    stubFetch(() => new Response('missing', { status: 404 }));
    expect(await loadHorizon('im1')).toBeNull();
    stubFetch(() => Promise.reject(new TypeError('network down')));
    expect(await loadHorizon('im1')).toBeNull();
    stubFetch(() => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await loadHorizon('im1')).toBeNull();
  });

  it('returns null for a file without 720 samples, and retries later', async () => {
    const good = byId.get('im1') as Record<string, unknown>;
    stubFetch(() => jsonResponse({ ...good, elevDeg: (good.elevDeg as number[]).slice(0, 719) }));
    expect(await loadHorizon('im1')).toBeNull();
    stubFetch(() => jsonResponse(good));
    expect((await loadHorizon('im1'))?.siteId).toBe('im1');
  });

  it('builds the URL from the site id', () => {
    expect(horizonUrl('shackleton_rim')).toBe('/horizons/shackleton_rim.json');
  });
});
