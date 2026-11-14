// The 3D hero (visual-spec v5 section 5): ground-level view of the real terrain under a black sky,
// the LOLA skyline at true angles, the Sun and Earth now and their 30-day paths.
// three is loaded lazily from ./scene; this file stays light so the shell paints first.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { computeSkyPaths, type SkyPaths } from '../../state/skyPaths';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { loadTerrain, type TerrainTile } from '../Scene3D/terrain';
import type { SiteMetrics } from '../../astro/types';
import { hfovFor, homeYawDeg, type BodyHeading, type SafeArea } from './camera';
import { COPY } from './copy';
import { canvasLabel, describeNow } from './describeNow';
import { Hero3DControls } from './Hero3DControls';
import { earthStateText, nowFromMetrics, sunStateText } from './labels';
import type { HeroScene, SceneBodies } from './scene';
import { terrainTileIds } from './tiles';
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
  /** Zooming out past the farthest surface view (S17 space view). */
  onZoomOutBeyond?(): void;
  /** Extra buttons at the end of the icon column. */
  controlsExtra?: ReactNode;
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
  const { profile, metrics, terrain, status } = useScenarioResult();
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
            onZoomOutBeyond: () => zoomOutRef.current?.(),
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

  // Near 20 km tile and wide context tile (null on 404) for catalogue sites that have tiles;
  // sites without tiles request nothing and go straight to the 2D sky view.
  const siteId = isCustom ? null : (site?.id ?? null);
  useEffect(() => {
    let live = true;
    const ids = terrainTileIds(siteId);
    if (!ids) {
      setTiles({ key: siteKey, near: null, wide: null });
      return;
    }
    void Promise.all([loadTerrain(ids.near), loadTerrain(ids.wide)]).then(([near, wide]) => {
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

  // Metrics are kept while a new site loads, so they are tagged with the site they arrived for;
  // the first view waits for this site's own metrics (the values behind the Sun/Earth markers).
  const [metricsSite, setMetricsSite] = useState<{ key: string; metrics: SiteMetrics } | null>(null);
  useEffect(() => {
    if (metrics) setMetricsSite({ key: siteKey, metrics });
    // Tag with the site current when these metrics arrived, not later site changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);
  const siteMetrics = metricsSite?.key === siteKey ? metrics : null;
  // On a scan error there are no metrics: frame from the path sample nearest t instead.
  const bodiesSettled = siteMetrics !== null || status === 'error';

  const tRef = useRef(t);
  const metricsRef = useRef(siteMetrics);
  const zoomOutRef = useRef(props.onZoomOutBeyond);
  zoomOutRef.current = props.onZoomOutBeyond;
  tRef.current = t;
  metricsRef.current = siteMetrics;
  /** Home heading for the state now (homeYawDeg): Sun / Earth azimuth and terrain-horizon visibility. */
  const homeYaw = useCallback((): number => {
    let sun: BodyHeading | null = null;
    let earth: BodyHeading | null = null;
    const m = metricsRef.current;
    if (m) {
      sun = { azDeg: m.sun.azDeg, up: m.sun.visibleFraction > 0 };
      earth = { azDeg: m.earth.azDeg, up: m.earth.visible };
    } else if (paths && paths.sun.length > 0) {
      const tMs = tRef.current.getTime();
      let i = 0;
      for (let k = 1; k < paths.sun.length; k++) {
        if (Math.abs(paths.sun[k].t.getTime() - tMs) < Math.abs(paths.sun[i].t.getTime() - tMs)) i = k;
      }
      sun = { azDeg: paths.sun[i].azDeg, up: paths.sun[i].visible };
      earth = { azDeg: paths.earth[i].azDeg, up: paths.earth[i].visible };
    }
    const el = rootRef.current;
    const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 16 / 9;
    return homeYawDeg(sun, earth, hfovFor(aspect));
  }, [paths]);
  // Heading chosen when the site was placed; layout re-frames keep it, so time changes and
  // playback never turn the camera.
  const placedYawRef = useRef(0);

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
    if (!sceneReady || !s || !tilesNow?.near || !paths || !bodiesSettled || placed === siteKey) return;
    s.setTerrain(tilesNow.near, tilesNow.wide);
    placedYawRef.current = homeYaw();
    s.goHome(placedYawRef.current);
    setPlaced(siteKey);
  }, [sceneReady, tilesNow, paths, bodiesSettled, placed, siteKey, homeYaw]);

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
    if (s.isPristine()) s.goHome(placedYawRef.current);
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

  // Reset re-applies the home rule to the state shown now (after playback the Sun has moved).
  const reset = useCallback(() => {
    placedYawRef.current = homeYaw();
    sceneRef.current?.goHome(placedYawRef.current);
  }, [homeYaw]);
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
          extra={props.controlsExtra}
        />
      )}
    </div>
  );
}

export default Hero3D;
