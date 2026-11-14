// NEON TIDE world: rainy neon harbor at night. 40x30 m, three lanes, skyline, crane,
// containers, barrels, lamps and the uplink pylon. Fresh code written for threejs-fps-02.
import * as THREE from 'three';
import { MAP } from './palette.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#05070d';
  g.fillRect(0, 0, 64, 128);
  const lit = ['#ffd166', '#7df9ff', '#ff9ecf', '#b8fff1'];
  for (let y = 6; y < 122; y += 10) {
    for (let x = 6; x < 58; x += 10) {
      if (Math.random() < 0.42) {
        g.fillStyle = lit[(Math.random() * lit.length) | 0];
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(x, y, 6, 7);
      }
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function segHitsBox(ax, az, bx, bz, b, pad) {
  // 2D segment vs AABB test with padding, for waypoint edges.
  const x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.z0 - pad, z1 = b.z1 + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const axes = [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]];
  for (const [p, q] of axes) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

export function buildWorld(scene) {
  const colliders = [];
  const occluders = [];
  const box = (w, h, d, color, opts = {}) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0.3, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1 }),
    );
    m.position.set(opts.x ?? 0, (opts.y ?? 0) + h / 2, opts.z ?? 0);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = false;
    m.receiveShadow = false;
    scene.add(m);
    return m;
  };
  const addCollider = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });

  scene.background = new THREE.Color(0x070d18);
  scene.fog = new THREE.FogExp2(0x0a1420, 0.022);

  // Lights: cold moon key, warm harbor fill, a few neon points.
  scene.add(new THREE.HemisphereLight(0x2a4a6b, 0x0a0f16, 0.85));
  const moon = new THREE.DirectionalLight(0x9db8ff, 0.7);
  moon.position.set(-18, 30, -12);
  scene.add(moon);
  const neonA = new THREE.PointLight(0x19e3c2, 30, 26, 1.6);
  neonA.position.set(-10, 5, 0);
  scene.add(neonA);
  const neonB = new THREE.PointLight(0xff2e88, 30, 26, 1.6);
  neonB.position.set(10, 5, -8);
  scene.add(neonB);
  const neonC = new THREE.PointLight(0xffd166, 18, 20, 1.6);
  neonC.position.set(0, 4.5, 10);
  scene.add(neonC);

  // Wet asphalt ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 36),
    new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.35, metalness: 0.65 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // Neon lane strips.
  const strip = (x, z, w, d, color) => {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color }),
    );
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.02, z);
    scene.add(s);
  };
  strip(-15, 0, 0.18, 28, 0x19e3c2);
  strip(15, 0, 0.18, 28, 0xff2e88);
  strip(0, 0, 0.18, 28, 0xffd166);
  // Puddles.
  for (const [x, z, r] of [[-6, 4, 2.2], [7, -3, 1.8], [-11, -7, 1.5], [12, 6, 2.0], [2, 11, 1.6]]) {
    const p = new THREE.Mesh(
      new THREE.CircleGeometry(r, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85 }),
    );
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.015, z);
    scene.add(p);
  }

  // Perimeter walls.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2432, roughness: 0.85, metalness: 0.2 });
  const wall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), wallMat);
    m.position.set(x, 1.6, z);
    scene.add(m);
    occluders.push(m);
  };
  wall(42, 0.6, 0, -15.3); wall(42, 0.6, 0, 15.3);
  wall(0.6, 31, -20.3, 0); wall(0.6, 31, 20.3, 0);
  addCollider(-21, -15.6, 21, -15); addCollider(-21, 15, 21, 15.6);
  addCollider(-20.6, -16, -20, 16); addCollider(20, -16, 20.6, 16);
  // Neon trim on the walls.
  for (const [x, z, w, d, c] of [[0, -15, 40, 0.12, 0xff2e88], [0, 15, 40, 0.12, 0x19e3c2], [-20, 0, 0.12, 30, 0x19e3c2], [20, 0, 0.12, 30, 0xff2e88]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), new THREE.MeshBasicMaterial({ color: c }));
    t.position.set(x, 3.3, z);
    scene.add(t);
  }

  // Skyline: lit towers beyond the walls.
  const winTex = windowTexture();
  const skyMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
  const skyMat2 = new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55 });
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const r = 34 + rnd() * 18;
    const w = 5 + rnd() * 6, h = 9 + rnd() * 20, d = 5 + rnd() * 6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rnd() < 0.5 ? skyMat : skyMat2);
    b.position.set(Math.cos(ang) * r, h / 2 - 0.5, Math.sin(ang) * r * 0.8);
    scene.add(b);
  }

  // Shipping containers (cover + color).
  const contColors = [0x0e5f52, 0x7a1e46, 0x8a5a12, 0x14324a, 0x5c1a2e, 0x1d4a3a];
  const containers = [
    [-11, -4, 0], [11, 4, 1], [-5, 7, 2], [6, -6, 3], [-12, 8, 4], [12, -9, 5],
    [-11, -4, 0], [6, -6, 3],
  ];
  containers.forEach(([x, z, ci], i) => {
    const stacked = i >= 6;
    const m = box(3.2, 1.5, 1.6, contColors[ci % contColors.length], { x, z, y: stacked ? 1.5 : 0, rough: 0.6, metal: 0.5 });
    occluders.push(m);
    addCollider(x - 1.6, z - 0.8, x + 1.6, z + 0.8);
    // glowing edge strip
    const e = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: ci % 2 ? 0x19e3c2 : 0xff2e88 }));
    e.position.set(x, (stacked ? 1.5 : 0) + 1.5, z + 0.82);
    scene.add(e);
  });

  // Crane at the north-east corner.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.6, metalness: 0.7 });
  const leg = (x, z) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.5), craneMat);
    l.position.set(x, 5.5, z);
    scene.add(l);
    occluders.push(l);
  };
  leg(13.5, -12.5); leg(15.5, -12.5); leg(13.5, -10.5); leg(15.5, -10.5);
  addCollider(13.2, -12.8, 15.8, -10.2);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.5), craneMat);
  arm.position.set(10, 11, -11.5);
  scene.add(arm);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4, 0.08), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  hook.position.set(5.5, 9, -11.5);
  scene.add(hook);
  const hookBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x19e3c2, emissive: 0x19e3c2, emissiveIntensity: 0.7 }));
  hookBox.position.set(5.5, 6.8, -11.5);
  scene.add(hookBox);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), craneMat);
  cab.position.set(14.5, 11.4, -11.5);
  scene.add(cab);

  // Barrels.
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x27313f, roughness: 0.5, metalness: 0.6 });
  for (const [bx, bz] of [[-3, 3], [-2.2, 3.6], [5, 9], [5.8, 9.4], [-13, -9], [13, 10], [2, -6], [2.8, -5.4]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), barrelMat);
    b.position.set(bx, 0.5, bz);
    scene.add(b);
    occluders.push(b);
    addCollider(bx - 0.45, bz - 0.45, bx + 0.45, bz + 0.45);
  }

  // Lamps.
  const lampSpots = [[-15, -8], [15, 8], [-6, 0], [6, 0], [-15, 8], [15, -8]];
  for (const [lx, lz] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a3442, roughness: 0.5, metalness: 0.7 }));
    pole.position.set(lx, 1.7, lz);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    bulb.position.set(lx, 3.45, lz);
    scene.add(bulb);
    addCollider(lx - 0.12, lz - 0.12, lx + 0.12, lz + 0.12);
  }

  // Uplink pylon: base, magenta ring, beam.
  const pylonBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.5, 0.9, 20),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.4, metalness: 0.7 }),
  );
  pylonBase.position.set(MAP.uplink.x, 0.45, MAP.uplink.z);
  scene.add(pylonBase);
  occluders.push(pylonBase);
  addCollider(MAP.uplink.x - 1.3, MAP.uplink.z - 1.3, MAP.uplink.x + 1.3, MAP.uplink.z + 1.3);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.09, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MAP.uplink.x, 0.1, MAP.uplink.z);
  scene.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 9, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.set(MAP.uplink.x, 5, MAP.uplink.z);
  scene.add(beam);
  const coreLight = new THREE.PointLight(0xff2e88, 22, 16, 1.7);
  coreLight.position.set(MAP.uplink.x, 2.2, MAP.uplink.z);
  scene.add(coreLight);

  // Rain: points falling in a box over the map.
  const RAIN_N = 1300;
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 56;
    rainPos[i * 3 + 1] = Math.random() * 22;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 44;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc4e8, size: 0.07, transparent: true, opacity: 0.55 }));
  scene.add(rain);

  // Waypoints: three lanes plus cross connectors and uplink approaches.
  const nodes = [
    [-15, -12], [-15, -6], [-15, 0], [-15, 6], [-15, 12],
    [0, -10.5], [0, -8], [0, -4], [0, 0], [0, 4], [0, 8], [0, 12],
    [15, -12], [15, -6], [15, 0], [15, 6], [15, 12],
    [-8, -8], [8, -8], [-8, 0], [8, 0], [-8, 8], [8, 8],
    [-3, -11], [3, -11], [-6, -11], [6, -11],
  ].map(([x, z]) => ({ x, z }));
  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 9.5) continue;
      let blocked = false;
      for (const c of colliders) {
        if (segHitsBox(a.x, a.z, b.x, b.z, c, 0.55)) { blocked = true; break; }
      }
      if (!blocked) { edges[i].push(j); edges[j].push(i); }
    }
  }

  const clock = { t: 0 };
  function update(dt) {
    clock.t += dt;
    const pos = rainGeo.attributes.position;
    for (let i = 0; i < RAIN_N; i++) {
      let y = pos.getY(i) - dt * 15;
      if (y < 0) { y = 20 + Math.random() * 2; pos.setX(i, (Math.random() - 0.5) * 56); pos.setZ(i, (Math.random() - 0.5) * 44); }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    ring.rotation.z = clock.t * 0.4;
    beam.material.opacity = 0.16 + Math.sin(clock.t * 2.2) * 0.07;
    coreLight.intensity = 20 + Math.sin(clock.t * 2.2) * 4;
  }

  return {
    colliders, occluders, waypoints: nodes, edges, update,
    uplink: MAP.uplink,
    spawns: {
      tide: Array.from({ length: 5 }, (_, i) => ({ x: -8 + i * 4, z: 12.5 })),
      warden: Array.from({ length: 5 }, (_, i) => ({ x: -8 + i * 4, z: -9.0 })),
    },
  };
}
