// Basketball athletes adapted from Crease VR: adult-proportioned, CC0
// MakeHuman anatomy, 60k / 9k triangle LODs, 17-bone skinning, baked AO,
// team colors, photographed skin, eyes, brows and hair (CC0 MakeHuman
// textures), modeled fingers and analytic two-bone IK.
//
// Canonical pose used by all animation code: standing, arms hanging straight
// down, facing +Z, every bone's local rotation = identity, limbs along -Y.
// The model's bind pose is an A-pose; the skeleton's inverse bind matrices
// carry the difference, so animation never needs to know.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildGear } from './gear.js';
import { PRINT } from './kitprint.js';

const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', elbowL: 'shoulderL', handL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', handR: 'elbowR',
  hipL: 'hips', kneeL: 'hipL', ankleL: 'kneeL', hipR: 'hips', kneeR: 'hipR', ankleR: 'kneeR',
};
export const BASE_SCALE = 1.0;             // the model is a life-size 1.80 m athlete

// Anatomical controller hands cut from the same authored human mesh, retaining
// the original fingers, fingernails and smooth surface normals, with their
// hand shapes (open, on a ball, gripping a handle) as morph targets. Built in
// WebXR grip space: the handle runs along -Z through the fist, the fingers
// wrap it, the palm faces it.
export function handGeometry(side = 'R') {
  const name = 'hand' + side, index = RIG.index[name];
  const g = RIG.lods[0].find(p => p.name === 'Athlete_Body').geo;
  const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const sparse = g.userData.shapes || [], shapes = RIG.shapes.map((shape, t) => shape.endsWith(side) ? { shape, deltas: new Map() } : null);
  shapes.forEach((s, t) => { if (!s || !sparse[t]) return; const q = sparse[t]; for (let k = 0; k < q.idx.length; k++) s.deltas.set(q.idx[k], k); });
  // Bone space -> grip space. Bind directions from the MakeHuman hand: fingers
  // run down the bone (-Y); the knuckles run pinky -> index; the fist closes
  // round a handle a little in front of and below the wrist.
  const mirror = side === 'L' ? -1 : 1, toBone = RIG.bindQ[name].clone().invert();
  const knuckles = new THREE.Vector3(0.027 * mirror, 0.032, 0.058).normalize().applyQuaternion(toBone);
  const fingers = new THREE.Vector3(0, -1, 0); knuckles.addScaledVector(fingers, -knuckles.dot(fingers)).normalize();
  const from = new THREE.Matrix4().makeBasis(fingers, knuckles, new THREE.Vector3().crossVectors(fingers, knuckles));
  const to = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0).cross(new THREE.Vector3(0, 0, -1)));
  const align = new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
  const centre = new THREE.Vector3(-0.025 * mirror, -0.045, 0.055).applyQuaternion(toBone).applyQuaternion(align);
  const positions = [], normals = [], uvs = [], morphs = shapes.map(s => s ? { p: [], n: [] } : null), v = new THREE.Vector3(), normal = new THREE.Vector3();
  const rotate = out => out.applyQuaternion(toBone).applyQuaternion(align);
  for (let i = 0; i < g.index.count; i += 3) {
    const ids = [g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2)];
    const weights = ids.map(id => { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(id, k) === index) w += sw.getComponent(id, k); return w; });
    if (Math.max(...weights) < 0.55) continue;
    for (const id of ids) {
      rotate(v.fromBufferAttribute(p, id).sub(RIG.J[name])).sub(centre); positions.push(v.x, v.y, v.z);
      rotate(normal.fromBufferAttribute(n, id)); normals.push(normal.x, normal.y, normal.z);
      if (t) uvs.push(t.getX(id), t.getY(id));             // (the skin textures' body layout: see skinMaterial)
      shapes.forEach((s, t) => {
        if (!s) return; const k = s.deltas.get(id), q = sparse[t];
        if (k === undefined) { morphs[t].p.push(0, 0, 0); morphs[t].n.push(0, 0, 0); return; }
        rotate(v.set(q.pos[k * 3], q.pos[k * 3 + 1], q.pos[k * 3 + 2]).multiplyScalar(1 / RIG.shapeScale)); morphs[t].p.push(v.x, v.y, v.z);
        rotate(normal.set(q.nrm[k * 3], q.nrm[k * 3 + 1], q.nrm[k * 3 + 2]).multiplyScalar(1 / 64)); morphs[t].n.push(normal.x, normal.y, normal.z);
      });
    }
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mp = [], mn = [];
  shapes.forEach((s, t) => { if (!s) return; const a = new THREE.Float32BufferAttribute(morphs[t].p, 3), b = new THREE.Float32BufferAttribute(morphs[t].n, 3); a.name = b.name = s.shape.slice(0, -1); mp.push(a); mn.push(b); });
  if (mp.length) { out.morphAttributes.position = mp; out.morphAttributes.normal = mn; out.morphTargetsRelative = true; }
  // Where the wrist is, and which way the forearm runs from it, for a band.
  out.userData.wrist = new THREE.Vector3().sub(centre); out.userData.forearm = new THREE.Vector3(0, 1, 0).applyQuaternion(align).normalize();
  return out;
}

export const SKIN_TONES = [0xf3cfae, 0xe0b088, 0xc68e62, 0x9a6a46, 0x6b4630];
// Photographed skin (CC0 MakeHuman 1.1 textures, tools/build_skin_textures.py):
// a body texture and a full-density face texture per source photo. `tone` is
// the photo's own cheek colour (sRGB): a player's skin colour is reached by
// tinting toward it from the nearest photo, so every player keeps real pores,
// lips, lids and stubble whatever his tone. Shared by every player that uses it.
export const SKIN_MAPS = { light: { tone: 0xe0a686, body: null, face: null }, dark: { tone: 0x593826, body: null, face: null } };
const blankWhite = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blankWhite.needsUpdate = true;
const FACE = { hair: blankWhite, detail: blankWhite, on: false };
// Hand over the loaded textures (pipeline.js loadLook().skin) before athletes are made.
// Anything missing leaves the vertex-coloured skin in place.
export function setSkinMaps(maps) {
  if (!maps) return;
  for (const name of Object.keys(SKIN_MAPS)) if (maps[name]?.body && maps[name]?.face) Object.assign(SKIN_MAPS[name], { body: maps[name].body, face: maps[name].face });
  if (maps.hair && maps.detail) Object.assign(FACE, { hair: maps.hair, detail: maps.detail });
  FACE.on = !!(maps.hair && maps.detail && Object.values(SKIN_MAPS).every((m) => m.body && m.face));
}
// The photo for a skin colour: the dark-skinned one below a mid brown.
export function skinMapFor(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.2 ? 'dark' : 'light'; }
// A standalone material with the photographed skin for meshes cut from the
// body (handGeometry keeps its uvs): the body texture tinted to `hex`, or the
// plain colour when the textures are not loaded.
export function skinMaterial(hex, params = {}) {
  const color = new THREE.Color(hex), map = SKIN_MAPS[skinMapFor(hex)], tone = new THREE.Color(map.tone);
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.62, metalness: 0, clearcoat: 0.03, ...params });
  if (FACE.on && map.body) { m.map = map.body; m.color.setRGB(color.r / tone.r, color.g / tone.g, color.b / tone.b); } else m.color.copy(color);
  return m;
}
export const HAIR = [0x1d1510, 0x3b2a1c, 0x5a4330, 0x0e0e0e, 0x8a6a40];
export const KITS = {     // kit1 shirt, kit2 accents, kit3 headgear, kit4 trousers, panel = shirt panels
  home: { kit1: 0x196b64, kit2: 0xe7d7ac, kit3: 0x173f3e, kit4: 0x164e4a, panel: 0x2c8477 },
  away: { kit1: 0xc45d3e, kit2: 0xffdbb0, kit3: 0x763c32, kit4: 0x973f30, panel: 0xe28256 },
  umpire: { kit1: 0xf4f1e6, kit2: 0x2a2d36, kit3: 0xf2eedd, kit4: 0x2b3040, panel: 0xe4e0d2 },   // white coat, dark trousers
};

let RIG = null;      // { bones[], joints{}, canon{}, bindQ{}, inverses[], lods[], headCentre }

// Load + prepare the athlete asset (call once before creating any Humanoid).
export async function loadAthlete(base = './assets/models/') {
  if (RIG) return RIG;
  const [meta, bin] = await Promise.all([
    fetch(base + 'athlete.json').then((r) => { if (!r.ok) throw new Error('athlete.json ' + r.status); return r.json(); }),
    fetch(base + 'athlete.bin').then((r) => { if (!r.ok) throw new Error('athlete.bin ' + r.status); return r.arrayBuffer(); }),
  ]);
  RIG = prepareRig(meta, bin);
  return RIG;
}

function prepareRig(meta, bin) {
  const J = {}; for (const [k, v] of Object.entries(meta.joints)) J[k] = new THREE.Vector3(...v);
  const down = new THREE.Vector3(0, -1, 0), d = new THREE.Vector3();
  const bindQ = {}, canon = {};
  for (const b of meta.bones) { bindQ[b] = new THREE.Quaternion(); canon[b] = J[b].clone(); }
  const limb = (a, b2, c) => {
    bindQ[a].setFromUnitVectors(down, d.subVectors(J[b2], J[a]).normalize());
    bindQ[b2].setFromUnitVectors(down, d.subVectors(J[c], J[b2]).normalize());
    canon[b2].copy(canon[a]).add(new THREE.Vector3(0, -J[a].distanceTo(J[b2]), 0));
    canon[c].copy(canon[b2]).add(new THREE.Vector3(0, -J[b2].distanceTo(J[c]), 0));
  };
  for (const s of ['L', 'R']) {
    limb('shoulder' + s, 'elbow' + s, 'hand' + s);
    bindQ['hand' + s].copy(bindQ['elbow' + s]);
    limb('hip' + s, 'knee' + s, 'ankle' + s);            // feet keep their bind (flat) orientation
  }
  const inverses = meta.bones.map((b) => new THREE.Matrix4().compose(J[b], bindQ[b], new THREE.Vector3(1, 1, 1)).invert());
  const lods = meta.lods.map((lod) => lod.parts.map((p) => {
    const g = new THREE.BufferGeometry();
    const nk = new Int8Array(bin, p.nrmKit, p.vCount * 4), cb = new Uint8Array(bin, p.col, p.vCount * 4), wb = new Uint8Array(bin, p.weights, p.vCount * 4);
    const nrm = new Float32Array(p.vCount * 3), col = new Float32Array(p.vCount * 3), kit = new Float32Array(p.vCount * 2), w = new Float32Array(p.vCount * 4);
    const c = new THREE.Color();
    for (let v = 0; v < p.vCount; v++) {
      for (let k = 0; k < 3; k++) nrm[v * 3 + k] = nk[v * 4 + k] / 127;
      c.setRGB(cb[v * 4] / 255, cb[v * 4 + 1] / 255, cb[v * 4 + 2] / 255, THREE.SRGBColorSpace);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      kit[v * 2] = nk[v * 4 + 3];               // kit slot
      kit[v * 2 + 1] = cb[v * 4 + 3] / 255;     // baked ambient occlusion
      for (let k = 0; k < 4; k++) w[v * 4 + k] = wb[v * 4 + k] / 255;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin.slice(p.pos, p.pos + p.vCount * 12)), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('kit', new THREE.BufferAttribute(kit, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(new Uint8Array(bin, p.joints, p.vCount * 4)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    // Texture coordinates: the head's UV island at u in [1, 2] (face texture),
    // the rest of the skin in [0, 1] (body texture); eyes, brows and lashes in
    // the face atlas. Parts without textures carry zeros (so all parts merge).
    const uv = new Float32Array(p.vCount * 2);
    if (p.uv != null) { const ub = new Uint16Array(bin, p.uv, p.vCount * 2), [su, sv] = meta.uvScale || [1, 1]; for (let k = 0; k < p.vCount; k++) { uv[k * 2] = ub[k * 2] / 65535 * su; uv[k * 2 + 1] = ub[k * 2 + 1] / 65535 * sv; } }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin.slice(p.idx, p.idx + p.iCount * 2)), 1));
    // Hand shapes are stored sparsely; shapesFor() spreads them over a merged mesh.
    if (p.morph) g.userData.shapes = p.morph.map((m) => ({ idx: new Uint16Array(bin.slice(m.idx, m.idx + m.count * 2)), pos: new Int16Array(bin.slice(m.pos, m.pos + m.count * 6)), nrm: new Int8Array(bin, m.nrm, m.count * 3) }));
    return { name: p.name, optional: !!p.optional, geo: g };
  }));
  // The shoe soles: how far below the ankle joint the lowest sole vertex is
  // (the feet keep their bind orientation, so this holds in the canonical
  // pose too), and so how high the soles sit above the root in the canonical
  // standing pose (legs straight down). The mesh is lowered by that much so a
  // figure standing on y = 0 stands ON the turf, not 2-3 cm above it, and
  // ankleHeight (foot IK) is the real ankle-to-sole distance.
  const base = lods[0].filter((p) => !p.optional).map((p) => p.geo);
  let soleY = Infinity;
  const ia = meta.bones.indexOf('ankleL'), ib = meta.bones.indexOf('ankleR');
  for (const g of base) {
    const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    for (let v = 0; v < P.count; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) { const b = SI.getComponent(v, k); if (b === ia || b === ib) w += SW.getComponent(v, k); }
      if (w > 0.5 && P.getY(v) < soleY) soleY = P.getY(v);
    }
  }
  const sole = J.ankleL.y - soleY;
  // ... and how far ahead of the ankle the toe of the sole reaches (the pivot when the heel comes up).
  let toe = 0;
  for (const g of base) {
    const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    for (let v = 0; v < P.count; v++) {
      if (P.getY(v) > soleY + 0.02) continue;
      let w = 0;
      for (let k = 0; k < 4; k++) { const b = SI.getComponent(v, k); if (b === ia) w += SW.getComponent(v, k); }
      if (w > 0.5) toe = Math.max(toe, P.getZ(v) - J.ankleL.z);
    }
  }
  // Which way each palm faces, in its hand bone's space: closing the fingers
  // round a ball moves them toward the palm, square to the line of the hand.
  const palm = {};
  for (const side of ['L', 'R']) {
    const body = lods[0].find((p) => p.geo.userData.shapes), t = (meta.shapes || []).indexOf('ball' + side), sum = new THREE.Vector3();
    if (body && t >= 0) { const s = body.geo.userData.shapes[t]; for (let k = 0; k < s.pos.length; k += 3) sum.add(d.set(s.pos[k], s.pos[k + 1], s.pos[k + 2])); }
    sum.applyQuaternion(bindQ['hand' + side].clone().invert()); sum.y = 0;
    palm[side] = sum.lengthSq() > 0 ? sum.normalize() : new THREE.Vector3(0, 0, 1);
  }
  const floor = canon.ankleL.y - sole;
  return { sole, toe, floor, palm, bones: meta.bones, index: Object.fromEntries(meta.bones.map((b, i) => [b, i])), J, canon, bindQ, inverses, lods, shapes: meta.shapes || [], shapeScale: meta.shapeScale || 20000, headCentre: new THREE.Vector3(...meta.headCentre), headSize: new THREE.Vector3(...(meta.headSize || [0.1, 0.14, 0.125])), skull: meta.skull, geoCache: new Map() };
}

// ---- gear: pieces authored in a bone's canonical local frame ----
// o.blend = { to, y0, y1 }: skin the part across two bones along the bone's
// local Y (y <= y0: all `bone`, y >= y1: all `to`), so e.g. a glove cuff
// bends with the wrist instead of sliding off the forearm.
// o.ao: a number or (x, y, z) => occlusion (local coordinates) for cheap
// baked shading (crevices, the inside of a pad).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _lp = new THREE.Vector3();
function gearPart(list, geom, bone, color, pos = [0, 0, 0], rot = null, scale = null, o = null) {
  const g = geom.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _q.identity(); if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _s.set(...(scale || [1, 1, 1]));
  g.applyMatrix4(_m.compose(_t.set(...pos), _q, _s));                       // into bone-local (canonical)
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, lp = g.attributes.position.array.slice();
  g.applyMatrix4(_m.compose(RIG.J[bone], RIG.bindQ[bone], _s.set(1, 1, 1)));  // into bind space
  if (!g.index) g.setIndex([...Array(n).keys()]);
  const col = new Float32Array(n * 3), kit = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const c = new THREE.Color(color > 23 ? color : 0xffffff), slot = color <= 23 ? color : 0, bi = RIG.index[bone];
  const bl = o && o.blend, b2 = bl ? RIG.index[bl.to] : 0, aoF = o && o.ao;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    kit[i * 2] = slot;
    const x = lp[i * 3], y = lp[i * 3 + 1], z = lp[i * 3 + 2];
    kit[i * 2 + 1] = aoF == null ? 1 : typeof aoF === 'number' ? aoF : aoF(x, y, z);
    si[i * 4] = bi; sw[i * 4] = 1;
    if (bl) {
      const t = Math.min(1, Math.max(0, (y - bl.y0) / (bl.y1 - bl.y0))), u = t * t * (3 - 2 * t);
      sw[i * 4] = 1 - u; si[i * 4 + 1] = b2; sw[i * 4 + 1] = u;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('kit', new THREE.BufferAttribute(kit, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  list.push(g);
}
// Give a mesh that contains the body (its vertices starting at `offset`) the
// hand shapes as relative morph targets, in RIG.shapes order.
// Only the shapes a playing figure uses go on the body; the controller hands take the grips too.
const BODY_SHAPES = ['openL', 'openR', 'ballL', 'ballR'];
function shapesFor(g, body, offset = 0, names = BODY_SHAPES) {
  const sparse = body.userData.shapes; if (!sparse) return g;
  const count = g.attributes.position.count, positions = [], normals = [];
  RIG.shapes.forEach((name, t) => {
    if (!names.includes(name)) return;
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), s = sparse[t];
    for (let k = 0; k < s.idx.length; k++) for (let c = 0; c < 3; c++) { pos[(offset + s.idx[k]) * 3 + c] = s.pos[k * 3 + c] / RIG.shapeScale; nrm[(offset + s.idx[k]) * 3 + c] = s.nrm[k * 3 + c] / 64; }
    const a = new THREE.BufferAttribute(pos, 3), b = new THREE.BufferAttribute(nrm, 3); a.name = b.name = name; positions.push(a); normals.push(b);
  });
  g.morphAttributes.position = positions; g.morphAttributes.normal = normals; g.morphTargetsRelative = true;
  return g;
}
function geometryFor(o, lod) {
  const key = `${lod}|${o.headgear}|${o.pads ? 1 : 0}|${o.gloves ? 1 : 0}|${o.keeper ? 1 : 0}`;
  let g = RIG.geoCache.get(key);
  if (!g) {
    const parts = RIG.lods[lod].filter((p) => !p.optional).map((p) => p.geo);
    g = mergeGeometries([...parts, ...buildGear(RIG, gearPart, o, lod)], false);
    let offset = 0; for (const part of parts) { if (part.userData.shapes) { shapesFor(g, part, offset); break; } offset += part.attributes.position.count; }
    RIG.geoCache.set(key, g);
  }
  return g;
}

// The desktop player's arms use the same vertices, skin weights and skeleton
// as their courtside model. Only the triangles submitted to the GPU change.
function armGeometry() {
  const key = 'first-person-arms';
  if (RIG.geoCache.has(key)) return RIG.geoCache.get(key);
  const body = RIG.lods[0].find(part => part.name === 'Athlete_Body').geo;
  const { skinIndex, skinWeight } = body.attributes;
  const arms = new Set(['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'].map(name => RIG.index[name]));
  const include = new Uint8Array(skinIndex.count);
  for (let i = 0; i < include.length; i++) {
    let weight = 0;
    for (let j = 0; j < 4; j++) if (arms.has(skinIndex.getComponent(i, j))) weight += skinWeight.getComponent(i, j);
    include[i] = weight > 0.55;
  }
  const indices = [];
  for (let i = 0; i < body.index.count; i += 3) {
    const [a, b, c] = body.index.array.subarray(i, i + 3);
    if (include[a] && include[b] && include[c]) indices.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, buffer] of Object.entries(body.attributes)) g.setAttribute(name, buffer);
  g.setIndex(indices); shapesFor(g, body);
  RIG.geoCache.set(key, g);
  return g;
}

// Per geometry and bone: the bind-space vertices the bone carries most of,
// reduced to their extremes along 124 directions (a hull), plus the
// largest distance of any from the bone's joint (r, model units). Humanoid.lowest()
// carries them with the bone, so gear (pads, gloves, helmet) counts too.
const HULLS = new WeakMap();
const DIRS = [];
for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
function hullFor(geo) {
  let H = HULLS.get(geo);
  if (H) return H;
  const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const best = RIG.bones.map(() => DIRS.map(() => ({ d: -Infinity, i: -1 })));
  const rad = RIG.bones.map(() => 0);
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    let b = -1, bw = 0;                           // (the bone with the most weight: every vertex counts)
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; b = SI.getComponent(i, k); } }
    if (b < 0) continue;
    v.fromBufferAttribute(P, i).sub(RIG.J[RIG.bones[b]]);
    rad[b] = Math.max(rad[b], v.length());
    const B = best[b];
    for (let k = 0; k < DIRS.length; k++) { const d = v.dot(DIRS[k]); if (d > B[k].d) { B[k].d = d; B[k].i = i; } }
  }
  H = best.map((B, b) => {
    const ids = [...new Set(B.filter((x) => x.i >= 0).map((x) => x.i))];
    if (!ids.length) return null;
    const p = new Float32Array(ids.length * 3), si = new Uint8Array(ids.length * 4), sw = new Float32Array(ids.length * 4);
    ids.forEach((i, k) => {
      p[k * 3] = P.getX(i); p[k * 3 + 1] = P.getY(i); p[k * 3 + 2] = P.getZ(i);
      for (let j = 0; j < 4; j++) { si[k * 4 + j] = SI.getComponent(i, j); sw[k * 4 + j] = SW.getComponent(i, j); }
    });
    return { p, si, sw, r: rad[b] + 0.12 };
  });
  HULLS.set(geo, H);
  return H;
}

// Shared kit shader: the `kit` vertex attribute (slot, baked AO) picks a
// per-figure uniform colour. Physically based skin, cloth and eyes retain:
// baked ambient occlusion, a soft fresnel rim (cooler on cloth, warm scatter on
// skin), skin a touch warmer in shadow, and a uniform with panels, piping,
// eyelet mesh, folds, sheen and twill lettering projected from a print atlas.
// depth: the see-through body's depth pre-pass (setGhost), sharing `shared` (the figure's uniforms).
const KIT_FRAGMENT_HEAD = `
uniform vec4 uGear; uniform vec3 uGearColor; uniform vec3 uShoe; uniform float uFade; uniform sampler2D uFabric; uniform vec3 uArmE; uniform vec3 uArmW;
uniform vec3 uKit1; uniform vec3 uKit2; uniform vec3 uKit3; uniform vec3 uPanel; uniform vec3 uSkin; uniform vec3 uHair;
uniform sampler2D uSkinBody; uniform sampler2D uSkinFace; uniform sampler2D uHairMap; uniform sampler2D uDetail; uniform vec3 uSkinTint; uniform float uMaps;
varying vec2 vTex;
#define KIT_PRINT_WIDTH ${PRINT.width.toFixed(4)}
#define KIT_PRINT_HEIGHT ${PRINT.height.toFixed(4)}
#define KIT_PRINT_BOTTOM ${PRINT.bottom.toFixed(4)}
float kitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 43.21))) * 43758.5453); }
// Smooth value noise in bind space: it sticks to the body as it moves.
float kitNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kitHash(i), kitHash(i + vec3(1, 0, 0)), f.x), mix(kitHash(i + vec3(0, 1, 0)), kitHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(kitHash(i + vec3(0, 0, 1)), kitHash(i + vec3(1, 0, 1)), f.x), mix(kitHash(i + vec3(0, 1, 1)), kitHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
// Detail painted in bind space, where every body region has a fixed address:
// shoes and socks, hems and stripes, sleeves and bands, and living skin.
const KIT_FRAGMENT_COLOR = `
  float kitSlot = vKA.x, gearCloth = 0.0, kitCloth = 0.0, kitTwill = 0.0, kitHeight = 0.0, kitCover = 1.0, kitDetail = 0.5;
  bool kitSkin = (kitSlot > 4.5 && kitSlot < 5.5), kitHair = (kitSlot > 5.5 && kitSlot < 6.5);
  bool kitLips = (kitSlot > 7.5 && kitSlot < 8.5), kitEyes = (kitSlot > 8.5 && kitSlot < 9.5), kitCards = kitSlot > 9.5;
  // ---- photographs: skin (body texture, or the face texture for the head's
  // UV island at u in [1, 2]), eyes and brow/lash cards (face atlas), and the
  // short hair laid over the scalp (hair texture: strand detail, coverage) on
  // two shells, the outer one (u in [2, 3]) catching only the curls' tips.
  // (Gradients are taken here, outside the branches, for textureGrad.)
  float kitTips = step(2.0, vTex.x);
  vec2 kitFaceUv = vTex - vec2(1.0 + kitTips, 0.0), kitDx = dFdx(vTex), kitDy = dFdy(vTex);
  if (uMaps > 0.5) {
    if (kitSkin || kitLips) {
      vec3 photo = vTex.x > 1.0 ? textureGrad(uSkinFace, kitFaceUv, kitDx, kitDy).rgb : textureGrad(uSkinBody, vTex, kitDx, kitDy).rgb;
      diffuseColor.rgb = photo * uSkinTint;
      // Shaved scalp (a fade, the hairline's edge): the shadow of the stubble where the hair grows.
      if (kitSkin && vTex.x > 1.0) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + uHair * 0.3, 0.55 * textureGrad(uHairMap, kitFaceUv, kitDx, kitDy).a);
    } else if (kitEyes) diffuseColor.rgb = textureGrad(uDetail, vTex, kitDx, kitDy).rgb * 0.85;   // (a living white is never paper white)
    else if (kitCards) { kitCover = textureGrad(uDetail, vTex, kitDx, kitDy).a; diffuseColor.rgb = uHair * 0.8; }
    else if (kitHair) {
      vec2 strands = textureGrad(uHairMap, kitFaceUv, kitDx, kitDy).ra;
      kitDetail = strands.x; kitCover = strands.y * mix(1.0, smoothstep(0.5, 0.68, kitDetail), kitTips);
      diffuseColor.rgb = uHair * (0.2 + 1.9 * kitDetail * kitDetail) * (1.0 + 0.25 * kitTips);
    }
  } else if (kitEyes) {
    // (no textures: an iris and pupil drawn from the atlas coordinates)
    vec2 e = vTex * vec2(2.0, 1.0);
    float r = min(distance(e, vec2(0.292, 0.297)), distance(e, vec2(0.704, 0.703)));
    diffuseColor.rgb = mix(mix(vec3(0.01), vec3(0.22, 0.12, 0.05), smoothstep(0.03, 0.035, r)), vec3(0.8, 0.79, 0.76), smoothstep(0.078, 0.086, r));
  } else if (kitCards) kitCover = 0.0;
  else if (kitHair) kitCover = 1.0 - kitTips;             // (no textures: the inner shell as a plain cap)
  vec3 bp = vModelP; float arm = abs(bp.x);
  if (kitSlot < 0.5 && bp.y < 0.32 && bp.y > 0.0) {
    if (bp.y < 0.058) diffuseColor.rgb = mix(vec3(0.07, 0.07, 0.08), vec3(0.86, 0.84, 0.78), smoothstep(0.044, 0.05, bp.y));       // outsole, midsole
    else if (bp.y < 0.172) {
      // Upper: toe cap and heel counter in the team colour, a collar in the trim.
      vec3 upper = uShoe; float accent = max(smoothstep(0.165, 0.185, bp.z), 1.0 - smoothstep(-0.07, -0.045, bp.z));
      upper = mix(upper, uKit1 * 0.9, accent * 0.85); upper = mix(upper, uKit2, smoothstep(0.148, 0.156, bp.y) * 0.8);
      diffuseColor.rgb = upper * (0.9 + 0.1 * kitNoise(bp * 160.0));
    } else {
      // Crew socks with two team stripes.
      float stripe = step(0.262, bp.y) * step(bp.y, 0.274) + step(0.284, bp.y) * step(bp.y, 0.296);
      diffuseColor.rgb = mix(vec3(0.9, 0.9, 0.87), uKit1, stripe);
    }
  }
  // ---- the uniform: panels and piping, twill lettering, mesh and folds
  bool kitJersey = (kitSlot > 0.5 && kitSlot < 1.5), kitShorts = (kitSlot > 3.5 && kitSlot < 4.5);
  bool kitBinding = (kitSlot > 1.5 && kitSlot < 2.5) || (kitSlot > 6.5 && kitSlot < 7.5);
  // Around the body and up it, in metres: the grain of the cloth.
  vec2 kitWrap = vec2(atan(bp.x, bp.z) * 0.16, bp.y);
  float kitRib = 0.0;
  if (kitJersey || kitShorts) {
    kitCloth = 1.0;
    // A side panel from armhole to hem and on down the leg, edged with piping.
    float seam = abs(bp.z - 0.028), panelHalf = kitJersey ? mix(0.052, 0.036, smoothstep(0.95, 1.3, bp.y)) : 0.052;
    float edge = fwidth(bp.z) + 0.0006, outside = smoothstep(0.125, 0.15, arm);
    float panel = outside * (1.0 - smoothstep(panelHalf - edge, panelHalf + edge, seam));
    float piping = outside * (1.0 - smoothstep(0.0032, 0.0032 + edge, abs(seam - panelHalf)));
    diffuseColor.rgb = mix(diffuseColor.rgb, uPanel, panel);
    diffuseColor.rgb = mix(diffuseColor.rgb, uKit2, piping);
    float stitchFade = 1.0 - smoothstep(0.0012, 0.004, fwidth(bp.y)), hemY = kitJersey ? 0.915 : 0.592;
    if (kitShorts) {
      // Bound hem and an elastic, ribbed waistband.
      float band = 1.0 - smoothstep(hemY + 0.02 - fwidth(bp.y), hemY + 0.02, bp.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, uKit2, band * 0.94);
      float waist = smoothstep(1.043, 1.047, bp.y);
      diffuseColor.rgb *= mix(1.0, 0.74, waist); kitRib = max(kitRib, waist);
    }
    // Twin-needle stitching above each hem.
    float sewn = max(1.0 - smoothstep(0.0, 0.0011, abs(bp.y - hemY - (kitJersey ? 0.016 : 0.024))), 1.0 - smoothstep(0.0, 0.0011, abs(bp.y - hemY - (kitJersey ? 0.021 : 0.029))));
    diffuseColor.rgb *= 1.0 - 0.22 * sewn * stitchFade; kitHeight -= 0.0005 * sewn * stitchFade;
    if (kitJersey) {
      // Tackle twill: wordmark and number on the chest, name and number on the back.
      float front = step(0.06, bp.z), back = step(bp.z, 0.0);
      vec2 puv = vec2(bp.x / KIT_PRINT_WIDTH, (bp.y - KIT_PRINT_BOTTOM) / KIT_PRINT_HEIGHT);
      puv.x = front > 0.5 ? puv.x + 0.5 : 0.5 - puv.x;
      vec2 twill = texture2D(uKitPrint, vec2((clamp(puv.x, 0.0, 1.0) + back) * 0.5, clamp(puv.y, 0.0, 1.0))).rg;
      twill *= (front + back) * step(0.015, puv.x) * step(puv.x, 0.985) * step(0.0, puv.y) * step(puv.y, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uKit3 * 0.85, twill.g);
      diffuseColor.rgb = mix(diffuseColor.rgb, uKit2, twill.r);
      kitTwill = twill.g; kitHeight += 0.0011 * twill.g + 0.0004 * twill.r;
    }
    // Eyelet mesh: rows of pin holes, gone before they can shimmer.
    vec2 eye = kitWrap * 430.0;
    float eyeFade = (1.0 - smoothstep(0.16, 0.42, max(length(dFdx(eye)), length(dFdy(eye))))) * (1.0 - kitTwill) * (1.0 - panel);
    vec2 cell = fract(vec2(eye.x + 0.5 * mod(floor(eye.y), 2.0), eye.y)) - 0.5;
    float hole = (1.0 - smoothstep(0.13, 0.25, length(cell))) * eyeFade;
    diffuseColor.rgb *= 1.0 - 0.3 * hole; kitHeight -= 0.0003 * hole;
    // Folds: the cloth hangs in soft vertical drapes, deepest where it is loosest.
    float loose = kitJersey ? mix(1.0, 0.3, smoothstep(1.06, 1.32, bp.y)) : 0.85;
    float fold = kitNoise(vec3(bp.x * 15.0, bp.y * 5.5, bp.z * 15.0)) + 0.5 * kitNoise(vec3(bp.x * 33.0 + 3.1, bp.y * 13.0, bp.z * 33.0));
    kitHeight += 0.0042 * loose * fold * (1.0 - 0.6 * kitTwill);
    diffuseColor.rgb *= 1.0 - 0.1 * loose * (1.0 - smoothstep(0.35, 0.95, fold));
    // Yarn-dyed cloth is never one flat colour.
    diffuseColor.rgb *= 0.965 + 0.07 * kitNoise(bp * 380.0);
  }
  if (kitBinding) { kitCloth = 1.0; kitRib = 1.0; }
  if (kitSkin) {
    // Untextured skin is never one colour: broad mottling and fine grain (the
    // photographs carry their own). Exertion: a little more blood in the
    // knees, elbows, knuckles, ears and nose.
    if (uMaps < 0.5) {
      float broad = kitNoise(bp * 26.0), fine = kitNoise(bp * 150.0);
      diffuseColor.rgb *= 1.0 + (broad - 0.5) * 0.09 + (fine - 0.5) * 0.05;
    }
    float flush = (1.0 - smoothstep(0.03, 0.09, abs(bp.y - 0.5))) * step(arm, 0.3)
      + (1.0 - smoothstep(0.02, 0.06, abs(arm - 0.36))) * step(1.0, bp.y) * step(bp.y, 1.26)
      + smoothstep(0.52, 0.56, arm) * 0.6 + smoothstep(0.075, 0.09, arm) * step(1.6, bp.y) * step(bp.y, 1.7) + smoothstep(0.155, 0.17, bp.z) * step(1.6, bp.y) * step(bp.y, 1.66);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.84, 0.8), clamp(flush, 0.0, 1.0) * (uMaps > 0.5 ? 0.22 : 0.45));
    // Compression sleeves and bands are painted straight onto the limb.
    float lr = sign(bp.x);
    // (Along the bind-pose forearm: 0 at the elbow, 1 at the wrist.)
    vec3 fore = uArmW - uArmE; float along = dot(vec3(arm, bp.y, bp.z) - uArmE, fore) / dot(fore, fore), limb = step(0.2, arm) * step(0.9, bp.y) * step(vHandW, 0.45);
    if (uGear.x * lr > 0.5 && limb > 0.5 && arm > 0.265) gearCloth = 1.0;
    if (uGear.w > 0.5 && limb > 0.5 && along > 0.74 && along < 0.98) gearCloth = 1.0;
    if (uGear.y * lr > 0.5 && bp.y > 0.34 && bp.y < 0.63 && arm < 0.3) gearCloth = 1.0;
  }
  // Headband (on the skin a little past where the lifted hair resumes, so no skin shows between them at a slant).
  if (uGear.z > 0.5 && (kitSkin || kitHair) && bp.y > 1.688 && bp.y < (kitHair ? 1.722 : 1.728) && arm < 0.12) gearCloth = 1.0;
  // A fade: the hair is cut shorter and shorter down the sides and round the
  // back, so the strands thin out (the darkest first) into the shaved scalp.
  if (kitHair && uFade > 0.0) {
    float low = 1.0 - smoothstep(1.625, 1.712, bp.y);
    kitCover -= uFade * low * (1.25 - 0.7 * kitDetail);
    diffuseColor.rgb *= 1.0 - 0.25 * uFade * low;
  }
  if (gearCloth > 0.5) diffuseColor.rgb = uGearColor * (0.92 + 0.08 * kitNoise(bp * 200.0));
  if (gearCloth > 0.5 && kitHair) kitCover = 0.0;     // (a headband presses the hair flat: the band is on the skin under it)
  // Hair and cards are alpha-tested: order-independent, nothing to sort. With
  // multisampling the coverage is dithered over the samples (alpha to coverage).
  if (kitHair || kitCards) {
    #ifdef ALPHA_TO_COVERAGE
      float cover = kitCards ? clamp(kitCover * 1.5 - 0.05, 0.0, 1.0) : smoothstep(0.38, 0.62, kitCover);
      if (cover < 0.04) discard;
    #else
      float cover = 1.0;
      if (kitCover < 0.5) discard;
    #endif
    diffuseColor.a *= cover;
  }
  if (gearCloth > 0.5 || (kitSlot > 2.5 && kitSlot < 3.5)) { kitCloth = 1.0; kitRib = 1.0; }
  if (kitRib > 0.0) {
    // Rib knit on bindings, waistband, sleeves and bands.
    float ribs = kitWrap.x * 2600.0, ribFade = (1.0 - smoothstep(0.5, 1.4, fwidth(ribs))) * kitRib, rib = sin(ribs);
    diffuseColor.rgb *= 1.0 + 0.07 * rib * ribFade; kitHeight += 0.00028 * rib * ribFade;
  }
`;
const KIT_FRAGMENT_NORMAL = `
  #ifdef KIT_FABRIC
  if (kitCloth > 0.5) {
    // Knit relief on every piece of cloth, wrapped round the body's long axis.
    vec2 fuv = kitWrap * 52.0;
    vec2 st0 = dFdx(fuv), st1 = dFdy(fuv);
    if (max(dot(st0, st0), dot(st1, st1)) < 0.4) {
      vec3 knit = texture2D(uFabric, fuv).xyz * 2.0 - 1.0; knit.xy *= 0.7 * (1.0 - 0.7 * kitTwill);
      vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition), q1perp = cross(q1, normal), q0perp = cross(normal, q0);
      vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
      float det = max(dot(T, T), dot(B, B));
      if (det > 0.0) normal = normalize(mat3(T * inversesqrt(det), B * inversesqrt(det), normal) * knit);
    }
  }
  #endif
  if (kitCloth > 0.5) {
    // Folds, raised twill, stitching and eyelets: one height field in metres,
    // turned into a normal from its screen-space slope.
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    normal = normalize(abs(det) * normal - sign(det) * (dFdx(kitHeight) * r1 + dFdy(kitHeight) * r2));
  }
`;
const blankPrint = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blankPrint.needsUpdate = true;
// A knit normal map shared by every kit (set once, before athletes are made).
const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatNormal.needsUpdate = true;
const FABRIC = { texture: flatNormal, on: false };
export function setFabric(texture) { if (texture) { FABRIC.texture = texture; FABRIC.on = true; } }
function kitMaterial(shared = null, depth = false) {
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, clearcoat: 0.035, clearcoatRoughness: 0.48, envMapIntensity: 0.45, sheen: 1, sheenColor: 0x000000, sheenRoughness: 0.45 });
  mat.alphaToCoverage = !depth;   // (hair and cards; switched off while the figure is see-through or fading)
  if (depth) mat.defines = { GHOST_DEPTH: 1 };
  if (FABRIC.on) mat.defines = { ...mat.defines, KIT_FABRIC: 1 };
  const uniforms = shared || {
    uKit1: { value: new THREE.Color(0x1f4fa8) }, uKit2: { value: new THREE.Color(0xf2c12e) }, uKit3: { value: new THREE.Color(0x14285a) },
    uKit4: { value: new THREE.Color(0x17336e) }, uSkin: { value: new THREE.Color(0xc68e62) }, uHair: { value: new THREE.Color(0x1d1510) },
    uPanel: { value: new THREE.Color(0x173f8c) },
    uKitPrint: { value: blankPrint },   // twill lettering (kitprint.js)
    uNoHead: { value: 0 },         // 1: the head and neck are not drawn (your own see-through body)
    uHeadBones: { value: new THREE.Vector2(RIG.index.neck, RIG.index.head) },
    uLegBones: { value: new THREE.Vector2(Math.min(RIG.index.hipL, RIG.index.hipR), Math.max(RIG.index.ankleL, RIG.index.ankleR)) },
    uHandBones: { value: new THREE.Vector2(RIG.index.handL, RIG.index.handR) },
    uGloved: { value: 0 },         // 1: bare hands are not drawn (they are inside gloves)
    uTrunkAlpha: { value: 1 },     // opacity of everything above the legs (x the material's opacity)
    // See-through body (setGhost): opacity of trunk+arms, thighs, shins (pads), feet (boots), and of the outline.
    uGhost: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGhostEdge: { value: 0 },
    uGhostHands: { value: 0 },     // the gloves (on your bat's handle)
    // Worn kit, painted onto the body in bind space: x arm sleeve side (+1 left,
    // -1 right, 0 none), y leg sleeve side, z headband, w wristbands (1 both).
    uGear: { value: new THREE.Vector4(0, 0, 0, 0) }, uGearColor: { value: new THREE.Color(0xf4f1e6) },
    uShoe: { value: new THREE.Color(0xf2f2ee) }, uFade: { value: 0 },
    uFabric: { value: FABRIC.texture }, uArmE: { value: RIG.J.elbowL.clone() }, uArmW: { value: RIG.J.handL.clone() },
    uLegIdx: { value: new THREE.Vector3(RIG.index.hipL, RIG.index.kneeL, RIG.index.ankleL) },
    uLegIdxR: { value: new THREE.Vector3(RIG.index.hipR, RIG.index.kneeR, RIG.index.ankleR) },
    // Photographs (setSkinMaps / Humanoid.setSkinMap): uMaps 0 keeps vertex-coloured skin.
    uSkinBody: { value: blankWhite }, uSkinFace: { value: blankWhite }, uSkinTint: { value: new THREE.Color(1, 1, 1) },
    uHairMap: { value: FACE.hair }, uDetail: { value: FACE.detail }, uMaps: { value: FACE.on ? 1 : 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 kit;
        uniform vec2 uHeadBones; uniform vec2 uLegBones; uniform vec2 uHandBones; uniform float uGloved;
        uniform vec3 uKit1; uniform vec3 uKit2; uniform vec3 uKit3; uniform vec3 uKit4; uniform vec3 uSkin; uniform vec3 uHair; uniform vec3 uPanel;
        uniform vec3 uLegIdx; uniform vec3 uLegIdxR;
        varying float vHeadW; varying float vLegW; varying vec3 vSeg; varying float vHandW; varying vec2 vKA; varying vec3 vModelP; varying vec2 vTex;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_COLOR
          float k = kit.x;
          if (k > 9.5) vColor.rgb = uHair * 0.8;            // brow and lash cards
          else if (k > 8.5) { /* eyes: the authored colour (the texture replaces it) */ }
          else if (k > 7.5) vColor.rgb = uSkin * vec3(0.86, 0.72, 0.70);
          else if (k > 6.5) vColor.rgb = uPanel; else if (k > 5.5) vColor.rgb = uHair; else if (k > 4.5) vColor.rgb = uSkin; else if (k > 3.5) vColor.rgb = uKit4;
          else if (k > 2.5) vColor.rgb = uKit3; else if (k > 1.5) vColor.rgb = uKit2; else if (k > 0.5) vColor.rgb = uKit1;
        #endif
        vKA = kit; vModelP = position; vTex = uv;
        vHeadW = 0.0; vLegW = 0.0; vSeg = vec3(0.0); vHandW = 0.0;
        #ifdef USE_SKINNING
          for (int i = 0; i < 4; i++) {
            float b = skinIndex[i];
            vec3 m = step(abs(vec3(b) - uLegIdx), vec3(0.5)) + step(abs(vec3(b) - uLegIdxR), vec3(0.5));
            vSeg += m * skinWeight[i];
            if (abs(b - uHandBones.x) < 0.5 || abs(b - uHandBones.y) < 0.5) vHandW += skinWeight[i];
            if (abs(b - uHeadBones.x) < 0.5 || abs(b - uHeadBones.y) < 0.5) vHeadW += skinWeight[i];
            if (b > uLegBones.x - 0.5 && b < uLegBones.y + 0.5) vLegW += skinWeight[i];
            // Skin on a gloved hand: fold it into the 'hidden' weight.
            if (uGloved > 0.5 && kit.x > 4.5 && kit.x < 5.5 && (abs(b - uHandBones.x) < 0.5 || abs(b - uHandBones.y) < 0.5)) vHeadW += 2.0 * skinWeight[i];
          }
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNoHead;\nuniform float uTrunkAlpha;\nuniform vec4 uGhost;\nuniform float uGhostEdge;\nvarying float vHeadW;\nvarying float vLegW;\nvarying vec3 vSeg;\nvarying float vHandW;\nuniform float uGhostHands;\nuniform sampler2D uKitPrint;\nvarying vec2 vKA; varying vec3 vModelP;' + KIT_FRAGMENT_HEAD)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float skinSurface = step(4.5, vKA.x) * step(vKA.x, 5.5) + step(7.5, vKA.x) * step(vKA.x, 8.5);
        float pore = fract(sin(dot(floor(vModelP * 800.0), vec3(12.9898, 78.233, 43.21))) * 43758.5453);
        // Sweat: patches of sheen that move with the skin, not the camera.
        skinSurface *= 1.0 - gearCloth;
        roughnessFactor = mix(0.88, 0.4 + pore * 0.1 + kitNoise(vModelP * 9.0) * 0.16, clamp(skinSurface, 0.0, 1.0));
        if (vKA.x < 0.5 && vModelP.y < 0.172) roughnessFactor = 0.55;
        float eyeSurface = step(8.5, vKA.x) * step(vKA.x, 9.5);
        roughnessFactor = mix(roughnessFactor, 0.3, eyeSurface);
        if (vKA.x > 5.5 && vKA.x < 6.5) roughnessFactor = 0.62 + 0.25 * (1.0 - kitDetail);     // hair: a soft sheen on the curls
        if (vKA.x > 9.5) roughnessFactor = 0.6;
        // Polyester knit: a soft, even surface; pressed twill is flatter and tighter.
        if (kitCloth > 0.5) roughnessFactor = mix(0.7 + 0.12 * kitNoise(vModelP * 70.0), 0.5, kitTwill);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          // The glow of knit cloth at grazing angles, in the colour of the cloth.
          material.sheenColor = (diffuseColor.rgb * 0.5 + 0.12) * kitCloth * (1.0 - 0.6 * kitTwill); material.sheenRoughness = 0.45;
        #endif
        // Hair, brows and lashes: fine strands scatter light; no glassy edge on the cards.
        if (vKA.x > 9.5 || (vKA.x > 5.5 && vKA.x < 6.5)) { material.specularColor *= 0.35; material.specularF90 = 0.35; }
        #ifdef USE_CLEARCOAT
          // Eyes: a wet, mirror-smooth film over the iris and the white.
          if (vKA.x > 8.5 && vKA.x < 9.5) { material.clearcoat = 1.0; material.clearcoatRoughness = 0.06 + geometryRoughness; }
        #endif`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + KIT_FRAGMENT_NORMAL)
      .replace('#include <color_fragment>', `#include <color_fragment>
  ${KIT_FRAGMENT_COLOR}
  diffuseColor.a *= mix(uTrunkAlpha, 1.0, clamp(vLegW, 0.0, 1.0));
  if (uGhost.w > 0.0) {
    vec3 sg = clamp(vSeg, 0.0, 1.0);
    float hw = clamp(vHandW, 0.0, 1.0);
    // (the gloves fade out close to your eyes: a bat brought up to your face is not hidden behind them)
    float near = smoothstep(0.14, 0.32, length(vViewPosition));
    diffuseColor.a = uGhost.x * clamp(1.0 - sg.x - sg.y - sg.z - hw, 0.0, 1.0) + uGhost.y * sg.x + uGhost.z * sg.y + uGhost.w * sg.z + uGhostHands * hw * near;
    #ifdef GHOST_DEPTH
      // (only the pads, boots and gloves: the faint trunk, arms and thighs never hide what is behind them)
      if (sg.y + sg.z + hw < 0.5 || diffuseColor.a < 0.2) discard;
    #endif
  }`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ((uNoHead > 0.5 && vHeadW > 0.35 && vHeadW < 1.5) || vHeadW > 1.5) discard;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float ao = clamp(vKA.y, 0.0, 1.0);
          float skin = step(4.5, vKA.x) * step(vKA.x, 5.5) + step(7.5, vKA.x) * step(vKA.x, 8.5);
          reflectedLight.indirectDiffuse *= ao * mix(vec3(0.96, 0.98, 1.03), vec3(1.07, 0.95, 0.88), skin);
          reflectedLight.directDiffuse *= mix(1.0, ao, 0.55);
          float fres = pow(1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0), 2.5);
          vec3 rim = mix(diffuseColor.rgb * 0.6 + vec3(0.04, 0.05, 0.06), diffuseColor.rgb * vec3(1.15, 0.75, 0.6) + vec3(0.05, 0.02, 0.0), skin);
          reflectedLight.indirectDiffuse += rim * fres * ao * 0.5 * (1.0 - step(8.5, vKA.x));     // (not on the eyes or the cards)
          if (uGhostEdge > 0.0) {
            // see-through body: a dark, solid outline where the surface turns away (pads and boots most)
            float e = smoothstep(0.35, 0.85, 1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0));
            float lw = clamp(vSeg.x * 0.35 + vSeg.y + vSeg.z, 0.0, 1.0);
            diffuseColor.a = max(diffuseColor.a, e * uGhostEdge * mix(0.02, 1.0, lw));
            reflectedLight.directDiffuse *= 1.0 - 0.75 * e * lw;
            reflectedLight.indirectDiffuse *= 1.0 - 0.75 * e * lw;
          }
        }`);
  };
  mat.customProgramCacheKey = () => (depth ? 'rimrun-kit-pbr-v6-depth' : 'rimrun-kit-pbr-v6') + (FABRIC.on ? '-knit' : '');
  mat.userData.uniforms = uniforms;
  return mat;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _wf = new THREE.Vector3(), _wv = new THREE.Vector3(), _wt = new THREE.Vector3(), _wF = new THREE.Vector3(), _wN = new THREE.Vector3(), _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _S = new THREE.Vector3(), _E = new THREE.Vector3(),
  _T = new THREE.Vector3(), _dir = new THREE.Vector3(), _pv = new THREE.Vector3(), _end = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _eul = new THREE.Euler(), _bq = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FOOT_ONLY = {}, HAND_ONLY = {};

export class Humanoid {
  constructor({ team = 'home', skin = null, hair = null, headgear = 'cap', pads = false, gloves = false, keeper = false, scale = 1, seed = 0, skinMap = null } = {}) {
    if (!RIG) throw new Error('loadAthlete() must finish before creating players');
    const rnd = (n) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    this.opts = { headgear, pads, gloves, keeper };
    this.material = kitMaterial();
    const u = this.material.userData.uniforms;
    u.uSkin.value.setHex(skin ?? SKIN_TONES[Math.floor(rnd(1) * SKIN_TONES.length)]);
    u.uHair.value.setHex(hair ?? HAIR[Math.floor(rnd(2) * HAIR.length)]);
    this.setSkinMap(skinMap);
    const bones = [];
    this.bones = {};
    for (const name of RIG.bones) {
      const b = new THREE.Bone();
      b.name = name;
      const parent = PARENT[name];
      b.position.copy(RIG.canon[name]);
      if (parent) { b.position.sub(RIG.canon[parent]); this.bones[parent].add(b); }
      this.bones[name] = b;
      bones.push(b);
    }
    this.lod = 0;
    this.mesh = new THREE.SkinnedMesh(geometryFor(this.opts, 0), this.material);
    this.mesh.add(bones[0]);
    this.mesh.position.y = -RIG.floor;            // soles on the ground in the canonical pose (see prepareRig)
    this.mesh.bind(new THREE.Skeleton(bones, RIG.inverses.map((m) => m.clone())), new THREE.Matrix4());
    // Generous fixed culling sphere (covers raised arms, dives and a bat).
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 2.1);
    this.mesh.frustumCulled = true;
    this.boneList = bones;
    this._mw = bones.map(() => new THREE.Matrix4());
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.baseScale = BASE_SCALE * scale;
    this.root.scale.setScalar(this.baseScale);
    this.hipsRest = this.bones.hips.position.clone();
    this.ankleHeight = RIG.sole;                  // sole to ankle joint (model units)
    this.toeLength = RIG.toe;                     // ankle to the tip of the sole, along the foot (model units)
    this.lowY = 0;                                // the lowest point of the body last frame (world y, after groundGuard)
    this.armLength = RIG.J.shoulderL.distanceTo(RIG.J.elbowL) + RIG.J.elbowL.distanceTo(RIG.J.handL);
    u.uGloved.value = gloves ? 1 : 0;
    this.setNumber(team === 'umpire' ? 0 : 1 + Math.floor(rnd(3) * 98));
    this.setTeam(team);
    // Contact shadow: a slot in the shared instanced shadow mesh.
    this.shadowSlot = ShadowPool.alloc();
    Humanoid.all.push(this);
  }

  // Pick the level of detail for every visible figure from the viewer's position.
  static updateLods(viewer, nearDist = 13) {
    for (const h of Humanoid.all) if (h.root.visible) h.updateLod(viewer, nearDist);
  }

  updateLod(viewer, nearDist = 13) {
    const p = this.root.position;
    const distance = Math.hypot(p.x - viewer.x, p.z - viewer.z);
    this.setLod(distance > nearDist * (this.lod === 0 ? 1.15 : 1) ? 1 : 0);
  }

  // Worn kit: { sleeve: 'L'|'R'|null, leg: 'L'|'R'|null, headband, wristbands, color, shoe, fade }.
  setGear({ sleeve = null, leg = null, headband = false, wristbands = false, color = 0xf4f1e6, shoe = 0xf2f2ee, fade = 0 } = {}) {
    const u = this.material.userData.uniforms, side = s => (s === 'L' ? 1 : s === 'R' ? -1 : 0);
    u.uGear.value.set(side(sleeve), side(leg), headband ? 1 : 0, wristbands ? 1 : 0);
    u.uGearColor.value.setHex(color); u.uShoe.value.setHex(shoe); u.uFade.value = fade;
  }

  // Shape of a hand: open (0 relaxed .. 1 flat and spread) and ball (0 .. 1
  // spread wide round a basketball). The rest hand is the relaxed one.
  setHandShape(side, open = 0, ball = 0) {
    const m = this.mesh.morphTargetInfluences, d = this.mesh.morphTargetDictionary; if (!m || !d) return;
    if (d['open' + side] !== undefined) m[d['open' + side]] = open;
    if (d['ball' + side] !== undefined) m[d['ball' + side]] = ball;
  }

  // Point a hand: fingers along `fingers`, palm facing `palm` (world space),
  // as far as a wrist allows. From the line of the forearm a wrist bends up to
  // `limit` radians toward the palm or the back of the hand, and only a little
  // sideways; it turns freely about the forearm.
  aimHand(side, fingers, palm, limit = 1.15, out = null) {
    const fore = this.worldPos('hand' + side, _wf).sub(this.worldPos('elbow' + side, _wv)).normalize();
    const F = _wF.copy(fingers).normalize(), N = _wN.copy(palm);
    // The palm's direction, square to the forearm: the plane the wrist flexes in.
    const flexAxis = _wv.copy(N).addScaledVector(fore, -N.dot(fore));
    if (flexAxis.lengthSq() > 1e-4) {
      flexAxis.normalize(); const sideAxis = _wt.crossVectors(fore, flexAxis);
      const flex = THREE.MathUtils.clamp(Math.atan2(F.dot(flexAxis), F.dot(fore)), -limit, limit), sideways = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(F.dot(sideAxis), -1, 1)), -0.35, 0.35);
      F.copy(fore).multiplyScalar(Math.cos(flex)).addScaledVector(flexAxis, Math.sin(flex)).multiplyScalar(Math.cos(sideways)).addScaledVector(sideAxis, Math.sin(sideways)).normalize();
    } else if (fore.angleTo(F) > limit) F.copy(fore).lerp(F, limit / fore.angleTo(F)).normalize();
    N.addScaledVector(F, -N.dot(F));
    if (N.lengthSq() < 1e-6) N.set(0, 1, 0).addScaledVector(F, -F.y);
    N.normalize();
    // Rest hand: fingers along -Y, palm along RIG.palm (bone space).
    const local = RIG.palm[side];
    _wm.makeBasis(_wt.crossVectors(N, F), _wv.copy(F).negate(), N); _wq.setFromRotationMatrix(_wm);
    _wm.makeBasis(_wt.set(0, -1, 0).cross(local).negate(), _wv.set(0, 1, 0), local); _wq.multiply(_wq2.setFromRotationMatrix(_wm).invert());
    if (out) return out.copy(_wq);
    this.setWorldQuat('hand' + side, _wq); return _wq;
  }
  // Which way the palm faces, in the hand bone's own space.
  palm(side) { return RIG.palm[side]; }
  // The same limits applied to whatever orientation a hand already has.
  relaxWrist(side, limit = 0.7) {
    this.bones['hand' + side].getWorldQuaternion(_wq2);
    this.aimHand(side, _wF.set(0, -1, 0).applyQuaternion(_wq2), _wN.copy(RIG.palm[side]).applyQuaternion(_wq2), limit);
  }

  // Skin photograph: 'light' or 'dark' (SKIN_MAPS), tinted toward this
  // figure's skin colour; null picks the nearer photo for that colour.
  setSkinMap(name = null) {
    const u = this.material.userData.uniforms, skin = u.uSkin.value;
    name = SKIN_MAPS[name] ? name : skinMapFor(skin.getHex()); this.skinMap = name;
    const map = SKIN_MAPS[name], tone = new THREE.Color(map.tone), on = FACE.on && map.body && map.face;
    u.uMaps.value = on ? 1 : 0;
    u.uSkinBody.value = map.body || blankWhite; u.uSkinFace.value = map.face || blankWhite;
    // (a little of the tint's saturation is held back: a photo pushed hard toward a tone turns orange)
    const tint = u.uSkinTint.value.setRGB(skin.r / tone.r, skin.g / tone.g, skin.b / tone.b), grey = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;
    tint.setRGB(grey + (tint.r - grey) * 0.85, grey + (tint.g - grey) * 0.85, grey + (tint.b - grey) * 0.85);
  }

  // Shirt number (0 = none) and the lettering that carries it (kitprint.js).
  setNumber(n) { this.number = Math.max(0, Math.min(99, n | 0)); }
  setPrint(texture) { this.material.userData.uniforms.uKitPrint.value = texture || blankPrint; }

  setTeam(team) {
    const k = KITS[team] || KITS.home;
    const u = this.material.userData.uniforms;
    u.uKit1.value.setHex(k.kit1); u.uKit2.value.setHex(k.kit2); u.uKit3.value.setHex(k.kit3); u.uKit4.value.setHex(k.kit4);
    u.uPanel.value.setHex(k.panel ?? k.kit1);
    this.team = team;
  }

  // Look like another figure (skin, hair, shirt number): the two figures that draw the same man.
  copyLook(o) {
    const u = this.material.userData.uniforms, v = o.material.userData.uniforms;
    u.uSkin.value.copy(v.uSkin.value); u.uHair.value.copy(v.uHair.value);
    this.setSkinMap(o.skinMap); this.setNumber(o.number);
  }

  setArmsOnly(on) {
    if (this.armsOnly === on) return;
    this.armsOnly = on;
    this.mesh.geometry = on ? armGeometry() : geometryFor(this.opts, this.lod);
  }

  // 0 = full detail, 1 = distant.
  setLod(lod) {
    if (lod === this.lod) return;
    this.lod = lod;
    if (!this.armsOnly) this.mesh.geometry = geometryFor(this.opts, lod);
  }

  // See-through body: what you see of yourself when you look down. No head
  // or neck; the trunk and arms very faint, so that you see through them to
  // your legs and feet, which are clearly drawn to judge them against the
  // crease: thighs half see-through, pads more solid, boots most, all with a
  // dark outline; the gloves all but solid on your bat (fading out right in
  // front of your eyes). legs: the pads' opacity (thighs a little less, boots more).
  // Each part is drawn as one clean layer, the nearest surface only: a
  // depth pre-pass (a twin of the mesh on the same skeleton that only writes
  // depth, for everything but the faint trunk) goes just before it, so the
  // back of a pad, the inside of a glove or the other leg behind never show
  // through as layers of grey smoke.
  setGhost(on, legs = 0.55, trunk = 0.035) {
    if (!!this.ghost === on) return;
    this.ghost = on;
    const m = this.material, u = m.userData.uniforms;
    m.transparent = on; m.alphaToCoverage = !on; m.opacity = 1; m.depthWrite = !on; m.needsUpdate = true;
    this.fade = 1;
    u.uNoHead.value = on ? 1 : 0;
    u.uTrunkAlpha.value = 1;
    u.uGhost.value.set(on ? trunk : 0, on ? legs * 0.7 : 0, on ? legs : 0, on ? Math.min(1, legs + 0.3) : 0);
    u.uGhostEdge.value = on ? 0.9 : 0;
    u.uGhostHands.value = on ? 0.92 : 0;
    this.mesh.renderOrder = on ? 3 : 0;
    if (on && !this.ghostDepth) {
      const dm = kitMaterial(u, true);
      dm.transparent = true; dm.colorWrite = false; dm.depthWrite = true;
      const g = this.ghostDepth = new THREE.SkinnedMesh(this.mesh.geometry, dm);
      g.bind(this.mesh.skeleton, this.mesh.bindMatrix);
      g.position.copy(this.mesh.position);
      g.boundingSphere = this.mesh.boundingSphere; g.frustumCulled = this.mesh.frustumCulled;
      g.renderOrder = 2.9;
      g.layers.mask = this.mesh.layers.mask;
      g.onBeforeRender = () => { g.geometry = this.mesh.geometry; };      // (the level of detail drawn)
      this.root.add(g);
    }
    if (this.ghostDepth) this.ghostDepth.visible = on;
  }

  // Fade the whole figure (and its bat) in or out: a = 0..1. Nobody appears
  // or disappears in one frame while he can be seen: a figure that has to
  // come or go (your runner leaving / rejoining you, a batter at the
  // pavilion gate) is faded. 1 = solid again (opaque material, depth written).
  setFade(a) {
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a === (this.fade ?? 1)) return;
    this.fade = a;
    if (this.ghost) return;                       // (your see-through body has its own opacities)
    const m = this.material;
    const tr = a < 1;
    if (m.transparent !== tr) { m.transparent = tr; m.alphaToCoverage = !tr; m.needsUpdate = true; }
    m.opacity = a;
    for (const x of this.extras || []) x.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.fadeMat) { o.material = o.material.clone(); o.userData.fadeMat = true; }
      if (o.material.transparent !== tr && !o.userData.wasTransparent) { if (o.userData.wasTransparent == null) o.userData.wasTransparent = o.material.transparent; if (!o.userData.wasTransparent) { o.material.transparent = tr; o.material.needsUpdate = true; } }
      o.material.opacity = a * (o.userData.baseOpacity ?? (o.userData.baseOpacity = o.material.opacity || 1));
    });
  }

  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; if (!v) ShadowPool.set(this.shadowSlot, 0, 0, false); }

  // Called after the root is placed for the frame: nothing may be below the
  // turf (see groundGuard), and the contact shadow follows the hips.
  syncShadow() {
    this.groundGuard();                           // (hidden too: replays record the pose)
    if (!this.root.visible) return;
    this.bones.hips.getWorldPosition(_v);
    ShadowPool.set(this.shadowSlot, _v.x, _v.z, true, this.root.scale.x * (0.8 + 0.4 * Math.min(1, (_v.y - this.root.position.y) / 1.0)) * (this.ghost ? 1 : this.fade ?? 1));
  }

  // Lowest point of the posed body (world y): every bone's hull points
  // (vertex extremes, gear included; see hullFor) carried rigidly by the bone.
  // Bones whose joint is higher above the ground than their hull reaches are skipped.
  lowest(only = null) {
    this.root.updateMatrixWorld(true);
    const H = hullFor(geometryFor(this.opts, 0)), sc = this.root.scale.y;     // (the full-detail mesh, whatever LOD is drawn)
    const M = this._mw;
    for (let b = 0; b < M.length; b++) M[b].multiplyMatrices(this.boneList[b].matrixWorld, RIG.inverses[b]);
    let low = Infinity;
    for (let b = 0; b < H.length; b++) {
      const hb = H[b];
      if (!hb || (only && !only.includes(b)) || M[b].elements[13] - hb.r * sc > low) continue;
      const { p, si, sw } = hb;
      for (let i = 0, n = p.length / 3; i < n; i++) {
        const x = p[i * 3], y0 = p[i * 3 + 1], z = p[i * 3 + 2];
        let y = 0;
        for (let k = 0; k < 4; k++) {                 // linear blend skinning, height only
          const w = sw[i * 4 + k];
          if (!w) continue;
          const m = M[si[i * 4 + k]].elements;
          y += w * (m[1] * x + m[5] * y0 + m[9] * z + m[13]);
        }
        if (y < low) { low = y; this.lowBone = b; }
      }
    }
    return low;
  }

  // A swinging (not planted) foot that dips into the turf: bend that leg
  // (IK, same knee direction, same foot orientation) so the sole clears it.
  // pole: the knee's IK pole to keep (default: out along the knee's current direction).
  clearFoot(side, pole = null) {
    const ia = RIG.index['ankle' + side], ik = RIG.index['knee' + side];
    const low = this.lowest(FOOT_ONLY[side] || (FOOT_ONLY[side] = [ia, ik]));
    if (low >= 0) return 0;
    const ank = this.bones['ankle' + side];
    ank.getWorldQuaternion(_bq);
    ank.getWorldPosition(_T); _T.y -= low;
    this.bones['knee' + side].getWorldPosition(_v);
    this.bones['hip' + side].getWorldPosition(_v2);
    _v.add(_v.clone().sub(_v2).setY(0).multiplyScalar(2));       // pole: out along the knee's current direction
    this.ikLeg(side, _T, pole || _v);
    this.setWorldQuat('ankle' + side, _bq);
    return -low;
  }

  // The same for an arm (a dive's leading arm stretched along the turf):
  // bend it so the hand and forearm stay on top of the turf.
  clearHand(side) {
    const ih = RIG.index['hand' + side], ie = RIG.index['elbow' + side];
    const low = this.lowest(HAND_ONLY[side] || (HAND_ONLY[side] = [ih, ie]));
    if (low >= 0) return 0;
    const hand = this.bones['hand' + side];
    hand.getWorldQuaternion(_bq);
    hand.getWorldPosition(_T); _T.y -= low;
    this.bones['elbow' + side].getWorldPosition(_v); _v.y -= 0.3;
    this.ikArm(side, _T, _v);
    this.setWorldQuat('hand' + side, _bq);
    return -low;
  }

  // Last line of defence: if any part of the body is below the turf (a pose
  // or a blend the animation code did not foresee), lift the whole figure so
  // its lowest point is on it. tol: what may go under (soles / pads press in).
  groundGuard(tol = 0.002) {
    const low = this.lowest();
    this.lowY = low;
    this.guardLift = low < -tol ? -(low + tol) : 0;
    if (low < -tol) {
      this.root.position.y -= low + tol;
      this.root.updateMatrixWorld(true);
      this.lowY = -tol;
    }
    return low;
  }

  reset() {
    for (const b of Object.values(this.bones)) b.quaternion.identity();
    this.bones.hips.position.copy(this.hipsRest);
  }

  // Local Euler rotation (relative to rest) for a bone.
  rot(name, x = 0, y = 0, z = 0, order = 'XYZ') {
    this.bones[name].quaternion.setFromEuler(_eul.set(x, y, z, order));
  }

  // Apply an extra local rotation on top of the current one.
  addRot(name, x = 0, y = 0, z = 0) {
    _pq.setFromEuler(_eul.set(x, y, z, 'XYZ'));
    this.bones[name].quaternion.multiply(_pq);
  }

  update() { this.root.updateMatrixWorld(true); }

  // Capture the current pose so a new one can be blended from it.
  snapshot(out = { q: [], hipsY: 0, hipsP: new THREE.Vector3() }) {
    this.boneList.forEach((b, i) => { (out.q[i] ||= new THREE.Quaternion()).copy(b.quaternion); });
    out.hipsP.copy(this.bones.hips.position);
    return out;
  }
  // current = lerp(snapshot, current, w)
  blendFrom(snap, w) {
    if (w >= 1) return;
    this.boneList.forEach((b, i) => { _bq.copy(b.quaternion); b.quaternion.slerpQuaternions(snap.q[i], _bq, w); });
    this.bones.hips.position.lerpVectors(snap.hipsP, this.bones.hips.position, w);
  }

  // Turn neck + head toward a world point (after the body is posed).
  lookAt(target, amount = 1, maxYaw = 1.4) {
    this.update();
    const neck = this.bones.neck;
    neck.parent.getWorldQuaternion(_pq).invert();
    neck.getWorldPosition(_v);
    _v2.subVectors(target, _v).applyQuaternion(_pq);
    const yaw = clamp(Math.atan2(_v2.x, _v2.z), -maxYaw, maxYaw) * amount;
    const pitch = clamp(Math.atan2(-_v2.y, Math.hypot(_v2.x, _v2.z)), -0.7, 0.8) * amount;
    this.rot('neck', pitch * 0.4, yaw * 0.45, 0, 'YXZ');
    this.rot('head', pitch * 0.6, yaw * 0.55, 0, 'YXZ');
  }

  worldPos(name, out) { return this.bones[name].getWorldPosition(out); }

  // Two-bone IK: limb = 'L' | 'R' arm, or 'legL' | 'legR'.
  ikArm(side, target, pole) {
    const b = this.bones;
    solveTwoBone(b['shoulder' + side], b['elbow' + side], b['hand' + side], target, pole, 1);
  }
  ikLeg(side, target, pole) {
    const b = this.bones;
    solveTwoBone(b['hip' + side], b['knee' + side], b['ankle' + side], target, pole, -1);
  }

  // Set a bone's world orientation.
  setWorldQuat(name, q) {
    const bone = this.bones[name];
    bone.parent.getWorldQuaternion(_pq).invert();
    bone.quaternion.copy(_pq).multiply(q);
    bone.updateMatrixWorld(true);
  }
}

// All actor contact shadows in one InstancedMesh (one draw call).
export const ShadowPool = {
  mesh: null, n: 0, max: 24,
  init(scene) {
    if (this.mesh) return;
    const g = new THREE.PlaneGeometry(0.84, 0.84);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, _shadowMat, this.max);
    this.mesh.count = this.max;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
  },
  alloc() { return this.n < this.max ? this.n++ : -1; },
  set(slot, x, z, visible, scale = 1) {
    if (!this.mesh || slot < 0) return;
    _sm.makeScale(visible ? scale : 0, 1, visible ? scale : 0).setPosition(x, 0.012, z);
    this.mesh.setMatrixAt(slot, _sm);
    this.mesh.instanceMatrix.needsUpdate = true;
  },
};
const _sm = new THREE.Matrix4();
const _shadowMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
})();

// Aim a bone's -Y axis along a world direction.
function aimBone(bone, dirWorld) {
  bone.parent.getWorldQuaternion(_pq).invert();
  _v2.copy(dirWorld).applyQuaternion(_pq).normalize();
  bone.quaternion.setFromUnitVectors(DOWN, _v2);
  bone.updateMatrixWorld(true);
}

// Analytic two-bone IK in world space. `pole` is a world point the middle
// joint bends toward. `flex` says which way the joint is a hinge in the
// canonical pose: +1 for an elbow (the forearm folds toward the upper arm's
// +Z), -1 for a knee (the shin folds toward the thigh's -Z). Both bones are
// then turned about their own axes so that the bend happens about that hinge
// (the upper bone's local X), the way a real elbow or knee bends: no sideways
// kinks in the skin, and the joint's crease always faces into the bend.
// flex = 0 keeps the old minimal-rotation aim.
export function solveTwoBone(upper, lower, end, target, pole, flex = 0) {
  upper.parent.updateWorldMatrix(true, false);
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_S);
  lower.getWorldPosition(_E);
  end.getWorldPosition(_end);
  const a = _S.distanceTo(_E), b = _E.distanceTo(_end);
  _dir.subVectors(target, _S);
  let d = _dir.length();
  if (d < 1e-5 || a < 1e-5 || b < 1e-5) return;
  _dir.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  _pv.subVectors(pole, _S);
  _pv.addScaledVector(_dir, -_pv.dot(_dir));
  if (_pv.lengthSq() < 1e-10) {
    _pv.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
    if (_pv.lengthSq() < 1e-10) _pv.set(1, 0, 0);
  }
  _pv.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _E.copy(_S).addScaledVector(_dir, a * cosA).addScaledVector(_pv, a * sinA);
  _T.copy(_S).addScaledVector(_dir, d);
  if (!flex) {
    aimBone(upper, _v.subVectors(_E, _S));
    aimBone(lower, _v.subVectors(_T, _E));
    return;
  }
  // Hinge frames. u, l: the two bones' directions; the lower bone folds
  // toward `fold` (perpendicular to u). Upper: -Y along u, +Z = flex * fold.
  _hu.subVectors(_E, _S).normalize();
  _hl.subVectors(_T, _E).normalize();
  _hf.copy(_hl).addScaledVector(_hu, -_hl.dot(_hu));
  if (_hf.lengthSq() < 1e-8) _hf.copy(_pv).negate().addScaledVector(_hu, _pv.dot(_hu));   // straight: fold away from the pole side
  _hf.normalize().multiplyScalar(flex);
  _hy.copy(_hu).negate();
  _hx.crossVectors(_hy, _hf).normalize();
  setBoneWorld(upper, _hx, _hy, _hf);
  _hy.copy(_hl).negate();
  _hf.crossVectors(_hx, _hy).normalize();
  setBoneWorld(lower, _hx, _hy, _hf);
}
const _hu = new THREE.Vector3(), _hl = new THREE.Vector3(), _hf = new THREE.Vector3(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3();
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion();
function setBoneWorld(bone, x, y, z) {
  _hq.setFromRotationMatrix(_hm.makeBasis(x, y, z));
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq).multiply(_hq);
  bone.updateMatrixWorld(true);
}
Humanoid.all = [];
