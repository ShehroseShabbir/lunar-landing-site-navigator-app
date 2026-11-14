// Shared contracts from prep/plan.md section 3. Types only, no runtime code.
// Longitude is east-positive degrees. Units are in the names.
// The window interface is named VisWindow so it does not shadow the DOM global Window.

export type Body = 'Sun' | 'Earth';

export interface SiteGeo {
  latDeg: number;
  lonDeg: number;
  heightM?: number;
}

export interface HorizonProfile {
  siteId: string;
  az0: number;
  azStepDeg: number;
  elevDeg: number[];
  distKm: number[];
  minReachKm: number;
  nearFieldResM: number;
  observerHeightM: number;
  maxRangeKm: number;
  source: string;
}

export interface AltAz {
  azDeg: number;
  elDeg: number;
  distanceKm: number;
  angDiamDeg: number;
}

export type VisState = 'sunUp' | 'powerOk' | 'earthVisible' | 'commsOk';

export interface VisWindow {
  state: VisState | 'both';
  start: Date;
  end: Date;
  clippedStart: boolean;
  clippedEnd: boolean;
  maxElDeg: number;
}

export interface ScanResult {
  sunUp: VisWindow[];
  powerOk: VisWindow[];
  earthVisible: VisWindow[];
  commsOk: VisWindow[];
  both: VisWindow[];
}

export interface SiteMetrics {
  sun: AltAz & {
    aboveHorizonDeg: number;
    visibleFraction: number;
    powerOk: boolean;
    nextSet: Date | null;
    nextRise: Date | null;
    powerOkEnds: Date | null;
  };
  earth: AltAz & {
    aboveHorizonDeg: number;
    visible: boolean;
    commsOk: boolean;
    nextSet: Date | null;
    nextRise: Date | null;
    commsOkEnds: Date | null;
  };
  pctSunUp: number;
  pctPowerOk: number;
  pctEarthVisible: number;
  pctCommsOk: number;
  pctBoth: number;
  longestDarkHours: number;
  longestDarkClipped: boolean; // UI shows ">=" when clipped by a range edge
}

export type BodyAltAzFn = (body: Body, site: SiteGeo, t: Date) => AltAz;
export type HorizonElevAtFn = (profile: HorizonProfile | null, azDeg: number) => number;
export type VisibleFractionFn = (elDeg: number, horizonElDeg: number, angDiamDeg: number) => number;
export type ScanWindowsFn = (
  site: SiteGeo,
  profile: HorizonProfile | null,
  start: Date,
  end: Date,
  stepMin?: number,
) => ScanResult;
export type NextCrossingFn = (
  state: VisState,
  kind: 'rise' | 'set',
  site: SiteGeo,
  profile: HorizonProfile | null,
  from: Date,
  limitDays?: number,
) => Date | null;
export type SiteMetricsFn = (
  site: SiteGeo,
  profile: HorizonProfile | null,
  t: Date,
  rangeStart: Date,
  rangeDays?: number,
) => SiteMetrics;
