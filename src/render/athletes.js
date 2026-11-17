import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Humanoid, handGeometry } from './humanoid.js';
import { applyClip, applyLocomotion, strideAt, MASK_LEGS } from './clips.js';
import { material, shadow, canvasTexture } from './util.js';
import { Footwork } from './footwork.js';
import { wrappedAngle, dribbleHand } from '../game/movement.js';

const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
const SKINS = [0xbb815a, 0x815335, 0x64422e, 0xd3a17c];
function mirrorPose(h) {
  const mirror = q => q.set(q.x, -q.y, -q.z, q.w);
  for (const name of ['hips', 'spine', 'chest', 'neck', 'head']) mirror(h.bones[name].quaternion);
  for (const name of ['shoulder', 'elbow', 'hand', 'hip', 'knee', 'ankle']) {
    const left = h.bones[name + 'L'].quaternion.clone(), right = h.bones[name + 'R'].quaternion.clone();
    h.bones[name + 'L'].quaternion.copy(mirror(right)); h.bones[name + 'R'].quaternion.copy(mirror(left));
  }
  h.bones.hips.position.x *= -1;
}

export class PlayerView {
  constructor(scene, player) {
    this.id = player.id; this.phase = player.id * 1.8; this.footwork = new Footwork(); this.bodyYaw = player.yaw;
    this.h = new Humanoid({ team: player.team === 0 ? 'home' : 'away', headgear: 'bare', skin: SKINS[player.id], hair: [0x30251e, 0x191715, 0x1e1915, 0x503829][player.id], seed: player.id * 13 + 5, scale: [1.065, 1.09, 1.08, 1.04][player.id] });
    this.h.setNumber([1, 7, 23, 11][player.id]); this.root = this.h.root; this.root.name = `athlete-${player.name}`;
    const frontTexture = canvasTexture(256, 320, (c, w) => {
      c.fillStyle = player.team === 0 ? '#e5ddb7' : '#ffe0b9'; c.textAlign = 'center';
      c.font = '900 29px Arial'; c.fillText('R I M R U N', w / 2, 55);
      c.font = '900 152px Arial'; c.fillText(['01', '07', '23', '11'][player.id], w / 2, 218);
      c.font = '700 21px Arial'; c.fillText('A R E N A', w / 2, 264);
    });
    this.frontTexture = frontTexture; this.h.material.userData.uniforms.uChestPrint.value = frontTexture;
    this.h.bones.head.scale.set([1, 1.035, 0.97, 1.02][player.id], 1, 1);
    this.h.mesh.castShadow = true; this.h.mesh.receiveShadow = true; scene.add(this.root);
    this.shadow = shadow(scene, 0.55, 0.6);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.435, 48), new THREE.MeshBasicMaterial({ color: player.team === 0 ? 0xb5dfb3 : 0xf5a078, transparent: true, opacity: 0.5, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; scene.add(this.marker);
    this.previous = this.h.snapshot();
  }
  update(dt, time, p, engine, visible = true, viewPitch = null) {
    const h = this.h, firstPerson = viewPitch !== null;
    this.root.visible = this.shadow.visible = this.marker.visible = visible; if (!visible) return;
    h.setArmsOnly(firstPerson);
    h.mesh.castShadow = !firstPerson;
    this.marker.visible = !firstPerson;
    this.previous = h.snapshot(this.previous); h.reset();
    this.root.position.set(p.pos.x, p.jump, p.pos.z);
    const facing = p.action === 'pass' && !firstPerson ? p.passYaw : p.yaw;
    this.bodyYaw = firstPerson ? p.yaw : this.bodyYaw + THREE.MathUtils.clamp(wrappedAngle(this.bodyYaw, facing), -dt * 10, dt * 10);
    this.root.rotation.set(0, this.bodyYaw, 0);
    if (!firstPerson && p.moveState?.kind === 'spin') { const u = Math.min(1, p.moveState.age / p.moveState.duration); this.root.rotation.y += u * u * (3 - 2 * u) * Math.PI * 2; }
    const owns = engine.ownerId === p.id, gathered = owns && (engine.ballState === 'held' || p.action === 'shooting');
    const speed = p.vel.length();
    applyClip(h, p.defending ? 'set' : 'idle', time + this.id * 0.45);
    // The uploaded Mixamo take supplies the actual weight shift, shoulder and
    // arm motion. IK makes the hand meet the live ball without overriding rules.
    const hand = dribbleHand(p);
    if (owns && !gathered) { applyClip(h, 'dribble', p.dribble / 6.7); if (hand < 0) mirrorPose(h); }
    if (speed > 0.08 && p.jump < 0.03) {
      this.phase += dt * Math.PI * 2 * speed / (strideAt(h, speed) || 1.8);
      applyLocomotion(h, this.phase, speed, 1, owns || p.defending ? MASK_LEGS : undefined);
    }
    if (p.stagger) { h.addRot('spine', 0.08, 0.07, Math.sin(p.stagger * 12) * 0.12); h.bones.hips.position.y -= 0.08; }
    if (p.action === 'stepback') h.addRot('chest', -0.1);
    const localVelocity = new THREE.Vector3().copy(p.vel).applyAxisAngle(UP, -this.bodyYaw);
    const localAcceleration = new THREE.Vector3().copy(p.acceleration || V(0, 0, 0)).applyAxisAngle(UP, -this.bodyYaw);
    h.addRot('spine', Math.max(-0.1, Math.min(0.14, localVelocity.z * 0.028 + localAcceleration.z * 0.002)), 0, Math.max(-0.13, Math.min(0.13, -localVelocity.x * 0.02 - localAcceleration.x * 0.003)));
    if (gathered) h.bones.hips.position.y -= Math.max(0, 1 - (p.id === 0 && !engine.preview ? engine.charge : p.charge) / 0.72) * 0.1;
    if (this.lastJump > 0 && !p.jump) this.landTime = 0.18;
    this.lastJump = p.jump;
    this.landTime = Math.max(0, (this.landTime || 0) - dt);
    h.bones.hips.position.y -= Math.sin(Math.PI * this.landTime / 0.18) * 0.075;
    h.update();
    if (firstPerson && viewPitch < -0.14) {
      // Keep the base of the neck behind the eyes even when the source clip
      // leans far forward. Ball targets stay in world space for the arm IK.
      const neck = h.worldPos('neck', new THREE.Vector3());
      const weight = THREE.MathUtils.smoothstep(-viewPitch, 0.14, 0.62);
      this.root.position.x += (p.pos.x - 0.22 * Math.sin(p.yaw) - neck.x) * weight;
      this.root.position.z += (p.pos.z - 0.22 * Math.cos(p.yaw) - neck.z) * weight;
      h.update();
    }
    const localToWorld = point => this.root.localToWorld(point);
    const ball = new THREE.Vector3().copy(engine.ball.pos);
    const receiving = engine.passInfo?.to === p.id && ball.distanceTo(localToWorld(V(0, 1.35, 0.2))) < 2.1;
    const securing = owns && engine.catchFrom && !gathered;
    const following = ['follow', 'layup', 'dunk'].includes(p.action);
    const eyeTarget = (owns && !securing || following) ? new THREE.Vector3().copy(CONFIG.hoop) : ball;
    h.lookAt(eyeTarget, owns ? 0.32 : 0.48, 0.85);
    h.blendFrom(this.previous, 1 - Math.exp(-dt * 22));
    h.update();
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      const shooting = side === (hand > 0 ? 'R' : 'L');
      let target = null, wristPitch = null, wristRoll = 0;
      if (owns && gathered || securing || receiving) {
        const under = gathered && shooting;
        target = ball.clone().add(V(sign * (under ? 0.05 : 0.13), under ? -0.13 : -0.05, -0.09).applyAxisAngle(UP, this.bodyYaw));
        wristPitch = under ? -1.92 : -1.72; wristRoll = sign * (under ? 1.18 : 0.25);
      } else if (owns && shooting) {
        target = ball.clone().add(V(sign * 0.025, 0.13, -0.065).applyAxisAngle(UP, this.bodyYaw));
        target.y = Math.max(p.jump + 0.81, target.y);
        wristPitch = -1.28; wristRoll = -sign * 1.05;
      } else if (following) {
        const extension = Math.min(1, p.actionTime / 0.34);
        const finish = p.action === 'layup';
        target = localToWorld(V(sign * (shooting ? 0.2 : 0.28), shooting ? 1.55 + 0.48 * extension : 1.3 + 0.32 * extension, shooting ? 0.38 : 0.19));
        wristPitch = shooting ? (finish ? -1.95 : -0.65) : -1.4;
        wristRoll = shooting && finish ? sign * 0.9 : 0;
      } else if (p.jump > 0.03 && !owns) target = localToWorld(V(sign * 0.21, 2.04, 0.12));
      else if (p.action === 'reach') target = localToWorld(V(sign * 0.15, 1.12, 0.6));
      else if (p.action === 'pass') target = localToWorld(V(sign * 0.12, 1.22, 0.62));
      else if (p.defending) target = localToWorld(V(sign * 0.45, side === 'R' ? 1.48 : 1.05, 0.28));
      if (target) {
        const pole = localToWorld(V(sign * 0.5, gathered ? 1.0 : 1.08, gathered ? 0.1 : -0.02));
        // Ease into a receiving pose before contact. At the ball, solve the
        // wrist against this frame's position so filtering cannot leave it behind.
        if (receiving) {
          const current = h.worldPos('hand' + side, new THREE.Vector3());
          target.lerp(current, THREE.MathUtils.smoothstep(ball.distanceTo(current), 0.45, 2.0));
        }
        h.ikArm(side, target, pole);
        if (wristPitch !== null) {
          const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(wristPitch, 0, wristRoll, 'XZY'));
          h.setWorldQuat('hand' + side, rotation.premultiply(this.root.quaternion));
        }
      }
    }
    h.update();
    if (!firstPerson) {
      this.footwork.update(dt, p, h, gathered);
      if (p.jump < 0.02) h.groundGuard(0.004);
    }
    this.shadow.position.set(p.pos.x, 0.027, p.pos.z); this.shadow.material.opacity = 0.6 / (1 + p.jump);
    this.marker.position.set(p.pos.x, 0.031, p.pos.z); this.marker.material.opacity = p.team === 0 ? 0.55 : 0.18;
  }
  dispose(scene) {
    scene.remove(this.root, this.shadow, this.marker);
    this.h.material.dispose(); this.h.mesh.skeleton.dispose(); this.shadow.material.dispose(); this.shadow.geometry.dispose(); this.marker.material.dispose(); this.marker.geometry.dispose();
    this.frontTexture.dispose();
    const index = Humanoid.all.indexOf(this.h); if (index >= 0) Humanoid.all.splice(index, 1);
  }
}

export class HandsView {
  constructor(scene, environment = null) {
    this.hands = {};
    for (const [name, side] of [['left', 'L'], ['right', 'R']]) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xc48b66, roughness: 0.62, metalness: 0, clearcoat: 0.03, envMap: environment, envMapIntensity: 0.38 });
      const group = new THREE.Group(), hand = new THREE.Mesh(handGeometry(side), mat);
      hand.castShadow = true; group.add(hand); scene.add(group); this.hands[name] = group;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.037, 0.032, 16), material(0x2a7066)); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.018; group.add(cuff);
    }
  }
  update(input, engine, playing) {
    for (const [name, group] of Object.entries(this.hands)) {
      const c = input[name]; group.visible = playing && input.xr && c.tracked;
      if (group.visible) { group.position.copy(c.gripPose.p); group.quaternion.copy(c.gripPose.q); }
    }
  }
}
