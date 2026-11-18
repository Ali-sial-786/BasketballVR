import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const meta = JSON.parse(await fs.readFile(new URL('../public/assets/models/crowd.json', import.meta.url)));
const bin = await fs.readFile(new URL('../public/assets/models/crowd.bin', import.meta.url));
const view = (Type, at, count) => new Type(bin.buffer, bin.byteOffset + at, count);

test('the spectator model ships two levels of detail that can blend from seated to standing', () => {
  assert.equal(meta.lods.length, 2); assert(meta.lods[0].iCount / 3 > 700 && meta.lods[0].iCount / 3 < 1400); assert(meta.lods[1].iCount / 3 > 200 && meta.lods[1].iCount / 3 < 450);
  for (const lod of meta.lods) {
    const index = view(Uint16Array, lod.index, lod.iCount), seated = view(Float32Array, lod.posA, lod.vCount * 3), standing = view(Float32Array, lod.posB, lod.vCount * 3);
    assert(index.every(i => i < lod.vCount), 'indices stay inside the vertex buffer');
    assert([...seated, ...standing].every(Number.isFinite));
    let seatedTop = -9, standingTop = -9, seatedLow = 9, standingLow = 9;
    for (let i = 0; i < lod.vCount; i++) { seatedTop = Math.max(seatedTop, seated[i * 3 + 1]); standingTop = Math.max(standingTop, standing[i * 3 + 1]); seatedLow = Math.min(seatedLow, seated[i * 3 + 1]); standingLow = Math.min(standingLow, standing[i * 3 + 1]); }
    // Origin is the seat surface: a seated head is under a metre above it, feet near the floor below.
    assert(seatedTop > 0.7 && seatedTop < 1.0, `seated height ${seatedTop}`); assert(seatedLow < -0.3 && seatedLow > -0.6);
    assert(standingTop > seatedTop + 0.45, 'on their feet with arms up, the crowd stands well clear of the seated rows'); assert(Math.abs(standingLow + meta.seat) < 0.02, 'standing feet are on the row floor');
  }
});

test('every spectator vertex belongs to a clothing region the shader knows, and all regions are used', () => {
  const ids = new Set(Object.values(meta.parts));
  for (const lod of meta.lods) {
    const part = view(Uint8Array, lod.part, lod.vCount), shade = view(Uint8Array, lod.shade, lod.vCount), used = new Set(part);
    assert(part.every(p => ids.has(p)));
    for (const name of ['skin', 'shirt', 'trousers', 'hair', 'shoes', 'upperArm', 'forearm', 'leg']) assert(used.has(meta.parts[name]), `${name} missing from a level of detail`);
    assert(shade.every(v => v > 60), 'baked shade never blacks a spectator out');
    const normals = view(Int8Array, lod.nrmA, lod.vCount * 3);
    for (let i = 0; i < lod.vCount; i += 7) assert(Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) > 100);
  }
});

test('the CC0 surface and lighting assets the venue loads are present and small', async () => {
  for (const [file, max] of [['hall.hdr', 600e3], ['wood_color.jpg', 120e3], ['wood_normal.jpg', 120e3], ['wood_rough.jpg', 80e3], ['jersey_normal.jpg', 40e3]]) {
    const stat = await fs.stat(new URL(`../public/assets/textures/${file}`, import.meta.url)); assert(stat.size > 500 && stat.size < max, `${file}: ${stat.size} bytes`);
  }
  const header = (await fs.readFile(new URL('../public/assets/textures/hall.hdr', import.meta.url))).subarray(0, 10).toString('latin1'); assert(header.startsWith('#?RADIANCE'));
});
