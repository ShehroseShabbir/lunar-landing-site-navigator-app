// Plain-language answers for the answer card (visual-spec v2, "Answer card" state table). No astronomy here.
import { nextCrossing } from '../../astro';
import type { HorizonProfile, ScanResult, SiteGeo, SiteMetrics } from '../../astro/types';
import { countdown, formatDuration, RANGE_LIMIT_DAYS } from './format';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
const REFINE_MS = 60_000; // same tolerance as format.okRow

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "1 day 7 hours", "47 minutes", "1 hour", "less than a minute". Largest two units, zero units dropped, never negative. */
export function spellDuration(ms: number): string {
  const total = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / MIN_MS);
  if (total < 1) return 'less than a minute';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (d) parts.push(plural(d, 'day'));
  if (h) parts.push(plural(h, 'hour'));
  if (m) parts.push(plural(m, 'minute'));
  return parts.slice(0, 2).join(' ');
}

export interface Answer {
  word: 'Yes' | 'Not yet' | 'Not now' | 'No';
  sentence: string;
  /** Small line in the ui-spec format ("1 d 7 h"). */
  precise: string;
}

type Windows = ScanResult['powerOk'];

/** What is needed to look past the end of the scan range. */
export interface AnswerCtx {
  site: SiteGeo;
  profile: HorizonProfile | null;
  rangeEnd: Date;
}

interface Spec {
  state: 'powerOk' | 'commsOk';
  kind: 'Power' | 'Comms';
  laterWord: 'Not yet' | 'Not now';
  laterPhrase: string;
}

function answer(spec: Spec, ok: boolean, t: Date, ends: Date | null, windows: Windows | null, ctx?: AnswerCtx): Answer {
  const { kind } = spec;
  const tMs = t.getTime();
  if (ok) {
    const left = ends ? ends.getTime() - tMs : null;
    if (left === null || left >= RANGE_LIMIT_DAYS * DAY_MS) {
      return { word: 'Yes', sentence: `For the whole next ${RANGE_LIMIT_DAYS} days`, precise: `${kind} OK` };
    }
    return {
      word: 'Yes',
      sentence: `For another ${spellDuration(left)}`,
      precise: `${kind} OK · for another ${countdown(t, ends)}`,
    };
  }
  let nextStartMs: number | null = windows?.find((w) => w.start.getTime() > tMs - REFINE_MS)?.start.getTime() ?? null;
  if (nextStartMs === null && ctx) {
    // No later window inside the range: search on from the range end. Limit: 30 days after t.
    const fromMs = Math.max(tMs, ctx.rangeEnd.getTime());
    const limitDays = RANGE_LIMIT_DAYS - (fromMs - tMs) / DAY_MS;
    const found = limitDays > 0 ? nextCrossing(spec.state, 'rise', ctx.site, ctx.profile, new Date(fromMs), limitDays) : null;
    nextStartMs = found ? found.getTime() : null;
  }
  if (nextStartMs !== null) {
    const wait = Math.max(0, nextStartMs - tMs);
    return {
      word: spec.laterWord,
      sentence: `${spec.laterPhrase} ${spellDuration(wait)}`,
      precise: `${kind} not OK · ${kind} OK in ${formatDuration(wait)}`,
    };
  }
  return { word: 'No', sentence: `Not in the next ${RANGE_LIMIT_DAYS} days`, precise: `${kind} not OK in range` };
}

/** "Sunlight for power?" */
export function answerPower(m: SiteMetrics, t: Date, scan: ScanResult | null, ctx?: AnswerCtx): Answer {
  return answer({ state: 'powerOk', kind: 'Power', laterWord: 'Not yet', laterPhrase: 'Back in' }, m.sun.powerOk, t, m.sun.powerOkEnds, scan?.powerOk ?? null, ctx);
}

/** "Earth in view for radio?" */
export function answerComms(m: SiteMetrics, t: Date, scan: ScanResult | null, ctx?: AnswerCtx): Answer {
  return answer({ state: 'commsOk', kind: 'Comms', laterWord: 'Not now', laterPhrase: 'In view again in' }, m.earth.commsOk, t, m.earth.commsOkEnds, scan?.commsOk ?? null, ctx);
}

function featureOf(name: string): string {
  if (/\bmassif\b/i.test(name)) return 'mountain';
  if (/\brim\b/i.test(name)) return 'crater rim';
  if (/\bridge\b/i.test(name)) return 'ridge';
  return 'site';
}

/** Context sentence for terrain sites only; null otherwise. */
export function contextSentence(siteName: string, hasTerrain: boolean, latDeg: number): string | null {
  if (!hasTerrain) return null;
  const feature = featureOf(siteName);
  const pole = latDeg >= 0 ? 'north' : 'south';
  return `${siteName} is a ${feature} near the Moon's ${pole} pole. The Sun stays low here, so ridges can hide it for days at a time.`;
}

export const FAR_SIDE_LINE = 'Far-side site: Earth is never in view; missions use a relay satellite.';

/**
 * Far-side rule (no existing helper in format.ts or ui-spec): Earth is never visible in the range
 * (pctEarthVisible <= 0) AND |lon| > 90 AND |lat| < 80 (near the poles, terrain alone can hide Earth).
 */
export function farSideLine(m: Pick<SiteMetrics, 'pctEarthVisible'>, lonDeg: number, latDeg: number): string | null {
  return m.pctEarthVisible <= 0 && Math.abs(lonDeg) > 90 && Math.abs(latDeg) < 80 ? FAR_SIDE_LINE : null;
}
