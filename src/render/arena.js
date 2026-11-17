import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, RACKS } from '../config.js';
import { Humanoid } from './humanoid.js';
import { applyClip } from './clips.js';
import { material, mesh, box, cylinderBetween, canvasTexture, label, makeBall } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const palette = { steel: material(0x202e3c, { metalness: 0.58, roughness: 0.42 }), concrete: material(0x14202c), cream: material(0xdedecf), coral: material(0xc66b45), teal: material(0x183c46) };

export class Arena {
  constructor(scene, renderer) {
    Object.assign(this, { scene, renderer, flash: 0, netTime: 0, rackBalls: [], spectators: [] });
    scene.background = new THREE.Color(0x080e18); scene.fog = new THREE.FogExp2(0x0b1422, 0.0075);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.04); scene.environment = this.environmentTarget.texture;
    scene.environmentIntensity = 0.38; room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xc8ddf4, 0x423829, 1.1));
    const key = new THREE.DirectionalLight(0xffefdc, 3.2); key.position.set(-4, 14, 3); key.target.position.set(0, 0, 1);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -14, right: 14, top: 15, bottom: -15, near: 0.5, far: 38 });
    key.shadow.normalBias = 0.022; key.shadow.bias = -0.0001; scene.add(key, key.target); this.key = key;
    const fill = new THREE.DirectionalLight(0xb2d5ff, 1.2); fill.position.set(9, 10, -5); scene.add(fill);
    for (const x of [-6, 6]) for (const z of [-3, 12]) {
      const light = new THREE.SpotLight(0xf3f5ff, 90, 35, 0.85, 0.7, 2); light.position.set(x, 13, z); light.target.position.set(x * 0.3, 0, z); scene.add(light, light.target);
    }
    this.floor(); this.hoop(); this.bowl(); this.roof(); this.jumbotron(); this.farBasket(); this.racks();
    this.drawScore({ score: [0, 0], mode: 'preview', shotClock: 18, contestTime: 70 }); this.batchStatic();
  }
  floor() {
    const { scene, renderer } = this;
    box(scene, [46, 0.25, 60], [0, -0.15, 6], material(0x101a24));
    let seed = 731; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const width = 19, length = 32;
    const texture = canvasTexture(2048, 3456, (c, w, h) => {
      const sx = w / width, sz = h / length, x = n => (n + width / 2) * sx, z = n => (n + 10) * sz;
      c.fillStyle = '#ba8a51'; c.fillRect(0, 0, w, h);
      const plankWidth = 0.13 * sx;
      for (let column = 0; column < w / plankWidth; column++) {
        let start = -random() * 270;
        while (start < h) {
          const span = 150 + random() * 170, left = column * plankWidth;
          const lum = 55 + random() * 9; c.fillStyle = `hsl(${33 + random() * 5} 49% ${lum}%)`; c.fillRect(left, start, plankWidth, span);
          c.strokeStyle = '#5b3d2329'; c.lineWidth = 0.7; c.strokeRect(left, start, plankWidth, span);
          for (let k = 0; k < 4; k++) { c.strokeStyle = k % 2 ? '#f9df9c35' : '#6a3f2020'; c.beginPath(); const gx = left + random() * plankWidth; c.moveTo(gx, start); c.bezierCurveTo(gx + 2, start + span * 0.3, gx - 2, start + span * 0.65, gx, start + span); c.stroke(); }
          start += span;
        }
      }
      const half = reverse => {
        c.save(); if (reverse) { c.translate(0, z(6) * 2); c.scale(1, -1); }
        c.fillStyle = '#173d49'; c.fillRect(x(-2.45), z(-8), 4.9 * sx, 6.5 * sz);
        c.fillStyle = '#11313e'; c.fillRect(x(-7.5), z(-8), 15 * sx, 0.36 * sz);
        c.strokeStyle = '#f1ecdc'; c.lineWidth = 0.045 * sx;
        c.strokeRect(x(-2.45), z(-8), 4.9 * sx, 6.5 * sz);
        const arc = (cz, r, a, b) => { c.beginPath(); c.ellipse(x(0), z(cz), r * sx, r * sz, 0, a, b); c.stroke(); };
        arc(-6.1, 6.75, 0.212, Math.PI - 0.212); arc(-1.5, 1.8, 0, Math.PI);
        c.setLineDash([0.15 * sx, 0.15 * sx]); arc(-1.5, 1.8, Math.PI, Math.PI * 2); c.setLineDash([]);
        arc(-6.1, 1.25, 0, Math.PI);
        for (const side of [-1, 1]) {
          c.beginPath(); c.moveTo(x(side * 6.6), z(-8)); c.lineTo(x(side * 6.6), z(-4.686)); c.stroke();
          for (const lane of [-5.5, -4.5, -3.5, -2.5]) { c.beginPath(); c.moveTo(x(side * 2.45), z(lane)); c.lineTo(x(side * 2.7), z(lane)); c.stroke(); }
        }
        c.fillStyle = '#e5c399'; c.font = '900 40px Arial'; c.textAlign = 'center'; c.fillText('T H E   F I E L D H O U S E', x(0), z(-8.65));
        c.restore();
      };
      half(false); half(true);
      c.strokeStyle = '#182f3b'; c.lineWidth = 0.06 * sx; c.strokeRect(x(-7.5), z(-8), 15 * sx, 28 * sz);
      c.beginPath(); c.moveTo(x(-7.5), z(6)); c.lineTo(x(7.5), z(6)); c.stroke();
      c.fillStyle = '#163b49'; c.beginPath(); c.ellipse(x(0), z(6), 1.8 * sx, 1.8 * sz, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c9996c'; c.lineWidth = 0.035 * sx; c.stroke();
      c.fillStyle = '#e9d0ac'; c.font = 'italic 900 67px Arial'; c.textAlign = 'center'; c.fillText('RIMRUN', x(0), z(6.1), 3.2 * sx);
      c.font = '700 16px Arial'; c.fillText('P L A Y   W I T H   F E E L I N G', x(0), z(6.48));
      c.save(); c.translate(x(-8.3), z(6)); c.rotate(-Math.PI / 2); c.fillStyle = '#223844'; c.font = '900 30px Arial'; c.fillText('R I M R U N   A R E N A', 0, 0); c.restore();
      for (let i = 0; i < 65; i++) { const cx = random() * w, cy = random() * h; c.strokeStyle = '#323c3310'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(cx, cy, 2 + random() * 9, 1 + random() * 3, random(), 0, Math.PI * 1.4); c.stroke(); }
    });
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const bump = canvasTexture(128, 512, (c, w, h) => { c.fillStyle = '#888'; c.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.strokeStyle = i % 2 ? '#999' : '#777'; c.beginPath(); const x = random() * w; c.moveTo(x, 0); c.lineTo(x + (random() - 0.5) * 3, h); c.stroke(); } });
    bump.colorSpace = THREE.NoColorSpace; bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(40, 18);
    const finish = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: texture, bumpMap: bump, bumpScale: 0.0015, roughness: 0.33, metalness: 0.03, clearcoat: 0.55, clearcoatRoughness: 0.2 });
    const floor = mesh(new THREE.PlaneGeometry(width, length), finish, scene, [0, 0.013, 6]); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    for (const x of [-9.55, 9.55]) box(scene, [0.08, 0.05, 32], [x, 0.015, 6], palette.steel);
  }
  bowl() {
    const scene = this.scene, wall = material(0x152333), riser = material(0x202b38), rail = palette.steel;
    box(scene, [46, 18, 0.5], [0, 8.9, -24], wall); box(scene, [46, 18, 0.5], [0, 8.9, 36], wall);
    for (const side of [-1, 1]) box(scene, [0.5, 18, 60], [side * 23, 8.9, 6], wall);
    const seatPieces = [new THREE.BoxGeometry(0.45, 0.07, 0.43), new THREE.BoxGeometry(0.45, 0.4, 0.08)];
    seatPieces[0].translate(0, 0.43, 0); seatPieces[1].translate(0, 0.65, -0.18);
    const seatGeometry = mergeGeometries(seatPieces), locations = [];
    for (let row = 0; row < 12; row++) {
      const y = row * 0.48, d = 11.1 + row * 0.82;
      for (const side of [-1, 1]) {
        box(scene, [0.84, 0.5, 36], [side * d, y, 6], riser);
        for (let i = 0; i < 49; i++) { const z = -11 + i * 0.7; if (i % 16 < 2) continue; locations.push({ x: side * d, y: y + 0.25, z, yaw: -side * Math.PI / 2 }); }
      }
      for (const end of [-1, 1]) {
        const z = 6 + end * (18 + row * 0.82);
        box(scene, [22, 0.5, 0.84], [0, y, z], riser);
        for (let i = 0; i < 31; i++) { if (i % 12 < 2) continue; locations.push({ x: -10.5 + i * 0.7, y: y + 0.25, z, yaw: end > 0 ? Math.PI : 0 }); }
      }
    }
    const seats = new THREE.InstancedMesh(seatGeometry, material(0xffffff), locations.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
    let seed = 817; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const occupied = locations.filter(() => random() > 0.27);
    const headParts = [new THREE.SphereGeometry(1, 8, 6)];
    const nose = new THREE.SphereGeometry(0.22, 5, 4); nose.scale(0.7, 0.85, 1.2); nose.translate(0, -0.03, 0.94); headParts.push(nose);
    for (const side of [-1, 1]) { const ear = new THREE.SphereGeometry(0.17, 5, 4); ear.scale(0.5, 1.3, 0.75); ear.translate(side * 0.96, 0, 0); headParts.push(ear); }
    const headGeo = mergeGeometries(headParts);
    const shirtParts = [new THREE.CylinderGeometry(0.19, 0.16, 0.43, 7)];
    for (const side of [-1, 1]) {
      const sleeve = new THREE.CylinderGeometry(0.075, 0.07, 0.27, 6); sleeve.rotateZ(side * 0.22); sleeve.translate(side * 0.21, 0.015, 0.025); shirtParts.push(sleeve);
      const thigh = new THREE.CylinderGeometry(0.092, 0.1, 0.34, 6); thigh.rotateX(Math.PI / 2); thigh.translate(side * 0.105, -0.19, 0.2); shirtParts.push(thigh);
    }
    const bodyGeo = mergeGeometries(shirtParts), limbParts = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.05, 0.038, 0.27, 6); arm.rotateX(-1.05); arm.translate(side * 0.23, -0.17, 0.14); limbParts.push(arm);
      const hand = new THREE.SphereGeometry(0.048, 5, 4); hand.scale(0.8, 0.65, 1.25); hand.translate(side * 0.23, -0.23, 0.26); limbParts.push(hand);
      const leg = new THREE.CylinderGeometry(0.064, 0.045, 0.36, 6); leg.translate(side * 0.105, -0.4, 0.33); limbParts.push(leg);
    }
    const limbs = new THREE.InstancedMesh(mergeGeometries(limbParts), material(0xffffff), occupied.length);
    const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.49), material(0xffffff), occupied.length);
    const heads = new THREE.InstancedMesh(headGeo, material(0xffffff, { roughness: 0.7 }), occupied.length);
    const bodies = new THREE.InstancedMesh(bodyGeo, material(0xffffff), occupied.length);
    locations.forEach((p, i) => { q.setFromAxisAngle(V(0, 1, 0), p.yaw); matrix.compose(V(p.x, p.y, p.z), q, V(1, 1, 1)); seats.setMatrixAt(i, matrix); seats.setColorAt(i, color.setHex(i % 13 === 0 ? 0x735344 : i % 3 ? 0x243d50 : 0x1b2f40)); });
    occupied.forEach((p, i) => {
      q.setFromAxisAngle(V(0, 1, 0), p.yaw);
      const skin = [0xa57455, 0x5a3a2c, 0xd3aa82, 0x825239][i % 4];
      matrix.compose(V(p.x, p.y + 1.12, p.z), q, V(0.105, 0.138, 0.11)); heads.setMatrixAt(i, matrix); heads.setColorAt(i, color.setHex(skin).multiplyScalar(0.52));
      matrix.compose(V(p.x, p.y + 1.13, p.z), q, V(0.109, 0.14, 0.115)); hair.setMatrixAt(i, matrix); hair.setColorAt(i, color.setHex([0x171513, 0x352820, 0x5b4932, 0x171513, 0x78716a][i % 5]).multiplyScalar(0.65));
      matrix.compose(V(p.x, p.y + 0.76, p.z), q, V(1, 1, 0.85)); bodies.setMatrixAt(i, matrix); bodies.setColorAt(i, color.setHex([0x2c5c68, 0x9d7657, 0x8a989b, 0x343c50, 0x9c563d, 0xc5c0a9][i % 6]).multiplyScalar(0.5));
      limbs.setMatrixAt(i, matrix); limbs.setColorAt(i, color.setHex(skin).multiplyScalar(0.52));
    });
    scene.add(seats, heads, bodies, limbs, hair);
    for (const side of [-1, 1]) {
      for (const z of [-11.5, 23.5]) cylinderBetween(scene, V(side * 10.5, 0.5, z), V(side * 21, 6.2, z), 0.045, rail);
      box(scene, [0.07, 0.7, 36], [side * 10.35, 0.8, 6], rail);
      const ribbon = label(scene, 'RIMRUN   /   THE FIELDHOUSE   /   OWN THE COURT', 30, 0.68, [side * 10.25, 1.35, 6], { background: '#0d313e', color: '#ddb78e', font: '900 53px Arial', rotation: -side * Math.PI / 2 });
      ribbon.material.toneMapped = false;
      for (const z of [-4, 5, 14]) {
        box(scene, [0.65, 0.12, 2.7], [side * 9.65, 0.5, z], palette.steel);
        for (const offset of [-1, 1]) cylinderBetween(scene, V(side * 9.65, 0, z + offset), V(side * 9.65, 0.48, z + offset), 0.025, rail);
      }
    }
    for (let i = 0; i < 6; i++) {
      const h = new Humanoid({ team: i % 2 ? 'home' : 'away', headgear: 'bare', seed: i * 11, scale: 1.01 + i % 3 * 0.02 }); h.setLod(1); h.setNumber(0);
      h.root.position.set(i % 2 ? -9.8 : 9.8, 0, -2 + Math.floor(i / 2) * 5); h.root.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(h.root); applyClip(h, i % 2 ? 'idle' : 'idle_fold_arms', i * 0.4); h.update(); this.spectators.push(h);
    }
    for (const x of [-18, -6, 6, 18]) label(scene, 'RIMRUN  /  2026', 3.6, 4.8, [x, 11.5, -23.7], { background: x < 0 ? '#163b49' : '#653f31', color: '#e4ca9e', font: '900 58px Arial' });
  }
  roof() {
    const scene = this.scene, roofMat = material(0x111c29), lightMat = new THREE.MeshBasicMaterial({ color: 0xc3dbed, toneMapped: false });
    box(scene, [46, 0.3, 60], [0, 18.2, 6], roofMat);
    for (const z of [-19, -11, -3, 5, 13, 21, 29]) {
      cylinderBetween(scene, V(-22, 15.6, z), V(22, 15.6, z), 0.075, palette.steel);
      cylinderBetween(scene, V(-22, 17, z), V(22, 17, z), 0.075, palette.steel);
      for (let i = 0; i < 14; i++) cylinderBetween(scene, V(-22 + i * 3.14, i % 2 ? 17 : 15.6, z), V(-22 + (i + 1) * 3.14, i % 2 ? 15.6 : 17, z), 0.045, palette.steel);
      for (const x of [-16, -6, 6, 16]) {
        box(scene, [1.9, 0.25, 0.85], [x, 15.4, z], palette.steel);
        box(scene, [1.7, 0.025, 0.68], [x, 15.25, z], lightMat);
      }
    }
    for (const x of [-21, -10.5, 0, 10.5, 21]) cylinderBetween(scene, V(x, 17.5, -24), V(x, 17.5, 36), 0.08, palette.steel);
  }
  jumbotron() {
    const { scene } = this;
    box(scene, [4.6, 2.4, 4.6], [0, 11.7, 6], palette.steel);
    const mat = new THREE.MeshBasicMaterial({ map: this.boardTexture, toneMapped: false });
    for (const side of [-1, 1]) {
      const a = mesh(new THREE.PlaneGeometry(4.4, 1.7), mat, scene, [0, 11.7, 6 + side * 2.31]); if (side < 0) a.rotation.y = Math.PI;
      const b = mesh(new THREE.PlaneGeometry(4.4, 1.7), mat, scene, [side * 2.31, 11.7, 6]); b.rotation.y = side * Math.PI / 2;
      cylinderBetween(scene, V(side * 1.5, 12.9, 4.5), V(side * 1.5, 18, 4.5), 0.045, palette.steel);
    }
    for (const y of [10.45, 12.95]) box(scene, [4.7, 0.08, 4.7], [0, y, 6], material(0xe6aa73, { emissive: 0xba703f, emissiveIntensity: 0.65 }));
  }
  farBasket() {
    const s = this.scene;
    box(s, [0.5, 1.7, 0.5], [0, 0.85, 20.8], palette.teal);
    cylinderBetween(s, V(0, 0, 20.8), V(0, 3.7, 20.8), 0.1, palette.steel);
    cylinderBetween(s, V(0, 3.7, 20.8), V(0, 3.5, 18.52), 0.075, palette.steel);
    box(s, [1.8, 1.05, 0.035], [0, 3.48, 18.52], new THREE.MeshPhysicalMaterial({ color: 0xb8d5df, transparent: true, opacity: 0.2, roughness: 0.1, depthWrite: false }));
    for (const x of [-0.91, 0.91]) box(s, [0.035, 1.1, 0.05], [x, 3.48, 18.52], palette.cream);
    for (const y of [2.955, 4.005]) box(s, [1.8, 0.035, 0.05], [0, y, 18.52], palette.cream);
    const rim = mesh(new THREE.TorusGeometry(0.235, 0.018, 8, 40), material(0xe1642b, { metalness: 0.4 }), s, [0, 3.05, 18.1]); rim.rotation.x = Math.PI / 2;
    const net = this.net.children[0].clone(); net.geometry = net.geometry.clone(); net.position.set(0, 3.05, 18.1); s.add(net);
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
    this.netRest = new Float32Array(points);
    // Physical scoreboard is readable inside the headset.
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 1024; this.boardCanvas.height = 320;
    this.boardTexture = new THREE.CanvasTexture(this.boardCanvas); this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    box(scene, [4.8, 1.58, 0.15], [0, 5.7, -9.3], palette.steel);
    mesh(new THREE.PlaneGeometry(4.65, 1.45), new THREE.MeshBasicMaterial({ map: this.boardTexture }), scene, [0, 5.7, -9.21]);
    for (const x of [-1.8, 1.8]) cylinderBetween(scene, V(x, 0, -9.4), V(x, 6.5, -9.4), 0.06, palette.steel);
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
    // glass, textures and instanced crowd keep their own update paths.
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
      const batch = new THREE.Mesh(merged, mat); batch.castShadow = objects.some(o => o.castShadow); batch.receiveShadow = true; this.scene.add(batch);
      for (const m of objects) m.parent.remove(m);
    }
  }

  drawScore(engine) {
    const c = this.boardCanvas.getContext('2d'); c.fillStyle = '#172f34'; c.fillRect(0, 0, 1024, 320);
    c.fillStyle = '#ffb47d'; c.textAlign = 'center'; c.font = '900 34px Arial'; c.fillText('R I M R U N   /   T H E   F I E L D H O U S E', 512, 47);
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
    if (this.netTime > 0 || this.netWasMoving) {
      const attribute = this.net.children[0].geometry.attributes.position;
      for (let i = 0; i < attribute.count; i++) {
        const x = this.netRest[i * 3], y = this.netRest[i * 3 + 1], z = this.netRest[i * 3 + 2], weight = -y / 0.48;
        const wave = Math.sin((0.8 - this.netTime) * 24 - weight * 3) * this.netTime * weight;
        attribute.setXYZ(i, x * (1 + wave * 0.34) + wave * 0.035, y - Math.abs(wave) * 0.06, z * (1 + wave * 0.28));
      }
      attribute.needsUpdate = true; this.netWasMoving = this.netTime > 0;
    }
    this.rackGroup.visible = engine.mode === 'contest' && !engine.preview;
    if (this.rackGroup.visible) this.rackBalls.forEach((b, i) => { b.visible = i >= engine.rack * 5 + engine.rackBall; });
    this.boardTick = (this.boardTick || 0) + dt;
    if (this.boardTick > 0.15) { this.boardTick = 0; this.drawScore(engine); }
  }
  score() { this.flash = 0.8; this.netTime = 0.8; }
}
