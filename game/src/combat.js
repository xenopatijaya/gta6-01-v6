// combat.js — shooting: click (or F) to fire from the player toward the
// camera aim, with a visible tracer, recoil, and hit effects. Firing in
// public raises the wanted level; hitting a pedestrian or a cop raises it more.

import * as THREE from 'three';
import { clamp, dist2D } from './util.js';

export class Combat {
  constructor(G) {
    this.G = G;
    this.ammo = 60;
    this.reserve = 240;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.raycaster = new THREE.Raycaster();
    this.aimPoint = new THREE.Vector3();
  }

  update(dt) {
    this.fireTimer -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = 60 - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        if (this.G.hud) this.G.hud.toast('Reloaded — ' + this.ammo + ' / ' + this.reserve);
      }
      return;
    }
    const G = this.G;
    const input = G.input;
    if (input.wasPressed('KeyR') && this.ammo < 60 && this.reserve > 0) {
      this.reloadTimer = 1.1;
      if (G.audio) G.audio.blip(300, 0.08, 'square', 0.15);
      return;
    }
    const wantFire = (input.mouseDown || input.wasPressed('KeyF')) && G.state === 'play';
    if (!wantFire || this.fireTimer > 0 || G.player.inCar) return;
    if (this.ammo <= 0) {
      if (G.audio) G.audio.blip(180, 0.08, 'square', 0.2);
      if (G.hud) G.hud.toast('Out of ammo — press R to reload');
      this.fireTimer = 0.3;
      return;
    }
    this.fire();
  }

  fire() {
    const G = this.G;
    this.ammo -= 1;
    this.fireTimer = 0.18;
    // Aim from the camera through the screen centre.
    const cam = G.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const origin = this.raycaster.ray.origin.clone();
    const dir = this.raycaster.ray.direction.clone();
    let end = origin.clone().addScaledVector(dir, 90);
    let hitPed = null;
    let hitCop = null;
    let hitCar = null;
    let bestT = 90;
    // Test pedestrians.
    for (const ped of G.peds) {
      if (!ped.alive) continue;
      const t = raySphere(origin, dir, ped.pos.x, ped.pos.y + 1.1, ped.pos.z, 1.0);
      if (t !== null && t < bestT) {
        bestT = t;
        hitPed = ped;
        hitCop = null;
        hitCar = null;
      }
    }
    // Test foot cops.
    for (const cop of G.wanted.footCops) {
      const t = raySphere(origin, dir, cop.pos.x, cop.pos.y + 1.1, cop.pos.z, 1.0);
      if (t !== null && t < bestT) {
        bestT = t;
        hitCop = cop;
        hitPed = null;
        hitCar = null;
      }
    }
    // Test cars (big sphere at the car centre).
    for (const car of G.cars) {
      const t = raySphere(origin, dir, car.pos.x, car.pos.y + 0.8, car.pos.z, 2.4);
      if (t !== null && t < bestT) {
        bestT = t;
        hitCar = car;
        hitPed = null;
        hitCop = null;
      }
    }
    // Test buildings: stop the tracer at the first wall.
    for (const c of G.colliders) {
      const t = rayBox(origin, dir, c);
      if (t !== null && t < bestT) {
        bestT = t;
        hitPed = null;
        hitCop = null;
        hitCar = null;
      }
    }
    end = origin.clone().addScaledVector(dir, bestT);
    const muzzle = G.player.pos.clone();
    muzzle.y += 1.5;
    muzzle.x += Math.sin(G.player.heading) * 0.5;
    muzzle.z += Math.cos(G.player.heading) * 0.5;
    if (G.effects) G.effects.tracer(muzzle, end);
    if (G.effects) G.effects.impact(end);
    if (G.audio) G.audio.gunshot();
    // Scare nearby pedestrians.
    for (const ped of G.peds) {
      if (ped.alive && dist2D(ped.pos.x, ped.pos.z, G.player.pos.x, G.player.pos.z) < 30) {
        ped.scare(G.player.pos.x, G.player.pos.z);
      }
    }
    if (hitPed) {
      hitPed.knockDown();
      if (G.effects) G.effects.blood(end);
      G.wanted.addCrime(1, 'Pedestrian down!');
      if (G.hud) G.hud.toast('You hit a civilian! The PD is coming.');
    } else if (hitCop) {
      G.scene.remove(hitCop.mesh);
      const idx = G.wanted.footCops.indexOf(hitCop);
      if (idx >= 0) G.wanted.footCops.splice(idx, 1);
      if (G.effects) G.effects.blood(end);
      G.wanted.addCrime(2, 'Officer down!');
    } else if (hitCar) {
      if (G.effects) G.effects.sparks(end);
      if (hitCar.driver === 'traffic') {
        // Shooting a traffic car scares its driver out — it becomes parked.
        hitCar.driver = null;
        hitCar.ai = null;
        hitCar.speed = 0;
      }
    }
    // Firing a gun in public is a crime even if nothing is hit.
    G.wanted.addCrime(0, '');
    if (G.wanted.level === 0) G.wanted.addCrime(1, 'Shots fired!');
    else G.wanted.coolTimer = 0;
  }
}

// Ray vs sphere: returns the nearest positive t, or null.
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0.2 ? t : null;
}

// Ray vs axis-aligned box (buildings are AABBs from y 0 to their height).
function rayBox(o, d, c) {
  let tmin = 0;
  let tmax = 120;
  const mins = [c.minX, 0, c.minZ];
  const maxs = [c.maxX, 60, c.maxZ];
  const od = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-8) {
      if (od[i] < mins[i] || od[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - od[i]) / dd[i];
      let t2 = (maxs[i] - od[i]) / dd[i];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0.2 ? tmin : null;
}
