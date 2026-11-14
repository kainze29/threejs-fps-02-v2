// The DOM HUD: health, ammo, money, timer, score, killfeed, minimap, buy menu,
// banners and overlays. It never touches the simulation; main.js pushes numbers
// in and reads callbacks out. Every number shown is pushed every frame it changes.
export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    armorNum: $('armor-num'),
    money: $('money'),
    timer: $('timer'),
    timerLabel: $('timer-label'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    roundLabel: $('round-label'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    objective: $('objective-text'),
    vignette: $('vignette'),
    flashbang: $('flashbang'),
    minimap: $('minimap'),
    buyMenu: $('buy-menu'),
    buyRows: $('buy-rows'),
    buyMoney: $('buy-money'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    deathNote: $('death-note'),
    surgeBadge: $('surge-badge'),
    carrierTag: $('carrier-tag'),
    buyDeploy: $('buy-deploy'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { hp: -1, armor: -1, mag: -1, res: -1, weapon: '', money: -1, timer: -1, timerLabel: '', score: '' };

  const COPY = {
    start: { title: 'NEON TIDE', copy: 'A rainy harbor, two crews, one data-core. Carry it to the uplink or wipe the other crew out.', action: 'Click to play' },
    paused: { title: 'NEON TIDE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
    dead: { title: 'You are down', copy: 'Your squad is still fighting. Watch the feed.', action: '' },
    matchWin: { title: 'Harbor taken', copy: 'Your crew takes the match.', action: 'Play again' },
    matchLose: { title: 'Harbor lost', copy: 'The other crew takes the match.', action: 'Play again' },
    matchDraw: { title: 'Dead even', copy: 'Nobody takes the harbor.', action: 'Play again' },
  };

  function feed(html, cls) {
    const div = document.createElement('div');
    div.className = `feed-line ${cls || ''}`;
    div.innerHTML = html;
    el.killfeed.prepend(div);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); }, 4200);
    setTimeout(() => { div.remove(); }, 5000);
  }

  return {
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp; last.armor = armor;
      el.healthFill.style.width = `${Math.max(0, hp)}%`;
      el.healthFill.classList.toggle('low', hp <= 30);
      el.healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      el.armorNum.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, weaponName) {
      if (mag === last.mag && reserve === last.res && weaponName === last.weapon) return;
      last.mag = mag; last.res = reserve; last.weapon = weaponName;
      el.ammoMag.textContent = String(mag);
      el.ammoReserve.textContent = `/ ${reserve}`;
      el.weaponName.textContent = weaponName;
      el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === last.money) return;
      last.money = value;
      el.money.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setTimer(seconds, label) {
      const s = Math.max(0, Math.ceil(seconds));
      if (s === last.timer && label === last.timerLabel) return;
      last.timer = s; last.timerLabel = label;
      el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.timerLabel.textContent = label;
      el.timer.classList.toggle('urgent', s <= 10 && label === 'ROUND');
    },
    setScore(atk, def, round) {
      const key = `${atk}-${def}-${round}`;
      if (key === last.score) return;
      last.score = key;
      el.scoreAtk.textContent = String(atk);
      el.scoreDef.textContent = String(def);
      el.roundLabel.textContent = `ROUND ${round} / 9`;
    },
    setObjective(text, isCarrier) {
      el.objective.textContent = text;
      el.carrierTag.hidden = !isCarrier;
    },
    setSurge(on) { el.surgeBadge.hidden = !on; },
    setCrosshair(px) {
      el.crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(kill, holdMs = 90) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', !!kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      el.vignette.classList.remove('hit');
      void el.vignette.offsetWidth;
      el.vignette.classList.add('hit');
    },
    flashBlind(ms) {
      el.flashbang.style.transition = 'none';
      el.flashbang.style.opacity = '0.95';
      requestAnimationFrame(() => {
        el.flashbang.style.transition = `opacity ${ms}ms linear`;
        el.flashbang.style.opacity = '0';
      });
    },
    killfeedKill(killer, victim, weapon, killerTeam, victimTeam, headshot) {
      const kc = killerTeam === 'attackers' ? 'atk' : 'def';
      const vc = victimTeam === 'attackers' ? 'atk' : 'def';
      feed(`<span class="${kc}">${killer}</span> <span class="wpn">[${weapon}${headshot ? ' • HEADSHOT' : ''}]</span> <span class="${vc}">${victim}</span>`);
    },
    killfeedInfo(text) { feed(text, 'info'); },
    showBanner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
    },
    showBuy(rows, money) {
      el.buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
      el.buyRows.innerHTML = '';
      for (const row of rows) {
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'buy-row';
        div.disabled = row.owned || !row.afford;
        div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-name">${row.name}</span><span class="buy-kind">${row.kind}</span><span class="buy-desc">${row.desc}</span><span class="buy-price">${row.owned ? 'OWNED' : '$' + row.price.toLocaleString('en-US')}${row.count ? ' ×' + row.count : ''}</span>`;
        div.addEventListener('click', () => callbacks.onBuy(row.id));
        el.buyRows.appendChild(div);
      }
      el.buyMenu.hidden = false;
    },
    hideBuy() { el.buyMenu.hidden = true; },
    showDeath() { el.deathNote.hidden = false; },
    hideDeath() { el.deathNote.hidden = true; },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      if (!text) return;
      // Keep the teal TIDE accent on the title screen instead of wiping it to plain text.
      if (mode === 'start' || mode === 'paused') el.overlayTitle.innerHTML = 'NEON <em>TIDE</em>';
      else el.overlayTitle.textContent = text.title;
      el.overlayCopy.textContent = extra || text.copy;
      el.play.textContent = text.action;
      el.play.style.display = text.action ? '' : 'none';
      el.overlay.hidden = false;
      if (text.action) el.play.focus();
    },
    hideOverlay() { el.overlay.hidden = true; },
    onPlay(handler) { el.play.addEventListener('click', handler); },
    onDeploy(handler) { el.buyDeploy.addEventListener('click', handler); },
    drawMinimap(rects, dots, uplink, core) {
      const w = el.minimap.width;
      const h = el.minimap.height;
      const sx = w / 44;
      const sy = h / 34;
      const X = (x) => (x + 22) * sx;
      const Z = (z) => (z + 17) * sy;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(7, 11, 20, 0.85)';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.fillStyle = '#26324a';
      for (const r of rects) mapCtx.fillRect(X(r.x), Z(r.z), r.w * sx, r.d * sy);
      mapCtx.strokeStyle = '#ff2e88';
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(X(uplink.x), Z(uplink.z), 5, 0, Math.PI * 2);
      mapCtx.stroke();
      if (core) {
        mapCtx.fillStyle = '#ffb347';
        mapCtx.beginPath();
        mapCtx.arc(X(core.x), Z(core.z), 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const d of dots) {
        mapCtx.fillStyle = d.team === 'attackers' ? '#19e3c2' : '#ff2e88';
        mapCtx.beginPath();
        mapCtx.arc(X(d.x), Z(d.z), d.you ? 3.5 : 2.5, 0, Math.PI * 2);
        mapCtx.fill();
        if (d.you) {
          mapCtx.strokeStyle = '#e8f1f2';
          mapCtx.lineWidth = 1;
          mapCtx.beginPath();
          mapCtx.arc(X(d.x), Z(d.z), 5, 0, Math.PI * 2);
          mapCtx.stroke();
        }
      }
    },
  };
}
