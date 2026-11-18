import { Vec3, clamp } from '../physics/math.js';
import { CONFIG, DIFFICULTIES } from '../config.js';
import { movePlayer } from './movement.js';
import { isThree } from '../physics/basketball.js';

// Match AI for every athlete a person is not controlling. It issues the same
// gathers, moves, passes, reaches and jumps a person can, through the same
// engine methods, and its shots have to beat the same rim.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const unit = (from, to) => new Vec3(to.x - from.x, 0, to.z - from.z).normalize();
const RELEASE_SPREAD = 1.1;
function lineGap(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return { gap: Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), x: a.x + dx * t, z: a.z + dz * t };
}

export function updateAI(g, dt) {
  if (!g.isMatch) return;
  const diff = DIFFICULTIES[g.difficulty];
  for (const p of g.players) {
    if (p.id === 0 && !g.preview) continue;
    const owner = g.owner, target = p.pos.clone();
    p.defending = false; p.contesting = false;
    const cap = g.ownerId === p.id ? handle(g, p, dt, target, diff)
      : !owner ? chase(g, p, dt, target, diff)
        : owner.team === p.team ? space(g, p, owner, target, diff)
          : defend(g, p, owner, dt, target, diff);
    const v = target.sub(p.pos); v.y = 0;
    const gap = v.length();
    const response = g.passInfo?.to === p.id ? 1 / Math.max(0.08, g.passInfo.duration - g.flightAge) : 3.4;
    let speed = Math.min(gap * response, cap);
    if (p.stagger) speed *= 0.18;
    if (p.bump) speed *= 0.6;
    if (p.burst > 0) speed *= 1.1;
    if (gap > 0.03) v.scale(speed / gap); else v.set(0, 0, 0);
    movePlayer(p, v, dt);
  }
}

// --------------------------------------------------------------- with the ball
function handle(g, p, dt, target, diff) {
  const hoop = CONFIG.hoop, rng = g.rng, shot = CONFIG.shot;
  const defenders = g.players.filter(d => d.team !== p.team);
  const nearest = defenders.reduce((a, b) => distance(a.pos, p.pos) < distance(b.pos, p.pos) ? a : b);
  const gap = distance(nearest.pos, p.pos), dist = distance(p.pos, hoop);
  p.yaw = Math.atan2(hoop.x - p.pos.x, hoop.z - p.pos.z);
  const lane = unit(p.pos, hoop), between = lane.dot(unit(p.pos, nearest.pos));
  // Beaten: on the floor, in the air, or no longer between the ball and the rim.
  const beaten = nearest.stagger > 0 || nearest.jump > 0.1 || between < 0.35 || gap > 2.4;
  let cap = diff.aiSpeed * CONFIG.player.ballTax;
  if (g.needsClear) { target.set(p.pos.x * 0.6, 0, 1.2); p.defending = gap < 1.3; return cap * 1.15; }
  if (p.action === 'shooting') {
    p.charge += dt;
    const finishing = dist < 2.9;
    // A finish keeps its momentum through the gather step.
    if (finishing) { target.set(hoop.x + (p.pos.x - hoop.x) * 0.3, 0, hoop.z + 0.5); cap *= 0.8; }
    // With a defender in their chest a shooter fades away from the contest.
    else if (gap < 1.35 && between > 0.4) { target.copy(p.pos).addScaled(lane, -1.4); cap *= 0.62; }
    else target.copy(p.pos);
    if (p.aiPump && p.charge >= CONFIG.shot.pumpWindow - 0.03) { p.aiPump = false; g.pumpFake(p); p.aiQuick = g.time + 1.2; return cap; }
    if (p.charge > shot.takeoff && p.charge < shot.takeoff + dt * 1.5) g.jump(p);
    if (p.charge >= shot.idealTime) g.shoot(p, { aiCharge: p.aiRelease });
    return cap;
  }
  p.defending = gap < 1.5 && !beaten && between > 0.35;
  // Some possessions hunt a three: hold the arc and let it fly if left open.
  if (p.ownedFor < dt * 1.5) p.aiThree = rng() < 0.3;
  const spotting = p.aiThree && p.ownedFor < 3.2 && isThree(p.pos) && dist < 7.6;
  // Pick moments to put the head down and go: straight away when the defender
  // is beaten, otherwise every couple of seconds to test their feet.
  if (!(p.aiAttack > g.time) && !spotting && p.ownedFor > 0.7 && dist > 2.4 && rng() < dt * (beaten ? 6 : 0.38)) p.aiAttack = g.time + 1.3 + rng() * 0.8;
  const attacking = p.aiAttack > g.time && !spotting;
  if (spotting) target.copy(p.pos);
  else if ((attacking || beaten) && dist > 1.3) {
    // Down the side of the lane the defender is not on, then square to the rim.
    const open = new Vec3(-lane.z, 0, lane.x), shade = unit(p.pos, nearest.pos).dot(open) > 0 ? -1 : 1;
    if (dist > 2.6 && gap < 2) target.copy(p.pos).addScaled(lane, 2).addScaled(open, shade * 1.25);
    else target.set(hoop.x + (p.pos.x - hoop.x) * 0.2, 0, hoop.z + 0.7);
    cap *= 1.3;
  } else {
    // Commit to an attacking lane rather than oscillating left/right on
    // a clock. A blocked lane invites a change of hand or a retreat.
    target.set(dist > 4 ? p.driveSide * 1.9 : p.pos.x * 0.5, 0, -4.15);
    if (gap < 1.3) target.x = p.pos.x + (p.pos.x - nearest.pos.x + p.driveSide * 0.6 > 0 ? 1.3 : -1.3);
  }
  if (!p.aiMove && !p.pump && p.ownedFor > 0.9 && gap < 1.7 && !beaten) {
    // Read the defender: take the ball away from the side they are sitting on
    // and go against the way they are sliding; otherwise make room to shoot.
    const right = new Vec3(-Math.cos(p.yaw), 0, Math.sin(p.yaw)), away = unit(p.pos, nearest.pos);
    const onBallSide = away.dot(right) * p.side > 0.12, sliding = nearest.locoVel.dot(right) * p.side;
    const r = rng(), tight = gap < 1.3;
    const kind = onBallSide || sliding > 0.8 ? (r < 0.45 ? 'cross' : r < 0.72 ? 'legs' : 'behind')
      : r < 0.34 && dist > 2.6 && dist < 7.6 ? 'stepback' : r < 0.56 ? 'hesi' : r < 0.74 && tight ? 'spin' : r < 0.88 ? 'cross' : 'legs';
    if (g.dribbleMove(p, kind)) {
      p.aiMove = 1 + rng() * 1.3;
      if (kind === 'stepback') p.aiQuick = g.time + 0.9;
      if (kind !== 'stepback' && kind !== 'hesi') p.driveSide = -p.driveSide;
    }
  }
  const mate = g.players.find(t => t.team === p.team && t.id !== p.id);
  if (mate && !p.aiWait && p.ownedFor > 0.8 && g.possessionPasses < 3) {
    const mateOpen = Math.min(...defenders.map(d => distance(d.pos, mate.pos)));
    const laneOpen = defenders.every(d => lineGap(d.pos, p.pos, mate.pos).gap > 0.7);
    const want = (gap < 1.35 && !beaten ? 1.3 : 0) + (mateOpen > 2.3 && p.ownedFor > 1.4 ? 0.8 : 0)
      + (mate.id === 0 && !g.preview && p.ownedFor > 2.5 ? 0.8 : 0) + (g.shotClock < 5 && gap < 1.3 ? 1.5 : 0);
    if (want > 0 && (laneOpen || want > 1.4) && rng() < dt * want) { g.pass(p, mate, 'auto'); return cap; }
  }
  if (p.ownedFor > 0.9 || p.aiQuick > g.time) {
    const open = gap > 1.7 || beaten, range = dist < 7.4;
    // A defender inside arm's length means create space first, not shoot over them.
    const crowded = gap < 1.3 && between > 0.5 && !beaten;
    let urge = dist < 2.7 ? (open || between < 0.6 ? 7 : attacking ? 4 : 1.5) : open && dist < 5.2 ? 2.3 : open && range ? 1.5 : p.ownedFor > 3 && range && !crowded ? 0.9 : p.ownedFor > 5 && range ? 0.5 : 0;
    if (spotting && gap > 1.45) urge = Math.max(urge, 3);
    if (p.aiQuick > g.time && range) urge = Math.max(urge, 5);
    if (g.shotClock < 4) urge = Math.max(urge, range ? 6 : 2.5);
    if (g.shotClock < 1.6) urge = 60;
    if (urge && rng() < dt * urge) {
      g.beginGather(p); p.action = 'shooting'; p.actionTime = 1.4; p.charge = 0;
      p.aiRelease = shot.idealTime + (rng() - 0.5) * (1 - diff.aiAccuracy) * RELEASE_SPREAD;
      p.aiPump = dist > 2.9 && gap < 1.6 && !beaten && g.shotClock > 3 && rng() < (gap < 1.3 ? 0.55 : 0.25);
    }
  }
  return cap;
}

// ------------------------------------------------------- loose balls and passes
function chase(g, p, dt, target, diff) {
  const b = g.ball, gravity = CONFIG.ball.gravity, rng = g.rng;
  const fallTime = clamp((b.vel.y + Math.sqrt(Math.max(0, b.vel.y * b.vel.y + 2 * gravity * (b.pos.y - 1.4)))) / gravity, 0, 1.0);
  target.copy(b.pos).addScaled(b.vel, fallTime); target.y = 0;
  if (b.pos.y > 2.7) { target.x = clamp(target.x, -5, 5) + (p.id % 2 ? 0.35 : -0.35); target.z = clamp(target.z, -5.9, 4); }
  p.yaw = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
  const near = distance(p.pos, b.pos);
  // Leave the floor for a shot on its way up, never one on its way down.
  if (g.shot && !g.shot.first && g.shot.team !== p.team && near < 1.4 && b.vel.y > 0 && rng() < dt * 5) g.jump(p);
  if ((!g.shot || g.shot.reported) && g.ballState !== 'pass' && b.vel.y < 0 && b.pos.y > 2.45 && b.pos.y < 3.5 && near < 0.95 && rng() < dt * 9) g.jump(p);
  const pass = g.ballState === 'pass' ? g.passInfo : null;
  if (pass?.to === p.id) target.copy(pass.destination);
  else if (pass && pass.team !== p.team) {
    // Step into a passing lane that is within reach.
    const lane = lineGap(p.pos, b.pos, pass.destination);
    if (lane.gap < 1.5) target.set(lane.x, 0, lane.z);
    else { const mark = g.players.find(t => t.id === pass.to); if (mark) target.copy(pass.destination).addScaled(unit(pass.destination, CONFIG.hoop), 1.2); }
  }
  return diff.aiSpeed * 1.25;
}

// ------------------------------------------------------------ off-ball offense
function space(g, p, owner, target, diff) {
  const hoop = CONFIG.hoop;
  // The teammate alternates a cut with spacing on the opposite wing, and
  // drifts to the corner for a kick-out when the ball is driven.
  const giveAndGo = g.lastPass?.from === p.id && g.time - g.lastPass.time < 2.6;
  const driving = distance(owner.pos, hoop) < 3.6;
  const side = owner.pos.x > 0 ? -1 : 1;
  if (giveAndGo) target.set(-owner.pos.x * 0.35, 0, -4.7);
  else if (driving) target.set(side * 6.3, 0, -4.4);
  else target.set(side * 4.7, 0, -0.55);
  p.yaw = Math.atan2(owner.pos.x - p.pos.x, owner.pos.z - p.pos.z);
  return diff.aiSpeed * (giveAndGo ? 1.2 : 1.05);
}

// -------------------------------------------------------------------- defense
function defend(g, p, owner, dt, target, diff) {
  const hoop = CONFIG.hoop, rng = g.rng;
  const mark = g.players.find(t => t.team !== p.team && (t.id % 2 === p.id % 2)) || owner;
  const onBall = owner.id === mark.id;
  const gathering = owner.action === 'shooting' || g.ballState === 'held';
  const charge = owner.id === 0 && !g.preview ? g.charge : owner.charge;
  // A defender reads the ball handler through a reaction delay. A move that
  // fools them freezes that read, which is what creates real separation.
  if (!p.react) p.percept.lerp(mark.pos.clone().addScaled(mark.vel, 0.16), 1 - Math.exp(-dt / diff.react));
  const range = distance(mark.pos, hoop), near = distance(p.pos, mark.pos);
  const cushion = !onBall ? 1.8 : gathering ? 1.2 : range > 7.6 ? 1.9 : range < 3 ? 0.95 : 1.3;
  target.copy(p.percept).addScaled(unit(p.percept, hoop), cushion);
  if (!onBall && distance(owner.pos, hoop) < 2.7) target.set(owner.pos.x * 0.25, 0, -4.8);
  p.yaw = Math.atan2(mark.pos.x - p.pos.x, mark.pos.z - p.pos.z);
  p.defending = near < 3.2;
  p.contesting = onBall && gathering && near < 1.9;
  if (onBall && owner.pump > 0 && p.pumpSeen !== owner.pumpCount) {
    p.pumpSeen = owner.pumpCount;
    if (near < 1.8 && rng() < diff.bite) g.jump(p);
  }
  if (!g.needsClear && onBall && owner.ownedFor > 0.8 && near < 1.4 && !p.stealCooldown && !p.stagger) {
    if (g.exposure(p, owner) > 0.42 && rng() < dt * diff.stealRate * 1.8) g.trySteal(p);
  }
  if (onBall && gathering) {
    // Decide once per gather whether to leave the floor, and when. Most
    // closeouts stay down with a hand up; a jump has to be timed to matter.
    if (p.planFor !== g.gatherCount) {
      p.planFor = g.gatherCount;
      p.planJump = rng() < (range < 3 ? 0.65 : diff.jumpiness) ? CONFIG.shot.takeoff + 0.02 + rng() * (0.5 - diff.jumpiness * 0.5) : Infinity;
    }
    if (charge > p.planJump && near < 1.6) g.jump(p);
  }
  const beaten = onBall && distance(owner.pos, hoop) < distance(p.pos, hoop) - 0.2;
  return diff.aiSpeed * (beaten ? 1.32 : 1.18);
}
