// Every user-facing string of the space view (voice: prep/mockups/copy-v5.1.md), and the pure
// sentence builders for labels and the text alternative. No three, React or DOM.

import { formatUtc } from '../../state/time';
import type { SpaceGeometry, Vec3 } from '../../state/space.types';
import { MOON_BUMP_SCALE, type ScaleMode, type ZoomLevel } from './frame';

export const COPY = {
  levels: {
    moon: 'Moon',
    system: 'Earth and Moon',
    sun: 'With the Sun',
  } satisfies Record<ZoomLevel, string>,
  levelGroup: 'Zoom level',
  notToScale: 'Not to scale · distance compressed',
  trueScaleOn: 'True scale · Earth–Moon distance and sizes',
  trueScale: 'True scale',
  back: 'Back to the surface',
  viewFromSpace: 'View from space',
  moon: 'Moon',
  earth: 'Earth',
  pole: 'South-pole region',
  toolbar: 'Space view controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset view',
  loading: 'Loading the Moon…',
  noWebgl: "This browser can't show 3D.",
  keysHint:
    'Drag, or use the arrow keys, to turn the view. Plus and minus zoom; zooming out goes on to the Earth and the Sun. ' +
    'Zoom in close to the landing site to return to the surface. Home resets the view.',
  creditsMoon: 'Moon: NASA SVS CGI Moon Kit (LROC/LOLA)',
  creditsEarth: 'Earth: NASA Earth Observatory Blue Marble',
  relief: `Relief: LOLA heights drawn as shading, exaggerated (bump scale ${MOON_BUMP_SCALE}).`,
  stars: 'Stars are decoration, not a star map.',
} as const;

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "381,234 km" */
export function formatKm(km: number): string {
  return `${NUM.format(Math.round(km))} km`;
}

/** "150 million km" (whole millions, the Sun's distance varies 147–152). */
export function formatMillionKm(km: number): string {
  return `${NUM.format(Math.round(km / 1e6))} million km`;
}

/** Fraction of Earth's disc that is lit, from the Sun–Earth–Moon phase angle (0° = full). */
export function earthLitFraction(phaseDeg: number): number {
  return (1 + Math.cos((phaseDeg * Math.PI) / 180)) / 2;
}

/** Plain phase words for Earth seen from the Moon, with the lit percentage. */
export function earthPhaseText(phaseDeg: number): { words: string; pct: number } {
  const pct = Math.round(100 * earthLitFraction(phaseDeg));
  const words =
    pct >= 97
      ? 'full'
      : pct >= 60
        ? 'more than half lit'
        : pct > 40
          ? 'about half lit'
          : pct >= 3
            ? 'a crescent'
            : 'new, with its night side facing the Moon';
  return { words, pct };
}

export type SiteLight = 'day' | 'night' | 'edge';

/** Sunlight at the site on a smooth sphere: within 2° of the terminator counts as the edge. */
export function siteLight(siteDirMe: Vec3, sunDirMe: Vec3): SiteLight {
  const d = siteDirMe[0] * sunDirMe[0] + siteDirMe[1] * sunDirMe[1] + siteDirMe[2] * sunDirMe[2];
  const elDeg = (Math.asin(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
  if (elDeg > 2) return 'day';
  if (elDeg < -2) return 'night';
  return 'edge';
}

const LIGHT_TEXT: Record<SiteLight, string> = {
  day: 'on the sunlit side of the Moon',
  night: 'on the night side of the Moon',
  edge: 'close to the line between day and night',
};

export function earthLabelText(phaseDeg: number): string {
  return `${earthPhaseText(phaseDeg).pct}% lit as seen from the Moon`;
}

export function sunLabelText(sunDistKm: number): string {
  return `${formatMillionKm(sunDistKm)} away, not to scale`;
}

/** The canvas's accessible name (role="img"). */
export function spaceCanvasLabel(g: SpaceGeometry, siteName: string, mode: ScaleMode): string {
  const phase = earthPhaseText(g.earthPhaseDeg);
  const scale =
    mode === 'true'
      ? 'The Earth–Moon distance is shown to true scale; the Sun is not to scale.'
      : 'Not to scale: the Earth–Moon distance is compressed and the Sun is not to scale.';
  return (
    `The Moon from space at ${formatUtc(g.t)}. ` +
    `The landing site, ${siteName}, is ${LIGHT_TEXT[siteLight(g.siteDirMe, g.sunDirMe)]} (smooth Moon, terrain not included). ` +
    `Earth is ${phase.words} as seen from the Moon (${phase.pct}% of its disc lit). ${scale}`
  );
}

/** Text alternative listing the distances (linked to the canvas with aria-describedby). */
export function distancesText(g: SpaceGeometry, radiiKm: { moon: number; earth: number }): string[] {
  return [
    `Earth is ${formatKm(g.earthDistKm)} from the Moon, centre to centre (${NUM.format(Math.round(g.earthDistKm / radiiKm.moon))} Moon radii).`,
    `The Sun is ${formatMillionKm(g.sunDistKm)} from the Moon.`,
    `Moon radius ${formatKm(radiiKm.moon)}; Earth radius ${formatKm(radiiKm.earth)}.`,
    COPY.stars,
  ];
}
