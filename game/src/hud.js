// NEON TIDE HUD: health, armor, ammo, money, timer, score, objective, carrier tag,
// surge badge, minimap, killfeed, crosshair, hitmarker, vignette, flash, banners,
// buy menu and the title screen. Fresh code written for threejs-fps-02.
import { TEAL_CSS, MAGENTA_CSS } from './palette.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.mapData = null;
    this._build();
  }

  _build() {
    const r = this.root;
    // Top center: scoreboard + timer + objective.
    this.top = el('div', 'hud-top', r);
    this.scoreTide = el('div', 'hud-score tide', this.top, 'TIDE 0');
    this.timer = el('div', 'hud-timer', this.top, '1:40');
    this.scoreWarden = el('div', 'hud-score warden', this.top, '0 WARD');
    this.objective = el('div', 'hud-objective', r, '');
    this.carrier = el('div', 'hud-carrier', r, '');
    this.surgeBadge = el('div', 'hud-surge', r, 'TIDE SURGE');
    // Top right: minimap + killfeed.
    const tr = el('div', 'hud-tr', r);
    this.map = el('canvas', 'hud-minimap', tr);
    this.map.width = 168;
    this.map.height = 128;
    this.killfeed = el('div', 'hud-killfeed', tr);
    // Bottom left: health and armor.
    const bl = el('div', 'hud-bl', r);
    el('div', 'hud-label', bl, 'INTEGRITY');
    this.hpBar = el('div', 'hud-bar hp', bl);
    this.hpFill = el('div', 'hud-fill', this.hpBar);
    this.hpNum = el('div', 'hud-num', bl, '100');
    el('div', 'hud-label', bl, 'PLATING');
    this.arBar = el('div', 'hud-bar ar', bl);
    this.arFill = el('div', 'hud-fill', this.arBar);
    // Bottom right: weapon, ammo, money, gadgets.
    const br = el('div', 'hud-br', r);
    this.weaponName = el('div', 'hud-weapon', br, 'P9 Tide');
    this.ammo = el('div', 'hud-ammo', br, '12 / 36');
    this.money = el('div', 'hud-money', br, '$800');
    this.gadgets = el('div', 'hud-gadgets', br, '');
    // Center: crosshair, hitmarker, channel bar.
    this.cross = el('div', 'hud-cross', r);
    for (const d of ['t', 'b', 'l', 'r']) el('div', 'hud-cline ' + d, this.cross);
    el('div', 'hud-cdot', this.cross);
    this.hitmark = el('div', 'hud-hitmark', r, '✕');
    this.channelWrap = el('div', 'hud-channel', r);
    el('div', 'hud-label', this.channelWrap, 'UPLINKING CORE');
    this.channelBar = el('div', 'hud-bar ch', this.channelWrap);
    this.channelFill = el('div', 'hud-fill', this.channelBar);
    // Fullscreen overlays.
    this.vignette = el('div', 'hud-vignette', r);
    this.flash = el('div', 'hud-flash', r);
    // Banners.
    this.banner = el('div', 'hud-banner', r);
    this.bannerTitle = el('div', 'hud-banner-title', this.banner);
    this.bannerSub = el('div', 'hud-banner-sub', this.banner);
    this.bannerTimer = 0;
    // Buy menu.
    this.buy = el('div', 'hud-buy', r);
    el('div', 'hud-buy-title', this.buy, 'HARBOUR MARKET <span>BUY PHASE</span>');
    this.buyMoney = el('div', 'hud-buy-money', this.buy, '$800');
    this.buyList = el('div', 'hud-buy-list', this.buy);
    el('div', 'hud-buy-hint', this.buy, 'Keys 1-7 or click to buy &nbsp;·&nbsp; ENTER / DEPLOY to start the round');
    this.buyBtn = el('button', 'hud-deploy', this.buy, 'DEPLOY ▸');
    // Title screen.
    this.menu = el('div', 'hud-menu', r);
    el('div', 'hud-menu-kicker', this.menu, 'RAINY NEON HARBOR // 5V5 TACTICAL');
    el('div', 'hud-menu-title', this.menu, 'NEON<br>TIDE');
    el('div', 'hud-menu-sub', this.menu, 'Carry the data-core to the uplink. First to 5 rounds takes the harbor.');
    this.menuBtn = el('button', 'hud-menu-btn', this.menu, 'ENTER THE HARBOR');
    el('div', 'hud-menu-foot', this.menu, 'WASD move · Mouse aim · Click fire · R reload · E channel uplink · Q swap weapon · G gadget');
  }

  setMap(world) {
    this.mapData = world;
  }

  showMenu(onStart) {
    this.menu.style.display = 'flex';
    this.menuBtn.onclick = () => { onStart(); };
  }

  hideMenu() {
    this.menu.style.display = 'none';
  }

  showBuy(items, money, onBuy, onDeploy) {
    this.buy.style.display = 'block';
    this.buyMoney.textContent = '$' + money;
    this.buyList.innerHTML = '';
    for (const it of items) {
      const row = el('div', 'hud-buy-row' + (money < it.price ? ' poor' : ''), this.buyList);
      row.innerHTML = `<span class="k">${it.key}</span><span class="n">${it.name}</span><span class="p">$${it.price}</span><span class="o">${it.owned || ''}</span>`;
      row.onclick = () => onBuy(it);
    }
    this.buyBtn.onclick = () => onDeploy();
  }

  hideBuy() {
    this.buy.style.display = 'none';
  }

  bannerShow(title, sub, color, ms = 2600) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.banner.style.color = color || '#e8f4ff';
    this.banner.style.display = 'block';
    this.bannerTimer = ms;
  }

  killfeedAdd(text, color) {
    const line = el('div', 'hud-kf-line', this.killfeed);
    line.textContent = text;
    if (color) line.style.color = color;
    while (this.killfeed.children.length > 5) this.killfeed.removeChild(this.killfeed.firstChild);
    setTimeout(() => { if (line.parentNode) line.remove(); }, 6000);
  }

  hitmarkShow(kill) {
    this.hitmark.style.color = kill ? '#ff2e88' : '#e8f4ff';
    this.hitmark.style.opacity = '1';
    setTimeout(() => { this.hitmark.style.opacity = '0'; }, 140);
  }

  damageFlash(strength) {
    this.vignette.style.opacity = String(Math.min(0.85, strength));
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 350);
  }

  flashWhite(strength) {
    this.flash.style.opacity = String(strength);
    setTimeout(() => { this.flash.style.opacity = '0'; }, 700);
  }

  _fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  update(s, dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt * 1000;
      if (this.bannerTimer <= 0) this.banner.style.display = 'none';
    }
    this.scoreTide.textContent = 'TIDE ' + s.scoreTide;
    this.scoreWarden.textContent = s.scoreWarden + ' WARD';
    this.timer.textContent = s.phase === 'buy' ? 'BUY ' + this._fmtTime(s.timer) : this._fmtTime(s.timer);
    this.timer.style.color = s.timer <= 10 && s.phase === 'live' ? '#ff5d5d' : '#e8f4ff';
    this.objective.textContent = s.objective;
    this.carrier.style.display = s.carrier ? 'block' : 'none';
    this.carrier.textContent = s.carrier ? '◆ CORE: ' + s.carrier : '';
    this.surgeBadge.style.display = s.surge ? 'block' : 'none';
    this.hpFill.style.width = Math.max(0, s.hp) + '%';
    this.hpNum.textContent = Math.max(0, Math.ceil(s.hp)) + (s.armor > 0 ? '  +' + Math.ceil(s.armor) : '');
    this.arFill.style.width = Math.min(100, s.armor) + '%';
    this.ammo.textContent = s.reloading ? 'RELOADING…' : s.ammo + ' / ' + s.reserve;
    this.weaponName.textContent = s.weaponName;
    this.money.textContent = '$' + s.money;
    this.gadgets.textContent = s.gadgetText || '';
    this.cross.style.setProperty('--sp', (4 + s.spread * 260) + 'px');
    this.channelWrap.style.display = s.channel > 0 ? 'block' : 'none';
    if (s.channel > 0) this.channelFill.style.width = (s.channel * 100).toFixed(0) + '%';
    this.buyMoney.textContent = '$' + s.money;
    this._drawMinimap(s);
  }

  _drawMinimap(s) {
    const c = this.map.getContext('2d');
    const W = this.map.width, H = this.map.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,16,26,0.82)';
    c.fillRect(0, 0, W, H);
    const sx = W / 42, sz = H / 32;
    const X = (x) => (x + 21) * sx, Z = (z) => (z + 16) * sz;
    c.strokeStyle = 'rgba(160,200,230,0.5)';
    c.strokeRect(X(-20), Z(-15), 40 * sx, 30 * sz);
    if (this.mapData) {
      c.fillStyle = 'rgba(120,160,190,0.45)';
      for (const col of this.mapData.colliders) {
        c.fillRect(X(col.x0), Z(col.z0), (col.x1 - col.x0) * sx, (col.z1 - col.z0) * sz);
      }
    }
    // Uplink ring.
    c.strokeStyle = MAGENTA_CSS;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(X(s.uplink.x), Z(s.uplink.z), 6, 0, Math.PI * 2);
    c.stroke();
    // Core position.
    if (s.core) {
      c.fillStyle = '#ffd166';
      c.beginPath();
      c.arc(X(s.core.x), Z(s.core.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // Bots.
    for (const b of s.bots) {
      if (!b.alive) continue;
      c.fillStyle = b.team === s.playerTeam ? TEAL_CSS : MAGENTA_CSS;
      c.beginPath();
      c.arc(X(b.x), Z(b.z), 3, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow.
    c.save();
    c.translate(X(s.px), Z(s.pz));
    c.rotate(Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw)) * -1 + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath();
    c.fill();
    c.restore();
  }
}
