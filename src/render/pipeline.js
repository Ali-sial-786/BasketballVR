// How a frame is produced. On a desktop GPU: the hardwood mirrors the scene,
// the frame is rendered in HDR with multisampling, and bright sources bloom
// before tone mapping. In a headset, on touch devices, or with graphics set
// to Standard: one direct forward pass, exactly as before.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Layer for things the floor does not need to mirror (upper bowl, roof steel).
export const NO_MIRROR = 3;

// CC0 surface detail and image-based lighting (see CREDITS.md). Every entry
// fails soft: a missing file leaves the procedural look in place.
export async function loadLook(base = './assets/textures/') {
  const texture = async (file, { color = false, repeat = null } = {}) => {
    try {
      const t = await new THREE.TextureLoader().loadAsync(base + file);
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
      return t;
    } catch { console.warn(`Texture unavailable: ${file}`); return null; }
  };
  const hall = (async () => {
    try { const t = await new HDRLoader().loadAsync(base + 'hall.hdr'); t.mapping = THREE.EquirectangularReflectionMapping; return t; }
    catch { console.warn('Hall HDRI unavailable; using the procedural room.'); return null; }
  })();
  const [hdr, woodColor, woodNormal, woodRough, jerseyNormal] = await Promise.all([hall,
    texture('wood_color.jpg', { color: true, repeat: [18, 30] }), texture('wood_normal.jpg', { repeat: [18, 30] }),
    texture('wood_rough.jpg', { repeat: [18, 30] }), texture('jersey_normal.jpg', { repeat: [1, 1] })]);
  return { hdr, woodColor, woodNormal, woodRough, jerseyNormal };
}

export class Pipeline {
  constructor(renderer, scene, camera) {
    Object.assign(this, { renderer, scene, camera, high: false, composer: null, mirror: null, floorUniforms: null });
    camera.layers.enable(NO_MIRROR);
  }
  // The court surface hands over its plane and the uniforms its material reads.
  attachFloor(floor, uniforms) {
    this.floorUniforms = uniforms;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const mirror = new Reflector(floor.geometry, { textureWidth: Math.max(256, Math.round(size.x * 0.5)), textureHeight: Math.max(256, Math.round(size.y * 0.5)), clipBias: 0.004, multisample: 0 });
    mirror.position.copy(floor.position); mirror.rotation.copy(floor.rotation); mirror.position.y -= 0.002;
    // The mirror itself draws nothing: it exists to render the reflection that
    // the varnished floor then samples.
    mirror.material.colorWrite = false; mirror.material.depthWrite = false; mirror.renderOrder = -10; mirror.name = 'floor-mirror';
    mirror.camera.layers.set(0);
    this.scene.add(mirror); this.mirror = mirror;
    uniforms.tMirror.value = mirror.getRenderTarget().texture; uniforms.uMirrorMatrix.value = mirror.material.uniforms.textureMatrix.value;
    this.apply();
  }
  // The centre-hung screens carry a live telephoto feed from a camera in the
  // stands, rendered small and only every third frame.
  attachFeed(arena) {
    this.arena = arena; this.feedTarget = new THREE.WebGLRenderTarget(448, 252, { type: THREE.HalfFloatType });
    this.feedCamera = new THREE.PerspectiveCamera(15, 16 / 9, 1, 120); this.feedCamera.layers.enable(NO_MIRROR);
    this.feedCamera.position.set(-17.5, 8.2, 6); this.feedLook = new THREE.Vector3(0, 1.4, -2); this.feedTick = 0; this.feedOn = false;
    this.scene.add(this.feedCamera);
  }
  feed(focus) {
    if (!this.arena) return;
    const on = this.high && !this.xr;
    if (on !== this.feedOn) { this.feedOn = on; this.arena.setFeed(on ? this.feedTarget.texture : null); }
    this.feedTick = (this.feedTick + 1) % 3;
    if (!on || this.feedTick) return;
    this.feedLook.lerp(focus, 0.25); this.feedCamera.lookAt(this.feedLook);
    const r = this.renderer, strength = this.floorUniforms.uMirror.value, shadows = r.shadowMap.autoUpdate;
    this.mirror.visible = false; this.floorUniforms.uMirror.value = 0; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.feedTarget); r.render(this.scene, this.feedCamera); r.setRenderTarget(null);
    this.mirror.visible = true; this.floorUniforms.uMirror.value = strength; r.shadowMap.autoUpdate = shadows;
  }
  setQuality(high) { this.high = !!high; this.apply(); }
  apply(xr = false) {
    const on = this.high && !xr;
    if (this.mirror) { this.mirror.visible = on; this.floorUniforms.uMirror.value = on ? 1 : 0; }
    if (on && !this.composer) this.build();
  }
  build() {
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, target);
    composer.setPixelRatio(1); composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Only real light sources clear the threshold: fixtures, LED boards, the
    // shot clock, a hot spot on the varnish.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.35);
    composer.addPass(this.bloom); composer.addPass(new OutputPass());
    this.composer = composer;
  }
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer?.setSize(size.x, size.y);
    this.mirror?.getRenderTarget().setSize(Math.max(256, Math.round(size.x * 0.5)), Math.max(256, Math.round(size.y * 0.5)));
  }
  render(xr = false) {
    if (xr !== this.xr) { this.xr = xr; this.apply(xr); }
    if (this.high && !xr && this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
