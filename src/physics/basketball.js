import { Vec3, clamp } from './math.js';
import { CONFIG, DIFFICULTIES } from '../config.js';

export function isThree(p) {
  const h = CONFIG.hoop;
  return Math.abs(p.x) >= CONFIG.court.cornerX || (p.z > h.z && Math.hypot(p.x - h.x, p.z - h.z) >= CONFIG.court.threeRadius);
}

// Solve the descending basket crossing, rather than pointing a straight throw
// at the rim. This keeps assistance predictable at every shooting distance.
export function arcVelocity(from, target, apex = 4.8) {
  const g = CONFIG.ball.gravity;
  apex = Math.max(apex, from.y + 0.3, target.y + 0.3);
  const vy = Math.sqrt(2 * g * (apex - from.y));
  const t = vy / g + Math.sqrt(2 * (apex - target.y) / g);
  const dragScale = 0.025 / (1 - Math.exp(-0.025 * t));
  return new Vec3((target.x - from.x) * dragScale, vy, (target.z - from.z) * dragScale);
}

export function greenWindow(difficulty, heat) {
  return DIFFICULTIES[difficulty].greenWindow * (heat ? 1.3 : 1);
}

export function releaseQuality(charge, difficulty = 'park', heat = false) {
  const window = greenWindow(difficulty, heat);
  const error = charge - CONFIG.shot.idealTime;
  return { quality: clamp(1 - Math.max(0, Math.abs(error) - window) / 0.65, 0, 1),
    green: Math.abs(error) <= window, timing: Math.abs(error) <= window ? 'PERFECT' : error < 0 ? 'EARLY' : 'LATE' };
}

export function makeShot({ from, feet, aim, charge = 0.72, physicalVelocity = null,
  contest = 0, difficulty = 'park', heat = false, rng = Math.random, dunk = false, layup = false, moving = 0 }) {
  const h = CONFIG.hoop, d = DIFFICULTIES[difficulty];
  const dist = Math.hypot(from.x - h.x, from.z - h.z);
  const to = new Vec3(h.x - from.x, 0, h.z - from.z).normalize();
  const facing = new Vec3(aim.x, 0, aim.z).normalize();
  const angle = Math.acos(clamp(to.dot(facing), -1, 1));
  let q = releaseQuality(charge, difficulty, heat);
  if (physicalVelocity) {
    // Comfortable seated/standing shots need only a small real flick. Real hand
    // speed is measured in reference space, never from artificial locomotion.
    const up = physicalVelocity.y;
    const forward = physicalVelocity.x * to.x + physicalVelocity.z * to.z;
    const form = clamp((up + Math.max(0, forward) * 0.5) / 2.1, 0, 1);
    q = { quality: form, green: form >= 0.92, timing: form >= 0.92 ? 'PERFECT' : form < 0.45 ? 'SOFT' : 'GOOD' };
  }
  const assisted = angle <= d.aimCone;
  const movementPenalty = dunk || layup || physicalVelocity ? 0 : clamp((moving - 0.8) / 4, 0, 1) * 0.2;
  const quality = clamp(q.quality - contest * 0.36 - movementPenalty, 0, 1);
  const error = Math.pow(1 - quality, 1.55) * (1.2 - d.assist * 0.45);
  const side = (rng() - 0.5) * 2 * error;
  const depth = (q.timing === 'EARLY' || q.timing === 'SOFT' ? 1 : -1) * error * 0.75;
  const right = new Vec3(-to.z, 0, to.x);
  const aimOffset = facing.dot(right) * (1 - d.assist) * 0.5;
  const target = new Vec3(h.x, h.y, h.z).addScaled(right, side + aimOffset).addScaled(to, -depth);
  if (!assisted) {
    target.x = from.x + facing.x * Math.max(2, dist);
    target.z = from.z + facing.z * Math.max(2, dist);
  }
  let vel;
  if (dunk && from.y > h.y) {
    // Drive the ball down from the actual hand. The same rim and downward
    // crossing test decide whether it goes through.
    const down = 2.6;
    const flight = 2 * (from.y - h.y) / (Math.sqrt(down * down + 2 * CONFIG.ball.gravity * (from.y - h.y)) + down);
    vel = new Vec3((h.x - from.x) / flight, -down, (h.z - from.z) / flight);
  } else vel = arcVelocity(from, target, layup ? 3.75 + dist * 0.075 : 4.4 + dist * 0.075);
  return { vel, quality, green: q.green && contest < 0.35 && assisted && movementPenalty < 0.08, timing: q.timing,
    contest, value: dunk || layup ? 2 : isThree(feet) ? 3 : 2, distance: dist, assisted, dunk, layup, moving };
}

export class Basketball {
  constructor() { this.pos = new Vec3(); this.vel = new Vec3(); this.previous = new Vec3(); this.scored = false; this.floorHits = 0; }
  launch(pos, vel) { this.pos.copy(pos); this.previous.copy(pos); this.vel.copy(vel); this.scored = false; this.floorHits = 0; }
  step(dt) {
    // 240 Hz, bounded displacements: even a hard pass cannot tunnel through
    // the backboard, and rim normals come from the actual torus centreline.
    const count = Math.max(1, Math.ceil(dt / (1 / 240)));
    const events = [];
    for (let i = 0; i < count; i++) this.substep(dt / count, events);
    return events;
  }
  substep(dt, events) {
    const p = this.pos, v = this.vel, r = CONFIG.ball.radius, h = CONFIG.hoop, b = CONFIG.board;
    this.previous.copy(p);
    v.y -= CONFIG.ball.gravity * dt;
    v.x *= Math.exp(-0.025 * dt); v.z *= Math.exp(-0.025 * dt);
    p.addScaled(v, dt);
    // A basket requires a downward centre crossing inside the physical rim.
    if (!this.scored && this.previous.y > h.y && p.y <= h.y && v.y < 0) {
      const a = (this.previous.y - h.y) / (this.previous.y - p.y);
      const x = this.previous.x + (p.x - this.previous.x) * a;
      const z = this.previous.z + (p.z - this.previous.z) * a;
      if (Math.hypot(x - h.x, z - h.z) < h.radius - h.tube - r + 0.008) {
        this.scored = true; events.push({ type: 'basket' });
        v.x *= 0.65; v.z *= 0.65;
      }
    }
    const dx = p.x - h.x, dz = p.z - h.z, radial = Math.hypot(dx, dz);
    if (radial > 1e-6 && Math.abs(p.y - h.y) < r + h.tube) {
      const nx = dx / radial, nz = dz / radial;
      const near = new Vec3(h.x + nx * h.radius, h.y, h.z + nz * h.radius);
      const normal = p.clone().sub(near), length = normal.length();
      if (length < r + h.tube && length > 1e-6) {
        normal.scale(1 / length);
        p.addScaled(normal, r + h.tube - length + 0.001);
        const vn = v.dot(normal);
        if (vn < 0) { v.addScaled(normal, -(1 + CONFIG.ball.rimRestitution) * vn); events.push({ type: 'rim', speed: -vn }); }
      }
    }
    // Swept collision against the front and rear faces of the glass.
    if (Math.abs(p.x - b.x) < b.width / 2 + r && Math.abs(p.y - b.y) < b.height / 2 + r) {
      const prev = this.previous.z - b.z, curr = p.z - b.z;
      if (prev >= r && curr < r && v.z < 0) { p.z = b.z + r; v.z *= -0.78; events.push({ type: 'board' }); }
      else if (prev <= -r && curr > -r && v.z > 0) { p.z = b.z - r; v.z *= -0.78; events.push({ type: 'board' }); }
    }
    if (p.y < r) {
      p.y = r;
      const speed = -v.y;
      if (v.y < 0) v.y *= -CONFIG.ball.floorRestitution;
      v.x *= 0.88; v.z *= 0.88;
      if (speed > 0.8) { events.push({ type: 'bounce', speed }); this.floorHits++; }
    }
  }
}
