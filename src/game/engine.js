import { Vec3, clamp, smoothstep } from '../physics/math.js';
import { CONFIG, DIFFICULTIES, MODES, RACKS } from '../config.js';
import { Basketball, makeShot, isThree, passVelocity, passTime, greenWindow } from '../physics/basketball.js';
import { movePlayer, beginMove, advanceMove, dribbleOffset, dribbleInHand, heldOffset, isTransfer, MOVE_SPECS } from './movement.js';
import { updateAI } from './ai.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const teamPlayers = (players, team) => players.filter(p => p.team === team);
const TIMERS = ['stagger', 'shield', 'stealCooldown', 'moveCooldown', 'aiWait', 'aiMove', 'actionTime', 'burst', 'pump', 'react', 'bump'];
const PUMP = 0.44, ARM = 0.84;
function athlete(id, team, name, x, z) {
  return { id, team, name, pos: new Vec3(x, 0, z), vel: new Vec3(), yaw: Math.PI, height: CONFIG.player.heights[id],
    side: 1, stamina: 100, jump: 0, jumpVel: 0, stagger: 0, shield: 0,
    stealCooldown: 0, moveCooldown: 0, action: '', actionTime: 0, ownedFor: 0,
    aiWait: 0, aiMove: 0, charge: 0, dribble: 0, defending: false,
    locoVel: new Vec3(), acceleration: new Vec3(), moveState: null, driveSide: id % 2 ? -1 : 1,
    protect: 0, burst: 0, pump: 0, pumpCount: 0, pumpSeen: 0, react: 0, bump: 0, dribbles: 0, caughtAt: -10,
    passKind: 'chest', passYaw: 0, percept: new Vec3(x, 0, z), reach: new Vec3(), contesting: false };
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
    this.shot = null; this.lastShot = null; this.lastResult = null; this.passInfo = null; this.lastPass = null; this.catchFrom = null;
    this.charge = 0; this.heat = 0; this.heatTime = 0; this.combo = []; this.comboUntil = 0;
    this.checkTimer = 1.1; this.checkTeam = 0; this.settleTimer = 0;
    this.contestTime = CONFIG.contest.seconds; this.rack = 0; this.rackBall = 0;
    this.contestResults = Array(25).fill(null); this.contestShots = 0; this.contestBuzzer = false;
    this.stats = { points: 0, made: 0, attempts: 0, threes: 0, steals: 0, blocks: 0, assists: 0, rebounds: 0, moves: 0, bestCombo: 0, swishes: 0, ankles: 0 };
    this.lastTouch = 0; this.flightAge = 0; this.looseAge = 0; this.hand = null; this.hands = [];
    this.manualDribble = false; this.dribbleImpulse = 0; this.liveRebound = false; this.lastScore = null; this.looseFrom = null; this.gatherCount = 0;
    if (mode === 'contest') this.placeAtRack();
    this.updateOwnedBall(0);
    this.toast(mode === 'contest' ? 'MAKE IT RAIN.' : mode === 'practice' ? 'FIND YOUR RHYTHM.' : 'CHECK BALL.',
      mode === 'contest' ? '25 balls · 70 seconds · gold balls count double' : mode === 'practice' ? 'Hold to gather. Release at the top.' : 'First to 11 · win by 2 · 2s and 3s');
    this.emit('recenter');
  }
  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused'; this.charge = 0; if (this.ownerId === 0) this.ballState = 'dribble';
    for (const p of this.players) { p.vel.set(0, 0, 0); p.locoVel.set(0, 0, 0); p.moveState = null; p.pump = 0; }
  }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }

  step(dt, cmd = {}) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    this.hand = cmd.hand || null; this.hands = cmd.hands || []; this.manualDribble = cmd.manualDribble || false;
    this.dribbleImpulse = Math.max(this.dribbleImpulse * Math.exp(-dt * 4), cmd.bounceSpeed || 0);
    for (const p of this.players) {
      p.stamina = Math.min(100, p.stamina + CONFIG.player.staminaRegen * dt);
      for (const k of TIMERS) p[k] = Math.max(0, p[k] - dt);
      if (!p.actionTime) p.action = '';
      if (p.jump > 0 || p.jumpVel > 0) {
        p.jumpVel -= CONFIG.ball.gravity * dt; p.jump = Math.max(0, p.jump + p.jumpVel * dt);
        if (!p.jump) { this.emit('land', { player: p.id, speed: -p.jumpVel }); p.jumpVel = 0; }
      }
      if (this.ownerId === p.id) p.ownedFor += dt; else { p.ownedFor = 0; p.charge = 0; p.protect = Math.max(0, p.protect - dt * 6); }
    }
    this.heatTime = Math.max(0, this.heatTime - dt);
    if (this.comboUntil < this.time) this.combo = [];
    if (this.checkTimer > 0) {
      this.checkTimer -= dt;
      if (!this.owner) this.ball.step(dt);
      if (this.checkTimer <= 0) { this.checkTimer = 0; this.resetPossession(this.checkTeam); }
      return;
    }
    if (this.mode === 'contest') {
      this.contestTime = Math.max(0, this.contestTime - dt);
      if (!this.contestTime && !this.contestBuzzer) {
        this.contestBuzzer = true; this.emit('buzzer');
        if (this.ballState !== 'flight' || this.shot?.resolved) { this.finish(); return; }
        this.toast('AT THE BUZZER!', 'This one still counts.');
      }
    }
    if (this.settleTimer > 0) {
      this.settleTimer -= dt;
      this.ball.step(dt);
      if (this.settleTimer <= 0) { this.settleTimer = 0; this.afterContestShot(); }
      return;
    }
    if (!this.preview) this.humanInput(dt, cmd);
    this.updateAI(dt);
    for (const p of this.players) advanceMove(p, dt);
    this.separatePlayers(dt);
    if (this.needsClear && this.owner && isThree(this.owner.pos)) {
      this.needsClear = false; this.toast('CLEARED.', 'Go get a bucket.');
    }
    if (this.isMatch && this.ballState !== 'flight') {
      const before = Math.ceil(this.shotClock);
      this.shotClock = Math.max(0, this.shotClock - dt);
      const left = Math.ceil(this.shotClock);
      if (left < before && left <= 5 && left > 0) this.emit('tick', { left });
      if (this.shotClock <= 0) { this.turnover('SHOT CLOCK.', 'Get your shot off before 18.'); return; }
    }
    if (this.owner) this.updateOwnedBall(dt);
    else this.updateFlight(dt);
    this.boundaries();
  }
  updateAI(dt) { updateAI(this, dt); }

  humanInput(dt, cmd) {
    const p = this.human, owns = this.ownerId === 0;
    if (cmd.aim) p.yaw = Math.atan2(cmd.aim.x, cmd.aim.z);
    p.eyeView = !!cmd.eyeView;
    p.defending = !!cmd.defend;
    const m = new Vec3(cmd.move?.x || 0, 0, cmd.move?.z || 0);
    if (m.length() > 1) m.normalize();
    if (cmd.blinkStep && this.mode !== 'contest') { p.pos.addScaled(m, 1.1); m.set(0, 0, 0); }
    const sprint = cmd.sprint && p.stamina > 15 && !p.defending;
    let speed = sprint ? CONFIG.player.sprint : CONFIG.player.speed;
    if (m.lengthSq() > 0.01) {
      // Sliding and back-pedalling are slower than running where you look.
      const along = (m.x * Math.sin(p.yaw) + m.z * Math.cos(p.yaw)) / m.length();
      speed *= along >= 0 ? 0.92 + 0.08 * along : 0.92 + 0.1 * along;
    }
    if (p.stagger) speed *= 0.3;
    if (owns) {
      speed *= CONFIG.player.ballTax * (1 - 0.3 * p.protect);
      if (this.ballState === 'held') speed *= 0.36;
      const move = p.moveState;
      if (move?.kind === 'hesi' && move.age < move.duration * 0.6) speed *= 0.35;
    } else if (p.defending) speed *= 0.8;
    if (p.burst > 0) speed *= 1.12;
    if (p.bump > 0) speed *= 0.6;
    if (this.mode === 'contest') speed = 0;
    m.scale(speed);
    if (owns && this.ballState === 'held') {
      // The gather step carries a finisher to the rim, not past it.
      const hoop = CONFIG.hoop, gap = distance(p.pos, hoop);
      if (gap < 1.5) {
        const lane = new Vec3(hoop.x - p.pos.x, 0, hoop.z - p.pos.z).normalize(), toward = m.dot(lane);
        if (toward > 0) m.addScaled(lane, -toward * (1 - clamp((gap - 0.35) / 0.9, 0, 1)));
      }
    }
    movePlayer(p, m, dt);
    if (sprint && p.locoVel.lengthSq() > 0.4) p.stamina = Math.max(0, p.stamina - 22 * dt);
    if (cmd.jump) this.jump(p);
    if (cmd.moveAction) this.dribbleMove(p, cmd.moveAction);
    if (cmd.steal) this.trySteal(p);
    if (cmd.pass) {
      const kind = typeof cmd.pass === 'string' ? cmd.pass : 'auto';
      if (owns) this.pass(p, null, kind);
      else if (this.owner?.team === 0) this.pass(this.owner, p, kind);
    }
    if (this.ownerId !== 0) { this.charge = 0; return; }
    if (cmd.cancelGather) {
      this.ballState = 'dribble'; this.charge = 0; p.gatherFrom = null;
      return;
    }
    if (cmd.gather && this.ballState === 'dribble' && p.pump < PUMP * 0.5) { this.beginGather(p); this.ballState = 'held'; this.charge = 0; }
    if (this.ballState === 'held') this.charge = Math.min(CONFIG.shot.maxCharge, this.charge + dt);
    const takeoff = CONFIG.shot.takeoff;
    if (cmd.autoJump && this.ballState === 'held' && this.charge >= takeoff && this.charge < takeoff + dt * 1.5) this.jump(p);
    if (cmd.release && this.ballState === 'held') {
      if (cmd.release.kind === 'bounce') {
        this.ballState = 'dribble'; this.charge = 0; this.dribbleImpulse = 2; this.emit('bounce', { speed: 4, owner: 0 });
      } else if (cmd.release.kind === 'pass' && this.mode === '2v2') this.pass(p, null, cmd.release.passKind || 'auto');
      else if (!cmd.release.velocity && this.charge < CONFIG.shot.pumpWindow && this.mode !== 'contest') this.pumpFake(p);
      else this.shoot(p, { aim: cmd.aim || new Vec3(0, 0, -1), physicalVelocity: cmd.release.velocity || null,
        from: cmd.release.position || null });
    }
  }

  // The release window for the shot the person is lining up right now.
  releaseWindow() {
    const p = this.human, gap = distance(p.pos, CONFIG.hoop);
    const rhythm = this.time - p.caughtAt < 1.6 && p.dribbles === 0;
    return greenWindow(this.difficulty, this.heatTime > 0, rhythm, gap < 2.9 && (p.jump > 0.08 || p.locoVel.length() > 1.2) ? 0 : gap);
  }
  beginGather(p) {
    p.gatherFrom = this.ball.pos.clone().sub(p.pos);
    p.gatherFrom.y -= p.jump;
    p.moveState = null; p.pump = 0;
    this.catchFrom = null; this.gatherCount = (this.gatherCount || 0) + 1;
  }
  // Show the ball, keep the dribble. A defender who leaves the floor cannot contest.
  pumpFake(p) {
    if (this.ownerId !== p.id) return false;
    this.ballState = 'dribble'; this.charge = 0; p.charge = 0; p.gatherFrom = null;
    p.pump = PUMP; p.pumpCount++; p.action = 'pump'; p.actionTime = PUMP; p.shield = Math.max(p.shield, PUMP);
    this.emit('pump', { player: p.id });
    return true;
  }

  // 0 (wide open) to 1 (smothered): distance, whether the defender is between
  // the shooter and the rim, and whether a hand is actually up.
  contestOn(p) {
    const hoop = CONFIG.hoop;
    let contest = 0;
    const lane = new Vec3(hoop.x - p.pos.x, 0, hoop.z - p.pos.z).normalize();
    for (const d of this.players) if (d.team !== p.team) {
      const gap = distance(d.pos, p.pos);
      const toDefender = new Vec3(d.pos.x - p.pos.x, 0, d.pos.z - p.pos.z).normalize();
      const inFront = clamp(0.65 + 0.35 * lane.dot(toDefender), 0.3, 1);
      const facingShooter = -Math.sin(d.yaw) * toDefender.x - Math.cos(d.yaw) * toDefender.z;
      // A defender already coming down from an early jump has no hand in the shot.
      const hands = d.stagger ? 0.1 : d.jump > 0.05 ? (d.jumpVel < -2.2 ? 0.5 : 1) : d.defending ? 0.85 : 0.6;
      contest = Math.max(contest, clamp(1 - gap / 2.1, 0, 1) * inFront * hands * (facingShooter < -0.2 ? 0.65 : 1));
    }
    return contest;
  }

  updateOwnedBall(dt) {
    const p = this.owner;
    if (!p) return;
    const human = p.id === 0 && !this.preview, hoop = CONFIG.hoop;
    const gathered = this.ballState === 'held' || p.action === 'shooting';
    // A close defender makes any handler drop the dribble onto the far hip.
    let pressure = 0;
    for (const d of this.players) if (d.team !== p.team) pressure = Math.max(pressure, clamp(1 - (distance(d.pos, p.pos) - 0.9) / 1.1, 0, 1));
    const protect = gathered ? 0 : Math.max(p.defending ? 1 : 0, pressure * 0.55);
    p.protect += (protect - p.protect) * (1 - Math.exp(-dt * 9));
    const oldPhase = Math.floor(p.dribble / Math.PI), move = p.moveState;
    const cadence = Math.PI * (1.95 + 0.85 * p.protect + 0.2 * Math.min(4.5, p.vel.length())) + this.dribbleImpulse;
    if (move?.kind !== 'hesi') p.dribble += dt * cadence;
    const forward = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const right = new Vec3(-Math.cos(p.yaw), 0, Math.sin(p.yaw));
    const charge = human ? this.charge : p.charge;
    let local;
    if (gathered) local = heldOffset(p, charge);
    else {
      local = dribbleOffset(p);
      if (p.pump > 0) local.lerp(heldOffset(p, 0.44), Math.pow(Math.sin(Math.PI * (1 - p.pump / PUMP)), 0.8));
    }
    this.ball.pos.copy(p.pos).addScaled(forward, local.z).addScaled(right, local.x);
    this.ball.pos.y = p.jump + local.y;
    if (gathered && p.jump > 0 && !(human && this.hand)) {
      // Close to the basket the ball leaves the shot line: a one-hand reach
      // for a layup, or all the way over the ring for a dunk.
      const gap = distance(p.pos, hoop), scale = p.height / 1.92;
      const facing = ((hoop.x - p.pos.x) * forward.x + (hoop.z - p.pos.z) * forward.z) / Math.max(gap, 0.01);
      const rise = smoothstep(0.12, 0.45, p.jump) * smoothstep(0.3, 0.8, facing);
      const dunk = (1 - smoothstep(0.5, 0.95, gap)) * rise, lay = (1 - smoothstep(2.3, 2.9, gap)) * rise;
      if (lay > 0) {
        const reach = p.pos.clone().addScaled(forward, 0.42).addScaled(right, p.side * 0.12); reach.y = p.jump + 2.34 * scale;
        this.ball.pos.lerp(reach, lay);
      }
      if (dunk > 0) this.ball.pos.lerp(new Vec3(hoop.x - forward.x * 0.035, p.jump + 2.44 * scale, hoop.z - forward.z * 0.035), dunk);
    }
    if (gathered && p.gatherFrom) {
      const t = clamp(charge / 0.2, 0, 1);
      const from = p.pos.clone().add(p.gatherFrom); from.y += p.jump;
      this.ball.pos.lerpVectors(from, this.ball.pos, t * t * (3 - 2 * t));
    }
    if (human && this.hand && gathered) this.ball.pos.copy(this.hand);
    else if (human && this.hand && !gathered) {
      // Stay below the actual hand; never draw a bouncing ball through the face.
      this.ball.pos.x = this.hand.x; this.ball.pos.z = this.hand.z;
      if (this.manualDribble && !p.moveState) this.ball.pos.y = 0.13 + Math.abs(Math.sin(p.dribble)) * clamp(this.hand.y - 0.12, 0.35, 1.15);
    }
    if (this.catchFrom && human && this.hand) this.catchFrom = null;
    if (this.catchFrom) {
      const t = clamp(p.ownedFor / 0.22, 0, 1);
      const from = p.pos.clone().add(this.catchFrom); from.y = Math.max(CONFIG.ball.radius, from.y + p.jump);
      this.ball.pos.lerpVectors(from, this.ball.pos, t * t * (3 - 2 * t));
      if (t >= 1) this.catchFrom = null;
    }
    const transfer = move && isTransfer(move.kind);
    const bounced = transfer ? move.age >= move.duration / 2 && move.age - dt < move.duration / 2
      : move?.kind !== 'spin' && move?.kind !== 'hesi' && Math.floor(p.dribble / Math.PI) !== oldPhase;
    if (dt && !gathered && !p.pump && !this.catchFrom && bounced) {
      p.dribbles++;
      this.emit('bounce', { speed: transfer ? 4.4 : 2.6 + 1.5 * p.protect + 0.25 * p.vel.length(), owner: p.id });
    }
    this.ball.vel.set(0, 0, 0); this.ball.spin.set(0, 0, 0);
  }

  shoot(p, { aim = null, physicalVelocity = null, from = null, aiCharge = null } = {}) {
    if (this.ownerId !== p.id || this.shot) return false;
    if (this.needsClear) { if (p.id === 0) this.toast('CLEAR IT FIRST.', 'Take the ball beyond the three-point line.'); this.ballState = 'dribble'; this.charge = 0; return false; }
    const hoop = CONFIG.hoop, human = p.id === 0 && !this.preview;
    aim ||= new Vec3(hoop.x - p.pos.x, 0, hoop.z - p.pos.z).normalize();
    const origin = from ? new Vec3().copy(from) : this.ball.pos.clone();
    if (!from && this.ballState !== 'held' && p.action !== 'shooting') origin.y = Math.max(origin.y, 1.95 + p.jump);
    const gap = distance(p.pos, hoop), speed = p.locoVel.length();
    const lane = new Vec3(hoop.x - p.pos.x, 0, hoop.z - p.pos.z).normalize(), toward = p.locoVel.dot(lane);
    const dunk = gap < 1.1 && distance(origin, hoop) < 0.18 && origin.y > hoop.y + 0.08;
    const layup = !dunk && gap < 2.9 && (p.jump > 0.08 || speed > 1.2);
    const floater = !dunk && !layup && gap < 4.7 && toward > 2.1;
    const fade = !dunk && !layup && !floater && toward < -1;
    // Catch and shoot: straight off a pass, before the ball touches the floor.
    const rhythm = this.time - p.caughtAt < 1.6 && p.dribbles === 0 && !dunk && !layup;
    const contest = this.contestOn(p) * (fade ? 0.8 : 1);
    const shot = makeShot({ from: origin, feet: p.pos, aim, charge: aiCharge ?? this.charge,
      physicalVelocity, contest, difficulty: p.id === 0 ? this.difficulty : 'park', heat: p.team === 0 && this.heatTime > 0, rng: this.rng,
      dunk, layup, floater, fade, moving: speed, fatigue: clamp((30 - p.stamina) / 30, 0, 1), rhythm,
      // An AI shooter's touch: steadier hands at higher levels.
      wobble: human ? 0 : 0.05 + (1 - DIFFICULTIES[this.difficulty].aiAccuracy) * 0.45 });
    this.shot = { ...shot, shooter: p.id, team: p.team, released: this.time, origin: origin.clone(), resolved: false, reported: false,
      first: null, firstAlong: 0, firstSide: 0, peaked: false,
      assist: this.lastPass && this.lastPass.to === p.id && this.time - this.lastPass.time < 4 ? this.lastPass.from : null,
      rack: this.rack, rackBall: this.rackBall, money: this.rack === CONFIG.contest.moneyRack || this.rackBall === 4 };
    this.lastShot = this.shot;
    this.ball.launch(origin, shot.vel, shot.spin); this.ownerId = null; this.ballState = 'flight'; this.flightAge = 0; this.liveRebound = true;
    this.lastTouch = p.id; this.charge = 0; this.passInfo = null; this.catchFrom = null;
    p.action = dunk ? 'dunk' : layup || floater ? 'layup' : 'follow'; p.actionTime = 0.8; p.charge = 0; p.moveState = null; p.pump = 0;
    if (p.id === 0) this.stats.attempts++;
    this.emit('shot', { shot: this.shot, player: p.id, human });
    return true;
  }

  // Where the ball met (or missed) the ring, seen from the shooter.
  shotOffset(shot) {
    const hoop = CONFIG.hoop, dx = hoop.x - shot.origin.x, dz = hoop.z - shot.origin.z, d = Math.hypot(dx, dz) || 1;
    const bx = this.ball.pos.x - hoop.x, bz = this.ball.pos.z - hoop.z;
    return { along: (bx * dx + bz * dz) / d, side: (bx * -dz + bz * dx) / d };
  }
  reportShot(made, label = null) {
    const s = this.shot; if (!s || s.reported) return;
    s.reported = true;
    if (!label) {
      const airball = !s.first, along = s.firstAlong, side = s.firstSide;
      if (Math.abs(along) >= Math.abs(side) * 0.8) label = along < 0 ? (airball ? 'AIRBALL · SHORT' : 'SHORT · FRONT RIM') : airball ? 'AIRBALL · LONG' : s.first === 'board' ? 'LONG · OFF THE GLASS' : 'LONG · BACK RIM';
      else label = `${side < 0 ? 'LEFT' : 'RIGHT'}${airball ? ' · WIDE' : ' · SIDE RIM'}`;
    }
    this.lastResult = { made, label, shooter: s.shooter };
    this.emit('shotResult', { made, label, player: s.shooter, team: s.team });
  }

  updateFlight(dt) {
    this.flightAge += dt;
    const hoop = CONFIG.hoop, ball = this.ball;
    for (const e of ball.step(dt)) {
      if (e.type === 'basket') this.basket(e);
      else {
        const s = this.shot;
        if (s && !s.first && (e.type === 'rim' || e.type === 'board')) { const o = this.shotOffset(s); s.first = e.type; s.firstAlong = o.along; s.firstSide = o.side; }
        if (e.type === 'rim' && s) s.hitRim = true;
        this.emit(e.type, e);
      }
    }
    if (this.checkTimer > 0 || this.settleTimer > 0 || this.phase !== 'playing') return;
    const shot = this.shot;
    if (this.isMatch && shot && !shot.resolved) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (!this.shotClock && ball.floorHits && !shot.hitRim) { this.reportShot(false); this.turnover('SHOT CLOCK.', 'The shot must touch the rim.'); return; }
    }
    if (shot && !shot.resolved && !ball.scored) {
      if (ball.pos.y > hoop.y) shot.peaked = true;
      else if (shot.peaked && !shot.first && !shot.crossed) { const o = this.shotOffset(shot); shot.crossed = true; shot.firstAlong = o.along; shot.firstSide = o.side; }
      // Once the ball has touched iron or glass it is a rebound, not a block.
      if (!shot.first && this.tryBlocks(shot)) return;
      // A miss is live for a rebound once it has dropped clear of the ring.
      const clear = shot.first && ball.vel.y < 0 && distance(ball.pos, hoop) > 0.55;
      if (!shot.reported && (clear || shot.peaked && ball.vel.y < 0 && ball.pos.y < hoop.y - 0.3 || ball.floorHits > 0 || this.flightAge > 3.6)) this.reportShot(false);
    }
    if (this.mode === 'contest') {
      if (this.shot && !this.shot.resolved && (ball.floorHits > 0 || this.flightAge > 3.6)) this.resolveContest(false);
      return;
    }
    if (this.mode === 'practice') {
      if (this.flightAge > 2.6 || (ball.floorHits > 0 && this.flightAge > 1.1)) {
        if (this.shot && !this.shot.resolved) { this.reportShot(false); this.toast('NEXT ONE.', this.lastResult?.label || 'Release at the top of your jump.'); }
        this.giveBall(this.human); this.shot = null;
      }
      return;
    }
    // The shot clock continues to run after a missed release until it actually
    // touches the rim. A clean airball is never a free clock reset.
    if (this.shot && this.flightAge > 3.6) this.shot.resolved = true;
    const live = this.shot && !this.shot.reported;
    if (this.flightAge > 0.16 && !ball.scored && !live) {
      const candidates = [...this.players].sort((a, b) => distance(a.pos, ball.pos) - distance(b.pos, ball.pos));
      const pass = this.ballState === 'pass' ? this.passInfo : null;
      for (const p of candidates) {
        const scale = p.height / 1.92, gap = distance(p.pos, ball.pos);
        const hands = p.id === 0 && this.hands.some(h => h.distanceTo(ball.pos) < 0.5);
        const target = pass?.to === p.id, thief = pass && p.team !== pass.team;
        // Below the knee a pass cannot be picked off: that is what a bounce pass is for.
        let inReach = gap < (target ? 0.9 : thief ? 0.58 : 0.75) && ball.pos.y < (thief ? 2.05 : 2.42) * scale + p.jump && ball.pos.y > (thief ? 0.55 : 0);
        if (inReach && thief) {
          // An interception needs eyes on the ball; a turned back is beaten.
          const toBall = new Vec3(ball.pos.x - p.pos.x, 0, ball.pos.z - p.pos.z).normalize();
          inReach = toBall.x * Math.sin(p.yaw) + toBall.z * Math.cos(p.yaw) > -0.3 && !p.stagger;
        }
        if (!inReach && !hands) continue;
        if (pass && p.id === pass.from && this.flightAge < 0.4) continue;
        if (this.looseFrom === p.id && this.flightAge < 0.3) continue;
        const rebound = this.ballState !== 'pass';
        if (rebound && p.team === this.possession && this.shot && !this.shot.hitRim && this.shotClock <= 0) { this.turnover('SHOT CLOCK.'); return; }
        const oldTeam = this.possession, board = rebound && this.liveRebound;
        this.giveBall(p, oldTeam !== p.team, true);
        if (rebound) this.lastPass = null;
        if (pass && p.team === pass.team) { this.lastPass = { from: pass.from, to: p.id, time: this.time }; p.caughtAt = this.time; }
        if (board && p.id === 0) this.stats.rebounds++;
        if (thief && p.id === 0) this.stats.steals++;
        this.emit('catch', { player: p.id, rebound: board, stolen: !!thief });
        if (oldTeam !== p.team) this.toast(thief ? 'PICKED OFF.' : 'CLEAR IT.', p.team === 0 ? 'Take it beyond the arc, then attack.' : 'Get a stop. Stay between them and the rim.', thief ? (p.team === 0 ? 'good' : 'bad') : 'normal');
        return;
      }
    }
    if (this.flightAge > 7) this.turnover('LOOSE BALL.', 'Fresh check.');
  }

  // A block needs a hand on the ball: an airborne defender whose reach from the
  // shoulder meets it, or a real tracked hand in the headset.
  tryBlocks(shot) {
    const ball = this.ball, hoop = CONFIG.hoop;
    for (const p of this.players) {
      if (p.team === shot.team || p.stagger) continue;
      const tracked = p.id === 0 && this.hands.some(h => h.distanceTo(ball.pos) < 0.36);
      if (!tracked) {
        if (p.jump < 0.1 || this.flightAge < 0.04) continue;
        // The hand is at the end of a raised arm: the ball has to be up there
        // with it, in front of the body, not merely somewhere near the defender.
        const scale = p.height / 1.92, shoulder = new Vec3(p.pos.x, p.jump + 0.815 * p.height, p.pos.z);
        const toBall = ball.pos.clone().sub(shoulder), flat = Math.hypot(toBall.x, toBall.z);
        const facing = (toBall.x * Math.sin(p.yaw) + toBall.z * Math.cos(p.yaw)) / Math.max(0.01, flat);
        if (toBall.length() > ARM * scale + 0.12 || toBall.y < 0.3 * scale || flat > 0.55 || facing < 0) continue;
      }
      if (ball.vel.y < 0 && ball.pos.y > hoop.y && distance(ball.pos, hoop) < 1.7) {
        // Only a person can be fooled into touching a ball on its way down.
        if (p.id !== 0 || this.preview) continue;
        this.goaltend(shot); return true;
      }
      const forward = new Vec3(Math.sin(p.yaw), 0, Math.cos(p.yaw)), side = new Vec3(-forward.z, 0, forward.x);
      const swat = tracked || p.jumpVel > -1.2;
      ball.vel.scale(0.22).addScaled(forward, swat ? 3.6 + this.rng() * 1.6 : 1.6).addScaled(side, (this.rng() - 0.5) * 3);
      ball.vel.y = swat ? -1.2 + this.rng() * 1.6 : 1.3;
      ball.spin.scale(0.2);
      this.ballState = 'loose'; shot.resolved = true; this.reportShot(false, 'BLOCKED'); this.shot = null; this.flightAge = 0.17;
      this.lastTouch = p.id; this.looseFrom = p.id;
      this.toast(swat ? 'DENIED!' : 'GOT A PIECE.', p.team === 0 ? 'Get that out of here.' : 'Find a little more space.', p.team === 0 ? 'good' : 'bad');
      if (p.id === 0) this.stats.blocks++;
      this.emit('block', { player: p.id, swat });
      return true;
    }
    return false;
  }
  goaltend(shot) {
    this.reportShot(true, 'GOALTENDING'); shot.resolved = true;
    this.toast('GOALTENDING.', `The basket counts. +${shot.value}`, 'bad'); this.emit('whistle');
    this.award(shot);
  }

  basket(e = {}) {
    const s = this.shot;
    if (!s || s.resolved || this.ballState !== 'flight') return;
    s.resolved = true;
    const label = s.dunk ? 'SLAM' : e.clean ? 'SWISH' : e.bank ? 'BANK · OFF THE GLASS' : this.ball.rimHits > 2 ? 'SHOOTER’S ROLL' : s.first === 'board' ? 'OFF THE GLASS' : 'RIM AND IN';
    this.reportShot(true, label);
    this.emit('net', { clean: !!e.clean, speed: e.speed || 3 });
    if (this.mode === 'contest') { this.resolveContest(true); return; }
    if (s.shooter === 0) {
      this.stats.points += s.value; this.stats.made++; if (s.value === 3) this.stats.threes++; if (e.clean) this.stats.swishes++;
      this.heat += s.green ? 2 : 1;
      if (this.heat >= 5) { this.heatTime = 14; this.heat = 0; this.toast('ON FIRE.', 'Wider release window. Keep cooking.', 'fire'); }
      else this.toast(s.dunk ? 'THROW IT DOWN!' : s.layup ? (s.bank ? 'OFF THE GLASS.' : 'SOFT TOUCH.') : e.clean && s.green ? 'NOTHING BUT NET.' : s.fade ? 'FADEAWAY.' : s.value === 3 ? 'FROM DEEP.' : 'BUCKET.',
        `+${s.value} ${s.green ? '· Perfect release' : s.rhythm ? '· Catch and shoot' : '· Run it back'}`, 'good');
    } else {
      if (s.assist === 0) this.stats.assists++;
      this.toast(s.team === 0 ? 'DIME.' : 'THEY GOT ONE.', `+${s.value} · ${s.team === 0 ? 'Good basketball.' : 'Your ball. Answer back.'}`, s.team === 0 ? 'good' : 'bad');
    }
    this.award(s, e.clean);
  }
  award(s, clean = false) {
    this.score[s.team] += s.value; this.lastScore = { team: s.team, time: this.time, player: s.shooter };
    this.emit('score', { team: s.team, value: s.value, green: s.green, dunk: s.dunk, clean, player: s.shooter });
    if (this.isMatch) {
      const lead = Math.abs(this.score[0] - this.score[1]);
      if ((Math.max(...this.score) >= CONFIG.match.target && lead >= 2) || Math.max(...this.score) >= CONFIG.match.cap) { this.finish(); return; }
      this.scheduleCheck(1 - s.team, 1.45);
    }
  }

  giveBall(p, changed = false, caught = false) {
    const contact = caught ? this.ball.pos.clone() : null;
    this.catchFrom = null;
    if (this.shot && !this.shot.reported) this.reportShot(false);
    const hitRim = this.shot?.hitRim;
    this.ownerId = p.id; this.possession = p.team; this.ballState = 'dribble';
    this.shot = null; this.passInfo = null; this.charge = 0; this.flightAge = 0; this.liveRebound = false; this.looseFrom = null;
    this.lastTouch = p.id; this.ball.scored = false; p.ownedFor = 0; p.shield = 0.45;
    p.moveState = null; p.gatherFrom = null; p.pump = 0; p.dribbles = 0; p.caughtAt = -10; p.charge = 0;
    if (p.action === 'shooting' || p.action === 'pump') { p.action = ''; p.actionTime = 0; }
    if (changed) { this.needsClear = this.isMatch; this.shotClock = CONFIG.match.shotClock; this.lastPass = null; this.possessionPasses = 0; }
    else if (hitRim) this.shotClock = CONFIG.match.offensiveReboundClock;
    if (caught) p.dribble = Math.PI * 0.5;
    this.updateOwnedBall(0);
    if (contact) {
      this.catchFrom = contact.clone().sub(p.pos); this.catchFrom.y -= p.jump;
      this.ball.pos.copy(contact);
    }
  }
  scheduleCheck(team, duration = 1.2) {
    this.checkTeam = team; this.checkTimer = duration; this.ownerId = null; this.charge = 0;
    this.passInfo = null; this.catchFrom = null;
    for (const p of this.players) {
      p.moveState = null; p.locoVel.set(0, 0, 0); p.vel.set(0, 0, 0); p.acceleration.set(0, 0, 0); p.pump = 0;
    }
  }
  resetPossession(team) {
    this.needsClear = false; this.shotClock = CONFIG.match.shotClock; this.lastPass = null; this.possessionPasses = 0;
    if (this.isMatch) {
      for (const p of this.players) {
        const offence = p.team === team;
        p.pos.set(p.id % 2 ? (offence ? 4 : 3.5) : 0, 0, offence ? (p.id % 2 ? -0.4 : 1.6) : (p.id % 2 ? -2 : -0.8));
        p.vel.set(0, 0, 0); p.locoVel.set(0, 0, 0); p.moveState = null; p.jump = 0; p.jumpVel = 0; p.stagger = 0; p.yaw = p.id === 0 ? Math.PI : offence ? Math.PI : 0;
        p.burst = 0; p.react = 0; p.bump = 0; p.protect = 0; p.percept.copy(p.pos); p.action = ''; p.actionTime = 0;
      }
    }
    const first = teamPlayers(this.players, team)[0];
    this.shot = null;
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
    const gathered = this.ownerId === p.id && (this.ballState === 'held' || p.action === 'shooting');
    const gap = distance(p.pos, CONFIG.hoop), P = CONFIG.player;
    // A jump shot rises about 40 cm. Finishes and blocks use the whole vertical.
    p.jumpVel = !gathered ? P.jumpSpeed : gap < 0.95 ? P.rimJump : gap < 2.9 ? 3.6 : P.shotJump;
    p.stamina = Math.max(0, p.stamina - (gathered && gap >= 2.9 ? 6 : 12));
    if (p.action !== 'shooting') { p.action = 'jump'; p.actionTime = 0.7; }
    this.emit('jump', { player: p.id });
  }

  // A move only breaks a defender who is actually wrong-footed by it: sliding
  // the other way, reaching, or still in the air.
  dribbleMove(p, kind) {
    if (this.mode === 'contest' || this.ownerId !== p.id || this.ballState !== 'dribble' || p.moveCooldown > 0 || p.stamina < 16 || p.pump > 0) return false;
    const spec = MOVE_SPECS[kind]; if (!spec || p.stamina < spec.cost) return false;
    p.moveCooldown = spec.duration + 0.1; p.stamina -= spec.cost; p.shield = spec.shield;
    p.action = kind; p.actionTime = spec.duration;
    const move = beginMove(p, kind);
    p.burst = spec.duration + spec.burst;
    if (this.comboUntil < this.time && p.id === 0) this.combo = [];
    const chain = p.id === 0 ? this.combo.length : 0;
    let broke = false, froze = false;
    for (const d of this.players) {
      if (d.team === p.team || d.stagger) continue;
      const gap = distance(d.pos, p.pos);
      if (gap > 2.3) continue;
      const away = new Vec3(d.pos.x - p.pos.x, 0, d.pos.z - p.pos.z).normalize();
      // Momentum against the move: lateral for a change of hand, retreating
      // for a stepback or hesitation.
      const against = kind === 'stepback' || kind === 'hesi' ? d.locoVel.dot(away) * (kind === 'hesi' ? -1 : 1) : -d.locoVel.dot(move.direction);
      const human = d.id === 0 && !this.preview;
      const resist = human ? 0.3 : DIFFICULTIES[this.difficulty].resist;
      const fooled = clamp(against / 2.2, -0.4, 1) + (d.stealCooldown > 0.35 ? 0.8 : 0) + (d.jump > 0.05 ? 0.9 : 0) + chain * 0.16
        + (gap < 1.3 ? 0.18 : 0) + (kind === 'hesi' ? 0.1 : 0) + (this.rng() - 0.5) * 0.3 - resist;
      if (fooled > 0.5) {
        d.stagger = 0.3 + 0.55 * clamp((fooled - 0.5) / 0.6, 0, 1);
        d.react = d.stagger; froze = true; if (fooled > 0.95) broke = true;
      } else d.react = Math.max(d.react, human ? 0 : DIFFICULTIES[this.difficulty].react * 0.6);
    }
    if (p.id === 0) {
      this.combo.push(spec.label); this.combo = this.combo.slice(-4); this.comboUntil = this.time + 2.3;
      this.stats.moves++; this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo.length);
      if (broke) this.stats.ankles++;
      this.toast(broke ? 'ANKLE BREAKER.' : froze ? 'GOT ’EM LEANING.' : spec.label, this.combo.length > 1 ? `${this.combo.length} MOVE COMBO` : froze ? 'Go. Now.' : 'Create your space.', froze ? 'good' : 'normal');
    } else if (broke && !this.preview) this.toast('SHOOK.', 'Recover. Get back in front.', 'bad');
    this.emit('move', { kind, player: p.id, broke, froze }); return true;
  }

  // How available the ball is to a reaching defender, 0 to 1. The handler's
  // body, the hand on the ball and a protected dribble all take it away.
  exposure(p, o = this.owner) {
    if (!o || o.team === p.team || this.ballState !== 'dribble' || o.shield > 0) return 0;
    const ball = this.ball.pos;
    if (ball.y > 1.3 + o.jump) return 0;
    const gap = distance(p.pos, ball);
    const direction = new Vec3(ball.x - p.pos.x, 0, ball.z - p.pos.z).normalize();
    const tracked = p.id === 0 && this.hands.some(h => h.distanceTo(ball) < 0.5);
    if (!tracked && (gap > 1.28 || direction.x * Math.sin(p.yaw) + direction.z * Math.cos(p.yaw) < 0.2)) return 0;
    const toBall = new Vec3(ball.x - o.pos.x, 0, ball.z - o.pos.z).normalize(), toDefender = new Vec3(p.pos.x - o.pos.x, 0, p.pos.z - o.pos.z).normalize();
    const open = clamp(0.5 + 0.6 * toBall.dot(toDefender), 0.08, 1);
    return clamp(open * (dribbleInHand(o) ? 0.6 : 1) * (1 - 0.45 * o.protect) * clamp(1.5 - gap / 1.25, 0.45, 1) * (tracked ? 1.25 : 1), 0, 1);
  }
  trySteal(p) {
    const o = this.owner;
    if (p.stealCooldown || p.stamina < 8) return false;
    if (!o) return this.ballState === 'pass' && this.passInfo?.team !== p.team ? this.tipPass(p) : false;
    if (o.team === p.team) return false;
    p.stealCooldown = 0.9; p.stamina = Math.max(0, p.stamina - 10); p.action = 'reach'; p.actionTime = 0.36;
    p.reach.copy(this.ball.pos);
    const exposure = this.exposure(p, o), roll = this.rng();
    if (exposure > 0 && roll < exposure * 0.62) {
      this.giveBall(p, true, true); if (p.id === 0) this.stats.steals++;
      this.toast(p.team === 0 ? 'POCKET PICKED.' : 'STRIPPED.', p.team === 0 ? 'Clear it beyond the arc.' : 'Protect the ball. Keep it on your far hip.', p.team === 0 ? 'good' : 'bad');
      this.emit('steal', { player: p.id }); return true;
    }
    if (exposure > 0 && roll < exposure) {
      // A piece of it: the ball is on the floor and anybody's.
      const away = new Vec3(this.ball.pos.x - p.pos.x, 0, this.ball.pos.z - p.pos.z).normalize(), side = new Vec3(-away.z, 0, away.x);
      const vel = away.scale(1.5 + this.rng() * 1.5).addScaled(side, (this.rng() - 0.5) * 2.4); vel.y = 1 + this.rng();
      this.ball.launch(this.ball.pos, vel); this.ownerId = null; this.ballState = 'loose'; this.shot = null; this.passInfo = null;
      this.charge = 0; this.flightAge = 0; this.lastTouch = p.id; this.looseFrom = o.id; this.catchFrom = null; this.liveRebound = false;
      o.moveState = null; o.stagger = Math.max(o.stagger, 0.12);
      this.toast('KNOCKED LOOSE.', p.team === 0 ? 'Go get it.' : 'Loose ball. Dive on it.', p.team === 0 ? 'good' : 'bad');
      this.emit('poke', { player: p.id }); return 'loose';
    }
    // A reach that finds nothing leaves the defender leaning.
    p.stagger = 0.3; o.burst = Math.max(o.burst, 0.45);
    this.emit('reach', { player: p.id }); return false;
  }
  tipPass(p) {
    const ball = this.ball;
    const chest = new Vec3(p.pos.x, p.jump + 0.72 * p.height, p.pos.z);
    p.stealCooldown = 0.7; p.action = 'reach'; p.actionTime = 0.3; p.reach.copy(ball.pos);
    if (chest.distanceTo(ball.pos) > 1.2 || ball.pos.y < 0.3) return false;
    ball.vel.scale(0.3); ball.vel.x += (this.rng() - 0.5) * 3; ball.vel.z += (this.rng() - 0.5) * 3; ball.vel.y = 1.6 + this.rng();
    this.ballState = 'loose'; this.passInfo = null; this.flightAge = 0; this.lastTouch = p.id; this.looseFrom = p.id; this.liveRebound = false;
    this.toast('DEFLECTED.', p.team === 0 ? 'Go get it.' : 'Loose ball.', p.team === 0 ? 'good' : 'bad');
    this.emit('poke', { player: p.id, pass: true }); return 'loose';
  }

  // Smart pass: a chest pass through an open lane, a bounce pass under a
  // defender near the middle of it, a lob over one who is closer.
  choosePass(p, target, origin) {
    const d = distance(origin, target.pos);
    let blocker = null;
    for (const o of this.players) if (o.team !== p.team && !o.stagger) {
      const dx = target.pos.x - origin.x, dz = target.pos.z - origin.z;
      const t = ((o.pos.x - origin.x) * dx + (o.pos.z - origin.z) * dz) / (dx * dx + dz * dz || 1);
      if (t > 0.1 && t < 0.9 && segmentGap(o.pos, origin, target.pos) < 0.65) blocker = t;
    }
    if (blocker === null) return 'chest';
    return d > 2.6 && d < 6.4 && blocker > 0.56 ? 'bounce' : 'lob';
  }
  pass(p, target = null, kind = 'auto') {
    if (this.ownerId !== p.id || p.aiWait > 0.1 && (p.id !== 0 || this.preview)) return false;
    target ||= this.players.find(t => t.team === p.team && t.id !== p.id);
    if (!target) { if (p.id === 0) this.toast('YOU GOT THIS.', 'No teammate in 1v1. Create your shot.'); return false; }
    const origin = this.ball.pos.clone(); origin.y = clamp(origin.y, 1.2 + p.jump, 2.3 + p.jump);
    if (!['chest', 'bounce', 'lob'].includes(kind)) kind = this.choosePass(p, target, origin);
    // Solve the receiver's lead over the flight, including cuts toward either sideline.
    const destination = target.pos.clone();
    for (let i = 0; i < 3; i++) {
      const t = passTime(distance(origin, destination), kind);
      destination.copy(target.pos).addScaled(target.vel, t);
      destination.x = clamp(destination.x, -7.15, 7.15);
      destination.z = clamp(destination.z, -7.7, 7.15);
    }
    destination.y = (kind === 'bounce' ? 1.02 : 1.25) + target.jump * 0.5;
    const throwing = passVelocity(origin, destination, kind);
    this.ball.launch(origin, throwing.vel, throwing.spin); this.ballState = 'pass'; this.ownerId = null; this.shot = null;
    this.passInfo = { from: p.id, to: target.id, team: p.team, destination, duration: throwing.duration, kind: throwing.kind };
    this.flightAge = 0; this.lastTouch = p.id; this.liveRebound = false; this.looseFrom = null;
    p.passYaw = Math.atan2(throwing.vel.x, throwing.vel.z); p.passKind = throwing.kind; p.moveState = null; p.pump = 0; this.catchFrom = null;
    this.possessionPasses++;
    this.charge = 0; p.charge = 0; p.aiWait = 0.65; p.action = 'pass'; p.actionTime = 0.42;
    this.emit('pass', { player: p.id, kind: throwing.kind });
    return true;
  }

  // Bodies are solid. A set defender holds their ground; a dribbler who runs
  // into one is stopped rather than sliding through.
  separatePlayers(dt = 0) {
    const anchor = p => p.jump > 0.05 ? 0.6 : p.stagger ? 0.5 : p.defending && this.ownerId !== p.id ? 2.6 : 1;
    for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) {
      const a = this.players[i], b = this.players[j];
      let dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d >= 0.7) continue;
      if (d < 0.001) { dx = 1; dz = 0; d = 0.001; }
      const push = 0.7 - d; dx /= Math.max(d, 1); dz /= Math.max(d, 1);
      // A minimum normal length handles coincident spawn points deterministically.
      const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
      const wa = anchor(a), wb = anchor(b), sa = wb / (wa + wb), sb = wa / (wa + wb);
      a.pos.x += dx * push * sa; a.pos.z += dz * push * sa; b.pos.x -= dx * push * sb; b.pos.z -= dz * push * sb;
      if (a.team === b.team || !dt) continue;
      for (const [p, nx, nz, share] of [[a, dx, dz, sa], [b, -dx, -dz, sb]]) {
        const into = -(p.locoVel.x * nx + p.locoVel.z * nz);
        if (into <= 0.4) continue;
        p.locoVel.x += nx * into * share; p.locoVel.z += nz * into * share;
        if (this.ownerId === p.id && share > 0.6 && !p.bump) { p.bump = 0.22; p.stamina = Math.max(0, p.stamina - 3); this.emit('bump', { player: p.id, speed: into }); }
      }
    }
  }

  placeAtRack() {
    const r = RACKS[this.rack]; this.human.pos.set(r.x, 0, r.z); this.human.vel.set(0, 0, 0);
    this.human.yaw = Math.atan2(-r.x, CONFIG.hoop.z - r.z); this.emit('recenter', { rack: this.rack });
  }
  resolveContest(made) {
    const s = this.shot;
    if (!s || this.settleTimer > 0) return;
    s.resolved = true; if (!made) this.reportShot(false);
    const value = made ? s.money ? 2 : 1 : 0;
    this.contestResults[this.rack * 5 + this.rackBall] = { made, value, money: s.money };
    this.contestShots++;
    if (made) {
      this.score[0] += value; this.stats.points += value; this.stats.made++; this.stats.threes++;
      this.toast(s.money ? 'MONEY BALL!' : s.green ? 'PURE GREEN.' : 'SPLASH.', `+${value} · ${this.score[0]} points`, 'good');
      this.emit('score', { team: 0, value, green: s.green, clean: this.lastResult?.label === 'SWISH', player: 0 });
    } else this.toast('NEXT BALL.', this.lastResult?.label || 'Stay in rhythm.');
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
    this.shot = null; this.giveBall(this.human);
  }
  finish() {
    if (this.phase === 'result') return;
    this.phase = 'result'; this.emit('finish', { won: this.score[0] > this.score[1], mode: this.mode }); if (!this.contestBuzzer) this.emit('buzzer');
  }
}

export function segmentGap(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
