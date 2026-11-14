// Validates src/astro against committed JPL Horizons fixtures (tests/fixtures/horizons).
// Tolerance (plan.md section 4, DR-HACK-11): |d el| <= 0.05 deg and |d az| * cos(el) <= 0.05 deg, d az wrapped to +-180.
// Horizons is never called here. Set WRITE_VALIDATION=1 to write src/data/validation.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { bodyAltAz } from '../../src/astro';

const TOL_DEG = 0.05;
const FIX = new URL('../fixtures/horizons/', import.meta.url);

interface Point { utc: string; body: 'sun' | 'earth'; azDeg: number; elDeg: number }
interface Fixture { site: { id: string; latDeg: number; lonDeg: number; heightM: number }; fetchedAt: string; points: Point[] }

const load = (id: string): Fixture => JSON.parse(readFileSync(new URL(`${id}.json`, FIX), 'utf8'));
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const SITE_IDS = ['apollo11', 'chandrayaan3', 'connecting_ridge'];

interface Row { site: string; body: string; points: number; maxElErrDeg: number; maxAzCosElErrDeg: number }
const rows: Row[] = [];

function errors(fx: Fixture, p: Point) {
  const r = bodyAltAz(p.body === 'sun' ? 'Sun' : 'Earth', { latDeg: fx.site.latDeg, lonDeg: fx.site.lonDeg, heightM: 0 }, new Date(p.utc));
  const el = Math.abs(r.elDeg - p.elDeg);
  const az = Math.abs(wrap180(r.azDeg - p.azDeg)) * Math.cos((p.elDeg * Math.PI) / 180);
  return { el, az };
}

describe('astro vs JPL Horizons (Sun and Earth, airless, site height 0)', () => {
  for (const id of SITE_IDS) {
    for (const body of ['sun', 'earth'] as const) {
      it(`${id} ${body}: within ${TOL_DEG} deg`, () => {
        const fx = load(id);
        expect(fx.site.heightM).toBe(0);
        const pts = fx.points.filter((p) => p.body === body);
        expect(pts.length).toBe(27);
        let maxEl = 0, maxAz = 0, worst = '';
        for (const p of pts) {
          const e = errors(fx, p);
          if (e.el > maxEl) maxEl = e.el;
          if (e.az > maxAz) maxAz = e.az;
          if (Math.max(e.el, e.az) > TOL_DEG && !worst) worst = `${p.utc} el ${e.el.toFixed(4)} az*cos(el) ${e.az.toFixed(4)}`;
        }
        rows.push({ site: id, body, points: pts.length, maxElErrDeg: maxEl, maxAzCosElErrDeg: maxAz });
        expect(maxEl, `first failure: ${worst}`).toBeLessThanOrEqual(TOL_DEG);
        expect(maxAz, `first failure: ${worst}`).toBeLessThanOrEqual(TOL_DEG);
      });
    }
  }

  it('IM-1 reference point (Horizons 2024-02-22 00:00 UT, Sun)', () => {
    const fx = load('im1');
    const e = errors(fx, fx.points[0]);
    expect(e.el).toBeLessThanOrEqual(TOL_DEG);
    expect(e.az).toBeLessThanOrEqual(TOL_DEG);
  });

  afterAll(() => {
    console.table(rows.map((r) => ({ ...r, maxElErrDeg: +r.maxElErrDeg.toFixed(5), maxAzCosElErrDeg: +r.maxAzCosElErrDeg.toFixed(5) })));
    if (process.env.WRITE_VALIDATION !== '1' || rows.length !== SITE_IDS.length * 2) return;
    const maxEl = Math.max(...rows.map((r) => r.maxElErrDeg));
    const maxAz = Math.max(...rows.map((r) => r.maxAzCosElErrDeg));
    const out = {
      source: 'JPL Horizons API',
      toleranceDeg: TOL_DEG,
      pointCount: rows.reduce((s, r) => s + r.points, 0),
      sites: SITE_IDS,
      maxElErrDeg: maxEl,
      maxAzCosElErrDeg: maxAz,
      maxErrArcmin: Math.max(maxEl, maxAz) * 60,
      perSite: rows,
      fixturesFetchedAt: load(SITE_IDS[0]).fetchedAt,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(new URL('../../src/data/validation.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  });
});
