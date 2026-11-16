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
let ballGeometry, ballMaterial;
export function makeBall() {
  if (!ballGeometry) {
    ballGeometry = new THREE.SphereGeometry(0.12, 24, 16);
    const texture = canvasTexture(1024, 512, (c, w, h) => {
      c.fillStyle = '#dc6e2c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 12000; i++) { c.fillStyle = i % 2 ? '#b4532528' : '#ffb35b35'; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1.3, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = '#342a25'; c.lineWidth = 9;
      for (const x of [0, w / 2, w]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      for (const sign of [-1, 1]) {
        c.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h / 2 + sign * h * 0.39 * Math.sin(x / w * Math.PI * 2); x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      }
    });
    ballMaterial = material(0xffffff, { map: texture, roughness: 0.9 });
  }
  const b = new THREE.Mesh(ballGeometry, ballMaterial); b.castShadow = true; return b;
}
let shadowTexture;
export function shadow(parent, radius = 0.45, opacity = 0.35) {
  shadowTexture ||= canvasTexture(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, '#0009'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const m = mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false }), parent);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.026; return m;
}
