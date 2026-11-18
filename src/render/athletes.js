import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Humanoid, handGeometry } from './humanoid.js';
import { applyClip, applyLocomotion, strideAt, MASK_LEGS, MASK_ARMS, MASK_TRUNK } from './clips.js';
import { material, shadow, canvasTexture } from './util.js';
import { Footwork } from './footwork.js';
import { wrappedAngle, dribbleHand, dribbleTop, dribbleInHand, isTransfer } from '../game/movement.js';

const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
const SKINS = [0xbb815a, 0x815335, 0x64422e, 0xd3a17c];
const ease = t => t * t * (3 - 2 * t), clamp01 = t => Math.min(1, Math.max(0, t));
const _euler = new THREE.Euler(), _quat = new THREE.Quaternion(), _current = new THREE.Vector3();
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
    const scale = (player.height || CONFIG.player.heights[player.id]) / 1.8;
    this.h = new Humanoid({ team: player.team === 0 ? 'home' : 'away', headgear: 'bare', skin: SKINS[player.id], hair: [0x30251e, 0x191715, 0x1e1915, 0x503829][player.id], seed: player.id * 13 + 5, scale });
    this.h.setNumber([1, 7, 23, 11][player.id]);
    // Everyone wears their own kit: sleeves, bands, shoes and a haircut.
    this.h.setGear([{ wristbands: true, color: 0xf1ead6, shoe: 0xf2f2ee, fade: 0.55 }, { headband: true, leg: 'L', color: 0xf1ead6, shoe: 0x1b1d22 },
      { sleeve: 'R', color: 0x17191d, shoe: 0xf2f2ee, fade: 0.85 }, { headband: true, wristbands: true, color: 0x17191d, shoe: 0xc45d3e, fade: 0.3 }][player.id]);
    this.root = this.h.root; this.root.name = `athlete-${player.name}`;
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
    // Each arm eases between jobs: the IK weight and its wrist follow the
    // target in body space, so a hand never pops from a dribble to a release.
    this.arms = { L: { weight: 0, local: new THREE.Vector3(), pole: new THREE.Vector3(), pitch: -1.4, roll: 0, wrist: 0 },
      R: { weight: 0, local: new THREE.Vector3(), pole: new THREE.Vector3(), pitch: -1.4, roll: 0, wrist: 0 } };
    this.crouch = 0; this.lean = 0; this.roll = 0; this.landTime = 0; this.lastJump = 0;
  }

  update(dt, time, p, engine, visible = true, viewPitch = null) {
    const h = this.h, firstPerson = viewPitch !== null;
    this.root.visible = this.shadow.visible = this.marker.visible = visible; if (!visible) return;
    h.setArmsOnly(firstPerson);
    h.mesh.castShadow = !firstPerson;
    this.marker.visible = !firstPerson;
    this.previous = h.snapshot(this.previous); h.reset();
    const owns = engine.ownerId === p.id, human = p.id === 0 && !engine.preview;
    const gathered = owns && (engine.ballState === 'held' || p.action === 'shooting');
    const charge = human ? engine.charge : p.charge, move = p.moveState, moveT = move ? clamp01(move.age / move.duration) : 0;
    const speed = p.vel.length(), hand = dribbleHand(p), dribbling = owns && !gathered;
    const following = ['follow', 'layup', 'dunk'].includes(p.action);
    const owner = engine.owner, ball = new THREE.Vector3().copy(engine.ball.pos);
    const ballGap = Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z);
    const rival = owner && owner.team !== p.team ? owner : null;
    const rivalGathering = rival && (engine.ballState === 'held' || rival.action === 'shooting');
    const shotLive = engine.ballState === 'flight' && engine.shot && engine.shot.team !== p.team && !engine.shot.first;
    const hoopGap = Math.hypot(CONFIG.hoop.x - p.pos.x, CONFIG.hoop.z - p.pos.z);
    // Going up at the rim the ball is in one hand; the other arm clears space.
    const finishing = gathered && p.jump > 0.1 && hoopGap < 2.9 && !(human && engine.hand);
    const celebrating = engine.checkTimer > 0 && engine.lastScore && engine.time - engine.lastScore.time < 2 && engine.lastScore.team === p.team;

    // A stepback is a real two-foot hop. A jump shooter also hops into a wide,
    // parallel base as the ball arrives in the pocket; finishes at the rim do not.
    const S = CONFIG.shot, jumper = (gathered || p.action === 'follow') && hoopGap >= 2.9 && !(human && engine.hand);
    const hop = move?.kind === 'stepback' ? Math.sin(Math.PI * moveT) * 0.09 : jumper && gathered && charge < 0.15 ? Math.sin(Math.PI * charge / 0.15) * 0.04 : 0;
    // The shooting shoulder sits a touch ahead of the other: about ten degrees of turn.
    this.turn = (this.turn || 0) + ((jumper ? 1 : 0) - (this.turn || 0)) * (1 - Math.exp(-dt * 9));
    this.root.position.set(p.pos.x, p.jump + hop, p.pos.z);
    const facing = p.action === 'pass' && !firstPerson ? p.passYaw : p.yaw;
    this.bodyYaw = firstPerson ? p.yaw : this.bodyYaw + THREE.MathUtils.clamp(wrappedAngle(this.bodyYaw, facing), -dt * 10, dt * 10);
    this.root.rotation.set(0, this.bodyYaw, 0);
    if (!firstPerson && move?.kind === 'spin') this.root.rotation.y += ease(moveT) * Math.PI * 2 * -move.fromSide;
    if (!firstPerson) this.root.rotation.y += 0.17 * p.side * this.turn;

    applyClip(h, p.defending && !owns ? 'set' : 'idle', time + this.id * 0.45);
    // The uploaded Mixamo take supplies the actual weight shift, shoulder and
    // arm motion. IK makes the hand meet the live ball without overriding rules.
    if (dribbling) { applyClip(h, 'dribble', p.dribble / 6.7); if (hand < 0) mirrorPose(h); }
    if (celebrating && !owns) applyClip(h, 'cheer', time + this.id * 0.2, 0.85, MASK_ARMS | MASK_TRUNK);
    if (speed > 0.08 && p.jump < 0.03) {
      this.phase += dt * Math.PI * 2 * speed / (strideAt(h, speed) || 1.8);
      applyLocomotion(h, this.phase, speed, 1, owns || p.defending ? MASK_LEGS : undefined);
    }

    // ---- posture: how low the hips sit and how the trunk leans for each job
    const localVelocity = new THREE.Vector3().copy(p.vel).applyAxisAngle(UP, -this.bodyYaw);
    const localAcceleration = new THREE.Vector3().copy(p.acceleration || V(0, 0, 0)).applyAxisAngle(UP, -this.bodyYaw);
    let crouch = 0, lean = localVelocity.z * 0.028 + localAcceleration.z * 0.002, roll = -localVelocity.x * 0.02 - localAcceleration.x * 0.003, twist = 0;
    if (dribbling) {
      // The source take is hunched over the ball; a live handler plays taller,
      // eyes up, and only sinks when the ball needs covering.
      crouch += 0.01 + 0.1 * p.protect; lean += -0.3 + 0.22 * p.protect;
      // Turn the lead shoulder into the defender to cover the ball.
      twist += hand * 0.3 * p.protect;
      if (move) {
        const wave = Math.sin(Math.PI * moveT), lateral = move.toSide;
        if (isTransfer(move.kind)) {
          // Sell it one way, then drop the shoulder and go the other.
          crouch += (move.kind === 'legs' ? 0.15 : 0.11) * wave; lean += 0.1 * wave;
          roll += lateral * (moveT < 0.28 ? 0.1 * Math.sin(Math.PI * moveT / 0.28) : -0.2 * Math.sin(Math.PI * (moveT - 0.28) / 0.72));
          twist += -lateral * 0.22 * wave;
        } else if (move.kind === 'spin') { crouch += 0.1 * wave; lean += 0.12 * wave; }
        else if (move.kind === 'stepback') { crouch += 0.07 * (1 - wave); lean += moveT < 0.5 ? -0.12 * wave : 0.1 * wave; }
        else if (move.kind === 'hesi') { crouch -= 0.045 * wave; lean -= 0.1 * wave; }
      }
      if (p.pump > 0) { crouch -= 0.02; lean -= 0.05; }
    }
    if (gathered) {
      // Dip, load and rise: the legs drive the shot before the arm does.
      // A quick, shallow load: the knees flex as the ball is set and are
      // already driving up when it starts forward. Straight up and down.
      crouch += 0.15 * Math.sin(Math.PI * clamp01(charge / S.takeoff)) + 0.03 * (1 - clamp01(charge / 0.16));
      lean += 0.07 * (1 - clamp01(charge / S.takeoff)) - 0.03 * clamp01((charge - S.takeoff) / 0.2);
    }
    if (following) lean -= p.action === 'follow' ? 0.02 : -0.05;
    if (p.action === 'reach') { const u = 1 - p.actionTime / 0.36; crouch += 0.1 * Math.sin(Math.PI * u); lean += 0.34 * Math.sin(Math.PI * u); }
    if (p.action === 'pass') { const u = 1 - p.actionTime / 0.42; lean += (p.passKind === 'lob' ? -0.08 : 0.16) * Math.sin(Math.PI * Math.min(1, u * 1.4)); }
    if (p.defending && !owns && rivalGathering && ballGap < 2.2) crouch -= 0.04;
    if (p.stagger) { crouch += 0.12; lean += 0.1; roll += Math.sin(p.stagger * 12) * 0.14; }
    if (p.jump > 0.03) lean -= 0.05;
    const smooth = 1 - Math.exp(-dt * 16);
    this.crouch += (crouch - this.crouch) * smooth; this.lean += (lean - this.lean) * smooth; this.roll += (roll - this.roll) * smooth;
    this.twist = (this.twist || 0) + (twist - (this.twist || 0)) * smooth;
    h.addRot('spine', THREE.MathUtils.clamp(this.lean, -0.2, 0.46), this.twist * 0.6, THREE.MathUtils.clamp(this.roll, -0.26, 0.26));
    h.addRot('chest', THREE.MathUtils.clamp(this.lean * 0.4, -0.1, 0.16), this.twist * 0.4, 0);
    h.bones.hips.position.y -= this.crouch;
    if (this.lastJump > 0 && !p.jump) this.landTime = 0.2;
    this.lastJump = p.jump;
    this.landTime = Math.max(0, this.landTime - dt);
    h.bones.hips.position.y -= Math.sin(Math.PI * this.landTime / 0.2) * 0.085;
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
    const receiving = engine.passInfo?.to === p.id && ball.distanceTo(localToWorld(V(0, 1.35, 0.2))) < 2.1;
    const securing = owns && engine.catchFrom && !gathered;
    const eyeTarget = (owns && !securing || following) ? new THREE.Vector3().copy(CONFIG.hoop) : ball;
    h.lookAt(eyeTarget, dribbling ? 0.7 : owns ? 0.4 : 0.5, 0.85);
    h.blendFrom(this.previous, 1 - Math.exp(-dt * 22));
    h.update();

    // ---- arms: one job per hand, eased in body space and solved with IK
    const loose = !owner && engine.ballState !== 'pass' && ballGap < 1.5;
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1, arm = this.arms[side];
      const strong = side === (hand > 0 ? 'R' : 'L');
      let target = null, pitch = null, roll = 0, rate = 16, snap = false;
      let pole = V(sign * 0.5, 1.08, -0.02);
      if (firstPerson && !strong && (gathered && charge > 0.24 || following)) {
        // Through the shooter's own eyes the guide hand slides off early and
        // stays low, so the forearm never crosses the view of the rim.
        target = localToWorld(V(sign * 0.36, 1.08, 0.34)); pitch = -1.7; roll = sign * 0.3; rate = 14; pole = V(sign * 0.6, 0.9, 0.05);
      } else if (finishing && !strong) {
        target = localToWorld(V(sign * 0.34, 1.34, 0.26)); pitch = -1.9; roll = sign * 0.3; rate = 18; pole = V(sign * 0.6, 1.1, 0.1);
      } else if (owns && (gathered || p.pump > 0) || securing || receiving) {
        // Shooting hand under and behind the ball, elbow beneath it; the guide
        // hand rides the side and never pushes.
        const under = (gathered || p.pump > 0) && strong;
        target = ball.clone().add(V(sign * (under ? 0.045 : 0.125), under ? -0.115 : -0.03, under ? -0.085 : -0.06).applyAxisAngle(UP, this.bodyYaw));
        pitch = under ? (finishing ? -2.35 : -1.92) : -1.72; roll = sign * (under ? 1.18 : 0.25); snap = !receiving;
        // Elbow in, under the ball and in line with the shoulder.
        pole = under ? V(sign * 0.21, 1.05, 0.5) : V(sign * 0.56, 1.0, 0.16);
        if (receiving) target.lerp(h.worldPos('hand' + side, _current), THREE.MathUtils.smoothstep(ball.distanceTo(_current), 0.45, 2.0));
        // The guide hand comes off as the shooting arm extends past the set point.
        if (gathered && !under && charge > S.takeoff + 0.1 && !finishing) { target = localToWorld(V(sign * 0.21, 1.6, 0.3)); pitch = -2.6; roll = sign * 0.2; snap = false; rate = 20; pole = V(sign * 0.6, 1.25, 0.2); }
      } else if (dribbling && strong) {
        // The hand rides the ball through the top of each bounce, pushes it
        // down, then waits for it rather than chasing it to the floor.
        const top = p.jump + dribbleTop(p);
        target = ball.clone().add(V(sign * 0.02, 0.128, -0.05).applyAxisAngle(UP, this.bodyYaw));
        if (!move || !isTransfer(move.kind)) target.y = Math.max(target.y, top - 0.2);
        else target.y = Math.max(target.y, p.jump + 0.5);
        pitch = dribbleInHand(p) || move ? -1.22 : -1.42; roll = -sign * 1.05; snap = true;
        pole = V(sign * 0.62, 1.05, -0.12);
      } else if (dribbling && move && isTransfer(move.kind) && moveT < 0.5) {
        // The other hand is already down, waiting for the ball to arrive.
        target = localToWorld(V(sign * 0.4, 0.62, move.kind === 'behind' ? -0.06 : move.kind === 'legs' ? 0.12 : 0.34));
        pitch = -1.3; roll = -sign * 0.9; rate = 22;
      } else if (dribbling && p.protect > 0.15) {
        // Arm bar: forearm up between the defender and the ball.
        target = localToWorld(V(sign * 0.2, 1.2, 0.4)); pitch = -2.3; roll = -sign * 1.3; rate = 9 + 8 * p.protect;
        pole = V(sign * 0.7, 1.15, 0.1);
      } else if (following) {
        // Hold the follow-through: full extension, wrist snapped over, while
        // the guide hand stays quiet where the ball left it.
        // A jump shooter locks the elbow out above the head with a loose wrist
        // and keeps it there until the ball is nearly at the rim.
        const total = p.action === 'follow' ? S.followThrough : 0.8, ending = p.action === 'follow' ? 0.3 : 0.38;
        const out = clamp01((total - p.actionTime) / 0.12), relax = clamp01((ending - p.actionTime) / ending);
        if (p.action === 'dunk' && strong) { target = new THREE.Vector3(CONFIG.hoop.x, CONFIG.hoop.y - 0.02 - relax * 0.5, CONFIG.hoop.z).addScaledVector(V(0, 0, -0.22).applyAxisAngle(UP, this.bodyYaw), 1); pitch = -1.1; }
        else if (strong) {
          const layup = p.action === 'layup';
          target = localToWorld(V(sign * 0.15, (layup ? 2.26 : 2.2) + 0.1 * out - 0.75 * ease(relax), (layup ? 0.36 : 0.38) + (layup ? 0.16 : 0.12) * out - 0.1 * ease(relax)));
          pitch = layup ? -2.3 + 0.9 * out : -1.9 + 1.25 * out; roll = sign * 0.5 * (1 - out);
          pole = layup ? V(sign * 0.3, 1.4, 0.5) : V(sign * 0.2, 1.5, 0.6);
        } else {
          target = localToWorld(V(sign * (p.action === 'follow' ? 0.24 : 0.34), (p.action === 'follow' ? 1.48 : 1.26) - 0.4 * ease(relax), 0.3)); pitch = -2.5; roll = sign * 0.2; pole = V(sign * 0.6, 1.2, 0.2);
        }
        rate = 26;
      } else if (p.action === 'pass') {
        // Step through the pass: thumbs down for a chest pass, pushed into
        // the floor for a bounce pass, a two-hand flick overhead for a lob.
        const out = ease(clamp01((0.42 - p.actionTime) / 0.1)), back = ease(clamp01((0.2 - p.actionTime) / 0.2));
        const reach = (0.3 + 0.42 * out) * (1 - 0.5 * back), kind = p.passKind;
        const local = kind === 'bounce' ? V(sign * 0.13, 1.2 - 0.3 * out, reach) : kind === 'lob' ? V(sign * 0.14, 1.75 + 0.5 * out, 0.1 + reach * 0.5) : V(sign * 0.13, 1.28 + 0.04 * out, reach);
        target = new THREE.Vector3(p.pos.x, p.jump, p.pos.z).add(local.multiplyScalar(this.root.scale.y).applyAxisAngle(UP, firstPerson ? p.passYaw : this.bodyYaw));
        pitch = kind === 'bounce' ? -1.0 : kind === 'lob' ? -2.2 : -1.45; roll = sign * 0.9; rate = 30;
      } else if (p.action === 'reach') {
        // One hand goes for the ball, the other stays home for balance.
        const u = Math.sin(Math.PI * clamp01(1 - p.actionTime / 0.36)), near = localToWorld(V(sign * 0.2, 1, 0.2)).distanceTo(p.reach) <= localToWorld(V(-sign * 0.2, 1, 0.2)).distanceTo(p.reach);
        if (near) { target = localToWorld(V(sign * 0.28, 0.95, 0.3)).lerp(new THREE.Vector3().copy(p.reach), Math.pow(u, 0.6)); pitch = -1.5; roll = -sign * 0.7; rate = 34; }
        else { target = localToWorld(V(sign * 0.46, 1.02, -0.05)); pitch = -1.2; rate = 14; }
      } else if (p.jump > 0.03 && !owns) {
        // In the air without the ball: the nearer hand goes and gets it, the
        // other trails. With nothing to reach for, both go straight up.
        const nearest = localToWorld(V(sign * 0.2, 1.6, 0)).distanceTo(ball) <= localToWorld(V(-sign * 0.2, 1.6, 0)).distanceTo(ball);
        const reachable = ballGap < 1.5 && ball.y > p.jump + 1.2;
        if (reachable && (nearest || !shotLive && !rivalGathering)) { target = ball.clone(); target.y = Math.max(target.y, p.jump + 1.7); pitch = -2.95; roll = sign * 0.2; rate = 30; }
        else if (reachable) { target = localToWorld(V(sign * 0.36, 1.42, 0.12)); pitch = -1.9; }
        else { target = localToWorld(V(sign * 0.21, 2.26, 0.14)); pitch = -3.0; }
        pole = V(sign * 0.55, 1.5, 0.4);
      } else if (loose && ball.y < 1.3 && ballGap < 1.1) {
        target = ball.clone().add(V(sign * 0.12, 0.02, 0).applyAxisAngle(UP, this.bodyYaw)); pitch = -1.1; rate = 20;
      } else if (p.stagger) {
        target = localToWorld(V(sign * 0.62, 0.95 + Math.sin(p.stagger * 12 + sign) * 0.12, 0.22)); pitch = -1.3; rate = 12;
      } else if (p.defending && !owns) {
        // Active hands. On the ball: mirror it low with the near hand and take
        // away the pass with the other. On a shot: hand straight up in its face.
        const near = sign * (localToWorld(V(1, 0, 0)).sub(this.root.position).dot(ball.clone().sub(this.root.position))) >= 0;
        if (rivalGathering && ballGap < 2.3 || shotLive && ballGap < 2.3) {
          if (near) { target = localToWorld(V(sign * 0.16, 2.2, 0.34)); pitch = -3.0; roll = sign * 0.15; rate = 20; pole = V(sign * 0.5, 1.5, 0.45); }
          else { target = localToWorld(V(sign * 0.36, 1.3, 0.22)); pitch = -1.9; }
        } else if (rival && ballGap < 2.6) {
          if (near) {
            const toward = ball.clone().sub(localToWorld(V(sign * 0.2, 1.1, 0.1)));
            target = localToWorld(V(sign * 0.3, 0, 0.36)).addScaledVector(V(toward.x, 0, toward.z).normalize(), 0.16);
            target.y = p.jump + THREE.MathUtils.clamp(ball.y, 0.72, 1.25); pitch = -1.6; roll = -sign * 0.5; rate = 11;
          } else { target = localToWorld(V(sign * 0.56, 1.5, 0.2)); pitch = -2.6; roll = sign * 0.4; rate = 9; }
        } else { target = localToWorld(V(sign * 0.5, side === 'R' ? 1.4 : 1.1, 0.26)); pitch = -1.9; rate = 8; }
      }
      // Ease the IK in and out against the authored clip underneath.
      const follow = 1 - Math.exp(-dt * rate);
      h.worldPos('hand' + side, _current);
      if (target) {
        const local = this.root.worldToLocal(target.clone());
        if (snap || arm.weight < 0.02) arm.local.copy(local); else arm.local.lerp(local, follow);
        arm.weight += (1 - arm.weight) * (snap ? 1 - Math.exp(-dt * 40) : follow);
        arm.pole.copy(pole);
        if (pitch !== null) { const k = arm.wrist < 0.02 ? 1 : follow; arm.pitch += (pitch - arm.pitch) * k; arm.roll += (roll - arm.roll) * k; arm.wrist += (1 - arm.wrist) * follow; }
        else arm.wrist *= Math.exp(-dt * 12);
      } else { arm.weight *= Math.exp(-dt * 11); arm.wrist *= Math.exp(-dt * 11); }
      if (arm.weight > 0.015) {
        const goal = localToWorld(arm.local.clone());
        h.ikArm(side, _current.lerp(goal, arm.weight), localToWorld(arm.pole.clone()));
        if (arm.wrist > 0.25) {
          _quat.setFromEuler(_euler.set(arm.pitch, 0, arm.roll, 'XZY'));
          h.setWorldQuat('hand' + side, _quat.premultiply(this.root.quaternion));
        }
      }
    }
    h.update();
    if (!firstPerson) {
      // Wide and staggered for a between-the-legs dribble; shooting foot a
      // touch ahead in the gather; airborne through a stepback hop.
      let stance = null;
      if (move?.kind === 'legs') { const w = Math.sin(Math.PI * moveT); stance = { width: 0.2 + 0.05 * w, lead: move.toSide > 0 ? 'R' : 'L', split: 0.34 * w }; }
      else if (dribbling && p.protect > 0.3) stance = { width: 0.2 + 0.06 * p.protect, lead: hand > 0 ? 'L' : 'R', split: 0.16 * p.protect };
      // Wide, feet parallel, shooting foot barely ahead: the same base every time.
      else if (jumper) stance = { width: 0.215, lead: p.side > 0 ? 'R' : 'L', split: 0.035 };
      this.footwork.update(dt, p, h, gathered, stance, hop);
      if (p.jump + hop < 0.02) h.groundGuard(0.004);
    }
    this.shadow.position.set(p.pos.x, 0.027, p.pos.z); this.shadow.material.opacity = 0.6 / (1 + p.jump);
    // The ring under the ball handler brightens; everyone else stays quiet.
    this.marker.position.set(p.pos.x, 0.031, p.pos.z);
    this.marker.material.opacity = (p.team === 0 ? 0.5 : 0.2) + (owns ? 0.3 : 0);
    this.marker.scale.setScalar(owns ? 1.12 + Math.sin(time * 5) * 0.03 : 1);
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
