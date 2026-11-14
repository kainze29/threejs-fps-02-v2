// Bots: nine named opponents and teammates with distinct styles. Each bot walks the
// waypoint graph, holds angles, reacts to what it sees and hears, and fires in
// bursts with real aim error. Styles change speed, reaction time and accuracy, so
// a rusher feels nothing like a marksman.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';
import { WEAPONS } from './weapons.js';

export const BOT_NAMES = {
  attackers: ['Mara Voss', 'Kip', 'Sable', 'Rook', 'Juno'],
  defenders: ['Cinder', 'Hale', 'Noor', 'Pike', 'Vex'],
};

const STYLES = {
  rusher: { speed: 5.6, reaction: 0.35, aimError: 0.045, burst: [4, 6], pause: 0.5, weapon: 'smg' },
  holder: { speed: 3.4, reaction: 0.55, aimError: 0.02, burst: [3, 4], pause: 0.9, weapon: 'rifle' },
  flanker: { speed: 4.8, reaction: 0.45, aimError: 0.032, burst: [3, 5], pause: 0.7, weapon: 'rifle' },
  marksman: { speed: 3.2, reaction: 0.7, aimError: 0.011, burst: [1, 2], pause: 1.4, weapon: 'dmr' },
  support: { speed: 4.4, reaction: 0.5, aimError: 0.03, burst: [3, 4], pause: 0.8, weapon: 'rifle' },
};

const RADIUS = 0.34;
const HEIGHT = 1.72;

export function createBots(scene, world, random, combat) {
  const bots = [];
  const probe = new THREE.Box3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [];
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const next of WAYPOINTS[cur].links) {
        if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
      }
    }
    if (prev[to] === -1) return [to];
    const path = [];
    let cur = to;
    while (cur !== from) { path.unshift(cur); cur = prev[cur]; }
    return path;
  }

  function makeBot(team, name, styleId, index) {
    const style = STYLES[styleId];
    const teamColor = team === 'attackers' ? PALETTE.teal : PALETTE.magenta;
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attackers' ? '#0d2b28' : '#2b0d1e'), roughness: 0.75, metalness: 0.1 });
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 1.8, roughness: 0.4 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), suit);
    torso.position.y = 1.0;
    torso.userData = { bot: null, part: 'torso' };
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
    head.position.y = 1.56;
    head.userData = { bot: null, part: 'head' };
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), trim);
    visor.position.set(0, 1.58, -0.15);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.03), trim);
    chest.position.set(0, 1.18, -0.16);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), suit);
    gun.position.set(0.28, 1.15, -0.2);
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color('#10141c'), depthTest: false }));
    barBg.scale.set(0.7, 0.08, 1);
    barBg.position.y = 1.95;
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(teamColor), depthTest: false }));
    barFg.scale.set(0.7, 0.05, 1);
    barFg.position.y = 1.95;
    group.add(torso, head, visor, chest, gun, barBg, barFg);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(group);
    const bot = {
      team, name, styleId, style, group, torso, head, barFg,
      position: group.position,
      yaw: 0, health: 100, alive: true, fall: 0,
      node: 0, path: [], dest: null, holdPoint: null, holdUntil: 0,
      target: null, seenAt: -10, reactAt: 0, burstLeft: 0, burstAt: 0, nextShotAt: 0,
      blindUntil: 0, stuckAt: 0, lastPos: new THREE.Vector3(),
      isCarrier: false, channeling: false, hearAt: new THREE.Vector3(), hearUntil: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function reset(round, playerTeam, playerCarries) {
    // Wipe the old squad and draft a fresh one: styles rotate by round so no two
    // rounds play the same. The player's team fields 4 bots (player is the 5th),
    // the other team fields 5, so it is always 5v5.
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    const atkStyles = ['rusher', 'support', 'flanker', 'marksman'];
    const defStyles = ['holder', 'holder', 'flanker', 'marksman', 'rusher'];
    const atkNames = [...BOT_NAMES.attackers];
    const defNames = [...BOT_NAMES.defenders];
    const pick = (arr) => arr.splice(Math.floor(random() * arr.length), 1)[0];
    const atkCount = playerTeam === 'attackers' ? 4 : 5;
    const defCount = playerTeam === 'defenders' ? 4 : 5;
    const atkBots = [];
    for (let i = 0; i < atkCount; i += 1) atkBots.push(makeBot('attackers', pick(atkNames), atkStyles[(i + round) % atkStyles.length], i));
    const defBots = [];
    for (let i = 0; i < defCount; i += 1) defBots.push(makeBot('defenders', pick(defNames), defStyles[(i + round) % defStyles.length], i));
    const all = [...atkBots, ...defBots];
    const spawns = { attackers: [[-4, 12.5], [-1.5, 13], [1.5, 13], [4, 12.5], [0, 11]], defenders: [[-4, -10.5], [-1.5, -11], [1.5, -11], [4, -10.5], [0, -9]] };
    let ai = 0;
    let di = 0;
    for (const bot of all) {
      const s = bot.team === 'attackers' ? spawns.attackers[ai++ % 5] : spawns.defenders[di++ % 5];
      bot.position.set(s[0], 0, s[1]);
      bot.yaw = bot.team === 'attackers' ? 0 : Math.PI;
      bot.node = nearestNode(s[0], s[1]);
      bot.path = [];
      bot.dest = null;
      bot.holdPoint = null;
      bot.target = null;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.visible = true;
      bot.isCarrier = false;
      bot.channeling = false;
      bot.blindUntil = 0;
      bot.barFg.scale.x = 0.7;
    }
    // The data-core: the player carries it when attacking, else a random attacker bot.
    let carrier = null;
    if (!playerCarries) {
      carrier = atkBots[Math.floor(random() * atkBots.length)];
      carrier.isCarrier = true;
    }
    return { attackers: atkBots, defenders: defBots, carrier };
  }

  function visibleTarget(bot, entities) {
    // Line of sight, field of view and smoke: all three must pass.
    const eye = tmp.set(bot.position.x, 1.55, bot.position.z);
    let best = null;
    let bestScore = Infinity;
    for (const e of entities) {
      if (!e.alive || e.team === bot.team) continue;
      const dx = e.position.x - eye.x;
      const dy = (e.position.y + 1.2) - eye.y;
      const dz = e.position.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 42) continue;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < 0.25 && dist > 4) continue;
      if (!combat.hasLineOfSight(eye, new THREE.Vector3(e.position.x, e.position.y + 1.2, e.position.z))) continue;
      if (combat.inSmoke(eye, new THREE.Vector3(e.position.x, e.position.y + 1.2, e.position.z))) continue;
      const score = dist + (e.isPlayer ? -3 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function pickDestination(bot, objective) {
    // Where this bot wants to be, by team and style.
    if (bot.team === 'attackers') {
      if (bot.isCarrier) return { x: 0, z: -12 };
      if (bot.styleId === 'support') return { x: objective.carrierPos.x, z: objective.carrierPos.z };
      if (bot.styleId === 'flanker') return { x: random() < 0.5 ? -12 : 12, z: -6 };
      if (bot.styleId === 'marksman') return { x: 0, z: 2 };
      return { x: (random() - 0.5) * 8, z: -8 };
    }
    if (bot.styleId === 'holder') return { x: (random() - 0.5) * 10, z: -8 - random() * 3 };
    if (bot.styleId === 'marksman') return { x: 0, z: -4 };
    if (bot.styleId === 'rusher') return { x: (random() - 0.5) * 14, z: 2 };
    return { x: (random() - 0.5) * 16, z: -2 };
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const stepLen = speed * dt;
    const nx = bot.position.x + (dx / dist) * stepLen;
    const nz = bot.position.z + (dz / dist) * stepLen;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    if (!overlaps(nx, 0, bot.position.z)) bot.position.x = nx;
    if (!overlaps(bot.position.x, 0, nz)) bot.position.z = nz;
    bot.group.rotation.y = bot.yaw;
    return false;
  }

  function step(dt, time, player, objective, surge) {
    const entities = [];
    for (const b of bots) {
      if (b.alive) entities.push({ position: b.position, alive: true, team: b.team, bot: b, isPlayer: false });
    }
    if (player.alive) entities.push({ position: player.position, alive: true, team: player.team, bot: null, isPlayer: true });
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.5;
        continue;
      }
      const blind = time < bot.blindUntil;
      // Perception, a few times a second per bot.
      if (!blind && Math.floor(time * 6 + bot.name.length) !== Math.floor((time - dt) * 6 + bot.name.length)) {
        const seen = visibleTarget(bot, entities);
        if (seen) {
          if (bot.target !== seen) {
            bot.target = seen;
            bot.reactAt = time + bot.style.reaction;
          }
          bot.seenAt = time;
        } else if (time - bot.seenAt > 1.2) bot.target = null;
      }
      // Hearing: a recent gunshot pulls bots toward it.
      if (!bot.target && time < bot.hearUntil && !blind) {
        bot.dest = { x: bot.hearAt.x, z: bot.hearAt.z };
        bot.path = [];
      }
      // Engage: face the target and fire in bursts once reacted.
      if (bot.target && !blind) {
        const t = bot.target;
        const tx = t.position.x;
        const tz = t.position.z;
        const ty = t.position.y + (t.isPlayer ? 1.25 : 1.2);
        const dx = tx - bot.position.x;
        const dz = tz - bot.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.group.rotation.y = bot.yaw;
        if (time >= bot.reactAt && time >= bot.burstAt && time >= bot.nextShotAt) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = bot.style.burst[0] + Math.floor(random() * (bot.style.burst[1] - bot.style.burst[0] + 1));
          }
          const dist = Math.hypot(dx, dz);
          const err = bot.style.aimError * (0.7 + dist / 30) * (t.isPlayer && player.crouching ? 1.3 : 1);
          const dir = tmp2.set(dx, ty - 1.55, dz).normalize();
          dir.x += (random() * 2 - 1) * err;
          dir.y += (random() * 2 - 1) * err * 0.7;
          dir.z += (random() * 2 - 1) * err;
          dir.normalize();
          combat.botShoot(bot, new THREE.Vector3(bot.position.x, 1.5, bot.position.z), dir, dist);
          bot.burstLeft -= 1;
          bot.nextShotAt = time + WEAPONS[bot.style.weapon].gap;
          if (bot.burstLeft <= 0) bot.burstAt = time + bot.style.pause + random() * 0.4;
        }
        // Strafe a little while fighting so they are not standing targets.
        if (bot.styleId !== 'marksman' && bot.styleId !== 'holder') {
          const strafe = Math.sin(time * 1.7 + bot.name.length) * 0.7;
          moveToward(bot, bot.position.x + Math.cos(bot.yaw) * strafe, bot.position.z - Math.sin(bot.yaw) * strafe, dt, bot.style.speed * 0.4);
        }
        continue;
      }
      // Carrier channels the uplink when it reaches the ring.
      if (bot.isCarrier && bot.team === 'attackers') {
        const d = Math.hypot(bot.position.x - 0, bot.position.z - (-13));
        if (d < 2.0) {
          bot.channeling = true;
          objective.onCarrierChannel(dt);
          continue;
        }
        bot.channeling = false;
      }
      // Move: hold points first, then the waypoint graph.
      if (bot.holdPoint && time < bot.holdUntil) {
        const arrived = moveToward(bot, bot.holdPoint.x, bot.holdPoint.z, dt, bot.style.speed);
        if (arrived && random() < dt * 0.2) {
          bot.yaw += (random() - 0.5) * 1.2;
          bot.group.rotation.y = bot.yaw;
        }
        continue;
      }
      if (!bot.dest || (bot.path.length === 0 && Math.hypot(bot.dest.x - bot.position.x, bot.dest.z - bot.position.z) < 0.5)) {
        bot.dest = pickDestination(bot, objective);
        const toNode = nearestNode(bot.dest.x, bot.dest.z);
        bot.path = findPath(bot.node, toNode);
        if (bot.styleId === 'holder' || bot.styleId === 'marksman') {
          bot.holdPoint = { x: bot.dest.x, z: bot.dest.z };
          bot.holdUntil = time + 6 + random() * 6;
        }
      }
      let waypoint = null;
      if (bot.path.length > 0) {
        const n = WAYPOINTS[bot.path[0]];
        waypoint = { x: n.x, z: n.z };
        if (Math.hypot(n.x - bot.position.x, n.z - bot.position.z) < 0.8) {
          bot.node = bot.path.shift();
        }
      } else if (bot.dest) waypoint = bot.dest;
      if (waypoint) {
        const speed = bot.style.speed * (surge ? 1.25 : 1);
        moveToward(bot, waypoint.x, waypoint.z, dt, speed);
        // Stuck? Pick a random neighbour and try again.
        if (bot.lastPos.distanceToSquared(bot.position) < 0.0004) {
          bot.stuckAt += dt;
          if (bot.stuckAt > 1.2) {
            const links = WAYPOINTS[bot.node].links;
            bot.node = links[Math.floor(random() * links.length)];
            bot.path = [];
            bot.dest = null;
            bot.stuckAt = 0;
          }
        } else bot.stuckAt = 0;
        bot.lastPos.copy(bot.position);
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.barFg.scale.x = Math.max(0.01, 0.7 * (bot.health / 100));
    if (bot.health <= 0) {
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      bot.group.rotation.x = 0;
      return true;
    }
    return false;
  }

  function hear(pos, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
      if (d < 26) {
        bot.hearAt.set(pos.x, 0, pos.z);
        bot.hearUntil = time + 2.5;
      }
    }
  }

  function flashAt(pos, radius, blindSeconds, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
      if (d > radius) continue;
      const dx = pos.x - bot.position.x;
      const dz = pos.z - bot.position.z;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot > 0.1 || d < 2) bot.blindUntil = Math.max(bot.blindUntil, time + blindSeconds * (1 - d / (radius * 1.4)));
    }
  }

  return {
    bots,
    reset,
    step,
    damage,
    hear,
    flashAt,
    hitMeshes() {
      const out = [];
      for (const b of bots) if (b.alive) out.push(b.torso, b.head);
      return out;
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
  };
}
