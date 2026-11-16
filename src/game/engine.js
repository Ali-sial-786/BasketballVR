import { Vec3, clamp } from '../physics/math.js';
import { CONFIG, DIFFICULTIES, MODES, RACKS } from '../config.js';
import { Basketball, makeShot, isThree } from '../physics/basketball.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const teamPlayers = (players, team) => players.filter(p => p.team === team);
function athlete(id, team, name, x, z) {
  return { id, team, name, pos: new Vec3(x, 0, z), vel: new Vec3(), yaw: Math.PI,
    side: 1, stamina: 100, jump: 0, jumpVel: 0, stagger: 0, shield: 0,
    stealCooldown: 0, moveCooldown: 0, action: '', actionTime: 0, ownedFor: 0,
    aiWait: 0, aiMove: 0, charge: 0, dribble: 0, defending: false };
}

// Rendering, audio and browser input never decide a score. This simulation is
// deliberately usable in node, including the exact AI used in the headset.
export class GameEngine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng; this.ball = new Basketball(); this.events = []; this.start('practice'); this.phase = 'menu';
  }
  emit(type, data = {}) { this.events.push({ type, time: this.time, ...data }); }
  drainEvents() { return this.events.splice(0); }
  toast(title, detail = '', kind = 'normal') { this.emit('toast', { title, detail, kind }); }
  get human() { return this.players[0]; }
  get owner() { return this.players.find(p => p.id === this.ownerId); }
  get isMatch() { return this.mode === '1v1' || this.mode === '2v2'; }
  start(mode = '1v1', difficulty = 'park') {
    if (!MODES[mode]) mode = '1v1';
    this.mode = mode; this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'park';
    this.phase = 'playing'; this.time = 0; this.events = []; this.preview = false;
    this.players = [athlete(0, 0, 'YOU', 0, 1.6)];
    if (mode === '2v2') this.players.push(athlete(1, 0, 'JAX', 4, -0.5));
    if (this.isMatch) this.players.push(athlete(2, 1, 'NOVA', 0, -0.7));
    if (mode === '2v2') this.players.push(athlete(3, 1, 'ACE', 3.4, -2.2));
    this.score = [0, 0]; this.possession = 0; this.needsClear = false;
    this.shotClock = CONFIG.match.shotClock; this.ownerId = 0; this.ballState = 'dribble'; this.possessionPasses = 0;
    this.shot = null; this.lastShot = null; this.passInfo = null; this.lastPass = null;
    this.charge = 0; this.heat = 0; this.heatTime = 0; this.combo = []; this.comboUntil = 0;
    this.checkTimer = 1.1; this.checkTeam = 0; this.settleTimer = 0;
    this.contestTime = CONFIG.contest.seconds; this.rack = 0; this.rackBall = 0;
    this.contestResults = Array(25).fill(null); this.contestShots = 0; this.contestBuzzer = false;
    this.stats = { points: 0, made: 0, attempts: 0, threes: 0, steals: 0, blocks: 0, assists: 0, rebounds: 0, moves: 0, bestCombo: 0 };
    this.lastTouch = 0; this.flightAge = 0; this.looseAge = 0; this.hand = null; this.hands = [];
    this.manualDribble = false; this.dribbleImpulse = 0;
    if (mode === 'contest') this.placeAtRack();
    this.updateOwnedBall(0);
    this.toast(mode === 'contest' ? 'MAKE IT RAIN.' : mode === 'practice' ? 'FIND YOUR RHYTHM.' : 'CHECK BALL.',
      mode === 'contest' ? '25 balls · 70 seconds · gold balls count double' : mode === 'practice' ? 'Hold to gather. Release on green.' : 'First to 11 · win by 2 · 2s and 3s');
    this.emit('recenter');
  }
  pause() { if (this.phase === 'playing') { this.phase = 'paused'; this.charge = 0; if (this.ownerId === 0) this.ballState = 'dribble'; } }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }

  step(dt, cmd = {}) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    this.hand = cmd.hand || null; this.hands = cmd.hands || []; this.manualDribble = cmd.manualDribble || false;
    this.dribbleImpulse = Math.max(this.dribbleImpulse * Math.exp(-dt * 4), cmd.bounceSpeed || 0);
    for (const p of this.players) {
      p.stamina = Math.min(100, p.stamina + CONFIG.player.staminaRegen * dt);
      for (const k of ['stagger', 'shield', 'stealCooldown', 'moveCooldown', 'aiWait', 'aiMove', 'actionTime']) p[k] = Math.max(0, p[k] - dt);
      if (!p.actionTime) p.action = '';
      if (p.jump > 0 || p.jumpVel > 0) { p.jumpVel -= CONFIG.ball.gravity * dt; p.jump = Math.max(0, p.jump + p.jumpVel * dt); if (!p.jump) p.jumpVel = 0; }
      if (this.ownerId === p.id) p.ownedFor += dt; else { p.ownedFor = 0; p.charge = 0; }
    }
    this.heatTime = Math.max(0, this.heatTime - dt);
    if (this.comboUntil < this.time) this.combo = [];
    if (this.checkTimer > 0) {
      this.checkTimer -= dt;
      if (!this.owner) this.ball.step(dt);
      if (this.checkTimer <= 0) { this.checkTimer = 0; this.resetPossession(this.checkTeam); }
      return;
    }
    if (this.settleTimer > 0) {
      this.settleTimer -= dt;
      this.ball.step(dt);
      if (this.settleTimer <= 0) { this.settleTimer = 0; this.afterContestShot(); }
      return;
    }
    if (this.mode === 'contest') {
      this.contestTime = Math.max(0, this.contestTime - dt);
      if (!this.contestTime && !this.contestBuzzer) {
        this.contestBuzzer = true; this.emit('buzzer');
        if (this.ballState !== 'flight') { this.finish(); return; }
        this.toast('AT THE BUZZER!', 'This one still counts.');
      }
    }
    if (!this.preview) this.humanInput(dt, cmd);
    this.updateAI(dt);
    this.separatePlayers();
    if (this.needsClear && this.owner && isThree(this.owner.pos)) {
      this.needsClear = false; this.toast('CLEARED.', 'Go get a bucket.');
    }
    if (this.isMatch && (this.ballState === 'dribble' || this.ballState === 'held')) {
      this.shotClock -= dt;
      if (this.shotClock <= 0) { this.turnover('SHOT CLOCK.', 'Get your shot off before 18.'); return; }
    }
    if (this.owner) this.updateOwnedBall(dt);
    else this.updateFlight(dt);
    this.boundaries();
  }

  humanInput(dt, cmd) {
    const p = this.human;
    if (cmd.aim) p.yaw = Math.atan2(cmd.aim.x, cmd.aim.z);
    p.defending = !!cmd.defend;
    const m = new Vec3(cmd.move?.x || 0, 0, cmd.move?.z || 0);
    if (m.length() > 1) m.normalize();
    if (cmd.blinkStep && this.mode !== 'contest') { p.pos.addScaled(m, 1.1); m.set(0, 0, 0); }
    const sprint = cmd.sprint && p.stamina > 15;
    let speed = (sprint ? CONFIG.player.sprint : CONFIG.player.speed) * (p.stagger ? 0.3 : 1) * (p.defending ? 0.7 : 1);
    if (this.ballState === 'held' && this.ownerId === 0) speed *= 0.36;
    if (this.mode === 'contest') speed = 0;
    p.vel.copy(m).scale(speed); p.pos.addScaled(p.vel, dt);
    if (sprint && m.lengthSq() > 0.1) p.stamina = Math.max(0, p.stamina - 22 * dt);
    if (cmd.jump) this.jump(p);
    if (cmd.moveAction) this.dribbleMove(p, cmd.moveAction);
    if (cmd.steal) this.trySteal(p);
    if (cmd.pass) {
      if (this.ownerId === 0) this.pass(p);
      else if (this.owner?.team === 0) this.pass(this.owner, p);
    }
    if (this.ownerId !== 0) { this.charge = 0; return; }
    if (cmd.gather && this.ballState === 'dribble') { this.ballState = 'held'; this.charge = 0; }
    if (this.ballState === 'held') this.charge = Math.min(CONFIG.shot.maxCharge, this.charge + dt);
    if (cmd.release) {
      if (cmd.release.kind === 'bounce') {
        this.ballState = 'dribble'; this.charge = 0; this.dribbleImpulse = 2; this.emit('bounce', { speed: 4 });
      } else if (cmd.release.kind === 'pass' && this.mode === '2v2') this.pass(p);
      else this.shoot(p, { aim: cmd.aim || new Vec3(0, 0, -1), physicalVelocity: cmd.release.velocity || null,
        from: cmd.release.position || null });
    }
  }

  updateOwnedBall(dt) {
    const p = this.owner;
    if (!p) return;
    const oldPhase = Math.floor(p.dribble / Math.PI);
    const cadence = 7.8 + Math.min(2.5, p.vel.length() * 0.35) + this.dribbleImpulse;
    p.dribble += dt * cadence;
    const gathered = this.ballState === 'held' || p.action === 'shooting';
    const forward = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const right = new Vec3(-Math.cos(p.yaw), 0, Math.sin(p.yaw));
    const side = gathered ? 0.12 : p.side * 0.46;
    this.ball.pos.copy(p.pos).addScaled(forward, gathered ? 0.53 : 0.28).addScaled(right, side);
    this.ball.pos.y = p.jump + (gathered ? 1.35 + Math.min(0.65, (p.id === 0 ? this.charge : p.charge) * 0.9) : 0.13 + Math.abs(Math.sin(p.dribble)) * 0.9);
    if (p.id === 0 && this.hand && gathered) this.ball.pos.copy(this.hand);
    else if (p.id === 0 && this.hand && !gathered) {
      // Stay below the actual hand; never draw a bouncing ball through the face.
      this.ball.pos.x = this.hand.x; this.ball.pos.z = this.hand.z;
      if (this.manualDribble) this.ball.pos.y = 0.13 + Math.abs(Math.sin(p.dribble)) * clamp(this.hand.y - 0.12, 0.35, 1.15);
    }
    if (!gathered && Math.floor(p.dribble / Math.PI) !== oldPhase) this.emit('bounce', { speed: 3, owner: p.id });
    this.ball.vel.set(0, 0, 0);
  }

  shoot(p, { aim = null, physicalVelocity = null, from = null, aiCharge = null } = {}) {
    if (this.ownerId !== p.id || this.shot) return false;
    if (this.needsClear) { if (p.id === 0) this.toast('CLEAR IT FIRST.', 'Take the ball beyond the three-point line.'); this.ballState = 'dribble'; this.charge = 0; return false; }
    const hoop = CONFIG.hoop;
    aim ||= new Vec3(hoop.x - p.pos.x, 0, hoop.z - p.pos.z).normalize();
    const origin = from ? new Vec3().copy(from) : this.ball.pos.clone();
    if (!from) origin.y = Math.max(origin.y, 1.95 + p.jump);
    // A legitimate close jump becomes an accessible one-handed dunk.
    const dunk = distance(p.pos, hoop) < 1.65 && p.jump > 0.23;
    if (dunk) origin.y = Math.max(3.35, origin.y);
    let contest = 0;
    for (const d of this.players) if (d.team !== p.team) {
      const gap = distance(d.pos, p.pos);
      contest = Math.max(contest, clamp(1 - gap / 2.1, 0, 1) * (d.stagger ? 0.1 : d.defending || d.jump > 0 ? 1 : 0.72));
    }
    const shot = makeShot({ from: origin, feet: p.pos, aim, charge: aiCharge ?? this.charge,
      physicalVelocity, contest, difficulty: p.id === 0 ? this.difficulty : 'park', heat: p.team === 0 && this.heatTime > 0, rng: this.rng, dunk });
    this.shot = { ...shot, shooter: p.id, team: p.team, released: this.time, origin: origin.clone(), resolved: false,
      assist: this.lastPass && this.lastPass.to === p.id && this.time - this.lastPass.time < 4 ? this.lastPass.from : null,
      rack: this.rack, rackBall: this.rackBall, money: this.rack === CONFIG.contest.moneyRack || this.rackBall === 4 };
    this.lastShot = this.shot;
    this.ball.launch(origin, shot.vel); this.ownerId = null; this.ballState = 'flight'; this.flightAge = 0;
    this.lastTouch = p.id; this.charge = 0; this.passInfo = null;
    p.action = dunk ? 'dunk' : 'follow'; p.actionTime = 0.8; p.charge = 0;
    if (p.id === 0) { this.stats.attempts++; this.emit('shot', { shot: this.shot }); }
    return true;
  }

  updateFlight(dt) {
    this.flightAge += dt;
    for (const e of this.ball.step(dt)) {
      if (e.type === 'basket') this.basket();
      else { if (e.type === 'rim' && this.shot) this.shot.hitRim = true; this.emit(e.type, e); }
    }
    if (this.checkTimer > 0 || this.settleTimer > 0 || this.phase !== 'playing') return;
    const shot = this.shot;
    if (this.isMatch && shot && !shot.resolved) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (!this.shotClock && this.ball.floorHits && !shot.hitRim) { this.turnover('SHOT CLOCK.', 'The shot must touch the rim.'); return; }
    }
    if (shot && !shot.resolved && !this.ball.scored) {
      for (const p of this.players) {
        const handBlock = p.id === 0 && this.hands.some(h => h.distanceTo(this.ball.pos) < 0.36);
        if (p.team === shot.team || p.stagger || p.jump < 0.1 && !handBlock) continue;
        const gap = distance(p.pos, this.ball.pos);
        if ((gap < 0.8 && this.ball.pos.y < 2.4 + p.jump && this.ball.pos.y > 1.5 && this.flightAge > 0.045) || handBlock) {
          this.ball.vel.set((this.rng() - 0.5) * 4, -2.8, 3.5);
          this.ballState = 'loose'; shot.resolved = true; this.shot = null;
          this.lastTouch = p.id; this.toast('DENIED!', p.team === 0 ? 'Get that out of here.' : 'Find a little more space.', p.team === 0 ? 'good' : 'bad');
          if (p.id === 0) this.stats.blocks++;
          this.emit('block', { player: p.id }); break;
        }
      }
    }
    if (this.mode === 'contest') {
      if (this.shot && !this.shot.resolved && (this.ball.floorHits > 0 || this.flightAge > 3.6)) this.resolveContest(false);
      return;
    }
    if (this.mode === 'practice') {
      if (this.flightAge > 2.6 || (this.ball.floorHits > 0 && this.flightAge > 1.1)) {
        if (this.shot && !this.shot.resolved) this.toast('NEXT ONE.', 'Find the green window.');
        this.giveBall(this.human); this.shot = null;
      }
      return;
    }
    // The shot clock continues to run after a missed release until it actually
    // touches the rim. A clean airball is never a free clock reset.
    if (this.shot && this.flightAge > 3.6) this.shot.resolved = true;
    if (this.flightAge > 0.16 && !this.ball.scored) {
      const candidates = [...this.players].sort((a, b) => distance(a.pos, this.ball.pos) - distance(b.pos, this.ball.pos));
      for (const p of candidates) {
        const reach = p.id === 0 && this.hands.some(h => h.distanceTo(this.ball.pos) < 0.5);
        const gap = distance(p.pos, this.ball.pos);
        const inReach = reach || (gap < 0.75 && this.ball.pos.y < 1.75 + p.jump);
        // A shooter cannot catch their own rising shot; a descending rebound is live.
        if (!inReach || (this.shot && this.ball.vel.y > 0 && this.flightAge < 0.65)) continue;
        if (this.passInfo && p.id === this.passInfo.from && this.flightAge < 0.4) continue;
        const rebound = this.ballState !== 'pass';
        if (rebound && p.team === this.possession && this.shot && !this.shot.hitRim && this.shotClock <= 0) { this.turnover('SHOT CLOCK.'); return; }
        const oldTeam = this.possession;
        const pass = this.passInfo;
        this.giveBall(p, oldTeam !== p.team);
        if (pass && p.team === pass.team) this.lastPass = { from: pass.from, to: p.id, time: this.time };
        if (rebound && p.id === 0) { this.stats.rebounds++; this.emit('catch'); }
        if (oldTeam !== p.team) this.toast('CLEAR IT.', p.team === 0 ? 'Take it beyond the arc, then attack.' : 'Get a stop. Stay between them and the rim.');
        return;
      }
    }
    if (this.flightAge > 7) this.turnover('LOOSE BALL.', 'Fresh check.');
  }

  basket() {
    const s = this.shot;
    if (!s || s.resolved || this.ballState !== 'flight') return;
    s.resolved = true;
    if (this.mode === 'contest') { this.resolveContest(true); return; }
    this.score[s.team] += s.value;
    if (s.shooter === 0) {
      this.stats.points += s.value; this.stats.made++; if (s.value === 3) this.stats.threes++;
      this.heat += s.green ? 2 : 1;
      if (this.heat >= 5) { this.heatTime = 14; this.heat = 0; this.toast('ON FIRE.', 'Wider release window. Keep cooking.', 'fire'); }
      else this.toast(s.dunk ? 'THROW IT DOWN!' : s.green ? 'PURE GREEN.' : s.value === 3 ? 'FROM DEEP.' : 'BUCKET.', `+${s.value} ${s.green ? '· Perfect release' : '· Run it back'}`, 'good');
    } else {
      if (s.assist === 0) this.stats.assists++;
      this.toast(s.team === 0 ? 'DIME.' : 'THEY GOT ONE.', `+${s.value} · ${s.team === 0 ? 'Good basketball.' : 'Your ball. Answer back.'}`, s.team === 0 ? 'good' : 'bad');
    }
    this.emit('score', { team: s.team, value: s.value, green: s.green, dunk: s.dunk });
    if (this.isMatch) {
      const lead = Math.abs(this.score[0] - this.score[1]);
      if ((Math.max(...this.score) >= CONFIG.match.target && lead >= 2) || Math.max(...this.score) >= CONFIG.match.cap) { this.finish(); return; }
      this.scheduleCheck(1 - s.team, 1.45);
    }
  }

  giveBall(p, changed = false) {
    const hitRim = this.shot?.hitRim;
    this.ownerId = p.id; this.possession = p.team; this.ballState = 'dribble';
    this.shot = null; this.passInfo = null; this.charge = 0; this.flightAge = 0;
    this.lastTouch = p.id; this.ball.scored = false; p.ownedFor = 0; p.shield = 0.45;
    if (changed) { this.needsClear = this.isMatch; this.shotClock = CONFIG.match.shotClock; this.lastPass = null; this.possessionPasses = 0; }
    else if (hitRim) this.shotClock = CONFIG.match.offensiveReboundClock;
    this.updateOwnedBall(0);
  }
  scheduleCheck(team, duration = 1.2) { this.checkTeam = team; this.checkTimer = duration; this.ownerId = null; this.charge = 0; }
  resetPossession(team) {
    this.needsClear = false; this.shotClock = CONFIG.match.shotClock; this.lastPass = null; this.possessionPasses = 0;
    if (this.isMatch) {
      for (const p of this.players) {
        const offence = p.team === team;
        p.pos.set(p.id % 2 ? (offence ? 4 : 3.5) : 0, 0, offence ? (p.id % 2 ? -0.4 : 1.6) : (p.id % 2 ? -2 : -0.8));
        p.vel.set(0, 0, 0); p.jump = 0; p.jumpVel = 0; p.stagger = 0; p.yaw = p.id === 0 ? Math.PI : offence ? Math.PI : 0;
      }
    }
    const first = teamPlayers(this.players, team)[0];
    this.giveBall(first); this.possession = team;
    this.emit('recenter');
    if (this.isMatch) this.toast(team === 0 ? 'YOUR BALL.' : 'LOCK IN.', team === 0 ? 'Attack the basket.' : 'Stay in front. Hands up.');
  }
  turnover(title = 'OUT OF BOUNDS.', detail = 'Other team checks it up.') {
    this.toast(title, detail, 'bad'); this.emit('whistle'); this.scheduleCheck(1 - this.possession);
  }
  boundaries() {
    for (const p of this.players) {
      p.pos.x = clamp(p.pos.x, -7.15, 7.15); p.pos.z = clamp(p.pos.z, -7.7, 7.15);
    }
    if (this.owner || !this.isMatch || this.checkTimer > 0) return;
    const b = this.ball.pos;
    if (Math.abs(b.x) > 7.65 || b.z > 7.7 || b.z < -8.15) {
      const touch = this.players.find(p => p.id === this.lastTouch);
      this.possession = touch?.team ?? this.possession;
      this.turnover();
    }
  }
  jump(p) {
    if (p.jump > 0 || p.jumpVel > 0 || p.stamina < 8) return;
    p.jumpVel = CONFIG.player.jumpSpeed; p.stamina -= 12; p.action = 'jump'; p.actionTime = 0.7;
    this.emit('jump', { player: p.id });
  }
  dribbleMove(p, kind) {
    if (this.ownerId !== p.id || this.ballState !== 'dribble' || p.moveCooldown > 0 || p.stamina < 16) return false;
    if (!['cross', 'behind', 'spin', 'stepback'].includes(kind)) return false;
    p.moveCooldown = 0.46; p.stamina -= kind === 'spin' ? 24 : 18; p.shield = kind === 'behind' ? 0.7 : 0.44;
    p.action = kind; p.actionTime = 0.5;
    const f = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const r = new Vec3(-Math.cos(p.yaw), 0, Math.sin(p.yaw));
    if (kind === 'cross' || kind === 'behind') { p.side *= -1; p.pos.addScaled(r, p.side * (kind === 'cross' ? 0.65 : 0.4)); }
    if (kind === 'stepback') p.pos.addScaled(f, -0.95);
    if (kind === 'spin') p.pos.addScaled(f, 0.8);
    let broke = false;
    for (const d of this.players) if (d.team !== p.team && distance(d.pos, p.pos) < 1.9 && !d.stagger) {
      const beats = kind === 'stepback' ? distance(d.pos, p.pos) > 1.1 : (d.stealCooldown > 0.3 || distance(d.pos, p.pos) < 1.25);
      if (beats) { d.stagger = 0.85; broke = true; }
    }
    if (p.id === 0) {
      const label = { cross: 'CROSSOVER', behind: 'BEHIND THE BACK', spin: 'SPIN CYCLE', stepback: 'STEPBACK' }[kind];
      if (this.comboUntil < this.time) this.combo = [];
      this.combo.push(label); this.combo = this.combo.slice(-4); this.comboUntil = this.time + 2.3;
      this.stats.moves++; this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo.length);
      this.toast(broke ? 'ANKLE BREAKER.' : label, this.combo.length > 1 ? `${this.combo.length} MOVE COMBO` : 'Create your space.', broke ? 'good' : 'normal');
    }
    this.emit('move', { kind, player: p.id, broke }); return true;
  }
  trySteal(p) {
    if (p.stealCooldown || p.stamina < 8 || this.owner?.team === p.team || !this.owner) return false;
    p.stealCooldown = 0.9; p.stamina -= 10; p.action = 'reach'; p.actionTime = 0.35;
    const o = this.owner, gap = distance(p.pos, this.ball.pos);
    const facing = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const direction = this.ball.pos.clone().sub(p.pos); direction.y = 0; direction.normalize();
    const handReach = p.id === 0 && this.hands.some(h => h.distanceTo(this.ball.pos) < 0.5);
    if ((gap < 1.28 && facing.dot(direction) > 0.2 || handReach) && !o.shield && this.ballState === 'dribble' && this.ball.pos.y < 1.3) {
      this.giveBall(p, true); if (p.id === 0) this.stats.steals++;
      this.toast(p.team === 0 ? 'POCKET PICKED.' : 'STRIPPED.', p.team === 0 ? 'Clear it beyond the arc.' : 'Protect the ball. Use your moves.', p.team === 0 ? 'good' : 'bad');
      this.emit('steal', { player: p.id }); return true;
    }
    p.stagger = 0.24; return false;
  }
  pass(p, target = null) {
    if (this.ownerId !== p.id || p.aiWait > 0.1) return false;
    target ||= this.players.find(t => t.team === p.team && t.id !== p.id);
    if (!target) { if (p.id === 0) this.toast('YOU GOT THIS.', 'No teammate in 1v1. Create your shot.'); return false; }
    const origin = this.ball.pos.clone(); origin.y = Math.max(origin.y, 1.25);
    const destination = target.pos.clone().addScaled(target.vel, 0.2); destination.y = 1.25;
    const t = clamp(distance(origin, destination) / 9.5, 0.18, 0.8);
    const vel = destination.sub(origin).scale(1 / t); vel.y += CONFIG.ball.gravity * t / 2;
    this.ball.launch(origin, vel); this.ballState = 'pass'; this.ownerId = null; this.shot = null;
    this.passInfo = { from: p.id, to: target.id, team: p.team }; this.flightAge = 0; this.lastTouch = p.id;
    this.possessionPasses++;
    this.charge = 0; p.aiWait = 0.65; p.action = 'pass'; p.actionTime = 0.4; this.emit('pass', { player: p.id });
    return true;
  }

  updateAI(dt) {
    if (!this.isMatch) return;
    const diff = DIFFICULTIES[this.difficulty], hoop = CONFIG.hoop;
    for (const p of this.players) {
      if (p.id === 0 && !this.preview) continue;
      p.defending = p.team !== this.possession;
      let target = p.pos.clone(); const owner = this.owner;
      if (this.ownerId === p.id) {
        const defenders = this.players.filter(d => d.team !== p.team);
        const nearest = defenders.reduce((a, b) => distance(a.pos, p.pos) < distance(b.pos, p.pos) ? a : b);
        const gap = distance(nearest.pos, p.pos), dist = distance(p.pos, hoop);
        p.yaw = Math.atan2(hoop.x - p.pos.x, hoop.z - p.pos.z);
        if (this.needsClear) target.set(p.pos.x * 0.6, 0, 1.2);
        else {
          target.set(Math.sin(this.time * 0.8 + p.id * 2) * 2.5, 0, -3.9);
          if (gap < 1.3) target.x += (p.pos.x >= nearest.pos.x ? 1 : -1) * 1.5;
          if (p.action !== 'shooting' && p.ownedFor > 1.4 && gap < 1.5 && !p.aiMove) { this.dribbleMove(p, this.rng() < 0.5 ? 'cross' : 'stepback'); p.aiMove = 2.1; }
          const teammate = this.players.find(t => t.team === p.team && t.id !== p.id);
          if (p.action !== 'shooting' && teammate && this.possessionPasses < 2 && p.ownedFor > 1.5 && !p.aiWait && (gap < 1.35 || teammate.id === 0 && !this.preview && p.ownedFor > 2.5)) {
            const laneOpen = defenders.every(d => segmentGap(d.pos, p.pos, teammate.pos) > 0.7);
            if (laneOpen && this.rng() < dt * 1.7) { this.pass(p, teammate); continue; }
          }
          if (p.action !== 'shooting' && p.ownedFor > 1.25 && (dist < 3.2 || p.ownedFor > 4 || this.shotClock < 4 || gap > 2.2 && dist < 7.2)) {
            if (this.rng() < dt * 2.2) { p.action = 'shooting'; p.actionTime = 1.4; p.charge = 0; }
          }
          if (p.action === 'shooting') {
            target.copy(p.pos); p.charge += dt;
            if (p.charge >= 0.72) {
              const timing = 0.72 + (this.rng() - 0.5) * (1 - diff.aiAccuracy) * 2.8;
              this.shoot(p, { aiCharge: timing });
            }
          }
        }
      } else if (!owner) {
        target.copy(this.ball.pos); target.y = 0;
        if (this.ball.pos.y > 2.7) { target.x = clamp(target.x, -5, 5); target.z = clamp(target.z, -5.9, 4); }
        if (this.shot && this.shot.team !== p.team && distance(p.pos, this.ball.pos) < 1.4 && this.ball.vel.y > 0 && this.rng() < dt * 5) this.jump(p);
        if (this.ballState === 'pass' && this.passInfo?.to === p.id) target.copy(p.pos); // Receive at the lead point, don't chase the passer.
      } else if (owner.team === p.team) {
        // The teammate alternates a cut with spacing on the opposite wing.
        const cut = Math.sin(this.time * 0.5 + p.id) > 0.55;
        target.set(owner.pos.x > 0 ? -4.6 : 4.6, 0, cut ? -4.6 : -0.4);
        p.yaw = Math.atan2(owner.pos.x - p.pos.x, owner.pos.z - p.pos.z);
      } else {
        const mark = this.players.find(t => t.team !== p.team && (t.id % 2 === p.id % 2)) || owner;
        const victim = mark.id === owner.id ? owner : mark;
        const dir = new Vec3(hoop.x - victim.pos.x, 0, hoop.z - victim.pos.z).normalize();
        target.copy(victim.pos).addScaled(dir, owner.id === victim.id ? 1.05 : 1.7);
        target.x += Math.sin(this.time * 1.8 + p.id) * 0.16;
        p.yaw = Math.atan2(victim.pos.x - p.pos.x, victim.pos.z - p.pos.z);
        if (owner.id === victim.id && distance(p.pos, owner.pos) < 1.45 && this.rng() < dt * diff.stealRate) this.trySteal(p);
      }
      const v = target.sub(p.pos); v.y = 0;
      const gap = v.length(); const speed = Math.min(gap * 3.2, diff.aiSpeed) * (p.stagger ? 0.18 : 1);
      if (gap > 0.03) v.scale(speed / gap); else v.set(0, 0, 0);
      p.vel.lerp(v, Math.min(1, dt * 12)); p.pos.addScaled(p.vel, dt);
    }
  }
  separatePlayers() {
    for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) {
      const a = this.players[i], b = this.players[j];
      let dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d >= 0.7) continue;
      if (d < 0.001) { dx = 1; dz = 0; d = 0.001; }
      const push = (0.7 - d) / 2; dx /= Math.max(d, 1); dz /= Math.max(d, 1);
      // A minimum normal length handles coincident spawn points deterministically.
      const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
      a.pos.x += dx * push; a.pos.z += dz * push; b.pos.x -= dx * push; b.pos.z -= dz * push;
    }
  }

  placeAtRack() {
    const r = RACKS[this.rack]; this.human.pos.set(r.x, 0, r.z); this.human.vel.set(0, 0, 0);
    this.human.yaw = Math.atan2(-r.x, CONFIG.hoop.z - r.z); this.emit('recenter', { rack: this.rack });
  }
  resolveContest(made) {
    const s = this.shot;
    if (!s || this.settleTimer > 0) return;
    s.resolved = true;
    const value = made ? s.money ? 2 : 1 : 0;
    this.contestResults[this.rack * 5 + this.rackBall] = { made, value, money: s.money };
    this.contestShots++;
    if (made) {
      this.score[0] += value; this.stats.points += value; this.stats.made++; this.stats.threes++;
      this.toast(s.money ? 'MONEY BALL!' : s.green ? 'PURE GREEN.' : 'SPLASH.', `+${value} · ${this.score[0]} points`, 'good');
      this.emit('score', { team: 0, value, green: s.green });
    } else this.toast('NEXT BALL.', 'Stay in rhythm.');
    this.settleTimer = 0.4;
  }
  afterContestShot() {
    if (this.contestShots >= 25 || this.contestBuzzer) { this.finish(); return; }
    this.rackBall++;
    if (this.rackBall >= 5) {
      this.rackBall = 0; this.rack++; this.placeAtRack();
      this.toast(this.rack === CONFIG.contest.moneyRack ? 'MONEY RACK.' : RACKS[this.rack].name,
        this.rack === CONFIG.contest.moneyRack ? 'Every ball counts double.' : 'Five more. Same rhythm.', this.rack === CONFIG.contest.moneyRack ? 'fire' : 'normal');
    }
    this.giveBall(this.human); this.shot = null;
  }
  finish() {
    if (this.phase === 'result') return;
    this.phase = 'result'; this.emit('finish', { won: this.score[0] > this.score[1], mode: this.mode }); this.emit('buzzer');
  }
}

function segmentGap(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
