// pedestrians.js — Porto Alba locals: 26 walkers strolling the sidewalks,
// crossing at intersections, pausing at the plaza, and fleeing when a gun
// goes off or a car comes too close.

import * as THREE from 'three';
import { mulberry32, pick, clamp, dist2D } from './util.js';
import { resolveCollisions, HALF } from './city.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xe8c33c, 0xd84ad8, 0x4ad8d8, 0xe8e8e8, 0x7a4ad8];
const PANTS = [0x2a3040, 0x4a3a2a, 0x303030, 0x3a4a6a];
const SKINS = [0xc89878, 0x8a5a3a, 0xe8b898, 0x6a3a22];

function buildPedMesh(G, shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.38), shirtMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.42), skinMat);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }));
  hair.position.y = 2.05;
  group.add(hair);
  const legs = [];
  const arms = [];
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Group();
    const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), pantsMat);
    legMesh.position.y = -0.35;
    leg.add(legMesh);
    leg.position.set(sx, 0.7, 0);
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Group();
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), shirtMat);
    armMesh.position.y = -0.35;
    arm.add(armMesh);
    arm.position.set(sx * 2.4, 1.5, 0);
    group.add(arm);
    arms.push(arm);
  }
  group.userData.legs = legs;
  group.userData.arms = arms;
  return group;
}

export class Pedestrian {
  constructor(G, x, z) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = G.rng() * Math.PI * 2;
    this.speed = 1.2 + G.rng() * 0.9;
    this.state = 'walk'; // walk | idle | flee
    this.stateTimer = 2 + G.rng() * 6;
    this.health = 100;
    this.alive = true;
    this.walkPhase = G.rng() * 6;
    this.target = this.pickSidewalkTarget();
    this.mesh = buildPedMesh(G, pick(G.rng, SHIRTS), pick(G.rng, PANTS), pick(G.rng, SKINS));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    G.scene.add(this.mesh);
  }

  pickSidewalkTarget() {
    const G = this.G;
    const r = G.rng;
    // Walk along a block edge: pick a block, then a point near its rim.
    const bx = pick(r, G.blocks);
    const bz = pick(r, G.blocks);
    const side = Math.floor(r() * 4);
    const off = (r() * 2 - 1) * 16;
    if (side === 0) return { x: bx + off, z: bz - 18 };
    if (side === 1) return { x: bx + off, z: bz + 18 };
    if (side === 2) return { x: bx - 18, z: bz + off };
    return { x: bx + 18, z: bz + off };
  }

  scare(fromX, fromZ) {
    if (!this.alive) return;
    this.state = 'flee';
    this.stateTimer = 2.5 + this.G.rng() * 2;
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.fleeDir = { x: dx / len, z: dz / len };
  }

  update(dt) {
    if (!this.alive) return;
    const G = this.G;
    this.stateTimer -= dt;
    if (this.state === 'flee') {
      const sp = 4.5;
      this.heading = Math.atan2(this.fleeDir.x, this.fleeDir.z);
      const nx = this.pos.x + this.fleeDir.x * sp * dt;
      const nz = this.pos.z + this.fleeDir.z * sp * dt;
      const fixed = resolveCollisions(G, nx, nz, 0.6);
      this.pos.x = fixed.x;
      this.pos.z = fixed.z;
      this.walkPhase += dt * 11;
      if (this.stateTimer <= 0) {
        this.state = 'walk';
        this.target = this.pickSidewalkTarget();
      }
    } else if (this.state === 'idle') {
      if (this.stateTimer <= 0) {
        this.state = 'walk';
        this.target = this.pickSidewalkTarget();
      }
    } else {
      // Walk toward the target; arrive -> sometimes idle, else a new target.
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        if (G.rng() < 0.25) {
          this.state = 'idle';
          this.stateTimer = 2 + G.rng() * 4;
        } else {
          this.target = this.pickSidewalkTarget();
        }
      } else {
        const desired = Math.atan2(dx, dz);
        let diff = desired - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
        const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
        const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
        const fixed = resolveCollisions(G, nx, nz, 0.6);
        this.pos.x = fixed.x;
        this.pos.z = fixed.z;
        this.walkPhase += dt * this.speed * 3.2;
      }
      // Flee from a fast car bearing down on the sidewalk.
      for (const car of G.cars) {
        if (Math.abs(car.speed) < 5) continue;
        const d = dist2D(this.pos.x, this.pos.z, car.pos.x, car.pos.z);
        if (d < 5) {
          this.scare(car.pos.x, car.pos.z);
          break;
        }
      }
    }
    const swing = Math.sin(this.walkPhase) * 0.55;
    const legs = this.mesh.userData.legs;
    const arms = this.mesh.userData.arms;
    const moving = this.state !== 'idle';
    legs[0].rotation.x = moving ? swing : 0;
    legs[1].rotation.x = moving ? -swing : 0;
    arms[0].rotation.x = moving ? -swing * 0.7 : 0;
    arms[1].rotation.x = moving ? swing * 0.7 : 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Hit by a bullet or a car: fall over and stop.
  knockDown() {
    if (!this.alive) return;
    this.alive = false;
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = 0.35;
  }
}

export function spawnPedestrians(G, count) {
  G.peds = [];
  const r = G.rng;
  for (let i = 0; i < count; i++) {
    const bx = pick(r, G.blocks);
    const bz = pick(r, G.blocks);
    const x = clamp(bx + (r() * 2 - 1) * 17, -HALF, HALF);
    const z = clamp(bz + (r() * 2 - 1) * 17, -HALF, HALF);
    G.peds.push(new Pedestrian(G, x, z));
  }
  return G.peds;
}
