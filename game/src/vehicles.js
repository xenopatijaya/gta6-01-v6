// vehicles.js — cars: the player's arcade driving, parked cars to steal,
// and traffic AI that cruises the road grid, stops for the car ahead, and
// turns at intersections. All cars are built from boxes and cylinders.

import * as THREE from 'three';
import { mulberry32, pick, clamp, angleLerp, angleDiff, dist2D } from './util.js';
import { resolveCollisions, nearestRoad, HALF, PITCH } from './city.js';

export const CAR_COLORS = [
  0xd83a2a, 0x2a6ad8, 0xe8c33c, 0x2ad86a, 0x8a2ad8,
  0xe8e8e8, 0x222222, 0xd87a2a, 0x3ad8d8, 0xa03a6a,
];
export const CAR_NAMES = [
  'Alba Comet', 'Verde Runner', 'Costa GT', 'Palma Cruiser', 'Solstice S',
  'Marina Hatch', 'Breeze Coupe', 'Coral Sedan', 'Tide Van', 'Lumen Sport',
];

export function buildCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.55,
  });
  const darkGlass = new THREE.MeshStandardMaterial({
    color: 0x18222c, roughness: 0.15, metalness: 0.7,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), darkGlass);
  cabin.position.set(0, 1.08, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.0), paint);
  roof.position.set(0, 1.38, -0.2);
  group.add(roof);
  // Headlights and taillights.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xaa1111, emissive: 0xff2222, emissiveIntensity: 0.8,
  });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.62, 2.21);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.62, -2.21);
    group.add(tl);
  }
  // Bumpers.
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.4 });
  for (const bz of [2.22, -2.22]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 0.14), bumperMat);
    bumper.position.set(0, 0.32, bz);
    group.add(bumper);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10);
  hubGeo.rotateZ(Math.PI / 2);
  group.userData.wheels = [];
  group.userData.frontWheels = [];
  for (const [wx, wz, front] of [[-0.95, 1.45, true], [0.95, 1.45, true], [-0.95, -1.45, false], [0.95, -1.45, false]]) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.copy(wheel.position);
    group.add(wheel, hub);
    group.userData.wheels.push(wheel);
    if (front) group.userData.frontWheels.push(wheel);
  }
  if (opts.police) {
    // Black-and-white police livery: white doors + light bar.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.3 });
    for (const sx of [-1.01, 1.01]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.8), doorMat);
      door.position.set(sx, 0.62, 0);
      group.add(door);
    }
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    barBase.position.set(0, 1.45, -0.2);
    group.add(barBase);
    const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    redLens.position.set(-0.3, 1.55, -0.2);
    group.add(redLens);
    const blueLens = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }));
    blueLens.position.set(0.3, 1.55, -0.2);
    group.add(blueLens);
    group.userData.lightBar = [redLens, blueLens];
  }
  return group;
}

export class Car {
  constructor(G, x, z, heading, color, name, opts = {}) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.color = color;
    this.name = name || pick(G.rng, CAR_NAMES);
    this.driver = opts.driver || null; // 'player' | 'traffic' | 'police' | null
    this.isPolice = !!opts.police;
    this.isTarget = !!opts.target;
    this.mesh = buildCarMesh(color, opts);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
    this.steer = 0;
    this.stolen = false;
    this.ai = null;
    G.scene.add(this.mesh);
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade player driving: W/S throttle, A/D steer, Space handbrake.
  updatePlayer(dt) {
    const G = this.G;
    const input = G.input;
    const axis = input.axis();
    const throttle = -axis.z; // W = forward
    const steerInput = axis.x;
    const maxSpeed = 42;
    const accel = 26;
    const brake = 40;
    if (throttle > 0) {
      this.speed += accel * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed -= 12 * dt; // reverse
    } else {
      this.speed = dampSpeed(this.speed, 0, 1.4, dt);
    }
    if (input.down('Space')) this.speed = dampSpeed(this.speed, 0, 6, dt);
    this.speed = clamp(this.speed, -12, maxSpeed);
    const steerTarget = steerInput * 0.55 * clamp(Math.abs(this.speed) / 8, 0, 1);
    this.steer = angleLerp(this.steer, steerTarget, 1 - Math.exp(-8 * dt));
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += (this.steer * dir * clamp(Math.abs(this.speed) / 10, 0, 1) * 1.9) * dt;
    const f = this.forward;
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    const before = { x: nx, z: nz };
    const fixed = resolveCollisions(G, nx, nz, 1.6);
    if (Math.abs(fixed.x - before.x) > 0.01 || Math.abs(fixed.z - before.z) > 0.01) {
      // Hit a building: scrape off speed and play a thud.
      if (Math.abs(this.speed) > 6 && G.audio) G.audio.crash();
      this.speed *= 0.55;
    }
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.syncMesh(dt);
    // Engine audio follows speed.
    if (G.audio) G.audio.setEngine(Math.abs(this.speed) / maxSpeed, true);
  }

  // Simple traffic / police AI update; police cars chase a target position.
  updateAI(dt, target) {
    const G = this.G;
    if (this.isPolice && target) {
      this.updatePoliceChase(dt, target);
      return;
    }
    const ai = this.ai;
    if (!ai) return;
    // Cruise from junction to junction along the road grid: the car always
    // travels exactly along a road centre line, then picks straight/left/right.
    const jx = ai.junction.x;
    const jz = ai.junction.z;
    const dx = jx - this.pos.x;
    const dz = jz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      this.pos.x = jx;
      this.pos.z = jz;
      this.pickNextJunction();
      return;
    }
    const desired = Math.atan2(ai.dir.x, ai.dir.z);
    const diff = angleDiff(this.heading, desired);
    this.heading += clamp(diff, -3.2 * dt, 3.2 * dt);
    // Slow down for the car ahead.
    let targetSpeed = ai.cruise;
    for (const other of G.cars) {
      if (other === this) continue;
      const odx = other.pos.x - this.pos.x;
      const odz = other.pos.z - this.pos.z;
      const along = odx * Math.sin(this.heading) + odz * Math.cos(this.heading);
      const side = Math.abs(odx * Math.cos(this.heading) - odz * Math.sin(this.heading));
      if (along > 0 && along < 11 && side < 2.4) {
        targetSpeed = Math.min(targetSpeed, 0);
      }
    }
    this.speed = dampSpeed(this.speed, targetSpeed, 2, dt);
    this.pos.x += ai.dir.x * this.speed * dt;
    this.pos.z += ai.dir.z * this.speed * dt;
    this.syncMesh(dt);
  }

  updatePoliceChase(dt, target) {
    const G = this.G;
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const diff = angleDiff(this.heading, desired);
    const turnRate = dist < 12 ? 2.6 : 2.0;
    this.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    const targetSpeed = dist > 30 ? 40 : dist > 10 ? 30 : 16;
    this.speed = dampSpeed(this.speed, targetSpeed, 2.2, dt);
    const f = this.forward;
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    const fixed = resolveCollisions(G, nx, nz, 1.6);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    // Ram the player: slow the player's car and nudge the player on foot.
    if (dist < 3.2 && G.player.inCar) {
      const pc = G.player.inCar;
      pc.speed *= 0.92;
      if (Math.abs(pc.speed) > 4 && G.audio) G.audio.crash();
    }
    this.syncMesh(dt);
    // Flash the light bar.
    const t = performance.now() / 180;
    const phase = Math.floor(t) % 2 === 0;
    if (this.mesh.userData.lightBar) {
      this.mesh.userData.lightBar[0].material.emissiveIntensity = phase ? 2.5 : 0.2;
      this.mesh.userData.lightBar[1].material.emissiveIntensity = phase ? 0.2 : 2.5;
    }
  }

  // At a junction, pick the next road to follow: mostly straight, sometimes
  // a turn, never a U-turn unless the road ends at the city edge.
  pickNextJunction() {
    const G = this.G;
    const ai = this.ai;
    const r = G.rng;
    const dirs = [
      { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
    ];
    const cur = ai.dir;
    const straight = { x: cur.x, z: cur.z };
    const left = { x: cur.z, z: -cur.x };
    const right = { x: -cur.z, z: cur.x };
    const roll = r();
    const choice = roll < 0.55 ? straight : roll < 0.78 ? left : right;
    const nx = this.pos.x + choice.x * PITCH;
    const nz = this.pos.z + choice.z * PITCH;
    if (Math.abs(nx) <= HALF + 6 && Math.abs(nz) <= HALF + 6) {
      ai.dir = choice;
      ai.junction = { x: nx, z: nz };
      return;
    }
    // Edge of the city: try the other turn, else reverse.
    const alt = choice === left ? right : left;
    const ax = this.pos.x + alt.x * PITCH;
    const az = this.pos.z + alt.z * PITCH;
    if (Math.abs(ax) <= HALF + 6 && Math.abs(az) <= HALF + 6) {
      ai.dir = alt;
      ai.junction = { x: ax, z: az };
      return;
    }
    ai.dir = { x: -cur.x, z: -cur.z };
    ai.junction = {
      x: this.pos.x - cur.x * PITCH,
      z: this.pos.z - cur.z * PITCH,
    };
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Wheel spin + front-wheel steer.
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    for (const w of this.mesh.userData.frontWheels) w.rotation.y = this.steer * 0.5;
    // Body roll on steering.
    this.mesh.rotation.z = -this.steer * 0.06 * clamp(Math.abs(this.speed) / 20, 0, 1);
  }

  dispose() {
    this.G.scene.remove(this.mesh);
  }
}

function dampSpeed(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// Spawn the traffic fleet + a few parked cars the player can steal.
export function spawnTraffic(G) {
  const r = G.rng;
  G.cars = [];
  const used = new Set();
  function roadSpot() {
    const alongX = r() < 0.5;
    const road = pick(r, G.roads);
    const along = (r() * 2 - 1) * (HALF - 10);
    const lane = (r() < 0.5 ? -1 : 1) * 3;
    const x = alongX ? along : road + lane;
    const z = alongX ? road + lane : along;
    const key = Math.round(x / 10) + ':' + Math.round(z / 10);
    if (used.has(key)) return null;
    used.add(key);
    return { x, z, heading: alongX ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? Math.PI : 0) };
  }
  // 14 traffic cars cruising the grid.
  let spawned = 0;
  let guard = 0;
  while (spawned < 14 && guard++ < 200) {
    const spot = roadSpot();
    if (!spot) continue;
    const color = pick(r, CAR_COLORS);
    const car = new Car(G, spot.x, spot.z, spot.heading, color, null, { driver: 'traffic' });
    const dirX = Math.round(Math.sin(spot.heading));
    const dirZ = Math.round(Math.cos(spot.heading));
    const jx = nearestRoad(G, spot.x);
    const jz = nearestRoad(G, spot.z);
    car.ai = {
      cruise: 9 + r() * 6,
      dir: { x: dirX, z: dirZ },
      junction: { x: jx, z: jz },
    };
    // Junction ahead of the car along its travel direction.
    const aheadX = spot.x + dirX * PITCH;
    const aheadZ = spot.z + dirZ * PITCH;
    if (Math.abs(aheadX) <= HALF && Math.abs(aheadZ) <= HALF) {
      car.ai.junction = {
        x: dirX !== 0 ? aheadX : nearestRoad(G, spot.x),
        z: dirZ !== 0 ? aheadZ : nearestRoad(G, spot.z),
      };
    }
    G.cars.push(car);
    spawned++;
  }
  // 6 parked cars along road edges, free to steal.
  const parkedSpots = [
    { x: 3, z: 26, h: 0 },
    { x: -3, z: -20, h: Math.PI },
    { x: 55, z: 8, h: 0 },
    { x: -55, z: -60, h: Math.PI },
    { x: 107, z: 150, h: 0 },
    { x: -107, z: 60, h: Math.PI },
  ];
  for (const s of parkedSpots) {
    const color = pick(r, CAR_COLORS);
    const car = new Car(G, s.x, s.z, s.h, color, null, { driver: null });
    G.cars.push(car);
  }
  return G.cars;
}

// The nearest stealable car within range of a point, or null.
export function nearestCar(G, x, z, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of G.cars) {
    if (car.driver === 'police') continue;
    const d = dist2D(x, z, car.pos.x, car.pos.z);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}
