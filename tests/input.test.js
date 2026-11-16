import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Button } from '../src/input/controller.js';
import { Quat, Vec3 } from '../src/physics/math.js';
import { loadSettings, saveSettings, loadBest, saveBest } from '../src/game/settings.js';
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
