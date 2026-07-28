import * as THREE from 'three';
import { fxUniforms } from '../kit/materials';

/**
 * The far-field illusion: a camera-following dome painted with an endless
 * procedural castle — layered grids of warm glowing windows wrapping a
 * cylinder, an ember abyss below, faint embers above. This is what makes the
 * world read as infinitely dense past the streamed rooms.
 */
export function createSky(): { mesh: THREE.Mesh; uniforms: { uTime: { value: number } } } {
  const uniforms = {
    uTime: { value: 0 },
    uEncode: fxUniforms.uEncode,
  };
  const geo = new THREE.SphereGeometry(720, 28, 18);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      uniform float uEncode;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // One shell of distant castle: dark tower masses over the haze,
      // speckled with tiny lit windows and lantern rows.
      // N must be a multiple of 5 so tower columns wrap seamlessly.
      vec4 castleLayer(vec3 d, float N, float offset, float litBias, float drift, float t) {
        float ang = atan(d.x, d.z);
        float slope = d.y / (length(d.xz) + 1e-4);
        float v = clamp(slope, -5.0, 5.0);
        vec2 uv = vec2((ang * 0.1591549 + 0.5) * N + t * drift, v * N * 0.099 + offset);
        vec2 cell = floor(uv);
        vec2 f = fract(uv);

        // tower columns: groups of ~5 cells; some columns are gaps
        float colId = floor(uv.x / 5.0);
        float tower = step(0.22, hash21(vec2(colId, offset)));
        float band = step(0.12, hash21(vec2(colId, floor(uv.y / 7.0) + offset)));
        float mass = tower * band;

        float h = hash21(cell);
        vec2 wc = vec2(0.5) + (vec2(hash21(cell + 7.0), hash21(cell + 13.0)) - 0.5) * 0.4;
        float win = step(abs(f.x - wc.x), 0.13 + 0.08 * hash21(cell + 5.0))
                  * step(abs(f.y - wc.y), 0.10 + 0.06 * hash21(cell + 11.0));
        float lit = step(litBias, h);
        float flick = 0.75 + 0.25 * sin(t * (0.3 + h * 0.9) + h * 43.0);
        vec3 warm = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.75, 0.35), hash21(cell + 29.0));

        float rowLit = step(0.90, hash21(vec2(floor(uv.y), colId * 3.1 + offset)));
        float dotX = smoothstep(0.20, 0.05, abs(fract(uv.x * 2.0) - 0.5));
        float row = rowLit * dotX * smoothstep(0.16, 0.02, f.y);

        vec3 light = warm * (win * lit * flick + row * 0.9) * mass;
        float pole = smoothstep(5.0, 3.0, abs(v));
        return vec4(light * pole, mass * pole);
      }

      // Ember dots looking straight down/up the shaft.
      vec3 emberField(vec3 d, float t) {
        float a = abs(d.y) / (length(d.xz) + 1e-4);
        float polar = smoothstep(2.2, 4.2, a);
        if (polar <= 0.001) return vec3(0.0);
        vec2 uv = d.xz / (abs(d.y) + 0.1) * 26.0;
        vec2 cell = floor(uv);
        vec2 f = fract(uv) - 0.5;
        float h = hash21(cell);
        float dt = smoothstep(0.14 + h * 0.1, 0.0, length(f + (vec2(hash21(cell + 3.0), hash21(cell + 9.0)) - 0.5) * 0.55));
        float lit = step(0.5, h);
        float flick = 0.7 + 0.3 * sin(t * (0.4 + h) + h * 31.0);
        vec3 warm = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.7, 0.3), hash21(cell + 17.0));
        float below = d.y < 0.0 ? 1.0 : 0.30;
        return warm * dt * lit * flick * polar * 0.55 * below;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float t = uTime;

        // warm haze: the void is never black — it is full of glowing air with
        // the light of a million lanterns scattered through it
        float band = exp(-abs(h + 0.06) * 3.4);
        vec3 haze = vec3(0.085, 0.042, 0.030);
        haze += vec3(0.52, 0.21, 0.075) * band;
        haze += vec3(0.34, 0.12, 0.04) * smoothstep(-0.15, -0.85, h) * 0.9;
        haze *= 1.0 - 0.42 * smoothstep(0.15, 0.8, h);

        // three layers, far to near: farther = fainter mass, dimmer windows;
        // slow differential drift sells depth (the castle itself is turning)
        vec4 L2 = castleLayer(d, 290.0, 61.7, 0.45, 0.55, t * 0.6);
        vec4 L1 = castleLayer(d, 180.0, 17.3, 0.52, 0.30, t * 0.8);
        vec4 L0 = castleLayer(d, 105.0, 0.0, 0.60, 0.12, t);

        vec3 col = haze;
        col = mix(col, col * 0.80, L2.a); col += L2.rgb * 0.26;
        col = mix(col, col * 0.62, L1.a); col += L1.rgb * 0.42;
        col = mix(col, vec3(0.030, 0.017, 0.014) + col * 0.26, L0.a); col += L0.rgb * 0.62;

        col += emberField(d, t);

        // blood moon behind the haze
        vec3 moonDir = normalize(vec3(0.42, 0.34, -0.62));
        float md = dot(d, moonDir);
        col += vec3(0.50, 0.07, 0.06) * smoothstep(0.99930, 0.99965, md) * (1.0 - L0.a) * (1.0 - L1.a);
        col += vec3(0.16, 0.02, 0.02) * pow(smoothstep(0.984, 1.0, md), 3.0);

        // authored in display space; linearize when the composer re-encodes
        if (uEncode < 0.5) col = pow(col, vec3(2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
