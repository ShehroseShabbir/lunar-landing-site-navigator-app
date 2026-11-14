// Pure playback logic (S9). No React, no astronomy.
import { DAY_MS, HOUR_MS, RANGE_DAYS } from '../../state/time';

export type SpeedId = '1h' | '6h' | '1d';

export interface Speed {
  id: SpeedId;
  label: string;
  /** Simulated milliseconds per real second (also the reduced-motion step size). */
  simMsPerSec: number;
}

export const SPEEDS: readonly Speed[] = [
  { id: '1h', label: '1 h/s', simMsPerSec: HOUR_MS },
  { id: '6h', label: '6 h/s', simMsPerSec: 6 * HOUR_MS },
  { id: '1d', label: '1 d/s', simMsPerSec: DAY_MS },
];

/** Metrics come from a worker: at most 10 t updates per second. */
export const MIN_UPDATE_MS = 100;
export const REDUCED_STEP_MS = 1000;

export function windowEnd(rangeStartMs: number): number {
  return rangeStartMs + RANGE_DAYS * DAY_MS;
}

export interface Advance {
  tMs: number;
  /** True when t reached the end of the window: caller pauses. */
  ended: boolean;
}

/** Continuous playback: advance by elapsed real time, clamped to the window end. */
export function advance(tMs: number, elapsedMs: number, simMsPerSec: number, endMs: number): Advance {
  const next = tMs + (Math.max(0, elapsedMs) / 1000) * simMsPerSec;
  return next >= endMs ? { tMs: endMs, ended: true } : { tMs: next, ended: false };
}

/** Reduced motion: one discrete step (1 h, 6 h or 1 d), clamped to the window end. */
export function reducedStep(tMs: number, simMsPerSec: number, endMs: number): Advance {
  return advance(tMs, REDUCED_STEP_MS, simMsPerSec, endMs);
}

/** Throttle: only push a new t once MIN_UPDATE_MS of real time has accumulated. */
export function shouldUpdate(accumMs: number): boolean {
  return accumMs >= MIN_UPDATE_MS;
}
