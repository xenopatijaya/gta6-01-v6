// effects.js — tracers, muzzle flashes, impacts, sparks, smoke and the
// mission beacon: short-lived meshes pooled per frame, no textures needed.

import * as THREE from 'three';

export class Effects {
  constructor(G) {
    this.G = G;
    this.particles = [];
    this.tracers = [];
    this.beacon = null;
    this.beaconLight = null;
    this._particleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  }

  // A glowing vertical beam + ring marking the current objective.
  setBeacon(x, z, color) {
    this.clearBeacon();
    const G = this.G;
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
    beam.position.set(x, 30, z);
    G.scene.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.25, z);
    G.scene.add(ring);
    this.beacon = { beam, ring, color, x, z, phase: 0 };
  }

  // Move an existing beacon without rebuilding its meshes (called per frame).
  moveBeacon(x, z) {
    if (!this.beacon) return;
    this.beacon.beam.position.set(x, 30, z);
    this.beacon.ring.position.set(x, 0.25, z);
    this.beacon.x = x;
    this.beacon.z = z;
  }

  clearBeacon() {
    if (!this.beacon) return;
    this.G.scene.remove(this.beacon.beam, this.beacon.ring);
    this.beacon.beam.geometry.dispose();
    this.beacon.beam.material.dispose();
    this.beacon.ring.geometry.dispose();
    this.beacon.ring.material.dispose();
    this.beacon = null;
  }

  tracer(from, to) {
    const G = this.G;
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe89a, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    G.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09 });
    this.muzzle(from.x, from.y, from.z, to);
  }

  muzzle(x, y, z, target) {
    const G = this.G;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 1 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), mat);
    flash.position.set(x, y, z);
    G.scene.add(flash);
    this.tracers.push({ mesh: flash, life: 0.06 });
  }

  burst(pos, color, count, speed, life, gravity) {
    const G = this.G;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this._particleGeo, mat);
      mesh.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const v = new THREE.Vector3(
        Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b),
      ).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      G.scene.add(mesh);
      this.particles.push({ mesh, vel: v, life: life * (0.6 + Math.random() * 0.7), maxLife: life, gravity: gravity || 0 });
    }
  }

  impact(pos) {
    this.burst(pos, 0xd8d8d8, 6, 3, 0.35, 4);
  }

  sparks(pos) {
    this.burst(pos, 0xffc23c, 10, 6, 0.4, 9);
  }

  blood(pos) {
    this.burst(pos, 0xaa1111, 8, 2.5, 0.5, 6);
  }

  smoke(pos) {
    this.burst(pos, 0x888888, 5, 1.5, 1.1, -0.5);
  }

  update(dt) {
    const G = this.G;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        G.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 4;
    }
    if (this.beacon) {
      this.beacon.phase += dt;
      const s = 1 + Math.sin(this.beacon.phase * 3) * 0.12;
      this.beacon.ring.scale.set(s, s, 1);
      this.beacon.beam.material.opacity = 0.3 + Math.sin(this.beacon.phase * 2) * 0.1;
    }
    if (G.sea) {
      G.sea.position.y = -0.4 + Math.sin(performance.now() / 1400) * 0.12;
    }
  }
}
