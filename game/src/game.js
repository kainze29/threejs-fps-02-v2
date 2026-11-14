// NEON TIDE game core: match and round state, economy, shooting, damage, the
// data-core uplink objective, gadgets, tracers and the test hooks.
// Fresh code written for threejs-fps-02.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { WEAPONS, ARMOR, GADGETS, BUY_MENU } from './weapons.js';
import { Bot, BOT_STYLES, BOT_NAMES } from './bots.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { MATCH, TEAMS } from './palette.js';

const PLAYER_NAME = 'You';

export class Game {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = buildWorld(this.scene);
    this.hud = new Hud(container);
    this.hud.setMap(this.world);
    this.sfx = new Sfx();
    this.raycaster = new THREE.Raycaster();
    this.time = 0;
    this.phase = 'menu';
    this.round = 1;
    this.score = { tide: 0, warden: 0 };
    this.attackTeam = 'tide';
    this.playerTeam = 'tide';
    this.timer = 0;
    this.lossStreak = 0;
    this.surge = false;
    this.bots = [];
    this.smokes = [];
    this.flashes = [];
    this.decoys = [];
    this.shots = [];
    this.tracers = [];
    this.killfeed = [];
    this.menuTime = 0;
    this.player = this._freshPlayer();
    this.core = { carrier: null, pos: null, dropped: false };
    this.channel = 0;
    this.channelBot = null;
    this.channelBotProgress = 0;
    this.lastTickAt = 0;
    this.testFreezeBots = false;
    this._wasAliveLastRound = true;
    this._matchWinner = null;
    this._buildViewmodel();
    this._buildTracers();
    this._spawnBots();
    this._placeActors();
    this.hud.showMenu(() => this.startMatch());
    window.addEventListener('resize', () => this._resize());
  }

  _freshPlayer() {
    return {
      pos: new THREE.Vector3(0, 0, 12.5),
      yaw: Math.PI,
      pitch: 0,
      velY: 0,
      grounded: true,
      hp: 100,
      armor: 0,
      money: MATCH.startMoney,
      alive: true,
      team: 'tide',
      weapons: {
        pistol: { id: 'p9', ammo: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve },
        primary: null,
      },
      current: 'pistol',
      gadgets: { smoke: 0, flash: 0, decoy: 0 },
      speedNow: 0,
      crouching: false,
      reloading: false,
      reloadEnd: 0,
      lastShotAt: -10,
      keys: new Set(),
      mouseDown: false,
      channeling: false,
    };
  }

  _buildViewmodel() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.35, metalness: 0.8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x19e3c2, emissive: 0x19e3c2, emissiveIntensity: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.4);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.4), glow);
    strip.position.set(0, 0.07, -0.1);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), glow);
    sight.position.set(0, 0.09, -0.28);
    g.add(body, barrel, strip, sight);
    g.position.set(0.3, -0.26, -0.55);
    this.camera.add(g);
    this.viewmodel = g;
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0.3, -0.22, -0.95);
    flash.visible = false;
    this.camera.add(flash);
    this.muzzleFlash = flash;
  }

  _buildTracers() {
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, until: 0 });
    }
  }

  _spawnBots() {
    const styles = ['rusher', 'holder', 'flanker', 'support', 'marksman'];
    for (let i = 0; i < 9; i++) {
      const team = i < 4 ? 'tide' : 'warden';
      const styleKey = styles[i % styles.length];
      const bot = new Bot(this.scene, {
        name: BOT_NAMES[i],
        team,
        style: BOT_STYLES[styleKey],
        pos: { x: 0, z: 0 },
        world: this.world,
      });
      this.bots.push(bot);
    }
  }

  _placeActors() {
    // Role-based spawns: attackers south, defenders north.
    const attackSpawns = Array.from({ length: 5 }, (_, i) => ({ x: -8 + i * 4, z: 12.5 }));
    const defendSpawns = Array.from({ length: 5 }, (_, i) => ({ x: -8 + i * 4, z: -9.0 }));
    const atk = this.attackTeam;
    const fieldBots = this.bots.filter((b) => !b.isDecoy);
    const p = this.player;
    // Spawn slots are per role (5 each). The player occupies slot 0 of their
    // own role's list; bots take the remaining slots of theirs.
    const playerAttacks = this.playerTeam === atk;
    const pSpawn = playerAttacks ? attackSpawns[0] : defendSpawns[0];
    p.pos.set(pSpawn.x, 0, pSpawn.z);
    p.yaw = playerAttacks ? 0 : Math.PI;
    p.pitch = 0;
    p.velY = 0;
    let ai = playerAttacks ? 1 : 0;
    let di = playerAttacks ? 0 : 1;
    for (const b of fieldBots) {
      if (b.team === atk) {
        const s = attackSpawns[ai++];
        b.reset(s.x, s.z, b.team, this.time);
        b.role = 'attack';
        b.yaw = Math.PI;
      } else {
        const s = defendSpawns[di++];
        b.reset(s.x, s.z, b.team, this.time);
        b.role = 'defend';
        b.yaw = 0;
      }
      b.group.rotation.y = b.yaw;
      b.group.position.copy(b.pos);
    }
    // Core carrier: the player carries when Tidebreakers attack, else a Warden bot.
    if (atk === 'tide') {
      this.core = { carrier: 'player', pos: null, dropped: false };
    } else {
      const carriers = this.bots.filter((b) => b.team === 'warden' && !b.isDecoy);
      const pick = carriers[(Math.random() * carriers.length) | 0];
      this.core = { carrier: pick, pos: null, dropped: false };
    }
    this.channel = 0;
    this.channelBot = null;
    this.channelBotProgress = 0;
  }

  // ---- match flow ----
  startMatch() {
    this.sfx.ensure();
    this.sfx.startRain();
    this.score = { tide: 0, warden: 0 };
    this.round = 1;
    this.lossStreak = 0;
    this.player.money = MATCH.startMoney;
    this.player.weapons.primary = null;
    this.player.weapons.pistol = { id: 'p9', ammo: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
    this.player.current = 'pistol';
    this.player.gadgets = { smoke: 0, flash: 0, decoy: 0 };
    this.player.armor = 0;
    this.hud.hideMenu();
    this._startRound();
  }

  _startRound() {
    this.attackTeam = this.round <= MATCH.swapAfterRound ? 'tide' : 'warden';
    this.playerTeam = 'tide';
    this.phase = 'buy';
    this.timer = MATCH.buySeconds;
    this.surge = MATCH.surgeRounds.includes(this.round);
    this.player.hp = 100;
    this.player.alive = true;
    this.player.reloading = false;
    if (this.player.weapons.primary && !this._wasAliveLastRound) {
      this.player.weapons.primary = null;
      this.player.current = 'pistol';
      this.player.armor = 0;
    }
    this._wasAliveLastRound = true;
    this._clearFieldEffects();
    this._placeActors();
    const side = this.attackTeam === 'tide' ? 'ATTACK' : 'DEFEND';
    const swapped = this.round === MATCH.swapAfterRound + 1 ? ' — SIDES SWAPPED' : '';
    this.hud.bannerShow(
      'ROUND ' + this.round + ' — ' + side + swapped,
      this.surge ? 'TIDE SURGE: low gravity, +25% speed' : (this.attackTeam === 'tide' ? 'Carry the core to the uplink' : 'Hold the uplink. Do not let them channel.'),
      this.attackTeam === 'tide' ? '#19e3c2' : '#ff2e88',
      3000,
    );
    if (this.surge) this.sfx.surge();
    this._refreshBuyMenu();
  }

  _clearFieldEffects() {
    for (const s of this.smokes) this.scene.remove(s.mesh);
    for (const d of this.decoys) {
      this.scene.remove(d.bot.group);
      const i = this.bots.indexOf(d.bot);
      if (i >= 0) this.bots.splice(i, 1);
    }
    this.smokes = [];
    this.decoys = [];
    this.flashes = [];
  }

  deploy() {
    if (this.phase !== 'buy') return;
    this.phase = 'live';
    this.timer = MATCH.roundSeconds;
    this.hud.hideBuy();
    this.sfx.deploy();
  }

  _refreshBuyMenu() {
    const items = BUY_MENU.map((m) => {
      const def = m.kind === 'weapon' ? WEAPONS[m.id] : m.kind === 'armor' ? ARMOR : GADGETS[m.id];
      let owned = '';
      if (m.kind === 'weapon' && this.player.weapons.primary && this.player.weapons.primary.id === m.id) owned = 'OWNED';
      if (m.kind === 'armor' && this.player.armor > 0) owned = 'OWNED';
      if (m.kind === 'gadget' && this.player.gadgets[m.id] > 0) owned = 'x' + this.player.gadgets[m.id];
      return { ...m, name: def.name, price: def.price, owned };
    });
    this.hud.showBuy(items, this.player.money,
      (it) => this.buyItem(it.kind, it.id),
      () => this.deploy());
  }

  buyItem(kind, id) {
    if (this.phase !== 'buy') return { ok: false, reason: 'not-buy-phase' };
    const def = kind === 'weapon' ? WEAPONS[id] : kind === 'armor' ? ARMOR : GADGETS[id];
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (this.player.money < def.price) {
      this.sfx.deny();
      return { ok: false, reason: 'cant-afford' };
    }
    if (kind === 'armor' && this.player.armor >= 100) return { ok: false, reason: 'armor-full' };
    if (kind === 'gadget' && this.player.gadgets[id] >= 2) return { ok: false, reason: 'gadget-max' };
    this.player.money -= def.price;
    if (kind === 'weapon') {
      this.player.weapons.primary = { id, ammo: def.mag, reserve: def.reserve };
      this.player.current = 'primary';
    } else if (kind === 'armor') {
      this.player.armor = 100;
    } else {
      this.player.gadgets[id]++;
    }
    this.sfx.buy();
    this._refreshBuyMenu();
    return { ok: true };
  }

  // ---- combat ----
  _currentWeapon() {
    const w = this.player.weapons[this.player.current];
    return w ? { ...WEAPONS[w.id], state: w } : null;
  }

  shoot() {
    const p = this.player;
    if (this.phase !== 'live' || !p.alive || p.reloading) return false;
    const w = this._currentWeapon();
    if (!w) return false;
    const now = this.time;
    if (now - p.lastShotAt < w.fireMs / 1000) return false;
    if (w.state.ammo <= 0) {
      this.sfx.dryClick();
      this.reload();
      return false;
    }
    p.lastShotAt = now;
    w.state.ammo--;
    const spread = w.spread + p.speedNow * 0.004 + (p.grounded ? 0 : 0.03);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, (Math.random() - 0.5) * 2 * spread);
    dir.addScaledVector(up, (Math.random() - 0.5) * 2 * spread);
    dir.normalize();
    const origin = this.camera.position.clone();
    this.raycaster.set(origin, dir);
    this.raycaster.far = w.range;
    const botMeshes = [];
    for (const b of this.bots) {
      if (b.alive && b.team !== this.playerTeam && !b.isDecoy) botMeshes.push(...b.hitMeshes);
    }
    const hits = this.raycaster.intersectObjects([...botMeshes, ...this.world.occluders], false);
    let end = origin.clone().addScaledVector(dir, w.range);
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      if (h.object.userData.bot) {
        const bot = h.object.userData.bot;
        const head = h.object.userData.part === 'head';
        const falloff = Math.max(0.55, 1 - h.distance / (w.range * 1.6));
        const dmg = Math.max(1, Math.round(w.damage * (head ? w.headMult : 1) * falloff));
        this.damageBot(bot, dmg, PLAYER_NAME, head ? 'head' : 'body');
        this.hud.hitmarkShow(false);
        this.sfx.hit();
      }
    }
    this._fireTracer(origin, end, w.tracer);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.material.rotation = Math.random() * Math.PI;
    setTimeout(() => { this.muzzleFlash.visible = false; }, 45);
    p.pitch = Math.min(1.2, p.pitch + w.kick);
    this.sfx.shot(w.sound);
    this.shots.push({ x: p.pos.x, z: p.pos.z, time: now });
    return true;
  }

  reload() {
    const p = this.player;
    const w = this._currentWeapon();
    if (!w || p.reloading || w.state.ammo >= WEAPONS[w.id].mag || w.state.reserve <= 0) return false;
    p.reloading = true;
    p.reloadEnd = this.time + WEAPONS[w.id].reloadMs / 1000;
    this.sfx.reload();
    return true;
  }

  _finishReload() {
    const p = this.player;
    const w = this._currentWeapon();
    if (!w) return;
    const def = WEAPONS[w.id];
    const need = def.mag - w.state.ammo;
    const take = Math.min(need, w.state.reserve);
    w.state.ammo += take;
    w.state.reserve -= take;
    p.reloading = false;
  }

  switchWeapon() {
    const p = this.player;
    if (!p.weapons.primary) return;
    p.current = p.current === 'primary' ? 'pistol' : 'primary';
    p.reloading = false;
    this.sfx.deploy();
  }

  damagePlayer(amount, fromName) {
    const p = this.player;
    if (this.testGod) return;
    if (!p.alive || this.phase !== 'live') return;
    let hpDmg = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.round(amount * ARMOR.absorb));
      p.armor -= absorbed;
      hpDmg = amount - absorbed;
    }
    p.hp -= hpDmg;
    this.hud.damageFlash(Math.min(0.85, 0.25 + hpDmg / 90));
    this.sfx.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this._wasAliveLastRound = false;
      this._dropCore();
      this.killfeedAdd(fromName + ' ▸ ' + PLAYER_NAME, '#ff5d5d');
      this.hud.bannerShow('YOU ARE DOWN', 'Your team fights on without you', '#ff5d5d', 2200);
      this._checkRoundEnd();
    }
  }

  damageBot(bot, amount, fromName, part) {
    if (!bot.alive) return;
    bot.hp -= amount;
    bot.lastDamageFrom = fromName;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.deadAt = this.time;
      bot.die();
      const killerIsPlayer = fromName === PLAYER_NAME;
      this.killfeedAdd(fromName + ' ▸ ' + bot.name, killerIsPlayer ? '#19e3c2' : '#c8d6e2');
      if (killerIsPlayer) {
        this.player.money += MATCH.killReward;
        this.hud.hitmarkShow(true);
        this.sfx.kill();
      }
      if (this.core.carrier === bot) this._dropCore();
      this._checkRoundEnd();
    }
  }

  killfeedAdd(text, color) {
    this.killfeed.push(text);
    this.hud.killfeedAdd(text, color);
  }

  _dropCore() {
    const old = this.core.carrier;
    if (old && old !== 'player') {
      old.holdAtUplink = false;
      this.core = { carrier: null, pos: old.pos.clone(), dropped: true };
    } else if (old === 'player') {
      this.core = { carrier: null, pos: this.player.pos.clone(), dropped: true };
    }
    this.channel = 0;
    this.channelBot = null;
    this.channelBotProgress = 0;
  }

  _checkRoundEnd() {
    if (this.phase !== 'live') return;
    const atkAlive = this._teamAlive(this.attackTeam);
    const defAlive = this._teamAlive(this.attackTeam === 'tide' ? 'warden' : 'tide');
    if (atkAlive === 0) this._endRound(this.attackTeam === 'tide' ? 'warden' : 'tide', 'eliminated');
    else if (defAlive === 0) this._endRound(this.attackTeam, 'eliminated');
  }

  _teamAlive(team) {
    let n = 0;
    if (team === 'tide' && this.player.alive) n++;
    for (const b of this.bots) if (b.team === team && b.alive) n++;
    return n;
  }

  _endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    this.timer = MATCH.roundEndSeconds;
    this.score[winner]++;
    const playerWon = winner === this.playerTeam;
    if (winner === this.attackTeam && reason === 'uplink' && this.attackTeam === 'tide') {
      this.player.money += MATCH.uplinkReward;
    }
    if (playerWon) {
      this.player.money += MATCH.winReward;
      this.lossStreak = 0;
      this.sfx.win();
    } else {
      this.lossStreak++;
      const bonus = Math.min(this.lossStreak * MATCH.lossStreakStep, MATCH.lossStreakCap);
      this.player.money += MATCH.lossReward + bonus;
      this.sfx.lose();
    }
    const reasonText = reason === 'uplink' ? 'UPLINK COMPLETE' : reason === 'time' ? 'TIME EXPIRED' : 'TEAM ELIMINATED';
    this.hud.bannerShow(
      (winner === 'tide' ? 'TIDEBREAKERS' : 'WARDENS') + ' TAKE ROUND ' + this.round,
      reasonText + '  ·  ' + (playerWon ? '+$' + MATCH.winReward : '+$' + (MATCH.lossReward + Math.min(this.lossStreak * MATCH.lossStreakStep, MATCH.lossStreakCap))),
      winner === 'tide' ? '#19e3c2' : '#ff2e88',
      3800,
    );
    this.hud.hideBuy();
    this.channel = 0;
    this.channelBotProgress = 0;
    this.channelBot = null;
    this._matchWinner = this.score.tide >= MATCH.winRounds ? 'tide' : this.score.warden >= MATCH.winRounds ? 'warden' : null;
  }

  _nextAfterRoundEnd() {
    if (this._matchWinner) {
      this.phase = 'matchEnd';
      const w = this._matchWinner;
      this.hud.bannerShow(
        (w === 'tide' ? 'TIDEBREAKERS' : 'WARDENS') + ' WIN THE HARBOR',
        'Final score ' + this.score.tide + ' — ' + this.score.warden,
        w === 'tide' ? '#19e3c2' : '#ff2e88',
        8000,
      );
      if (w === 'tide') this.sfx.win(); else this.sfx.lose();
      return;
    }
    this.round++;
    if (this.round > MATCH.maxRounds) {
      this.phase = 'matchEnd';
      return;
    }
    this._startRound();
  }

  // ---- gadgets ----
  useGadget(kind) {
    const p = this.player;
    if (this.phase !== 'live' || !p.alive) return { ok: false, reason: 'not-live' };
    const want = kind || (p.gadgets.smoke > 0 ? 'smoke' : p.gadgets.flash > 0 ? 'flash' : p.gadgets.decoy > 0 ? 'decoy' : null);
    if (!want || p.gadgets[want] <= 0) return { ok: false, reason: 'none-owned' };
    p.gadgets[want]--;
    if (want === 'smoke') this._throwSmoke();
    else if (want === 'flash') this._throwFlash();
    else this._launchDecoy();
    return { ok: true, kind: want };
  }

  _throwSmoke() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const at = this.player.pos.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 6);
    at.y = 1.1;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.1, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.smokes.push({ mesh, x: at.x, y: 1.1, z: at.z, until: this.time + 12 });
    this.sfx.botShot(2);
  }

  _throwFlash() {
    const p = this.player;
    let blinded = 0;
    for (const b of this.bots) {
      if (!b.alive || b.team === p.team) continue;
      const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 16) continue;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if ((dx * fx + dz * fz) / Math.max(dist, 0.001) < -0.1) continue;
      if (!this._losClear(b.eyePos, new THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z))) continue;
      b.blindedUntil = this.time + 2.5;
      blinded++;
    }
    this.hud.flashWhite(0.85);
    this.sfx.shot('dmr');
    return blinded;
  }

  _launchDecoy() {
    const bot = new Bot(this.scene, {
      name: 'Echo',
      team: this.playerTeam,
      style: BOT_STYLES.flanker,
      pos: { x: this.player.pos.x, z: this.player.pos.z },
      world: this.world,
      decoy: true,
    });
    bot.role = this.attackTeam === this.playerTeam ? 'attack' : 'defend';
    this.decoys.push({ bot, until: this.time + 20 });
    this.bots.push(bot);
  }

  _inSmoke(pos) {
    for (const s of this.smokes) {
      const dx = pos.x - s.x, dy = pos.y - s.y, dz = pos.z - s.z;
      if (dx * dx + dy * dy + dz * dz < 3.2 * 3.2) return true;
    }
    return false;
  }

  // True when the segment a-b passes through any smoke cloud.
  _smokeBlocks(a, b) {
    for (const s of this.smokes) {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const lenSq = abx * abx + aby * aby + abz * abz;
      if (lenSq < 0.0001) continue;
      let t = ((s.x - a.x) * abx + (s.y - a.y) * aby + (s.z - a.z) * abz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
      const d2 = (cx - s.x) ** 2 + (cy - s.y) ** 2 + (cz - s.z) ** 2;
      if (d2 < 3.2 * 3.2) return true;
    }
    return false;
  }

  _losClear(a, b) {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    this.raycaster.set(a, dir);
    this.raycaster.far = dist;
    const hits = this.raycaster.intersectObjects(this.world.occluders, false);
    return hits.length === 0 || hits[0].distance > dist - 0.15;
  }

  _fireTracer(from, to, color) {
    const t = this.tracers.find((x) => this.time >= x.until) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.until = this.time + 0.07;
  }

  // ---- per-frame update ----
  update(dt) {
    this.time += dt;
    this.world.update(dt);
    // Tracers fade.
    for (const t of this.tracers) {
      if (this.time >= t.until) t.line.material.opacity = 0;
    }
    // Smoke expiry.
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      if (this.time >= this.smokes[i].until) {
        this.scene.remove(this.smokes[i].mesh);
        this.smokes.splice(i, 1);
      }
    }
    // Decoy expiry.
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      if (this.time >= this.decoys[i].until || !this.decoys[i].bot.alive) {
        const d = this.decoys[i];
        this.scene.remove(d.bot.group);
        this.bots.splice(this.bots.indexOf(d.bot), 1);
        this.decoys.splice(i, 1);
      }
    }
    // Prune old shot events.
    while (this.shots.length && this.time - this.shots[0].time > 2) this.shots.shift();

    if (this.phase === 'menu') {
      this.menuTime += dt;
      const a = this.menuTime * 0.06;
      this.camera.position.set(Math.sin(a) * 26, 11, Math.cos(a) * 22);
      this.camera.lookAt(0, 1, -2);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'buy' || this.phase === 'live' || this.phase === 'roundEnd') {
      this.timer -= dt;
      if (this.phase === 'buy' && this.timer <= 0) this.deploy();
      else if (this.phase === 'live' && this.timer <= 0) this._endRound(this.attackTeam === 'tide' ? 'warden' : 'tide', 'time');
      else if (this.phase === 'roundEnd' && this.timer <= 0) this._nextAfterRoundEnd();
    }

    if (this.phase === 'buy' || this.phase === 'live') {
      this._updatePlayer(dt);
      if (this.phase === 'live') {
        this._updateBots(dt);
        this._updateUplink(dt);
        if (this.player.mouseDown) this.shoot();
        if (this.player.reloading && this.time >= this.player.reloadEnd) this._finishReload();
      }
    }

    // Camera follows the player.
    const p = this.player;
    this.camera.position.set(p.pos.x, p.pos.y + 1.7, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    this.viewmodel.visible = p.alive && (this.phase === 'live' || this.phase === 'buy');
    this._updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    const k = p.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW')) fz += 1;
    if (k.has('KeyS')) fz -= 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const speed = MATCH.playerSpeed * (this.surge ? MATCH.surgeSpeedMult : 1);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const mx = (fx * cos - fz * sin) * speed;
    const mz = (-fx * sin - fz * cos) * speed;
    p.speedNow = Math.hypot(mx, mz);
    // Move with AABB collision, per axis.
    const nx = p.pos.x + mx * dt;
    const nz = p.pos.z + mz * dt;
    if (!this._hitsCollider(nx, p.pos.z, 0.4)) p.pos.x = nx;
    if (!this._hitsCollider(p.pos.x, nz, 0.4)) p.pos.z = nz;
    p.pos.x = Math.max(-19.6, Math.min(19.6, p.pos.x));
    p.pos.z = Math.max(-14.6, Math.min(14.6, p.pos.z));
    // Jump and gravity.
    const g = MATCH.gravity * (this.surge ? MATCH.surgeGravityMult : 1);
    if (k.has('Space') && p.grounded) {
      p.velY = MATCH.jumpSpeed * (this.surge ? 1.35 : 1);
      p.grounded = false;
    }
    if (!p.grounded) {
      p.velY -= g * dt;
      p.pos.y += p.velY * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.velY = 0; p.grounded = true; }
    }
    // Core pickup.
    if (this.core.dropped && this.core.pos) {
      const d = Math.hypot(this.core.pos.x - p.pos.x, this.core.pos.z - p.pos.z);
      if (d < 1.4 && p.team === this.attackTeam) {
        this.core = { carrier: 'player', pos: null, dropped: false };
        this.killfeedAdd(PLAYER_NAME + ' picked up the core', '#ffd166');
      }
    }
  }

  _hitsCollider(x, z, r) {
    for (const c of this.world.colliders) {
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    return false;
  }

  _updateBots(dt) {
    // Test-only freeze: bots stand still so mechanic checks are deterministic.
    // Real play never sets this flag.
    if (this.testFreezeBots) return;
    const ctx = {
      time: this.time,
      player: {
        alive: this.player.alive,
        team: this.playerTeam,
        pos: this.player.pos,
        speedNow: this.player.speedNow,
        crouching: this.player.crouching,
      },
      bots: this.bots,
      losClear: (a, b) => this._losClear(a, b),
      inSmoke: (pos) => this._inSmoke(pos),
      smokeBlocks: (a, b) => this._smokeBlocks(a, b),
      shots: this.shots,
      damagePlayer: (amt, from) => this.damagePlayer(amt, from),
      damageBot: (bot, amt, from, part) => this.damageBot(bot, amt, from, part),
      onBotShot: (bot, targetEye, hit) => {
        const from = bot.eyePos.clone();
        from.y -= 0.4;
        this._fireTracer(from, targetEye, 0xff9ecf);
        this.sfx.botShot(Math.hypot(targetEye.x - this.player.pos.x, targetEye.z - this.player.pos.z));
        this.shots.push({ x: bot.pos.x, z: bot.pos.z, time: this.time });
      },
      onDecoyNoise: (pos) => {
        this.shots.push({ x: pos.x, z: pos.z, time: this.time });
      },
    };
    for (const b of this.bots) b.update(dt, ctx);
    // Attacker bots pick up a dropped core; carrier bot channels at the uplink.
    for (const b of this.bots) {
      if (!b.alive || b.isDecoy) continue;
      if (this.core.dropped && this.core.pos && b.team === this.attackTeam) {
        const d = Math.hypot(this.core.pos.x - b.pos.x, this.core.pos.z - b.pos.z);
        if (d < 1.4) {
          this.core = { carrier: b, pos: null, dropped: false };
          this.killfeedAdd(b.name + ' picked up the core', '#ffd166');
        } else if (d < 9 && !b.target) {
          b.setPathTo(this.core.pos.x, this.core.pos.z);
        }
      }
    }
  }

  _updateUplink(dt) {
    const uplink = this.world.uplink;
    const p = this.player;
    const carrierIsPlayer = this.core.carrier === 'player';
    const carrierBot = this.core.carrier && this.core.carrier !== 'player' ? this.core.carrier : null;
    if (carrierIsPlayer && p.alive) {
      const d = Math.hypot(uplink.x - p.pos.x, uplink.z - p.pos.z);
      const want = d <= MATCH.uplinkRadius && p.keys.has('KeyE');
      if (want) {
        this.channel += dt / MATCH.uplinkChannelSeconds;
        if (this.time - this.lastTickAt > 0.5) {
          this.lastTickAt = this.time;
          this.sfx.uplinkTick();
        }
        if (this.channel >= 1) {
          this.channel = 0;
          this.sfx.uplinkDone();
          this._endRound(this.attackTeam, 'uplink');
        }
      } else {
        this.channel = Math.max(0, this.channel - dt * 2);
      }
    } else if (carrierBot && carrierBot.alive) {
      const d = Math.hypot(uplink.x - carrierBot.pos.x, uplink.z - carrierBot.pos.z);
      if (d <= MATCH.uplinkRadius + 0.4) {
        this.channelBot = carrierBot;
        carrierBot.holdAtUplink = true;
        this.channelBotProgress += dt / MATCH.uplinkChannelSeconds;
        if (this.channelBotProgress >= 1) {
          this.channelBotProgress = 0;
          this.sfx.uplinkDone();
          this._endRound(this.attackTeam, 'uplink');
        }
      } else {
        this.channelBotProgress = Math.max(0, this.channelBotProgress - dt);
        // Steer the carrier toward the uplink.
        if (carrierBot.path.length === 0 || carrierBot.pathIdx >= carrierBot.path.length) {
          carrierBot.setPathTo(uplink.x, uplink.z);
        }
      }
    }
  }

  _updateHud(dt) {
    const p = this.player;
    const w = this._currentWeapon();
    const carrierName = this.core.carrier === 'player' ? PLAYER_NAME
      : this.core.carrier ? this.core.carrier.name : (this.core.dropped ? 'DROPPED' : '—');
    const gadgetText = ['smoke', 'flash', 'decoy']
      .filter((g) => p.gadgets[g] > 0)
      .map((g) => GADGETS[g].name + ' x' + p.gadgets[g] + ' [G]')
      .join('  ');
    const objective = this.attackTeam === 'tide'
      ? (this.core.carrier === 'player' ? 'YOU carry the core — reach the uplink, hold E to channel' : this.core.dropped ? 'Core dropped — pick it up!' : 'Escort the core carrier to the uplink')
      : 'DEFEND the uplink — stop the carrier from channeling';
    this.hud.update({
      hp: p.hp,
      armor: p.armor,
      money: p.money,
      ammo: w ? w.state.ammo : 0,
      reserve: w ? w.state.reserve : 0,
      reloading: p.reloading,
      weaponName: w ? w.name : '—',
      timer: Math.max(0, this.timer),
      round: this.round,
      scoreTide: this.score.tide,
      scoreWarden: this.score.warden,
      playerTeam: this.playerTeam,
      phase: this.phase,
      objective,
      carrier: carrierName,
      surge: this.surge,
      gadgetText,
      spread: this._currentSpread(),
      channel: this.core.carrier === 'player' ? this.channel : this.channelBot ? this.channelBotProgress : 0,
      uplink: this.world.uplink,
      core: this.core.dropped ? this.core.pos : (this.core.carrier === 'player' ? p.pos : this.core.carrier ? this.core.carrier.pos : null),
      bots: this.bots.map((b) => ({ alive: b.alive, x: b.pos.x, z: b.pos.z, team: b.team })),
      px: p.pos.x,
      pz: p.pos.z,
      yaw: p.yaw,
    }, dt);
  }

  _currentSpread() {
    const w = this._currentWeapon();
    if (!w) return 0.01;
    return w.spread + this.player.speedNow * 0.004 + (this.player.grounded ? 0 : 0.03);
  }

  _resize() {
    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 720;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
