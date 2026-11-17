import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeBall, shadow } from './util.js';
// Fifteen fixed-time samples plus the current ball position.
const TRAIL_SAMPLES = 15, TRAIL_STEP = 1 / 60;
export class Effects {
  constructor(scene) {
    this.ball = makeBall(); this.leather = this.ball.material; this.gold = makeBall(true).material; scene.add(this.ball); this.shadow = shadow(scene, 0.2, 0.7);
    this.trailCount = 0; this.trailShot = null;
    this.previousBall = new THREE.Vector3(); this.spinAxis = new THREE.Vector3(); this.sample = new THREE.Vector3();
    this.trailPositions = new Float32Array((TRAIL_SAMPLES + 1) * 3);
    const trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffc08d, transparent: true, opacity: 0.35, depthWrite: false })); this.trail.frustumCulled = false; scene.add(this.trail);
    this.particles = []; this.particleGroup = new THREE.Group(); scene.add(this.particleGroup);
    this.particleGeo = new THREE.BoxGeometry(0.035, 0.08, 0.012);
  }
  burst(pos, green = false) {
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(this.particleGeo, new THREE.MeshBasicMaterial({ color: green ? [0xa9edbc, 0xe3f7b2, 0xf6dda5][i % 3] : [0xffbd7e, 0xee8d67, 0xeee0b7][i % 3], transparent: true }));
      m.position.copy(pos); this.particleGroup.add(m);
      this.particles.push({ mesh: m, life: 1.7, velocity: new THREE.Vector3((Math.random() - 0.5) * 3.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5) });
    }
  }
  updateTrail(engine) {
    const shot = engine.ballState === 'flight' ? engine.shot : null;
    if (!shot || shot.resolved) {
      this.trail.visible = false; this.trailShot = null;
      return;
    }
    if (shot !== this.trailShot) {
      this.trailShot = shot; this.trailCount = 0;
      this.previousBall.copy(shot.origin); this.previousTime = shot.released; this.sampleTime = shot.released;
    }
    const now = engine.time, elapsed = now - this.previousTime;
    // Discard samples outside the visible tail if the view missed a frame.
    this.sampleTime = Math.max(this.sampleTime, now - (TRAIL_SAMPLES - 1) * TRAIL_STEP);
    while (this.sampleTime <= now) {
      const fraction = elapsed ? THREE.MathUtils.clamp((this.sampleTime - this.previousTime) / elapsed, 0, 1) : 1;
      this.sample.lerpVectors(this.previousBall, this.ball.position, fraction);
      if (this.trailCount === TRAIL_SAMPLES) {
        this.trailPositions.copyWithin(0, 3, TRAIL_SAMPLES * 3);
        this.trailCount--;
      }
      this.sample.toArray(this.trailPositions, this.trailCount++ * 3);
      this.sampleTime += TRAIL_STEP;
    }
    this.ball.position.toArray(this.trailPositions, this.trailCount * 3);
    this.previousBall.copy(this.ball.position); this.previousTime = now;
    this.trail.visible = this.trailCount > 0;
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailCount + 1);
    this.trail.material.opacity = shot.green || engine.heatTime > 0 ? 0.48 : 0.18;
    this.trail.material.color.set(shot.green ? 0x9ce9b3 : engine.heatTime > 0 ? 0xff9f54 : 0xf7d39c);
  }
  update(dt, engine) {
    if (engine.phase !== 'playing') dt = 0;
    this.ball.material = engine.mode === 'contest' && (engine.rack === CONFIG.contest.moneyRack || engine.rackBall === CONFIG.contest.ballsPerRack - 1) ? this.gold : this.leather;
    this.ball.position.copy(engine.ball.pos);
    if (engine.ballState === 'flight' || engine.ballState === 'pass') {
      this.spinAxis.set(-engine.ball.vel.z, 0, engine.ball.vel.x).normalize();
      if (this.spinAxis.lengthSq()) this.ball.rotateOnWorldAxis(this.spinAxis, dt * (engine.ballState === 'pass' ? 4 : 7.5));
    } else if (engine.owner && engine.ballState === 'dribble' && engine.owner.action !== 'shooting') {
      this.ball.rotation.z += dt * 2.5 * engine.owner.side;
    }
    this.shadow.position.set(this.ball.position.x, 0.028, this.ball.position.z);
    const y = this.ball.position.y; this.shadow.scale.setScalar(1 + y * 0.13); this.shadow.material.opacity = 0.8 / (1 + y * 0.2);
    this.updateTrail(engine);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt; p.velocity.y -= 4 * dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 3; p.mesh.material.opacity = Math.min(1, p.life);
      if (p.life <= 0) { this.particleGroup.remove(p.mesh); p.mesh.material.dispose(); this.particles.splice(i, 1); }
    }
  }
}
