// Juice: tracers, impact sparks, smoke, decoys. Everything is pooled and reused,
// so the hot loop never allocates. Smoke zones are also gameplay: bots cannot see
// through them, and neither can the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_POOL = 10;
const SMOKE_POOL = 6;

export function createEffects(scene) {
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_POOL * 8 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.amber), size: 0.09, transparent: true, opacity: 0.95 }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  for (let i = 0; i < SPARK_POOL; i += 1) sparks.push({ life: 0, vel: new Float32Array(8 * 3), origin: new THREE.Vector3() });

  const smokes = [];
  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8fe8d8'), transparent: true, opacity: 0.28, roughness: 1, depthWrite: false });
  for (let i = 0; i < SMOKE_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), smokeMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, max: 12, x: 0, z: 0, r: 3.2 });
  }

  const decoys = [];
  const decoyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magenta), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2, roughness: 0.4 });
  const decoyGeo = new THREE.OctahedronGeometry(0.22);

  let tracerCursor = 0;
  let sparkCursor = 0;
  let smokeCursor = 0;

  return {
    smokeZones: smokes,
    decoys,
    spawnTracer(from, to, color = PALETTE.amber) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACER_POOL;
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.material.color.set(color);
      t.line.material.opacity = 0.9;
      t.line.visible = true;
      t.life = 0.09;
    },
    spawnSparks(point, count = 8) {
      const slot = sparkCursor;
      const s = sparks[slot];
      sparkCursor = (sparkCursor + 1) % SPARK_POOL;
      s.origin.copy(point);
      for (let i = 0; i < 8; i += 1) {
        const v = i * 3;
        s.vel[v] = (Math.random() - 0.5) * 5;
        s.vel[v + 1] = Math.random() * 4 + 1;
        s.vel[v + 2] = (Math.random() - 0.5) * 5;
      }
      s.life = 0.35;
      // Park this burst's points at the impact until step() places them, so a
      // reused slot never flashes one frame of the previous burst's positions.
      const pos = sparkPoints.geometry.attributes.position;
      for (let j = 0; j < 8; j += 1) {
        const base = (slot * 8 + j) * 3;
        pos.array[base] = point.x;
        pos.array[base + 1] = point.y;
        pos.array[base + 2] = point.z;
      }
      pos.needsUpdate = true;
    },
    spawnSmoke(point) {
      const s = smokes[smokeCursor];
      smokeCursor = (smokeCursor + 1) % SMOKE_POOL;
      s.x = point.x;
      s.z = point.z;
      s.r = 3.2;
      s.life = 12;
      s.max = 12;
      s.mesh.position.set(point.x, 1.1, point.z);
      s.mesh.scale.setScalar(0.4);
      s.mesh.visible = true;
      return s;
    },
    spawnDecoy(point) {
      const mesh = new THREE.Mesh(decoyGeo, decoyMat);
      mesh.position.copy(point);
      scene.add(mesh);
      const d = { mesh, life: 8, x: point.x, z: point.z, hover: point.y };
      decoys.push(d);
      return d;
    },
    clearRound() {
      for (const s of smokes) { s.life = 0; s.mesh.visible = false; }
      for (const d of decoys) { scene.remove(d.mesh); }
      decoys.length = 0;
    },
    step(dt, time) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
      for (let i = 0; i < SPARK_POOL; i += 1) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        const pos = sparkPoints.geometry.attributes.position;
        for (let j = 0; j < 8; j += 1) {
          const v = j * 3;
          const base = (i * 8 + j) * 3;
          pos.array[base] = s.origin.x + s.vel[v] * (0.35 - s.life);
          pos.array[base + 1] = Math.max(0.05, s.origin.y + s.vel[v + 1] * (0.35 - s.life) - 4 * (0.35 - s.life) * (0.35 - s.life));
          pos.array[base + 2] = s.origin.z + s.vel[v + 2] * (0.35 - s.life);
        }
        pos.needsUpdate = true;
        if (s.life <= 0) {
          for (let j = 0; j < 8; j += 1) {
            const base = (i * 8 + j) * 3;
            pos.array[base] = 0; pos.array[base + 1] = -10; pos.array[base + 2] = 0;
          }
          pos.needsUpdate = true;
        }
      }
      for (const s of smokes) {
        if (s.life <= 0) continue;
        s.life -= dt;
        const grow = 1 + (1 - s.life / s.max) * 2.4;
        s.mesh.scale.setScalar(grow);
        s.mesh.material.opacity = 0.28 * Math.min(1, s.life / 2);
        if (s.life <= 0) s.mesh.visible = false;
      }
      for (let i = decoys.length - 1; i >= 0; i -= 1) {
        const d = decoys[i];
        d.life -= dt;
        d.mesh.position.y = d.hover + Math.sin(time * 3 + i) * 0.15;
        d.mesh.rotation.y = time * 2;
        if (d.life <= 0) {
          scene.remove(d.mesh);
          decoys.splice(i, 1);
        }
      }
    },
  };
}
