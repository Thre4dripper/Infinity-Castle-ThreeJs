import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fxUniforms } from '../kit/materials';
import type { Engine } from '../core/engine';

/** Optional bloom chain — enabled only on the top quality tier. */
export class Post {
  private composer: EffectComposer;
  private engine: Engine;
  private baseRender: () => void;
  enabled = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.baseRender = engine.renderFn;
    this.composer = new EffectComposer(engine.renderer);
    // a custom target starts at CSS-pixel size — bring it to the canvas's
    // real resolution immediately, not just on the next window resize
    this.composer.setPixelRatio(engine.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(engine.scene, engine.camera));
    // bloom is low-frequency by nature: running its blur chain at HALF
    // resolution is visually identical and 4× cheaper — the difference
    // between silk and slideshow on 4K/retina screens
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2)),
      0.5, // strength
      0.5, // radius
      0.6 // threshold
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    engine.onResize.push((w, h, dpr) => {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(dpr);
    });
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    // custom shaders gamma-encode themselves only on the direct path;
    // on the composer path the OutputPass does it
    fxUniforms.uEncode.value = on ? 0 : 1;
    this.engine.renderFn = on ? () => this.composer.render() : this.baseRender;
  }
}
