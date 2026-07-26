import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import { fxUniforms } from '../kit/materials';
import { District, DSIZE, DCELLS, isOccupied } from './districts';

// ---------------------------------------------------------------------------
// FAR FIELD — beyond the room-streaming radius, each district is drawn as a
// handful of big blocks carrying a procedural window grid in the fragment
// shader. One draw call per district, a few hundred triangles, yet it fills
// the world to the horizon so every silhouette implies continuation.
// ---------------------------------------------------------------------------

export const farUniforms = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x160b08) },
  uFogDensity: { value: 0.02 },
  uEncode: fxUniforms.uEncode,
};

export const farMat = new THREE.ShaderMaterial({
  uniforms: farUniforms,
  vertexShader: /* glsl */ `
    varying vec3 vLocal;
    varying vec3 vNormalW;
    varying float vDist;
    varying float vSeed;
    attribute float aSeed;
    void main() {
      vLocal = position;
      vSeed = aSeed;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * world;
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vLocal;
    varying vec3 vNormalW;
    varying float vDist;
    varying float vSeed;
    uniform float uTime;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uEncode;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float hash11(float p) {
      return fract(sin(p * 78.233) * 43758.5453);
    }

    void main() {
      // triplanar-ish: pick the two axes least aligned with the face normal
      vec3 an = abs(vNormalW);
      vec2 uv = an.y > 0.7 ? vLocal.xz : (an.x > 0.5 ? vLocal.zy : vLocal.xy);

      float sg = hash11(vSeed * 3.7);
      // facade style per block: 0 windowed, 1 shuttered/blank, 2 fine lattice
      float style = hash11(vSeed * 9.1);
      // storey height and bay width vary per block so nothing tiles visibly
      vec2 cellSize = vec2(mix(3.0, 5.6, sg), mix(3.4, 5.2, hash11(vSeed * 5.3)));

      vec2 grid = uv / cellSize;
      vec2 cell = floor(grid);
      vec2 f = fract(grid);

      float h = hash21(cell + vSeed * 37.0);
      // whole bays and whole storeys go dark — breaks the checkerboard
      float bayLit = step(0.30, hash21(vec2(cell.x, floor(vSeed * 13.0))));
      float storeyLit = step(0.22, hash21(vec2(floor(cell.y), vSeed * 7.0)));
      float lit = step(0.52, h) * bayLit * storeyLit;

      float win = step(abs(f.x - 0.5), 0.26) * step(abs(f.y - 0.56), 0.28);
      if (style > 0.78) win *= step(0.5, fract(grid.x * 3.0)); // lattice: split panes
      if (style > 0.92) { win = 0.0; lit = 0.0; }              // blank wall / roof

      float flick = 0.8 + 0.2 * sin(uTime * (0.22 + h * 0.6) + h * 51.0);
      vec3 warm = mix(vec3(1.0, 0.44, 0.12), vec3(1.0, 0.76, 0.36), hash21(cell + 11.0));

      // structural relief: floor slabs and corner posts read as architecture
      float slab = smoothstep(0.90, 1.0, f.y) * 0.22;
      float post = smoothstep(0.94, 1.0, abs(f.x - 0.5) * 2.0) * 0.12;

      vec3 base = vec3(0.017, 0.011, 0.009);
      base *= 0.5 + 0.5 * (an.y * 1.15 + an.x * 0.7 + an.z * 0.9);
      base *= 0.75 + 0.5 * sg;

      vec3 col = base
               + warm * win * lit * flick * 0.7
               + vec3(0.13, 0.06, 0.026) * (slab + post);

      // manual exponential-squared fog to match the scene
      float fd = vDist * uFogDensity;
      float fog = 1.0 - exp(-fd * fd);
      col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

      if (uEncode < 0.5) col = pow(col, vec3(2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

/**
 * Build a cheap proxy for one district. Blocks follow the same negative-space
 * rules as the real generator, so a district looks consistent whether you see
 * it as a proxy or fly into it.
 */
export function buildFarDistrict(d: District, seed: number): {
  geo: THREE.BufferGeometry;
  tris: number;
} | null {
  const rng = mulberry32((d.seed ^ 0xfa2) | 0);
  const type = d.def.type;
  if (type === 'void') return null;

  const parts: THREE.BufferGeometry[] = [];
  const push = (w: number, h: number, dep: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, dep);
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const n = g.getAttribute('position').count;
    const s = new Float32Array(n).fill(rng() * 10);
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    parts.push(g);
  };

  const H = DSIZE;
  const cellW = DSIZE / DCELLS;

  if (type === 'shaft') {
    // hollow tower: four wall slabs around a void core
    const t = cellW * 1.9;
    for (const s of [-1, 1]) {
      push(DSIZE, H, t, 0, 0, s * (DSIZE / 2 - t / 2));
      push(t, H, DSIZE - t * 2, s * (DSIZE / 2 - t / 2), 0, 0);
    }
  } else if (type === 'canyon') {
    // two masses split by a street
    const w = DSIZE * 0.34;
    for (const s of [-1, 1]) {
      push(DSIZE, H * 0.95, w, 0, 0, s * (DSIZE / 2 - w / 2));
      // stepped setbacks so the silhouette isn't a plain slab
      push(DSIZE * 0.5, H * 0.5, w * 0.7, (rng() - 0.5) * DSIZE * 0.4, H * 0.4, s * (DSIZE / 2 - w * 0.5));
    }
  } else if (type === 'temple') {
    push(DSIZE * 0.9, H * 0.16, DSIZE * 0.9, 0, -H * 0.42, 0);
    push(DSIZE * 0.78, H * 0.14, DSIZE * 0.78, 0, H * 0.42, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      push(cellW * 1.4, H * 0.72, cellW * 1.4, sx * DSIZE * 0.36, 0, sz * DSIZE * 0.36);
    }
  } else if (type === 'bridgeweb') {
    for (let i = 0; i < 5; i++) {
      const y = (rng() - 0.5) * DSIZE * 0.8;
      if (rng() < 0.5) push(DSIZE * 1.05, 2.6, 5.0, 0, y, (rng() - 0.5) * DSIZE * 0.7);
      else push(5.0, 2.6, DSIZE * 1.05, (rng() - 0.5) * DSIZE * 0.7, y, 0);
    }
    for (let i = 0; i < 2; i++) {
      push(cellW, DSIZE * 0.5, cellW, (rng() - 0.5) * DSIZE * 0.6, (rng() - 0.5) * DSIZE * 0.4, (rng() - 0.5) * DSIZE * 0.6);
    }
  } else {
    // residential / labyrinth / rotating: stacked blocks following occupancy
    const step = 2; // sample every other cell for cheapness
    for (let ix = 0; ix < DCELLS; ix += step) {
      for (let iz = 0; iz < DCELLS; iz += step) {
        // find the vertical run of occupied cells in this column
        let lo = -1;
        let hi = -1;
        for (let iy = 0; iy < DCELLS; iy++) {
          const occ = isOccupied(
            d.dx * DCELLS + ix, d.dy * DCELLS + iy, d.dz * DCELLS + iz, seed
          );
          if (occ) {
            if (lo < 0) lo = iy;
            hi = iy;
          }
        }
        if (lo < 0) continue;
        const h = (hi - lo + 1) * cellW;
        const y = -DSIZE / 2 + (lo * cellW) + h / 2;
        const x = -DSIZE / 2 + (ix + step / 2) * cellW;
        const z = -DSIZE / 2 + (iz + step / 2) * cellW;
        push(cellW * step * 0.96, h * 0.98, cellW * step * 0.96, x, y, z);
      }
    }
  }

  if (parts.length === 0) return null;
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) return null;
  geo.computeBoundingSphere();
  return { geo, tris: (geo.index?.count ?? geo.getAttribute('position').count) / 3 };
}
