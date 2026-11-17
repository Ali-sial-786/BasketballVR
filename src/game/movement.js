import { Vec3, clamp } from '../physics/math.js';

export const MOVE_SPECS = {
  cross: { duration: 0.5, travel: 0.62, cost: 18, shield: 0.34 },
  behind: { duration: 0.56, travel: 0.46, cost: 19, shield: 0.54 },
  spin: { duration: 0.66, travel: 0.92, cost: 24, shield: 0.48 },
  stepback: { duration: 0.54, travel: 1.02, cost: 21, shield: 0.28 },
};
const ease = t => t * t * (3 - 2 * t);

// Bounded acceleration gives a plant, push and recovery instead of instant
// direction changes. AI and human players use exactly the same integrator.
export function movePlayer(p, desired, dt) {
  p.locoVel ||= new Vec3(); p.acceleration ||= new Vec3();
  const delta = desired.clone().sub(p.locoVel);
  const braking = desired.lengthSq() < p.locoVel.lengthSq() || desired.dot(p.locoVel) < 0;
  const acceleration = braking ? 22 : p.defending ? 12 : 17;
  const length = delta.length(), maximum = acceleration * dt;
  if (length > maximum) delta.scale(maximum / length);
  p.acceleration.copy(delta).scale(1 / Math.max(dt, 0.001));
  p.locoVel.add(delta); if (p.locoVel.lengthSq() < 0.0001) p.locoVel.set(0, 0, 0);
  p.vel.copy(p.locoVel); p.pos.addScaled(p.vel, dt);
}

export function beginMove(p, kind) {
  const spec = MOVE_SPECS[kind]; if (!spec) return null;
  const forward = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const right = new Vec3(-Math.cos(p.yaw), 0, Math.sin(p.yaw));
  const fromSide = p.side, toSide = kind === 'cross' || kind === 'behind' ? -fromSide : fromSide;
  const direction = kind === 'stepback' ? forward.scale(-1) : kind === 'spin' ? forward : right.scale(toSide);
  const entry = dribbleOffset(p);
  p.side = toSide;
  return p.moveState = { kind, age: 0, duration: spec.duration, travel: spec.travel, fromSide, toSide, direction, entry };
}

export function advanceMove(p, dt) {
  const m = p.moveState; if (!m) return;
  const before = clamp(m.age / m.duration, 0, 1); m.age += dt;
  const after = clamp(m.age / m.duration, 0, 1);
  p.pos.addScaled(m.direction, (ease(after) - ease(before)) * m.travel);
  const speed = m.travel * 6 * after * (1 - after) / m.duration;
  p.vel.addScaled(m.direction, speed);
  if (after >= 1) p.moveState = null;
}

// Local coordinates: +X is the ball-hand side, +Z is forward. A quadratic
// bounce has a continuous airborne path and a sharp, audible floor contact.
export function dribbleHand(p) {
  const m = p.moveState;
  return m && m.age < m.duration * 0.5 ? m.fromSide : p.side;
}

export function dribbleOffset(p) {
  const phase = ((p.dribble % Math.PI) + Math.PI) % Math.PI / Math.PI;
  const speed = p.vel.length();
  const offset = new Vec3(p.side * 0.44, 0.13 + 4 * phase * (1 - phase) * (0.88 - Math.min(0.16, speed * 0.025)), 0.29 + Math.min(0.17, speed * 0.035));
  const m = p.moveState; if (!m) return offset;
  const u = clamp(m.age / m.duration, 0, 1), transfer = ease(u);
  const bounce = offset.clone();
  if (m.kind === 'cross' || m.kind === 'behind') {
    offset.x = (m.fromSide + (m.toSide - m.fromSide) * transfer) * 0.48;
    offset.y = 0.12 + Math.abs(Math.cos(Math.PI * u)) * 0.68;
    offset.z = m.kind === 'behind' ? 0.18 - Math.sin(Math.PI * u) * 0.6 : 0.33 + Math.sin(Math.PI * u) * 0.12;
  } else if (m.kind === 'spin') {
    offset.x = Math.cos(u * Math.PI * 2) * m.fromSide * 0.4;
    offset.z = 0.18 + Math.sin(u * Math.PI * 2) * 0.36 * m.fromSide;
    offset.y = 0.7 + Math.cos(u * Math.PI * 2) * 0.13;
  }
  // Preserve the exact ball position at both ends, whatever the bounce phase.
  if (u < 0.2) return offset.lerp(m.entry, 1 - ease(u / 0.2));
  if (u > 0.8) return offset.lerp(bounce, ease((u - 0.8) / 0.2));
  return offset;
}

export function wrappedAngle(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
