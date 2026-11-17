import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/physics/math.js';
import { movePlayer, beginMove, advanceMove, dribbleOffset, dribbleHand } from '../src/game/movement.js';
import { GameEngine } from '../src/game/engine.js';
const player = () => ({ pos: new Vec3(), vel: new Vec3(), locoVel: new Vec3(), acceleration: new Vec3(), yaw: Math.PI, side: 1, dribble: 0, defending: false });
test('movement accelerates and brakes continuously instead of snapping', () => {
  const p = player(), desired = new Vec3(3.5, 0, 0);
  movePlayer(p, desired, 1 / 120); assert(p.vel.x > 0 && p.vel.x < 0.2);
  for (let i = 0; i < 60; i++) movePlayer(p, desired, 1 / 120);
  assert(Math.abs(p.vel.x - 3.5) < 0.01);
  movePlayer(p, new Vec3(), 1 / 120); assert(p.vel.x > 3 && p.vel.x < 3.5);
  for (let i = 0; i < 30; i++) movePlayer(p, new Vec3(), 1 / 120); assert.equal(p.vel.length(), 0);
});
test('each move has bounded per-step travel and equal duration at 72/120 Hz', () => {
  for (const kind of ['cross', 'behind', 'spin', 'stepback']) {
    const endpoints = [];
    for (const hz of [72, 120]) {
      const p = player(); beginMove(p, kind); assert.equal(p.pos.length(), 0, 'starting a move must not teleport');
      for (let i = 0; i < hz; i++) { const old = p.pos.clone(); p.vel.set(0, 0, 0); advanceMove(p, 1 / hz); assert(p.pos.distanceTo(old) < 0.05); }
      endpoints.push(p.pos); assert.equal(p.moveState, null);
    }
    assert(endpoints[0].distanceTo(endpoints[1]) < 1e-6);
  }
});
test('crossover transfers below the waist, and a wrap actually passes behind the hip', () => {
  const p = player(); beginMove(p, 'cross'); const first = dribbleOffset(p); p.moveState.age = p.moveState.duration / 2;
  const middle = dribbleOffset(p); p.moveState.age = p.moveState.duration; const last = dribbleOffset(p);
  assert(first.x * last.x < 0); assert(middle.y < 0.2); assert(middle.y < first.y);
  beginMove(p, 'behind'); p.moveState.age = p.moveState.duration / 2; assert(dribbleOffset(p).z < -0.3);
});
test('a missed reach leaves room for a timed change of direction and motion pauses safely', () => {
  const g = new GameEngine(); g.start('practice'); g.checkTimer = 0;
  g.dribbleMove(g.human, 'cross'); for (let i = 0; i < 20; i++) g.step(1 / 120);
  assert(g.human.pos.x !== 0); g.pause(); const pos = g.human.pos.clone();
  for (let i = 0; i < 120; i++) g.step(1 / 120); assert(g.human.pos.distanceTo(pos) === 0); assert.equal(g.human.moveState, null);
});

test('live handles start and finish at the ordinary bounce with a handoff at floor contact', () => {
  for (const kind of ['cross', 'behind', 'spin', 'stepback']) for (const phase of [0.05, 0.83, 1.87, 3.1]) {
    const p = player(); p.dribble = phase;
    const entry = dribbleOffset(p); beginMove(p, kind);
    assert(dribbleOffset(p).distanceTo(entry) < 1e-8); assert.equal(dribbleHand(p), 1);
    p.moveState.age = p.moveState.duration * 0.51; assert.equal(dribbleHand(p), p.side);
    p.dribble += 4; p.moveState.age = p.moveState.duration;
    const exit = dribbleOffset(p); p.moveState = null;
    assert(dribbleOffset(p).distanceTo(exit) < 1e-8);
  }
});
