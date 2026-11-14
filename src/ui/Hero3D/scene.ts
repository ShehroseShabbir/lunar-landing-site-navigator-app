// The three.js part of the 3D hero. Only reached through the dynamic import in Hero3D.tsx,
// so three stays out of the first-paint bundle.
//
// Layers, back to front:
//   1. sky scene (camera-centred, directions at infinity): black, fixed starfield, skyline band from
//      the horizon profile at true angles (the far terrain), thin horizon line;
//   2. terrain scene (world metres): wide context tile, near 20 km tile, Sun light + shadows,
//      earthshine fill, weak ambient;
//   3. 2D overlay canvas: 30-day paths, Sun and Earth discs, hidden-body outlines, site pin, leader lines;
//   4. HTML labels (positioned here each render, text owned by React).
// Visibility comes from the scenario metrics (the terrain-horizon truth), never from this geometry.

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Points,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { horizonElevAt } from '../../astro/horizon';
import type { HorizonProfile } from '../../astro/types';
import { pathState, splitRuns, type PathRun, type SkyPaths } from '../../state/skyPaths';
import { azElToThree } from '../Scene3D/mapping';
import type { TerrainTile } from '../Scene3D/terrain';
import { canvasHfovDeg, clampAboveGround, hfovFor, homePose, vfovDeg, viewCentreOffset, type SafeArea } from './camera';
import { gridArrays, heightAt, skylineBand, starfield } from './geometry';
import {
  ICON_COLUMN_PX,
  boxesOverlap,
  freeRect,
  insideRect,
  pickPathAnchor,
  placeLabel,
  projectRuns,
  projectToScreen,
  pxPerDeg,
  skyPoint,
  type Box,
  type Rect,
  type ScreenPt,
  type StyledLine,
} from './project';

/** Vertical radius factor for a body disc under sky-height stretch k (1 = true shape). */
export function discVerticalScale(k: number): number {
  return Number.isFinite(k) && k > 0 ? k : 1;
}

export interface SceneBody {
  azDeg: number;
  elDeg: number;
  angDiamDeg: number;
  /** Limb rule from the metrics: any part of the disc above the terrain horizon. */
  visible: boolean;
}

export interface SceneBodies {
  sun: SceneBody & { visibleFraction: number };
  earth: SceneBody;
}

export interface LabelEls {
  sun: HTMLElement;
  earth: HTMLElement;
  site: HTMLElement;
  sunPath: HTMLElement;
  earthPath: HTMLElement;
  compass: HTMLElement[];
}

export interface HeroSceneInit {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  labels: LabelEls;
  onContextLost(): void;
}

export interface HeroScene {
  setTerrain(near: TerrainTile, wide: TerrainTile | null): void;
  setSky(profile: HorizonProfile | null, paths: SkyPaths | null): void;
  setBodies(b: SceneBodies | null): void;
  setSkyScale(k: number): void;
  setSafeArea(s: SafeArea): void;
  goHome(yawDeg: number): void;
  /** True until the user orbits, pans or zooms; goHome sets it again. */
  isPristine(): boolean;
  zoom(dir: 1 | -1): void;
  orbit(dAzDeg: number, dElDeg: number): void;
  resize(): void;
  dispose(): void;
}

const SKY_R = 10_000;
const LIGHT_DIST = 150_000;
const PIN_M = 260;
const COL = {
  sun: '#F7BE45',
  earth: '#5CC0FF',
  leader: 'rgba(236,238,242,.55)',
  casing: 'rgba(0,0,0,0.75)',
  pin: '#ECEEF2',
};
const DEG = Math.PI / 180;

const STAR_VERT = `
attribute float aSize;
attribute vec4 aColor;
uniform float uDpr;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float s = aSize * uDpr;
  gl_PointSize = max(1.0, s);
  vColor.a *= min(1.0, s);
}`;
const STAR_FRAG = `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vColor;
}`;

/** Throws when WebGL is not available (the caller falls back to the 2D sky view). */
export function createHeroScene(init: HeroSceneInit): HeroScene {
  const { canvas, overlay, labels } = init;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const ctx = overlay.getContext('2d');

  const onLost = (e: Event) => {
    e.preventDefault();
    init.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  // --- sky scene -------------------------------------------------------------------------------
  const skyScene = new Scene();
  const skyCam = new PerspectiveCamera();
  const stars = starfield();
  const starGeo = new BufferGeometry();
  const starPos = stars.positions.map((v) => v * SKY_R);
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new BufferAttribute(stars.sizes, 1));
  starGeo.setAttribute('aColor', new BufferAttribute(stars.colors, 4));
  const starMat = new ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uDpr: { value: dpr } },
    transparent: true,
    depthWrite: false,
  });
  skyScene.add(new Points(starGeo, starMat));

  const bandGeo = new BufferGeometry();
  const bandMat = new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide });
  const band = new Mesh(bandGeo, bandMat);
  band.frustumCulled = false;
  skyScene.add(band);
  const lineGeo = new BufferGeometry();
  const lineMat = new LineBasicMaterial({ color: '#C8CCD4', transparent: true, opacity: 0.35 });
  const hLine = new LineLoop(lineGeo, lineMat);
  hLine.frustumCulled = false;
  skyScene.add(hLine);

  // --- terrain scene ---------------------------------------------------------------------------
  const scene = new Scene();
  scene.fog = new Fog('#16171A', 15000, 110000);
  const camera = new PerspectiveCamera(60, 1, 30, 400_000);
  const ambient = new AmbientLight('#9AA4B8', 0.2);
  const sunLight = new DirectionalLight('#FFF4E0', 3);
  sunLight.castShadow = true;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 25;
  const earthLight = new DirectionalLight('#BCD4FF', 0.6);
  scene.add(ambient, sunLight, sunLight.target, earthLight, earthLight.target);
  const terrainMat = new MeshLambertMaterial({ color: '#B4B8C0' });
  const wideMat = new MeshLambertMaterial({ color: '#B4B8C0', polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  let nearMesh: Mesh | null = null;
  let wideMesh: Mesh | null = null;
  let near: TerrainTile | null = null;
  let wide: TerrainTile | null = null;
  let siteGround = 0;

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 1500;
  controls.maxDistance = 9000;
  controls.minPolarAngle = 55 * DEG;
  controls.maxPolarAngle = 96 * DEG;

  // --- state -----------------------------------------------------------------------------------
  let profile: HorizonProfile | null = null;
  let paths: SkyPaths | null = null;
  let runs: { sun: PathRun[]; earth: PathRun[] } = { sun: [], earth: [] };
  let bodies: SceneBodies | null = null;
  let scale = 1;
  let safe: SafeArea = { left: 0, right: 0, top: 0, bottom: 0 };
  let bandKey = '';
  let shadowDirty = true;
  let raf = 0;
  let clamping = false;
  const vp = new Matrix4();
  const tmp = new Vector3();

  const groundAt = (e: number, n: number): number | null =>
    (near && heightAt(near, e, n)) ?? (wide && heightAt(wide, e, n)) ?? null;

  function requestRender() {
    if (raf === 0) raf = requestAnimationFrame(frame);
  }

  function onChange() {
    if (clamping) return;
    const p = camera.position;
    const u = clampAboveGround(p.y, groundAt(p.x, -p.z));
    if (u !== p.y) {
      clamping = true;
      p.y = u;
      controls.update();
      clamping = false;
    }
    requestRender();
  }
  controls.addEventListener('change', onChange);
  let pristine = true;
  controls.addEventListener('start', () => {
    pristine = false;
  });

  function rebuildBand() {
    const sun = bodies ? { azDeg: bodies.sun.azDeg, elDeg: bodies.sun.elDeg } : null;
    const key = `${profile?.siteId ?? 'smooth'}|${scale}|${sun ? Math.round(sun.azDeg) : 'x'}|${sun ? sun.elDeg > -1 : 'x'}`;
    if (key === bandKey) return;
    bandKey = key;
    const b = skylineBand(profile, scale, sun, SKY_R * 0.98);
    const lin = new Float32Array(b.colors.length);
    const c = new Color();
    for (let i = 0; i < b.colors.length; i += 3) {
      c.setRGB(b.colors[i], b.colors[i + 1], b.colors[i + 2], SRGBColorSpace);
      lin[i] = c.r;
      lin[i + 1] = c.g;
      lin[i + 2] = c.b;
    }
    bandGeo.setAttribute('position', new BufferAttribute(b.positions, 3));
    bandGeo.setAttribute('color', new BufferAttribute(lin, 3));
    bandGeo.setIndex(new BufferAttribute(b.indices, 1));
    lineGeo.setAttribute('position', new BufferAttribute(b.line, 3));
  }

  function meshFor(tile: TerrainTile, mat: MeshLambertMaterial, opts: { dropM?: number; holeHalfM?: number }): Mesh {
    const g = gridArrays(tile, opts);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.positions, 3));
    geo.setIndex(new BufferAttribute(g.indices, 1));
    geo.computeVertexNormals();
    const m = new Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function dropMesh(m: Mesh | null) {
    if (!m) return;
    scene.remove(m);
    m.geometry.dispose();
  }

  function applyLights() {
    const b = bodies;
    if (b && b.sun.visibleFraction > 0) {
      const d = azElToThree(b.sun.azDeg, b.sun.elDeg);
      sunLight.position.set(d[0] * LIGHT_DIST, d[1] * LIGHT_DIST, d[2] * LIGHT_DIST);
      sunLight.intensity = 3 * Math.min(1, b.sun.visibleFraction);
      sunLight.visible = true;
    } else {
      sunLight.visible = false;
    }
    if (b && b.earth.elDeg > 0) {
      const d = azElToThree(b.earth.azDeg, Math.max(b.earth.elDeg, 4));
      earthLight.position.set(d[0] * LIGHT_DIST, d[1] * LIGHT_DIST, d[2] * LIGHT_DIST);
      earthLight.visible = true;
    } else {
      earthLight.visible = false;
    }
    shadowDirty = true;
  }

  function fitShadow() {
    const ext = wide ? 30_000 : (near?.meta.halfWidthM ?? 10_000) * 1.2;
    const cam = sunLight.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1000;
    cam.far = LIGHT_DIST * 2;
    cam.updateProjectionMatrix();
    const size = wide ? 4096 : 2048;
    if (sunLight.shadow.mapSize.x !== size) {
      sunLight.shadow.mapSize.set(size, size);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
    shadowDirty = true;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = vfovDeg(canvasHfovDeg(hfovFor(aspect), w, w - safe.left - safe.right), aspect);
    const off = viewCentreOffset(safe);
    camera.setViewOffset(w, h, -off.x, -off.y, w, h);
    camera.updateProjectionMatrix();
    requestRender();
  }

  // --- overlay ---------------------------------------------------------------------------------
  function strokeLines(g: CanvasRenderingContext2D, lines: StyledLine[], color: string | null) {
    for (const l of lines) {
      g.beginPath();
      g.moveTo(l.pts[0][0], l.pts[0][1]);
      for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i][0], l.pts[i][1]);
      const hidden = l.state === 'hidden';
      g.setLineDash(hidden ? [1.5, 4] : []);
      if (color === null) {
        g.strokeStyle = COL.casing;
        g.globalAlpha = 1;
        g.lineWidth = l.state === 'visible-only' ? 2.6 : 3.2;
      } else {
        g.strokeStyle = color;
        g.globalAlpha = l.state === 'visible-ok' ? 0.9 : l.state === 'visible-only' ? 0.6 : 0.75;
        g.lineWidth = l.state === 'visible-ok' ? 1.4 : l.state === 'visible-only' ? 0.9 : 1.3;
      }
      g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  function skyClip(g: CanvasRenderingContext2D, sky: (az: number, el: number) => ScreenPt, w: number) {
    camera.getWorldDirection(tmp);
    const yaw = Math.atan2(tmp.x, -tmp.z) / DEG;
    const pts: ScreenPt[] = [];
    for (let a = yaw - 100; a <= yaw + 100; a += 1) {
      const s = sky(a, horizonElevAt(profile, a));
      if (s.front) pts.push(s);
    }
    g.beginPath();
    if (pts.length < 2) {
      g.rect(0, -1e5, w, 2e5);
      return;
    }
    g.moveTo(Math.min(pts[0].x, -10), pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
    const last = pts[pts.length - 1];
    g.lineTo(Math.max(last.x, w + 10), last.y);
    g.lineTo(Math.max(last.x, w + 10), -1e5);
    g.lineTo(Math.min(pts[0].x, -10), -1e5);
    g.closePath();
  }

  function drawBody(g: CanvasRenderingContext2D, kind: 'sun' | 'earth', p: ScreenPt, r: number) {
    if (kind === 'sun') {
      const hg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 7);
      hg.addColorStop(0, 'rgba(255,240,210,0.9)');
      hg.addColorStop(0.2, 'rgba(255,220,160,0.25)');
      hg.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = hg;
      g.beginPath();
      g.arc(p.x, p.y, r * 7, 0, 2 * Math.PI);
      g.fill();
      g.fillStyle = '#FFF8E8';
    } else {
      const gl = g.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, r * 2.6);
      gl.addColorStop(0, 'rgba(120,190,255,0.35)');
      gl.addColorStop(1, 'rgba(120,190,255,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(p.x, p.y, r * 2.6, 0, 2 * Math.PI);
      g.fill();
      const eg = g.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      eg.addColorStop(0, '#CFE9FF');
      eg.addColorStop(0.55, '#6FB8F2');
      eg.addColorStop(1, '#2C5F93');
      g.fillStyle = eg;
    }
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 2 * Math.PI);
    g.fill();
  }

  function ring(g: CanvasRenderingContext2D, p: ScreenPt, r: number, color: string) {
    g.save();
    g.setLineDash([2.5, 2]);
    g.lineWidth = 3.2;
    g.strokeStyle = COL.casing;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 2 * Math.PI);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = color;
    g.stroke();
    g.restore();
  }

  function hideLabel(el: HTMLElement) {
    el.style.visibility = 'hidden';
  }

  function showLabelAt(el: HTMLElement, x: number, y: number) {
    el.style.visibility = 'visible';
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** Places a leader-line label unless its box would overlap one placed earlier this frame. */
  function leader(
    g: CanvasRenderingContext2D,
    el: HTMLElement,
    anchor: ScreenPt | null,
    off: { dx: number; dy: number },
    alignRight: boolean,
    rect: Rect,
    placed: Box[],
  ) {
    if (!anchor || !insideRect(anchor, rect)) return hideLabel(el);
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const box = placeLabel(anchor, off, size, rect, alignRight);
    const b = { x: box.x, y: box.y, w: size.w, h: size.h };
    if (placed.some((o) => boxesOverlap(o, b))) return hideLabel(el);
    placed.push(b);
    g.strokeStyle = COL.leader;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(anchor.x, anchor.y);
    g.lineTo(box.attachX, box.attachY);
    g.stroke();
    showLabelAt(el, box.x, box.y);
  }

  function drawOverlay(w: number, h: number) {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const skyVP = vp.multiplyMatrices(skyCam.projectionMatrix, skyCam.matrixWorldInverse).elements.slice();
    const worldVP = vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements.slice();
    const sky = (az: number, el: number) => projectToScreen(skyVP, skyPoint(az, el, scale, SKY_R), w, h);
    const rect = freeRect(w, h, { ...safe, right: safe.right + ICON_COLUMN_PX });
    const placed: Box[] = [];

    // 30-day paths: dark casing first, then Sun, then Earth on top.
    const sunLines = projectRuns(runs.sun, sky);
    const earthLines = projectRuns(runs.earth, sky);
    strokeLines(g, sunLines, null);
    strokeLines(g, earthLines, null);
    strokeLines(g, sunLines, COL.sun);
    strokeLines(g, earthLines, COL.earth);

    // Bodies: true angular size; a visible disc is clipped to the sky above the skyline, so a Sun
    // skimming the ridge shows only its visible part. Hidden bodies get a dashed outline.
    const ppd = pxPerDeg(camera.fov, h);
    let sunP: ScreenPt | null = null;
    let earthP: ScreenPt | null = null;
    if (bodies) {
      earthP = sky(bodies.earth.azDeg, bodies.earth.elDeg);
      sunP = sky(bodies.sun.azDeg, bodies.sun.elDeg);
      const er = Math.max(4, (bodies.earth.angDiamDeg / 2) * ppd);
      const sr = Math.max(3, (bodies.sun.angDiamDeg / 2) * ppd);
      g.save();
      skyClip(g, sky, w);
      g.clip();
      // With "Sky heights x3" the skyline and disc centre are stretched, so the disc is an ellipse
      // (vertical radius k*r) and the visible part above the skyline matches the metrics.
      const stretched = (p: ScreenPt, draw: () => void) => {
        const k = discVerticalScale(scale);
        g.save();
        g.translate(p.x, p.y);
        g.scale(1, k);
        g.translate(-p.x, -p.y);
        draw();
        g.restore();
      };
      if (earthP.front && bodies.earth.visible) stretched(earthP, () => drawBody(g, 'earth', earthP!, er));
      if (sunP.front && bodies.sun.visible) stretched(sunP, () => drawBody(g, 'sun', sunP!, sr));
      g.restore();
      if (earthP.front && !bodies.earth.visible) ring(g, earthP, Math.max(6, er + 2), COL.earth);
      if (sunP.front && !bodies.sun.visible) ring(g, sunP, Math.max(6, sr + 2), COL.sun);
    }

    // Site pin.
    let pinTop: ScreenPt | null = null;
    if (near) {
      const base = projectToScreen(worldVP, [0, siteGround, 0], w, h);
      pinTop = projectToScreen(worldVP, [0, siteGround + PIN_M, 0], w, h);
      if (base.front && pinTop.front) {
        g.strokeStyle = 'rgba(236,238,242,.85)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(base.x, base.y);
        g.lineTo(pinTop.x, pinTop.y);
        g.stroke();
        g.fillStyle = COL.pin;
        g.beginPath();
        g.arc(pinTop.x, pinTop.y, 2.5, 0, 2 * Math.PI);
        g.fill();
      } else pinTop = null;
    }

    // Leader-line labels (HTML), clamped to the area the chrome leaves free.
    leader(g, labels.earth, bodies ? earthP : null, { dx: 46, dy: -34 }, false, rect, placed);
    leader(g, labels.sun, bodies ? sunP : null, { dx: -36, dy: -46 }, true, rect, placed);
    leader(g, labels.site, pinTop, { dx: 34, dy: -26 }, false, rect, placed);
    const anchorOn = (pts: SkyPaths['sun'] | undefined, body: ScreenPt | null): ScreenPt | null => {
      if (!pts || pts.length === 0) return null;
      const proj = pts.map((p) => ({ s: sky(p.azDeg, p.elDeg), visible: p.visible }));
      const avoid = body && body.front ? { x: body.x, y: body.y, r: 160 } : null;
      const i = pickPathAnchor(proj, rect, 60, avoid) ?? pickPathAnchor(proj, rect);
      return i === null ? null : proj[i].s;
    };
    leader(g, labels.earthPath, anchorOn(paths?.earth, earthP), { dx: 40, dy: 18 }, false, rect, placed);
    leader(g, labels.sunPath, anchorOn(paths?.sun, sunP), { dx: -20, dy: -26 }, true, rect, placed);
    labels.compass.forEach((el, k) => {
      const az = k * 45;
      const p = sky(az, horizonElevAt(profile, az));
      if (!insideRect(p, rect, 20)) return hideLabel(el);
      const b = { x: p.x - el.offsetWidth / 2, y: p.y - el.offsetHeight - 6, w: el.offsetWidth, h: el.offsetHeight };
      if (placed.some((o) => boxesOverlap(o, b))) return hideLabel(el);
      placed.push(b);
      showLabelAt(el, b.x, b.y);
    });
  }

  function frame() {
    raf = 0;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.updateMatrixWorld();
    skyCam.position.set(0, 0, 0);
    skyCam.quaternion.copy(camera.quaternion);
    skyCam.projectionMatrix.copy(camera.projectionMatrix);
    skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    skyCam.updateMatrixWorld();
    renderer.clear();
    renderer.render(skyScene, skyCam);
    renderer.clearDepth();
    if (near) {
      if (shadowDirty) {
        renderer.shadowMap.needsUpdate = true;
        shadowDirty = false;
      }
      renderer.render(scene, camera);
    }
    drawOverlay(w, h);
  }

  rebuildBand();
  resize();

  return {
    setTerrain(n, wd) {
      dropMesh(nearMesh);
      dropMesh(wideMesh);
      near = n;
      wide = wd;
      siteGround = heightAt(n, 0, 0) ?? 0;
      nearMesh = meshFor(n, terrainMat, {});
      scene.add(nearMesh);
      wideMesh = wd ? meshFor(wd, wideMat, { dropM: 20, holeHalfM: n.meta.halfWidthM }) : null;
      if (wideMesh) scene.add(wideMesh);
      controls.maxDistance = Math.min(9000, n.meta.halfWidthM * 0.9);
      fitShadow();
      requestRender();
    },
    setSky(p, ps) {
      profile = p;
      paths = ps;
      runs = ps
        ? {
            sun: splitRuns(ps.sun, pathState, { breakAtWrap: false }),
            earth: splitRuns(ps.earth, pathState, { breakAtWrap: false }),
          }
        : { sun: [], earth: [] };
      bandKey = '';
      rebuildBand();
      requestRender();
    },
    setBodies(b) {
      bodies = b;
      applyLights();
      rebuildBand();
      requestRender();
    },
    setSkyScale(k) {
      scale = k;
      rebuildBand();
      requestRender();
    },
    isPristine() {
      return pristine;
    },
    setSafeArea(s) {
      safe = s;
      resize();
    },
    goHome(yawDeg) {
      const pose = homePose(yawDeg, siteGround, groundAt);
      pristine = true;
      clamping = true;
      camera.position.set(pose.eye.e, pose.eye.u, -pose.eye.n);
      controls.target.set(pose.target.e, pose.target.u, -pose.target.n);
      controls.update();
      clamping = false;
      requestRender();
    },
    zoom(dir) {
      if (dir > 0) controls.dollyIn(0.8);
      else controls.dollyOut(0.8);
      controls.update();
    },
    orbit(dAz, dEl) {
      controls.rotateLeft(dAz * DEG);
      controls.rotateUp(dEl * DEG);
      controls.update();
    },
    resize,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener('webglcontextlost', onLost);
      controls.removeEventListener('change', onChange);
      controls.dispose();
      dropMesh(nearMesh);
      dropMesh(wideMesh);
      terrainMat.dispose();
      wideMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      bandGeo.dispose();
      bandMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      sunLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

