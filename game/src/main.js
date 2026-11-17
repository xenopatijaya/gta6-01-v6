// main.js — Porto Alba bootstrap: renderer, third-person camera, game loop,
// state machine (menu / play / busted / down), car enter/exit, and the
// ?shot= scene presets the screenshots use. No network requests at runtime.

import * as THREE from 'three';
import { mulberry32, clamp, damp, angleLerp } from './util.js';
import { createCity, HALF } from './city.js';
import { Player } from './player.js';
import { spawnTraffic, nearestCar } from './vehicles.js';
import { spawnPedestrians } from './pedestrians.js';
import { WantedSystem } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, applySave, clearSave } from './save.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261118);
const shot = params.get('shot') || '';

const G = {
  seed,
  rng: mulberry32(seed),
  state: 'menu', // menu | play | busted | down
  paused: false,
  cash: 150,
  playSeconds: 0,
  time: 0,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 10,
  autosaveTimer: 0,
};
window.__game = G;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
G.renderer = renderer;

const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
G.camera = camera;

G.input = new Input(canvas);
G.audio = new AudioEngine();
G.effects = new Effects(G);
createCity(G);
G.player = new Player(G);
spawnTraffic(G);
spawnPedestrians(G, 26);
G.wanted = new WantedSystem(G);
G.combat = new Combat(G);
G.missions = new MissionManager(G);
G.hud = new HUD(G);
G.saveGame = () => writeSave(G);

// --- camera ----------------------------------------------------------------
const camTarget = new THREE.Vector3();
const camIdeal = new THREE.Vector3();

function updateCamera(dt) {
  const input = G.input;
  const mouse = input.consumeMouse();
  G.cameraYaw -= mouse.dx * 0.0032;
  G.cameraPitch = clamp(G.cameraPitch + mouse.dy * 0.0022, 0.08, 0.9);
  if (input.down('KeyQ')) G.cameraYaw += 1.6 * dt;
  // E also orbits the camera — but never while a car is close enough to steal,
  // so E stays free as the steal/exit key.
  if (input.down('KeyE') && !G.player.inCar) {
    const near = nearestCar(G, G.player.pos.x, G.player.pos.z, 6);
    if (!near) G.cameraYaw -= 1.6 * dt;
  }

  const focus = G.player.inCar ? G.player.inCar.pos : G.player.pos;
  const driving = !!G.player.inCar;
  const wantDist = driving ? 13 : 9.5;
  const wantHeight = driving ? 4.6 : 3.4;
  G.cameraDist = damp(G.cameraDist, wantDist, 4, dt);
  // When driving, the camera swings behind the car; on foot it stays free.
  if (driving) {
    const carYaw = G.player.inCar.heading + Math.PI;
    G.cameraYaw = angleLerp(G.cameraYaw, carYaw, 1 - Math.exp(-1.6 * dt));
  }
  camTarget.set(focus.x, focus.y + 1.6, focus.z);
  const cx = camTarget.x - Math.sin(G.cameraYaw) * Math.cos(G.cameraPitch) * G.cameraDist;
  const cz = camTarget.z - Math.cos(G.cameraYaw) * Math.cos(G.cameraPitch) * G.cameraDist;
  const cy = camTarget.y + Math.sin(G.cameraPitch) * G.cameraDist + wantHeight * 0.35;
  camIdeal.set(cx, cy, cz);
  // Pull the camera in if a building stands between it and the player.
  let dist = G.cameraDist;
  for (let t = 1; t > 0.25; t -= 0.08) {
    const px = camTarget.x + (camIdeal.x - camTarget.x) * t;
    const py = camTarget.y + (camIdeal.y - camTarget.y) * t;
    const pz = camTarget.z + (camIdeal.z - camTarget.z) * t;
    let blocked = false;
    for (const c of G.colliders) {
      if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ && py < (c.h || 20) + 0.5) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      dist = G.cameraDist * t;
      break;
    }
  }
  const fx = camTarget.x - Math.sin(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
  const fz = camTarget.z - Math.cos(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
  const fy = camTarget.y + Math.sin(G.cameraPitch) * dist + wantHeight * 0.35;
  camera.position.set(fx, Math.max(fy, 1.2), fz);
  // Look slightly ahead of the player in the direction of travel.
  const lookX = camTarget.x + Math.sin(G.cameraYaw) * 4;
  const lookZ = camTarget.z + Math.cos(G.cameraYaw) * 4;
  camera.lookAt(lookX, camTarget.y + 0.4, lookZ);
}

// --- overlays: start screen, busted, wasted --------------------------------
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endBody = document.getElementById('end-body');
const endButton = document.getElementById('end-button');
const startButton = document.getElementById('start-button');
const continueButton = document.getElementById('continue-button');
const saved = loadSave();
if (!saved) continueButton.style.display = 'none';
else continueButton.textContent = 'CONTINUE — ' + '$' + saved.cash + ' · ' + saved.missionsCompleted + ' jobs done';

function startGame(fromSave) {
  G.audio.init();
  startScreen.style.display = 'none';
  endScreen.style.display = 'none';
  G.state = 'play';
  if (fromSave && saved) {
    applySave(G, saved);
    G.hud.toast('Welcome back, Kai. Vera has work for you.');
  }
  G.missions.start();
  G.hud.toast('WASD move · E steal car · Click shoot · M mute');
}

startButton.addEventListener('click', () => startGame(false));
continueButton.addEventListener('click', () => startGame(true));
endButton.addEventListener('click', () => {
  endScreen.style.display = 'none';
  G.player.health = 100;
  G.wanted.clearAll();
  const park = G.landmarks.park;
  G.player.pos.set(park.x, 0, park.z + 10);
  G.player.group.position.copy(G.player.pos);
  G.state = 'play';
  G.hud.toast('Back on the streets of Porto Alba.');
});

G.onBusted = () => {
  if (G.state !== 'play') return;
  G.state = 'busted';
  const fine = Math.min(200, G.cash);
  G.cash -= fine;
  G.wanted.clearAll();
  endTitle.textContent = 'BUSTED';
  endTitle.style.color = '#4488ff';
  endBody.textContent = 'The Alba PD hauled you in. Bail cost $' + fine + '. Your car is impounded — you are back at Alba Plaza on foot.';
  endButton.textContent = 'BACK TO THE STREETS';
  endScreen.style.display = 'flex';
  G.saveGame();
};

G.onPlayerDown = () => {
  if (G.state !== 'play') return;
  G.state = 'down';
  const bill = Math.floor(G.cash * 0.1);
  G.cash -= bill;
  G.wanted.clearAll();
  endTitle.textContent = 'WASTED';
  endTitle.style.color = '#ff4444';
  endBody.textContent = 'You woke up at Alba General. The hospital bill was $' + bill + '. Vera says: next time, shoot first.';
  endButton.textContent = 'GET UP';
  endScreen.style.display = 'flex';
  G.saveGame();
};

// --- interaction: steal / exit car ------------------------------------------
function handleInteraction() {
  const input = G.input;
  if (!input.wasPressed('KeyE')) return;
  if (G.state !== 'play') return;
  if (G.player.inCar) {
    G.player.exitCar();
    if (G.audio) G.audio.blip(440, 0.08, 'sine', 0.2);
    return;
  }
  const car = nearestCar(G, G.player.pos.x, G.player.pos.z, 4.5);
  if (car) {
    const wasParked = car.driver === null;
    G.player.enterCar(car);
    if (G.audio) G.audio.blip(520, 0.1, 'sine', 0.25);
    if (wasParked && !car.stolen) {
      car.stolen = true;
      G.wanted.addCrime(1, 'Grand theft auto!');
    }
    G.hud.toast('Driving the ' + car.name + ' — W/S drive, Space brake, E exit');
  }
}

function updatePrompt() {
  if (G.state !== 'play' || G.player.inCar) {
    G.hud.setPrompt('');
    return;
  }
  const car = nearestCar(G, G.player.pos.x, G.player.pos.z, 4.5);
  G.hud.setPrompt(car ? 'Press E to steal the ' + car.name : '');
}

// --- pause / mute / repeat job ----------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    G.audio.setMuted(!G.audio.muted);
    G.hud.toast(G.audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
  }
  if (e.code === 'KeyP' && G.state === 'play') {
    G.paused = !G.paused;
    G.hud.toast(G.paused ? 'PAUSED — press P to resume' : 'Resumed');
  }
  if (e.code === 'KeyJ' && G.state === 'play') {
    G.missions.startRepeatJob();
  }
  if (e.code === 'KeyF' && G.state === 'play') {
    // F is handled by combat as a fire key; nothing extra here.
  }
});

// --- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsLastReal = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  if (G.state === 'play' && !G.paused) {
    G.playSeconds += dt;
    G.player.update(dt);
    if (G.player.inCar) G.player.inCar.updatePlayer(dt);
    for (const car of G.cars) {
      if (car.driver === 'traffic') car.updateAI(dt, null);
    }
    for (const ped of G.peds) ped.update(dt);
    G.wanted.update(dt);
    G.combat.update(dt);
    G.missions.tick(dt);
    G.audio.update(dt, G.wanted.level);
    handleInteraction();
    updatePrompt();
    // Autosave every 30 seconds.
    G.autosaveTimer += dt;
    if (G.autosaveTimer > 30) {
      G.autosaveTimer = 0;
      G.saveGame();
    }
    // Traffic cars that got shot empty stay parked; respawn is not needed.
  }
  // The world keeps breathing behind menus: peds stroll, sea moves.
  if (G.state !== 'play') {
    for (const ped of G.peds) ped.update(dt);
    for (const car of G.cars) {
      if (car.driver === 'traffic') car.updateAI(dt, null);
    }
  }
  G.effects.update(dt);
  updateCamera(dt);
  G.hud.update(dt);
  renderer.render(scene, camera);
  G.input.endFrame();
  fpsFrames++;
  // FPS is measured in real time, not game dt (dt is capped at 0.05, so a
  // slow frame would otherwise under-report the real frame rate).
  const nowReal = performance.now();
  if (nowReal - fpsLastReal >= 1000) {
    G.fps = Math.round((fpsFrames * 1000) / (nowReal - fpsLastReal));
    fpsFrames = 0;
    fpsLastReal = nowReal;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- ?shot= presets: fixed scenes for the screenshots ------------------------
function applyShotPreset() {
  if (!shot) return;
  G.audio.init = () => {};
  startScreen.style.display = 'none';
  G.state = 'play';
  const park = G.landmarks.park;
  if (shot === 'start') {
    // Start screen over the live city.
    G.state = 'menu';
    startScreen.style.display = 'flex';
    G.player.pos.set(0, 0, 26);
    G.cameraYaw = Math.PI;
    return;
  }
  if (shot === 'play') {
    G.player.pos.set(0, 0, 26);
    G.cameraYaw = Math.PI;
    G.missions.start();
    return;
  }
  if (shot === 'drive') {
    const car = nearestCar(G, 0, 26, 60) || G.cars[0];
    G.player.pos.set(car.pos.x - 3, 0, car.pos.z);
    G.player.enterCar(car);
    car.speed = 18;
    G.missions.start();
    return;
  }
  if (shot === 'chase') {
    const car = nearestCar(G, 0, 26, 60) || G.cars[0];
    G.player.pos.set(car.pos.x - 3, 0, car.pos.z);
    G.player.enterCar(car);
    car.speed = 22;
    G.wanted.level = 3;
    G.wanted.spawnPoliceCar({ silent: true, dist: 26 });
    G.wanted.spawnPoliceCar({ silent: true, dist: 32 });
    G.wanted.spawnPoliceCar({ silent: true, dist: 38 });
    G.missions.start();
    G.hud.toast('WANTED 3 — lose the cops!');
    return;
  }
  if (shot === 'mission') {
    G.player.pos.set(park.x - 20, 0, park.z + 30);
    G.cameraYaw = Math.PI * 0.9;
    G.missions.start();
    return;
  }
}

applyShotPreset();
animate();

// --- debug / test hooks (window.__game) ---------------------------------------
G.debug = {
  state: () => G.state,
  cash: () => G.cash,
  wanted: () => G.wanted.level,
  health: () => Math.round(G.player.health),
  mission: () => ({
    index: G.missions.index,
    step: G.missions.step,
    active: G.missions.active,
    completed: G.missions.completed,
    label: G.missions.currentLabel,
  }),
  counts: () => ({
    cars: G.cars.length,
    traffic: G.cars.filter((c) => c.driver === 'traffic').length,
    peds: G.peds.length,
    pedsAlive: G.peds.filter((p) => p.alive).length,
    policeCars: G.wanted.policeCars.length,
    buildings: G.buildingCount,
    colliders: G.colliders.length,
  }),
  playerPos: () => {
    const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    return { x: p.x, z: p.z, inCar: !!G.player.inCar };
  },
  inCar: () => !!G.player.inCar,
  carSpeed: () => (G.player.inCar ? Math.abs(G.player.inCar.speed) : 0),
  fps: () => G.fps || 0,
  beacon: () => (G.effects.beacon ? { x: G.effects.beacon.x, z: G.effects.beacon.z } : null),
  teleport: (x, z) => {
    if (G.player.inCar) {
      G.player.inCar.pos.set(x, 0, z);
    } else {
      G.player.pos.set(x, 0, z);
    }
  },
  setWanted: (n) => { G.wanted.level = n; },
  startGame: () => startGame(false),
  enterNearestCar: () => {
    const car = nearestCar(G, G.player.pos.x, G.player.pos.z, 6);
    if (car) {
      G.player.enterCar(car);
      return car.name;
    }
    return null;
  },
  fire: () => G.combat.fire(),
  saveNow: () => writeSave(G),
  clearSave,
  landmarks: () => JSON.parse(JSON.stringify(G.landmarks)),
};
