// Illumination sanity check (plan.md section 5, "Validity check"): hourly Sun visibility at
// Connecting Ridge C1 and Shackleton rim S0 from our committed terrain profiles, set beside
// Glaser et al. 2018 (PSS, https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf).
//
// Glaser's two metrics, from the paper's own definitions:
//  - "solar visibility": "the percentage of a given period in which any portion of the Sun is
//    visible" -> compare with our % sunUp (upper limb above the terrain horizon).
//  - "average illumination": "summing up and averaging all visible fractions of the solar disk"
//    -> compare with our time-mean of visibleFraction.
// Both C1 (88.0 / 92.1) and S0 (85.5 / 89.4) come from Glaser Table 2, i.e. at TWO METRES above
// ground, averaged hourly over 2017-01-01 to 2037-01-01 on 20 m LOLA DTMs. They are
// (average illumination / solar visibility), not (surface / 2 m).
// Our % powerOk (visible fraction >= 0.5) has no Glaser counterpart; it is reported only.
//
// This is a sanity check, not a fit: assertions are loose (10 percentage points) and nothing is tuned.
// Runs calendar year 2027 (UTC) and Glaser's full 20-year period, both hourly (about 2 s in all).
// WRITE_VALIDATION=1 appends an `illumination` block to src/data/validation.json (other fields kept).
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { altAzFrom, ephemSnapshot, siteFrame, type SiteFrame } from '../../src/astro/ephem';
import { horizonElevAt, visibleFraction } from '../../src/astro/horizon';
import { stateIsOn, stateMargin } from '../../src/astro/windows';
import type { HorizonProfile } from '../../src/astro/types';
import { parseHorizonProfile } from '../../src/data/horizons';
import { getSite, siteGeo } from '../../src/data/sites';

const HOUR_MS = 3_600_000;
const LOOSE_PP = 10;
const SITE_IDS = ['connecting_ridge', 'shackleton_rim'] as const;
type SiteId = (typeof SITE_IDS)[number];

/** Glaser et al. 2018, Table 2 (2 m above ground, hourly, 2017-01-01 to 2037-01-01). */
const GLASER: Record<SiteId, { label: string; latDeg: number; lonEastDeg: number; averageIlluminationPct: number; solarVisibilityPct: number }> = {
  connecting_ridge: { label: 'Connecting Ridge C1', latDeg: -89.4398, lonEastDeg: 222.83, averageIlluminationPct: 88.0, solarVisibilityPct: 92.1 },
  shackleton_rim: { label: 'Shackleton S0', latDeg: -89.6866, lonEastDeg: 197.19, averageIlluminationPct: 85.5, solarVisibilityPct: 89.4 },
};

interface SiteResult { sunUpPct: number; powerOkPct: number; meanVisibleFractionPct: number }
interface SpanResult { startUtc: string; endUtc: string; samples: number; runtimeMs: number; perSite: Record<SiteId, SiteResult> }

const loadProfile = (id: string): HorizonProfile =>
  parseHorizonProfile(JSON.parse(readFileSync(new URL(`../../public/horizons/${id}.json`, import.meta.url), 'utf8')), id);

/**
 * Hourly samples on [start, end). One ephemeris snapshot per hour, shared by both sites.
 * Site geometry is exactly what the app uses (siteGeo: height 0 on the 1737.4 km sphere); the
 * 2 m observer height lives in the horizon profile. The Sun's direction changes by < 1e-6 deg
 * between height 0 and the true ~2 km radius offset, so this does not affect the result.
 */
function sweep(startUtc: string, endUtc: string): SpanResult {
  const t0 = Date.parse(startUtc);
  const t1 = Date.parse(endUtc);
  const sites = SITE_IDS.map((id) => {
    const s = getSite(id);
    if (!s) throw new Error(`site ${id} missing from sites.json`);
    return { id, frame: siteFrame(siteGeo(s)) as SiteFrame, profile: loadProfile(id), up: 0, ok: 0, frac: 0 };
  });
  const began = performance.now();
  let n = 0;
  for (let t = t0; t < t1; t += HOUR_MS) {
    const snap = ephemSnapshot(new Date(t), true);
    for (const s of sites) {
      const sun = altAzFrom('Sun', s.frame, snap);
      if (stateIsOn('sunUp', stateMargin('sunUp', sun, s.profile))) s.up++;
      if (stateIsOn('powerOk', stateMargin('powerOk', sun, s.profile))) s.ok++;
      s.frac += visibleFraction(sun.elDeg, horizonElevAt(s.profile, sun.azDeg), sun.angDiamDeg);
    }
    n++;
  }
  const perSite = {} as Record<SiteId, SiteResult>;
  for (const s of sites) {
    perSite[s.id] = { sunUpPct: (100 * s.up) / n, powerOkPct: (100 * s.ok) / n, meanVisibleFractionPct: (100 * s.frac) / n };
  }
  return { startUtc, endUtc, samples: n, runtimeMs: performance.now() - began, perSite };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function printTable(title: string, r: SpanResult) {
  console.log(`${title}: ${r.startUtc} to ${r.endUtc}, ${r.samples} hourly samples, ${(r.runtimeMs / 1000).toFixed(1)} s`);
  console.table(
    SITE_IDS.map((id) => ({
      site: GLASER[id].label,
      'our sunUp %': r1(r.perSite[id].sunUpPct),
      'Glaser solar visibility % (2 m)': GLASER[id].solarVisibilityPct,
      'our mean visible fraction %': r1(r.perSite[id].meanVisibleFractionPct),
      'Glaser average illumination % (2 m)': GLASER[id].averageIlluminationPct,
      'our powerOk % (>= 0.5)': r1(r.perSite[id].powerOkPct),
    })),
  );
}

const results: { year2027?: SpanResult; glaserPeriod?: SpanResult } = {};

describe('illumination vs Glaser et al. 2018 (sanity check, loose)', () => {
  it('site coordinates match Glaser Table 2', () => {
    for (const id of SITE_IDS) {
      const s = getSite(id)!;
      const g = GLASER[id];
      expect(Math.abs(s.lat - g.latDeg)).toBeLessThan(1e-4);
      const dLon = ((((s.lon - g.lonEastDeg + 180) % 360) + 360) % 360) - 180;
      expect(Math.abs(dLon)).toBeLessThan(1e-2);
    }
  });

  it('2027 hourly: within 10 percentage points of Glaser; consistent ordering', () => {
    const r = sweep('2027-01-01T00:00:00Z', '2028-01-01T00:00:00Z');
    results.year2027 = r;
    expect(r.samples).toBe(8760);
    for (const id of SITE_IDS) {
      const p = r.perSite[id];
      expect(p.powerOkPct).toBeLessThanOrEqual(p.sunUpPct);
      expect(p.meanVisibleFractionPct).toBeLessThanOrEqual(p.sunUpPct);
      expect(Math.abs(p.sunUpPct - GLASER[id].solarVisibilityPct)).toBeLessThanOrEqual(LOOSE_PP);
      expect(Math.abs(p.meanVisibleFractionPct - GLASER[id].averageIlluminationPct)).toBeLessThanOrEqual(LOOSE_PP);
    }
  }, 120_000);

  it('Glaser period 2017-2037 hourly: within 10 percentage points of Glaser', () => {
    const r = sweep('2017-01-01T00:00:00Z', '2037-01-01T00:00:00Z');
    results.glaserPeriod = r;
    for (const id of SITE_IDS) {
      expect(Math.abs(r.perSite[id].sunUpPct - GLASER[id].solarVisibilityPct)).toBeLessThanOrEqual(LOOSE_PP);
      expect(Math.abs(r.perSite[id].meanVisibleFractionPct - GLASER[id].averageIlluminationPct)).toBeLessThanOrEqual(LOOSE_PP);
    }
  }, 300_000);

  afterAll(() => {
    if (results.year2027) printTable('Year 2027', results.year2027);
    if (results.glaserPeriod) printTable('Glaser period', results.glaserPeriod);
    if (process.env.WRITE_VALIDATION !== '1' || !results.year2027 || !results.glaserPeriod) return;
    const main = results.glaserPeriod;
    const pct = (r: SpanResult) =>
      Object.fromEntries(
        SITE_IDS.map((id) => [id, {
          sunUp: r1(r.perSite[id].sunUpPct),
          meanVisibleFraction: r1(r.perSite[id].meanVisibleFractionPct),
          powerOk: r1(r.perSite[id].powerOkPct),
        }]),
      );
    const path = new URL('../../src/data/validation.json', import.meta.url);
    const existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    existing.illumination = {
      sites: [...SITE_IDS],
      span: { startUtc: main.startUtc, endUtc: main.endUtc, stepHours: 1, samples: main.samples },
      definition: {
        sunUp: 'percent of hourly samples with any part of the Sun above the terrain horizon (upper limb, horizon at the Sun centre azimuth); compare with Glaser "solar visibility"',
        meanVisibleFraction: 'time-mean of the visible solar-disc fraction (horizontal cut at the horizon); compare with Glaser "average illumination"',
        powerOk: 'percent of hourly samples with visible fraction >= 0.5 (Sun centre at or above the terrain horizon); no Glaser counterpart',
        observer: 'terrain + 2 m (committed public/horizons profiles: 720 great-circle rays at 0.5 deg to 300 km; LOLA 5 m site DEM to 5 km, then LDEM_80S_80M and LDEM_75S_240M)',
      },
      ourPct: pct(main),
      ourPctYear2027: { startUtc: results.year2027.startUtc, endUtc: results.year2027.endUtc, samples: results.year2027.samples, ...pct(results.year2027) },
      glaserPct: Object.fromEntries(
        SITE_IDS.map((id) => [id, { label: GLASER[id].label, solarVisibility: GLASER[id].solarVisibilityPct, averageIllumination: GLASER[id].averageIlluminationPct }]),
      ),
      glaserSource: 'Glaser et al. 2018, Table 2: 2 m above ground, hourly 2017-01-01 to 2037-01-01, 20 m LOLA DTM. https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf',
      notes: [
        'Sanity check only, not a calibration: nothing was tuned to match.',
        'Same coordinates and same averaging period as Glaser Table 2. Expected differences: different DEMs (our 5 m site DEM near field plus 80 m / 240 m to 300 km vs their 20 m DTM over 400 x 400 km); our horizon is one 720-ray profile at a point, theirs a per-pixel horizon map; their coordinate is the best pixel of a cluster on their DTM, so small position or DEM shifts tend to lower our value there; ephemeris and lunar orientation models differ.',
        'The 2027 one-year values differ from the 20-year means because polar Sun geometry varies from year to year (18.6-year lunar precession cycle).',
      ],
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(existing, null, 2) + '\n');
  });
});
