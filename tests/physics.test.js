import test from 'node:test';
import assert from 'node:assert/strict';
import { Basketball, arcVelocity, isThree, makeShot, releaseQuality } from '../src/physics/basketball.js';
import { Vec3 } from '../src/physics/math.js';
import { CONFIG, RACKS } from '../src/config.js';
const run = (ball, seconds = 3, hz = 120) => { const events = []; for (let i = 0; i < hz * seconds; i++) events.push(...ball.step(1 / hz)); return events; };
test('perfect release reaches the physical opening from every rack at 72/90/120 Hz', () => {
  for (const hz of [72, 90, 120]) for (const rack of RACKS) {
    const from = new Vec3(rack.x, 2, rack.z), aim = new Vec3(-rack.x, 0, CONFIG.hoop.z - rack.z).normalize();
    const shot = makeShot({ from, feet: from, aim, rng: () => 0.5 }); const ball = new Basketball(); ball.launch(from, shot.vel);
    assert.equal(run(ball, 3, hz).filter(e => e.type === 'basket').length, 1, `${rack.name} at ${hz} Hz`);
  }
});
test('only a descending ball inside the rim scores', () => {
  const ball = new Basketball(), h = CONFIG.hoop; ball.launch(new Vec3(0, h.y - 0.1, h.z), new Vec3(0, 7, 0));
  assert.equal(run(ball, 0.1).some(e => e.type === 'basket'), false);
  ball.launch(new Vec3(0.5, h.y + 0.1, h.z), new Vec3(0, -2, 0)); assert.equal(run(ball, 0.4).some(e => e.type === 'basket'), false);
});
test('rim and swept backboard collisions deflect the ball', () => {
  const ball = new Basketball(), h = CONFIG.hoop; ball.launch(new Vec3(h.radius, h.y + 0.25, h.z), new Vec3(0, -6, 0));
  assert(run(ball, 0.1).some(e => e.type === 'rim')); assert.equal(ball.scored, false);
  ball.launch(new Vec3(0.6, 3.5, -6), new Vec3(0, 0, -70)); assert(ball.step(1 / 30).some(e => e.type === 'board')); assert(ball.vel.z > 0);
});
test('floor bounces lose energy and never sink through the court', () => {
  const b = new Basketball(); b.launch(new Vec3(2, 1, 2), new Vec3(2, -4, 0)); const events = run(b, 0.4);
  assert(events.some(e => e.type === 'bounce')); assert(b.pos.y >= CONFIG.ball.radius); assert(Math.abs(b.vel.x) < 2);
});
test('release timing, contest and facing all affect the result', () => {
  assert(releaseQuality(0.72).green); assert.equal(releaseQuality(0.2).timing, 'EARLY'); assert.equal(releaseQuality(1.2).timing, 'LATE');
  assert(releaseQuality(0.62, 'rookie').green); assert(!releaseQuality(0.62, 'allstar').green);
  const base = { from: new Vec3(0, 2, 1), feet: new Vec3(0, 0, 1), aim: new Vec3(0, 0, -1), rng: () => 0.6 };
  assert(makeShot(base).quality > makeShot({ ...base, contest: 1 }).quality);
  const away = makeShot({ ...base, aim: new Vec3(1, 0, 0) }); assert(!away.assisted); assert(away.vel.x > 0);
});
test('physical flick uses form and gives soft releases less assistance', () => {
  const base = { from: new Vec3(0, 1.85, 0), feet: new Vec3(), aim: new Vec3(0, 0, -1), rng: () => 0.5 };
  const soft = makeShot({ ...base, physicalVelocity: new Vec3(0, 0.2, -0.1) });
  const clean = makeShot({ ...base, physicalVelocity: new Vec3(0, 2, -1) }); assert(clean.green); assert(clean.quality > soft.quality);
});
test('corner threes use the straight sideline, and inside jump shots are twos', () => {
  assert(isThree({ x: 6.65, z: -6.1 })); assert(!isThree({ x: 6.5, z: -6.1 })); assert(isThree({ x: 0, z: 0.8 }));
  const v = arcVelocity(new Vec3(0, 3.5, -5), CONFIG.hoop, 3.8); assert(Number.isFinite(v.y));
});
