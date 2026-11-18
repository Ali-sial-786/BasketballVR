// Tackle-twill lettering for the uniforms: a wordmark and number on the chest,
// a name and a big number on the back, cut from an original block alphabet
// (drawn here as strokes, so it looks the same on every device and needs no
// font). The kit shader projects the two halves of this atlas onto the jersey
// in bind space and presses them into the cloth.
//
// Atlas: left half = chest, right half = back. Each half covers PRINT.width
// metres across the body and PRINT.height metres up it from PRINT.bottom.
// Red = twill, green = twill plus its outline; the colours come from the kit.
import * as THREE from 'three';

export const PRINT = { width: 0.36, height: 0.36, bottom: 1.03 };

// Glyphs on a unit box (y up). c and d are the corner cut in x and y so the
// chamfers come out at 45 degrees whatever the letter's proportions.
const glyphs = (c, d) => {
  const ring = [[c, 0], [1 - c, 0], [1, d], [1, 1 - d], [1 - c, 1], [c, 1], [0, 1 - d], [0, d], 'close'];
  const bowl = [[0, 0], [0, 1], [1 - c, 1], [1, 1 - d], [1, 0.5 + d * 0.4], [1 - c, 0.46], [0, 0.46]];
  return {
    0: [ring], O: [ring],
    1: [[[0.1, 1], [0.58, 1], [0.58, 0]], [[0.1, 0], [1, 0]]],
    2: [[[0, 1], [1 - c, 1], [1, 1 - d], [1, 0.5 + d], [1 - c, 0.5], [c, 0.5], [0, 0.5 - d], [0, 0], [1, 0]]],
    3: [[[0, 1], [1 - c, 1], [1, 1 - d], [1, 0.5 + d * 0.7], [1 - c * 0.7, 0.5], [1, 0.5 - d * 0.7], [1, d], [1 - c, 0], [0, 0]], [[0.38, 0.5], [1 - c * 0.7, 0.5]]],
    4: [[[0, 1], [0, 0.4], [1, 0.4]], [[0.72, 1], [0.72, 0]]],
    5: [[[1, 1], [0, 1], [0, 0.56], [1 - c, 0.56], [1, 0.56 - d], [1, d], [1 - c, 0], [0, 0]]],
    6: [[[1, 1], [c, 1], [0, 1 - d], [0, d], [c, 0], [1 - c, 0], [1, d], [1, 0.54 - d], [1 - c, 0.54], [0, 0.54]]],
    7: [[[0, 0.84], [0, 1], [1, 1], [1, 0.72], [0.42, 0]]],
    8: [ring, [[0, 0.5], [1, 0.5]]],
    9: [[[0, 0], [1 - c, 0], [1, d], [1, 1 - d], [1 - c, 1], [c, 1], [0, 1 - d], [0, 0.46 + d], [c, 0.46], [1, 0.46]]],
    A: [[[0, 0], [0, 1 - d * 1.4], [c * 1.4, 1], [1 - c * 1.4, 1], [1, 1 - d * 1.4], [1, 0]], [[0, 0.4], [1, 0.4]]],
    B: [[[0, 0], [0, 1], [1 - c, 1], [1, 1 - d], [1, 0.5 + d * 0.5], [1 - c * 0.6, 0.5], [1, 0.5 - d * 0.5], [1, d], [1 - c, 0], [0, 0]], [[0, 0.5], [1 - c * 0.6, 0.5]]],
    C: [[[1, 0.92 - d], [1, 1 - d], [1 - c, 1], [c, 1], [0, 1 - d], [0, d], [c, 0], [1 - c, 0], [1, d], [1, d + 0.08]]],
    D: [[[0, 0], [0, 1], [1 - c, 1], [1, 1 - d], [1, d], [1 - c, 0], 'close']],
    E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.78, 0.5]]],
    F: [[[1, 1], [0, 1], [0, 0]], [[0, 0.5], [0.75, 0.5]]],
    G: [[[1, 0.92 - d], [1, 1 - d], [1 - c, 1], [c, 1], [0, 1 - d], [0, d], [c, 0], [1 - c, 0], [1, d], [1, 0.46], [0.5, 0.46]]],
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    I: [[[0.5, 0], [0.5, 1]]],
    J: [[[1, 1], [1, d], [1 - c, 0], [c, 0], [0, d], [0, 0.34]]],
    K: [[[0, 0], [0, 1]], [[1, 1], [0, 0.4]], [[0.36, 0.64], [1, 0]]],
    L: [[[0, 1], [0, 0], [1, 0]]],
    M: [[[0, 0], [0, 1], [0.5, 0.36], [1, 1], [1, 0]]],
    N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
    P: [bowl],
    R: [bowl, [[0.48, 0.46], [1, 0]]],
    S: [[[1, 0.96 - d], [1, 1 - d], [1 - c, 1], [c, 1], [0, 1 - d], [0, 0.5 + d], [c, 0.5], [1 - c, 0.5], [1, 0.5 - d], [1, d], [1 - c, 0], [c, 0], [0, d], [0, d + 0.04]]],
    T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
    U: [[[0, 1], [0, d], [c, 0], [1 - c, 0], [1, d], [1, 1]]],
    V: [[[0, 1], [0.5, 0], [1, 1]]],
    W: [[[0, 1], [0, 0], [0.5, 0.64], [1, 0], [1, 1]]],
    X: [[[0, 1], [1, 0]], [[0, 0], [1, 1]]],
    Y: [[[0, 1], [0.5, 0.5], [1, 1]], [[0.5, 0.5], [0.5, 0]]],
    Z: [[[0, 1], [1, 1], [0, 0], [1, 0]]],
  };
};
const WIDE = { M: 1.28, W: 1.28, N: 1.06, 1: 0.72, I: 0.001, ' ': 0.5 };

// Draw `text` centred on (cx, cy), `height` tall, all in canvas pixels.
// aspect: glyph width over height. weight: stroke over height. outline: px.
function blockText(c, text, cx, cy, height, { aspect = 0.66, weight = 0.18, gap = 0.15, outline = 0 } = {}) {
  const stroke = height * weight, letters = [...String(text).toUpperCase()];
  const widthOf = ch => Math.max(stroke, height * aspect * (WIDE[ch] ?? 1));
  const total = letters.reduce((sum, ch) => sum + widthOf(ch), 0) + gap * height * (letters.length - 1);
  const top = cy - height / 2;
  const pass = (dx, dy, colour) => {
    let x = cx - total / 2;
    c.strokeStyle = colour; c.lineWidth = stroke; c.lineJoin = 'miter'; c.miterLimit = 2.6; c.lineCap = 'square';
    for (const ch of letters) {
      const w = widthOf(ch), innerW = Math.max(w - stroke, 0.0001), innerH = height - stroke;
      const cut = Math.min(0.5, 0.3 * (height * aspect - stroke) / innerW), shapes = glyphs(cut, cut * innerW / innerH)[ch];
      if (shapes) {
        c.save(); c.translate(dx, dy);
        // Square caps overshoot on diagonals: trim every glyph to its own box.
        c.beginPath(); c.rect(x, top, w, height); c.clip();
        for (const path of shapes) {
          c.beginPath();
          path.forEach((point, i) => {
            if (point === 'close') { c.closePath(); return; }
            const px = x + stroke / 2 + point[0] * innerW, py = top + stroke / 2 + (1 - point[1]) * innerH;
            if (i) c.lineTo(px, py); else c.moveTo(px, py);
          });
          c.stroke();
        }
        c.restore();
      }
      x += w + gap * height;
    }
  };
  // Outline first (the glyph dilated), then the twill itself.
  if (outline > 0) for (let k = 0; k < 20; k++) pass(Math.cos(k * Math.PI / 10) * outline, Math.sin(k * Math.PI / 10) * outline, '#00ff00');
  pass(0, 0, '#ffff00');
  return total;
}

// name: across the shoulders. number: chest and back. team: the wordmark.
export function kitPrintTexture({ name = '', number = 0, team = 'RIMRUN' } = {}) {
  const SIZE = 512, canvas = document.createElement('canvas'); canvas.width = SIZE * 2; canvas.height = SIZE;
  const c = canvas.getContext('2d'), metre = SIZE / PRINT.width;
  // Body height (metres) to canvas row; x is measured from the middle of a half.
  const row = y => SIZE - (y - PRINT.bottom) * metre, digits = number > 0 ? String(Math.min(99, number | 0)) : '';
  c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height);
  // Chest: wordmark under the V of the neck, number below it.
  blockText(c, team, SIZE / 2, row(1.308), 0.046 * metre, { aspect: 0.6, weight: 0.2, gap: 0.2, outline: 0.003 * metre });
  if (digits) blockText(c, digits, SIZE / 2, row(1.196), 0.108 * metre, { outline: 0.0052 * metre });
  // Back: name across the shoulders, a number you can read from the cheap seats.
  if (name) blockText(c, name, SIZE * 1.5, row(1.325), 0.044 * metre, { aspect: 0.68, weight: 0.21, gap: 0.2, outline: 0.003 * metre });
  if (digits) blockText(c, digits, SIZE * 1.5, row(1.18), 0.172 * metre, { outline: 0.0066 * metre });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 4; texture.name = `kit-print-${name || number}`;
  return texture;
}
