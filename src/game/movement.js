import { Vec3, clamp } from '../physics/math.js';
import { CONFIG } from '../config.js';

// travel: metres the move carries the handler. shield: seconds the ball is
// covered by the body. burst: first-step speed boost out of the move.
export const MOVE_SPECS = {
  cross: { duration: 0.46, travel: 0.68, cost: 14, shield: 0.3, burst: 0.55, label: 'CROSSOVER' },
  legs: { duration: 0.52, travel: 0.44, cost: 13, shield: 0.5, burst: 0.5, label: 'BETWEEN THE LEGS' },
  behind: { duration: 0.56, travel: 0.5, cost: 15, shield: 0.56, burst: 0.5, label: 'BEHIND THE BACK' },
  spin: { duration: 0.66, travel: 0.95, cost: 20, shield: 0.5, burst: 0.45, label: 'SPIN CYCLE' },
  stepback: { duration: 0.5, travel: 1.05, cost: 17, shield: 0.3, burst: 0, label: 'STEPBACK' },
  hesi: { duration: 0.44, travel: 0.12, cost: 8, shield: 0.2, burst: 0.75, label: 'HESITATION' },
};
export const MOVES = Object.keys(MOVE_SPECS);
const TRANSFERS = { cross: 1, legs: 1, behind: 1 };
const ease = t => t * t * (3 - 2 * t);
export const isTransfer = kind => !!TRANSFERS[kind];

// Bounded acceleration gives a plant, push and recovery instead of instant
// direction changes. AI and human players use exactly the same integrator.
export function movePlayer(p, desired, dt) {
  p.locoVel ||= new Vec3(); p.acceleration ||= new Vec3();
  const delta = desired.clone().sub(p.locoVel);
  const braking = desired.lengthSq() < p.locoVel.lengthSq() || desired.dot(p.locoVel) < 0;
  // Quick to start, quicker to stop: a plant and a push, never a slide.
  const acceleration = braking ? 32 : p.defending ? 24 : p.burst > 0 ? 30 : 26;
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
  const fromSide = p.side, toSide = TRANSFERS[kind] ? -fromSide : fromSide;
  // Changes of hand attack on a diagonal: across the defender and downhill.
  const direction = kind === 'stepback' ? forward.clone().scale(-1).addScaled(right, fromSide * 0.18)
    : kind === 'spin' ? forward.clone().addScaled(right, -fromSide * 0.35)
      : kind === 'hesi' ? forward.clone()
        : right.clone().scale(toSide).addScaled(forward, kind === 'cross' ? 0.32 : 0.22);
  direction.normalize();
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

// Local coordinates: +X is the ball-hand side, +Z is forward.
export function dribbleHand(p) {
  const m = p.moveState;
  return m && m.age < m.duration * 0.5 ? m.fromSide : p.side;
}

// A live dribble is not a sine wave. The hand rides the ball for about 40% of
// each beat (cushion up, push down); between the hand and the floor the ball
// is driven faster than it would fall.
const CONTACT_IN = 0.3, CONTACT_OUT = 0.7;
export function dribblePhase(p) { return ((p.dribble % Math.PI) + Math.PI) % Math.PI / Math.PI; }
export function dribbleInHand(p) { const u = dribblePhase(p); return u >= CONTACT_IN && u <= CONTACT_OUT; }
function bounceHeight(u, top) {
  const r = CONFIG.ball.radius, contact = top - 0.075;
  if (u < CONTACT_IN) return r + (contact - r) * (1 - Math.pow(1 - u / CONTACT_IN, 1.35));
  if (u > CONTACT_OUT) return r + (contact - r) * (1 - Math.pow((u - CONTACT_OUT) / (1 - CONTACT_OUT), 1.35));
  return contact + (top - contact) * Math.sin(Math.PI * (u - CONTACT_IN) / (CONTACT_OUT - CONTACT_IN));
}

// Height of the top of the dribble: waist high when relaxed, pushed out in
// front at a run, and knee high on the far hip when a defender is close.
export function dribbleTop(p) {
  const protect = p.protect || 0, speed = Math.min(5, p.vel.length());
  return (0.96 + speed * 0.028) * (1 - protect) + 0.6 * protect;
}

export function dribbleOffset(p) {
  const u = dribblePhase(p), protect = p.protect || 0, speed = Math.min(5, p.vel.length()), top = dribbleTop(p);
  const offset = new Vec3(p.side * (0.36 + 0.1 * protect), bounceHeight(u, top), (0.27 + speed * 0.045) * (1 - protect) + 0.04 * protect);
  const m = p.moveState; if (!m) return offset;
  const t = clamp(m.age / m.duration, 0, 1), transfer = ease(t), bounce = offset.clone(), r = CONFIG.ball.radius;
  if (TRANSFERS[m.kind]) {
    // One hard, low bounce from hand to hand. It touches the floor at the
    // midpoint, which is exactly when possession of the ball changes hands.
    const lift = m.kind === 'legs' ? 0.5 : m.kind === 'behind' ? 0.62 : 0.6;
    offset.x = (m.fromSide + (m.toSide - m.fromSide) * transfer) * 0.44;
    offset.y = r + Math.pow(Math.abs(Math.cos(Math.PI * t)), 0.8) * lift;
    offset.z = m.kind === 'behind' ? 0.16 - Math.sin(Math.PI * t) * 0.6 : m.kind === 'legs' ? 0.26 - Math.sin(Math.PI * t) * 0.24 : 0.32 + Math.sin(Math.PI * t) * 0.14;
  } else if (m.kind === 'spin') {
    offset.x = Math.cos(t * Math.PI * 2) * m.fromSide * 0.4;
    offset.z = 0.18 + Math.sin(t * Math.PI * 2) * 0.36 * m.fromSide;
    offset.y = 0.66 + Math.cos(t * Math.PI * 2) * 0.13;
  } else if (m.kind === 'hesi') {
    // The ball hangs in the hand at the top of the dribble while the feet stutter.
    offset.y = top + 0.1 + Math.sin(Math.PI * t) * 0.06; offset.z += 0.07;
  }
  // Preserve the exact ball position at both ends, whatever the bounce phase.
  if (t < 0.2) return offset.lerp(m.entry, 1 - ease(t / 0.2));
  if (t > 0.8) return offset.lerp(bounce, ease((t - 0.8) / 0.2));
  return offset;
}

// The path of a gathered ball through a jump shot: into the shot pocket,
// up the body to the set point above the shooting eye, then out along the
// release. `charge` is seconds since the gather; `finish` reaches for the rim.
// The pocket sits at the shooting hip; the lift is a straight line past the
// face to a set point over the shooting eye, elbow under the ball.
const POCKET = new Vec3(0.21, 1.0, 0.25), SET = new Vec3(0.15, 1.94, 0.23), RELEASE = new Vec3(0.15, 2.22, 0.3);
// Seen through the shooter's own eyes the same motion is carried a little
// wider and further out, so the ball frames the rim instead of hiding it.
const EYE_POCKET = new Vec3(0.24, 1.16, 0.5), EYE_SET = new Vec3(0.27, 1.8, 0.56), EYE_RELEASE = new Vec3(0.24, 2.02, 0.56);
export function heldOffset(p, charge, out = new Vec3()) {
  const scale = (p.height || 1.92) / 1.92, eye = !!p.eyeView;
  // The ball is set before take-off; the push starts just after the feet
  // leave and full extension arrives with the ideal release, at the top.
  const S = CONFIG.shot, lift = ease(clamp((charge - 0.07) / (S.takeoff - 0.09), 0, 1)), extend = ease(clamp((charge - (S.takeoff + 0.05)) / (S.idealTime - S.takeoff - 0.05), 0, 1));
  out.lerpVectors(eye ? EYE_POCKET : POCKET, eye ? EYE_SET : SET, lift).lerp(eye ? EYE_RELEASE : RELEASE, extend);
  out.x *= p.side; out.y *= scale;
  return out;
}

export function wrappedAngle(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
