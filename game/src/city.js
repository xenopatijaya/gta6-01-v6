// city.js — Porto Alba: a fictional sun-soaked coastal city on a 6x6 block grid.
// Roads, buildings with lit windows, palms, lamps, a park, a beach and the sea.
// All geometry is procedural boxes/cylinders; window and road textures are
// painted on canvas at runtime, so the game ships zero image files.

import * as THREE from 'three';
import { mulberry32, pick, clamp } from './util.js';

export const BLOCK = 40;
export const ROAD = 12;
export const PITCH = BLOCK + ROAD; // 52
export const GRID = 6;
export const HALF = (GRID * BLOCK + (GRID + 1) * ROAD) / 2; // 162

// Road centre lines, from -156 to +156 in steps of 52.
export function roadCenters() {
  const out = [];
  for (let i = 0; i <= GRID; i++) out.push(-HALF + ROAD / 2 + i * PITCH);
  return out;
}

// Block centres: -130, -78, -26, 26, 78, 130.
export function blockCenters() {
  const out = [];
  for (let i = 0; i < GRID; i++) out.push(-HALF + ROAD + BLOCK / 2 + i * PITCH);
  return out;
}

function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = 10;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      const warm = rng() < 0.7;
      g.fillStyle = lit
        ? warm ? '#ffd98a' : '#bfe6ff'
        : '#1d2733';
      g.fillRect(8 + x * 24, 10 + y * 24, 16, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3138';
  g.fillRect(0, 0, 128, 128);
  // Subtle asphalt speckle.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // Centre dashes, repeated along the strip.
  g.fillStyle = '#e8c33c';
  g.fillRect(62, 8, 4, 44);
  g.fillRect(62, 76, 4, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTE = [
  '#e8b48a', '#d99a7c', '#c98f6b', '#a8c4d4', '#8fb8a8',
  '#e3d3a8', '#c4a8c4', '#b8c4d4', '#d4a08a', '#9ab89a',
  '#e0c090', '#7fa8b8', '#d8b090', '#b0a8d0',
];

export function createCity(G) {
  const rng = mulberry32(G.seed);
  const scene = G.scene;
  const group = new THREE.Group();
  group.name = 'PortoAlbaCity';
  scene.add(group);

  const roads = roadCenters();
  const blocks = blockCenters();
  G.roads = roads;
  G.blocks = blocks;
  G.colliders = [];
  G.landmarks = {};

  // --- sky, sun, fog -------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b8, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.fog = new THREE.Fog(0xf6d9a8, 320, 720);
  G.renderer.setClearColor(0x87b8e0);

  // --- ground, beach, sea --------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x9aa08a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 10);
  ground.receiveShadow = true;
  group.add(ground);

  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe8d49a, roughness: 1 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 60, 46), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, HALF + 23);
  sand.receiveShadow = true;
  group.add(sand);

  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x2a7fa8, roughness: 0.25, metalness: 0.15,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 400), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, HALF + 46 + 200);
  group.add(sea);
  G.sea = sea;

  // --- roads ---------------------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const roadMatPlain = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  for (const c of roads) {
    // North-south strip.
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.rotation.z = Math.PI / 2;
    ns.position.set(c, 0.03, 0);
    ns.receiveShadow = true;
    roadTex.repeat.set(1, 1);
    group.add(ns);
    // East-west strip.
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, ROAD), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.035, c);
    ew.receiveShadow = true;
    group.add(ew);
  }
  // Re-apply repeat per strip: each road texture tiles along its length.
  for (const child of group.children) {
    if (child.material === roadMat) {
      const tex = child.material.map.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, Math.round((HALF * 2) / 12));
      child.material = roadMatPlain.clone();
      child.material.map = tex;
    }
  }

  // --- sidewalks / block slabs ---------------------------------------------
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
  for (const bx of blocks) {
    for (const bz of blocks) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.3, BLOCK), slabMat);
      slab.position.set(bx, 0.1, bz);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // --- buildings -----------------------------------------------------------
  const winTexA = windowTexture(rng, '#8a6a58', 0.35);
  const winTexB = windowTexture(rng, '#6a7a8a', 0.3);
  const winTexC = windowTexture(rng, '#a8886a', 0.42);
  const winTexs = [winTexA, winTexB, winTexC];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 1 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9ac8e0, roughness: 0.1, metalness: 0.6,
  });

  let buildingCount = 0;
  const parkBX = 0;
  const parkBZ = 0;
  for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
      const bx = blocks[ix];
      const bz = blocks[iz];
      // Centre block is the park (Alba Plaza); the south-west block holds Vera's garage.
      if (ix === 2 && iz === 2) continue; // park, built below
      if (ix === 1 && iz === 4) continue; // garage block, built below
      const kind = rng();
      if (kind < 0.22) {
        // Low row of shops along the block edge.
        for (let s = 0; s < 3; s++) {
          const w = 10;
          const h = 5 + rng() * 3;
          const d = 9;
          const x = bx - 12 + s * 12;
          const z = bz - 8 + (rng() < 0.5 ? -6 : 6);
          addBuilding(x, z, w, h, d);
        }
      } else if (kind < 0.6) {
        // One mid tower + one low block.
        addBuilding(bx - 6, bz - 4, 16, 14 + rng() * 18, 16);
        addBuilding(bx + 9, bz + 8, 12, 6 + rng() * 4, 10);
      } else {
        // Two towers.
        addBuilding(bx - 8, bz - 7, 14, 18 + rng() * 22, 14);
        addBuilding(bx + 8, bz + 7, 14, 12 + rng() * 16, 14);
      }
    }
  }

  function addBuilding(x, z, w, h, d) {
    const color = pick(rng, PALETTE);
    const tex = pick(rng, winTexs);
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const top = new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: 1 });
    const mats = [side, side, top, roofMat, side, side];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    mesh.position.set(x, h / 2 + 0.25, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Roof details: AC box + antenna on taller towers.
    if (h > 16) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2.4), roofMat);
      ac.position.set(x + w / 4, h + 0.85, z);
      group.add(ac);
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333 }),
      );
      ant.position.set(x - w / 4, h + 3.5, z - d / 4);
      group.add(ant);
    }
    // Glass storefront strip on low buildings.
    if (h < 9) {
      const shop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 2.2, 0.4), glassMat);
      shop.position.set(x, 1.4, z + d / 2 + 0.2);
      group.add(shop);
    }
    G.colliders.push({
      minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4,
      minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4, h,
    });
    buildingCount++;
  }

  // --- Alba Plaza park (centre block) --------------------------------------
  const parkX = blocks[2];
  const parkZ = blocks[2];
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5a9a4a, roughness: 1 });
  const grass = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 2, 0.5, BLOCK - 2), grassMat);
  grass.position.set(parkX, 0.3, parkZ);
  grass.receiveShadow = true;
  group.add(grass);
  const fountainMat = new THREE.MeshStandardMaterial({ color: 0x8ab8d8, roughness: 0.2, metalness: 0.3 });
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 1.2, 20), fountainMat);
  fountain.position.set(parkX, 0.9, parkZ);
  fountain.castShadow = true;
  group.add(fountain);
  const fountainJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.6, 3.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, transparent: true, opacity: 0.75 }),
  );
  fountainJet.position.set(parkX, 2.8, parkZ);
  group.add(fountainJet);
  G.landmarks.park = { x: parkX, z: parkZ, label: 'Alba Plaza' };

  // --- Vera's garage (south-west block) ------------------------------------
  const gx = blocks[1];
  const gz = blocks[4];
  const garageMat = new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.7 });
  const garage = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 18), garageMat);
  garage.position.set(gx, 4.75, gz);
  garage.castShadow = true;
  garage.receiveShadow = true;
  group.add(garage);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.4, metalness: 0.5 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.5), doorMat);
  door.position.set(gx, 3.2, gz + 9.2);
  group.add(door);
  // Neon sign bar over the door.
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xff4a6a, emissive: 0xff2a4a, emissiveIntensity: 1.6,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(18, 1.1, 0.6), signMat);
  sign.position.set(gx, 7.6, gz + 9.3);
  group.add(sign);
  G.colliders.push({
    minX: gx - 13.4, maxX: gx + 13.4, minZ: gz - 9.4, maxZ: gz + 9.4, h: 9,
  });
  G.landmarks.garage = { x: gx, z: gz + 14, label: "Vera's Garage" };

  // --- hideout: small shack near the pier ----------------------------------
  const hx = blocks[5] - 6;
  const hz = HALF + 12;
  const shackMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  const shack = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), shackMat);
  shack.position.set(hx, 2.75, hz);
  shack.castShadow = true;
  group.add(shack);
  G.colliders.push({ minX: hx - 5.4, maxX: hx + 5.4, minZ: hz - 4.4, maxZ: hz + 4.4, h: 5 });
  G.landmarks.hideout = { x: hx, z: hz - 8, label: 'Safehouse' };

  // --- pier -----------------------------------------------------------------
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 34), pierMat);
  pier.position.set(blocks[5], 0.5, HALF + 30);
  pier.receiveShadow = true;
  group.add(pier);
  G.landmarks.pier = { x: blocks[5], z: HALF + 40, label: 'Alba Pier' };

  // --- palms, lamps, traffic lights -----------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 1 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a0, emissive: 0xffd070, emissiveIntensity: 1.2,
  });
  function palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 8), trunkMat);
    trunk.position.set(x, 3.7, z);
    trunk.castShadow = true;
    group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 5), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.6, 7.6, z + Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = -Math.sin(a) * 0.9;
      group.add(leaf);
    }
  }
  function lamp(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 8), lampMat);
    pole.position.set(x, 3.2, z);
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), lampMat);
    arm.position.set(x + 0.7, 6.1, z);
    group.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bulbMat);
    bulb.position.set(x + 1.4, 6.0, z);
    group.add(bulb);
  }
  for (let i = 0; i < 40; i++) {
    const bx = pick(rng, blocks);
    const bz = pick(rng, blocks);
    const edge = rng();
    let x;
    let z;
    if (edge < 0.5) {
      x = bx + (rng() < 0.5 ? -1 : 1) * (BLOCK / 2 - 2);
      z = bz + (rng() * 2 - 1) * (BLOCK / 2 - 3);
    } else {
      x = bx + (rng() * 2 - 1) * (BLOCK / 2 - 3);
      z = bz + (rng() < 0.5 ? -1 : 1) * (BLOCK / 2 - 2);
    }
    palm(x, z);
  }
  // Palms along the beach.
  for (let i = 0; i < 12; i++) {
    palm(-HALF + 20 + i * 28 + rng() * 6, HALF + 10 + rng() * 8);
  }
  // Lamps at every intersection corner.
  for (const rx of roads) {
    for (const rz of roads) {
      if (rng() < 0.75) lamp(rx + ROAD / 2 + 1.2, rz + ROAD / 2 + 1.2);
    }
  }
  // Traffic lights at the four central intersections.
  const tlPoleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const tlRed = new THREE.MeshStandardMaterial({ color: 0x882222, emissive: 0xff2222, emissiveIntensity: 0.9 });
  const tlGreen = new THREE.MeshStandardMaterial({ color: 0x228822, emissive: 0x22ff44, emissiveIntensity: 0.9 });
  for (const rx of [-52, 0, 52]) {
    for (const rz of [-52, 0, 52]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.4, 8), tlPoleMat);
      pole.position.set(rx + 7, 2.7, rz + 7);
      group.add(pole);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), tlPoleMat);
      box.position.set(rx + 7, 5.6, rz + 7);
      group.add(box);
      const lampMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8), rng() < 0.5 ? tlRed : tlGreen,
      );
      lampMesh.position.set(rx + 7, 6.1, rz + 7);
      group.add(lampMesh);
    }
  }

  G.cityGroup = group;
  G.buildingCount = buildingCount;
  return group;
}

// Push a circle (x, z, radius) out of every building AABB. Returns corrected x/z.
export function resolveCollisions(G, x, z, radius) {
  for (const c of G.colliders) {
    const cx = clamp(x, c.minX, c.maxX);
    const cz = clamp(z, c.minZ, c.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // Inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX;
        const pr = c.maxX - x;
        const pt = z - c.minZ;
        const pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius;
        else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  const lim = HALF + 44;
  x = clamp(x, -lim, lim);
  z = clamp(z, -HALF - 2, HALF + 44);
  return { x, z };
}

// Is this point on a road (drivable strip)?
export function onRoad(G, x, z) {
  for (const c of G.roads) {
    if (Math.abs(x - c) < ROAD / 2 + 0.5) return true;
    if (Math.abs(z - c) < ROAD / 2 + 0.5) return true;
  }
  return false;
}

// Nearest road centre coordinate for an axis value (used by traffic AI).
export function nearestRoad(G, v) {
  let best = G.roads[0];
  let bd = Infinity;
  for (const c of G.roads) {
    const d = Math.abs(v - c);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
