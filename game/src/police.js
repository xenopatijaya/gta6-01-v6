// police.js — the wanted system: 0–5 stars. Crimes raise it, it cools down
// when the player stays clean, and the Alba PD answers with interceptor cars
// and foot officers who chase, ram, and shoot back.

import * as THREE from 'three';
import { clamp, dist2D } from './util.js';
import { Car } from './vehicles.js';
import { nearestRoad, HALF } from './city.js';

const MAX_POLICE_CARS = 5;
const MAX_FOOT_COPS = 4;

export class WantedSystem {
  constructor(G) {
    this.G = G;
    this.level = 0;
    this.coolTimer = 0;
    this.spawnTimer = 0;
    this.policeCars = [];
    this.footCops = [];
    this.bustedTimer = 0;
  }

  addCrime(amount, reason) {
    const before = this.level;
    this.level = clamp(this.level + amount, 0, 5);
    this.coolTimer = 0;
    if (this.level > before && this.G.hud) {
      this.G.hud.flashWanted();
      this.G.hud.toast('WANTED LEVEL ' + this.level + ' — ' + reason);
    }
    if (this.G.audio && this.level > before) this.G.audio.phone();
  }

  update(dt) {
    const G = this.G;
    // Cool down: 25 clean seconds drop one star.
    if (this.level > 0) {
      this.coolTimer += dt;
      if (this.coolTimer > 25) {
        this.level -= 1;
        this.coolTimer = 0;
        if (G.hud) G.hud.toast('Heat cooling off… wanted level ' + this.level);
      }
    }
    // Keep the right number of interceptors on the street.
    const wantCars = this.level >= 1 ? Math.min(this.level, MAX_POLICE_CARS) : 0;
    this.spawnTimer -= dt;
    if (this.policeCars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnPoliceCar();
      this.spawnTimer = 2.5;
    }
    if (this.policeCars.length > wantCars) {
      const extra = this.policeCars.pop();
      extra.dispose();
      const idx = G.cars.indexOf(extra);
      if (idx >= 0) G.cars.splice(idx, 1);
    }
    // Foot cops join the chase from level 2 up, only while the player is on foot.
    const wantCops = this.level >= 2 && !G.player.inCar ? Math.min(this.level - 1, MAX_FOOT_COPS) : 0;
    if (this.footCops.length < wantCops && this.spawnTimer <= 0) {
      this.spawnFootCop();
      this.spawnTimer = 2.5;
    }
    while (this.footCops.length > wantCops) {
      const cop = this.footCops.pop();
      G.scene.remove(cop.mesh);
    }
    // Interceptors chase the player.
    const target = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    for (const car of this.policeCars) {
      car.updateAI(dt, target);
    }
    for (const cop of this.footCops) cop.update(dt, target);
    // Busted: a foot cop within arm's reach for 2.5 seconds ends the run.
    if (this.level > 0 && !G.player.inCar) {
      let near = false;
      for (const cop of this.footCops) {
        if (dist2D(G.player.pos.x, G.player.pos.z, cop.pos.x, cop.pos.z) < 2.2) near = true;
      }
      if (near) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2.5) {
          this.bustedTimer = 0;
          G.onBusted();
        }
      } else {
        this.bustedTimer = 0;
      }
    } else {
      this.bustedTimer = 0;
    }
    if (G.audio) G.audio.setSiren(this.level > 0);
  }

  spawnPoliceCar(opts = {}) {
    const G = this.G;
    const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    // Spawn on a road 45–70 m away from the player, in the direction of travel.
    const angle = G.rng() * Math.PI * 2;
    const dist = opts.dist ?? (45 + G.rng() * 25);
    let x = clamp(p.x + Math.cos(angle) * dist, -HALF, HALF);
    let z = clamp(p.z + Math.sin(angle) * dist, -HALF, HALF);
    x = nearestRoad(G, x);
    z = nearestRoad(G, z);
    const car = new Car(G, x, z, Math.atan2(p.x - x, p.z - z), 0x1a1a2a, 'PD Interceptor', {
      driver: 'police', police: true,
    });
    this.policeCars.push(car);
    G.cars.push(car);
    if (!opts.silent && G.hud) G.hud.toast('Alba PD interceptor inbound!');
  }

  spawnFootCop() {
    const G = this.G;
    const p = G.player.pos;
    const angle = G.rng() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(angle) * 18, -HALF, HALF);
    const z = clamp(p.z + Math.sin(angle) * 18, -HALF, HALF);
    this.footCops.push(new FootCop(G, x, z));
  }

  clearAll() {
    const G = this.G;
    for (const car of this.policeCars) {
      car.dispose();
      const idx = G.cars.indexOf(car);
      if (idx >= 0) G.cars.splice(idx, 1);
    }
    this.policeCars = [];
    for (const cop of this.footCops) G.scene.remove(cop.mesh);
    this.footCops = [];
    this.level = 0;
    this.coolTimer = 0;
  }
}

class FootCop {
  constructor(G, x, z) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.speed = 5.2;
    this.shootTimer = 1.5 + G.rng();
    this.mesh = this.buildMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), navy);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe8c33c, metalness: 0.8, roughness: 0.3 }));
    badge.position.set(-0.2, 1.35, 0.24);
    group.add(badge);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.48), skin);
    head.position.y = 1.95;
    group.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.18, 12), navy);
    hat.position.y = 2.24;
    group.add(hat);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    brim.position.set(0, 2.16, 0.26);
    group.add(brim);
    for (const sx of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), navy);
      leg.position.set(sx, 0.38, 0);
      group.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), navy);
      arm.position.set(sx * 2.5, 1.2, 0);
      group.add(arm);
    }
    return group;
  }

  update(dt, target) {
    const G = this.G;
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2) {
      this.heading = Math.atan2(dx, dz);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    // Cops shoot when close enough and the player is on foot.
    this.shootTimer -= dt;
    if (dist < 26 && dist > 3 && this.shootTimer <= 0 && !G.player.inCar) {
      this.shootTimer = 1.6 + G.rng() * 0.8;
      if (G.rng() < 0.55) {
        G.player.damage(8);
        if (G.effects) G.effects.muzzle(this.pos.x, 1.5, this.pos.z, G.player.pos);
        if (G.audio) G.audio.gunshot();
        if (G.hud) G.hud.flashDamage();
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}
