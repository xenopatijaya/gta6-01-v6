// hud.js — the on-screen HUD: cash, wanted stars, health, ammo, speed,
// mission objective, toasts, the story brief card, and a live 2D minimap.

import { fmtMoney, clamp } from './util.js';
import { HALF } from './city.js';

export class HUD {
  constructor(G) {
    this.G = G;
    this.root = document.getElementById('hud');
    this.mapSize = 190;
    this.mapScale = this.mapSize / (HALF * 2 + 100);
    this.build();
  }

  build() {
    const root = this.root;
    // Top-left: cash + wanted stars.
    this.cashEl = document.createElement('div');
    this.cashEl.id = 'cash';
    this.cashEl.textContent = '$0';
    root.appendChild(this.cashEl);
    this.starsEl = document.createElement('div');
    this.starsEl.id = 'stars';
    root.appendChild(this.starsEl);
    // Top-right: minimap.
    this.mapWrap = document.createElement('div');
    this.mapWrap.id = 'minimap-wrap';
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.id = 'minimap';
    this.mapCanvas.width = this.mapSize;
    this.mapCanvas.height = this.mapSize;
    this.mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
    root.appendChild(this.mapWrap);
    // Bottom-left: health bar + ammo.
    this.healthWrap = document.createElement('div');
    this.healthWrap.id = 'health-wrap';
    this.healthBar = document.createElement('div');
    this.healthBar.id = 'health-bar';
    this.healthWrap.appendChild(this.healthBar);
    this.healthLabel = document.createElement('div');
    this.healthLabel.id = 'health-label';
    this.healthLabel.textContent = 'HP 100';
    this.healthWrap.appendChild(this.healthLabel);
    this.ammoEl = document.createElement('div');
    this.ammoEl.id = 'ammo';
    this.ammoEl.textContent = 'AMMO 60 / 240';
    this.healthWrap.appendChild(this.ammoEl);
    root.appendChild(this.healthWrap);
    // Bottom-right: speed + vehicle name.
    this.speedEl = document.createElement('div');
    this.speedEl.id = 'speed';
    root.appendChild(this.speedEl);
    // Mission objective, under the cash.
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.id = 'objective';
    root.appendChild(this.objectiveEl);
    // Crosshair (only while on foot).
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';
    this.crosshair.textContent = '+';
    root.appendChild(this.crosshair);
    // Toast feed, bottom centre.
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toasts';
    root.appendChild(this.toastEl);
    // Story brief card, centre-top.
    this.briefEl = document.createElement('div');
    this.briefEl.id = 'brief';
    this.briefEl.style.display = 'none';
    root.appendChild(this.briefEl);
    // Damage flash + wanted flash overlays.
    this.damageEl = document.createElement('div');
    this.damageEl.id = 'damage-flash';
    root.appendChild(this.damageEl);
    this.wantedEl = document.createElement('div');
    this.wantedEl.id = 'wanted-flash';
    root.appendChild(this.wantedEl);
    // Interaction prompt ("Press E to steal car").
    this.promptEl = document.createElement('div');
    this.promptEl.id = 'prompt';
    root.appendChild(this.promptEl);
    this.toasts = [];
  }

  toast(text) {
    const G = this.G;
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    this.toastEl.appendChild(node);
    // Toasts expire in real time, so they never linger on a slow frame rate.
    this.toasts.push({ node, born: performance.now() });
    while (this.toasts.length > 4) {
      const old = this.toasts.shift();
      old.node.remove();
    }
  }

  showBrief(title, body) {
    this.briefEl.style.display = 'block';
    this.briefEl.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    this.briefEl.appendChild(h);
    this.briefEl.appendChild(p);
    clearTimeout(this._briefTimer);
    this._briefTimer = setTimeout(() => {
      this.briefEl.style.display = 'none';
    }, 6000);
  }

  flashDamage() {
    this.damageEl.classList.remove('on');
    void this.damageEl.offsetWidth;
    this.damageEl.classList.add('on');
  }

  flashWanted() {
    this.wantedEl.classList.remove('on');
    void this.wantedEl.offsetWidth;
    this.wantedEl.classList.add('on');
  }

  setPrompt(text) {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.style.display = 'block';
    } else {
      this.promptEl.style.display = 'none';
    }
  }

  update(dt) {
    const G = this.G;
    // Toast expiry (real time).
    const now = performance.now();
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      if (now - t.born > 5000) {
        t.node.remove();
        this.toasts.splice(i, 1);
      }
    }
    this.cashEl.textContent = fmtMoney(G.cash);
    // Wanted stars: filled ★ and empty ☆.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < G.wanted.level ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.style.color = G.wanted.level > 0 ? '#ff4444' : '#888888';
    // Health.
    const hp = Math.round(G.player.health);
    this.healthBar.style.width = hp + '%';
    this.healthBar.style.background = hp > 50 ? '#3ad86a' : hp > 25 ? '#e8c33c' : '#d83a2a';
    this.healthLabel.textContent = 'HP ' + hp;
    // Ammo + speed.
    this.ammoEl.textContent = 'AMMO ' + G.combat.ammo + ' / ' + G.combat.reserve;
    if (G.player.inCar) {
      const kmh = Math.round(Math.abs(G.player.inCar.speed) * 3.6);
      this.speedEl.textContent = kmh + ' km/h · ' + G.player.inCar.name;
      this.speedEl.style.display = 'block';
      this.crosshair.style.display = 'none';
    } else {
      this.speedEl.style.display = 'none';
      this.crosshair.style.display = 'block';
    }
    // Objective.
    const label = G.missions.currentLabel;
    this.objectiveEl.textContent = label ? '◆ ' + label : '';
    this.objectiveEl.style.display = label ? 'block' : 'none';
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const S = this.mapSize;
    const scale = this.mapScale;
    const toMap = (x, z) => [(x + HALF + 50) * scale, (z + HALF + 50) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(20, 24, 30, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Land: blocks.
    ctx.fillStyle = '#5a6a5a';
    for (const bx of G.blocks) {
      for (const bz of G.blocks) {
        const [mx, mz] = toMap(bx - 20, bz - 20);
        ctx.fillRect(mx, mz, 40 * scale, 40 * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 12 * scale;
    for (const c of G.roads) {
      const [x1] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, S);
      ctx.stroke();
      const [, z1] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, z1);
      ctx.lineTo(S, z1);
      ctx.stroke();
    }
    // Sea + beach at the bottom.
    ctx.fillStyle = '#2a7fa8';
    const [, seaY] = toMap(0, HALF + 20);
    ctx.fillRect(0, seaY, S, S - seaY);
    ctx.fillStyle = '#e8d49a';
    const [, sandY] = toMap(0, HALF);
    ctx.fillRect(0, sandY, S, seaY - sandY);
    // Park.
    ctx.fillStyle = '#3a8a3a';
    const [px, pz] = toMap(G.landmarks.park.x - 20, G.landmarks.park.z - 20);
    ctx.fillRect(px, pz, 40 * scale, 40 * scale);
    // Mission beacon blip.
    if (G.effects.beacon) {
      const [bx, bz] = toMap(G.effects.beacon.x, G.effects.beacon.z);
      const pulse = 4 + Math.sin(performance.now() / 200) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.arc(bx, bz, pulse + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic dots.
    ctx.fillStyle = '#e8e8e8';
    for (const car of G.cars) {
      if (car.driver === 'police') continue;
      const [cx, cz] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // Police dots (red/blue).
    for (const car of G.wanted.policeCars) {
      const [cx, cz] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = '#4488ff';
      ctx.beginPath();
      ctx.arc(cx, cz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow (rotates with heading).
    const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
    const [ux, uz] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(ux, uz);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S / 2 - 4, 12);
  }
}
