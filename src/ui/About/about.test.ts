import { describe, expect, it } from 'vitest';
import { extraValidationLines } from './About';

describe('extraValidationLines', () => {
  it('builds both lines from the measured validation.json figures', () => {
    const { timing, illumination } = extraValidationLines();
    expect(timing).toContain('JPL Horizons');
    expect(timing).toMatch(/differed by \d+ minutes/);
    expect(illumination).toContain('Gläser et al. 2018');
    expect(illumination).toMatch(/\d+\.\d% of the time at Connecting Ridge \(published 92\.1%\)/);
  });
  it('returns nulls instead of inventing figures when data is missing', () => {
    expect(extraValidationLines({})).toEqual({ timing: null, illumination: null });
  });
});
