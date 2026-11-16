// Crease VR's session lifecycle, adapted to a VR-only basketball court.
import { CONFIG } from '../config.js';
export class XRSessionManager {
  constructor(renderer, { onStart, onEnd, onStatus, onVisibility, onReset }) {
    Object.assign(this, { renderer, onStart, onEnd, onStatus, onVisibility, onReset });
    this.session = null; this.pending = false;
    renderer.xr.addEventListener('sessionend', () => { this.session = null; this.pending = false; this.onEnd(); });
  }
  async supported() { try { return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { return false; } }
  async start() {
    if (this.session || this.pending) return;
    this.pending = true;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });
      this.session = session;
      this.renderer.xr.setReferenceSpaceType('local-floor');
      this.renderer.xr.setFramebufferScaleFactor(CONFIG.xr.framebufferScale);
      await this.renderer.xr.setSession(session);
      this.renderer.xr.setFoveation(CONFIG.xr.foveation);
      const rate = Array.from(session.supportedFrameRates || []).sort((a, b) => b - a).find(r => r <= CONFIG.xr.maxFrameRate);
      if (rate && session.updateTargetFrameRate) await session.updateTargetFrameRate(rate).catch(() => {});
      this.renderer.xr.getReferenceSpace()?.addEventListener('reset', () => this.onReset());
      session.addEventListener('visibilitychange', () => this.onVisibility(session.visibilityState));
      this.pending = false; this.onStart();
    } catch (error) {
      this.onStatus(`Could not enter VR: ${error.message || error}`);
      const s = this.session; this.session = null; this.pending = false; if (s) await s.end().catch(() => {});
    }
  }
  end() { return this.session?.end().catch(() => {}); }
}
