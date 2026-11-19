// Adapted from Crease VR's Controller: real-time, reference-space motion
// samples. A thumbstick move, snap turn, hitch or tracking loss is never a throw.
import { Vec3, Quat, Pose, angularVelocityFromQuats, clamp } from '../physics/math.js';
export class Button {
  constructor() { this.pressed = false; this.down = false; this.up = false; this.value = 0; }
  set(on, value = on ? 1 : 0) { this.down = !!on && !this.pressed; this.up = !on && this.pressed; this.pressed = !!on; this.value = value; }
}
export class Controller {
  constructor(hand) {
    this.hand = hand; this.connected = false; this.tracked = false; this.source = null;
    this.gripPose = new Pose(); this.gripRef = new Pose(); this.rayPose = new Pose();
    this.linVel = new Vec3(); this.angVel = new Vec3();
    this.buttons = Object.fromEntries(['trigger', 'squeeze', 'a', 'b', 'stick'].map(k => [k, new Button()]));
    this.stick = { x: 0, y: 0 }; this.history = []; this.previous = new Pose(); this.previousTime = -1;
  }
  record(t, rigQ, nativeVelocity = null) {
    if (this.previousTime >= 0 && (t <= this.previousTime || t - this.previousTime > 0.25)) this.resetMotion();
    if (nativeVelocity && this.previousTime >= 0) this.linVel.copy(nativeVelocity).applyQuat(rigQ);
    else if (this.previousTime >= 0) {
      const dt = t - this.previousTime;
      const v = this.gripRef.p.clone().sub(this.previous.p).scale(1 / dt).applyQuat(rigQ);
      this.linVel.lerp(v, 0.75);
      angularVelocityFromQuats(this.angVel, this.previous.q, this.gripRef.q, dt).applyQuat(rigQ);
    } else this.linVel.set(0, 0, 0);
    // Reject corrupt/reacquired tracking spikes without amplifying real flicks.
    if (this.linVel.length() > 16) this.linVel.set(0, 0, 0);
    this.previous.copy(this.gripRef); this.previousTime = t;
    this.history.push({ t, p: this.gripPose.p.clone(), ref: this.gripRef.p.clone(), v: this.linVel.clone() });
    if (this.history.length > 24) this.history.shift();
  }
  releaseVelocity(t) {
    // Recent weighted average, rather than a stale peak from lifting the ball.
    const v = new Vec3(); let total = 0;
    for (const h of this.history) { const age = t - h.t; if (age > 0.075) continue; const w = 1 - age / 0.1; v.addScaled(h.v, w); total += w; }
    return total ? v.scale(1 / total) : v;
  }
  resetMotion() { this.previousTime = -1; this.history = []; this.linVel.set(0, 0, 0); this.angVel.set(0, 0, 0); }
  reset() { this.resetMotion(); for (const b of Object.values(this.buttons)) b.set(false); this.stick.x = this.stick.y = 0; }
  pulse(strength = 0.3, ms = 35) {
    try { const gp = this.source?.gamepad; const a = gp?.hapticActuators?.[0];
      if (a?.pulse) a.pulse(clamp(strength, 0, 1), ms)?.catch?.(() => {});
      else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength })?.catch?.(() => {});
    } catch {}
  }
}
