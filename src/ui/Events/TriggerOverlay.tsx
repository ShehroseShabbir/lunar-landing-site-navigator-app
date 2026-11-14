import { timeToX, type Axis } from '../Timeline/geometry';
import type { TriggerHighlights } from './hooks';

/**
 * SVG layer for inside the Timeline's <svg>: outlines each trigger match across the three lanes.
 * Pass the same `axis` the lanes use. Decorative for assistive tech; the matches are listed in the Events tab
 * and `highlights.summary` is the text alternative (render it in an sr-only element next to the dock).
 */
export function TriggerOverlay({
  highlights,
  axis,
  y = 2,
  height = 56,
}: {
  highlights: TriggerHighlights;
  axis: Axis;
  y?: number;
  height?: number;
}) {
  const { rangesByRule, color } = highlights;
  return (
    <g aria-hidden="true" pointerEvents="none" data-trigger-overlay="">
      {Object.entries(rangesByRule).flatMap(([id, ranges]) =>
        ranges.map(([a, b]) => {
          const x0 = timeToX(a, axis);
          const x1 = timeToX(b, axis);
          if (x1 <= axis.x0 || x0 >= axis.x1) return null;
          const w = Math.max(3, x1 - x0);
          return (
            <g key={`${id}-${a}`}>
              <rect x={x0} y={y} width={w} height={height} rx={3} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1.5} strokeDasharray="4 2" />
              <rect x={x0} y={y} width={w} height={3} fill={color} />
            </g>
          );
        }),
      )}
    </g>
  );
}
