// NEON TIDE weapon, armor and gadget definitions. Fresh code written for threejs-fps-02.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Tide', price: 0, damage: 26, headMult: 1.6,
    fireMs: 170, mag: 12, reserve: 36, reloadMs: 1300, spread: 0.011,
    range: 70, auto: false, tracer: 0x9ff5e8, sound: 'pistol', kick: 0.011,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel-9 SMG', price: 1500, damage: 20, headMult: 1.5,
    fireMs: 92, mag: 28, reserve: 84, reloadMs: 1750, spread: 0.021,
    range: 55, auto: true, tracer: 0x7df9ff, sound: 'smg', kick: 0.008,
  },
  tempest: {
    id: 'tempest', name: 'Tempest AR', price: 2700, damage: 31, headMult: 1.5,
    fireMs: 128, mag: 25, reserve: 75, reloadMs: 2100, spread: 0.014,
    range: 80, auto: true, tracer: 0xffd166, sound: 'ar', kick: 0.014,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', price: 4200, damage: 84, headMult: 2.0,
    fireMs: 950, mag: 5, reserve: 15, reloadMs: 2700, spread: 0.002,
    range: 120, auto: false, tracer: 0xff9ecf, sound: 'dmr', kick: 0.03,
  },
};
export const ARMOR = { id: 'armor', name: 'Harbor Plating', price: 650, absorb: 0.5 };
export const GADGETS = {
  smoke: { id: 'smoke', name: 'Mist Orb', price: 400, key: '5' },
  flash: { id: 'flash', name: 'Strobe Orb', price: 300, key: '6' },
  decoy: { id: 'decoy', name: 'Echo Drone', price: 500, key: '7' },
};
// Buy menu order: keys 1-7.
export const BUY_MENU = [
  { key: '1', kind: 'weapon', id: 'kestrel' },
  { key: '2', kind: 'weapon', id: 'tempest' },
  { key: '3', kind: 'weapon', id: 'longshot' },
  { key: '4', kind: 'armor', id: 'armor' },
  { key: '5', kind: 'gadget', id: 'smoke' },
  { key: '6', kind: 'gadget', id: 'flash' },
  { key: '7', kind: 'gadget', id: 'decoy' },
];
