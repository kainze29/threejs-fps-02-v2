// NEON TIDE: boot, the fixed-step loop, and every system talking to each other.
// The simulation runs at 60 Hz apart from rendering; the DOM HUD only ever reads
// numbers main.js pushes it. ?shot=menu|buy|action|surge stages a deterministic
// frame for a capture, and ?test=1 exposes window.__test for automated playtests.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, MAP, UPLINK, SPAWNS } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapons, WEAPONS, GADGETS, ARMOR } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createEconomy } from './economy.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const testMode = params.has('test');

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene, random);
const effects = createEffects(scene);
const weapons = createWeapons(camera, audio);
const economy = createEconomy();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;

const body = player.state;
let health = 100;
let playerAlive = true;
let playerTeam = 'attackers';
let squad = { attackers: [], defenders: [], carrier: null };
let started = false;
let frozen = false;
let elapsed = 0;
let lastTime = performance.now();
let accumulator = 0;
let uplinkTickAt = 0;
let mapAt = 0;
let decoyShotAt = 0;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

// The data-core, carried by the player or a bot, or dropped on the deck.
const coreMesh = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.32),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magenta), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.4, roughness: 0.3 }),
);
coreMesh.visible = false;
scene.add(coreMesh);
const coreLight = new THREE.PointLight(new THREE.Color(PALETTE.magenta), 6, 6, 1.8);
coreMesh.add(coreLight);

function teamName(team) { return team === 'attackers' ? 'Tidebreakers' : 'Wardens'; }

function hudSync(force) {
  hud.setHealth(health, weapons.state.armor);
  const d = weapons.currentDef();
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], d.name);
  hud.setMoney(economy.state.money);
  hud.setScore(rounds.state.score.attackers, rounds.state.score.defenders, Math.max(1, rounds.state.round));
  const phaseLabel = rounds.state.phase === 'buy' ? 'BUY' : rounds.state.phase === 'live' ? 'ROUND' : rounds.state.phase === 'roundEnd' ? 'ROUND END' : 'MENU';
  hud.setTimer(rounds.state.phase === 'menu' ? 0 : rounds.state.timer, phaseLabel);
  hud.setSurge(rounds.state.surge && rounds.state.phase !== 'menu');
  const spreadPx = 4 + weapons.spread(player.groundSpeed()) * 320;
  hud.setCrosshair(spreadPx);
}

const hud = createHud({
  onPlay: () => {
    if (shot) return;
    audio.unlock();
    audio.startRain();
    if (rounds.state.phase === 'matchEnd') { startMatch(); return; }
    if (rounds.state.phase === 'menu') { startMatch(); return; }
    input.requestLock();
  },
  onBuy: (id) => buyItem(id),
  onDeploy: () => deploy(),
});

const rounds = createRounds({
  onBuyStart(round, team, surge) {
    playerTeam = team;
    respawnPlayer();
    const playerCarries = team === 'attackers';
    squad = bots.reset(round, team, playerCarries);
    rounds.state.coreHolder = playerCarries ? 'player' : squad.carrier;
    weapons.refillRound();
    effects.clearRound();
    hud.hideDeath();
    hud.showBuy(economy.shopRows(weapons.state), economy.state.money);
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showBanner(`ROUND ${round}`, surge ? 'TIDE SURGE — low gravity, faster movement' : `${teamName(team)} attack. Carry the core to the uplink.`, 2800);
    if (surge) audio.surge();
    updateObjective();
    hudSync(true);
  },
  onRoundStart(round, surge) {
    hud.hideBuy();
    hud.showBanner(surge ? 'TIDE SURGE' : `ROUND ${round}`, surge ? 'Low gravity. High speed. Hold on.' : 'Fight.', 2000);
    audio.roundStart();
    if (!shot) input.requestLock();
    updateObjective();
    hudSync(true);
  },
  onRoundEnd(round, winner, reason, score) {
    const playerWon = winner === playerTeam;
    economy.endRound(playerWon);
    if (reason === 'uplink' && playerTeam === 'attackers') economy.addUplink();
    const reasonText = reason === 'elimination' ? 'Enemy crew wiped out' : reason === 'uplink' ? 'Data-core uplinked' : 'Time expired — site held';
    hud.showBanner(playerWon ? 'ROUND WON' : 'ROUND LOST', `${reasonText}. ${teamName('attackers')} ${score.attackers} — ${score.defenders} ${teamName('defenders')}`, 3400);
    if (playerWon) audio.roundWin(); else audio.roundLose();
    hud.killfeedInfo(`${reasonText}. ${teamName(winner)} take round ${round}.`);
    hudSync(true);
  },
  onMatchEnd(winner, score) {
    const result = winner === 'draw' ? 'matchDraw' : winner === playerTeam ? 'matchWin' : 'matchLose';
    hud.showOverlay(result, `Final: Tidebreakers ${score.attackers} — ${score.defenders} Wardens.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onUplinkProgress(p) {
    updateObjective();
  },
  onCoreDropped(x, z) {
    hud.killfeedInfo('The data-core is down. Pick it up.');
    updateObjective();
  },
  onCoreTaken(holder) {
    const name = holder === 'player' ? 'You' : holder.name;
    hud.killfeedInfo(`${name} picked up the data-core.`);
    audio.pickup();
    updateObjective();
  },
});

const combat = {
  hasLineOfSight(a, b) {
    tmpVec.copy(b).sub(a);
    const dist = tmpVec.length();
    if (dist < 0.01) return true;
    tmpVec.normalize();
    raycaster.set(a, tmpVec);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    raycaster.far = 100;
    return hits.length === 0 || hits[0].distance > dist - 0.05;
  },
  inSmoke(a, b) {
    for (const s of effects.smokeZones) {
      if (s.life <= 0) continue;
      // 2D segment-to-point distance in the deck plane.
      const ax = a.x; const az = a.z;
      const bx = b.x; const bz = b.z;
      const dx = bx - ax; const dz = bz - az;
      const lenSq = dx * dx + dz * dz || 1;
      let t = ((s.x - ax) * dx + (s.z - az) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t;
      const pz = az + dz * t;
      if (Math.hypot(s.x - px, s.z - pz) < s.r) return true;
    }
    return false;
  },
  botShoot(bot, origin, dir, dist) {
    const def = WEAPONS[bot.style.weapon];
    raycaster.set(origin, dir);
    raycaster.far = def.range;
    const targets = bots.hitMeshes().filter((m) => m.userData.bot !== bot);
    const botHits = raycaster.intersectObjects(targets, false);
    const wallHits = raycaster.intersectObjects(world.shootables, false);
    const playerHit = rayHitsPlayer(origin, dir, def.range);
    let end = tmpVec.copy(dir).multiplyScalar(def.range).add(origin).clone();
    let endDist = def.range;
    if (wallHits.length && wallHits[0].distance < endDist) {
      endDist = wallHits[0].distance;
      end = wallHits[0].point.clone();
      effects.spawnSparks(wallHits[0].point);
    }
    if (botHits.length && botHits[0].distance < endDist) {
      endDist = botHits[0].distance;
      end = botHits[0].point.clone();
      const victim = botHits[0].object.userData.bot;
      const part = botHits[0].object.userData.part;
      damageBot(victim, def.damage * (part === 'head' ? def.headMul : 1), part, bot);
    }
    if (playerHit && playerHit.dist < endDist && playerAlive) {
      endDist = playerHit.dist;
      end = origin.clone().add(dir.clone().multiplyScalar(playerHit.dist));
      damagePlayer(def.damage * (playerHit.part === 'head' ? def.headMul : 1), playerHit.part, bot);
    }
    effects.spawnTracer(origin, end, bot.team === 'attackers' ? PALETTE.teal : PALETTE.magenta);
    raycaster.far = 100;
    if (playerAlive && origin.distanceTo(body.position) < 34) audio.shot(bot.style.weapon, true);
  },
};

const bots = createBots(scene, world, random, combat);

function rayHitsPlayer(origin, dir, maxDist) {
  // Analytic test: head sphere plus a vertical torso cylinder, no mesh needed.
  const px = body.position.x;
  const py = body.position.y;
  const pz = body.position.z;
  let best = null;
  // Head sphere.
  tmpVec.set(px - origin.x, py + 1.56 - origin.y, pz - origin.z);
  const b = tmpVec.dot(dir);
  const c = tmpVec.lengthSq() - 0.2 * 0.2;
  const disc = b * b - c;
  if (disc > 0) {
    const t = b - Math.sqrt(disc);
    if (t > 0 && t < maxDist) best = { part: 'head', dist: t };
  }
  // Torso cylinder, solved in the deck plane.
  const dx = dir.x;
  const dz = dir.z;
  const denom = dx * dx + dz * dz;
  if (denom > 0.0001) {
    const t = ((px - origin.x) * dx + (pz - origin.z) * dz) / denom;
    if (t > 0 && t < maxDist) {
      const cx = origin.x + dx * t;
      const cz = origin.z + dz * t;
      if (Math.hypot(px - cx, pz - cz) < 0.34) {
        const y = origin.y + dir.y * t;
        if (y >= py && y <= py + 1.72 && (!best || t < best.dist)) best = { part: 'torso', dist: t };
      }
    }
  }
  return best;
}

function damagePlayer(amount, part, attacker) {
  if (!playerAlive || rounds.state.phase !== 'live') return;
  let rest = amount;
  if (weapons.state.armor > 0) {
    const absorbed = Math.min(weapons.state.armor, rest * 0.5);
    weapons.state.armor -= absorbed;
    rest -= absorbed;
  }
  health -= rest;
  hud.damageFlash();
  audio.hurt();
  if (health <= 0) {
    health = 0;
    playerAlive = false;
    hud.showDeath();
    hud.killfeedKill(attacker.name, 'You', WEAPONS[attacker.style.weapon].name, attacker.team, playerTeam, part === 'head');
    if (rounds.state.coreHolder === 'player') {
      rounds.dropCore(body.position.x, body.position.z);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    checkRoundEnd();
  }
  hudSync(true);
}

function damageBot(bot, amount, part, shooter) {
  if (!bot.alive) return;
  const killed = bots.damage(bot, amount, part);
  if (shooter === 'player') {
    hud.hitMarker(killed, killed ? 4000 : 90);
    audio.hit(killed);
  }
  if (killed) {
    const shooterName = shooter === 'player' ? 'You' : shooter.name;
    const shooterTeam = shooter === 'player' ? playerTeam : shooter.team;
    hud.killfeedKill(shooterName, bot.name, shooter === 'player' ? weapons.currentDef().name : WEAPONS[shooter.style.weapon].name, shooterTeam, bot.team, part === 'head');
    // Only enemy kills pay: a teamkill used to pay $300 too, so a stray shot
    // through a teammate in a lane paid the same as a real kill.
    if (shooter === 'player' && bot.team !== playerTeam) economy.addKill();
    if (bot.isCarrier) {
      bot.isCarrier = false;
      rounds.dropCore(bot.position.x, bot.position.z);
    }
    checkRoundEnd();
  }
  hudSync(true);
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const atkAlive = bots.aliveCount('attackers') + (playerAlive && playerTeam === 'attackers' ? 1 : 0);
  const defAlive = bots.aliveCount('defenders') + (playerAlive && playerTeam === 'defenders' ? 1 : 0);
  if (atkAlive === 0) rounds.endRound('defenders', 'elimination');
  else if (defAlive === 0) rounds.endRound('attackers', 'elimination');
}

function respawnPlayer() {
  const spawn = playerTeam === 'attackers' ? SPAWNS.attackers[2] : SPAWNS.defenders[2];
  body.position.set(spawn[0], 0, spawn[1]);
  body.velocity.set(0, 0, 0);
  body.yaw = playerTeam === 'attackers' ? 0 : Math.PI;
  body.pitch = 0;
  body.eye = 1.6;
  health = 100;
  playerAlive = true;
  player.setSurge(rounds.state.surge);
  hud.hideDeath();
  syncCamera();
}

function startMatch() {
  economy.resetMatch();
  weapons.resetMatch();
  rounds.startMatch();
  hud.hideOverlay();
}

function deploy() {
  if (rounds.state.phase !== 'buy') return;
  rounds.beginRound();
}

function updateObjective() {
  const r = rounds.state;
  const isCarrier = r.coreHolder === 'player';
  if (r.phase === 'menu') { hud.setObjective('Carry the data-core to the uplink.', false); return; }
  if (playerTeam === 'defenders') {
    const carrier = typeof r.coreHolder === 'object' && r.coreHolder ? r.coreHolder.name : 'an attacker';
    hud.setObjective(r.coreDropped ? 'Core is down. Stop attackers from grabbing it.' : `${carrier} carries the core. Stop the uplink.`, false);
  } else if (isCarrier) {
    hud.setObjective(r.uplink > 0 ? `UPLINKING… ${Math.round(r.uplink * 100)}% — hold E in the ring.` : 'You have the core. Reach the magenta ring and hold E.', true);
  } else if (r.coreDropped) {
    hud.setObjective('Core is down. Walk over it to pick it up.', false);
  } else {
    const carrier = typeof r.coreHolder === 'object' && r.coreHolder ? r.coreHolder.name : 'a teammate';
    hud.setObjective(`${carrier} carries the core. Escort them to the uplink.`, false);
  }
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  // The shop buttons disable owned rows, but the 1-7 keys bypass them: refuse a
  // re-buy here so a keyboard press can never charge for a gun or armor already owned.
  if (WEAPONS[id] && weapons.state.owned[id]) { audio.denied(); return; }
  if (id === ARMOR.id && weapons.state.armor > 0) { audio.denied(); return; }
  const result = economy.buy(id);
  if (result === 'poor') { audio.denied(); return; }
  if (WEAPONS[id]) weapons.buyWeapon(id);
  else if (GADGETS[id]) weapons.buyGadget(id);
  else if (id === ARMOR.id) weapons.buyArmor();
  audio.buy();
  hud.showBuy(economy.shopRows(weapons.state), economy.state.money);
  hudSync(true);
}

function throwGadget(id) {
  if (rounds.state.phase !== 'live' || !playerAlive) return;
  if (!weapons.takeGadget(id)) { audio.denied(); return; }
  camera.getWorldDirection(direction);
  raycaster.set(camera.position, direction);
  raycaster.far = 14;
  const hits = raycaster.intersectObjects(world.shootables, false);
  raycaster.far = 100;
  const land = hits.length ? hits[0].point.clone() : camera.position.clone().add(direction.clone().multiplyScalar(10));
  land.y = Math.max(0.2, land.y);
  if (id === 'smoke') {
    effects.spawnSmoke(land);
    audio.smoke();
    hud.killfeedInfo('You threw a Mist Orb.');
  } else if (id === 'flash') {
    effects.spawnSparks(land, 8);
    audio.flash();
    bots.flashAt(land, 15, 2.5, elapsed);
    const toFlash = tmpVec.copy(land).sub(camera.position).normalize();
    camera.getWorldDirection(tmpVec2);
    if (tmpVec.dot(tmpVec2) > 0.4 && camera.position.distanceTo(land) < 22) hud.flashBlind(1400);
    hud.killfeedInfo('You threw a Strobe Orb.');
  } else if (id === 'decoy') {
    land.y = 1.8;
    effects.spawnDecoy(land);
    hud.killfeedInfo('Echo Drone deployed.');
  }
  hudSync(true);
}

function playerShoot() {
  if (!weapons.takeRound()) return;
  const def = weapons.currentDef();
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed());
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const botMeshes = bots.hitMeshes();
  const botHits = raycaster.intersectObjects(botMeshes, false);
  const wallHits = raycaster.intersectObjects(world.shootables, false);
  let end = camera.position.clone().add(direction.clone().multiplyScalar(def.range));
  let endDist = def.range;
  if (wallHits.length && wallHits[0].distance < endDist) {
    endDist = wallHits[0].distance;
    end = wallHits[0].point.clone();
    effects.spawnSparks(wallHits[0].point);
  }
  if (botHits.length && botHits[0].distance < endDist) {
    endDist = botHits[0].distance;
    end = botHits[0].point.clone();
    const victim = botHits[0].object.userData.bot;
    const part = botHits[0].object.userData.part;
    damageBot(victim, def.damage * (part === 'head' ? def.headMul : 1), part, 'player');
  }
  effects.spawnTracer(camera.position.clone().add(direction.clone().multiplyScalar(0.5)), end);
  raycaster.far = 100;
  weapons.pullTrigger();
  player.recoil(0.009 + def.recoil * 0.5 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(body.position, elapsed);
  hudSync(true);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (rounds.state.phase === 'live' && playerAlive) {
    hud.showOverlay('paused');
  }
}

function step(dt) {
  elapsed += dt;
  const r = rounds.state;
  const pressed = input.takePressed();
  const phase = r.phase;

  // Buy-phase and live-phase keys: 1-4 buy or switch, 5-7 buy or throw, B menu, E uplink.
  if (phase === 'buy') {
    if (pressed.has('Digit1')) buyItem('smg');
    if (pressed.has('Digit2')) buyItem('rifle');
    if (pressed.has('Digit3')) buyItem('dmr');
    if (pressed.has('Digit4')) buyItem('armor');
    if (pressed.has('Digit5')) buyItem('smoke');
    if (pressed.has('Digit6')) buyItem('flash');
    if (pressed.has('Digit7')) buyItem('decoy');
    if (pressed.has('KeyB')) {
      if (hudBuyVisible()) hud.hideBuy();
      else hud.showBuy(economy.shopRows(weapons.state), economy.state.money);
    }
    if (pressed.has('Enter')) deploy();
  } else if (phase === 'live') {
    if (pressed.has('Digit1')) weapons.equip('sidearm');
    if (pressed.has('Digit2')) weapons.equip('smg');
    if (pressed.has('Digit3')) weapons.equip('rifle');
    if (pressed.has('Digit4')) weapons.equip('dmr');
    if (pressed.has('Digit5')) throwGadget('smoke');
    if (pressed.has('Digit6')) throwGadget('flash');
    if (pressed.has('Digit7')) throwGadget('decoy');
    if (pressed.has('KeyQ')) {
      if (weapons.state.gadgets.smoke > 0) throwGadget('smoke');
      else if (weapons.state.gadgets.flash > 0) throwGadget('flash');
      else if (weapons.state.gadgets.decoy > 0) throwGadget('decoy');
      else audio.denied();
    }
  }
  if (pressed.has('KeyR') && phase === 'live') weapons.reload();

  if (playerAlive && phase !== 'menu') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
  }

  if (phase === 'live') {
    // Objective: pick up a dropped core, channel the uplink.
    if (r.coreDropped && playerTeam === 'attackers' && playerAlive) {
      if (Math.hypot(r.coreDropped.x - body.position.x, r.coreDropped.z - body.position.z) < 1.4) {
        rounds.takeCore('player');
      }
    }
    const inRing = Math.hypot(body.position.x - UPLINK.x, body.position.z - UPLINK.z) < UPLINK.radius;
    if (r.coreHolder === 'player' && inRing && input.state.keys.has('KeyE')) {
      if (rounds.channelUplink(dt)) {
        // Uplink complete: round ends inside channelUplink.
      } else if (elapsed - uplinkTickAt > 0.5) {
        uplinkTickAt = elapsed;
        audio.uplinkTick();
      }
    } else {
      rounds.decayUplink(dt);
    }
    // Bots: objective view for this step.
    const carrierPos = carrierPosition();
    const objective = {
      carrierPos,
      onCarrierChannel: (stepDt) => rounds.channelUplink(stepDt),
      onBotPickupCore: (bot) => {
        if (r.coreDropped && bot.team === 'attackers') {
          bot.isCarrier = true;
          rounds.takeCore(bot);
        }
      },
    };
    bots.step(dt, elapsed, { position: body.position, alive: playerAlive, team: playerTeam, crouching: body.crouching }, objective, r.surge);
    // A dropped core is picked up by any attacker bot walking over it.
    if (r.coreDropped) {
      for (const b of squad.attackers) {
        if (b.alive && Math.hypot(r.coreDropped.x - b.position.x, r.coreDropped.z - b.position.z) < 1.4) {
          b.isCarrier = true;
          rounds.takeCore(b);
          break;
        }
      }
    }
    // Decoy drones crackle fake gunfire and pull bots toward them.
    if (effects.decoys.length && elapsed - decoyShotAt > 0.7) {
      decoyShotAt = elapsed;
      const d = effects.decoys[Math.floor(random() * effects.decoys.length)];
      audio.shot('smg', true);
      effects.spawnTracer(new THREE.Vector3(d.x, d.mesh.position.y, d.z), new THREE.Vector3(d.x + (random() - 0.5) * 10, 1.2, d.z + (random() - 0.5) * 10), PALETTE.magenta);
      bots.hear({ x: d.x, z: d.z }, elapsed);
    }
  }

  world.step(dt, elapsed);
  effects.step(dt, elapsed);
  rounds.step(dt);
  updateCoreMesh();
  if (elapsed - mapAt > 0.12) {
    mapAt = elapsed;
    drawMinimap();
  }
  hudSync(false);
}

function carrierPosition() {
  const r = rounds.state;
  if (r.coreHolder === 'player') return { x: body.position.x, z: body.position.z };
  if (r.coreHolder && typeof r.coreHolder === 'object') return { x: r.coreHolder.position.x, z: r.coreHolder.position.z };
  if (r.coreDropped) return { x: r.coreDropped.x, z: r.coreDropped.z };
  return { x: 0, z: 0 };
}

function updateCoreMesh() {
  const r = rounds.state;
  if (r.phase === 'menu') { coreMesh.visible = false; return; }
  const pos = carrierPosition();
  if (r.coreHolder === 'player') {
    // Carried low and to the right, small, like a held object: at full size and
    // head height it blocked the crosshair, and at 0.35m out it still filled a
    // quarter of the screen and covered the ammo readout.
    coreMesh.visible = true;
    coreMesh.scale.setScalar(0.35);
    const fx = -Math.sin(body.yaw);
    const fz = -Math.cos(body.yaw);
    const rx = Math.cos(body.yaw);
    const rz = -Math.sin(body.yaw);
    coreMesh.position.set(
      body.position.x + rx * 0.42 + fx * 0.75,
      body.position.y + 1.18,
      body.position.z + rz * 0.42 + fz * 0.75,
    );
  } else if (r.coreHolder && typeof r.coreHolder === 'object') {
    coreMesh.visible = true;
    coreMesh.scale.setScalar(1);
    coreMesh.position.set(pos.x, 1.9, pos.z);
  } else if (r.coreDropped) {
    coreMesh.visible = true;
    coreMesh.scale.setScalar(1);
    coreMesh.position.set(pos.x, 0.5, pos.z);
  } else coreMesh.visible = false;
  coreMesh.rotation.y = elapsed * 1.2;
}

function drawMinimap() {
  const dots = [];
  for (const b of bots.bots) {
    if (!b.alive) continue;
    dots.push({ x: b.position.x, z: b.position.z, team: b.team, you: false });
  }
  if (playerAlive) dots.push({ x: body.position.x, z: body.position.z, team: playerTeam, you: true });
  for (const d of effects.decoys) dots.push({ x: d.x, z: d.z, team: playerTeam, you: false });
  hud.drawMinimap(world.minimapRects, dots, UPLINK, rounds.state.coreDropped);
}

function hudBuyVisible() { return !document.getElementById('buy-menu').hidden; }

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive && rounds.state.phase !== 'menu') player.look(look.x, look.y);
    if (input.state.firing && playerAlive && rounds.state.phase === 'live' && weapons.ready()) {
      if (weapons.currentDef().auto || !weapons.state.triggerHeld) playerShoot();
      weapons.state.triggerHeld = true;
    } else weapons.state.triggerHeld = false;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  hud.hideDeath();
  if (name === 'menu') {
    body.position.set(6, 0, 10);
    body.yaw = 0.5;
    body.pitch = -0.02;
    settle(30);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  // Every other shot plays a real match: start, buy, then stage the moment.
  economy.resetMatch();
  weapons.resetMatch();
  rounds.startMatch();
  if (name === 'buy') {
    economy.state.money = 5200;
    buyItem('rifle');
    buyItem('smoke');
    body.position.set(0, 0, 12);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    hud.showBuy(economy.shopRows(weapons.state), economy.state.money);
    hudSync(true);
    paintTwiceThenReady();
    return;
  }
  rounds.beginRound();
  if (name === 'action') {
    // Walk the player to mid, put two enemies in the lane, fire one staged shot.
    body.position.set(0, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    settle(60);
    const enemies = squad.defenders.filter((b) => b.alive).slice(0, 2);
    if (enemies[0]) { enemies[0].position.set(-1.5, 0, -2); enemies[0].group.rotation.y = Math.PI; }
    if (enemies[1]) { enemies[1].position.set(2.5, 0, -5); enemies[1].group.rotation.y = Math.PI; }
    settle(10);
    aimAt(new THREE.Vector3(-1.5, 1.2, -2));
    playerShoot();
    settle(2);
    paintTwiceThenReady();
    return;
  }
  if (name === 'surge') {
    // Force the surge round: jump the round counter to 3 and restage.
    rounds.state.round = 3;
    rounds.state.surge = true;
    player.setSurge(true);
    body.position.set(0, 0, 6);
    body.yaw = 0;
    body.pitch = 0.08;
    body.velocity.y = 5;
    settle(24);
    const enemies = squad.defenders.filter((b) => b.alive).slice(0, 2);
    if (enemies[0]) { enemies[0].position.set(-2, 0, -3); enemies[0].group.rotation.y = Math.PI; }
    if (enemies[1]) { enemies[1].position.set(3, 0, -7); enemies[1].group.rotation.y = Math.PI; }
    rounds.state.uplink = 0.62;
    updateObjective();
    hud.setObjective('UPLINKING… 62% — hold E in the ring.', true);
    hud.showBanner('TIDE SURGE', 'Low gravity. High speed. Hold on.', 4000);
    settle(6);
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  audio.startRain();
  if (rounds.state.phase === 'matchEnd' || rounds.state.phase === 'menu') {
    startMatch();
    return;
  }
  input.requestLock();
});

syncCamera();
hudSync(true);
updateObjective();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}

// Test hooks: only when ?test=1. Automated playtests use these to reach every
// path (buy with no money, empty mag, death, round win/loss, team swap, surge,
// timer expiry) without waiting out real timers.
if (testMode) {
  window.__test = {
    state() {
      return {
        phase: rounds.state.phase,
        round: rounds.state.round,
        timer: rounds.state.timer,
        score: { ...rounds.state.score },
        playerTeam,
        surge: rounds.state.surge,
        health,
        alive: playerAlive,
        money: economy.state.money,
        kills: economy.state.kills,
        mag: weapons.state.mag[weapons.state.current],
        reserve: weapons.state.reserve[weapons.state.current],
        weapon: weapons.state.current,
        owned: { ...weapons.state.owned },
        gadgets: { ...weapons.state.gadgets },
        uplink: rounds.state.uplink,
        coreHolder: rounds.state.coreHolder === 'player' ? 'player' : rounds.state.coreHolder ? rounds.state.coreHolder.name : null,
        coreDropped: rounds.state.coreDropped,
        atkAlive: bots.aliveCount('attackers') + (playerAlive && playerTeam === 'attackers' ? 1 : 0),
        defAlive: bots.aliveCount('defenders') + (playerAlive && playerTeam === 'defenders' ? 1 : 0),
        botsAlive: bots.bots.filter((b) => b.alive).length,
        errors: window.__errors || [],
      };
    },
    start: () => startMatch(),
    skipBuy: () => { if (rounds.state.phase === 'buy') rounds.beginRound(); },
    giveMoney: (n) => { economy.state.money = n; hudSync(true); },
    setHealth: (n) => { health = n; hudSync(true); },
    hurtPlayer: (n) => damagePlayer(n, 'torso', { name: 'Test', team: playerTeam === 'attackers' ? 'defenders' : 'attackers', style: { weapon: 'rifle' } }),
    killAllEnemies: () => {
      const enemyTeam = playerTeam === 'attackers' ? 'defenders' : 'attackers';
      for (const b of bots.bots) if (b.alive && b.team === enemyTeam) damageBot(b, 9999, 'torso', 'player');
    },
    killAllFriendlies: () => {
      for (const b of bots.bots) if (b.alive && b.team === playerTeam) damageBot(b, 9999, 'torso', 'player');
    },
    endRound: (winner, reason) => rounds.endRound(winner, reason || 'elimination'),
    setRound: (n) => { rounds.state.round = n; },
    setTimer: (s) => { rounds.state.timer = s; },
    setUplink: (p) => { rounds.state.uplink = p; updateObjective(); },
    teleport: (x, z, yaw) => { body.position.set(x, 0, z); if (yaw !== undefined) body.yaw = yaw; syncCamera(); },
    buy: (id) => buyItem(id),
    equip: (id) => weapons.equip(id),
    throwGadget: (id) => throwGadget(id),
    shoot: () => playerShoot(),
    aimAtBot: () => {
      const enemyTeam = playerTeam === 'attackers' ? 'defenders' : 'attackers';
      const target = bots.bots.find((b) => b.alive && b.team === enemyTeam);
      if (!target) return false;
      aimAt(new THREE.Vector3(target.position.x, 1.2, target.position.z));
      return true;
    },
  };
}

window.addEventListener('error', (event) => {
  (window.__errors = window.__errors || []).push(String(event.message || event.error));
});
