import * as THREE from 'three';

export const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export type FrameCallback = (dt: number, t: number) => void;

/**
 * Owns renderer / scene / camera / lights / fog and the main loop.
 * Rendering itself can be overridden (post-processing chain).
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly fog: THREE.FogExp2;
  readonly hemi: THREE.HemisphereLight;
  readonly dir: THREE.DirectionalLight;

  time = 0;
  private clock = new THREE.Clock();
  private callbacks: FrameCallback[] = [];
  private dprCap = 2;
  private renderScale = 1;

  /** Replaceable render function (post chain hooks in here). */
  renderFn: () => void;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !IS_TOUCH,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080404);
    this.fog = new THREE.FogExp2(0x2a1410, 0.03);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.08,
      900
    );
    this.camera.position.set(0, 0, 10);

    // Lighting: warm lantern-dominated. The hemisphere carries a strong amber
    // bounce from the lantern-sea below so nothing ever reads as pure black;
    // the directional is a cool counter-light for shape separation.
    this.hemi = new THREE.HemisphereLight(0x4a3a5e, 0x6b3a16, 5.6);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0x9aa0cc, 2.2);
    this.dir.position.set(0.35, 1, 0.18);
    this.scene.add(this.dir);

    this.renderFn = () => this.renderer.render(this.scene, this.camera);

    window.addEventListener('resize', () => this.applySize());
    this.applySize();
  }

  setRenderScale(scale: number, dprCap: number): void {
    this.renderScale = scale;
    this.dprCap = dprCap;
    this.applySize();
  }

  private applySize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize.forEach((f) => f(w, h, dpr));
  }

  onResize: ((w: number, h: number, dpr: number) => void)[] = [];

  onFrame(cb: FrameCallback): void {
    this.callbacks.push(cb);
  }

  start(): void {
    this.clock.getDelta();
    this.renderer.info.autoReset = false;
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.time += dt;
      for (const cb of this.callbacks) cb(dt, this.time);
      this.renderer.info.reset();
      this.renderFn();
    });
  }
}
