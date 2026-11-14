import { describe, expect, it } from 'vitest';
import { hashWithTab, tabFromLocation } from './tab';

describe('tabFromLocation', () => {
  it('reads the hash, then the query', () => {
    expect(tabFromLocation('#/?tab=planner')).toBe('planner');
    expect(tabFromLocation('#/compare?tab=planner')).toBe('planner');
    expect(tabFromLocation('', '?site=im2&tab=planner')).toBe('planner');
  });
  it('defaults to the Site tab', () => {
    expect(tabFromLocation('')).toBe('site');
    expect(tabFromLocation('#/?tab=bogus')).toBe('site');
  });
});

describe('hashWithTab', () => {
  it('sets and clears the tab, keeping the compare path', () => {
    expect(hashWithTab('', 'planner')).toBe('#/?tab=planner');
    expect(hashWithTab('#/compare', 'planner')).toBe('#/compare?tab=planner');
    expect(hashWithTab('#/?tab=planner', 'site')).toBe('');
    expect(hashWithTab('#/compare?tab=planner', 'site')).toBe('#/compare');
  });
});
