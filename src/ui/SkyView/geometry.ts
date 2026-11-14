// Pure geometry for the sky panorama and close-up insets (ui-spec C, DR-HACK-14). No DOM, no astronomy.

export const AXIS_BOTTOM_DEG = -10;
export const AXIS_TOPS_DEG = [20, 30, 45, 60, 90] as const;

const D2R = Math.PI / 180;

/** Earth-bound elevation (deg): Earth never appears above this at a site (DR-HACK-14). */
export function earthBoundDeg(latDeg: number, lonDeg: number): number {
  const c = Math.cos(latDeg * D2R) * Math.cos(lonDeg * D2R);
  return 90 - Math.acos(Math.min(1, Math.max(-1, c))) / D2R + 11;
}

/** Fixed top of the elevation axis for a site: smallest of {20,30,45,60,90} that covers all bounds. */
export function axisTopDeg(latDeg: number, lonDeg: number, profileMaxElDeg: number): number {
  const need = Math.max(
    profileMaxElDeg + 2,
    90 - Math.abs(latDeg) + 3.54,
    earthBoundDeg(latDeg, lonDeg) + 2,
  );
  for (const top of AXIS_TOPS_DEG) if (top >= need) return top;
  return 90;
}

export function profileMaxDeg(elevDeg: readonly number[] | undefined): number {
  if (!elevDeg || elevDeg.length === 0) return 0;
  let m = -Infinity;
  for (const e of elevDeg) if (e > m) m = e;
  return m;
}

export interface PlotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Azimuth to x. 360 maps to the right edge (so the right-hand N sits on the edge). */
export function azToX(azDeg: number, box: PlotBox): number {
  const a = azDeg === 360 ? 360 : ((azDeg % 360) + 360) % 360;
  return box.left + (a / 360) * box.width;
}

/** Elevation to y; unclamped. Bottom of the box is AXIS_BOTTOM_DEG, top is topDeg. */
export function elToY(elDeg: number, topDeg: number, box: PlotBox): number {
  return box.top + ((topDeg - elDeg) / (topDeg - AXIS_BOTTOM_DEG)) * box.height;
}

/** Vertical exaggeration: vertical px per degree divided by horizontal px per degree. */
export function verticalScale(topDeg: number, box: PlotBox): number {
  return box.height / (topDeg - AXIS_BOTTOM_DEG) / (box.width / 360);
}

export interface Pinned {
  pinned: boolean;
  /** Elevation to draw at (the axis bottom when pinned). */
  drawElDeg: number;
  /** Degrees below the horizon (positive) when pinned, else 0. */
  belowDeg: number;
}

/** A body lower than the axis bottom is pinned at the bottom edge with no disc. */
export function pinBody(elDeg: number): Pinned {
  if (elDeg < AXIS_BOTTOM_DEG) return { pinned: true, drawElDeg: AXIS_BOTTOM_DEG, belowDeg: -elDeg };
  return { pinned: false, drawElDeg: elDeg, belowDeg: 0 };
}

/** Azimuth difference wrapped to [-180, 180). */
export function wrapDeltaAz(azDeg: number, centreDeg: number): number {
  return ((((azDeg - centreDeg) % 360) + 540) % 360) - 180;
}

export interface InsetSpec {
  widthPx: number;
  heightPx: number;
  /** Half-width of the window in projected degrees (x = delta az * cos el). */
  halfSpanDeg: number;
}

export const INSET: InsetSpec = { widthPx: 240, heightPx: 160, halfSpanDeg: 3 };

/** Pixels per degree, identical on both axes. */
export function insetScale(spec: InsetSpec = INSET): number {
  return spec.widthPx / (2 * spec.halfSpanDeg);
}

/** Azimuth half-range covered by the inset: 3 deg at the horizon, wider (3/cos el) higher up. */
export function insetAzHalfRange(elDeg: number, spec: InsetSpec = INSET): number {
  const c = Math.max(0.05, Math.cos(elDeg * D2R));
  return Math.min(180, spec.halfSpanDeg / c);
}

/** Inset projection with equal scale on both axes: x = delta az * cos(centre el). */
export function insetProject(
  azDeg: number,
  elDeg: number,
  centreAzDeg: number,
  centreElDeg: number,
  spec: InsetSpec = INSET,
): { x: number; y: number } {
  const s = insetScale(spec);
  const dx = wrapDeltaAz(azDeg, centreAzDeg) * Math.cos(centreElDeg * D2R);
  return { x: spec.widthPx / 2 + dx * s, y: spec.heightPx / 2 - (elDeg - centreElDeg) * s };
}

export interface Pt {
  x: number;
  y: number;
}

/** Terrain polyline across the inset window, one point every stepPx. */
export function insetTerrainPoints(
  horizonAt: (azDeg: number) => number,
  centreAzDeg: number,
  centreElDeg: number,
  spec: InsetSpec = INSET,
  stepPx = 4,
): Pt[] {
  const c = Math.max(0.05, Math.cos(centreElDeg * D2R));
  const s = insetScale(spec);
  const pts: Pt[] = [];
  for (let x = 0; x <= spec.widthPx + 1e-9; x += stepPx) {
    const dxDeg = (x - spec.widthPx / 2) / s;
    const az = centreAzDeg + dxDeg / c;
    pts.push({ x, y: spec.heightPx / 2 - (horizonAt(az) - centreElDeg) * s });
  }
  return pts;
}

function n2(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function polyline(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(p.x)} ${n2(p.y)}`).join('');
}

/** Open path along the inset silhouette (for the outline). */
export function terrainEdgePath(pts: Pt[]): string {
  return polyline(pts);
}

/** Path of the terrain fill (below the silhouette) for the inset. */
export function terrainFillPath(pts: Pt[], bottomY: number): string {
  if (pts.length === 0) return '';
  const last = pts[pts.length - 1];
  return `${polyline(pts)}L${n2(last.x)} ${n2(bottomY)}L${n2(pts[0].x)} ${n2(bottomY)}Z`;
}

/** Path of the sky region (above the silhouette); a disc clipped by it is the visible part. */
export function skyRegionPath(pts: Pt[], topY: number): string {
  if (pts.length === 0) return '';
  const last = pts[pts.length - 1];
  return `${polyline(pts)}L${n2(last.x)} ${n2(topY)}L${n2(pts[0].x)} ${n2(topY)}Z`;
}

/** Closed SVG path for a circle. */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${n2(cx - r)} ${n2(cy)}a${n2(r)} ${n2(r)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r)} 0 1 0 ${n2(-2 * r)} 0Z`;
}

/** Panorama terrain fill: sampled every stepDeg over 0..360, clamped to the axis range. */
export function panoramaTerrainPath(
  horizonAt: (azDeg: number) => number,
  topDeg: number,
  box: PlotBox,
  stepDeg = 1,
): { fill: string; edge: string } {
  let edge = '';
  for (let az = 0; az <= 360 + 1e-9; az += stepDeg) {
    const el = Math.min(topDeg, Math.max(AXIS_BOTTOM_DEG, horizonAt(az % 360)));
    edge += `${az === 0 ? 'M' : 'L'}${n2(azToX(az, box))} ${n2(elToY(el, topDeg, box))}`;
  }
  const bottom = n2(box.top + box.height);
  const fill = `${edge}L${n2(box.left + box.width)} ${bottom}L${n2(box.left)} ${bottom}Z`;
  return { fill, edge };
}
