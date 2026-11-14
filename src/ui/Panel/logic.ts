// Pure helpers for the Site tab. No astronomy here.
import { formatUtc } from '../../state/time';

/** "At Malapert Massif · 20 Nov 2026 00:00 UTC" (visible heading and live-region text). */
export function answerHeading(siteName: string, t: Date): string {
  return `At ${siteName} · ${formatUtc(t)}`;
}

/** "20 Nov 2026, 00:00 UTC" (panel meta line under the site name). */
export function metaTime(t: Date): string {
  return formatUtc(t).replace(/^(\d+ \w+ \d{4}) /, '$1, ');
}

/** The caption sentence is shown only when B2 supplied a non-empty one. */
export function viewCaption(caption: string | undefined | null): string | null {
  const c = caption?.trim();
  return c ? c : null;
}

export type AnswerKind = 'ok' | 'later' | 'no';
/** Style class for an answer word; the word itself always carries the meaning. */
export function answerKind(word: 'Yes' | 'Not yet' | 'No'): AnswerKind {
  return word === 'Yes' ? 'ok' : word === 'No' ? 'no' : 'later';
}
