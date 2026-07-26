import * as THREE from 'three';
import { fxUniforms } from '../kit/materials';

const MAX_MOTES = 1600;

/**
 * A single Points cloud of drifting dust/ember motes, fully GPU-animated and
 * wrapped in a box around the camera — zero per-frame CPU cost.
 */
export class Motes {
  readonly points: THREE.Points;
  private uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: 46 },
    uPx: { value: 1 },
    uFog: { value: 0.03 },
    uEncode: fxUniforms.uEncode,
  };

  constructor() {
    const pos = new Float32Array(MAX_MOTES * 3); // unused, required attribute
    const seed = new Float32Array(MAX_MOTES * 3);
    for (let i = 0; i < MAX_MOTES * 3; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uBox, uPx;
        uniform vec3 uCam;
        varying float vA;
        varying vec3 vCol;
        void main() {
          vec3 drift = vec3(
            sin(uTime * 0.11 + aSeed.x * 21.0) * 2.4,
            -uTime * (0.28 + aSeed.y * 0.6),
            cos(uTime * 0.09 + aSeed.z * 17.0) * 2.4
          );
          vec3 p = uCam + mod(aSeed * uBox + drift - uCam, vec3(uBox)) - 0.5 * uBox;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = max(length(mv.xyz), 0.001);
          gl_PointSize = min((1.1 + aSeed.x * 2.2) * uPx * (26.0 / d), 14.0);
          // fade near camera and into the distance
          vA = smoothstep(1.2, 3.5, d) * smoothstep(uBox * 0.52, uBox * 0.30, d);
          vCol = mix(vec3(1.0, 0.62, 0.30), vec3(0.55, 0.62, 1.0), step(0.86, aSeed.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying vec3 vCol;
        uniform float uEncode;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float a = pow(max(1.0 - r, 0.0), 2.0) * vA * 0.5;
          vec3 col = vCol;
          if (uEncode < 0.5) col = pow(col, vec3(2.2));
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setCount(n: number): void {
    (this.points.geometry as THREE.BufferGeometry).setDrawRange(0, Math.min(n, MAX_MOTES));
  }

  update(t: number, camPos: THREE.Vector3, pixelRatio: number): void {
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uPx.value = pixelRatio;
  }
}
