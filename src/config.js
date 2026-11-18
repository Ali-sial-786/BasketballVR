// All distances in metres, time in seconds. Y up; the basket is toward -Z.
export const CONFIG = {
  fixedStep: 1 / 120,
  court: { halfWidth: 7.5, back: -8, front: 7.5, threeRadius: 6.75, cornerX: 6.6 },
  // Regulation ring: 457 mm inside diameter, 19 mm bar.
  hoop: { x: 0, y: 3.05, z: -6.1, radius: 0.238, tube: 0.0095 },
  board: { z: -6.52, x: 0, y: 3.48, width: 1.8, height: 1.05, thickness: 0.035 },
  // Size 7 ball. Drag and lift are accelerations per unit mass.
  ball: { radius: 0.12, gravity: 9.81, drag: 0.0206, magnus: 0.0026, spinDecay: 0.05,
    floorRestitution: 0.76, floorFriction: 0.6, rimRestitution: 0.6, rimFriction: 0.32,
    boardRestitution: 0.74, boardFriction: 0.42 },
  player: { speed: 3.5, sprint: 5.0, radius: 0.34, jumpSpeed: 3.8, shotJump: 3.0, rimJump: 4.25, staminaRegen: 14,
    heights: [1.92, 1.96, 1.94, 1.88], ballTax: 0.93 },
  match: { target: 11, cap: 21, shotClock: 18, offensiveReboundClock: 12 },
  // A quick, compact catch-and-shoot release: into the pocket, set point before
  // the feet leave the floor, ball gone at the top of a modest jump.
  shot: { idealTime: 0.62, greenWindow: 0.075, maxCharge: 1.2, takeoff: 0.36, pumpWindow: 0.18, followThrough: 1.0 },
  pass: { chest: 12.5, bounce: 10.5, lobApex: 3.7 },
  contest: { seconds: 70, ballsPerRack: 5, moneyRack: 2 },
  xr: { maxFrameRate: 90, foveation: 1, framebufferScale: 1 },
};
// react: seconds an AI defender needs to read a change of direction.
// bite: chance an AI defender leaves their feet for a pump fake.
// jumpiness: how often an AI closeout leaves the floor to challenge a jump shot.
export const DIFFICULTIES = {
  rookie: { name: 'Rookie', assist: 0.9, aimCone: 0.7, aiSpeed: 2.5, aiAccuracy: 0.65, stealRate: 0.12, greenWindow: 0.12, react: 0.34, bite: 0.65, resist: 0.05, jumpiness: 0.28 },
  park: { name: 'Park', assist: 0.7, aimCone: 0.5, aiSpeed: 3.05, aiAccuracy: 0.8, stealRate: 0.22, greenWindow: 0.075, react: 0.23, bite: 0.42, resist: 0.2, jumpiness: 0.38 },
  allstar: { name: 'All-star', assist: 0.4, aimCone: 0.3, aiSpeed: 3.5, aiAccuracy: 0.9, stealRate: 0.34, greenWindow: 0.05, react: 0.15, bite: 0.2, resist: 0.36, jumpiness: 0.48 },
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
