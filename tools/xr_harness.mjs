// Play the game in an emulated Quest headset (Meta's IWER WebXR runtime) in
// headless Chromium, on a virtual clock, so controller motion and buttons can
// be scripted frame by frame and the view captured from the player's eyes.
//
//   const xr = await openXR({ url: 'http://127.0.0.1:5173' });
//   await xr.start('1v1');
//   await xr.pose({ head: [0, 1.7, 0], right: { p: [0.2, 1.1, -0.3] } });
//   await xr.press('right', 'trigger'); await xr.frames(10); await xr.shot('file.jpg');
//
// Positions are in the headset's own room space (local-floor), metres.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const IWER = require.resolve('iwer/build/iwer.min.js');

export const HZ = 72;

export async function openXR({ url = process.env.REVIEW_URL || 'http://127.0.0.1:5173', width = 960, height = 720, chromium: executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } = {}) {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/GL_INVALID|GPU stall|ReadPixels/.test(m.text())) errors.push(m.text()); });
  // A virtual clock: once the game has loaded, nothing moves until the script
  // steps a frame. (Loading itself runs on the real clock.)
  await page.addInitScript(() => {
    const realNow = performance.now.bind(performance), realRaf = window.requestAnimationFrame.bind(window), realCancel = window.cancelAnimationFrame.bind(window);
    let virtual = false, ms = 0, id = 0; const queue = new Map();
    performance.now = () => virtual ? ms : realNow();
    window.requestAnimationFrame = f => virtual ? (queue.set(++id, f), id) : realRaf(f);
    window.cancelAnimationFrame = i => { queue.delete(i); realCancel(i); };
    window.__virtualClock = () => { ms = realNow(); virtual = true; };
    window.__frame = step => { ms += step; const pending = [...queue.values()]; queue.clear(); for (const f of pending) f(ms); };
  });
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false });
    device.installRuntime({ forceInstall: true }); device.stereoEnabled = false; window.__xr = device;
  });
  await page.goto(`${url}/?test`);
  await page.waitForFunction(() => window.__rimrun && document.body.classList.contains('ready'), null, { timeout: 90000 });
  // Take over the clock: the loop's next callback lands in the virtual queue.
  await page.evaluate(() => window.__virtualClock()); await page.waitForTimeout(300);
  const api = {
    page, browser, errors,
    frames: (n = 1) => page.evaluate(([n, step]) => { for (let i = 0; i < n; i++) window.__frame(step); }, [n, 1000 / HZ]),
    // Enter the headset from the page's own button, as a person would.
    async enter() {
      await page.evaluate(() => { document.getElementById('enter-vr')?.click(); });
      for (let i = 0; i < 40 && !(await page.evaluate(() => window.__rimrun.renderer.xr.isPresenting)); i++) { await api.frames(1); await page.waitForTimeout(20); }
      if (!(await page.evaluate(() => window.__rimrun.renderer.xr.isPresenting))) throw new Error('The emulated headset did not start a session.');
      await api.frames(3);
    },
    async start(mode = '1v1') { await api.enter(); await page.evaluate(m => window.__rimrun.start(m), mode); await api.frames(3); },
    // head: [x,y,z] or { p, yaw, pitch }; left/right: { p: [x,y,z], q: [x,y,z,w] }.
    pose: (o) => page.evaluate((o) => {
      const d = window.__xr, set = (obj, p, q) => { if (p) obj.position.set(...p); if (q) obj.quaternion.set(...q); };
      if (o.head) {
        const h = Array.isArray(o.head) ? { p: o.head } : o.head;
        let q = h.q;
        if (!q && (h.yaw !== undefined || h.pitch !== undefined)) {
          const y = (h.yaw || 0) / 2, x = (h.pitch || 0) / 2;
          // yaw about Y, then pitch about X (YXZ)
          q = [Math.cos(y) * Math.sin(x), Math.sin(y) * Math.cos(x), -Math.sin(y) * Math.sin(x), Math.cos(y) * Math.cos(x)];
        }
        set(d, h.p, q);
      }
      for (const side of ['left', 'right']) if (o[side]) set(d.controllers[side], o[side].p, o[side].q);
    }, o),
    button: (side, id, value) => page.evaluate(([s, id, v]) => window.__xr.controllers[s].updateButtonValue(id, v), [side, id, value]),
    async press(side, id) { await api.button(side, id, 1); },
    async releaseButton(side, id) { await api.button(side, id, 0); },
    stick: (side, x, y) => page.evaluate(([s, x, y]) => window.__xr.controllers[s].updateAxes('thumbstick', x, y), [side, x, y]),
    state: () => page.evaluate(() => { const g = window.__rimrun, e = g.engine, h = e.human; return { phase: e.phase, owner: e.ownerId, ballState: e.ballState, ball: e.ball.pos.toArray?.() || [e.ball.pos.x, e.ball.pos.y, e.ball.pos.z], vel: [e.ball.vel.x, e.ball.vel.y, e.ball.vel.z], human: { pos: [h.pos.x, h.pos.z], jump: h.jump, action: h.action, stamina: h.stamina, speed: Math.hypot(h.vel.x, h.vel.z) }, shot: e.shot ? { kind: e.shot.kind, dunk: e.shot.dunk } : null, lastResult: e.lastResult, score: [...e.score] }; }),
    async shot(file, quality = 80) { const b = await page.screenshot({ type: 'jpeg', quality }); if (file) await fs.writeFile(file, b); return b; },
    close: () => browser.close(),
  };
  return api;
}
