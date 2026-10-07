// Procedural bouquet: roses, baby's breath, paper wrap, ribbon bow.
// No model files, no textures.
import * as THREE from 'three';

const ROSE_PINK = new THREE.Color('#F2A0B4');
const ROSE_DEEP = new THREE.Color('#D66A84');
const ROSE_LIGHT = new THREE.Color('#F8C6D2');
const PAPER = '#F7F7F5';
const PAPER_INNER = '#FBF7F0';
const SATIN = '#F3ECE0';

// Seeded random so the bouquet looks the same on every load
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const range = (a, b) => a + rand() * (b - a);

// ---- Rose petal: curved cupped shell, base at origin, grows along +Y ----
function petalGeometry() {
  const U = 6, V = 5;
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const w = 0.5 * Math.sqrt(Math.sin(Math.PI * (0.08 + 0.82 * u)));
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * 2 - 1;
      const x = v * w;
      // cup: edges wrap back toward the rose axis; top lip curls outward
      const z = -1.6 * x * x + 0.22 * u * u * u + 0.1 * Math.sin(Math.PI * u);
      pos.push(x, u, z);
      const shade = 0.55 + 0.45 * u;
      col.push(shade, shade, shade);
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Petal layers from the tight center outward
const LAYERS = [
  { n: 3, r: 0.03, tilt: -0.18, s: 0.42, tone: 0.0 },
  { n: 4, r: 0.07, tilt: -0.05, s: 0.55, tone: 0.2 },
  { n: 5, r: 0.11, tilt: 0.2, s: 0.68, tone: 0.45 },
  { n: 6, r: 0.15, tilt: 0.55, s: 0.8, tone: 0.7 },
  { n: 6, r: 0.19, tilt: 0.95, s: 0.88, tone: 0.9 },
];
const PETALS_PER_ROSE = LAYERS.reduce((s, l) => s + l.n, 0);

// Dome the roses sit on
const DOME_C = new THREE.Vector3(0, 0.56, 0);
const DOME_R = 0.72;

function rosePlacements() {
  const out = [{ polar: 0, az: 0 }];
  for (let i = 0; i < 6; i++) out.push({ polar: 0.46, az: (i / 6) * Math.PI * 2 + 0.3 });
  for (let i = 0; i < 10; i++) out.push({ polar: 0.92, az: (i / 10) * Math.PI * 2 });
  return out.map((p) => {
    const polar = p.polar + (p.polar ? range(-0.05, 0.05) : 0);
    const az = p.az + range(-0.08, 0.08);
    const n = new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az));
    return { n, polar, az };
  });
}

function buildRoses() {
  const roses = rosePlacements();
  const geo = petalGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, roses.length * PETALS_PER_ROSE);

  const up = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const roseMats = [];
  const petalMats = [];

  roses.forEach((r, ri) => {
    // axis tilts outward along the dome normal, a bit straighter than the surface
    const axis = r.n.clone().lerp(up, 0.25).normalize();
    const pos = DOME_C.clone().addScaledVector(r.n, DOME_R - 0.08);
    const size = range(0.33, 0.37);
    tmpQ.setFromUnitVectors(up, axis);
    const spin = new THREE.Quaternion().setFromAxisAngle(axis, range(0, Math.PI * 2));
    const q = spin.multiply(tmpQ);
    roseMats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(size, size, size)));

    const hue = range(-0.012, 0.012);
    let k = 0;
    LAYERS.forEach((L) => {
      for (let p = 0; p < L.n; p++, k++) {
        const theta = k * 2.39996 + range(-0.15, 0.15); // golden-angle spiral
        const tilt = L.tilt + range(-0.08, 0.08);
        const s = L.s * range(0.92, 1.06);
        const local = new THREE.Matrix4()
          .makeRotationY(theta)
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, L.r))
          .multiply(new THREE.Matrix4().makeRotationX(tilt))
          .multiply(new THREE.Matrix4().makeScale(s, s * range(0.95, 1.1), s));
        petalMats.push(local);

        if (L.tone < 0.5) c.copy(ROSE_DEEP).lerp(ROSE_PINK, L.tone * 2);
        else c.copy(ROSE_PINK).lerp(ROSE_LIGHT, (L.tone - 0.5) * 1.6);
        c.offsetHSL(hue, range(-0.03, 0.03), range(-0.03, 0.03));
        mesh.setColorAt(ri * PETALS_PER_ROSE + k, c);
      }
    });
  });

  // bloom: each rose scales 0.6 -> 1 with a stagger
  const bloomStart = roses.map((_, i) => i * 0.045 + range(0, 0.1));
  const sc = new THREE.Matrix4();
  function setBloom(t) {
    for (let ri = 0; ri < roses.length; ri++) {
      const x = THREE.MathUtils.clamp((t - bloomStart[ri]) / 0.9, 0, 1);
      const e = 1 - Math.pow(1 - x, 3);
      const s = 0.6 + 0.4 * e;
      sc.makeScale(s, s, s);
      for (let k = 0; k < PETALS_PER_ROSE; k++) {
        const i = ri * PETALS_PER_ROSE + k;
        // outer petals open slightly as the rose blooms
        m.copy(roseMats[ri]).multiply(sc).multiply(petalMats[i]);
        mesh.setMatrixAt(i, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  setBloom(0);
  mesh.instanceColor.needsUpdate = true;
  return { mesh, setBloom, roses };
}

// ---- Dark underlayer so gaps between roses read as shadow, not see-through ----
function buildFiller() {
  const g = new THREE.SphereGeometry(DOME_R - 0.04, 20, 10, 0, Math.PI * 2, 0, 1.35);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#B8697F', roughness: 0.9 }));
  mesh.position.copy(DOME_C);
  return mesh;
}

// ---- Baby's breath: tiny white puffs in gaps and around the dome edge ----
function buildBabysBreath(roses) {
  const puffs = [];
  // ring around the edge
  for (let i = 0; i < 26; i++) {
    const az = (i / 26) * Math.PI * 2 + range(-0.1, 0.1);
    puffs.push({ polar: range(1.12, 1.3), az, lift: range(0.02, 0.1) });
  }
  // gaps between rings of roses
  for (let i = 0; i < 8; i++) puffs.push({ polar: range(0.66, 0.74), az: (i / 8) * Math.PI * 2 + 0.6, lift: 0.08 });
  for (let i = 0; i < 9; i++) puffs.push({ polar: range(1.0, 1.08), az: (i / 9) * Math.PI * 2 + 0.33, lift: 0.1 });
  for (let i = 0; i < 4; i++) puffs.push({ polar: range(0.25, 0.3), az: (i / 4) * Math.PI * 2, lift: 0.12 });

  const PER = 15;
  const geo = new THREE.IcosahedronGeometry(0.022, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8, emissive: '#FFFFFF', emissiveIntensity: 0.18 });
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length * PER);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let i = 0;
  for (const p of puffs) {
    const n = new THREE.Vector3(Math.sin(p.polar) * Math.cos(p.az), Math.cos(p.polar), Math.sin(p.polar) * Math.sin(p.az));
    const center = DOME_C.clone().addScaledVector(n, DOME_R + p.lift);
    for (let k = 0; k < PER; k++, i++) {
      const off = new THREE.Vector3(range(-1, 1), range(-0.6, 1), range(-1, 1)).normalize().multiplyScalar(range(0.01, 0.1));
      const sz = range(0.6, 1.35);
      s.set(sz, sz, sz);
      q.setFromEuler(new THREE.Euler(range(0, 6), range(0, 6), 0));
      m.compose(center.clone().add(off), q, s);
      mesh.setMatrixAt(i, m);
    }
  }
  return mesh;
}

// ---- Paper wrap: open cone, flared rim with 5 pointed lobes, crumple noise ----
const WRAP = { yb: -0.75, h: 1.3, rb: 0.16, rt: 0.98 };
export const wrapRadiusAt = (y) => {
  const t = (y - WRAP.yb) / WRAP.h;
  return WRAP.rb + (WRAP.rt - WRAP.rb) * Math.pow(Math.max(t, 0), 1.15);
};

function wrapGeometry({ phase, lobeH, flare, scale }) {
  const A = 90, T = 26;
  const pos = [], idx = [];
  for (let j = 0; j <= T; j++) {
    const t = j / T;
    for (let i = 0; i <= A; i++) {
      const a = (i / A) * Math.PI * 2;
      const lobe = Math.pow(1 - Math.abs(Math.sin(2.5 * (a + phase))), 1.6);
      const rim = THREE.MathUtils.smoothstep(t, 0.5, 1);
      let r = (WRAP.rb + (WRAP.rt - WRAP.rb) * Math.pow(t, 1.15)) * scale;
      r += flare * Math.pow(t, 3) * (0.45 + 0.55 * lobe);
      r += 0.022 * t * Math.sin(a * 13 + t * 9) * Math.sin(a * 7 - t * 17); // crumples
      r += 0.012 * Math.sin(a * 31 + t * 40) * t;
      const y = WRAP.yb + t * WRAP.h + lobeH * lobe * rim;
      pos.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < A; i++) {
      const a = j * (A + 1) + i, b = a + A + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildWrap() {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    wrapGeometry({ phase: 0, lobeH: 0.42, flare: 0.42, scale: 1 }),
    new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.9, side: THREE.DoubleSide }),
  );
  const inner = new THREE.Mesh(
    wrapGeometry({ phase: Math.PI / 5, lobeH: 0.3, flare: 0.3, scale: 0.95 }),
    new THREE.MeshStandardMaterial({ color: PAPER_INNER, roughness: 0.92, side: THREE.DoubleSide }),
  );
  // stem tail: narrow wrapped tube below the cone
  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(WRAP.rb, 0.11, 0.62, 20, 1),
    outer.material,
  );
  tail.position.y = WRAP.yb - 0.3;
  group.add(outer, inner, tail);
  return group;
}

// ---- Ribbon: band around the waist, knot, two loops, two tails ----
function buildRibbon() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: SATIN, roughness: 0.32, metalness: 0.08 });
  const y = -0.55;
  const r = wrapRadiusAt(y) + 0.012;

  const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 40), mat);
  band.rotation.x = Math.PI / 2;
  band.position.y = y;
  band.scale.z = 1.8; // flatter, taller band
  group.add(band);

  const bow = new THREE.Group();
  bow.position.set(0, y, r + 0.02);
  bow.scale.setScalar(1.45);
  group.add(bow);

  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  const tube = (pts, rad, closed = false) =>
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), 48, rad, 7, closed), mat);

  for (const side of [-1, 1]) {
    const s = side;
    const loop = tube([
      V(0, 0, 0.02), V(0.1 * s, 0.1, 0.06), V(0.28 * s, 0.2, 0.06), V(0.4 * s, 0.13, 0.03),
      V(0.36 * s, -0.02, 0.02), V(0.2 * s, -0.04, 0.05), V(0.06 * s, -0.01, 0.04),
    ], 0.03, true);
    loop.scale.set(1, 1, 0.9);
    bow.add(loop);

    const tail = tube([
      V(0.02 * s, -0.02, 0.05), V(0.09 * s, -0.16, 0.07), V(0.11 * s, -0.34, 0.06),
      V(0.17 * s, -0.5, 0.04), V(0.2 * s, -0.62, 0.05),
    ], 0.026);
    bow.add(tail);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), mat);
  knot.scale.set(1, 0.85, 0.75);
  knot.position.z = 0.05;
  bow.add(knot);
  return group;
}

// ---- Soft blob shadow on the floor (procedural canvas gradient) ----
function buildShadow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(160,90,110,0.32)');
  grd.addColorStop(1, 'rgba(160,90,110,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.05;
  return mesh;
}

export function createBouquet() {
  const group = new THREE.Group();
  const roses = buildRoses();
  const wrap = buildWrap();
  const ribbon = buildRibbon();
  group.add(roses.mesh, buildFiller(), buildBabysBreath(roses.roses), wrap, ribbon);

  // tilt the whole bouquet slightly toward the viewer and lift it to center
  const bouquet = new THREE.Group();
  bouquet.add(group);
  group.position.y = 0.02;

  const shadow = buildShadow();
  return {
    object: bouquet,
    shadow,
    tappables: [roses.mesh, ...wrap.children, ...ribbon.children],
    setBloom: roses.setBloom,
  };
}
