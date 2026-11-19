import * as THREE from 'three';
import { CONFIG, MODES } from '../config.js';

export class XRUI {
  constructor(scene, input, engine, settings, hooks) {
    Object.assign(this, { scene, input, engine, settings, hooks }); this.mode = '1v1'; this.hover = -1; this.buttons = [];
    this.menuCanvas = document.createElement('canvas'); this.menuCanvas.width = 1000; this.menuCanvas.height = 1120;
    this.menuTexture = new THREE.CanvasTexture(this.menuCanvas); this.menuTexture.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.624), new THREE.MeshBasicMaterial({ map: this.menuTexture, transparent: true, side: THREE.DoubleSide, depthTest: false }));
    this.panel.renderOrder = 100; scene.add(this.panel); this.panel.visible = false;
    this.hudCanvas = document.createElement('canvas'); this.hudCanvas.width = 1024; this.hudCanvas.height = 320;
    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas); this.hudTexture.colorSpace = THREE.SRGBColorSpace;
    // The score and clock live on your off-hand wrist: raise it to read them.
    this.hud = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshBasicMaterial({ map: this.hudTexture, transparent: true, depthTest: false }));
    this.hud.renderOrder = 90; scene.add(this.hud); this.hud.visible = false;
    // Calls ("BUCKET.", "SHOT CLOCK.") float briefly low in front of you, then go.
    this.callCanvas = document.createElement('canvas'); this.callCanvas.width = 1024; this.callCanvas.height = 160;
    this.callTexture = new THREE.CanvasTexture(this.callCanvas); this.callTexture.colorSpace = THREE.SRGBColorSpace;
    this.call = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.14), new THREE.MeshBasicMaterial({ map: this.callTexture, transparent: true, depthTest: false, opacity: 0 }));
    this.call.renderOrder = 91; scene.add(this.call); this.call.visible = false; this.callShown = '';
    this.ray = new THREE.Raycaster(); this.ray.far = 5;
    this.rays = [input.left, input.right].map(() => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2)]), new THREE.LineBasicMaterial({ color: 0xf5d8ac, transparent: true, opacity: 0.65, depthTest: false }));
      scene.add(l); l.visible = false; l.renderOrder = 110; return l;
    });
    this.message = ''; this.messageUntil = 0; this.tick = 0;
  }
  open(mode) { this.mode = mode || this.mode; this.panel.visible = true; this.placePending = true; this.hover = -1; this.openedAt = performance.now() / 1000; this.drawMenu(); }
  close() { this.panel.visible = false; for (const ray of this.rays) ray.visible = false; }
  button(x, y, w, h, text, action, selected = false) { this.buttons.push({ x, y, w, h, text, action, selected }); }
  drawMenu() {
    const c = this.menuCanvas.getContext('2d'), e = this.engine; c.clearRect(0, 0, 1000, 1120);
    c.fillStyle = '#193e3bf5'; c.beginPath(); c.roundRect(0, 0, 1000, 1120, 40); c.fill();
    c.strokeStyle = '#e9dcb855'; c.lineWidth = 2; c.stroke();
    c.textAlign = 'left'; c.fillStyle = '#d2c5a7'; c.font = 'bold 22px Arial'; c.fillText('R I M R U N  /  T H E  F I E L D H O U S E', 65, 70);
    c.fillStyle = '#f6e9cd'; c.font = 'italic 900 86px Arial'; c.fillText(e.phase === 'result' ? 'RUN IT BACK.' : e.phase === 'paused' ? 'TAKE A BREATHER.' : 'OWN THE COURT.', 60, 180, 880);
    c.fillStyle = '#ffd09a'; c.font = 'bold 27px Arial';
    c.fillText(e.phase === 'result' ? `FINAL  ${e.score[0]} — ${e.score[1]}   /   ${e.stats.made}/${e.stats.attempts} SHOOTING` : 'PICK YOUR RUN. POINT & PULL A TRIGGER.', 65, 237);
    this.buttons = [];
    ['1v1', '2v2', 'contest', 'practice'].forEach((mode, i) => this.button(60 + i % 2 * 455, 280 + Math.floor(i / 2) * 104, 425, 86, MODES[mode].name, () => { this.mode = mode; this.hooks.select(mode); this.drawMenu(); }, mode === this.mode));
    const resume = e.phase === 'paused' && this.mode === e.mode && !e.preview;
    this.button(60, 506, 880, 92, resume ? 'BACK TO THE GAME  ↗' : 'LET’S RUN IT  ↗', () => resume ? this.hooks.resume() : this.hooks.play(this.mode), true);
    this.button(60, 623, 425, 68, `HAND: ${this.settings.dominant.toUpperCase()}`, () => { this.settings.dominant = this.settings.dominant === 'right' ? 'left' : 'right'; this.hooks.settings(); this.drawMenu(); });
    this.button(515, 623, 425, 68, `LEVEL: ${this.settings.difficulty.toUpperCase()}`, () => { const levels = ['rookie', 'park', 'allstar']; this.settings.difficulty = levels[(levels.indexOf(this.settings.difficulty) + 1) % 3]; this.hooks.settings(); this.drawMenu(); });
    this.button(60, 710, 425, 68, `MOVE: ${this.settings.locomotion.toUpperCase()}`, () => { this.settings.locomotion = this.settings.locomotion === 'smooth' ? 'blink' : 'smooth'; this.hooks.settings(); this.drawMenu(); });
    this.button(515, 710, 425, 68, `TURN: ${this.settings.turn.toUpperCase()}`, () => { const turns = ['snap', 'smooth', 'off']; this.settings.turn = turns[(turns.indexOf(this.settings.turn) + 1) % 3]; this.hooks.settings(); this.drawMenu(); });
    c.fillStyle = '#d2d9c2'; c.font = '23px Arial';
    ['Ball-hand trigger: hold the ball. Shoot with a real throw and let go; no throw, no shot.', 'A: jump (jump shot, block). Off-hand trigger: boost. Boost + A near the rim: dunk, then slam it down.', 'Grip: dribble move. Your motion picks it: across = cross, low = legs, behind = wrap, turn = spin, pull back = stepback.', 'Defence: hold grip for a stance, trigger or a real swipe to steal, A to jump and get a hand on it. X: pass.', 'Use straps. Clear your play space. Let the stick do the running.'].forEach((s, i) => c.fillText(s, 65, 829 + i * 39, 865));
    this.button(60, 1030, 880, 55, 'LEAVE VR', () => this.hooks.exit());
    this.buttons.forEach((b, i) => {
      c.fillStyle = b.selected ? '#f1c292' : i === this.hover ? '#4b7561' : '#2c5148'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 10); c.fill();
      c.fillStyle = b.selected ? '#23433a' : '#f5e9cf'; c.font = `bold ${b.h > 80 ? 28 : 23}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.text, b.x + b.w / 2, b.y + b.h / 2, b.w - 25);
    });
    c.textBaseline = 'alphabetic'; this.menuTexture.needsUpdate = true;
  }
  event(event, now) {
    if (event.type === 'toast') { this.message = `${event.title} ${event.detail}`; this.messageUntil = now + 2.2; }
    // What the ball actually did, readable without looking away from the rim.
    if (event.type === 'shotResult' && event.player === 0 && now > this.messageUntil) { this.message = `${event.made ? 'GOOD' : 'NO GOOD'} · ${event.label}`; this.messageUntil = now + 2; }
  }
  update(dt, now) {
    const input = this.input, e = this.engine;
    if (!input.xr) { this.panel.visible = false; this.hud.visible = false; this.rays.forEach(l => l.visible = false); return; }
    const h = new THREE.Vector3().copy(input.head.p), q = new THREE.Quaternion().copy(input.head.q);
    if (this.placePending && !input.viewerTracked) return;
    if (this.placePending) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; f.normalize();
      this.panel.position.copy(h).addScaledVector(f, 2); this.panel.position.y = Math.max(1, h.y) - 0.05;
      this.panel.lookAt(h); this.placePending = false;
    }
    if (this.panel.visible) {
      this.panel.updateMatrixWorld(true); let hover = -1;
      for (const [i, c] of [input.left, input.right].entries()) {
        const line = this.rays[i]; line.visible = c.tracked;
        if (!c.tracked) continue;
        line.position.copy(c.rayPose.p); line.quaternion.copy(c.rayPose.q);
        this.ray.set(new THREE.Vector3().copy(c.rayPose.p), new THREE.Vector3(0, 0, -1).applyQuaternion(line.quaternion));
        const hit = this.ray.intersectObject(this.panel)[0]; line.scale.z = hit ? hit.distance / 2 : 1;
        if (hit?.uv) {
          const x = hit.uv.x * 1000, y = (1 - hit.uv.y) * 1120;
          const index = this.buttons.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
          if (index >= 0) { hover = index; if (c.buttons.trigger.down && now - this.openedAt > 0.25) { this.buttons[index].action(); c.pulse(0.2, 25); } }
        }
      }
      if (hover !== this.hover) { this.hover = hover; this.drawMenu(); }
    }
    const off = input[this.settings.dominant === 'right' ? 'left' : 'right'];
    this.hud.visible = !this.panel.visible && e.phase === 'playing' && off.tracked;
    // The call floats low and straight ahead, following your heading lazily.
    const calling = !this.panel.visible && e.phase === 'playing' && now < this.messageUntil;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; f.normalize();
    const spot = h.clone().addScaledVector(f, 1.7); spot.y = h.y - 0.42;
    if (!this.call.visible && calling) this.call.position.copy(spot); else this.call.position.lerp(spot, 1 - Math.exp(-dt * 3));
    this.call.lookAt(h); this.call.visible = calling;
    this.call.material.opacity = calling ? Math.min(1, (this.messageUntil - now) * 3, 1) : 0;
    if (calling && this.callShown !== this.message) {
      this.callShown = this.message; const c = this.callCanvas.getContext('2d'); c.clearRect(0, 0, 1024, 160);
      c.fillStyle = '#183d39d9'; c.beginPath(); c.roundRect(0, 10, 1024, 140, 70); c.fill();
      c.fillStyle = '#f8e8c7'; c.font = 'bold 54px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.message, 512, 82, 960);
      this.callTexture.needsUpdate = true;
    }
    if (!this.hud.visible) return;
    // Above the back of the wrist, turned to face you.
    this.hud.position.copy(off.gripPose.p).add(new THREE.Vector3(0, 0.09, 0.07).applyQuaternion(off.gripPose.q)); this.hud.lookAt(h);
    this.tick += dt;
    if (this.tick < 0.07) return; this.tick = 0;
    const c = this.hudCanvas.getContext('2d'); c.clearRect(0, 0, 1024, 320);
    c.fillStyle = '#183d39c9'; c.beginPath(); c.roundRect(0, 0, 1024, 290, 28); c.fill();
    c.fillStyle = '#f8e8c7'; c.textAlign = 'center'; c.font = 'bold 48px Arial';
    c.fillText(e.mode === 'contest' ? `${e.score[0]} PTS    /    ${Math.ceil(e.contestTime)} SEC    /    ${25 - e.contestShots} LEFT` : `${e.score[0]}    HOME     /     AWAY    ${e.score[1]}     ·     ${e.mode === 'practice' ? 'FREE' : Math.ceil(e.shotClock)}`, 512, 68);
    c.font = '26px Arial'; c.fillStyle = '#e4c494';
    c.fillText(e.needsClear && e.possession === 0 ? 'CLEAR IT BEYOND THE ARC' : e.ownerId === 0 ? 'TRIGGER: BALL IN HAND · THROW TO SHOOT' : e.isMatch && e.possession === 1 ? 'GRIP: STANCE · A: JUMP TO BLOCK' : 'GET OPEN · X: CALL FOR IT', 512, 132, 950);
    // Stamina: how much boost is left.
    c.fillStyle = '#547364'; c.fillRect(212, 178, 600, 22);
    c.fillStyle = e.human.stamina > 30 ? '#addc9d' : '#e9a070'; c.fillRect(212, 178, 6 * e.human.stamina, 22);
    c.fillStyle = '#f3d5a8'; c.font = '24px Arial'; c.fillText(`BOOST     ${e.heatTime > 0 ? 'ON FIRE!' : `HEAT ${e.heat}/5`}     ·     Y: MENU`, 512, 250);
    this.hudTexture.needsUpdate = true;
  }
}
