import { describe, expect, it } from 'vitest';
import { hashWithCompare, routeFromHash, splitHash } from './route';

describe('routeFromHash', () => {
  it('recognises the compare route', () => {
    expect(routeFromHash('#/compare')).toBe('compare');
    expect(routeFromHash('#compare')).toBe('compare');
    expect(routeFromHash('#/compare/')).toBe('compare');
    expect(routeFromHash('#/compare?tab=planner')).toBe('compare');
  });
  it('defaults to main', () => {
    expect(routeFromHash('')).toBe('main');
    expect(routeFromHash('#/')).toBe('main');
    expect(routeFromHash('#/compared')).toBe('main');
    expect(routeFromHash('#/?tab=planner')).toBe('main');
  });
});

describe('hashWithCompare', () => {
  it('opens and closes, keeping the tab param', () => {
    expect(hashWithCompare('', true)).toBe('#/compare');
    expect(hashWithCompare('#/compare', false)).toBe('#/');
    expect(hashWithCompare('#/?tab=planner', true)).toBe('#/compare?tab=planner');
    expect(hashWithCompare('#/compare?tab=planner', false)).toBe('#/?tab=planner');
  });
  it('splits path and params', () => {
    const s = splitHash('#/compare?tab=planner');
    expect(s.path).toBe('compare');
    expect(s.params.get('tab')).toBe('planner');
  });
});
