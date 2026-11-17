// player.js — Kai Mercer on foot: a simple articulated low-poly figure,
// WASD movement relative to the camera, run with Shift, jump with Space.

import * as THREE from 'three';
import { clamp, damp, angleLerp, dist2D } from './util.js';
import { resolveCollisions } from './city.js';

const WALK_SPEED = 6;
const RUN_SPEED = 10.5;
const JUMP_VELOCITY = 8.5;
const GRAVITY = 24;

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(0, 0, 20);
    this.heading = Math.PI; // facing north, toward the plaza
    this.velY = 0;
    this.grounded = true;
    this.speed = 0;
    this.moving = false;
    this.inCar = null;
    this.health = 100;
    this.group = new THREE.Group();
    this.group.name = 'KaiMercer';
    this.buildMesh();
    G.scene.add(this.group);
  }

  buildMesh() {
    const G = this.G;
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2a9a7a, roughness: 0.9 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.9 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), jacket);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);
    const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.06), shirt);
    shirtFront.position.set(0, 1.15, 0.24);
    this.group.add(shirtFront);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.48), skin);
    head.position.y = 1.95;
    head.castShadow = true;
    this.group.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 }));
    hair.position.y = 2.22;
    this.group.add(hair);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xd84a2a, roughness: 0.8 }));
    cap.position.y = 2.3;
    this.group.add(cap);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    const armGeo = new THREE.BoxGeometry(0.22, 0.85, 0.22);
    const armLMesh = new THREE.Mesh(armGeo, jacket);
    armLMesh.position.y = -0.42;
    armLMesh.castShadow = true;
    this.armL.add(armLMesh);
    const armRMesh = new THREE.Mesh(armGeo, jacket);
    armRMesh.position.y = -0.42;
    armRMesh.castShadow = true;
    this.armR.add(armRMesh);
    this.armL.position.set(-0.55, 1.6, 0);
    this.armR.position.set(0.55, 1.6, 0);
    this.group.add(this.armL, this.armR);

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.3, 0.75, 0.3);
    const legLMesh = new THREE.Mesh(legGeo, pants);
    legLMesh.position.y = -0.38;
    legLMesh.castShadow = true;
    this.legL.add(legLMesh);
    const legRMesh = new THREE.Mesh(legGeo, pants);
    legRMesh.position.y = -0.38;
    legRMesh.castShadow = true;
    this.legR.add(legRMesh);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.5), shoes);
    shoeL.position.set(0, -0.78, 0.08);
    this.legL.add(shoeL);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.5), shoes);
    shoeR.position.set(0, -0.78, 0.08);
    this.legR.add(shoeR);
    this.legL.position.set(-0.22, 0.78, 0);
    this.legR.position.set(0.22, 0.78, 0);
    this.group.add(this.legL, this.legR);

    this.walkPhase = 0;
  }

  update(dt) {
    const G = this.G;
    if (this.inCar) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const input = G.input;
    const axis = input.axis();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? RUN_SPEED : WALK_SPEED;
    // Movement is relative to the camera yaw.
    const camYaw = G.cameraYaw;
    let mx = 0;
    let mz = 0;
    if (axis.x !== 0 || axis.z !== 0) {
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      // Camera looks along -Z rotated by camYaw; forward = (sin, cos) in x/z.
      mx = (-axis.z * sin + axis.x * cos);
      mz = (-axis.z * cos - axis.x * sin);
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      this.moving = true;
      this.targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, this.targetHeading, 1 - Math.exp(-12 * dt));
    } else {
      this.moving = false;
    }
    const nx = this.pos.x + mx * speed * dt;
    const nz = this.pos.z + mz * speed * dt;
    const fixed = resolveCollisions(G, nx, nz, 0.7);
    // Avoid walking through parked/driving cars: soft push-out.
    for (const car of G.cars) {
      const d = dist2D(fixed.x, fixed.z, car.pos.x, car.pos.z);
      if (d < 2.2 && d > 0.001) {
        const push = (2.2 - d) / d;
        fixed.x += (fixed.x - car.pos.x) * push;
        fixed.z += (fixed.z - car.pos.z) * push;
      }
    }
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.speed = this.moving ? speed : 0;

    // Jump / gravity.
    if (this.grounded && input.wasPressed('Space')) {
      this.velY = JUMP_VELOCITY;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velY -= GRAVITY * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.grounded = true;
      }
    }

    // Walk-cycle swing.
    if (this.moving) {
      this.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.7;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    } else {
      this.legL.rotation.x = damp(this.legL.rotation.x, 0, 10, dt);
      this.legR.rotation.x = damp(this.legR.rotation.x, 0, 10, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, 0, 10, dt);
      this.armR.rotation.x = damp(this.armR.rotation.x, 0, 10, dt);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  enterCar(car) {
    this.inCar = car;
    car.driver = 'player';
    this.group.visible = false;
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return;
    car.driver = null;
    this.inCar = null;
    // Step out to the left of the car.
    const side = car.heading + Math.PI / 2;
    this.pos.set(
      car.pos.x + Math.sin(side) * 2.4,
      0,
      car.pos.z + Math.cos(side) * 2.4,
    );
    const fixed = resolveCollisions(this.G, this.pos.x, this.pos.z, 0.7);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.heading = car.heading;
    this.group.visible = true;
    this.group.position.copy(this.pos);
  }

  damage(amount) {
    this.health = clamp(this.health - amount, 0, 100);
    if (this.health <= 0) this.G.onPlayerDown();
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }
}
