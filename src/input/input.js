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
    this.moveArmed = true; this.headHistory = []; this.pendingMove = null;
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
    this.pendingMove = null; this.headHistory = []; this.left.reset(); this.right.reset();
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
      this.headHistory = [];
      return;
    }
    this.viewerTracked = true;
    copyPose(this.headRef, viewer); this.rig.getWorldQuaternion(worldQ);
    {
      // The physical head path (reference space, so a snap turn is not a spin).
      const forward = new Vec3(0, 0, -1).applyQuat(this.headRef.q); forward.y = 0; forward.normalize();
      this.headHistory.push({ t, ref: this.headRef.p.clone(), yaw: Math.atan2(forward.x, -forward.z), forward });
      if (this.headHistory.length > 40) this.headHistory.shift();
    }
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
      // ---- Headset. Ball hand (dominant): trigger holds the ball and a real
      // throw releases it; A/X jumps. Off hand: trigger is boost, the lower
      // button passes, the upper button opens the menu. Either grip: a dribble
      // move, chosen by what your hands and head do around the press.
      const main = this[settings.dominant], off = this[settings.dominant === 'right' ? 'left' : 'right'];
      const headForward = new Vec3(0, 0, -1).applyQuat(this.head.q); headForward.y = 0; headForward.normalize();
      const right = new Vec3(-headForward.z, 0, headForward.x);
      cmd.aim.copy(headForward);
      // Left stick runs. A radial dead zone, rescaled, so speed builds from zero
      // instead of jumping in.
      const stick = this.left.stick, magnitude = Math.hypot(stick.x, stick.y), dead = 0.12;
      if (magnitude > dead) {
        const k = Math.min(1, (magnitude - dead) / (1 - dead)) / magnitude;
        cmd.move.addScaled(headForward, -stick.y * k).addScaled(right, stick.x * k);
      }
      cmd.sprint = off.buttons.trigger.pressed || this.left.buttons.stick.pressed;
      if (settings.locomotion === 'blink') {
        const moving = cmd.move.length() > 0.65;
        if (moving && this.moveArmed) { cmd.blinkStep = true; this.moveArmed = false; this.push('blink', true); this.blinkUntil = this.lastTime + 0.38; }
        else cmd.move.set(0, 0, 0);
        if (!moving || this.lastTime > this.blinkUntil) this.moveArmed = true;
      }
      if (settings.turn === 'snap') {
        if (Math.abs(this.right.stick.x) > 0.65 && this.snapArmed) { this.rig.rotation.y -= Math.sign(this.right.stick.x) * Math.PI / 6; this.snapArmed = false; this.push('blink', true); this.refreshWorld(); }
        if (Math.abs(this.right.stick.x) < 0.3) this.snapArmed = true;
      } else if (settings.turn === 'smooth' && Math.abs(this.right.stick.x) > 0.2) { this.rig.rotation.y -= this.right.stick.x * dt * 2.4; this.refreshWorld(); }
      if (off.buttons.b.down || this.right.buttons.stick.down) this.onPause();
      if (!this.enabled) return cmd;
      if (main.buttons.a.down) cmd.jump = true;
      if (off.buttons.a.down || main.buttons.b.down) cmd.pass = 'auto';
      for (const c of [main, off]) if (c.tracked) cmd.hands.push(this.ballPoint(c));
      const now = this.lastTime, p = engine.human;
      if (main.tracked) { cmd.handVel = main.linVel.clone(); cmd.handReach = this.ballPoint(main); }
      if (engine.ownerId === 0) {
        cmd.defend = false;
        const holding = engine.ballState === 'held';
        if (!main.tracked) {
          if (holding) cmd.cancelGather = true;
        } else {
          // The ball sits in the palm of the shooting hand.
          // (Held through a check or a catch, it is in your hand as soon as it can be.)
          if (main.buttons.trigger.pressed && engine.ballState === 'dribble') cmd.gather = true;
          if (holding || cmd.gather) cmd.hand = this.ballPoint(main);
          if (holding && main.buttons.trigger.up) {
            const v = main.releaseVelocity(now), speed = v.length(), forward = v.dot(headForward), at = this.ballPoint(main);
            const team = engine.mode === '2v2';
            // Letting go without a throw is not a shot: the ball stays yours.
            if (speed < 1.1) cmd.release = { kind: 'cancel' };
            else if (v.y < -0.9) cmd.release = team && forward > 1.3 ? { kind: 'pass', passKind: 'bounce' } : { kind: 'bounce' };
            else if (team && v.y < 0.55 && forward > 1.6 && at.y < this.head.p.y - 0.12) cmd.release = { kind: 'pass', passKind: 'chest' };
            else cmd.release = { kind: 'shot', velocity: v, position: at };
          }
          // A dunk take-off puts the ball in your hand; back on the floor
          // without the trigger held, you are dribbling again.
          if (holding && !main.buttons.trigger.pressed && !main.buttons.trigger.up && p.jump === 0 && !p.dunkJump) cmd.cancelGather = true;
        }
        if (engine.ballState === 'dribble' && !cmd.gather) {
          const ballHand = this[dribbleHand(p) > 0 ? 'right' : 'left'];
          if (ballHand.tracked) {
            cmd.hand = ballHand.gripPose.p.clone();
            cmd.bounceSpeed = Math.max(0, -ballHand.linVel.y - 0.8);
          }
          const m = p.moveState;
          if (m && (m.kind === 'cross' || m.kind === 'behind') && this.left.tracked && this.right.tracked) {
            const u = Math.min(1, m.age / m.duration);
            const from = m.fromSide > 0 ? this.right : this.left, to = m.toSide > 0 ? this.right : this.left;
            cmd.hand = new Vec3().lerpVectors(from.gripPose.p, to.gripPose.p, u * u * (3 - 2 * u));
            cmd.hand.addScaled(headForward, Math.sin(Math.PI * u) * (m.kind === 'behind' ? -0.57 : 0.12));
          }
          // A grip asks for a move; what your body does picks which one.
          const gripped = [main, off].find(c => c.buttons.squeeze.down);
          if (gripped && !this.pendingMove) this.pendingMove = { t: now, main: gripped === main, stickBack: this.left.stick.y > 0.6 };
          if (this.pendingMove && now - this.pendingMove.t >= 0.12) {
            cmd.moveAction = this.chooseMove(this.pendingMove);
            this.pendingMove = null;
          }
        } else this.pendingMove = null;
      } else {
        this.pendingMove = null;
        // Defence: hold a grip for a stance, trigger to reach. A real swipe
        // through the handler's ball is a reach too.
        cmd.defend = main.buttons.squeeze.pressed || off.buttons.squeeze.pressed;
        if (main.buttons.trigger.down) cmd.steal = true;
        if (engine.owner && engine.owner.team !== 0 && engine.ballState === 'dribble') {
          for (const c of [main, off]) if (c.tracked && c.linVel.length() > 2.2 && this.ballPoint(c).distanceTo(engine.ball.pos) < 0.32) cmd.steal = true;
        }
      }
    }
    for (const a of this.actions.splice(0)) cmd[a.key] = a.value;
    return cmd;
  }
  // Where a held ball sits: in the palm, which faces the controller's -X on
  // the right hand and +X on the left (WebXR grip space), a ball's radius
  // plus the thickness of the hand away from the handle.
  ballPoint(c, out = new Vec3()) {
    const side = c.hand === 'right' ? -1 : 1;
    return out.set(side * 0.15, 0.01, -0.02).applyQuat(c.gripPose.q).add(c.gripPose.p);
  }
  // Which dribble move a grip press meant, from the ball hand's path and the
  // head's turn over the last fraction of a second (in the body's own frame).
  chooseMove(pending) {
    // Everything is measured in the headset's own room space, so running or
    // turning with the sticks never looks like a hand or head movement. The
    // hand that moved most is the one that made the move.
    const from = pending.t - 0.2, heads = this.headHistory.filter(h => h.t >= from);
    const fallback = pending.main ? 'cross' : 'hesi';
    if (heads.length < 2) return pending.stickBack ? 'stepback' : fallback;
    const forward = heads[0].forward, right = new Vec3(-forward.z, 0, forward.x);
    const headAt = t => heads.reduce((best, h) => Math.abs(h.t - t) < Math.abs(best.t - t) ? h : best, heads[0]);
    const read = c => {
      const samples = c.history.filter(h => h.t >= from); if (samples.length < 3) return null;
      const path = samples.map(h => { const d = h.ref.clone().sub(headAt(h.t).ref); return { x: d.dot(right), y: d.y, z: d.dot(forward) }; });
      const first = path[0], last = path[path.length - 1];
      return { across: Math.abs(last.x - first.x), back: last.z - first.z, lift: last.y - first.y, lowest: Math.min(...path.map(r => r.y)), rearmost: Math.min(...path.map(r => r.z)),
        travel: Math.hypot(last.x - first.x, last.y - first.y, last.z - first.z) };
    };
    const reads = [this.left, this.right].map(read).filter(Boolean).sort((a, b) => b.travel - a.travel), r = reads[0];
    const a = heads[0], b = heads[heads.length - 1];
    const turn = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
    const stepBack = -b.ref.clone().sub(a.ref).dot(forward);
    if (turn > 0.55) return 'spin';
    if (r && r.across > 0.14) return r.rearmost < -0.04 ? 'behind' : r.lowest < -1.0 ? 'legs' : 'cross';
    if (r && r.back < -0.15 || stepBack > 0.1 || pending.stickBack) return 'stepback';
    if (r && r.lift > 0.1) return 'hesi';
    return fallback;
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
