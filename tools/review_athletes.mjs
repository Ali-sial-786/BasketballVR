// Pose the actual game rig for a close art review; these are not gameplay frames.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const root = process.env.REVIEW_OUTPUT || '/workspace/shared', url = process.env.REVIEW_URL || 'http://127.0.0.1:4180';
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = async () => {};
    const queue = new Map(); let id = 0;
    window.requestAnimationFrame = f => { queue.set(++id, f); return id; }; window.cancelAnimationFrame = id => queue.delete(id);
    window.__reviewFrame = ms => { const pending = [...queue.values()]; queue.clear(); pending.forEach(f => f(ms)); };
  });
  await page.goto(`${url}/?test`); await page.waitForFunction(() => window.__rimrun, null, { polling: 100 });
  await page.evaluate(() => {
    const g = window.__rimrun; window.__reviewFrame(0); g.start('2v2'); g.pause(false);
    g.engine.human.pos.set(0, 0, 3); g.engine.ball.pos.set(0, 1.7, 3);
    for (const [i, x, z] of [[1, -0.55, 0], [2, 0.55, -0.1], [3, 6, -5]]) { const p = g.engine.players.find(p => p.id === i); p.pos.set(x, 0, z); p.yaw = 0; p.defending = false; }
    const render = g.renderer.render; g.renderer.render = () => {};
    for (let n = 1; n <= 32; n++) window.__reviewFrame(n * 1000 / 30); g.renderer.render = render;
    let camera; g.scene.traverse(o => { if (o.isPerspectiveCamera) camera = o; }); window.__reviewCamera = camera;
    camera.parent.position.set(0, 0, 0); camera.position.set(0, 1.04, 3.2); camera.fov = 42; camera.updateProjectionMatrix(); camera.lookAt(0, 1.04, 0);
    g.renderer.render(g.scene, camera); document.getElementById('hud').hidden = true; document.getElementById('blink').style.opacity = '0';
  });
  await page.screenshot({ path: `${root}/RIMRUN-athletes.png`, timeout: 90000 });
  await page.evaluate(() => { const g = window.__rimrun, c = window.__reviewCamera; c.position.set(-0.55, 1.72, 0.85); c.fov = 34; c.updateProjectionMatrix(); c.lookAt(-0.55, 1.70, 0); g.renderer.render(g.scene, c); });
  await page.screenshot({ path: `${root}/RIMRUN-face.png`, timeout: 90000 });
  console.log(JSON.stringify({ errors, output: root })); if (errors.length) throw Error(errors.join('\n'));
} finally { await browser.close(); }
