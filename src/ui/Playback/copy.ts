// User-facing strings for playback controls.
import { formatUtc } from '../../state/time';

export const PB = {
  region: 'Time-lapse playback',
  play: 'Play',
  pause: 'Pause',
  speed: 'Speed',
  paused: 'Paused',
  stepping: 'Stepping (reduced motion)',
  playingAt: (label: string) => `Playing at ${label}`,
  started: (label: string) => `Playback started at ${label}`,
  pausedAt: (d: Date) => `Playback paused at ${formatUtc(d)}`,
  reachedEnd: (d: Date) => `Playback reached the end of the 30-day window at ${formatUtc(d)}`,
} as const;
