import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Button } from '../src/input/controller.js';
import { Quat, Vec3, Pose } from '../src/physics/math.js';
import { Input } from '../src/input/input.js';
import { GameEngine } from '../src/game/engine.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadBest, saveBest } from '../src/game/settings.js';
test('button edges fire once and release cleanly', () => {
  const b = new Button(); b.set(true); assert(b.down); b.set(true); assert(!b.down); b.set(false); assert(b.up); b.set(false); assert(!b.up);
});
test('rig movement does not become controller throw velocity', () => {
  const c = new Controller('right'), q = new Quat(); c.gripRef.p.set(0.2, 1, -0.5); c.gripPose.p.copy(c.gripRef.p); c.record(1, q);
  c.gripPose.p.add(new Vec3(20, 0, 20)); c.record(1.01, q); assert.equal(c.linVel.length(), 0);
  c.gripRef.p.y += 0.02; c.record(1.02, q); assert(c.linVel.y > 0);
});
test('tracking gaps and resumed poses cannot release a stale throw', () => {
  const c = new Controller('right'), q = new Quat(); c.record(1, q); c.gripRef.p.y = 0.03; c.record(1.01, q); assert(c.releaseVelocity(1.01).length() > 0);
  c.gripRef.p.y = 5; c.record(2, q); assert.equal(c.releaseVelocity(2).length(), 0); c.reset(); assert.equal(c.history.length, 0);
});
test('settings survive unavailable/corrupt storage and validate saved enum values', () => {
  const bad = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.equal(loadSettings(bad).difficulty, 'park'); assert.doesNotThrow(() => saveSettings({}, bad));
  assert.equal(loadSettings({ getItem: () => '{"difficulty":"nope","turn":"none"}' }).turn, 'snap'); assert.equal(loadBest(bad), 0);
  const storage = { value: '12', getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  assert.equal(saveBest(8, storage), 12); assert.equal(saveBest(25, storage), 25);
});

test('lost headset tracking cancels a grip gather without throwing, and keeps stale hands out of reach', () => {
  const engine = new GameEngine(); engine.start('practice'); engine.checkTimer = 0;
  engine.step(1 / 120, { gather: true });
  const input = Object.assign(Object.create(Input.prototype), {
    renderer: { xr: { isPresenting: true, getSession: () => ({}), getReferenceSpace: () => ({}) } },
    enabled: true, left: new Controller('left'), right: new Controller('right'), head: new Pose(),
    physicalGather: 'right', actions: [], suppressRelease: false,
  });
  input.right.tracked = input.left.tracked = true; input.right.buttons.squeeze.set(true);
  input.update(2, { getViewerPose: () => null });
  const cmd = input.command(1 / 90, DEFAULT_SETTINGS, engine);
  assert.deepEqual(cmd.hands, []); assert.equal(cmd.cancelGather, true); assert.equal(cmd.release, undefined);
  engine.step(1 / 120, cmd); assert.equal(engine.charge, 0); assert.equal(engine.ballState, 'dribble');
});

test('a tracked crossover travels between both controllers and finishes at the new hand', () => {
  const engine = new GameEngine(); engine.start('practice'); engine.checkTimer = 0;
  const input = Object.assign(Object.create(Input.prototype), {
    renderer: { xr: { isPresenting: true } }, enabled: true, head: new Pose(), actions: [],
    left: new Controller('left'), right: new Controller('right'), physicalGather: null,
  });
  input.left.tracked = input.right.tracked = true;
  input.left.gripPose.p.set(-0.31, 1, 0); input.right.gripPose.p.set(0.31, 1, 0);
  engine.dribbleMove(engine.human, 'cross');
  const move = engine.human.moveState; move.age = move.duration / 2;
  assert(Math.abs(input.command(1 / 90, DEFAULT_SETTINGS, engine).hand.x) < 1e-6);
  engine.human.moveState = null;
  assert.equal(input.command(1 / 90, DEFAULT_SETTINGS, engine).hand.x, -0.31);
});
