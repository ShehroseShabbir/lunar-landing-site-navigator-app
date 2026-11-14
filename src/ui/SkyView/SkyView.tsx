import { useEffect, useMemo, useRef, useState } from 'react';
import { bodyAltAz, horizonElevAt, visibleFraction } from '../../astro';
import type { AltAz, Body, HorizonProfile, SiteGeo } from '../../astro';
import {
  AXIS_BOTTOM_DEG,
  INSET,
  axisTopDeg,
  azToX,
  circlePath,
  elToY,
  insetScale,
  insetTerrainPoints,
  panoramaTerrainPath,
  pinBody,
  profileMaxDeg,
  skyRegionPath,
  terrainEdgePath,
  terrainFillPath,
  verticalScale,
  type PlotBox,
} from './geometry';
import './SkyView.css';

const VB_W = 960;
const VB_H = 300;
const BOX: PlotBox = { left: 60, top: 14, width: 884, height: 236 };
const BOTTOM_Y = BOX.top + BOX.height;

export interface SkyViewProps {
  site: SiteGeo;
  siteName: string;
  profile: HorizonProfile | null;
  t: Date;
}

interface BodyState {
  body: Body;
  az: number;
  el: number;
  angDiam: number;
  horizonEl: number;
  aboveHorizon: number;
  fraction: number;
}

const MINUS = '−';
function deg1(x: number): string {
  const s = Math.abs(x).toFixed(1);
  return x < 0 && s !== '0.0' ? `${MINUS}${s}°` : `${s}°`;
}
function pct(f: number): string {
  if (f <= 0) return '0%';
  if (f < 0.01) return '< 1%';
  if (f >= 1) return '100%';
  return `${Math.min(99, Math.round(f * 100))}%`;
}

function computeBody(body: Body, site: SiteGeo, t: Date, profile: HorizonProfile | null): BodyState {
  const p: AltAz = bodyAltAz(body, site, t);
  const horizonEl = horizonElevAt(profile, p.azDeg);
  return {
    body,
    az: p.azDeg,
    el: p.elDeg,
    angDiam: p.angDiamDeg,
    horizonEl,
    aboveHorizon: p.elDeg - horizonEl,
    fraction: visibleFraction(p.elDeg, horizonEl, p.angDiamDeg),
  };
}

function where(b: BodyState, hasProfile: boolean): string {
  const ref = hasProfile ? 'terrain horizon' : 'horizon';
  const d = Math.abs(b.aboveHorizon).toFixed(1);
  return `${d} degrees ${b.aboveHorizon >= 0 ? 'above' : 'below'} the ${ref}`;
}

function labelFor(b: BodyState): string {
  if (b.fraction <= 0) return `${b.body}, below horizon`;
  if (b.fraction >= 1) return b.body;
  return `${b.body} ${pct(b.fraction)} visible`;
}

function tooltipFor(b: BodyState, hasProfile: boolean): string {
  const ref = hasProfile ? 'terrain' : 'horizon';
  const rel = `${Math.abs(b.aboveHorizon).toFixed(1)}° ${b.aboveHorizon >= 0 ? 'above' : 'below'} ${ref}`;
  return `${b.body} · az ${deg1(b.az)} · el ${rel} · ${pct(b.fraction)} visible`;
}

/** Glyph (Sun: disc + solid halo; Earth: plain disc + dashed ring). Used in the legend. */
function Glyph({ body, size = 18 }: { body: Body; size?: number }) {
  const c = size / 2;
  if (body === 'Sun') {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return (
        <line
          key={i}
          x1={c + Math.cos(a) * (c * 0.62)}
          y1={c + Math.sin(a) * (c * 0.62)}
          x2={c + Math.cos(a) * (c * 0.95)}
          y2={c + Math.sin(a) * (c * 0.95)}
          stroke="var(--sun)"
          strokeWidth="1.5"
        />
      );
    });
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={c * 0.45} fill="var(--sun)" />
        {rays}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={c * 0.5} fill="var(--earth)" />
      <circle cx={c} cy={c} r={c * 0.9} fill="none" stroke="var(--earth)" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

function Marker({
  b,
  topDeg,
  xOffset,
  hasProfile,
  active,
  onActive,
  layer,
}: {
  b: BodyState;
  topDeg: number;
  xOffset: number;
  hasProfile: boolean;
  active: boolean;
  onActive: (body: Body | null) => void;
  layer: 'disc' | 'top';
}) {
  const pin = pinBody(b.el);
  const x = azToX(b.az, BOX) + xOffset;
  const y = elToY(pin.drawElDeg, topDeg, BOX);
  const pxPerDeg = BOX.width / 360;
  const r = Math.max(6, (b.angDiam / 2) * pxPerDeg);
  const isSun = b.body === 'Sun';
  const colour = isSun ? 'var(--sun)' : 'var(--earth)';
  const below = b.fraction <= 0;
  if (layer === 'disc') {
    // filled disc only; the terrain layer is drawn over it, which clips it
    if (pin.pinned || below) return null;
    return <circle cx={x} cy={y} r={r} fill={colour} />;
  }
  const labelAbove = y > BOX.top + BOX.height / 2;
  const ly = labelAbove ? y - r - 12 : y + r + 18;
  const label = pin.pinned ? `${b.body} ${pin.belowDeg.toFixed(1)}° below horizon` : labelFor(b);
  const labelW = label.length * 7.6;
  const left = BOX.left + 4;
  const right = BOX.left + BOX.width - 4;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (x - labelW / 2 < left) anchor = 'start';
  else if (x + labelW / 2 > right) anchor = 'end';
  const lx = anchor === 'start' ? Math.max(x - 8, left) : anchor === 'end' ? Math.min(x + 8, right) : x;
  const main = xOffset === 0;
  const focusProps = main
    ? {
        tabIndex: 0,
        role: 'img' as const,
        'aria-label': tooltipFor(b, hasProfile),
        onFocus: () => onActive(b.body),
        onBlur: () => onActive(null),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Escape') onActive(null);
        },
      }
    : { 'aria-hidden': true as const };
  return (
    <g
      className="skyview-marker"
      {...focusProps}
      onMouseEnter={() => onActive(b.body)}
      onMouseLeave={() => onActive(null)}
      data-active={active || undefined}
    >
      {pin.pinned ? (
        <path
          className="skyview-pin"
          d={`M${x - 8} ${y - 12}L${x + 8} ${y - 12}L${x} ${y - 1}Z`}
          fill={isSun ? colour : 'none'}
          stroke={colour}
          strokeWidth="2"
          strokeDasharray={isSun ? undefined : '3 2'}
        />
      ) : (
        <>
          {below && <circle cx={x} cy={y} r={r} fill="none" stroke={colour} strokeWidth="2" />}
          <circle
            className="skyview-halo"
            cx={x}
            cy={y}
            r={r + 4}
            fill="none"
            stroke={colour}
            strokeWidth="2"
            strokeDasharray={isSun ? undefined : '4 3'}
          />
        </>
      )}
      <text x={lx} y={ly} textAnchor={anchor} className="skyview-label" fill={colour}>
        {label}
      </text>
      <circle cx={x} cy={y} r={Math.max(r + 8, 16)} fill="transparent" />
    </g>
  );
}

function Inset({ b, profile }: { b: BodyState; profile: HorizonProfile | null }) {
  const id = `skyview-clip-${b.body}`;
  const s = insetScale();
  const cx = INSET.widthPx / 2;
  const cy = INSET.heightPx / 2;
  const r = (b.angDiam / 2) * s;
  const pts = useMemo(
    () => insetTerrainPoints((az) => horizonElevAt(profile, az), b.az, b.el),
    [profile, b.az, b.el],
  );
  const sky = skyRegionPath(pts, 0);
  const ground = terrainFillPath(pts, INSET.heightPx);
  const gap = b.el - b.horizonEl;
  const farOff = Math.abs(gap) > INSET.heightPx / 2 / s + b.angDiam / 2;
  const hz = `Horizon is ${Math.abs(gap).toFixed(1)}° ${gap > 0 ? 'below' : 'above'} this view`;
  const isSun = b.body === 'Sun';
  const colour = isSun ? 'var(--sun)' : 'var(--earth)';
  const caption = `${b.body} close-up: ${pct(b.fraction)} of the disk visible`;
  return (
    <figure className="skyview-inset">
      <svg
        viewBox={`0 0 ${INSET.widthPx} ${INSET.heightPx}`}
        role="img"
        aria-label={`${b.body} close-up, about 3 degrees either side. ${caption}.`}
      >
        <defs>
          <clipPath id={id}>
            <path d={sky} />
          </clipPath>
        </defs>
        <rect width={INSET.widthPx} height={INSET.heightPx} fill="var(--bg)" />
        <g clipPath={`url(#${id})`}>
          {isSun ? (
            <circle cx={cx} cy={cy} r={r} fill="var(--sun)" />
          ) : (
            <circle cx={cx} cy={cy} r={r} fill="var(--earth)" />
          )}
        </g>
        <path d={ground} fill="var(--terrain)" />
        <path
          d={terrainEdgePath(pts)}
          fill="none"
          stroke="var(--terrain-edge)"
          strokeWidth="2"
        />
        <path d={circlePath(cx, cy, r)} fill="none" stroke={colour} strokeWidth="1.5" strokeDasharray="4 3" />
        {farOff && (
          <text x={cx} y={20} textAnchor="middle" className="skyview-label" fill="var(--text)">
            {hz}
          </text>
        )}
      </svg>
      <figcaption>
        <strong>{b.body} close-up</strong>
        <span>
          {' '}
          · ±3° · {pct(b.fraction)} visible
        </span>
      </figcaption>
    </figure>
  );
}

export function SkyView({ site, siteName, profile, t }: SkyViewProps) {
  const hasProfile = profile !== null;
  const tMs = t.getTime();
  const { latDeg, lonDeg } = site;
  const [active, setActive] = useState<Body | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sun = useMemo(
    () => computeBody('Sun', { latDeg, lonDeg }, new Date(tMs), profile),
    [latDeg, lonDeg, tMs, profile],
  );
  const earth = useMemo(
    () => computeBody('Earth', { latDeg, lonDeg }, new Date(tMs), profile),
    [latDeg, lonDeg, tMs, profile],
  );

  const topDeg = useMemo(
    () => axisTopDeg(latDeg, lonDeg, profile ? profileMaxDeg(profile.elevDeg) : 0),
    [latDeg, lonDeg, profile],
  );
  const terrain = useMemo(
    () => (profile ? panoramaTerrainPath((az) => horizonElevAt(profile, az), topDeg, BOX, profile.azStepDeg > 0 ? profile.azStepDeg : 1) : null),
    [profile, topDeg],
  );
  const seamOffsets = (b: BodyState): number[] => {
    const x = azToX(b.az, BOX);
    const list = [0];
    if (x < BOX.left + 40) list.push(BOX.width);
    if (x > BOX.left + BOX.width - 40) list.push(-BOX.width);
    return list;
  };
  const vScale = verticalScale(topDeg, BOX);
  const vScaleText = vScale >= 10 ? vScale.toFixed(0) : vScale.toFixed(1);

  const ticks = useMemo(() => {
    const step = topDeg <= 20 ? 5 : topDeg <= 45 ? 10 : 30;
    const list: number[] = [];
    for (let e = AXIS_BOTTOM_DEG; e <= topDeg; e += step) list.push(e);
    if (!list.includes(0)) list.push(0);
    if (!list.includes(topDeg)) list.push(topDeg);
    return list;
  }, [topDeg]);

  const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function jumpTo(az: number, smooth: boolean) {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const scale = el.scrollWidth / VB_W;
    el.scrollTo({
      left: azToX(az, BOX) * scale - el.clientWidth / 2,
      behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
    });
  }

  // Start centred on the Sun when the site changes (not on every time step).
  const sunAzRef = useRef(sun.az);
  sunAzRef.current = sun.az;
  useEffect(() => {
    jumpTo(sunAzRef.current, false);
  }, [latDeg, lonDeg]);

  const sentence = (b: BodyState) =>
    `${b.body} is ${where(b, hasProfile)} at azimuth ${Math.round(b.az)} degrees, ${Math.round(b.fraction * 100)} percent of the disk visible.`;
  const textAlt = `${sentence(sun)} ${sentence(earth)}${hasProfile ? '' : ' Smooth-moon horizon, terrain not included.'}`;

  const bodies = [sun, earth];
  const tip = active ? bodies.find((b) => b.body === active) : undefined;
  const tipText = tip ? tooltipFor(tip, hasProfile) : '';
  const tipPin = tip ? pinBody(tip.el) : null;
  const tipW = tipText.length * 7 + 16;
  const tipX = tip ? Math.min(BOX.left + BOX.width - tipW, Math.max(BOX.left, azToX(tip.az, BOX) - tipW / 2)) : 0;
  const tipYBody = tip && tipPin ? elToY(tipPin.drawElDeg, topDeg, BOX) : 0;
  const tipY = tipYBody > BOX.top + BOX.height / 2 ? BOX.top + 6 : BOX.top + BOX.height - 34;

  return (
    <section className="skyview" aria-labelledby="skyview-title">
      <div className="skyview-head">
        <h2 id="skyview-title">Sky panorama</h2>
        <span className="skyview-site">{siteName}</span>
        {!hasProfile && (
          <span className="skyview-badge">
            <span aria-hidden="true">ⓘ </span>Smooth-Moon horizon, terrain not included
          </span>
        )}
        {overflows && (
        <span className="skyview-jump">
          <button type="button" onClick={() => jumpTo(sun.az, true)}>
            Jump to Sun
          </button>
          <button type="button" onClick={() => jumpTo(earth.az, true)}>
            Jump to Earth
          </button>
        </span>
        )}
      </div>

      <div
        className="skyview-scroll"
        ref={scroller}
        role="group"
        aria-label="Sky panorama, scrolls sideways"
        tabIndex={0}
      >
        <svg
          className="skyview-svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="group"
          aria-label={`Sky panorama for ${siteName}`}
        >
          <rect x={BOX.left} y={BOX.top} width={BOX.width} height={BOX.height} fill="var(--bg)" stroke="var(--border)" />
          {/* elevation grid and labels */}
          {ticks.map((e) => (
            <g key={e}>
              <line
                x1={BOX.left}
                x2={BOX.left + BOX.width}
                y1={elToY(e, topDeg, BOX)}
                y2={elToY(e, topDeg, BOX)}
                stroke="var(--border)"
                strokeOpacity={e === 0 ? 0 : 0.35}
              />
              <text x={BOX.left - 6} y={elToY(e, topDeg, BOX) + 4} textAnchor="end" className="skyview-axis">
                {e < 0 ? `${MINUS}${Math.abs(e)}` : e}°
              </text>
            </g>
          ))}
          {/* azimuth ticks */}
          {Array.from({ length: 13 }, (_, i) => i * 30).map((az) => (
            <line
              key={az}
              x1={azToX(az, BOX)}
              x2={azToX(az, BOX)}
              y1={BOTTOM_Y}
              y2={BOTTOM_Y + (az % 90 === 0 ? 8 : 4)}
              stroke="var(--text-muted)"
            />
          ))}
          {([['N', 0], ['E', 90], ['S', 180], ['W', 270], ['N', 360]] as const).map(([l, az]) => (
            <text
              key={az}
              x={azToX(az, BOX)}
              y={BOTTOM_Y + 22}
              textAnchor={az === 0 ? 'start' : az === 360 ? 'end' : 'middle'}
              className="skyview-cardinal"
            >
              {l}
            </text>
          ))}
          <text x={BOX.left + BOX.width / 2} y={VB_H - 4} textAnchor="middle" className="skyview-axis">
            Azimuth (° from north)
          </text>
          <text
            transform={`translate(12 ${BOX.top + BOX.height / 2}) rotate(-90)`}
            textAnchor="middle"
            className="skyview-axis"
          >
            Elevation (vertical scale ×{vScaleText})
          </text>

          <defs>
            <clipPath id="skyview-plot">
              <rect x={BOX.left} y={BOX.top} width={BOX.width} height={BOX.height} />
            </clipPath>
          </defs>
          {/* pass 1: filled discs, under the terrain */}
          <g clipPath="url(#skyview-plot)" aria-hidden="true">
            {bodies.map((b) =>
              seamOffsets(b).map((off) => (
                <Marker key={`${b.body}${off}`} b={b} topDeg={topDeg} xOffset={off} hasProfile={hasProfile} active={false} onActive={setActive} layer="disc" />
              )),
            )}
          </g>

          {terrain && (
            <g pointerEvents="none" clipPath="url(#skyview-plot)">
              <path d={terrain.fill} fill="var(--terrain)" fillOpacity="0.96" />
              <path d={terrain.edge} fill="none" stroke="var(--terrain-edge)" strokeWidth="2" />
            </g>
          )}
          <line
            x1={BOX.left}
            x2={BOX.left + BOX.width}
            y1={elToY(0, topDeg, BOX)}
            y2={elToY(0, topDeg, BOX)}
            stroke="var(--text)"
            strokeDasharray="6 4"
            strokeWidth="1.5"
            pointerEvents="none"
          />
          <text x={BOX.left + BOX.width - 4} y={elToY(0, topDeg, BOX) - 4} textAnchor="end" className="skyview-axis" pointerEvents="none">
            Horizon (0°)
          </text>

          {/* pass 2: outlines, labels and pinned markers, over the terrain */}
          {bodies.map((b) =>
            seamOffsets(b).map((off) => (
              <Marker key={`top${b.body}${off}`} b={b} topDeg={topDeg} xOffset={off} hasProfile={hasProfile} active={active === b.body} onActive={setActive} layer="top" />
            )),
          )}

          {tip && (
            <g pointerEvents="none">
              <rect x={tipX} y={tipY} width={tipW} height={28} rx="6" fill="var(--surface-2)" stroke="var(--text)" />
              <text x={tipX + 8} y={tipY + 19} className="skyview-tip" fill="var(--text)">
                {tipText}
              </text>
            </g>
          )}
        </svg>
      </div>

      <ul className="skyview-legend">
        {bodies.map((b) => (
          <li key={b.body}>
            <Glyph body={b.body} />
            <span>{tooltipFor(b, hasProfile)}</span>
          </li>
        ))}
        <li className="skyview-note">
          Markers are drawn at least 12 px wide; close-ups below show the true size. Terrain is drawn at ×{vScaleText} vertical scale.
        </li>
      </ul>

      <div className="skyview-insets">
        {bodies.map((b) => (
          <Inset key={b.body} b={b} profile={profile} />
        ))}
      </div>

      <p className="sr-only" aria-live="polite" role="status">
        {textAlt}
      </p>
    </section>
  );
}
