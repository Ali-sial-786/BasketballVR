import * as THREE from 'three';
import { makeBall, shadow } from './util.js';
export class Effects {
  constructor(scene) {
    this.ball = makeBall(); scene.add(this.ball); this.shadow = shadow(scene, 0.2, 0.7);
    this.trailPoints = []; this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffc08d, transparent: true, opacity: 0.65 })); scene.add(this.trail);
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
  update(dt, engine) {
    this.ball.position.copy(engine.ball.pos); this.ball.rotation.x += dt * engine.ball.vel.length() * 1.3 + (engine.owner ? dt * 5 : 0); this.ball.rotation.z += dt * 1.5;
    this.shadow.position.set(this.ball.position.x, 0.028, this.ball.position.z);
    const y = this.ball.position.y; this.shadow.scale.setScalar(1 + y * 0.13); this.shadow.material.opacity = 0.8 / (1 + y * 0.2);
    if (engine.ballState === 'flight') {
      this.trailPoints.unshift(this.ball.position.clone()); this.trailPoints.length = Math.min(16, this.trailPoints.length);
    } else this.trailPoints.pop();
    this.trail.visible = this.trailPoints.length > 1;
    if (this.trail.visible) { this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints); this.trail.material.color.set(engine.shot?.green ? 0x9ce9b3 : engine.heatTime > 0 ? 0xff9f54 : 0xf7d39c); }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt; p.velocity.y -= 4 * dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.rotation.x += dt * 6; p.mesh.rotation.z += dt * 3; p.mesh.material.opacity = Math.min(1, p.life);
      if (p.life <= 0) { this.particleGroup.remove(p.mesh); p.mesh.material.dispose(); this.particles.splice(i, 1); }
    }
  }
}
