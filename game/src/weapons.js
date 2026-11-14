// Weapons and gadgets: four guns with distinct roles and three throwables. The
// defs own the numbers (damage, spread, recoil, price); main.js owns the ray and
// the damage, effects.js owns the flash and the tracer. Names are original.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Tide', kind: 'Sidearm', price: 0,
    damage: 30, headMul: 3, mag: 12, reserve: 36, auto: false,
    gap: 0.16, reload: 1.2, spreadStill: 0.004, spreadMove: 0.03, recoil: 0.008,
    range: 60, desc: 'Reliable sidearm. Free, always in your pocket.',
  },
  smg: {
    id: 'smg', name: 'Kestrel-9', kind: 'SMG', price: 1500,
    damage: 22, headMul: 3, mag: 30, reserve: 120, auto: true,
    gap: 0.075, reload: 1.7, spreadStill: 0.006, spreadMove: 0.045, recoil: 0.006,
    range: 45, desc: 'Bullet hose for close lanes. Fast, wild on the move.',
  },
  rifle: {
    id: 'rifle', name: 'Tempest AR', kind: 'Rifle', price: 2700,
    damage: 34, headMul: 3, mag: 30, reserve: 90, auto: true,
    gap: 0.096, reload: 1.9, spreadStill: 0.0025, spreadMove: 0.028, recoil: 0.011,
    range: 80, desc: 'The all-rounder. Stopping to aim pays.',
  },
  dmr: {
    id: 'dmr', name: 'Longshot', kind: 'Marksman', price: 4200,
    damage: 78, headMul: 2.6, mag: 10, reserve: 30, auto: false,
    gap: 0.55, reload: 2.6, spreadStill: 0.001, spreadMove: 0.015, recoil: 0.03,
    range: 90, desc: 'One shot, one down. Slow, heavy, surgical.',
  },
};

export const GADGETS = {
  smoke: { id: 'smoke', name: 'Mist Orb', price: 400, key: 'Digit5', desc: 'Thick neon smoke. Blocks sight for 12s.' },
  flash: { id: 'flash', name: 'Strobe Orb', price: 300, key: 'Digit6', desc: 'Blinds anyone looking at it.' },
  decoy: { id: 'decoy', name: 'Echo Drone', price: 500, key: 'Digit7', desc: 'Fake gunfire and a false blip. Draws fire for 8s.' },
};

export const ARMOR = { id: 'armor', name: 'Harbor Plating', price: 650, desc: 'Absorbs half of incoming damage.' };

export function createWeapons(camera, audio) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.35 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const teal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal), emissiveIntensity: 1.6, roughness: 0.4 });
  const pink = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magenta), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 1.6, roughness: 0.4 });

  function buildModel(kind) {
    const model = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      model.add(m);
      return m;
    };
    if (kind === 'sidearm') {
      add(new THREE.BoxGeometry(0.05, 0.09, 0.2), light, 0, 0, -0.1);
      add(new THREE.BoxGeometry(0.045, 0.12, 0.06), dark, 0, -0.09, 0.02);
      add(new THREE.BoxGeometry(0.02, 0.02, 0.06), teal, 0, 0.05, -0.18);
    } else if (kind === 'smg') {
      add(new THREE.BoxGeometry(0.08, 0.09, 0.34), dark, 0, 0, -0.08);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.3), light, 0, 0.02, -0.36);
      add(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark, 0, -0.1, 0.02);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.1), teal, 0, 0.055, -0.2);
    } else if (kind === 'dmr') {
      add(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark, 0, 0, -0.14);
      add(new THREE.BoxGeometry(0.035, 0.035, 0.45), light, 0, 0.03, -0.55);
      add(new THREE.BoxGeometry(0.09, 0.05, 0.16), dark, 0, 0.06, -0.28);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.05), pink, 0, 0.03, -0.78);
      add(new THREE.BoxGeometry(0.06, 0.08, 0.2), dark, 0, -0.02, 0.24);
    } else {
      add(new THREE.BoxGeometry(0.09, 0.1, 0.44), light, 0, 0, -0.1);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.42), dark, 0, 0.025, -0.5);
      add(new THREE.BoxGeometry(0.075, 0.08, 0.22), dark, 0, -0.02, 0.28);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), teal, 0, 0.055, -0.3);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {
    sidearm: buildModel('sidearm'),
    smg: buildModel('smg'),
    rifle: buildModel('rifle'),
    dmr: buildModel('dmr'),
  };

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'sidearm',
    mag: { sidearm: WEAPONS.sidearm.mag, smg: 0, rifle: 0, dmr: 0 },
    reserve: { sidearm: WEAPONS.sidearm.reserve, smg: 0, rifle: 0, dmr: 0 },
    owned: { sidearm: true, smg: false, rifle: false, dmr: false },
    gadgets: { smoke: 0, flash: 0, decoy: 0 },
    armor: 0,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, triggerHeld: false,
  };
  models.sidearm.visible = true;

  function def() { return WEAPONS[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag[state.current];
        const take = Math.min(need, state.reserve[state.current]);
        state.mag[state.current] += take;
        state.reserve[state.current] -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    gadgets: GADGETS,
    currentDef: def,
    step,
    equip(id) {
      if (!state.owned[id]) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.15);
      return true;
    },
    buyWeapon(id) {
      if (state.owned[id]) return 'owned';
      state.owned[id] = true;
      state.mag[id] = WEAPONS[id].mag;
      state.reserve[id] = WEAPONS[id].reserve;
      this.equip(id);
      return 'bought';
    },
    buyGadget(id) { state.gadgets[id] += 1; return 'bought'; },
    buyArmor() { state.armor = 100; return 'bought'; },
    takeGadget(id) {
      if (state.gadgets[id] <= 0) return false;
      state.gadgets[id] -= 1;
      return true;
    },
    ready() {
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
      audio.shot(state.current);
    },
    takeRound() {
      if (state.mag[state.current] <= 0) { audio.dryFire(); return false; }
      state.mag[state.current] -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag[state.current] === d.mag || state.reserve[state.current] === 0) return;
      state.reloadLeft = d.reload;
      audio.reload();
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    refillRound() {
      // Between rounds: top up reserves, keep owned guns.
      for (const id of Object.keys(WEAPONS)) {
        if (!state.owned[id]) continue;
        state.reserve[id] = Math.max(state.reserve[id], Math.floor(WEAPONS[id].reserve * 0.5));
      }
      state.mag[state.current] = def().mag;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetMatch() {
      state.owned = { sidearm: true, smg: false, rifle: false, dmr: false };
      state.gadgets = { smoke: 0, flash: 0, decoy: 0 };
      state.armor = 0;
      state.mag = { sidearm: WEAPONS.sidearm.mag, smg: 0, rifle: 0, dmr: 0 };
      state.reserve = { sidearm: WEAPONS.sidearm.reserve, smg: 0, rifle: 0, dmr: 0 };
      this.equip('sidearm');
      state.mag.sidearm = WEAPONS.sidearm.mag;
    },
  };
}
