import type { ScanResult, VisWindow } from '../../astro/types';

export interface CsvScenario {
  label: string;
  siteName: string;
  lat: number;
  lon: number;
  rangeStart: Date;
  scan: ScanResult;
}

export const CSV_HEADER =
  'scenario,site,lat_deg,lon_deg,state,start_utc,end_utc,duration_h,clipped_start,clipped_end,max_el_deg';

const STATES = ['sunUp', 'powerOk', 'earthVisible', 'commsOk', 'both'] as const;
const STATE_NAMES: Record<(typeof STATES)[number], string> = {
  sunUp: 'sun_up',
  powerOk: 'power_ok',
  earthVisible: 'earth_visible',
  commsOk: 'comms_ok',
  both: 'both',
};

/** RFC 4180: quote when the field has a comma, quote, CR or LF; double embedded quotes. */
export function csvField(v: string | number | boolean): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function iso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function row(s: CsvScenario, state: string, w: VisWindow): string {
  const hours = (w.end.getTime() - w.start.getTime()) / 3_600_000;
  return [
    s.label,
    s.siteName,
    s.lat.toFixed(4),
    s.lon.toFixed(4),
    state,
    iso(w.start),
    iso(w.end),
    hours.toFixed(2),
    w.clippedStart,
    w.clippedEnd,
    w.maxElDeg.toFixed(1),
  ]
    .map(csvField)
    .join(',');
}

/** Plain CSV (no comment lines), CRLF line endings per RFC 4180. */
export function buildWindowsCsv(scenarios: CsvScenario[]): string {
  const lines = [CSV_HEADER];
  for (const s of scenarios) {
    for (const key of STATES) {
      for (const w of s.scan[key]) lines.push(row(s, STATE_NAMES[key], w));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

export function csvFileName(siteId: string, rangeStart: Date): string {
  const safe = siteId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'custom';
  const ymd = iso(rangeStart).slice(0, 10).replace(/-/g, '');
  return `lunar-windows-${safe}-${ymd}.csv`;
}
