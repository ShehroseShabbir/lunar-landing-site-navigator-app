// The three.js part of the space view (S17). Only reached through the dynamic import in Space3D.tsx.
//
// World frame (see ./frame.ts): three x = ME x, three y = ME z (north up), three z = −ME y;
// origin at the Moon's centre; 1 unit = 1 Moon radius.
// Layers: sky scene (camera-centred decorative stars) → main scene (Moon, Earth, Sun glow, the
// Earth–Moon line, the south-pole ring) → 2D overlay (site pin, leader lines, markers for bodies
// smaller than a few pixels) → HTML labels (text owned by React, positioned here).
// Render on demand: a frame is drawn only when something changes.

import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Line,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  WebGLRenderer,
  type Texture,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpaceGeometry, SpaceManifest, SpaceTexture, Vec3 } from '../../state/space.types';
import type { SafeArea } from '../Hero3D/camera';
import { starfield } from '../Hero3D/geometry';
import { ICON_COLUMN_PX, boxesOverlap, freeRect, insideRect, placeLabel, projectToScreen, type Box, type Rect, type ScreenPt } from '../Hero3D/project';
import {
  MOON_BUMP_SCALE,
  SPACE_FOV_DEG,
  centreOffset,
  easeOut,
  latLonToMe,
  layoutBodies,
  levelLimits,
  levelPose,
  mat3MeToThree,
  meToThree,
  nextLevel,
  segmentHitsSphere,
  siteFacing,
  surfacePointVisible,
  textureOffsetU,
  vfovFor,
  unit,
  vec,
  type Layout,
  type LevelLimits,
  type Pose,
  type Radii,
  type ScaleMode,
  type ZoomLevel,
} from './frame';
import { textureUrl } from './manifest';

export interface SpaceLabelEls {
  site: HTMLElement;
  moon: HTMLElement;
  earth: HTMLElement;
  sun: HTMLElement;
  distance: HTMLElement;
  pole: HTMLElement;
}

export interface SpaceSceneInit {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  labels: SpaceLabelEls;
  radiiKm: Radii;
  reducedMotion: boolean;
  onContextLost(): void;
  onZoomIn(): void;
  onLevel(level: ZoomLevel): void;
}

export interface SpaceScene {
  /** Loads the manifest's textures; resolves with what loaded (plain colours stay otherwise). */
  setTextures(m: SpaceManifest | null): Promise<{ moon: boolean; earth: boolean }>;
  setGeometry(g: SpaceGeometry): void;
  setScaleMode(mode: ScaleMode): void;
  setSafeArea(s: SafeArea): void;
  setLevel(level: ZoomLevel): void;
  /** The opening move: from just above the site out to the Moon level (a cut under reduced motion). */
  enter(): void;
  goHome(): void;
  zoom(dir: 1 | -1): void;
  orbit(dAzDeg: number, dElDeg: number): void;
  resize(): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const FOV = SPACE_FOV_DEG;
const SKY_R = 100;
const PHONE_PX = 640;
const TWEEN_MS = 800;
const WHEEL_STEP = 240;
const COL = {
  leader: 'rgba(236,238,242,.55)',
  pin: '#ECEEF2',
  casing: 'rgba(0,0,0,0.75)',
  marker: 'rgba(236,238,242,.8)',
};

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,250,235,1)');
    r.addColorStop(0.16, 'rgba(255,244,214,1)');
    r.addColorStop(0.22, 'rgba(255,220,160,0.45)');
    r.addColorStop(0.5, 'rgba(255,210,140,0.12)');
    r.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Throws when WebGL is not available. */
export function createSpaceScene(init: SpaceSceneInit): SpaceScene {
  const { canvas, overlay, labels } = init;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  const ctx = overlay.getContext('2d');
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const onLost = (e: Event) => {
    e.preventDefault();
    init.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  // --- sky: the fixed decorative starfield of the surface view, mirrored to fill the lower half --
  const skyScene = new Scene();
  const skyCam = new PerspectiveCamera(FOV, 1, 0.1, 1000);
  const upper = starfield(500, 11);
  const lower = starfield(500, 29);
  const n = upper.sizes.length + lower.sizes.length;
  const starPos = new Float32Array(n * 3);
  const starCol = new Float32Array(n * 4);
  starPos.set(upper.positions.map((v) => v * SKY_R));
  starPos.set(
    lower.positions.map((v, i) => (i % 3 === 1 ? -v : v) * SKY_R),
    upper.positions.length,
  );
  starCol.set(upper.colors);
  starCol.set(lower.colors, upper.colors.length);
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new BufferAttribute(starCol, 4));
  const starMat = new PointsMaterial({ size: 1.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  skyScene.add(new Points(starGeo, starMat));

  // --- main scene ------------------------------------------------------------------------------
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.02, 20_000);
  const ambient = new AmbientLight('#FFFFFF', 0.04);
  const sunLight = new DirectionalLight('#FFFFFF', 2.6);
  scene.add(ambient, sunLight, sunLight.target);

  const sphere = new SphereGeometry(1, 128, 64);
  const moonMat = new MeshStandardMaterial({ color: '#9A9A9A', roughness: 1, metalness: 0 });
  const moon = new Mesh(sphere, moonMat);
  const earthMat = new MeshStandardMaterial({ color: '#3D78B8', roughness: 0.9, metalness: 0 });
  const earth = new Mesh(sphere, earthMat);
  earth.matrixAutoUpdate = false;
  scene.add(moon, earth);

  // South-pole region: a faint ring at 80° S.
  const ringPts: number[] = [];
  for (let i = 0; i < 128; i++) ringPts.push(...meToThree(latLonToMe(-80, (i * 360) / 128)).map((c) => c * 1.004));
  const ringGeo = new BufferGeometry();
  ringGeo.setAttribute('position', new BufferAttribute(new Float32Array(ringPts), 3));
  const ringMat = new LineBasicMaterial({ color: '#ECEEF2', transparent: true, opacity: 0.35 });
  scene.add(new LineLoop(ringGeo, ringMat));

  // Moon → Earth line (surface to surface).
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const lineMat = new LineBasicMaterial({ color: '#A6ACB6', transparent: true, opacity: 0.6 });
  const line = new Line(lineGeo, lineMat);
  line.frustumCulled = false;
  scene.add(line);

  // The Sun: a glow of fixed angular size, never its physical size or distance.
  const glow = glowTexture();
  const sunMat = new SpriteMaterial({ map: glow, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: false, transparent: true });
  const sun = new Sprite(sunMat);
  sun.scale.set(0.09, 0.09, 1);
  scene.add(sun);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;

  // --- state -----------------------------------------------------------------------------------
  let geo: SpaceGeometry | null = null;
  let mode: ScaleMode = 'compressed';
  let layout: Layout | null = null;
  let level: ZoomLevel = 'moon';
  let limits: LevelLimits = { min: 1.3, max: 8 };
  let safe: SafeArea = { left: 0, right: 0, top: 0, bottom: 0 };
  let raf = 0;
  let tweenRaf = 0;
  let wheelAcc = 0;
  let disposed = false;
  const textures: Texture[] = [];
  const vp = new Matrix4();
  const m4 = new Matrix4();

  function requestRender() {
    if (raf === 0 && !disposed) raf = requestAnimationFrame(frame);
  }
  controls.addEventListener('change', requestRender);

  const eye = (): Vec3 => [camera.position.x, camera.position.y, camera.position.z];
  const dist = () => camera.position.distanceTo(controls.target);

  function minHalfFovDeg(): number {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const f = h / 2 / Math.tan((camera.fov / 2) * DEG);
    const vw = Math.max(80, w - safe.left - safe.right - (w < PHONE_PX ? 0 : ICON_COLUMN_PX));
    const vh = Math.max(80, h - safe.top - safe.bottom);
    return Math.min(Math.atan(vw / 2 / f), Math.atan(vh / 2 / f)) / DEG;
  }

  function applyLimits() {
    if (!layout) return;
    limits = levelLimits(level, layout, minHalfFovDeg());
    controls.minDistance = limits.min;
    controls.maxDistance = limits.max;
  }

  function stopTween() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    tweenRaf = 0;
    controls.enabled = true;
  }

  /** Moves the camera to a pose: tweened, or a cut under reduced motion. */
  function moveTo(pose: Pose, from?: Pose) {
    stopTween();
    const start: Pose = from ?? { eye: eye(), target: [controls.target.x, controls.target.y, controls.target.z] };
    const set = (p: Pose) => {
      camera.position.set(p.eye[0], p.eye[1], p.eye[2]);
      controls.target.set(p.target[0], p.target[1], p.target[2]);
    };
    const finish = () => {
      set(pose);
      applyLimits();
      controls.update();
      requestRender();
    };
    if (init.reducedMotion) return finish();
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.enabled = false;
    const t0 = performance.now();
    const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const step = () => {
      const k = easeOut((performance.now() - t0) / TWEEN_MS);
      if (k >= 1) {
        tweenRaf = 0;
        controls.enabled = true;
        return finish();
      }
      set({ eye: lerp(start.eye, pose.eye, k), target: lerp(start.target, pose.target, k) });
      controls.update();
      tweenRaf = requestAnimationFrame(step);
    };
    tweenRaf = requestAnimationFrame(step);
  }

  function changeLevel(next: ZoomLevel) {
    if (!layout || !geo) return;
    level = next;
    init.onLevel(next);
    moveTo(levelPose(next, layout, geo.siteDirMe, minHalfFovDeg()));
  }

  /** Zoom past the near limit: to the previous level, or to the surface over the site. */
  function stepIn() {
    if (!geo || !layout) return;
    const next = nextLevel(level, 1);
    if (next !== 'surface') {
      if (next) changeLevel(next);
      return;
    }
    if (siteFacing(eye(), geo.siteDirMe)) {
      stopTween();
      init.onZoomIn();
      return;
    }
    // Turn the site toward the camera first; the next zoom-in goes down to the surface.
    const home = levelPose('moon', layout, geo.siteDirMe, minHalfFovDeg());
    moveTo({ target: [0, 0, 0], eye: vec.scale(unit(home.eye), limits.min * 1.1) });
  }

  function stepOut() {
    const next = nextLevel(level, -1);
    if (next && next !== 'surface') changeLevel(next);
  }

  function onWheel(e: WheelEvent) {
    if (tweenRaf || !controls.enabled) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (dy === 0) return;
    const d = dist();
    const out = dy > 0;
    const atLimit = out ? d >= limits.max * 0.995 : d <= limits.min * 1.005;
    if (!atLimit) {
      wheelAcc = 0;
      return;
    }
    if (Math.sign(wheelAcc) !== Math.sign(dy)) wheelAcc = 0;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= WHEEL_STEP) {
      wheelAcc = 0;
      if (out) stepOut();
      else stepIn();
    }
  }
  canvas.addEventListener('wheel', onWheel, { passive: true });

  function applyGeometry() {
    if (!geo) return;
    layout = layoutBodies(geo, mode, init.radiiKm);
    const s = meToThree(geo.sunDirMe);
    sunLight.position.set(s[0] * 10, s[1] * 10, s[2] * 10);
    sun.position.set(layout.sunPos[0], layout.sunPos[1], layout.sunPos[2]);
    // Earth: translate · rotate (Earth-fixed → ME, in three axes) · scale.
    const r = mat3MeToThree(geo.earthFixedToMe);
    const R = layout.earthR;
    const p = layout.earthPos;
    m4.set(r[0] * R, r[1] * R, r[2] * R, p[0], r[3] * R, r[4] * R, r[5] * R, p[1], r[6] * R, r[7] * R, r[8] * R, p[2], 0, 0, 0, 1);
    earth.matrix.copy(m4);
    earth.matrixWorldNeedsUpdate = true;
    const e = unit(p);
    const pos = lineGeo.getAttribute('position') as BufferAttribute;
    pos.setXYZ(0, e[0], e[1], e[2]);
    pos.setXYZ(1, p[0] - e[0] * R, p[1] - e[1] * R, p[2] - e[2] * R);
    pos.needsUpdate = true;
    requestRender();
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    camera.aspect = w / h;
    camera.fov = vfovFor(w / h);
    // Under 640 px the icon column is a row at the bottom, so it takes no width.
    const off = centreOffset({ ...safe, right: safe.right + (w < PHONE_PX ? 0 : ICON_COLUMN_PX / 2) });
    camera.setViewOffset(w, h, -off.x, -off.y, w, h);
    camera.updateProjectionMatrix();
    if (!tweenRaf) applyLimits();
    requestRender();
  }

  // --- overlay ---------------------------------------------------------------------------------
  const hide = (el: HTMLElement) => {
    el.style.visibility = 'hidden';
  };

  function leader(g: CanvasRenderingContext2D, el: HTMLElement, anchor: ScreenPt | null, off: { dx: number; dy: number }, alignRight: boolean, rect: Rect, placed: Box[]) {
    if (!anchor || !insideRect(anchor, rect)) return hide(el);
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const box = placeLabel(anchor, off, size, rect, alignRight);
    const b = { x: box.x, y: box.y, w: size.w, h: size.h };
    if (placed.some((o) => boxesOverlap(o, b))) return hide(el);
    placed.push(b);
    g.strokeStyle = COL.leader;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(anchor.x, anchor.y);
    g.lineTo(box.attachX, box.attachY);
    g.stroke();
    el.style.visibility = 'visible';
    el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
  }

  function marker(g: CanvasRenderingContext2D, p: ScreenPt, r: number) {
    g.lineWidth = 3;
    g.strokeStyle = COL.casing;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 2 * Math.PI);
    g.stroke();
    g.lineWidth = 1.2;
    g.strokeStyle = COL.marker;
    g.stroke();
  }

  function drawOverlay(w: number, h: number) {
    if (!ctx) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const all = Object.values(labels) as HTMLElement[];
    if (!geo || !layout) return all.forEach(hide);
    const m = vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const P = (v: Vec3) => projectToScreen(m, v, w, h);
    const f = h / 2 / Math.tan((camera.fov / 2) * DEG);
    const e = eye();
    const pxRadius = (c: Vec3, r: number) => {
      const d = vec.len(vec.sub(c, e));
      return d > r ? f * Math.tan(Math.asin(r / d)) : Infinity;
    };
    // Keep labels off the top controls and the icon column (a right column, or a bottom row on phones).
    const phone = w < PHONE_PX;
    const rect = freeRect(w, h, {
      left: safe.left,
      top: safe.top + (phone ? 160 : 44),
      right: safe.right + (phone ? 0 : ICON_COLUMN_PX),
      bottom: safe.bottom + (phone ? 120 : 0),
    });
    const placed: Box[] = [];
    const L = layout;
    const moonPx = pxRadius([0, 0, 0], 1);
    const earthPx = pxRadius(L.earthPos, L.earthR);
    const hiddenBy = (p: Vec3, self: 'moon' | 'earth' | 'sun') =>
      (self !== 'moon' && segmentHitsSphere(e, p, [0, 0, 0], 1)) || (self !== 'earth' && segmentHitsSphere(e, p, L.earthPos, L.earthR));

    const moonC = P([0, 0, 0]);
    const earthC = P(L.earthPos);
    const sunC = P(L.sunPos);
    // Bodies smaller than a few pixels (true scale, far levels) get a ring so they can be found.
    if (moonC.front && moonPx < 3) marker(g, moonC, 5);
    if (earthC.front && earthPx < 3 && !hiddenBy(L.earthPos, 'earth')) marker(g, earthC, 5);

    // Site pin: a short stalk out of the surface, drawn when the site faces the camera.
    const s3 = meToThree(unit(geo.siteDirMe));
    let pinTop: ScreenPt | null = null;
    if (moonPx > 24 && surfacePointVisible(e, s3)) {
      const base = P(s3);
      const tip = P(vec.scale(s3, 1.05));
      if (base.front && tip.front) {
        let dx = tip.x - base.x;
        let dy = tip.y - base.y;
        const l = Math.hypot(dx, dy);
        const k = l > 0.5 ? 16 / l : 0;
        dx *= k;
        dy = l > 0.5 ? dy * k : -16;
        pinTop = { x: base.x + dx, y: base.y + dy, front: true };
        g.strokeStyle = COL.casing;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(base.x, base.y);
        g.lineTo(pinTop.x, pinTop.y);
        g.stroke();
        g.strokeStyle = COL.pin;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = COL.pin;
        g.beginPath();
        g.arc(pinTop.x, pinTop.y, 3, 0, 2 * Math.PI);
        g.fill();
      }
    }
    leader(g, labels.site, pinTop, { dx: 30, dy: -22 }, false, rect, placed);

    const pole3: Vec3 = [0, -1, 0];
    leader(g, labels.pole, moonPx > 140 && surfacePointVisible(e, pole3) ? P(pole3) : null, { dx: -30, dy: 22 }, true, rect, placed);
    leader(g, labels.sun, hiddenBy(L.sunPos, 'sun') ? null : sunC, { dx: -30, dy: 34 }, true, rect, placed);
    leader(g, labels.moon, moonPx < 90 ? moonC : null, { dx: -26, dy: -24 }, true, rect, placed);
    leader(g, labels.earth, hiddenBy(L.earthPos, 'earth') ? null : earthC, { dx: 26 + Math.min(earthPx, 200) * 0.7, dy: -24 - Math.min(earthPx, 200) * 0.7 }, false, rect, placed);
    // Distance label on the Moon–Earth line, when the line is long enough on screen.
    const a3 = meToThree(unit(geo.earthDirMe));
    const b3 = vec.sub(L.earthPos, vec.scale(unit(L.earthPos), L.earthR));
    const a = P(a3);
    const b = P(b3);
    // Anchored a third of the way from the Moon so it stays clear of the Earth label.
    const mid = P(vec.add(a3, vec.scale(vec.sub(b3, a3), 0.35)));
    const long = a.front && b.front && Math.hypot(a.x - b.x, a.y - b.y) > 140;
    leader(g, labels.distance, long ? mid : null, { dx: 14, dy: 22 }, false, rect, placed);
  }

  function frame() {
    raf = 0;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.updateMatrixWorld();
    skyCam.quaternion.copy(camera.quaternion);
    skyCam.projectionMatrix.copy(camera.projectionMatrix);
    skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    skyCam.updateMatrixWorld();
    // The Earth–Moon line only reads when both ends are in view (it runs off-frame at the Moon level).
    line.visible = level !== 'moon';
    renderer.clear();
    renderer.render(skyScene, skyCam);
    renderer.clearDepth();
    renderer.render(scene, camera);
    drawOverlay(w, h);
  }

  function loadTex(loader: TextureLoader, t: SpaceTexture): Promise<Texture | null> {
    return loader
      .loadAsync(textureUrl(t))
      .then((tex) => {
        tex.wrapS = RepeatWrapping;
        tex.offset.x = textureOffsetU(t.lonAtLeftEdgeDeg);
        tex.anisotropy = maxAniso;
        if (t.kind === 'color') tex.colorSpace = SRGBColorSpace;
        if (disposed) {
          tex.dispose();
          return null;
        }
        textures.push(tex);
        return tex;
      })
      .catch(() => null);
  }

  resize();

  return {
    async setTextures(manifest) {
      if (!manifest) return { moon: false, earth: false };
      const loader = new TextureLoader();
      const [mc, mn, ec] = await Promise.all([
        loadTex(loader, manifest.moonColor),
        loadTex(loader, manifest.moonRelief),
        loadTex(loader, manifest.earthColor),
      ]);
      if (disposed) return { moon: false, earth: false };
      if (mc) {
        moonMat.map = mc;
        moonMat.color.set('#FFFFFF');
        if (mn && manifest.moonRelief.kind === 'height') {
          moonMat.bumpMap = mn;
          moonMat.bumpScale = MOON_BUMP_SCALE;
        } else if (mn) moonMat.normalMap = mn;
        moonMat.needsUpdate = true;
      }
      if (ec) {
        earthMat.map = ec;
        earthMat.color.set('#FFFFFF');
        earthMat.needsUpdate = true;
      }
      requestRender();
      return { moon: mc !== null, earth: ec !== null };
    },
    setGeometry(g) {
      const first = geo === null;
      geo = g;
      applyGeometry();
      if (first) {
        const pose = levelPose('moon', layout as Layout, g.siteDirMe, minHalfFovDeg());
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        controls.target.set(0, 0, 0);
        applyLimits();
        controls.update();
      }
    },
    setScaleMode(next) {
      if (next === mode) return;
      mode = next;
      applyGeometry();
      if (level === 'moon') applyLimits();
      else changeLevel(level);
    },
    setSafeArea(s) {
      safe = s;
      resize();
    },
    setLevel(next) {
      changeLevel(next);
    },
    enter() {
      if (!geo || !layout) return;
      const home = levelPose('moon', layout, geo.siteDirMe, minHalfFovDeg());
      if (init.reducedMotion) return moveTo(home);
      moveTo(home, { target: [0, 0, 0], eye: vec.scale(unit(home.eye), 1.45) });
    },
    goHome() {
      if (level !== 'moon') {
        level = 'moon';
        init.onLevel('moon');
      }
      if (geo && layout) moveTo(levelPose('moon', layout, geo.siteDirMe, minHalfFovDeg()));
    },
    zoom(dir) {
      if (tweenRaf) return;
      const d = dist();
      if (dir > 0 && d <= limits.min * 1.02) return stepIn();
      if (dir < 0 && d >= limits.max * 0.98) return stepOut();
      if (dir > 0) controls.dollyIn(0.8);
      else controls.dollyOut(0.8);
      controls.update();
    },
    orbit(dAz, dEl) {
      if (tweenRaf) return;
      controls.rotateLeft(dAz * DEG);
      controls.rotateUp(dEl * DEG);
      controls.update();
    },
    resize,
    dispose() {
      disposed = true;
      stopTween();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('wheel', onWheel);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      for (const t of textures) t.dispose();
      glow.dispose();
      sphere.dispose();
      moonMat.dispose();
      earthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      sunMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
