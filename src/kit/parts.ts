import * as THREE from 'three';
import { C } from './materials';
import { ART } from './artAtlas';
import { Kit, paint } from './geoUtils';

/** Pick a motif from a group using the kit's own deterministic stream. */
function motif(k: Kit, group: number[]): number {
  return group[Math.floor(k.rng() * group.length) % group.length];
}

/**
 * Lantern paper colour. The castle is overwhelmingly amber and red, but a
 * scattering of jade and indigo lanterns among them reads as ritual rather
 * than decoration — and gives the eye somewhere cool to rest.
 */
function lanternTint(k: Kit): { deep: number; mid: number; top: number; glow: number } {
  const r = k.rng();
  if (r < 0.09) {
    return { deep: C.LANT_JADE_DEEP, mid: C.LANT_JADE, top: 0xb8f0cc, glow: C.GLOW_JADE };
  }
  if (r < 0.15) {
    return { deep: C.LANT_BLUE_DEEP, mid: C.LANT_BLUE, top: 0xbcd8f8, glow: C.GLOW_BLUE };
  }
  return { deep: C.LANT_DEEP, mid: C.LANT, top: C.LANT_TOP, glow: C.GLOW };
}

// Room-local conventions. Content very nearly FILLS the 12 m cell, so
// neighbouring occupied cells physically touch and read as one continuous
// building instead of a cloud of floating boxes.
export const ROOM = {
  H: 5.9,
  FLOOR: -5.15, // floor top surface
  CEIL: 5.15, // ceiling underside
  WALL: 5.78, // wall centre plane distance
  SPAN: 11.4, // typical wall width
};

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

// ---------------------------------------------------------------------------
// floors
// ---------------------------------------------------------------------------

/** Thick base slab with under-rim, collider included. */
export function slabBase(k: Kit, w: number, d: number, yTop: number, t = 0.5, color = C.WOOD_D): void {
  k.box(w, t, d, 0, yTop - t / 2, 0, color, { jit: 0.12, collide: true });
  // rim beams proud of the slab edge for silhouette
  k.box(w + 0.3, 0.22, 0.34, 0, yTop - t - 0.02, d / 2 - 0.1, C.TRIM_DARK);
  k.box(w + 0.3, 0.22, 0.34, 0, yTop - t - 0.02, -d / 2 + 0.1, C.TRIM_DARK);
  k.box(0.34, 0.22, d + 0.3, w / 2 - 0.1, yTop - t - 0.02, 0, C.TRIM_DARK);
  k.box(0.34, 0.22, d + 0.3, -w / 2 + 0.1, yTop - t - 0.02, 0, C.TRIM_DARK);
}

/** Tatami grid — mats over a dark base so the seams read as edging. */
export function floorTatami(k: Kit, w: number, d: number, yTop: number): void {
  k.box(w, 0.12, d, 0, yTop - 0.13, 0, C.TRIM_DARK);
  const cols = 4;
  const rows = 4;
  const mw = w / cols;
  const md = d / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const worn = k.rng() < 0.12;
      k.box(
        mw - 0.09, 0.1, md - 0.09,
        -w / 2 + mw * (c + 0.5), yTop - 0.05, -d / 2 + md * (r + 0.5),
        worn ? C.TATAMI_D : C.TATAMI,
        { jit: 0.22 }
      );
    }
  }
}

/** Plank floor strips with colour jitter. */
export function floorPlanks(k: Kit, w: number, d: number, yTop: number, alongX = true): void {
  k.box(w, 0.12, d, 0, yTop - 0.13, 0, C.TRIM_DARK);
  const n = 8;
  if (alongX) {
    const pd = d / n;
    for (let i = 0; i < n; i++) {
      k.box(w - 0.1, 0.09, pd - 0.07, 0, yTop - 0.045, -d / 2 + pd * (i + 0.5), C.WOOD, { jit: 0.3 });
    }
  } else {
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      k.box(pw - 0.07, 0.09, d - 0.1, -w / 2 + pw * (i + 0.5), yTop - 0.045, 0, C.WOOD, { jit: 0.3 });
    }
  }
}

// ---------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------

export function pillar(k: Kit, x: number, z: number, y0: number, y1: number, s = 0.42, color: number = C.WOOD): void {
  const h = y1 - y0;
  k.box(s, h, s, x, y0 + h / 2, z, color, { jit: 0.14, collide: true });
  k.box(s + 0.22, 0.18, s + 0.22, x, y0 + 0.09, z, C.TRIM_DARK);
  k.box(s + 0.16, 0.14, s + 0.16, x, y1 - 0.07, z, C.TRIM_DARK);
}

/** Stepped bracket cluster (simplified tokyō) under a beam or eave. */
export function bracketCluster(k: Kit, x: number, y: number, z: number, s = 0.5, color: number = C.WOOD_L): void {
  k.box(s * 0.6, 0.14, s * 0.6, x, y + 0.07, z, color, { jit: 0.1 });
  k.box(s * 1.2, 0.13, s * 0.5, x, y + 0.27, z, color, { jit: 0.1 });
  k.box(s * 0.5, 0.13, s * 1.2, x, y + 0.27, z, color, { jit: 0.1 });
  k.box(s * 1.8, 0.12, s * 0.42, x, y + 0.47, z, color, { jit: 0.1 });
  k.box(s * 0.42, 0.12, s * 1.8, x, y + 0.47, z, color, { jit: 0.1 });
}

/** Railing with balusters and gold finials. alongX=false runs it along Z. */
export function railing(k: Kit, cx: number, yBase: number, cz: number, len: number, alongX = true, h = 1.0): void {
  const rail = (w: number, hh: number, d: number, x: number, y: number, z: number, col: number, jit = 0.12) =>
    alongX ? k.box(w, hh, d, x, y, z, col, { jit }) : k.box(d, hh, w, z, y, x, col, { jit });
  rail(len, 0.11, 0.14, cx, yBase + h, cz, C.LACQ_B);
  rail(len, 0.08, 0.1, cx, yBase + h * 0.45, cz, C.WOOD_D);
  const n = Math.max(2, Math.round(len / 0.95));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    rail(0.09, h, 0.09, cx + t, yBase + h / 2, cz, C.WOOD_D, 0.18);
  }
  // finials
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.11, 6, 5);
    g.deleteAttribute('uv');
    if (alongX) k.place(g, cx + (s * len) / 2, yBase + h + 0.14, cz, C.METAL);
    else k.place(g, cz, yBase + h + 0.14, cx + (s * len) / 2, C.METAL);
  }
}

export interface StairOpts {
  x: number;
  y: number;
  z: number;
  /** total rise */
  rise: number;
  /** total run along +Z of the current frame */
  run: number;
  w: number;
  steps?: number;
}

/** Straight stair ascending toward +Z of the current frame. */
export function stairs(k: Kit, o: StairOpts): void {
  const n = o.steps ?? Math.max(5, Math.round(o.rise / 0.55));
  const rs = o.rise / n;
  const zs = o.run / n;
  for (let i = 0; i < n; i++) {
    k.box(o.w, 0.1, zs + 0.06, o.x, o.y + (i + 1) * rs - 0.05, o.z + (i + 0.5) * zs, C.WOOD_L, { jit: 0.2 });
    // riser shadow
    k.box(o.w - 0.2, rs, 0.07, o.x, o.y + (i + 0.5) * rs, o.z + i * zs + 0.05, C.TRIM_DARK);
  }
  const slope = Math.atan2(o.rise, o.run);
  const slopeLen = Math.sqrt(o.rise * o.rise + o.run * o.run);
  for (const s of [-1, 1]) {
    k.box(0.16, 0.3, slopeLen, o.x + (s * o.w) / 2, o.y + o.rise / 2 - 0.12, o.z + o.run / 2, C.WOOD_D, {
      rx: -slope,
      jit: 0.1,
    });
  }
  // three coarse colliders following the slope
  for (let seg = 0; seg < 3; seg++) {
    const z0 = o.z + (o.run * seg) / 3;
    const z1 = o.z + (o.run * (seg + 1)) / 3;
    const yTop = o.y + (o.rise * (seg + 1)) / 3;
    k.collide(o.x, (o.y + yTop) / 2 - 0.15, (z0 + z1) / 2, o.w / 2, (yTop - o.y) / 2 + 0.02, (z1 - z0) / 2);
  }
}

/** Torii gate spanning `w`, opening along the current frame's Z axis. */
export function torii(k: Kit, x: number, y0: number, z: number, w: number, h: number, color: number = C.LACQ): void {
  const ph = h * 0.92;
  for (const s of [-1, 1]) {
    k.box(0.34, ph, 0.34, x + (s * w) / 2, y0 + ph / 2, z, color, { rz: s * 0.035, jit: 0.1, collide: true });
    k.box(0.55, 0.16, 0.55, x + (s * w) / 2, y0 + 0.08, z, C.STONE, { jit: 0.15 });
  }
  // kasagi (double top beam with lifted tips)
  k.box(w + 1.1, 0.2, 0.3, x, y0 + h - 0.28, z, color, { jit: 0.08 });
  k.box(w + 1.5, 0.18, 0.38, x, y0 + h - 0.08, z, C.WOOD_D, { jit: 0.08 });
  for (const s of [-1, 1]) {
    k.box(0.55, 0.15, 0.36, x + s * (w / 2 + 0.85), y0 + h + 0.02, z, C.WOOD_D, { rz: s * 0.3 });
  }
  // nuki tie + centre strut
  k.box(w + 0.45, 0.17, 0.22, x, y0 + h * 0.68, z, color, { jit: 0.08 });
  k.box(0.2, h * 0.2, 0.18, x, y0 + h * 0.81, z, color);
}

// ---------------------------------------------------------------------------
// lanterns
// ---------------------------------------------------------------------------

function lanternBodyGeo(r: number, h: number, deep: number, mid: number, top: number): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const shape = [
    [0.3, 0], [0.82, 0.07], [1.0, 0.24], [1.06, 0.5], [1.0, 0.76], [0.8, 0.93], [0.32, 1],
  ];
  for (const [rr, t] of shape) prof.push(new THREE.Vector2(rr * r, (t - 0.5) * h));
  const g = new THREE.LatheGeometry(prof, 12);
  g.deleteAttribute('uv');
  // warm gradient + rib banding painted per-vertex
  _c1.setHex(deep);
  _c2.setHex(mid);
  _c3.setHex(top);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.min(Math.max((pos.getY(i) + h / 2) / h, 0), 1);
    // bamboo hoop ribs read clearly instead of a smooth blob
    const band = 0.68 + 0.32 * Math.abs(Math.sin(t * Math.PI * 9));
    const c = t < 0.5 ? _c1.clone().lerp(_c2, t * 2) : _c2.clone().lerp(_c3, (t - 0.5) * 2);
    arr[i * 3] = c.r * band;
    arr[i * 3 + 1] = c.g * band;
    arr[i * 3 + 2] = c.b * band;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Chōchin paper lantern: glowing lathe body + dark caps + glow point. */
export function lantern(k: Kit, x: number, y: number, z: number, scale = 1): void {
  const r = 0.42 * scale;
  const h = 0.85 * scale;
  const t = lanternTint(k);
  k.place(lanternBodyGeo(r, h, t.deep, t.mid, t.top), x, y, z, 0, { em: true, emi: 2.3 });
  const cap = (yy: number, rr: number) => {
    const g = new THREE.CylinderGeometry(rr, rr * 1.05, 0.09 * scale, 8);
    g.deleteAttribute('uv');
    k.place(g, x, yy, z, C.TRIM_DARK);
  };
  cap(y + h / 2 + 0.04 * scale, r * 0.4);
  cap(y - h / 2 - 0.04 * scale, r * 0.42);
  k.glow(x, y, z, 2.6 * scale, t.glow);
}

/** Lantern hanging from a rope. */
export function lanternHang(k: Kit, x: number, yTop: number, z: number, drop: number, scale = 1): void {
  k.box(0.045, drop, 0.045, x, yTop - drop / 2, z, C.ROPE, { jit: 0.2 });
  lantern(k, x, yTop - drop - 0.45 * scale, z, scale);
}

/** Lantern on a wooden post with an arm. */
export function lanternPost(k: Kit, x: number, yBase: number, z: number, h = 2.7): void {
  k.box(0.16, h, 0.16, x, yBase + h / 2, z, C.WOOD_D, { jit: 0.15 });
  k.box(0.6, 0.09, 0.09, x + 0.22, yBase + h - 0.1, z, C.WOOD_D);
  k.box(0.34, 0.1, 0.34, x, yBase + 0.05, z, C.STONE);
  lanternHang(k, x + 0.48, yBase + h - 0.14, z, 0.28, 0.8);
}

/** Ultra-cheap distant lantern: tiny emissive blob + glow point + rope. */
export function lanternTiny(k: Kit, x: number, y: number, z: number, s = 1): void {
  const t = lanternTint(k);
  const g = new THREE.SphereGeometry(0.17 * s, 6, 4);
  g.deleteAttribute('uv');
  paint(g, k.rng() < 0.3 ? t.deep : t.mid, 0.3, k.rng);
  k.place(g, x, y, z, 0, { em: true, emi: 2.4 });
  k.box(0.045, 0.34 * s, 0.045, x, y + 0.34 * s, z, C.ROPE);
  k.glow(x, y, z, 1.5 * s, t.glow);
}

/** A sagging string of tiny lanterns between two points (in frame coords). */
export function lanternString(k: Kit, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const sag = Math.sin(t * Math.PI) * 0.55;
    lanternTiny(k, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - sag, z0 + (z1 - z0) * t, 0.8 + k.rng() * 0.3);
  }
}

/** Andon: floor-standing paper lamp in a dark wooden frame — interior light. */
export function andon(k: Kit, x: number, yBase: number, z: number, s = 1): void {
  const h = 1.05 * s;
  const w = 0.42 * s;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(0.05, h, 0.05, x + sx * w / 2, yBase + h / 2, z + sz * w / 2, C.TRIM_DARK);
  }
  k.box(w + 0.16, 0.06, w + 0.16, x, yBase + h + 0.03, z, C.TRIM_DARK);
  k.box(w + 0.1, 0.06, w + 0.1, x, yBase + 0.05, z, C.TRIM_DARK);
  const g = new THREE.BoxGeometry(w * 0.94, h * 0.72, w * 0.94);
  g.deleteAttribute('uv');
  paint(g, 0xffd9a0, 0.25, k.rng);
  k.place(g, x, yBase + h * 0.52, z, 0, { em: true, emi: 1.5 });
  k.glow(x, yBase + h * 0.55, z, 1.9 * s, 0xffc070);
}

/** Kagaribi: iron fire basket on a tripod — open flame for courtyards and gates. */
export function kagaribi(k: Kit, x: number, yBase: number, z: number, s = 1): void {
  const hy = 1.05 * s;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    k.box(0.06, hy * 1.14, 0.06, x + Math.cos(a) * 0.3 * s, yBase + hy * 0.5, z + Math.sin(a) * 0.3 * s,
      C.METAL, { rx: Math.sin(a) * 0.22, rz: -Math.cos(a) * 0.22, jit: 0.1 });
  }
  k.box(0.56 * s, 0.1, 0.56 * s, x, yBase + hy, z, C.METAL, { jit: 0.15 });
  k.box(0.44 * s, 0.16, 0.44 * s, x, yBase + hy + 0.12, z, C.TRIM_DARK, { jit: 0.2 });
  const core = new THREE.SphereGeometry(0.17 * s, 6, 5);
  core.deleteAttribute('uv');
  paint(core, 0xff7a2a, 0.35, k.rng);
  k.place(core, x, yBase + hy + 0.22, z, 0, { em: true, emi: 2.6 });
  k.glow(x, yBase + hy + 0.3, z, 2.6 * s, 0xff8a3a);
}

// ---------------------------------------------------------------------------
// walls — built in the current frame: plane z≈0, spanning x, y from y0 to y1
// ---------------------------------------------------------------------------

export interface WallOpts {
  /** door gap width in the middle (0 = solid) */
  gap?: number;
}

/** Shoji: glowing paper wall behind a dark lattice. */
export function wallShoji(k: Kit, w: number, y0: number, y1: number, o: WallOpts = {}): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.32, 0.3, 0, y0 + 0.16, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.26, 0.3, 0, y1 - 0.13, 0, C.WOOD_D, { jit: 0.1 });
  for (const s of [-1, 1]) k.box(0.3, h, 0.3, (s * (w - 0.3)) / 2, mid, 0, C.WOOD_D, { jit: 0.1 });

  const paperY0 = y0 + 0.32;
  const paperY1 = y1 - 0.26;
  const ph = paperY1 - paperY0;
  const pmid = (paperY0 + paperY1) / 2;
  const gap = o.gap ?? 0;

  const panel = (cx: number, pw: number) => {
    k.box(pw, ph, 0.06, cx, pmid, 0, k.rng() < 0.15 ? C.PAPER_DIM : C.PAPER, { em: true, emi: 0.62, jit: 0.3 });
    const bars = Math.max(2, Math.round(pw / 1.15));
    // lattice on BOTH faces — from outside the shoji must read as joinery,
    // not as a blank glowing billboard
    for (const side of [0.06, -0.06]) {
      for (let i = 1; i < bars; i++) {
        k.box(0.06, ph, 0.08, cx - pw / 2 + (pw * i) / bars, pmid, side, C.TRIM_DARK);
      }
      k.box(pw, 0.055, 0.08, cx, pmid + ph * 0.22, side, C.TRIM_DARK);
      k.box(pw, 0.055, 0.08, cx, pmid - ph * 0.24, side, C.TRIM_DARK);
      k.box(pw, 0.05, 0.08, cx, pmid + ph * 0.42, side, C.TRIM_DARK);
    }
  };

  if (gap > 0) {
    const side = (w - 0.6 - gap) / 2;
    if (side > 0.4) {
      panel(-(gap / 2 + side / 2), side);
      panel(gap / 2 + side / 2, side);
      k.collide(-(gap / 2 + side / 2), mid, 0, side / 2 + 0.15, h / 2, 0.2);
      k.collide(gap / 2 + side / 2, mid, 0, side / 2 + 0.15, h / 2, 0.2);
    }
    for (const s of [-1, 1]) k.box(0.18, h, 0.26, (s * gap) / 2, mid, 0, C.WOOD_D);
    // lintel over the gap
    k.box(gap + 0.5, 0.2, 0.28, 0, y1 - 0.4, 0, C.WOOD_D);
  } else {
    panel(0, w - 0.6);
    k.collide(0, mid, 0, w / 2, h / 2, 0.2);
  }
  // soft facade glow so shoji walls read as lit buildings from afar
  k.glow(0, pmid, 0.6, 2.1, 0xcc8845);
}

/** Plaster wall with exposed timber framing; optional dark lattice window. */
export function wallPlaster(k: Kit, w: number, y0: number, y1: number, o: { window?: boolean } = {}): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, h, 0.22, 0, mid, 0, C.PLASTER, { jit: 0.14 });
  k.box(w, 0.3, 0.32, 0, y0 + 0.15, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.24, 0.32, 0, y1 - 0.12, 0, C.WOOD_D, { jit: 0.1 });
  const posts = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= posts; i++) {
    k.box(0.17, h, 0.3, -w / 2 + (w * i) / posts, mid, 0, C.WOOD_D, { jit: 0.12 });
  }
  k.box(w, 0.14, 0.3, 0, mid + h * 0.12, 0, C.WOOD_D, { jit: 0.12 });
  if (o.window) {
    const ww = Math.min(2.4, w * 0.3);
    const wh = h * 0.34;
    const lit = k.rng() < 0.55;
    k.box(ww, wh, 0.2, 0, mid + h * 0.08, 0, lit ? C.PAPER_DIM : 0x0a0604, { em: lit, emi: 0.8, jit: 0.25 });
    // mullions on BOTH faces so a lit window reads as joinery from outside too
    for (const side of [0.14, -0.14]) {
      for (let i = 0; i <= 5; i++) {
        k.box(0.07, wh, 0.1, -ww / 2 + (ww * i) / 5, mid + h * 0.08, side, C.WOOD_D);
      }
      k.box(ww, 0.08, 0.1, 0, mid + h * 0.08 + wh * 0.2, side, C.WOOD_D);
      k.box(ww, 0.08, 0.1, 0, mid + h * 0.08 - wh * 0.22, side, C.WOOD_D);
    }
    k.box(ww + 0.3, 0.12, 0.36, 0, mid + h * 0.08 - wh / 2, 0, C.WOOD_D);
    k.box(ww + 0.3, 0.12, 0.36, 0, mid + h * 0.08 + wh / 2, 0, C.WOOD_D);
    if (lit) k.glow(0, mid + h * 0.08, 0.55, 1.7, C.GLOW);
  }
  k.collide(0, mid, 0, w / 2, h / 2, 0.18);
}

/** Vertical slat lattice — see-through but solid to collision. */
export function wallLattice(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.26, 0.3, 0, y0 + 0.13, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.22, 0.3, 0, y1 - 0.11, 0, C.WOOD_D, { jit: 0.1 });
  const n = Math.max(4, Math.round(w / 0.55));
  for (let i = 0; i <= n; i++) {
    k.box(0.1, h - 0.4, 0.12, -w / 2 + (w * i) / n, mid, 0, C.WOOD, { jit: 0.2 });
  }
  k.box(w, 0.08, 0.1, 0, mid + h * 0.18, 0.05, C.WOOD_D);
  k.box(w, 0.08, 0.1, 0, mid - h * 0.18, 0.05, C.WOOD_D);
  k.collide(0, mid, 0, w / 2, h / 2, 0.16);
}

/** Horizontal plank wall. */
export function wallPlanks(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  const n = 5;
  for (let i = 0; i < n; i++) {
    k.box(w, h / n + 0.03, 0.16, 0, y0 + (h * (i + 0.5)) / n, 0, C.WOOD, { jit: 0.3 });
  }
  for (const s of [-1, 1]) k.box(0.24, h, 0.26, (s * (w - 0.24)) / 2, mid, 0, C.WOOD_D, { jit: 0.1 });
  k.collide(0, mid, 0, w / 2, h / 2, 0.14);
}

/** Framing around an open face: posts + lintel + ranma slats above. */
export function openingTrim(k: Kit, w: number, y0: number, y1: number, o: { ranma?: boolean; lanterns?: boolean } = {}): void {
  const h = y1 - y0;
  for (const s of [-1, 1]) k.box(0.3, h, 0.3, (s * (w - 0.3)) / 2, (y0 + y1) / 2, 0, C.WOOD_D, { jit: 0.1, collide: true });
  k.box(w, 0.26, 0.3, 0, y1 - 0.7, 0, C.WOOD_D, { jit: 0.1 });
  if (o.ranma !== false) {
    const n = Math.round(w / 0.42);
    for (let i = 1; i < n; i++) {
      k.box(0.06, 0.52, 0.08, -w / 2 + (w * i) / n, y1 - 0.32, 0, C.WOOD_L, { jit: 0.15 });
    }
    k.box(w, 0.09, 0.12, 0, y1 - 0.06, 0, C.WOOD_D);
  }
  if (o.lanterns) {
    lanternHang(k, -w / 2 + 0.75, y1 - 0.75, 0.1, 0.35, 0.85);
    lanternHang(k, w / 2 - 0.75, y1 - 0.75, 0.1, 0.35, 0.85);
  }
}

/** Engawa lip protruding outward (+Z of frame) from an open face. */
export function engawa(k: Kit, w: number, yTop: number): void {
  k.box(w, 0.16, 1.5, 0, yTop - 0.08, 0.78, C.WOOD_L, { jit: 0.25, collide: true });
  for (const s of [-1, 1]) {
    k.box(0.14, 0.5, 0.14, s * (w / 2 - 0.3), yTop - 0.42, 1.15, C.WOOD_D);
  }
  k.box(w, 0.1, 0.14, 0, yTop - 0.7, 1.42, C.WOOD_D, { jit: 0.15 });

  // Fittings sit on the veranda's own post spacing — aligned like real
  // joinery, never scattered. Posts every ~2.2 m, everything hangs off them.
  const bays = Math.max(2, Math.round(w / 2.2));
  const step = w / bays;
  for (let i = 0; i <= bays; i++) {
    const px = -w / 2 + step * i;
    // veranda post carrying the eave
    k.box(0.13, 2.5, 0.13, px, yTop + 1.25, 1.36, C.WOOD_D, { jit: 0.12 });
    k.box(0.2, 0.12, 0.2, px, yTop + 0.02, 1.36, C.TRIM_DARK);
  }
  // head rail tying the posts together, then washing strung along it
  k.box(w, 0.1, 0.12, 0, yTop + 2.4, 1.36, C.WOOD_D, { jit: 0.1 });
  if (k.rng() < 0.5) {
    laundryLine(k, -w / 2 + step * 0.5, yTop + 2.3, 1.36, w / 2 - step * 0.5, 1.36, bays);
  }
  // potted plants set squarely at the foot of alternate posts
  for (let i = 0; i <= bays; i += 2) {
    if (k.rng() < 0.55) pottedPlant(k, -w / 2 + step * i + 0.3, yTop, 1.1, 0.9);
  }
  // a bench or firewood stack under one bay, flush to the wall
  const bay = Math.floor(k.rng() * bays);
  const bx = -w / 2 + step * (bay + 0.5);
  const roll = k.rng();
  if (roll < 0.3) {
    k.box(step * 0.8, 0.1, 0.5, bx, yTop + 0.28, 0.5, C.WOOD, { jit: 0.2 });
    for (const s of [-1, 1]) k.box(0.1, 0.28, 0.1, bx + s * step * 0.3, yTop + 0.14, 0.5, C.WOOD_D);
  } else if (roll < 0.5) {
    firewood(k, bx, yTop, 0.55, 0);
  } else if (roll < 0.68) {
    crateStack(k, bx, yTop, 0.55, 0.9);
  }
}

// ---------------------------------------------------------------------------
// pavilion (small roofed structure used by some archetypes)
// ---------------------------------------------------------------------------

export function pavilion(k: Kit, cx: number, yBase: number, cz: number, size = 4.6, hgt = 3.4): void {
  const s2 = size / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pillar(k, cx + sx * s2, cz + sz * s2, yBase, yBase + hgt, 0.3, k.rng() < 0.3 ? C.LACQ : C.WOOD);
    }
  }
  // ring beams
  k.box(size + 0.7, 0.22, 0.26, cx, yBase + hgt + 0.11, cz - s2, C.WOOD_D, { jit: 0.1 });
  k.box(size + 0.7, 0.22, 0.26, cx, yBase + hgt + 0.11, cz + s2, C.WOOD_D, { jit: 0.1 });
  k.box(0.26, 0.22, size + 0.7, cx - s2, yBase + hgt + 0.11, cz, C.WOOD_D, { jit: 0.1 });
  k.box(0.26, 0.22, size + 0.7, cx + s2, yBase + hgt + 0.11, cz, C.WOOD_D, { jit: 0.1 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bracketCluster(k, cx + sx * s2, yBase + hgt + 0.2, cz + sz * s2, 0.42);
    }
  }
  // pyramid roof: four tilted slope panels + upturned corner tips
  const roofY = yBase + hgt + 0.75;
  const tilt = 0.5;
  const panelW = size * 1.4;
  const panelD = size * 0.78;
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const dx = Math.sin(yaw) * size * 0.33;
    const dz = Math.cos(yaw) * size * 0.33;
    k.box(panelW, 0.1, panelD, cx + dx, roofY + 0.34, cz + dz, C.TRIM_DARK, {
      rx: -tilt * Math.cos(yaw),
      rz: tilt * Math.sin(yaw),
      jit: 0.12,
    });
  }
  k.box(size * 0.34, 0.3, size * 0.34, cx, roofY + 0.78, cz, C.TRIM_DARK);
  const g = new THREE.SphereGeometry(0.16, 6, 5);
  g.deleteAttribute('uv');
  k.place(g, cx, roofY + 1.0, cz, C.METAL);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(0.7, 0.12, 0.3, cx + sx * (s2 + 0.55), roofY + 0.02, cz + sz * (s2 + 0.55), C.TRIM_DARK, {
        rz: sx * 0.35,
        rx: -sz * 0.35,
      });
    }
  }
  lanternHang(k, cx, yBase + hgt - 0.05, cz, 0.5, 1.0);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Lo-fi gold sphere for finials/ornaments (pre-painted). */
export function ornamentSphere(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 6, 5);
  g.deleteAttribute('uv');
  paint(g, C.METAL);
  return g;
}

// ---------------------------------------------------------------------------
// roofs — what turns a stack of cells into a COMPLETE BUILDING
// ---------------------------------------------------------------------------

/**
 * Irimoya-style hipped roof: deep overhanging eaves, tiled slopes, a ridge
 * with ornaments, upturned corner tips and visible under-bracketing.
 */
export function roofHip(k: Kit, w: number, d: number, yBase: number, h = 3.2): void {
  const ow = w + 2.6; // eave overhang
  const od = d + 2.6;

  // eave board + under-bracketing, seen from below when you fly under it
  k.box(ow, 0.42, od, 0, yBase + 0.2, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
  k.box(ow - 0.5, 0.24, od - 0.5, 0, yBase - 0.05, 0, C.WOOD_D, { jit: 0.15 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bracketCluster(k, sx * (w / 2 - 0.4), yBase - 0.8, sz * (d / 2 - 0.4), 0.55);
    }
  }
  k.box(ow, 0.2, 0.3, 0, yBase - 0.35, od / 2 - 0.2, C.WOOD_D, { jit: 0.1 });
  k.box(ow, 0.2, 0.3, 0, yBase - 0.35, -od / 2 + 0.2, C.WOOD_D, { jit: 0.1 });

  // four slopes, stepped so the silhouette reads as tile courses
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const t2 = (i + 1) / steps;
    const y = yBase + 0.4 + h * t;
    const iw = ow * (1 - t * 0.62);
    const id = od * (1 - t * 0.62);
    const nw = ow * (1 - t2 * 0.62);
    const nd = od * (1 - t2 * 0.62);
    const sh = h / steps;
    // slope panels on each of the four sides
    k.box(iw, sh + 0.14, (id - nd) / 2 + 0.5, 0, y + sh / 2, (id + nd) / 4, C.TRIM_DARK, { jit: 0.1 });
    k.box(iw, sh + 0.14, (id - nd) / 2 + 0.5, 0, y + sh / 2, -(id + nd) / 4, C.TRIM_DARK, { jit: 0.1 });
    k.box((iw - nw) / 2 + 0.5, sh + 0.14, nd, (iw + nw) / 4, y + sh / 2, 0, C.TRIM_DARK, { jit: 0.1 });
    k.box((iw - nw) / 2 + 0.5, sh + 0.14, nd, -(iw + nw) / 4, y + sh / 2, 0, C.TRIM_DARK, { jit: 0.1 });
  }

  // tile ridge lines running down the slopes
  const ridges = Math.max(3, Math.round(w / 1.6));
  for (let i = 0; i <= ridges; i++) {
    const x = -ow / 2 + (ow * i) / ridges;
    k.box(0.14, 0.5, od * 0.42, x, yBase + 0.55, od * 0.28, C.WOOD_D, { rx: -0.55, jit: 0.2 });
    k.box(0.14, 0.5, od * 0.42, x, yBase + 0.55, -od * 0.28, C.WOOD_D, { rx: 0.55, jit: 0.2 });
  }

  // ridge beam + ornaments
  const ry = yBase + 0.4 + h;
  k.box(w * 0.52, 0.6, 1.1, 0, ry, 0, C.TRIM_DARK, { jit: 0.08, collide: true });
  k.box(w * 0.56, 0.26, 0.5, 0, ry + 0.4, 0, C.WOOD_D, { jit: 0.1 });
  for (const s of [-1, 1]) {
    // shibi ornaments at the ridge ends
    k.box(0.5, 0.9, 0.5, s * w * 0.25, ry + 0.75, 0, C.METAL, { rz: s * 0.22, jit: 0.15 });
  }

  // upturned corner tips
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(1.5, 0.28, 0.7, sx * (ow / 2 - 0.5), yBase + 0.55, sz * (od / 2 - 0.5), C.TRIM_DARK, {
        rz: sx * 0.34, rx: -sz * 0.3, jit: 0.1,
      });
      lanternHang(k, sx * (ow / 2 - 0.4), yBase + 0.05, sz * (od / 2 - 0.4), 0.5, 0.85);
    }
  }
  // one run of small lanterns along a single eave — an accent, not a fairground
  if (k.rng() < 0.5) {
    const s = k.rng() < 0.5 ? -1 : 1;
    lanternString(k, -ow * 0.3, yBase - 0.1, s * (od / 2 - 0.35), ow * 0.3, yBase - 0.1, s * (od / 2 - 0.35), 3);
  }
}

/** Lean-to roof for narrow structures (corridors, bridges). */
export function roofShed(k: Kit, w: number, d: number, yBase: number, h = 1.5): void {
  k.box(w + 1.4, 0.3, d, 0, yBase, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
  for (const s of [-1, 1]) {
    k.box(w * 0.62, 0.26, d, s * w * 0.28, yBase + h * 0.5, 0, C.TRIM_DARK, { rz: s * 0.62, jit: 0.1 });
  }
  k.box(0.5, 0.34, d, 0, yBase + h, 0, C.WOOD_D, { jit: 0.1 });
  const n = Math.max(2, Math.round(d / 2.2));
  for (let i = 0; i <= n; i++) {
    k.box(w + 1.2, 0.1, 0.12, 0, yBase + 0.2, -d / 2 + (d * i) / n, C.WOOD_D, { jit: 0.2 });
  }
}

/** Kirizuma: simple gabled roof with barge boards — the machiya silhouette. */
export function roofGable(k: Kit, w: number, d: number, yBase: number, h = 2.6): void {
  const ow = w + 2.2;
  const od = d + 1.2;
  k.box(ow, 0.4, od, 0, yBase + 0.2, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) bracketCluster(k, sx * (w / 2 - 0.4), yBase - 0.8, sz * (d / 2 - 0.5), 0.5);
  }
  // two slopes meeting at a ridge running along Z
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const t2 = (i + 1) / steps;
    const y = yBase + 0.4 + h * t;
    const iw = ow * (1 - t * 0.86);
    const nw = ow * (1 - t2 * 0.86);
    k.box((iw - nw) / 2 + 0.45, h / steps + 0.16, od, (iw + nw) / 4, y + h / steps / 2, 0, C.TRIM_DARK, { jit: 0.1 });
    k.box((iw - nw) / 2 + 0.45, h / steps + 0.16, od, -(iw + nw) / 4, y + h / steps / 2, 0, C.TRIM_DARK, { jit: 0.1 });
  }
  // ridge + barge boards closing the gable ends
  k.box(1.0, 0.6, od + 0.4, 0, yBase + 0.4 + h, 0, C.TRIM_DARK, { jit: 0.08, collide: true });
  for (const sz of [-1, 1]) {
    k.box(ow * 0.9, 0.22, 0.24, 0, yBase + h * 0.55, sz * (od / 2 + 0.1), C.WOOD_D, { rz: 0, jit: 0.12 });
    // triangular gable infill
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      k.box(ow * (0.8 - t * 0.6), h / 3, 0.18, 0, yBase + 0.5 + h * t, sz * (od / 2), C.PLASTER, { jit: 0.2 });
    }
    k.box(0.5, h * 0.7, 0.2, 0, yBase + h * 0.6, sz * (od / 2 + 0.05), C.WOOD_D);
  }
  // tile courses down the slopes
  const ridges = Math.max(3, Math.round(d / 1.5));
  for (let i = 0; i <= ridges; i++) {
    const z = -od / 2 + (od * i) / ridges;
    for (const sx of [-1, 1]) {
      k.box(ow * 0.5, 0.2, 0.13, sx * ow * 0.26, yBase + 0.5 + h * 0.28, z, C.WOOD_D, { rz: -sx * 0.62, jit: 0.2 });
    }
  }
}

/** Steep thatched minka roof — the heaviest silhouette in the castle. */
export function roofThatch(k: Kit, w: number, d: number, yBase: number, h = 4.2): void {
  const ow = w + 2.8;
  const od = d + 2.0;
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const t2 = (i + 1) / steps;
    const y = yBase + h * t;
    const iw = ow * (1 - t * 0.88);
    const id = od * (1 - t * 0.42);
    const nw = ow * (1 - t2 * 0.88);
    const nd = od * (1 - t2 * 0.42);
    const sh = h / steps;
    const col = i === 0 ? 0x54452c : 0x6a5738; // damp at the eaves, dry above
    k.box((iw - nw) / 2 + 0.7, sh + 0.2, id, (iw + nw) / 4, y + sh / 2, 0, col, { jit: 0.3 });
    k.box((iw - nw) / 2 + 0.7, sh + 0.2, id, -(iw + nw) / 4, y + sh / 2, 0, col, { jit: 0.3 });
    k.box(nw, sh + 0.2, (id - nd) / 2 + 0.6, 0, y + sh / 2, (id + nd) / 4, col, { jit: 0.3 });
    k.box(nw, sh + 0.2, (id - nd) / 2 + 0.6, 0, y + sh / 2, -(id + nd) / 4, col, { jit: 0.3 });
  }
  // ridge capping with bound straw bundles
  k.box(1.5, 0.9, od * 0.6, 0, yBase + h, 0, 0x3f3423, { jit: 0.2, collide: true });
  for (let i = 0; i < 4; i++) {
    k.box(1.8, 0.28, 0.5, 0, yBase + h + 0.5, -od * 0.22 + i * (od * 0.15), C.WOOD_D, { jit: 0.25 });
  }
  k.box(ow, 0.34, od, 0, yBase - 0.1, 0, C.WOOD_D, { jit: 0.15, collide: true });
}

/** Tiered keep roof (tenshu / yagura) — stacked storeys, each with its own eaves. */
export function roofTiered(k: Kit, w: number, d: number, yBase: number, tiers = 3): void {
  let y = yBase;
  let cw = w;
  let cd = d;
  for (let i = 0; i < tiers; i++) {
    const eaveW = cw + 2.2;
    const eaveD = cd + 2.2;
    k.box(eaveW, 0.38, eaveD, 0, y + 0.19, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
    // upturned corners
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(1.3, 0.24, 0.6, sx * (eaveW / 2 - 0.4), y + 0.5, sz * (eaveD / 2 - 0.4), C.TRIM_DARK, {
          rz: sx * 0.36, rx: -sz * 0.32,
        });
        bracketCluster(k, sx * (cw / 2 - 0.3), y - 0.7, sz * (cd / 2 - 0.3), 0.5);
      }
    }
    // sloped cap
    k.box(cw * 0.9, 0.9, cd * 0.9, 0, y + 0.85, 0, C.TRIM_DARK, { jit: 0.1 });
    k.box(cw * 0.6, 0.5, cd * 0.6, 0, y + 1.45, 0, C.TRIM_DARK, { jit: 0.1 });
    y += 1.8;
    // storey above: white plaster wall band with barred windows
    if (i < tiers - 1) {
      const sh = 2.4;
      cw *= 0.74;
      cd *= 0.74;
      k.box(cw, sh, cd, 0, y + sh / 2, 0, C.PLASTER, { jit: 0.12, collide: true });
      for (let f = 0; f < 4; f++) {
        const a = (f / 4) * Math.PI * 2;
        const px = Math.cos(a) * (cw / 2 + 0.06);
        const pz = Math.sin(a) * (cd / 2 + 0.06);
        k.box(cw * 0.34, sh * 0.4, 0.2, px, y + sh * 0.55, pz, C.PAPER_DIM, { em: true, ry: -a, jit: 0.2 });
        k.glow(px, y + sh * 0.55, pz, 2.0, C.GLOW);
        for (let b = 0; b < 3; b++) {
          k.box(0.07, sh * 0.42, 0.1, px - cw * 0.1 + b * cw * 0.1, y + sh * 0.55, pz, C.WOOD_D, { ry: -a });
        }
      }
      k.box(cw + 0.5, 0.3, cd + 0.5, 0, y + 0.1, 0, C.WOOD_D, { jit: 0.1 });
      y += sh;
    }
  }
  // golden finial
  k.box(0.36, 1.3, 0.36, 0, y + 0.6, 0, C.METAL, { jit: 0.1 });
  const orb = new THREE.SphereGeometry(0.42, 8, 6);
  orb.deleteAttribute('uv');
  k.place(orb, 0, y + 1.5, 0, C.METAL);
  k.glow(0, y + 1.5, 0, 4, 0xffc070);
}

/** Kōshi: the fine vertical lattice front of a machiya townhouse. */
export function wallKoshi(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.3, 0.3, 0, y0 + 0.15, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.26, 0.32, 0, y1 - 0.13, 0, C.WOOD_D, { jit: 0.1 });
  // warm interior glow behind a dense screen of thin slats
  k.box(w - 0.5, h - 0.5, 0.06, 0, mid, -0.12, C.PAPER_DIM, { em: true, emi: 0.7, jit: 0.25 });
  const n = Math.max(10, Math.round(w / 0.3));
  for (let i = 0; i <= n; i++) {
    k.box(0.075, h - 0.5, 0.13, -w / 2 + (w * i) / n, mid, 0, C.WOOD_D, { jit: 0.22 });
  }
  for (let i = 0; i < 3; i++) {
    k.box(w, 0.11, 0.17, 0, y0 + 0.6 + (h - 1.2) * (i / 2), 0, C.WOOD_D, { jit: 0.15 });
  }
  // shop-front bench and a hanging sign
  k.box(w * 0.5, 0.12, 0.5, 0, y0 + 0.5, 0.4, C.WOOD, { jit: 0.2 });
  k.box(0.9, 0.7, 0.09, w * 0.3, y1 - 1.2, 0.35, C.WOOD_D, { jit: 0.15 });
  k.glow(0, mid, 0.4, 2.2, 0xd98a40);
  k.collide(0, mid, 0, w / 2, h / 2, 0.18);
}

/** Kura storehouse wall: thick white plaster with a painted panel. */
export function wallKura(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, h, 0.34, 0, mid, 0, C.PLASTER, { jit: 0.08 });
  // a large painted panel set into the plaster, framed in dark timber
  const pw = Math.min(w * 0.56, 6.2);
  const ph = Math.min(h * 0.5, 4.0);
  k.box(pw + 0.5, ph + 0.5, 0.3, 0, mid + h * 0.06, 0.1, C.TRIM_DARK, { jit: 0.1 });
  k.art(pw, ph, 0, mid + h * 0.06, 0.34, motif(k, ART.SCENE));
  // timber banding above and below
  for (const s of [-1, 1]) {
    k.box(w, 0.22, 0.4, 0, mid + h * 0.06 + s * (ph / 2 + 0.6), 0, C.WOOD_D, { jit: 0.12 });
  }
  // one small barred window high up, and the heavy banded door
  k.box(1.1, 0.9, 0.28, w * 0.32, y1 - 1.3, 0, 0x0d0805, { jit: 0.1 });
  for (let i = 0; i < 4; i++) {
    k.box(0.09, 0.9, 0.12, w * 0.32 - 0.4 + i * 0.27, y1 - 1.3, 0.16, C.WOOD_D);
  }
  k.box(1.5, 0.16, 0.42, w * 0.32, y1 - 0.78, 0, C.TRIM_DARK, { jit: 0.1 });
  k.box(1.6, 2.4, 0.24, -w * 0.34, y0 + 1.2, 0.1, C.WOOD_D, { jit: 0.12 });
  for (let i = 0; i < 3; i++) {
    k.box(1.7, 0.14, 0.3, -w * 0.34, y0 + 0.5 + i * 0.8, 0.12, C.METAL, { jit: 0.15 });
  }
  k.box(w, 0.4, 0.44, 0, y1 - 0.2, 0, C.TRIM_DARK, { jit: 0.1 });
  k.box(w, 0.3, 0.44, 0, y0 + 0.15, 0, C.STONE, { jit: 0.15 });
  k.collide(0, mid, 0, w / 2, h / 2, 0.22);
}

/**
 * Fusuma: painted sliding panels. The most characteristic decorated surface in
 * a Japanese interior, and the main place artwork shows up.
 */
export function wallFusuma(k: Kit, w: number, y0: number, y1: number, o: WallOpts = {}): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.3, 0.34, 0, y0 + 0.15, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.26, 0.34, 0, y1 - 0.13, 0, C.WOOD_D, { jit: 0.1 });
  for (const s of [-1, 1]) k.box(0.3, h, 0.3, (s * (w - 0.3)) / 2, mid, 0, C.WOOD_D, { jit: 0.1 });

  const py0 = y0 + 0.3;
  const py1 = y1 - 0.9;
  const ph = py1 - py0;
  const pmid = (py0 + py1) / 2;
  const gap = o.gap ?? 0;
  const span = w - 0.7 - gap;
  const panels = Math.max(2, Math.round(span / 2.0));
  // one continuous scene painted across the run of panels
  const tile = motif(k, ART.SCENE);
  for (let i = 0; i < panels; i++) {
    const pw = span / panels;
    let cx = -span / 2 + pw * (i + 0.5);
    if (gap > 0) cx += cx < 0 ? -gap / 2 : gap / 2;
    k.box(pw - 0.04, ph, 0.1, cx, pmid, 0, C.WOOD_PALE, { jit: 0.1 });
    k.art(pw - 0.22, ph - 0.18, cx, pmid, 0.14, tile);
    // lacquer pull and edge rails
    k.box(0.16, 0.34, 0.14, cx + pw * 0.34, pmid, 0.16, C.TRIM_DARK);
    k.box(0.07, ph, 0.14, cx - pw / 2, pmid, 0.14, C.TRIM_DARK);
  }
  // ranma transom above the panels
  const n = Math.round(w / 0.42);
  for (let i = 1; i < n; i++) {
    k.box(0.06, 0.5, 0.1, -w / 2 + (w * i) / n, y1 - 0.55, 0, C.WOOD_L, { jit: 0.15 });
  }
  if (gap === 0) k.collide(0, mid, 0, w / 2, h / 2, 0.2);
  k.glow(0, pmid, 0.5, 1.6, 0xc07a38);
}

/** Byōbu: a folding painted screen standing in a room. */
export function byobu(k: Kit, cx: number, yBase: number, cz: number, rot = 0, panels = 4): void {
  const pw = 1.15;
  const ph = 1.9;
  const tile = motif(k, ART.SCENE);
  for (let i = 0; i < panels; i++) {
    const fold = (i % 2 ? 1 : -1) * 0.32;
    const off = (i - (panels - 1) / 2) * pw * 0.92;
    const x = cx + Math.cos(rot) * off;
    const z = cz + Math.sin(rot) * off;
    k.box(pw, ph, 0.07, x, yBase + ph / 2, z, C.TRIM_DARK, { ry: rot + fold, jit: 0.1 });
    k.art(pw - 0.12, ph - 0.12, x, yBase + ph / 2 + 0.001, z, tile, { ry: rot + fold });
  }
}

/** A hanging scroll in an alcove (tokonoma) with a flower stand. */
export function tokonoma(k: Kit, cx: number, yBase: number, cz: number, w = 2.4): void {
  k.box(w + 0.6, 0.3, 0.7, cx, yBase + 0.15, cz, C.WOOD_D, { jit: 0.12 });
  k.box(w + 0.6, 0.26, 0.7, cx, yBase + 3.4, cz, C.WOOD_D, { jit: 0.12 });
  k.box(0.26, 3.3, 0.26, cx - w / 2 - 0.2, yBase + 1.7, cz, C.WOOD, { jit: 0.15 });
  k.box(w + 0.4, 3.1, 0.14, cx, yBase + 1.75, cz - 0.28, C.PLASTER, { jit: 0.12 });
  // the scroll
  k.box(w * 0.62, 2.2, 0.05, cx, yBase + 1.95, cz - 0.2, C.PAPER_DIM, { jit: 0.1 });
  k.art(w * 0.52, 1.75, cx, yBase + 1.95, cz - 0.26, motif(k, ART.FORMAL), { ry: Math.PI });
  k.box(w * 0.66, 0.1, 0.09, cx, yBase + 3.08, cz - 0.19, C.TRIM_DARK);
  k.box(w * 0.66, 0.1, 0.09, cx, yBase + 0.83, cz - 0.19, C.TRIM_DARK);
  // ikebana on a low stand
  k.box(0.5, 0.16, 0.5, cx + w * 0.24, yBase + 0.38, cz, C.LACQ, { jit: 0.15 });
  const vase = new THREE.CylinderGeometry(0.11, 0.15, 0.36, 7);
  vase.deleteAttribute('uv');
  k.place(vase, cx + w * 0.24, yBase + 0.64, cz, C.TRIM_DARK);
  for (let i = 0; i < 3; i++) {
    k.box(0.03, 0.6 + k.rng() * 0.4, 0.03, cx + w * 0.24 + (k.rng() - 0.5) * 0.2,
      yBase + 1.1, cz + (k.rng() - 0.5) * 0.2, 0x3d5226, { rz: (k.rng() - 0.5) * 0.5 });
  }
}

// ---------------------------------------------------------------------------
// signs of life — someone was here a moment ago
// ---------------------------------------------------------------------------

/** Noren: a split fabric curtain hung in a doorway. */
export function noren(k: Kit, cx: number, yTop: number, cz: number, w = 2.4, h = 1.1): void {
  const col = k.rng() < 0.5 ? C.LACQ : 0x2a3348;
  k.box(w + 0.2, 0.1, 0.1, cx, yTop, cz, C.WOOD_D);
  const panels = 3;
  for (let i = 0; i < panels; i++) {
    const pw = w / panels - 0.06;
    const sway = (k.rng() - 0.5) * 0.13;
    k.box(pw, h, 0.05, cx - w / 2 + (w * (i + 0.5)) / panels, yTop - h / 2, cz, col, {
      rz: sway, jit: 0.22,
    });
  }
  k.box(w, 0.14, 0.07, cx, yTop - h * 0.28, cz + 0.02, C.PAPER_DIM, { jit: 0.2 });
}

/** Tea left on a tray — still warm. */
export function teaSet(k: Kit, x: number, y: number, z: number): void {
  k.box(0.62, 0.05, 0.42, x, y, z, C.LACQ_B, { jit: 0.15 });
  const pot = new THREE.CylinderGeometry(0.11, 0.13, 0.15, 7);
  pot.deleteAttribute('uv');
  k.place(pot, x - 0.13, y + 0.1, z, C.TRIM_DARK);
  k.box(0.14, 0.03, 0.03, x + 0.02, y + 0.12, z, C.TRIM_DARK);
  for (let i = 0; i < 2; i++) {
    const cup = new THREE.CylinderGeometry(0.055, 0.045, 0.06, 6);
    cup.deleteAttribute('uv');
    k.place(cup, x + 0.14, y + 0.055, z + (i ? 0.11 : -0.11), C.PAPER_DIM);
  }
}

/** A brazier with live coals — the warmest thing in the room. */
export function brazier(k: Kit, x: number, y: number, z: number, s = 1): void {
  const bowl = new THREE.CylinderGeometry(0.34 * s, 0.24 * s, 0.3 * s, 9);
  bowl.deleteAttribute('uv');
  k.place(bowl, x, y + 0.15 * s, z, C.TRIM_DARK);
  k.box(0.8 * s, 0.06 * s, 0.8 * s, x, y + 0.02, z, C.WOOD_D, { jit: 0.15 });
  const coals = new THREE.SphereGeometry(0.22 * s, 7, 4);
  coals.deleteAttribute('uv');
  paint(coals, C.LANT_DEEP, 0.35, k.rng);
  k.place(coals, x, y + 0.28 * s, z, 0, { em: true, emi: 2.2 });
  k.glow(x, y + 0.3 * s, z, 1.9 * s, 0xff6a22);
}

/** Incense stand with a thread of smoke drifting up. */
export function incense(k: Kit, x: number, y: number, z: number): void {
  k.box(0.26, 0.1, 0.26, x, y + 0.05, z, C.TRIM_DARK, { jit: 0.15 });
  k.box(0.02, 0.34, 0.02, x, y + 0.27, z, C.WOOD_L);
  const tip = new THREE.SphereGeometry(0.028, 5, 4);
  tip.deleteAttribute('uv');
  paint(tip, C.LANT);
  k.place(tip, x, y + 0.45, z, 0, { em: true });
  // smoke: a few translucent-looking wisps leaning as they rise
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    k.box(0.035 + t * 0.06, 0.5, 0.035 + t * 0.06,
      x + Math.sin(t * 4 + k.rng()) * (0.1 + t * 0.28), y + 0.7 + i * 0.48, z + Math.cos(t * 3) * (0.08 + t * 0.2),
      0x2a2320, { rz: (k.rng() - 0.5) * 0.5, jit: 0.3 });
  }
  k.glow(x, y + 0.45, z, 0.9, 0xff8a3a);
}

/** Folded futon and a low screen — someone slept here. */
export function futon(k: Kit, x: number, y: number, z: number, rot = 0): void {
  k.box(1.9, 0.16, 1.1, x, y + 0.08, z, C.PAPER_DIM, { ry: rot, jit: 0.2 });
  k.box(1.7, 0.14, 0.9, x, y + 0.22, z, 0x6a4a3c, { ry: rot, jit: 0.25 });
  k.box(0.5, 0.14, 0.34, x - 0.6, y + 0.3, z, C.PAPER, { ry: rot, jit: 0.15 });
}

// ---------------------------------------------------------------------------
// CLUTTER — the stuff of daily life. Rooms and balconies without this read as
// architectural models; with it they read as somebody's home.
// ---------------------------------------------------------------------------

/** Potted plant — the single most effective "someone lives here" object. */
export function pottedPlant(k: Kit, x: number, y: number, z: number, s = 1): void {
  const potH = 0.3 * s;
  const pot = new THREE.CylinderGeometry(0.19 * s, 0.15 * s, potH, 7);
  pot.deleteAttribute('uv');
  k.place(pot, x, y + potH / 2, z, k.rng() < 0.4 ? C.LACQ : 0x4a3a2c, { jit: 0.2 });
  k.box(0.44 * s, 0.05 * s, 0.44 * s, x, y + potH, z, 0x2a2018, { jit: 0.2 });
  if (k.rng() < 0.35) {
    // a small pine or maple in a pot
    k.box(0.07 * s, 0.5 * s, 0.07 * s, x, y + potH + 0.25 * s, z, 0x33261a);
    for (let i = 0; i < 3; i++) {
      k.box(0.5 * s, 0.16 * s, 0.5 * s, x + (k.rng() - 0.5) * 0.2, y + potH + 0.5 * s + i * 0.17 * s,
        z + (k.rng() - 0.5) * 0.2, k.rng() < 0.3 ? 0x6a2a30 : 0x33461f, { ry: k.rng(), jit: 0.3 });
    }
  } else {
    // leafy fronds
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box(0.09 * s, 0.55 * s, 0.09 * s, x + Math.cos(a) * 0.1 * s, y + potH + 0.28 * s, z + Math.sin(a) * 0.1 * s,
        0x3d5a24, { rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4, jit: 0.3 });
    }
  }
}

/** Stack of storage crates. */
export function crateStack(k: Kit, x: number, y: number, z: number, s = 1): void {
  const n = 1 + Math.floor(k.rng() * 3);
  let cy = y;
  for (let i = 0; i < n; i++) {
    const w = (0.62 - i * 0.06) * s;
    const h = 0.44 * s;
    k.box(w, h, w, x + (k.rng() - 0.5) * 0.1, cy + h / 2, z + (k.rng() - 0.5) * 0.1, C.WOOD, {
      ry: (k.rng() - 0.5) * 0.4, jit: 0.25, collide: i === 0,
    });
    k.box(w * 1.04, 0.05 * s, w * 1.04, x, cy + h - 0.02, z, C.TRIM_DARK, { jit: 0.2 });
    cy += h;
  }
}

/** Banded barrel — sake, water, pickles. */
export function barrel(k: Kit, x: number, y: number, z: number, s = 1): void {
  const h = 0.62 * s;
  const g = new THREE.CylinderGeometry(0.26 * s, 0.23 * s, h, 9);
  g.deleteAttribute('uv');
  k.place(g, x, y + h / 2, z, C.WOOD, { jit: 0.2 });
  for (let i = 0; i < 2; i++) {
    const band = new THREE.CylinderGeometry(0.27 * s, 0.26 * s, 0.06 * s, 9);
    band.deleteAttribute('uv');
    k.place(band, x, y + 0.15 * s + i * 0.32 * s, z, C.TRIM_DARK);
  }
  k.box(0.4 * s, 0.05 * s, 0.4 * s, x, y + h, z, C.WOOD_L, { jit: 0.2 });
}

/** Washing strung on a line — the clearest sign of habitation there is. */
export function laundryLine(
  k: Kit, x0: number, y: number, z0: number, x1: number, z1: number, n = 4
): void {
  k.box(Math.abs(x1 - x0) + 0.1, 0.035, Math.abs(z1 - z0) + 0.035,
    (x0 + x1) / 2, y, (z0 + z1) / 2, C.ROPE, { jit: 0.2 });
  const cols = [0x8a4a3a, 0x3a4a6a, 0xb8a878, 0x5a6a4a, 0x8a7a5a];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    const w = 0.34 + k.rng() * 0.3;
    const h = 0.5 + k.rng() * 0.55;
    const col = cols[Math.floor(k.rng() * cols.length)];
    // cloth hangs with a slight sway
    k.box(w, h, 0.04, px, y - h / 2 - 0.03, pz, col, { rz: (k.rng() - 0.5) * 0.22, jit: 0.25 });
    k.box(w * 0.9, 0.05, 0.06, px, y - 0.03, pz, C.TRIM_DARK);
  }
}

/** Sunken hearth with a kettle on a hanging hook — the heart of a minka. */
export function irori(k: Kit, x: number, y: number, z: number): void {
  k.box(1.25, 0.16, 1.25, x, y + 0.08, z, C.WOOD_D, { jit: 0.15 });
  k.box(0.95, 0.1, 0.95, x, y + 0.14, z, 0x2a2118, { jit: 0.25 });
  // embers
  const coals = new THREE.SphereGeometry(0.26, 7, 4);
  coals.deleteAttribute('uv');
  paint(coals, C.LANT_DEEP, 0.4, k.rng);
  k.place(coals, x, y + 0.2, z, 0, { em: true, emi: 2.0 });
  k.glow(x, y + 0.25, z, 2.4, C.GLOW);
  // jizaikagi: the hanging pot hook
  k.box(0.05, 2.6, 0.05, x, y + 1.9, z, C.WOOD_D);
  k.box(0.4, 0.07, 0.07, x, y + 0.95, z, C.TRIM_DARK, { jit: 0.15 });
  const pot = new THREE.CylinderGeometry(0.24, 0.2, 0.3, 9);
  pot.deleteAttribute('uv');
  k.place(pot, x, y + 0.72, z, C.TRIM_DARK);
  k.box(0.5, 0.04, 0.04, x, y + 0.88, z, C.METAL);
}

/** Wall shelving loaded with jars and boxes. */
export function shelf(k: Kit, x: number, y: number, z: number, w = 1.6, rot = 0): void {
  const put = (bw: number, bh: number, bd: number, px: number, py: number, pz: number, c: number, o: Record<string, unknown> = {}) =>
    k.box(bw, bh, bd, x + px * Math.cos(rot), y + py, z + px * Math.sin(rot), c, { ry: rot, ...o });
  for (const s of [-1, 1]) put(0.09, 1.7, 0.4, (s * w) / 2, 0.85, 0, C.WOOD_D, { jit: 0.15 });
  for (let i = 0; i < 3; i++) {
    put(w, 0.07, 0.42, 0, 0.35 + i * 0.55, 0, C.WOOD, { jit: 0.2 });
    const n = 2 + Math.floor(k.rng() * 3);
    for (let j = 0; j < n; j++) {
      const px = -w / 2 + 0.2 + ((w - 0.4) * j) / Math.max(n - 1, 1);
      if (k.rng() < 0.5) {
        const jar = new THREE.CylinderGeometry(0.1, 0.09, 0.24, 7);
        jar.deleteAttribute('uv');
        k.place(jar, x + px * Math.cos(rot), y + 0.5 + i * 0.55, z + px * Math.sin(rot),
          k.rng() < 0.4 ? C.LACQ : 0x4a4038, { jit: 0.2 });
      } else {
        put(0.24, 0.2, 0.24, px, 0.48 + i * 0.55, 0, C.WOOD_L, { jit: 0.25 });
      }
    }
  }
}

/** Split firewood stacked against a wall. */
export function firewood(k: Kit, x: number, y: number, z: number, rot = 0): void {
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const n = 5 - r;
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(0.075, 0.075, 0.85, 6);
      g.deleteAttribute('uv');
      k.place(g, x + (i - n / 2) * 0.17 * Math.cos(rot), y + 0.09 + r * 0.16,
        z + (i - n / 2) * 0.17 * Math.sin(rot),
        C.WOOD, { rz: Math.PI / 2, ry: rot, jit: 0.3 });
    }
  }
}

/** A nobori banner on a pole — shopfronts and street corners. */
export function banner(k: Kit, x: number, yBase: number, z: number, h = 3.2): void {
  k.box(0.08, h, 0.08, x, yBase + h / 2, z, C.WOOD_D, { jit: 0.15 });
  const bw = 0.5;
  const bh = h * 0.6;
  const col = k.rng() < 0.5 ? C.LACQ : 0x2a3348;
  k.box(bw, bh, 0.04, x + bw / 2 + 0.05, yBase + h - bh / 2 - 0.2, z, col, { jit: 0.2 });
  // crest / lettering marks down the banner
  for (let i = 0; i < 3; i++) {
    k.box(bw * 0.4, bh * 0.13, 0.06, x + bw / 2 + 0.05, yBase + h - 0.5 - i * bh * 0.28, z,
      C.PAPER_DIM, { jit: 0.2 });
  }
  k.box(bw + 0.16, 0.07, 0.07, x + bw / 2, yBase + h - 0.16, z, C.WOOD_D);
}

/** Bucket, broom, basket — the small props that fill a corner. */
export function oddments(k: Kit, x: number, y: number, z: number): void {
  const r = k.rng();
  if (r < 0.35) {
    const b = new THREE.CylinderGeometry(0.17, 0.14, 0.26, 8);
    b.deleteAttribute('uv');
    k.place(b, x, y + 0.13, z, C.WOOD, { jit: 0.2 });
    k.box(0.36, 0.03, 0.03, x, y + 0.28, z, C.METAL);
  } else if (r < 0.6) {
    k.box(0.05, 1.35, 0.05, x, y + 0.68, z, C.WOOD_L, { rz: 0.16, jit: 0.2 });
    k.box(0.3, 0.3, 0.12, x + 0.12, y + 0.14, z, 0x6a5a38, { jit: 0.3 });
  } else if (r < 0.82) {
    const bskt = new THREE.CylinderGeometry(0.22, 0.17, 0.2, 8);
    bskt.deleteAttribute('uv');
    k.place(bskt, x, y + 0.1, z, 0x7a6640, { jit: 0.25 });
    k.box(0.3, 0.1, 0.3, x, y + 0.22, z, 0x5a4a2c, { jit: 0.3 });
  } else {
    // a wagasa umbrella leaning in the corner
    k.box(0.05, 1.2, 0.05, x, y + 0.6, z, C.WOOD_L, { rz: 0.2 });
    const cone = new THREE.ConeGeometry(0.3, 0.5, 9);
    cone.deleteAttribute('uv');
    k.place(cone, x + 0.16, y + 1.2, z, k.rng() < 0.5 ? C.LACQ : C.PAPER_DIM, { rz: 0.2, jit: 0.2 });
  }
}

/** Strings of persimmons or fish hung to dry under an eave. */
export function dryingRack(k: Kit, x: number, y: number, z: number, w = 1.6): void {
  k.box(w, 0.05, 0.05, x, y, z, C.WOOD_D, { jit: 0.2 });
  const n = Math.max(3, Math.round(w / 0.28));
  const warm = k.rng() < 0.6;
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + (w * (i + 0.5)) / n;
    const len = 0.3 + k.rng() * 0.35;
    k.box(0.03, len, 0.03, px, y - len / 2, z, C.ROPE);
    for (let j = 0; j < 3; j++) {
      k.box(0.1, 0.1, 0.1, px, y - len + 0.1 + j * 0.11, z,
        warm ? 0xc4661f : 0x9a8a6a, { jit: 0.3 });
    }
  }
}

// ---------------------------------------------------------------------------
// garden — the rare quiet district
// ---------------------------------------------------------------------------

/** Gnarled procedural tree with layered foliage. */
export function tree(k: Kit, x: number, yBase: number, z: number, s = 1): void {
  const h = (2.6 + k.rng() * 1.8) * s;
  k.box(0.34 * s, h, 0.34 * s, x, yBase + h / 2, z, 0x2f2114, { jit: 0.2, collide: true });
  // two leaning branches
  for (const sx of [-1, 1]) {
    k.box(0.2 * s, h * 0.5, 0.2 * s, x + sx * 0.4 * s, yBase + h * 0.72, z, 0x2f2114, { rz: sx * 0.6, jit: 0.2 });
  }
  // foliage as stacked flattened clusters
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = (1.9 - t * 0.55) * s;
    const col = k.rng() < 0.25 ? 0x6a2a30 : 0x2c3a22; // occasional maple
    k.box(r * 2, 0.55 * s, r * 2, x + (k.rng() - 0.5) * 0.4, yBase + h + i * 0.62 * s, z + (k.rng() - 0.5) * 0.4,
      col, { ry: k.rng(), jit: 0.35 });
  }
}

/** A still water channel that catches the lantern light. */
export function waterChannel(k: Kit, cx: number, y: number, cz: number, w: number, len: number, alongX = true): void {
  const put = (bw: number, bh: number, bd: number, px: number, py: number, pz: number, col: number, o: BoxOptsLike = {}) =>
    alongX ? k.box(bw, bh, bd, px, py, pz, col, o) : k.box(bd, bh, bw, pz, py, px, col, o);
  put(len, 0.3, w + 0.7, cx, y - 0.15, cz, C.STONE, { jit: 0.2 });
  // dark reflective surface, slightly emissive so it glows like still water
  put(len - 0.3, 0.06, w, cx, y + 0.02, cz, 0x24303a, { em: true, jit: 0.25 });
  for (const s of [-1, 1]) {
    put(len, 0.22, 0.3, cx, y + 0.08, cz + s * (w / 2 + 0.28), C.STONE, { jit: 0.25 });
  }
  // stepping stones
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i < n; i++) {
    put(0.8, 0.18, 0.8, cx - len / 2 + (len * (i + 0.5)) / n, y + 0.1, cz, C.STONE, { jit: 0.3 });
  }
}

interface BoxOptsLike {
  rx?: number;
  ry?: number;
  rz?: number;
  jit?: number;
  em?: boolean;
  collide?: boolean;
}

/** Stone lantern (tōrō) — garden punctuation. */
export function stoneLantern(k: Kit, x: number, yBase: number, z: number, s = 1): void {
  k.box(0.7 * s, 0.22 * s, 0.7 * s, x, yBase + 0.11 * s, z, C.STONE, { jit: 0.2 });
  k.box(0.26 * s, 0.9 * s, 0.26 * s, x, yBase + 0.6 * s, z, C.STONE, { jit: 0.15 });
  k.box(0.62 * s, 0.14 * s, 0.62 * s, x, yBase + 1.12 * s, z, C.STONE, { jit: 0.15 });
  k.box(0.46 * s, 0.42 * s, 0.46 * s, x, yBase + 1.4 * s, z, C.LANT, { em: true, emi: 2.0, jit: 0.2 });
  k.box(0.86 * s, 0.16 * s, 0.86 * s, x, yBase + 1.68 * s, z, C.TRIM_DARK, { jit: 0.15 });
  const cap = new THREE.SphereGeometry(0.13 * s, 6, 4);
  cap.deleteAttribute('uv');
  k.place(cap, x, yBase + 1.82 * s, z, C.STONE);
  k.glow(x, yBase + 1.4 * s, z, 2.2 * s, C.GLOW);
}
