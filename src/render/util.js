import * as THREE from 'three';
export function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...extra }); }
export function mesh(geometry, mat, parent, pos = [0, 0, 0]) { const m = new THREE.Mesh(geometry, mat); m.position.set(...pos); if (parent) parent.add(m); return m; }
export function box(parent, size, pos, mat) { return mesh(new THREE.BoxGeometry(...size), mat, parent, pos); }
export function cylinderBetween(parent, a, b, radius, mat, segments = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, d.length(), segments), mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h); const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function label(parent, text, width, height, position, { color = '#eee7ce', background = null, font = '900 88px Arial', rotation = 0 } = {}) {
  const texture = canvasTexture(1024, 256, (c, w, h) => {
    if (background) { c.fillStyle = background; c.fillRect(0, 0, w, h); }
    c.fillStyle = color; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2, w - 40);
  });
  const m = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: !background, side: THREE.DoubleSide, depthWrite: !!background }), parent, position);
  m.rotation.y = rotation; return m;
}
let ballGeometry, ballMaterial, moneyMaterial;
// A composite-leather ball: eight panels, recessed channels and a pebbled
// grain that catches the arena lights. Colour, relief and gloss come from one
// seam layout so they always line up.
export function makeBall(money = false) {
  if (!ballGeometry) {
    ballGeometry = new THREE.SphereGeometry(0.12, 48, 32);
    let seed = 97; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const seams = (c, w, h, width, style) => {
      c.strokeStyle = style; c.lineWidth = width; c.lineCap = 'round';
      for (const x of [0, w / 2, w]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      for (const sign of [-1, 1]) {
        c.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h / 2 + sign * h * 0.39 * Math.sin(x / w * Math.PI * 2); x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      }
    };
    const pebbles = [];
    for (let i = 0; i < 26000; i++) pebbles.push([random(), random(), 1.6 + random() * 1.5]);
    const texture = canvasTexture(1024, 512, (c, w, h) => {
      c.fillStyle = '#c96227'; c.fillRect(0, 0, w, h);
      // Broad wear: paler where hands polish it, deeper toward the channels.
      for (let i = 0; i < 90; i++) { const g = c.createRadialGradient(random() * w, random() * h, 0, random() * w, random() * h, 60 + random() * 120); g.addColorStop(0, i % 2 ? '#e0803d22' : '#a54b1c22'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      for (const [x, y, r] of pebbles) { c.fillStyle = r > 2.4 ? '#e8894330' : '#9d461a2c'; c.beginPath(); c.arc(x * w, y * h, r, 0, Math.PI * 2); c.fill(); }
      seams(c, w, h, 15, '#7d3a1640'); seams(c, w, h, 8, '#1d1613');
    });
    texture.anisotropy = 8;
    const relief = canvasTexture(1024, 512, (c, w, h) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
      for (const [x, y, r] of pebbles) { const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * 1.25); g.addColorStop(0, '#c8c8c8'); g.addColorStop(1, '#80808000'); c.fillStyle = g; c.beginPath(); c.arc(x * w, y * h, r * 1.25, 0, Math.PI * 2); c.fill(); }
      seams(c, w, h, 15, '#40404080'); seams(c, w, h, 8, '#101010');
    });
    relief.colorSpace = THREE.NoColorSpace; relief.anisotropy = 4;
    ballMaterial = new THREE.MeshPhysicalMaterial({ map: texture, bumpMap: relief, bumpScale: 0.6, roughnessMap: relief, roughness: 1.15, metalness: 0, sheen: 0.25, sheenRoughness: 0.6, sheenColor: 0xffb070, envMapIntensity: 0.7 });
    // Tint the same leather so money balls keep their channels and grain.
    const gold = canvasTexture(1024, 512, (c, w, h) => {
      c.drawImage(texture.image, 0, 0);
      c.globalCompositeOperation = 'color'; c.fillStyle = '#efbf41'; c.fillRect(0, 0, w, h);
    });
    moneyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffecb7, map: gold, bumpMap: relief, bumpScale: 0.6, roughnessMap: relief, roughness: 0.95, metalness: 0, envMapIntensity: 0.9 });
  }
  const b = new THREE.Mesh(ballGeometry, money ? moneyMaterial : ballMaterial); b.castShadow = true; return b;
}
let shadowTexture;
export function shadow(parent, radius = 0.45, opacity = 0.35) {
  shadowTexture ||= canvasTexture(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, '#0009'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const m = mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false }), parent);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.026; return m;
}
