import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = t => t * t * (3 - 2 * t);

// Feet persist in world space while planted. This is especially important on
// defense: a sideways slide must lead with a foot, not skate a running pose.
export class Footwork {
  constructor() { this.feet = null; this.swing = null; this.last = 'R'; this.lastRoot = null; this.airborne = false; }
  reset() { this.feet = null; this.swing = null; }
  update(dt, player, h, gathered) {
    h.update();
    const root = h.root, scale = root.scale.y, speed = player.vel.length();
    const nominal = {};
    const width = player.defending ? 0.25 : gathered ? 0.14 : 0.17;
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      nominal[side] = root.localToWorld(V(sign * width, h.ankleHeight, gathered ? sign * 0.06 : 0.035));
      nominal[side].y = player.jump + h.ankleHeight * scale + 0.013;
    }
    const moved = !this.lastRoot || this.lastRoot.distanceTo(root.position) > 1.7;
    if (!this.feet || moved) { this.feet = { L: nominal.L.clone(), R: nominal.R.clone() }; this.swing = null; }
    this.lastRoot = root.position.clone();
    if (player.jump > 0.025) {
      this.airborne = true; this.swing = null;
      for (const side of ['L', 'R']) this.feet[side].copy(nominal[side]).add(V(0, 0.06, -0.07).applyQuaternion(root.quaternion));
    } else {
      if (this.airborne) { this.feet.L.copy(nominal.L); this.feet.R.copy(nominal.R); this.airborne = false; }
      const errorL = horizontal(this.feet.L, nominal.L), errorR = horizontal(this.feet.R, nominal.R);
      const threshold = player.defending ? 0.15 : 0.18;
      if (!this.swing && Math.max(errorL, errorR) > threshold) {
        let side = errorL > errorR ? 'L' : 'R';
        if (Math.abs(errorL - errorR) < 0.07) side = this.last === 'L' ? 'R' : 'L';
        const target = nominal[side].clone().addScaledVector(new THREE.Vector3().copy(player.vel), speed > 0.2 ? 0.1 : 0);
        this.swing = { side, from: this.feet[side].clone(), target, age: 0, duration: speed > 3.5 ? 0.17 : player.defending ? 0.22 : 0.24 };
      }
      if (this.swing) {
        const s = this.swing; s.age += dt; const u = Math.min(1, s.age / s.duration);
        this.feet[s.side].lerpVectors(s.from, s.target, smooth(u));
        this.feet[s.side].y += Math.sin(u * Math.PI) * (player.defending ? 0.045 : Math.min(0.13, 0.05 + speed * 0.018));
        if (u >= 1) { this.last = s.side; this.swing = null; }
      }
      // If a fast cut outruns the support leg, let it follow at a bounded rate
      // rather than solving a hyperextended knee or teleporting the foot.
      for (const side of ['L', 'R']) {
        const error = horizontal(this.feet[side], nominal[side]);
        if (error > 0.52 && this.swing?.side !== side) this.feet[side].lerp(nominal[side], Math.min(1, dt * 14));
        if (this.swing?.side !== side) this.feet[side].y = h.ankleHeight * scale + 0.013;
      }
    }
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      const pole = root.localToWorld(V(sign * (player.defending ? 0.24 : 0.18), 0.48, 0.65));
      h.ikLeg(side, this.feet[side], pole);
      h.setWorldQuat('ankle' + side, root.quaternion);
    }
  }
}
function horizontal(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
