import { CONFIG, MODES, RACKS } from './config.js';
import { loadBest, saveBest, saveSettings } from './game/settings.js';
const $ = id => document.getElementById(id);
const percent = n => `${Math.round(n * 100)}%`;
const stat = (value, label) => `<div class="result-stat"><strong>${value}</strong><span>${label}</span></div>`;

export class UI {
  constructor(engine, settings, hooks) {
    this.engine = engine; this.settings = settings; this.hooks = hooks; this.mode = '1v1'; this.toastUntil = 0; this.feedbackUntil = 0;
    this.dialog = $('dialog'); this.content = $('dialog-content'); this.resumeOnClose = false; this.ignoreClose = false;
    for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { this.selectMode(b.dataset.mode); hooks.uiSound(); });
    for (const b of document.querySelectorAll('[data-difficulty]')) b.addEventListener('click', () => { settings.difficulty = b.dataset.difficulty; this.syncSettings(); hooks.uiSound(); });
    $('play').addEventListener('click', () => hooks.play(this.mode));
    $('enter-vr').addEventListener('click', () => hooks.xr());
    $('home').addEventListener('click', () => { if (engine.phase === 'playing') hooks.pause(); });
    $('pause').addEventListener('click', () => hooks.pause());
    $('help-open').addEventListener('click', () => this.help());
    $('settings-open').addEventListener('click', () => this.openSettings());
    $('sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; this.syncSettings(); hooks.uiSound(); });
    $('dialog-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      const resume = this.resumeOnClose; this.resumeOnClose = false;
      if (!this.ignoreClose && resume) hooks.resume(); this.ignoreClose = false;
    });
    this.dialog.addEventListener('cancel', () => { if (engine.phase === 'result') { this.resumeOnClose = false; hooks.home(); } });
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
  setPlaying(on) { document.body.classList.toggle('playing', on); $('hud').hidden = !on; $('menu').hidden = on; }
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
      ['W A S D / arrows', 'Move. Mouse to look. Hold Shift to sprint. Click the court to capture your mouse.'],
      ['Hold / release LMB', 'Gather, then release on the green band. Face the hoop. Jump near the rim to dunk.'],
      ['Q / E / R / C', 'Crossover / behind the back / spin / stepback. Chain moves to create space; watch your stamina.'],
      ['Space / F', 'Jump to block or rebound. F or right-click to steal an exposed dribble. Hold Ctrl for a defensive stance.'],
      ['X', 'Pass in 2v2. Press again when Jax has it to call for the ball. Passes can be intercepted.'],
      ['Esc / M', 'Pause or return to the menu. On touch screens, use the movement pad and action buttons; drag the court to look.'],
    ];
    const vr = [
      ['Grip → release', 'Hold either grip to gather. Lift the ball and release with an upward flick to shoot. Release downward to bounce.'],
      ['Trigger → release', 'Easy shooting: hold your ball-hand trigger, then release on green. Your movement still controls the ball.'],
      ['Handles', 'Sweep a low hand across your body for a crossover, or behind your hip for a wrap. Ball-hand A / B also do these moves.'],
      ['Sticks', 'Left stick moves; click it to sprint. Right stick left / right turns, up spins, down steps back. Snap turns are the default.'],
      ['Off-hand controls', 'Trigger passes or calls for the ball. Lower face button jumps / blocks. Hold grip for defensive stance. Reach toward live balls to catch.'],
      ['Defending / menu', 'Ball-hand trigger steals on defense. Reach up while jumping to block. Off-hand upper face button or right stick click opens the menu.'],
    ];
    this.open(`<div class="eyebrow">A LITTLE FEEL GOES A LONG WAY</div><h2>Get in your bag.</h2><div class="help-tabs"><button data-tab="desktop" class="${tab === 'desktop' ? 'active' : ''}">DESKTOP / TOUCH</button><button data-tab="vr" class="${tab === 'vr' ? 'active' : ''}">QUEST / VR</button></div><div class="control-list">${(tab === 'vr' ? vr : desktop).map(([a, b]) => `<div class="control-row"><strong>${a}</strong><span>${b}</span></div>`).join('')}</div><p class="help-tip">${tab === 'vr' ? 'Use controller straps and a clear play space. Keep your feet inside your boundary; the stick does the running. Set your shooting hand and comfort preferences in Settings.' : 'Games are against AI. First to 11, win by 2 (cap 21), 2s and 3s. After a steal or defensive rebound, take it beyond the arc. Three-point contest: 70 seconds, 25 balls, gold balls count double, maximum 34.'}</p>`, resume);
    for (const b of this.content.querySelectorAll('[data-tab]')) b.addEventListener('click', () => this.help(b.dataset.tab));
  }
  openSettings() {
    const resume = this.prepareDialog() || this.resumeOnClose, s = this.settings;
    const row = (key, title, hint, options) => `<label class="settings-row"><span><strong>${title}</strong><small>${hint}</small></span><select data-setting="${key}" aria-label="${title}">${options.map(([value, text]) => `<option value="${value}" ${String(s[key]) === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    this.open(`<div class="eyebrow">MAKE IT FEEL LIKE YOU</div><h2>Your game.</h2>${row('difficulty', 'Competition & shot assist', 'Rookie gives a bigger release window.', [['rookie', 'Rookie'], ['park', 'Park'], ['allstar', 'All-star']])}${row('dominant', 'Shooting hand', 'Also swaps ball-hand button shortcuts.', [['right', 'Right'], ['left', 'Left']])}${row('locomotion', 'VR movement', 'Blink moves you in short, dimmed steps.', [['smooth', 'Smooth'], ['blink', 'Comfort / blink']])}${row('turn', 'VR turning', 'Snap turns 30° at a time.', [['snap', 'Snap 30°'], ['smooth', 'Smooth'], ['off', 'Physical only']])}${row('autoDribble', 'Dribble rhythm', 'Assisted rhythm or height from your hand.', [['true', 'Automatic'], ['false', 'Hand driven']])}${row('sound', 'Sound', 'Court sounds and crowd reactions.', [['true', 'On'], ['false', 'Off']])}<p>Preferences and your three-point best stay on this device. VR requires a WebXR browser over HTTPS or localhost.</p>`, resume);
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
    this.open(`<div class="eyebrow">${contest ? `THREE-POINT CONTEST / BEST ${best}` : 'FINAL / SUNSET PARK'}</div><h2>${contest ? e.score[0] >= 24 ? 'Certified sniper.' : 'Nice range.' : won ? 'Court is yours.' : 'Run it back.'}</h2><div class="result-score"><strong>${e.score[0]}</strong><span>${contest ? '/ 34 POINTS' : '—'}</span>${contest ? '' : `<strong>${e.score[1]}</strong>`}</div>${racks}<div class="result-stats">${stat(`${s.made}/${s.attempts}`, 'SHOOTING')}${stat(s.attempts ? percent(s.made / s.attempts) : '0%', 'FIELD GOAL %')}${stat(contest ? s.threes : s.assists, contest ? 'THREES MADE' : 'ASSISTS')}${contest ? '' : stat(s.steals, 'STEALS') + stat(s.blocks, 'BLOCKS') + stat(s.bestCombo, 'BEST COMBO')}</div><button id="play-again" class="primary">RUN IT BACK <span>↗</span></button><button id="result-home" class="secondary">BACK TO THE NEIGHBORHOOD</button>`, false);
    $('play-again').onclick = () => { this.closeForAction(); this.hooks.play(e.mode); };
    $('result-home').onclick = () => { this.closeForAction(); this.hooks.home(); };
  }
  event(e, now) {
    if (e.type === 'toast') {
      const el = $('toast'); el.querySelector('strong').textContent = e.title; el.querySelector('span').textContent = e.detail;
      el.dataset.kind = e.kind; el.classList.add('show'); this.toastUntil = now + 2.2;
      this.lastToast = e;
    }
    if (e.type === 'shot') {
      const s = e.shot; $('release-text').textContent = s.dunk ? 'THROW IT DOWN' : s.green ? 'GREEN RELEASE' : `${s.timing} RELEASE`;
      $('shot-quality').textContent = percent(s.quality); $('shot-contest').textContent = s.contest > 0.65 ? 'SMOTHERED' : s.contest > 0.25 ? 'CONTESTED' : 'OPEN';
      $('shot-distance').textContent = `${s.distance.toFixed(1)} M`; $('shot-feedback').classList.add('show'); this.feedbackUntil = now + 4;
    }
  }
  update(now) {
    const e = this.engine, contest = e.mode === 'contest';
    $('score-home').textContent = String(e.score[0]).padStart(2, '0'); $('score-away').textContent = contest ? String(25 - e.contestShots).padStart(2, '0') : String(e.score[1]).padStart(2, '0');
    $('home-label').textContent = contest ? 'POINTS' : e.mode === '2v2' ? 'YOUR TEAM' : 'YOU'; $('away-label').textContent = contest ? 'BALLS LEFT' : e.mode === '2v2' ? 'THEIR TEAM' : 'THEM';
    $('mode-label').textContent = contest ? '3PT · FIVE RACKS' : e.mode === 'practice' ? 'SHOOTAROUND' : `${MODES[e.mode].short} · FIRST TO 11`;
    $('clock').textContent = contest ? Math.ceil(e.contestTime) : e.mode === 'practice' ? '∞' : Math.max(0, Math.ceil(e.shotClock));
    $('clock').style.color = (contest ? e.contestTime < 10 : e.shotClock < 5) ? '#ff8b6e' : '';
    $('clock-label').textContent = contest ? 'SECONDS LEFT' : e.mode === 'practice' ? 'JUST BUCKETS' : 'SHOT CLOCK';
    $('stamina-fill').style.width = `${e.human.stamina}%`;
    $('heat-label').innerHTML = e.heatTime > 0 ? `ON FIRE <i>${Math.ceil(e.heatTime)}s</i>` : `HEAT <i>${'● '.repeat(Math.min(5, e.heat))}${'○ '.repeat(5 - Math.min(5, e.heat))}</i>`;
    $('possession').innerHTML = `${e.needsClear && e.possession === 0 ? 'CLEAR BEYOND THE ARC' : e.ownerId === 0 ? 'YOUR BALL' : e.owner?.team === 0 ? 'CUT. GET OPEN.' : e.isMatch && e.possession === 1 ? 'LOCK IN. DEFEND.' : 'FIND YOUR SHOT'} <span>↗</span>`;
    $('combo').textContent = e.comboUntil > e.time ? e.combo.join(' › ') : '';
    const gathering = e.ownerId === 0 && e.ballState === 'held'; $('shot-meter').classList.toggle('active', gathering);
    const f = Math.min(100, e.charge / CONFIG.shot.maxCharge * 100); $('meter-fill').style.width = `${f}%`; $('meter-needle').style.left = `${f}%`;
    const window = { rookie: 0.12, park: 0.075, allstar: 0.05 }[e.difficulty] * (e.heatTime ? 1.3 : 1);
    const zone = document.querySelector('.green-zone'); zone.style.left = `${(0.72 - window) / 1.35 * 100}%`; zone.style.width = `${window * 2 / 1.35 * 100}%`;
    $('meter-word').textContent = Math.abs(e.charge - 0.72) < window ? 'LET IT FLY!' : e.charge < 0.72 ? 'FIND THE GREEN' : 'LATE';
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
