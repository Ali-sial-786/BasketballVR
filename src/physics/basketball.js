import { Vec3, clamp } from './math.js';
import { CONFIG, DIFFICULTIES } from '../config.js';

// A basketball is close to a thin shell: I = 2/3 m r². One contact impulse can
// remove at most this share of the slip at the contact point before the ball
// is rolling rather than sliding.
const INERTIA = 2 / 3, GRIP = 1 / (1 + 1 / INERTIA);
const SOLID_RIM = 1, SOLID_BOARD = 2, SOLID_FLOOR = 4, SOLID_ALL = 7;
const UP = new Vec3(0, 1, 0), _a = new Vec3(), _m = new Vec3(), _c = new Vec3(), _t = new Vec3(), _n = new Vec3();

export function isThree(p) {
  const h = CONFIG.hoop;
  return Math.abs(p.x) >= CONFIG.court.cornerX || (p.z > h.z && Math.hypot(p.x - h.x, p.z - h.z) >= CONFIG.court.threeRadius);
}

// Gravity, quadratic air drag and Magnus lift from the ball's own spin.
function acceleration(out, v, w) {
  const b = CONFIG.ball;
  out.crossVectors(w, v).scale(b.magnus).addScaled(v, -b.drag * v.length());
  out.y -= b.gravity;
  return out;
}

// Collision with a fixed surface, with Coulomb friction acting on the contact
// point. `n` points from the surface into the ball. Backspin therefore checks
// a bounce on the floor, deadens a bank off the glass and softens the rim.
function bounce(ball, n, restitution, friction) {
  const v = ball.vel, w = ball.spin, r = CONFIG.ball.radius, vn = v.dot(n);
  if (vn >= 0) return 0;
  _c.crossVectors(w, n).scale(-r).add(v);
  _t.copy(_c).addScaled(n, -_c.dot(n));
  const slip = _t.length(), jn = -(1 + restitution) * vn;
  v.addScaled(n, jn);
  if (slip > 1e-6) {
    _t.scale(1 / slip);
    const jt = Math.min(friction * jn, GRIP * slip);
    v.addScaled(_t, -jt);
    w.addScaled(_c.crossVectors(n, _t), jt / (INERTIA * r));
  }
  return -vn;
}

// Backspin axis for a ball travelling along a horizontal heading.
export function backspin(azimuth, revolutions) {
  const w = revolutions * Math.PI * 2;
  return new Vec3(-Math.cos(azimuth) * w, 0, Math.sin(azimuth) * w);
}

export class Basketball {
  constructor() {
    this.pos = new Vec3(); this.vel = new Vec3(); this.spin = new Vec3(); this.previous = new Vec3();
    this.scored = false; this.floorHits = 0; this.rimHits = 0; this.boardHits = 0; this.wedged = 0;
  }
  launch(pos, vel, spin = null) {
    this.pos.copy(pos); this.previous.copy(pos); this.vel.copy(vel);
    if (spin) this.spin.copy(spin); else this.spin.set(0, 0, 0);
    this.scored = false; this.floorHits = 0; this.rimHits = 0; this.boardHits = 0; this.wedged = 0;
  }
  step(dt) {
    // 240 Hz, bounded displacements: even a hard pass cannot tunnel through
    // the backboard, and rim normals come from the actual torus centreline.
    const count = Math.max(1, Math.ceil(dt / (1 / 240) - 1e-9));
    const events = [];
    for (let i = 0; i < count; i++) this.substep(dt / count, events);
    return events;
  }
  substep(dt, events = null, solid = SOLID_ALL) {
    const p = this.pos, v = this.vel, w = this.spin, B = CONFIG.ball, r = B.radius, h = CONFIG.hoop, b = CONFIG.board;
    this.previous.copy(p);
    // Midpoint integration keeps a solved arc independent of the frame rate.
    acceleration(_a, v, w);
    _m.copy(v).addScaled(_a, dt / 2);
    acceleration(_a, _m, w);
    p.addScaled(_m, dt); v.addScaled(_a, dt);
    w.scale(Math.exp(-B.spinDecay * dt));
    if (!solid) return;
    // A basket requires a downward centre crossing inside the physical rim.
    if (solid & SOLID_RIM && !this.scored && this.previous.y > h.y && p.y <= h.y && v.y < 0) {
      const a = (this.previous.y - h.y) / (this.previous.y - p.y);
      const x = this.previous.x + (p.x - this.previous.x) * a, z = this.previous.z + (p.z - this.previous.z) * a;
      if (Math.hypot(x - h.x, z - h.z) < h.radius - h.tube - r + 0.008) {
        this.scored = true;
        events?.push({ type: 'basket', clean: !this.rimHits && !this.boardHits, bank: this.boardHits > 0, speed: -v.y });
      }
    }
    // The net catches a made shot: it drops out underneath instead of flying on.
    if (this.scored && p.y < h.y && p.y > h.y - 0.44) {
      const k = Math.exp(-dt * 7);
      v.x *= k; v.z *= k; v.y *= Math.exp(-dt * 2.4); w.scale(Math.exp(-dt * 9));
      p.x += (h.x - p.x) * (1 - k) * 0.35; p.z += (h.z - p.z) * (1 - k) * 0.35;
    }
    let rimContact = false, boardContact = false;
    if (solid & SOLID_RIM) {
      const dx = p.x - h.x, dz = p.z - h.z, radial = Math.hypot(dx, dz);
      if (radial > 1e-6 && Math.abs(p.y - h.y) < r + h.tube) {
        const nx = dx / radial, nz = dz / radial;
        _n.set(p.x - (h.x + nx * h.radius), p.y - h.y, p.z - (h.z + nz * h.radius));
        const length = _n.length();
        if (length < r + h.tube && length > 1e-6) {
          _n.scale(1 / length);
          p.addScaled(_n, r + h.tube - length + 0.0005);
          const speed = bounce(this, _n, B.rimRestitution, B.rimFriction);
          rimContact = true;
          if (speed > 0) { this.rimHits++; if (speed > 0.25) events?.push({ type: 'rim', speed }); }
        }
      }
    }
    // Swept collision against the front and rear faces of the glass.
    if (solid & SOLID_BOARD && Math.abs(p.x - b.x) < b.width / 2 + r && Math.abs(p.y - b.y) < b.height / 2 + r) {
      const half = b.thickness / 2, front = b.z + half, back = b.z - half;
      const prev = this.previous.z, curr = p.z;
      let face = 0;
      if (prev >= front + r - 1e-9 && curr < front + r && v.z < 0) face = 1;
      else if (prev <= back - r + 1e-9 && curr > back - r && v.z > 0) face = -1;
      if (face) {
        p.z = face > 0 ? front + r : back - r;
        const speed = bounce(this, _n.set(0, 0, face), B.boardRestitution, B.boardFriction);
        boardContact = true; this.boardHits++;
        if (speed > 0.25) events?.push({ type: 'board', speed });
      }
    }
    // A ball resting between the back of the ring and the glass pops loose.
    if (rimContact && (boardContact || p.z < h.z - h.radius && v.lengthSq() < 0.2)) {
      this.wedged += dt;
      if (this.wedged > 0.3) { v.set(0.35, 1.6, 1.7); this.wedged = 0; }
    } else if (!rimContact) this.wedged = Math.max(0, this.wedged - dt);
    if (solid & SOLID_FLOOR && p.y < r) {
      p.y = r;
      const speed = bounce(this, UP, B.floorRestitution, B.floorFriction);
      if (speed > 0.8) { events?.push({ type: 'bounce', speed }); this.floorHits++; }
      else { if (v.y < 0.35) v.y = 0; const roll = Math.exp(-dt * 0.9); v.x *= roll; v.z *= roll; }
    }
  }
}

// ---------------------------------------------------------------- launch solver
// The solver flies the real integrator, so the arc it returns is the arc the
// game plays: drag, lift and (for a bank) the bounce off the glass included.
const probe = new Basketball(), _v = new Vec3(), _spin = new Vec3();
function crossing(from, speed, azimuth, elevation, revolutions, height, bank) {
  const ce = Math.cos(elevation);
  _v.set(Math.sin(azimuth) * ce * speed, Math.sin(elevation) * speed, Math.cos(azimuth) * ce * speed);
  const w = revolutions * Math.PI * 2; _spin.set(-Math.cos(azimuth) * w, 0, Math.sin(azimuth) * w);
  probe.launch(from, _v, _spin);
  for (let i = 0; i < 900; i++) {
    probe.substep(1 / 240, null, bank ? SOLID_BOARD : 0);
    const a = probe.previous, b = probe.pos;
    if (probe.vel.y < 0 && a.y > height && b.y <= height) {
      const k = (a.y - height) / (a.y - b.y);
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, time: (i + k) / 240, vy: probe.vel.y, board: probe.boardHits };
    }
    if (b.y < 0) return null;
  }
  return null;
}

// Speed and heading that bring the ball down through `target` at a chosen
// launch elevation. Returns { speed, azimuth, elevation, time } or null.
export function solveLaunch(from, target, elevation, revolutions = 0, bank = false) {
  const g = CONFIG.ball.gravity, b = CONFIG.board, r = CONFIG.ball.radius;
  let tx = target.x, tz = target.z;
  if (bank) {
    // First guess: the basket mirrored in the glass, stretched for the energy
    // the bounce takes out.
    const face = b.z + b.thickness / 2 + r;
    tz = face - (target.z - face) / CONFIG.ball.boardRestitution;
  }
  const dx = tx - from.x, dz = tz - from.z, d = Math.hypot(dx, dz), dh = target.y - from.y;
  if (d < 1e-4) return null;
  elevation = Math.max(elevation, Math.atan2(dh, d) + 0.22);
  const cos = Math.cos(elevation), denominator = 2 * cos * cos * (d * Math.tan(elevation) - dh);
  if (denominator <= 0) return null;
  let speed = Math.sqrt(g * d * d / denominator) * (1 + CONFIG.ball.drag * d * 0.55), azimuth = Math.atan2(dx, dz), hit = null;
  const miss = (s, a) => { const c = crossing(from, s, a, elevation, revolutions, target.y, bank); return c && (!bank || c.board) ? c : null; };
  for (let i = 0; i < 12; i++) {
    hit = miss(speed, azimuth);
    if (!hit) { speed *= 1.06; continue; }
    const ex = hit.x - target.x, ez = hit.z - target.z;
    if (ex * ex + ez * ez < 1e-6) break;
    const ds = speed * 0.01, da = 0.004, hs = miss(speed + ds, azimuth), ha = miss(speed, azimuth + da);
    if (!hs || !ha) { speed *= 1.03; continue; }
    const a11 = (hs.x - hit.x) / ds, a21 = (hs.z - hit.z) / ds, a12 = (ha.x - hit.x) / da, a22 = (ha.z - hit.z) / da;
    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-9) break;
    speed += clamp((-ex * a22 + ez * a12) / det, -speed * 0.2, speed * 0.2);
    azimuth += clamp((-ez * a11 + ex * a21) / det, -0.2, 0.2);
  }
  if (!hit || Math.hypot(hit.x - target.x, hit.z - target.z) > 0.03) return null;
  return { speed, azimuth, elevation, time: hit.time, entry: Math.atan2(-hit.vy, Math.hypot(d, 0.001) / hit.time) };
}

function velocityOf(launch, out = new Vec3()) {
  const ce = Math.cos(launch.elevation);
  return out.set(Math.sin(launch.azimuth) * ce * launch.speed, Math.sin(launch.elevation) * launch.speed, Math.cos(launch.azimuth) * ce * launch.speed);
}

// Kept for callers that want a simple vacuum arc through an apex height.
export function arcVelocity(from, target, apex = 4.8) {
  const g = CONFIG.ball.gravity;
  apex = Math.max(apex, from.y + 0.3, target.y + 0.3);
  const vy = Math.sqrt(2 * g * (apex - from.y));
  const t = vy / g + Math.sqrt(2 * (apex - target.y) / g);
  return new Vec3((target.x - from.x) / t, vy, (target.z - from.z) / t);
}

// Range is touch: the release window is full size at the rim and the elbow
// and tightens steadily out to the three-point line and beyond.
export function rangeScale(distance) { return clamp(1.2 - 0.085 * distance, 0.55, 1); }
export function greenWindow(difficulty, heat, rhythm = false, distance = 0) {
  return DIFFICULTIES[difficulty].greenWindow * (heat ? 1.3 : 1) * (rhythm ? 1.15 : 1) * rangeScale(distance);
}

export function releaseQuality(charge, difficulty = 'park', heat = false, rhythm = false, distance = 0) {
  const window = greenWindow(difficulty, heat, rhythm, distance);
  const error = charge - CONFIG.shot.idealTime, green = Math.abs(error) <= window;
  // Outside the window every further hundredth of a second costs accuracy.
  return { quality: green ? 1 : clamp(0.94 - (Math.abs(error) - window) / 0.26, 0, 1), green, offset: error,
    timing: green ? 'PERFECT' : error < 0 ? 'EARLY' : 'LATE' };
}

// Natural launch elevation for a jump shot: flatter from range, higher close in.
export function shotElevation(distance, rise) {
  return clamp(0.82 + 0.5 * Math.atan2(rise, Math.max(distance, 0.1)) + 0.03, 0.8, 1.06);
}

// One release. Timing, balance, fatigue and defensive pressure become errors
// in launch speed and heading, so the same lapse costs more from deep than at
// the elbow, and the ball then has to beat the real rim.
export function makeShot({ from, feet, aim, charge = 0.72, physicalVelocity = null, contest = 0, difficulty = 'park', heat = false,
  rng = Math.random, dunk = false, layup = false, floater = false, fade = false, moving = 0, fatigue = 0, rhythm = false, wobble = 0 }) {
  const h = CONFIG.hoop, d = DIFFICULTIES[difficulty];
  const dist = Math.hypot(from.x - h.x, from.z - h.z);
  const to = new Vec3(h.x - from.x, 0, h.z - from.z).normalize();
  const facing = new Vec3(aim.x, 0, aim.z).normalize();
  const hoopAzimuth = Math.atan2(to.x, to.z), aimAzimuth = Math.atan2(facing.x, facing.z);
  const aimError = Math.atan2(Math.sin(aimAzimuth - hoopAzimuth), Math.cos(aimAzimuth - hoopAzimuth));
  const angle = Math.abs(aimError), assisted = angle <= d.aimCone;
  let q = releaseQuality(charge, difficulty, heat, rhythm, layup || floater || dunk ? 0 : dist);
  let elevation = layup ? 1.08 : floater ? 1.04 : shotElevation(dist, h.y - from.y);
  let handSpeed = 0, handHeading = 0;
  if (physicalVelocity) {
    // Comfortable seated/standing shots need only a small real flick. Real hand
    // speed is measured in reference space, never from artificial locomotion.
    const up = physicalVelocity.y, forward = physicalVelocity.x * to.x + physicalVelocity.z * to.z;
    const form = clamp((up + Math.max(0, forward) * 0.5) / 2.1, 0, 1);
    q = { quality: form, green: form >= 0.92, offset: 0, timing: form >= 0.92 ? 'PERFECT' : form < 0.45 ? 'SOFT' : 'GOOD' };
    // The ball leaves along the hand's own arc and line. Assistance relaxes
    // both toward the solved shot instead of replacing them.
    const horizontal = Math.hypot(physicalVelocity.x, physicalVelocity.z);
    const speed = Math.hypot(horizontal, up), reference = 2 + 0.1 * dist, power = speed / reference;
    if (speed > 0.9 && up > 0.2) {
      const handElevation = clamp(Math.atan2(up, Math.max(horizontal, 0.05)), 0.72, 1.12);
      if (!layup) elevation += (handElevation - elevation) * (1 - d.assist * 0.6);
      if (horizontal > 0.4) {
        const heading = Math.atan2(physicalVelocity.x, physicalVelocity.z);
        handHeading = clamp(Math.atan2(Math.sin(heading - hoopAzimuth), Math.cos(heading - hoopAzimuth)), -0.6, 0.6) * (1 - d.assist) * 0.22;
      }
    }
    if (power < 0.75) handSpeed = -(0.75 - power) * (1 - d.assist * 0.6) * 0.3;
    else if (power > 2) handSpeed = Math.min(0.08, (power - 2) * (1 - d.assist * 0.6) * 0.12);
  }
  const close = dunk || layup || floater || !!physicalVelocity;
  const movementPenalty = close ? 0 : clamp((moving - 0.8) / 4, 0, 1) * (fade ? 0.13 : 0.2);
  const fatiguePenalty = clamp(fatigue, 0, 1) * 0.1;
  const scale = 1.15 - d.assist * 0.5;
  const quality = clamp(q.quality - contest * 0.5 - movementPenalty - fatiguePenalty - wobble * (layup || floater ? 0.5 : 1), 0, 1);
  // Timing pulls the shot short or long; pressure, drift and tired legs scatter it.
  const timingError = (1 - q.quality) * scale * (physicalVelocity ? 0.6 : 1), scatter = (q.quality - quality) * scale, error = timingError + scatter;
  const triangle = () => rng() + rng() - 1;
  const short = q.timing === 'EARLY' || q.timing === 'SOFT';
  const speedError = (short ? -1 : 1) * timingError * 0.044 + triangle() * (timingError * 0.04 + scatter * 0.15) + handSpeed;
  const headingError = triangle() * (timingError * 0.06 + scatter * 0.2) + aimError * (1 - d.assist) * 0.12 + handHeading;
  const right = new Vec3(-to.z, 0, to.x);
  // Around the basket a bump or a hand in the way moves the touch, not the power.
  const touch = layup || floater ? scatter : 0;
  const target = new Vec3(h.x, h.y, h.z).addScaled(right, triangle() * (error * 0.07 + touch * 0.45)).addScaled(to, triangle() * (error * 0.05 + touch * 0.35));
  if (!assisted) {
    target.x = from.x + facing.x * Math.max(2, dist);
    target.z = from.z + facing.z * Math.max(2, dist);
  }
  let vel, spin, bank = false, arc = 0;
  if (dunk && from.y > h.y) {
    // Drive the ball down from the actual hand. The same rim and downward
    // crossing test decide whether it goes through.
    const down = 2.6;
    const flight = 2 * (from.y - h.y) / (Math.sqrt(down * down + 2 * CONFIG.ball.gravity * (from.y - h.y)) + down);
    vel = new Vec3((h.x - from.x) / flight, -down, (h.z - from.z) / flight); spin = new Vec3();
  } else {
    const revolutions = layup ? 1.1 : clamp(1.7 + 0.16 * dist, 1.7, 2.9);
    let launch = null;
    // From the wings a close finish goes off the glass, like a real layup.
    const sideAngle = Math.abs(Math.atan2(from.x - h.x, from.z - h.z));
    if (layup && assisted && sideAngle > 0.42 && sideAngle < 1.3 && dist > 0.55 && dist < 3.1) {
      for (const lift of [1.0, 0.9, 1.12]) {
        launch = solveLaunch(from, target, lift, revolutions, true);
        if (launch) { bank = true; break; }
      }
    }
    launch ||= solveLaunch(from, target, elevation, revolutions) || solveLaunch(from, target, 1.15, revolutions);
    if (launch) {
      launch.speed *= 1 + speedError; launch.azimuth += headingError;
      vel = velocityOf(launch); spin = backspin(launch.azimuth, revolutions); arc = launch.elevation;
    } else { vel = arcVelocity(from, target, Math.max(from.y, h.y) + 0.9); spin = new Vec3(); }
  }
  const kind = dunk ? 'dunk' : layup ? 'layup' : floater ? 'floater' : fade ? 'fadeaway' : 'jumper';
  return { vel, spin, quality, green: q.green && contest < 0.35 && assisted && movementPenalty < 0.08 && fatiguePenalty < 0.05,
    timing: q.timing, offset: q.offset, contest, value: dunk || layup || floater ? 2 : isThree(feet) ? 3 : 2, distance: dist,
    assisted, dunk, layup, floater, fade, bank, rhythm, moving, kind, arc: arc * 180 / Math.PI };
}

// ------------------------------------------------------------------------ passes
export function passTime(distance, kind) {
  const p = CONFIG.pass, g = CONFIG.ball.gravity;
  if (kind === 'lob') return 2 * Math.sqrt(2 * Math.max(0.5, p.lobApex - 1.3) / g);
  return clamp(distance / (kind === 'bounce' ? p.bounce * 0.86 : p.chest), 0.14, 1.2);
}

// Chest: a flat, firm line. Bounce: into the floor about two thirds of the
// way, arriving at the waist. Lob: over the top of a defender.
export function passVelocity(origin, destination, kind = 'chest') {
  const B = CONFIG.ball, g = B.gravity, P = CONFIG.pass;
  const dx = destination.x - origin.x, dz = destination.z - origin.z, d = Math.max(0.3, Math.hypot(dx, dz));
  const azimuth = Math.atan2(dx, dz), drag = 1 + B.drag * d * 0.5;
  if (kind === 'bounce' && d > 2.4 && d < 6.6) {
    let best = null;
    for (let f = 0.52; f <= 0.76; f += 0.04) {
      const t1 = f * d / P.bounce, vy0 = (B.radius - origin.y) / t1 + g * t1 / 2, vy1 = vy0 - g * t1;
      const jn = (1 + B.floorRestitution) * -vy1, after = P.bounce - Math.min(B.floorFriction * jn, GRIP * P.bounce);
      const up = -vy1 * B.floorRestitution, t2 = (1 - f) * d / after, y = B.radius + up * t2 - g * t2 * t2 / 2;
      const score = Math.abs(y - destination.y) + (up - g * t2 < -1.5 ? 0.4 : 0);
      if (!best || score < best.score) best = { score, vy0, time: t1 + t2 };
    }
    return { vel: new Vec3(dx / d * P.bounce * drag, best.vy0, dz / d * P.bounce * drag), spin: new Vec3(), duration: best.time, kind };
  }
  if (kind === 'lob') {
    const apex = Math.max(P.lobApex, origin.y + 0.8, destination.y + 0.8);
    const rise = Math.sqrt(2 * (apex - origin.y) / g), fall = Math.sqrt(2 * (apex - destination.y) / g), t = rise + fall;
    const launch = solveLaunch(origin, destination, Math.atan2(g * rise, d / t), 1.2);
    if (launch) return { vel: velocityOf(launch), spin: backspin(launch.azimuth, 1.2), duration: launch.time, kind };
    return { vel: new Vec3(dx / t, g * rise, dz / t), spin: backspin(azimuth, 1.2), duration: t, kind };
  }
  const t = clamp(d / P.chest, 0.14, 1.2);
  return { vel: new Vec3(dx / t * drag, (destination.y - origin.y) / t + g * t / 2, dz / t * drag), spin: backspin(azimuth, 1.6), duration: t, kind: 'chest' };
}
