import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import { fxUniforms, lightUniforms } from '../kit/materials';
import { District, DSIZE, DCELLS, isOccupied } from './districts';

// ---------------------------------------------------------------------------
// FAR FIELD — beyond the room-streaming radius, each district is drawn as a
// handful of big blocks carrying a procedural window grid in the fragment
// shader. One draw call per district, a few hundred triangles, yet it fills
// the world to the horizon so every silhouette implies continuation.
// ---------------------------------------------------------------------------

export const farUniforms = {
  uTime: { value: 0 },
  uFogColor: fxUniforms.uFogColor,
  uFogGlow: fxUniforms.uFogGlow,
  uFogDensity: { value: 0.02 },
  uEncode: fxUniforms.uEncode,
  // per-mesh assembly window, pushed in onBeforeRender (same trick as cells):
  // uDir +1 = blocks fly in and settle, -1 = they retract back into the haze
  uT0: { value: -1e9 },
  uT1: { value: 1e9 },
  uDir: { value: 1 },
  uOrigin: { value: new THREE.Vector3() },
  // distant districts are lit by exactly the same environment as the real
  // architecture, or they read as flat black cut-outs against a glowing sky
  uSky: lightUniforms.uSky,
  uGround: lightUniforms.uGround,
  uDirColor: lightUniforms.uDirColor,
  uDirDir: lightUniforms.uDirDir,
  uAmbient: lightUniforms.uAmbient,
};

export const farMat = new THREE.ShaderMaterial({
  uniforms: farUniforms,
  vertexShader: /* glsl */ `
    varying vec3 vLocal;
    varying vec3 vNormalW;
    varying float vDist;
    varying float vSeed;
    varying vec3 vTint;
    varying float vLit;
    varying float vBuild;
    attribute float aSeed;
    attribute vec3 aTint;
    attribute float aLit;
    attribute vec3 aCent;
    uniform float uTime;
    uniform float uT0;
    uniform float uT1;
    uniform float uDir;
    uniform vec3 uOrigin;
    void main() {
      vLocal = position;
      vSeed = aSeed;
      vTint = aTint;
      vLit = aLit;
      // SEQUENTIAL (DE)CONSTRUCTION — blocks never scale away to nothing:
      // they drift back RIGIDLY while dissolving into the haze (see fragment),
      // so a retracting district reads as weather swallowing it, not deletion.
      float bh = fract(sin(aSeed * 78.233) * 43758.5453);
      float span = max(uT1 - uT0, 0.001);
      float t = clamp((uTime - uT0) / span, 0.0, 1.0);
      float w = clamp(t * 1.6 - bh * 0.6, 0.0, 1.0);
      w = w * w * (3.0 - 2.0 * w);
      float s = mix(1.0 - w, w, step(0.0, uDir));
      vBuild = s;
      vec3 recede = aCent - uOrigin;
      recede /= max(length(recede), 0.001);
      vec3 p = position + (recede * (26.0 + bh * 44.0) + vec3(0.0, -5.0, 0.0)) * (1.0 - s);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(p, 1.0);
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
    varying vec3 vTint;
    varying float vLit;
    varying float vBuild;
    uniform float uTime;
    uniform vec3 uFogColor;
    uniform vec3 uFogGlow;
    uniform float uFogDensity;
    uniform float uEncode;
    uniform vec3 uSky;
    uniform vec3 uGround;
    uniform vec3 uDirColor;
    uniform vec3 uDirDir;
    uniform vec3 uAmbient;

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
      // whole bays and whole storeys go dark — breaks the checkerboard.
      // vLit comes from the district, so a lantern ocean blazes while a
      // temple quarter stays sombre — the proxy matches what is really there.
      float bayLit = step(0.30, hash21(vec2(cell.x, floor(vSeed * 13.0))));
      float storeyLit = step(0.22, hash21(vec2(floor(cell.y), vSeed * 7.0)));
      float lit = step(1.0 - vLit, h) * bayLit * storeyLit;

      float win = step(abs(f.x - 0.5), 0.26) * step(abs(f.y - 0.56), 0.28);
      if (style > 0.78) win *= step(0.5, fract(grid.x * 3.0)); // lattice: split panes

      float flick = 0.8 + 0.2 * sin(uTime * (0.22 + h * 0.6) + h * 51.0);
      vec3 warm = mix(vec3(1.0, 0.44, 0.12), vec3(1.0, 0.76, 0.36), hash21(cell + 11.0));

      // albedo comes from the district's own palette, so the far field is the
      // same material family as the architecture you can actually reach
      vec3 albedo = vTint * (0.86 + 0.28 * sg);

      // ----------------------------------------------------------------
      // PROCEDURAL SURFACE
      // Every face carries exposed timber framing, storey bands and grain,
      // so distant blocks read as panelled buildings instead of blank slabs.
      // All of it is a handful of ALU ops — no textures, no extra draws.
      // ----------------------------------------------------------------
      float postLine = smoothstep(0.84, 1.0, abs(f.x - 0.5) * 2.0);   // corner posts
      float railLine = smoothstep(0.90, 1.0, abs(f.y - 0.5) * 2.0);   // floor rails
      float midRail  = smoothstep(0.055, 0.0, abs(f.y - 0.34));       // waist rail
      float frame = max(max(postLine, railLine), midRail * 0.7);
      albedo = mix(albedo, vec3(0.16, 0.11, 0.07), frame * 0.85);

      // board grain and panel-to-panel colour variation
      float grain = hash21(floor(grid * vec2(1.0, 4.0)) + vSeed) * 0.16
                  + hash21(floor(grid * 9.0)) * 0.07;
      albedo *= 0.86 + grain;

      // roof faces get tile courses instead of wall framing
      float tileRow = step(0.5, fract(uv.y * 0.42)) * 0.16 + step(0.5, fract(uv.x * 0.9)) * 0.05;
      albedo = mix(albedo, vec3(0.15, 0.10, 0.07) * (1.0 + tileRow), an.y * 0.75);

      vec3 n = normalize(vNormalW);
      vec3 light = mix(uGround, uSky, 0.5 + 0.5 * n.y);
      light += uDirColor * max(dot(n, uDirDir) * 0.85 + 0.15, 0.0);
      light += uAmbient;

      vec3 col = albedo * light + warm * win * lit * flick * 1.5;

      // aerial perspective: the deep distance becomes glowing gold air and
      // actively emits, so the castle burns all the way to the horizon
      float fd = vDist * uFogDensity;
      float fog = 1.0 - exp(-fd * fd);
      float far = smoothstep(85.0, 330.0, vDist);
      col = mix(col, mix(uFogColor, uFogGlow, far), clamp(fog, 0.0, 1.0));
      col += uFogGlow * 0.16 * far * far;

      // (de)constructing blocks dissolve into that same haze — they become
      // atmosphere, so their removal is invisible even before the detailed
      // district has grown in to replace them
      col = mix(mix(uFogColor, uFogGlow, max(far, 0.4)), col, vBuild);

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

  // each district contributes its own material palette and window density,
  // so proxies read as a continuation of that district rather than generic mass
  const PALETTE: Record<string, [number, number, number, number]> = {
    residential: [0.50, 0.38, 0.26, 0.52],
    labyrinth: [0.46, 0.34, 0.23, 0.60],
    canyon: [0.48, 0.37, 0.27, 0.48],
    shaft: [0.44, 0.36, 0.30, 0.55],
    temple: [0.64, 0.57, 0.45, 0.34],
    rotating: [0.49, 0.39, 0.31, 0.46],
    bridgeweb: [0.40, 0.32, 0.25, 0.40],
    lanternOcean: [0.53, 0.37, 0.25, 0.82],
    hangingGarden: [0.41, 0.47, 0.34, 0.32],
    cathedralVoid: [0.38, 0.31, 0.26, 0.36],
    void: [0.38, 0.31, 0.26, 0.30],
  };
  const pal = PALETTE[type] ?? PALETTE.residential;

  const parts: THREE.BufferGeometry[] = [];
  const push = (w: number, h: number, dep: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, dep);
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const n = g.getAttribute('position').count;
    const s = new Float32Array(n).fill(rng() * 10);
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    const tint = new Float32Array(n * 3);
    const cent = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      tint[i * 3] = pal[0];
      tint[i * 3 + 1] = pal[1];
      tint[i * 3 + 2] = pal[2];
      cent[i * 3] = x;
      cent[i * 3 + 1] = y;
      cent[i * 3 + 2] = z;
    }
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    g.setAttribute('aCent', new THREE.BufferAttribute(cent, 3));
    g.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(n).fill(pal[3]), 1));
    parts.push(g);
  };

  /**
   * Crown a proxy block so distant masses read as ROOFED BUILDINGS rather than
   * boxes: a stepped eave slab, a tapered upper storey and a ridge.
   */
  const roof = (w: number, dep: number, x: number, yTop: number, z: number) => {
    push(w * 1.24, 1.6, dep * 1.24, x, yTop + 0.8, z);            // deep eaves
    push(w * 0.82, Math.min(w, dep) * 0.30, dep * 0.82, x, yTop + 2.4, z); // slope mass
    push(w * 0.42, Math.min(w, dep) * 0.20, dep * 0.42, x, yTop + 4.0, z); // upper step
    push(w * 0.30, 1.1, dep * 1.06, x, yTop + 4.9, z);            // ridge
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
    // two masses split by a street, with roofed setbacks breaking the slab
    const w = DSIZE * 0.34;
    for (const s of [-1, 1]) {
      push(DSIZE, H * 0.95, w, 0, 0, s * (DSIZE / 2 - w / 2));
      const sx = (rng() - 0.5) * DSIZE * 0.4;
      push(DSIZE * 0.5, H * 0.5, w * 0.7, sx, H * 0.4, s * (DSIZE / 2 - w * 0.5));
      roof(DSIZE * 0.5, w * 0.7, sx, H * 0.65, s * (DSIZE / 2 - w * 0.5));
      // protruding balcony decks catch the eye and break the silhouette
      for (let i = 0; i < 3; i++) {
        push(DSIZE * 0.3, 1.2, w * 1.5, (rng() - 0.5) * DSIZE * 0.6, (rng() - 0.5) * H * 0.7,
          s * (DSIZE / 2 - w * 0.2));
      }
    }
  } else if (type === 'temple') {
    push(DSIZE * 0.9, H * 0.16, DSIZE * 0.9, 0, -H * 0.42, 0);
    push(DSIZE * 0.78, H * 0.14, DSIZE * 0.78, 0, H * 0.42, 0);
    roof(DSIZE * 0.78, DSIZE * 0.78, 0, H * 0.49, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      push(cellW * 1.4, H * 0.72, cellW * 1.4, sx * DSIZE * 0.36, 0, sz * DSIZE * 0.36);
      roof(cellW * 1.4, cellW * 1.4, sx * DSIZE * 0.36, H * 0.36, sz * DSIZE * 0.36);
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
        const bw = cellW * step * 0.96;
        push(bw, h * 0.98, bw, x, y, z);
        // every column is crowned, so a distant district reads as a roofscape
        roof(bw, bw, x, y + h / 2, z);
        // occasional projecting balcony storey
        if (rng() < 0.45) {
          push(bw * 1.25, 1.4, bw * 1.25, x, y + (rng() - 0.5) * h * 0.6, z);
        }
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
