import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fxUniforms } from '../kit/materials';

const DECKS = 18;
const SPACING = 24;
const SIZE = 620;

/**
 * Horizontal mist decks: layers of drifting haze stacked through the castle's
 * vertical extent. They follow the camera in XZ and tile in Y, so there is
 * always mist above and below you no matter how far you descend.
 *
 * This is the trick that lets the streaming radius stay small: distant
 * low-detail architecture is read through several layers of moving air, so it
 * dissolves into atmosphere instead of ending in a hard, obviously-cheap edge.
 *
 * All decks live in ONE geometry — a single draw call. Layer count is
 * adjustable via draw range so low-end devices simply render fewer.
 */
export class Mist {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color(0x6d4526) },
    uGlow: fxUniforms.uFogGlow,
    uDensity: { value: 0.5 },
    uEncode: fxUniforms.uEncode,
    uSize: { value: SIZE },
  };

  constructor() {
    const parts: THREE.BufferGeometry[] = [];
    // build from the middle outward so trimming the draw range drops the
    // furthest decks first
    const order: number[] = [];
    for (let i = 0; i < DECKS; i++) {
      order.push(i - Math.floor(DECKS / 2));
    }
    order.sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const k of order) {
      const g = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, k * SPACING, 0);
      const n = g.getAttribute('position').count;
      // per-deck seed so each layer has its own noise phase and drift
      const seed = new Float32Array(n).fill(k * 7.13 + 0.5);
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      parts.push(g);
    }
    const geo = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vWorld;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vSeed;
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec3 uColor;
        uniform vec3 uGlow;
        uniform float uDensity;
        uniform float uEncode;
        uniform float uSize;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 p = vWorld.xz * 0.0075;
          float drift = uTime * 0.012;
          // two octaves is plenty — this runs on every pixel of every deck
          float n = vnoise(p + vec2(drift, drift * 0.6) + vSeed);
          n = n * 0.65 + vnoise(p * 2.7 - vec2(drift * 1.7, drift) + vSeed * 1.7) * 0.35;
          n = smoothstep(0.34, 0.92, n);

          float dist = length(vWorld - uCam);
          // mist must not fog up the architecture you are flying through, so
          // it holds off much further out than before
          float near = smoothstep(30.0, 130.0, dist);
          // and fade out past the deck's own extent so edges never show
          float far = 1.0 - smoothstep(uSize * 0.22, uSize * 0.46, dist);
          // decks far above/below you thin out
          float band = 1.0 - smoothstep(30.0, 190.0, abs(vWorld.y - uCam.y));

          float a = n * uDensity * near * far * (0.35 + band * 0.65) * 0.34;
          if (a < 0.003) discard;

          // mist picks up the distant glow, so it reads as lit air
          vec3 col = mix(uColor, uGlow, smoothstep(60.0, 300.0, dist) * 0.75);
          if (uEncode < 0.5) col = pow(col, vec3(2.2));
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.55));
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** Fewer decks on weaker hardware. */
  setLayers(n: number): void {
    const per = 6; // indices per quad
    (this.mesh.geometry as THREE.BufferGeometry).setDrawRange(0, Math.max(0, Math.min(n, DECKS)) * per);
  }

  update(t: number, cam: THREE.Vector3, color: THREE.Color, density: number): void {
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(cam);
    this.uniforms.uColor.value.copy(color);
    this.uniforms.uDensity.value = density;
    // follow in XZ, tile in Y so the decks never run out beneath you
    this.mesh.position.set(cam.x, Math.floor(cam.y / SPACING) * SPACING, cam.z);
  }
}
