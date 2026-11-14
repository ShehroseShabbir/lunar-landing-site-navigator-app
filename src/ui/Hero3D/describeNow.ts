// Caption and canvas label for the 3D hero, built from rules (prep/mockups/visual-spec.md, "Picture").
// Pure functions: no React or DOM. A PathPoint from src/state/skyPaths.ts satisfies BodyNow.

export interface BodyNow {
  azDeg: number;
  elDeg: number;
  /** Terrain horizon elevation at the body centre's azimuth (0 for the smooth Moon). */
  horizonElDeg: number;
  /** Limb rule (sunUp / earthVisible): any part of the disc above the terrain horizon. */
  visible: boolean;
}

export interface NowInput {
  sun: BodyNow;
  earth: BodyNow;
}

/** Earth is called "low" below this elevation (deg). */
export const LOW_EL_DEG = 10;

/** Added to the canvas accessible name only; the panel caption stays short. */
export const PATHS_SENTENCE = 'Thin lines show where each moves over the next 30 days.';

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
export type Compass = (typeof COMPASS)[number];

/** 8-point compass name for an azimuth (deg, clockwise from north); 45-deg sectors centred on each point. */
export function compassPoint(azDeg: number): Compass {
  const a = (((azDeg + 22.5) % 360) + 360) % 360;
  return COMPASS[Math.floor(a / 45) % 8];
}

type SunCase = 'above' | 'ridge' | 'below';

function sunCase(sun: BodyNow): SunCase {
  if (sun.visible) return 'above';
  if (sun.elDeg > 0 && sun.horizonElDeg > 0) return 'ridge';
  return 'below';
}

function sunSentence(sun: BodyNow, withDirection: boolean): string {
  const dir = compassPoint(sun.azDeg);
  switch (sunCase(sun)) {
    case 'above':
      return withDirection ? `The Sun is above the terrain in the ${dir}.` : 'The Sun is above the terrain.';
    case 'ridge':
      return withDirection
        ? `The Sun is up but behind a ridge to the ${dir}.`
        : 'The Sun is up but behind a ridge.';
    case 'below':
      return 'The Sun is below the horizon.';
  }
}

function earthSentence(earth: BodyNow): string {
  // Not visible and not above 0 deg: below the horizon itself, not hidden by terrain.
  if (!earth.visible && !(earth.elDeg > 0)) return 'Earth is below the horizon.';
  const low = earth.elDeg < LOW_EL_DEG ? 'low ' : '';
  const where = `Earth is ${low}in the ${compassPoint(earth.azDeg)}`;
  return earth.visible ? `${where}, in view.` : `${where}, behind the terrain.`;
}

/** Caption under the picture. */
export function describeNow(now: NowInput): string {
  return `${sunSentence(now.sun, false)} ${earthSentence(now.earth)}`;
}

/** Accessible name for the 3D canvas: the caption, with the site and the Sun's direction. */
export function canvasLabel(siteName: string, now: NowInput): string {
  return `3D view of the terrain around ${siteName}. ${sunSentence(now.sun, true)} ${earthSentence(now.earth)} ${PATHS_SENTENCE}`;
}
