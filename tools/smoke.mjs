import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
const url = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
let server, browser;
if (!process.env.SMOKE_URL) server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
const wait = async test => { const end = Date.now() + 30000; while (Date.now() < end) { try { if (await test()) return; } catch {} await new Promise(r => setTimeout(r, 200)); } throw Error(`Server not ready: ${url}`); };
const errors = [], output = 'test-results';
// Drive the real animation callback at fixed time. Skip redundant GPU draws
// while checking rules/input; screenshots still render the complete scene.
async function prepare(page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = async () => {};
    const callbacks = new Map(), nativeFrame = window.requestAnimationFrame.bind(window); let id = 0, ms = 0;
    window.__smokeYield = () => new Promise(resolve => nativeFrame(() => setTimeout(resolve, 0)));
    window.requestAnimationFrame = cb => { callbacks.set(++id, cb); return id; };
    window.cancelAnimationFrame = key => callbacks.delete(key);
    window.__smokeFrame = () => { ms += 1000 / 30; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(cb => cb(ms)); };
  });
}
async function until(page, predicate, arg, maxFrames = 600) {
  const passed = await page.evaluate(async ({ source, arg, maxFrames }) => {
    await window.__smokeYield();
    const check = (0, eval)(`(${source})`), renderer = window.__rimrun.renderer, render = renderer.render;
    renderer.render = () => {};
    try { for (let i = 0; i < maxFrames; i++) { if (check(arg)) return true; window.__smokeFrame(); } return check(arg); }
    finally { renderer.render = render; }
  }, { source: predicate.toString(), arg, maxFrames });
  assert(passed, `Condition did not become true: ${predicate}`);
}
async function frames(page, count) { await page.evaluate(() => window.__smokeCount = 0); await until(page, n => ++window.__smokeCount > n, count, count + 2); }
async function screenshot(page, path, fullPage = false) { await page.evaluate(() => window.__smokeFrame()); await page.screenshot({ path, fullPage, timeout: 90000 }); }

try {
  await wait(async () => (await fetch(url)).ok); await fs.mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.setDefaultTimeout(60000);
  await prepare(page); await page.goto(`${url}/?test`); await page.waitForFunction(() => window.__rimrun, null, { polling: 100 });
  assert.equal(await page.locator('.mode-card').count(), 4); assert(await page.locator('#menu').isVisible());
  await screenshot(page, `${output}/desktop-menu.png`);
  await page.locator('[data-mode="practice"]').click(); await page.locator('#play').click();
  await until(page, () => window.__rimrun.engine.checkTimer === 0);
  const initialZ = await page.evaluate(() => window.__rimrun.engine.human.pos.z);
  await page.keyboard.down('KeyW'); await until(page, z => window.__rimrun.engine.human.pos.z < z - 0.25, initialZ); await page.keyboard.up('KeyW');
  // Use actual mouse input, waiting on the simulation's release meter.
  await page.mouse.down();
  await until(page, () => window.__rimrun.engine.charge >= 0.68); await page.mouse.up();
  await until(page, () => window.__rimrun.engine.stats.made === 1);
  assert.equal(await page.evaluate(() => window.__rimrun.engine.stats.attempts), 1);
  // The shot card reports the release, the arc and what the ball actually did.
  assert.match(await page.locator('#shot-arc').textContent(), /ARC \d+°/); assert.match(await page.locator('#shot-result').textContent(), /SWISH|RIM AND IN|ROLL|GLASS/);
  await until(page, () => window.__rimrun.engine.ownerId === 0);
  // A quick tap shows the ball without spending the attempt.
  await page.mouse.down(); await frames(page, 2); await page.mouse.up();
  await until(page, () => window.__rimrun.engine.human.pump > 0);
  assert.equal(await page.evaluate(() => window.__rimrun.engine.stats.attempts), 1);
  await until(page, () => window.__rimrun.engine.human.pump === 0);
  await page.keyboard.press('KeyQ'); await until(page, () => window.__rimrun.engine.stats.moves === 1);
  await until(page, () => window.__rimrun.engine.human.moveCooldown === 0);
  await page.keyboard.press('KeyE'); await until(page, () => window.__rimrun.engine.stats.moves === 2);
  await until(page, () => window.__rimrun.engine.human.moveCooldown === 0);
  await page.keyboard.press('KeyZ'); await until(page, () => window.__rimrun.engine.human.moveState?.kind === 'legs');
  await until(page, () => window.__rimrun.engine.human.moveCooldown === 0);
  await page.keyboard.press('KeyT'); await until(page, () => window.__rimrun.engine.stats.moves === 4);
  // V switches to the broadcast camera and back; the choice is remembered.
  await page.keyboard.press('KeyV'); assert.equal(await page.evaluate(() => window.__rimrun.settings.camera), 'third');
  await frames(page, 20); await until(page, () => getComputedStyle(document.getElementById('blink')).opacity === '0');
  await screenshot(page, `${output}/desktop-broadcast.png`);
  await page.keyboard.press('KeyV'); assert.equal(await page.evaluate(() => window.__rimrun.settings.camera), 'first'); await frames(page, 4);
  await until(page, () => getComputedStyle(document.getElementById('blink')).opacity === '0');
  await screenshot(page, `${output}/desktop-game.png`);
  await page.keyboard.press('KeyM'); await page.locator('#resume-game').waitFor();
  const paused = await page.evaluate(() => window.__rimrun.engine.time); await frames(page, 10);
  assert.equal(await page.evaluate(() => window.__rimrun.engine.time), paused);
  await page.locator('#resume-game').click(); await until(page, () => window.__rimrun.engine.phase === 'playing');
  await page.keyboard.press('KeyM'); await page.locator('#leave-game').click();
  await page.locator('[data-mode="2v2"]').click(); await page.locator('#play').click();
  await until(page, () => window.__rimrun.engine.checkTimer === 0); await page.keyboard.press('KeyX');
  await until(page, () => window.__rimrun.engine.ownerId === 1);
  assert.equal(await page.evaluate(() => window.__rimrun.engine.players.length), 4);
  await page.keyboard.press('KeyM'); await page.locator('#leave-game').click();
  await page.locator('[data-mode="contest"]').click(); await page.locator('#play').click();
  await until(page, () => window.__rimrun.engine.checkTimer === 0);
  await page.mouse.down(); await until(page, () => window.__rimrun.engine.charge >= 0.68); await page.mouse.up();
  await until(page, () => window.__rimrun.engine.contestShots === 1);
  assert.equal(await page.evaluate(() => window.__rimrun.engine.score[0]), 1); assert(await page.locator('#rack-progress').isVisible());
  await screenshot(page, `${output}/three-point-contest.png`);
  console.log('Desktop: menu, movement, timed release, shot report, pump fake, six handles, camera switch, pause/resume, 2v2 pass and contest shot passed.');
  await page.keyboard.press('KeyM'); await page.locator('#leave-game').click();
  await page.locator('[data-mode="2v2"]').click(); await page.locator('#watch-demo').click();
  await until(page, () => window.__rimrun.engine.checkTimer === 0); await frames(page, 180);
  assert(await page.locator('#demo-controls').isVisible()); assert.equal(await page.evaluate(() => window.__rimrun.engine.preview), true);
  await screenshot(page, `${output}/arena-demo.png`);
  await page.locator('[data-demo-mode="1v1"]').click(); assert.equal(await page.evaluate(() => window.__rimrun.engine.players.length), 2);
  await page.locator('#take-control').click(); assert.equal(await page.evaluate(() => window.__rimrun.input.enabled && !window.__rimrun.engine.preview), true);
  await page.keyboard.press('KeyM'); await page.locator('#leave-game').click();
  await page.locator('[data-mode="contest"]').click(); await page.locator('#watch-demo').click();
  await until(page, () => window.__rimrun.engine.contestShots === 1); assert.equal(await page.evaluate(() => window.__rimrun.engine.score[0]), 1);
  await page.locator('#exit-demo').click(); assert(await page.locator('#menu').isVisible());
  console.log('Gameplay demo: 2v2, 1v1, three-point contest, mode switching, take control and exit passed.');
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  mobile.on('pageerror', e => errors.push(e.message)); mobile.setDefaultTimeout(60000);
  await prepare(mobile); await mobile.goto(`${url}/?test`); await mobile.waitForFunction(() => window.__rimrun, null, { polling: 100 });
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  await screenshot(mobile, `${output}/mobile-menu.png`, true);
  await mobile.locator('[data-mode="practice"]').tap(); await mobile.locator('#play').tap();
  await until(mobile, () => window.__rimrun.engine.checkTimer === 0);
  assert(await mobile.locator('#touch-stick').isVisible()); assert(await mobile.locator('[data-action="shoot"]').isVisible());
  for (const action of ['legs', 'hesi', 'behind', 'stepback']) assert(await mobile.locator(`[data-action="${action}"]`).isVisible(), `touch handle: ${action}`);
  await mobile.locator('[data-action="cross"]').tap(); await until(mobile, () => window.__rimrun.engine.stats.moves === 1);
  await screenshot(mobile, `${output}/mobile-game.png`);
  await until(mobile, () => window.__rimrun.engine.human.moveCooldown === 0);
  await mobile.locator('[data-action="spin"]').tap();
  await until(mobile, () => window.__rimrun.engine.human.moveState?.kind === 'spin');
  const touch = await mobile.context().newCDPSession(mobile);
  async function holdButton(action) {
    const box = await mobile.locator(`[data-action="${action}"]`).boundingBox();
    assert(box, `Touch action must be visible: ${action}`);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  }
  await holdButton('shoot'); await until(mobile, () => window.__rimrun.engine.charge > 0.1);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await until(mobile, () => window.__rimrun.engine.ballState === 'dribble');
  assert.equal(await mobile.evaluate(() => window.__rimrun.engine.stats.attempts), 0);
  await mobile.locator('#pause').tap(); await mobile.locator('#leave-game').tap();
  await mobile.locator('[data-mode="1v1"]').tap(); await mobile.locator('#play').tap();
  await until(mobile, () => window.__rimrun.engine.owner?.team === 1 && !document.querySelector('[data-action="defend"]').hidden, null, 900);
  await holdButton('defend'); await until(mobile, () => window.__rimrun.engine.human.defending);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(mobile, () => !window.__rimrun.engine.human.defending);
  console.log('Touch: responsive menu, crossover, spin, cancelled gathers and held defensive stance passed.');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log(`No browser errors. Screenshots saved to ${output}/. Physical headset validation remains manual.`);
} finally { await browser?.close(); server?.kill(); }
