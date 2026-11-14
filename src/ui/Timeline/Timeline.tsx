import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { VisWindow } from '../../astro/types';
import { useAppState } from '../../state/AppState';
import { DAY_MS, HOUR_MS, RANGE_DAYS, toTimeInput } from '../../state/time';
import { useScenarioResult } from '../../state/useScenarioResult';
import { formatDuration, subtractWindows, timeToX, windowAtX, windowRect, xToTime, type Axis } from './geometry';
import { TL } from './copy';
import { dayMonth, dayOfRange, longUtc } from './dock';
import { TriggerOverlay, useTriggerHighlights } from '../Events';
import './Timeline.css';

const dayMonthTime = (d: Date) => `${dayMonth(d)} ${toTimeInput(d)}`;

const LABEL_W = 108;
const LANE_H = 10;
const LANE_Y = [8, 26, 44];
const AXIS_Y = 74;
const SVG_H = 84;

type LaneId = 'sun' | 'earth' | 'both';
interface Layer {
  lane: LaneId;
  kind: 'hatched' | 'solid';
  label: string;
  windows: VisWindow[];
}

/** Rounded bar; a clipped end is flat (the window continues beyond the range). */
function barPath(x: number, y: number, w: number, h: number, clipL: boolean, clipR: boolean): string {
  const r = Math.min(3, w / 2);
  const rl = clipL ? 0 : r;
  const rr = clipR ? 0 : r;
  return [
    `M${x + rl} ${y}`,
    `H${x + w - rr}`,
    rr ? `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}` : '',
    `V${y + h - rr}`,
    rr ? `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}` : '',
    `H${x + rl}`,
    rl ? `A${rl} ${rl} 0 0 1 ${x} ${y + h - rl}` : '',
    `V${y + rl}`,
    rl ? `A${rl} ${rl} 0 0 1 ${x + rl} ${y}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

function describe(layer: Layer, w: VisWindow): string {
  const cont = w.clippedStart || w.clippedEnd ? TL.continues : '';
  return `${layer.label} · ${dayMonthTime(w.start)} – ${dayMonthTime(w.end)} UTC · ${formatDuration(
    w.end.getTime() - w.start.getTime(),
  )}${cont}`;
}

function SunGlyph({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={4} fill="var(--sun)" aria-hidden="true" />;
}
function EarthGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden="true">
      <circle cx={x} cy={y} r={4} fill="none" stroke="var(--earth)" strokeWidth={1.75} />
      <line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke="var(--earth)" strokeWidth={1.25} />
    </g>
  );
}
function BothGlyph({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} L${x - 5} ${y} Z`} fill="var(--both, var(--accent))" aria-hidden="true" />;
}

export function Timeline() {
  const hl = useTriggerHighlights();
  const { rangeStart, t, setT } = useAppState();
  const { status, error, scan } = useScenarioResult();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [dragging, setDragging] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scan]);

  const startMs = rangeStart.getTime();
  const spanMs = RANGE_DAYS * DAY_MS;
  const endMs = startMs + spanMs;
  const axis: Axis = useMemo(
    () => ({ startMs, spanMs, x0: LABEL_W + 8, x1: width - 14 }),
    [startMs, spanMs, width],
  );

  const layers: Layer[] = useMemo(
    () =>
      scan
        ? [
            { lane: 'sun', kind: 'hatched', label: TL.layers.sunPartly, windows: subtractWindows(scan.sunUp, scan.powerOk) },
            { lane: 'sun', kind: 'solid', label: TL.layers.sunOk, windows: scan.powerOk },
            { lane: 'earth', kind: 'hatched', label: TL.layers.earthPartly, windows: subtractWindows(scan.earthVisible, scan.commsOk) },
            { lane: 'earth', kind: 'solid', label: TL.layers.earthOk, windows: scan.commsOk },
            { lane: 'both', kind: 'solid', label: TL.layers.both, windows: scan.both },
          ]
        : [],
    [scan],
  );

  const clampT = (ms: number) => new Date(Math.min(endMs, Math.max(startMs, Math.round(ms / 60_000) * 60_000)));

  function pointerX(e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * SVG_H };
  }

  function hover(x: number, y: number) {
    const laneIdx = LANE_Y.findIndex((ly) => y >= ly - 4 && y <= ly + LANE_H + 4);
    if (laneIdx < 0) return setTip(null);
    const lane: LaneId = (['sun', 'earth', 'both'] as const)[laneIdx];
    // Topmost layer first (solid over hatched).
    for (const layer of [...layers].reverse()) {
      if (layer.lane !== lane) continue;
      const w = windowAtX(layer.windows, x, axis);
      if (w) return setTip({ x, y: LANE_Y[laneIdx], text: describe(layer, w) });
    }
    setTip(null);
  }

  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setTip(null);
    setT(clampT(xToTime(pointerX(e).x, axis)));
    e.currentTarget.parentElement?.focus();
  }
  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const p = pointerX(e);
    if (dragging) setT(clampT(xToTime(p.x, axis)));
    else if (e.pointerType !== 'touch') hover(p.x, p.y);
  }
  function onUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const cur = t.getTime();
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = cur + (e.shiftKey ? DAY_MS : HOUR_MS);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = cur - (e.shiftKey ? DAY_MS : HOUR_MS);
        break;
      case 'PageUp':
        next = cur + DAY_MS;
        break;
      case 'PageDown':
        next = cur - DAY_MS;
        break;
      case 'Home':
        next = startMs;
        break;
      case 'End':
        next = endMs;
        break;
      case 'Escape':
        setTip(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setT(clampT(next));
  }

  // Esc dismisses the tooltip even when focus is elsewhere.
  useEffect(() => {
    if (!tip) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tip]);

  const heading = TL.heading(dayMonth(rangeStart) + ' ' + rangeStart.getUTCFullYear());
  const tX = timeToX(t.getTime(), axis);
  const tickDays = [0, 7, 14, 21, 28];
  const keysId = `${uid}keys`;

  const summary = scan
    ? TL.summary(scan.powerOk.length, scan.commsOk.length, scan.both.length)
    : '';

  return (
    <section
      className="timeline"
      aria-labelledby={`${uid}h`}
      aria-busy={status === 'loading'}
    >
      <h2 id={`${uid}h`} className="sr-only">
        {TL.title}: {heading}
      </h2>

      {status === 'error' && (
        <p role="alert" className="timeline__error">
          {error ?? TL.error}
        </p>
      )}
      {status !== 'error' && !scan && (
        <div className="timeline__skeleton" role="status">
          {TL.calculating}
        </div>
      )}

      {scan && (
        <>
          <div
            ref={wrapRef}
            className={status === 'loading' ? 'timeline__chart timeline__chart--stale' : 'timeline__chart'}
            role="slider"
            tabIndex={0}
            aria-label={TL.slider}
            aria-describedby={keysId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={RANGE_DAYS * 24}
            aria-valuenow={Math.round((t.getTime() - startMs) / HOUR_MS)}
            aria-valuetext={TL.sliderValue(longUtc(t), dayOfRange(t, rangeStart), RANGE_DAYS)}
            onKeyDown={onKey}
            onBlur={() => setTip(null)}
          >
            <svg
              ref={svgRef}
              width={width}
              height={SVG_H}
              viewBox={`0 0 ${width} ${SVG_H}`}
              className={dragging ? 'timeline__svg timeline__svg--drag' : 'timeline__svg'}
              aria-hidden="true"
              focusable="false"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setTip(null)}
            >
              <defs>
                <pattern id={`${uid}hs`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--sun)" strokeWidth="2" />
                </pattern>
                <pattern id={`${uid}he`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--earth)" strokeWidth="2" />
                </pattern>
              </defs>

              {/* Day gridlines (daily, light) and 7-day labelled ticks */}
              {Array.from({ length: RANGE_DAYS + 1 }, (_, i) => (
                <line
                  key={i}
                  x1={timeToX(startMs + i * DAY_MS, axis)}
                  x2={timeToX(startMs + i * DAY_MS, axis)}
                  y1={LANE_Y[0] - 4}
                  y2={LANE_Y[2] + LANE_H + 4}
                  stroke="var(--control, var(--border))"
                  strokeOpacity={i % 7 === 0 ? 0.6 : 0.15}
                  strokeWidth={1}
                />
              ))}

              {(['sun', 'earth', 'both'] as const).map((lane, i) => {
                const y = LANE_Y[i] + LANE_H / 2;
                return (
                  <g key={lane}>
                    <rect
                      x={axis.x0}
                      y={LANE_Y[i]}
                      width={axis.x1 - axis.x0}
                      height={LANE_H}
                      rx={3}
                      fill="var(--track, var(--surface-2))"
                    />
                    {lane === 'sun' && <SunGlyph x={8} y={y} />}
                    {lane === 'earth' && <EarthGlyph x={8} y={y} />}
                    {lane === 'both' && <BothGlyph x={8} y={y} />}
                    <text x={20} y={y + 4} className="timeline__lane-label" fill="var(--text-2, var(--text))">
                      {TL.lanes[lane]}
                    </text>
                  </g>
                );
              })}

              {layers.map((layer) => {
                const i = layer.lane === 'sun' ? 0 : layer.lane === 'earth' ? 1 : 2;
                const color = layer.lane === 'sun' ? 'var(--sun)' : layer.lane === 'earth' ? 'var(--earth)' : 'var(--both, var(--accent))';
                const hatch = layer.lane === 'sun' ? `url(#${uid}hs)` : `url(#${uid}he)`;
                return layer.windows.map((w, k) => {
                  const r = windowRect(w, axis);
                  const d = barPath(r.x, LANE_Y[i], r.width, LANE_H, w.clippedStart, w.clippedEnd);
                  const open = r.width >= 12;
                  return (
                    <g key={`${layer.label}${k}`}>
                      <path
                        d={d}
                        fill={layer.kind === 'solid' ? color : hatch}
                        stroke={color}
                        strokeWidth={layer.kind === 'solid' ? 0 : 1.5}
                      />
                      {open && w.clippedStart && (
                        <polyline
                          points={`${r.x + 6},${LANE_Y[i] + 2} ${r.x + 3},${LANE_Y[i] + LANE_H / 2} ${r.x + 6},${LANE_Y[i] + LANE_H - 2}`}
                          fill="none"
                          stroke="var(--bg)"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {open && w.clippedEnd && (
                        <polyline
                          points={`${r.x + r.width - 6},${LANE_Y[i] + 2} ${r.x + r.width - 3},${LANE_Y[i] + LANE_H / 2} ${r.x + r.width - 6},${LANE_Y[i] + LANE_H - 2}`}
                          fill="none"
                          stroke="var(--bg)"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </g>
                  );
                });
              })}

              {/* Axis: start date, then +N days */}
              {tickDays.map((n) => {
                const ms = startMs + n * DAY_MS;
                const x = timeToX(ms, axis);
                return (
                  <text
                    key={n}
                    x={x}
                    y={AXIS_Y + 4}
                    textAnchor={n === 0 ? 'start' : 'middle'}
                    className="timeline__tick"
                    fill="var(--text-3, var(--text-muted))"
                  >
                    {n === 0 ? TL.tickStart(dayMonth(new Date(ms))) : TL.tick(n)}
                  </text>
                );
              })}

              <TriggerOverlay highlights={hl} axis={axis} />
              {/* Playhead */}
              <line x1={tX} x2={tX} y1={2} y2={LANE_Y[2] + LANE_H + 4} stroke="var(--text)" strokeWidth={2} />
              <circle cx={tX} cy={3} r={4} fill="var(--text)" />
            </svg>
            {hl.summary && <span className="sr-only">{hl.summary}</span>}

            {tip && !dragging && (
              <div
                className="timeline__tip"
                role="tooltip"
                style={{ left: Math.min(Math.max(tip.x, 90), width - 90), top: tip.y + LANE_H + 8 }}
              >
                {tip.text}
              </div>
            )}
          </div>

          <p className="timeline__legend">{TL.legend}</p>
          <p id={keysId} className="sr-only">
            {TL.keys}
          </p>

          <div className="sr-only">
            <h3>{TL.summaryTitle}</h3>
            <p>
              {heading} ({TL.utc}). {summary}
            </p>
            {layers.map((layer) => (
              <div key={layer.label}>
                <h4>
                  {TL.laneSr[layer.lane]}:{' '}
                  {layer.label}
                </h4>
                {layer.windows.length === 0 ? (
                  <p>{TL.none}</p>
                ) : (
                  <ul>
                    {layer.windows.map((w, k) => (
                      <li key={k}>{describe(layer, w)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
