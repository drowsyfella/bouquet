import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBouquet } from './bouquet.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gate = $('gate');
const hint = $('hint');
const overlay = $('overlay');
const muteBtn = $('mute');

// ---- Card ----
let cardOpen = false;
function openCard() {
  if (cardOpen) return;
  cardOpen = true;
  overlay.classList.add('on');
  canvas.classList.add('dim');
  audio.chime(1.26, 0.55); // quieter, a bit higher
  dismissHint();
}
function closeCard() {
  cardOpen = false;
  overlay.classList.remove('on');
  canvas.classList.remove('dim');
}
$('close').addEventListener('click', closeCard);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCard(); });

// ---- Mute ----
const syncMute = () => muteBtn.classList.toggle('muted', audio.isMuted());
syncMute();
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.isMuted()); syncMute(); });

// ---- Hint ----
let hintTimer = 0, hintDone = false;
function dismissHint() {
  hintDone = true;
  clearTimeout(hintTimer);
  hint.classList.remove('on');
}

// ---- WebGL check ----
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (!hasWebGL()) {
  // Fallback: card only, no 3D
  document.body.classList.add('nogl');
  gate.addEventListener('click', () => {
    audio.unlock();
    audio.chime();
    gate.classList.add('gone');
    overlay.classList.add('on');
    $('close').style.display = 'none';
  }, { once: true });
} else {
  init();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  scene.add(new THREE.HemisphereLight('#FFFFFF', '#F6D6DE', 2.2));
  const sun = new THREE.DirectionalLight('#FFF6F0', 1.9);
  sun.position.set(2.5, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#FFE4EA', 0.6);
  fill.position.set(-3, 1, -2);
  scene.add(fill);
  // soft light that follows the camera so the front never goes grey
  const front = new THREE.DirectionalLight('#FFFFFF', 0.9);
  camera.add(front);
  front.position.set(0, 0.5, 1);
  scene.add(camera);

  const bouquet = createBouquet();
  scene.add(bouquet.object, bouquet.shadow);
  bouquet.object.scale.setScalar(0.85);

  const target = new THREE.Vector3(0, 0.05, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.35;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;

  // Fit camera distance so the bouquet fills a portrait phone nicely
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = w / h < 0.75 ? 6.2 / Math.max(w / h, 0.45) * 0.6 : 6.2;
    const dir = camera.position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.62, 1);
    camera.position.copy(target).add(dir.normalize().multiplyScalar(dist));
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Auto-rotate resumes after 4 s idle ----
  let idleTimer = 0;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 4000);
  });

  // ---- Tap vs drag + rustle ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null, last = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    last = { ...down };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const now = performance.now();
    const d = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    const speed = d / Math.max(now - last.t, 1);
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) audio.rustle(speed);
    last = { x: e.clientX, y: e.clientY, t: now };
  });
  const release = (e) => {
    if (!down) return;
    audio.rustleStop();
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (e.type !== 'pointerup' || moved >= 6 || dt >= 300 || cardOpen) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObjects(bouquet.tappables, true).length) openCard();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- Intro ----
  let introStart = -1;
  const clock = new THREE.Clock();
  bouquet.object.visible = false;

  gate.addEventListener('click', () => {
    audio.unlock();
    audio.chime();
    muteBtn.classList.add('on');
    gate.classList.add('gone');
    canvas.classList.add('on');
    bouquet.object.visible = true;
    introStart = clock.getElapsedTime();
    hintTimer = setTimeout(() => { if (!hintDone) hint.classList.add('on'); }, 3000 + 1200);
  }, { once: true });

  function frame() {
    const t = clock.getElapsedTime();
    if (introStart >= 0) {
      const k = Math.min((t - introStart) / 1.2, 1);
      const e = 1 - Math.pow(1 - k, 3);
      bouquet.object.scale.setScalar(0.85 * (0.82 + 0.18 * e));
      bouquet.setBloom(t - introStart);
      if (t - introStart > 2.5) introStart = -1; // bloom done
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // Pause rendering when the tab is hidden
  const run = () => renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else { clock.getDelta(); run(); }
  });
  run();
  window.__bouquet = { renderer, scene };
}
