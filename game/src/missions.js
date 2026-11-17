// missions.js — Vera Solano's three-job chain for Kai Mercer. Each mission
// is: go to a marker, do the thing, get paid. Completing all three unlocks
// free-roam "Vera's jobs" that repeat for smaller payouts.

import * as THREE from 'three';
import { fmtMoney, dist2D } from './util.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { pick } from './util.js';

export const MISSION_DEFS = [
  {
    id: 'first-run',
    title: 'First Run',
    payout: 500,
    brief: 'Vera: "Pick up the package at the pier, then drop it at Alba Plaza. No cops, no questions."',
    steps: [
      { kind: 'goto', label: 'Pick up the package at Alba Pier', target: 'pier', color: 0x2ad86a },
      { kind: 'goto', label: 'Deliver the package to Alba Plaza', target: 'park', color: 0x2ad86a },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    payout: 1200,
    brief: 'Vera: "A Coral Sedan is parked by the plaza. Bring it to my garage — in one piece. The PD will notice."',
    steps: [
      { kind: 'steal', label: 'Steal the marked Coral Sedan', target: 'park', color: 0xe8c33c },
      { kind: 'deliver-car', label: 'Deliver the car to Vera\'s Garage', target: 'garage', color: 0xe8c33c },
    ],
  },
  {
    id: 'heat-escape',
    title: 'Heat Escape',
    payout: 2500,
    brief: 'Vera: "The PD put your face on every screen in Alba. Lose them, then lay low at the safehouse by the beach."',
    steps: [
      { kind: 'lose-heat', label: 'Lose the heat — get wanted down to 0', target: null, color: 0xd83a2a },
      { kind: 'goto', label: 'Reach the Safehouse', target: 'hideout', color: 0x2ad86a },
    ],
  },
];

export class MissionManager {
  constructor(G) {
    this.G = G;
    this.index = 0; // which mission of the chain is active
    this.step = 0;
    this.active = false;
    this.completed = 0;
    this.totalEarned = 0;
    this.targetCar = null;
    this.repeatCount = 0;
    this.waitTimer = 0;
  }

  get current() {
    return this.index < MISSION_DEFS.length ? MISSION_DEFS[this.index] : null;
  }

  get currentStep() {
    const m = this.current;
    return m ? m.steps[this.step] : null;
  }

  get currentLabel() {
    const s = this.currentStep;
    if (!this.active || !s) return this.index >= MISSION_DEFS.length ? 'All jobs done — free roam. Vera has repeat work: press J for a new job.' : '';
    return s.label;
  }

  start() {
    const G = this.G;
    if (this.active) return;
    const m = this.current;
    if (!m) return;
    this.active = true;
    this.step = 0;
    if (G.hud) G.hud.showBrief(m.title, m.brief);
    if (G.audio) G.audio.phone();
    this.setupStep();
  }

  // Repeatable side jobs after the chain is done.
  startRepeatJob() {
    const G = this.G;
    if (this.active || this.index < MISSION_DEFS.length) return false;
    this.repeatCount++;
    const spots = ['pier', 'park', 'garage', 'hideout'];
    const a = pick(G.rng, spots);
    let b = pick(G.rng, spots);
    while (b === a) b = pick(G.rng, spots);
    this.repeatJob = {
      payout: 250 + this.repeatCount * 50,
      steps: [
        { kind: 'goto', label: 'Pick up at ' + G.landmarks[a].label, target: a, color: 0x2ad86a },
        { kind: 'goto', label: 'Drop off at ' + G.landmarks[b].label, target: b, color: 0x2ad86a },
      ],
    };
    this.active = true;
    this.step = 0;
    if (G.hud) G.hud.showBrief('Side Job #' + this.repeatCount, 'Vera: "Quick courier run. ' + G.landmarks[a].label + ' to ' + G.landmarks[b].label + ' — ' + fmtMoney(this.repeatJob.payout) + '."');
    if (G.audio) G.audio.phone();
    this.setupStep();
    return true;
  }

  def() {
    return this.repeatJob || this.current;
  }

  setupStep() {
    const G = this.G;
    const s = this.currentStep;
    if (!s) return;
    if (s.kind === 'steal') this.spawnTargetCar();
    if (s.kind === 'lose-heat') {
      G.wanted.addCrime(3, 'The whole PD is looking for you!');
      if (G.hud) G.hud.toast('WANTED 3 — lose the cops, then reach the Safehouse!');
    }
    this.placeBeacon();
  }

  placeBeacon() {
    const G = this.G;
    const s = this.currentStep;
    if (!s) {
      G.effects.clearBeacon();
      return;
    }
    if (s.kind === 'steal' && this.targetCar) {
      G.effects.setBeacon(this.targetCar.pos.x, this.targetCar.pos.z, s.color);
    } else if (s.kind === 'deliver-car') {
      const lm = G.landmarks[s.target];
      G.effects.setBeacon(lm.x, lm.z, s.color);
    } else if (s.kind === 'lose-heat') {
      G.effects.clearBeacon();
    } else if (s.target) {
      const lm = G.landmarks[s.target];
      G.effects.setBeacon(lm.x, lm.z, s.color);
    }
  }

  spawnTargetCar() {
    const G = this.G;
    const park = G.landmarks.park;
    const car = new Car(G, park.x + 14, park.z + 6, Math.PI / 2, 0xd87a2a, 'Coral Sedan', { driver: null, target: true });
    G.cars.push(car);
    this.targetCar = car;
    if (G.hud) G.hud.toast('Target car marked — gold beacon by the plaza.');
  }

  update(dt) {
    const G = this.G;
    if (!this.active) return;
    const s = this.currentStep;
    if (!s) return;
    const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
    if (s.kind === 'steal') {
      // Beacon follows the target car while it sits parked.
      if (this.targetCar && !G.player.inCar) {
        G.effects.moveBeacon(this.targetCar.pos.x, this.targetCar.pos.z);
      }
      if (G.player.inCar === this.targetCar) {
        if (G.audio) G.audio.pickup();
        if (G.hud) G.hud.toast('Got the Coral Sedan — now get it to the garage!');
        G.wanted.addCrime(1, 'Grand theft auto!');
        this.advance();
      }
      return;
    }
    if (s.kind === 'deliver-car') {
      const lm = G.landmarks[s.target];
      if (G.player.inCar === this.targetCar &&
        dist2D(p.x, p.z, lm.x, lm.z) < 12) {
        // Hand the car over: it parks in the garage and the player steps out.
        const car = this.targetCar;
        G.player.exitCar();
        car.driver = null;
        car.ai = null;
        car.speed = 0;
        car.pos.set(lm.x, 0, lm.z - 4);
        car.heading = Math.PI;
        car.syncMesh(0);
        this.targetCar = null;
        this.advance();
      }
      return;
    }
    if (s.kind === 'lose-heat') {
      if (G.wanted.level === 0) this.advance();
      return;
    }
    // goto steps.
    const lm = G.landmarks[s.target];
    if (lm && dist2D(p.x, p.z, lm.x, lm.z) < 7) {
      if (G.audio) G.audio.pickup();
      this.advance();
    }
  }

  advance() {
    const G = this.G;
    const def = this.def();
    this.step++;
    if (this.step >= def.steps.length) {
      this.completeMission(def);
      return;
    }
    this.setupStep();
    if (G.hud) G.hud.toast(this.currentStep.label);
  }

  completeMission(def) {
    const G = this.G;
    this.active = false;
    this.completed++;
    this.totalEarned += def.payout;
    G.cash += def.payout;
    if (G.audio) G.audio.cash();
    if (G.effects) {
      const p = G.player.inCar ? G.player.inCar.pos : G.player.pos;
      G.effects.burst(new THREE.Vector3(p.x, 2, p.z), 0xe8c33c, 24, 6, 0.9, 3);
    }
    G.effects.clearBeacon();
    if (G.hud) {
      G.hud.showBrief('Job complete — ' + fmtMoney(def.payout), 'Vera: "Clean work, Kai. The money is yours."');
      G.hud.toast('+' + fmtMoney(def.payout) + ' — total earned ' + fmtMoney(this.totalEarned));
    }
    this.repeatJob = null;
    if (this.index < MISSION_DEFS.length) this.index++;
    G.saveGame();
    // Chain the next job after a short breather.
    this.waitTimer = 4;
  }

  tick(dt) {
    if (this.waitTimer > 0 && !this.active) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        if (this.index < MISSION_DEFS.length) this.start();
        else if (this.G.hud) this.G.hud.toast('All story jobs done! Press J for Vera\'s repeat work.');
      }
    }
    this.update(dt);
  }
}
