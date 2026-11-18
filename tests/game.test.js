import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/engine.js';
import { Vec3 } from '../src/physics/math.js';
import { CONFIG } from '../src/config.js';
const advance = (g, seconds, command = {}) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) g.step(1 / 120, command); };
const fresh = mode => { const e = new GameEngine({ rng: () => 0.5 }); e.start(mode); e.checkTimer = 0; e.updateAI = () => {}; return e; };
const aim = g => new Vec3(-g.human.pos.x, 0, CONFIG.hoop.z - g.human.pos.z).normalize();
const T = CONFIG.shot.idealTime;
function cleanShot(g) { g.charge = T; g.ballState = 'held'; g.updateOwnedBall(0); return g.shoot(g.human, { aim: aim(g) }); }
test('four modes create the correct roster, and 1v1 does not fabricate a pass', () => {
  for (const [mode, count] of [['1v1', 2], ['2v2', 4], ['practice', 1], ['contest', 1]]) assert.equal(fresh(mode).players.length, count);
  const g = fresh('1v1'); assert(!g.pass(g.human)); assert.equal(g.ownerId, 0);
});
test('charging and a release make one attempt, then practice returns the ball', () => {
  const g = fresh('practice'); g.step(1 / 120, { gather: true }); advance(g, T - 0.02);
  g.step(1 / 120, { aim: aim(g), release: {} }); assert.equal(g.stats.attempts, 1);
  g.step(1 / 120, { aim: aim(g), release: {} }); assert.equal(g.stats.attempts, 1);
  advance(g, 3); assert.equal(g.ownerId, 0); assert.equal(g.stats.made, 1);
});
test('match is win by two, caps at 21, and a shot cannot score twice', () => {
  const g = fresh('1v1'); g.players[1].pos.set(6, 0, 4); g.score = [9, 10];
  g.human.pos.set(0, 0, -3); cleanShot(g); advance(g, 1.5); assert.deepEqual(g.score, [11, 10]); assert.equal(g.phase, 'playing');
  g.checkTimer = 0; g.resetPossession(0); g.players[1].pos.set(6, 0, 4); g.human.pos.set(0, 0, -3); cleanShot(g); advance(g, 1.5);
  assert.deepEqual(g.score, [13, 10]); assert.equal(g.phase, 'result'); g.basket(); assert.deepEqual(g.score, [13, 10]);
});
const guarded = (rng = () => 0.5) => {
  // The AI dribbler faces the basket with the ball in the right hand, mid-bounce.
  const g = new GameEngine({ rng }); g.start('1v1'); g.checkTimer = 0; g.updateAI = () => {};
  const d = g.players[1]; g.giveBall(d); g.possession = 1; d.shield = 0; d.pos.set(0, 0, 0); d.yaw = Math.PI; d.dribble = 0;
  g.human.pos.set(6, 0, 6); g.updateOwnedBall(0); return g;
};
const inFront = g => { g.human.pos.set(g.ball.pos.x, 0, g.ball.pos.z - 0.75); g.human.yaw = 0; };
test('a steal needs the ball on your side of the dribbler, then requires clearing beyond the arc', () => {
  const g = guarded(); inFront(g);
  assert(g.exposure(g.human) > 0.8); assert.equal(g.trySteal(g.human), true); assert.equal(g.stats.steals, 1); assert(g.needsClear); assert(!cleanShot(g));
  g.human.pos.set(0, 0, 1); g.step(1 / 120); assert(!g.needsClear); assert(cleanShot(g));
});
test('reaching around the body or at a protected dribble comes up empty and leaves the defender leaning', () => {
  const g = guarded(); g.human.pos.set(0, 0, 0.8); g.human.yaw = Math.PI;
  assert(g.exposure(g.human) < 0.2); assert.equal(g.trySteal(g.human), false); assert(g.human.stagger > 0.2); assert.equal(g.ownerId, 2);
  assert(g.players[1].burst > 0, 'the handler gets a step on a failed reach');
  const h = guarded(); inFront(h); const open = h.exposure(h.human);
  h.players[1].protect = 1; assert(h.exposure(h.human) < open * 0.6);
  h.players[1].protect = 0; h.players[1].dribble = Math.PI / 2; h.updateOwnedBall(0); assert(h.exposure(h.human) < open * 0.8, 'the hand is on the ball at the top of the bounce');
});
test('getting a piece of the ball knocks it loose for either team', () => {
  const g = guarded(() => 0.8); inFront(g);
  assert.equal(g.trySteal(g.human), 'loose'); assert.equal(g.ownerId, null); assert.equal(g.ballState, 'loose'); assert.equal(g.stats.steals, 0);
  assert(g.drainEvents().some(e => e.type === 'poke'));
  advance(g, 1.2); assert(g.owner, 'someone comes up with it'); assert(Number.isFinite(g.ball.pos.x));
});
test('held and protected balls cannot be stolen, and reaching has a cooldown', () => {
  const g = fresh('1v1'), o = g.players[1]; g.giveBall(o); g.human.pos.copy(o.pos).add(new Vec3(0, 0, 0.8)); g.human.yaw = Math.PI;
  assert(!g.trySteal(g.human)); assert(g.human.stealCooldown > 0); assert(!g.trySteal(g.human));
});
test('dribble moves consume stamina, protect possession and can be chained', () => {
  const g = fresh('1v1'); assert(g.dribbleMove(g.human, 'cross')); assert(g.human.stamina < 100); assert(g.human.shield > 0);
  assert(!g.dribbleMove(g.human, 'behind')); advance(g, 0.65); assert(g.dribbleMove(g.human, 'behind')); assert.equal(g.stats.bestCombo, 2);
  g.human.stamina = 0; advance(g, 0.5); assert(!g.dribbleMove(g.human, 'spin'));
});
test('a defender can intercept a real pass in flight', () => {
  const g = fresh('2v2'); g.human.pos.set(0, 0, 0); g.players.find(p => p.id === 1).pos.set(4, 0, 0);
  const d = g.players.find(p => p.id === 2); d.pos.set(2, 0, 0); g.players.find(p => p.id === 3).pos.set(-6, 0, 4);
  g.updateOwnedBall(0); assert(g.pass(g.human, null, 'chest')); assert.equal(g.ballState, 'pass'); advance(g, 0.6);
  assert.equal(g.ownerId, 2); assert(g.needsClear); assert.equal(g.stats.steals, 0);
});
test('reaching a rising shot while jumping creates a physical block', () => {
  const g = fresh('1v1'), d = g.players[1]; d.pos.set(0, 0, -2); g.giveBall(d); d.charge = T;
  g.human.pos.set(0, 0, -2.6); g.human.yaw = 0; g.human.jump = 0.45; g.human.jumpVel = 1; g.shoot(d, { aiCharge: T });
  advance(g, 0.14); assert.equal(g.stats.blocks, 1); assert.equal(g.score[1], 0);
});
test('shot clock and out-of-bounds hand the check to the other team', () => {
  const g = fresh('1v1'); g.shotClock = 0.05; advance(g, 0.1); assert(g.checkTimer > 0); assert.equal(g.checkTeam, 1);
  g.checkTimer = 0; g.ownerId = null; g.ballState = 'loose'; g.ball.pos.set(8, 0.2, 0); g.lastTouch = 2; g.boundaries(); assert.equal(g.checkTeam, 0);
});
test('a real tracked hand can block without an artificial jump', () => {
  const g = fresh('1v1'), d = g.players[1]; d.pos.set(0, 0, -2); g.giveBall(d); g.shoot(d, { aiCharge: T });
  g.step(1 / 120, { hands: [g.ball.pos.clone()] }); assert.equal(g.human.jump, 0); assert.equal(g.stats.blocks, 1);
});
test('pause freezes the clock and discards the gathered shot', () => {
  const g = fresh('1v1'); g.step(1 / 120, { gather: true }); g.pause(); const t = g.time, clock = g.shotClock;
  advance(g, 2, { release: {} }); assert.equal(g.time, t); assert.equal(g.shotClock, clock); assert.equal(g.stats.attempts, 0); assert.equal(g.ballState, 'dribble');
  g.resume(); advance(g, 0.1); assert(g.time > t);
});
test('all 25 contest shots traverse five racks, pay gold balls correctly and total 34', () => {
  const g = fresh('contest'); let guard = 0;
  while (g.phase === 'playing' && guard++ < 120 * 100) {
    if (g.ownerId === 0 && !g.settleTimer) cleanShot(g);
    g.step(1 / 120);
  }
  assert.equal(g.phase, 'result'); assert.equal(g.contestShots, 25); assert.equal(g.rack, 4); assert.equal(g.score[0], 34);
  assert.equal(g.contestResults.filter(r => r.money).length, 9); assert.equal(g.stats.made, 25); assert(g.contestTime > 0);
});
test('contest accepts a shot released before the buzzer and then ends', () => {
  const g = fresh('contest'); g.contestTime = 0.03; cleanShot(g); advance(g, 3);
  assert.equal(g.phase, 'result'); assert.equal(g.contestShots, 1); assert.equal(g.score[0], 1);
  assert.equal(g.stats.attempts, 1);
});
test('seeded 1v1 and 2v2 AI actually complete games with finite, bounded state', () => {
  for (const mode of ['1v1', '2v2']) {
    let seed = 128; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const g = new GameEngine({ rng }); g.start(mode); g.preview = true;
    for (let i = 0; i < 120 * 300 && g.phase === 'playing'; i++) {
      g.step(1 / 120);
      assert(Number.isFinite(g.ball.pos.y));
      if (i % 120 === 0) for (const p of g.players) { assert(Math.abs(p.pos.x) <= 7.2); assert(p.pos.z <= 7.2); }
    }
    assert.equal(g.phase, 'result', mode); assert(Math.max(...g.score) >= 11);
  }
});

test('the shot clock continues during a pass and a loose ball', () => {
  for (const state of ['pass', 'loose']) {
    const g = fresh('2v2'); g.shotClock = 0.05;
    assert(g.pass(g.human)); g.ballState = state;
    advance(g, 0.08);
    assert(g.checkTimer > 0); assert.equal(g.checkTeam, 1);
  }
});

test('a contest buzzer during a rack transition ends the round with one score and one horn', () => {
  const g = fresh('contest'); cleanShot(g); g.basket();
  g.contestTime = 0.05; advance(g, 1);
  assert.equal(g.phase, 'result'); assert.equal(g.score[0], 1); assert.equal(g.contestShots, 1);
  assert.equal(g.drainEvents().filter(e => e.type === 'buzzer').length, 1);
});

test('the receiver runs onto a lead pass and takes possession at the contact point', () => {
  const g = new GameEngine(); g.start('2v2'); g.checkTimer = 0;
  g.human.pos.set(-3, 0, 2);
  const receiver = g.players[1]; receiver.pos.set(3, 0, 1); receiver.locoVel.set(0, 0, -2.5); receiver.vel.copy(receiver.locoVel);
  for (const d of g.players.slice(2)) d.pos.set(-6, 0, -6);
  g.updateOwnedBall(0); assert(g.pass(g.human));
  assert(g.passInfo.destination.z < 0);
  for (let i = 0; i < 120 && !g.owner; i++) {
    const from = g.ball.pos.clone(); g.step(1 / 120);
    assert(g.ball.pos.distanceTo(from) < 0.14);
  }
  assert.equal(g.owner, receiver); assert(receiver.pos.z < 0.25);
  assert.deepEqual(g.lastPass, { from: 0, to: 1, time: g.time });
  assert(g.drainEvents().some(e => e.type === 'catch' && e.player === 1));
});

test('an on-ball defender in front affects a release more than a trailing defender', () => {
  const pressure = z => {
    const g = fresh('1v1'), defender = g.players[1];
    g.human.pos.set(0, 0, 0); defender.pos.set(0, 0, z);
    defender.yaw = z < 0 ? 0 : Math.PI; defender.defending = true;
    cleanShot(g); return g.shot.contest;
  };
  assert(pressure(-0.8) > 2 * pressure(0.8));
});

test('a close finish launches downward from the gathered ball and crosses the rim', () => {
  const g = fresh('practice'); g.human.pos.set(0, 0, CONFIG.hoop.z + 0.4); g.updateOwnedBall(0);
  advance(g, T, { gather: true, aim: aim(g), autoJump: true });
  const hand = g.ball.pos.clone();
  g.step(1 / 120, { release: {}, aim: aim(g) });
  assert(g.shot.dunk); assert(g.shot.vel.y < 0); assert(g.shot.origin.distanceTo(hand) < 1e-8);
  advance(g, 0.25); assert.deepEqual(g.score, [2, 0]);
});

test('cancelling a gather discards its release and a contest player stays at their rack', () => {
  const g = fresh('contest'), spot = g.human.pos.clone();
  advance(g, 0.3, { gather: true, moveAction: 'stepback', move: { x: 1 } });
  g.step(1 / 120, { cancelGather: true }); g.step(1 / 120, { release: {} });
  assert.equal(g.ballState, 'dribble'); assert.equal(g.stats.attempts, 0); assert.equal(g.charge, 0);
  assert.equal(g.human.pos.distanceTo(spot), 0);
});

const lane = (defenderX) => {
  const g = fresh('2v2'); g.human.pos.set(0, 0, 0); g.players.find(p => p.id === 1).pos.set(5, 0, 0);
  const d = g.players.find(p => p.id === 2); d.pos.set(defenderX, 0, 0); d.yaw = -Math.PI / 2; g.players.find(p => p.id === 3).pos.set(-6, 0, 5);
  g.updateOwnedBall(0); return g;
};
test('the smart pass goes under a defender in the lane, over one who is close, and straight when it is open', () => {
  for (const [x, kind] of [[3.3, 'bounce'], [1.4, 'lob'], [-3, 'chest']]) {
    const g = lane(x); assert(g.pass(g.human)); assert.equal(g.passInfo.kind, kind);
    let bounces = 0; for (let i = 0; i < 240 && !g.owner; i++) { g.step(1 / 120); bounces += g.drainEvents().filter(e => e.type === 'bounce').length; }
    assert.equal(g.ownerId, 1, `${kind} pass is completed`); assert.equal(bounces, kind === 'bounce' ? 1 : 0); assert.equal(g.human.passKind, kind);
  }
  const g = lane(3.3); assert(g.pass(g.human, null, 'chest')); advance(g, 0.6); assert.equal(g.ownerId, 2, 'the same lane picks off a chest pass');
});
test('a reach at a pass in flight deflects it instead of stealing it clean', () => {
  const g = fresh('2v2'), d = g.players.find(p => p.id === 2); g.giveBall(d); g.possession = 1; d.pos.set(0, 0, 0); d.aiWait = 0;
  g.players.find(p => p.id === 3).pos.set(5, 0, 0); g.players.find(p => p.id === 1).pos.set(-6, 0, 5);
  g.human.pos.set(2.2, 0, 0.9); g.human.yaw = Math.PI; g.updateOwnedBall(0);
  assert(g.pass(d, null, 'chest')); for (let i = 0; i < 60 && g.ball.pos.x < 2; i++) g.step(1 / 120);
  assert.equal(g.trySteal(g.human), 'loose'); assert.equal(g.ballState, 'loose'); assert.equal(g.passInfo, null);
});
test('a quick tap is a pump fake: no attempt, a live dribble, and a defender who bites leaves the floor', () => {
  const g = new GameEngine({ rng: () => 0.1 }); g.start('1v1'); g.checkTimer = 0;
  const d = g.players[1]; d.pos.set(0, 0, 0.45); g.step(1 / 120, { gather: true }); advance(g, 0.1);
  g.step(1 / 120, { release: {} });
  assert.equal(g.stats.attempts, 0); assert.equal(g.ballState, 'dribble'); assert.equal(g.ownerId, 0); assert(g.human.pump > 0);
  const up = g.ball.pos.y; advance(g, 0.12); assert(g.ball.pos.y > up, 'the ball is shown'); assert(d.jump > 0 || d.jumpVel > 0, 'the defender bit');
  assert(!g.dribbleMove(g.human, 'cross'), 'no move until the fake is finished');
  advance(g, 0.5); assert.equal(g.human.pump, 0); assert.equal(g.ownerId, 0);
  const steady = new GameEngine({ rng: () => 0.9 }); steady.start('1v1'); steady.checkTimer = 0; steady.players[1].pos.set(0, 0, 0.45);
  steady.step(1 / 120, { gather: true }); advance(steady, 0.1); steady.step(1 / 120, { release: {} }); advance(steady, 0.12);
  assert.equal(steady.players[1].jump, 0, 'a disciplined defender stays down');
});
test('a block needs a hand on the ball: feet on the floor do not get there, and a touch on the way down is goaltending', () => {
  const grounded = fresh('1v1'), d = grounded.players[1]; d.pos.set(0, 0, -2); grounded.giveBall(d);
  grounded.human.pos.set(0, 0, -2.6); grounded.human.yaw = 0; grounded.shoot(d, { aiCharge: T });
  advance(grounded, 0.3); assert.equal(grounded.stats.blocks, 0); assert.equal(grounded.ballState, 'flight');
  const g = fresh('1v1'), shooter = g.players[1]; shooter.pos.set(0, 0, 0.9); g.giveBall(shooter); g.human.pos.set(5, 0, 3);
  g.shoot(shooter, { aiCharge: T }); const value = g.shot.value;
  for (let i = 0; i < 400 && !(g.ball.vel.y < 0 && g.ball.pos.y < 3.7); i++) g.step(1 / 120);
  assert(g.ball.pos.y > CONFIG.hoop.y); g.step(1 / 120, { hands: [g.ball.pos.clone()] });
  assert.deepEqual(g.score, [0, value]); assert.equal(g.stats.blocks, 0); assert(g.checkTimer > 0); assert.equal(g.lastResult.label, 'GOALTENDING');
});
test('shot feedback names what happened: a swish, a short miss, a bank', () => {
  const result = g => { advance(g, 2.2); return g.lastResult; };
  const pure = fresh('practice'); cleanShot(pure); assert.equal(pure.shot.kind, 'jumper'); assert.deepEqual(result(pure), { made: true, label: 'SWISH', shooter: 0 });
  assert.equal(pure.stats.swishes, 1);
  const early = fresh('practice'); early.charge = T - 0.3; early.ballState = 'held'; early.updateOwnedBall(0); early.shoot(early.human, { aim: aim(early) });
  assert.equal(early.shot.timing, 'EARLY'); assert(early.shot.offset < -0.25); const miss = result(early); assert.equal(miss.made, false); assert.match(miss.label, /SHORT/);
  const glass = fresh('practice'); glass.human.pos.set(1.7, 0, -5); glass.human.locoVel.set(-1.5, 0, -1.5); glass.human.jump = 0.5;
  glass.charge = T; glass.ballState = 'held'; glass.updateOwnedBall(0); glass.shoot(glass.human, { aim: aim(glass) });
  assert(glass.shot.layup && glass.shot.bank); assert.equal(glass.shot.value, 2); assert.match(result(glass).label, /GLASS/);
});
test('a move breaks ankles only when the defender is going the wrong way', () => {
  const setup = sliding => {
    const g = fresh('1v1'), d = g.players[1]; g.human.pos.set(0, 0, 0); g.human.yaw = Math.PI; d.pos.set(0, 0, -1.2); d.locoVel.set(sliding, 0, 0);
    g.updateOwnedBall(0); assert(g.dribbleMove(g.human, 'cross')); return { g, d };
  };
  const fooled = setup(2.5); assert(fooled.d.stagger > 0.6); assert.equal(fooled.g.stats.ankles, 1); assert(fooled.g.human.burst > 0);
  const ready = setup(-2.5); assert.equal(ready.d.stagger, 0); assert.equal(ready.g.stats.ankles, 0); assert(ready.d.react > 0, 'even a good defender needs a beat to read it');
  assert.equal(ready.g.human.side, -1, 'the crossover changed hands');
});
test('a set defender holds their ground: the dribbler is stopped instead of sliding through', () => {
  const run = wall => {
    const g = fresh('1v1'), d = g.players[1]; g.human.pos.set(0, 0, 2); d.pos.set(wall ? 0 : 6, 0, 0.6); d.defending = true; d.yaw = 0;
    let bumps = 0; for (let i = 0; i < 180; i++) { g.step(1 / 120, { move: { x: 0, z: -1 }, aim: { x: 0, z: -1 } }); bumps += g.drainEvents().filter(e => e.type === 'bump').length; }
    return { z: g.human.pos.z, d: d.pos.z, bumps };
  };
  const free = run(false), blocked = run(true);
  assert(free.z < -2); assert(blocked.z > free.z + 1.5); assert(blocked.z > blocked.d, 'never passes through the defender'); assert(blocked.bumps > 0); assert.equal(free.bumps, 0);
});
test('catch and shoot is in rhythm; putting it on the floor first is not', () => {
  const g = fresh('2v2'), mate = g.players[1]; g.giveBall(mate); mate.pos.set(3, 0, 1); mate.aiWait = 0; g.human.pos.set(0, 0, 1);
  for (const d of g.players.slice(2)) d.pos.set(-6, 0, -6);
  g.updateOwnedBall(0); assert(g.pass(mate, g.human, 'chest')); for (let i = 0; i < 120 && g.ownerId !== 0; i++) g.step(1 / 120);
  assert.equal(g.ownerId, 0); advance(g, 0.1); cleanShot(g); assert(g.shot.rhythm);
  const h = fresh('practice'); advance(h, 1); cleanShot(h); assert(!h.shot.rhythm);
});
test('a tired shooter is less accurate and a fadeaway is harder to contest', () => {
  const g = fresh('1v1'), d = g.players[1]; g.human.pos.set(0, 0, 0); d.pos.set(0, 0, -1); d.yaw = 0; d.defending = true;
  g.human.stamina = 5; cleanShot(g); const tired = g.shot.quality, squared = g.shot.contest;
  const f = fresh('1v1'), e = f.players[1]; f.human.pos.set(0, 0, 0); e.pos.set(0, 0, -1); e.yaw = 0; e.defending = true;
  f.human.locoVel.set(0, 0, 1.6); cleanShot(f); assert(f.shot.fade); assert.equal(f.shot.kind, 'fadeaway'); assert(f.shot.contest < squared);
  assert(tired < f.shot.quality + 0.2); assert(!g.shot.green);
});

test('the jump shot is quick and set early: ball at the set point before take-off, gone at the top, follow-through held', () => {
  const S = CONFIG.shot, g = fresh('practice'); g.human.pos.set(0, 0, 0.6);
  assert(S.idealTime <= 0.65, 'a catch-and-shoot release well inside 0.79 s'); assert(S.takeoff < S.idealTime - 0.2);
  let atTakeoff = null;
  for (let i = 0; i < 200 && g.charge < S.idealTime; i++) { g.step(1 / 120, { gather: true, aim: aim(g), autoJump: true }); if (atTakeoff === null && g.human.jump > 0) atTakeoff = g.ball.pos.y; }
  assert(atTakeoff > 1.85, `the ball is set above the forehead before the feet leave (${atTakeoff})`);
  // Released within a few centimetres of the top of a modest jump, on the way up.
  assert(g.human.jump > 0.38 && g.human.jump < 0.5); assert(g.human.jumpVel > -0.2 && g.human.jumpVel < 0.9);
  const before = g.human.pos.clone(); g.step(1 / 120, { release: {}, aim: aim(g) });
  assert.equal(g.human.action, 'follow'); assert(g.human.actionTime >= 0.95); assert(g.shot.green);
  assert(g.shot.arc > 46 && g.shot.arc < 52, `launch ${g.shot.arc}`);
  // The ball comes down into the rim at roughly 46 degrees.
  let entry = 0; for (let i = 0; i < 400 && !entry; i++) { g.step(1 / 120); if (g.ball.vel.y < 0 && g.ball.pos.y <= CONFIG.hoop.y + 0.05) entry = Math.atan2(-g.ball.vel.y, Math.hypot(g.ball.vel.x, g.ball.vel.z)) * 180 / Math.PI; }
  assert(entry > 42 && entry < 50, `entry angle ${entry}`);
  advance(g, 0.6); assert.equal(g.lastResult.label, 'SWISH'); assert(g.human.pos.distanceTo(before) < 0.05, 'straight up and down');
});
