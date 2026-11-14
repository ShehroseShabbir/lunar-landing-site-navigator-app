// Rise/set TIMING validation of src/astro against 10-minute JPL Horizons tables (tests/fixtures/horizons/timing).
// Smooth-Moon horizon only (profile null): Horizons has no terrain. Horizons is never called here.
// Definitions are the app's (DR-HACK-10), derived from the Horizons table (az/el + angular diameter, airless):
//   sunUp / earthVisible: upper limb above 0 deg  -> el + angDiam/2 > 0   (angDiam from Horizons quantity 13)
//   powerOk:              Sun centre above 0 deg  -> el >= 0
//   commsOk:              Earth centre >= 0.5 deg -> el - 0.5 >= 0   (Earth "centre at 0 deg" is not an app state; 0.5 deg is)
// Horizons crossing = linear interpolation of that margin between the two 10-min samples that bracket the sign change.
// Ours = scanWindows window starts/ends (not clipped), and nextCrossing must agree with them to <= 1 min.
//
// Bound (stated, not tuned): an angular error e shifts a crossing by e / |rate|, rate = |d margin / dt| at the crossing
// (taken from the table itself). Budget e = 0.01 deg: the S1b suite measured max 0.0063 deg (src/data/validation.json,
// plan.md section 4 tolerance is 0.05), rounded up for the angular-diameter difference. Plus 1.5 min for the 1-minute
// bisection midpoint (+-0.5 min), ms rounding and linear-interpolation curvature. Per event:
//   |dt| <= 0.01 deg / |rate| + 1.5 min.
// Near the pole |rate| is tiny (the Sun's elevation swings only about +-1.5 deg per 27 days), so minutes-to-hour bounds are expected there.
// Set WRITE_VALIDATION=1 to append the `timing` block to src/data/validation.json (other fields untouched).
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { nextCrossing, scanWindows, COMMS_MARGIN_DEG, type VisState } from '../../src/astro';

const ANG_BUDGET_DEG = 0.01;
const FIXED_MIN = 1.5;
const FIX = new URL('../fixtures/horizons/timing/', import.meta.url);
const SITE_IDS = ['connecting_ridge', 'chandrayaan3'] as const;
const STATES: { state: VisState; body: 'sun' | 'earth'; limb: boolean; label: string }[] = [
  { state: 'sunUp', body: 'sun', limb: true, label: 'Sun upper limb 0 deg' },
  { state: 'powerOk', body: 'sun', limb: false, label: 'Sun centre 0 deg' },
  { state: 'earthVisible', body: 'earth', limb: true, label: 'Earth upper limb 0 deg' },
  { state: 'commsOk', body: 'earth', limb: false, label: 'Earth centre 0.5 deg' },
];

type Row = [number, number, number, number]; // unix s, az, el, angDiam arcsec
interface Fixture { site: { id: string; latDeg: number; lonDeg: number }; fetchedAt: string; settings: { start: string; stop: string; step: string }; sun: Row[]; earth: Row[] }
const load = (id: string): Fixture => JSON.parse(readFileSync(new URL(`${id}.json`, FIX), 'utf8'));

interface Event { kind: 'rise' | 'set'; tMs: number; tSampleMs: number; rateDegPerMin: number }

function horizonsEvents(rows: Row[], limb: boolean, centreOffsetDeg: number): Event[] {
  const margin = rows.map((r) => r[2] + (limb ? r[3] / 3600 / 2 : -centreOffsetDeg));
  const out: Event[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = margin[i], b = margin[i + 1];
    const onA = limb ? a > 0 : a >= 0, onB = limb ? b > 0 : b >= 0;
    if (onA === onB) continue;
    const frac = a / (a - b);
    out.push({ kind: onB ? 'rise' : 'set', tMs: (rows[i][0] + frac * (rows[i + 1][0] - rows[i][0])) * 1000, tSampleMs: rows[i][0] * 1000, rateDegPerMin: Math.abs(b - a) / ((rows[i + 1][0] - rows[i][0]) / 60) });
  }
  return out;
}

interface Result { site: string; body: string; state: string; definition: string; events: number; maxAbsErrMin: number; worstRateDegPerHr: number; worstBoundMin: number; worstAtUtc: string }
const results: Result[] = [];

describe('rise/set timing vs 10-minute JPL Horizons table (smooth Moon, airless)', () => {
  for (const id of SITE_IDS) {
    for (const s of STATES) {
      it(`${id} ${s.label}: crossings within angular-budget bound`, () => {
        const fx = load(id);
        const rows = fx[s.body];
        expect(rows.length).toBe(4321);
        const events = horizonsEvents(rows, s.limb, s.state === 'commsOk' ? COMMS_MARGIN_DEG : 0);
        const site = { latDeg: fx.site.latDeg, lonDeg: fx.site.lonDeg, heightM: 0 };
        const start = new Date(rows[0][0] * 1000), end = new Date(rows[rows.length - 1][0] * 1000);
        const scan = scanWindows(site, null, start, end)[s.state];
        const ours = {
          rise: scan.filter((w) => !w.clippedStart).map((w) => w.start.getTime()),
          set: scan.filter((w) => !w.clippedEnd).map((w) => w.end.getTime()),
        };
        let maxErr = 0, worst: Event | null = null, worstBound = 0;
        for (const ev of events) {
          const cands = ours[ev.kind];
          const near = cands.reduce((best, t) => (Math.abs(t - ev.tMs) < Math.abs(best - ev.tMs) ? t : best), Infinity);
          expect(Number.isFinite(near), `no ${ev.kind} of ours near ${new Date(ev.tMs).toISOString()}`).toBe(true);
          const dtMin = Math.abs(near - ev.tMs) / 60_000;
          const bound = ANG_BUDGET_DEG / ev.rateDegPerMin + FIXED_MIN;
          expect(dtMin, `${id} ${s.state} ${ev.kind} ${new Date(ev.tMs).toISOString()}: ${dtMin.toFixed(2)} min vs bound ${bound.toFixed(2)}`).toBeLessThanOrEqual(bound);
          if (dtMin > maxErr || !worst) { maxErr = dtMin; worst = ev; worstBound = bound; }
          // nextCrossing from the sample just before the event must match the scan result
          const nc = nextCrossing(s.state, ev.kind, site, null, new Date(ev.tSampleMs), 1);
          expect(nc, 'nextCrossing found nothing').not.toBeNull();
          expect(Math.abs((nc as Date).getTime() - near) / 60_000).toBeLessThanOrEqual(1);
        }
        // every crossing of ours (excluding clipped ends) has a Horizons counterpart: same event counts
        expect(ours.rise.length, 'rise count differs').toBe(events.filter((e) => e.kind === 'rise').length);
        expect(ours.set.length, 'set count differs').toBe(events.filter((e) => e.kind === 'set').length);
        results.push({
          site: id, body: s.body, state: s.state, definition: s.label, events: events.length,
          maxAbsErrMin: maxErr, worstRateDegPerHr: worst ? worst.rateDegPerMin * 60 : 0, worstBoundMin: worstBound,
          worstAtUtc: worst ? new Date(worst.tMs).toISOString() : '',
        });
      });
    }
  }

  afterAll(() => {
    console.table(results.map((r) => ({ site: r.site, state: r.state, definition: r.definition, events: r.events, maxAbsErrMin: +r.maxAbsErrMin.toFixed(2), worstRateDegPerHr: +r.worstRateDegPerHr.toFixed(4), worstBoundMin: +r.worstBoundMin.toFixed(1) })));
    if (process.env.WRITE_VALIDATION !== '1' || results.length !== SITE_IDS.length * STATES.length) return;
    const maxAbsErrMin: Record<string, Record<string, number>> = {};
    for (const r of results) {
      maxAbsErrMin[r.site] ??= {};
      maxAbsErrMin[r.site][r.body] = Math.max(maxAbsErrMin[r.site][r.body] ?? 0, r.maxAbsErrMin);
    }
    const fx = load(SITE_IDS[0]);
    const path = new URL('../../src/data/validation.json', import.meta.url);
    const cur = JSON.parse(readFileSync(path, 'utf8'));
    cur.timing = {
      source: 'JPL Horizons API, 10-minute table, airless, site height 0',
      sites: [...SITE_IDS],
      span: { start: fx.settings.start, stop: fx.settings.stop, step: fx.settings.step },
      smoothMoonHorizon: true,
      definition: 'Rise/set = linear interpolation of the Horizons margin between 10-min samples. Sun: upper limb above 0 deg (angular diameter from Horizons) and centre above 0 deg. Earth: upper limb above 0 deg and centre at 0.5 deg (the app comms margin). Compared with scanWindows/nextCrossing (1-minute refinement).',
      boundRule: `|dt| <= ${ANG_BUDGET_DEG} deg / |rate| + ${FIXED_MIN} min per event`,
      maxAbsErrMin,
      perState: results.map((r) => ({ site: r.site, body: r.body, state: r.state, events: r.events, maxAbsErrMin: r.maxAbsErrMin, worstRateDegPerHr: r.worstRateDegPerHr, worstBoundMin: r.worstBoundMin })),
      fixturesFetchedAt: fx.fetchedAt,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(cur, null, 2) + '\n');
  });
});
