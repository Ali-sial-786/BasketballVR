import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/engine.js';
import { Vec3 } from '../src/physics/math.js';
import { CONFIG } from '../src/config.js';
const advance = (g, seconds, command = {}) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) g.step(1 / 120, command); };
const fresh = mode => { const e = new GameEngine({ rng: () => 0.5 }); e.start(mode); e.checkTimer = 0; e.updateAI = () => {}; return e; };
const aim = g => new Vec3(-g.human.pos.x, 0, CONFIG.hoop.z - g.human.pos.z).normalize();
function cleanShot(g) { g.charge = 0.72; g.ballState = 'held'; g.updateOwnedBall(0); return g.shoot(g.human, { aim: aim(g) }); }
test('four modes create the correct roster, and 1v1 does not fabricate a pass', () => {
  for (const [mode, count] of [['1v1', 2], ['2v2', 4], ['practice', 1], ['contest', 1]]) assert.equal(fresh(mode).players.length, count);
  const g = fresh('1v1'); assert(!g.pass(g.human)); assert.equal(g.ownerId, 0);
});
test('charging and a release make one attempt, then practice returns the ball', () => {
  const g = fresh('practice'); g.step(1 / 120, { gather: true }); advance(g, 0.7);
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
test('a steal changes possession and requires clearing beyond the arc', () => {
  const g = fresh('1v1'), d = g.players[1]; g.giveBall(d); g.possession = 1; d.shield = 0; g.updateOwnedBall(0);
  g.human.pos.copy(g.ball.pos).add(new Vec3(0, 0, 0.8)); g.human.pos.y = 0; g.human.yaw = Math.PI;
  assert(g.trySteal(g.human)); assert.equal(g.stats.steals, 1); assert(g.needsClear); assert(!cleanShot(g));
  g.human.pos.set(0, 0, 1); g.step(1 / 120); assert(!g.needsClear); assert(cleanShot(g));
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
  g.updateOwnedBall(0); assert(g.pass(g.human)); assert.equal(g.ballState, 'pass'); advance(g, 0.6);
  assert.equal(g.ownerId, 2); assert(g.needsClear);
});
test('reaching a rising shot while jumping creates a physical block', () => {
  const g = fresh('1v1'), d = g.players[1]; d.pos.set(0, 0, -2); g.giveBall(d); d.charge = 0.72;
  g.human.pos.set(0, 0, -2.6); g.human.yaw = 0; g.human.jump = 0.45; g.human.jumpVel = 1; g.shoot(d, { aiCharge: 0.72 });
  advance(g, 0.14); assert.equal(g.stats.blocks, 1); assert.equal(g.score[1], 0);
});
test('shot clock and out-of-bounds hand the check to the other team', () => {
  const g = fresh('1v1'); g.shotClock = 0.05; advance(g, 0.1); assert(g.checkTimer > 0); assert.equal(g.checkTeam, 1);
  g.checkTimer = 0; g.ownerId = null; g.ballState = 'loose'; g.ball.pos.set(8, 0.2, 0); g.lastTouch = 2; g.boundaries(); assert.equal(g.checkTeam, 0);
});
test('a real tracked hand can block without an artificial jump', () => {
  const g = fresh('1v1'), d = g.players[1]; d.pos.set(0, 0, -2); g.giveBall(d); g.shoot(d, { aiCharge: 0.72 });
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
