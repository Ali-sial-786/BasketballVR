// Retarget a user-supplied Mixamo FBX onto Crease VR's canonical 17-bone rig.
// Usage: node tools/import_dribble.mjs /path/to/Dribble.fbx
// The raw FBX is not shipped: only the in-game retargeted motion is retained.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
const file = process.argv[2]; if (!file) throw new Error('Pass the Mixamo FBX path.');
const buffer = fs.readFileSync(file), object = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
const clip = object.animations.find(c => c.duration > 0 && c.tracks.length);
if (!clip) throw new Error('The FBX has no animation take.');
const bones = {}; object.traverse(b => { if (b.isBone) bones[b.name.replace(/^mixamorig:?/, '')] ||= b; });
const mapping = { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
  shoulderL: 'LeftArm', elbowL: 'LeftForeArm', handL: 'LeftHand', shoulderR: 'RightArm', elbowR: 'RightForeArm', handR: 'RightHand',
  hipL: 'LeftUpLeg', kneeL: 'LeftLeg', ankleL: 'LeftFoot', hipR: 'RightUpLeg', kneeR: 'RightLeg', ankleR: 'RightFoot' };
const children = { shoulderL: 'LeftForeArm', elbowL: 'LeftHand', handL: 'LeftHandMiddle1', shoulderR: 'RightForeArm', elbowR: 'RightHand', handR: 'RightHandMiddle1', hipL: 'LeftLeg', kneeL: 'LeftFoot', hipR: 'RightLeg', kneeR: 'RightFoot' };
const parent = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', handR: 'elbowR', hipL: 'hips', kneeL: 'hipL', ankleL: 'kneeL', hipR: 'hips', kneeR: 'hipR', ankleR: 'kneeR' };
const names = Object.keys(mapping), point = n => bones[n].getWorldPosition(new THREE.Vector3());
for (const n of Object.values(mapping)) if (!bones[n]) throw new Error(`Missing Mixamo bone ${n}`);
object.updateMatrixWorld(true);
const rest = {}, alignment = {};
for (const n of names) {
  rest[n] = bones[mapping[n]].getWorldQuaternion(new THREE.Quaternion()).invert(); alignment[n] = new THREE.Quaternion();
  if (children[n]) alignment[n].setFromUnitVectors(new THREE.Vector3(0, -1, 0), point(children[n]).sub(point(mapping[n])).normalize());
}
const base = point('Hips'), leg = point('LeftUpLeg').distanceTo(point('LeftLeg')) + point('LeftLeg').distanceTo(point('LeftFoot'));
const mixer = new THREE.AnimationMixer(object); mixer.clipAction(clip).play();
const count = Math.round(clip.duration * 30), frames = [], positions = [], world = {};
for (let f = 0; f < count; f++) {
  mixer.setTime(f / count * clip.duration); object.updateMatrixWorld(true);
  for (const n of names) world[n] = bones[mapping[n]].getWorldQuaternion(new THREE.Quaternion()).multiply(rest[n]).multiply(alignment[n]);
  const pose = names.map(n => parent[n] ? world[parent[n]].clone().invert().multiply(world[n]) : world[n].clone());
  if (f) pose.forEach((q, k) => { if (q.dot(frames[f - 1][k]) < 0) q.set(-q.x, -q.y, -q.z, -q.w); });
  frames.push(pose); positions.push(point('Hips').sub(base).divideScalar(leg));
}
// This is an in-place basketball loop. Strip translation across the court,
// retain the captured crouch and weight shift, and soften only the loop seam.
const meanX = positions.reduce((s, p) => s + p.x, 0) / count, meanZ = positions.reduce((s, p) => s + p.z, 0) / count;
for (let f = 0; f < count; f++) { positions[f].x -= meanX; positions[f].z -= meanZ;
  const blend = Math.max(0, (f - (count - 5)) / 5);
  if (blend) { frames[f].forEach((q, k) => q.slerp(frames[0][k], blend)); positions[f].lerp(positions[0], blend); }
}
const metaPath = 'public/assets/anim/clips.json', binPath = 'public/assets/anim/clips.bin';
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); let existing = fs.readFileSync(binPath);
const old = meta.clips.find(c => c.name === 'dribble'); if (old) { existing = existing.subarray(0, old.offset * 2); meta.clips = meta.clips.filter(c => c.name !== 'dribble'); }
if (JSON.stringify(meta.bones) !== JSON.stringify(names)) throw new Error('Canonical rig bone order mismatch.');
const stride = 71, data = new Int16Array(count * stride);
for (let f = 0; f < count; f++) {
  frames[f].forEach((q, k) => data.set(q.toArray().map(v => Math.round(v * 32767)), f * stride + k * 4));
  data.set(positions[f].toArray().map(v => Math.round(Math.max(-2, Math.min(2, v)) / 2 * 32767)), f * stride + 68);
}
meta.clips.push({ name: 'dribble', src: 'User-provided Mixamo Dribble _2_.fbx', sourceLicense: 'Mixamo / Adobe terms; embedded game motion only',
  frames: count, fps: count / clip.duration, dur: clip.duration, loop: true, offset: existing.length / 2, hand: 'R', grounded: 0 });
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); fs.writeFileSync(binPath, Buffer.concat([existing, Buffer.from(data.buffer)]));
console.log(`Retargeted ${clip.name}: ${clip.duration.toFixed(2)} seconds, ${count} frames, 17 bones, ${data.byteLength} bytes. Root motion removed; loop seam blended.`);
