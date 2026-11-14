// Body state for the 3D hero, taken from the scenario metrics (the terrain-horizon truth). Pure.

import type { SiteMetrics } from '../../astro/types';
import { COPY } from './copy';
import type { NowInput } from './describeNow';

/** describeNow input from the metrics: visibility is the limb rule the scan uses. */
export function nowFromMetrics(m: SiteMetrics): NowInput {
  return {
    sun: {
      azDeg: m.sun.azDeg,
      elDeg: m.sun.elDeg,
      horizonElDeg: m.sun.elDeg - m.sun.aboveHorizonDeg,
      visible: m.sun.visibleFraction > 0,
    },
    earth: {
      azDeg: m.earth.azDeg,
      elDeg: m.earth.elDeg,
      horizonElDeg: m.earth.elDeg - m.earth.aboveHorizonDeg,
      visible: m.earth.visible,
    },
  };
}

/** "above the ridge" (whole disc), "partly above", "behind the ridge" (up, terrain hides it) or "below the horizon". */
export function sunStateText(m: SiteMetrics): string {
  const f = m.sun.visibleFraction;
  if (f >= 1) return COPY.sunState.above;
  if (f > 0) return COPY.sunState.partly;
  const horizon = m.sun.elDeg - m.sun.aboveHorizonDeg;
  return m.sun.elDeg > 0 && horizon > 0 ? COPY.sunState.ridge : COPY.sunState.below;
}

export function earthStateText(m: SiteMetrics): string {
  if (m.earth.visible) return COPY.earthState.inView;
  return m.earth.elDeg > 0 ? COPY.earthState.hidden : COPY.earthState.below;
}
