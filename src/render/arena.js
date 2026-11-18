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
    Object.assign(this, { scene, renderer, flash: 0, netTime: 9, netKick: 0, cheer: 0, cheerGoal: 0, rimFlex: 0, rackBalls: [], spectators: [] });
    this.crowdUniforms = { uCheer: { value: 0 }, uCrowdTime: { value: 0 } };
    scene.background = new THREE.Color(0x0d1622); scene.fog = new THREE.FogExp2(0x101b2b, 0.006);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.04); this.environment = this.environmentTarget.texture;
    // Use reflections on athletes and hardwood; matte walls and the distant
    // crowd do not need the room's environment lookup on every pixel.
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xd3e4f7, 0x4a3f2f, 1.45));
    const key = new THREE.DirectionalLight(0xffefdc, 3.2); key.position.set(-4, 14, 3); key.target.position.set(0, 0, 1);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -14, right: 14, top: 15, bottom: -15, near: 0.5, far: 38 });
    key.shadow.normalBias = 0.022; key.shadow.bias = -0.0001; scene.add(key, key.target); this.key = key;
    const fill = new THREE.DirectionalLight(0xb2d5ff, 1.2); fill.position.set(9, 10, -5); scene.add(fill);
    // The broad overhead key, fill and room environment cover the hardwood.
    // Individual fixture meshes supply the visual lights without four extra
    // per-pixel spot-light evaluations across the full court and crowd.
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
    const finish = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, bumpMap: bump, bumpScale: 0.0015, roughness: 0.34, metalness: 0.03, envMap: this.environment, envMapIntensity: 0.38 });
    const floor = mesh(new THREE.PlaneGeometry(width, length), finish, scene, [0, 0.013, 6]); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    for (const x of [-9.55, 9.55]) box(scene, [0.08, 0.05, 32], [x, 0.015, 6], palette.steel);
  }
  bowl() {
    const scene = this.scene, wall = material(0x1c3044), riser = material(0x27364a), rail = palette.steel;
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
    // One shared pair of uniforms lifts the whole crowd out of its seats: each
    // person bounces on their own beat, keyed from where they sit.
    const crowdMaterial = () => {
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      m.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, this.crowdUniforms);
        shader.vertexShader = 'uniform float uCheer;\nuniform float uCrowdTime;\n' + shader.vertexShader.replace('#include <project_vertex>', `
          vec4 mvPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
            float seat = instanceMatrix[3].x * 3.71 + instanceMatrix[3].z * 2.37;
            float keen = 0.35 + 0.65 * fract(sin(seat * 12.9898) * 43758.5453);
            mvPosition.y += uCheer * keen * (0.1 + 0.2 * abs(sin(uCrowdTime * (6.0 + keen * 3.0) + seat)));
          #endif
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      };
      return m;
    };
    const headParts = [new THREE.SphereGeometry(1, 6, 4)];
    const nose = new THREE.SphereGeometry(0.22, 4, 2); nose.scale(0.7, 0.85, 1.2); nose.translate(0, -0.03, 0.94); headParts.push(nose);
    for (const side of [-1, 1]) { const ear = new THREE.SphereGeometry(0.17, 4, 2); ear.scale(0.5, 1.3, 0.75); ear.translate(side * 0.96, 0, 0); headParts.push(ear); }
    const headGeo = mergeGeometries(headParts);
    const shirtParts = [new THREE.CylinderGeometry(0.19, 0.16, 0.43, 6)];
    for (const side of [-1, 1]) {
      const sleeve = new THREE.CylinderGeometry(0.075, 0.07, 0.27, 4); sleeve.rotateZ(side * 0.22); sleeve.translate(side * 0.21, 0.015, 0.025); shirtParts.push(sleeve);
      const thigh = new THREE.CylinderGeometry(0.092, 0.1, 0.34, 4); thigh.rotateX(Math.PI / 2); thigh.translate(side * 0.105, -0.19, 0.2); shirtParts.push(thigh);
    }
    const bodyGeo = mergeGeometries(shirtParts), limbParts = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.05, 0.038, 0.27, 4); arm.rotateX(-1.05); arm.translate(side * 0.23, -0.17, 0.14); limbParts.push(arm);
      const hand = new THREE.SphereGeometry(0.048, 4, 3); hand.scale(0.8, 0.65, 1.25); hand.translate(side * 0.23, -0.23, 0.26); limbParts.push(hand);
      const leg = new THREE.CylinderGeometry(0.064, 0.045, 0.36, 4); leg.translate(side * 0.105, -0.4, 0.33); limbParts.push(leg);
    }
    const limbs = new THREE.InstancedMesh(mergeGeometries(limbParts), crowdMaterial(), occupied.length);
    const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.49), crowdMaterial(), occupied.length);
    const heads = new THREE.InstancedMesh(headGeo, crowdMaterial(), occupied.length);
    const bodies = new THREE.InstancedMesh(bodyGeo, crowdMaterial(), occupied.length);
    locations.forEach((p, i) => { q.setFromAxisAngle(V(0, 1, 0), p.yaw); matrix.compose(V(p.x, p.y, p.z), q, V(1, 1, 1)); seats.setMatrixAt(i, matrix); seats.setColorAt(i, color.setHex(i % 13 === 0 ? 0x735344 : i % 3 ? 0x243d50 : 0x1b2f40)); });
    occupied.forEach((p, i) => {
      q.setFromAxisAngle(V(0, 1, 0), p.yaw);
      const skin = [0xa57455, 0x5a3a2c, 0xd3aa82, 0x825239][i % 4];
      matrix.compose(V(p.x, p.y + 1.12, p.z), q, V(0.105, 0.138, 0.11)); heads.setMatrixAt(i, matrix); heads.setColorAt(i, color.setHex(skin).multiplyScalar(0.74));
      matrix.compose(V(p.x, p.y + 1.13, p.z), q, V(0.109, 0.14, 0.115)); hair.setMatrixAt(i, matrix); hair.setColorAt(i, color.setHex([0x171513, 0x352820, 0x5b4932, 0x171513, 0x78716a][i % 5]).multiplyScalar(0.8));
      matrix.compose(V(p.x, p.y + 0.76, p.z), q, V(1, 1, 0.85)); bodies.setMatrixAt(i, matrix); bodies.setColorAt(i, color.setHex([0x2c5c68, 0x9d7657, 0x8a989b, 0x343c50, 0x9c563d, 0xc5c0a9, 0x1f8a7a, 0xd9825a][i % 8]).multiplyScalar(0.74));
      limbs.setMatrixAt(i, matrix); limbs.setColorAt(i, color.setHex(skin).multiplyScalar(0.74));
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
      h.material.envMap = this.environment; h.material.envMapIntensity = 0.38;
      h.root.position.set(i % 2 ? -9.8 : 9.8, 0, -2 + Math.floor(i / 2) * 5); h.root.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(h.root); applyClip(h, i % 2 ? 'idle' : 'idle_fold_arms', i * 0.4); h.update(); this.spectators.push(h);
    }
    // Hanging banners, drawn at their own proportions so the lettering is crisp.
    [[-18, 'FIELDHOUSE', 'EST. 2026', '#163b49'], [-6, 'RIMRUN', 'ALL HEART', '#1d4a55'], [6, 'RIMRUN', 'ALL HOOPS', '#7a4a36'], [18, 'CHAMPIONS', 'PICKUP LEAGUE', '#653f31']].forEach(([x, title, sub, background]) => {
      const texture = canvasTexture(512, 704, (c, w, h) => {
        c.fillStyle = background; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#e4ca9e'; c.lineWidth = 6; c.strokeRect(22, 22, w - 44, h - 44);
        c.fillStyle = '#e4ca9e'; c.textAlign = 'center';
        c.font = '900 34px Arial'; c.fillText('T H E', w / 2, 150);
        c.font = 'italic 900 92px Arial'; c.fillText(title, w / 2, 290, w - 90);
        c.fillRect(w / 2 - 70, 330, 140, 5);
        c.font = '900 150px Arial'; c.fillText('26', w / 2, 500);
        c.font = '700 30px Arial'; c.fillText(sub.split('').join(' '), w / 2, 600, w - 90);
      });
      texture.anisotropy = 4;
      mesh(new THREE.PlaneGeometry(3.6, 4.95), new THREE.MeshBasicMaterial({ map: texture }), scene, [x, 11.5, -23.7]);
    });
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
    // The ring and net hang from one pivot at the glass so a dunk can flex them.
    this.rimPivot = new THREE.Group(); this.rimPivot.position.set(0, h.y, b.z + 0.02); scene.add(this.rimPivot);
    const rim = mesh(new THREE.TorusGeometry(h.radius, h.tube, 10, 56), this.rimMaterial, this.rimPivot, [0, 0, h.z - b.z - 0.02]); rim.rotation.x = Math.PI / 2;
    this.net = new THREE.Group(); this.net.position.set(0, 0, h.z - b.z - 0.02); this.rimPivot.add(this.net);
    const points = [];
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      for (let row = 0; row < 4; row++) {
        const y1 = -row * 0.11, y2 = -(row + 1) * 0.11, r1 = h.radius - 0.008 - row * 0.027, r2 = r1 - 0.027;
        for (const side of [-1, 1]) { const a1 = angle + (row % 2 ? Math.PI / 16 : 0), a2 = a1 + side * Math.PI / 16;
          points.push(Math.cos(a1) * r1, y1, Math.sin(a1) * r1, Math.cos(a2) * r2, y2, Math.sin(a2) * r2); }
      }
    }
    this.net.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color: 0xf7ecd4, transparent: true, opacity: 0.9 })));
    this.netRest = new Float32Array(points);
    // Shot clock on top of the glass, readable from anywhere on the floor.
    this.clockCanvas = document.createElement('canvas'); this.clockCanvas.width = 256; this.clockCanvas.height = 128;
    this.clockTexture = new THREE.CanvasTexture(this.clockCanvas); this.clockTexture.colorSpace = THREE.SRGBColorSpace;
    box(scene, [0.74, 0.4, 0.12], [0, b.y + b.height / 2 + 0.25, b.z], palette.steel);
    const clockFace = mesh(new THREE.PlaneGeometry(0.66, 0.33), new THREE.MeshBasicMaterial({ map: this.clockTexture, toneMapped: false }), scene, [0, b.y + b.height / 2 + 0.25, b.z + 0.065]);
    clockFace.name = 'shot-clock';
    // Red light strips around the glass fire with the horn.
    this.boardLight = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    for (const x of [-0.935, 0.935]) box(scene, [0.02, b.height + 0.05, 0.02], [x, b.y, b.z + 0.03], this.boardLight);
    for (const y of [b.y - b.height / 2 - 0.02, b.y + b.height / 2 + 0.02]) box(scene, [b.width + 0.07, 0.02, 0.02], [0, y, b.z + 0.03], this.boardLight);
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
      for (let i = 0; i < 5; i++) { const b = makeBall(ri === CONFIG.contest.moneyRack || i === 4); b.position.set(0, 0.93, -0.54 + i * 0.27); rack.add(b); this.rackBalls.push(b); }
    });
  }

  batchStatic() {
    // Merge opaque static props by material. Skinned athletes, the net, rack,
    // glass, textures and instanced crowd keep their own update paths.
    this.scene.updateMatrixWorld(true);
    const groups = new Map();
    this.scene.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || Array.isArray(m.material) || m.material.isShaderMaterial || m.material.transparent || m.material.map || m.material === this.rimMaterial || m.material === this.boardLight) return;
      let p = m; while (p) { if (p === this.rackGroup || p === this.rimPivot) return; p = p.parent; }
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
    const contest = engine.mode === 'contest';
    const away = contest ? Math.ceil(engine.contestTime) : engine.score[1];
    const clock = engine.mode === 'preview' ? 'PLAY' : engine.mode === 'practice' ? '∞' : contest ? '3PT' : Math.ceil(engine.shotClock);
    const key = [engine.mode, engine.score[0], away, clock].join('|');
    if (this.boardKey === key) return;
    this.boardKey = key;
    const c = this.boardCanvas.getContext('2d'); c.fillStyle = '#172f34'; c.fillRect(0, 0, 1024, 320);
    c.fillStyle = '#ffb47d'; c.textAlign = 'center'; c.font = '900 34px Arial'; c.fillText('R I M R U N   /   T H E   F I E L D H O U S E', 512, 47);
    c.fillStyle = '#f1e7cb'; c.font = '900 38px Arial';
    c.fillText(engine.mode === 'contest' ? 'POINTS' : 'HOME', 220, 105); c.fillText(engine.mode === 'contest' ? 'SECONDS' : 'AWAY', 804, 105);
    c.font = '900 140px Arial'; c.fillText(String(engine.score[0]).padStart(2, '0'), 220, 245); c.fillText(String(away).padStart(2, '0'), 804, 245);
    c.fillStyle = '#e49b72'; c.font = '900 58px Arial'; c.fillText(clock, 512, 215);
    c.font = '900 23px Arial'; c.fillText(engine.mode === 'contest' ? 'MAKE IT RAIN' : 'RUN IT BACK', 512, 284);
    this.boardTexture.needsUpdate = true;
  }

  drawClock(engine) {
    const live = engine.mode === '1v1' || engine.mode === '2v2';
    const text = live ? String(Math.max(0, Math.ceil(engine.shotClock))) : engine.mode === 'contest' ? String(Math.ceil(engine.contestTime)) : '--';
    if (this.clockKey === text) return;
    this.clockKey = text;
    const c = this.clockCanvas.getContext('2d'); c.fillStyle = '#0b0f12'; c.fillRect(0, 0, 256, 128);
    const urgent = live && engine.shotClock <= 5 || engine.mode === 'contest' && engine.contestTime <= 10;
    c.fillStyle = urgent ? '#ff4a3a' : '#ffb347'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 104px Arial'; c.fillText(text, 128, 70);
    this.clockTexture.needsUpdate = true;
  }

  // The net is pushed open where the ball actually is on its way through,
  // dragged down with it, then whips back and settles.
  updateNet(dt, engine) {
    const h = CONFIG.hoop, ball = engine.ball, depth = h.y - ball.pos.y;
    const inside = ball.scored && depth > -0.05 && depth < 0.5 && Math.hypot(ball.pos.x - h.x, ball.pos.z - h.z) < 0.3;
    this.netTime += dt;
    if (inside) this.netTime = 0;
    const settled = !inside && this.netTime > 1.4;
    if (settled && !this.netWasMoving) return;
    const attribute = this.net.children[0].geometry.attributes.position, t = this.netTime, whip = Math.exp(-t * 4.2) * this.netKick;
    for (let i = 0; i < attribute.count; i++) {
      const x = this.netRest[i * 3], y = this.netRest[i * 3 + 1], z = this.netRest[i * 3 + 2], weight = -y / 0.44;
      let widen = 0, drop = 0, sway = 0;
      if (!settled) {
        if (inside) {
          const near = Math.exp(-Math.pow((depth - -y) / 0.13, 2));
          widen = near * 0.55 * weight + 0.08 * weight; drop = Math.max(0, depth - 0.1) * 0.22 * weight;
        }
        widen += Math.sin(t * 21 - weight * 2.6) * whip * 0.3 * weight;
        drop += Math.abs(Math.cos(t * 13)) * whip * 0.09 * weight - whip * 0.05 * weight;
        sway = Math.sin(t * 16 + 1) * whip * 0.05 * weight;
      }
      attribute.setXYZ(i, x * (1 + widen) + sway, y - drop, z * (1 + widen));
    }
    attribute.needsUpdate = true; this.netWasMoving = !settled;
  }

  update(dt, engine, now = 0) {
    this.flash = Math.max(0, this.flash - dt); this.rimMaterial.emissiveIntensity = 0.08 + this.flash * 2;
    this.updateNet(dt, engine);
    // A dunk bends the breakaway ring down and lets it spring back.
    this.rimFlex = Math.max(0, this.rimFlex - dt);
    this.rimPivot.rotation.x = this.rimFlex > 0 ? Math.sin(this.rimFlex * 22) * 0.12 * this.rimFlex / 0.7 + 0.1 * Math.pow(this.rimFlex / 0.7, 2) : 0;
    // The building swells after a big play and settles on its own.
    this.cheerGoal = Math.max(0, this.cheerGoal - dt * 0.55);
    this.cheer += (Math.min(1, this.cheerGoal) - this.cheer) * (1 - Math.exp(-dt * (this.cheerGoal > this.cheer ? 9 : 2.2)));
    this.crowdUniforms.uCheer.value = this.cheer; this.crowdUniforms.uCrowdTime.value = now;
    this.buzzer = Math.max(0, (this.buzzer || 0) - dt); this.boardLight.opacity = this.buzzer > 0 ? 0.95 : 0;
    this.rackGroup.visible = engine.mode === 'contest' && !engine.preview;
    if (this.rackGroup.visible) this.rackBalls.forEach((b, i) => { b.visible = i > engine.rack * 5 + engine.rackBall; });
    this.boardTick = (this.boardTick || 0) + dt;
    if (this.boardTick > 0.15) { this.boardTick = 0; this.drawScore(engine); this.drawClock(engine); }
  }
  event(e) {
    if (e.type === 'net') { this.netKick = Math.min(1.5, 0.55 + (e.speed || 3) * 0.12) * (e.clean ? 1.15 : 0.8); this.netTime = 0; this.netWasMoving = true; }
    else if (e.type === 'score') { this.flash = 0.8; this.cheerGoal = Math.max(this.cheerGoal, e.dunk ? 2.2 : e.value === 3 || e.green ? 1.7 : 1.2); if (e.dunk) this.rimFlex = 0.7; }
    else if (e.type === 'block') this.cheerGoal = Math.max(this.cheerGoal, e.swat ? 1.5 : 0.9);
    else if (e.type === 'steal' || e.type === 'move' && e.broke) this.cheerGoal = Math.max(this.cheerGoal, 1);
    else if (e.type === 'rim' && e.speed > 2.5) this.rimFlex = Math.max(this.rimFlex, 0.12);
    else if (e.type === 'buzzer') this.buzzer = 1.1;
    else if (e.type === 'whistle') this.buzzer = 0.45;
    else if (e.type === 'finish') this.cheerGoal = 2.6;
  }
}
