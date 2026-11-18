// Build the instanced spectator model from the game's own athlete.
//
//   node tools/build_crowd.mjs
//
// The CC0 MakeHuman-derived athlete (distant LOD) is posed twice on its real
// skeleton -- seated, and on its feet with both arms up -- skinned on the CPU,
// re-dressed by body region (shirt, sleeves, trousers, shoes, hair, skin) and
// simplified to two levels of detail that share one topology per level, so the
// renderer can blend a seated spectator into a standing, cheering one.
// Output: public/assets/models/crowd.json + crowd.bin (about 60 KB).
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const { MeshoptSimplifier } = require('meshoptimizer');
await MeshoptSimplifier.ready;
const root = new URL('../public/', import.meta.url);
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillText() {} }) }) };
globalThis.fetch = async url => { const b = await fs.readFile(new URL(url, root)); return { ok: true, json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const { loadAthlete, Humanoid } = await import('../src/render/humanoid.js');
await loadAthlete('assets/models/');

const h = new Humanoid({ headgear: 'bare' }); h.setLod(1);
h.root.scale.setScalar(1); h.root.position.set(0, 0, 0);
const geo = h.mesh.geometry, count = geo.attributes.position.count;
const boneOf = i => { let b = 0; for (let k = 1; k < 4; k++) if (geo.attributes.skinWeight.getComponent(i, k) > geo.attributes.skinWeight.getComponent(i, b)) b = k; return h.boneList[geo.attributes.skinIndex.getComponent(i, b)].name; };

// ---- dress the athlete as a spectator: one region id per vertex
export const PARTS = { skin: 0, shirt: 1, trousers: 2, hair: 3, shoes: 4, upperArm: 5, forearm: 6, leg: 7, lips: 8 };
const part = new Uint8Array(count), shade = new Uint8Array(count);
for (let i = 0; i < count; i++) {
  const kit = geo.attributes.kit.getX(i), ao = geo.attributes.kit.getY(i), bone = boneOf(i);
  const lum = (geo.attributes.color.getX(i) + geo.attributes.color.getY(i) + geo.attributes.color.getZ(i)) / 3;
  let p;
  if (kit === 6) p = PARTS.hair;
  else if (kit === 8) p = PARTS.lips;
  else if (kit === 4) p = PARTS.trousers;
  else if (kit >= 1 && kit !== 5) p = PARTS.shirt;                       // jersey, trim, panels, back number
  else if (kit === 0) p = bone.startsWith('knee') ? PARTS.leg : PARTS.shoes;   // sock on the shin, shoe on the foot
  else if (bone.startsWith('shoulder')) p = PARTS.upperArm;
  else if (bone.startsWith('elbow')) p = PARTS.forearm;
  else if (/^(hip|knee|ankle)/.test(bone)) p = PARTS.leg;
  else if (bone === 'spine' || bone === 'chest' || bone === 'hips') p = PARTS.shirt;   // a crew neck covers the chest
  else p = PARTS.skin;
  part[i] = p;
  // Keep the baked occlusion gentle: a face in the stands should read as a face.
  const soft = p === PARTS.shirt && kit === 5 ? 0.92 : p === PARTS.skin || p === PARTS.lips ? 0.62 + 0.38 * ao : 0.4 + 0.6 * ao;
  shade[i] = Math.round(255 * Math.min(1, soft * (p === PARTS.shoes ? 0.45 + lum * 0.6 : 1)));
}

// ---- pose and skin on the CPU
function skinned(pose) {
  h.reset(); pose(); h.update(); h.mesh.skeleton.update();
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(geo.attributes.position, i); n.fromBufferAttribute(geo.attributes.normal, i).multiplyScalar(0.01).add(v);
    h.mesh.applyBoneTransform(i, v); h.mesh.applyBoneTransform(i, n); n.sub(v).normalize();
    v.toArray(pos, i * 3); n.toArray(nrm, i * 3);
  }
  return { pos, nrm, hips: h.worldPos('hips', new THREE.Vector3()) };
}
const seated = skinned(() => {
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    h.rot('hip' + side, -1.42, 0, s * 0.09); h.rot('knee' + side, 1.5, 0, 0);
    h.rot('shoulder' + side, -0.5, 0, s * 0.13); h.rot('elbow' + side, -0.82, 0, 0);
  }
  h.rot('spine', 0.14, 0, 0); h.rot('chest', 0.06, 0, 0); h.rot('neck', -0.1, 0, 0);
});
const standing = skinned(() => {
  for (const [side, s] of [['L', 1], ['R', -1]]) { h.rot('shoulder' + side, -0.25, 0, s * 2.45); h.rot('elbow' + side, -0.45, 0, 0); }
  h.rot('spine', -0.06, 0, 0); h.rot('neck', -0.12, 0, 0);
});
// Origin: the seat surface under the pelvis. SEAT is how far the floor sits below it.
const SEAT = 0.465, sit = seated.hips.y - 0.105;
let soles = Infinity; for (let i = 0; i < count; i++) soles = Math.min(soles, standing.pos[i * 3 + 1]);
for (let i = 0; i < count; i++) {
  seated.pos[i * 3 + 1] -= sit; seated.pos[i * 3 + 2] -= seated.hips.z - 0.03;
  standing.pos[i * 3 + 1] -= soles + SEAT; standing.pos[i * 3 + 2] += 0.2;
}

// The athlete keeps complete skin under the kit. Under a spectator's clothes
// it would only poke through once simplified, so covered skin is dropped.
const covered = new Uint8Array(count);
// (The chest inside the jersey's V stays, coloured as shirt: a crew neck.)
for (let i = 0; i < count; i++) covered[i] = geo.attributes.kit.getX(i) === 5 && geo.attributes.kit.getY(i) < 0.5 && geo.attributes.position.getY(i) < 1.27 && /^(spine|chest|hips|hip[LR])$/.test(boneOf(i)) ? 1 : 0;
const visible = [];
for (let t = 0; t < geo.index.count; t += 3) { const [a, b, c] = [geo.index.getX(t), geo.index.getX(t + 1), geo.index.getX(t + 2)]; if (covered[a] + covered[b] + covered[c] < 2) visible.push(a, b, c); }

// ---- weld, then simplify both poses with one index buffer
const keyOf = i => `${Math.round(seated.pos[i * 3] * 5000)}|${Math.round(seated.pos[i * 3 + 1] * 5000)}|${Math.round(seated.pos[i * 3 + 2] * 5000)}|${part[i]}`;
const weld = new Map(), remap = new Uint32Array(count), keep = [];
for (let i = 0; i < count; i++) { const k = keyOf(i); if (!weld.has(k)) { weld.set(k, keep.length); keep.push(i); } remap[i] = weld.get(k); }
const index = Uint32Array.from(visible, i => remap[i]);
const take = (source, width) => { const out = new Float32Array(keep.length * width); keep.forEach((i, k) => { for (let c = 0; c < width; c++) out[k * width + c] = source[i * width + c]; }); return out; };
const posA = take(seated.pos, 3), posB = take(standing.pos, 3), nrmA = take(seated.nrm, 3), nrmB = take(standing.nrm, 3);
const partW = Uint8Array.from(keep, i => part[i]), shadeW = Uint8Array.from(keep, i => shade[i]);
// Simplify on the seated pose, guided by its normals and by the clothing
// regions, so a sleeve edge or a hairline survives.
const attributes = new Float32Array(keep.length * 4);
for (let k = 0; k < keep.length; k++) { attributes.set(nrmA.subarray(k * 3, k * 3 + 3), k * 4); attributes[k * 4 + 3] = partW[k]; }
// Heads are simplified on their own budget: a face and a hairline need
// proportionally far more triangles than a sleeve does.
const headBone = new Uint8Array(keep.length); keep.forEach((i, k) => { headBone[k] = /^(head|neck)$/.test(boneOf(i)) ? 1 : 0; });
const split = [[], []];
for (let t = 0; t < index.length; t += 3) split[headBone[index[t]] + headBone[index[t + 1]] + headBone[index[t + 2]] >= 2 ? 1 : 0].push(index[t], index[t + 1], index[t + 2]);
function reduce(indices, triangles) {
  const source = Uint32Array.from(indices);
  let [idx] = MeshoptSimplifier.simplifyWithAttributes(source, posA, 3, attributes, 4, [0.25, 0.25, 0.25, 0.6], null, triangles * 3, 0.12, []);
  if (idx.length > triangles * 3 * 1.25) [idx] = MeshoptSimplifier.simplifyWithAttributes(source, posA, 3, attributes, 4, [0.1, 0.1, 0.1, 0.3], null, triangles * 3, 0.3, ['Permissive']);
  return idx;
}
function level(body, head) {
  const idx = [...reduce(split[0], body), ...reduce(split[1], head)];
  const used = new Map(), order = [];
  const out = Uint16Array.from(idx, i => { if (!used.has(i)) { used.set(i, order.length); order.push(i); } return used.get(i); });
  const pick = (source, width, Type = Float32Array) => { const a = new Type(order.length * width); order.forEach((i, k) => { for (let c = 0; c < width; c++) a[k * width + c] = source[i * width + c]; }); return a; };
  const pack = n => Int8Array.from(pick(n, 3), v => Math.round(Math.max(-1, Math.min(1, v)) * 127));
  return { index: out, posA: pick(posA, 3), posB: pick(posB, 3), nrmA: pack(nrmA), nrmB: pack(nrmB), part: pick(partW, 1, Uint8Array), shade: pick(shadeW, 1, Uint8Array) };
}
const lods = [level(640, 420), level(210, 120)];

// ---- write
const chunks = []; let offset = 0;
const put = array => { const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength), at = offset; chunks.push(bytes); offset += bytes.length; const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; } return at; };
const meta = { seat: SEAT, parts: PARTS, source: 'athlete LOD1 (MakeHuman HM08, CC0), posed, re-dressed and simplified by tools/build_crowd.mjs',
  lods: lods.map(l => ({ vCount: l.part.length, iCount: l.index.length, index: put(l.index), posA: put(l.posA), posB: put(l.posB), nrmA: put(l.nrmA), nrmB: put(l.nrmB), part: put(l.part), shade: put(l.shade) })) };
await fs.writeFile(new URL('assets/models/crowd.bin', root), Buffer.concat(chunks));
await fs.writeFile(new URL('assets/models/crowd.json', root), JSON.stringify(meta));
console.log(JSON.stringify({ source: { vertices: count, welded: keep.length, triangles: geo.index.count / 3, visible: visible.length / 3 }, lods: meta.lods.map(l => ({ vertices: l.vCount, triangles: l.iCount / 3 })), bytes: offset }));
