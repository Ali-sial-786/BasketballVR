export const DEFAULT_SETTINGS = { difficulty: 'park', dominant: 'right', locomotion: 'smooth', turn: 'snap', autoDribble: true, sound: true, tutorial: true, camera: 'first', graphics: 'auto' };
export function loadSettings(storage) {
  try { storage ??= globalThis.localStorage; const s = JSON.parse(storage?.getItem('rimrun.settings') || '{}');
    return { difficulty: ['rookie', 'park', 'allstar'].includes(s.difficulty) ? s.difficulty : 'park',
      dominant: s.dominant === 'left' ? 'left' : 'right', locomotion: s.locomotion === 'blink' ? 'blink' : 'smooth',
      turn: ['snap', 'smooth', 'off'].includes(s.turn) ? s.turn : 'snap',
      autoDribble: s.autoDribble !== false, sound: s.sound !== false, tutorial: s.tutorial !== false,
      camera: s.camera === 'third' ? 'third' : 'first', graphics: ['high', 'standard'].includes(s.graphics) ? s.graphics : 'auto' };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings, storage) { try { storage ??= globalThis.localStorage; storage?.setItem('rimrun.settings', JSON.stringify(settings)); } catch { /* Private browsing is playable. */ } }
export function loadBest(storage) { try { storage ??= globalThis.localStorage; return Math.max(0, Number(storage?.getItem('rimrun.best3pt')) || 0); } catch { return 0; } }
export function saveBest(score, storage) { const best = Math.max(score, loadBest(storage)); try { storage ??= globalThis.localStorage; storage?.setItem('rimrun.best3pt', String(best)); } catch {} return best; }
