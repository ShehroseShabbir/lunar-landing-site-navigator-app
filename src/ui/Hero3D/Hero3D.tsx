// The 3D hero (visual-spec v5 section 5): ground-level view of the real terrain under a black sky,
// the LOLA skyline at true angles, the Sun and Earth now and their 30-day paths.
// three is loaded lazily from ./scene; this file stays light so the shell paints first.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { computeSkyPaths, type SkyPaths } from '../../state/skyPaths';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { loadTerrain, type TerrainTile } from '../Scene3D/terrain';
import { circularMeanDeg, hfovFor, homeYawDeg, type SafeArea } from './camera';
import { COPY } from './copy';
import { canvasLabel, describeNow } from './describeNow';
import { Hero3DControls } from './Hero3DControls';
import { earthStateText, nowFromMetrics, sunStateText } from './labels';
import type { HeroScene, SceneBodies } from './scene';
import './Hero3D.css';

export type Hero3DFallbackReason = 'webgl' | 'no-terrain';

export interface Hero3DProps {
  /** Pixels covered by the chrome on each side (panel, breadcrumb, dock); the scene centres in the rest. */
  safeArea?: Partial<SafeArea>;
  /** Sky heights ×3. Controlled when given; otherwise Hero3D keeps its own state. */
  skyX3?: boolean;
  onSkyX3Change?(on: boolean): void;
  /** 2D sky view in place of the 3D view. Controlled when given. */
  panorama?: boolean;
  onPanoramaChange?(on: boolean): void;
  /** The 2D sky view (B4 SkyView); shown full size when `panorama` is on and as the fallback. */
  renderPanorama?(): ReactNode;
  /** Called once per fallback: no WebGL, or no terrain tile for this site. `message` is the plain line to show. */
  onFallback?(message: string, reason: Hero3DFallbackReason): void;
  /** The caption sentence (describeNow) whenever it changes; null until the first result. */
  onCaption?(caption: string | null): void;
  /** Render the icon column inside the hero (default true). */
  showControls?: boolean;
}

interface Tiles {
  key: string;
  near: TerrainTile | null;
  wide: TerrainTile | null;
}

const NO_SAFE: SafeArea = { left: 0, right: 0, top: 0, bottom: 0 };

function useToggle(controlled: boolean | undefined, onChange: ((on: boolean) => void) | undefined) {
  const [local, setLocal] = useState(false);
  const value = controlled ?? local;
  const set = useCallback(
    (on: boolean) => {
      if (controlled === undefined) setLocal(on);
      onChange?.(on);
    },
    [controlled, onChange],
  );
  return [value, set] as const;
}

export function Hero3D(props: Hero3DProps) {
  const { site, isCustom, siteKey, siteName, siteGeo, rangeStart, t } = useAppState();
  const { profile, metrics, terrain } = useScenarioResult();
  const [skyX3, setSkyX3] = useToggle(props.skyX3, props.onSkyX3Change);
  const [panorama, setPanorama] = useToggle(props.panorama, props.onPanoramaChange);
  const showControls = props.showControls ?? true;

  const rootRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const siteRef = useRef<HTMLDivElement>(null);
  const sunPathRef = useRef<HTMLDivElement>(null);
  const earthPathRef = useRef<HTMLDivElement>(null);
  const compassRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sceneRef = useRef<HeroScene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Tiles | null>(null);
  const hintId = useId();

  // Create the scene once: lazy three import in parallel with the tile fetch.
  useEffect(() => {
    let live = true;
    import('./scene')
      .then((mod) => {
        const canvas = glRef.current;
        const overlay = ovRef.current;
        const labels = [sunRef, earthRef, siteRef, sunPathRef, earthPathRef].map((r) => r.current);
        if (!live || !canvas || !overlay || labels.some((l) => l === null)) return;
        const [sun, earth, siteEl, sunPath, earthPath] = labels as HTMLElement[];
        try {
          sceneRef.current = mod.createHeroScene({
            canvas,
            overlay,
            labels: {
              sun,
              earth,
              site: siteEl,
              sunPath,
              earthPath,
              compass: compassRefs.current.filter((e): e is HTMLDivElement => e !== null),
            },
            onContextLost: () => setWebglFailed(true),
          });
          setSceneReady(true);
        } catch {
          setWebglFailed(true);
        }
      })
      .catch(() => {
        if (live) setWebglFailed(true);
      });
    return () => {
      live = false;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Near 20 km tile and wide context tile (null on 404) for catalogue sites.
  const siteId = isCustom ? null : (site?.id ?? null);
  useEffect(() => {
    let live = true;
    if (!siteId) {
      setTiles({ key: siteKey, near: null, wide: null });
      return;
    }
    void Promise.all([loadTerrain(siteId), loadTerrain(`${siteId}_wide`)]).then(([near, wide]) => {
      if (live) setTiles({ key: siteKey, near, wide: near ? wide : null });
    });
    return () => {
      live = false;
    };
  }, [siteId, siteKey]);
  const tilesNow = tiles?.key === siteKey ? tiles : null;

  // 30-day paths: sampled once per (site, rangeStart, profile); about 10-30 ms.
  const rangeMs = rangeStart.getTime();
  const profileSettled = terrain !== 'loading';
  const paths = useMemo<SkyPaths | null>(
    () => (profileSettled && tilesNow?.near ? computeSkyPaths(siteGeo, profile, new Date(rangeMs)) : null),
    // siteGeo follows siteKey.
    [siteKey, rangeMs, profile, profileSettled, tilesNow?.near],
  );

  const tRef = useRef(t);
  tRef.current = t;
  const homeYaw = useCallback((): number => {
    if (!paths) return 0;
    const earthMean = circularMeanDeg(paths.earth.map((p) => p.azDeg));
    const tMs = tRef.current.getTime();
    let best = paths.sun[0];
    for (const p of paths.sun) if (Math.abs(p.t.getTime() - tMs) < Math.abs(best.t.getTime() - tMs)) best = p;
    const el = rootRef.current;
    const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 16 / 9;
    return homeYawDeg(earthMean, best ? best.azDeg : null, hfovFor(aspect));
  }, [paths]);

  // Fallback: no WebGL, or no terrain for this site.
  const fallback: Hero3DFallbackReason | null = webglFailed
    ? 'webgl'
    : tilesNow && tilesNow.near === null
      ? 'no-terrain'
      : null;
  const onFallbackRef = useRef(props.onFallback);
  onFallbackRef.current = props.onFallback;
  useEffect(() => {
    if (fallback) onFallbackRef.current?.(fallback === 'webgl' ? COPY.noWebgl : COPY.noTerrain, fallback);
  }, [fallback, siteKey]);

  // Push data into the scene (render on demand happens inside).
  useEffect(() => {
    if (sceneReady && paths) sceneRef.current?.setSky(profile, paths);
  }, [sceneReady, profile, paths]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!sceneReady || !s || !tilesNow?.near || !paths || placed === siteKey) return;
    s.setTerrain(tilesNow.near, tilesNow.wide);
    s.goHome(homeYaw());
    setPlaced(siteKey);
  }, [sceneReady, tilesNow, paths, placed, siteKey, homeYaw]);

  const bodies = useMemo<SceneBodies | null>(
    () =>
      metrics
        ? {
            sun: {
              azDeg: metrics.sun.azDeg,
              elDeg: metrics.sun.elDeg,
              angDiamDeg: metrics.sun.angDiamDeg,
              visible: metrics.sun.visibleFraction > 0,
              visibleFraction: metrics.sun.visibleFraction,
            },
            earth: {
              azDeg: metrics.earth.azDeg,
              elDeg: metrics.earth.elDeg,
              angDiamDeg: metrics.earth.angDiamDeg,
              visible: metrics.earth.visible,
            },
          }
        : null,
    [metrics],
  );
  useEffect(() => {
    if (sceneReady) sceneRef.current?.setBodies(bodies);
  }, [sceneReady, bodies]);

  useEffect(() => {
    if (sceneReady) sceneRef.current?.setSkyScale(skyX3 ? 3 : 1);
  }, [sceneReady, skyX3]);

  const sa = props.safeArea;
  const safe = useMemo<SafeArea>(
    () => ({ ...NO_SAFE, ...(sa ?? {}) }),
    [sa?.left, sa?.right, sa?.top, sa?.bottom],
  );
  useEffect(() => {
    const s = sceneRef.current;
    if (!sceneReady || !s) return;
    s.setSafeArea(safe);
    // The free area changed (panel width, collapse): re-frame unless the user has moved the camera.
    if (s.isPristine()) s.goHome(homeYaw());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady, safe]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !sceneReady) return;
    const ro = new ResizeObserver(() => sceneRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sceneReady]);

  // Caption and canvas label from the metrics (terrain-horizon truth).
  const now = useMemo(() => (metrics ? nowFromMetrics(metrics) : null), [metrics]);
  const caption = now ? describeNow(now) : null;
  const onCaptionRef = useRef(props.onCaption);
  onCaptionRef.current = props.onCaption;
  useEffect(() => {
    onCaptionRef.current?.(caption);
  }, [caption]);
  const label = now ? canvasLabel(siteName, now) : COPY.loadingLabel(siteName);

  const reset = useCallback(() => sceneRef.current?.goHome(homeYaw()), [homeYaw]);
  const zoomIn = useCallback(() => sceneRef.current?.zoom(1), []);
  const zoomOut = useCallback(() => sceneRef.current?.zoom(-1), []);

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
        s.orbit(0, 3);
        break;
      case 'ArrowDown':
        s.orbit(0, -3);
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
        reset();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const loading = !fallback && placed !== siteKey;
  const show2d = fallback !== null || panorama;
  const style = {
    '--h3d-l': `${safe.left}px`,
    '--h3d-r': `${safe.right}px`,
    '--h3d-t': `${safe.top}px`,
    '--h3d-b': `${safe.bottom}px`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`h3d${show2d ? ' h3d--2d' : ''}`} style={style}>
      <canvas
        ref={glRef}
        className="h3d-gl"
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={show2d ? -1 : 0}
        onKeyDown={onKeyDown}
      />
      <canvas ref={ovRef} className="h3d-ov" aria-hidden="true" />
      <div className="h3d-labels" aria-hidden="true">
        <div ref={earthRef} className="h3d-lbl h3d-lbl--earth">
          <b>{COPY.earth}</b> · {metrics ? earthStateText(metrics) : ''}
        </div>
        <div ref={sunRef} className="h3d-lbl h3d-lbl--sun">
          <b>{COPY.sun}</b> · {metrics ? sunStateText(metrics) : ''}
        </div>
        <div ref={siteRef} className="h3d-lbl">
          {COPY.site}
        </div>
        <div ref={earthPathRef} className="h3d-lbl h3d-lbl--path">
          {COPY.earthPath}
        </div>
        <div ref={sunPathRef} className="h3d-lbl h3d-lbl--path">
          {COPY.sunPath}
        </div>
        {COPY.compass.map((c, i) => (
          <div
            key={c}
            ref={(el) => {
              compassRefs.current[i] = el;
            }}
            className="h3d-lbl h3d-lbl--cmp"
          >
            {c}
          </div>
        ))}
      </div>
      <p id={hintId} className="sr-only">
        {COPY.keysHint}
      </p>

      {loading && (
        <p className="h3d-status" role="status">
          {COPY.loading}
        </p>
      )}
      {!show2d && (skyX3 || (profileSettled && profile === null && tilesNow?.near)) && (
        <div className="h3d-chips">
          {skyX3 && <span className="h3d-chip">{COPY.skyX3Chip}</span>}
          {profileSettled && profile === null && tilesNow?.near && <span className="h3d-chip">{COPY.smoothMoonChip}</span>}
        </div>
      )}
      {show2d && props.renderPanorama && <div className="h3d-pano">{props.renderPanorama()}</div>}

      {showControls && (
        <Hero3DControls
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={reset}
          skyX3={skyX3}
          onSkyX3Change={setSkyX3}
          panorama={show2d}
          onPanoramaChange={setPanorama}
          viewDisabled={show2d}
          panoramaLocked={fallback !== null}
        />
      )}
    </div>
  );
}

export default Hero3D;
