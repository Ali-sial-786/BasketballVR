// All distances in metres, time in seconds. Y up; the basket is toward -Z.
export const CONFIG = {
  fixedStep: 1 / 120,
  court: { halfWidth: 7.5, back: -8, front: 7.5, threeRadius: 6.75, cornerX: 6.6 },
  hoop: { x: 0, y: 3.05, z: -6.1, radius: 0.235, tube: 0.018 },
  board: { z: -6.52, x: 0, y: 3.48, width: 1.8, height: 1.05 },
  ball: { radius: 0.12, gravity: 9.81, floorRestitution: 0.76, rimRestitution: 0.68 },
  player: { speed: 3.5, sprint: 5.0, radius: 0.34, jumpSpeed: 3.8, staminaRegen: 14 },
  match: { target: 11, cap: 21, shotClock: 18, offensiveReboundClock: 12 },
  shot: { idealTime: 0.72, greenWindow: 0.075, maxCharge: 1.35 },
  contest: { seconds: 70, ballsPerRack: 5, moneyRack: 2 },
  xr: { maxFrameRate: 90, foveation: 1, framebufferScale: 1 },
};
export const DIFFICULTIES = {
  rookie: { name: 'Rookie', assist: 0.9, aimCone: 0.7, aiSpeed: 2.25, aiAccuracy: 0.65, stealRate: 0.12, greenWindow: 0.12 },
  park: { name: 'Park', assist: 0.7, aimCone: 0.5, aiSpeed: 2.8, aiAccuracy: 0.8, stealRate: 0.22, greenWindow: 0.075 },
  allstar: { name: 'All-star', assist: 0.4, aimCone: 0.3, aiSpeed: 3.3, aiAccuracy: 0.9, stealRate: 0.34, greenWindow: 0.05 },
};
export const MODES = {
  '1v1': { name: '1v1 · ISO BALL', short: '1v1', subtitle: 'Just you and your defender. First to 11.' },
  '2v2': { name: '2v2 · RUN TOGETHER', short: '2v2', subtitle: 'Move it. Cut. Find the open teammate.' },
  contest: { name: 'THREE-POINT CONTEST', short: '3PT', subtitle: 'Five racks. 70 seconds. Make it rain.' },
  practice: { name: 'SHOOTAROUND', short: 'FREE PLAY', subtitle: 'Find your rhythm. No clock. No pressure.' },
};
export const RACKS = [
  { x: -6.7, z: -5.1, name: 'LEFT CORNER' },
  { x: -4.9, z: -1.4, name: 'LEFT WING' },
  { x: 0, z: 0.85, name: 'TOP OF THE KEY' },
  { x: 4.9, z: -1.4, name: 'RIGHT WING' },
  { x: 6.7, z: -5.1, name: 'RIGHT CORNER' },
];
