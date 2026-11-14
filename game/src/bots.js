// NEON TIDE bots: 9 named bots with distinct styles, waypoint navigation, line of
// sight plus field of view plus smoke awareness, gunfire hearing, burst fire with
// per-style aim error and reaction time. Fresh code written for threejs-fps-02.
import * as THREE from 'three';
import { TEAMS } from './palette.js';

export const BOT_STYLES = {
  rusher: { speed: 4.6, reactionMs: 520, burst: 4, burstPauseMs: 950, aimErr: 0.2, damage: 19, fireMs: 140, lane: 'side' },
  holder: { speed: 2.6, reactionMs: 400, burst: 3, burstPauseMs: 1400, aimErr: 0.1, damage: 23, fireMs: 160, lane: 'hold' },
  flanker: { speed: 4.0, reactionMs: 480, burst: 4, burstPauseMs: 1100, aimErr: 0.15, damage: 21, fireMs: 150, lane: 'side' },
  marksman: { speed: 2.9, reactionMs: 620, burst: 2, burstPauseMs: 1800, aimErr: 0.07, damage: 34, fireMs: 340, lane: 'hold' },
  support: { speed: 3.4, reactionMs: 460, burst: 5, burstPauseMs: 1200, aimErr: 0.16, damage: 20, fireMs: 150, lane: 'mid' },
};

export const BOT_NAMES = ['Vex', 'Mira', 'Juno', 'Kade', 'Sable', 'Rook', 'Iris', 'Dax', 'Noor'];

function nearestNode(nodes, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function bfsPath(edges, from, to) {
  if (from === to) return [to];
  const prev = new Array(edges.length).fill(-1);
  const q = [from];
  prev[from] = from;
  while (q.length) {
    const n = q.shift();
    for (const m of edges[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let c = to;
          while (c !== from) { c = prev[c]; path.unshift(c); }
          return path;
        }
        q.push(m);
      }
    }
  }
  return [to];
}

export class Bot {
  constructor(scene, opts) {
    this.name = opts.name;
    this.team = opts.team;
    this.style = opts.style;
    this.world = opts.world;
    this.isDecoy = !!opts.decoy;
    this.hp = 100;
    this.alive = true;
    this.pos = new THREE.Vector3(opts.pos.x, 0, opts.pos.z);
    this.yaw = opts.team === 'tide' ? Math.PI : 0;
    this.speed = this.style.speed;
    this.path = [];
    this.pathIdx = 0;
    this.target = null; // {kind:'player'|'bot', ref}
    this.firstSeenAt = 0;
    this.burstLeft = 0;
    this.nextShotAt = 0;
    this.burstEndsAt = 0;
    this.thinkAt = 0;
    this.investigate = null;
    this.holdUntil = 0;
    this.holdNode = -1;
    this.strafeDir = 1;
    this.strafeAt = 0;
    this.deadAt = 0;
    this.noiseAt = 0;
    this.lastDamageFrom = null;
    this.movedDist = 0;
    this.role = opts.role || (opts.team === 'tide' ? 'attack' : 'defend');
    this.holdAtUplink = false;
    this.blindedUntil = 0;

    const color = TEAMS[this.team].color;
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x1b2531, roughness: 0.6, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, emissive: color, emissiveIntensity: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.36), suit);
    body.position.y = 0.95;
    body.userData = { bot: this, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), suit);
    head.position.y = 1.68;
    head.userData = { bot: this, part: 'head' };
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.05), new THREE.MeshBasicMaterial({ color }));
    visor.position.set(0, 1.7, 0.19);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.38), accent);
    stripe.position.y = 1.25;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.4, metalness: 0.8 }));
    gun.position.set(0.28, 1.15, 0.35);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.24), suit);
    legL.position.set(-0.16, 0.22, 0);
    const legR = legL.clone();
    legR.position.x = 0.16;
    g.add(body, head, visor, stripe, gun, legL, legR);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    scene.add(g);
    this.group = g;
    this.hitMeshes = [body, head];
    this.bodyMat = suit;
    this.accentMat = accent;
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, 1.6, this.pos.z);
  }

  setPathTo(x, z) {
    const from = nearestNode(this.world.waypoints, this.pos.x, this.pos.z);
    const to = nearestNode(this.world.waypoints, x, z);
    this.path = bfsPath(this.world.edges, from, to);
    this.pathIdx = 0;
  }

  _pickObjective(ctx) {
    if (this.holdAtUplink) return;
    const w = this.world;
    const attacking = this.role === 'attack';
    if (attacking) {
      // Attackers push the uplink; rushers and flankers take the side lanes.
      if (this.style.lane === 'side') {
        const side = Math.random() < 0.5 ? -15 : 15;
        this.setPathTo(side, -6 + Math.random() * 4);
      } else {
        this.setPathTo(0, -10.5);
      }
    } else {
      // Defenders hold ground near mid or the uplink.
      if (this.style.lane === 'hold') {
        if (this.holdNode < 0 || ctx.time > this.holdUntil) {
          const picks = this.style === BOT_STYLES.marksman
            ? [[0, -8], [-8, -8], [8, -8]]
            : [[-8, 0], [8, 0], [0, -4], [-8, -8], [8, -8]];
          const [hx, hz] = picks[(Math.random() * picks.length) | 0];
          this.holdNode = nearestNode(w.waypoints, hx, hz);
          this.holdUntil = ctx.time + 9 + Math.random() * 6;
          this.setPathTo(hx, hz);
        }
      } else {
        this.setPathTo((Math.random() - 0.5) * 16, 2 + Math.random() * 6);
      }
    }
  }

  _acquire(ctx) {
    const eye = this.eyePos;
    const candidates = [];
    if (ctx.player.alive && ctx.player.team !== this.team) {
      candidates.push({ kind: 'player', ref: ctx.player, pos: ctx.player.pos, eye: new THREE.Vector3(ctx.player.pos.x, ctx.player.pos.y + 1.5, ctx.player.pos.z), speed: ctx.player.speedNow });
    }
    for (const b of ctx.bots) {
      if (!b.alive || b === this || b.team === this.team) continue;
      candidates.push({ kind: 'bot', ref: b, pos: b.pos, eye: b.eyePos, speed: b.movedDist });
    }
    let best = null, bestScore = Infinity;
    for (const c of candidates) {
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 42) continue;
      // Field of view: 115 degrees around current facing.
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const dot = (dx * fx + dz * fz) / Math.max(dist, 0.001);
      if (dot < 0.42) continue;
      // Smoke blocks sight both ways, including through the cloud.
      if (ctx.inSmoke(c.eye) || ctx.inSmoke(eye)) continue;
      if (ctx.smokeBlocks && ctx.smokeBlocks(eye, c.eye)) continue;
      // Line of sight through the world.
      if (!ctx.losClear(eye, c.eye)) continue;
      const score = dist;
      if (score < bestScore) { bestScore = score; best = { ...c, dist }; }
    }
    return best;
  }

  _fireAt(ctx, target) {
    const now = ctx.time;
    if (now < this.nextShotAt) return;
    const dist = target.dist;
    let chance = 0.42 - dist * 0.008 - this.style.aimErr;
    if (target.speed < 0.5) chance += 0.08;
    if (target.kind === 'player' && ctx.player.crouching) chance -= 0.05;
    chance = Math.max(0.05, Math.min(0.82, chance));
    const hit = Math.random() < chance;
    const head = hit && Math.random() < 0.12;
    ctx.onBotShot(this, target.eye, hit);
    if (hit) {
      const dmg = Math.round(this.style.damage * (head ? 1.5 : 1));
      if (target.kind === 'player') ctx.damagePlayer(dmg, this.name);
      else ctx.damageBot(target.ref, dmg, this.name, head ? 'head' : 'body');
    }
    this.nextShotAt = now + this.style.fireMs / 1000;
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstEndsAt = now + this.style.burstPauseMs / 1000;
    }
  }

  update(dt, ctx) {
    if (!this.alive) {
      if (this.deadAt && ctx.time - this.deadAt > 4 && this.group.visible) {
        this.group.visible = false;
      }
      return;
    }
    const now = ctx.time;
    // Flash-blind: stand still, cannot think or fire.
    if (this.blindedUntil && now > this.blindedUntil) this.blindedUntil = 0;
    if (this.blindedUntil) {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;
      return;
    }
    if (this.isDecoy) {
      if (now > this.noiseAt) {
        this.noiseAt = now + 0.9 + Math.random() * 0.8;
        ctx.onDecoyNoise(this.pos);
      }
      if (this.path.length === 0 || this.pathIdx >= this.path.length) {
        this.setPathTo((Math.random() - 0.5) * 24, -10 + Math.random() * 18);
      }
      this._followPath(dt, 3.2);
      return;
    }

    // Think at 8 Hz.
    if (now >= this.thinkAt) {
      this.thinkAt = now + 0.12;
      const found = this._acquire(ctx);
      if (found) {
        if (!this.target || this.target.ref !== found.ref) {
          this.firstSeenAt = now + this.style.reactionMs / 1000;
          this.burstLeft = this.style.burst;
          this.burstEndsAt = 0;
        }
        this.target = found;
      } else if (this.target) {
        // Lost sight: keep hunting the last known spot briefly, then drop.
        if (now - (this.target.lastSeen ?? now) > 1.2) this.target = null;
        else this.target.lastSeen = this.target.lastSeen ?? now;
      }
      // Hear nearby gunfire and investigate.
      if (!this.target) {
        for (const s of ctx.shots) {
          const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
          if (d < 24 && now - s.time < 1.0) {
            this.investigate = { x: s.x, z: s.z, until: now + 4 };
            break;
          }
        }
      }
      if (!this.target && (!this.path.length || this.pathIdx >= this.path.length)) {
        if (this.investigate && now < this.investigate.until) {
          this.setPathTo(this.investigate.x, this.investigate.z);
        } else {
          this.investigate = null;
          this._pickObjective(ctx);
        }
      }
    }

    if (this.target) {
      const t = this.target;
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      const wantYaw = Math.atan2(dx, dz);
      this.yaw = wantYaw;
      // Strafe while engaging so bots are not statues.
      if (now > this.strafeAt) {
        this.strafeAt = now + 0.7 + Math.random() * 0.9;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const strafe = this.style.lane === 'hold' ? 0 : 1.4 * this.strafeDir;
      const dist = Math.hypot(dx, dz);
      if (dist > 16) {
        this._moveToward(dt, t.pos.x, t.pos.z, this.speed * 0.85);
      } else if (strafe !== 0) {
        const px = -dz / Math.max(dist, 0.001), pz = dx / Math.max(dist, 0.001);
        this._moveBy(dt, px * strafe, pz * strafe);
      }
      if (now >= this.firstSeenAt) {
        if (this.burstLeft <= 0 && now >= this.burstEndsAt) this.burstLeft = this.style.burst;
        if (this.burstLeft > 0) this._fireAt(ctx, t);
      }
    } else if (!this.holdAtUplink) {
      this._followPath(dt, this.speed);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.movedDist = 0;
  }

  _collide(x, z) {
    for (const c of this.world.colliders) {
      if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4) return true;
    }
    return Math.abs(x) > MAP_HALF_X || Math.abs(z) > MAP_HALF_Z;
  }

  _moveBy(dt, mx, mz) {
    const nx = this.pos.x + mx * dt, nz = this.pos.z + mz * dt;
    const ox = this.pos.x, oz = this.pos.z;
    if (!this._collide(nx, this.pos.z)) this.pos.x = nx;
    if (!this._collide(this.pos.x, nz)) this.pos.z = nz;
    this.movedDist = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 0.001);
  }

  _moveToward(dt, tx, tz, speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    this._moveBy(dt, (dx / d) * speed, (dz / d) * speed);
    this.yaw = Math.atan2(dx, dz);
  }

  _followPath(dt, speed) {
    if (!this.path.length || this.pathIdx >= this.path.length) return;
    const node = this.world.waypoints[this.path[this.pathIdx]];
    const dx = node.x - this.pos.x, dz = node.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.7) { this.pathIdx++; return; }
    this._moveToward(dt, node.x, node.z, speed);
  }

  die() {
    this.alive = false;
    this.deadAt = 0; // set by caller via ctx time
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.25;
  }

  reset(x, z, team, time) {
    this.team = team;
    this.hp = 100;
    this.alive = true;
    this.pos.set(x, 0, z);
    this.yaw = team === 'tide' ? Math.PI : 0;
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.investigate = null;
    this.holdNode = -1;
    this.deadAt = 0;
    this.holdAtUplink = false;
    this.blindedUntil = 0;
    this.group.visible = true;
    this.group.rotation.set(0, this.yaw, 0);
    this.group.position.copy(this.pos);
    const color = TEAMS[team].color;
    // Recolor accent pieces (visor index 2, stripe index 3).
    this.group.children[2].material.color.setHex(color);
    this.group.children[3].material.color.setHex(color);
    this.group.children[3].material.emissive.setHex(color);
  }
}

const MAP_HALF_X = 19.6;
const MAP_HALF_Z = 14.6;
