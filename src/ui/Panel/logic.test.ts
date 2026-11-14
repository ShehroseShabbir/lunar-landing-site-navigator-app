import { describe, expect, it } from 'vitest';
import { answerHeading, answerKind, viewCaption } from './logic';

describe('panel logic', () => {
  it('heading restates site, date and UTC time', () => {
    expect(answerHeading('Malapert Massif', new Date('2026-11-20T00:00:00Z'))).toBe(
      'At Malapert Massif · 20 Nov 2026 00:00 UTC',
    );
  });
  it('caption is null when blank', () => {
    expect(viewCaption('  ')).toBeNull();
    expect(viewCaption(undefined)).toBeNull();
    expect(viewCaption(' Sun is up. ')).toBe('Sun is up.');
  });
  it('answer kinds', () => {
    expect(answerKind('Yes')).toBe('ok');
    expect(answerKind('Not yet')).toBe('later');
    expect(answerKind('Not yet')).toBe('later');
    expect(answerKind('No')).toBe('no');
  });
});
