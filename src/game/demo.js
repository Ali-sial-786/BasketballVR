import { CONFIG } from '../config.js';

// Spectator matches use the normal AI. The contest uses the same gather and
// release commands as a person; the ball still has to clear the real rim.
export function demoCommand(engine) {
  if (engine.mode !== 'contest') return {};
  const p = engine.human;
  return {
    aim: { x: CONFIG.hoop.x - p.pos.x, y: 0, z: CONFIG.hoop.z - p.pos.z },
    autoJump: true,
    gather: engine.ownerId === 0 && engine.ballState === 'dribble' && !engine.checkTimer,
    release: engine.ballState === 'held' && engine.charge >= CONFIG.shot.idealTime ? {} : null,
  };
}
