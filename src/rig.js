// @ts-nocheck
import * as THREE from './vendor/three.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const C = [-3.6, -1.0, 1.6];           // cartridge x
const YT = 2.1, YB = -2.1, YIN = 2.9;  // port lines
const BASE_FLOW = 1.8, P_SUPPLY = 300;
const BASE_DP = [10, 14, 18];
const TDS_IN = 380, TDS_OUT = 24;

const INFO = {
  p0: ['P0 · inlet pressure', 'Pressure transducer ahead of the first housing. With P1 to P3 it gives the pressure drop across each cartridge. Sensors sit on the existing water lines; nothing in the purifier is redesigned.'],
  p1: ['P1 · after cartridge 1', 'Pressure after housing 1 and before housing 2. P0 minus P1 is the drop across cartridge 1.'],
  p2: ['P2 · after cartridge 2', 'Pressure after housing 2 and before housing 3. P1 minus P2 is the drop across cartridge 2.'],
  p3: ['P3 · after cartridge 3', 'Pressure after housing 3, at the membrane inlet. P2 minus P3 is the drop across cartridge 3. The abstract specifies 4 to 5 transducers; this model shows four.'],
  flow: ['Flow sensor', 'Pressure drop depends on flow, so every drop is divided by flow. Rising drop per litre marks a clogging cartridge. A removed one collapses toward zero. The abstract also lists a second flow sensor on the reject line; this model shows one.'],
  tdsin: ['Inlet TDS', 'Conductivity probe on the feed water. With the outlet probe it gives membrane rejection: 1 - TDS(out) / TDS(in).'],
  tdsout: ['Outlet TDS', 'Conductivity probe on the product water. The candidate probe is accurate to ±10% of full scale, so rejection uses both probes plus calibration. The bench test must show whether that resolves a 90% threshold.'],
  ctrl: ['Controller', 'ESP32 with two ADS1115 converters reads the transducers, flow and conductivity probes, applies first-principles thresholds and flags the cartridge. It could feed the existing controller and app.'],
  dp1: ['Cartridge 1 · drop per flow', 'Pressure drop across the cartridge divided by flow, compared with its clean baseline.'],
  dp2: ['Cartridge 2 · drop per flow', 'Pressure drop across the cartridge divided by flow, compared with its clean baseline.'],
  dp3: ['Cartridge 3 · drop per flow', 'Pressure drop across the cartridge divided by flow, compared with its clean baseline.'],
};

export function initRig(root) {
  const $ = (s) => root.querySelector(s);
  const stage = $('#stage'), canvas = $('#rig-canvas'), tagsEl = $('#tags');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-6, 10, 12); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 40 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  scene.add(key);
  const rig = new THREE.Group(); scene.add(rig);

  // ---------- materials
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ef, roughness: 0.38, metalness: 0.02 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.9 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x2a62d6, roughness: 0.25, metalness: 0.0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1 });
  const led = new THREE.MeshBasicMaterial({ color: 0x7ff0e2 });

  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  function slab(w, h, d, r, bevel, mat) {
    const g = new THREE.ExtrudeGeometry(rrShape(w, h, r), { depth: d, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 10 });
    g.translate(0, 0, -d / 2);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
  }
  function tex(draw, w = 256, h = 512, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4; if (rep) t.repeat.set(...rep); return t;
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---------- casing (cutaway)
  const back = slab(15.6, 7.0, 0.3, 0.5, 0.08, shell); back.position.set(0.4, 0, -1.4); rig.add(back);
  const top = slab(15.6, 0.5, 2.6, 0.2, 0.08, white); top.position.set(0.4, 3.55, -0.2); rig.add(top);
  const bot = slab(15.6, 0.5, 2.6, 0.2, 0.08, white); bot.position.set(0.4, -3.55, -0.2); rig.add(bot);
  const rightWall = slab(0.5, 7.0, 2.6, 0.2, 0.08, white); rightWall.position.set(8.2, 0, -0.2); rig.add(rightWall);
  const leftPanel = slab(2.3, 7.4, 2.8, 0.6, 0.12, white); leftPanel.position.set(-6.6, 0, 0.0); rig.add(leftPanel);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.5), new THREE.MeshBasicMaterial({ color: 0xbfe9ff }));
  strip.position.set(-7.0, 0.3, 1.53); rig.add(strip);
  [-5.6, 6.8].forEach((x) => { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.3, 24), black); f.position.set(x, -3.95, -0.2); rig.add(f); });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -4.1; floor.receiveShadow = true; scene.add(floor);

  // ---------- paths
  function roundedPath(pts, r = 0.35) {
    const cp = new THREE.CurvePath(), V = (a) => new THREE.Vector3(...a);
    let cur = V(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = V(pts[i]), n = V(pts[i + 1]);
      const a = p.clone().sub(cur).normalize(), b = n.clone().sub(p).normalize();
      const rr = Math.min(r, p.distanceTo(cur) / 2, p.distanceTo(n) / 2);
      const s = p.clone().addScaledVector(a, -rr), e = p.clone().addScaledVector(b, rr);
      if (cur.distanceTo(s) > 1e-4) cp.add(new THREE.LineCurve3(cur.clone(), s));
      cp.add(new THREE.QuadraticBezierCurve3(s, p, e)); cur = e;
    }
    cp.add(new THREE.LineCurve3(cur, V(pts[pts.length - 1]))); return cp;
  }
  const L = C[0], M = C[1], R = C[2];
  const paths = {
    in: roundedPath([[8.9, YIN, 0], [L, YIN, 0], [L, 1.9, 0]]),
    c1: roundedPath([[L, 1.9, 0], [L, -1.9, 0]]),
    l1: roundedPath([[L, -1.9, 0], [L, YB, 0], [M, YB, 0], [M, -1.9, 0]]),
    c2: roundedPath([[M, -1.9, 0], [M, 1.9, 0]]),
    l2: roundedPath([[M, 1.9, 0], [M, YT, 0], [R, YT, 0], [R, 1.9, 0]]),
    c3: roundedPath([[R, 1.9, 0], [R, -1.9, 0]]),
    out: roundedPath([[R, -1.9, 0], [R, YB, 0], [8.9, YB, 0]]),
  };
  const bypass = [
    roundedPath([[L, YT, 0], [L, YT, 1.3], [L, YB, 1.3], [L, YB, 0]], 0.3),
    roundedPath([[M, YB, 0], [M, YB, 1.3], [M, YT, 1.3], [M, YT, 0]], 0.3),
    roundedPath([[R, YT, 0], [R, YT, 1.3], [R, YB, 1.3], [R, YB, 0]], 0.3),
  ];
  const tubeR = 0.13;
  const tube = (cp, mat = tubeMat, r = tubeR) => { const m = new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(24, Math.round(cp.getLength() * 10)), r, 14, false), mat); m.castShadow = true; rig.add(m); return m; };
  ['in', 'l1', 'l2', 'out'].forEach((k) => tube(paths[k]));
  const bypassMat = tubeMat.clone();
  const bypassMesh = bypass.map((cp) => { const m = tube(cp, bypassMat, 0.1); m.visible = false; return m; });

  // fittings at ports
  function fitting(x, y) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20), white); f.position.set(x, y, 0); f.castShadow = true; rig.add(f);
  }
  C.forEach((x) => { fitting(x, 1.95); fitting(x, -1.95); });

  // ---------- cartridges
  const fibre = tex((g, w, h) => { g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2200; i++) { g.strokeStyle = `rgba(${120 + rnd() * 100},${120 + rnd() * 100},${120 + rnd() * 100},0.25)`; g.lineWidth = 1; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 14, y + (rnd() - .5) * 14); g.stroke(); } }, 256, 512, [2, 2]);
  const gran = tex((g, w, h) => { g.fillStyle = '#16181b'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { const v = 25 + rnd() * 70; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 5, 0, 7); g.fill(); } }, 256, 512, [2, 2]);
  const ridge = tex((g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) % 2 ? '#2f74dd' : '#3f86ee'; g.fillRect(x, 0, 8, h); } g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2); }, 256, 256, [1, 1]);
  const fills = [], shells = [], cart = [];
  const fillMats = [
    new THREE.MeshStandardMaterial({ map: fibre, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: gran, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: ridge, roughness: 0.45 }),
  ];
  C.forEach((x, i) => {
    const g = new THREE.Group(); g.position.x = x; rig.add(g); cart.push(g);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 3.5, 40), fillMats[i]); fill.castShadow = true; g.add(fill); fills.push(fill);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 3.6, 48, 1, true), glass.clone()); sh.renderOrder = 2; g.add(sh); shells.push(sh);
    [1, -1].forEach((s) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.34, 48), white); cap.position.y = s * 1.88; cap.castShadow = true; g.add(cap);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.04, 8, 48), white); rim.rotation.x = Math.PI / 2; rim.position.y = s * 1.7; g.add(rim);
    });
  });

  // ---------- membrane (horizontal)
  const mem = new THREE.Group(); mem.position.set(5.1, YB, 0); rig.add(mem);
  const memBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 32), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.3 }));
  memBody.rotation.z = Math.PI / 2; memBody.castShadow = true; mem.add(memBody);
  [-1.15, 1.15].forEach((x) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.24, 32), white); c.rotation.z = Math.PI / 2; c.position.x = x; mem.add(c); });

  // ---------- sensors
  const sensors = {};
  function pressureSensor(key, x, y, orient = 'h') {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.5), black); body.castShadow = true; g.add(body);
    [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 16), brass); if (orient === 'h') { b.rotation.z = Math.PI / 2; b.position.x = s * 0.45; } else { b.position.y = s * 0.4; } g.add(b); });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), led); l.position.set(0.15, 0.1, 0.26); g.add(l);
    if (orient === 'v') body.scale.set(0.8, 1.0, 1);
    rig.add(g); sensors[key] = g; return g;
  }
  pressureSensor('p0', L, 2.45, 'v');
  pressureSensor('p1', (L + M) / 2, YB);
  pressureSensor('p2', (M + R) / 2, YT);
  pressureSensor('p3', 3.0, YB);
  // flow sensor
  const fl = new THREE.Group(); fl.position.set(3.7, YIN, 0);
  const flb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), black); flb.castShadow = true; fl.add(flb);
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: tex((g, w, h) => { g.fillStyle = '#15171a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8dce0'; g.lineWidth = 6; g.beginPath(); g.moveTo(w - 16, h / 2); g.lineTo(16, h / 2); g.moveTo(40, h / 2 - 22); g.lineTo(16, h / 2); g.lineTo(40, h / 2 + 22); g.stroke(); }, 128, 64) }));
  arrow.position.z = 0.36; fl.add(arrow); rig.add(fl); sensors.flow = fl;
  // TDS probes
  function tds(key, x, y, up) {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 20), black); tee.rotation.z = Math.PI / 2; g.add(tee);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 20), black); stem.position.y = up * 0.55; stem.castShadow = true; g.add(stem);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), white); tip.position.y = up * 1.2; g.add(tip);
    rig.add(g); sensors[key] = g;
  }
  tds('tdsin', 6.5, YIN, 1); tds('tdsout', 6.5, YB, -1);
  // controller with live LCD
  const ctrl = new THREE.Group(); ctrl.position.set(5.6, 0.45, -0.2);
  const cb = slab(2.4, 2.5, 0.8, 0.2, 0.05, black); cb.castShadow = true; ctrl.add(cb);
  const lcdC = document.createElement('canvas'); lcdC.width = 256; lcdC.height = 128; const lcdG = lcdC.getContext('2d');
  const lcdT = new THREE.CanvasTexture(lcdC); lcdT.colorSpace = THREE.SRGBColorSpace;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: lcdT })); lcd.position.set(0, 0.45, 0.46); ctrl.add(lcd);
  const cl = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), led); cl.position.set(0.9, -0.2, 0.46); ctrl.add(cl);
  rig.add(ctrl); sensors.ctrl = ctrl;
  // cables
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6 });
  ['p0', 'p1', 'p2', 'p3', 'flow', 'tdsin', 'tdsout'].forEach((k, i) => {
    const a = sensors[k].position.clone(); const b = new THREE.Vector3(5.6 + (i - 3) * 0.3, -0.8, 0.1);
    const mid = a.clone().lerp(b, 0.5); mid.z += 0.9; mid.y -= 0.6;
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a.clone().setZ(0.3), mid, b]), 40, 0.035, 6), cableMat); rig.add(m);
  });

  // ---------- water dots
  const segs = [];
  const addSeg = (key, path, n, extra) => { const s = { key, path, n, off: Array.from({ length: n }, (_, i) => i / n + rnd() * 0.02), ...extra }; segs.push(s); return s; };
  addSeg('in', paths.in, 26); addSeg('c1', paths.c1, 8, { cart: 0 }); addSeg('l1', paths.l1, 14);
  addSeg('c2', paths.c2, 8, { cart: 1 }); addSeg('l2', paths.l2, 14); addSeg('c3', paths.c3, 8, { cart: 2 });
  addSeg('out', paths.out, 28);
  bypass.forEach((p, i) => addSeg('b' + i, p, 10, { byp: i }));
  const total = segs.reduce((a, s) => a + s.n, 0);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff });
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 8), dotMat, total);
  dots.frustumCulled = false; rig.add(dots);
  const tmp = new THREE.Object3D(), pt = new THREE.Vector3();

  // ---------- readout tags
  const TAGS = {
    p0: { el: null, at: () => sensors.p0.position.clone().add(new THREE.Vector3(0.55, 0.7, 0.4)) },
    p1: { at: () => sensors.p1.position.clone().add(new THREE.Vector3(0, -0.75, 0.4)) },
    p2: { at: () => sensors.p2.position.clone().add(new THREE.Vector3(0, 0.75, 0.4)) },
    p3: { at: () => sensors.p3.position.clone().add(new THREE.Vector3(0, -0.75, 0.4)) },
    flow: { at: () => sensors.flow.position.clone().add(new THREE.Vector3(0, 0.8, 0.4)) },
    tdsin: { at: () => sensors.tdsin.position.clone().add(new THREE.Vector3(0.1, 1.5, 0.2)) },
    tdsout: { at: () => sensors.tdsout.position.clone().add(new THREE.Vector3(0, -1.75, 0.2)) },
    dp1: { at: () => new THREE.Vector3(C[0], 0, 1.0), cls: 'tag-dp' },
    dp2: { at: () => new THREE.Vector3(C[1], 0, 1.0), cls: 'tag-dp' },
    dp3: { at: () => new THREE.Vector3(C[2], 0, 1.0), cls: 'tag-dp' },
  };
  const NAMES = { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3', flow: 'Flow', tdsin: 'TDS in', tdsout: 'TDS out', dp1: 'Cartridge 1', dp2: 'Cartridge 2', dp3: 'Cartridge 3' };
  const SHORT = { dp1: 'C1', dp2: 'C2', dp3: 'C3' };
  Object.entries(TAGS).forEach(([k, t]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tag ' + (t.cls || '') + (/^p\d$/.test(k) ? ' tag-p' : '');
    b.innerHTML = `<span class="tag-n"><span class="lg">${NAMES[k]}</span><span class="sh">${SHORT[k] || NAMES[k]}</span></span><span class="tag-v">-</span>`; b.addEventListener('click', () => select(k));
    tagsEl.appendChild(b); t.el = b; t.v = b.querySelector('.tag-v'); t.p = new THREE.Vector3();
  });
  const infoT = $('#info-title'), infoB = $('#info-body');
  let selected = null;
  function select(k) { selected = k; Object.entries(TAGS).forEach(([n, t]) => t.el.classList.toggle('is-on', n === k)); infoT.textContent = INFO[k][0]; infoB.textContent = INFO[k][1]; }
  select('flow');
  canvas.addEventListener('click', (e) => { /* hotspots are the tags; canvas click clears nothing */ });

  // ---------- state + sim
  const state = { mode: 'new', target: 1 };
  const sim = { flow: BASE_FLOW, dp: [...BASE_DP], clog: [1, 1, 1], gone: [0, 0, 0], byp: [0, 0, 0] };
  const goal = () => {
    const g = { clog: [1, 1, 1], gone: [0, 0, 0], byp: [0, 0, 0], flowK: 1 };
    const i = state.target;
    if (state.mode === 'clogged') { g.clog[i] = 3.6; g.flowK = 0.8; }
    if (state.mode === 'removed') g.gone[i] = 1;
    if (state.mode === 'bypassed') g.byp[i] = 1;
    return g;
  };
  const colors = { ok: '#1f7a4d', warn: '#b45309', bad: '#b42318' };
  const fmt = (v, d = 1) => v.toFixed(d);
  const STATUS = { ok: 'OK', clog: 'Clogging', gone: 'Removed or bypassed' };
  const rows = [...root.querySelectorAll('[data-row]')];
  const banner = $('#banner'), bannerT = $('#banner-text');
  const clock = new THREE.Clock(); let tAcc = 0, lcdLast = '';
  let readT = 0;

  function step(dt, t) {
    const g = goal(), k = 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < 3; i++) {
      sim.clog[i] += (g.clog[i] - sim.clog[i]) * k; sim.gone[i] += (g.gone[i] - sim.gone[i]) * k; sim.byp[i] += (g.byp[i] - sim.byp[i]) * k;
    }
    sim.flow += (BASE_FLOW * g.flowK - sim.flow) * k;
    const jit = (a, f) => Math.sin(t * f + a) * 0.5 + Math.sin(t * f * 2.3 + a * 2) * 0.3;
    const flow = sim.flow + jit(1, 1.7) * 0.012 * BASE_FLOW;
    const dp = sim.dp.map((_, i) => {
      const open = Math.max(0, 1 - Math.max(sim.gone[i], sim.byp[i]));
      return (0.4 + open * (BASE_DP[i] * sim.clog[i] - 0.4)) * (flow / BASE_FLOW) + jit(i, 2.1) * 0.08;
    });
    const p = [P_SUPPLY + jit(0, 1.3) * 0.8];
    dp.forEach((d, i) => p.push(p[i] - d));
    const tin = TDS_IN + jit(2, 0.9) * 2, tout = TDS_OUT + jit(3, 1.1) * 0.5;
    const rej = (1 - tout / tin) * 100;
    const ratio = dp.map((d, i) => (d / flow) / (BASE_DP[i] / BASE_FLOW));
    const st = ratio.map((r) => (r > 2 ? 'clog' : r < 0.15 ? 'gone' : 'ok'));
    return { flow, dp, p, tin, tout, rej, ratio, st };
  }
  let last = step(0, 0);
  function updateReadouts() {
    const s = last;
    ['p0', 'p1', 'p2', 'p3'].forEach((k, i) => { TAGS[k].v.textContent = fmt(s.p[i]) + ' kPa'; });
    TAGS.flow.v.textContent = fmt(s.flow, 2) + ' L/min';
    TAGS.tdsin.v.textContent = Math.round(s.tin) + ' ppm';
    TAGS.tdsout.v.textContent = Math.round(s.tout) + ' ppm';
    [1, 2, 3].forEach((n, i) => {
      const t = TAGS['dp' + n]; t.v.textContent = s.st[i] === 'gone' ? 'dP ≈ 0' : 'dP ×' + fmt(s.ratio[i], 1);
      t.el.dataset.s = s.st[i];
    });
    rows.forEach((r, i) => {
      r.querySelector('[data-dp]').textContent = fmt(s.dp[i], 1) + ' kPa';
      r.querySelector('[data-ratio]').textContent = '×' + fmt(s.ratio[i], 2);
      const e = r.querySelector('[data-status]'); e.textContent = STATUS[s.st[i]]; e.dataset.s = s.st[i];
    });
    $('#r-rej').textContent = fmt(s.rej, 1) + '%';
    $('#r-flow').textContent = fmt(s.flow, 2) + ' L/min';
    $('#r-tds').textContent = `${Math.round(s.tin)} → ${Math.round(s.tout)} ppm`;
    const bad = s.st.findIndex((x) => x !== 'ok');
    banner.dataset.s = bad < 0 ? 'ok' : s.st[bad];
    bannerT.textContent = bad < 0 ? 'No fault flagged. All three cartridges at their clean baseline.' :
      `Cartridge ${bad + 1}: ${s.st[bad] === 'clog' ? 'clogging flagged. Drop per flow is well above its clean baseline.' : 'removed or bypassed. Drop per flow has collapsed toward zero.'} The TDS pair barely moves.`;
    // LCD
    const msg = bad < 0 ? 'ALL OK' : `CART ${bad + 1} ${s.st[bad] === 'clog' ? 'CLOG' : 'MISSING'}`;
    if (msg !== lastLcd) { lastLcd = msg; drawLcd(msg, bad < 0); }
  }
  let lastLcd = '';
  function drawLcd(msg, ok) {
    lcdG.fillStyle = '#0d1e2e'; lcdG.fillRect(0, 0, 256, 128);
    lcdG.fillStyle = ok ? '#8fe3c5' : '#ffb27a'; lcdG.font = '600 30px system-ui, sans-serif'; lcdG.textAlign = 'center'; lcdG.fillText(msg, 128, 76);
    lcdG.fillStyle = '#6a8aa6'; lcdG.font = '16px system-ui, sans-serif'; lcdG.fillText('SIMULATED', 128, 112); lcdT.needsUpdate = true;
  }

  // ---------- controls UI
  function applyUI() {
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    root.querySelectorAll('[data-target]').forEach((b) => { b.setAttribute('aria-pressed', +b.dataset.target === state.target + 1); b.disabled = state.mode === 'new'; });
    $('#target-wrap').dataset.off = state.mode === 'new';
  }
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; applyUI(); }));
  root.querySelectorAll('[data-target]').forEach((b) => b.addEventListener('click', () => { state.target = +b.dataset.target - 1; applyUI(); }));
  applyUI();

  // ---------- camera + controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false; controls.enableZoom = false;
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.75; controls.minAzimuthAngle = -1.15; controls.maxAzimuthAngle = 1.15;
  canvas.style.touchAction = 'pan-y';
  controls.target.set(0.4, 0.25, 0);
  let fitD = 20;
  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const wNeed = camera.aspect < 1 ? 11.8 : 17.2; fitD = Math.max(8.6 / (2 * t), wNeed / (2 * t * camera.aspect)) * 1.12;
    controls.minDistance = fitD * 0.35; controls.maxDistance = fitD * 1.25;
  }
  function home(instant) {
    const dir = new THREE.Vector3(0.22, 0.16, 1).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, fitD); controls.update();
  }
  fit(); home();
  new ResizeObserver(() => { const v = camera.position.clone().sub(controls.target); const d = v.length() / fitD; fit(); camera.position.copy(controls.target).add(v.setLength(d * fitD)); }).observe(stage);
  // wheel zoom only while the pointer is held or the viewer is focused (keeps page scroll free)
  canvas.addEventListener('pointerdown', () => { controls.enableZoom = true; });
  canvas.addEventListener('pointerleave', () => { controls.enableZoom = false; });
  const zoom = (f) => { const v = camera.position.clone().sub(controls.target); const d = THREE.MathUtils.clamp(v.length() * f, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(v.setLength(d)); };
  $('#z-in').addEventListener('click', () => zoom(0.8)); $('#z-out').addEventListener('click', () => zoom(1.25));
  $('#z-reset').addEventListener('click', () => home());
  let interacted = false; controls.addEventListener('start', () => { interacted = true; $('#hint').style.opacity = 0; });

  // ---------- loop
  let visible = true; new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(stage);
  const tmpV = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.1); tAcc += dt;
    last = step(dt, tAcc);
    readT += dt; if (readT > 0.12) { readT = 0; updateReadouts(); }
    // visuals
    for (let i = 0; i < 3; i++) {
      const open = 1 - sim.gone[i];
      fills[i].visible = open > 0.5; shells[i].material.opacity = 0.16 - 0.08 * sim.gone[i];
      const c = THREE.MathUtils.clamp((sim.clog[i] - 1) / 2.6, 0, 1);
      fillMats[i].color.setRGB(1 - 0.34 * c, 1 - 0.46 * c, 1 - 0.62 * c);
      bypassMesh[i].visible = sim.byp[i] > 0.5;
    }
    bypassMat.color.set(0xd97706);
    // dots
    let n = 0; const speed = (last.flow / BASE_FLOW) * 1.5; const len = (s) => s.path.getLength();
    segs.forEach((s) => {
      const L = len(s), sp = speed / L;
      let show = 1;
      if (s.cart !== undefined) show = (1 - sim.byp[s.cart]);
      if (s.byp !== undefined) show = sim.byp[s.byp];
      for (let j = 0; j < s.n; j++) {
        s.off[j] = (s.off[j] + (reduced ? 0 : sp * dt * 3.2)) % 1;
        s.path.getPointAt(s.off[j], pt);
        tmp.position.copy(pt); tmp.scale.setScalar(show > 0.5 ? 1 : 0.0001); tmp.updateMatrix(); dots.setMatrixAt(n++, tmp.matrix);
      }
    });
    dots.instanceMatrix.needsUpdate = true;
    controls.update(); renderer.render(scene, camera);
    // tags
    const w = stage.clientWidth, h = stage.clientHeight;
    Object.values(TAGS).forEach((t) => {
      t.p.copy(t.at()); rig.localToWorld(t.p); tmpV.copy(t.p).project(camera);
      const hw = (t.el.offsetWidth || 70) / 2 + 4, hh = (t.el.offsetHeight || 22) / 2 + 4;
      const px = Math.min(Math.max((tmpV.x + 1) / 2 * w, hw), w - hw), py = Math.min(Math.max((1 - tmpV.y) / 2 * h, hh), h - hh);
      t.el.style.transform = `translate(-50%,-50%) translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
    });
  }
  updateReadouts(); drawLcd('ALL OK', true); frame();
  return { state, renderer, dbg: () => [fitD, camera.position.toArray(), camera.aspect] };
}
