import * as THREE from 'three';
import { dribbleHand, MOVES } from '../game/movement.js';
import { Controller } from './controller.js';
import { Vec3, Quat, Pose } from '../physics/math.js';

const worldQ = new THREE.Quaternion(), worldP = new THREE.Vector3();
const copyPose = (out, pose) => { const t = pose.transform; out.p.copy(t.position); out.q.copy(t.orientation); };

export class Input {
  constructor(renderer, rig, camera, canvas) {
    this.renderer = renderer; this.rig = rig; this.camera = camera; this.canvas = canvas;
    this.left = new Controller('left'); this.right = new Controller('right');
    this.head = new Pose(); this.headRef = new Pose(); this.keys = new Set(); this.actions = [];
    this.yaw = Math.PI; this.pitch = -0.02; this.enabled = false; this.mouseHeld = false;
    this.touchMove = { x: 0, z: 0 }; this.touchShoot = false; this.touchGuard = false; this.lastTime = 0; this.snapArmed = true;
    this.moveArmed = true; this.gestureTime = -10; this.physicalGather = null; this.suppressRelease = false;
    this.onPause = () => {}; this.onLook = () => {}; this.onCamera = () => {};
    window.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyM') { this.onPause(); return; }
      if (!this.enabled || this.xr) return;
      if (e.code === 'KeyV') { this.onCamera(); return; }
      const map = { KeyQ: ['moveAction', 'cross'], KeyE: ['moveAction', 'behind'], KeyR: ['moveAction', 'spin'],
        KeyC: ['moveAction', 'stepback'], KeyZ: ['moveAction', 'legs'], KeyT: ['moveAction', 'hesi'],
        Space: ['jump', true], KeyF: ['steal', true], KeyX: ['pass', 'auto'], KeyG: ['pass', 'bounce'], KeyB: ['pass', 'lob'] };
      if (map[e.code]) this.push(...map[e.code]);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.clear(); if (this.enabled) this.onPause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (this.enabled) this.onPause(); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (!this.enabled || this.xr || e.pointerType === 'touch') return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
      if (e.button === 0) { this.mouseHeld = true; this.push('gather', true); }
      if (e.button === 2) this.push('steal', true);
    });
    window.addEventListener('pointerup', e => {
      if (e.button === 0 && this.mouseHeld) { this.mouseHeld = false; if (this.enabled) this.push('release', {}); }
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.enabled || this.xr || e.pointerType === 'touch') return;
      if (document.pointerLockElement === canvas || e.buttons === 4) {
        this.yaw -= e.movementX * 0.0025; this.pitch = Math.max(-1.1, Math.min(0.8, this.pitch - e.movementY * 0.0025));
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.enabled && !this.xr && !this.intentionalUnlock) this.onPause();
      this.intentionalUnlock = false;
    });
    this.setupTouch();
  }
  get xr() { return this.renderer.xr.isPresenting; }
  push(key, value) { this.actions.push({ key, value }); }
  clear() {
    this.keys.clear(); this.actions = []; this.mouseHeld = false; this.touchShoot = false; this.touchGuard = false; this.touchMove = { x: 0, z: 0 };
    this.physicalGather = null; this.suppressRelease = true; this.left.reset(); this.right.reset();
  }
  unlock() { this.intentionalUnlock = true; document.exitPointerLock?.(); }
  async lock() { if (!this.xr && !matchMedia('(pointer: coarse)').matches) try { await this.canvas.requestPointerLock?.(); } catch {} }
  update(t, frame) {
    this.lastTime = t;
    this.viewerTracked = false;
    if (!this.xr) {
      this.camera.getWorldPosition(worldP); this.camera.getWorldQuaternion(worldQ);
      this.head.p.copy(worldP); this.head.q.copy(worldQ); return;
    }
    const session = this.renderer.xr.getSession(), ref = this.renderer.xr.getReferenceSpace();
    const viewer = ref && frame ? frame.getViewerPose(ref) : null;
    if (!viewer) {
      for (const c of [this.left, this.right]) { c.tracked = false; c.reset(); }
      return;
    }
    this.viewerTracked = true;
    copyPose(this.headRef, viewer); this.rig.getWorldQuaternion(worldQ);
    const rq = new Quat().copy(worldQ);
    for (const c of [this.left, this.right]) {
      const source = [...session.inputSources].find(s => s.handedness === c.hand && s.gripSpace);
      const pose = source ? frame.getPose(source.gripSpace, ref) : null;
      c.connected = !!source; c.source = source;
      if (!pose) { c.tracked = false; c.reset(); continue; }
      c.tracked = true; copyPose(c.gripRef, pose);
      c.gripPose.p.copy(c.gripRef.p).applyQuat(rq).add(this.rig.position);
      c.gripPose.q.copy(rq).multiply(c.gripRef.q);
      const ray = frame.getPose(source.targetRaySpace, ref);
      if (ray) { copyPose(c.rayPose, ray); c.rayPose.p.applyQuat(rq).add(this.rig.position); c.rayPose.q.copy(rq).multiply(new Quat().copy(ray.transform.orientation)); }
      const reacquired = c.previousTime < 0;
      c.record(t, rq, pose.linearVelocity || null);
      const gp = source.gamepad, b = gp?.buttons || [], axes = gp?.axes || [];
      for (const [name, i] of Object.entries({ trigger: 0, squeeze: 1, stick: 3, a: 4, b: 5 })) {
        const button = c.buttons[name]; button.set(b[i]?.pressed || b[i]?.value > 0.55, b[i]?.value || 0);
        if (reacquired) button.down = button.up = false;
      }
      c.stick.x = axes.length >= 4 ? axes[2] : axes[0] || 0; c.stick.y = axes.length >= 4 ? axes[3] : axes[1] || 0;
    }
    this.refreshWorld();
  }
  refreshWorld() {
    this.rig.getWorldQuaternion(worldQ); const rq = new Quat().copy(worldQ);
    this.head.p.copy(this.headRef.p).applyQuat(rq).add(this.rig.position); this.head.q.copy(rq).multiply(this.headRef.q);
    for (const c of [this.left, this.right]) if (c.tracked) {
      c.gripPose.p.copy(c.gripRef.p).applyQuat(rq).add(this.rig.position); c.gripPose.q.copy(rq).multiply(c.gripRef.q);
    }
  }
  command(dt, settings, engine) {
    const cmd = { move: new Vec3(), aim: new Vec3(), hands: [], manualDribble: !settings.autoDribble };
    if (!this.enabled) return cmd;
    if (!this.xr) {
      const forward = new Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new Vec3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const f = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchMove.z;
      const r = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touchMove.x;
      cmd.move.addScaled(forward, f).addScaled(right, r);
      cmd.aim.copy(forward); cmd.aim.y = Math.sin(this.pitch);
      cmd.defend = this.touchGuard || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      cmd.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      cmd.autoJump = true;
      // Holding through the check-ball cue gathers as soon as play is live.
      // The release remains a single event, so this cannot auto-fire shots.
      if ((this.mouseHeld || this.touchShoot) && engine.ownerId === 0 && engine.ballState === 'dribble') cmd.gather = true;
    } else {
      const main = this[settings.dominant], off = this[settings.dominant === 'right' ? 'left' : 'right'];
      const headForward = new Vec3(0, 0, -1).applyQuat(this.head.q); headForward.y = 0; headForward.normalize();
      const right = new Vec3(-headForward.z, 0, headForward.x);
      cmd.aim.copy(headForward);
      const move = this.left.stick;
      cmd.move.addScaled(headForward, -move.y).addScaled(right, move.x);
      if (cmd.move.length() < 0.18) cmd.move.set(0, 0, 0);
      cmd.sprint = this.left.buttons.stick.pressed;
      if (settings.locomotion === 'blink') {
        const moving = cmd.move.length() > 0.65;
        if (moving && this.moveArmed) { cmd.blinkStep = true; this.moveArmed = false; this.push('blink', true); this.blinkUntil = this.lastTime + 0.38; }
        else cmd.move.set(0, 0, 0);
        if (!moving || this.lastTime > this.blinkUntil) this.moveArmed = true;
      }
      if (settings.turn === 'snap') {
        if (Math.abs(this.right.stick.x) > 0.65 && this.snapArmed) { this.rig.rotation.y -= Math.sign(this.right.stick.x) * Math.PI / 6; this.snapArmed = false; this.push('blink', true); this.refreshWorld(); }
        if (Math.abs(this.right.stick.x) < 0.3) this.snapArmed = true;
      } else if (settings.turn === 'smooth' && Math.abs(this.right.stick.x) > 0.2) { this.rig.rotation.y -= this.right.stick.x * dt * 1.8; this.refreshWorld(); }
      if (off.buttons.b.down || this.right.buttons.stick.down) this.onPause();
      if (!this.enabled) return cmd;
      if (off.buttons.a.down) cmd.jump = true;
      // Held sprint turns the two face buttons into the tighter handles.
      const tight = this.left.buttons.stick.pressed;
      if (main.buttons.a.down) cmd.moveAction = tight ? 'legs' : 'cross';
      if (main.buttons.b.down) cmd.moveAction = tight ? 'hesi' : 'behind';
      if (this.right.stick.y < -0.7 && !this.verticalStick) { cmd.moveAction = 'spin'; this.verticalStick = true; }
      if (this.right.stick.y > 0.7 && !this.verticalStick) { cmd.moveAction = 'stepback'; this.verticalStick = true; }
      if (Math.abs(this.right.stick.y) < 0.3) this.verticalStick = false;
      cmd.defend = off.buttons.squeeze.pressed;
      if (main.buttons.trigger.down && engine.owner?.team !== 0) cmd.steal = true;
      if (main.buttons.squeeze.down && engine.owner?.team !== 0) cmd.steal = true;
      if (off.buttons.trigger.down) cmd.pass = 'auto';
      for (const c of [main, off]) if (c.tracked) cmd.hands.push(c.gripPose.p.clone());
      if (engine.ownerId === 0) {
        let c = this.physicalGather ? this[this.physicalGather] : main;
        if (!c.tracked) { cmd.cancelGather = engine.ballState === 'held'; this.physicalGather = null; this.suppressRelease = true; }
        const candidate = [main, off].find(h => h.tracked && h.buttons.squeeze.down);
        if (candidate) { cmd.cancelGather = false; this.physicalGather = candidate.hand; c = candidate; cmd.gather = true; this.suppressRelease = false; }
        if (main.tracked && main.buttons.trigger.down) { cmd.gather = true; this.suppressRelease = false; }
        if (c.tracked) {
          cmd.hand = c.gripPose.p.clone().add(new Vec3(0, 0.03, -0.06).applyQuat(c.gripPose.q));
          if (!cmd.gather && !this.physicalGather && engine.ballState === 'dribble') {
            const p = engine.human;
            const ballHand = this[dribbleHand(p) > 0 ? 'right' : 'left'];
            if (ballHand.tracked) {
              cmd.hand = ballHand.gripPose.p.clone();
              cmd.bounceSpeed = Math.max(0, -ballHand.linVel.y - 0.8);
            }
            const m = p.moveState;
            if (m && (m.kind === 'cross' || m.kind === 'behind') && this.left.tracked && this.right.tracked) {
              const u = Math.min(1, m.age / m.duration);
              const from = m.fromSide > 0 ? this.right : this.left;
              const to = m.toSide > 0 ? this.right : this.left;
              cmd.hand.lerpVectors(from.gripPose.p, to.gripPose.p, u * u * (3 - 2 * u));
              cmd.hand.addScaled(headForward, Math.sin(Math.PI * u) * (m.kind === 'behind' ? -0.57 : 0.12));
            }
          }
          if ((c.buttons.squeeze.up && this.physicalGather === c.hand) && !this.suppressRelease) {
            const v = c.releaseVelocity(this.lastTime);
            const forwardSpeed = v.dot(headForward);
            // A real throw decides what it is: down and out is a bounce pass,
            // flat from the chest a chest pass, straight down a dribble.
            const team = engine.mode === '2v2';
            const kind = v.y < -0.65 ? (team && forwardSpeed > 1.3 ? 'pass' : 'bounce') : team && v.y < 0.5 && forwardSpeed > 1.4 && cmd.hand.y < this.head.p.y - 0.12 ? 'pass' : 'shot';
            cmd.release = { kind, passKind: v.y < -0.65 ? 'bounce' : 'chest', velocity: v, position: cmd.hand.clone() }; this.physicalGather = null;
          }
        }
        if (!cmd.release && main.tracked && main.buttons.trigger.up && !this.physicalGather && !this.suppressRelease) cmd.release = {};
        // Low, lateral hand sweeps read as a crossover; a hand behind the hip
        // reads as a wrap. They share the same stamina/cooldown as buttons.
        const dribbler = this[dribbleHand(engine.human) > 0 ? 'right' : 'left'];
        if (!this.physicalGather && dribbler.tracked && engine.ballState === 'dribble' && this.lastTime - this.gestureTime > 0.6) {
          const local = dribbler.gripPose.p.clone().sub(this.head.p);
          const lateral = local.dot(right), across = dribbler.linVel.dot(right);
          if (dribbler.gripPose.p.y < this.head.p.y - 0.3 && Math.abs(across) > 1.15 && lateral * across < -0.04) {
            cmd.moveAction = local.dot(headForward) < -0.08 ? 'behind' : 'cross'; this.gestureTime = this.lastTime;
          }
        }
      } else this.physicalGather = null;
    }
    for (const a of this.actions.splice(0)) cmd[a.key] = a.value;
    return cmd;
  }
  setupTouch() {
    const zone = document.getElementById('touch-stick'), nub = zone?.querySelector('span');
    let touchId = null, start = null;
    zone?.addEventListener('pointerdown', e => { if (!this.enabled || touchId !== null) return; e.preventDefault(); touchId = e.pointerId; start = { x: e.clientX, y: e.clientY }; zone.setPointerCapture(e.pointerId); });
    zone?.addEventListener('pointermove', e => {
      if (e.pointerId !== touchId) return; const dx = (e.clientX - start.x) / 45, dy = (e.clientY - start.y) / 45;
      const l = Math.max(1, Math.hypot(dx, dy)); this.touchMove = { x: dx / l, z: dy / l };
      nub.style.transform = `translate(${dx / l * 30}px,${dy / l * 30}px)`;
    });
    const reset = e => { if (e.pointerId !== touchId) return; touchId = null; this.touchMove = { x: 0, z: 0 }; if (nub) nub.style.transform = ''; };
    zone?.addEventListener('pointerup', reset); zone?.addEventListener('pointercancel', reset);
    for (const button of document.querySelectorAll('[data-action]')) {
      let pointer = null;
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); if (!this.enabled || pointer !== null) return; pointer = e.pointerId; button.setPointerCapture(pointer);
        const action = button.dataset.action;
        if (action === 'shoot') { this.touchShoot = true; this.push('gather', true); }
        else if (action === 'camera') this.onCamera();
        else if (action === 'defend') this.touchGuard = true;
        else if (MOVES.includes(action)) this.push('moveAction', action);
        else this.push(action, action === 'pass' ? 'auto' : true);
      });
      const release = e => {
        if (e.pointerId !== pointer) return;
        pointer = null;
        if (button.dataset.action === 'defend') this.touchGuard = false;
        if (button.dataset.action === 'shoot' && this.touchShoot) {
          this.touchShoot = false;
          if (this.enabled) {
            if (e.type === 'pointerup') this.push('release', {});
            else this.push('cancelGather', true);
          }
        }
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    }
    // Drag the empty right half to look; the action buttons keep their own capture.
    let look = null;
    this.canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && this.enabled) { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); } });
    this.canvas.addEventListener('pointermove', e => { if (look?.id !== e.pointerId) return; this.yaw -= (e.clientX - look.x) * 0.006; this.pitch = Math.max(-0.8, Math.min(0.6, this.pitch - (e.clientY - look.y) * 0.004)); look.x = e.clientX; look.y = e.clientY; });
    const endLook = e => { if (look?.id === e.pointerId) look = null; };
    this.canvas.addEventListener('pointerup', endLook); this.canvas.addEventListener('pointercancel', endLook);
  }
}
