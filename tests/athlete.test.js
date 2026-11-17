import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
// The rig is real three.js skinning and IK; only its canvas shadow is stubbed.
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
globalThis.fetch = async url => {
  try { const buffer = await fs.readFile(fileURLToPath(new URL(`../public/${url}`, import.meta.url))); return { ok: true, json: async () => JSON.parse(buffer), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }; }
  catch { return { ok: false, status: 404 }; }
};
const { loadAthlete, Humanoid, handGeometry } = await import('../src/render/humanoid.js');
const { loadClips, applyClip, clipInfo } = await import('../src/render/clips.js');
await loadAthlete('assets/models/'); await loadClips('assets/anim/');
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
  assert(Math.abs(centerY(vertices('Details_Sclera')) - centerY(vertices('Details_Iris'))) < 0.003);
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
