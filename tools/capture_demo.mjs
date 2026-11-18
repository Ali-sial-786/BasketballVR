// Capture real, fixed-time browser gameplay, including the game's own SFX.
// CAPTURE_URL=http://127.0.0.1:5175 CAPTURE_NAME=baseline node tools/capture_demo.mjs
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
const url = process.env.CAPTURE_URL || 'http://127.0.0.1:5173';
const name = process.env.CAPTURE_NAME || 'improved';
const root = process.env.CAPTURE_OUTPUT || '/workspace/shared';
const fps = Number(process.env.CAPTURE_FPS || 24), seconds = Number(process.env.CAPTURE_SECONDS || (name === 'baseline' ? 40 : 52));
const width = Number(process.env.CAPTURE_WIDTH || 1280), height = Math.round(width * 9 / 16);
await fs.mkdir(root, { recursive: true }); await fs.mkdir('test-results/capture', { recursive: true });
const silent = `${root}/rimrun-${name}-silent.mp4`, final = `${root}/RIMRUN-${name}.mp4`;
const ffmpeg = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'ignore', 'inherit'] });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page), began = Date.now();
page.setDefaultTimeout(30000);
await page.addInitScript(() => {
  HTMLCanvasElement.prototype.requestPointerLock = async () => {};
  const frames = new Map(); let id = 0;
  window.requestAnimationFrame = cb => { frames.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => frames.delete(i);
  window.__stepCaptureFrame = ms => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(ms)); };
});
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`${url}/?test`); await page.waitForFunction(() => window.__rimrun, null, { timeout: 90000, polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const e = window.__rimrun.engine, emit = e.emit.bind(e); window.__captureEvents = []; window.__captureTime = 0;
    e.emit = (type, data = {}) => { window.__captureEvents.push({ type, t: window.__captureTime, speed: data.speed, green: data.green, dunk: data.dunk, owner: data.owner }); emit(type, data); };
    const label = document.createElement('div'); label.id = 'capture-caption'; label.style.cssText = 'position:fixed;left:22px;top:119px;z-index:80;pointer-events:none;background:#153a3bdc;border-left:3px solid #ffbd87;padding:10px 15px;color:#f6eace;font:700 12px Arial;letter-spacing:1px;max-width:500px;line-height:1.5'; document.body.appendChild(label);
    const style = document.createElement('style'); style.textContent = '.capture-scrimmage #menu,.capture-scrimmage .site-header,.capture-scrimmage .screen-shade{display:none!important}'; document.head.appendChild(style);
  });
  await page.evaluate(() => window.__stepCaptureFrame(0));
  let chapter = -1, introFrame = null;
  for (let frame = 0; frame < fps * seconds; frame++) {
    const t = frame / fps;
    // Hold the actual opening screen for two seconds. Gameplay chapters are
    // rendered at every recorded frame; there is no motion interpolation.
    if (frame > 0 && t < 2 && introFrame) { if (!ffmpeg.stdin.write(introFrame)) await once(ffmpeg.stdin, 'drain'); continue; }
    await page.evaluate(({ t, frame, fps, name, seconds }) => {
      window.__captureTime = t; const g = window.__rimrun, e = g.engine, i = g.input;
      const note = document.getElementById('capture-caption');
      const is = time => frame === Math.round(time * fps);
      const seedMatch = value => { let seed = value; e.rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; };
      const aim = () => { i.yaw = Math.atan2(-e.human.pos.x, -6.1 - e.human.pos.z); i.pitch = 0.16; };
      if (is(0)) note.textContent = `RIMRUN / ${name === 'baseline' ? 'CURRENT BUILD — BEFORE IMPROVEMENTS' : 'IMPROVED BUILD — ACTUAL GAMEPLAY'}`;
      if (is(2)) { if (g.settings) g.settings.camera = name === 'baseline' ? 'first' : 'third'; g.start('practice'); note.textContent = name === 'baseline' ? 'SHOOTAROUND / CROSS → WRAP → SPIN → STEPBACK' : 'HANDLES / CROSS → LEGS → WRAP → SPIN → HESI → STEPBACK'; }
      if (is(3.3)) { i.keys.add('KeyW'); i.keys.add('ShiftLeft'); }
      if (is(4)) { i.keys.delete('KeyW'); i.keys.delete('ShiftLeft'); }
      if (name === 'baseline') {
        if (is(4.2)) i.push('moveAction', 'cross'); if (is(4.9)) i.push('moveAction', 'behind');
        if (is(5.6)) i.push('moveAction', 'spin'); if (is(6.4)) i.push('moveAction', 'stepback');
      } else ['cross', 'legs', 'behind', 'spin', 'hesi', 'stepback'].forEach((move, n) => { if (is(4.1 + n * 0.72)) i.push('moveAction', move); });
      const shotAt = name === 'baseline' ? 7.3 : 8.9;
      if (is(shotAt)) { aim(); i.push('gather', true); note.textContent = 'SHOOTING / DIP, RISE, RELEASE AT THE TOP'; }
      if (is(shotAt + 0.72)) i.push('release', {});
      if (is(13)) {
        if (g.startDemo) { g.startDemo('2v2'); seedMatch(215); } else { g.home(); document.body.classList.add('capture-scrimmage'); }
        note.textContent = '2V2 / LIVE AI SCRIMMAGE — NORMAL MATCH RULES';
      }
      if (name !== 'baseline' && is(31)) { g.startDemo('1v1'); seedMatch(128); note.textContent = '1V1 / PLANT, CUT, CONTEST — ACTUAL AI PLAY'; }
      const contestAt = name === 'baseline' ? 29 : 40;
      if (is(contestAt)) { document.body.classList.remove('capture-scrimmage'); g.start('contest'); note.textContent = 'THREE-POINT CONTEST / FIVE RACKS, MONEY BALLS'; }
      if (is(contestAt + 1.4) || is(contestAt + 4.1) || is(contestAt + 6.8) || name !== 'baseline' && is(contestAt + 9.5)) { aim(); i.push('gather', true); }
      if (is(contestAt + 2.12) || is(contestAt + 4.82) || is(contestAt + 7.52) || name !== 'baseline' && is(contestAt + 10.22)) i.push('release', {});
      if (is(seconds - 1.8)) note.textContent = `RIMRUN / ${name === 'baseline' ? 'BASELINE RECORDED BEFORE THE NEW GRAPHICS AND MOVEMENT PASS' : 'THE FIELDHOUSE / DESKTOP · TOUCH · QUEST VR'}`;
    }, { t, frame, fps, name, seconds });
    await page.evaluate(ms => window.__stepCaptureFrame(ms), (frame + 1) * 1000 / fps);
    const { data: jpeg } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 91, fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true });
    const data = Buffer.from(jpeg, 'base64');
    if (frame === 0) introFrame = data;
    if (!ffmpeg.stdin.write(data)) await once(ffmpeg.stdin, 'drain');
    const nextChapter = Math.floor(t / 2); if (nextChapter !== chapter) { chapter = nextChapter; console.log(`${name}: ${t.toFixed(0)} / ${seconds}s captured (${Math.round((Date.now() - began) / 1000)}s elapsed)`); }
  }
  ffmpeg.stdin.end(); const [code] = await once(ffmpeg, 'close'); if (code) throw Error(`Video encoder exited ${code}`);
  const events = await page.evaluate(() => window.__captureEvents); await fs.writeFile(`test-results/capture/${name}-events.json`, JSON.stringify(events, null, 2));
  // Re-schedule the same audio module against an offline context, using the
  // exact captured event times. No copyrighted soundtrack or fake effects.
  const audioSource = await fs.readFile(new URL('../src/audio.js', import.meta.url), 'utf8');
  const wav = await page.evaluate(async ({ seconds, source }) => {
    const { Audio } = await import(`data:text/javascript;base64,${source}`); const context = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
    let time = 0; const proxy = new Proxy(context, { get(target, key) { if (key === 'currentTime') return time; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
    const audio = new Audio(); audio.setup(proxy);
    for (const event of window.__captureEvents) { time = event.t; audio.play(event); }
    const buffer = await context.startRendering(), samples = buffer.getChannelData(0), bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
    const str = (p, s) => { for (let i = 0; i < s.length; i++) view.setUint8(p + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    let binary = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i += 32768) binary += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(binary);
  }, { seconds, source: Buffer.from(audioSource).toString('base64') });
  const audioPath = `${root}/rimrun-${name}-audio.wav`; await fs.writeFile(audioPath, Buffer.from(wav, 'base64'));
  const mux = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent, '-i', audioPath, '-c:v', 'copy', '-af', 'volume=2', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
  const [muxCode] = await once(mux, 'close'); if (muxCode) throw Error('Audio mux failed.');
  await fs.unlink(silent); await fs.unlink(audioPath); console.log(JSON.stringify({ final, seconds, fps, events: events.length, elapsed: Math.round((Date.now() - began) / 1000), errors }));
  if (errors.length) throw Error(errors.join('\n'));
} finally { await browser.close(); if (!ffmpeg.killed) ffmpeg.kill(); }
