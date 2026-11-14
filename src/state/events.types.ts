// Shared contract for S16 "Events & triggers" (logic: src/state/events.ts, triggers.ts; UI: src/ui/Events/**).
// Times are UTC Date objects. Elevations are degrees; "above terrain" means centre elevation minus the
// terrain horizon at the body's azimuth (smooth Moon: horizon 0). States follow plan.md §3 (DR-HACK-10).

export type EventKind =
  | 'sunrise' // Sun upper limb clears the terrain (sunUp starts)
  | 'sunset' // sunUp ends
  | 'powerStart' // powerOk starts (half the disc above terrain)
  | 'powerEnd'
  | 'earthrise' // earthVisible starts
  | 'earthset'
  | 'commsStart' // commsOk starts (Earth centre >= 0.5 deg above terrain)
  | 'commsEnd'
  | 'bothStart' // powerOk and commsOk together
  | 'bothEnd';

export interface SiteEvent {
  t: Date;
  kind: EventKind;
  /** True when the event is the edge of the scanned range, not a real crossing (never listed as an event). */
  clipped?: false;
}

/** A user-defined trigger: a window is a match when every set condition holds continuously for >= minDurationH. */
export interface TriggerRule {
  id: string;
  name: string;
  /** Require Power OK (Sun at least half visible). */
  requirePower: boolean;
  /** Require Comms OK (Earth centre >= 0.5 deg above terrain). */
  requireComms: boolean;
  /** Optional: Sun centre at least this many degrees above the terrain horizon. */
  sunMinAboveTerrainDeg?: number;
  /** Optional: Earth centre at least this many degrees above the terrain horizon. */
  earthMinAboveTerrainDeg?: number;
  /** Minimum continuous duration in hours (0 = any). */
  minDurationH: number;
}

export interface TriggerMatch {
  ruleId: string;
  start: Date;
  end: Date;
  durationH: number;
  /** The match was already open at the start of the searched span, so it may have opened earlier. */
  clippedStart: boolean;
  /** The match touches the end of the searched span, so it may last longer. */
  clippedEnd: boolean;
}

/** Search request for the landing-window finder (a trigger evaluated over a long span). */
export interface WindowSearch {
  rule: TriggerRule;
  from: Date;
  /** Days to search ahead (UI caps at 365). */
  spanDays: number;
  /** Stop after this many matches. */
  maxMatches: number;
}
