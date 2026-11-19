import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
// The rig is real three.js skinning and IK; only its canvas shadow is stubbed.
// A canvas that accepts any drawing call and draws nothing.
const inertContext = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] ?? (() => {}), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => inertContext }) };
globalThis.fetch = async url => {
  try { const buffer = await fs.readFile(fileURLToPath(new URL(`../public/${url}`, import.meta.url))); return { ok: true, json: async () => JSON.parse(buffer), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }; }
  catch { return { ok: false, status: 404 }; }
};
const { loadAthlete, Humanoid, handGeometry } = await import('../src/render/humanoid.js');
const { loadClips, applyClip, clipInfo } = await import('../src/render/clips.js');
await loadAthlete('assets/models/'); await loadClips('assets/anim/');
const BIND = JSON.parse(await fs.readFile(fileURLToPath(new URL('../public/assets/models/athlete.json', import.meta.url))));
test('detailed basketball athlete has valid smooth normals, skin weights and complete anatomical hands', () => {
  const h = new Humanoid({ headgear: 'bare' }), g = h.mesh.geometry;
  assert(g.index.count / 3 > 40000); assert.equal(h.boneList.length, 17);
  const weights = g.attributes.skinWeight, normal = g.attributes.normal;
  for (let i = 0; i < weights.count; i++) {
    let sum = 0; for (let k = 0; k < 4; k++) sum += weights.getComponent(i, k);
    assert(Math.abs(sum - 1) < 0.01); const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)); assert(length > 0.97 && length < 1.03);
  }
  for (const side of ['L', 'R']) assert(handGeometry(side).attributes.position.count > 300);
});
test('the human rig reaches actual basketball hand targets with its two-bone IK', () => {
  const h = new Humanoid({ headgear: 'bare' });
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1, target = new THREE.Vector3(sign * 0.4, 1.2, 0.3);
    h.ikArm(side, target, new THREE.Vector3(sign * 0.6, 1, 0)); h.update();
    assert(h.worldPos('hand' + side, new THREE.Vector3()).distanceTo(target) < 0.001);
  }
});
test('uploaded Mixamo dribble is present, animated, grounded, and finite across the entire loop', () => {
  const info = clipInfo('dribble'); assert(info); assert.equal(info.frames, 63); assert(info.src.includes('Mixamo'));
  const h = new Humanoid({ headgear: 'bare' }), positions = [];
  for (let i = 0; i < info.frames; i++) {
    h.reset(); assert(applyClip(h, 'dribble', i / info.fps)); h.update();
    const p = h.worldPos('handR', new THREE.Vector3()); positions.push(p.y);
    assert(p.toArray().every(Number.isFinite)); assert(h.lowest() > -0.07);
  }
  assert(Math.max(...positions) - Math.min(...positions) > 0.1, 'retargeted hand must actually dribble');
});

test('planted feet stay in world space through a short defensive slide and clear the floor', async () => {
  const { Footwork } = await import('../src/render/footwork.js');
  const h = new Humanoid({ headgear: 'bare' }), footwork = new Footwork();
  const p = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), jump: 0, defending: true };
  h.reset(); applyClip(h, 'set', 0); footwork.update(1 / 120, p, h, false);
  const planted = h.worldPos('ankleL', new THREE.Vector3());
  for (let i = 0; i < 10; i++) {
    h.reset(); applyClip(h, 'set', 0); p.pos.x += 0.008; p.vel.x = 0.96; h.root.position.copy(p.pos);
    footwork.update(1 / 120, p, h, false);
  }
  assert(h.worldPos('ankleL', new THREE.Vector3()).distanceTo(planted) < 0.005);
  assert(h.lowest() > -0.025);
});

test('eyes align with their sockets, shoe surfaces face out, and concealed feet cannot poke through', async () => {
  const meta = JSON.parse(await fs.readFile(new URL('../public/assets/models/athlete.json', import.meta.url)));
  const binary = await fs.readFile(new URL('../public/assets/models/athlete.bin', import.meta.url));
  const vertices = name => {
    const p = meta.lods[0].parts.find(p => p.name === name), v = [];
    for (let i = 0; i < p.vCount; i++) v.push({ x: binary.readFloatLE(p.pos + i * 12), y: binary.readFloatLE(p.pos + i * 12 + 4), z: binary.readFloatLE(p.pos + i * 12 + 8), ny: binary.readInt8(p.nrmKit + i * 4 + 1) / 127 });
    return v;
  };
  const centerY = v => (Math.min(...v.map(p => p.y)) + Math.max(...v.map(p => p.y))) / 2;
  // Two eyeballs, mirror images of each other, level, at the eyes' landmark height.
  const eyes = vertices('Details_Eyes'), side = s => eyes.filter(p => Math.sign(p.x) === s), midX = v => (Math.min(...v.map(p => p.x)) + Math.max(...v.map(p => p.x))) / 2;
  assert(Math.abs(midX(side(1)) + midX(side(-1))) < 0.001 && Math.abs(centerY(side(1)) - centerY(side(-1))) < 0.001 && Math.abs(centerY(eyes) - meta.eyeY) < 0.003);
  assert(vertices('Athlete_Body').every(p => p.y > 0.25));
  const top = vertices('Details_Shoe').filter(p => p.z > 0.13 && p.y > 0.07 && p.y < 0.13);
  assert(top.length > 10); assert(top.reduce((sum, p) => sum + p.ny, 0) / top.length > 0.15);
});

test('first-person arms keep their skinning and restore the complete model when spectating', () => {
  const h = new Humanoid({ headgear: 'bare' }), full = h.mesh.geometry, skeleton = h.mesh.skeleton;
  h.setArmsOnly(true);
  assert(h.mesh.geometry.index.count > 1000); assert(h.mesh.geometry.index.count < full.index.count / 2);
  const ids = [...new Set(h.mesh.geometry.index.array)];
  const boneNames = ids.map(id => {
    const { skinIndex, skinWeight } = h.mesh.geometry.attributes;
    let top = 0;
    for (let i = 1; i < 4; i++) if (skinWeight.getComponent(id, i) > skinWeight.getComponent(id, top)) top = i;
    return h.boneList[skinIndex.getComponent(id, top)].name;
  });
  assert(boneNames.includes('handL') && boneNames.includes('handR')); assert(!boneNames.includes('head'));
  h.setArmsOnly(false); assert.equal(h.mesh.geometry, full); assert.equal(h.mesh.skeleton, skeleton);
});


test('looking down at a crossover keeps the cut shoulders behind the first-person camera', async () => {
  const { PlayerView } = await import('../src/render/athletes.js');
  const { GameEngine } = await import('../src/game/engine.js');
  const g = new GameEngine(); g.start('practice'); g.checkTimer = 0;
  const scene = new THREE.Scene(), view = new PlayerView(scene, g.human);
  const forward = new THREE.Vector3(Math.sin(g.human.yaw), 0, Math.cos(g.human.yaw));
  g.dribbleMove(g.human, 'cross');
  for (let i = 0; i < 40; i++) {
    g.step(1 / 60); view.update(1 / 60, g.time, g.human, g, true, -1.1);
    for (const side of ['L', 'R']) {
      const shoulder = view.h.worldPos('shoulder' + side, new THREE.Vector3());
      assert(shoulder.sub(g.human.pos).dot(forward) < -0.06);
    }
  }
  view.update(1 / 60, g.time, g.human, g);
  assert.equal(view.h.armsOnly, false); assert.equal(view.h.mesh.castShadow, true);
  view.dispose(scene);
});

const posed = async (mode, prepare, frames = 1) => {
  const { PlayerView } = await import('../src/render/athletes.js');
  const { GameEngine } = await import('../src/game/engine.js');
  const g = new GameEngine({ rng: () => 0.5 }); g.start(mode); g.checkTimer = 0; g.updateAI = () => {};
  const scene = new THREE.Scene(), views = g.players.map(p => new PlayerView(scene, p));
  const tick = (cmd = {}) => { g.step(1 / 120, cmd); g.step(1 / 120, cmd); views.forEach((v, i) => v.update(1 / 60, g.time, g.players[i], g)); };
  await prepare(g, tick); for (let i = 0; i < frames; i++) tick();
  const hand = (i, side) => views[i].h.worldPos('hand' + side, new THREE.Vector3());
  const joint = (i, name) => views[i].h.worldPos(name, new THREE.Vector3());
  return { g, views, tick, hand, joint, ball: () => new THREE.Vector3().copy(g.ball.pos), done: () => views.forEach(v => v.dispose(scene)) };
};
const { CONFIG: { shot: CONFIG_SHOT } } = await import('../src/config.js');
const aimAt = g => ({ x: -g.human.pos.x, y: 0, z: -6.1 - g.human.pos.z });

test('a jump shot keeps the shooting hand under the ball to a set point above the head, then holds the follow-through', async () => {
  const s = await posed('practice', async (g, tick) => { for (let i = 0; i < 20; i++) tick({ aim: aimAt(g) }); });
  const { g, tick, hand, joint, ball } = s; let lastY = 0;
  const S = CONFIG_SHOT;
  while (g.charge < S.idealTime - 0.02) {
    tick({ gather: true, aim: aimAt(g), autoJump: true });
    if (g.charge > 0.22) {
      // Cradled to the set point, then rolling up onto the fingertips at full extension.
      assert(hand(0, 'R').distanceTo(ball()) < (g.charge < S.takeoff + 0.12 ? 0.24 : 0.32), `shooting hand left the ball at ${g.charge.toFixed(2)}`);
      if (g.charge < S.takeoff + 0.08) assert(hand(0, 'L').distanceTo(ball()) < 0.26, 'guide hand stays on the side of the ball up to the set point');
      assert(hand(0, 'R').y < ball().y + 0.02, 'the shooting hand is under the ball, not on top of it');
    }
    assert(ball().y >= lastY - 0.02, 'the ball never dips once it starts up'); lastY = ball().y;
  }
  assert(g.human.jump > 0.25, 'the release comes off the floor'); assert(ball().y > joint(0, 'head').y + 0.25, 'set point above the head');
  assert(joint(0, 'elbowR').y < hand(0, 'R').y, 'elbow under the ball');
  tick({ release: {}, aim: aimAt(g) }); assert.equal(g.human.action, 'follow');
  for (let i = 0; i < 12; i++) tick({ aim: aimAt(g) });
  assert(hand(0, 'R').y > joint(0, 'head').y + 0.3, 'the shooting arm stays extended'); assert(hand(0, 'L').y < hand(0, 'R').y - 0.3, 'the guide hand falls away');
  for (let i = 0; i < 60; i++) tick({ aim: aimAt(g) });
  assert(hand(0, 'R').y < joint(0, 'head').y, 'and comes down afterwards'); s.done();
});

test('the dribbling hand meets the ball at the top of each bounce and lets it go to the floor', async () => {
  const { dribbleInHand } = await import('../src/game/movement.js');
  const s = await posed('practice', async (g, tick) => { for (let i = 0; i < 30; i++) tick(); });
  let touching = 0, apart = 0, low = 9;
  for (let i = 0; i < 90; i++) {
    s.tick(); const gap = s.hand(0, 'R').distanceTo(s.ball()); low = Math.min(low, s.ball().y);
    if (dribbleInHand(s.g.human)) { assert(gap < 0.24, `hand off the ball in the contact phase (${gap.toFixed(2)})`); touching++; } else if (gap > 0.35) apart++;
    assert(s.hand(0, 'R').y > 0.55, 'the hand never chases the ball to the floor');
  }
  assert(touching > 20 && apart > 10); assert(low < 0.16); s.done();
});

test('a defender shadows the ball low, puts a hand straight up on a shot, and reaches for a steal', async () => {
  const s = await posed('1v1', async (g, tick) => {
    const d = g.players[1]; g.giveBall(d); g.possession = 1; d.pos.set(0, 0, 0); d.yaw = Math.PI;
    g.human.pos.set(0.2, 0, -1.3); g.human.yaw = 0;
    for (let i = 0; i < 40; i++) tick({ defend: true, aim: { x: 0, z: 1 } });
  });
  const { g, tick, hand, joint } = s, low = Math.min(hand(0, 'L').y, hand(0, 'R').y), high = Math.max(hand(0, 'L').y, hand(0, 'R').y);
  // Down in a stance: one hand low on the ball, the other active at shoulder height.
  assert(low < 1.1 && high > 1.2 && high - low > 0.3, 'one hand on the ball, one in the passing lane');
  const before = Math.min(hand(0, 'L').distanceTo(s.ball()), hand(0, 'R').distanceTo(s.ball()));
  tick({ defend: true, aim: { x: 0, z: 1 }, steal: true }); for (let i = 0; i < 8; i++) tick({ defend: true, aim: { x: 0, z: 1 } });
  assert.equal(g.human.action, 'reach'); assert(Math.min(hand(0, 'L').distanceTo(g.human.reach), hand(0, 'R').distanceTo(g.human.reach)) < before, 'the arm goes to the ball');
  const d = g.players[1]; g.beginGather(d); d.action = 'shooting'; d.actionTime = 2; d.charge = 0.55;
  for (let i = 0; i < 40; i++) { d.charge = 0.55; d.actionTime = 2; tick({ defend: true, aim: { x: 0, z: 1 } }); }
  assert(Math.max(hand(0, 'L').y, hand(0, 'R').y) > joint(0, 'head').y + 0.2, 'contest hand above the head'); s.done();
});

test('passes are thrown: chest out in front, bounce pushed down, lob from overhead', async () => {
  const heights = {};
  for (const kind of ['chest', 'bounce', 'lob']) {
    const s = await posed('2v2', async (g, tick) => {
      g.human.pos.set(-2, 0, 0); g.players[1].pos.set(3, 0, 0); g.players[2].pos.set(-6, 0, -6); g.players[3].pos.set(6, 0, -6);
      for (let i = 0; i < 20; i++) tick({ aim: { x: 1, z: 0 } });
      tick({ aim: { x: 1, z: 0 }, pass: kind }); for (let i = 0; i < 6; i++) tick({ aim: { x: 1, z: 0 } });
    });
    assert.equal(s.g.human.passKind, kind); assert.equal(s.g.human.action, 'pass');
    const left = s.hand(0, 'L'), right = s.hand(0, 'R');
    assert(left.x > -1.95 && right.x > -1.95, `${kind}: both hands finish toward the target`);
    if (kind !== 'lob') assert(left.x > -1.6 && right.x > -1.6, `${kind}: arms extend through the pass`);
    heights[kind] = (left.y + right.y) / 2; s.done();
  }
  assert(heights.bounce < heights.chest - 0.12); assert(heights.lob > heights.chest + 0.4);
});
test('hands open flat, wrap a ball, and never shorten their fingers', () => {
  const h = new Humanoid({ headgear: 'bare' }), g = h.mesh.geometry, P = g.attributes.position;
  for (const side of ['L', 'R']) for (const shape of ['open', 'ball']) {
    const index = h.mesh.morphTargetDictionary[shape + side], delta = g.morphAttributes.position[index];
    assert.equal(g.morphTargetsRelative, true);
    let moved = 0, furthest = 0, tip = 0; const wrist = new THREE.Vector3(...BIND.joints['hand' + side]), v = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < delta.count; i++) {
      const length = d.fromBufferAttribute(delta, i).length(); if (length < 1e-5) continue;
      moved++; furthest = Math.max(furthest, length);
      // Compare reach from the wrist before and after: a posed finger keeps its length.
      const rest = v.fromBufferAttribute(P, i).distanceTo(wrist); if (rest > tip) tip = rest;
      assert(Math.abs(v.add(d).distanceTo(wrist) - rest) < 0.03, `${shape}${side} keeps finger length`);
      assert(rest < 0.26, 'only the hand moves');
    }
    assert(moved > 800 && furthest > 0.012 && furthest < 0.07, `${shape}${side}: ${moved} vertices, ${furthest.toFixed(3)} m`);
  }
  h.setHandShape('L', 0.25, 1); h.setHandShape('R', 1, 0);
  const m = h.mesh.morphTargetInfluences, at = name => m[h.mesh.morphTargetDictionary[name]];
  assert.deepEqual([at('openL'), at('ballL'), at('openR'), at('ballR')], [0.25, 1, 1, 0]);
});
test('a wrist bends only as far as a wrist can, whatever is asked of it', () => {
  const h = new Humanoid({ headgear: 'bare' }), fore = new THREE.Vector3(), fingers = new THREE.Vector3(), palm = new THREE.Vector3(), q = new THREE.Quaternion(), elbow = new THREE.Vector3();
  const measure = side => {
    h.worldPos('hand' + side, fore).sub(h.worldPos('elbow' + side, elbow)).normalize(); h.bones['hand' + side].getWorldQuaternion(q);
    fingers.set(0, -1, 0).applyQuaternion(q); palm.copy(h.palm(side)).applyQuaternion(q);
    return fore.angleTo(fingers);
  };
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    h.reset(); h.update(); h.ikArm(side, new THREE.Vector3(sign * 0.2, 2.1, 0.3), new THREE.Vector3(sign * 0.5, 1.5, 0.45)); h.update();
    // A contest: fingers along the forearm, palm to the shooter.
    h.aimHand(side, fore.clone(), new THREE.Vector3(0, 0, 1), 0.25); h.update();
    assert(measure(side) < 0.02, 'straight through the wrist'); assert(palm.z > 0.9, 'palm faces forward');
    // Asked to fold the hand flat back onto the forearm: it stops at the limit.
    h.aimHand(side, new THREE.Vector3(0, -1, 0.1), new THREE.Vector3(0, 0, 1), 1.15); h.update();
    assert(measure(side) < 1.16 + 0.36, `wrist held to its limit (${measure(side).toFixed(2)})`);
    // Sideways there is very little.
    h.aimHand(side, new THREE.Vector3(sign, 0.3, 0), new THREE.Vector3(0, 0, 1), 1.15); h.update();
    assert(measure(side) < 0.6, `little sideways bend (${measure(side).toFixed(2)})`);
    // A kinked hand left by an animation is eased back within reach.
    h.setWorldQuat('hand' + side, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, sign * 1.9))); h.update(); h.relaxWrist(side, 0.6); h.update();
    assert(measure(side) < 0.6 + 0.36);
  }
});
