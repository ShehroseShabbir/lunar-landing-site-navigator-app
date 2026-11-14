// Re-measures every number quoted in the tour copy (prep/tour-copy.md section 3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteMetrics } from '../../../astro';
import type { HorizonProfile, SiteMetrics } from '../../../astro';
import { getSite, siteGeo } from '../../../data/sites';
import { parseHorizonProfile } from '../../../data/horizons';
import { formatDeg, formatFraction, formatLongestDark, formatPercent } from '../../Metrics/format';
import { TOUR_STEPS } from './tourSteps';

function measure(step: (typeof TOUR_STEPS)[number], profile: HorizonProfile | null): SiteMetrics {
  const site = getSite(step.siteId);
  if (!site) throw new Error(`unknown site ${step.siteId}`);
  return siteMetrics(siteGeo(site), profile, new Date(step.tIso), new Date(step.startIso));
}

const ridgeProfile = parseHorizonProfile(
  JSON.parse(readFileSync(new URL('../../../../public/horizons/connecting_ridge.json', import.meta.url), 'utf8')),
  'connecting_ridge',
);

describe('tour copy matches siteMetrics', () => {
  it('step 1: Apollo 11, smooth Moon', () => {
    const m = measure(TOUR_STEPS[0], null);
    expect(formatDeg(m.sun.aboveHorizonDeg)).toBe('43.1°');
    expect(formatPercent(m.pctPowerOk)).toBe('51%');
    expect(formatPercent(m.pctCommsOk)).toBe('100%');
    expect(formatLongestDark(m.longestDarkHours, m.longestDarkClipped)).toBe('14 d 16 h');
    for (const text of ['43.1°', '51%', '14 d 16 h']) expect(TOUR_STEPS[0].body).toContain(text);
  });

  it('step 2: Connecting Ridge Sun close-up', () => {
    const m = measure(TOUR_STEPS[1], ridgeProfile);
    expect(formatDeg(m.sun.aboveHorizonDeg)).toBe('0.2°');
    expect(formatFraction(m.sun.visibleFraction)).toBe('90%');
    for (const text of ['0.2°', '90%']) expect(TOUR_STEPS[1].body).toContain(text);
  });

  it('step 3: Connecting Ridge 30-day window, plus the Apollo 11 comparison', () => {
    const m = measure(TOUR_STEPS[2], ridgeProfile);
    expect(formatPercent(m.pctPowerOk)).toBe('66%');
    expect(formatPercent(m.pctCommsOk)).toBe('55%');
    expect(formatPercent(m.pctBoth)).toBe('32%');
    expect(formatLongestDark(m.longestDarkHours, m.longestDarkClipped)).toBe('3 d 4 h');
    for (const text of ['66%', '55%', '32%', '3 d 4 h', 'Comms OK 100%', 'Power OK only 51%']) {
      expect(TOUR_STEPS[2].body).toContain(text);
    }
  });
});
