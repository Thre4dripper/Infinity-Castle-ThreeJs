import * as THREE from 'three';
import { getArtAtlas, ART_TILES } from './artAtlas';


// ---------------------------------------------------------------------------
// Palette (hex). The scene is dark wood + warm lantern amber. Every opaque
// surface shares ONE lambert material (vertex colors); every glowing surface
// shares ONE basic material. This keeps rooms at ~2 draw calls each.
// ---------------------------------------------------------------------------
export const C = {
  WOOD_D: 0x402c15,
  WOOD: 0x664923,
  WOOD_L: 0x8a6531,
  WOOD_PALE: 0xa88a52,
  LACQ: 0x8f2a12,
  LACQ_B: 0x963117,
  PLASTER: 0xa8956d,
  PLASTER_D: 0x6f6448,
  TATAMI: 0x6e7c46,
  TATAMI_D: 0x4a5630,
  TRIM_DARK: 0x2b1d0f,
  STONE: 0x5a545c,
  METAL: 0xbfa04a,
  ROPE: 0x6b5636,
  PAPER: 0xd0a463,
  PAPER_DIM: 0x8f7448,
  LANT_TOP: 0xffbe74,
  LANT: 0xff8f3c,
  LANT_DEEP: 0xcf4a16,
  /** minority lantern tints — jade and indigo among the amber */
  LANT_JADE: 0x74d89a,
  LANT_JADE_DEEP: 0x2f8a58,
  LANT_BLUE: 0x6fa8e8,
  LANT_BLUE_DEEP: 0x2a5aa8,
  GLOW: 0xffa050,
  GLOW_JADE: 0x66e0a0,
  GLOW_BLUE: 0x66a8ff,
  WINDOW: 0xd98e3f,
} as const;

/** Shared FX flag: 1 = renderer draws straight to canvas (apply gamma in our
 * custom shaders), 0 = bloom composer path (OutputPass handles encoding). */
export const fxUniforms = {
  uEncode: { value: 1 },
  uFogColor: { value: new THREE.Color(0x4a2a16) },
  /** what distance fades TOWARD — the burning heart of the castle */
  uFogGlow: { value: new THREE.Color(0xe0a355) },
  uFogDensity: { value: 0.02 },
  uTime: { value: 0 },
  /** where new architecture streams in from — the player's position */
  uBuildOrigin: { value: new THREE.Vector3() },
};

/**
 * Lighting. The castle is lit by its environment — an amber bounce from the
 * lantern sea below and cooler light from the heights — but the key light
 * keeps a real falloff. Contrast is what gives eaves, brackets and lattice
 * their form; flatten it and everything collapses into featureless boxes.
 */
export const lightUniforms = {
  /** cool light from the heights */
  uSky: { value: new THREE.Color(1.05, 1.00, 1.32) },
  /** the lantern sea below — the dominant bounce in the whole castle */
  uGround: { value: new THREE.Color(2.25, 1.74, 1.20) },
  uDirColor: { value: new THREE.Color(0.85, 0.85, 1.05) },
  uDirDir: { value: new THREE.Vector3(0.35, 1.0, 0.18).normalize() },
  /** small irradiance floor only — enough to keep shadow sides readable */
  uAmbient: { value: new THREE.Color(0.30, 0.22, 0.16) },
};

// ---------------------------------------------------------------------------
// SEQUENTIAL ASSEMBLY
// Every part carries its own centroid (aCent) and an assembly order (aBuild).
// A piece collapses to a single point before its turn, then drops into place —
// so a building visibly writes itself into existence bottom-up, and unwrites
// itself when it leaves. uT0/uT1 are pushed per-mesh in onBeforeRender.
// ---------------------------------------------------------------------------
const BUILD_CHUNK = /* glsl */ `
  attribute vec3 aCent;
  attribute float aBuild;
  uniform float uTime;
  uniform float uT0;
  uniform float uT1;

  vec3 assemble(vec3 pos) {
    float inP  = clamp((uTime - uT0) * 1.05 - aBuild * 1.15, 0.0, 1.0);
    inP = inP * inP * (3.0 - 2.0 * inP);
    float outP = 1.0 - clamp((uTime - uT1) * 1.9 - (1.0 - aBuild) * 0.9, 0.0, 1.0);
    outP = outP * outP * (3.0 - 2.0 * outP);
    float s = min(inP, outP);
    // pieces fall in from above and shrink away upward on the way out
    vec3 from = aCent + vec3(0.0, 7.0, 0.0);
    return mix(from, pos, s);
  }
`;

/** Distance does not go dark — it goes hot. Classic aerial perspective. */
const FOG_CHUNK = /* glsl */ `
  uniform vec3 uFogColor;
  uniform vec3 uFogGlow;
  uniform float uFogDensity;

  vec3 aerial(vec3 col, float dist) {
    float fd = dist * uFogDensity;
    float fog = 1.0 - exp(-fd * fd);
    float far = smoothstep(85.0, 330.0, dist);
    // the hot glow only takes over far out, so nearby wood keeps its own colour
    vec3 hazeCol = mix(uFogColor, uFogGlow, far);
    vec3 outc = mix(col, hazeCol, clamp(fog, 0.0, 1.0));
    // and the deep distance actively EMITS — the castle burns to the horizon
    outc += uFogGlow * 0.16 * far * far;
    return outc;
  }
`;

/** All opaque, lit geometry — one shared material, one draw path. */
export const opaqueMat = new THREE.ShaderMaterial({
  uniforms: {
    ...fxUniforms,
    ...lightUniforms,
    uT0: { value: -1e9 },
    uT1: { value: 1e9 },
    uArt: { value: getArtAtlas() },
    uArtTiles: { value: ART_TILES },
  },
  vertexShader: /* glsl */ `
    ${BUILD_CHUNK}
    attribute vec3 color;
    attribute float aArt;
    varying vec3 vColor;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    varying float vDist;
    varying vec2 vUv;
    varying float vArt;
    void main() {
      vColor = color;
      vArt = aArt;
      vUv = uv;
      vec3 p = assemble(position);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      vec4 mv = viewMatrix * world;
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    ${FOG_CHUNK}
    uniform vec3 uSky;
    uniform vec3 uGround;
    uniform vec3 uDirColor;
    uniform vec3 uDirDir;
    uniform vec3 uAmbient;
    uniform float uEncode;
    uniform sampler2D uArt;
    uniform float uArtTiles;
    varying vec3 vColor;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    varying float vDist;
    varying vec2 vUv;
    varying float vArt;

    float h21(vec2 p) {
      p = fract(p * vec2(127.31, 311.7));
      p += dot(p, p + 34.7);
      return fract(p.x * p.y);
    }

    void main() {
      vec3 albedo = vColor;
      // painted panels sample a motif from the art atlas instead of a flat colour.
      // Scaled into the same albedo range as the palette, or pale motifs clip
      // to white once the lighting is applied.
      if (vArt >= 0.0) {
        vec2 tile = vec2(mod(vArt, uArtTiles), floor(vArt / uArtTiles));
        vec2 uv = (clamp(vUv, 0.004, 0.996) + tile) / uArtTiles;
        albedo = texture2D(uArt, uv).rgb * 0.46;
      } else {
        // Micro surface break-up. Large flat faces — plaster panels, slabs,
        // roof planes — otherwise read as moulded plastic. Two hashes in
        // world space give board grain and weathering for almost nothing.
        vec3 an = abs(normalize(vNormalW));
        vec2 sp = an.y > 0.6 ? vWorld.xz : (an.x > 0.5 ? vWorld.zy : vWorld.xy);
        float grain = h21(floor(sp * 5.0)) * 0.13 + h21(floor(sp * 21.0)) * 0.06;
        float weather = h21(floor(sp * 0.7)) * 0.12;
        albedo *= 0.88 + grain + weather * 0.5;
      }
      vec3 n = normalize(vNormalW);
      // hemisphere GI: warm bounce from below, cool from above
      vec3 light = mix(uGround, uSky, 0.5 + 0.5 * n.y);
      // key light keeps a real falloff — only lightly wrapped, so faces still
      // read as distinct planes instead of blending into one flat mass
      float ndl = dot(n, uDirDir);
      light += uDirColor * max(ndl * 0.85 + 0.15, 0.0);
      light += uAmbient;
      vec3 col = aerial(albedo * light, vDist);
      if (uEncode < 0.5) col = pow(col, vec3(2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

/** All self-lit geometry (paper, lantern bodies). Fresnel falloff keeps paper
 * lanterns reading as rounded volumes rather than flat cut-outs. */
export const emissiveMat = new THREE.ShaderMaterial({
  uniforms: {
    ...fxUniforms,
    uT0: { value: -1e9 },
    uT1: { value: 1e9 },
  },
  vertexShader: /* glsl */ `
    ${BUILD_CHUNK}
    attribute vec3 color;
    attribute float aArt;
    varying vec3 vColor;
    varying vec3 vN;
    varying vec3 vV;
    varying float vDist;
    varying float vFlick;
    void main() {
      vColor = color;
      // PULSATING LIGHT — a random minority of the bright sources (lanterns,
      // coals) breathe slowly, and everything lit carries a faint candle
      // tremor. Gated on brightness so paper walls stay calm.
      float bright = max(color.r, max(color.g, color.b));
      float gate = smoothstep(1.2, 2.0, bright) * step(fract(aBuild * 9.73), 0.45);
      float ph = aBuild * 271.3;
      vFlick = 1.0
        + gate * 0.26 * sin(uTime * (0.7 + fract(aBuild * 5.31) * 1.3) + ph)
        + smoothstep(0.5, 1.2, bright) * 0.05 * sin(uTime * 6.3 + ph * 2.7);
      vec3 p = assemble(position);
      vN = normalMatrix * normal;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vV = -mv.xyz;
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    ${FOG_CHUNK}
    varying vec3 vColor;
    varying vec3 vN;
    varying vec3 vV;
    varying float vDist;
    varying float vFlick;
    uniform float uEncode;
    void main() {
      vec3 n = normalize(vN);
      vec3 v = normalize(vV);
      float ndv = abs(dot(n, v));
      // paper falls off at grazing angles; lantern bodies carry an intensity
      // above 1 in their vertex colour so they stay genuinely hot
      vec3 col = vColor * (0.30 + 0.46 * pow(ndv, 0.7)) * vFlick;
      col = aerial(col, vDist);
      if (uEncode < 0.5) col = pow(col, vec3(2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

/**
 * Drive a mesh's assembly window. ShaderMaterial honours uniformsNeedUpdate on
 * every draw, so one shared material can still animate each mesh separately.
 */
export function bindAssembly(mesh: THREE.Mesh, times: { t0: number; t1: number }): void {
  mesh.onBeforeRender = () => {
    const m = mesh.material as THREE.ShaderMaterial;
    m.uniforms.uT0.value = times.t0;
    m.uniforms.uT1.value = times.t1;
    m.uniformsNeedUpdate = true;
  };
}


// ---------------------------------------------------------------------------
// Lantern glow points — one shared additive shader material; each room owns a
// tiny Points geometry parented to its root so glows travel with the room.
// ---------------------------------------------------------------------------
export const glowUniforms = {
  uTime: { value: 0 },
  uPulse: { value: 0 },
  uFog: { value: 0.03 },
  uPx: { value: 1 },
  uEncode: fxUniforms.uEncode,
};

export const glowMat = new THREE.ShaderMaterial({
  uniforms: glowUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aPhase;
    uniform float uTime, uPulse, uFog, uPx;
    varying vec3 vColor;
    varying float vFade;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float d = max(length(mv.xyz), 0.001);
      float flicker = 0.84 + 0.16 * sin(uTime * 2.3 + aPhase * 17.0) * sin(uTime * 5.9 + aPhase * 29.0);
      // a random minority of haloes breathe deeply, in and out of the dark
      float breathe = 1.0 + step(fract(aPhase * 7.31), 0.4)
        * 0.45 * sin(uTime * (0.55 + fract(aPhase * 3.7) * 1.2) + aPhase * 40.0);
      flicker *= breathe;
      float pulse = 1.0 + uPulse * 1.7;
      gl_PointSize = min(aSize * uPx * flicker * pulse * (250.0 / d), 110.0);
      vColor = aColor;
      // lights pierce fog further than surfaces (0.55×) but never blow out up close
      vFade = exp(-d * uFog * 0.55) * flicker * (1.0 + uPulse * 0.8) * smoothstep(0.8, 3.2, d);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vFade;
    uniform float uEncode;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r = length(c) * 2.0;
      float a = pow(max(1.0 - r, 0.0), 2.6);
      vec3 col = vColor * vFade * 0.55;
      // authored in display space; linearize when the composer will re-encode
      if (uEncode < 0.5) col = pow(col, vec3(2.2));
      gl_FragColor = vec4(col * a, a * min(vFade, 1.0));
    }
  `,
});

// ---------------------------------------------------------------------------
// Crow — a true black silhouette with the faintest indigo sheen, so it reads
// like the anime bird against the glowing castle.
// ---------------------------------------------------------------------------
export const crowMat = new THREE.ShaderMaterial({
  uniforms: { uEncode: fxUniforms.uEncode },
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vN = normalMatrix * normal;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    uniform float uEncode;
    void main() {
      vec3 n = normalize(vN);
      vec3 v = normalize(vV);
      float ndv = abs(dot(n, v));
      // warm rim from the lantern-sea keeps the crow readable against anything
      float rim = pow(1.0 - ndv, 2.4);
      vec3 L = normalize((viewMatrix * vec4(0.35, 1.0, 0.18, 0.0)).xyz);
      float dl = max(dot(n, L), 0.0);
      vec3 col = vec3(0.030, 0.028, 0.040)
               + vec3(0.055, 0.058, 0.085) * dl
               + vec3(0.55, 0.30, 0.13) * rim * 0.55
               + vec3(0.10, 0.13, 0.34) * rim * 0.35;
      if (uEncode < 0.5) col = pow(col, vec3(2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
