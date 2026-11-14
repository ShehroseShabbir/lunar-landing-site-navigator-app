// This module imports three. It must only be reached through the dynamic import in Scene3DPanel.tsx.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Color,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bodyAltAz } from '../../astro';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { azElToThree, describeView, gridVertex } from './mapping';
import { loadTerrain, type TerrainTile } from './terrain';
import './Scene3D.css';

const EARTH_DISTANCE_M = 16000;
const SUN_DISTANCE_M = 40000;
const HOME = { pos: new Vector3(0, 6000, 15000), target: new Vector3(0, 0, 0) };

interface Handles {
  render(): void;
  update(sunAz: number, sunEl: number, earthAz: number, earthEl: number, exaggeration: number, sunUp: boolean, earthUp: boolean): void;
  resetView(): void;
  zoom(factor: number): void;
  dispose(): void;
}

function labelTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(11,15,23,0.85)';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#5cc8ff';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 253, 61);
    g.fillStyle = '#e8edf5';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 33);
  }
  return new CanvasTexture(c);
}

function build(canvas: HTMLCanvasElement, tile: TerrainTile): Handles {
  const { size, halfWidthM } = tile.meta;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color('#05070b');
  const camera = new PerspectiveCamera(45, 1, 100, 300000);
  camera.position.copy(HOME.pos);

  // Geometry: row 0 = north edge, col 0 = west edge (mapping.gridVertex).
  const geo = new BufferGeometry();
  const pos = new Float32Array(size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      pos.set(gridVertex(r, c, size, halfWidthM, tile.heights[i], 1), i * 3);
    }
  }
  const idx = new Uint32Array((size - 1) * (size - 1) * 6);
  let k = 0;
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const a = r * size + c;
      const b = a + 1;
      const d = a + size;
      const e = d + 1;
      // Counter-clockwise seen from above (+y).
      idx.set([a, d, b, b, d, e], k);
      k += 6;
    }
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({ color: '#9aa0a8', roughness: 1, metalness: 0 });
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const ambient = new AmbientLight('#8fa0c0', 0.35);
  scene.add(ambient);
  const sun = new DirectionalLight('#fff4d6', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = halfWidthM * 1.5;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 100, far: SUN_DISTANCE_M * 2 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 8;
  scene.add(sun, sun.target);

  const earthGeo = new SphereGeometry(500, 24, 16);
  const earthMat = new MeshStandardMaterial({ color: '#5cc8ff', emissive: '#1a6f99', roughness: 0.6 });
  const earth = new Mesh(earthGeo, earthMat);
  const tex = labelTexture('Earth');
  const spriteMat = new SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false });
  const label = new Sprite(spriteMat);
  label.scale.set(0.28, 0.07, 1);
  label.position.set(0, 1300, 0);
  earth.add(label);
  scene.add(earth);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 500;
  controls.maxDistance = 60000;
  controls.enableDamping = false;
  controls.listenToKeyEvents(canvas);
  controls.update();

  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  return {
    render,
    update(sunAz, sunEl, earthAz, earthEl, exaggeration, sunUp, earthUp) {
      mesh.scale.y = exaggeration;
      const d = azElToThree(sunAz, sunEl);
      sun.position.set(d[0] * SUN_DISTANCE_M, d[1] * SUN_DISTANCE_M, d[2] * SUN_DISTANCE_M);
      sun.visible = sunUp;
      const e = azElToThree(earthAz, earthEl);
      earth.position.set(e[0] * EARTH_DISTANCE_M, e[1] * EARTH_DISTANCE_M, e[2] * EARTH_DISTANCE_M);
      earth.visible = earthUp;
      render();
    },
    resetView() {
      camera.position.copy(HOME.pos);
      controls.target.copy(HOME.target);
      controls.update();
      render();
    },
    zoom(factor) {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(factor);
      const len = Math.min(Math.max(off.length(), controls.minDistance), controls.maxDistance);
      camera.position.copy(controls.target).add(off.setLength(len));
      controls.update();
      render();
    },
    dispose() {
      ro.disconnect();
      controls.removeEventListener('change', render);
      controls.stopListenToKeyEvents();
      controls.dispose();
      geo.dispose();
      mat.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      tex.dispose();
      spriteMat.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}

type Load = { state: 'loading' } | { state: 'none' } | { state: 'ready'; tile: TerrainTile };

export default function Scene3D() {
  const { site, siteKey, siteName, siteGeo, t } = useAppState();
  const { metrics } = useScenarioResult();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handles = useRef<Handles | null>(null);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [exag, setExag] = useState<1 | 3>(1);
  const [unsupported, setUnsupported] = useState(false);

  const sunP = bodyAltAz('Sun', siteGeo, t);
  const earthP = bodyAltAz('Earth', siteGeo, t);

  // Load the tile for the catalogue site; custom coordinates never have one.
  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    if (!site) {
      setLoad({ state: 'none' });
      return;
    }
    void loadTerrain(site.id).then((tile) => {
      if (live) setLoad(tile ? { state: 'ready', tile } : { state: 'none' });
    });
    return () => {
      live = false;
    };
  }, [site, siteKey]);

  const tile = load.state === 'ready' ? load.tile : null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!tile || !canvas) return;
    try {
      handles.current = build(canvas, tile);
    } catch {
      setUnsupported(true);
      return;
    }
    return () => {
      handles.current?.dispose();
      handles.current = null;
    };
  }, [tile]);

  // Sun, Earth and exaggeration: re-render on demand only.
  const { azDeg: sAz, elDeg: sEl } = sunP;
  const { azDeg: eAz, elDeg: eEl } = earthP;
  // Visibility follows the terrain horizon (metrics), not the tangent plane; el > 0 only while metrics load.
  const calculating = metrics === null;
  const sunUp = metrics ? metrics.sun.visibleFraction > 0 : sEl > 0;
  const earthUp = metrics ? metrics.earth.visible : eEl > 0;
  useEffect(() => {
    handles.current?.update(sAz, sEl, eAz, eEl, exag, sunUp, earthUp);
  }, [tile, sAz, sEl, eAz, eEl, exag, sunUp, earthUp, unsupported]);

  const reset = useCallback(() => handles.current?.resetView(), []);
  const zoomIn = useCallback(() => handles.current?.zoom(0.8), []);
  const zoomOut = useCallback(() => handles.current?.zoom(1.25), []);

  if (load.state === 'loading') return <p className="s3d-note">Loading terrain...</p>;
  if (load.state === 'none')
    return <p className="s3d-note">3D terrain is available for south-pole sites with terrain data.</p>;
  if (unsupported) return <p className="s3d-note">3D terrain needs WebGL, which this browser does not provide.</p>;

  const label = describeView(siteName, (2 * load.tile.meta.halfWidthM) / 1000, sAz, sEl, sunUp);
  return (
    <div className="s3d">
      <div className="s3d-bar">
        <label>
          Vertical exaggeration{' '}
          <select value={exag} onChange={(e) => setExag(Number(e.target.value) === 3 ? 3 : 1)}>
            <option value={1}>×1 (true scale)</option>
            <option value={3}>×3</option>
          </select>
        </label>
        <button type="button" onClick={reset}>
          Reset view
        </button>
        <button type="button" onClick={zoomIn}>
          Zoom in
        </button>
        <button type="button" onClick={zoomOut}>
          Zoom out
        </button>
      </div>
      <canvas ref={canvasRef} className="s3d-canvas" role="img" aria-label={label} tabIndex={0} />
      <p className="s3d-caption">
        {label}.{' '}
        {calculating
          ? 'Calculating…'
          : sunUp
            ? 'Shadows are cast by the Sun.'
            : 'Sun below the horizon: no direct light, the terrain is dark.'}{' '}
        {earthUp ? `Earth marker at az ${eAz.toFixed(0)}°, el ${eEl.toFixed(1)}°.` : 'Earth below horizon.'} Drag to
        orbit, scroll to zoom, arrow keys to pan and Shift+arrow keys to orbit when the view has focus. Heights are
        above the local tangent plane (source: {load.tile.meta.source}).
      </p>
    </div>
  );
}
