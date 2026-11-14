import { describe, expect, it } from 'vitest';
import type { ScanResult, VisWindow } from '../../astro/types';
import { buildWindowsCsv, csvField, csvFileName, CSV_HEADER } from './csv';

const w = (a: string, b: string, o: Partial<VisWindow> = {}): VisWindow => ({
  state: 'both',
  start: new Date(a),
  end: new Date(b),
  clippedStart: false,
  clippedEnd: false,
  maxElDeg: 3.14159,
  ...o,
});
const empty: ScanResult = { sunUp: [], powerOk: [], earthVisible: [], commsOk: [], both: [] };
const base = { label: 'A', siteName: 'Site', lat: -89.5, lon: 10, rangeStart: new Date('2027-01-02T00:00:00Z') };

describe('csv', () => {
  it('empty windows give header only', () => {
    expect(buildWindowsCsv([{ ...base, scan: empty }])).toBe(CSV_HEADER + '\r\n');
    expect(buildWindowsCsv([])).toBe(CSV_HEADER + '\r\n');
  });
  it('formats ISO UTC, duration, clipped flags', () => {
    const scan = {
      ...empty,
      both: [w('2027-01-02T00:00:00.000Z', '2027-01-02T06:30:00.000Z', { clippedStart: true })],
    };
    const lines = buildWindowsCsv([{ ...base, scan }]).trim().split('\r\n');
    expect(lines[1]).toBe('A,Site,-89.5000,10.0000,both,2027-01-02T00:00:00Z,2027-01-02T06:30:00Z,6.50,true,false,3.1');
  });
  it('quotes commas and quotes', () => {
    expect(csvField('Shackleton, "rim"')).toBe('"Shackleton, ""rim"""');
    const scan = { ...empty, sunUp: [w('2027-01-02T00:00:00Z', '2027-01-02T01:00:00Z')] };
    expect(buildWindowsCsv([{ ...base, siteName: 'a,b', scan }])).toContain('A,"a,b",');
  });
  it('emits state names in order across scenarios', () => {
    const win = w('2027-01-02T00:00:00Z', '2027-01-02T01:00:00Z');
    const scan = { ...empty, sunUp: [win], commsOk: [win] };
    const out = buildWindowsCsv([{ ...base, scan }, { ...base, label: 'B', scan }]).trim().split('\r\n');
    expect(out.map((l) => l.split(',')[4]).slice(1)).toEqual(['sun_up', 'comms_ok', 'sun_up', 'comms_ok']);
  });
  it('file name', () => {
    expect(csvFileName('site-01', new Date('2027-01-02T23:00:00Z'))).toBe('lunar-windows-site-01-20270102.csv');
    expect(csvFileName('custom:-89.5,10', new Date('2027-01-02T00:00:00Z'))).toBe(
      'lunar-windows-custom-89-5-10-20270102.csv',
    );
  });
});
