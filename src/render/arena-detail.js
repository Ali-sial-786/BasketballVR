// The things that make a hall read as an arena: LED ribbon boards, courtside
// seats, team benches and the scorer's table, suites, lighting rigs with
// haze, speaker clusters, and a broadcast-style stanchion. All procedural;
// opaque props are merged with the rest of the venue by Arena.batchStatic().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { material, mesh, box, cylinderBetween, canvasTexture } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HOME = { shirt: 0x196b64, trousers: 0x164e4a }, AWAY = { shirt: 0xc45d3e, trousers: 0x973f30 };
const hdr = (hex, gain) => new THREE.Color(hex).multiplyScalar(gain);

// Scrolling LED boards. The texture repeats along the board, so the lettering
// is crisp at any length; Arena.update() slides it.
export function ribbons(arena) {
  const { scene } = arena;
  const strip = (words, background, ink, accent) => {
    const t = canvasTexture(2048, 96, (c, w, h) => {
      c.fillStyle = background; c.fillRect(0, 0, w, h);
      // The faint pixel grid of an LED panel.
      c.fillStyle = '#00000030'; for (let x = 0; x < w; x += 4) c.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
      c.textBaseline = 'middle'; c.font = 'italic 900 50px Arial';
      // Space the words evenly so the strip tiles without a seam.
      const widths = words.map(word => c.measureText(word).width), gap = (w - widths.reduce((a, b) => a + b, 0)) / words.length;
      let x = gap / 2;
      for (const [i, word] of words.entries()) {
        c.fillStyle = i % 2 ? accent : ink; c.fillText(word, x, h / 2 + 3, widths[i]); x += widths[i] + gap;
        c.fillStyle = accent; c.beginPath(); c.arc(x - gap / 2, h / 2, 6, 0, 7); c.fill();
      }
    });
    t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  };
  const lower = strip(['RIMRUN', 'THE FIELDHOUSE', 'ALL HEART', 'ALL HOOPS', 'OWN THE COURT'], '#0b2c38', '#f3e3c0', '#ffb47d');
  const upper = strip(['THE FIELDHOUSE', 'PICKUP LEAGUE', 'EST. 2026', 'PLAY WITH FEELING'], '#101c2a', '#9fd8c8', '#f3e3c0');
  arena.ribbonTextures = [lower, upper];
  const board = (texture, length, height, position, rotation, gain) => {
    const map = texture.clone(); map.repeat.set(length / 14, 1); map.needsUpdate = true; arena.ribbonTextures.push(map);
    const m = mesh(new THREE.PlaneGeometry(length, height), new THREE.MeshBasicMaterial({ map, color: hdr(0xffffff, gain), toneMapped: false }), scene, position);
    m.rotation.y = rotation; return m;
  };
  for (const side of [-1, 1]) {
    board(lower, 36, 0.72, [side * 10.26, 1.36, 6], -side * Math.PI / 2, 1.5);
    board(upper, 38, 0.6, [side * 20.72, 6.5, 6], -side * Math.PI / 2, 1.15).layers.set(arena.noMirror);
    box(scene, [0.5, 0.9, 38], [side * 21.0, 6.45, 6], arena.palette.steel).userData.noMirror = true;
  }
  for (const end of [-1, 1]) {
    board(lower, 21, 0.72, [0, 1.36, 6 + end * 17.56], end > 0 ? Math.PI : 0, 1.5);
    board(upper, 23, 0.6, [0, 6.5, 6 + end * 27.62], end > 0 ? Math.PI : 0, 1.15).layers.set(arena.noMirror);
    box(scene, [23, 0.9, 0.5], [0, 6.45, 6 + end * 27.9], arena.palette.steel).userData.noMirror = true;
  }
}

// Courtside: a row of folding chairs round the floor, the two team benches,
// and the scorer's table. Returns the seats for the crowd to fill.
export function courtside(arena) {
  const { scene } = arena, seats = [], chairs = [];
  const sit = (x, z, yaw, kit = null) => { chairs.push({ x, z, yaw }); seats.push({ x, y: 0, z, yaw, row: 0, kit }); };
  const row = (from, to, fixed, along, yaw, kit = null, skip = () => false) => { for (let v = from; v <= to + 1e-6; v += 0.62) if (!skip(v)) along === 'z' ? sit(fixed, v, yaw, kit) : sit(v, fixed, yaw, kit); };
  // Fans down the far sideline and behind both baselines.
  row(-9.2, 21.2, 9.15, 'z', -Math.PI / 2, null, z => Math.abs(z - 6) < 0.9);
  for (const [z, yaw] of [[-9.6, 0], [21.6, Math.PI]]) row(-7.2, 7.2, z, 'x', yaw, null, x => Math.abs(x) < 1.7);
  // Benches either side of the table: reserves in warm-ups, a coach on the end.
  const reserve = team => ({ ...team, sleeves: 2, long: true, adult: true });
  row(-7.4, -1.2, -9.15, 'z', Math.PI / 2, reserve(HOME)); row(13.2, 19.4, -9.15, 'z', Math.PI / 2, reserve(AWAY));
  const official = { shirt: 0x8f979c, trousers: 0x20232b, sleeves: 1, long: true, adult: true };
  row(1.6, 10.4, -9.72, 'z', Math.PI / 2, official, z => Math.round((z - 1.6) / 0.62) % 2 === 1);
  // The table: a long desk with an LED face toward the floor.
  box(scene, [0.62, 0.74, 9.6], [-9.2, 0.37, 6], material(0x121c25, { roughness: 0.5 })).castShadow = true;
  box(scene, [0.7, 0.04, 9.7], [-9.2, 0.76, 6], material(0x202d38, { roughness: 0.35, metalness: 0.3 }));
  const face = arena.ribbonTextures[0].clone(); face.repeat.set(9.6 / 14, 1); face.needsUpdate = true; arena.ribbonTextures.push(face);
  mesh(new THREE.PlaneGeometry(9.6, 0.6), new THREE.MeshBasicMaterial({ map: face, color: hdr(0xffffff, 1.5), toneMapped: false }), scene, [-8.885, 0.4, 6]).rotation.y = Math.PI / 2;
  // Folding chairs, one draw call.
  const parts = [new THREE.BoxGeometry(0.46, 0.05, 0.44), new THREE.BoxGeometry(0.46, 0.38, 0.045)];
  parts[0].translate(0, 0.44, 0); parts[1].translate(0, 0.72, -0.2);
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) { const leg = new THREE.BoxGeometry(0.03, 0.44, 0.03); leg.translate(x, 0.22, z); parts.push(leg); }
  const chair = new THREE.InstancedMesh(mergeGeometries(parts), material(0x1a2733, { roughness: 0.7 }), chairs.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  chairs.forEach((c, i) => { q.setFromAxisAngle(V(0, 1, 0), c.yaw); matrix.compose(V(c.x, 0, c.z), q, V(1, 1, 1)); chair.setMatrixAt(i, matrix); });
  chair.castShadow = true; chair.name = 'courtside-chairs'; scene.add(chair);
  return seats;
}

// Suites and the upper wall: a band of glass-fronted boxes with warm light
// and people in them, and acoustic panelling above, so the building has
// somewhere to go beyond the lower bowl.
export function suites(arena) {
  const { scene } = arena;
  let seed = 311; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const glass = canvasTexture(1024, 256, (c, w, h) => {
    c.fillStyle = '#0c141d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const x = i * 256 + 10, lit = random() > 0.12;
      const g = c.createLinearGradient(0, 40, 0, h - 30); g.addColorStop(0, lit ? '#f1c98f' : '#1b2733'); g.addColorStop(1, lit ? '#8e5f39' : '#121a24');
      c.fillStyle = g; c.fillRect(x, 44, 236, h - 84);
      // Guests at the rail and a doorway of light behind them.
      if (lit) {
        c.fillStyle = '#fff0cf'; c.fillRect(x + 150 + random() * 40, 60, 34, 90);
        c.fillStyle = '#1a1512'; for (let p = 0; p < 5; p++) { const px = x + 22 + p * 44 + random() * 14, tall = 62 + random() * 26; c.beginPath(); c.arc(px, h - 40 - tall, 9, 0, 7); c.fill(); c.fillRect(px - 12, h - 40 - tall + 8, 24, tall); }
      }
      c.fillStyle = '#060a0f'; c.fillRect(x, h - 46, 236, 8); c.fillRect(x + 117, 44, 3, h - 84);
    }
    c.fillStyle = '#19232e'; c.fillRect(0, 0, w, 30); c.fillRect(0, h - 30, w, 30);
  });
  glass.wrapS = THREE.RepeatWrapping; glass.anisotropy = 4;
  const panels = canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#16222f'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { c.fillStyle = `hsl(212 34% ${11 + random() * 4}%)`; c.fillRect(x + 3, 0, 58, h); c.fillStyle = '#0c131b'; c.fillRect(x, 0, 3, h); }
    c.fillStyle = '#0d151e'; for (let y = 0; y < h; y += 128) c.fillRect(0, y, w, 4);
  });
  panels.wrapS = panels.wrapT = THREE.RepeatWrapping;
  const band = (length, position, rotation) => {
    const windows = glass.clone(); windows.repeat.set(length / 9, 1); windows.needsUpdate = true;
    const a = mesh(new THREE.PlaneGeometry(length, 2.5), new THREE.MeshBasicMaterial({ map: windows, color: hdr(0xffffff, 1.05), toneMapped: false }), scene, [position[0], 8.55, position[1]]);
    const wall = panels.clone(); wall.repeat.set(length / 6, 1.4); wall.needsUpdate = true;
    const b = mesh(new THREE.PlaneGeometry(length, 7.8), new THREE.MeshStandardMaterial({ map: wall, roughness: 0.92, envMapIntensity: 0.2 }), scene, [position[0], 13.9, position[1]]);
    for (const m of [a, b]) { m.rotation.y = rotation; m.layers.set(arena.noMirror); }
  };
  for (const side of [-1, 1]) band(59, [side * 22.7, 6], -side * Math.PI / 2);
  band(45, [0, -23.7], 0); band(45, [0, 35.7], Math.PI);
}

// Lighting: a truss ring of spot fixtures over the floor (bright enough to
// bloom), faint shafts in the haze beneath them, and four speaker clusters.
export function rigging(arena) {
  const { scene } = arena, steel = arena.palette.steel, y = 13.2;
  const ring = [[-8.6, -9.4, 8.6, -9.4], [-8.6, 21.4, 8.6, 21.4], [-8.6, -9.4, -8.6, 21.4], [8.6, -9.4, 8.6, 21.4]];
  const spots = [];
  for (const [x1, z1, x2, z2] of ring) {
    for (const lift of [0, 0.45]) cylinderBetween(scene, V(x1, y + lift, z1), V(x2, y + lift, z2), 0.045, steel).userData.noMirror = true;
    const length = Math.hypot(x2 - x1, z2 - z1), count = Math.round(length / 1.45);
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (i < count) cylinderBetween(scene, V(x, y + (i % 2 ? 0.45 : 0), z), V(x1 + (x2 - x1) * (i + 1) / count, y + (i % 2 ? 0 : 0.45), z1 + (z2 - z1) * (i + 1) / count), 0.022, steel, 5).userData.noMirror = true;
      if (i % 2 === 0) spots.push([x, y - 0.22, z]);
    }
  }
  for (const x of [-8.6, 8.6]) for (const z of [-9.4, 6, 21.4]) cylinderBetween(scene, V(x, y + 0.45, z), V(x, 17.9, z), 0.03, steel, 5).userData.noMirror = true;
  // Fixture cans and their lenses.
  const can = new THREE.CylinderGeometry(0.15, 0.19, 0.3, 10), lens = new THREE.CircleGeometry(0.165, 14); lens.rotateX(Math.PI / 2);
  const cans = new THREE.InstancedMesh(can, material(0x0d1218, { roughness: 0.5, metalness: 0.5 }), spots.length);
  const lenses = new THREE.InstancedMesh(lens, new THREE.MeshBasicMaterial({ color: hdr(0xfff3df, 7), toneMapped: false }), spots.length), matrix = new THREE.Matrix4();
  spots.forEach(([x, sy, z], i) => { cans.setMatrixAt(i, matrix.makeTranslation(x, sy, z)); lenses.setMatrixAt(i, matrix.makeTranslation(x, sy - 0.16, z)); });
  cans.layers.set(arena.noMirror); scene.add(cans, lenses);
  // Haze: a few open cones of faint additive light, widest at the floor.
  const shaft = new THREE.CylinderGeometry(0.25, 3.4, y - 0.4, 20, 1, true); shaft.translate(0, -(y - 0.4) / 2, 0);
  const haze = new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.007, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  arena.haze = [];
  for (const [x, sy, z] of spots.filter((_, i) => i % 5 === 2)) { const cone = mesh(shaft, haze, scene, [x, sy - 0.2, z]); cone.rotation.z = -Math.sign(x) * 0.2; cone.rotation.x = z < 6 ? 0.12 : -0.12; cone.layers.set(arena.noMirror); cone.renderOrder = 5; arena.haze.push(cone); }
  // Line-array speakers at the four corners of the ring.
  for (const x of [-7.2, 7.2]) for (const z of [-7, 19]) {
    for (let i = 0; i < 6; i++) { const cabinet = box(scene, [0.9, 0.3, 0.55], [x, 12.4 - i * 0.32, z + Math.sign(z - 6) * i * 0.04], material(0x0e1319, { roughness: 0.6 })); cabinet.rotation.x = Math.sign(z - 6) * i * 0.05; cabinet.userData.noMirror = true; }
    cylinderBetween(scene, V(x, 12.6, z), V(x, 17.9, z), 0.02, steel, 5).userData.noMirror = true;
  }
}

// A broadcast stanchion: padded base unit behind the baseline, a boxed arm
// reaching out to the glass, a brace, and padding along the bottom of the board.
export function stanchion(arena, z, facing = 1) {
  const { scene } = arena, b = CONFIG.board, pad = material(0x143642, { roughness: 0.75 }), steel = arena.palette.steel;
  const at = d => z - facing * d;                      // d metres behind the glass
  const base = box(scene, [1.25, 1.15, 1.5], [0, 0.575, at(2.25)], pad); base.castShadow = true;
  box(scene, [1.35, 0.08, 1.6], [0, 0.04, at(2.25)], steel);
  box(scene, [0.5, 1.9, 0.14], [0, 1.25, at(1.46)], pad).castShadow = true;                 // front crash pad
  const arm = cylinderBetween(scene, V(0, 1.2, at(2.1)), V(0, b.y + 0.12, at(0.12)), 0.11, steel, 6); arm.scale.x = 1.5; arm.castShadow = true;
  cylinderBetween(scene, V(0, 1.15, at(2.7)), V(0, b.y - 0.05, at(0.9)), 0.06, steel, 6);
  for (const x of [-0.42, 0.42]) cylinderBetween(scene, V(x, b.y + 0.3, at(0.03)), V(0, b.y + 0.18, at(0.75)), 0.03, steel, 5);
  box(scene, [b.width + 0.04, 0.09, 0.09], [0, b.y - b.height / 2 - 0.02, z + facing * 0.012], pad);   // board padding
  for (const x of [-b.width / 2 - 0.005, b.width / 2 + 0.005]) box(scene, [0.06, 0.34, 0.09], [x, b.y - b.height / 2 + 0.13, z + facing * 0.012], pad);
}
