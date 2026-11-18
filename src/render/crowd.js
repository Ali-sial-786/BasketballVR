// The crowd: instanced spectators built from the athlete model by
// tools/build_crowd.mjs. Every person has their own clothes, skin, hair and
// build, sits with a little idle sway, and gets to their feet with both arms
// up when the building swells. One draw call per level of detail.
import * as THREE from 'three';
import { NO_MIRROR } from './pipeline.js';

let DATA = null;
export async function loadCrowd(base = './assets/models/') {
  if (DATA) return DATA;
  try {
    const [meta, bin] = await Promise.all([
      fetch(base + 'crowd.json').then(r => { if (!r.ok) throw new Error('crowd.json ' + r.status); return r.json(); }),
      fetch(base + 'crowd.bin').then(r => { if (!r.ok) throw new Error('crowd.bin ' + r.status); return r.arrayBuffer(); }),
    ]);
    DATA = { meta, bin };
  } catch (error) { console.warn('Crowd model unavailable; the stands stay empty:', error.message || error); DATA = null; }
  return DATA;
}
export const crowdReady = () => !!DATA;

// Mostly the two teams' colours, then the neutrals and denim of any crowd.
const SHIRTS = [0x1f7f72, 0x1f7f72, 0x196b64, 0x2c8477, 0xc8744f, 0xb85a3e, 0xe9e2cf, 0xdedbd2, 0xcfd2d0, 0x23262d, 0x2b3a52, 0x7f878c, 0x5b6470, 0x8a3b3c, 0xb59a52, 0x4d6652, 0x5c4a68, 0x456a93, 0xb8b1a0, 0x34383f];
const TROUSERS = [0x2c3e5a, 0x3b4f73, 0x1d2230, 0x24262b, 0x6d6252, 0x8a7d66, 0x50545c, 0x2f3a33];
const SKINS = [0xf0c9a8, 0xe0b088, 0xc68e62, 0xa9744c, 0x7d5236, 0x5a3a26];
const HAIRS = [0x15110e, 0x2a1d14, 0x4a3524, 0x6b5136, 0x9a7a4e, 0x8d8a86, 0xc9c4bc];

function geometryFor(level) {
  const { meta, bin } = DATA, l = meta.lods[level], g = new THREE.BufferGeometry();
  const f32 = at => new Float32Array(bin, at, l.vCount * 3), i8 = at => new Int8Array(bin, at, l.vCount * 3), u8 = at => new Uint8Array(bin, at, l.vCount);
  g.setAttribute('position', new THREE.BufferAttribute(f32(l.posA), 3));
  g.setAttribute('posB', new THREE.BufferAttribute(f32(l.posB), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(i8(l.nrmA), 3, true));
  g.setAttribute('nrmB', new THREE.BufferAttribute(i8(l.nrmB), 3, true));
  // Region id and baked shade share one attribute: WebGL allows 16 slots and
  // the instance matrix and the per-person colours need most of them.
  const part = u8(l.part), shade = u8(l.shade), dress = new Float32Array(l.vCount * 2);
  for (let i = 0; i < l.vCount; i++) { dress[i * 2] = part[i]; dress[i * 2 + 1] = shade[i] / 255; }
  g.setAttribute('dress', new THREE.BufferAttribute(dress, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, l.index, l.iCount), 1));
  // Covers the seated and the standing, arms-up pose.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.55, 0.1), 1.7); g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.9, -0.6, -0.6), new THREE.Vector3(0.9, 1.9, 0.9));
  return g;
}

function material(uniforms) {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 posB; attribute vec3 nrmB; attribute vec2 dress; varying vec3 vCrowd;
        attribute vec3 iShirt; attribute vec3 iTrousers; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iStyle;
        uniform float uCheer; uniform float uCrowdTime;
        // 0 seated, 1 on their feet. Keener fans are up first and stay up longest.
        float crowdStand() {
          float keen = fract(iStyle.z * 7.31);
          return smoothstep(keen * 0.82, keen * 0.82 + 0.2, uCheer);
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        {
          vec3 c = iSkin; float part = dress.x;
          if (part > 7.5) c = iSkin * vec3(0.86, 0.72, 0.7);
          else if (part > 6.5) c = iStyle.y > 0.5 ? iTrousers : iSkin;
          else if (part > 5.5) c = iStyle.x > 1.5 ? iShirt : iSkin;
          else if (part > 4.5) c = iStyle.x > 0.5 ? iShirt : iSkin;
          else if (part > 3.5) c = vec3(iStyle.w);
          else if (part > 2.5) c = iHair;
          else if (part > 1.5) c = iTrousers;
          else if (part > 0.5) c = iShirt;
          // The stands sit outside the pool of light on the floor.
          vCrowd = c * dress.y * 0.82;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float crowdUp = crowdStand();
        objectNormal = normalize(mix(objectNormal, nrmB, crowdUp));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float seed = iStyle.z * 40.0, lift = max(transformed.y, 0.0);
          transformed = mix(transformed, posB, crowdUp);
          // Seated: shift and breathe. Standing: bounce and pump the arms.
          transformed.x += (1.0 - crowdUp) * sin(uCrowdTime * (0.5 + fract(seed) * 0.5) + seed) * 0.014 * lift;
          transformed.y += crowdUp * (0.05 * abs(sin(uCrowdTime * (5.5 + fract(seed * 1.7) * 3.0) + seed)) + 0.05 * step(1.3, posB.y) * sin(uCrowdTime * 9.0 + seed));
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrowd;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vCrowd;');
  };
  m.customProgramCacheKey = () => 'rimrun-crowd-v2';
  return m;
}

export class Crowd {
  // full: detailed lower rows. Otherwise every spectator uses the light mesh.
  setDetail(full) { for (const m of this.meshes) { if (m.userData.group === 'near') m.visible = full; if (m.userData.group === 'nearLight') m.visible = !full; } }
  // seats: [{ x, y, z, yaw, row }] with y at the floor of that row.
  constructor(scene, seats, uniforms, nearRows = 2) {
    this.meshes = [];
    if (!DATA) return;
    let seed = 4219; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = list => list[Math.floor(random() * list.length)];
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
    const shared = material(uniforms);
    // The lower rows exist at both levels of detail so a headset can drop to the light one.
    const near = seats.filter(s => s.row <= nearRows);
    for (const [level, people, group] of [[0, near, 'near'], [1, near, 'nearLight'], [1, seats.filter(s => s.row > nearRows), 'far']]) {
      if (!people.length) continue;
      const geometry = geometryFor(level), mesh = new THREE.InstancedMesh(geometry, shared, people.length);
      const shirt = new Float32Array(people.length * 3), trousers = new Float32Array(people.length * 3), skin = new Float32Array(people.length * 3), hair = new Float32Array(people.length * 3), style = new Float32Array(people.length * 4);
      people.forEach((p, i) => {
        // Children, tall people, slight and broad builds; everyone faces the floor with a little turn of their own.
        const kit = p.kit, child = !kit?.adult && random() < 0.07, height = child ? 0.7 + random() * 0.12 : 0.93 + random() * 0.14, width = height * (0.92 + random() * 0.2);
        q.setFromAxisAngle(up, p.yaw + (random() - 0.5) * 0.3);
        matrix.compose(new THREE.Vector3(p.x, p.y + DATA.meta.seat, p.z), q, new THREE.Vector3(width, height, width)); mesh.setMatrixAt(i, matrix);
        const tone = pick(SKINS), cap = !kit && random() < 0.13, bald = !cap && random() < 0.06, shirtColor = kit?.shirt ?? pick(SHIRTS);
        color.setHex(shirtColor).toArray(shirt, i * 3); color.setHex(kit?.trousers ?? pick(TROUSERS)).toArray(trousers, i * 3); color.setHex(tone).toArray(skin, i * 3);
        color.setHex(cap ? pick(SHIRTS) : bald ? tone : pick(HAIRS)).toArray(hair, i * 3);
        const sleeves = random(), longTrousers = kit ? kit.long : random() < 0.82;
        style.set([kit ? kit.sleeves : sleeves < 0.12 ? 0 : sleeves < 0.68 ? 1 : 2, longTrousers ? 1 : 0, random(), random() < 0.45 ? 0.75 : 0.08], i * 4);
      });
      for (const [name, array, size] of [['iShirt', shirt, 3], ['iTrousers', trousers, 3], ['iSkin', skin, 3], ['iHair', hair, 3], ['iStyle', style, 4]]) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, size));
      mesh.instanceMatrix.needsUpdate = true; mesh.name = `crowd-lod${level}`; mesh.matrixAutoUpdate = false;
      // Only the lower rows are close enough to the floor to appear in its reflection.
      if (group === 'far') mesh.layers.set(NO_MIRROR);
      if (group === 'nearLight') mesh.visible = false;
      mesh.userData.group = group; scene.add(mesh); this.meshes.push(mesh);
    }
  }
}
