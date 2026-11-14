// NEON TIDE map: a rainy container harbor at night. Three lanes (west alley, mid
// dock, east pier) run from the Tidebreaker spawn in the south to the uplink
// terminal in the north. Every box is a collider and a bullet stop; neon strips
// mark the lanes so the map reads at a glance, even in a screenshot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };
export const UPLINK = { x: 0, z: -13, radius: 2.2 };
export const SPAWNS = {
  attackers: [[-4, 12.5], [-1.5, 13], [1.5, 13], [4, 12.5], [0, 11]],
  defenders: [[-4, -10.5], [-1.5, -11], [1.5, -11], [4, -10.5], [0, -9]],
};

// Bot waypoints: lane junctions the AI walks between. Edges link neighbours.
export const WAYPOINTS = [
  { x: 0, z: 12, links: [1, 4, 7] },
  { x: 0, z: 6, links: [0, 2, 4, 7] },
  { x: 0, z: 0, links: [1, 3, 5, 8] },
  { x: 0, z: -6, links: [2, 6, 9] },
  { x: -12, z: 8, links: [0, 1, 5, 10] },
  { x: -12, z: 0, links: [2, 4, 6, 11] },
  { x: -12, z: -8, links: [3, 5, 9, 12] },
  { x: 12, z: 8, links: [0, 1, 8, 13] },
  { x: 12, z: 0, links: [2, 7, 9, 14] },
  { x: 12, z: -8, links: [3, 6, 8, 12] },
  { x: -6, z: 11, links: [4, 0] },
  { x: -6, z: -11, links: [6, 3] },
  { x: 6, z: -11, links: [9, 3] },
  { x: 6, z: 11, links: [7, 0] },
  { x: 16, z: 0, links: [8] },
];

export function createWorld(scene, random) {
  const group = new THREE.Group();
  scene.add(group);

  const std = (color, roughness = 0.9, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
  const glow = (color, intensity = 2.2) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 });
  const mat = {
    deck: std(PALETTE.deck, 0.55, 0.35),
    wall: std(PALETTE.surface, 0.85),
    tealBox: std(PALETTE.containerTeal, 0.7, 0.15),
    rustBox: std(PALETTE.containerRust, 0.7, 0.15),
    amberBox: std(PALETTE.containerAmber, 0.7, 0.15),
    darkBox: std(PALETTE.hairline, 0.8, 0.1),
    barrel: std('#5a2e3d', 0.6, 0.3),
    tealGlow: glow(PALETTE.teal),
    magentaGlow: glow(PALETTE.magenta),
    amberGlow: glow(PALETTE.amber, 1.8),
  };

  const colliders = [];
  const shootables = [];
  const minimapRects = [];

  function box(w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      minimapRects.push({ x: x - w / 2, z: z - d / 2, w, d });
    }
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  function strip(w, d, x, z, material, y = 0.03) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function neonEdge(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), material);
    mesh.position.set(x, y + h / 2 + 0.03, z);
    group.add(mesh);
    return mesh;
  }

  // Deck and perimeter: a fenced yard, open to the rainy sky.
  box(44, 0.4, 34, 0, -0.2, 0, mat.deck, { noShoot: true });
  box(0.5, 5.5, 34, -20.2, 2.75, 0, mat.wall);
  box(0.5, 5.5, 34, 20.2, 2.75, 0, mat.wall);
  box(44, 5.5, 0.5, 0, 2.75, -15.2, mat.wall);
  box(44, 5.5, 0.5, 0, 2.75, 15.2, mat.wall);

  // Neon lane guides painted on the deck: teal to mid, magenta to the uplink.
  strip(0.35, 24, 0, 0, mat.tealGlow);
  strip(0.35, 12, -12, -6, mat.magentaGlow);
  strip(0.35, 12, 12, -6, mat.magentaGlow);

  // Mid lane: crane pillar, stacked crates, a low wall to crouch behind.
  box(1.6, 7.5, 1.6, -3.4, 3.75, -4, mat.darkBox);
  neonEdge(1.7, 7.5, 1.7, -3.4, 3.75, -4, mat.amberGlow);
  box(2.4, 1.2, 1.2, 2.6, 0.6, -1.5, mat.tealBox);
  neonEdge(2.4, 1.2, 1.2, 2.6, 0.6, -1.5, mat.tealGlow);
  box(1.2, 1.2, 1.2, 1.4, 0.6, -1.5, mat.rustBox);
  box(1.2, 1.2, 1.2, 1.4, 1.8, -1.5, mat.amberBox);
  box(3.4, 1.0, 0.9, -0.6, 0.5, 4.5, mat.darkBox);
  box(1.2, 2.4, 1.2, 5.8, 1.2, 3.4, mat.rustBox);
  neonEdge(1.2, 2.4, 1.2, 5.8, 1.2, 3.4, mat.magentaGlow);

  // West alley: container walls make a tight lane with a sniper gap.
  box(6.4, 2.6, 2.4, -14.5, 1.3, 6, mat.tealBox);
  neonEdge(6.4, 2.6, 2.4, -14.5, 1.3, 6, mat.tealGlow);
  box(6.4, 2.6, 2.4, -14.5, 3.9, 6, mat.rustBox);
  box(2.4, 2.6, 6.4, -17.5, 1.3, -2, mat.amberBox);
  box(1.2, 1.2, 1.2, -10.5, 0.6, -2.5, mat.darkBox);
  box(1.2, 1.2, 1.2, -10.5, 1.8, -2.5, mat.tealBox);
  box(4.8, 1.1, 1.1, -12.5, 0.55, -9.5, mat.darkBox);

  // East pier: barrels, a forklift crate, open sightline down the dock.
  box(6.4, 2.6, 2.4, 14.5, 1.3, 6, mat.rustBox);
  neonEdge(6.4, 2.6, 2.4, 14.5, 1.3, 6, mat.magentaGlow);
  box(2.4, 2.6, 6.4, 17.5, 1.3, -2, mat.tealBox);
  box(1.2, 1.2, 1.2, 10.5, 0.6, -2.5, mat.amberBox);
  box(1.2, 1.2, 1.2, 10.5, 1.8, -2.5, mat.darkBox);
  box(4.8, 1.1, 1.1, 12.5, 0.55, -9.5, mat.darkBox);
  for (const [bx, bz] of [[9.2, 5.5], [10.4, 5.9], [9.8, 6.8]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), mat.barrel);
    barrel.position.set(bx, 0.55, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
    minimapRects.push({ x: bx - 0.45, z: bz - 0.45, w: 0.9, d: 0.9 });
  }

  // Uplink terminal: a glowing pylon in a magenta ring, the attackers' objective.
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.4, 10), mat.darkBox);
  pylon.position.set(UPLINK.x, 1.7, UPLINK.z);
  pylon.castShadow = true;
  group.add(pylon);
  colliders.push(new THREE.Box3().setFromObject(pylon));
  shootables.push(pylon);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), mat.magentaGlow);
  core.position.set(UPLINK.x, 3.9, UPLINK.z);
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(UPLINK.radius, 0.09, 8, 40), mat.magentaGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(UPLINK.x, 0.06, UPLINK.z);
  group.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(UPLINK.radius * 0.7, 0.05, 8, 32), mat.tealGlow);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.set(UPLINK.x, 0.06, UPLINK.z);
  group.add(ring2);

  // Lamp posts: warm pools of light over the lanes.
  const lampPositions = [[-8, 8], [8, 8], [-8, -8], [8, -8]];
  const lampLights = [];
  for (const [lx, lz] of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 8), mat.darkBox);
    pole.position.set(lx, 2.2, lz);
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3().setFromObject(pole));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), mat.amberGlow);
    head.position.set(lx, 4.5, lz);
    group.add(head);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 13, 1.6);
    light.position.set(lx, 4.2, lz);
    scene.add(light);
    lampLights.push(light);
  }

  // Skyline: dark towers with lit windows beyond the fence, so the horizon is never empty.
  const skyline = new THREE.Group();
  scene.add(skyline);
  const towerMat = std('#0a0f1c', 1, 0);
  const windowMat = glow(PALETTE.amber, 1.4);
  const windowGeo = new THREE.PlaneGeometry(0.5, 0.7);
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2 + 0.12;
    const dist = 46 + random() * 26;
    const w = 5 + random() * 7;
    const h = 12 + random() * 26;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
    tower.position.set(Math.cos(angle) * dist, h / 2 - 1, Math.sin(angle) * dist);
    skyline.add(tower);
    const windows = 2 + Math.floor(random() * 4);
    for (let j = 0; j < windows; j += 1) {
      const win = new THREE.Mesh(windowGeo, random() < 0.7 ? windowMat : mat.tealGlow);
      win.position.set(
        tower.position.x + (random() - 0.5) * (w - 1),
        2 + random() * (h - 4),
        tower.position.z + w / 2 + 0.06,
      );
      win.lookAt(0, win.position.y, 0);
      skyline.add(win);
    }
  }

  // Rain: a sheet of falling points that wraps, cheap and always moving.
  const rainCount = 1400;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = (random() - 0.5) * 70;
    rainPos[i * 3 + 1] = random() * 22;
    rainPos[i * 3 + 2] = (random() - 0.5) * 55;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#9fb8d8'), size: 0.07, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  scene.add(rain);

  // Light: cold moon key with shadows, dim blue sky fill, magenta wash at the uplink.
  const sky = new THREE.HemisphereLight(new THREE.Color('#28406b'), new THREE.Color(PALETTE.canvas), 0.85);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#bcd3ff'), 1.6);
  moon.position.set(14, 22, 10);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 26;
  moon.shadow.camera.bottom = -26;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0005;
  scene.add(moon, moon.target);
  const uplinkLight = new THREE.PointLight(new THREE.Color(PALETTE.magenta), 26, 18, 1.7);
  uplinkLight.position.set(UPLINK.x, 3.4, UPLINK.z);
  scene.add(uplinkLight);
  const midLight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 10, 12, 1.8);
  midLight.position.set(0, 3, 0);
  scene.add(midLight);

  let rainTime = 0;
  return {
    colliders,
    shootables,
    group,
    core,
    uplinkLight,
    minimapRects,
    step(dt, time) {
      rainTime += dt;
      const pos = rainGeo.attributes.position;
      for (let i = 0; i < rainCount; i += 1) {
        let y = pos.getY(i) - dt * 16;
        if (y < 0) y = 20 + random() * 2;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      core.rotation.y = time * 0.8;
      core.position.y = 3.9 + Math.sin(time * 1.4) * 0.12;
      uplinkLight.intensity = 24 + Math.sin(time * 2.2) * 4;
    },
  };
}
