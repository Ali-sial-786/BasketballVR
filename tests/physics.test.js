import test from 'node:test';
import assert from 'node:assert/strict';
import { Basketball, arcVelocity, isThree, makeShot, releaseQuality, solveLaunch, passVelocity, backspin } from '../src/physics/basketball.js';
import { Vec3 } from '../src/physics/math.js';
import { CONFIG, RACKS } from '../src/config.js';
const run = (ball, seconds = 3, hz = 120) => { const events = []; for (let i = 0; i < hz * seconds; i++) events.push(...ball.step(1 / hz)); return events; };
test('perfect release is a clean swish from every rack at 72/90/120 Hz', () => {
  for (const hz of [72, 90, 120]) for (const rack of RACKS) {
    const from = new Vec3(rack.x, 2, rack.z), aim = new Vec3(-rack.x, 0, CONFIG.hoop.z - rack.z).normalize();
    const shot = makeShot({ from, feet: from, aim, rng: () => 0.5 }); const ball = new Basketball(); ball.launch(from, shot.vel, shot.spin);
    const baskets = run(ball, 3, hz).filter(e => e.type === 'basket');
    assert.equal(baskets.length, 1, `${rack.name} at ${hz} Hz`); assert(baskets[0].clean, `${rack.name} at ${hz} Hz touched iron`);
    assert(shot.arc > 44 && shot.arc < 58); assert(shot.spin.length() > 8, 'a jump shot carries backspin');
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
  const T = CONFIG.shot.idealTime;
  assert(releaseQuality(T).green); assert.equal(releaseQuality(0.1).timing, 'EARLY'); assert.equal(releaseQuality(1.1).timing, 'LATE');
  assert(releaseQuality(T - 0.1, 'rookie').green); assert(!releaseQuality(T - 0.1, 'allstar').green);
  const base = { from: new Vec3(0, 2, 1), feet: new Vec3(0, 0, 1), aim: new Vec3(0, 0, -1), rng: () => 0.6 };
  assert(makeShot(base).quality > makeShot({ ...base, contest: 1 }).quality);
  const away = makeShot({ ...base, aim: new Vec3(1, 0, 0) }); assert(!away.assisted); assert(away.vel.x > 0);
});
test('physical flick uses form and gives soft releases less assistance', () => {
  const base = { from: new Vec3(0, 1.85, 0), feet: new Vec3(), aim: new Vec3(0, 0, -1), rng: () => 0.5 };
  // From 6.1 m a natural flick is about 3.5 m/s; a token one barely leaves the hand.
  const soft = makeShot({ ...base, physicalVelocity: new Vec3(0, 0.2, -0.1) });
  const clean = makeShot({ ...base, physicalVelocity: new Vec3(0, 3.0, -1.8) });
  // A shooter whose natural flick is quicker is judged against their own touch.
  assert(makeShot({ ...base, physicalVelocity: new Vec3(0, 4.5, -2.7), touch: 1.5 }).green); assert(clean.green); assert(clean.quality > soft.quality);
  assert(soft.vel.length() < clean.vel.length() * 0.75, 'a token flick falls well short');
});
test('corner threes use the straight sideline, and inside jump shots are twos', () => {
  assert(isThree({ x: 6.65, z: -6.1 })); assert(!isThree({ x: 6.5, z: -6.1 })); assert(!isThree({ x: 6.55, z: -8 })); assert(isThree({ x: 0, z: 0.8 }));
  const v = arcVelocity(new Vec3(0, 3.5, -5), CONFIG.hoop, 3.8); assert(Number.isFinite(v.y));
});

test('setting your feet improves a jump shot, while a close layup keeps its soft arc', () => {
  const base = { from: new Vec3(0, 2, 1), feet: new Vec3(0, 0, 1), aim: new Vec3(0, 0, -1), rng: () => 0.5 };
  const set = makeShot(base), running = makeShot({ ...base, moving: 4.5 });
  assert(set.quality > running.quality); assert(set.green); assert.equal(running.green, false);
  const from = new Vec3(0.3, 2.2, -4.5), layup = makeShot({ ...base, from, feet: from, moving: 3, layup: true });
  const ball = new Basketball(); ball.launch(from, layup.vel, layup.spin);
  assert(run(ball, 2).some(e => e.type === 'basket')); assert.equal(layup.value, 2);
});

test('the same mistimed release costs more from deep than from the elbow', () => {
  const landing = distance => {
    const from = new Vec3(0, 2.45, CONFIG.hoop.z + distance), base = { from, feet: from, aim: new Vec3(0, 0, -1), rng: () => 0.5 };
    const shot = makeShot({ ...base, charge: CONFIG.shot.idealTime - 0.2 }); assert.equal(shot.timing, 'EARLY');
    const ball = new Basketball(); ball.launch(from, shot.vel, shot.spin);
    for (let i = 0; i < 400; i++) { ball.substep(1 / 240, null, 0); if (ball.vel.y < 0 && ball.pos.y <= CONFIG.hoop.y) break; }
    return ball.pos.z - CONFIG.hoop.z;
  };
  const elbow = landing(3.2), deep = landing(7.2);
  assert(elbow > 0 && deep > 0, 'an early release falls short of the rim'); assert(deep > elbow * 1.8);
  const late = makeShot({ from: new Vec3(0, 2.45, 0), feet: new Vec3(), aim: new Vec3(0, 0, -1), charge: CONFIG.shot.idealTime + 0.23, rng: () => 0.5 });
  const on = makeShot({ from: new Vec3(0, 2.45, 0), feet: new Vec3(), aim: new Vec3(0, 0, -1), rng: () => 0.5 });
  assert(late.vel.length() > on.vel.length(), 'a late release is pushed long');
});

test('contested and tired releases scatter; a clean one does not', () => {
  let seed = 9; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const made = options => {
    let count = 0;
    for (let i = 0; i < 120; i++) {
      const from = new Vec3(0, 2.45, 0.6), shot = makeShot({ from, feet: from, aim: new Vec3(0, 0, -1), rng, ...options });
      const ball = new Basketball(); ball.launch(from, shot.vel, shot.spin); if (run(ball, 2.4).some(e => e.type === 'basket')) count++;
    }
    return count;
  };
  const open = made({}), smothered = made({ contest: 1 }), tired = made({ fatigue: 1, contest: 0.5 });
  assert.equal(open, 120); assert(smothered < 70); assert(tired < open);
});

test('backspin checks the ball on the floor and deadens it off the glass', () => {
  const flat = new Basketball(), spun = new Basketball();
  flat.launch(new Vec3(0, 1, 0), new Vec3(4, -3, 0)); spun.launch(new Vec3(0, 1, 0), new Vec3(4, -3, 0), backspin(Math.PI / 2, 4));
  run(flat, 0.5); run(spun, 0.5); assert(spun.vel.x < flat.vel.x - 0.4);
  const glass = spin => { const b = new Basketball(); b.launch(new Vec3(0, 3.5, -6), new Vec3(0, 1, -5), spin); run(b, 0.2); return b.vel.y; };
  assert(glass(backspin(Math.PI, 3)) < glass(null) - 0.3, 'backspin drags the ball down the board');
});

test('wing layups go off the glass, straight-on finishes do not, and both score', () => {
  for (const [x, z, bank] of [[1.6, -5.2, true], [-1.5, -5.0, true], [0, -4.4, false]]) {
    const from = new Vec3(x, 2.75, z), aim = new Vec3(-x, 0, CONFIG.hoop.z - z).normalize();
    const shot = makeShot({ from, feet: from, aim, layup: true, rng: () => 0.5 }); assert.equal(shot.bank, bank);
    const ball = new Basketball(); ball.launch(from, shot.vel, shot.spin); const events = run(ball, 2);
    assert(events.some(e => e.type === 'basket')); assert.equal(events.some(e => e.type === 'board'), bank);
  }
});

test('the solver brings the ball down through its target with drag and lift included', () => {
  const from = new Vec3(3, 2.3, 1), target = new Vec3(0, 3.05, -6.1), launch = solveLaunch(from, target, 0.9, 2.2);
  assert(launch && launch.speed > 7 && launch.speed < 11);
  assert.equal(solveLaunch(from, from, 0.9), null);
});

test('chest passes are flat, bounce passes skip once and arrive at the waist, lobs clear a reaching defender', () => {
  const origin = new Vec3(0, 1.25, 0), destination = new Vec3(5, 1.2, 0);
  const fly = kind => {
    const p = passVelocity(origin, destination, kind), ball = new Basketball(); ball.launch(origin, p.vel, p.spin);
    let top = 0, bounces = 0, time = 0, mid = 0;
    while (ball.pos.x < 5 && time < 3) { bounces += ball.step(1 / 120).filter(e => e.type === 'bounce').length; time += 1 / 120; top = Math.max(top, ball.pos.y); if (!mid && ball.pos.x >= 2.5) mid = ball.pos.y; }
    return { top, bounces, time, mid, arrive: ball.pos.y, estimate: p.duration };
  };
  const chest = fly('chest'), bounce = fly('bounce'), lob = fly('lob');
  assert(chest.top < 1.6 && chest.bounces === 0 && chest.time < 0.5 && Math.abs(chest.arrive - 1.2) < 0.15);
  assert.equal(bounce.bounces, 1); assert(bounce.arrive > 0.6 && bounce.arrive < 1.3);
  assert(lob.mid > 3.2 && lob.time > 1.1 && Math.abs(lob.arrive - 1.2) < 0.2);
  for (const pass of [chest, bounce, lob]) assert(Math.abs(pass.time - pass.estimate) < 0.12);
});

test('a real flick sends the ball along the hand: wide on All-star, forgiven on Rookie, short when soft', () => {
  const base = { from: new Vec3(0, 1.9, 0), feet: new Vec3(), aim: new Vec3(0, 0, -1), rng: () => 0.5 };
  const wide = new Vec3(1.2, 2.2, -1.2);
  const hard = makeShot({ ...base, difficulty: 'allstar', physicalVelocity: wide }), easy = makeShot({ ...base, difficulty: 'rookie', physicalVelocity: wide });
  assert(hard.vel.x > easy.vel.x && hard.vel.x > 0.1); assert(Math.abs(easy.vel.x) < 0.1);
  const soft = makeShot({ ...base, physicalVelocity: new Vec3(0, 0.9, -0.4) }), firm = makeShot({ ...base, physicalVelocity: new Vec3(0, 2.2, -1.1) });
  assert(soft.vel.length() < firm.vel.length());
});
