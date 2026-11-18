import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GameEngine } from './game/engine.js';
import { demoCommand } from './game/demo.js';
import { loadSettings, saveBest } from './game/settings.js';
import { Vec3 } from './physics/math.js';
import { Input } from './input/input.js';
import { Arena } from './render/arena.js';
import { PlayerView, HandsView } from './render/athletes.js';
import { loadAthlete, setFabric } from './render/humanoid.js';
import { loadClips } from './render/clips.js';
import { loadCrowd } from './render/crowd.js';
import { Pipeline, loadLook } from './render/pipeline.js';
import { Effects } from './render/effects.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { XRUI } from './xr/ui.js';
import { XRSessionManager } from './xr/session.js';

init().catch(fail);

function fail(error) {
  console.error(error); document.getElementById('loading').hidden = true;
  const el = document.getElementById('fatal'); el.hidden = false;
  el.textContent = `The court couldn’t open. ${error.message || error}. Enable WebGL in your browser, then reload. Your browser may need hardware acceleration.`;
}

async function init() {
  await Promise.all([loadAthlete(`${import.meta.env.BASE_URL}assets/models/`), loadClips(`${import.meta.env.BASE_URL}assets/anim/`), loadCrowd(`${import.meta.env.BASE_URL}assets/models/`)]);
  const look = await loadLook(`${import.meta.env.BASE_URL}assets/textures/`);
  setFabric(look.jerseyNormal);
  const settings = loadSettings(), audio = new Audio(); audio.enabled = settings.sound;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'The Fieldhouse indoor basketball arena');
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.035, 350);
  const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
  const engine = new GameEngine(), court = new Arena(scene, renderer, look), effects = new Effects(scene);
  // Desktop GPUs get the mirrored floor, HDR and bloom; touch devices and the
  // headset keep a single forward pass.
  const pipeline = new Pipeline(renderer, scene, camera);
  const richGraphics = () => settings.graphics === 'high' || settings.graphics === 'auto' && !matchMedia('(pointer: coarse)').matches;
  pipeline.attachFloor(court.floorMesh, court.floorUniforms); pipeline.attachFeed(court); pipeline.setQuality(richGraphics());
  const feedFocus = new THREE.Vector3();
  // On Auto, a machine that cannot hold about 40 frames a second with the
  // rich pipeline is moved to the standard one, once, and told.
  const pace = { last: performance.now(), slow: 0, frames: 0, settled: false };
  const input = new Input(renderer, rig, camera, renderer.domElement), hands = new HandsView(scene, court.environment);
  let players = [], menu = true, demo = false, demoRestart = 0, accumulator = 0, lastTime = null, uiTick = 0, pending = {}, blink = 0, xrBlink = 0, nextFrame = false;
  const demoFocus = new THREE.Vector3(0, 1.2, -2.2), demoPosition = new THREE.Vector3();
  const viewerPosition = new THREE.Vector3(), chase = new THREE.Vector3(), chaseLook = new THREE.Vector3();
  let chaseReady = false; const squeaks = new Map();
  const thirdPerson = () => settings.camera === 'third' && !input.xr;
  let lastHeadRef = null;
  const blinkElement = document.getElementById('blink');
  // An eye-centred black sphere fades short relocations inside the headset too.
  const comfortMat = new THREE.MeshBasicMaterial({ color: 0x102b2b, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false });
  const comfort = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8), comfortMat); comfort.renderOrder = 1000; comfort.visible = false; scene.add(comfort);

  function setupPlayers() {
    for (const p of players) p.dispose(scene);
    // Athletes share mesh geometry; each owns its skeleton and kit material.
    players = engine.players.map(p => {
      const view = new PlayerView(scene, p); view.h.material.envMap = court.environment; view.h.material.envMapIntensity = 0.38; return view;
    });
  }
  function faceBasket() {
    const h = engine.human;
    input.yaw = Math.atan2(CONFIG.hoop.x - h.pos.x, CONFIG.hoop.z - h.pos.z); input.pitch = 0.08;
    if (input.xr) {
      // Preserve the user's current real stance and make the basket the new
      // forward. No stale hand motion survives a teleport or recenter.
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().copy(input.headRef.q));
      rig.rotation.y = input.yaw - Math.atan2(f.x, f.z);
      input.left.resetMotion(); input.right.resetMotion();
    }
    blink = 0.18; xrBlink = 0.16; chaseReady = false;
  }
  function start(mode) {
    demo = false; ui.setDemo(false);
    audio.init(); ui.closeForAction(); menu = false; engine.start(mode, settings.difficulty); setupPlayers();
    input.clear(); input.enabled = true; pending = {}; accumulator = 0; nextFrame = true; engine.human.side = settings.dominant === 'left' ? -1 : 1;
    ui.setPlaying(true); xrUI.close(); faceBasket(); input.lock();
  }
  function startDemo(mode = '2v2') {
    if (input.xr) { start(mode); return; }
    if (!['1v1', '2v2', 'contest'].includes(mode)) mode = '2v2';
    audio.init(); ui.closeForAction(); input.clear(); input.enabled = false; input.unlock();
    menu = false; demo = true; demoRestart = 0;
    engine.start(mode, settings.difficulty); engine.preview = engine.isMatch; setupPlayers();
    ui.setPlaying(true); ui.setDemo(true, mode); pending = {}; accumulator = 0; nextFrame = true;
    demoFocus.set(0, 1.2, -2.2); rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.position.set(7.6, 2.7, 0.4); blink = 0.13;
  }
  function takeControl() {
    if (!demo) return;
    if (engine.preview && engine.human.action === 'shooting' && engine.ownerId === 0) {
      engine.charge = engine.human.charge; engine.ballState = 'held';
      engine.human.action = ''; engine.human.actionTime = 0;
    }
    demo = false; engine.preview = false; ui.setDemo(false); input.clear(); input.enabled = true;
    pending = {}; accumulator = 0; nextFrame = true; faceBasket(); input.lock();
  }
  function home() {
    demo = false; ui.setDemo(false);
    ui.closeForAction(); input.enabled = false; input.clear(); input.unlock(); menu = true; ui.setPlaying(false);
    if (input.xr) { engine.pause(); xrUI.open(ui.mode); return; }
    engine.start('2v2', settings.difficulty); engine.preview = true; setupPlayers();
  }
  function pause(show = true) {
    if (demo) { home(); return; }
    if (menu || engine.phase !== 'playing') return;
    engine.pause(); input.enabled = false; input.clear(); input.unlock(); pending = {}; accumulator = 0;
    if (show) { if (input.xr) xrUI.open(engine.mode); else ui.pause(); }
  }
  function resume() {
    if (engine.phase !== 'paused') return;
    if (engine.preview) { start(ui.mode); return; }
    ui.closeForAction(); xrUI.close(); engine.resume(); input.clear(); input.enabled = true; accumulator = 0; pending = {}; nextFrame = true; input.lock();
  }
  input.onCamera = () => {
    if (menu || demo || input.xr) return;
    settings.camera = settings.camera === 'third' ? 'first' : 'third'; ui.syncSettings(); chaseReady = false;
    engine.toast(settings.camera === 'third' ? 'BROADCAST VIEW.' : 'FIRST PERSON.', 'Press V to switch.');
  };
  input.onPause = () => { if (engine.phase === 'playing') pause(); else if (engine.phase === 'paused' && !menu) { ui.closeForAction(); resume(); } };

  const ui = new UI(engine, settings, {
    play: start, demo: startDemo, takeControl, pause, resume, home, xr: () => { audio.init(); xr.start(); }, unlock: () => input.unlock(),
    uiSound: () => { audio.init(); audio.play({ type: 'ui' }); }, settingsChanged: () => { audio.setEnabled(settings.sound); pipeline.setQuality(richGraphics()); },
  });
  const xrUI = new XRUI(scene, input, engine, settings, { play: start, resume, select: mode => ui.selectMode(mode), settings: () => ui.syncSettings(), exit: () => xr.end() });
  const xr = new XRSessionManager(renderer, {
    onStart: () => {
      engine.preview = menu || demo || engine.preview; demo = false; ui.setDemo(false);
      document.body.classList.add('in-xr'); renderer.shadowMap.enabled = false; court.setDetail(false);
      input.unlock(); input.enabled = false; input.clear(); engine.pause(); menu = false;
      // The first XR pose, not the old cinematic camera, places the menu.
      rig.position.set(0, 0, 2); rig.rotation.set(0, 0, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
      xrUI.open(ui.mode); accumulator = 0;
    },
    onEnd: () => {
      document.body.classList.remove('in-xr'); renderer.shadowMap.enabled = true; court.setDetail(true);
      input.clear(); input.enabled = false; engine.pause(); xrUI.close(); rig.rotation.set(0, 0, 0);
      if (engine.preview || menu) home(); else { ui.setPlaying(true); ui.pause(); }
      resize();
    },
    onStatus: text => { ui.open(`<div class="eyebrow">HEADSET CONNECTION</div><h2>One more step.</h2><p id="xr-error-text"></p><p>Open this game in Quest Browser over HTTPS, then choose Play in VR. Desktop play is available here too.</p>`); document.getElementById('xr-error-text').textContent = text; },
    onReset: () => { input.left.resetMotion(); input.right.resetMotion(); if (!menu) { pause(false); faceBasket(); xrUI.open(engine.mode); } },
    onVisibility: state => { if (state !== 'visible') pause(); },
  });
  xr.supported().then(supported => {
    const el = document.getElementById('vr-status');
    if (supported) el.innerHTML = '<span class="mini-dot"></span> HEADSET CONNECTED <span>·</span> STEP ONTO THE COURT';
    else document.getElementById('enter-vr').title = 'For immersive VR, open this URL in Quest Browser over HTTPS.';
  });

  function resize() {
    if (input.xr) return;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); pipeline.resize();
  }
  window.addEventListener('resize', resize);
  // Context loss pauses simulation so a ball cannot score while the display is gone.
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  document.addEventListener('pointerdown', () => audio.init(), { once: true });

  function updateCamera(dt, t) {
    if (input.xr) {
      // Room-scale head movement contributes to the real player position. Only
      // the rig offset is moved by the stick; the runtime owns the eye height.
      const rotated = new THREE.Vector3(input.headRef.p.x, 0, input.headRef.p.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y);
      rig.position.set(engine.human.pos.x - rotated.x, settings.locomotion === 'blink' ? 0 : engine.human.jump * 0.25, engine.human.pos.z - rotated.z);
      input.refreshWorld();
    } else if (menu) {
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      camera.position.set(11.6 + Math.sin(t * 0.045) * 0.8, 7.9, 13.9);
      camera.lookAt(-1.2, 1.0, -2.0);
    } else if (demo) {
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      const target = new THREE.Vector3();
      for (const p of engine.players) target.add(new THREE.Vector3(p.pos.x, 0, p.pos.z));
      target.multiplyScalar(0.5 / engine.players.length).addScaledVector(engine.ball.pos, 0.5);
      target.y = 1.25 + Math.min(1.3, Math.max(0, engine.ball.pos.y - 2) * 0.3);
      target.x = THREE.MathUtils.clamp(target.x, -4.6, 4.6); target.z = THREE.MathUtils.clamp(target.z, -5.6, 2.6);
      demoFocus.lerp(target, 1 - Math.exp(-dt * 2.6));
      // A low sideline camera that travels with the play, close enough to
      // read footwork, hands and the ball.
      demoPosition.set(7.6 + demoFocus.x * 0.22, 2.7, 1.4 + demoFocus.z * 0.62);
      camera.position.lerp(demoPosition, 1 - Math.exp(-dt * 1.9)); camera.lookAt(demoFocus);
    } else if (thirdPerson()) {
      // Over the shoulder: behind the athlete along the aim line, high enough
      // to see the handle, the defender and the rim together.
      const p = engine.human, sin = Math.sin(input.yaw), cos = Math.cos(input.yaw), back = 2.75 - input.pitch * 0.6;
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      chaseLook.set(p.pos.x + sin * 3.4, 1.72 + p.jump * 0.5 + input.pitch * 3, p.pos.z + cos * 3.4);
      // Sit just off the ball-hand shoulder so the lane ahead stays open.
      const shoulder = 0.42 * p.side;
      viewerPosition.set(THREE.MathUtils.clamp(p.pos.x - sin * back - cos * shoulder, -8.5, 8.5), 2.02 + p.jump * 0.4 - input.pitch * 1.1, THREE.MathUtils.clamp(p.pos.z - cos * back + sin * shoulder, -8.9, 20.9));
      if (!chaseReady) { chase.copy(viewerPosition); chaseReady = true; } else chase.lerp(viewerPosition, 1 - Math.exp(-dt * 14));
      camera.position.copy(chase); camera.lookAt(chaseLook);
    } else {
      rig.position.set(engine.human.pos.x, engine.human.jump, engine.human.pos.z); rig.rotation.set(0, 0, 0);
      camera.position.set(0, 1.72, 0); camera.rotation.set(input.pitch, input.yaw - Math.PI, 0, 'YXZ');
    }
    const fov = input.xr ? camera.fov : demo && !menu ? 46 : thirdPerson() && !menu ? 60 : 68;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    rig.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  }

  // Integration harness exposed only with an explicit test query parameter.
  // Smoke tests drive normal input and use this snapshot to assert outcomes.
  if (new URLSearchParams(location.search).has('test')) {
    window.__rimrun = { engine, input, settings, pipeline, court, camera, render: () => pipeline.render(false), start, startDemo, takeControl, pause, resume, home, scene, renderer, views: () => players,
      snapshot: () => ({ phase: engine.phase, mode: engine.mode, score: [...engine.score], owner: engine.ownerId, ball: engine.ball.pos.toArray(), stats: { ...engine.stats }, rack: engine.rack, shots: engine.contestShots }) };
  }
  home(); document.body.classList.add('ready');
  let errorShown = false;
  renderer.setAnimationLoop((ms, frame) => {
    try {
      const now = ms / 1000, wallDt = lastTime === null ? 0 : Math.min(0.3, Math.max(0, now - lastTime));
      const dt = nextFrame || lastTime === null ? 0 : Math.min(0.05, wallDt);
      lastTime = now; nextFrame = false;
      input.update(now, frame);
      // Real horizontal headset displacement is applied before stick input.
      if (input.xr && input.viewerTracked && engine.phase === 'playing' && !menu && !engine.checkTimer && lastHeadRef) {
        const delta = new THREE.Vector3(input.headRef.p.x - lastHeadRef.x, 0, input.headRef.p.z - lastHeadRef.z);
        if (delta.length() < 0.3) { delta.applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y); engine.human.pos.x += delta.x; engine.human.pos.z += delta.z; }
      }
      lastHeadRef = input.xr && input.viewerTracked ? { x: input.headRef.p.x, z: input.headRef.p.z } : null;
      const cmd = demo ? demoCommand(engine) : input.command(dt, settings, engine);
      if (!demo && !input.xr && !thirdPerson()) cmd.eyeView = true;
      const discrete = ['gather', 'cancelGather', 'release', 'jump', 'moveAction', 'steal', 'pass', 'blink', 'blinkStep'];
      for (const key of discrete) if (cmd[key] != null) pending[key] = cmd[key];
      if (cmd.blink) { blink = 0.13; xrBlink = 0.13; }
      if (engine.phase === 'playing') {
        accumulator = Math.min(0.08, accumulator + dt);
        let first = true;
        while (accumulator >= CONFIG.fixedStep) {
          const command = { ...cmd };
          for (const key of discrete) delete command[key];
          if (first) Object.assign(command, pending);
          engine.step(CONFIG.fixedStep, command);
          if (first) { pending = {}; first = false; }
          accumulator -= CONFIG.fixedStep;
        }
      }
      for (const event of engine.drainEvents()) {
        if (!menu && (!engine.preview || demo)) {
          ui.event(event, now, demo); xrUI.event(event, now); audio.play(event);
          court.event(event); effects.event(event);
          if (event.type === 'recenter' && !demo) faceBasket();
          const strength = { shot: 0.25, bounce: 0.1, steal: 0.5, poke: 0.4, block: 0.7, catch: 0.3, move: 0.18, score: 0.6, bump: 0.35, land: 0.12, pump: 0.15 }[event.type];
          if (strength) {
            const personal = (event.player ?? event.owner) === 0 || event.type === 'score' && event.team === 0;
            if (input.xr && personal) input[input.physicalGather || settings.dominant].pulse(strength, event.type === 'score' ? 90 : 25);
          }
          if (event.type === 'finish') {
            if (demo) { demoRestart = 3; continue; }
            input.enabled = false; input.unlock();
            if (engine.mode === 'contest') { saveBest(engine.score[0]); ui.updateBest(); }
            if (input.xr) xrUI.open(engine.mode); else ui.result();
          }
        }
      }
      if (menu && engine.phase === 'result') { engine.start('2v2'); engine.preview = true; }
      if (demo && engine.phase === 'result') { demoRestart -= dt; if (demoRestart <= 0) startDemo(engine.mode); }
      updateCamera(dt, now);
      if (input.xr && engine.ownerId === 0 && engine.ballState === 'held') {
        const c = input[input.physicalGather || settings.dominant];
        if (c.tracked) { engine.hand = c.gripPose.p.clone().add(new Vec3(0, 0.03, -0.06).applyQuat(c.gripPose.q)); engine.updateOwnedBall(0); }
      }
      const viewer = input.xr ? input.head.p : camera.getWorldPosition(viewerPosition);
      for (const [i, view] of players.entries()) {
        const p = engine.players[i];
        const local = p.id === 0 && !menu && !demo, own = local && !thirdPerson();
        view.update(dt, engine.time, p, engine, !local || !input.xr, own && !input.xr ? input.pitch : null);
        if (!own) view.h.updateLod(viewer);
        // Hard plants and cuts chirp on the hardwood.
        const force = p.acceleration.length(), last = squeaks.get(p.id) || 0;
        if (dt && engine.phase === 'playing' && !menu && p.jump < 0.02 && force > 16 && p.vel.length() > 1.4 && now - last > 0.32 && p.acceleration.dot(p.vel) < 0) {
          squeaks.set(p.id, now); audio.play({ type: 'squeak', strength: Math.min(1, force / 22) });
        }
      }
      hands.update(input, engine, !menu && !demo && engine.phase === 'playing'); effects.update(dt, engine); court.update(dt, engine, now);
      audio.update(engine, !menu || demo);
      xrUI.update(dt, now);
      uiTick += dt; if (uiTick > 0.05) { uiTick = 0; if (!menu) ui.update(now); }
      blink = Math.max(0, blink - wallDt); blinkElement.style.opacity = String(Math.min(0.85, blink * 6));
      xrBlink = Math.max(0, xrBlink - wallDt); comfort.visible = input.xr && xrBlink > 0; comfort.position.copy(input.head.p); comfortMat.opacity = Math.min(0.92, xrBlink * 7);
      if (!pace.settled && settings.graphics === 'auto' && pipeline.high && !input.xr && document.hasFocus()) {
        const t = performance.now(), frame = t - pace.last; pace.last = t;
        if (frame < 250) { pace.frames++; if (frame > 25) pace.slow++; }
        if (pace.frames >= 180) {
          if (pace.slow > 110) { pipeline.setQuality(false); if (!menu) engine.toast('STANDARD GRAPHICS.', 'Reflections and bloom are off. Change it in Settings.'); pace.settled = true; }
          else if (pace.slow < 40) pace.settled = true;
          pace.frames = pace.slow = 0;
        }
      } else pace.last = performance.now();
      pipeline.feed(feedFocus.set(engine.ball.pos.x, Math.max(1.2, engine.ball.pos.y * 0.6 + 0.6), engine.ball.pos.z));
      pipeline.render(input.xr);
    } catch (error) { if (!errorShown) { errorShown = true; fail(error); renderer.setAnimationLoop(null); } }
  });
}
