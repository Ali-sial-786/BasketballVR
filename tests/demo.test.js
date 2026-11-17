import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/engine.js';
import { demoCommand } from '../src/game/demo.js';

test('three-point spectator demo gathers and shoots through all racks under normal rules', () => {
  const engine = new GameEngine({ rng: () => 0.5 }); engine.start('contest');
  let releases = 0;
  for (let i = 0; i < 120 * 80 && engine.phase === 'playing'; i++) {
    const cmd = demoCommand(engine); if (cmd.release) releases++;
    engine.step(1 / 120, cmd);
  }
  assert.equal(engine.phase, 'result'); assert.equal(engine.contestShots, 25); assert.equal(releases, 25);
  assert.equal(engine.score[0], 34); assert(engine.contestResults.every(r => r?.made));
});

test('match spectator controller leaves all decisions to the normal match AI', () => {
  const engine = new GameEngine(); engine.start('2v2'); assert.deepEqual(demoCommand(engine), {});
});

test('AI-controlled home athlete lifts the ball through his own shooting gather', () => {
  const engine = new GameEngine(); engine.start('1v1'); engine.preview = true;
  engine.human.action = 'shooting'; engine.human.charge = 0.65; engine.charge = 0;
  engine.updateOwnedBall(0); assert(engine.ball.pos.y > 1.9);
});
