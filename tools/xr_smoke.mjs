// Headset smoke test: plays the game in an emulated Quest (tools/xr_harness.mjs)
// and checks the headset controls end to end.
//   REVIEW_URL=http://127.0.0.1:5173 node tools/xr_smoke.mjs
import assert from 'node:assert/strict';
import { openXR } from './xr_harness.mjs';

const xr = await openXR();
const q = (pitch = 0, yaw = 0) => { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2); return [cy * sx, sy * cx, -sy * sx, cy * cx]; };
const rest = { head: { p: [0, 1.7, 0], pitch: -0.1 }, right: { p: [0.22, 1.05, -0.3], q: q(-0.2) }, left: { p: [-0.22, 1.05, -0.3], q: q(-0.2) } };
async function path(side, keys, n) {
  for (let i = 0; i <= n; i++) {
    const u = i / n * (keys.length - 1), k = Math.min(keys.length - 2, Math.floor(u)), f = u - k, a = keys[k], b = keys[k + 1], at = a.map((v, j) => v + (b[j] - v) * f);
    await xr.pose({ [side]: { p: at.slice(0, 3), q: q(at[3] ?? 0) } }); await xr.frames(1);
  }
}
const place = (x, z) => xr.page.evaluate(([x, z]) => { const e = window.__rimrun.engine; e.human.pos.set(x, 0, z); e.human.yaw = Math.PI; e.giveBall(e.human); e.emit('recenter'); }, [x, z]);
const results = [];
try {
  await xr.pose(rest); await xr.start('practice'); await xr.frames(100);

  // A real shooting motion releases a shot; the ball leaves the hand.
  await place(0, 1.0); await xr.frames(20);
  await xr.press('right', 'trigger'); await xr.frames(6);
  assert.equal((await xr.state()).ballState, 'held', 'trigger holds the ball');
  await path('right', [[0.2, 1.15, -0.25, 0.6], [0.18, 1.5, -0.22, 1.0], [0.17, 1.75, -0.27, 1.3], [0.17, 1.95, -0.36, 1.5]], 16);
  await xr.releaseButton('right', 'trigger'); await xr.frames(1);
  let st = await xr.state(); assert.equal(st.ballState, 'flight', 'a throw is a shot'); assert(st.vel[1] > 4 && st.vel[2] < -2, 'up and toward the rim');
  results.push('throw-to-shoot');
  await xr.pose(rest); await xr.frames(260);

  // Holding and letting go without a throw is not a shot.
  await place(0, 1.0); await xr.frames(20); await xr.press('right', 'trigger'); await xr.frames(20); await xr.releaseButton('right', 'trigger'); await xr.frames(3);
  st = await xr.state(); assert.equal(st.owner, 0); assert.equal(st.ballState, 'dribble', 'no throw, no shot'); assert.equal(st.shot, null);
  results.push('no-swing release keeps the ball');

  // A soft flick falls short.
  await xr.frames(20); await xr.press('right', 'trigger'); await xr.frames(6);
  await path('right', [[0.2, 1.3, -0.25, 0.8], [0.19, 1.55, -0.3, 1.2]], 10);
  await xr.releaseButton('right', 'trigger'); await xr.frames(150);
  st = await xr.state(); assert(st.lastResult && !st.lastResult.made && /SHORT/.test(st.lastResult.label), `soft flick falls short (${st.lastResult?.label})`);
  results.push('soft flick short');
  await xr.pose(rest); await xr.frames(200);

  // Boost + jump near the rim, ball up over the ring, slam it down.
  await place(0, -3.9); await xr.frames(40);
  await xr.press('right', 'trigger'); await xr.frames(4); await xr.press('left', 'trigger'); await xr.press('right', 'a-button'); await xr.frames(2); await xr.releaseButton('right', 'a-button');
  await path('right', [[0.2, 1.2, -0.3, 0.6], [0.15, 2.1, -0.45, 1.6]], 14);
  await path('right', [[0.15, 2.1, -0.45, 1.6], [0.15, 2.12, -0.5, 1.6]], 14);
  await path('right', [[0.15, 2.12, -0.5, 1.6], [0.15, 1.6, -0.55, 0.2]], 5);
  await xr.releaseButton('right', 'trigger'); await xr.releaseButton('left', 'trigger'); await xr.frames(60);
  st = await xr.state(); assert.equal(st.lastResult?.label, 'SLAM', 'dunk');
  results.push('dunk');
  await xr.pose(rest); await xr.frames(200);

  // Grip + motion picks the dribble move.
  await place(0, 1.0); await xr.frames(40);
  const move = async (side, keys, head) => {
    await xr.page.evaluate(() => { const h = window.__rimrun.engine.human; h.moveCooldown = 0; h.stamina = 100; });
    await xr.press(side, 'squeeze');
    for (let i = 0; i <= 8; i++) { const k = keys[0].map((v, j) => v + (keys[1][j] - v) * i / 8); await xr.pose({ [side]: { p: k, q: q(-0.2) }, ...(head ? { head: { p: [0, 1.7, 0], yaw: head * i / 8 } } : {}) }); await xr.frames(1); }
    await xr.releaseButton(side, 'squeeze'); await xr.frames(2);
    const kind = await xr.page.evaluate(() => window.__rimrun.engine.human.moveState?.kind);
    await xr.pose(rest); await xr.frames(70); return kind;
  };
  assert.equal(await move('right', [[0.25, 0.95, -0.3], [-0.15, 0.9, -0.3]]), 'cross');
  assert.equal(await move('right', [[0.25, 0.7, -0.15], [-0.1, 0.5, -0.05]]), 'legs');
  assert.equal(await move('right', [[0.3, 0.9, 0.0], [0.0, 0.85, 0.2]]), 'behind');
  assert.equal(await move('right', [[0.22, 1.0, -0.45], [0.22, 1.0, -0.1]]), 'stepback');
  assert.equal(await move('right', [[0.22, 1.0, -0.3], [0.22, 1.0, -0.3]], 1.2), 'spin');
  assert.equal(await move('left', [[-0.22, 1.0, -0.3], [-0.22, 1.0, -0.3]]), 'hesi');
  results.push('gesture dribble moves');

  // Boost on the left trigger, running smoothly.
  await place(0, 6); await xr.stick('left', 0, -1); await xr.frames(40);
  const steps = [];
  for (let i = 0; i < 24; i++) { const a = await xr.page.evaluate(() => window.__rimrun.input.rig.position.z); await xr.frames(1); steps.push(await xr.page.evaluate(() => window.__rimrun.input.rig.position.z) - a); }
  const mean = steps.reduce((a, b) => a + b) / steps.length;
  assert(Math.max(...steps.map(s => Math.abs(s - mean))) < 0.003, 'the view advances evenly every frame');
  await xr.press('left', 'trigger'); await xr.frames(50); st = await xr.state(); assert(st.human.speed > 5.5, `boost (${st.human.speed.toFixed(2)} m/s)`);
  results.push('smooth running and boost');

  assert.deepEqual(xr.errors, [], 'no browser errors');
  console.log(`Headset: ${results.join(', ')} passed.`);
} finally { await xr.close(); }
