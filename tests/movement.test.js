import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/physics/math.js';
import { movePlayer, beginMove, advanceMove, dribbleOffset, dribbleHand, dribbleInHand, dribbleTop, heldOffset, MOVES, MOVE_SPECS } from '../src/game/movement.js';
import { CONFIG } from '../src/config.js';
import { GameEngine } from '../src/game/engine.js';
const player = () => ({ pos: new Vec3(), vel: new Vec3(), locoVel: new Vec3(), acceleration: new Vec3(), yaw: Math.PI, side: 1, dribble: 0, defending: false });
test('movement accelerates and brakes continuously instead of snapping', () => {
  const p = player(), desired = new Vec3(3.5, 0, 0);
  movePlayer(p, desired, 1 / 120); assert(p.vel.x > 0 && p.vel.x < 0.3);
  for (let i = 0; i < 60; i++) movePlayer(p, desired, 1 / 120);
  assert(Math.abs(p.vel.x - 3.5) < 0.01);
  movePlayer(p, new Vec3(), 1 / 120); assert(p.vel.x > 3 && p.vel.x < 3.5);
  for (let i = 0; i < 30; i++) movePlayer(p, new Vec3(), 1 / 120); assert.equal(p.vel.length(), 0);
});
test('each move has bounded per-step travel and equal duration at 72/120 Hz', () => {
  assert.deepEqual([...MOVES].sort(), ['behind', 'cross', 'hesi', 'legs', 'spin', 'stepback']);
  for (const kind of MOVES) {
    const endpoints = [];
    for (const hz of [72, 120]) {
      const p = player(); beginMove(p, kind); assert.equal(p.pos.length(), 0, 'starting a move must not teleport');
      for (let i = 0; i < hz; i++) { const old = p.pos.clone(); p.vel.set(0, 0, 0); advanceMove(p, 1 / hz); assert(p.pos.distanceTo(old) < 0.05); }
      endpoints.push(p.pos); assert.equal(p.moveState, null);
    }
    assert(endpoints[0].distanceTo(endpoints[1]) < 1e-6);
  }
});
test('changes of hand cross low: in front, between the legs, or behind the hip', () => {
  for (const [kind, check] of [['cross', o => o.z > 0.3], ['legs', o => Math.abs(o.z) < 0.12], ['behind', o => o.z < -0.3]]) {
    const p = player(); p.dribble = Math.PI / 2; beginMove(p, kind);
    const first = dribbleOffset(p); p.moveState.age = p.moveState.duration / 2;
    const middle = dribbleOffset(p); p.moveState.age = p.moveState.duration; const last = dribbleOffset(p);
    assert(first.x * last.x < 0, `${kind} changes hands`); assert(middle.y < 0.2 && middle.y < first.y, `${kind} touches the floor mid-transfer`);
    assert(Math.abs(middle.x) < 0.05); assert(check(middle), `${kind} takes its own path`);
  }
  const p = player(); p.dribble = 0.4; beginMove(p, 'hesi'); p.moveState.age = p.moveState.duration / 2;
  assert(dribbleOffset(p).y > dribbleTop(p), 'a hesitation hangs the ball at the top'); assert.equal(p.side, 1);
});
test('a missed reach leaves room for a timed change of direction and motion pauses safely', () => {
  const g = new GameEngine(); g.start('practice'); g.checkTimer = 0;
  g.dribbleMove(g.human, 'cross'); for (let i = 0; i < 20; i++) g.step(1 / 120);
  assert(g.human.pos.x !== 0); g.pause(); const pos = g.human.pos.clone();
  for (let i = 0; i < 120; i++) g.step(1 / 120); assert(g.human.pos.distanceTo(pos) === 0); assert.equal(g.human.moveState, null);
});

test('live handles start and finish at the ordinary bounce with a handoff at floor contact', () => {
  for (const kind of MOVES) for (const phase of [0.05, 0.83, 1.87, 3.1]) {
    const p = player(); p.dribble = phase;
    const entry = dribbleOffset(p); beginMove(p, kind);
    assert(dribbleOffset(p).distanceTo(entry) < 1e-8); assert.equal(dribbleHand(p), 1);
    assert(MOVE_SPECS[kind].cost > 0 && MOVE_SPECS[kind].shield > 0);
    p.moveState.age = p.moveState.duration * 0.51; assert.equal(dribbleHand(p), p.side);
    p.dribble += 4; p.moveState.age = p.moveState.duration;
    const exit = dribbleOffset(p); p.moveState = null;
    assert(dribbleOffset(p).distanceTo(exit) < 1e-8);
  }
});

test('a live dribble rides the hand for part of each beat and drops low when protected', () => {
  const p = player(); let held = 0, top = 0, low = 9;
  for (let i = 0; i < 200; i++) { p.dribble = i / 200 * Math.PI; const y = dribbleOffset(p).y; if (dribbleInHand(p)) held++; top = Math.max(top, y); low = Math.min(low, y); }
  assert(held > 60 && held < 100, 'hand contact is roughly 40% of the beat');
  assert(Math.abs(low - CONFIG.ball.radius) < 0.02); assert(top > 0.9 && top < 1.05);
  p.protect = 1; p.dribble = Math.PI / 2; const covered = dribbleOffset(p);
  assert(covered.y < 0.65, 'knee high under pressure'); assert(covered.z < 0.1, 'pulled back onto the hip'); assert(dribbleTop(p) < top - 0.3);
  p.protect = 0; p.vel.set(0, 0, -4.5); assert(dribbleOffset(p).z > 0.4, 'pushed out in front at a run');
});

test('the gathered ball travels pocket, set point, release without ever dropping', () => {
  const p = player(); p.height = 1.92; let last = 0;
  for (let c = 0; c <= 0.9; c += 0.02) { const o = heldOffset(p, c); assert(o.y >= last - 1e-9); last = o.y; assert(o.x > 0 && o.z > 0.2); }
  assert(heldOffset(p, 0).y < 1.1); assert(heldOffset(p, 0.52).y > 1.9); assert(heldOffset(p, 0.9).y > 2.2);
  p.side = -1; assert(heldOffset(p, 0.5).x < 0, 'left-handed shooters carry it on the left');
  p.eyeView = true; assert(heldOffset(p, 0.52).z > 0.5, 'in first person the ball stays out of the eyes');
});
