// Economy: money in, money out. Kill, round win, uplink and loss streaks all pay,
// and the buy menu spends it. Every price matches weapons.js exactly, so the HUD
// never shows a number the shop cannot honor.
import { WEAPONS, GADGETS, ARMOR } from './weapons.js';

export const REWARDS = {
  kill: 300,
  roundWin: 3000,
  roundLoss: 1900,
  lossStreakBonus: 500,
  uplink: 300,
  start: 800,
};

export function createEconomy() {
  const state = {
    money: REWARDS.start,
    lossStreak: 0,
    kills: 0,
    roundWins: 0,
  };

  function canAfford(price) { return state.money >= price; }

  return {
    state,
    resetMatch() {
      state.money = REWARDS.start;
      state.lossStreak = 0;
      state.kills = 0;
      state.roundWins = 0;
    },
    addKill() {
      state.money += REWARDS.kill;
      state.kills += 1;
    },
    addUplink() { state.money += REWARDS.uplink; },
    endRound(won) {
      if (won) {
        state.money += REWARDS.roundWin;
        state.lossStreak = 0;
        state.roundWins += 1;
      } else {
        state.lossStreak += 1;
        state.money += REWARDS.roundLoss + Math.min(2, state.lossStreak - 1) * REWARDS.lossStreakBonus;
      }
    },
    buy(id) {
      // Returns 'bought', 'owned', or 'poor'. The caller applies the item.
      // Ownership itself is checked by the caller (main.js), which knows the
      // weapons state; this function only guards the wallet.
      if (WEAPONS[id]) {
        if (!canAfford(WEAPONS[id].price)) return 'poor';
        state.money -= WEAPONS[id].price;
        return 'bought';
      }
      if (GADGETS[id]) {
        if (!canAfford(GADGETS[id].price)) return 'poor';
        state.money -= GADGETS[id].price;
        return 'bought';
      }
      if (id === ARMOR.id) {
        if (!canAfford(ARMOR.price)) return 'poor';
        state.money -= ARMOR.price;
        return 'bought';
      }
      return 'poor';
    },
    // Shop rows for the HUD, in menu order, with live affordability.
    shopRows(weaponsState) {
      const rows = [];
      for (const id of ['smg', 'rifle', 'dmr']) {
        const w = WEAPONS[id];
        rows.push({
          id, key: { smg: '1', rifle: '2', dmr: '3' }[id],
          name: w.name, kind: w.kind, price: w.price, desc: w.desc,
          owned: !!weaponsState.owned[id],
          afford: state.money >= w.price,
        });
      }
      rows.push({
        id: ARMOR.id, key: '4', name: ARMOR.name, kind: 'Armor', price: ARMOR.price,
        desc: ARMOR.desc, owned: weaponsState.armor > 0, afford: state.money >= ARMOR.price,
      });
      for (const id of ['smoke', 'flash', 'decoy']) {
        const g = GADGETS[id];
        rows.push({
          id, key: { smoke: '5', flash: '6', decoy: '7' }[id],
          name: g.name, kind: 'Gadget', price: g.price, desc: g.desc,
          owned: false, count: weaponsState.gadgets[id], afford: state.money >= g.price,
        });
      }
      return rows;
    },
  };
}
