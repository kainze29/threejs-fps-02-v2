// Rounds: the match state machine. First to 5 rounds wins, at most 9 rounds;
// sides swap after round 4. Every 3rd round is a TIDE SURGE round: low gravity,
// faster movement. The data-core is the objective: attackers carry it to the
// uplink ring and channel it, defenders win on elimination or on the timer.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const ROUND_END_SECONDS = 4;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const UPLINK_SECONDS = 3;

export function createRounds(events) {
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 0,
    timer: 0,
    score: { attackers: 0, defenders: 0 },
    playerTeam: 'attackers',
    surge: false,
    uplink: 0,
    coreHolder: null, // 'player' | bot object | null
    coreDropped: null, // { x, z } | null
    lastResult: null, // { winner, reason }
    matchWinner: null,
  };

  function isSurgeRound(n) { return n % 3 === 0; }

  function playerTeamForRound(n) {
    if (n <= 4) return 'attackers';
    if (n <= 8) return 'defenders';
    return 'attackers';
  }

  return {
    state,
    startMatch() {
      state.score = { attackers: 0, defenders: 0 };
      state.round = 0;
      state.matchWinner = null;
      state.lastResult = null;
      this.nextRound();
    },
    nextRound() {
      state.round += 1;
      state.playerTeam = playerTeamForRound(state.round);
      state.surge = isSurgeRound(state.round);
      state.uplink = 0;
      state.coreHolder = null;
      state.coreDropped = null;
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
      events.onBuyStart(state.round, state.playerTeam, state.surge);
    },
    beginRound() {
      state.phase = 'live';
      state.timer = ROUND_SECONDS;
      events.onRoundStart(state.round, state.surge);
    },
    endRound(winner, reason) {
      if (state.phase !== 'live') return;
      state.score[winner] += 1;
      state.lastResult = { winner, reason };
      state.phase = 'roundEnd';
      state.timer = ROUND_END_SECONDS;
      events.onRoundEnd(state.round, winner, reason, { ...state.score });
      if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        state.matchWinner = state.score.attackers > state.score.defenders ? 'attackers'
          : state.score.defenders > state.score.attackers ? 'defenders' : 'draw';
      }
    },
    // Called every frame by main; returns 'matchEnd' once when the match closes.
    step(dt) {
      if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'roundEnd') {
        state.timer -= dt;
        if (state.timer <= 0) {
          if (state.phase === 'buy') this.beginRound();
          else if (state.phase === 'live') {
            // Time up: defenders hold the site.
            this.endRound('defenders', 'time');
          } else if (state.phase === 'roundEnd') {
            if (state.matchWinner) {
              state.phase = 'matchEnd';
              events.onMatchEnd(state.matchWinner, { ...state.score });
              return 'matchEnd';
            }
            this.nextRound();
          }
        }
      }
      return null;
    },
    channelUplink(dt) {
      if (state.phase !== 'live') return false;
      state.uplink = Math.min(1, state.uplink + dt / UPLINK_SECONDS);
      events.onUplinkProgress(state.uplink);
      if (state.uplink >= 1) {
        this.endRound('attackers', 'uplink');
        return true;
      }
      return false;
    },
    decayUplink(dt) {
      if (state.uplink > 0 && state.phase === 'live') {
        state.uplink = Math.max(0, state.uplink - dt * 0.08);
        events.onUplinkProgress(state.uplink);
      }
    },
    dropCore(x, z) {
      state.coreHolder = null;
      state.coreDropped = { x, z };
      events.onCoreDropped(x, z);
    },
    takeCore(holder) {
      state.coreHolder = holder;
      state.coreDropped = null;
      events.onCoreTaken(holder);
    },
  };
}
