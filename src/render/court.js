import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { applyClip } from './clips.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, RACKS } from '../config.js';
import { material, mesh, box, cylinderBetween, canvasTexture, label, makeBall } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const palette = { steel: material(0x293b40), concrete: material(0xa89a89), cream: material(0xf8e9c5), coral: material(0xde7d5c), teal: material(0x327b77) };

export class Court {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer; this.flash = 0; this.netTime = 0; this.rackBalls = []; this.spectators = [];
    scene.background = new THREE.Color(0xb8949d); scene.fog = new THREE.Fog(0xc59b97, 38, 150);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#555e86') }, bottom: { value: new THREE.Color('#f6bc91') } },
      vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){float h=clamp(normalize(vP).y*1.5,0.,1.); gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' }));
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0xffedda, 0x556e75, 2.2));
    const sun = new THREE.DirectionalLight(0xffd2a0, 3.0); sun.position.set(-15, 24, -15); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
    sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0002; scene.add(sun);
    const rimLight = new THREE.DirectionalLight(0xb5dcfa, 1); rimLight.position.set(10, 8, 5); scene.add(rimLight);
    const sunDisk = mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffdbab, fog: false }), scene, [-48, 23, -100]);
    sunDisk.scale.z = 0.1;
    const ground = mesh(new THREE.PlaneGeometry(300, 300), material(0x9c8d86), scene, [0, -0.18, 0]); ground.rotation.x = -Math.PI / 2;
    box(scene, [18.8, 0.25, 20.2], [0, -0.12, -0.1], palette.concrete).receiveShadow = true;
    this.floor(); this.hoop(); this.fence(); this.environment(); this.racks();
    this.drawScore({ score: [0, 0], mode: 'preview', shotClock: 18, contestTime: 70 });
    this.batchStatic();
  }
  floor() {
    const texture = canvasTexture(2048, 2048, (c, w, h) => {
      const sx = w / 15, sz = h / 15.5;
      const x = n => (n + 7.5) * sx, z = n => (n + 8) * sz;
      c.fillStyle = '#39716f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ce805f'; c.fillRect(x(-7.2), z(-7.7), 14.4 * sx, 14.9 * sz);
      c.fillStyle = '#d68b66'; c.fillRect(x(-6.6), z(-7.7), 13.2 * sx, 13.6 * sz);
      c.fillStyle = '#377977'; c.beginPath(); c.arc(x(0), z(-6.1), 6.75 * sx, 0.212, Math.PI - 0.212); c.lineTo(x(-6.6), z(-7.7)); c.lineTo(x(6.6), z(-7.7)); c.closePath(); c.fill();
      c.fillStyle = '#d6926e'; c.fillRect(x(-2.45), z(-7.7), 4.9 * sx, 6.2 * sz);
      // A little aggregate makes the painted asphalt read at hand height.
      for (let i = 0; i < 95000; i++) { c.fillStyle = i % 2 ? '#ffffff09' : '#00000008'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.strokeStyle = '#f4e9cb'; c.lineWidth = sx * 0.045;
      c.strokeRect(x(-7.2), z(-7.7), 14.4 * sx, 14.9 * sz);
      c.strokeRect(x(-2.45), z(-7.7), 4.9 * sx, 6.2 * sz);
      const ellipseArc = (cx, cz, r, a, b) => { c.beginPath(); c.ellipse(x(cx), z(cz), r * sx, r * sz, 0, a, b); c.stroke(); };
      ellipseArc(0, -6.1, 6.75, 0.212, Math.PI - 0.212);
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(x(side * 6.6), z(-7.7)); c.lineTo(x(side * 6.6), z(-4.686)); c.stroke(); }
      ellipseArc(0, -1.5, 1.8, 0, Math.PI); c.setLineDash([0.15 * sx, 0.15 * sx]); ellipseArc(0, -1.5, 1.8, Math.PI, Math.PI * 2); c.setLineDash([]);
      ellipseArc(0, -6.1, 1.25, 0, Math.PI);
      for (const side of [-1, 1]) for (const lane of [-5.5, -4.5, -3.5, -2.5]) { c.beginPath(); c.moveTo(x(side * 2.45), z(lane)); c.lineTo(x(side * 2.75), z(lane)); c.stroke(); }
      c.fillStyle = '#eee3be'; c.textAlign = 'center'; c.font = 'italic 900 94px Arial'; c.fillText('RIMRUN', x(0), z(4.5));
      c.font = '500 25px Arial'; c.fillText('P L A Y   W I T H   F E E L I N G', x(0), z(5.05));
      c.save(); c.translate(x(-6.96), z(0)); c.rotate(-Math.PI / 2); c.font = '900 32px Arial'; c.fillText('THE NEIGHBORHOOD', 0, 0); c.restore();
      c.save(); c.translate(x(6.96), z(0)); c.rotate(Math.PI / 2); c.font = '900 32px Arial'; c.fillText('RUN IT BACK / COURT 01', 0, 0); c.restore();
    });
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const floor = mesh(new THREE.PlaneGeometry(15, 15.5), material(0xffffff, { map: texture }), this.scene, [0, 0.012, -0.25]);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    // Perimeter stripes and curb.
    for (const x of [-9.2, 9.2]) box(this.scene, [0.16, 0.16, 20], [x, 0.01, -0.1], palette.cream);
  }
  hoop() {
    const scene = this.scene, h = CONFIG.hoop, b = CONFIG.board;
    box(scene, [0.85, 0.18, 1.1], [0, 0.04, -8.7], palette.steel);
    cylinderBetween(scene, V(0, 0.15, -8.7), V(0, 3.8, -8.7), 0.11, palette.steel);
    cylinderBetween(scene, V(0, 3.8, -8.7), V(0, 3.6, b.z), 0.08, palette.steel);
    const pad = box(scene, [0.45, 1.7, 0.4], [0, 0.94, -8.7], palette.teal); pad.castShadow = true;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xb6e3df, transparent: true, opacity: 0.26, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    box(scene, [b.width, b.height, 0.035], [0, b.y, b.z], glass);
    for (const x of [-0.91, 0.91]) box(scene, [0.045, b.height + 0.05, 0.05], [x, b.y, b.z], palette.cream);
    for (const y of [b.y - b.height / 2, b.y + b.height / 2]) box(scene, [b.width, 0.045, 0.05], [0, y, b.z], palette.cream);
    for (const x of [-0.29, 0.29]) box(scene, [0.025, 0.43, 0.045], [x, 3.25, b.z + 0.025], palette.cream);
    for (const y of [3.035, 3.465]) box(scene, [0.6, 0.025, 0.045], [0, y, b.z + 0.025], palette.cream);
    box(scene, [0.18, 0.06, 0.25], [0, h.y, b.z + 0.11], palette.coral);
    this.rimMaterial = material(0xff642c, { metalness: 0.35, roughness: 0.35, emissive: 0xff6a25, emissiveIntensity: 0.08 });
    const rim = mesh(new THREE.TorusGeometry(h.radius, h.tube, 8, 48), this.rimMaterial, scene, [0, h.y, h.z]); rim.rotation.x = Math.PI / 2;
    this.net = new THREE.Group(); this.net.position.set(0, h.y, h.z); scene.add(this.net);
    const points = [];
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      for (let row = 0; row < 4; row++) {
        const y1 = -row * 0.12, y2 = -(row + 1) * 0.12, r1 = 0.225 - row * 0.024, r2 = r1 - 0.024;
        for (const side of [-1, 1]) { const a1 = angle + (row % 2 ? Math.PI / 16 : 0), a2 = a1 + side * Math.PI / 16;
          points.push(Math.cos(a1) * r1, y1, Math.sin(a1) * r1, Math.cos(a2) * r2, y2, Math.sin(a2) * r2); }
      }
    }
    this.net.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color: 0xf7ecd4, transparent: true, opacity: 0.9 })));
    // Physical scoreboard is readable inside the headset.
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 1024; this.boardCanvas.height = 320;
    this.boardTexture = new THREE.CanvasTexture(this.boardCanvas); this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    box(scene, [4.8, 1.58, 0.15], [0, 5.7, -9.3], palette.steel);
    mesh(new THREE.PlaneGeometry(4.65, 1.45), new THREE.MeshBasicMaterial({ map: this.boardTexture }), scene, [0, 5.7, -9.21]);
    for (const x of [-1.8, 1.8]) cylinderBetween(scene, V(x, 0, -9.4), V(x, 6.5, -9.4), 0.06, palette.steel);
  }
  fence() {
    const scene = this.scene, lines = [], col = new THREE.LineBasicMaterial({ color: 0x3c5556, transparent: true, opacity: 0.43 });
    const fence = (a, b, height) => {
      const len = a.distanceTo(b), d = b.clone().sub(a).normalize();
      for (let u = 0; u <= len; u += 2.5) { const p = a.clone().addScaledVector(d, u); cylinderBetween(scene, p, p.clone().add(V(0, height, 0)), 0.045, palette.steel); }
      for (const y of [0.1, height]) cylinderBetween(scene, a.clone().add(V(0, y, 0)), b.clone().add(V(0, y, 0)), 0.035, palette.steel);
      for (let u = -height; u < len; u += 0.24) for (const sign of [-1, 1]) {
        const lo = Math.max(0, -u), hi = Math.min(height, len - u);
        if (hi <= lo) continue;
        const p1 = a.clone().addScaledVector(d, u + lo), p2 = a.clone().addScaledVector(d, u + hi);
        p1.y = sign > 0 ? lo : height - lo; p2.y = sign > 0 ? hi : height - hi; lines.push(...p1.toArray(), ...p2.toArray());
      }
    };
    fence(V(-9, 0, -9.8), V(9, 0, -9.8), 3.1);
    fence(V(-9, 0, -9.8), V(-9, 0, 9.5), 2.6); fence(V(9, 0, -9.8), V(9, 0, 9.5), 2.6);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); scene.add(new THREE.LineSegments(geo, col));
    label(scene, 'NEXT GAME IS YOURS.', 4.4, 1.05, [-5.7, 1.7, -9.7], { background: '#295651', color: '#f4e7c6', font: 'italic 900 78px Arial' });
    label(scene, 'RIMRUN  /  LOCAL LEGENDS', 4.1, 0.75, [5.8, 1.7, -9.7], { background: '#cf7655', color: '#fff0cf', font: '900 59px Arial' });
  }
  environment() {
    const scene = this.scene;
    const cityMaterials = Array.from({ length: 6 }, (_, i) => material(new THREE.Color().setHSL(0.02 + i * 0.012, 0.12, 0.32 + i * 0.02)));
    let seed = 19; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const windowGeo = new THREE.PlaneGeometry(0.48, 0.72), windowMat = new THREE.MeshBasicMaterial({ color: 0xffd799 });
    const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, 2400); let count = 0;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 34; i++) {
      const x = (i % 17 - 8) * 7.8, z = i < 17 ? -35 - rand() * 8 : -64 - rand() * 13;
      const w = 4.5 + rand() * 3.5, h = 7 + rand() * (i < 17 ? 14 : 24), depth = 5 + rand() * 4;
      const mat = cityMaterials[Math.floor(rand() * cityMaterials.length)];
      box(scene, [w, h, depth], [x, h / 2 - 0.2, z], mat);
      box(scene, [w + 0.3, 0.3, depth + 0.3], [x, h - 0.15, z], palette.steel);
      if (i % 3 === 0) box(scene, [1.1, 1.6, 1.1], [x, h + 0.75, z], palette.steel);
      for (let y = 2; y < h - 1; y += 2) for (let wx = -w / 2 + 0.8; wx < w / 2 - 0.4; wx += 1.25) if (rand() > 0.4 && count < 2400) {
        matrix.makeTranslation(x + wx, y, z + depth / 2 + 0.02); windowMesh.setMatrixAt(count++, matrix);
      }
    }
    windowMesh.count = count; scene.add(windowMesh);
    // Nearby low buildings ground the court in a real neighborhood.
    for (const side of [-1, 1]) {
      const building = box(scene, [7, 8.5, 12], [side * 19, 4, -12], material(side > 0 ? 0x967a75 : 0x6c777b));
      box(scene, [7.4, 0.25, 12.3], [side * 19, 8.3, -12], palette.cream);
      for (let i = 0; i < 4; i++) box(scene, [0.08, 7, 0.12], [side * 16, 4.5, -16 + i * 2.2], palette.steel);
      building.receiveShadow = true;
    }
    for (const [x, z] of [[-11, -10], [11.4, -11], [-13, 6], [13, 6], [24, -20], [-25, -22]]) this.palm(x, z, 6.5 + rand() * 2);
    for (const side of [-1, 1]) {
      // Floodlight poles and glowing panels; the sun provides the actual light.
      for (const z of [-6, 7]) {
        cylinderBetween(scene, V(side * 9.5, 0, z), V(side * 9.5, 7.5, z), 0.07, palette.steel);
        box(scene, [1.1, 0.28, 0.5], [side * 9.2, 7.5, z], palette.steel);
        box(scene, [0.95, 0.035, 0.38], [side * 9.2, 7.34, z], material(0xffecd5, { emissive: 0xffc999, emissiveIntensity: 1.5 }));
      }
      for (const z of [-3, 3.3]) {
        box(scene, [1, 0.12, 3], [side * 10.5, 0.55, z], material(0xa3664e));
        box(scene, [0.1, 0.7, 3], [side * 11, 0.9, z], palette.steel);
        for (const end of [-1, 1]) box(scene, [0.7, 0.5, 0.08], [side * 10.5, 0.25, z + end * 1.1], palette.steel);
      }
      for (let i = 0; i < 7; i++) this.spectator(side * (10.5 + (i > 3 ? 1.3 : 0)), -5 + i * 1.5, side, i);
      // Planters, a sports bag, and spare balls.
      box(scene, [1, 0.6, 1], [side * 10.5, 0.3, 8], palette.steel);
      const bush = mesh(new THREE.IcosahedronGeometry(0.8, 1), material(0x466858), scene, [side * 10.5, 0.85, 8]); bush.scale.y = 0.7;
    }
    const bag = box(scene, [0.7, 0.35, 0.4], [8.2, 0.2, 4], palette.steel); bag.rotation.y = 0.4;
    const spare = makeBall(); spare.position.set(8.1, 0.13, 4.7); scene.add(spare);
    label(scene, 'SUNSET PARK', 5.5, 1.2, [0, 0.025, 8.7], { color: '#eee0c0', font: '900 90px Arial' }).rotation.x = -Math.PI / 2;
  }
  palm(x, z, h) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.scene.add(group);
    cylinderBetween(group, V(0, 0, 0), V(0.4, h, 0), 0.12, material(0x766454));
    const leafmat = material(0x46695e, { side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, points = [];
      for (let k = 0; k < 6; k++) {
        const t = k / 5, next = (k + 1) / 5;
        const center = s => V(0.4 + Math.cos(a) * s * 2.7, h + Math.sin(s * Math.PI) * 0.8 - s * 0.65, Math.sin(a) * s * 2.7);
        const p = center(t), q = center(next), wide = 0.32 * Math.sin(t * Math.PI);
        const left = p.clone().add(V(-Math.sin(a) * wide, 0, Math.cos(a) * wide)), right = p.clone().add(V(Math.sin(a) * wide, 0, -Math.cos(a) * wide));
        points.push(...left.toArray(), ...right.toArray(), ...q.toArray());
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.computeVertexNormals(); mesh(g, leafmat, group);
    }
  }
  spectator(x, z, side, i) {
    const h = new Humanoid({team: i % 2 ? 'home' : 'away', headgear: 'bare', seed: i * 17 + side, scale: 0.94 + i % 3 * 0.035});
    h.setNumber(0); h.setLod(1);
    const u = h.material.userData.uniforms;
    u.uKit1.value.setHex([0x698477, 0xc58c66, 0xa8b59b, 0x687482][i % 4]);
    u.uKit4.value.setHex(i % 2 ? 0x344842 : 0x6a6253); u.uPanel.value.copy(u.uKit1.value);
    h.root.position.set(x, 0, z); h.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.scene.add(h.root); const seated = i % 3 === 0; applyClip(h, i % 4 === 0 ? 'idle_fold_arms' : 'idle', i * 0.3);
    if (seated) {
      h.bones.hips.position.y -= 0.32; h.rot('spine', 0.08); h.update();
      for (const hand of ['L','R']) { const sign = hand === 'L' ? 1 : -1;
        h.ikLeg(hand, h.root.localToWorld(V(sign * 0.17, h.ankleHeight, 0.38)), h.root.localToWorld(V(sign * 0.2, 0.5, 0.7)));
        h.ikArm(hand, h.root.localToWorld(V(sign * 0.23, 0.65, 0.3)), h.root.localToWorld(V(sign * 0.4, 0.9, 0.05)));
      }
    }
    h.update(); this.spectators.push(h);
  }
  racks() {
    this.rackGroup = new THREE.Group(); this.scene.add(this.rackGroup); this.rackGroup.visible = false;
    this.rackMarks = [];
    RACKS.forEach((r, ri) => {
      const g = new THREE.Group(); g.position.set(r.x, 0, r.z); g.rotation.y = Math.atan2(-r.x, CONFIG.hoop.z - r.z); this.rackGroup.add(g);
      const marker = mesh(new THREE.RingGeometry(0.45, 0.49, 48), new THREE.MeshBasicMaterial({ color: ri === 2 ? 0xffc766 : 0xf5e9d0, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), g, [0, 0.025, 0]); marker.rotation.x = -Math.PI / 2; this.rackMarks.push(marker);
      const rack = new THREE.Group(); rack.position.set(-0.95, 0, -0.3); g.add(rack);
      for (const x of [-0.16, 0.16]) cylinderBetween(rack, V(x, 0, -0.7), V(x, 0.9, -0.7), 0.025, palette.steel);
      for (const z of [-0.7, 0.7]) cylinderBetween(rack, V(-0.2, 0.04, z), V(0.2, 0.04, z), 0.025, palette.steel);
      for (const x of [-0.1, 0.1]) cylinderBetween(rack, V(x, 0.8, -0.7), V(x, 0.8, 0.7), 0.025, palette.steel);
      cylinderBetween(rack, V(0, 0, 0.7), V(0, 0.85, 0.7), 0.025, palette.steel);
      for (let i = 0; i < 5; i++) { const b = makeBall(); b.position.set(0, 0.93, -0.54 + i * 0.27); if (ri === 2 || i === 4) b.material = material(0xf4c669, { metalness: 0.4 }); rack.add(b); this.rackBalls.push(b); }
    });
  }
  batchStatic() {
    // Merge opaque static props by material. Skinned athletes, the net, rack,
    // glass, textures, sky and instanced windows keep their own update paths.
    this.scene.updateMatrixWorld(true);
    const groups = new Map();
    this.scene.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || Array.isArray(m.material) || m.material.isShaderMaterial || m.material.transparent || m.material.map || m.material === this.rimMaterial) return;
      let p = m; while (p) { if (p === this.rackGroup || p === this.net) return; p = p.parent; }
      const group = groups.get(m.material) || []; group.push(m); groups.set(m.material, group);
    });
    for (const [mat, objects] of groups) {
      if (objects.length < 2) continue;
      const geometries = objects.map(m => { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); if (g.index) return g.toNonIndexed(); return g; });
      // Geometry primitives can carry different optional attributes; these
      // materials use position/normal only, so discard UVs before merging.
      for (const g of geometries) for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
      const merged = mergeGeometries(geometries, false); for (const g of geometries) g.dispose();
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, mat); batch.castShadow = true; batch.receiveShadow = true; this.scene.add(batch);
      for (const m of objects) m.parent.remove(m);
    }
  }
  drawScore(engine) {
    const c = this.boardCanvas.getContext('2d'); c.fillStyle = '#172f34'; c.fillRect(0, 0, 1024, 320);
    c.fillStyle = '#ffb47d'; c.textAlign = 'center'; c.font = '900 34px Arial'; c.fillText('R I M R U N   /   S U N S E T   P A R K', 512, 47);
    c.fillStyle = '#f1e7cb'; c.font = '900 38px Arial';
    c.fillText(engine.mode === 'contest' ? 'POINTS' : 'HOME', 220, 105); c.fillText(engine.mode === 'contest' ? 'SECONDS' : 'AWAY', 804, 105);
    c.font = '900 140px Arial'; c.fillText(String(engine.score[0]).padStart(2, '0'), 220, 245); c.fillText(String(engine.mode === 'contest' ? Math.ceil(engine.contestTime) : engine.score[1]).padStart(2, '0'), 804, 245);
    c.fillStyle = '#e49b72'; c.font = '900 58px Arial'; c.fillText(engine.mode === 'preview' ? 'PLAY' : engine.mode === 'practice' ? '∞' : engine.mode === 'contest' ? '3PT' : Math.ceil(engine.shotClock), 512, 215);
    c.font = '900 23px Arial'; c.fillText(engine.mode === 'contest' ? 'MAKE IT RAIN' : 'RUN IT BACK', 512, 284);
    this.boardTexture.needsUpdate = true;
  }
  update(dt, engine) {
    this.flash = Math.max(0, this.flash - dt); this.rimMaterial.emissiveIntensity = 0.08 + this.flash * 2;
    this.netTime = Math.max(0, this.netTime - dt);
    this.net.scale.x = 1 + Math.sin(this.netTime * 28) * this.netTime * 0.14;
    this.net.scale.z = 1 - Math.sin(this.netTime * 28) * this.netTime * 0.12;
    this.rackGroup.visible = engine.mode === 'contest' && !engine.preview;
    if (this.rackGroup.visible) this.rackBalls.forEach((b, i) => { b.visible = i >= engine.rack * 5 + engine.rackBall; });
    this.boardTick = (this.boardTick || 0) + dt;
    if (this.boardTick > 0.15) { this.boardTick = 0; this.drawScore(engine); }
  }
  score() { this.flash = 0.8; this.netTime = 0.8; }
}
