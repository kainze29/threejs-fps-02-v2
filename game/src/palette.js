// NEON TIDE palette and match constants. Fresh code written for threejs-fps-02.
export const TEAL = 0x19e3c2;
export const TEAL_CSS = '#19e3c2';
export const MAGENTA = 0xff2e88;
export const MAGENTA_CSS = '#ff2e88';
export const INK = 0x0a1420;
export const TEAMS = {
  tide: { id: 'tide', name: 'Tidebreakers', color: TEAL, css: TEAL_CSS },
  warden: { id: 'warden', name: 'Wardens', color: MAGENTA, css: MAGENTA_CSS },
};
export const MATCH = {
  maxRounds: 9,
  winRounds: 5,
  swapAfterRound: 4,
  buySeconds: 15,
  roundSeconds: 100,
  roundEndSeconds: 4,
  surgeRounds: [3, 6, 9],
  startMoney: 800,
  killReward: 300,
  winReward: 3000,
  lossReward: 1900,
  lossStreakStep: 200,
  lossStreakCap: 1000,
  uplinkReward: 300,
  uplinkChannelSeconds: 3,
  uplinkRadius: 2.6,
  playerSpeed: 5.0,
  surgeSpeedMult: 1.25,
  gravity: 18,
  surgeGravityMult: 0.45,
  jumpSpeed: 7.5,
  eyeHeight: 1.7,
};
export const MAP = {
  halfX: 20,
  halfZ: 15,
  uplink: { x: 0, z: -12.5 },
  attackSpawn: { x: 0, z: 12.5 },
  defendSpawn: { x: 0, z: -9.5 },
};
