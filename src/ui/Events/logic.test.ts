import { describe, expect, it } from 'vitest';
import type { SiteEvent, TriggerRule } from '../../state/events.types';
import {
  PRESETS,
  eventActionLabel,
  eventSentence,
  filterEvents,
  icsFileName,
  mergeCoinciding,
  nextRuleId,
  openingStamp,
  parseOptionalNumber,
  relativeTime,
  ruleFromPreset,
  rulesFromSearch,
  sanitizeRule,
  searchWithRules,
  utcWords,
} from './logic';

const t0 = new Date('2026-11-20T02:00:00Z');
const ev = (kind: SiteEvent['kind'], iso: string): SiteEvent => ({ kind, t: new Date(iso) });

describe('relative time and wording', () => {
  it('future, past and now', () => {
    expect(relativeTime(t0, new Date('2026-11-22T06:12:00Z'))).toBe('in 2 days 4 hours');
    expect(relativeTime(t0, new Date('2026-11-19T23:00:00Z'))).toBe('3 hours ago');
    expect(relativeTime(t0, new Date('2026-11-20T02:00:20Z'))).toBe('now');
  });
  it('event sentences use the glossary', () => {
    expect(eventSentence(ev('sunset', '2026-11-22T06:12:00Z'), t0)).toBe('Sunset in 2 days 4 hours');
    expect(eventSentence(ev('earthrise', '2026-11-20T11:00:00Z'), t0)).toBe('Earth rises in 9 hours');
    expect(eventSentence(ev('commsStart', '2026-11-20T05:00:00Z'), t0)).toBe('Earth in view for radio starts in 3 hours');
  });
  it('action label has the UTC moment', () => {
    expect(eventActionLabel(ev('sunset', '2026-11-22T06:12:00Z'))).toBe('Go to sunset on 22 Nov 2026 at 06:12 UTC');
    expect(utcWords(new Date('2026-12-03T14:20:00Z'))).toBe('3 Dec 2026 at 14:20 UTC');
    expect(openingStamp(new Date('2026-12-03T14:20:00Z'))).toBe('3 Dec 2026, 14:20 UTC');
  });
});

describe('filters', () => {
  const list = [
    ev('sunset', '2026-11-22T00:00:00Z'),
    ev('earthrise', '2026-11-22T01:00:00Z'),
    ev('bothStart', '2026-11-22T02:00:00Z'),
    ev('commsEnd', '2026-11-22T03:00:00Z'),
  ];
  it('groups kinds', () => {
    expect(filterEvents(list, 'all')).toHaveLength(4);
    expect(filterEvents(list, 'sun').map((e) => e.kind)).toEqual(['sunset']);
    expect(filterEvents(list, 'earth').map((e) => e.kind)).toEqual(['earthrise', 'commsEnd']);
    expect(filterEvents(list, 'both').map((e) => e.kind)).toEqual(['bothStart']);
  });
});

describe('presets and rules', () => {
  it('presets match the brief', () => {
    const [landing, radio, sunlight] = PRESETS.map((p) => ruleFromPreset(p, 'x'));
    expect(landing).toMatchObject({ requirePower: true, requireComms: true, minDurationH: 12 });
    expect(radio).toMatchObject({ requirePower: false, requireComms: true, minDurationH: 6 });
    expect(sunlight).toMatchObject({ requirePower: true, requireComms: false, minDurationH: 72 });
  });
  it('picks unused ids', () => {
    expect(nextRuleId([])).toBe('r1');
    expect(nextRuleId([{ id: 'r1' }, { id: 'r3' }] as TriggerRule[])).toBe('r2');
  });
  it('sanitises untrusted rules', () => {
    expect(sanitizeRule(null)).toBeNull();
    expect(sanitizeRule({ id: 'a', name: 'n', requirePower: false, requireComms: false, minDurationH: 1 })).toBeNull();
    const r = sanitizeRule({ id: 'a', name: '  ', requirePower: true, minDurationH: 9999, sunMinAboveTerrainDeg: -5 });
    expect(r).toMatchObject({ name: 'Trigger', minDurationH: 720, sunMinAboveTerrainDeg: 0, requireComms: false });
  });
  it('parses optional numbers', () => {
    expect(parseOptionalNumber('', 0, 90)).toBeUndefined();
    expect(parseOptionalNumber(' 5.5 ', 0, 90)).toBe(5.5);
    expect(parseOptionalNumber('91', 0, 90)).toBeNull();
    expect(parseOptionalNumber('abc', 0, 90)).toBeNull();
  });
  it('makes safe file names', () => {
    expect(icsFileName('Landing window: power + radio')).toBe('landing-window-power-radio.ics');
    expect(icsFileName('???')).toBe('trigger.ics');
  });
});

describe('rules in the URL', () => {
  const rules = PRESETS.map((p, i) => ruleFromPreset(p, `r${i + 1}`));
  it('round-trips and keeps other params', () => {
    const q = searchWithRules('site=shackleton&t=2026-11-20T02:00Z', rules);
    const p = new URLSearchParams(q);
    expect(p.get('site')).toBe('shackleton');
    expect(p.get('t')).toBe('2026-11-20T02:00Z');
    expect(rulesFromSearch(`?${q}`)).toEqual(rules);
  });
  it('removes rules= when empty', () => {
    expect(searchWithRules('a=1&rules=zzz', [])).toBe('a=1');
  });
  it('ignores garbage', () => {
    expect(rulesFromSearch('?rules=%%%')).toEqual([]);
    expect(rulesFromSearch('?a=1')).toEqual([]);
  });
});

describe('flags-0 rule with a threshold survives the URL', () => {
  it('round-trips, and a rule with no condition is dropped', () => {
    const r: TriggerRule = { id: 'r1', name: 'High Sun', requirePower: false, requireComms: false, sunMinAboveTerrainDeg: 2, minDurationH: 4 };
    expect(rulesFromSearch(`?${searchWithRules('', [r])}`)).toEqual([r]);
    expect(sanitizeRule({ id: 'a', name: 'n', requirePower: false, requireComms: false })).toBeNull();
  });
});

describe('coinciding events', () => {
  it('folds "Both at once" into the start or end at the same minute', () => {
    const list = [
      ev('commsStart', '2026-11-22T06:12:10Z'),
      ev('bothStart', '2026-11-22T06:12:40Z'),
      ev('sunset', '2026-11-23T01:00:00Z'),
      ev('bothEnd', '2026-11-24T01:00:00Z'),
    ];
    const m = mergeCoinciding(list);
    expect(m.map((x) => x.ev.kind)).toEqual(['commsStart', 'sunset', 'bothEnd']);
    expect(m[0].alsoBoth).toBe(true);
    expect(m[2].alsoBoth).toBe(false);
    expect(eventSentence(m[0].ev, t0, true)).toBe('Earth in view for radio and both at once start in 2 days 4 hours');
  });
});
