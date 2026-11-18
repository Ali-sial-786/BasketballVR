import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The kit shader paints hems, panels and lettering at fixed bind-space
// addresses, so the tailoring in tools/rebuild_anatomy.py must keep to them.
const meta = JSON.parse(fs.readFileSync(new URL('../public/assets/models/athlete.json', import.meta.url)));
const bin = fs.readFileSync(new URL('../public/assets/models/athlete.bin', import.meta.url));
function part(name) {
  const p = meta.lods[0].parts.find(q => q.name === name);
  const pos = new Float32Array(bin.buffer, bin.byteOffset + p.pos, p.vCount * 3);
  return { pos, count: p.vCount };
}
const extent = (p, axis, keep = () => true) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.count; i++) { if (!keep(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2])) continue; lo = Math.min(lo, p.pos[i * 3 + axis]); hi = Math.max(hi, p.pos[i * 3 + axis]); } return [lo, hi]; };

test('the jersey hangs to the hip and the shorts end above the knee', () => {
  const jersey = part('Basketball_Jersey'), shorts = part('Basketball_Shorts');
  assert.ok(Math.abs(extent(jersey, 1)[0] - 0.915) < 0.008, 'jersey hem');
  assert.ok(Math.abs(extent(shorts, 1)[0] - 0.592) < 0.008, 'shorts hem');
  assert.ok(extent(shorts, 1)[0] > meta.joints.kneeL[1] + 0.03, 'the knee stays clear');
});

test('the jersey is worn outside the shorts and both are cut loose', () => {
  const jersey = part('Basketball_Jersey'), shorts = part('Basketball_Shorts'), body = part('Athlete_Body');
  const band = (x, y) => y > 0.93 && y < 1.0;
  assert.ok(extent(jersey, 0, band)[1] > extent(shorts, 0, band)[1] + 0.004, 'side');
  assert.ok(extent(jersey, 2, band)[1] > extent(shorts, 2, band)[1] + 0.004, 'front');
  assert.ok(extent(jersey, 2, band)[0] < extent(shorts, 2, band)[0] - 0.004, 'back');
  // At the leg opening the shorts stand well off the thigh.
  const thigh = (x, y) => x > 0 && y > 0.6 && y < 0.64;
  assert.ok(extent(shorts, 0, thigh)[1] > extent(body, 0, (x, y, z) => thigh(x, y) && x < 0.3)[1] + 0.03);
});

test('block lettering covers every numeral and the roster without a font', async () => {
  const calls = { stroke: 0 };
  const context = new Proxy({ stroke: () => { calls.stroke++; } }, { get: (target, key) => target[key] ?? (() => {}), set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const { kitPrintTexture, PRINT } = await import('../src/render/kitprint.js');
  for (const [name, number] of [['YOU', 1], ['JAX', 7], ['NOVA', 23], ['ACE', 11], ['BDFGHKLPSTWZ', 45], ['IMQ', 6890]]) {
    const before = calls.stroke; kitPrintTexture({ name, number });
    assert.ok(calls.stroke > before + 40, name);
  }
  // The print covers the chest between the hem and the neckline.
  assert.ok(PRINT.bottom > 0.95 && PRINT.bottom + PRINT.height < 1.45 && PRINT.width < 0.4);
});
