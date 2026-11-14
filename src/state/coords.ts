// Custom-coordinate parsing and formatting. Degrees, + north, + east (-180..180).

export type ParseResult = { ok: true; value: number } | { ok: false; message: string };

function toNumber(input: string): number {
  const s = input.trim().replace(/−/g, '-');
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

export function parseLat(input: string): ParseResult {
  if (input.trim() === '') return { ok: false, message: 'Enter a latitude.' };
  const v = toNumber(input);
  if (!Number.isFinite(v)) return { ok: false, message: 'Latitude must be a number, like −89.9.' };
  if (v < -90 || v > 90) return { ok: false, message: 'Latitude must be between −90° and 90°.' };
  // Exactly +/-90 is a singular point (azimuth undefined); the app never accepts it.
  if (Math.abs(v) === 90) {
    return {
      ok: false,
      message: 'Latitude must be between −90° and 90°, not exactly ±90°. Try −89.99.',
    };
  }
  return { ok: true, value: v };
}

export function parseLon(input: string): ParseResult {
  if (input.trim() === '') return { ok: false, message: 'Enter a longitude.' };
  const v = toNumber(input);
  if (!Number.isFinite(v)) return { ok: false, message: 'Longitude must be a number, like 31.0.' };
  if (v > 180 && v <= 360) {
    return {
      ok: false,
      message: `Longitude must be between −180° and 180°. Did you mean ${fmtSigned(v - 360)}°?`,
    };
  }
  if (v < -180 || v > 180) {
    return { ok: false, message: 'Longitude must be between −180° and 180° (east is positive).' };
  }
  return { ok: true, value: v };
}

function fmtSigned(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r < 0 ? '−' : '') + Math.abs(r).toFixed(1).replace(/\.0$/, '');
}

/** `89.9° S · 0.0° E` */
export function formatCoords(latDeg: number, lonDeg: number): string {
  const ns = latDeg < 0 ? 'S' : 'N';
  const ew = lonDeg < 0 ? 'W' : 'E';
  return `${Math.abs(latDeg).toFixed(1)}° ${ns} · ${Math.abs(lonDeg).toFixed(1)}° ${ew}`;
}
