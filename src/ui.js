import { CONFIG, MODES, RACKS } from './config.js';
import { loadBest, saveBest, saveSettings } from './game/settings.js';
const $ = id => document.getElementById(id);
const percent = n => `${Math.round(n * 100)}%`;
const stat = (value, label) => `<div class="result-stat"><strong>${value}</strong><span>${label}</span></div>`;

export class UI {
  constructor(engine, settings, hooks) {
    this.engine = engine; this.settings = settings; this.hooks = hooks; this.mode = '1v1'; this.toastUntil = 0; this.feedbackUntil = 0; this.releaseUntil = 0; this.release = null; this.helpKey = '';
    this.touchControls = [...document.querySelectorAll('[data-action]')];
    this.dialog = $('dialog'); this.content = $('dialog-content'); this.resumeOnClose = false; this.ignoreClose = false;
    for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { this.selectMode(b.dataset.mode); hooks.uiSound(); });
    for (const b of document.querySelectorAll('[data-difficulty]')) b.addEventListener('click', () => { settings.difficulty = b.dataset.difficulty; this.syncSettings(); hooks.uiSound(); });
    $('play').addEventListener('click', () => hooks.play(this.mode));
    $('watch-demo').addEventListener('click', () => hooks.demo(this.mode));
    for (const b of document.querySelectorAll('[data-demo-mode]')) b.addEventListener('click', () => hooks.demo(b.dataset.demoMode));
    $('take-control').addEventListener('click', () => hooks.takeControl());
    $('exit-demo').addEventListener('click', () => hooks.home());
    $('enter-vr').addEventListener('click', () => hooks.xr());
    $('home').addEventListener('click', () => { if (engine.phase === 'playing') hooks.pause(); });
    $('pause').addEventListener('click', () => hooks.pause());
    $('help-open').addEventListener('click', () => this.help());
    $('settings-open').addEventListener('click', () => this.openSettings());
    $('sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; this.syncSettings(); hooks.uiSound(); });
    $('dialog-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      const resume = this.resumeOnClose; this.resumeOnClose = false;
      if (!this.ignoreClose && resume) hooks.resume();
      else if (!this.ignoreClose && engine.phase === 'result') hooks.home();
      this.ignoreClose = false;
    });
    this.syncSettings(); this.updateBest();
  }
  selectMode(mode) {
    this.mode = mode;
    for (const b of document.querySelectorAll('[data-mode]')) { const selected = b.dataset.mode === mode; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); }
    $('play').firstChild.textContent = mode === 'contest' ? 'MAKE IT RAIN ' : mode === 'practice' ? 'FIND YOUR RHYTHM ' : 'LET’S RUN IT ';
  }
  syncSettings() {
    saveSettings(this.settings);
    for (const b of document.querySelectorAll('[data-difficulty]')) b.classList.toggle('active', b.dataset.difficulty === this.settings.difficulty);
    $('sound-toggle').style.opacity = this.settings.sound ? '1' : '.45'; $('sound-toggle').setAttribute('aria-label', this.settings.sound ? 'Mute sound' : 'Enable sound');
    this.hooks.settingsChanged?.();
    this.engine.difficulty = this.settings.difficulty;
  }
  updateBest() { const best = loadBest(); $('personal-best').textContent = best ? `3PT PERSONAL BEST / ${best} POINTS` : 'FIVE RACKS. ONE HOT HAND.'; }
  setPlaying(on) {
    document.body.classList.toggle('playing', on); $('hud').hidden = !on; $('menu').hidden = on;
    this.feedbackUntil = this.toastUntil = 0; this.rackKey = '';
    $('shot-feedback').classList.remove('show'); $('toast').classList.remove('show');
    if (on) this.update(performance.now() / 1000);
  }
  setDemo(on, mode) {
    this.demo = on; document.body.classList.toggle('is-demo', on); $('demo-controls').hidden = !on;
    for (const b of document.querySelectorAll('[data-demo-mode]')) b.setAttribute('aria-pressed', String(b.dataset.demoMode === mode));
  }
  closeForAction() { this.resumeOnClose = false; this.ignoreClose = this.dialog.open; if (this.dialog.open) this.dialog.close(); }
  open(content, resume = false) {
    this.content.innerHTML = content; this.resumeOnClose = resume;
    if (!this.dialog.open) this.dialog.showModal();
    this.hooks.unlock();
  }
  prepareDialog() { const active = this.engine.phase === 'playing'; if (active) this.hooks.pause(false); return active; }
  help(tab = 'desktop') {
    const resume = this.prepareDialog() || this.resumeOnClose;
    const desktop = [
      ['W A S D / arrows', 'Move. Mouse to look. Hold Shift to sprint. Click the court to capture your mouse. V switches between first person and the broadcast view.'],
      ['Hold / release LMB', 'Gather, rise and release at the top of your jump, in the green band beside the reticle. Early leaves it short, late sends it long. Set your feet, shoot open, and expect less from deep. A quick tap is a pump fake.'],
      ['At the rim', 'Drive and shoot inside the paint for a layup; from the wings it goes off the glass. Get right under the ring with a head of steam and release above it to dunk.'],
      ['Q / Z / E', 'Crossover / between the legs / behind the back. Each changes hands. Use them against the way your defender is sliding.'],
      ['R / C / T', 'Spin / stepback / hesitation. Chain moves to build a combo; a defender caught leaning, reaching or in the air gets left behind.'],
      ['Ctrl', 'With the ball: protect it. A low dribble on your far hip, arm bar up, hard to strip. On defense: a balanced stance that slides, holds its ground and contests.'],
      ['Space / F', 'Jump to block or rebound: you need a hand on the ball on its way up, and touching it on the way down is goaltending. F or right-click reaches for a steal; the ball has to be on your side of the dribbler, and a miss leaves you leaning.'],
      ['X / G / B', 'Pass in 2v2: X picks the right pass, G is a bounce pass under a defender, B is a lob over the top. Press X when Jax has it to call for the ball. F on a pass in flight tips it.'],
      ['Esc / M', 'Pause or return to the menu. On touch screens, use the movement pad and action buttons; drag the court to look.'],
    ];
    const vr = [
      ['Grip → release', 'Hold either grip to gather. Lift the ball and release with an upward flick to shoot: the ball leaves along your hand’s own line and arc. Release downward to bounce it.'],
      ['Trigger → release', 'Timed shooting: hold your ball-hand trigger, rise, then release in the green. A quick tap is a pump fake.'],
      ['Handles', 'Sweep a low hand across your body for a crossover, or behind your hip for a wrap. Ball-hand A / B do the same; hold the left stick click with A / B for between the legs / hesitation.'],
      ['Sticks', 'Left stick moves; click it to sprint. Right stick left / right turns, up spins, down steps back. Snap turns are the default.'],
      ['Passing', 'Off-hand trigger picks the right pass, or calls for the ball. A real chest-height throw is a chest pass; throw it down and out for a bounce pass.'],
      ['Defending / menu', 'Hold off-hand grip for a stance. Ball-hand trigger reaches for a steal. Off-hand lower button jumps; get a real hand on a shot to block it. Off-hand upper button or right stick click opens the menu.'],
    ];
    this.open(`<div class="eyebrow">A LITTLE FEEL GOES A LONG WAY</div><h2>Get in your bag.</h2><div class="help-tabs"><button data-tab="desktop" class="${tab === 'desktop' ? 'active' : ''}">DESKTOP / TOUCH</button><button data-tab="vr" class="${tab === 'vr' ? 'active' : ''}">QUEST / VR</button></div><div class="control-list">${(tab === 'vr' ? vr : desktop).map(([a, b]) => `<div class="control-row"><strong>${a}</strong><span>${b}</span></div>`).join('')}</div><p class="help-tip">${tab === 'vr' ? 'Use controller straps and a clear play space. Keep your feet inside your boundary; the stick does the running. Set your shooting hand and comfort preferences in Settings.' : 'Games are against AI. First to 11, win by 2 (cap 21), 2s and 3s. After a steal or defensive rebound, take it beyond the arc. Three-point contest: 70 seconds, 25 balls, gold balls count double, maximum 34.'}</p>`, resume);
    for (const b of this.content.querySelectorAll('[data-tab]')) b.addEventListener('click', () => this.help(b.dataset.tab));
  }
  openSettings() {
    const resume = this.prepareDialog() || this.resumeOnClose, s = this.settings;
    const row = (key, title, hint, options) => `<label class="settings-row"><span><strong>${title}</strong><small>${hint}</small></span><select data-setting="${key}" aria-label="${title}">${options.map(([value, text]) => `<option value="${value}" ${String(s[key]) === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    this.open(`<div class="eyebrow">MAKE IT FEEL LIKE YOU</div><h2>Your game.</h2>${row('difficulty', 'Competition & shot assist', 'Rookie gives a bigger release window.', [['rookie', 'Rookie'], ['park', 'Park'], ['allstar', 'All-star']])}${row('dominant', 'Shooting hand', 'Also swaps ball-hand button shortcuts.', [['right', 'Right'], ['left', 'Left']])}${row('locomotion', 'VR movement', 'Blink moves you in short, dimmed steps.', [['smooth', 'Smooth'], ['blink', 'Comfort / blink']])}${row('camera', 'Desktop camera', 'Press V in a game to switch.', [['first', 'First person'], ['third', 'Broadcast']])}${row('turn', 'VR turning', 'Snap turns 30° at a time.', [['snap', 'Snap 30°'], ['smooth', 'Smooth'], ['off', 'Physical only']])}${row('autoDribble', 'Dribble rhythm', 'Assisted rhythm or height from your hand.', [['true', 'Automatic'], ['false', 'Hand driven']])}${row('sound', 'Sound', 'Court sounds and crowd reactions.', [['true', 'On'], ['false', 'Off']])}<p>Preferences and your three-point best stay on this device. VR requires a WebXR browser over HTTPS or localhost.</p>`, resume);
    for (const el of this.content.querySelectorAll('[data-setting]')) el.addEventListener('change', () => { s[el.dataset.setting] = ['autoDribble', 'sound'].includes(el.dataset.setting) ? el.value === 'true' : el.value; this.syncSettings(); });
  }
  pause() {
    this.open(`<div class="eyebrow">TAKE A BREATHER</div><h2>Same court.<br>Next bucket.</h2><p>${MODES[this.engine.mode].subtitle}</p><button id="resume-game" class="primary">BACK TO THE GAME <span>↗</span></button><button id="pause-controls" class="secondary">CONTROLS & TIPS</button><button id="restart-game" class="secondary">RESTART THIS RUN</button><button id="leave-game" class="secondary">CHOOSE A DIFFERENT RUN</button>`, true);
    $('resume-game').onclick = () => this.dialog.close();
    $('pause-controls').onclick = () => this.help();
    $('restart-game').onclick = () => { this.closeForAction(); this.hooks.play(this.engine.mode); };
    $('leave-game').onclick = () => { this.closeForAction(); this.hooks.home(); };
  }
  result() {
    const e = this.engine, s = e.stats, contest = e.mode === 'contest', won = e.score[0] > e.score[1];
    let best = 0; if (contest) best = saveBest(e.score[0]); this.updateBest();
    const racks = contest ? `<div class="result-racks">${RACKS.map((r, ri) => `<div class="result-rack ${ri === 2 ? 'money' : ''}"><span>${['L CORNER', 'L WING', 'MONEY RACK', 'R WING', 'R CORNER'][ri]}</span><div>${e.contestResults.slice(ri * 5, ri * 5 + 5).map(r => r ? r.made ? '●' : '×' : '·').join('')}</div></div>`).join('')}</div>` : '';
    this.open(`<div class="eyebrow">${contest ? `THREE-POINT CONTEST / BEST ${best}` : 'FINAL / THE FIELDHOUSE'}</div><h2>${contest ? e.score[0] >= 24 ? 'Certified sniper.' : 'Nice range.' : won ? 'Court is yours.' : 'Run it back.'}</h2><div class="result-score"><strong>${e.score[0]}</strong><span>${contest ? '/ 34 POINTS' : '—'}</span>${contest ? '' : `<strong>${e.score[1]}</strong>`}</div>${racks}<div class="result-stats">${stat(`${s.made}/${s.attempts}`, 'SHOOTING')}${stat(s.attempts ? percent(s.made / s.attempts) : '0%', 'FIELD GOAL %')}${stat(contest ? s.threes : s.assists, contest ? 'THREES MADE' : 'ASSISTS')}${contest ? '' : stat(s.swishes, 'SWISHES') + stat(s.rebounds, 'REBOUNDS') + stat(s.steals, 'STEALS') + stat(s.blocks, 'BLOCKS') + stat(s.ankles, 'ANKLES TAKEN')}</div><button id="play-again" class="primary">RUN IT BACK <span>↗</span></button><button id="result-home" class="secondary">BACK TO RIMRUN ARENA</button>`, false);
    $('play-again').onclick = () => { this.closeForAction(); this.hooks.play(e.mode); };
    $('result-home').onclick = () => { this.closeForAction(); this.hooks.home(); };
  }
  event(e, now, demo = false) {
    if (e.type === 'toast') {
      const el = $('toast'); el.querySelector('strong').textContent = e.title; el.querySelector('span').textContent = e.detail;
      el.dataset.kind = e.kind; el.classList.add('show'); this.toastUntil = now + 2.2;
      this.lastToast = e;
    }
    if (e.type === 'shot' && (e.player === 0 || demo)) {
      const s = e.shot, ms = Math.round(Math.abs(s.offset) * 1000);
      const kind = s.dunk ? 'DUNK' : s.layup ? (s.bank ? 'LAYUP · GLASS' : 'LAYUP') : s.floater ? 'FLOATER' : s.fade ? 'FADEAWAY' : s.rhythm ? 'CATCH & SHOOT' : s.value === 3 ? 'THREE' : 'JUMPER';
      $('shot-kind').textContent = kind;
      $('release-text').textContent = s.dunk ? 'THROW IT DOWN' : s.green ? 'PERFECT RELEASE' : s.timing === 'PERFECT' ? 'ON TIME' : s.timing === 'EARLY' || s.timing === 'LATE' ? `${s.timing} · ${ms} MS` : `${s.timing} FLICK`;
      $('shot-result').textContent = 'IN THE AIR…';
      $('shot-quality').textContent = `${percent(s.quality)} FORM`; $('shot-contest').textContent = s.contest > 0.6 ? 'SMOTHERED' : s.contest > 0.22 ? 'CONTESTED' : 'OPEN';
      $('shot-distance').textContent = `${s.distance.toFixed(1)} M`; $('shot-arc').textContent = s.dunk ? 'RIM' : `ARC ${Math.round(s.arc)}°`;
      $('shot-feedback').classList.remove('miss'); $('shot-feedback').classList.add('show'); this.feedbackUntil = now + 4.5;
      if (e.player === 0 && !demo && !s.dunk) { this.release = { fill: s.offset + CONFIG.shot.idealTime, state: s.green || s.timing === 'PERFECT' ? 'perfect' : s.timing.toLowerCase(), word: s.green ? 'PERFECT' : s.timing === 'PERFECT' ? 'ON TIME' : s.timing, note: s.timing === 'EARLY' || s.timing === 'LATE' ? `${ms} MS ${s.timing}` : s.green ? 'PURE' : 'GOOD LOOK' }; this.releaseUntil = now + 0.85; }
    }
    if (e.type === 'shotResult' && (e.player === 0 || demo)) {
      $('shot-result').textContent = e.label; $('shot-feedback').classList.toggle('miss', !e.made); this.feedbackUntil = now + 3.5;
    }
  }
  update(now) {
    const e = this.engine, contest = e.mode === 'contest';
    $('score-home').textContent = String(e.score[0]).padStart(2, '0'); $('score-away').textContent = contest ? String(25 - e.contestShots).padStart(2, '0') : String(e.score[1]).padStart(2, '0');
    $('home-label').textContent = contest ? 'POINTS' : e.mode === '2v2' ? 'YOUR TEAM' : 'YOU'; $('away-label').textContent = contest ? 'BALLS LEFT' : e.mode === '2v2' ? 'THEIR TEAM' : 'THEM';
    if (this.demo && !contest) { $('home-label').textContent = 'HOME'; $('away-label').textContent = 'AWAY'; }
    $('mode-label').textContent = contest ? '3PT · FIVE RACKS' : e.mode === 'practice' ? 'SHOOTAROUND' : `${MODES[e.mode].short} · FIRST TO 11`;
    $('clock').textContent = contest ? Math.ceil(e.contestTime) : e.mode === 'practice' ? '∞' : Math.max(0, Math.ceil(e.shotClock));
    $('clock').style.color = (contest ? e.contestTime < 10 : e.shotClock < 5) ? '#ff8b6e' : '';
    $('clock-label').textContent = contest ? 'SECONDS LEFT' : e.mode === 'practice' ? 'JUST BUCKETS' : 'SHOT CLOCK';
    $('stamina-fill').style.width = `${e.human.stamina}%`;
    $('heat-label').innerHTML = e.heatTime > 0 ? `ON FIRE <i>${Math.ceil(e.heatTime)}s</i>` : `HEAT <i>${'● '.repeat(Math.min(5, e.heat))}${'○ '.repeat(5 - Math.min(5, e.heat))}</i>`;
    $('possession').innerHTML = `${e.checkTimer > 0 && e.isMatch ? 'CHECK BALL' : e.needsClear && e.possession === 0 ? 'CLEAR BEYOND THE ARC' : e.ownerId === 0 ? (e.human.protect > 0.7 ? 'BALL PROTECTED' : 'YOUR BALL') : e.owner?.team === 0 ? 'CUT. GET OPEN.' : e.isMatch && e.possession === 1 ? (e.ballState === 'held' || e.owner?.action === 'shooting' ? 'CONTEST THE SHOT' : 'LOCK IN. DEFEND.') : !e.owner && e.isMatch ? 'LOOSE BALL' : 'FIND YOUR SHOT'} <span>↗</span>`;
    $('combo').textContent = e.comboUntil > e.time ? e.combo.join(' › ') : '';
    // The meter rises with the shot. After the release it holds for a moment
    // so the timing can be read against the window.
    const gathering = e.ownerId === 0 && e.ballState === 'held' && !this.demo, held = now < this.releaseUntil && this.release, meter = $('shot-meter');
    meter.classList.toggle('active', gathering || !!held);
    const window = e.releaseWindow(), max = CONFIG.shot.maxCharge, error = e.charge - CONFIG.shot.idealTime;
    meter.style.setProperty('--fill', `${Math.min(100, (held ? this.release.fill : e.charge) / max * 100)}%`);
    meter.style.setProperty('--zone-start', `${(CONFIG.shot.idealTime - window) / max * 100}%`); meter.style.setProperty('--zone-size', `${window * 2 / max * 100}%`);
    if (held) { meter.dataset.state = this.release.state; $('meter-word').textContent = this.release.word; $('meter-note').textContent = this.release.note; }
    else {
      const state = Math.abs(error) <= window ? 'go' : e.charge < CONFIG.shot.pumpWindow ? 'pump' : error < 0 ? 'rise' : 'late';
      meter.dataset.state = state;
      $('meter-word').textContent = { go: 'RELEASE!', pump: 'PUMP', rise: 'RISE', late: 'LATE' }[state];
      $('meter-note').textContent = { go: 'TOP OF THE JUMP', pump: 'LET GO NOW TO FAKE', rise: 'HOLD… RELEASE IN THE GREEN', late: 'LET IT GO' }[state];
    }
    const possession = e.ownerId === 0;
    const defense = e.isMatch && e.possession === 1;
    for (const button of this.touchControls) {
      const action = button.dataset.action;
      let available;
      if (action === 'pass') {
        available = e.mode === '2v2' && e.owner?.team === 0;
        button.textContent = possession ? 'PASS' : 'CALL';
      } else if (action === 'defend' || action === 'steal') available = defense;
      else if (action === 'jump') available = !contest;
      else if (action === 'shoot') available = possession;
      else if (action === 'camera') available = true;
      else available = possession && !contest;
      // Keep the ongoing pointer target until release or cancellation.
      button.hidden = !available && !button.matches(':active');
    }
    $('touch-stick').hidden = contest;
    $('hud').dataset.side = defense ? 'defense' : 'offense';
    // The control strip follows the situation instead of listing everything.
    const key = contest ? 'contest' : possession ? (e.mode === '2v2' ? 'ball2' : 'ball') : defense ? 'defense' : e.mode === '2v2' && e.owner?.team === 0 ? 'offball' : 'free';
    if (this.helpKey !== key) {
      this.helpKey = key;
      const hint = (keys, text) => `<span><kbd>${keys}</kbd> ${text}</span>`;
      $('context-help').innerHTML = {
        contest: hint('HOLD LMB', 'rise') + hint('RELEASE', 'at the top, in the green'),
        ball: hint('HOLD LMB', 'shoot · tap to pump fake') + hint('Q Z E', 'cross · legs · wrap') + hint('R C T', 'spin · stepback · hesi') + hint('CTRL', 'protect') + hint('V', 'camera'),
        ball2: hint('HOLD LMB', 'shoot · tap to fake') + hint('Q Z E R C T', 'handles') + hint('X G B', 'pass · bounce · lob') + hint('CTRL', 'protect') + hint('V', 'camera'),
        defense: hint('CTRL', 'stance') + hint('F / RMB', 'steal') + hint('SPACE', 'contest · block') + hint('SHIFT', 'recover') + hint('V', 'camera'),
        offball: hint('X', 'call for the ball') + hint('SHIFT', 'cut') + hint('SPACE', 'rebound') + hint('V', 'camera'),
        free: hint('WASD', 'move') + hint('SPACE', 'rebound') + hint('V', 'camera'),
      }[key];
    }
    $('rack-progress').hidden = !contest;
    if (contest) {
      const key = `${e.rack}:${e.rackBall}:${e.contestShots}`;
      if (this.rackKey !== key) {
        this.rackKey = key;
        $('rack-progress').innerHTML = RACKS.map((_, ri) => `<div class="rack-group ${ri === e.rack ? 'active' : ''} ${ri === 2 ? 'money' : ''}"><span>${ri === 2 ? 'MONEY' : `RACK ${ri + 1}`}</span><i>${e.contestResults.slice(ri * 5, ri * 5 + 5).map((r, i) => r ? `<b class="${r.made ? 'made' : 'miss'}">${r.made ? '●' : '×'}</b>` : ri === e.rack && i === e.rackBall ? '◉' : '○').join('')}</i></div>`).join('');
      }
    }
    if (now > this.toastUntil) $('toast').classList.remove('show'); if (now > this.feedbackUntil) $('shot-feedback').classList.remove('show');
    this.minimap();
  }
  minimap() {
    const e = this.engine, c = $('minimap').getContext('2d'), x = n => 90 + n * 10, z = n => 20 + (n + 6.1) * 10;
    c.clearRect(0, 0, 180, 180); c.strokeStyle = '#eedfb85a'; c.lineWidth = 1; c.strokeRect(15, 3, 150, 155);
    c.beginPath(); c.arc(90, 20, 67.5, 0.21, Math.PI - 0.21); c.stroke(); c.strokeRect(65.5, 3, 49, 62);
    c.fillStyle = '#f2ddac'; c.fillRect(84, 12, 12, 2); c.beginPath(); c.arc(90, 20, 2.3, 0, 7); c.stroke();
    for (const p of e.players) { c.fillStyle = p.id === 0 ? '#fff0cf' : p.team === 0 ? '#a7dfb3' : '#f7a17e'; c.beginPath(); c.arc(x(p.pos.x), z(p.pos.z), p.id === 0 ? 4 : 3, 0, 7); c.fill(); if (p.id === 0) { c.strokeStyle = '#fff0cf'; c.beginPath(); c.moveTo(x(p.pos.x), z(p.pos.z)); c.lineTo(x(p.pos.x) + Math.sin(p.yaw) * 10, z(p.pos.z) + Math.cos(p.yaw) * 10); c.stroke(); } }
    c.fillStyle = '#ffba68'; c.beginPath(); c.arc(x(e.ball.pos.x), z(e.ball.pos.z), 2, 0, 7); c.fill();
  }
}
