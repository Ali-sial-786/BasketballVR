import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
// Photographed skin, eyes, brows and hair (CC0 MakeHuman textures): the asset
// carries texture coordinates through every stage, and the game draws the
// figures whether or not the textures arrive (node has no image decoder).
const inertContext = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] ?? (() => {}), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => inertContext }) };
globalThis.fetch = async url => {
  try { const buffer = await fs.readFile(fileURLToPath(new URL(`../public/${url}`, import.meta.url))); return { ok: true, json: async () => JSON.parse(buffer), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }; }
  catch { return { ok: false, status: 404 }; }
};
const { loadAthlete, Humanoid, handGeometry, setSkinMaps, skinMapFor, skinMaterial, SKIN_MAPS } = await import('../src/render/humanoid.js');
await loadAthlete('assets/models/');
const meta = JSON.parse(await fs.readFile(new URL('../public/assets/models/athlete.json', import.meta.url)));
const bin = await fs.readFile(new URL('../public/assets/models/athlete.bin', import.meta.url));
const read = p => ({
  pos: new Float32Array(bin.buffer, bin.byteOffset + p.pos, p.vCount * 3),
  uv: Array.from(new Uint16Array(bin.buffer, bin.byteOffset + p.uv, p.vCount * 2), (x, i) => x / 65535 * meta.uvScale[i % 2]),
  idx: new Uint16Array(bin.buffer, bin.byteOffset + p.idx, p.iCount),
});

test('every part carries texture coordinates, and the skin keeps its UV seams through simplification', () => {
  for (const lod of meta.lods) {
    for (const p of lod.parts) assert(Number.isInteger(p.uv), `${p.name} has no uv`);
    const body = read(lod.parts.find(p => p.name === 'Athlete_Body'));
    // The head's UV island (u in [1, 2], the face texture) never shares a triangle with the body texture's.
    for (let k = 0; k < body.idx.length; k += 3) {
      const sides = [0, 1, 2].map(j => body.uv[body.idx[k + j] * 2] > 1);
      assert(sides[0] === sides[1] && sides[1] === sides[2], 'a triangle straddles the face/body texture seam');
    }
    let face = 0, faceTotal = 0;
    for (let v = 0; v < body.pos.length / 3; v++) {
      const [x, y, z] = body.pos.subarray(v * 3, v * 3 + 3), u = body.uv[v * 2];
      if (u > 1) assert(y > meta.joints.neck[1] - 0.06, 'face texture below the neck');
      if (Math.abs(x) < 0.05 && y > meta.eyeY + 0.022 && y < meta.eyeY + 0.06 && z > 0.08) { faceTotal++; if (u > 1) face++; }   // forehead (no mouth or eye socket behind it)
    }
    assert(faceTotal > 5 && face === faceTotal, 'the face is drawn from the face texture');
  }
  const ranges = { HairCap: [1, 2], HairFuzz: [2, 3], Details_Eyes: [0, 1], Details_Brows: [0, 1], Details_Lashes: [0, 1] };
  for (const [name, [lo, hi]] of Object.entries(ranges)) {
    const part = read(meta.lods[0].parts.find(p => p.name === name));
    for (let v = 0; v < part.uv.length; v += 2) assert(part.uv[v] >= lo - 1e-3 && part.uv[v] <= hi + 1e-3 && part.uv[v + 1] >= -1e-3 && part.uv[v + 1] <= 1 + 1e-3, `${name} uv out of its texture`);
  }
});

test('the runtime meshes (merged figure, first-person arms, controller hands) all have uvs', () => {
  const h = new Humanoid({ headgear: 'bare' });
  for (const g of [h.mesh.geometry, handGeometry('L'), handGeometry('R')]) assert.equal(g.attributes.uv.count, g.attributes.position.count);
  h.setArmsOnly(true); assert(h.mesh.geometry.attributes.uv); h.setLod(1); h.setArmsOnly(false); assert(h.mesh.geometry.attributes.uv);
});

test('the photographed skin ships small, loads when present and fails soft when not', async () => {
  for (const [file, max] of [['skin_light_body.jpg', 300e3], ['skin_light_face.jpg', 300e3], ['skin_dark_body.jpg', 300e3], ['skin_dark_face.jpg', 300e3], ['hair.png', 400e3], ['face_detail.png', 600e3]]) {
    const stat = await fs.stat(new URL(`../public/assets/textures/${file}`, import.meta.url)); assert(stat.size > 2000 && stat.size < max, `${file}: ${stat.size} bytes`);
  }
  // Without an image decoder every texture is missing: the look still loads, and the figures keep vertex-coloured skin.
  const { loadLook } = await import('../src/render/pipeline.js');
  const warn = console.warn; console.warn = () => {};
  const look = await loadLook('assets/textures/'); console.warn = warn;
  assert.deepEqual(look.skin, { light: { body: null, face: null }, dark: { body: null, face: null }, hair: null, detail: null });
  setSkinMaps(look.skin);
  assert.equal(new Humanoid({ skin: 0x815335 }).material.userData.uniforms.uMaps.value, 0); assert.equal(skinMaterial(0x815335).map, null);
  // With the textures, each player gets the nearer photo, tinted to his tone.
  const t = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);
  setSkinMaps({ light: { body: t(), face: t() }, dark: { body: t(), face: t() }, hair: t(), detail: t() });
  for (const [skin, map] of [[0xbb815a, 'light'], [0x815335, 'dark'], [0x64422e, 'dark'], [0xd3a17c, 'light']]) {
    const h = new Humanoid({ skin }), u = h.material.userData.uniforms;
    assert.equal(skinMapFor(skin), map); assert.equal(h.skinMap, map); assert.equal(u.uMaps.value, 1);
    assert(u.uSkinTint.value.r > 0.3 && u.uSkinTint.value.r < 3);
  }
  const h = new Humanoid({ skin: 0xd3a17c }); h.setSkinMap('dark'); assert.equal(h.skinMap, 'dark');
  assert.equal(skinMaterial(0x64422e).map, SKIN_MAPS.dark.body, 'controller hands can wear the same photographed skin');
  assert.equal(h.material.alphaToCoverage, true, 'hair and cards are alpha-tested with coverage, never sorted');
  h.setFade(0.5); assert.equal(h.material.alphaToCoverage, false); h.setFade(1); assert.equal(h.material.alphaToCoverage, true);
});
