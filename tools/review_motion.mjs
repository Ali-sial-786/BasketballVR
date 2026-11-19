// Contact sheets of the real game's motion: every cell is the live simulation
// and rig, stepped at a fixed 60 Hz and rendered from a review camera.
//   REVIEW_URL=http://127.0.0.1:5173 node tools/review_motion.mjs shot
// Sheets: shot, handles, defense, pass, rim, views, hands, shapes, play. Output: test-results/motion-<sheet>.jpg
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const sheet = process.argv[2] || 'shot', url = process.env.REVIEW_URL || 'http://127.0.0.1:5173';
const out = process.env.REVIEW_OUTPUT || 'test-results';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 880, height: 720 }, deviceScaleFactor: 1 }), errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  HTMLCanvasElement.prototype.requestPointerLock = async () => {};
  const queue = new Map(); let id = 0, ms = 0;
  window.requestAnimationFrame = f => { queue.set(++id, f); return id; }; window.cancelAnimationFrame = id => queue.delete(id);
  window.__frame = () => { ms += 1000 / 60; const pending = [...queue.values()]; queue.clear(); pending.forEach(f => f(ms)); };
});
await page.goto(`${url}/?test`); await page.waitForFunction(() => window.__rimrun, null, { polling: 100, timeout: 60000 });
const data = await page.evaluate(async (sheet) => {
  const g = window.__rimrun, e = g.engine, i = g.input;
  const gl = g.renderer.domElement, real = g.renderer.render.bind(g.renderer);
  const camera = g.camera;
  const cells = [];
  const run = n => { g.renderer.render = () => {}; for (let k = 0; k < n; k++) window.__frame(); g.renderer.render = real; };
  const until = (f, max = 600) => { g.renderer.render = () => {}; let k = 0; while (!f() && k++ < max) window.__frame(); g.renderer.render = real; };
  const hud = on => { document.getElementById('hud').style.visibility = on ? '' : 'hidden'; document.getElementById('blink').style.opacity = '0'; };
  // cam: {from:[x,y,z], at:[x,y,z], fov} absolute, or {orbit: deg, dist, height, target: player index, look}
  const snap = (label, cam) => {
    if (cam) {
      const p = e.players[cam.target || 0];
      if (cam.orbit !== undefined) { const a = p.yaw + cam.orbit * Math.PI / 180, d = cam.dist || 3.2; cam = { from: [p.pos.x + Math.sin(a) * d, cam.height ?? 1.5, p.pos.z + Math.cos(a) * d], at: [p.pos.x, (cam.look ?? 1.25) + p.jump * 0.6, p.pos.z], fov: cam.fov || 40 }; }
      camera.parent.position.set(0, 0, 0); camera.parent.rotation.set(0, 0, 0); camera.parent.updateMatrixWorld(true);
      camera.position.set(...cam.from); camera.fov = cam.fov || 40; camera.updateProjectionMatrix(); camera.lookAt(...cam.at); camera.updateMatrixWorld(true);
      // the own athlete must be drawn in full for an outside camera
      const pv = g.views?.()[0]; if (pv) { pv.h.setArmsOnly(false); pv.root.visible = true; }
    }
    real(g.scene, camera);
    const c = document.createElement('canvas'); c.width = 440; c.height = 360; const x = c.getContext('2d'); x.drawImage(gl, 0, 0, 440, 360);
    x.fillStyle = '#000a'; x.fillRect(0, 0, 440, 22); x.fillStyle = '#fff'; x.font = 'bold 13px Arial'; x.fillText(label, 6, 16); cells.push(c);
    if (cam) { camera.fov = 68; camera.updateProjectionMatrix(); }
  };
  const freezeAI = () => { e.updateAI = () => {}; };
  const begin = (mode, third = false) => { g.settings.camera = third ? 'third' : 'first'; g.start(mode); e.checkTimer = 0.01; run(3); hud(false); };
  const SIDE = { orbit: -78, dist: 3.4, height: 1.45 }, FRONT = { orbit: 28, dist: 3.6, height: 1.5 }, BACK = { orbit: 160, dist: 3.6, height: 1.9 };
  if (sheet === 'shot') {
    begin('practice', true); e.human.pos.set(2.5, 0, -1.5); i.yaw = Math.atan2(-2.5, -6.1 + 1.5); run(20);
    i.mouseHeld = true; i.push('gather', true); run(1);
    for (const c of [0.06, 0.16, 0.3, 0.4, 0.5, 0.62]) { until(() => e.charge >= c); snap(`charge ${e.charge.toFixed(2)} jump ${e.human.jump.toFixed(2)}`, c < 0.2 || c === 0.4 ? SIDE : FRONT); }
    snap('release side', SIDE);
    i.mouseHeld = false; i.push('release', {}); run(1); snap('released +1f', SIDE);
    run(5); snap('follow +0.1', FRONT); run(9); snap('follow +0.25', SIDE); run(14); snap('follow +0.5', FRONT); run(20); snap('land +0.8', SIDE);
    until(() => e.ownerId === 0, 400); run(30); snap('dribble idle', FRONT);
  } else if (sheet === 'handles') {
    begin('practice', true); e.human.pos.set(0, 0, 1); i.yaw = Math.PI; run(30);
    snap('dribble stand', FRONT); run(8); snap('dribble stand +8f', SIDE);
    i.keys.add('KeyW'); run(40); snap('dribble run', SIDE); i.keys.delete('KeyW'); run(30);
    for (const [k, name] of [['cross', 'cross'], ['legs', 'legs'], ['behind', 'behind'], ['spin', 'spin'], ['stepback', 'stepback'], ['hesi', 'hesi']]) {
      until(() => e.human.moveCooldown === 0 && e.human.stamina > 60); i.push('moveAction', k); run(1);
      until(() => !e.human.moveState || e.human.moveState.age >= e.human.moveState.duration * 0.3); snap(`${name} 30%`, FRONT);
      until(() => !e.human.moveState || e.human.moveState.age >= e.human.moveState.duration * 0.55); snap(`${name} 55%`, k === 'behind' ? BACK : FRONT);
    }
  } else if (sheet === 'defense') {
    begin('1v1'); freezeAI(); const d = e.players[1];
    // human defends: AI owner dribbles in front
    e.giveBall(d); e.possession = 1; d.pos.set(0, 0, -1); d.yaw = Math.PI; e.human.pos.set(0, 0, -2.25); i.yaw = 0; i.keys.add('ControlLeft'); run(40);
    snap('stance, ball low', { ...FRONT, target: 0 }); snap('stance side', { ...SIDE, target: 0 });
    i.push('steal', true); run(4); snap('reach +4f', { ...SIDE, target: 0 }); run(5); snap('reach +9f', { orbit: 40, dist: 3.4, height: 1.6, target: 0 });
    run(60); d.action = 'shooting'; d.actionTime = 2; d.charge = 0.5; e.beginGather(d); run(12); snap('contest hand up', { ...SIDE, target: 0 });
    d.charge = 0.6; i.push('jump', true); run(14); snap('block jump', { ...SIDE, target: 0 }); snap('block jump front', { orbit: 35, dist: 3.8, height: 1.9, look: 1.7, target: 0 });
    // AI defender stance vs human dribble with protect
    begin('1v1'); freezeAI(); const n = e.players[1]; e.human.pos.set(0, 0, 0); i.yaw = Math.PI; n.pos.set(0.15, 0, -1.15); n.yaw = 0; n.defending = true; run(30);
    snap('AI stance vs dribble', { orbit: -60, dist: 4.2, height: 1.6 }); i.keys.add('ControlLeft'); run(30); snap('protect dribble', { orbit: -60, dist: 4.2, height: 1.6 }); snap('protect front', { orbit: 20, dist: 3.6, height: 1.5 });
    n.stagger = 0.8; run(10); snap('stagger', { orbit: -60, dist: 4.2, height: 1.6, target: 1 });
  } else if (sheet === 'pass') {
    begin('2v2'); freezeAI(); e.human.pos.set(-2, 0, 0); i.yaw = Math.atan2(4, 0.01); const m = e.players[1]; m.pos.set(3, 0, 0); m.yaw = -Math.PI / 2;
    e.players[2].pos.set(-6, 0, -6); e.players[3].pos.set(6, 0, -6); run(30);
    for (const kind of ['chest', 'bounce', 'lob']) {
      e.giveBall(e.human); e.human.aiWait = 0; run(20); i.push('pass', kind); run(4); snap(`${kind} +4f`, { orbit: -70, dist: 3.6, height: 1.5 }); run(6); snap(`${kind} +10f`, { from: [0.5, 2.2, 5.5], at: [0.5, 1.2, 0], fov: 50 });
      until(() => e.ownerId === 1 || e.flightAge > 2, 300); snap(`${kind} caught`, { orbit: 60, dist: 3.4, height: 1.5, target: 1 }); run(10);
    }
  } else if (sheet === 'rim') {
    begin('practice', true); e.human.pos.set(2.2, 0, -3.6); i.yaw = Math.atan2(-2.2, -6.1 + 3.6); run(10);
    i.keys.add('KeyW'); run(22); i.mouseHeld = true; i.push('gather', true); until(() => e.charge >= 0.4); snap('layup gather', SIDE); until(() => e.charge >= 0.6); snap('layup up', SIDE);
    i.mouseHeld = false; i.push('release', {}); run(2); i.keys.delete('KeyW'); snap(`layup release bank=${e.shot?.bank}`, FRONT); run(8); snap('layup +8f', { from: [4.5, 2.6, -2.5], at: [0, 2.9, -6.1], fov: 45 }); run(14); snap('layup +22f', { from: [4.5, 2.6, -2.5], at: [0, 2.9, -6.1], fov: 45 }); run(30); snap(`after: ${e.lastResult?.label}`, { from: [4.5, 2.6, -2.5], at: [0, 2.6, -6.1], fov: 45 });
    until(() => e.ownerId === 0, 400); e.human.pos.set(0, 0, -4.4); i.yaw = Math.PI; run(10); i.keys.add('KeyW'); i.keys.add('ShiftLeft'); until(() => e.human.pos.z < -5.0, 200);
    i.mouseHeld = true; i.push('gather', true); until(() => e.charge >= 0.5); i.keys.delete('KeyW'); snap('dunk rise', SIDE); until(() => e.charge >= 0.62); snap(`dunk top y=${e.ball.pos.y.toFixed(2)}`, SIDE);
    i.mouseHeld = false; i.push('release', {}); run(3); snap(`dunk=${e.shot?.dunk} +3f`, { from: [3, 3.2, -3.5], at: [0, 3, -6.1], fov: 45 }); run(8); snap('dunk +11f', { from: [3, 3.2, -3.5], at: [0, 3, -6.1], fov: 45 }); run(20); snap(`after ${e.lastResult?.label}`, { from: [3, 3.2, -3.5], at: [0, 2.6, -6.1], fov: 45 });
  } else if (sheet === 'hands') {
    // Close on the hands: where the wrists and fingers go when shooting and defending.
    const hand = (label, side, { target = 0, orbit = 60, dist = 0.75, lift = 0.1 } = {}) => {
      const view = g.views()[target], p = e.players[target], at = view.h.worldPos('hand' + side, camera.position.clone()), a = p.yaw + orbit * Math.PI / 180;
      snap(label, { from: [at.x + Math.sin(a) * dist, at.y + lift, at.z + Math.cos(a) * dist], at: [at.x, at.y + 0.03, at.z], fov: 34 });
    };
    begin('practice', true); e.human.pos.set(2.5, 0, -1.5); i.yaw = Math.atan2(-2.5, -6.1 + 1.5); run(20);
    const S = e.human.side > 0 ? 'R' : 'L', G = S === 'R' ? 'L' : 'R';
    i.mouseHeld = true; i.push('gather', true); run(1);
    until(() => e.charge >= 0.16); hand('pocket: shooting hand', S, { orbit: -70 }); hand('pocket: guide hand', G, { orbit: 70 });
    until(() => e.charge >= 0.36); hand('set point: shooting side', S, { orbit: -80 }); hand('set point: front', S, { orbit: 15, dist: 0.9 }); hand('set point: behind', S, { orbit: 170, dist: 0.9 });
    until(() => e.charge >= 0.6); hand('extension: side', S, { orbit: -80 }); hand('extension: front', S, { orbit: 20, dist: 0.9 });
    i.mouseHeld = false; i.push('release', {}); run(4); hand('follow +4f: side', S, { orbit: -80 }); run(10); hand('follow +14f: side', S, { orbit: -80 }); hand('follow +14f: front', S, { orbit: 25, dist: 0.9 }); hand('follow: guide hand', G, { orbit: 60 });
    begin('1v1'); freezeAI(); const d = e.players[1];
    e.giveBall(d); e.possession = 1; d.pos.set(0, 0, -1); d.yaw = Math.PI; e.human.pos.set(0, 0, -2.25); i.yaw = 0; i.keys.add('ControlLeft'); run(40);
    hand('stance: right hand', 'R', { orbit: 40 }); hand('stance: left hand', 'L', { orbit: -40 }); hand('stance: both, front', 'R', { orbit: 10, dist: 1.5, lift: 0.2 });
    i.push('steal', true); run(6); hand('reach +6f: right', 'R', { orbit: 60 }); hand('reach +6f: left', 'L', { orbit: -60 });
    run(60); d.action = 'shooting'; d.actionTime = 2; d.charge = 0.5; e.beginGather(d); run(14);
    hand('contest: right', 'R', { orbit: 50 }); hand('contest: left', 'L', { orbit: -50 }); hand('contest: front', 'R', { orbit: 10, dist: 1.6, lift: -0.3 });
    d.charge = 0.6; i.push('jump', true); run(14); hand('block: right', 'R', { orbit: 50 }); hand('block: left', 'L', { orbit: -50 });
  } else if (sheet === 'shapes') {
    // The hand shapes on their own: rest, open, on the ball, from four sides.
    begin('1v1', true); freezeAI(); run(30);
    const view = g.views()[1], p = e.players[1];
    for (const [name, open, ball] of [['rest', 0, 0], ['open', 1, 0], ['ball', 0, 1]]) for (const [label, orbit, lift] of [['outside', 90, 0.05], ['front', 0, 0.05], ['inside', -90, 0.05], ['above', 60, 0.5]]) {
      view.h.setHandShape('L', open, ball); view.h.setHandShape('R', open, ball);
      const at = view.h.worldPos('handL', camera.position.clone()), a = p.yaw + orbit * Math.PI / 180;
      snap(`${name}: ${label}`, { from: [at.x + Math.sin(a) * 0.5, at.y - 0.06 + lift, at.z + Math.cos(a) * 0.5], at: [at.x, at.y - 0.07, at.z], fov: 30 });
    }
  } else if (sheet === 'play') {
    // Live AI basketball, close up on each athlete in turn: stance, hands, feet.
    g.startDemo('2v2'); run(240);
    for (let k = 0; k < 16; k++) {
      run(17); const t = k % 4, p = e.players[t];
      snap(`${p.name} ${e.ownerId === p.id ? 'ball' : p.team === e.possession ? 'off-ball' : 'defending'}${p.jump > 0.05 ? ' air' : ''}`, { orbit: [40, -55, 140, -120][k % 4] + k * 9, dist: 3.0, height: 1.35, target: t, look: 1.0 });
    }
  } else if (sheet === 'views') {
    hud(true);
    begin('1v1'); hud(true); run(80); snap('1v1 first person'); i.mouseHeld = true; i.push('gather', true); until(() => e.charge >= 0.3); snap('FP gather .3'); until(() => e.charge >= 0.6); snap('FP gather .6'); i.mouseHeld = false; i.push('release', {}); run(8); snap('FP released'); run(40); snap('FP result');
    begin('1v1', true); hud(true); run(80); snap('third person'); i.mouseHeld = true; i.push('gather', true); until(() => e.charge >= 0.6); snap('TP gather .6'); i.mouseHeld = false; i.push('release', {}); run(10); snap('TP released'); run(50); snap('TP result');
    g.startDemo('2v2'); run(400); snap('demo 2v2'); run(300); snap('demo 2v2 later');
  }
  const cols = 4, rows = Math.ceil(cells.length / cols), sheetCanvas = document.createElement('canvas'); sheetCanvas.width = cols * 440; sheetCanvas.height = rows * 360;
  const x = sheetCanvas.getContext('2d'); cells.forEach((c, k) => x.drawImage(c, (k % cols) * 440, Math.floor(k / cols) * 360));
  return sheetCanvas.toDataURL('image/jpeg', 0.86);
}, sheet);
const file = `${out}/motion-${sheet}.jpg`;
await fs.writeFile(file, Buffer.from(data.split(',')[1], 'base64'));
console.log(JSON.stringify({ file, errors }));
await browser.close();
if (errors.length) process.exit(1);
