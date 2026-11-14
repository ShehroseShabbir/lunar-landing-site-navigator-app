import { describe, expect, it } from 'vitest';
import { SITES } from '../../data/sites';
import { HORIZON_SITE_IDS } from '../../data/horizons';
import { rankNumbers, rankOrder, rankVerdict, rankableSites, sortRows, type RankRow } from './logic';
import { hashWithRank, isRankHash } from './route';

const row = (siteId: string, bothPct: number, darkHours: number, extra: Partial<RankRow> = {}): RankRow => ({
  siteId,
  name: siteId.toUpperCase(),
  sunPct: 90,
  earthPct: 80,
  bothPct,
  darkHours,
  darkClipped: false,
  ...extra,
});

describe('rankOrder', () => {
  it('orders by Both at once, highest first', () => {
    const o = rankOrder([row('a', 40, 5), row('b', 78, 5), row('c', 60, 5)]);
    expect(o.map((r) => r.siteId)).toEqual(['b', 'c', 'a']);
  });
  it('breaks ties with the shorter longest dark period', () => {
    const o = rankOrder([row('a', 50, 30), row('b', 50, 10), row('c', 50, 20)]);
    expect(o.map((r) => r.siteId)).toEqual(['b', 'c', 'a']);
  });
  it('treats values that display the same as tied', () => {
    const o = rankOrder([row('a', 50.2, 30), row('b', 49.8, 10)]);
    expect(o[0].siteId).toBe('b');
  });
  it('numbers rows by default position', () => {
    const n = rankNumbers([row('a', 10, 1), row('b', 90, 1)]);
    expect(n.get('b')).toBe(1);
    expect(n.get('a')).toBe(2);
  });
});

describe('sortRows', () => {
  const rows = [row('a', 40, 5, { sunPct: 70 }), row('b', 78, 9, { sunPct: 95 }), row('c', 60, 2, { sunPct: 70 })];
  it('sorts by a column and flips direction', () => {
    expect(sortRows(rows, 'sun', 'desc').map((r) => r.siteId)).toEqual(['b', 'c', 'a']);
    expect(sortRows(rows, 'dark', 'asc').map((r) => r.siteId)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'dark', 'desc').map((r) => r.siteId)).toEqual(['b', 'a', 'c']);
  });
  it('falls back to the default ranking on equal values', () => {
    expect(sortRows(rows, 'sun', 'asc').map((r) => r.siteId)).toEqual(['c', 'a', 'b']);
  });
});

describe('rankVerdict', () => {
  it('names the top site with its percentage when it has no dark period', () => {
    const v = rankVerdict([row('a', 40, 0, { name: 'Alpha' }), row('b', 78, 0, { name: 'Connecting Ridge (C1)' })]);
    expect(v).toBe('Connecting Ridge (C1) has the most time with both sunlight and Earth in view: 78%.');
  });
  it('warns about the top site dark period and names the best site without one', () => {
    const v = rankVerdict([
      row('a', 52, 332, { name: 'Athena', darkClipped: true }),
      row('b', 44, 0, { name: 'Ridge' }),
      row('c', 60, 10, { name: 'Gamma' }),
    ]);
    expect(v).toBe(
      'Gamma has the most time with both sunlight and Earth in view: 60%. But it has a dark period of 10 h. The best site with no dark period is Ridge: 44% both at once.',
    );
  });
  it('falls back to the shortest dark period when every site has one', () => {
    const v = rankVerdict([row('a', 60, 100, { name: 'A' }), row('b', 40, 20, { name: 'B' }), row('c', 30, 50, { name: 'C' })]);
    expect(v).toContain('The site with the shortest dark period is B (20 h): 40% both at once.');
  });
  it('gives the dark reason only when it broke the tie', () => {
    const broke = rankVerdict([row('a', 50, 5, { name: 'A' }), row('b', 50, 9, { name: 'B' })]);
    expect(broke).toContain('level with B.');
    expect(broke).toContain('It is listed first because its longest dark period is shorter');
    const level = rankVerdict([row('a', 50, 0, { name: 'A' }), row('b', 50, 0, { name: 'B' })]);
    expect(level).toContain('level with B.');
    expect(level).not.toContain('listed first');
  });
  it('is empty with no rows', () => {
    expect(rankVerdict([])).toBe('');
  });
});

describe('clipped dark periods', () => {
  it('sort after unclipped ones in the tie-break and in the dark column', () => {
    const rows = [row('a', 50, 2, { darkClipped: true }), row('b', 50, 9), row('c', 50, 5, { darkClipped: true })];
    expect(rankOrder(rows).map((r) => r.siteId)).toEqual(['b', 'a', 'c']);
    expect(sortRows(rows, 'dark', 'asc').map((r) => r.siteId)).toEqual(['b', 'a', 'c']);
  });
});

describe('rankableSites', () => {
  it('keeps only sites with terrain and drops the rest', () => {
    const out = rankableSites(SITES);
    expect(out.map((s) => s.id).sort()).toEqual([...HORIZON_SITE_IDS].sort());
    expect(out.length).toBe(14);
    expect(out.some((s) => s.id === 'apollo11')).toBe(false);
  });
});

describe('rank route', () => {
  it('recognises and builds the hash', () => {
    expect(isRankHash('#/rank')).toBe(true);
    expect(isRankHash('#/rank?tab=planner')).toBe(true);
    expect(isRankHash('#/compare')).toBe(false);
    expect(hashWithRank('#/?tab=planner', true)).toBe('#/rank?tab=planner');
    expect(hashWithRank('#/rank', false)).toBe('#/');
  });
});
