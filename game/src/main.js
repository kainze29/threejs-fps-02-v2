// NEON TIDE entry point: renderer loop, keyboard/mouse/pointer-lock input,
// ?test=1 hooks for the automated playtest and ?shot= modes for screenshots.
// Fresh code written for threejs-fps-02.
import * as THREE from 'three';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SHOT = params.get('shot') || '';

const app = document.getElementById('app');
const game = new Game(app);

// ---- input ----
const canvas = game.renderer.domElement;
canvas.addEventListener('click', () => {
  if (game.phase === 'live' || game.phase === 'buy') {
    game.sfx.ensure();
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) game.player.mouseDown = false;
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  const p = game.player;
  p.yaw -= e.movementX * 0.0021;
  p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch - e.movementY * 0.0021));
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === canvas) game.player.mouseDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) game.player.mouseDown = false;
});
document.addEventListener('keydown', (e) => {
  const p = game.player;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  p.keys.add(e.code);
  if (game.phase === 'buy') {
    if (e.code === 'Enter') game.deploy();
    else if (/^Digit[1-7]$/.test(e.code)) {
      const n = e.code.slice(5);
      const item = { 1: ['weapon', 'kestrel'], 2: ['weapon', 'tempest'], 3: ['weapon', 'longshot'], 4: ['armor', 'armor'], 5: ['gadget', 'smoke'], 6: ['gadget', 'flash'], 7: ['gadget', 'decoy'] }[n];
      if (item) game.buyItem(item[0], item[1]);
    }
  }
  if (game.phase === 'live') {
    if (e.code === 'KeyR') game.reload();
    if (e.code === 'KeyQ') game.switchWeapon();
    if (e.code === 'KeyG') game.useGadget();
  }
});
document.addEventListener('keyup', (e) => {
  game.player.keys.delete(e.code);
});

// ---- render loop ----
const clock = { last: performance.now() };
function frame(now) {
  const dt = Math.min(0.05, (now - clock.last) / 1000 || 0.016);
  clock.last = now;
  try {
    game.update(dt);
  } catch (err) {
    window.__NT_ERROR = String(err && err.stack || err);
    throw err;
  }
  requestAnimationFrame(frame);
}
// In test mode the loop is driven by the __NT.step hook instead: headless
// SwiftShader compositors issue BeginFrames only a few times a second, so the
// playtest steps the game deterministically. Real browsers use rAF as normal.
if (!TEST) requestAnimationFrame(frame);
requestAnimationFrame(frame);

// ---- test hooks (?test=1) ----
if (TEST) {
  const p = game.player;
  window.__NT = {
    game,
    step: (dt) => game.update(dt || 1 / 60),
    state() {
      return {
        phase: game.phase,
        time: game.time,
        round: game.round,
        score: { ...game.score },
        timer: game.timer,
        surge: game.surge,
        attackTeam: game.attackTeam,
        playerTeam: game.playerTeam,
        hp: p.hp,
        armor: p.armor,
        money: p.money,
        alive: p.alive,
        weapon: game._currentWeapon()?.id || null,
        ammo: game._currentWeapon()?.state.ammo ?? 0,
        reserve: game._currentWeapon()?.state.reserve ?? 0,
        current: p.current,
        gadgets: { ...p.gadgets },
        core: game.core.carrier === 'player' ? 'player' : game.core.carrier ? game.core.carrier.name : game.core.dropped ? 'dropped' : 'none',
        channel: game.channel,
        channelBot: game.channelBotProgress,
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        yaw: p.yaw,
        pitch: p.pitch,
        bots: game.bots.map((b) => ({ name: b.name, team: b.team, alive: b.alive, hp: b.hp, x: b.pos.x, z: b.pos.z, yaw: b.yaw, role: b.role })),
        smokes: game.smokes.length,
        killfeed: [...game.killfeed],
        lossStreak: game.lossStreak,
      };
    },
    start: () => game.startMatch(),
    deploy: () => game.deploy(),
    buy: (kind, id) => game.buyItem(kind, id),
    setMoney: (n) => { p.money = n; },
    setRound: (n) => { game.round = n; },
    setScore: (t, w) => { game.score.tide = t; game.score.warden = w; },
    setTimer: (s) => { game.timer = s; },
    teleport: (x, y, z) => { p.pos.set(x, y ?? 0, z); },
    setView: (yaw, pitch) => { p.yaw = yaw; p.pitch = pitch; },
    aimAtBot: (name) => {
      const b = game.bots.find((x) => x.name === name && x.alive);
      if (!b) return false;
      const dx = b.pos.x - p.pos.x, dy = (b.pos.y + 1.3) - (p.pos.y + 1.7), dz = b.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
      return true;
    },
    shoot: () => game.shoot(),
    reload: () => game.reload(),
    damagePlayer: (n, from) => game.damagePlayer(n, from || 'Test'),
    damageBot: (name, n) => {
      const b = game.bots.find((x) => x.name === name);
      if (b) game.damageBot(b, n, 'You', 'body');
      return !!b;
    },
    useGadget: (kind) => game.useGadget(kind),
    holdKey: (code) => p.keys.add(code),
    releaseKey: (code) => p.keys.delete(code),
    key: (code) => { p.keys.add(code); setTimeout(() => p.keys.delete(code), 50); },
    god: (on) => { game.testGod = !!on; },
    freezeBots: (on) => { game.testFreezeBots = !!on; },
    shotsFired: () => game.shots.length,
    teleportBot: (name, x, z, yaw) => {
      const b = game.bots.find((x) => x.name === name);
      if (!b) return false;
      b.pos.set(x, 0, z);
      b.group.position.copy(b.pos);
      if (yaw !== undefined) {
        b.yaw = yaw;
        b.group.rotation.y = yaw;
      }
      b.path = [];
      b.pathIdx = 0;
      return true;
    },
    seesPlayer: (name) => {
      const b = game.bots.find((x) => x.name === name && x.alive);
      if (!b || !game.player.alive) return false;
      const p = game.player;
      const eye = b.eyePos;
      const pEye = new THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z);
      const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 42) return false;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if ((dx * fx + dz * fz) / Math.max(dist, 0.001) < 0.42) return false;
      if (game._inSmoke(pEye) || game._inSmoke(eye)) return false;
      if (game._smokeBlocks(eye, pEye)) return false;
      return game._losClear(eye, pEye);
    },
    endRound: (winner, reason) => game._endRound(winner, reason || 'eliminated'),
    nextRound: () => game._nextAfterRoundEnd(),
    forceLive: () => { if (game.phase === 'buy') game.deploy(); },
    losClear: (ax, ay, az, bx, by, bz) => game._losClear(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)),
    inSmoke: (x, y, z) => game._inSmoke({ x, y, z }),
    botBlinded: (name) => {
      const b = game.bots.find((x) => x.name === name);
      return b ? (b.blindedUntil || 0) > game.time : false;
    },
    botHoldingUplink: () => game.bots.some((b) => b.holdAtUplink),
  };
  window.__NT_READY = true;
}

// ---- screenshot modes (?shot=menu|buy|action|surge) ----
if (SHOT) {
  const p = game.player;
  const setup = async () => {
    // Wait a couple of frames so the renderer has painted once.
    await new Promise((r) => setTimeout(r, 300));
    if (SHOT === 'menu') {
      // Title screen over the orbiting harbor view: nothing to start.
    } else if (SHOT === 'buy') {
      game.startMatch();
      p.pos.set(-4, 0, 10);
      p.yaw = 0.25;
      p.pitch = -0.02;
    } else if (SHOT === 'action') {
      game.startMatch();
      game.deploy();
      // Player mid-dock looking north; two enemies staged in view.
      p.pos.set(0, 0, 8);
      p.yaw = 0;
      p.pitch = 0.01;
      const v = game.bots.find((b) => b.name === 'Vex');
      const m = game.bots.find((b) => b.name === 'Mira');
      if (v) { v.pos.set(-2.5, 0, -2); v.yaw = 0; v.group.position.copy(v.pos); v.group.rotation.y = 0; }
      if (m) { m.pos.set(3.5, 0, -6); m.yaw = 0.3; m.group.position.copy(m.pos); m.group.rotation.y = 0.3; }
      // Let the camera sync to the new player position before firing.
      for (let i = 0; i < 5; i++) game.update(1 / 60);
      // A real kill for the killfeed, and a real tracer toward the second bot.
      if (v) game.damageBot(v, 200, 'You', 'body');
      if (m) {
        const dx = m.pos.x - p.pos.x, dy = (m.pos.y + 1.3) - (p.pos.y + 1.7), dz = m.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        p.yaw = Math.atan2(-dx, -dz);
        p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
        game.update(1 / 60);
        game.shoot();
      }
      for (let i = 0; i < 3; i++) game.update(1 / 60);
    } else if (SHOT === 'surge') {
      game.round = 3;
      game.startMatch();
      game.round = 3;
      game._startRound();
      game.deploy();
      p.pos.set(0, 1.6, 6);
      p.yaw = 0;
      p.pitch = 0.05;
      p.grounded = false;
      p.velY = 2;
      game.hud.bannerShow('ROUND 3 — ATTACK', 'TIDE SURGE: low gravity, +25% speed', '#19e3c2', 9000);
    }
    // Render a few frames so the shot is fully painted before the flag goes up.
    for (let i = 0; i < 8; i++) game.update(1 / 60);
    window.__SHOT_READY = true;
  };
  setup();
}
