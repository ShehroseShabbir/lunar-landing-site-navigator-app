import { describe, expect, it } from 'vitest';
import { routeFromHash } from './route';

describe('routeFromHash', () => {
  it('recognises the compare route', () => {
    expect(routeFromHash('#/compare')).toBe('compare');
    expect(routeFromHash('#compare')).toBe('compare');
    expect(routeFromHash('#/compare/')).toBe('compare');
  });
  it('defaults to main', () => {
    expect(routeFromHash('')).toBe('main');
    expect(routeFromHash('#/')).toBe('main');
    expect(routeFromHash('#/compared')).toBe('main');
  });
});
