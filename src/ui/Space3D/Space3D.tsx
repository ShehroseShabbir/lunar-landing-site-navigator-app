// The space view (S17, DR-HACK-26): the whole Moon from orbit, then the Earth–Moon system, then the
// Sun. Positions and lighting are real at time t (computeSpaceGeometry); the Earth–Moon distance is
// compressed by default (true-scale toggle) and the Sun is never to scale; both are labelled.
// three is loaded lazily from ./scene; this file stays light.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../../astro/ephem';
import type { SiteGeo } from '../../astro/types';
import type { SpaceManifest } from '../../state/space.types';
import type { SafeArea } from '../Hero3D/camera';
import { COPY, distancesText, earthLabelText, formatKm, spaceCanvasLabel, sunLabelText } from './copy';
import { LEVELS, type ScaleMode, type ZoomLevel } from './frame';
import { loadSpaceManifest } from './manifest';
import type { SpaceScene } from './scene';
import { computeSpaceGeometry } from '../../state/space';
import '../Hero3D/Hero3D.css';
import './Space3D.css';

export interface Space3DProps {
  site: SiteGeo;
  siteName: string;
  /** Selected time (UTC); playback re-renders the terminator, Earth's rotation and phase. */
  t: Date;
  /** The user zoomed back down to the site, or pressed "Back to the surface". */
  onZoomIn(): void;
  /** Pixels covered by the chrome on each side; the scene centres in the rest. */
  safeArea?: Partial<SafeArea>;
  /** Move keyboard focus to the view on mount (pass true when the user opened it). */
  autoFocus?: boolean;
}

const NO_SAFE: SafeArea = { left: 0, right: 0, top: 0, bottom: 0 };

type Loaded = { moon: boolean; earth: boolean };

const svg = (d: string) => (
  <svg className="h3d-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICONS = {
  plus: svg('M8 3v10M3 8h10'),
  minus: svg('M3 8h10'),
  reset: svg('M3.2 8a4.8 4.8 0 1 0 1.4-3.4M3.5 2.2v2.8h2.8'),
  back: svg('M10 3.5 5.5 8l4.5 4.5'),
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Space3D(props: Space3DProps) {
  const { site, siteName, t } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const lbl = {
    site: useRef<HTMLDivElement>(null),
    moon: useRef<HTMLDivElement>(null),
    earth: useRef<HTMLDivElement>(null),
    sun: useRef<HTMLDivElement>(null),
    distance: useRef<HTMLDivElement>(null),
    pole: useRef<HTMLDivElement>(null),
  };
  const sceneRef = useRef<SpaceScene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [manifest, setManifest] = useState<SpaceManifest | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<ScaleMode>('compressed');
  const [level, setLevel] = useState<ZoomLevel>('moon');
  const descId = useId();
  const onZoomInRef = useRef(props.onZoomIn);
  onZoomInRef.current = props.onZoomIn;

  const radiiKm = useMemo(
    () => ({ moon: manifest?.radiiKm.moon ?? MOON_RADIUS_KM, earth: manifest?.radiiKm.earth ?? EARTH_RADIUS_KM }),
    [manifest],
  );
  const tMs = t.getTime();
  const geo = useMemo(
    () => computeSpaceGeometry({ latDeg: site.latDeg, lonDeg: site.lonDeg }, new Date(tMs)),
    [site.latDeg, site.lonDeg, tMs],
  );

  // Create the scene once: lazy three import in parallel with the texture manifest.
  useEffect(() => {
    let live = true;
    Promise.all([import('./scene'), loadSpaceManifest()])
      .then(([mod, m]) => {
        const canvas = glRef.current;
        const overlay = ovRef.current;
        const els = {
          site: lbl.site.current,
          moon: lbl.moon.current,
          earth: lbl.earth.current,
          sun: lbl.sun.current,
          distance: lbl.distance.current,
          pole: lbl.pole.current,
        };
        if (!live || !canvas || !overlay || Object.values(els).some((e) => e === null)) return;
        setManifest(m);
        try {
          const scene = mod.createSpaceScene({
            canvas,
            overlay,
            labels: els as { [K in keyof typeof els]: HTMLDivElement },
            radiiKm: { moon: m?.radiiKm.moon ?? MOON_RADIUS_KM, earth: m?.radiiKm.earth ?? EARTH_RADIUS_KM },
            reducedMotion: prefersReducedMotion(),
            onContextLost: () => setFailed(true),
            onZoomIn: () => onZoomInRef.current(),
            onLevel: setLevel,
          });
          sceneRef.current = scene;
          setReady(true);
          void scene.setTextures(m).then((l) => {
            if (live) setLoaded(l);
          });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) sceneRef.current?.setGeometry(geo);
  }, [ready, geo]);

  // The opening zoom-out runs once the textures have settled, so the first thing seen is the real Moon.
  const entered = useRef(false);
  useEffect(() => {
    if (!ready || !loaded || entered.current) return;
    entered.current = true;
    sceneRef.current?.enter();
  }, [ready, loaded]);

  useEffect(() => {
    if (ready) sceneRef.current?.setScaleMode(mode);
  }, [ready, mode]);

  const sa = props.safeArea;
  const safe = useMemo<SafeArea>(() => ({ ...NO_SAFE, ...(sa ?? {}) }), [sa?.left, sa?.right, sa?.top, sa?.bottom]);
  useEffect(() => {
    if (ready) sceneRef.current?.setSafeArea(safe);
  }, [ready, safe]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !ready) return;
    const ro = new ResizeObserver(() => sceneRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const s = sceneRef.current;
    if (!s) return;
    const step = e.shiftKey ? 15 : 5;
    switch (e.key) {
      case 'ArrowLeft':
        s.orbit(step, 0);
        break;
      case 'ArrowRight':
        s.orbit(-step, 0);
        break;
      case 'ArrowUp':
        s.orbit(0, step);
        break;
      case 'ArrowDown':
        s.orbit(0, -step);
        break;
      case '+':
      case '=':
        s.zoom(1);
        break;
      case '-':
      case '_':
        s.zoom(-1);
        break;
      case 'Home':
        s.goHome();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const label = spaceCanvasLabel(geo, siteName, mode);
  const distances = distancesText(geo, radiiKm);
  const loading = !failed && loaded === null;

  // autoFocus: the canvas is hidden while loading, so focus it once it shows (or Back if 3D failed).
  const backRef = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!props.autoFocus || focused.current || loading) return;
    focused.current = true;
    (failed ? backRef.current : glRef.current)?.focus();
  }, [props.autoFocus, loading, failed]);
  const style = {
    '--h3d-l': `${safe.left}px`,
    '--h3d-r': `${safe.right}px`,
    '--h3d-t': `${safe.top}px`,
    '--h3d-b': `${safe.bottom}px`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`s3d${failed ? ' s3d--failed' : ''}${loading ? ' s3d--loading' : ''}`} style={style}>
      <canvas
        ref={glRef}
        className="s3d-gl"
        role="img"
        aria-label={label}
        aria-describedby={descId}
        tabIndex={failed ? -1 : 0}
        onKeyDown={onKeyDown}
      />
      <canvas ref={ovRef} className="s3d-ov" aria-hidden="true" />
      <div className="s3d-labels" aria-hidden="true">
        <div ref={lbl.site} className="h3d-lbl">
          {siteName}
        </div>
        <div ref={lbl.moon} className="h3d-lbl">
          <b>{COPY.moon}</b>
        </div>
        <div ref={lbl.earth} className="h3d-lbl h3d-lbl--earth">
          <b>{COPY.earth}</b> · {earthLabelText(geo.earthPhaseDeg)}
        </div>
        <div ref={lbl.sun} className="h3d-lbl h3d-lbl--sun">
          <b>Sun</b> · {sunLabelText(geo.sunDistKm)}
        </div>
        <div ref={lbl.distance} className="h3d-lbl h3d-lbl--path s3d-num">
          {formatKm(geo.earthDistKm)}
          {mode === 'compressed' ? ' · line not to scale' : ''}
        </div>
        <div ref={lbl.pole} className="h3d-lbl h3d-lbl--path">
          {COPY.pole}
        </div>
      </div>
      <div id={descId} className="sr-only">
        <p>{COPY.keysHint}</p>
        <ul>
          {distances.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>

      <div className="s3d-top">
        <button ref={backRef} type="button" className="s3d-btn s3d-back" onClick={() => props.onZoomIn()}>
          {ICONS.back}
          {COPY.back}
        </button>
        {!failed && (
          <>
            <div className="s3d-seg" role="group" aria-label={COPY.levelGroup}>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="s3d-btn"
                  aria-pressed={level === l}
                  disabled={!ready}
                  onClick={() => sceneRef.current?.setLevel(l)}
                >
                  {COPY.levels[l]}
                </button>
              ))}
            </div>
            <span className="s3d-chip">{mode === 'true' ? COPY.trueScaleOn : COPY.notToScale}</span>
            <button
              type="button"
              className="s3d-btn"
              aria-pressed={mode === 'true'}
              disabled={!ready}
              onClick={() => setMode(mode === 'true' ? 'compressed' : 'true')}
            >
              {COPY.trueScale}
            </button>
          </>
        )}
      </div>

      {loading && (
        <p className="s3d-status" role="status">
          {COPY.loading}
        </p>
      )}
      {failed && (
        <p className="s3d-status" role="status">
          {COPY.noWebgl}
        </p>
      )}

      {!failed && (
        <div className="h3d-icons" role="toolbar" aria-label={COPY.toolbar} aria-orientation="vertical">
          <IconButton label={COPY.zoomIn} icon={ICONS.plus} onClick={() => sceneRef.current?.zoom(1)} disabled={!ready} />
          <IconButton label={COPY.zoomOut} icon={ICONS.minus} onClick={() => sceneRef.current?.zoom(-1)} disabled={!ready} />
          <IconButton label={COPY.reset} icon={ICONS.reset} onClick={() => sceneRef.current?.goHome()} disabled={!ready} />
        </div>
      )}

      {!failed && (
        <p className="s3d-credits">
          {manifest && loaded?.moon && (
            <a href={manifest.moonColor.sourceUrl} target="_blank" rel="noreferrer">
              {COPY.creditsMoon}
            </a>
          )}
          {manifest && loaded?.moon && loaded.earth && ' · '}
          {manifest && loaded?.earth && (
            <a href={manifest.earthColor.sourceUrl} target="_blank" rel="noreferrer">
              {COPY.creditsEarth}
            </a>
          )}
          {manifest && (loaded?.moon || loaded?.earth) && <br />}
          {manifest && loaded?.moon && `${COPY.relief} `}
          {COPY.stars}
        </p>
      )}
    </div>
  );
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" className="h3d-ibtn" aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="h3d-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export default Space3D;
